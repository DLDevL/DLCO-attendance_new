/* ─────────────────────────────────────────────
   App shell: top navbar with role-based tabs,
   notifications, avatar menu, mobile drawer,
   and the hash router that mounts pages.
   ───────────────────────────────────────────── */
import { html, mount, $, $$, icons } from './core/html.js';
import { destroyCharts } from './core/charts.js';
import { getAuth, isTeacher } from './core/api.js';
import { isMock, getSource } from './data/services.js';
import { Avatar, Icon } from './components.js';
import { getProfile } from './auth.js';
import { getTheme, toggleTheme } from './core/theme.js';

/** Sun while the light theme is on, crescent moon while the dark theme is on. */
function paintThemeToggle(btn, animate = false) {
  const dark = getTheme() === 'dark';
  btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  btn.title = dark ? 'Dark theme · switch to light' : 'Light theme · switch to dark';
  mount(btn, Icon(dark ? 'moon' : 'sun'));
  if (animate) { btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin'); }
}

export const APP_NAME = 'Attendance Register';

export const NAV = {
  teacher: [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'attendance', label: 'Attendance', icon: 'clipboard-check' },
    { id: 'students', label: 'Students', icon: 'users' },
    { id: 'classes', label: 'Classes', icon: 'school' },
    { id: 'leaves', label: 'Leave Requests', icon: 'calendar-clock' },
    { id: 'reports', label: 'Reports', icon: 'chart-column' },
  ],
  student: [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'my-attendance', label: 'My Attendance', icon: 'chart-pie' },
    { id: 'timetable', label: 'Timetable', icon: 'calendar-days' },
    { id: 'apply-leave', label: 'Apply Leave', icon: 'send' },
  ],
};
const EXTRA = ['profile', 'settings'];
export const homeFor = (role) => (role === 'teacher' ? 'overview' : 'my-attendance');

const PAGES = {
  overview: () => (isTeacher() ? import('./pages/overview.js') : import('./pages/student-overview.js')),
  attendance: () => import('./pages/attendance.js'),
  students: () => import('./pages/students.js'),
  classes: () => import('./pages/classes.js'),
  leaves: () => import('./pages/leaves.js'),
  reports: () => import('./pages/reports.js'),
  'my-attendance': () => import('./pages/my-attendance.js'),
  timetable: () => import('./pages/timetable.js'),
  'apply-leave': () => import('./pages/apply-leave.js'),
  profile: () => import('./pages/profile.js'),
  settings: () => import('./pages/profile.js'),
};

export function displayName(user) {
  const p = getProfile(user?.email);
  if (p?.firstName) return `${p.firstName} ${p.lastName || ''}`.trim();
  const local = (user?.email || 'User').split('@')[0].replace(/[._\d]+/g, ' ').trim();
  return local.replace(/\b\w/g, (c) => c.toUpperCase()) || 'User';
}
export function roleLabel(user) {
  const p = getProfile(user?.email);
  const r = p?.title || user?.role || 'student';
  return r.charAt(0).toUpperCase() + r.slice(1);
}

const NOTIFS = {
  teacher: [
    { text: 'New leave requests are waiting for review', time: 'Today', href: '#/leaves' },
    { text: 'Some students are below 75% attendance', time: 'This week', href: '#/reports' },
    { text: 'Remember to mark today’s attendance', time: 'Today', href: '#/attendance' },
  ],
  student: [
    { text: 'Check how many classes you can still skip', time: 'Today', href: '#/my-attendance' },
    { text: 'Your leave request status may have changed', time: 'This week', href: '#/apply-leave' },
  ],
};

export function startShell(root, { onLogout }) {
  const user = getAuth().user;
  const role = user.role === 'teacher' ? 'teacher' : 'student';
  const tabs = NAV[role];
  const name = displayName(user);
  let cleanup = null;
  let token = 0;

  mount(root, html`
    <header class="nav">
      <div class="nav-inner">
        <div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="icon-btn hamburger" data-drawer-open aria-label="Open menu">${Icon('menu')}</button>
          <a href="#/overview" class="brand" aria-label="${APP_NAME} home"><span class="brand-mark">A</span><span class="brand-name">${APP_NAME}</span></a>
        </div>
        <nav class="nav-tabs" aria-label="Primary">${tabs.map((t) => html`<a class="nav-tab" href="#/${t.id}" data-nav="${t.id}">${t.label}</a>`)}</nav>
        <div class="nav-right">
          ${isMock() ? html`<span class="demo-badge" title="Showing generated demo data">Demo data</span>` : getSource() === 'local' ? html`<span class="demo-badge" title="Backend unreachable — using this browser's saved data">Offline data</span>` : ''}
          <button class="icon-btn theme-toggle" data-theme-toggle></button>
          <div class="menu-wrap">
            <button class="icon-btn" data-menu="notif" aria-label="Notifications" aria-expanded="false" aria-haspopup="true">${Icon('bell')}<span class="dot-unread" data-unread></span></button>
            <div class="menu" data-menu-panel="notif" style="min-width:300px">
              <div class="menu-head"><div class="name">Notifications</div></div>
              ${NOTIFS[role].map((n) => html`<a class="notif-item" href="${n.href}"><span class="n-dot"></span><span><div>${n.text}</div><div class="n-time">${n.time}</div></span></a>`)}
            </div>
          </div>
          <div class="menu-wrap">
            <button class="avatar-btn" data-menu="user" aria-label="Account menu" aria-expanded="false" aria-haspopup="true">${Avatar(name, { seed: user.email })}</button>
            <div class="menu" data-menu-panel="user" role="menu">
              <div class="menu-head"><div class="name">${name}</div><div class="sub">${user.email} · ${roleLabel(user)}</div></div>
              <a class="menu-item" role="menuitem" href="#/profile">${Icon('user')} Profile</a>
              <a class="menu-item" role="menuitem" href="#/settings">${Icon('settings')} Settings</a>
              <button class="menu-item danger" role="menuitem" data-logout>${Icon('log-out')} Logout</button>
            </div>
          </div>
        </div>
      </div>
    </header>
    <div class="drawer-backdrop" data-drawer-close></div>
    <aside class="drawer" aria-label="Menu" aria-hidden="true">
      <div class="drawer-head">
        <span class="brand"><span class="brand-mark">A</span>${APP_NAME}</span>
        <button class="icon-btn" data-drawer-close aria-label="Close menu">${Icon('x')}</button>
      </div>
      ${tabs.map((t) => html`<a class="nav-tab" href="#/${t.id}" data-nav="${t.id}">${t.label}</a>`)}
    </aside>
    <main id="page" tabindex="-1"></main>
  `);

  const main = $('#page', root);
  paintThemeToggle($('[data-theme-toggle]', root));
  const drawer = $('.drawer', root);
  const backdrop = $('.drawer-backdrop', root);

  const setDrawer = (open) => {
    drawer.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', String(!open));
  };
  const closeMenus = () => $$('[data-menu]', root).forEach((b) => {
    b.setAttribute('aria-expanded', 'false');
    $(`[data-menu-panel="${b.dataset.menu}"]`, root).classList.remove('open');
  });

  const onDocClick = (e) => {
    const m = e.target.closest('[data-menu]');
    if (m) {
      const open = m.getAttribute('aria-expanded') !== 'true';
      closeMenus();
      if (open) {
        m.setAttribute('aria-expanded', 'true');
        $(`[data-menu-panel="${m.dataset.menu}"]`, root).classList.add('open');
        if (m.dataset.menu === 'notif') $('[data-unread]', root)?.remove();
      }
      return;
    }
    if (!e.target.closest('.menu')) closeMenus();
    if (e.target.closest('[data-drawer-open]')) setDrawer(true);
    if (e.target.closest('[data-drawer-close]')) setDrawer(false);
    if (e.target.closest('.drawer .nav-tab') || e.target.closest('.menu a')) { setDrawer(false); closeMenus(); }
    if (e.target.closest('[data-logout]')) { closeMenus(); onLogout(); }
    const tt = e.target.closest('[data-theme-toggle]');
    if (tt) { toggleTheme(); paintThemeToggle(tt, true); }
  };
  const onKey = (e) => { if (e.key === 'Escape') { closeMenus(); setDrawer(false); } };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  async function route() {
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const allowed = [...tabs.map((t) => t.id), ...EXTRA];
    const id = allowed.includes(path) ? path : homeFor(role);
    if (id !== path) { location.replace(`#/${id}`); return; }

    $$('[data-nav]', root).forEach((a) => {
      const on = a.dataset.nav === id;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const label = tabs.find((t) => t.id === id)?.label || (id === 'profile' ? 'Profile' : 'Settings');
    document.title = `${label} · ${APP_NAME}`;

    try { cleanup?.(); } catch {}
    cleanup = null;
    destroyCharts();
    const my = ++token;
    main.innerHTML = '';
    const mod = await PAGES[id]();
    if (my !== token) return; // user navigated again while loading
    const page = document.createElement('div');
    page.className = 'page';
    main.appendChild(page);
    window.scrollTo({ top: 0 });
    try {
      cleanup = (await mod.default(page, { params: new URLSearchParams(query), route: id, user, name, isStale: () => my !== token })) || null;
    } catch (e) {
      console.error(e);
      if (my !== token) return;
      mount(page, html`<div class="card"><div class="empty">${Icon('triangle-alert')}<div class="e-title">This page couldn’t load</div><div>${e.message}</div></div></div>`);
    }
    icons(page);
  }

  window.addEventListener('hashchange', route);
  route();

  return () => {
    window.removeEventListener('hashchange', route);
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
    try { cleanup?.(); } catch {}
    destroyCharts();
  };
}
