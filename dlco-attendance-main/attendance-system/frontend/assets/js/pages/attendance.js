/* Attendance — mark / save / reset a day (original logic) + history. */
import { html, raw, mount, $, $$, on, isoDate, addDays, fmtLong, debounce } from '../core/html.js';
import * as svc from '../data/services.js';
import { Card, StatusPill, DataTable, Pager, PersonCell, Tabs, Button, Icon, Skeleton, EmptyState, confirmDialog, toast } from '../components.js';

const pctCls = (p) => (p === null || p === undefined ? 'c-muted' : p >= 75 ? 'c-ok' : p >= 50 ? 'c-late' : 'c-bad');

export default async function attendance(root, ctx) {
  const state = {
    tab: ctx.params.get('tab') === 'history' ? 'history' : 'mark',
    date: isoDate(),
    cls: ctx.params.get('section') || '',
    q: '',
    onlyUnmarked: ctx.params.get('filter') === 'unmarked',
    att: {},       // sid → status for the selected date (editable)
    saved: {},     // sid → status as stored
    pcts: {},
    hist: { from: isoDate(addDays(new Date(), -6)), to: isoDate(), sid: '', page: 1, rows: null },
  };
  let students = [];
  let classes = [];

  mount(root, html`
    <div class="page-head">
      <div>
        <p class="page-date">${fmtLong(new Date())}</p>
        <h1 class="page-title">Attendance</h1>
        <p class="page-sub">Mark today’s class, fix a past day, or look back through the record.</p>
      </div>
      <div id="tabs"></div>
    </div>
    <div id="body">${Card({ body: Skeleton.rows(8) })}</div>`);

  [students, classes] = await Promise.all([svc.listStudents(), svc.listClasses()]);
  if (ctx.isStale()) return;

  const paintTabs = () => mount($('#tabs', root), Tabs([
    { value: 'mark', label: 'Mark attendance', icon: 'clipboard-check' },
    { value: 'history', label: 'History', icon: 'history' },
  ], state.tab, { name: 'tab', tone: 'on-white' }));

  /* ── MARK ── */
  async function loadDay() {
    const body = $('#mark-list', root);
    if (body) mount(body, Skeleton.rows(8));
    const [recs, report] = await Promise.all([
      svc.getAttendance({ date: state.date }),
      svc.getReport().catch(() => []),
    ]);
    state.saved = {}; state.att = {};
    recs.forEach((r) => { state.saved[r.sid] = r.status; state.att[r.sid] = r.status; });
    state.pcts = {};
    report.forEach((r) => { state.pcts[r.id] = r.attendancePct; });
    paintList();
  }

  const scoped = () => (state.cls ? students.filter((s) => s.cls === state.cls) : students);
  const dirtyCount = () => scoped().filter((s) => state.att[s.id] && state.att[s.id] !== state.saved[s.id]).length;

  function paintMark() {
    mount($('#body', root), html`
      <div class="card" style="margin-bottom:16px">
        <div class="row" style="align-items:flex-end">
          <div class="field" style="width:170px"><label for="m-date">Date</label><input id="m-date" class="input" type="date" value="${state.date}" max="${isoDate()}" data-m="date"></div>
          <div class="field" style="width:190px"><label for="m-cls">Class / section</label>
            <select id="m-cls" class="select" data-m="cls"><option value="">All students</option>${classes.map((c) => html`<option ${c === state.cls ? raw('selected') : ''}>${c}</option>`)}</select></div>
          <div class="field" style="flex:1;min-width:200px"><label for="m-q">Find</label>
            <label class="search" style="max-width:none">${Icon('search')}<input id="m-q" class="input" type="search" placeholder="Name or roll number" value="${state.q}" data-m="q"></label></div>
        </div>
        <div class="row" style="margin-top:14px">
          <label class="row" style="gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" data-m="unmarked" ${state.onlyUnmarked ? raw('checked') : ''}> Only show unmarked</label>
          <span class="spacer"></span>
          ${Button('All present', { variant: 'soft', size: 'btn-sm', icon: 'check-check', action: 'all-present' })}
          ${Button('Reset day', { variant: 'danger', size: 'btn-sm', icon: 'rotate-ccw', action: 'reset' })}
          ${Button('Save attendance', { variant: 'primary', icon: 'save', action: 'save' })}
        </div>
      </div>
      <div class="card"><div id="mark-summary" class="row" style="margin-bottom:8px"></div><div id="mark-list">${Skeleton.rows(8)}</div></div>`);
  }

  function paintList() {
    const list = $('#mark-list', root);
    if (!list) return;
    const q = state.q.trim().toLowerCase();
    const pool = scoped();
    const rows = pool.filter((s) =>
      (!q || s.name.toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q)) &&
      (!state.onlyUnmarked || !state.att[s.id]));
    const marked = pool.filter((s) => state.att[s.id]).length;
    const dirty = dirtyCount();
    mount($('#mark-summary', root), html`
      <span class="pill pill-none">${marked} / ${pool.length} marked</span>
      ${dirty ? html`<span class="pill pill-late">${dirty} unsaved change${dirty === 1 ? '' : 's'}</span>` : ''}
      <span class="spacer"></span>
      <span class="legend" style="margin:0"><span><i style="background:var(--ok-fg)"></i>P = Present</span><span><i style="background:var(--bad-fg)"></i>A = Absent</span><span><i style="background:var(--late-fg)"></i>L = Late</span></span>`);
    if (!students.length) return mount(list, EmptyState('No students found', 'Add students in the Students tab.', 'user-plus'));
    if (!rows.length) return mount(list, EmptyState(state.onlyUnmarked ? 'Everyone in this view is marked' : 'No students match', '', state.onlyUnmarked ? 'party-popper' : 'search-x'));
    mount(list, html`${rows.map((s) => {
      const sel = state.att[s.id];
      const p = state.pcts[s.id];
      return html`<div class="mark-row" data-sid="${s.id}">
        ${PersonCell(s.name, `${s.roll} · ${s.cls}`, s.email || s.name)}
        ${sel === 'E' || sel === 'CL' ? StatusPill(sel) : ''}
        <div class="mark-btns" role="group" aria-label="Status for ${s.name}">
          ${['P', 'A', 'L'].map((st) => html`<button class="mark-btn ${st} ${sel === st ? 'sel' : ''}" data-set="${st}" aria-pressed="${sel === st}" title="${{ P: 'Present', A: 'Absent', L: 'Late' }[st]}">${st}</button>`)}
        </div>
        <span class="pct-tag ${pctCls(p)}">${p !== null && p !== undefined ? `${p}%` : '—'}</span>
      </div>`;
    })}`);
  }

  async function save() {
    const records = Object.entries(state.att).filter(([sid, s]) => s && scoped().some((x) => x.id === sid)).map(([sid, status]) => ({ sid, status }));
    if (!state.date) return toast('Select a date first', { error: true });
    if (!records.length) return toast('Mark at least one student', { error: true });
    try {
      await svc.saveAttendance(state.date, records);
      toast(`Saved ${records.length} records for ${state.date}`);
      await loadDay();
    } catch (e) { toast(e.message, { error: true }); }
  }

  async function reset() {
    const scope = state.cls ? `for ${state.cls} on ${state.date}` : `for everyone on ${state.date}`;
    const ok = await confirmDialog({ title: 'Reset this day?', message: `This removes all attendance ${scope}. It can’t be undone.`, confirmLabel: 'Reset day', danger: true });
    if (!ok) return;
    try {
      await svc.resetAttendance(state.date, state.cls || undefined);
      toast(`Attendance reset ${scope}`);
      await loadDay();
    } catch (e) { toast(e.message, { error: true }); }
  }

  /* ── HISTORY ── */
  function paintHistory() {
    const h = state.hist;
    mount($('#body', root), html`
      <div class="card" style="margin-bottom:16px">
        <div class="row" style="align-items:flex-end">
          <div class="field" style="width:170px"><label for="h-from">From</label><input id="h-from" class="input" type="date" value="${h.from}" data-h="from"></div>
          <div class="field" style="width:170px"><label for="h-to">To</label><input id="h-to" class="input" type="date" value="${h.to}" data-h="to"></div>
          <div class="field" style="flex:1;min-width:200px"><label for="h-sid">Student</label>
            <select id="h-sid" class="select" data-h="sid"><option value="">All students</option>${students.map((s) => html`<option value="${s.id}" ${s.id === h.sid ? raw('selected') : ''}>${s.name} · ${s.roll}</option>`)}</select></div>
          ${Button('Filter', { variant: 'primary', icon: 'filter', action: 'hist-load' })}
        </div>
      </div>
      <div class="card" id="hist">${Skeleton.rows(8)}</div>`);
    loadHistory();
  }

  async function loadHistory() {
    const h = state.hist;
    try {
      h.rows = await svc.getAttendance({ from: h.from || undefined, to: h.to || undefined, sid: h.sid || undefined });
      h.page = 1;
      paintHistTable();
    } catch (e) { toast(e.message, { error: true }); }
  }

  function paintHistTable() {
    const h = state.hist;
    const map = Object.fromEntries(students.map((s) => [s.id, s]));
    const per = 15;
    const pages = Math.max(1, Math.ceil(h.rows.length / per));
    const slice = h.rows.slice((h.page - 1) * per, h.page * per);
    mount($('#hist', root), html`
      ${DataTable({
        rows: slice,
        empty: 'No records for this filter',
        emptyIcon: 'calendar-x',
        columns: [
          { label: 'Date', render: (r) => r.date },
          { label: 'Student', render: (r) => { const s = map[r.sid] || { name: 'Unknown', roll: '—' }; return PersonCell(s.name, s.roll, s.email || s.name); } },
          { label: 'Class', render: (r) => map[r.sid]?.cls || '—' },
          { label: 'Status', render: (r) => StatusPill(r.status, { E: 'Earned leave', CL: 'Casual leave' }[r.status]) },
        ],
      })}
      ${h.rows.length ? Pager({ page: h.page, pages, shown: slice.length, total: h.rows.length, noun: 'records' }) : ''}`);
  }

  function paint() {
    paintTabs();
    if (state.tab === 'mark') { paintMark(); loadDay(); } else paintHistory();
  }

  const offs = [
    on(root, 'click', '[data-tab]', (_, el) => { state.tab = el.dataset.tab; paint(); }),
    on(root, 'click', '[data-set]', (_, el) => {
      const sid = el.closest('[data-sid]').dataset.sid;
      state.att[sid] = el.dataset.set;
      const row = el.closest('.mark-row');
      $$('.mark-btn', row).forEach((b) => { const on2 = b === el; b.classList.toggle('sel', on2); b.setAttribute('aria-pressed', on2); });
      if (state.onlyUnmarked) setTimeout(paintList, 250); else paintList();
    }),
    on(root, 'click', '[data-action="all-present"]', () => { scoped().forEach((s) => { if (!state.att[s.id]) state.att[s.id] = 'P'; }); paintList(); toast('Marked everyone remaining as present — remember to save'); }),
    on(root, 'click', '[data-action="save"]', save),
    on(root, 'click', '[data-action="reset"]', reset),
    on(root, 'change', '[data-m="date"]', (_, el) => { state.date = el.value; loadDay(); }),
    on(root, 'change', '[data-m="cls"]', (_, el) => { state.cls = el.value; paintList(); }),
    on(root, 'change', '[data-m="unmarked"]', (_, el) => { state.onlyUnmarked = el.checked; paintList(); }),
    on(root, 'input', '[data-m="q"]', debounce((_, el) => { state.q = el.value; paintList(); }, 150)),
    on(root, 'change', '[data-h]', (_, el) => { state.hist[el.dataset.h] = el.value; }),
    on(root, 'click', '[data-action="hist-load"]', loadHistory),
    on(root, 'click', '#hist [data-page]', (_, el) => { state.hist.page = Number(el.dataset.page); paintHistTable(); }),
  ];
  const warn = (e) => { if (dirtyCount()) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);

  paint();
  return () => { offs.forEach((f) => f()); window.removeEventListener('beforeunload', warn); };
}
