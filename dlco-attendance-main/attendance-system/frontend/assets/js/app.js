/* ─────────────────────────────────────────────
   Bootstrap — same flow as the original init():
   no token → auth screen; token → /auth/me →
   app; expired session → back to auth; backend
   unreachable → local/mock data.
   ───────────────────────────────────────────── */
import { api, getAuth, saveAuth, clearAuth, isAuthError } from './core/api.js';
import { renderAuth, getProfile, saveProfile } from './auth.js';
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
      // A fresh Google sign-in hasn't been checked by the server yet — don't trust it offline.
      if (!auth.user?.email) { clearAuth(); return showAuth({ type: 'err', text: 'Can’t reach the server to finish signing in. Please try again.' }); }
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

/* Supabase sign-up confirmation links land as #access_token=…&type=signup,
   or #error=…&error_description=… when the link is expired or already used. */
function readConfirmationLink() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  let notice = null;
  if (h.get('type') === 'signup' && h.get('access_token')) {
    notice = { type: 'ok', text: 'Your email is verified. You can sign in now.' };
  } else if (h.get('error')) {
    const expired = h.get('error_code') === 'otp_expired';
    notice = {
      type: 'err',
      text: expired
        ? 'That confirmation link has expired or was already used. Enter your email and tap Resend email for a new one.'
        : (h.get('error_description') || 'That link didn’t work.'),
      resend: expired,
    };
  }
  if (notice) history.replaceState(null, '', location.pathname); // keep tokens out of the address bar
  return notice;
}

function showSignIn(notice) {
  document.title = 'Sign in · Attendance Register';
  renderAuth(fresh(), {
    mode: 'signin',
    notice,
    onAuthed: () => { location.hash = `#/${homeFor(getAuth().user.role)}`; boot(); },
  });
}

/* "Continue with Google" comes back as #access_token=…&refresh_token=… (no `type`).
   Returns the token, or null when this isn't a Google return. */
function readOAuthLink() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (h.get('type') || !h.get('access_token')) return null;
  history.replaceState(null, '', location.pathname); // keep tokens out of the address bar
  return h.get('access_token');
}

/* "Sign up with Google" registers the account right away (no confirmation email);
   "Continue with Google" only works for people who already have an account. */
async function finishGoogleSignIn(token) {
  clearAuth();
  let intent = { mode: 'signin' };
  try { intent = JSON.parse(sessionStorage.getItem('google_intent') || 'null') || intent; sessionStorage.removeItem('google_intent'); } catch {}
  try {
    const { user, created } = await api('POST', '/auth/google/complete', { access_token: token, mode: intent.mode, role: intent.role });
    if (created && intent.title && !getProfile(user.email)) {
      const [firstName = '', ...rest] = (user.name || '').split(' ');
      saveProfile(user.email, { firstName, lastName: rest.join(' '), title: intent.title, phone: '' });
    }
    saveAuth({ token, user });
    location.hash = `#/${homeFor(user.role)}`;
    boot();
  } catch (e) {
    // Back to the Sign in screen with the reason — e.g. "No account exists for …".
    // The user can pick a different Google account straight away (the chooser always opens).
    showSignIn({ type: 'err', text: e.status ? e.message : 'Can’t reach the server to finish signing in. Please try again.' });
  }
}

const recovery = readRecoveryLink();
const confirmation = !recovery && readConfirmationLink();
const googleToken = !recovery && !confirmation && readOAuthLink();
if (recovery) {
  showReset(recovery);
} else if (confirmation) {
  clearAuth();
  showSignIn(confirmation);
} else if (googleToken) {
  finishGoogleSignIn(googleToken);
} else {
  consumeDemoParam();
  boot();
}
