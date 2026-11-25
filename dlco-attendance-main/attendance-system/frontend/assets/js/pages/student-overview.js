/* Student — Overview: today, this week, next classes, leave status. */
import { html, mount, $, isoDate, addDays, fmtLong, fmtDow, parseISO, fmtShort, pct1 } from '../core/html.js';
import { weekBars } from '../core/charts.js';
import * as svc from '../data/services.js';
import { Card, StatCard, StatusPill, Icon, Skeleton, EmptyState } from '../components.js';
import { bunk, bunkLine } from './my-attendance.js';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekLabel = (s) => ({ P: 'Present', L: 'Late', E: 'Leave', CL: 'Leave', A: 'Absent' }[s] || '');

export default async function studentOverview(root, ctx) {
  const today = new Date();
  const first = ctx.name.split(' ')[0];
  mount(root, html`
    <div class="page-head"><div>
      <p class="page-date">${fmtLong(today)}</p>
      <h1 class="page-title">Hi ${first}. Good to see you.</h1>
      <p class="page-sub">Here’s where your attendance stands today.</p>
    </div>
    <div class="page-actions"><a class="btn btn-outline" href="#/apply-leave">${Icon('send')}<span>Apply for leave</span></a><a class="btn btn-primary" href="#/my-attendance">${Icon('chart-pie')}<span>My attendance</span></a></div></div>
    <div id="stats">${Skeleton.stats()}</div>
    <div class="grid-main"><div class="stack" id="left">${Skeleton.block(300)}</div><div class="stack" id="right">${Skeleton.block(180)}${Skeleton.block(140)}</div></div>`);

  const me = svc.me();
  if (!me) {
    mount($('#stats', root), '');
    mount($('#left', root), Card({ body: EmptyState('Your account isn’t linked to a student record yet', 'Ask your teacher to add you with the email you signed up with.', 'link-2-off') }));
    mount($('#right', root), '');
    return;
  }

  const [recs, tt, subjects, requests, warnings] = await Promise.all([svc.getAttendance(), svc.getTimetable(me.cls), svc.listSubjects(), svc.listLeaveRequests(), svc.myWarnings().catch(() => [])]);
  if (ctx.isStale()) return;
  const map = Object.fromEntries(recs.map((r) => [r.date, r]));
  const todayRec = map[isoDate(today)];
  const total = recs.length;
  const attended = recs.filter((r) => ['P', 'L', 'E', 'CL'].includes(r.status)).length;
  const overall = total ? (attended / total) * 100 : null;
  let streak = 0;
  for (const r of recs) { if (r.status === 'P' || r.status === 'L') streak++; else break; }
  const b = bunk(attended, total, 0.75);

  mount($('#stats', root), html`<div class="stats">
    ${StatCard({ label: 'Today', value: todayRec ? { P: 'Present', L: 'Late', A: 'Absent', E: 'On leave', CL: 'On leave' }[todayRec.status] : 'Not marked', suffix: todayRec?.checkIn ? `in at ${todayRec.checkIn}` : '', note: todayRec ? 'Marked by your teacher' : 'Your teacher hasn’t marked today yet', noteIcon: 'info', tone: 'lavender', wide: true })}
    ${StatCard({ label: 'Overall', value: overall === null ? '—' : `${Math.round(overall)}%`, icon: 'percent', note: `${attended} of ${total} days`, tone: 'peach' })}
    ${StatCard({ label: 'Streak', value: String(streak).padStart(2, '0'), icon: 'flame', note: streak ? 'Days present in a row' : 'Start a new streak today', tone: 'mint' })}
    ${StatCard({ label: 'Absences', value: String(recs.filter((r) => r.status === 'A').length).padStart(2, '0'), icon: 'user-x', note: 'Leave doesn’t count here', tone: 'pink' })}
  </div>`);

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const bySub = Object.fromEntries(subjects.map((s) => [s.code, s]));
  const todays = (tt[DAY[today.getDay()]] || []).map((slot, i) => ({ slot, time: svc.PERIODS[i] })).filter((x) => x.slot);

  mount($('#left', root), html`
    ${Card({
      title: 'Your week',
      sub: 'A full bar for each day you were there',
      body: html`<div class="chart-box"><canvas id="wk" role="img" aria-label="Your last 7 days"></canvas></div>
        <div class="row" style="gap:8px;margin-top:14px">${days.map((d) => html`<span class="row" style="gap:6px;font-size:12px">${fmtDow(d)} ${StatusPill(map[isoDate(d)]?.status || 'none')}</span>`)}</div>`,
    })}
    ${Card({
      title: 'Today’s classes',
      sub: me.cls,
      body: todays.length ? html`<div>${todays.map(({ slot, time }) => { const s = bySub[slot.code]; return html`<div class="mark-row"><span class="tile-icon" style="background:${(s?.color || '#6B7280')}1F;color:${s?.color || '#6B7280'}">${Icon('book-open')}</span><div style="flex:1"><div style="font-weight:600">${s?.name || slot.code}</div><div class="c-muted" style="font-size:12px">${s?.teacher || ''}${slot.room ? ` · ${slot.room}` : ''}</div></div><b style="font-variant-numeric:tabular-nums">${time}</b></div>`; })}</div>` : EmptyState('No classes scheduled today', '', 'coffee'),
    })}`);
  weekBars($('#wk', root), {
    labels: days.map((d, i) => (i === 6 ? 'Today' : fmtDow(d))),
    values: days.map((d) => { const r = map[isoDate(d)]; return r ? (['P', 'L', 'E', 'CL'].includes(r.status) ? 100 : 0) : null; }),
    format: (_, i) => weekLabel(map[isoDate(days[i])]?.status),
    tooltipLabel: (_, i) => weekLabel(map[isoDate(days[i])]?.status),
  });

  const pending = requests.filter((r) => r.status === 'pending');
  const warn = warnings[0];
  mount($('#right', root), html`
    ${warn ? html`<section class="card pink" role="status">
      <div class="mint-row"><span class="mint-icon" style="color:var(--bad-fg)">${Icon('triangle-alert')}</span><div>
        <div class="mint-title">Attendance warning from your teacher</div>
        <div class="mint-sub">${warn.message || 'Your attendance is below the required 75%. Please attend regularly.'}</div>
        <div class="c-muted" style="font-size:12px;margin-top:4px">Sent ${fmtShort(parseISO(warn.createdAt.slice(0, 10)))}${warnings.length > 1 ? ` · ${warnings.length} warnings this term` : ''}</div>
      </div></div></section>` : ''}
    <section class="card purple">
      <div class="follow-title">Bunk check ${Icon('sparkles')}</div>
      <p class="follow-text">${total ? bunkLine(b, 75) : 'Once classes are recorded you’ll see how many you can miss.'}</p>
      <a class="btn btn-white" href="#/my-attendance"><span>Open calculator</span>${Icon('arrow-right')}</a>
    </section>
    ${Card({
      title: 'Leave requests',
      actions: html`<a class="link-muted" href="#/apply-leave">New ${Icon('arrow-up-right')}</a>`,
      body: requests.length ? html`<div>${requests.slice(0, 4).map((r) => html`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span><b style="font-size:13px">${r.type}</b><div class="c-muted" style="font-size:12px">${fmtShort(parseISO(r.from))}${r.to !== r.from ? ` – ${fmtShort(parseISO(r.to))}` : ''}${r.note ? ` · ${r.note}` : ''}</div></span>${StatusPill(r.status)}</div>`)}</div>` : EmptyState('No requests yet', '', 'inbox'),
    })}
    <section class="card mint"><div class="mint-row"><span class="mint-icon">${Icon('target')}</span><div><div class="mint-title">${overall === null ? 'Goal: 75%' : overall >= 75 ? 'Above the 75% line.' : 'Below the 75% line.'}</div><div class="mint-sub">${pending.length ? `${pending.length} leave request${pending.length === 1 ? '' : 's'} awaiting review` : 'No pending leave requests'}${overall !== null ? ` · ${pct1(overall)}% overall` : ''}</div></div></div></section>`);
}
