/* ─────────────────────────────────────────────
   Tiny templating helpers. `html` escapes every
   interpolated value unless it's already markup
   produced by `html`/`raw`, so names coming from
   the API can never inject HTML.
   ───────────────────────────────────────────── */
class Markup {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (v instanceof Markup) return v.s;
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Markup(out);
}

export const raw = (s) => new Markup(String(s));

/** Render markup into an element and hydrate Lucide icons inside it. */
export function mount(el, markup) {
  el.innerHTML = String(markup);
  icons(el);
}

export function icons(root) {
  if (window.lucide?.createIcons) {
    // lucide@0.460 scans the whole document (no `root` option) — cheap enough at this size.
    window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' }, nameAttr: 'data-lucide' });
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Delegated event helper: on(root, 'click', '[data-action="x"]', fn) */
export function on(root, type, selector, fn) {
  const handler = (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  };
  root.addEventListener(type, handler);
  return () => root.removeEventListener(type, handler);
}

/* ── formatting ── */
export function isoDate(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export const fmtLong = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const fmtShort = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
export const fmtDow = (d) => d.toLocaleDateString('en-US', { weekday: 'short' });
export const pad2 = (n) => String(n).padStart(2, '0');
export const pct1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

export function initials(name = '') {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

const AV = [
  ['#E9E3FB', '#5B21B6'], ['#FCE3CC', '#9A4A0B'], ['#DDEFE3', '#256B3E'], ['#F9DDE3', '#9F1239'],
  ['#DCEBFB', '#1E4E8C'], ['#FBF1C7', '#7A5B05'], ['#E3E8F0', '#334155'], ['#FADCF3', '#86198F'],
];
export function avatarColors(seed = '') {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV[h % AV.length];
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function downloadFile(name, content, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toCSV(rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

/** Minimal RFC4180-ish CSV parser (handles quotes, commas and newlines in quotes). */
export function parseCSV(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
