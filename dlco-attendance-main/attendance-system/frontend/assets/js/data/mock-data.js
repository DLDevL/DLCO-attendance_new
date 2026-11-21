/* ─────────────────────────────────────────────
   Deterministic mock dataset.
   184 students across 4 sections, daily attendance
   (the dashboard uses the last 7 days; 6 weeks are
   generated so calendars and heatmaps have history),
   subjects, timetable, leave requests.
   Only used when the real API isn't available or
   for features the API doesn't have yet.
   ───────────────────────────────────────────── */
import { isoDate, addDays } from '../core/html.js';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Shaurya', 'Atharv', 'Kabir', 'Rohan', 'Dhruv', 'Aryan', 'Kunal', 'Nikhil', 'Rahul', 'Siddharth',
  'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Ira', 'Myra', 'Kiara', 'Anika', 'Riya', 'Priya',
  'Sneha', 'Pooja', 'Meera', 'Tanvi', 'Isha', 'Nisha', 'Kavya', 'Shreya', 'Aditi', 'Neha',
  'Zara', 'Farhan', 'Imran', 'Sana', 'Harpreet', 'Gurleen', 'Joel', 'Anjali', 'Lakshmi', 'Varun'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Mehta', 'Kapoor', 'Joshi',
  'Singh', 'Das', 'Banerjee', 'Mukherjee', 'Rao', 'Pillai', 'Kulkarni', 'Desai', 'Chopra', 'Malhotra',
  'Bose', 'Saxena', 'Agarwal', 'Mishra', 'Pandey', 'Khan', 'Thomas', 'Menon', 'Ghosh', 'Sinha'];

export const SECTIONS = ['CSE-A', 'CSE-B', 'CSE-C', 'CSE-D'];

export const SUBJECTS = [
  { code: 'CS201', name: 'Digital Logic & Computer Org.', short: 'DLCO', teacher: 'Dr. R. Menon', color: '#6D28D9' },
  { code: 'CS202', name: 'Data Structures', short: 'DSA', teacher: 'Prof. S. Iyer', color: '#F59E0B' },
  { code: 'CS203', name: 'Database Systems', short: 'DBMS', teacher: 'Dr. A. Kapoor', color: '#10B981' },
  { code: 'CS204', name: 'Operating Systems', short: 'OS', teacher: 'Prof. N. Rao', color: '#EC4899' },
  { code: 'CS205', name: 'Computer Networks', short: 'CN', teacher: 'Dr. P. Ghosh', color: '#3B82F6' },
  { code: 'MA201', name: 'Discrete Mathematics', short: 'DM', teacher: 'Dr. K. Nair', color: '#64748B' },
];

const SECTION_SUBJECTS = {
  'CSE-A': ['CS201', 'CS202', 'MA201', 'CS203', 'CS204'],
  'CSE-B': ['CS201', 'CS202', 'MA201', 'CS203', 'CS204'],
  'CSE-C': ['CS201', 'CS202', 'MA201', 'CS204', 'CS205'],
  'CSE-D': ['CS201', 'CS202', 'MA201', 'CS203', 'CS205'],
};

export const PERIODS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00'];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const z = (n) => String(n).padStart(2, '0');
const toHHMM = (mins) => `${z(Math.floor(mins / 60))}:${z(mins % 60)}`;

/** Weighted sample without replacement (Efraimidis–Spirakis). */
function weightedOrder(items, weight, rnd) {
  return items
    .map((it) => ({ it, k: Math.pow(rnd(), 1 / Math.max(weight(it), 1e-6)) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.it);
}

export function buildMockDB(today = new Date()) {
  const rnd = mulberry32(20261104);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // ── students ──
  const students = [];
  const used = new Set();
  for (let i = 0; i < 184; i++) {
    let name;
    do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (used.has(name));
    used.add(name);
    const cls = SECTIONS[Math.floor(i / 46)];
    const [f, l] = name.toLowerCase().split(' ');
    // ~7% chronic absentees → realistic defaulter list
    const reliability = i % 15 === 7 ? 0.55 + rnd() * 0.15 : 0.82 + rnd() * 0.17;
    students.push({
      id: `m${1000 + i}`,
      name,
      roll: `22CS${String(i + 1).padStart(3, '0')}`,
      cls,
      email: `${f}.${l}${i}@college.edu`,
      phone: `+91 9${Math.floor(100000000 + rnd() * 899999999)}`,
      subjects: SECTION_SUBJECTS[cls],
      reliability,
      punctuality: 0.75 + rnd() * 0.25,
    });
  }

  // ── daily attendance, 42 days ending today ──
  // Last 7 days are tuned to read like the reference (87 → 92%).
  const tuned = [
    { present: 160, late: 12, leave: 9 },
    { present: 162, late: 10, leave: 8 },
    { present: 153, late: 14, leave: 11 },
    { present: 156, late: 9, leave: 12 },
    { present: 166, late: 12, leave: 7 },
    { present: 163, late: 11, leave: 10 },
    { present: 169, late: 8, leave: 10 }, // today
  ];
  const attendance = [];
  const DAYS_BACK = 42;
  for (let d = DAYS_BACK - 1; d >= 0; d--) {
    const date = isoDate(addDays(today, -d));
    const isToday = d === 0;
    const plan = d < 7 ? tuned[6 - d] : { present: 150 + Math.floor(rnd() * 20), late: 8 + Math.floor(rnd() * 8), leave: 5 + Math.floor(rnd() * 8) };

    const order = weightedOrder(students, (s) => 1 - s.reliability + 0.02, rnd); // most likely absent first
    const nonPresent = order.slice(0, students.length - plan.present);
    const present = order.slice(students.length - plan.present);
    const leaveSet = new Set(nonPresent.slice(0, plan.leave).map((s) => s.id));
    const unmarkedSet = new Set(isToday ? nonPresent.slice(plan.leave, plan.leave + 3).map((s) => s.id) : []);
    const lateSet = new Set(weightedOrder(present, (s) => 1 - s.punctuality + 0.02, rnd).slice(0, plan.late).map((s) => s.id));
    let missingCheckout = isToday ? 2 : 0;

    for (const s of students) {
      if (unmarkedSet.has(s.id)) continue;
      let status, checkIn = null, checkOut = null;
      if (leaveSet.has(s.id)) status = rnd() < 0.6 ? 'E' : 'CL';
      else if (!present.includes(s)) status = 'A';
      else if (lateSet.has(s.id)) status = 'L';
      else status = 'P';
      if (status === 'P' || status === 'L') {
        const inMin = status === 'P' ? 8 * 60 + 38 + Math.floor(rnd() * 22) : 9 * 60 + 5 + Math.floor(rnd() * 35);
        checkIn = toHHMM(inMin);
        if (missingCheckout > 0 && rnd() < 0.08) { missingCheckout--; }
        else checkOut = toHHMM(16 * 60 + 50 + Math.floor(rnd() * 35));
      }
      attendance.push({ date, sid: s.id, status, checkIn, checkOut });
    }
  }

  // ── subject-wise term stats (anchored to each student's real daily rate so the numbers agree) ──
  const daily = {};
  attendance.forEach((a) => {
    const d = (daily[a.sid] ||= { t: 0, a: 0 });
    d.t++; if (a.status !== 'A') d.a++;
  });
  const subjectStats = {};
  for (const s of students) {
    s.dailyRate = daily[s.id] ? daily[s.id].a / daily[s.id].t : 0;
    subjectStats[s.id] = s.subjects.map((code) => {
      const held = 36 + Math.floor(rnd() * 9);
      const rate = Math.min(1, Math.max(0.4, s.dailyRate + (rnd() - 0.5) * 0.12));
      return { code, held, attended: Math.round(held * rate) };
    });
  }

  // ── timetable per section ──
  const rooms = ['LH-101', 'LH-102', 'LH-204', 'Lab-3', 'LH-305', 'Lab-1'];
  const timetable = {};
  for (const sec of SECTIONS) {
    timetable[sec] = {};
    const subs = SECTION_SUBJECTS[sec];
    DAYS.forEach((day, di) => {
      timetable[sec][day] = PERIODS.map((_, pi) => {
        if (day === 'Sat' && pi >= 3) return null;
        if ((di + pi) % 5 === 4) return null; // free period
        const code = subs[(di * 2 + pi + SECTIONS.indexOf(sec)) % subs.length];
        return { code, room: rooms[(di + pi) % rooms.length] };
      });
    });
  }

  // ── leave requests ──
  const types = ['Medical', 'Personal', 'Family function', 'Sports / OD', 'Hackathon / OD'];
  const reasons = {
    Medical: ['Viral fever, doctor advised rest.', 'Dental surgery follow-up.', 'Migraine, medical certificate attached.'],
    Personal: ['Passport appointment at the regional office.', 'Shifting hostel rooms.'],
    'Family function': ["Sister's wedding in hometown.", 'Grandparents’ anniversary ceremony.'],
    'Sports / OD': ['Representing college at inter-university football.', 'State-level chess tournament.'],
    'Hackathon / OD': ['Selected for Smart India Hackathon finals.', 'ACM regional programming contest.'],
  };
  const leaveRequests = [];
  const statuses = ['pending', 'pending', 'pending', 'pending', 'pending', 'approved', 'approved', 'approved', 'rejected', 'rejected'];
  statuses.forEach((status, i) => {
    const s = students[(i * 17 + 5) % students.length];
    const type = types[i % types.length];
    const start = addDays(today, i < 5 ? 1 + (i % 4) : -(i - 3));
    const len = 1 + (i % 3);
    leaveRequests.push({
      id: `lr${i + 1}`, sid: s.id, type,
      from: isoDate(start), to: isoDate(addDays(start, len - 1)), days: len,
      reason: reasons[type][i % reasons[type].length],
      status, createdAt: isoDate(addDays(today, -(i % 4) - 1)),
    });
  });

  // ── leave balances (EL / CL) ──
  const leaves = {};
  students.forEach((s, i) => { leaves[s.id] = { el: 10, cl: 6, elUsed: i % 4, clUsed: i % 3 }; });

  return {
    generatedFor: isoDate(today),
    classes: [...SECTIONS],
    students,
    attendance,
    subjects: SUBJECTS,
    subjectStats,
    timetable,
    leaveRequests,
    leaves,
    warnings: {},
  };
}
