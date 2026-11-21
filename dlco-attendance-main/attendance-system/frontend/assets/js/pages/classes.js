/* Classes — sections (existing API), subjects and timetable management. */
import { html, raw, mount, $, on, isoDate } from '../core/html.js';
import * as svc from '../data/services.js';
import { Card, Button, Icon, Skeleton, EmptyState, openModal, confirmDialog, toast } from '../components.js';
import { TimetableGrid } from './timetable.js';

const TONES = ['lavender', 'peach', 'mint', 'pink'];
const PALETTE = ['#6D28D9', '#F59E0B', '#10B981', '#EC4899', '#3B82F6', '#64748B', '#EF4444', '#14B8A6'];

export default async function classesPage(root, ctx) {
  let classes = [], students = [], subjects = [], today = [];
  let ttClass = '';

  mount(root, html`
    <div class="page-head">
      <div>
        <h1 class="page-title">Classes</h1>
        <p class="page-sub">Sections, the subjects they take, and when they meet.</p>
      </div>
    </div>
    <div class="stack">
      ${Card({
        title: 'Sections',
        sub: 'Each section is a class on the roster.',
        actions: html`<form class="row" style="gap:8px" data-add-class><input class="input" style="width:180px" name="name" placeholder="e.g. CSE-E" aria-label="New class name" maxlength="40"><button class="btn btn-primary" type="submit">${Icon('plus')}<span>Add class</span></button></form>`,
        body: html`<div id="sections">${Skeleton.block(140)}</div>`,
      })}
      ${Card({
        title: 'Subjects',
        sub: svc.isMock() ? 'Demo subjects' : 'Stored on this device until a subjects API exists.',
        actions: Button('Add subject', { variant: 'soft', icon: 'book-plus', action: 'add-subject' }),
        body: html`<div id="subjects">${Skeleton.block(120)}</div>`,
      })}
      ${Card({
        title: 'Timetable',
        sub: 'Click any period to set or clear it.',
        actions: html`<select class="select" style="width:auto;min-width:160px" data-tt-class aria-label="Section"></select>`,
        body: html`<div id="tt">${Skeleton.block(320)}</div>`,
      })}
    </div>`);

  async function load() {
    [classes, students, subjects, today] = await Promise.all([svc.listClasses(), svc.listStudents(), svc.listSubjects(), svc.getAttendance({ date: isoDate() })]);
    if (ctx.isStale()) return;
    if (!classes.includes(ttClass)) ttClass = classes[0] || '';
    paintSections(); paintSubjects(); paintTT();
  }

  function paintSections() {
    const todayMap = Object.fromEntries(today.map((r) => [r.sid, r.status]));
    mount($('#sections', root), classes.length ? html`<div class="grid-auto">${classes.map((c, i) => {
      const ids = students.filter((s) => s.cls === c);
      const p = ids.filter((s) => ['P', 'L'].includes(todayMap[s.id])).length;
      const pct = ids.length ? Math.round((p / ids.length) * 100) : null;
      return html`<article class="tile card ${TONES[i % 4]}">
        <div class="tile-top">
          <span class="tile-icon">${Icon('school')}</span>
          <button class="row-action" data-del-class="${c}" aria-label="Delete ${c}">${Icon('trash-2')}</button>
        </div>
        <div><div class="tile-name">${c}</div><div class="tile-meta">${ids.length} student${ids.length === 1 ? '' : 's'}</div></div>
        <div>
          <div class="row" style="justify-content:space-between;font-size:12.5px"><span class="tile-meta">Present today</span><b>${pct === null ? '—' : `${pct}%`}</b></div>
          <div class="bar" style="margin-top:6px;background:rgba(255,255,255,.6)"><span style="width:${pct || 0}%"></span></div>
        </div>
        <a class="link-muted" href="#/attendance?section=${encodeURIComponent(c)}">Mark attendance ${Icon('arrow-right')}</a>
      </article>`;
    })}</div>` : EmptyState('No classes yet', 'Add your first section above.', 'school'));
  }

  function paintSubjects() {
    mount($('#subjects', root), subjects.length ? html`<div class="grid-auto">${subjects.map((s) => html`
      <article class="tile card" style="box-shadow:none;background:var(--surface-2)">
        <div class="tile-top">
          <span class="tile-icon" style="background:${s.color}1F;color:${s.color}">${Icon('book-open')}</span>
          <div class="row" style="gap:2px">
            <button class="row-action" data-edit-subject="${s.code}" aria-label="Edit ${s.name}">${Icon('pencil')}</button>
            <button class="row-action" data-del-subject="${s.code}" aria-label="Delete ${s.name}">${Icon('trash-2')}</button>
          </div>
        </div>
        <div><div class="tile-name">${s.name}</div><div class="tile-meta">${s.code}${s.short ? ` · ${s.short}` : ''}</div></div>
        <div class="tile-meta row" style="gap:6px">${Icon('user-round')} ${s.teacher || 'No teacher assigned'}</div>
      </article>`)}</div>` : EmptyState('No subjects yet', 'Add a subject to start building timetables.', 'book-open'));
  }

  function paintTT() {
    const sel = $('[data-tt-class]', root);
    sel.innerHTML = String(classes.length ? html`${classes.map((c) => html`<option ${c === ttClass ? raw('selected') : ''}>${c}</option>`)}` : html`<option value="">No classes</option>`);
    if (!ttClass) return mount($('#tt', root), EmptyState('Add a class to build its timetable', '', 'calendar-days'));
    svc.getTimetable(ttClass).then((tt) => { if (!ctx.isStale()) mount($('#tt', root), TimetableGrid(tt, subjects, { editable: true })); });
  }

  function subjectModal(existing) {
    let color = existing?.color || PALETTE[subjects.length % PALETTE.length];
    const m = openModal({
      title: existing ? 'Edit subject' : 'Add a subject',
      body: html`<form class="form-grid" novalidate id="subj-form">
        <div class="field"><label for="s-code">Code</label><input id="s-code" class="input" name="code" value="${existing?.code || ''}" placeholder="CS206" ${existing ? raw('readonly') : ''}><span class="field-error" data-err="code"></span></div>
        <div class="field"><label for="s-short">Short name</label><input id="s-short" class="input" name="short" value="${existing?.short || ''}" placeholder="ML"></div>
        <div class="field full"><label for="s-name">Subject name</label><input id="s-name" class="input" name="name" value="${existing?.name || ''}" placeholder="Machine Learning"><span class="field-error" data-err="name"></span></div>
        <div class="field full"><label for="s-teacher">Teacher</label><input id="s-teacher" class="input" name="teacher" value="${existing?.teacher || ''}" placeholder="Dr. A. Kumar"></div>
        <div class="field full"><label>Colour</label><div class="row" style="gap:8px" data-colors>${PALETTE.map((c) => html`<button type="button" data-color="${c}" aria-label="Colour ${c}" style="width:28px;height:28px;border-radius:50%;background:${c};box-shadow:${c === color ? '0 0 0 3px #fff, 0 0 0 5px ' + c : 'none'}"></button>`)}</div></div>
        <button type="submit" hidden></button>
      </form>`,
      footer: html`${Button('Cancel', { variant: 'ghost', attrs: 'data-close' })}${Button(existing ? 'Save' : 'Add subject', { variant: 'primary', attrs: 'data-submit' })}`,
    });
    const form = $('#subj-form', m.el);
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      color = b.dataset.color;
      form.querySelectorAll('[data-color]').forEach((x) => { x.style.boxShadow = x === b ? `0 0 0 3px #fff, 0 0 0 5px ${color}` : 'none'; });
    });
    const submit = async () => {
      const d = Object.fromEntries(new FormData(form));
      const code = d.code.trim().toUpperCase();
      const errs = { code: !code ? 'Code is required' : !existing && subjects.some((s) => s.code === code) ? 'That code already exists' : '', name: d.name.trim() ? '' : 'Name is required' };
      Object.entries(errs).forEach(([k, v]) => { $(`[data-err="${k}"]`, form).textContent = v; form.elements[k].classList.toggle('invalid', !!v); });
      if (errs.code || errs.name) return;
      await svc.saveSubject({ code, short: d.short.trim(), name: d.name.trim(), teacher: d.teacher.trim(), color });
      m.close(); toast(existing ? 'Subject updated' : 'Subject added'); load();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    $('[data-submit]', m.el).addEventListener('click', submit);
  }

  function slotModal(day, pi) {
    svc.getTimetable(ttClass).then((tt) => {
      const slot = tt[day][pi];
      const m = openModal({
        title: `${ttClass} · ${day} ${svc.PERIODS[pi]}`,
        body: html`<form class="form-grid" id="slot-form">
          <div class="field full"><label for="sl-sub">Subject</label><select id="sl-sub" class="select" name="code"><option value="">Free period</option>${subjects.map((s) => html`<option value="${s.code}" ${slot?.code === s.code ? raw('selected') : ''}>${s.short || s.code} · ${s.name}</option>`)}</select></div>
          <div class="field full"><label for="sl-room">Room</label><input id="sl-room" class="input" name="room" value="${slot?.room || ''}" placeholder="LH-101"></div>
          <button type="submit" hidden></button>
        </form>`,
        footer: html`${slot ? Button('Clear', { variant: 'danger', attrs: 'data-clear' }) : ''}<span class="spacer"></span>${Button('Cancel', { variant: 'ghost', attrs: 'data-close' })}${Button('Save', { variant: 'primary', attrs: 'data-submit' })}`,
      });
      const form = $('#slot-form', m.el);
      const done = async (val) => { await svc.setTimetableSlot(ttClass, day, pi, val); m.close(); paintTT(); toast('Timetable updated'); };
      const submit = () => { const d = Object.fromEntries(new FormData(form)); done(d.code ? { code: d.code, room: d.room.trim() } : null); };
      form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
      $('[data-submit]', m.el).addEventListener('click', submit);
      $('[data-clear]', m.el)?.addEventListener('click', () => done(null));
    });
  }

  const offs = [
    on(root, 'submit', '[data-add-class]', async (e, form) => {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) { form.elements.name.classList.add('invalid'); form.elements.name.focus(); return toast('Enter a class name', { error: true }); }
      try { await svc.addClass(name); form.reset(); form.elements.name.classList.remove('invalid'); toast(`Class “${name}” added`); ttClass = ttClass || name; load(); }
      catch (err) { toast(err.message, { error: true }); }
    }),
    on(root, 'click', '[data-del-class]', async (_, el) => {
      const c = el.dataset.delClass;
      const ok = await confirmDialog({ title: `Delete ${c}?`, message: 'Classes can only be deleted once they have no students.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      try { await svc.deleteClass(c); toast('Class removed'); load(); } catch (err) { toast(err.message, { error: true }); }
    }),
    on(root, 'click', '[data-action="add-subject"]', () => subjectModal()),
    on(root, 'click', '[data-edit-subject]', (_, el) => subjectModal(subjects.find((s) => s.code === el.dataset.editSubject))),
    on(root, 'click', '[data-del-subject]', async (_, el) => {
      const s = subjects.find((x) => x.code === el.dataset.delSubject);
      const ok = await confirmDialog({ title: `Delete ${s.name}?`, message: 'Timetable periods using it will show as unknown.', confirmLabel: 'Delete', danger: true });
      if (ok) { await svc.deleteSubject(s.code); toast('Subject deleted'); load(); }
    }),
    on(root, 'change', '[data-tt-class]', (_, el) => { ttClass = el.value; paintTT(); }),
    on(root, 'click', '[data-slot]', (_, el) => { const [d, p] = el.dataset.slot.split('|'); slotModal(d, Number(p)); }),
  ];
  await load();
  return () => offs.forEach((f) => f());
}
