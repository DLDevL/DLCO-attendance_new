/* ─────────────────────────────────────────────
   Sign up / Sign in screen. Wired to the existing
   POST /api/auth/signup and /api/auth/login.
   ───────────────────────────────────────────── */
import { html, raw, mount, $, $$ } from './core/html.js';
import { api, saveAuth, isNetworkError } from './core/api.js';
import { Icon } from './components.js';

const PROFILE_KEY = 'attendance_profiles';

export function getProfile(email) {
  try { return (JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'))[email?.toLowerCase()] || null; } catch { return null; }
}
export function saveProfile(email, profile) {
  try {
    const all = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    all[email.toLowerCase()] = { ...(all[email.toLowerCase()] || {}), ...profile };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(all));
  } catch {}
}

/* ── flags (inline SVG: emoji flags don't render on Windows) ── */
const FLAGS = {
  IN: '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><rect width="30" height="6.67" fill="#FF9933"/><rect y="13.33" width="30" height="6.67" fill="#138808"/><circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width=".8"/></svg>',
  US: '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><g fill="#B22234"><rect width="30" height="1.54"/><rect y="3.08" width="30" height="1.54"/><rect y="6.15" width="30" height="1.54"/><rect y="9.23" width="30" height="1.54"/><rect y="12.31" width="30" height="1.54"/><rect y="15.38" width="30" height="1.54"/><rect y="18.46" width="30" height="1.54"/></g><rect width="13" height="10.77" fill="#3C3B6E"/></svg>',
  GB: '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.5"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#C8102E" stroke-width="3.5"/></svg>',
  AE: '<svg viewBox="0 0 30 20"><rect width="30" height="6.67" fill="#00732F"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#000"/><rect width="8" height="20" fill="#FF0000"/></svg>',
  SG: '<svg viewBox="0 0 30 20"><rect width="30" height="10" fill="#EF3340"/><rect y="10" width="30" height="10" fill="#fff"/><circle cx="6" cy="5" r="3" fill="#fff"/><circle cx="7.2" cy="5" r="3" fill="#EF3340"/></svg>',
  CA: '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#D80621"/><rect x="22.5" width="7.5" height="20" fill="#D80621"/><path d="M15 4l1.2 2.6 2.3-.6-.8 3 2-.4-2.7 3 .4 1.6H15.6V16h-1.2v-2.8h-1.8l.4-1.6-2.7-3 2 .4-.8-3 2.3.6z" fill="#D80621"/></svg>',
  DE: '<svg viewBox="0 0 30 20"><rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#DD0000"/><rect y="13.33" width="30" height="6.67" fill="#FFCE00"/></svg>',
  JP: '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/></svg>',
};
const COUNTRIES = [
  { code: 'IN', dial: '+91', name: 'India', ph: '98765 43210', len: [10, 10] },
  { code: 'US', dial: '+1', name: 'United States', ph: '(775) 351-6501', len: [10, 10] },
  { code: 'GB', dial: '+44', name: 'United Kingdom', ph: '7400 123456', len: [9, 10] },
  { code: 'AE', dial: '+971', name: 'United Arab Emirates', ph: '50 123 4567', len: [8, 9] },
  { code: 'SG', dial: '+65', name: 'Singapore', ph: '8123 4567', len: [8, 8] },
  { code: 'CA', dial: '+1', name: 'Canada', ph: '(416) 555-0199', len: [10, 10] },
  { code: 'DE', dial: '+49', name: 'Germany', ph: '1512 3456789', len: [10, 11] },
  { code: 'JP', dial: '+81', name: 'Japan', ph: '90 1234 5678', len: [10, 10] },
];

const GOOGLE = raw('<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>');

/* ── background: rainbow light wave over a dark horizon ── */
const BANDS = ['#ff1f4b', '#ff5a1f', '#ff9d1c', '#ffd92e', '#9be15d', '#2fd6b5', '#2b8cff', '#5b3bff'];
const BG = raw(`<div class="auth-bg" aria-hidden="true"><svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="hz" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".06" stop-color="#b8d4ff"/>
      <stop offset=".25" stop-color="#4a6bff"/>
      <stop offset=".42" stop-color="#7d3cff"/>
      <stop offset=".55" stop-color="#ff2d6f"/>
      <stop offset=".7" stop-color="#ff7a2b"/>
      <stop offset=".85" stop-color="#ffd23b"/>
      <stop offset="1" stop-color="#5fe39a"/>
    </linearGradient>
    <filter id="b1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>
    <filter id="b2" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
    <filter id="b3" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
    <filter id="b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70"/></filter>
  </defs>
  <g class="auth-glow">
    <ellipse cx="1240" cy="600" rx="380" ry="160" fill="#ff2d6f" opacity=".22" filter="url(#b4)"/>
    <ellipse cx="560" cy="640" rx="320" ry="60" fill="#3b5bff" opacity=".22" filter="url(#b4)"/>
  </g>
  <g class="auth-wave" filter="url(#b3)" opacity=".95">
    ${BANDS.map((c, i) => `<path d="M ${900 + i * 14} 730 Q ${1300 + i * 12} ${650 - i * 42} 1720 ${610 - i * 80}" stroke="${c}" stroke-width="72" fill="none" stroke-linecap="round"/>`).join('')}
  </g>
  <path d="M -40 590 Q 900 830 1660 660 L 1660 960 L -40 960 Z" fill="#000"/>
  <path d="M -40 590 Q 900 830 1660 660" stroke="url(#hz)" stroke-width="10" fill="none" opacity=".75" filter="url(#b2)"/>
  <path d="M -40 590 Q 900 830 1660 660" stroke="url(#hz)" stroke-width="2.2" fill="none" filter="url(#b1)"/>
</svg></div>`);

/* ── validation ── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validate(mode, v) {
  const e = {};
  if (mode === 'reset') {
    if (!v.password) e.password = 'Choose a new password';
    else if (v.password.length < 6) e.password = 'Use at least 6 characters';
    if (v.confirm !== v.password) e.confirm = 'Passwords don’t match';
    return e;
  }
  if (mode === 'signup') {
    if (!v.firstName?.trim()) e.firstName = 'First name is required';
    if (!v.lastName?.trim()) e.lastName = 'Last name is required';
  }
  if (!v.email?.trim()) e.email = 'Email is required';
  else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email address';
  if (mode === 'signup') {
    const digits = (v.phone || '').replace(/[\s\-()]/g, '');
    const c = COUNTRIES.find((x) => x.code === v.country) || COUNTRIES[0];
    if (digits && !/^\d+$/.test(digits)) e.phone = 'Use digits only';
    else if (digits && (digits.length < c.len[0] || digits.length > c.len[1])) e.phone = `${c.name} numbers have ${c.len[0] === c.len[1] ? c.len[0] : `${c.len[0]}–${c.len[1]}`} digits`;
    if (!v.role) e.role = 'Choose your role';
    if (!v.password) e.password = 'Create a password';
    else if (v.password.length < 6) e.password = 'Use at least 6 characters';
  } else if (mode === 'signin' && !v.password) e.password = 'Enter your password';
  return e;
}

const TITLES = { signup: 'Create an account', signin: 'Welcome back', forgot: 'Reset your password', reset: 'Set a new password' };

/**
 * mode: 'signup' | 'signin' | 'forgot' | 'reset'
 * resetTokens: { access_token, refresh_token } from a Supabase recovery link (mode 'reset')
 */
export function renderAuth(root, { onAuthed, onResetDone, mode: initialMode = 'signin', notice, resetTokens } = {}) {
  const state = {
    mode: initialMode,
    values: { firstName: '', lastName: '', email: '', phone: '', country: 'IN', role: '', password: '', confirm: '' },
    errors: {}, touched: {}, showPw: false, busy: false, banner: notice || null,
  };

  mount(root, html`<main class="auth">
    ${BG}
    <div class="glass" role="region" aria-label="Account">
      <div class="auth-seg" data-mode="${state.mode}" role="tablist">
        <span class="auth-seg-thumb"></span>
        <button class="auth-seg-btn" role="tab" data-mode-btn="signup">Sign up</button>
        <button class="auth-seg-btn" role="tab" data-mode-btn="signin">Sign in</button>
      </div>
      <h1 class="auth-title" id="auth-title"></h1>
      <div class="auth-body" id="auth-body"></div>
      <div class="a-divider">OR SIGN IN WITH</div>
      <button type="button" class="a-social" data-google>${GOOGLE}<span>Continue with Google</span></button>
      <p class="a-foot" id="auth-foot"></p>
    </div>
  </main>`);

  const seg = $('.auth-seg', root);
  const body = $('#auth-body', root);

  function field(name, { placeholder, type = 'text', icon, autocomplete }) {
    const err = state.errors[name];
    return html`<div class="a-field">
      <div class="a-control ${err ? 'invalid' : ''}">
        ${icon ? Icon(icon) : ''}
        <input class="a-input" name="${name}" type="${type}" placeholder="${placeholder}" value="${state.values[name]}" autocomplete="${autocomplete || 'off'}" aria-invalid="${!!err}" ${err ? raw(`aria-describedby="err-${name}"`) : ''}>
      </div>
      ${err ? html`<span class="a-error" id="err-${name}">${err}</span>` : ''}
    </div>`;
  }

  function passwordField(autocomplete, name = 'password', placeholder) {
    const err = state.errors[name];
    placeholder ||= { signup: 'Create a password', reset: 'New password' }[state.mode] || 'Password';
    return html`<div class="a-field">
      <div class="a-control ${err ? 'invalid' : ''}">
        ${Icon('lock')}
        <input class="a-input" name="${name}" type="${state.showPw ? 'text' : 'password'}" placeholder="${placeholder}" value="${state.values[name]}" autocomplete="${autocomplete}" aria-invalid="${!!err}">
        <button type="button" class="eye" data-eye aria-label="${state.showPw ? 'Hide password' : 'Show password'}">${Icon(state.showPw ? 'eye-off' : 'eye')}</button>
      </div>
      ${err ? html`<span class="a-error">${err}</span>` : ''}
    </div>`;
  }

  function formMarkup() {
    const resend = state.banner?.resend
      ? html` <button type="button" class="a-link" data-resend style="display:inline;padding:0;font-weight:600;text-decoration:underline">Resend email</button>`
      : '';
    const banner = state.banner ? html`<div class="a-banner ${state.banner.type}" role="alert">${Icon(state.banner.type === 'ok' ? 'circle-check' : 'circle-alert')}<span>${state.banner.text}${resend}</span></div>` : '';
    const label = { signup: 'Create an account', signin: 'Sign in', forgot: 'Send reset link', reset: 'Update password' }[state.mode];
    const submit = html`<button class="a-primary" type="submit" ${state.busy ? raw('disabled') : ''}>${state.busy ? raw('<span class="spinner"></span>') : ''}${label}</button>`;
    const back = html`<div class="a-row-end" style="justify-content:center;margin-top:4px"><button type="button" class="a-link" data-back>← Back to sign in</button></div>`;
    if (state.mode === 'forgot') {
      return html`<form class="auth-form" novalidate>
        ${banner}
        <p class="a-link" style="margin:-8px 0 2px;cursor:default">Enter your account email and we’ll send you a link to choose a new password.</p>
        ${field('email', { placeholder: 'Enter your email', type: 'email', icon: 'mail', autocomplete: 'email' })}
        ${submit}${back}
      </form>`;
    }
    if (state.mode === 'reset') {
      return html`<form class="auth-form" novalidate>
        ${banner}
        ${passwordField('new-password')}
        ${passwordField('new-password', 'confirm', 'Confirm new password')}
        ${submit}${back}
      </form>`;
    }
    if (state.mode === 'signin') {
      return html`<form class="auth-form" novalidate>
        ${banner}
        ${field('email', { placeholder: 'Enter your email', type: 'email', icon: 'mail', autocomplete: 'email' })}
        ${passwordField('current-password')}
        <div class="a-row-end"><button type="button" class="a-link" data-forgot>Forgot password?</button></div>
        ${submit}
      </form>`;
    }
    const c = COUNTRIES.find((x) => x.code === state.values.country);
    const phoneErr = state.errors.phone;
    const roleErr = state.errors.role;
    return html`<form class="auth-form" novalidate>
      ${banner}
      <div class="a-row">
        ${field('firstName', { placeholder: 'First name', autocomplete: 'given-name' })}
        ${field('lastName', { placeholder: 'Last name', autocomplete: 'family-name' })}
      </div>
      ${field('email', { placeholder: 'Enter your email', type: 'email', icon: 'mail', autocomplete: 'email' })}
      <div class="a-field">
        <div class="a-control ${phoneErr ? 'invalid' : ''}">
          <label class="cc" title="${c.name}">
            <span class="flag">${raw(FLAGS[c.code])}</span><span class="dial">${c.dial}</span>${Icon('chevron-down')}
            <select name="country" aria-label="Country code">${COUNTRIES.map((x) => html`<option value="${x.code}" ${x.code === c.code ? raw('selected') : ''}>${x.name} (${x.dial})</option>`)}</select>
          </label>
          <input class="a-input" name="phone" type="tel" inputmode="tel" placeholder="${c.ph}" value="${state.values.phone}" autocomplete="tel-national" aria-invalid="${!!phoneErr}">
        </div>
        ${phoneErr ? html`<span class="a-error">${phoneErr}</span>` : ''}
      </div>
      <div class="a-field">
        <div class="a-control ${roleErr ? 'invalid' : ''}">
          ${Icon('graduation-cap')}
          <select class="a-input" name="role" aria-label="Role" style="${state.values.role ? '' : 'color:rgba(255,255,255,.36)'}">
            <option value="" ${!state.values.role ? raw('selected') : ''} disabled>Select your role</option>
            ${[['student', 'Student'], ['teacher', 'Teacher'], ['admin', 'Admin']].map(([v, l]) => html`<option value="${v}" ${state.values.role === v ? raw('selected') : ''}>${l}</option>`)}
          </select>
          ${raw('<i data-lucide="chevron-down" class="chev"></i>')}
        </div>
        ${roleErr ? html`<span class="a-error">${roleErr}</span>` : ''}
      </div>
      ${passwordField('new-password')}
      ${submit}
    </form>`;
  }

  function paint({ animate = false, dir = 12 } = {}) {
    seg.dataset.mode = state.mode;
    $$('.auth-seg-btn', root).forEach((b) => {
      const on = b.dataset.modeBtn === state.mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    $('#auth-title', root).textContent = TITLES[state.mode];
    // The sign up / sign in toggle and social login don't apply to the password-reset screens.
    const recovery = state.mode === 'forgot' || state.mode === 'reset';
    [seg, $('.a-divider', root), $('[data-google]', root), $('#auth-foot', root)].forEach((el) => { el.hidden = recovery; });
    $('#auth-foot', root).innerHTML = state.mode === 'signup'
      ? 'By creating an account, you agree to our <a href="#" data-terms>Terms &amp; Service</a>'
      : 'By signing in, you agree to our <a href="#" data-terms>Terms &amp; Service</a>';

    const focused = document.activeElement?.name;
    const caret = document.activeElement?.selectionStart;
    if (!animate) {
      mount(body, formMarkup());
      if (focused) {
        const el = $(`[name="${focused}"]`, body);
        el?.focus();
        try { if (caret != null && el?.setSelectionRange) el.setSelectionRange(caret, caret); } catch {}
      }
      return;
    }
    // Smooth swap: fade/slide the old form out, then animate height to the new one.
    const old = $('.auth-form', body);
    const from = body.offsetHeight;
    body.style.height = from + 'px';
    old?.style.setProperty('--dir', `${dir}px`);
    old?.classList.add('leave');
    setTimeout(() => {
      mount(body, formMarkup());
      const form = $('.auth-form', body);
      form.style.setProperty('--dir', `${dir}px`);
      form.classList.add('enter');
      const to = form.offsetHeight;
      body.style.height = from + 'px';
      requestAnimationFrame(() => { body.style.height = to + 'px'; });
      setTimeout(() => { body.style.height = ''; }, 320);
      $('input', form)?.focus({ preventScroll: true });
    }, 130);
  }

  function setMode(mode) {
    if (mode === state.mode || state.busy) return;
    const dir = mode === 'signup' || (mode === 'signin' && state.mode !== 'signup') ? -14 : 14;
    state.mode = mode; state.errors = {}; state.touched = {}; state.banner = null; state.values.password = ''; state.values.confirm = '';
    paint({ animate: true, dir });
  }

  function revalidate(name) {
    const all = validate(state.mode, state.values);
    if (state.touched[name]) {
      const before = state.errors[name];
      if (all[name]) state.errors[name] = all[name]; else delete state.errors[name];
      return before !== state.errors[name];
    }
    return false;
  }

  async function submit() {
    const errs = validate(state.mode, state.values);
    Object.keys(state.values).forEach((k) => { state.touched[k] = true; });
    state.errors = errs; state.banner = null;
    if (Object.keys(errs).length) {
      paint();
      $('[aria-invalid="true"]', body)?.focus();
      return;
    }
    state.busy = true; paint();
    const v = state.values;
    const email = v.email.trim().toLowerCase();
    try {
      if (state.mode === 'forgot') {
        const data = await api('POST', '/auth/forgot-password', { email });
        state.busy = false;
        state.banner = { type: 'ok', text: data.message || 'If that email is registered, a reset link has been sent.' };
        paint();
        return;
      }
      if (state.mode === 'reset') {
        await api('POST', '/auth/reset-password', { access_token: resetTokens?.access_token, refresh_token: resetTokens?.refresh_token, password: v.password });
        onResetDone?.();
        state.busy = false; state.mode = 'signin'; state.values.password = ''; state.values.confirm = '';
        state.errors = {}; state.touched = {};
        state.banner = { type: 'ok', text: 'Password updated. Sign in with your new password.' };
        paint({ animate: true, dir: -14 });
        return;
      }
      if (state.mode === 'signup') {
        // The server knows two roles; Admin accounts get teacher permissions.
        const role = v.role === 'student' ? 'student' : 'teacher';
        const data = await api('POST', '/auth/signup', { email, password: v.password, role });
        saveProfile(email, {
          firstName: v.firstName.trim(), lastName: v.lastName.trim(), title: v.role,
          phone: v.phone ? `${COUNTRIES.find((x) => x.code === v.country).dial} ${v.phone.trim()}` : '',
        });
        // Signing up never logs you in: verify the email, then sign in with your credentials.
        state.busy = false; state.mode = 'signin'; state.values.password = '';
        state.banner = { type: 'ok', text: data.message || 'Account created. Confirm your email, then sign in.', resend: true };
        state.errors = {}; state.touched = {};
        paint({ animate: true, dir: 14 });
        return;
      } else {
        const data = await api('POST', '/auth/login', { email, password: v.password });
        saveAuth({ token: data.access_token, user: data.user });
      }
      onAuthed?.();
    } catch (e) {
      state.busy = false;
      state.banner = {
        type: 'err',
        text: isNetworkError(e) ? 'Can’t reach the server right now. Check your connection and try again.' : e.message,
        resend: e.code === 'email_not_confirmed',
      };
      paint();
    }
  }

  async function resendConfirmation() {
    const email = state.values.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      state.banner = { type: 'err', text: 'Enter your email above, then tap Resend email.' };
      return paint();
    }
    if (state.busy) return;
    state.busy = true; paint();
    try {
      const data = await api('POST', '/auth/resend-confirmation', { email });
      state.banner = { type: 'ok', text: data.message };
    } catch (e) {
      state.banner = { type: 'err', text: isNetworkError(e) ? 'Can’t reach the server right now. Try again.' : e.message, resend: true };
    }
    state.busy = false; paint();
  }

  /* events */
  root.addEventListener('click', (e) => {
    const t = e.target;
    const modeBtn = t.closest('[data-mode-btn]');
    if (modeBtn) return setMode(modeBtn.dataset.modeBtn);
    if (t.closest('[data-eye]')) { state.showPw = !state.showPw; paint(); $('[name="password"]', body)?.focus(); return; }
    if (t.closest('[data-resend]')) return resendConfirmation();
    if (t.closest('[data-forgot]')) return setMode('forgot');
    if (t.closest('[data-back]')) return setMode('signin');
    if (t.closest('[data-google]')) {
      // The server forwards to Google; Google returns here with a session in the URL (handled in app.js).
      const g = t.closest('[data-google]');
      g.disabled = true;
      g.querySelector('span').textContent = 'Opening Google…';
      location.href = '/api/auth/google';
      return;
    }
    if (t.closest('[data-terms]')) { e.preventDefault(); }
  });
  root.addEventListener('input', (e) => {
    const n = e.target.name;
    if (!n || !(n in state.values)) return;
    state.values[n] = e.target.value;
    if (n === 'country' || n === 'role') { state.touched[n] = true; revalidate(n); paint(); return; }
    if (revalidate(n)) paint();
  });
  root.addEventListener('focusout', (e) => {
    const n = e.target.name;
    if (!n || !(n in state.values) || !e.target.value) return;
    state.touched[n] = true;
    if (revalidate(n)) setTimeout(() => paint(), 0);
  });
  root.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  paint();
}
