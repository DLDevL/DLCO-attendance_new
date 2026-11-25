try {
  // Load backend/.env no matter which folder the server is started from.
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
} catch (error) {
  // dotenv is helpful locally, but production can provide env vars directly.
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const { supabase, db } = require('./supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true); // so req.protocol is https behind Vercel's proxy (used in email links)
app.use(cors());
app.use(express.json());

// Serve frontend from backend folder (useful for local testing)
app.use(express.static(path.join(__dirname, '../frontend'), { extensions: ['html'] })); // /privacy → privacy.html

function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || user.user_metadata?.name || null, // filled in for Google accounts
    role: user.user_metadata?.role === 'teacher' ? 'teacher' : 'student'
  };
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Login required' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  if (!data.user.email_confirmed_at) {
    return res.status(403).json({ error: 'Login required: verify your email first, then sign in again.' });
  }
  if (!hasAccount(data.user)) {
    return res.status(403).json({ error: 'Login required: create an account first.' });
  }

  req.user = userPayload(data.user);
  next();
}

/**
 * True when the user signed up on this site with email + password.
 * Google sign-in links onto that same account (same email), so it then has
 * both an "email" and a "google" identity. A Google-only user never signed up.
 */
function hasEmailAccount(user) {
  return (user.identities || []).some((i) => i.provider === 'email');
}

/**
 * True when the user registered on this site: either with email + password,
 * or with "Sign up with Google" (flagged in app_metadata, which only the server can set).
 */
function hasAccount(user) {
  return hasEmailAccount(user) || user.app_metadata?.google_signup === true;
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Only ${role}s can perform this action` });
    }
    next();
  };
}

const requireTeacher = requireRole('teacher');

/** Where links in auth emails should send people back to (this site). */
function siteUrl(req) {
  return process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
}

/** Turn Supabase's email-sending errors into something a user can act on. */
function friendlyEmailError(error) {
  const m = error.message || '';
  if (/rate limit/i.test(m) || error.status === 429) {
    return 'Too many emails were sent recently. Please wait a few minutes and try again.';
  }
  if (/sending.*email/i.test(m)) {
    return 'We couldn’t send the confirmation email right now. Please try again in a few minutes.';
  }
  return m;
}

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required' });
  }

  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: 'role must be teacher or student' });
  }

  // Supabase emails a confirmation link; the account can't sign in until it's clicked.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role }, emailRedirectTo: siteUrl(req) }
  });

  if (error) {
    console.warn('signUp:', error.message);
    return res.status(400).json({ error: friendlyEmailError(error) });
  }

  // Supabase returns a user with no identities when the email is already registered.
  if (data.user && data.user.identities?.length === 0) {
    return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
  }

  // A session here means "Confirm email" is switched OFF in Supabase. Never hand it
  // out: signing up must not log anyone in. They verify by email, then sign in manually.
  if (data.session) {
    console.warn('SECURITY: Supabase returned a session on sign-up — turn ON "Confirm email" in Supabase → Authentication → Providers → Email.');
    await supabase.auth.signOut().catch(() => {});
  }

  res.status(201).json({
    message: `We sent a confirmation link to ${email}. Open it to verify your account, then sign in.`
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message)) {
      return res.status(403).json({
        error: 'Please verify your email first. Open the confirmation link we sent you, then sign in.',
        code: 'email_not_confirmed'
      });
    }
    return res.status(401).json({ error: error.message });
  }

  // Double-check on our side too: no verified email, no login.
  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut().catch(() => {});
    return res.status(403).json({
      error: 'Please verify your email first. Open the confirmation link we sent you, then sign in.',
      code: 'email_not_confirmed'
    });
  }

  res.json({
    message: 'Login successful',
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: userPayload(data.user)
  });
});

// GET /api/auth/google — send the browser to Google (via Supabase) to sign in.
// Google comes back to this site with #access_token=… which the frontend picks up.
// Google has already verified the email, so these accounts pass the verified-email checks.
app.get('/api/auth/google', async (req, res) => {
  // If Google isn't switched on in Supabase, come back to the sign-in page with a
  // readable message instead of leaving the user on Supabase's raw JSON error.
  try {
    const r = await fetch(new URL('/auth/v1/settings', supabase.supabaseUrl), {
      headers: { apikey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY }
    });
    const settings = await r.json();
    if (settings?.external && !settings.external.google) {
      const msg = 'Google sign-in isn’t available yet. Please use your email and password.';
      return res.redirect(`${siteUrl(req)}/#error=google_disabled&error_description=${encodeURIComponent(msg)}`);
    }
  } catch (e) {
    console.warn('Could not check Google provider settings:', e.message);
  }

  const url = new URL('/auth/v1/authorize', supabase.supabaseUrl);
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect_to', siteUrl(req));
  // Always show Google's account chooser instead of silently reusing the last account.
  url.searchParams.set('prompt', 'select_account');
  res.redirect(url.toString());
});

// POST /api/auth/google/complete — called when Google sends the user back.
// mode 'signup' ("Sign up with Google"): registers the Google account straight away with the
//   chosen role. No confirmation email — Google has already verified the address.
// mode 'signin' ("Continue with Google"): only for people who already have an account.
//   If Supabase just made a brand-new Google-only user, remove it and refuse.
app.post('/api/auth/google/complete', async (req, res) => {
  const { access_token, mode, role } = req.body;
  if (!access_token) return res.status(400).json({ error: 'access_token is required' });

  const { data, error } = await supabase.auth.getUser(access_token);
  if (error || !data.user) return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });

  if (mode === 'signup' && !hasAccount(data.user)) {
    if (!['teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Choose your role before signing up with Google.' });
    }
    if (!data.user.email_confirmed_at) {
      return res.status(403).json({ error: 'Google didn’t confirm this email address. Please sign up with email instead.' });
    }
    const { data: updated, error: upError } = await db.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...data.user.app_metadata, google_signup: true },
      user_metadata: { ...data.user.user_metadata, role }
    });
    if (upError) {
      console.warn('Google sign-up failed:', upError.message);
      return res.status(500).json({ error: 'Couldn’t create your account. Please try again.' });
    }
    return res.status(201).json({ created: true, user: userPayload(updated.user) });
  }

  if (!hasAccount(data.user)) {
    const { error: delError } = await db.auth.admin.deleteUser(data.user.id);
    if (delError) console.warn('Could not remove Google-only user:', delError.message);
    return res.status(403).json({
      code: 'no_account',
      error: `No account exists for ${data.user.email}. Tap “Sign up” above to create one — you can sign up with Google directly.`
    });
  }

  res.json({ user: userPayload(data.user) });
});

// POST /api/auth/resend-confirmation — public: send the sign-up confirmation email again
app.post('/api/auth/resend-confirmation', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: siteUrl(req) }
  });
  if (error) {
    console.warn('resend:', error.message);
    return res.status(400).json({ error: friendlyEmailError(error) });
  }
  res.json({ message: `A new confirmation link was sent to ${email}.` });
});

app.post('/api/auth/logout', requireAuth, (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/forgot-password — public: send a reset link to the given email
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const redirectTo = `${req.protocol}://${req.get('host')}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // Always return success even if the email isn't registered — avoids leaking
  // which emails have accounts.
  if (error) console.warn('resetPasswordForEmail:', error.message);
  res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

// POST /api/auth/reset-password — public: complete the reset using the token from the emailed link
app.post('/api/auth/reset-password', async (req, res) => {
  const { access_token, refresh_token, password } = req.body;
  if (!access_token || !password) {
    return res.status(400).json({ error: 'access_token and password are required' });
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token: refresh_token || ''
  });
  if (sessionError) return res.status(400).json({ error: 'Reset link is invalid or expired' });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'Password updated. You can now log in.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.use('/api', requireAuth);

// ──────────────────────────────────────────
// CLASSES
// ──────────────────────────────────────────

// GET /api/classes
app.get('/api/classes', async (req, res) => {
  const { data, error } = await db
    .from('classes')
    .select('name')
    .order('name');
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ classes: data.map(c => c.name) });
});

// POST /api/classes
app.post('/api/classes', requireTeacher, async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string')
    return res.status(400).json({ error: 'Class name required' });

  const { error } = await db
    .from('classes')
    .insert([{ name }]);

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Class already exists' });
    return res.status(500).json({ error: error.message });
  }
  
  // Return all classes after insert
  const { data: classes } = await db.from('classes').select('name').order('name');
  res.status(201).json({ message: 'Class added', classes: classes.map(c => c.name) });
});

// DELETE /api/classes/:name
app.delete('/api/classes/:name', requireTeacher, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  
  // Check if students exist in this class
  const { data: students, error: sError } = await db
    .from('students')
    .select('id')
    .eq('cls', name)
    .limit(1);

  if (students && students.length > 0)
    return res.status(400).json({ error: 'Remove all students from this class first' });

  const { error } = await db
    .from('classes')
    .delete()
    .eq('name', name);

  if (error) return res.status(500).json({ error: error.message });
  
  const { data: classes } = await db.from('classes').select('name').order('name');
  res.json({ message: 'Class deleted', classes: classes.map(c => c.name) });
});

// ──────────────────────────────────────────
// STUDENTS
// ──────────────────────────────────────────

// GET /api/students
app.get('/api/students', async (req, res) => {
  const { cls } = req.query;
  let query = db.from('students').select('*').order('name');

  if (req.user.role === 'student') {
    // Students only ever see their own roster row, matched by login email.
    query = query.ilike('email', likeExact(req.user.email));
  } else if (cls) {
    query = query.eq('cls', cls);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ students: data });
});

/** Pattern for a case-insensitive exact match with .ilike() (escapes the % and _ wildcards). */
function likeExact(value) {
  return String(value || '').replace(/[\\%_]/g, (c) => '\\' + c);
}
const cleanEmail = (e) => (e ? String(e).trim().toLowerCase() : null);

// Look up the students.id that belongs to the currently logged-in student.
async function getOwnStudentId(email) {
  const { data } = await db.from('students').select('id').ilike('email', likeExact(email)).limit(1).maybeSingle();
  return data?.id || null;
}

// POST /api/students
app.post('/api/students', requireTeacher, async (req, res) => {
  const { name, roll, cls, email } = req.body;
  if (!name || !roll || !cls)
    return res.status(400).json({ error: 'name, roll, and cls are required' });

  const { data, error } = await db
    .from('students')
    .insert([{ name, roll, cls, email: cleanEmail(email) }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Roll number already exists' });
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ message: 'Student added', student: data });
});

// PUT /api/students/:id — edit a student (e.g. fix the email that links their login)
app.put('/api/students/:id', requireTeacher, async (req, res) => {
  const patch = {};
  for (const k of ['name', 'roll', 'cls']) {
    if (req.body[k] !== undefined) {
      if (!String(req.body[k]).trim()) return res.status(400).json({ error: `${k} can't be empty` });
      patch[k] = String(req.body[k]).trim();
    }
  }
  if (req.body.email !== undefined) patch.email = cleanEmail(req.body.email);
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });

  const { data, error } = await db.from('students').update(patch).eq('id', req.params.id).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Roll number already exists' });
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Student not found' });
    return res.status(500).json({ error: error.message });
  }
  res.json({ message: 'Student updated', student: data });
});

// DELETE /api/students/:id
app.delete('/api/students/:id', requireTeacher, async (req, res) => {
  const { id } = req.params;
  const { error } = await db
    .from('students')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  // Best-effort cleanup of the student's shared records (tables may not exist yet).
  await Promise.all([
    db.from('leave_requests').delete().eq('sid', String(id)),
    db.from('warnings').delete().eq('sid', String(id))
  ]).catch(() => {});
  res.json({ message: 'Student removed' });
});

// ──────────────────────────────────────────
// ATTENDANCE
// ──────────────────────────────────────────

// GET /api/attendance
app.get('/api/attendance', async (req, res) => {
  const { date, from, to } = req.query;
  let { sid } = req.query;
  let query = db.from('attendance').select('*');

  if (req.user.role === 'student') {
    // Ignore any sid the client sends — always force it to the caller's own record.
    sid = await getOwnStudentId(req.user.email);
    if (!sid) return res.json({ attendance: [] });
  }

  if (date) query = query.eq('date', date);
  if (sid)  query = query.eq('sid', sid);
  if (from) query = query.gte('date', from);
  if (to)   query = query.lte('date', to);

  const { data, error } = await query.order('date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ attendance: data });
});

// POST /api/attendance
app.post('/api/attendance', requireTeacher, async (req, res) => {
  const { date, records } = req.body;
  if (!date || !Array.isArray(records))
    return res.status(400).json({ error: 'date and records[] are required' });

  // Prep records for upsert
  const toInsert = records.map(r => ({
    date,
    sid: r.sid,
    status: r.status
  }));

  const { error } = await db
    .from('attendance')
    .upsert(toInsert, { onConflict: 'date,sid' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: `Attendance saved for ${date}`, count: records.length });
});

// DELETE /api/attendance — reset a day's records (optionally scoped to one class)
app.delete('/api/attendance', requireTeacher, async (req, res) => {
  const { date, cls } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  let query = db.from('attendance').delete().eq('date', date);

  if (cls) {
    const { data: stus, error: sErr } = await db.from('students').select('id').eq('cls', cls);
    if (sErr) return res.status(500).json({ error: sErr.message });
    const ids = stus.map(s => s.id);
    if (!ids.length) return res.json({ message: `No students in ${cls} — nothing to reset` });
    query = query.in('sid', ids);
  }

  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: `Attendance reset for ${date}${cls ? ' (' + cls + ')' : ''}` });
});

// ──────────────────────────────────────────
// REPORT
// ──────────────────────────────────────────

app.get('/api/report', async (req, res) => {
  const { cls } = req.query;

  // Get students
  let stuQuery = db.from('students').select('*');
  if (req.user.role === 'student') {
    stuQuery = stuQuery.ilike('email', likeExact(req.user.email));
  } else if (cls) {
    stuQuery = stuQuery.eq('cls', cls);
  }
  const { data: students, error: sError } = await stuQuery;
  if (sError) return res.status(500).json({ error: sError.message });

  // Get attendance
  const { data: attendance, error: aError } = await db.from('attendance').select('*');
  if (aError) return res.status(500).json({ error: aError.message });

  // Get leaves
  const { data: leaves, error: lError } = await db.from('leaves').select('*');
  if (lError) return res.status(500).json({ error: lError.message });

  const report = students.map(s => {
    const recs = attendance.filter(a => a.sid === s.id);
    const lv = leaves.find(l => l.sid === s.id) || { el_total: 0, cl_total: 0, el_used: 0, cl_used: 0 };
    
    const total = recs.length;
    const present = recs.filter(a => a.status === 'P' || a.status === 'L').length;
    const absent  = recs.filter(a => a.status === 'A').length;
    const late    = recs.filter(a => a.status === 'L').length;
    
    // In original logic: EL and CL used are also counted as present for % calculation
    // Wait, the original frontend code had this logic:
    // const effectivePresent = present + elUsed + clUsed;
    const elUsed = recs.filter(a => a.status === 'E').length;
    const clUsed = recs.filter(a => a.status === 'CL').length;
    const effectivePresent = present + elUsed + clUsed;

    const pct = total > 0 ? Math.round((effectivePresent / total) * 100) : null;

    return {
      id: s.id,
      name: s.name,
      roll: s.roll,
      cls: s.cls,
      totalSessions: total,
      present,
      absent,
      late,
      elUsed,
      clUsed,
      elAllotted: lv.el_total,
      clAllotted: lv.cl_total,
      attendancePct: pct,
      status: pct === null ? 'no-data' : pct >= 75 ? 'good' : pct >= 50 ? 'warning' : 'low'
    };
  });

  report.sort((a, b) => (b.attendancePct || 0) - (a.attendancePct || 0));
  res.json({ report });
});

// ──────────────────────────────────────────
// LEAVES (Additional endpoints for persistence)
// ──────────────────────────────────────────

// GET /api/leaves
app.get('/api/leaves', async (req, res) => {
  let query = db.from('leaves').select('*');

  if (req.user.role === 'student') {
    const sid = await getOwnStudentId(req.user.email);
    if (!sid) return res.json({ leaves: [] });
    query = query.eq('sid', sid);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ leaves: data });
});

// POST /api/leaves (Update totals)
app.post('/api/leaves', requireTeacher, async (req, res) => {
  const { sid, el_total, cl_total, el_used, cl_used } = req.body;
  const { error } = await db
    .from('leaves')
    .upsert({ sid, el_total, cl_total, el_used, cl_used }, { onConflict: 'sid' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Leaves updated' });
});

// ──────────────────────────────────────────
// TEACHER ↔ STUDENT LINK
// subjects, timetable, leave requests, warnings
// (tables from schema-portal-link.sql)
// ──────────────────────────────────────────

/** Send a DB error; a missing table gets a clear "run the migration" message the frontend recognises. */
function dbError(res, error) {
  if (error.code === 'PGRST205' || error.code === '42P01') {
    return res.status(501).json({
      code: 'not_set_up',
      error: 'This feature needs its database tables. Run backend/schema-portal-link.sql in the Supabase SQL Editor.'
    });
  }
  return res.status(500).json({ error: error.message });
}

/** The logged-in student's roster row (id + class), or null when their email isn't on the roster. */
async function getOwnStudent(email) {
  const { data } = await db.from('students').select('id, cls').ilike('email', likeExact(email)).limit(1).maybeSingle();
  return data || null;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const leaveOut = (r) => ({
  id: r.id, sid: r.sid, type: r.type, from: r.from_date, to: r.to_date, days: r.days,
  reason: r.reason, status: r.status, note: r.note || null,
  createdAt: r.created_at, decidedAt: r.decided_at
});

// GET /api/subjects — everyone (students need names/colours for their timetable)
app.get('/api/subjects', async (_req, res) => {
  const { data, error } = await db.from('subjects').select('*').order('code');
  if (error) return dbError(res, error);
  res.json({ subjects: data });
});

// PUT /api/subjects/:code — add or update a subject
app.put('/api/subjects/:code', requireTeacher, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const { name, short, teacher, color } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
  const { data, error } = await db
    .from('subjects')
    .upsert({ code, name, short: short || null, teacher: teacher || null, color: color || '#6D28D9' }, { onConflict: 'code' })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json({ subject: data });
});

// DELETE /api/subjects/:code
app.delete('/api/subjects/:code', requireTeacher, async (req, res) => {
  const { error } = await db.from('subjects').delete().eq('code', req.params.code);
  if (error) return dbError(res, error);
  res.json({ message: 'Subject deleted' });
});

// GET /api/timetable?cls= — teachers pick any class; students always get their own
app.get('/api/timetable', async (req, res) => {
  let { cls } = req.query;
  if (req.user.role === 'student') {
    const me = await getOwnStudent(req.user.email);
    if (!me) return res.json({ cls: null, timetable: {} });
    cls = me.cls;
  }
  if (!cls) return res.status(400).json({ error: 'cls is required' });

  const { data, error } = await db.from('timetable').select('*').eq('cls', cls);
  if (error) return dbError(res, error);
  const timetable = {};
  data.forEach((r) => { (timetable[r.day] ||= {})[r.period] = { code: r.code, room: r.room || '' }; });
  res.json({ cls, timetable });
});

// PUT /api/timetable — set one period ({ cls, day, period, slot }); slot null clears it
app.put('/api/timetable', requireTeacher, async (req, res) => {
  const { cls, day, period, slot } = req.body;
  if (!cls || !DAYS.includes(day) || !Number.isInteger(period) || period < 0) {
    return res.status(400).json({ error: 'cls, day (Mon–Sat) and period are required' });
  }
  const q = slot?.code
    ? db.from('timetable').upsert({ cls, day, period, code: slot.code, room: slot.room || null }, { onConflict: 'cls,day,period' })
    : db.from('timetable').delete().match({ cls, day, period });
  const { error } = await q;
  if (error) return dbError(res, error);
  res.json({ message: 'Timetable updated' });
});

// GET /api/leave-requests — teachers see all, students see their own
app.get('/api/leave-requests', async (req, res) => {
  let query = db.from('leave_requests').select('*').order('created_at', { ascending: false });
  if (req.user.role === 'student') {
    const me = await getOwnStudent(req.user.email);
    if (!me) return res.json({ requests: [] });
    query = query.eq('sid', String(me.id));
  }
  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json({ requests: data.map(leaveOut) });
});

// POST /api/leave-requests — a student applies for leave
app.post('/api/leave-requests', requireRole('student'), async (req, res) => {
  const { type, from, to, reason } = req.body;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!type || !iso.test(from || '') || !iso.test(to || '') || !reason || String(reason).trim().length < 5) {
    return res.status(400).json({ error: 'type, from, to and a short reason are required' });
  }
  if (to < from) return res.status(400).json({ error: 'End date is before the start date' });

  const me = await getOwnStudent(req.user.email);
  if (!me) {
    return res.status(403).json({ error: 'Your login email isn’t linked to a student record yet. Ask your teacher to add it.' });
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const { data, error } = await db
    .from('leave_requests')
    .insert({ sid: String(me.id), type: String(type).slice(0, 60), from_date: from, to_date: to, days, reason: String(reason).trim().slice(0, 500) })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json({ request: leaveOut(data) });
});

// PATCH /api/leave-requests/:id — teacher approves / rejects / moves back to pending
app.patch('/api/leave-requests/:id', requireTeacher, async (req, res) => {
  const { status, note } = req.body;
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending, approved or rejected' });
  }
  const { data, error } = await db
    .from('leave_requests')
    .update({ status, note: note || null, decided_at: status === 'pending' ? null : new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json({ request: leaveOut(data) });
});

// DELETE /api/leave-requests/:id — remove one request
// Students can remove their own (a pending one is withdrawn); teachers can remove any.
app.delete('/api/leave-requests/:id', async (req, res) => {
  let query = db.from('leave_requests').delete().eq('id', req.params.id);
  if (req.user.role === 'student') {
    const me = await getOwnStudent(req.user.email);
    if (!me) return res.status(403).json({ error: 'Your account isn’t linked to a student record.' });
    query = query.eq('sid', String(me.id));
  }
  const { data, error } = await query.select('id');
  if (error) return dbError(res, error);
  if (!data.length) return res.status(404).json({ error: 'Request not found' });
  res.json({ message: 'Request removed' });
});

// DELETE /api/leave-requests — clear history: every approved/rejected request
// (a student's own, or all of them for a teacher). Pending requests are kept.
app.delete('/api/leave-requests', async (req, res) => {
  let query = db.from('leave_requests').delete().neq('status', 'pending');
  if (req.user.role === 'student') {
    const me = await getOwnStudent(req.user.email);
    if (!me) return res.status(403).json({ error: 'Your account isn’t linked to a student record.' });
    query = query.eq('sid', String(me.id));
  }
  const { data, error } = await query.select('id');
  if (error) return dbError(res, error);
  res.json({ message: 'History cleared', count: data.length });
});

// GET /api/warnings — teachers get the latest per student; students get their own list
app.get('/api/warnings', async (req, res) => {
  let query = db.from('warnings').select('*').order('created_at', { ascending: false });
  if (req.user.role === 'student') {
    const me = await getOwnStudent(req.user.email);
    if (!me) return res.json({ warnings: [] });
    query = query.eq('sid', String(me.id));
  }
  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json({ warnings: data.map((w) => ({ id: w.id, sid: w.sid, pct: w.pct, message: w.message, createdAt: w.created_at })) });
});

// POST /api/warnings — teacher sends a low-attendance warning to a student
app.post('/api/warnings', requireTeacher, async (req, res) => {
  const { sid, pct, message } = req.body;
  if (sid === undefined || sid === null || sid === '') return res.status(400).json({ error: 'sid is required' });
  const { data, error } = await db
    .from('warnings')
    .insert({ sid: String(sid), pct: Number.isFinite(pct) ? Math.round(pct) : null, message: message ? String(message).slice(0, 500) : null })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json({ warning: { id: data.id, sid: data.sid, pct: data.pct, message: data.message, createdAt: data.created_at } });
});

// ──────────────────────────────────────────
// START SERVER / EXPORT
// ──────────────────────────────────────────

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Attendance server running at http://localhost:${PORT}`);
  });
}

module.exports = app;