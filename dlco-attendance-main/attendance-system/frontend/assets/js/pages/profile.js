/* Profile + Settings (from the avatar menu). */
import { html, raw, mount, $, on } from '../core/html.js';
import * as svc from '../data/services.js';
import { getAuth } from '../core/api.js';
import { Card, Avatar, Button, Icon, toast } from '../components.js';
import { getProfile, saveProfile } from '../auth.js';
import { roleLabel } from '../shell.js';

export default async function profilePage(root, ctx) {
  const user = getAuth().user;
  const p = getProfile(user.email) || {};
  const me = svc.me();

  if (ctx.route === 'profile') {
    mount(root, html`
      <div class="page-head"><div><h1 class="page-title">Profile</h1><p class="page-sub">How you appear across the app.</p></div></div>
      <div class="grid-main">
        ${Card({
          title: 'Your details',
          body: html`<form id="pf" class="form-grid" novalidate>
            <div class="field"><label for="p-first">First name</label><input id="p-first" class="input" name="firstName" value="${p.firstName || ''}"></div>
            <div class="field"><label for="p-last">Last name</label><input id="p-last" class="input" name="lastName" value="${p.lastName || ''}"></div>
            <div class="field full"><label for="p-phone">Phone</label><input id="p-phone" class="input" name="phone" value="${p.phone || ''}" placeholder="+91 98765 43210"></div>
            <div class="field full"><label>Email</label><input class="input" value="${user.email}" disabled></div>
            <p class="full note" style="margin:0">${Icon('info')} Name and phone are kept in this browser — the server only stores your email and role.</p>
            <div class="full row" style="justify-content:flex-end">${Button('Save', { variant: 'primary', icon: 'check', type: 'submit' })}</div>
          </form>`,
        })}
        <section class="card lavender" style="text-align:center">
          <div style="display:grid;place-items:center;gap:10px;padding:10px 0">
            ${Avatar(ctx.name, { size: 'xl', seed: user.email })}
            <div><div class="tile-name">${ctx.name}</div><div class="tile-meta">${user.email}</div></div>
            <span class="pill pill-leave">${roleLabel(user)}</span>
            ${me ? html`<div class="tile-meta">${me.roll} · ${me.cls}</div>` : ''}
          </div>
        </section>
      </div>`);
    const off = on(root, 'submit', '#pf', (e, form) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      saveProfile(user.email, { firstName: d.firstName.trim(), lastName: d.lastName.trim(), phone: d.phone.trim() });
      toast('Profile saved — refresh to update the avatar menu');
    });
    return off;
  }

  const src = svc.getSource();
  const prefs = svc.getPrefs();
  mount(root, html`
    <div class="page-head"><div><h1 class="page-title">Settings</h1><p class="page-sub">Data source and demo options.</p></div></div>
    <div class="stack" style="max-width:720px">
      ${Card({
        title: 'Data source',
        body: html`<dl class="kv">
          <dt>Currently using</dt><dd>${src === 'mock' ? 'Generated demo data' : 'Your server (Express + Supabase)'}</dd>
          <dt>Signed in as</dt><dd>${user.email} (${user.role})</dd>
        </dl>
        <label class="row" style="margin-top:18px;gap:10px;cursor:pointer">
          <input type="checkbox" data-demo ${prefs.demo || getAuth().demo ? raw('checked') : ''} ${getAuth().demo ? raw('disabled') : ''}>
          <span><b>Use demo data</b><div class="c-muted" style="font-size:12.5px">Preview the app with 184 generated students. Nothing is sent to the server.</div></span>
        </label>`,
      })}
      ${src === 'mock' ? Card({
        title: 'Demo data',
        sub: 'Changes you make in demo mode are saved in this browser.',
        actions: Button('Reset demo data', { variant: 'danger', icon: 'rotate-ccw', action: 'reset-demo' }),
      }) : ''}
    </div>`);
  const offs = [
    on(root, 'change', '[data-demo]', (_, el) => { svc.setPref('demo', el.checked); location.reload(); }),
    on(root, 'click', '[data-action="reset-demo"]', () => { svc.resetDemo(); toast('Demo data reset'); setTimeout(() => location.reload(), 600); }),
  ];
  return () => offs.forEach((f) => f());
}
