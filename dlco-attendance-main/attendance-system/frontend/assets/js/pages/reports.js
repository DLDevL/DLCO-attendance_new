/* Reports — date range, subject/student charts, defaulters, CSV/PDF export. */
import { html, raw, mount, $, on, isoDate, addDays, toCSV, downloadFile, pct1 } from '../core/html.js';
import { bars, loadScript } from '../core/charts.js';
import * as svc from '../data/services.js';
import { Card, StatusPill, DataTable, PersonCell, Button, Icon, Skeleton, EmptyState, toast } from '../components.js';

const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
const AUTOTABLE = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js';
const THRESHOLD = 75;

export default async function reportsPage(root, ctx) {
  const today = new Date();
  const state = { from: isoDate(addDays(today, -6)), to: isoDate(today), cls: '', preset: '7' };
  let report = [], warnings = svc.getWarnings();
  const focus = ctx.params.get('student');

  const classes = await svc.listClasses();
  if (ctx.isStale()) return;

  mount(root, html`
    <div class="page-head">
      <div>
        <h1 class="page-title">Reports</h1>
        <p class="page-sub">Who’s showing up, by subject and by student — and who needs a nudge.</p>
      </div>
      <div class="page-actions">
        ${Button('Export CSV', { icon: 'file-spreadsheet', action: 'csv' })}
        ${Button('Export PDF', { variant: 'primary', icon: 'file-text', action: 'pdf' })}
      </div>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="row" style="align-items:flex-end">
        <div class="field"><label>Range</label><div class="seg on-white" role="tablist">${[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['all', 'All time'], ['custom', 'Custom']].map(([v, l]) => html`<button class="seg-btn ${state.preset === v ? 'active' : ''}" data-preset="${v}">${l}</button>`)}</div></div>
        <div class="field" style="width:160px"><label for="r-from">From</label><input id="r-from" class="input" type="date" value="${state.from}" max="${isoDate(today)}" data-r="from"></div>
        <div class="field" style="width:160px"><label for="r-to">To</label><input id="r-to" class="input" type="date" value="${state.to}" max="${isoDate(today)}" data-r="to"></div>
        <div class="field" style="width:180px"><label for="r-cls">Section</label><select id="r-cls" class="select" data-r="cls"><option value="">All sections</option>${classes.map((c) => html`<option>${c}</option>`)}</select></div>
      </div>
    </div>
    <div id="summary" class="stats" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[0, 1, 2, 3].map(() => Skeleton.block(110))}</div>
    <div id="focus"></div>
    <div class="grid-2" style="margin-bottom:20px">
      ${Card({ title: 'Subject-wise attendance', sub: 'Average across students in the section', body: html`<div id="subj">${Skeleton.block(260)}</div>` })}
      ${Card({ title: 'Student-wise attendance', sub: 'The 12 students with the lowest attendance in range', body: html`<div id="stud">${Skeleton.block(260)}</div>` })}
    </div>
    ${Card({ title: `Defaulters (below ${THRESHOLD}%)`, sub: 'Students who’d benefit from a reminder.', body: html`<div id="defaulters">${Skeleton.rows(5)}</div>` })}`);

  async function load() {
    ['#subj', '#stud'].forEach((id) => mount($(id, root), Skeleton.block(260)));
    const range = state.preset === 'all' ? {} : { from: state.from, to: state.to };
    const [rep, subj] = await Promise.all([svc.getReport({ cls: state.cls || undefined, ...range }), svc.getSubjectAverages(state.cls || undefined)]);
    if (ctx.isStale()) return;
    report = rep;
    paint(subj);
  }

  function paint(subj) {
    const withData = report.filter((r) => r.attendancePct !== null);
    const avg = withData.length ? withData.reduce((a, r) => a + r.attendancePct, 0) / withData.length : null;
    const defaulters = withData.filter((r) => r.attendancePct < THRESHOLD).sort((a, b) => a.attendancePct - b.attendancePct);
    const sessions = Math.max(0, ...report.map((r) => r.totalSessions));

    mount($('#summary', root), html`
      ${tile('Average attendance', avg === null ? '—' : `${pct1(avg)}%`, 'lavender', 'percent')}
      ${tile('Students', report.length, 'mint', 'users')}
      ${tile('Defaulters', defaulters.length, 'pink', 'triangle-alert')}
      ${tile('Days recorded', sessions, 'peach', 'calendar-check')}`);

    const f = focus && report.find((r) => r.id === focus);
    mount($('#focus', root), f ? html`<div class="card lavender" style="margin-bottom:20px"><div class="row">
      ${PersonCell(f.name, `${f.roll} · ${f.cls}`, f.name)}<span class="spacer"></span>
      <span><b>${f.attendancePct ?? '—'}${f.attendancePct === null ? '' : '%'}</b> <span class="c-muted">in range</span></span>
      <span class="c-muted">${f.present} present · ${f.absent} absent · ${f.late} late · ${f.elUsed + f.clUsed} leave</span>
      ${StatusPill(f.status)}</div></div>` : '');

    if (subj?.length) {
      mount($('#subj', root), html`<div class="chart-box tall"><canvas id="c-subj" role="img" aria-label="Subject-wise attendance"></canvas></div>`);
      bars($('#c-subj', root), { labels: subj.map((s) => s.subject.short || s.subject.code), values: subj.map((s) => Math.round(s.pct * 10) / 10), colors: subj.map((s) => s.subject.color + 'CC'), threshold: THRESHOLD });
    } else {
      mount($('#subj', root), EmptyState('Subject-wise data isn’t available yet', 'The attendance API records one status per day, not per subject. Once it stores the subject, this chart fills in.', 'book-open'));
    }

    const low = [...withData].sort((a, b) => a.attendancePct - b.attendancePct).slice(0, 12);
    if (low.length) {
      mount($('#stud', root), html`<div class="chart-box tall"><canvas id="c-stud" role="img" aria-label="Lowest student attendance"></canvas></div>`);
      bars($('#c-stud', root), { labels: low.map((r) => r.name.split(' ')[0] + ' ' + (r.name.split(' ')[1]?.[0] || '') + '.'), values: low.map((r) => r.attendancePct), horizontal: true, threshold: THRESHOLD });
    } else mount($('#stud', root), EmptyState('No attendance recorded in this range', '', 'chart-column'));

    paintDefaulters(defaulters);
  }

  function paintDefaulters(defaulters) {
    mount($('#defaulters', root), DataTable({
      rows: defaulters,
      empty: 'No one is below the line. Lovely.',
      emptyIcon: 'party-popper',
      columns: [
        { label: 'Student', render: (r) => PersonCell(r.name, r.roll, r.name) },
        { label: 'Section', render: (r) => r.cls },
        { label: 'Attendance', render: (r) => html`<b class="${r.attendancePct < 50 ? 'c-bad' : 'c-late'}">${r.attendancePct}%</b>` },
        { label: 'Present / days', render: (r) => `${r.present + r.elUsed + r.clUsed} / ${r.totalSessions}` },
        { label: 'Need to attend', render: (r) => { const need = Math.max(0, Math.ceil(((THRESHOLD / 100) * r.totalSessions - (r.present + r.elUsed + r.clUsed)) / (1 - THRESHOLD / 100))); return `${need} more in a row`; } },
        { label: 'Status', render: (r) => StatusPill(r.status) },
        { label: '', align: 'right', render: (r) => (warnings[r.id]
          ? html`<span class="pill pill-leave">${Icon('check')} Warned ${warnings[r.id]}</span>`
          : Button('Send warning', { variant: 'soft', size: 'btn-sm', icon: 'send', attrs: `data-warn="${r.id}"` })) },
      ],
    }));
  }

  function tile(label, value, tone, icon) {
    return html`<article class="stat stat-${tone}" style="min-height:110px"><div class="stat-label"><span>${label}</span>${Icon(icon)}</div><div class="stat-value" style="font-size:34px">${value}</div></article>`;
  }

  const rangeLabel = () => (state.preset === 'all' ? 'All time' : `${state.from} to ${state.to}`);

  function exportCSV() {
    if (!report.length) return toast('Nothing to export yet', { error: true });
    downloadFile(`attendance-report-${state.preset === 'all' ? 'all' : `${state.from}_${state.to}`}.csv`, toCSV([
      ['Name', 'Roll', 'Section', 'Days', 'Present', 'Late', 'Absent', 'EL used', 'CL used', 'Attendance %', 'Status'],
      ...report.map((r) => [r.name, r.roll, r.cls, r.totalSessions, r.present, r.late, r.absent, r.elUsed, r.clUsed, r.attendancePct ?? '', r.status]),
    ]));
    toast('CSV downloaded');
  }

  async function exportPDF() {
    if (!report.length) return toast('Nothing to export yet', { error: true });
    const btn = $('[data-action="pdf"]', root);
    btn.disabled = true;
    try {
      await loadScript(JSPDF);
      await loadScript(AUTOTABLE);
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Attendance report', 40, 50);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 114, 128);
      doc.text(`${rangeLabel()} · ${state.cls || 'All sections'} · generated ${new Date().toLocaleString()}`, 40, 68);
      const head = [['Name', 'Roll', 'Section', 'Days', 'Present', 'Absent', 'Leave', '%']];
      const row = (r) => [r.name, r.roll, r.cls, r.totalSessions, r.present, r.absent, r.elUsed + r.clUsed, r.attendancePct ?? '—'];
      const defaulters = report.filter((r) => r.attendancePct !== null && r.attendancePct < THRESHOLD);
      const styles = { headStyles: { fillColor: [109, 40, 217] }, styles: { fontSize: 9 }, alternateRowStyles: { fillColor: [247, 246, 243] } };
      doc.setTextColor(26, 26, 26); doc.setFontSize(12); doc.text(`Defaulters (below ${THRESHOLD}%): ${defaulters.length}`, 40, 96);
      doc.autoTable({ startY: 104, head, body: defaulters.map(row), ...styles });
      doc.text('All students', 40, doc.lastAutoTable.finalY + 28);
      doc.autoTable({ startY: doc.lastAutoTable.finalY + 36, head, body: report.map(row), ...styles });
      doc.save(`attendance-report-${isoDate()}.pdf`);
      toast('PDF downloaded');
    } catch (e) {
      toast(`PDF export failed: ${e.message}`, { error: true });
    } finally { btn.disabled = false; }
  }

  const offs = [
    on(root, 'click', '[data-preset]', (_, el) => {
      state.preset = el.dataset.preset;
      root.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', b === el));
      if (state.preset === '7' || state.preset === '30') {
        state.from = isoDate(addDays(today, -(Number(state.preset) - 1))); state.to = isoDate(today);
        $('#r-from', root).value = state.from; $('#r-to', root).value = state.to;
      }
      if (state.preset !== 'custom') load();
    }),
    on(root, 'change', '[data-r]', (_, el) => {
      state[el.dataset.r] = el.value;
      if (el.dataset.r !== 'cls') {
        state.preset = 'custom';
        root.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === 'custom'));
        if (state.from && state.to && state.from > state.to) return toast('“From” must be before “To”', { error: true });
      }
      load();
    }),
    on(root, 'click', '[data-warn]', async (_, el) => {
      el.disabled = true;
      const r = report.find((x) => x.id === el.dataset.warn);
      await svc.sendWarning(r.id);
      warnings = svc.getWarnings();
      paintDefaulters(report.filter((x) => x.attendancePct !== null && x.attendancePct < THRESHOLD).sort((a, b) => a.attendancePct - b.attendancePct));
      toast(`Warning logged for ${r.name}. No email service is connected yet, so let them know in person.`, { icon: 'send' });
    }),
    on(root, 'click', '[data-action="csv"]', exportCSV),
    on(root, 'click', '[data-action="pdf"]', exportPDF),
  ];
  await load();
  return () => offs.forEach((f) => f());
}
