/* ─────────────────────────────────────────────
   Service layer. Pages only talk to this module.

   source = 'server' → the existing Express/Supabase API
                       (or the original localStorage fallback,
                       which api() routes to transparently)
   source = 'mock'   → generated demo data (mock-data.js)

   Subjects, timetable, leave requests and warnings
   come from the server too (shared between the
   teacher and student portals). Only per-subject
   stats and check-in/out times have no API yet.
   ───────────────────────────────────────────── */
import { api, isTeacher, getAuth, LOCAL, loadLocal, setUseLocal, usingLocal, isNetworkError } from '../core/api.js';
import { buildMockDB, SUBJECTS, SECTIONS, PERIODS, DAYS } from './mock-data.js';
import { isoDate } from '../core/html.js';

export { PERIODS, DAYS };

const MOCK_KEY = 'attendance_mock_v2';
const EXTRAS_KEY = 'attendance_extras_v1';
const PREF_KEY = 'attendance_prefs';

let source = 'server';
let db = null;          // mock DB (mock mode only)
let extras = null;      // supplementary store (server mode)
let meStudent = null;   // the logged-in student's roster row

export class NotSupportedError extends Error {}

/* ── preferences ── */
export function getPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
}
export function setPref(k, v) {
  const p = getPrefs(); p[k] = v;
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
}

/* ── persistence ── */
function loadMock() {
  const today = isoDate();
  try {
    const saved = JSON.parse(localStorage.getItem(MOCK_KEY) || 'null');
    if (saved && saved.generatedFor === today) return saved;
  } catch {}
  const fresh = buildMockDB(new Date());
  persist(MOCK_KEY, fresh);
  return fresh;
}
function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('persist failed', e); }
}
const saveMock = () => persist(MOCK_KEY, db);
function loadExtras() {
  let x = null;
  try { x = JSON.parse(localStorage.getItem(EXTRAS_KEY) || 'null'); } catch {}
  return x || { subjects: SUBJECTS.map((s) => ({ ...s })), timetable: {}, leaveRequests: [], warnings: {} };
}
const saveExtras = () => persist(EXTRAS_KEY, extras);
const store = () => (source === 'mock' ? db : extras);
const save = () => (source === 'mock' ? saveMock() : saveExtras());
const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms)); // lets skeletons render in mock mode

/* ── bootstrap ── */
/**
 * Decide where data comes from. Called once after the user is authenticated.
 * - forceMock: ?demo=... or the "Use demo data" preference
 * - otherwise try the API; if it's unreachable fall back to the original
 *   localStorage DB when it has data, else mock.
 */
export async function initData({ forceMock = false } = {}) {
  extras = loadExtras();
  if (forceMock || getPrefs().demo) return useMock();
  try {
    const { students } = await api('GET', '/students');
    source = 'server';
    if (!isTeacher()) meStudent = students[0] || null;
    return source;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    loadLocal();
    if (LOCAL.students?.length) {
      setUseLocal(true);
      source = 'server';
      if (!isTeacher()) meStudent = LOCAL.students.find((s) => s.email === getAuth()?.user?.email) || null;
      return 'local';
    }
    return useMock();
  }
}

function useMock() {
  source = 'mock';
  db = loadMock();
  if (!isTeacher()) {
    const email = getAuth()?.user?.email;
    // Demo student: pick a student hovering near the 75% line so the bunk calculator is interesting.
    meStudent = db.students.find((s) => s.email === email)
      || [...db.students].sort((a, b) => Math.abs(a.dailyRate - 0.8) - Math.abs(b.dailyRate - 0.8))[0];
  }
  return 'mock';
}

export const getSource = () => source;
export const isMock = () => source === 'mock';
export const me = () => meStudent;

export function resetDemo() {
  localStorage.removeItem(MOCK_KEY);
  if (source === 'mock') db = loadMock();
}

/* ── classes ── */
export async function listClasses() {
  if (isMock()) { await delay(80); return [...db.classes]; }
  return (await api('GET', '/classes')).classes;
}
export async function addClass(name) {
  if (isMock()) {
    if (db.classes.includes(name)) throw new Error('Class already exists');
    db.classes.push(name); db.classes.sort(); saveMock(); return [...db.classes];
  }
  return (await api('POST', '/classes', { name })).classes;
}
export async function deleteClass(name) {
  if (isMock()) {
    if (db.students.some((s) => s.cls === name)) throw new Error('Remove all students from this class first');
    db.classes = db.classes.filter((c) => c !== name); saveMock(); return [...db.classes];
  }
  return (await api('DELETE', `/classes/${encodeURIComponent(name)}`)).classes;
}

/* ── students ── */
const pub = ({ id, name, roll, cls, email, phone }) => ({ id, name, roll, cls, email, phone });
export async function listStudents({ cls } = {}) {
  if (isMock()) {
    await delay();
    let s = db.students;
    if (!isTeacher()) s = s.filter((x) => x.id === meStudent?.id);
    else if (cls) s = s.filter((x) => x.cls === cls);
    return s.map(pub).sort((a, b) => a.name.localeCompare(b.name));
  }
  return (await api('GET', '/students' + (cls ? `?cls=${encodeURIComponent(cls)}` : ''))).students;
}
export async function addStudent({ name, roll, cls, email }) {
  if (isMock()) {
    if (db.students.some((s) => s.roll === roll)) throw new Error('Roll number already exists');
    const s = { id: 'm' + Date.now() + Math.floor(Math.random() * 999), name, roll, cls, email: email || null, subjects: db.subjects.slice(0, 5).map((x) => x.code), reliability: 0.9, punctuality: 0.9 };
    db.students.push(s); db.subjectStats[s.id] = []; saveMock(); return pub(s);
  }
  return (await api('POST', '/students', { name, roll, cls, email: email || null })).student;
}
export async function updateStudent(id, patch) {
  if (isMock()) {
    const s = db.students.find((x) => x.id === id);
    if (!s) throw new Error('Student not found');
    if (patch.roll && patch.roll !== s.roll && db.students.some((x) => x.roll === patch.roll)) throw new Error('Roll number already exists');
    Object.assign(s, patch); saveMock(); return pub(s);
  }
  if (usingLocal()) throw new NotSupportedError('Editing isn’t available while offline. Delete and re-add the student for now.');
  return (await api('PUT', `/students/${id}`, patch)).student;
}
export async function deleteStudent(id) {
  if (isMock()) {
    db.students = db.students.filter((s) => s.id !== id);
    db.attendance = db.attendance.filter((a) => a.sid !== id);
    saveMock(); return;
  }
  await api('DELETE', `/students/${id}`);
}

/* ── attendance ── */
const STATUS_ORDER = { P: 0, L: 1, E: 2, CL: 2, A: 3 };
export async function getAttendance({ date, from, to, sid } = {}) {
  if (isMock()) {
    await delay();
    let r = db.attendance;
    if (!isTeacher()) r = r.filter((a) => a.sid === meStudent?.id);
    else if (sid) r = r.filter((a) => a.sid === sid);
    if (date) r = r.filter((a) => a.date === date);
    if (from) r = r.filter((a) => a.date >= from);
    if (to) r = r.filter((a) => a.date <= to);
    return [...r].sort((a, b) => b.date.localeCompare(a.date));
  }
  const qs = new URLSearchParams();
  if (date) qs.set('date', date);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (sid) qs.set('sid', sid);
  const q = qs.toString();
  const { attendance } = await api('GET', '/attendance' + (q ? `?${q}` : ''));
  // The API has no check-in/out times — leave them empty rather than invent them.
  return attendance.map((a) => ({ checkIn: null, checkOut: null, ...a }));
}
export async function saveAttendance(date, records) {
  if (isMock()) {
    const sids = new Set(records.map((r) => r.sid));
    const prev = Object.fromEntries(db.attendance.filter((a) => a.date === date && sids.has(a.sid)).map((a) => [a.sid, a]));
    db.attendance = db.attendance.filter((a) => !(a.date === date && sids.has(a.sid)));
    records.forEach((r) => {
      const keep = prev[r.sid] && prev[r.sid].status === r.status ? prev[r.sid] : null;
      db.attendance.push({ date, sid: r.sid, status: r.status, checkIn: keep?.checkIn ?? null, checkOut: keep?.checkOut ?? null });
    });
    saveMock(); return { count: records.length };
  }
  return api('POST', '/attendance', { date, records });
}
export async function resetAttendance(date, cls) {
  if (isMock()) {
    const ids = cls ? new Set(db.students.filter((s) => s.cls === cls).map((s) => s.id)) : null;
    db.attendance = db.attendance.filter((a) => !(a.date === date && (!ids || ids.has(a.sid))));
    saveMock(); return;
  }
  const qs = `date=${date}` + (cls ? `&cls=${encodeURIComponent(cls)}` : '');
  return api('DELETE', `/attendance?${qs}`);
}
export const sortByStatus = (a, b) => (STATUS_ORDER[a] ?? 9) - (STATUS_ORDER[b] ?? 9);

/* ── report (same shape as GET /api/report) ── */
export async function getReport({ cls, from, to } = {}) {
  if (!isMock() && !from && !to) return (await api('GET', '/report' + (cls ? `?cls=${encodeURIComponent(cls)}` : ''))).report;
  // Mock mode, or a date range (the API report has no range filter, so compute from raw records).
  const [students, att] = await Promise.all([listStudents({ cls }), getAttendance({ from, to })]);
  const by = {};
  att.forEach((a) => { (by[a.sid] ||= []).push(a); });
  const leaves = isMock() ? db.leaves : {};
  return students.map((s) => {
    const recs = by[s.id] || [];
    const total = recs.length;
    const present = recs.filter((a) => a.status === 'P' || a.status === 'L').length;
    const absent = recs.filter((a) => a.status === 'A').length;
    const late = recs.filter((a) => a.status === 'L').length;
    const elUsed = recs.filter((a) => a.status === 'E').length;
    const clUsed = recs.filter((a) => a.status === 'CL').length;
    const pct = total > 0 ? Math.round(((present + elUsed + clUsed) / total) * 100) : null;
    const lv = leaves[s.id] || { el: 0, cl: 0 };
    return {
      id: s.id, name: s.name, roll: s.roll, cls: s.cls, totalSessions: total, present, absent, late, elUsed, clUsed,
      elAllotted: lv.el, clAllotted: lv.cl, attendancePct: pct,
      status: pct === null ? 'no-data' : pct >= 75 ? 'good' : pct >= 50 ? 'warning' : 'low',
    };
  }).sort((a, b) => (b.attendancePct || 0) - (a.attendancePct || 0));
}

/* ── leave balances (EL/CL) — existing /api/leaves ── */
export async function getLeaveBalances() {
  if (isMock()) { await delay(80); return structuredClone(db.leaves); }
  const { leaves } = await api('GET', '/leaves');
  const out = {};
  leaves.forEach((l) => { out[l.sid] = { el: l.el_total, cl: l.cl_total, elUsed: l.el_used, clUsed: l.cl_used }; });
  return out;
}
export async function saveLeaveBalance(sid, { el, cl, elUsed, clUsed }) {
  if (isMock()) { db.leaves[sid] = { el, cl, elUsed, clUsed }; saveMock(); return; }
  await api('POST', '/leaves', { sid, el_total: el, cl_total: cl, el_used: elUsed, cl_used: clUsed });
}

/* ── shared teacher ↔ student data ──
   Subjects, timetable, leave requests and warnings are stored on the
   server (see backend/schema-portal-link.sql), so a teacher's changes
   reach students and students' requests reach the teacher.
   Mock mode, the offline fallback, or a database without those tables
   yet all use the local store instead. */
let notSetUp = false;
const useLinked = () => !isMock() && !usingLocal() && !notSetUp;
export const linkedToServer = () => useLinked();
async function linked(call, fallback) {
  if (!useLinked()) return fallback();
  try { return await call(); } catch (e) {
    if (e.code !== 'not_set_up' && !isNetworkError(e)) throw e;
    console.warn('Shared data unavailable — using this browser only:', e.message);
    notSetUp = true;
    return fallback();
  }
}
const emptyGrid = () => Object.fromEntries(DAYS.map((d) => [d, PERIODS.map(() => null)]));
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/* ── subjects ── */
export async function listSubjects() {
  return linked(
    async () => (await api('GET', '/subjects')).subjects,
    async () => { await delay(60); return structuredClone(store().subjects); },
  );
}
export async function saveSubject(subj) {
  return linked(
    () => api('PUT', `/subjects/${encodeURIComponent(subj.code)}`, subj),
    () => {
      const s = store();
      const i = s.subjects.findIndex((x) => x.code === subj.code);
      if (i >= 0) s.subjects[i] = { ...s.subjects[i], ...subj };
      else s.subjects.push({ color: '#6D28D9', ...subj });
      save();
    },
  );
}
export async function deleteSubject(code) {
  return linked(
    () => api('DELETE', `/subjects/${encodeURIComponent(code)}`),
    () => { const s = store(); s.subjects = s.subjects.filter((x) => x.code !== code); save(); },
  );
}

/** Subject-wise term stats for one student, or null when the backend can't provide them. */
export async function getSubjectStats(sid) {
  if (!isMock()) return null;
  await delay(120);
  return (db.subjectStats[sid] || []).map((r) => ({ ...r, subject: db.subjects.find((s) => s.code === r.code) }));
}
/** Subject-wise averages across a set of students (mock only). */
export async function getSubjectAverages(cls) {
  if (!isMock()) return null;
  const ids = new Set(db.students.filter((s) => !cls || s.cls === cls).map((s) => s.id));
  const acc = {};
  for (const [sid, rows] of Object.entries(db.subjectStats)) {
    if (!ids.has(sid)) continue;
    rows.forEach((r) => { const a = (acc[r.code] ||= { held: 0, attended: 0 }); a.held += r.held; a.attended += r.attended; });
  }
  return db.subjects.filter((s) => acc[s.code]).map((s) => ({ subject: s, pct: (acc[s.code].attended / acc[s.code].held) * 100 }));
}

/* ── timetable ── */
export async function getTimetable(cls) {
  return linked(
    async () => {
      const { timetable } = await api('GET', '/timetable' + (cls ? `?cls=${encodeURIComponent(cls)}` : ''));
      const grid = emptyGrid();
      for (const [day, periods] of Object.entries(timetable || {})) {
        if (!grid[day]) continue;
        for (const [p, slot] of Object.entries(periods)) if (grid[day][p] !== undefined) grid[day][p] = slot;
      }
      return grid;
    },
    async () => {
      await delay(100);
      const t = store().timetable[cls];
      return t ? structuredClone(t) : emptyGrid();
    },
  );
}
export async function setTimetableSlot(cls, day, period, slot) {
  return linked(
    () => api('PUT', '/timetable', { cls, day, period, slot }),
    () => {
      const s = store();
      if (!s.timetable[cls]) s.timetable[cls] = emptyGrid();
      s.timetable[cls][day][period] = slot;
      save();
    },
  );
}

/* ── leave requests ── */
export async function listLeaveRequests() {
  return linked(
    async () => (await api('GET', '/leave-requests')).requests,
    async () => {
      await delay(160);
      let r = store().leaveRequests;
      if (!isTeacher()) r = r.filter((x) => sameId(x.sid, meStudent?.id));
      return structuredClone(r).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  );
}
export async function createLeaveRequest({ type, from, to, reason }) {
  if (!meStudent) throw new Error('Your login email isn’t linked to a student record yet. Ask your teacher to add it.');
  return linked(
    async () => (await api('POST', '/leave-requests', { type, from, to, reason })).request,
    () => {
      const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
      const req = { id: 'lr' + Date.now(), sid: meStudent.id, type, from, to, days, reason, status: 'pending', createdAt: isoDate() };
      store().leaveRequests.push(req); save();
      return req;
    },
  );
}
export async function setLeaveRequestStatus(id, status) {
  return linked(
    async () => (await api('PATCH', `/leave-requests/${encodeURIComponent(id)}`, { status })).request,
    () => {
      const r = store().leaveRequests.find((x) => x.id === id);
      if (!r) throw new Error('Request not found');
      r.status = status; r.decidedAt = status === 'pending' ? null : isoDate(); save();
      return r;
    },
  );
}

/** Remove one request (withdraws it if still pending). */
export async function deleteLeaveRequest(id) {
  return linked(
    () => api('DELETE', `/leave-requests/${encodeURIComponent(id)}`),
    () => { const s = store(); s.leaveRequests = s.leaveRequests.filter((x) => x.id !== id); save(); },
  );
}
/** Clear history: remove every approved/rejected request (pending ones stay). Returns how many went. */
export async function clearLeaveHistory() {
  return linked(
    async () => (await api('DELETE', '/leave-requests')).count,
    () => {
      const s = store();
      const mine = (x) => isTeacher() || sameId(x.sid, meStudent?.id);
      const before = s.leaveRequests.length;
      s.leaveRequests = s.leaveRequests.filter((x) => !(mine(x) && x.status !== 'pending'));
      save();
      return before - s.leaveRequests.length;
    },
  );
}

/* ── low-attendance warnings ── */
/** Teacher → student. Saved on the server so the student sees it on their dashboard. */
export async function sendWarning(sid, { pct, message } = {}) {
  return linked(
    async () => { await api('POST', '/warnings', { sid, pct, message }); return { delivered: true }; },
    async () => { await delay(300); store().warnings[sid] = isoDate(); save(); return { delivered: false }; },
  );
}
/** Teacher view: sid → date of the latest warning. */
export async function getWarnings() {
  return linked(
    async () => {
      const out = {};
      (await api('GET', '/warnings')).warnings.forEach((w) => { out[w.sid] ||= w.createdAt.slice(0, 10); });
      return out;
    },
    async () => ({ ...store().warnings }),
  );
}
/** Student view: the warnings their teacher has sent them, newest first. */
export async function myWarnings() {
  return linked(
    async () => (await api('GET', '/warnings')).warnings,
    async () => {
      const d = meStudent && store().warnings[meStudent.id];
      return d ? [{ id: 'w-local', sid: meStudent.id, pct: null, message: null, createdAt: d }] : [];
    },
  );
}

export { SECTIONS };
