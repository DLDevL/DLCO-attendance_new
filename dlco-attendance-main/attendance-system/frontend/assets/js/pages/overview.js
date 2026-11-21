/* Teacher / admin dashboard — "Good students. Great attendance." */
import { html, mount, $, on, isoDate, addDays, fmtLong, fmtShort, fmtDow, pad2, pct1, debounce, downloadFile, toCSV } from '../core/html.js';
import { weekBars } from '../core/charts.js';
import * as svc from '../data/services.js';
import { Card, StatCard, StatusPill, DataTable, Pager, PersonCell, Tabs, Button, Icon, Skeleton, EmptyState, openModal, Avatar, toast } from '../components.js';

const PAGE_SIZE = 7;

export function hours(a, b) {
  if (!a || !b) return null;
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  const m = h2 * 60 + m2 - (h1 * 60 + m1);
  return m > 0 ? `${Math.floor(m / 60)}h ${pad2(m % 60)}m` : null;
}

export default async function overview(root, ctx) {
  const today = new Date();
  const todayISO = isoDate(today);
  const from = isoDate(addDays(today, -6));

  mount(root, html`
    <div class="page-head">
      <div>
        <p class="page-date">${fmtLong(today)}</p>
        <h1 class="page-title">Good students. Great attendance.</h1>
        <p class="page-sub">A little clarity for your classroom’s day.</p>
      </div>
      <div class="page-actions">
        ${Button('Export report', { icon: 'download', action: 'export' })}
        ${Button('Add attendance', { variant: 'primary', icon: 'plus', action: 'add' })}
      </div>
    </div>
    <div id="stats">${Skeleton.stats()}</div>
    <div class="grid-main">
      <div id="left">${Card({ body: html`${Skeleton.text('40%')}${Skeleton.text('25%')}<div style="height:16px"></div>${Skeleton.rows(7)}` })}</div>
      <div class="stack" id="right">${Skeleton.block(330)}${Skeleton.block(150)}${Skeleton.block(80)}</div>
    </div>
  `);

  const [students, classes, att, subjects] = await Promise.all([
    svc.listStudents(), svc.listClasses(), svc.getAttendance({ from, to: todayISO }), svc.listSubjects(),
  ]);
  if (ctx.isStale()) return;
  const timetables = Object.fromEntries(await Promise.all(classes.map(async (c) => [c, await svc.getTimetable(c)])));
  const sectionSubjects = {};
  for (const [c, tt] of Object.entries(timetables)) {
    sectionSubjects[c] = new Set(Object.values(tt).flat().filter(Boolean).map((s) => s.code));
  }

  /* ── aggregate ── */
  const byDate = {};
  att.forEach((a) => { (byDate[a.date] ||= {})[a.sid] = a; });
  const tally = (date) => {
    const recs = Object.values(byDate[date] || {});
    const c = { P: 0, L: 0, leave: 0, A: 0, marked: recs.length };
    recs.forEach((r) => { if (r.status === 'P') c.P++; else if (r.status === 'L') c.L++; else if (r.status === 'A') c.A++; else c.leave++; });
    c.present = c.P + c.L;
    return c;
  };
  const N = students.length;
  const t = tally(todayISO);
  const y = tally(isoDate(addDays(today, -1)));
  const unmarked = Math.max(0, N - t.marked);
  const corrections = Object.values(byDate[todayISO] || {}).filter((r) => r.checkIn && !r.checkOut).length;

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const series = days.map((d) => {
    const c = tally(isoDate(d));
    return c.marked && N ? Math.round((c.present / N) * 1000) / 10 : null;
  });
  const todayPct = N ? (t.present / N) * 100 : 0;
  const yPct = N && y.marked ? (y.present / N) * 100 : null;
  const delta = yPct === null ? null : todayPct - yPct;

  const todayMap = byDate[todayISO] || {};
  const presentNames = students.filter((s) => ['P', 'L'].includes(todayMap[s.id]?.status)).map((s) => s.name);

  /* ── stat cards ── */
  const diff = (a, b, word) => {
    const d = a - b;
    if (!y.marked) return 'No data from yesterday';
    if (d === 0) return `Same as yesterday`;
    return `${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} ${word} than yesterday`;
  };
  mount($('#stats', root), html`<div class="stats">
    ${StatCard({ label: 'Here & making things happen', value: t.present, suffix: `/ ${N} students`, note: diff(t.present, y.present, 'check-ins'), noteIcon: t.present >= y.present ? 'arrow-up' : 'arrow-down', noteUp: true, tone: 'lavender', wide: true, avatars: presentNames.slice(0, 4) })}
    ${StatCard({ label: 'A little late', value: pad2(t.L), icon: 'clock', note: diff(t.L, y.L, ''), tone: 'peach' })}
    ${StatCard({ label: 'Taking time off', value: pad2(t.leave), icon: 'calendar', note: 'Rested students learn better', tone: 'mint' })}
    ${StatCard({ label: 'Absent / not marked', value: pad2(t.A + unmarked), icon: 'users', note: t.A + unmarked ? 'Let’s check in with them' : 'Everyone’s accounted for', tone: 'pink' })}
  </div>`);

  /* ── right column ── */
  const secPct = classes.map((c) => {
    const ids = students.filter((s) => s.cls === c);
    const p = ids.filter((s) => ['P', 'L'].includes(todayMap[s.id]?.status)).length;
    return { c, pct: ids.length ? Math.round((p / ids.length) * 100) : null };
  }).filter((x) => x.pct !== null);
  const GOAL = 90;
  mount($('#right', root), html`
    ${Card({
      title: 'Showing up together',
      actions: html`<a class="link-muted" href="#/reports">7 days ${Icon('arrow-up-right')}</a>`,
      body: html`
        <div class="big-pct">${pct1(todayPct)}%${delta !== null ? html`<span class="delta ${delta < 0 ? 'down' : ''}">${Icon(delta < 0 ? 'arrow-down' : 'arrow-up')}${pct1(Math.abs(delta))} pp</span>` : ''}</div>
        <div class="chart-box"><canvas id="week-chart" aria-label="Attendance over the last 7 days" role="img"></canvas></div>
        <p class="note">${N === 0 ? 'Add students to start tracking attendance.' : todayPct >= GOAL ? `Your class is above its ${GOAL}% attendance goal. Keep the good rhythm going.` : `You’re ${pct1(GOAL - todayPct)} pp away from the ${GOAL}% goal today. A few reminders could close the gap.`}</p>`,
    })}
    <section class="card purple">
      <div class="follow-title">A little follow-up ${Icon('sparkles')}</div>
      <p class="follow-text">${unmarked || corrections
        ? `${unmarked} student${unmarked === 1 ? '' : 's'} haven’t been marked${corrections ? `, and ${corrections} record${corrections === 1 ? '' : 's'} need${corrections === 1 ? 's' : ''} a quick correction` : ''}.`
        : 'Everything’s marked for today. Nice work.'}</p>
      <a class="btn btn-white" href="#/attendance?filter=unmarked"><span>Review attendance</span>${Icon('arrow-right')}</a>
    </section>
    <section class="card mint">
      <div class="mint-row">
        <span class="mint-icon">${Icon('users-round')}</span>
        <div>
          <div class="mint-title">${sectionsTitle(secPct.length)}</div>
          <div class="mint-sub">${secPct.length ? secPct.map((s) => `${s.c} ${s.pct}%`).join(' · ') : 'Add a class to see per-section numbers.'}</div>
        </div>
      </div>
    </section>
  `);
  weekBars($('#week-chart', root), {
    labels: days.map((d, i) => (i === 6 ? 'Today' : fmtDow(d))),
    values: series,
  });

  /* ── students card ── */
  const state = { view: 'list', q: '', section: '', subject: '', page: 1 };
  let monthLoaded = from <= isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const left = $('#left', root);
  mount(left, Card({
    title: 'Your students, at a glance',
    sub: `Today’s attendance · ${fmtShort(today)} · All times local`,
    actions: html`<div id="view-tabs"></div>`,
    body: html`
      <div class="row" style="margin-bottom:16px" id="toolbar">
        <label class="search">${Icon('search')}<span class="sr-only">Search students</span><input class="input" type="search" placeholder="Search students…" data-q></label>
        <span class="spacer"></span>
        <select class="select" style="width:auto;min-width:150px" data-filter="section" aria-label="Section">
          <option value="">All sections</option>${classes.map((c) => html`<option>${c}</option>`)}
        </select>
        <select class="select" style="width:auto;min-width:160px" data-filter="subject" aria-label="Subject">
          <option value="">All subjects</option>${subjects.map((s) => html`<option value="${s.code}">${s.short || s.code} · ${s.name}</option>`)}
        </select>
      </div>
      <div id="view"></div>`,
  }));

  const filtered = () => {
    const q = state.q.trim().toLowerCase();
    return students.filter((s) =>
      (!state.section || s.cls === state.section) &&
      (!state.subject || sectionSubjects[s.cls]?.has(state.subject)) &&
      (!q || s.name.toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q)));
  };

  function renderView() {
    mount($('#view-tabs', left), Tabs([{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }], state.view, { name: 'view', tone: 'on-white' }));
    $('#toolbar', left).style.display = state.view === 'list' ? '' : 'none';
    const view = $('#view', left);
    if (state.view === 'calendar') {
      if (monthLoaded) return mount(view, calendar());
      mount(view, Skeleton.block(360));
      // The dashboard only loads 7 days; fetch the rest of the month on first open.
      const first = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
      svc.getAttendance({ from: first, to: todayISO }).then((recs) => {
        recs.forEach((a) => { (byDate[a.date] ||= {})[a.sid] = a; });
        monthLoaded = true;
        if (!ctx.isStale() && state.view === 'calendar') mount(view, calendar());
      }).catch((e) => toast(e.message, { error: true }));
      return;
    }
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    const slice = rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    mount(view, html`
      ${N === 0 ? EmptyState('No students yet', 'Add students from the Students tab to see them here.', 'user-plus') : DataTable({
        rows: slice,
        empty: 'No students match these filters',
        emptyIcon: 'search-x',
        columns: [
          { label: 'Student', render: (s) => PersonCell(s.name, s.roll, s.email || s.name) },
          { label: 'Section', render: (s) => s.cls },
          { label: 'Check-in', render: (s) => todayMap[s.id]?.checkIn || '—' },
          { label: 'Check-out', render: (s) => todayMap[s.id]?.checkOut || '—' },
          { label: 'Hours', render: (s) => hours(todayMap[s.id]?.checkIn, todayMap[s.id]?.checkOut) || '—' },
          { label: 'Status', render: (s) => StatusPill(todayMap[s.id]?.status || 'none') },
          { label: '', render: (s) => html`<button class="row-action" data-open="${s.id}" aria-label="Open ${s.name}">${Icon('arrow-up-right')}</button>` },
        ],
      })}
      ${N ? Pager({ page: state.page, pages, shown: slice.length, total: rows.length === N ? N : `${rows.length} filtered`, noun: 'students' }) : ''}`);
  }

  function calendar() {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysIn = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(html`<div class="cal-day blank"></div>`);
    for (let d = 1; d <= daysIn; d++) {
      const iso = isoDate(new Date(today.getFullYear(), today.getMonth(), d));
      const c = byDate[iso] ? tally(iso) : null;
      const p = c && N ? (c.present / N) * 100 : null;
      const lv = p === null ? '' : p >= 90 ? 'lv-hi' : p >= 80 ? 'lv-mid' : 'lv-lo';
      cells.push(html`<div class="cal-day ${lv} ${iso === todayISO ? 'today' : ''}" title="${p === null ? 'No data' : `${pct1(p)}% present`}"><span class="d">${d}</span><span class="v">${p === null ? '' : `${Math.round(p)}%`}</span></div>`);
    }
    return html`
      <p class="section-label">${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · share of students present each day</p>
      <div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => html`<div class="cal-dow">${d}</div>`)}${cells}</div>
      <div class="legend"><span><i style="background:#BBE5C8"></i>90%+</span><span><i style="background:#F8D9A8"></i>80–89%</span><span><i style="background:#F6C3CC"></i>Below 80%</span><span><i style="background:var(--surface-3)"></i>No data</span></div>`;
  }

  function openStudent(id) {
    const s = students.find((x) => x.id === id);
    if (!s) return;
    const strip = days.map((d) => ({ d, r: byDate[isoDate(d)]?.[s.id] }));
    const marked = strip.filter((x) => x.r);
    const pres = marked.filter((x) => ['P', 'L', 'E', 'CL'].includes(x.r.status)).length;
    const r = todayMap[s.id];
    openModal({
      title: s.name,
      sub: `${s.roll} · ${s.cls}`,
      wide: true,
      body: html`
        <div class="row" style="gap:18px;margin-bottom:18px">
          ${Avatar(s.name, { size: 'xl', seed: s.email || s.name })}
          <dl class="kv">
            <dt>Email</dt><dd>${s.email || '—'}</dd>
            <dt>Today</dt><dd>${StatusPill(r?.status || 'none')} ${r?.checkIn ? html`<span class="c-muted" style="margin-left:6px">${r.checkIn} – ${r.checkOut || '…'}</span>` : ''}</dd>
            <dt>Last 7 days</dt><dd>${marked.length ? `${Math.round((pres / marked.length) * 100)}% (${pres}/${marked.length} days)` : 'No records'}</dd>
          </dl>
        </div>
        <p class="section-label">Last 7 days</p>
        <div class="grid-auto" style="grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px">
          ${strip.map((x) => html`<div class="card" style="padding:10px;text-align:center;border-radius:14px"><div class="c-muted" style="font-size:12px;margin-bottom:6px">${fmtDow(x.d)} ${x.d.getDate()}</div>${StatusPill(x.r?.status || 'none')}</div>`)}
        </div>`,
      footer: html`<a class="btn btn-outline" href="#/reports?student=${encodeURIComponent(s.id)}" data-close>${Icon('chart-column')}<span>Full report</span></a><a class="btn btn-primary" href="#/attendance?section=${encodeURIComponent(s.cls)}" data-close>${Icon('clipboard-check')}<span>Mark attendance</span></a>`,
    });
  }

  function exportCSV() {
    const rows = filtered();
    const csv = toCSV([
      ['Name', 'Roll', 'Section', 'Date', 'Status', 'Check-in', 'Check-out', 'Hours'],
      ...rows.map((s) => {
        const r = todayMap[s.id];
        return [s.name, s.roll, s.cls, todayISO, r ? (StatusPillLabel(r.status)) : 'Not marked', r?.checkIn || '', r?.checkOut || '', hours(r?.checkIn, r?.checkOut) || ''];
      }),
    ]);
    downloadFile(`attendance-${todayISO}.csv`, csv);
    toast(`Exported ${rows.length} rows`);
  }

  const offs = [
    on(root, 'click', '[data-view]', (_, el) => { state.view = el.dataset.view; renderView(); }),
    on(root, 'click', '[data-page]', (_, el) => { state.page = Number(el.dataset.page); renderView(); }),
    on(root, 'click', '[data-open]', (_, el) => openStudent(el.dataset.open)),
    on(root, 'click', '[data-action="export"]', exportCSV),
    on(root, 'click', '[data-action="add"]', () => { location.hash = '#/attendance'; }),
    on(root, 'change', '[data-filter]', (_, el) => { state[el.dataset.filter] = el.value; state.page = 1; renderView(); }),
    on(root, 'input', '[data-q]', debounce((_, el) => { state.q = el.value; state.page = 1; renderView(); }, 150)),
  ];
  renderView();
  return () => offs.forEach((f) => f());
}

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function sectionsTitle(n) {
  if (!n) return 'No sections yet';
  if (n === 1) return 'One section, connected.';
  return `All ${WORDS[n] || n} sections, connected.`;
}

const LABELS = { P: 'On time', L: 'Late', E: 'Earned leave', CL: 'Casual leave', A: 'Absent' };
export const StatusPillLabel = (s) => LABELS[s] || 'Not marked';
