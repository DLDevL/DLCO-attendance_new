/* Leave Requests — approve/reject requests, plus the original EL/CL balance tools. */
import { html, raw, mount, $, on, parseISO, fmtShort } from '../core/html.js';
import * as svc from '../data/services.js';
import { Card, StatusPill, DataTable, Pager, PersonCell, Tabs, Button, Icon, Skeleton, EmptyState, Avatar, toast } from '../components.js';

const fmtRange = (a, b) => (a === b ? fmtShort(parseISO(a)) : `${fmtShort(parseISO(a))} – ${fmtShort(parseISO(b))}`);

export default async function leavesPage(root, ctx) {
  const state = { tab: 'requests', filter: 'pending', cls: '', page: 1 };
  let students = [], classes = [], requests = [], balances = {};
  const drafts = {}; // sid → { el, cl } typed but not yet saved
  const byId = () => Object.fromEntries(students.map((s) => [s.id, s]));

  mount(root, html`
    <div class="page-head">
      <div>
        <h1 class="page-title">Leave requests</h1>
        <p class="page-sub">Review what’s waiting, and keep each student’s leave balance honest.</p>
      </div>
      <div id="tabs"></div>
    </div>
    <div id="body">${Card({ body: Skeleton.rows(6) })}</div>`);

  [students, classes] = await Promise.all([svc.listStudents(), svc.listClasses()]);
  if (ctx.isStale()) return;

  /* ── requests ── */
  async function loadRequests() {
    requests = await svc.listLeaveRequests();
    if (!ctx.isStale()) paintRequests();
  }

  function paintRequests() {
    const counts = { all: requests.length, pending: 0, approved: 0, rejected: 0 };
    requests.forEach((r) => counts[r.status]++);
    const list = requests.filter((r) => state.filter === 'all' || r.status === state.filter);
    const map = byId();
    mount($('#body', root), Card({
      title: 'Requests',
      sub: svc.isMock() ? 'Demo requests' : 'Requests students submit from this device (no leave-request API yet).',
      actions: Tabs(['pending', 'approved', 'rejected', 'all'].map((v) => ({ value: v, label: `${v[0].toUpperCase() + v.slice(1)} · ${counts[v]}` })), state.filter, { name: 'filter', tone: 'on-white' }),
      body: list.length ? html`<div>${list.map((r) => {
        const s = map[r.sid] || { name: 'Unknown student', roll: '—', cls: '—' };
        return html`<div class="leave-item">
          ${Avatar(s.name, { seed: s.email || s.name })}
          <div class="leave-main">
            <div class="row" style="gap:8px"><b>${s.name}</b><span class="leave-meta">${s.roll} · ${s.cls}</span></div>
            <div class="leave-meta row" style="gap:6px;margin-top:2px">${Icon('calendar')} ${fmtRange(r.from, r.to)} · ${r.days} day${r.days === 1 ? '' : 's'} · ${r.type}</div>
            <p class="leave-reason">${r.reason}</p>
          </div>
          ${StatusPill(r.status)}
          ${r.status === 'pending'
            ? html`<div class="row" style="gap:8px">${Button('Reject', { variant: 'danger', size: 'btn-sm', icon: 'x', attrs: `data-decide="rejected" data-id="${r.id}"` })}${Button('Approve', { variant: 'success', size: 'btn-sm', icon: 'check', attrs: `data-decide="approved" data-id="${r.id}"` })}</div>`
            : html`<button class="link-muted" data-decide="pending" data-id="${r.id}">${Icon('undo-2')} Undo</button>`}
        </div>`;
      })}</div>` : EmptyState(state.filter === 'pending' ? 'Nothing waiting for review' : 'No requests here', state.filter === 'pending' ? 'New requests from students will show up here.' : '', state.filter === 'pending' ? 'inbox' : 'list'),
    }));
  }

  /* ── balances (original EL/CL logic) ── */
  async function loadBalances() {
    mount($('#body', root), Card({ body: Skeleton.rows(8) }));
    balances = await svc.getLeaveBalances();
    if (!ctx.isStale()) paintBalances();
  }
  const getLeave = (sid) => balances[sid] || { el: 0, cl: 0, elUsed: 0, clUsed: 0 };

  function paintBalances() {
    const rows = state.cls ? students.filter((s) => s.cls === state.cls) : students;
    const per = 12;
    const pages = Math.max(1, Math.ceil(rows.length / per));
    state.page = Math.min(state.page, pages);
    const slice = rows.slice((state.page - 1) * per, state.page * per);
    const stepper = (s, type) => {
      const lv = getLeave(s.id);
      const used = (type === 'el' ? lv.elUsed : lv.clUsed) || 0;
      const total = type === 'el' ? lv.el : lv.cl;
      const left = Math.max(0, total - used);
      return html`<div class="row" style="gap:6px;flex-wrap:nowrap">
        <button class="row-action" data-undo="${type}" data-sid="${s.id}" ${used ? '' : raw('disabled')} aria-label="Undo one ${type.toUpperCase()}">${Icon('minus')}</button>
        <span style="min-width:62px;text-align:center"><b class="${left ? '' : 'c-bad'}">${left}</b><span class="c-muted"> / ${total} left</span></span>
        <button class="row-action" data-use="${type}" data-sid="${s.id}" ${left ? '' : raw('disabled')} aria-label="Use one ${type.toUpperCase()}">${Icon('plus')}</button>
      </div>`;
    };
    mount($('#body', root), Card({
      title: 'Leave balances',
      sub: 'Set each student’s Earned (EL) and Casual (CL) leave for the term. Used leave doesn’t count as absence.',
      actions: html`<div class="row"><select class="select" style="width:auto;min-width:150px" data-bal-cls aria-label="Section"><option value="">All sections</option>${classes.map((c) => html`<option ${c === state.cls ? raw('selected') : ''}>${c}</option>`)}</select>${Button('Save leave totals', { variant: 'primary', icon: 'save', action: 'save-totals' })}</div>`,
      body: html`${DataTable({
        rows: slice,
        empty: 'No students found. Add students first.',
        emptyIcon: 'users',
        columns: [
          { label: 'Student', render: (s) => PersonCell(s.name, `${s.roll} · ${s.cls}`, s.email || s.name) },
          { label: 'Total EL', render: (s) => html`<input class="input" type="number" min="0" max="365" style="width:76px;text-align:center" data-total="el" data-sid="${s.id}" value="${drafts[s.id]?.el ?? getLeave(s.id).el}" aria-label="Total EL for ${s.name}">` },
          { label: 'Total CL', render: (s) => html`<input class="input" type="number" min="0" max="365" style="width:76px;text-align:center" data-total="cl" data-sid="${s.id}" value="${drafts[s.id]?.cl ?? getLeave(s.id).cl}" aria-label="Total CL for ${s.name}">` },
          { label: 'Earned leave', render: (s) => stepper(s, 'el') },
          { label: 'Casual leave', render: (s) => stepper(s, 'cl') },
        ],
      })}${rows.length ? Pager({ page: state.page, pages, shown: slice.length, total: rows.length, noun: 'students' }) : ''}`,
    }));
  }

  async function changeUse(sid, type, delta) {
    const lv = { ...getLeave(sid) };
    const key = type === 'el' ? 'elUsed' : 'clUsed';
    const total = type === 'el' ? lv.el : lv.cl;
    const next = (lv[key] || 0) + delta;
    if (next < 0) return;
    if (next > total) return toast(total ? `No ${type === 'el' ? 'Earned' : 'Casual'} Leaves remaining` : `Set the ${type.toUpperCase()} total first`, { error: true });
    lv[key] = next;
    try {
      await svc.saveLeaveBalance(sid, lv);
      balances[sid] = lv;
      paintBalances();
      toast(delta > 0 ? `${type === 'el' ? 'Earned' : 'Casual'} leave used — ${total - next} remaining` : 'Leave undone');
    } catch (e) { toast('Failed to save leave: ' + e.message, { error: true }); }
  }

  async function saveTotals() {
    const sids = Object.keys(drafts);
    if (!sids.length) return toast('Change a total first, then save', { error: true });
    let count = 0;
    for (const sid of sids) {
      const cur = getLeave(sid);
      const d = drafts[sid];
      const next = { el: parseInt(d.el ?? cur.el, 10) || 0, cl: parseInt(d.cl ?? cur.cl, 10) || 0, elUsed: cur.elUsed || 0, clUsed: cur.clUsed || 0 };
      try { await svc.saveLeaveBalance(sid, next); balances[sid] = next; delete drafts[sid]; count++; } catch (e) { console.error('Save leave failed for', sid, e); }
    }
    toast(`Leave totals saved for ${count} student${count === 1 ? '' : 's'}`);
    paintBalances();
  }

  function paint() {
    mount($('#tabs', root), Tabs([{ value: 'requests', label: 'Requests', icon: 'inbox' }, { value: 'balances', label: 'Balances', icon: 'scale' }], state.tab, { name: 'tab', tone: 'on-white' }));
    if (state.tab === 'requests') { mount($('#body', root), Card({ body: Skeleton.rows(5) })); loadRequests(); } else loadBalances();
  }

  const offs = [
    on(root, 'click', '[data-tab]', (_, el) => { state.tab = el.dataset.tab; state.page = 1; paint(); }),
    on(root, 'click', '[data-filter]', (_, el) => { state.filter = el.dataset.filter; paintRequests(); }),
    on(root, 'click', '[data-decide]', async (_, el) => {
      const r = await svc.setLeaveRequestStatus(el.dataset.id, el.dataset.decide);
      const s = byId()[r.sid];
      toast(r.status === 'pending' ? 'Moved back to pending' : `${r.status === 'approved' ? 'Approved' : 'Rejected'} ${s ? s.name.split(' ')[0] + '’s' : 'the'} request`);
      loadRequests();
    }),
    on(root, 'click', '[data-use]', (_, el) => changeUse(el.dataset.sid, el.dataset.use, 1)),
    on(root, 'click', '[data-undo]', (_, el) => changeUse(el.dataset.sid, el.dataset.undo, -1)),
    on(root, 'change', '[data-bal-cls]', (_, el) => { state.cls = el.value; state.page = 1; paintBalances(); }),
    on(root, 'click', '[data-action="save-totals"]', saveTotals),
    on(root, 'input', '[data-total]', (_, el) => { (drafts[el.dataset.sid] ||= {})[el.dataset.total] = el.value; }),
    on(root, 'click', '[data-page]', (_, el) => { state.page = Number(el.dataset.page); paintBalances(); }),
  ];
  paint();
  return () => offs.forEach((f) => f());
}
