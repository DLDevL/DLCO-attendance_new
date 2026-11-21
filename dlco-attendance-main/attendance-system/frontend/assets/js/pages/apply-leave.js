/* Student — Apply Leave: request form + history. */
import { html, raw, mount, $, on, isoDate, parseISO, fmtShort } from '../core/html.js';
import * as svc from '../data/services.js';
import { Card, StatusPill, Button, Icon, Skeleton, EmptyState, toast } from '../components.js';

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
        sub: svc.isMock() ? 'Demo mode — requests are saved in this browser' : 'Saved in this browser until a leave-request API exists',
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
    mount($('#history', root), Card({
      title: 'Your requests',
      body: reqs.length ? html`<div>${reqs.map((r) => html`<div class="leave-item" style="padding:12px 0">
        <div class="leave-main" style="min-width:0">
          <div class="row" style="justify-content:space-between"><b>${r.type}</b>${StatusPill(r.status)}</div>
          <div class="leave-meta">${fmtShort(parseISO(r.from))}${r.to !== r.from ? ` – ${fmtShort(parseISO(r.to))}` : ''} · ${r.days} day${r.days === 1 ? '' : 's'}</div>
          <p class="leave-reason">${r.reason}</p>
        </div></div>`)}</div>` : EmptyState('No requests yet', 'Submitted requests will show up here.', 'inbox'),
    }));
  }

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
}
