/* ─────────────────────────────────────────────
   Bootstrap — same flow as the original init():
   no token → auth screen; token → /auth/me →
   app; expired session → back to auth; backend
   unreachable → local/mock data.
   ───────────────────────────────────────────── */
import { api, getAuth, saveAuth, clearAuth, isAuthError } from './core/api.js';
import { renderAuth, getProfile } from './auth.js';
import { startShell, homeFor } from './shell.js';
import { initData } from './data/services.js';
import { toast } from './components.js';

const app = document.getElementById('app');
let stopShell = null;

/* ?demo=teacher | ?demo=student → explore the UI on generated data without a backend.
   Frontend-only: the server still rejects this session, and nothing real is shown. */
function consumeDemoParam() {
  const url = new URL(location.href);
  const demo = url.searchParams.get('demo');
  if (!demo) return;
  const role = demo === 'student' ? 'student' : 'teacher';
  saveAuth({ token: 'demo', demo: true, user: { id: 'demo', email: `demo.${role}@college.edu`, role } });
  url.searchParams.delete('demo');
  history.replaceState(null, '', url.pathname + url.search + `#/${homeFor(role)}`);
}

function fresh() {
  stopShell?.();
  stopShell = null;
  const el = document.createElement('div');
  app.replaceChildren(el);
  return el;
}

function showAuth(notice) {
  document.title = 'Sign in · Attendance Register';
  const returning = !!localStorage.getItem('attendance_profiles');
  renderAuth(fresh(), {
    mode: returning ? 'signin' : 'signup',
    notice,
    onAuthed: () => {
      // Redirect by role after login.
      location.hash = `#/${homeFor(getAuth().user.role)}`;
      boot();
    },
  });
}

async function logout() {
  if (!getAuth()?.demo) { try { await api('POST', '/auth/logout'); } catch (e) {} }
  clearAuth();
  history.replaceState(null, '', location.pathname);
  showAuth();
  toast('Logged out');
}

async function boot() {
  const auth = getAuth();
  if (!auth?.token) return showAuth();

  if (!auth.demo) {
    try {
      const me = await api('GET', '/auth/me');
      auth.user = me.user;
      saveAuth(auth);
    } catch (e) {
      if (isAuthError(e)) {
        clearAuth();
        return showAuth({ type: 'err', text: 'Your session expired. Please sign in again.' });
      }
      console.warn('Backend unreachable, falling back to local data:', e);
    }
  }

  try {
    await initData({ forceMock: !!auth.demo });
  } catch (e) {
    if (isAuthError(e)) { clearAuth(); return showAuth({ type: 'err', text: 'Please sign in again.' }); }
    console.error(e);
  }

  const root = fresh();
  stopShell = startShell(root, { onLogout: logout });
  const p = getProfile(auth.user.email);
  if (sessionStorage.getItem('greeted') !== auth.user.email) {
    sessionStorage.setItem('greeted', auth.user.email);
    toast(`Signed in${p?.firstName ? ` as ${p.firstName}` : ''}`);
  }
}

/* Supabase password-recovery links land as #access_token=…&refresh_token=…&type=recovery */
function readRecoveryLink() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (h.get('type') !== 'recovery' || !h.get('access_token')) return null;
  const tokens = { access_token: h.get('access_token'), refresh_token: h.get('refresh_token') };
  history.replaceState(null, '', location.pathname); // keep tokens out of the address bar
  return tokens;
}

function showReset(resetTokens) {
  document.title = 'Reset password · Attendance Register';
  renderAuth(fresh(), {
    mode: 'reset',
    resetTokens,
    onAuthed: () => { location.hash = `#/${homeFor(getAuth().user.role)}`; boot(); },
  });
}

const recovery = readRecoveryLink();
if (recovery) {
  showReset(recovery);
} else {
  consumeDemoParam();
  boot();
}
