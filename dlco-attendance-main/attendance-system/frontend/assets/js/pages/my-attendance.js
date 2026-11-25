/* Student — My Attendance: subject ring, calendar heatmap, bunk calculator. */
import { html, raw, mount, $, on, isoDate, parseISO, addDays, fmtShort, pct1 } from '../core/html.js';
import { ring } from '../core/charts.js';
import * as svc from '../data/services.js';
import { Card, StatCard, StatusPill, Icon, Skeleton, EmptyState } from '../components.js';

const ATTENDED = new Set(['P', 'L', 'E', 'CL']); // same rule as /api/report: leave isn't an absence

/** Bunk maths. a = attended, t = held, p = target (0–1). */
export function bunk(a, t, p) {
  if (!t) return { pct: null, skip: 0, need: 0 };
  const pct = a / t;
  if (pct >= p) return { pct, skip: Math.floor(a / p - t + 1e-9), need: 0 };
  return { pct, skip: 0, need: Math.ceil((p * t - a) / (1 - p) - 1e-9) };
}

export function bunkLine({ skip, need }, target) {
  if (need) return html`Attend <b>${need}</b> more class${need === 1 ? '' : 'es'} in a row to reach ${target}%.`;
  if (skip) return html`You can skip <b>${skip}</b> more class${skip === 1 ? '' : 'es'} and stay at ${target}%.`;
  return html`You’re right on ${target}% — don’t skip the next one.`;
}

export default async function myAttendance(root, ctx) {
  const me = svc.me();
  mount(root, html`
    <div class="page-head"><div>
      <h1 class="page-title">My attendance</h1>
      <p class="page-sub">${me ? `${me.name} · ${me.roll} · ${me.cls}` : 'Your record, subject by subject.'}</p>
    </div></div>
    <div id="stats">${Skeleton.stats()}</div>
    <div class="grid-2" style="margin-bottom:20px"><div>${Skeleton.block(320)}</div><div>${Skeleton.block(320)}</div></div>
    ${Skeleton.block(220)}`);

  if (!me) {
    mount(root, html`<div class="page-head"><div><h1 class="page-title">My attendance</h1></div></div>${Card({ body: EmptyState('Your account isn’t linked to a student record yet', `You’re signed in as ${ctx.user.email}. Ask your teacher to add you (or fix your email) on their Students page using exactly this address — your attendance, timetable and leave will appear here automatically.`, 'link-2-off') })}`);
    return;
  }

  const [recs, subjStats] = await Promise.all([svc.getAttendance(), svc.getSubjectStats(me.id)]);
  if (ctx.isStale()) return;

  const count = (s) => recs.filter((r) => r.status === s).length;
  const total = recs.length;
  const attended = recs.filter((r) => ATTENDED.has(r.status)).length;
  const overall = total ? (attended / total) * 100 : null;
  const state = { target: 75 };

  mount(root, html`
    <div class="page-head"><div>
      <p class="page-date">${me.roll} · ${me.cls}</p>
      <h1 class="page-title">My attendance</h1>
      <p class="page-sub">${overall === null ? 'No classes recorded yet.' : overall >= 75 ? 'You’re on track. Keep the streak going.' : 'You’re below 75% — the calculator below shows how to get back.'}</p>
    </div></div>
    <div class="stats">
      ${StatCard({ label: 'Overall attendance', value: overall === null ? '—' : `${pct1(overall)}%`, suffix: total ? `${attended} / ${total} days` : '', note: overall === null ? '' : overall >= 75 ? 'Above the 75% line' : 'Below the 75% line', noteIcon: overall >= 75 ? 'circle-check' : 'triangle-alert', noteUp: overall >= 75, tone: 'lavender', wide: true })}
      ${StatCard({ label: 'Late', value: String(count('L')).padStart(2, '0'), icon: 'clock', note: 'Counted as present', tone: 'peach' })}
      ${StatCard({ label: 'On leave', value: String(count('E') + count('CL')).padStart(2, '0'), icon: 'calendar', note: `${count('E')} EL · ${count('CL')} CL`, tone: 'mint' })}
      ${StatCard({ label: 'Absent', value: String(count('A')).padStart(2, '0'), icon: 'user-x', note: count('A') ? 'Each one costs about ' + (total ? pct1(100 / total) : 0) + ' pp' : 'Perfect so far', tone: 'pink' })}
    </div>
    <div class="grid-2" style="margin-bottom:20px">
      <div id="ring-card"></div>
      <div id="bunk-card"></div>
    </div>
    <div id="heat-card"></div>`);

  /* ── ring ── */
  if (subjStats?.length) {
    const tot = subjStats.reduce((a, s) => ({ h: a.h + s.held, at: a.at + s.attended }), { h: 0, at: 0 });
    mount($('#ring-card', root), Card({
      title: 'Subject-wise',
      sub: 'Share of classes attended in each subject this term',
      body: html`<div class="ring-wrap">
        <div class="ring-box"><canvas id="ring" role="img" aria-label="Subject-wise attendance"></canvas>
          <div class="ring-center"><div><div class="v">${pct1((tot.at / tot.h) * 100)}%</div><div class="l">term average</div></div></div></div>
        <div>${subjStats.map((s) => { const p = (s.attended / s.held) * 100; return html`<div class="subj-row"><i style="background:${s.subject?.color || '#999'}"></i><span>${s.subject?.name || s.code}</span><b class="${p < 75 ? 'c-bad' : ''}">${Math.round(p)}%</b></div>`; })}</div>
      </div>`,
    }));
    ring($('#ring', root), { labels: subjStats.map((s) => `${s.subject?.short || s.code} · ${Math.round((s.attended / s.held) * 100)}%`), values: subjStats.map((s) => s.attended), colors: subjStats.map((s) => s.subject?.color || '#999') });
  } else {
    const parts = [['Present', count('P'), '#22C55E'], ['Late', count('L'), '#F59E0B'], ['Leave', count('E') + count('CL'), '#8B5CF6'], ['Absent', count('A'), '#F43F5E']].filter((p) => p[1]);
    mount($('#ring-card', root), Card({
      title: 'Breakdown',
      sub: 'Subject-wise tracking will appear once the server records attendance per subject.',
      body: total ? html`<div class="ring-wrap">
        <div class="ring-box"><canvas id="ring" role="img" aria-label="Attendance breakdown"></canvas>
          <div class="ring-center"><div><div class="v">${pct1(overall)}%</div><div class="l">overall</div></div></div></div>
        <div>${parts.map(([l, v, c]) => html`<div class="subj-row"><i style="background:${c}"></i><span>${l}</span><b>${v}</b></div>`)}</div>
      </div>` : EmptyState('No classes recorded yet', '', 'chart-pie'),
    }));
    if (total) ring($('#ring', root), { labels: parts.map((p) => p[0]), values: parts.map((p) => p[1]), colors: parts.map((p) => p[2]) });
  }

  /* ── bunk calculator ── */
  function paintBunk() {
    const p = state.target / 100;
    const rows = subjStats?.length
      ? subjStats.map((s) => ({ name: s.subject?.short || s.code, full: s.subject?.name || s.code, ...bunk(s.attended, s.held, p), a: s.attended, t: s.held }))
      : null;
    const base = rows ? rows.reduce((acc, r) => ({ a: acc.a + r.a, t: acc.t + r.t }), { a: 0, t: 0 }) : { a: attended, t: total };
    const o = bunk(base.a, base.t, p);
    mount($('#bunk-card', root), html`<section class="card purple" style="height:100%">
      <div class="follow-title">Bunk calculator ${Icon('calculator')}</div>
      <p class="follow-text" style="margin-bottom:14px">${base.t ? bunkLine(o, state.target) : 'Once classes are recorded, this tells you how many you can miss.'}</p>
      <div class="row" style="margin-bottom:14px;gap:8px">
        <label for="target" style="font-size:12.5px;opacity:.85">Target</label>
        <select id="target" class="select" style="width:auto;height:34px;background-color:rgba(255,255,255,.14);border-color:rgba(255,255,255,.25);color:#fff" data-target>
          ${[60, 65, 70, 75, 80, 85, 90].map((v) => html`<option value="${v}" style="color:#1A1A1A" ${v === state.target ? raw('selected') : ''}>${v}%</option>`)}
        </select>
        <span style="font-size:12.5px;opacity:.85">${base.a} of ${base.t} attended</span>
      </div>
      ${rows ? html`<div style="background:rgba(255,255,255,.1);border-radius:14px;padding:6px 12px">${rows.map((r) => html`
        <div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;flex-wrap:nowrap">
          <span title="${r.full}" style="min-width:52px;font-weight:600">${r.name}</span>
          <span style="opacity:.85">${pct1(r.pct * 100)}%</span>
          <span style="text-align:right">${r.need ? html`<b>+${r.need}</b> to attend` : html`<b>${r.skip}</b> can skip`}</span>
        </div>`)}</div>` : ''}
    </section>`);
  }
  paintBunk();

  /* ── heatmap ── */
  const map = Object.fromEntries(recs.map((r) => [r.date, r.status]));
  const end = new Date();
  // Size the heatmap to the history we actually have (6–18 weeks).
  const oldest = recs.length ? parseISO(recs[recs.length - 1].date) : end;
  const weeks = Math.min(18, Math.max(6, Math.ceil((end - oldest) / (7 * 86400000)) + 1));
  const start = addDays(end, -(weeks * 7 - 1));
  const firstMonday = addDays(start, -((start.getDay() + 6) % 7));
  const cells = [];
  for (let d = new Date(firstMonday); d <= end; d = addDays(d, 1)) {
    const iso = isoDate(d);
    const st = map[iso];
    cells.push(html`<span class="heat-cell ${st ? `h-${st}` : ''}" title="${fmtShort(d)} · ${st ? { P: 'Present', L: 'Late', A: 'Absent', E: 'Earned leave', CL: 'Casual leave' }[st] : 'No class recorded'}"></span>`);
  }
  const recent = recs.slice(0, 6);
  mount($('#heat-card', root), Card({
    title: 'Calendar heatmap',
    sub: `Last ${weeks} weeks · each square is a day, Monday at the top`,
    body: html`
      <div class="heat" role="img" aria-label="Daily attendance heatmap">${cells}</div>
      <div class="legend"><span><i style="background:#4ADE80"></i>Present</span><span><i style="background:#FBBF24"></i>Late</span><span><i style="background:#A78BFA"></i>Leave</span><span><i style="background:#FB7185"></i>Absent</span><span><i style="background:var(--surface-3)"></i>No class</span></div>
      ${recent.length ? html`<p class="section-label" style="margin-top:20px">Recent days</p><div class="row" style="gap:8px">${recent.map((r) => html`<span class="row" style="gap:6px;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:4px 6px 4px 12px">${fmtShort(parseISO(r.date))} ${StatusPill(r.status)}</span>`)}</div>` : ''}`,
  }));

  const offs = [on(root, 'change', '[data-target]', (_, el) => { state.target = Number(el.value); paintBunk(); })];
  return () => offs.forEach((f) => f());
}
