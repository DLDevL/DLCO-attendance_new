/* ─────────────────────────────────────────────
   Reusable UI components. Each returns escaped
   markup (see core/html.js); interactive ones
   (Modal, toast) also manage their own DOM.
   ───────────────────────────────────────────── */
import { html, raw, mount, icons, initials, avatarColors, $ } from './core/html.js';

export const Icon = (name, attrs = '') => raw(`<i data-lucide="${name}" ${attrs}></i>`);

/* ── Avatar ── */
export function Avatar(name, { size = '', seed } = {}) {
  const [bg, fg] = avatarColors(seed ?? name);
  return html`<span class="avatar ${size}" style="background:${bg};color:${fg}" title="${name}">${initials(name)}</span>`;
}

/* ── Button ── */
export function Button(label, { variant = 'outline', icon, iconRight, size = '', action, attrs = '', type = 'button' } = {}) {
  return html`<button type="${type}" class="btn btn-${variant} ${size}" ${action ? raw(`data-action="${action}"`) : ''} ${raw(attrs)}>${icon ? Icon(icon) : ''}${label ? html`<span>${label}</span>` : ''}${iconRight ? Icon(iconRight) : ''}</button>`;
}

/* ── Card ── */
export function Card({ title, sub, actions = '', body = '', tone = '', cls = '', id = '' } = {}) {
  return html`<section class="card ${tone} ${cls}" ${id ? raw(`id="${id}"`) : ''}>
    ${title || actions ? html`<header class="card-head">
      <div>${title ? html`<h2 class="card-title">${title}</h2>` : ''}${sub ? html`<p class="card-sub">${sub}</p>` : ''}</div>
      ${actions}
    </header>` : ''}
    ${body}
  </section>`;
}

/* ── StatCard ── */
export function StatCard({ label, value, suffix, note, noteIcon, noteUp = false, icon, tone = 'lavender', avatars, wide = false }) {
  const head = html`<div class="stat-label"><span>${label}</span>${icon ? Icon(icon) : ''}</div>`;
  const val = html`<div class="stat-value">${value}${suffix ? html`<small>${suffix}</small>` : ''}</div>`;
  const n = note ? html`<div class="stat-note ${noteUp ? 'up' : ''}">${noteIcon ? Icon(noteIcon) : ''}<span>${note}</span></div>` : '';
  if (wide) {
    return html`<article class="stat stat-${tone} stat-wide">
      <div class="stat-body">${head}${val}${n}</div>
      ${avatars?.length ? html`<div class="avatar-quad">${avatars.slice(0, 4).map((a) => Avatar(a, { size: 'lg' }))}</div>` : ''}
    </article>`;
  }
  return html`<article class="stat stat-${tone}">${head}${val}${n}</article>`;
}

/* ── StatusPill ── */
export const STATUS = {
  P: { label: 'On time', cls: 'ok' },
  L: { label: 'Late', cls: 'late' },
  E: { label: 'On leave', cls: 'leave' },
  CL: { label: 'On leave', cls: 'leave' },
  A: { label: 'Absent', cls: 'bad' },
  none: { label: 'Not marked', cls: 'none' },
  pending: { label: 'Pending', cls: 'late' },
  approved: { label: 'Approved', cls: 'ok' },
  rejected: { label: 'Rejected', cls: 'bad' },
  good: { label: 'Good', cls: 'ok' },
  warning: { label: 'At risk', cls: 'late' },
  low: { label: 'Defaulter', cls: 'bad' },
  'no-data': { label: 'No data', cls: 'none' },
};
export function StatusPill(status, label) {
  const s = STATUS[status] || STATUS.none;
  return html`<span class="pill pill-${s.cls}">${label || s.label}</span>`;
}

/* ── Tabs (segmented) ── */
export function Tabs(items, active, { name = 'tab', tone = '' } = {}) {
  return html`<div class="seg ${tone}" role="tablist">${items.map((it) => html`<button class="seg-btn ${it.value === active ? 'active' : ''}" role="tab" aria-selected="${it.value === active}" data-${raw(name)}="${it.value}">${it.icon ? Icon(it.icon) : ''}${it.label}</button>`)}</div>`;
}

/* ── DataTable ── */
/**
 * columns: [{ key, label, render?(row), align? }]
 * Returns table markup; pagination is rendered by Pager().
 */
export function DataTable({ columns, rows, empty = 'Nothing to show yet', emptyIcon = 'inbox', rowAttrs }) {
  if (!rows.length) return EmptyState(empty, '', emptyIcon);
  return html`<div class="table-wrap"><table class="table">
    <thead><tr>${columns.map((c) => html`<th style="${c.align ? `text-align:${c.align}` : ''}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr ${rowAttrs ? raw(rowAttrs(r)) : ''}>${columns.map((c) => html`<td style="${c.align ? `text-align:${c.align}` : ''}">${c.render ? c.render(r) : r[c.key] ?? '—'}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

export function Pager({ page, pages, shown, total, noun = 'students' }) {
  const nums = [];
  const push = (n) => nums.push(n);
  if (pages <= 5) for (let i = 1; i <= pages; i++) push(i);
  else {
    push(1);
    if (page > 3) push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) push(i);
    if (page < pages - 2) push('…');
    push(pages);
  }
  const z = (n) => String(n).padStart(2, '0');
  return html`<div class="table-foot">
    <span>Showing ${shown} of ${total} ${noun}</span>
    ${pages > 1 ? html`<nav class="pager" aria-label="Pagination">
      <button data-page="${page - 1}" ${page <= 1 ? raw('disabled') : ''} aria-label="Previous page">${Icon('arrow-left')}</button>
      ${nums.map((n) => (n === '…' ? html`<span class="ellipsis">…</span>` : html`<button data-page="${n}" class="${n === page ? 'active' : ''}">${z(n)}</button>`))}
      <button data-page="${page + 1}" ${page >= pages ? raw('disabled') : ''} aria-label="Next page">${Icon('arrow-right')}</button>
    </nav>` : ''}
  </div>`;
}

export function EmptyState(title, sub = '', icon = 'inbox') {
  return html`<div class="empty">${Icon(icon)}<div class="e-title">${title}</div>${sub ? html`<div>${sub}</div>` : ''}</div>`;
}

export function PersonCell(name, meta, seed) {
  return html`<div class="cell-person">${Avatar(name, { size: 'sm', seed })}<div><div class="name">${name}</div><div class="meta">${meta}</div></div></div>`;
}

/* ── Skeletons ── */
export const Skeleton = {
  text: (w = '100%') => html`<div class="skel skel-text" style="width:${w}"></div>`,
  block: (h = 150) => html`<div class="skel skel-block" style="height:${h}px"></div>`,
  rows: (n = 6) => html`<div>${Array.from({ length: n }, () => html`<div class="row" style="padding:12px 0;gap:12px"><div class="skel" style="width:28px;height:28px;border-radius:50%"></div><div style="flex:1">${Skeleton.text('40%')}${Skeleton.text('22%')}</div><div class="skel" style="width:70px;height:22px;border-radius:99px"></div></div>`)}</div>`,
  stats: () => html`<div class="stats">${[0, 1, 2, 3].map(() => Skeleton.block(150))}</div>`,
};

/* ── Modal ── */
export function openModal({ title, sub, body, footer, wide = false, onMount }) {
  const host = document.createElement('div');
  host.className = 'modal-backdrop';
  mount(host, html`<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-head">
      <div><h2 class="modal-title" id="modal-title">${title}</h2>${sub ? html`<p class="card-sub">${sub}</p>` : ''}</div>
      <button class="btn btn-ghost btn-icon" data-close aria-label="Close">${Icon('x')}</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? html`<div class="modal-foot">${footer}</div>` : ''}
  </div>`);
  const prevFocus = document.activeElement;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    host.remove();
    prevFocus?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  host.addEventListener('mousedown', (e) => { if (e.target === host) close(); });
  host.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(host);
  const modal = $('.modal', host);
  setTimeout(() => ($('input,select,textarea,button:not([data-close])', modal) || modal).focus?.(), 30);
  const api = { el: modal, close, setBody(m) { mount($('.modal-body', modal), m); } };
  onMount?.(api);
  return api;
}

/** Confirmation built into the page (window.confirm may be unavailable). */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title,
      body: html`<p style="color:var(--text-2)">${message}</p>`,
      footer: html`${Button('Cancel', { variant: 'ghost', attrs: 'data-close' })}${Button(confirmLabel, { variant: danger ? 'danger' : 'primary', attrs: 'data-ok' })}`,
      onMount: ({ el }) => {
        el.querySelector('[data-ok]').addEventListener('click', () => { done = true; resolve(true); m.close(); });
      },
    });
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

/* ── Toast ── */
export function toast(msg, { error = false, icon } = {}) {
  let host = $('.toasts');
  if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' error' : '');
  mount(t, html`${Icon(icon || (error ? 'circle-alert' : 'check'))}<span>${msg}</span>`);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, 3000);
}

export { icons };
