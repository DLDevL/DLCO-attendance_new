/* ─────────────────────────────────────────────
   API + auth storage, ported from the original
   index.html. Behaviour is unchanged: same
   endpoints, same localStorage keys, same Bearer
   token handling and the same localStorage
   fallback database (att_db_v3) used when the
   backend can't be reached.
   ───────────────────────────────────────────── */
const API = '/api';

export const LOCAL = { classes: [], students: [], attendance: [], leaves: {} };
let USE_LOCAL = false;
let AUTH = readJSON('attendance_auth');

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

export function getAuth() { return AUTH; }
export function isTeacher() { return AUTH?.user?.role === 'teacher'; }
export function setUseLocal(v) { USE_LOCAL = v; }
export function usingLocal() { return USE_LOCAL; }

export function saveAuth(auth) {
  AUTH = auth;
  localStorage.setItem('attendance_auth', JSON.stringify(auth));
}

export function clearAuth() {
  AUTH = null;
  localStorage.removeItem('attendance_auth');
}

/** True when an error means the session is gone and the user must log in again. */
export function isAuthError(e) {
  const m = (e?.message || '').toLowerCase();
  return m.includes('login') || m.includes('session') || m.includes('expired');
}

/** True when the request never reached a working backend (network down, no server, HTML 404, etc). */
export function isNetworkError(e) {
  if (!e) return false;
  if (e.name === 'TypeError') return true;            // fetch() network failure
  if (e.name === 'SyntaxError') return true;          // non-JSON response (static host, proxy page)
  return e.status >= 500;
}

export async function api(method, path, body) {
  if (USE_LOCAL) return localAPI(method, path, body);
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (AUTH?.token) opts.headers.Authorization = `Bearer ${AUTH.token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

/* ── Local fallback database (unchanged from the original) ── */

export function loadLocal() {
  try {
    const primary = localStorage.getItem('att_db_v3');
    if (primary) {
      const parsed = JSON.parse(primary);
      if (parsed && Array.isArray(parsed.students)) { Object.assign(LOCAL, parsed); return; }
    }
  } catch (e) {}
  try {
    const backup = localStorage.getItem('att_db_backup');
    if (backup) {
      const parsed = JSON.parse(backup);
      if (parsed && Array.isArray(parsed.students)) {
        Object.assign(LOCAL, parsed);
        localStorage.setItem('att_db_v3', backup);
      }
    }
  } catch (e) {}
}

export function saveLocal() {
  try {
    const data = JSON.stringify(LOCAL);
    localStorage.setItem('att_db_v3', data);
    localStorage.setItem('att_db_backup', data);
  } catch (e) { console.warn('Save failed:', e); }
}

function genId() { return 's' + Date.now() + Math.floor(Math.random() * 9999); }

function localAPI(method, path, body) {
  const [base, qs] = path.split('?');
  const params = qs ? Object.fromEntries(new URLSearchParams(qs)) : {};
  if (method !== 'GET' && !base.startsWith('/auth') && !isTeacher()) {
    throw new Error('Teacher access required');
  }
  if (base === '/auth/me') return { user: AUTH?.user };
  if (base === '/auth/logout') return { message: 'Logged out' };
  if (base === '/classes') {
    if (method === 'GET') return { classes: LOCAL.classes };
    if (method === 'POST') {
      if (LOCAL.classes.includes(body.name)) throw new Error('Class already exists');
      LOCAL.classes.push(body.name); saveLocal(); return { classes: LOCAL.classes };
    }
  }
  if (base.startsWith('/classes/') && method === 'DELETE') {
    const name = decodeURIComponent(base.split('/classes/')[1]);
    LOCAL.classes = LOCAL.classes.filter(c => c !== name); saveLocal(); return { classes: LOCAL.classes };
  }
  if (base === '/students') {
    if (method === 'GET') { let s = LOCAL.students; if (params.cls) s = s.filter(x => x.cls === params.cls); return { students: s }; }
    if (method === 'POST') {
      if (LOCAL.students.some(s => s.roll === body.roll)) throw new Error('Roll number already exists');
      const s = { id: genId(), ...body }; LOCAL.students.push(s); saveLocal(); return { student: s };
    }
  }
  if (base.startsWith('/students/') && method === 'DELETE') {
    const id = base.split('/students/')[1];
    LOCAL.students = LOCAL.students.filter(s => s.id !== id);
    LOCAL.attendance = LOCAL.attendance.filter(a => a.sid !== id);
    saveLocal(); return { message: 'removed' };
  }
  if (base === '/attendance') {
    if (method === 'GET') {
      let r = [...LOCAL.attendance];
      if (params.date) r = r.filter(x => x.date === params.date);
      if (params.sid) r = r.filter(x => x.sid === params.sid);
      if (params.from) r = r.filter(x => x.date >= params.from);
      if (params.to) r = r.filter(x => x.date <= params.to);
      return { attendance: r.sort((a, b) => b.date.localeCompare(a.date)) };
    }
    if (method === 'POST') {
      const sids = new Set(body.records.map(r => r.sid));
      LOCAL.attendance = LOCAL.attendance.filter(a => !(a.date === body.date && sids.has(a.sid)));
      body.records.forEach(r => LOCAL.attendance.push({ date: body.date, sid: r.sid, status: r.status }));
      saveLocal(); return { message: 'saved' };
    }
    if (method === 'DELETE') {
      let ids = null;
      if (params.cls) ids = new Set(LOCAL.students.filter(s => s.cls === params.cls).map(s => s.id));
      LOCAL.attendance = LOCAL.attendance.filter(a => !(a.date === params.date && (!ids || ids.has(a.sid))));
      saveLocal(); return { message: 'reset' };
    }
  }
  if (base === '/leaves') {
    if (method === 'GET') {
      return { leaves: Object.entries(LOCAL.leaves || {}).map(([sid, l]) => ({ sid, el_total: l.el, cl_total: l.cl, el_used: l.elUsed || 0, cl_used: l.clUsed || 0 })) };
    }
    if (method === 'POST') {
      LOCAL.leaves[body.sid] = { el: body.el_total, cl: body.cl_total, elUsed: body.el_used, clUsed: body.cl_used };
      saveLocal(); return { message: 'Leaves updated' };
    }
  }
  if (base === '/report') {
    let stus = LOCAL.students;
    if (params.cls) stus = stus.filter(s => s.cls === params.cls);
    const report = stus.map(s => {
      const recs = LOCAL.attendance.filter(a => a.sid === s.id);
      const total = recs.length;
      const present = recs.filter(a => a.status === 'P' || a.status === 'L').length;
      const absent = recs.filter(a => a.status === 'A').length;
      const late = recs.filter(a => a.status === 'L').length;
      const elUsed = recs.filter(a => a.status === 'E').length;
      const clUsed = recs.filter(a => a.status === 'CL').length;
      const effectivePresent = present + elUsed + clUsed;
      const pct = total > 0 ? Math.round((effectivePresent / total) * 100) : null;
      const lvData = LOCAL.leaves[s.id] || { el: 0, cl: 0 };
      return {
        ...s, totalSessions: total, present, absent, late,
        elUsed, clUsed, elAllotted: lvData.el, clAllotted: lvData.cl,
        attendancePct: pct,
        status: pct === null ? 'no-data' : pct >= 75 ? 'good' : pct >= 50 ? 'warning' : 'low'
      };
    });
    return { report: report.sort((a, b) => (b.attendancePct || 0) - (a.attendancePct || 0)) };
  }
  throw new Error('Unknown API path: ' + path);
}
