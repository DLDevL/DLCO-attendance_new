/* Student — Apply Leave: request form + history. */
import { html, raw, mount, $, on, isoDate, parseISO, fmtShort } from '../core/html.js';
import * as svc from '../data/services.js';
import { Card, StatusPill, Button, Icon, Skeleton, EmptyState, toast, confirmDialog } from '../components.js';

const TYPES = ['Medical', 'Personal', 'Family function', 'Sports / OD', 'Hackathon / OD', 'Other'];

export default async function applyLeave(root, ctx) {
  const me = svc.me();
  mount(root, html`
    <div class="page-head"><div>
      <h1 class="page-title">Apply for leave</h1>
      <p class="page-sub">Tell your teacher when and why. You’ll see the decision here.</p>
    </div></div>
    <div class="grid-main">
      ${Card({
        title: 'New request',
        sub: svc.isMock() ? 'Demo mode — requests are saved in this browser' : svc.linkedToServer() ? 'Goes straight to your teacher’s Leave Requests page' : 'Saved in this browser only (server not set up yet)',
        body: me ? html`<form id="leave-form" class="form-grid" novalidate>
          <div class="field full"><label for="l-type">Type of leave</label><select id="l-type" class="select" name="type"><option value="">Choose a type</option>${TYPES.map((t) => html`<option>${t}</option>`)}</select><span class="field-error" data-err="type"></span></div>
          <div class="field"><label for="l-from">From</label><input id="l-from" class="input" type="date" name="from" min="${isoDate()}"><span class="field-error" data-err="from"></span></div>
          <div class="field"><label for="l-to">To</label><input id="l-to" class="input" type="date" name="to" min="${isoDate()}"><span class="field-error" data-err="to"></span></div>
          <div class="field full"><label for="l-reason">Reason</label><textarea id="l-reason" class="textarea" name="reason" maxlength="500" placeholder="A sentence or two is enough."></textarea><span class="field-error" data-err="reason"></span></div>
          <div class="full row" style="justify-content:flex-end">${Button('Submit request', { variant: 'primary', icon: 'send', type: 'submit' })}</div>
        </form>` : EmptyState('Your account isn’t linked to a student record yet', 'Ask your teacher to add you with the email you signed up with.', 'link-2-off'),
      })}
      <div id="history">${Skeleton.block(260)}</div>
    </div>`);

  async function loadHistory() {
    const reqs = await svc.listLeaveRequests();
    if (ctx.isStale()) return;
    const decided = reqs.filter((r) => r.status !== 'pending').length;
    mount($('#history', root), Card({
      title: 'Your requests',
      actions: decided ? Button('Clear history', { variant: 'ghost', size: 'btn-sm', icon: 'trash-2', action: 'clear-history' }) : '',
      body: reqs.length ? html`<div>${reqs.map((r) => html`<div class="leave-item" style="padding:12px 0">
        <div class="leave-main" style="min-width:0">
          <div class="row" style="justify-content:space-between;gap:8px"><b>${r.type}</b><span class="row" style="gap:6px;flex-wrap:nowrap">${StatusPill(r.status)}<button class="row-action" data-del-req="${r.id}" data-pending="${r.status === 'pending' ? '1' : ''}" aria-label="${r.status === 'pending' ? 'Withdraw' : 'Remove'} this request" title="${r.status === 'pending' ? 'Withdraw request' : 'Remove from history'}">${Icon(r.status === 'pending' ? 'undo-2' : 'trash-2')}</button></span></div>
          <div class="leave-meta">${fmtShort(parseISO(r.from))}${r.to !== r.from ? ` – ${fmtShort(parseISO(r.to))}` : ''} · ${r.days} day${r.days === 1 ? '' : 's'}</div>
          <p class="leave-reason">${r.reason}</p>
        </div></div>`)}</div>` : EmptyState('No requests yet', 'Submitted requests will show up here.', 'inbox'),
    }));
  }

  const offs = [
    on(root, 'click', '[data-del-req]', async (_, el) => {
      const pending = !!el.dataset.pending;
      const ok = await confirmDialog({
        title: pending ? 'Withdraw this request?' : 'Remove this request?',
        message: pending ? 'Your teacher won’t see it any more.' : 'It will be removed from your history and your teacher’s list.',
        confirmLabel: pending ? 'Withdraw' : 'Remove', danger: true,
      });
      if (!ok) return;
      try { await svc.deleteLeaveRequest(el.dataset.delReq); toast(pending ? 'Request withdrawn' : 'Request removed'); loadHistory(); }
      catch (e) { toast(e.message, { error: true }); }
    }),
    on(root, 'click', '[data-action="clear-history"]', async () => {
      const ok = await confirmDialog({ title: 'Clear request history?', message: 'All approved and rejected requests will be removed. Pending requests stay.', confirmLabel: 'Clear history', danger: true });
      if (!ok) return;
      try { const n = await svc.clearLeaveHistory(); toast(`Removed ${n} request${n === 1 ? '' : 's'}`); loadHistory(); }
      catch (e) { toast(e.message, { error: true }); }
    }),
  ];

  const form = $('#leave-form', root);
  if (form) {
    const setErr = (k, m) => { $(`[data-err="${k}"]`, form).textContent = m || ''; form.elements[k].classList.toggle('invalid', !!m); };
    form.addEventListener('change', (e) => { if (e.target.name === 'from' && !form.elements.to.value) form.elements.to.value = e.target.value; form.elements.to.min = form.elements.from.value || isoDate(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      const errs = {
        type: d.type ? '' : 'Choose a type',
        from: d.from ? '' : 'Pick a start date',
        to: !d.to ? 'Pick an end date' : d.from && d.to < d.from ? 'End date is before the start' : '',
        reason: d.reason.trim().length >= 5 ? '' : 'Add a short reason',
      };
      Object.entries(errs).forEach(([k, v]) => setErr(k, v));
      if (Object.values(errs).some(Boolean)) return form.querySelector('.invalid')?.focus();
      try {
        await svc.createLeaveRequest({ type: d.type, from: d.from, to: d.to, reason: d.reason.trim() });
        form.reset();
        toast('Request sent to your teacher');
        loadHistory();
      } catch (err) { toast(err.message, { error: true }); }
    });
  }
  await loadHistory();
  return () => offs.forEach((f) => f());
}
