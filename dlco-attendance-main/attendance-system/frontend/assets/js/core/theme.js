/* ─────────────────────────────────────────────
   Light / dark theme.
   The choice lives on <html data-theme="…"> and in
   localStorage. index.html applies it before the
   page paints, so there's no flash of the wrong theme.
   ───────────────────────────────────────────── */
const KEY = 'attendance_theme';
const META = { light: '#F7F6F3', dark: '#0F0F12' };

export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme) {
  const root = document.documentElement;
  // Fade colours for a moment so the switch feels smooth rather than abrupt.
  root.classList.add('theme-fade');
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[theme]);
  try { localStorage.setItem(KEY, theme); } catch {}
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  setTimeout(() => root.classList.remove('theme-fade'), 320);
}

export const toggleTheme = () => setTheme(getTheme() === 'dark' ? 'light' : 'dark');
