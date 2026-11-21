/* Timetable — shared grid + the student's read-only view. */
import { html, raw, mount, $, on } from '../core/html.js';
import * as svc from '../data/services.js';
import { Card, Icon, Skeleton, EmptyState } from '../components.js';

const DAY_INDEX = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

function tint(hex, a = 0.14) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function TimetableGrid(tt, subjects, { editable = false } = {}) {
  const now = new Date();
  const today = DAY_INDEX[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  const bySub = Object.fromEntries(subjects.map((s) => [s.code, s]));
  return html`<div style="overflow-x:auto"><div class="tt" role="grid" aria-label="Weekly timetable">
    <div></div>${svc.DAYS.map((d) => html`<div class="tt-head" style="${d === today ? 'color:var(--primary)' : ''}">${d}${d === today ? ' · today' : ''}</div>`)}
    ${svc.PERIODS.map((p, pi) => {
      const [h, m] = p.split(':').map(Number);
      const isNow = mins >= h * 60 + m && mins < h * 60 + m + 60;
      return html`<div class="tt-time">${p}</div>${svc.DAYS.map((d) => {
        const slot = tt?.[d]?.[pi];
        const sub = slot ? bySub[slot.code] : null;
        const now2 = d === today && isNow ? 'now' : '';
        const tag = editable ? 'button' : 'div';
        const attrs = editable ? raw(`data-slot="${d}|${pi}" aria-label="${d} ${p}: ${sub ? sub.name : 'empty'} — edit"`) : '';
        if (!slot) return html`${raw(`<${tag} class="tt-slot ${editable ? 'editable' : ''} ${now2}"`)} ${attrs}>${editable ? html`<span style="margin:auto">${Icon('plus')}</span>` : ''}${raw(`</${tag}>`)}`;
        const color = sub?.color || '#6B7280';
        return html`${raw(`<${tag} class="tt-slot filled ${editable ? 'editable' : ''} ${now2}" style="background:${tint(color)}"`)} ${attrs}>
          <span class="s" style="color:${color}">${sub?.short || slot.code}</span>
          <span class="r">${sub?.name || 'Unknown subject'}</span>
          <span class="r">${slot.room || ''}</span>${raw(`</${tag}>`)}`;
      })}`;
    })}
  </div></div>`;
}

export default async function timetablePage(root, ctx) {
  mount(root, html`
    <div class="page-head"><div>
      <h1 class="page-title">Timetable</h1>
      <p class="page-sub">Your week, period by period.</p>
    </div></div>
    <div id="tt">${Card({ body: Skeleton.block(360) })}</div>`);

  const me = svc.me();
  if (!me) {
    mount($('#tt', root), Card({ body: EmptyState('No class linked to your account yet', 'Ask your teacher to add you with the same email you signed up with.', 'link-2-off') }));
    return;
  }
  const [tt, subjects] = await Promise.all([svc.getTimetable(me.cls), svc.listSubjects()]);
  if (ctx.isStale()) return;
  const empty = !Object.values(tt).flat().some(Boolean);
  mount($('#tt', root), Card({
    title: `${me.cls} · weekly schedule`,
    sub: svc.isMock() ? 'Demo timetable' : 'Set up by your teacher on this device',
    body: empty ? EmptyState('No timetable published yet', 'Your teacher hasn’t added periods for your section.', 'calendar-x') : TimetableGrid(tt, subjects),
  }));
}
