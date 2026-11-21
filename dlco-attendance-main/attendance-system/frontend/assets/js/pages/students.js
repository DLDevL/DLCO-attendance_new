/* Students — searchable table, add/edit modal, CSV import. */
import { html, raw, mount, $, on, debounce, parseCSV, toCSV, downloadFile } from '../core/html.js';
import * as svc from '../data/services.js';
import { Card, StatusPill, DataTable, Pager, PersonCell, Button, Icon, Skeleton, openModal, confirmDialog, toast } from '../components.js';

const PER = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function studentsPage(root, ctx) {
  const state = { q: '', cls: '', risk: '', page: 1 };
  let students = [], classes = [], report = {};

  mount(root, html`
    <div class="page-head">
      <div>
        <h1 class="page-title">Students</h1>
        <p class="page-sub">Everyone on the roster, with their attendance at a glance.</p>
      </div>
      <div class="page-actions">
        ${Button('Import CSV', { icon: 'upload', action: 'import' })}
        ${Button('Add student', { variant: 'primary', icon: 'user-plus', action: 'add' })}
      </div>
    </div>
    ${Card({
      body: html`
        <div class="row" style="margin-bottom:16px">
          <label class="search">${Icon('search')}<span class="sr-only">Search</span><input class="input" type="search" placeholder="Search name, roll or email…" data-q></label>
          <span class="spacer"></span>
          <select class="select" style="width:auto;min-width:150px" data-f="cls" aria-label="Section" id="f-cls"><option value="">All sections</option></select>
          <select class="select" style="width:auto;min-width:150px" data-f="risk" aria-label="Attendance">
            <option value="">Any attendance</option><option value="good">75% and above</option><option value="warning">50–74%</option><option value="low">Below 50%</option><option value="no-data">No data</option>
          </select>
        </div>
        <div id="table">${Skeleton.rows(10)}</div>`,
    })}`);

  async function load() {
    [students, classes] = await Promise.all([svc.listStudents(), svc.listClasses()]);
    const rep = await svc.getReport().catch(() => []);
    report = Object.fromEntries(rep.map((r) => [r.id, r]));
    if (ctx.isStale()) return;
    const sel = $('#f-cls', root);
    sel.innerHTML = String(html`<option value="">All sections</option>${classes.map((c) => html`<option ${c === state.cls ? raw('selected') : ''}>${c}</option>`)}`);
    paint();
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return students.filter((s) =>
      (!state.cls || s.cls === state.cls) &&
      (!state.risk || (report[s.id]?.status || 'no-data') === state.risk) &&
      (!q || [s.name, s.roll, s.email].some((v) => String(v || '').toLowerCase().includes(q))));
  }

  function paint() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PER));
    state.page = Math.min(state.page, pages);
    const slice = rows.slice((state.page - 1) * PER, state.page * PER);
    mount($('#table', root), html`
      ${DataTable({
        rows: slice,
        empty: students.length ? 'No students match these filters' : 'No students yet — add one or import a CSV',
        emptyIcon: students.length ? 'search-x' : 'user-plus',
        columns: [
          { label: 'Student', render: (s) => PersonCell(s.name, s.email || 'No login email', s.email || s.name) },
          { label: 'Roll no.', render: (s) => s.roll },
          { label: 'Section', render: (s) => s.cls },
          { label: 'Attendance', render: (s) => { const p = report[s.id]?.attendancePct; return p === null || p === undefined ? html`<span class="c-muted">—</span>` : html`<div style="min-width:110px"><div class="row" style="justify-content:space-between;gap:8px"><b style="font-size:12.5px">${p}%</b></div><div class="bar" style="margin-top:4px"><span style="width:${p}%;background:${p >= 75 ? 'var(--primary)' : p >= 50 ? '#F59E0B' : '#E11D48'}"></span></div></div>`; } },
          { label: 'Status', render: (s) => StatusPill(report[s.id]?.status || 'no-data') },
          { label: '', align: 'right', render: (s) => html`<div class="row" style="gap:4px;justify-content:flex-end;flex-wrap:nowrap">
              <button class="row-action" data-edit="${s.id}" aria-label="Edit ${s.name}">${Icon('pencil')}</button>
              <button class="row-action" data-del="${s.id}" aria-label="Remove ${s.name}">${Icon('trash-2')}</button></div>` },
        ],
      })}
      ${rows.length ? Pager({ page: state.page, pages, shown: slice.length, total: rows.length, noun: 'students' }) : ''}`);
  }

  /* ── add / edit modal ── */
  function studentModal(existing) {
    const v = { name: existing?.name || '', roll: existing?.roll || '', cls: existing?.cls || state.cls || '', email: existing?.email || '' };
    const m = openModal({
      title: existing ? 'Edit student' : 'Add a student',
      sub: existing ? `${existing.roll} · ${existing.cls}` : 'They’ll appear in attendance right away.',
      body: html`<form class="form-grid" id="stu-form" novalidate>
        <div class="field full"><label for="f-name">Full name</label><input id="f-name" class="input" name="name" value="${v.name}" placeholder="e.g. Priya Sharma"><span class="field-error" data-err="name"></span></div>
        <div class="field"><label for="f-roll">Roll number</label><input id="f-roll" class="input" name="roll" value="${v.roll}" placeholder="e.g. 22CS011"><span class="field-error" data-err="roll"></span></div>
        <div class="field"><label for="f-cls2">Class / section</label><select id="f-cls2" class="select" name="cls"><option value="">Select class</option>${classes.map((c) => html`<option ${c === v.cls ? raw('selected') : ''}>${c}</option>`)}</select><span class="field-error" data-err="cls"></span></div>
        <div class="field full"><label for="f-email">Login email <span class="c-muted" style="font-weight:400">(must match their sign-up email)</span></label><input id="f-email" class="input" type="email" name="email" value="${v.email}" placeholder="e.g. priya@college.edu"><span class="field-error" data-err="email"></span></div>
        <div class="full" data-form-error></div>
        <button type="submit" hidden></button>
      </form>`,
      footer: html`${Button('Cancel', { variant: 'ghost', attrs: 'data-close' })}${Button(existing ? 'Save changes' : 'Add student', { variant: 'primary', icon: existing ? 'check' : 'user-plus', attrs: 'data-submit' })}`,
    });
    const form = $('#stu-form', m.el);
    const setErr = (k, msg) => {
      $(`[data-err="${k}"]`, form).textContent = msg || '';
      form.elements[k]?.classList.toggle('invalid', !!msg);
    };
    const submit = async () => {
      const data = Object.fromEntries(new FormData(form));
      data.name = data.name.trim(); data.roll = data.roll.trim(); data.email = data.email.trim().toLowerCase();
      const errs = {};
      if (!data.name) errs.name = 'Name is required';
      if (!data.roll) errs.roll = 'Roll number is required';
      if (!data.cls) errs.cls = classes.length ? 'Select a class' : 'Create a class first (Classes tab)';
      if (data.email && !EMAIL_RE.test(data.email)) errs.email = 'Enter a valid email';
      ['name', 'roll', 'cls', 'email'].forEach((k) => setErr(k, errs[k]));
      if (Object.keys(errs).length) return form.querySelector('.invalid')?.focus();
      const btn = $('[data-submit]', m.el); btn.disabled = true;
      try {
        if (existing) await svc.updateStudent(existing.id, data);
        else await svc.addStudent(data);
        m.close();
        toast(existing ? `${data.name} updated` : `${data.name} added`);
        load();
      } catch (e) {
        btn.disabled = false;
        mount($('[data-form-error]', form), html`<div class="pill pill-bad" style="height:auto;padding:8px 12px;white-space:normal;border-radius:12px">${Icon('circle-alert')} ${e.message}</div>`);
      }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    $('[data-submit]', m.el).addEventListener('click', submit);
  }

  /* ── CSV import ── */
  function importModal() {
    let parsed = [];
    const m = openModal({
      title: 'Import students from CSV',
      sub: 'Columns: name, roll, class (or section), email. A header row is required.',
      wide: true,
      body: html`
        <label class="dropzone" id="drop">
          <input type="file" accept=".csv,text/csv" hidden id="csv-file">
          ${Icon('file-up')}<div style="font-weight:600;margin-top:6px">Drop a CSV here or click to choose</div>
          <div style="font-size:12.5px;margin-top:2px">UTF-8, up to a few thousand rows</div>
        </label>
        <div class="row" style="margin-top:10px"><button class="link-muted" data-template>${Icon('download')} Download a template</button></div>
        <div id="csv-preview" style="margin-top:14px"></div>`,
      footer: html`${Button('Cancel', { variant: 'ghost', attrs: 'data-close' })}${Button('Import', { variant: 'primary', icon: 'upload', attrs: 'data-import disabled' })}`,
    });
    const drop = $('#drop', m.el);
    const preview = $('#csv-preview', m.el);
    const importBtn = $('[data-import]', m.el);

    const handle = async (file) => {
      if (!file) return;
      const rows = parseCSV(await file.text());
      if (rows.length < 2) { mount(preview, html`<p class="field-error">That file has no data rows.</p>`); return; }
      const head = rows[0].map((h) => h.trim().toLowerCase());
      const col = (...names) => head.findIndex((h) => names.includes(h));
      const iName = col('name', 'full name', 'student'), iRoll = col('roll', 'roll no', 'roll number', 'roll_no');
      const iCls = col('cls', 'class', 'section'), iEmail = col('email', 'login email');
      if (iName < 0 || iRoll < 0 || iCls < 0) {
        mount(preview, html`<p class="field-error">Missing required columns. Found: ${head.join(', ')}. Need name, roll and class/section.</p>`);
        return;
      }
      const seen = new Set(students.map((s) => String(s.roll).toLowerCase()));
      parsed = rows.slice(1).map((r, i) => {
        const rec = { line: i + 2, name: (r[iName] || '').trim(), roll: (r[iRoll] || '').trim(), cls: (r[iCls] || '').trim(), email: iEmail >= 0 ? (r[iEmail] || '').trim().toLowerCase() : '' };
        rec.error = !rec.name || !rec.roll || !rec.cls ? 'Missing name, roll or class'
          : !classes.includes(rec.cls) ? `Unknown class “${rec.cls}”`
          : seen.has(rec.roll.toLowerCase()) ? 'Roll number already exists'
          : rec.email && !EMAIL_RE.test(rec.email) ? 'Invalid email' : '';
        if (!rec.error) seen.add(rec.roll.toLowerCase());
        return rec;
      });
      const ok = parsed.filter((r) => !r.error);
      importBtn.disabled = !ok.length;
      $('span', importBtn).textContent = `Import ${ok.length} student${ok.length === 1 ? '' : 's'}`;
      mount(preview, html`
        <div class="row" style="margin-bottom:10px"><span class="pill pill-ok">${ok.length} ready</span>${parsed.length - ok.length ? html`<span class="pill pill-bad">${parsed.length - ok.length} will be skipped</span>` : ''}</div>
        <div style="max-height:260px;overflow:auto">${DataTable({ rows: parsed.slice(0, 100), columns: [
          { label: 'Line', render: (r) => r.line }, { label: 'Name', render: (r) => r.name || '—' }, { label: 'Roll', render: (r) => r.roll || '—' },
          { label: 'Class', render: (r) => r.cls || '—' }, { label: '', render: (r) => (r.error ? StatusPill('A', r.error) : StatusPill('P', 'OK')) },
        ] })}</div>`);
    };

    $('#csv-file', m.el).addEventListener('change', (e) => handle(e.target.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handle(e.dataTransfer.files[0]); });
    $('[data-template]', m.el).addEventListener('click', () => downloadFile('students-template.csv', toCSV([['name', 'roll', 'class', 'email'], ['Priya Sharma', '22CS201', classes[0] || 'CSE-A', 'priya@college.edu']])));
    importBtn.addEventListener('click', async () => {
      const ok = parsed.filter((r) => !r.error);
      importBtn.disabled = true;
      let done = 0; const failed = [];
      for (const r of ok) {
        try { await svc.addStudent({ name: r.name, roll: r.roll, cls: r.cls, email: r.email || null }); done++; }
        catch (e) { failed.push(`Line ${r.line}: ${e.message}`); }
        $('span', importBtn).textContent = `Importing… ${done + failed.length}/${ok.length}`;
      }
      m.close();
      toast(`Imported ${done} student${done === 1 ? '' : 's'}${failed.length ? `, ${failed.length} failed` : ''}`, { error: !!failed.length && !done });
      if (failed.length) console.warn('CSV import failures:', failed);
      load();
    });
  }

  const offs = [
    on(root, 'input', '[data-q]', debounce((_, el) => { state.q = el.value; state.page = 1; paint(); }, 150)),
    on(root, 'change', '[data-f]', (_, el) => { state[el.dataset.f] = el.value; state.page = 1; paint(); }),
    on(root, 'click', '[data-page]', (_, el) => { state.page = Number(el.dataset.page); paint(); }),
    on(root, 'click', '[data-action="add"]', () => studentModal()),
    on(root, 'click', '[data-action="import"]', importModal),
    on(root, 'click', '[data-edit]', (_, el) => studentModal(students.find((s) => s.id === el.dataset.edit))),
    on(root, 'click', '[data-del]', async (_, el) => {
      const s = students.find((x) => x.id === el.dataset.del);
      const ok = await confirmDialog({ title: `Remove ${s.name}?`, message: 'This removes the student and all of their attendance records.', confirmLabel: 'Remove', danger: true });
      if (!ok) return;
      try { await svc.deleteStudent(s.id); toast(`${s.name} removed`); load(); } catch (e) { toast(e.message, { error: true }); }
    }),
  ];
  await load();
  return () => offs.forEach((f) => f());
}
