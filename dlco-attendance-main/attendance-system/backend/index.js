try {
  require('dotenv').config();
} catch (error) {
  // dotenv is helpful locally, but production can provide env vars directly.
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const { supabase, db } = require('./supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend from backend folder (useful for local testing)
app.use(express.static(path.join(__dirname, '../frontend')));

function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
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

  req.user = userPayload(data.user);
  next();
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

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required' });
  }

  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: 'role must be teacher or student' });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role } }
  });

  if (error) return res.status(400).json({ error: error.message });

  res.status(201).json({
    message: data.session ? 'Signup successful' : 'Signup successful. Check your email to confirm your account.',
    access_token: data.session?.access_token || null,
    refresh_token: data.session?.refresh_token || null,
    user: data.user ? userPayload(data.user) : null
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });

  res.json({
    message: 'Login successful',
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: userPayload(data.user)
  });
});

app.post('/api/auth/logout', requireAuth, (_req, res) => {
  res.json({ message: 'Logged out successfully' });
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
    query = query.eq('email', req.user.email);
  } else if (cls) {
    query = query.eq('cls', cls);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ students: data });
});

// Look up the students.id that belongs to the currently logged-in student.
async function getOwnStudentId(email) {
  const { data } = await db.from('students').select('id').eq('email', email).single();
  return data?.id || null;
}

// POST /api/students
app.post('/api/students', requireTeacher, async (req, res) => {
  const { name, roll, cls, email } = req.body;
  if (!name || !roll || !cls)
    return res.status(400).json({ error: 'name, roll, and cls are required' });

  const { data, error } = await db
    .from('students')
    .insert([{ name, roll, cls, email: email || null }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Roll number already exists' });
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ message: 'Student added', student: data });
});

// DELETE /api/students/:id
app.delete('/api/students/:id', requireTeacher, async (req, res) => {
  const { id } = req.params;
  const { error } = await db
    .from('students')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
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
    stuQuery = stuQuery.eq('email', req.user.email);
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
// START SERVER / EXPORT
// ──────────────────────────────────────────

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Attendance server running at http://localhost:${PORT}`);
  });
}

module.exports = app;