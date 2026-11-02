/* Equipment Inventory — single-page app on Supabase */
(() => {
'use strict';
const CFG = window.APP_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ---------------------------------------------------------------- state
const S = {
  session: null, profile: null, recovery: false,
  depts: [], cats: [], locs: [], people: {},
  items: null, pending: 0,
  inv: { q: '', dept: '', cat: '', type: '', loc: '', view: 'all', sel: new Set() },
  co: { view: 'open', q: '' },
  act: { type: '', from: '', to: '', q: '', rows: [], done: false },
  certs: { view: 'soon' },
  shellReady: false, channel: null,
};

// ---------------------------------------------------------------- helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (v === null || v === undefined || v === '') ? null : Number(v);
const fq = n => n == null ? '—' : (+n).toLocaleString('en-GB', { maximumFractionDigits: 2 });
const fd = d => d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fdt = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const localISO = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const isAdmin = () => S.profile?.role === 'admin';
const isActive = () => ['admin', 'staff'].includes(S.profile?.role);
const locName = id => S.locs.find(l => l.id === id)?.name || '—';
const STATUS = { available: 'Available', reserved: 'Reserved', in_transit: 'In transit', damaged: 'Damaged' };
const TYPES = { equipment: 'Equipment (returns)', consumable: 'Consumable', sales: 'Sales item' };
const TYPE_SHORT = { equipment: 'Equipment', consumable: 'Consumable', sales: 'Sales' };
const CERT_KINDS = { certification: 'Certification', calibration: 'Calibration', maintenance: 'Maintenance', inspection: 'Inspection', pressure_test: 'Pressure test' };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const tag = (code, cls = '') => code ? `<span class="tag ${cls}">${esc(code)}</span>` : `<span class="tag none ${cls}">No code</span>`;
const chip = (cls, text) => `<span class="chip ${cls}">${esc(text)}</span>`;
const ORG = CFG.ORG_SHORT || 'GANKCO';
const wordmark = () => `<span class="wordmark"><span class="a">${esc(ORG.slice(0, 3))}</span><span class="b">${esc(ORG.slice(3))}</span></span>`;
const itemUrl = id => `${location.origin}${location.pathname}#/item/${id}`;

function niceError(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/permission denied|row-level security/i.test(m)) return 'You don’t have permission to do that.';
  if (/JWT expired|invalid JWT/i.test(m)) return 'Your sign-in expired. Sign in again.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Can’t reach the server. Check your internet connection and try again.';
  return m.replace(/^.*?ERROR:\s*/, '');
}
async function q(p) { const { data, error } = await p; if (error) throw new Error(niceError(error)); return data; }
async function fetchAll(make) {
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const rows = await q(make().range(from, from + size - 1));
    out.push(...rows); if (rows.length < size) break;
  }
  return out;
}
function toast(msg, bad = false) {
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), bad ? 6000 : 3200);
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if ($(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}
function go(h) { if (location.hash === h) render(); else location.hash = h; }

// ---------------------------------------------------------------- icons
const I = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/>',
  out: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cert: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
  label: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><path d="M7 14h10v7H7z"/>',
};
const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

// ---------------------------------------------------------------- modal
function modal({ title, sub = '', body, submit = 'Save', cancel = 'Cancel', onSubmit, onOpen, danger = false }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'modal';
    d.innerHTML = `<form method="dialog" novalidate>
      <div class="mh"><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
      <div class="mb"><div class="err" hidden></div>${body}</div>
      <div class="mf"><button type="button" class="btn" data-x>${esc(cancel)}</button>
      <button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(submit)}</button></div></form>`;
    document.body.appendChild(d);
    const f = $('form', d), err = $('.err', d), btn = $('button[type=submit]', d);
    const close = v => { d.close(); d.remove(); resolve(v); };
    $('[data-x]', d).onclick = () => close(null);
    d.addEventListener('cancel', e => { e.preventDefault(); close(null); });
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true; btn.disabled = true;
      const data = Object.fromEntries(new FormData(f).entries());
      $$('input[type=checkbox]', f).forEach(c => { if (c.name) data[c.name] = c.checked; });
      try { const r = await onSubmit(data, d); close(r ?? true); }
      catch (ex) { err.textContent = niceError(ex); err.hidden = false; btn.disabled = false; d.querySelector('.mb').scrollTop = 0; }
    };
    d.showModal();
    if (onOpen) onOpen(d);
    const first = $('input:not([type=hidden]):not([type=checkbox]),select,textarea', d); if (first && !first.readOnly) first.focus();
  });
}
const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(sel) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
const locOptions = (sel, filter) => S.locs.filter(l => l.active && (!filter || filter(l))).map(l => opt(l.id, l.name, sel)).join('');

// ---------------------------------------------------------------- data
async function loadLookups() {
  const [depts, cats, locs, people] = await Promise.all([
    q(sb.from('departments').select('*').order('sort')),
    q(sb.from('categories').select('*').order('sort')),
    q(sb.from('locations').select('*').order('name')),
    q(sb.from('profiles').select('id,full_name,email,role')),
  ]);
  S.depts = depts; S.cats = cats; S.locs = locs;
  S.people = Object.fromEntries(people.map(p => [p.id, p]));
}
async function items(force = false) {
  if (!S.items || force) {
    S.items = await fetchAll(() => sb.from('item_overview').select('*').order('department_id').order('import_ref', { nullsFirst: false }).order('id'));
  }
  return S.items;
}
async function refreshPending() {
  if (!isAdmin()) { S.pending = 0; return; }
  const { count } = await sb.from('adjustments').select('id', { count: 'exact', head: true }).eq('state', 'pending');
  S.pending = count || 0;
  const c = $('#pendingCount'); if (c) { c.textContent = S.pending; c.hidden = !S.pending; }
}
function invalidate() { S.items = null; }

// ---------------------------------------------------------------- realtime
function subscribe() {
  if (S.channel) return;
  const onChange = debounce(() => {
    invalidate(); refreshPending();
    if (!document.querySelector('dialog[open]') && document.visibilityState === 'visible') render({ quiet: true });
  }, 900);
  try {
    S.channel = sb.channel('inventory-live');
    ['stock', 'checkouts', 'movements', 'adjustments', 'items'].forEach(t =>
      S.channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange));
    S.channel.subscribe();
  } catch (e) { console.warn('Live updates unavailable', e); }
}

// ---------------------------------------------------------------- auth
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') S.recovery = true;
  const changed = (session?.user?.id || null) !== (S.session?.user?.id || null);
  S.session = session;
  if (event === 'SIGNED_OUT') { S.profile = null; S.items = null; S.shellReady = false; if (S.channel) { sb.removeChannel(S.channel); S.channel = null; } }
  if (event === 'INITIAL_SESSION' || changed || event === 'PASSWORD_RECOVERY' || event === 'SIGNED_OUT') setTimeout(boot, 0);
});

async function boot() {
  if (S.recovery) return renderReset();
  if (!S.session) return renderAuth('signin');
  try {
    S.profile = await q(sb.from('profiles').select('*').eq('id', S.session.user.id).maybeSingle());
  } catch (e) { return renderAuth('signin', niceError(e)); }
  if (!isActive()) return renderPending();
  await loadLookups();
  refreshPending();
  subscribe();
  S.shellReady = false;
  render();
}

function authShell(inner) {
  $('#app').innerHTML = `<div class="auth">
    <div class="auth-art">
      <img class="eagle" src="brand/mark.png" alt="">
      <div class="lockup">${wordmark()}<div class="sublock">INVENTORY MANAGEMENT</div>
        ${CFG.MOTTO ? `<div class="motto">${esc(CFG.MOTTO)}</div>` : ''}</div>
      <div class="foot"><span>${esc(CFG.COMPANY || '')}</span><span>Every tool, every well, every day.</span></div></div>
    <div class="auth-form">${inner}</div></div>`;
}

function renderAuth(mode = 'signin', message = '', ok = false) {
  S.shellReady = false;
  const note = message ? `<div class="notice ${ok ? 'ok' : 'bad'}">${esc(message)}</div>` : '';
  if (mode === 'signin') authShell(`<form id="f">
      <h1>Sign in</h1><p class="sub">Use the email and password you registered with.</p>${note}
      <label class="f">Email<input type="email" name="email" autocomplete="email" required></label>
      <label class="f">Password<input type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">Sign in</button>
      <div class="alt"><a href="#" data-m="signup">Create an account</a><a href="#" data-m="forgot">Forgot password?</a></div></form>`);
  if (mode === 'signup') authShell(`<form id="f">
      <h1>Create an account</h1><p class="sub">An admin approves new accounts before they can see the inventory.</p>${note}
      <label class="f">Full name<input type="text" name="name" autocomplete="name" required></label>
      <label class="f">Email<input type="email" name="email" autocomplete="email" required></label>
      <label class="f">Password<span class="hint">At least 8 characters.</span><input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn primary" type="submit">Create account</button>
      <div class="alt"><a href="#" data-m="signin">I already have an account</a></div></form>`);
  if (mode === 'forgot') authShell(`<form id="f">
      <h1>Reset password</h1><p class="sub">We’ll email you a link to set a new password.</p>${note}
      <label class="f">Email<input type="email" name="email" autocomplete="email" required></label>
      <button class="btn primary" type="submit">Send reset link</button>
      <div class="alt"><a href="#" data-m="signin">Back to sign in</a></div></form>`);
  $$('[data-m]').forEach(a => a.onclick = e => { e.preventDefault(); renderAuth(a.dataset.m); });
  const f = $('#f');
  f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)); const b = $('button[type=submit]', f); b.disabled = true;
    try {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email: d.email.trim(), password: d.password });
        if (error) throw new Error(/invalid login/i.test(error.message) ? 'Wrong email or password.' : /not confirmed/i.test(error.message) ? 'Confirm your email first: open the link we sent you.' : error.message);
      } else if (mode === 'signup') {
        if (d.password.length < 8) throw new Error('Use at least 8 characters for the password.');
        const { data, error } = await sb.auth.signUp({ email: d.email.trim(), password: d.password,
          options: { data: { full_name: d.name.trim() }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) return renderAuth('signin', 'Account created. Check your email for a confirmation link, then sign in.', true);
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(d.email.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        return renderAuth('signin', 'If that email has an account, a reset link is on its way.', true);
      }
    } catch (ex) { b.disabled = false; renderAuth(mode, niceError(ex)); }
  };
}

function renderReset() {
  authShell(`<form id="f"><h1>Set a new password</h1><p class="sub">Choose a password you haven’t used here before.</p>
    <label class="f">New password<input type="password" name="password" minlength="8" autocomplete="new-password" required></label>
    <button class="btn primary" type="submit">Save password</button></form>`);
  $('#f').onsubmit = async e => {
    e.preventDefault(); const p = new FormData(e.target).get('password');
    if (p.length < 8) return toast('Use at least 8 characters.', true);
    const { error } = await sb.auth.updateUser({ password: p });
    if (error) return toast(niceError(error), true);
    S.recovery = false; history.replaceState(null, '', location.pathname + '#/'); toast('Password saved'); boot();
  };
}

function renderPending() {
  const disabled = S.profile?.role === 'disabled';
  authShell(`<div class="card">
    <h1>${disabled ? 'Access removed' : 'Waiting for approval'}</h1>
    <p class="sub">${disabled ? 'An admin has turned off access for this account. Contact your admin if this is a mistake.'
      : 'Your account is set up. An admin needs to approve it before you can see the inventory. Ask your admin to open <b>Team</b> and approve you.'}</p>
    <p class="muted">Signed in as ${esc(S.session.user.email)}</p>
    <div class="actionrow"><button class="btn primary" id="again">Check again</button><button class="btn" id="out">Sign out</button></div></div>`);
  $('#again').onclick = boot; $('#out').onclick = () => sb.auth.signOut();
}

// ---------------------------------------------------------------- shell
const NAV = [
  ['dashboard', 'Overview', 'home'], ['inventory', 'Inventory', 'box'], ['scan', 'Scan', 'scan'],
  ['checkouts', 'Out on jobs', 'out'], ['certs', 'Certificates', 'cert'], ['activity', 'Activity', 'clock'],
  ['approvals', 'Approvals', 'check'],
];
const NAV2 = [['locations', 'Locations', 'pin'], ['team', 'Team', 'users'], ['labels', 'Labels', 'label'], ['account', 'My account', 'user']];

function shell() {
  if (S.shellReady) return;
  const p = S.profile;
  $('#app').innerHTML = `<div class="shell">
    <aside class="side">
      <a class="brand" href="#/"><img src="brand/mark-96.png" alt="">
        <span class="brand-name">${wordmark()}<small>Inventory Management</small></span></a>
      <nav class="nav">${NAV.map(([r, l, i]) => `<a href="#/${r}" data-r="${r}">${ico(i)}${l}${r === 'approvals' ? `<span class="count" id="pendingCount" ${S.pending ? '' : 'hidden'}>${S.pending}</span>` : ''}</a>`).join('')}
        <div class="nav-group">Setup</div>
        ${NAV2.map(([r, l, i]) => `<a href="#/${r}" data-r="${r}">${ico(i)}${l}</a>`).join('')}</nav>
      <div class="side-foot">${CFG.MOTTO ? `<div class="motto">${esc(CFG.MOTTO)}</div>` : ''}<div class="who">${esc(p.full_name || p.email)}</div><div class="role">${p.role === 'admin' ? 'Admin' : 'Staff'}</div>
        <a href="#" id="signout">Sign out</a></div>
    </aside>
    <main id="main"></main>
    <nav class="bottombar">
      <a href="#/dashboard" data-r="dashboard">${ico('home')}Overview</a>
      <a href="#/inventory" data-r="inventory">${ico('box')}Inventory</a>
      <a href="#/scan" data-r="scan" class="scan"><span class="disc">${ico('scan')}</span>Scan</a>
      <a href="#/checkouts" data-r="checkouts">${ico('out')}Out</a>
      <a href="#/more" data-r="more">${ico('more')}More</a>
    </nav></div>`;
  $('#signout').onclick = e => { e.preventDefault(); sb.auth.signOut(); };
  S.shellReady = true;
}
function setNav(r) { $$('[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === r)); }

const routes = () => ({
  '': viewDashboard, dashboard: viewDashboard, inventory: viewInventory, item: viewItem, scan: viewScan,
  checkouts: viewCheckouts, certs: viewCerts, activity: viewActivity, approvals: viewApprovals,
  locations: viewLocations, team: viewTeam, labels: viewLabels, account: viewAccount, more: viewMore,
});
let renderSeq = 0;
async function render(opts = {}) {
  if (!S.session || !isActive()) return;
  shell(); stopScanner();
  const { parts, params } = parseHash();
  const r = parts[0] || '';
  const R = routes(); const view = R[r] || R.dashboard;
  setNav(r || 'dashboard');
  const main = $('#main'); const seq = ++renderSeq;
  const y = window.scrollY;
  if (!opts.quiet) main.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const html = await view.load(parts, params);
    if (seq !== renderSeq) return;
    main.innerHTML = html + `<div class="pagefoot">${esc(CFG.APP_NAME)}${CFG.MOTTO ? ' · ' + esc(CFG.MOTTO) : ''} · v${esc(CFG.VERSION || '1.0')}</div>`;
    view.bind && view.bind(main, parts, params);
    if (opts.quiet) window.scrollTo(0, y); else window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (seq === renderSeq) main.innerHTML = `<div class="notice bad">${esc(niceError(e))}</div><button class="btn" onclick="location.reload()">Reload</button>`;
  }
}
window.addEventListener('hashchange', () => render());
const refresh = () => { invalidate(); render({ quiet: true }); };

// ---------------------------------------------------------------- shared bits
function topbar(title, sub = '', actions = '') {
  return `<div class="topbar"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
function statusChips(it) {
  const c = [];
  if (+it.qty_out) c.push(chip('out', `${fq(it.qty_out)} out`));
  if (+it.qty_reserved) c.push(chip('reserved', `${fq(it.qty_reserved)} reserved`));
  if (+it.qty_in_transit) c.push(chip('in_transit', `${fq(it.qty_in_transit)} in transit`));
  if (+it.qty_damaged) c.push(chip('damaged', `${fq(it.qty_damaged)} damaged`));
  if (it.is_low) c.push(chip('low', 'Low'));
  else if (it.item_type !== 'equipment' && +it.qty_available === 0) c.push(chip('low', 'None left'));
  return c.join(' ');
}
function dueChip(due) {
  if (!due) return '';
  const t = localISO(0), soon = localISO(30);
  if (due < t) return chip('overdue', 'Overdue');
  if (due <= soon) return chip('soon', 'Due soon');
  return chip('ok', 'Valid');
}
function needsReorder(it) { return it.active && (it.is_low || (it.item_type !== 'equipment' && +it.qty_available === 0)); }
function personName(id, fallback = '') { const p = S.people[id]; return p ? (p.full_name || p.email) : fallback; }

function describeMove(m) {
  const n = fq(Math.abs(m.qty)), fl = locName(m.from_location_id), tl = locName(m.to_location_id);
  switch (m.type) {
    case 'opening': return `Opening balance of ${n} at ${tl}`;
    case 'receive': return `Received ${n} into ${tl}${m.to_status && m.to_status !== 'available' ? ` (${STATUS[m.to_status].toLowerCase()})` : ''}`;
    case 'checkout': return `Checked out ${n} to ${m.ref || 'a job'}`;
    case 'return': return `Returned ${n} to ${tl}${m.to_status === 'damaged' ? ' as damaged' : ''}${m.ref ? ` from ${m.ref}` : ''}`;
    case 'transfer': return `Moved ${n} from ${fl} to ${tl}${m.to_status === 'in_transit' ? ' (in transit)' : ''}`;
    case 'status': return `${n} at ${fl} changed from ${(STATUS[m.from_status] || '').toLowerCase()} to ${(STATUS[m.to_status] || '').toLowerCase()}`;
    case 'issue': return `Issued ${n} for ${m.ref}`;
    case 'sale': return `Sold ${n} to ${m.ref}`;
    case 'adjust': return `Stock count at ${fl}: ${m.qty > 0 ? '+' : '−'}${n}`;
    case 'writeoff': return `Wrote off ${n} at ${fl}`;
    case 'certificate': return `Recorded ${m.ref || 'certificate'}`;
    default: return `${m.type} ${n}`;
  }
}
const MOVE_TYPES = { receive: 'Received', checkout: 'Checked out', return: 'Returned', transfer: 'Moved', status: 'Status change', issue: 'Issued', sale: 'Sold', adjust: 'Stock count', writeoff: 'Write-off', certificate: 'Certificate', opening: 'Opening balance' };

// ================================================================ DASHBOARD
const viewDashboard = {
  async load() {
    const soon = localISO(30), t = localISO(0);
    const [its, cos, certs, moves] = await Promise.all([
      items(),
      q(sb.from('checkouts').select('*, items(code,name)').is('closed_at', null).order('due_back', { nullsFirst: false })),
      q(sb.from('certifications').select('*, items(code,name)').eq('superseded', false).not('due_on', 'is', null).lte('due_on', soon).order('due_on')),
      q(sb.from('movements').select('*, items(code,name)').order('created_at', { ascending: false }).limit(8)),
      refreshPending(),
    ]);
    const active = its.filter(i => i.active);
    const low = active.filter(needsReorder);
    const overdue = cos.filter(c => c.due_back && c.due_back < t);
    const certBad = certs.filter(c => c.due_on < t);
    const first = (S.profile.full_name || '').split(' ')[0];
    const k = (href, n, l, cls = '') => `<a href="${href}" class="${n ? cls : ''}"><div class="n">${n}</div><div class="l">${l}</div></a>`;
    const li = (href, main, sub, end = '') => `<li><a class="main" href="${href}"><div class="name">${main}</div><div class="sub">${sub}</div></a><div class="end">${end}</div></li>`;
    return `<section class="hero"><img class="bgmark" src="brand/mark.png" alt="">
      <div>${CFG.MOTTO ? `<div class="motto">${esc(CFG.MOTTO)}</div>` : ''}<h1>${first ? `Good to see you, ${esc(first)}` : 'Overview'}</h1>
      <div class="sub">${active.length} items across ${S.depts.length} departments · ${cos.length} out on jobs right now</div></div>
      <div class="actions"><a class="btn" href="#/scan">${ico('scan')}Scan an item</a><a class="btn tagbtn" href="#/inventory">${ico('box')}Open inventory</a></div></section>` +
      `<div class="board">
        ${k('#/inventory', active.length, 'Items tracked')}
        ${k('#/checkouts', cos.length, 'Out on jobs')}
        ${k('#/checkouts?v=overdue', overdue.length, 'Overdue returns', 'alert')}
        ${k('#/inventory?v=reorder', low.length, 'Need restocking', 'warn')}
        ${k('#/certs', certs.length, certBad.length ? `Certificates due (${certBad.length} overdue)` : 'Certificates due in 30 days', certBad.length ? 'alert' : 'warn')}
        ${k('#/approvals', isAdmin() ? S.pending : '—', isAdmin() ? 'Waiting for your approval' : 'Approvals (admins)', 'warn')}
      </div>
      <div class="cols">
        <section class="panel"><header><h2>Out on jobs</h2><span class="meta">soonest due first</span><div class="right"><a class="btn small" href="#/checkouts">See all</a></div></header>
          ${cos.length ? `<ul class="list">${cos.slice(0, 7).map(c => li(`#/item/${c.item_id}`, `${tag(c.items?.code)} ${esc(c.items?.name)}`,
            `${esc(c.job_ref)}${c.issued_to ? ' / ' + esc(c.issued_to) : ''} · ${fq(c.open_qty)} out`,
            c.due_back ? (c.due_back < t ? chip('overdue', 'Due ' + fd(c.due_back)) : `<span class="sub">Due ${fd(c.due_back)}</span>`) : '<span class="sub">No due date</span>')).join('')}</ul>`
            : '<div class="empty">Nothing is checked out right now.</div>'}</section>
        <section class="panel"><header><h2>Need restocking</h2><span class="meta">at or below reorder level</span><div class="right"><a class="btn small" href="#/inventory?v=reorder">See all</a></div></header>
          ${low.length ? `<ul class="list">${low.slice(0, 7).map(i => li(`#/item/${i.id}`, `${tag(i.code)} ${esc(i.name)}`, `${esc(i.department)} · ${TYPE_SHORT[i.item_type]}`,
            `<b>${fq(i.qty_available)}</b> <span class="sub">left${i.min_qty != null ? ` / min ${fq(i.min_qty)}` : ''}</span>`)).join('')}</ul>`
            : '<div class="empty">No consumables or sales items are below their reorder level. Set a minimum on an item to get alerts.</div>'}</section>
        <section class="panel"><header><h2>Certificates due</h2><span class="meta">next 30 days</span><div class="right"><a class="btn small" href="#/certs">See all</a></div></header>
          ${certs.length ? `<ul class="list">${certs.slice(0, 7).map(c => li(`#/item/${c.item_id}`, `${tag(c.items?.code)} ${esc(c.items?.name)}`,
            `${CERT_KINDS[c.kind]}${c.cert_no ? ' ' + esc(c.cert_no) : ''}`, `${dueChip(c.due_on)} <span class="sub">${fd(c.due_on)}</span>`)).join('')}</ul>`
            : '<div class="empty">No certificates, calibrations or maintenance due in the next 30 days.</div>'}</section>
        <section class="panel"><header><h2>Latest activity</h2><div class="right"><a class="btn small" href="#/activity">See all</a></div></header>
          ${moves.length ? `<ul class="list">${moves.map(m => li(`#/item/${m.item_id}`, `${tag(m.items?.code)} ${esc(m.items?.name)}`,
            `${esc(describeMove(m))}`, `<span class="sub">${esc(m.user_name || '')}<br>${fdt(m.created_at)}</span>`)).join('')}</ul>`
            : '<div class="empty">No activity yet.</div>'}</section>
      </div>`;
  }
};

// ================================================================ INVENTORY
const viewInventory = {
  async load(parts, params) {
    const f = S.inv;
    if (params.get('v')) f.view = params.get('v');
    if (params.get('q') !== null) f.q = params.get('q');
    if ([...params.keys()].length) history.replaceState(null, '', '#/inventory');
    const its = await items();
    this.rows = its;
    return topbar('Inventory', `${its.filter(i => i.active).length} active items`,
      `<button class="btn" id="xls">${ico('down')}Export to Excel</button>${isAdmin() ? `<button class="btn primary" id="add">${ico('plus')}Add item</button>` : ''}`) +
      `<div class="filters">
        <input type="search" id="q" placeholder="Search code or description, or scan a label" value="${esc(f.q)}" autocomplete="off">
        <select id="dept" aria-label="Department"><option value="">All departments</option>${S.depts.map(d => opt(d.id, d.name, f.dept)).join('')}</select>
        <select id="cat" aria-label="Category"><option value="">All categories</option>${S.cats.filter(c => !f.dept || c.department_id == f.dept).map(c => opt(c.id, c.name, f.cat)).join('')}</select>
        <select id="type" aria-label="Type"><option value="">All types</option>${Object.entries(TYPE_SHORT).map(([k, v]) => opt(k, v, f.type)).join('')}</select>
        <select id="loc" aria-label="Location"><option value="">All locations</option>${S.locs.map(l => opt(l.id, l.name, f.loc)).join('')}</select>
      </div>
      <div class="filters"><div class="seg" id="seg">${[['all', 'All'], ['available', 'In store'], ['out', 'Out on jobs'], ['reorder', 'Need restocking'], ['damaged', 'Damaged'], ['zero', 'Zero balance'], ['archived', 'Archived']]
        .map(([k, l]) => `<button type="button" data-v="${k}" class="${f.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="muted" id="shown"></span></div>
      <div id="bulk"></div>
      <section class="panel"><div class="tablewrap"><table class="t stack" id="tbl"><thead><tr>
        <th class="cb"><input type="checkbox" id="all" aria-label="Select all shown"></th><th>Code</th><th>Description</th><th>Type</th>
        <th class="num">In store</th><th>Other</th><th class="num">Total</th><th>Location</th></tr></thead><tbody></tbody></table></div></section>`;
  },
  filtered() {
    const f = S.inv; const qq = f.q.trim().toLowerCase().replace(/\s+/g, ' ');
    const locN = f.loc ? locName(+f.loc) : '';
    return this.rows.filter(i => {
      if (f.view === 'archived' ? i.active : !i.active) return false;
      if (f.dept && i.department_id != f.dept) return false;
      if (f.cat && i.category_id != f.cat) return false;
      if (f.type && i.item_type !== f.type) return false;
      if (locN && !(i.locations || '').split(', ').includes(locN)) return false;
      if (f.view === 'available' && !(+i.qty_available > 0)) return false;
      if (f.view === 'out' && !(+i.qty_out > 0)) return false;
      if (f.view === 'reorder' && !needsReorder(i)) return false;
      if (f.view === 'damaged' && !(+i.qty_damaged > 0)) return false;
      if (f.view === 'zero' && +i.qty_total !== 0) return false;
      if (qq && !(`${i.code || ''} ${i.name} ${i.category || ''} ${i.supplier || ''}`.toLowerCase().includes(qq))) return false;
      return true;
    });
  },
  draw(main) {
    const rows = this.filtered(); const sel = S.inv.sel;
    $('#shown', main).textContent = `${rows.length} shown`;
    $('#tbl tbody', main).innerHTML = rows.length ? rows.map(i => `<tr class="click" data-id="${i.id}">
      <td class="cb"><input type="checkbox" data-sel="${i.id}" ${sel.has(i.id) ? 'checked' : ''} aria-label="Select ${esc(i.name)}"></td>
      <td>${tag(i.code)}</td>
      <td class="full"><div class="name">${esc(i.name)}</div><div class="sub">${esc(i.department)} · ${esc(i.category)}</div></td>
      <td class="hide-m">${TYPE_SHORT[i.item_type]}</td>
      <td class="num qtycell"><b>${fq(i.qty_available)}</b><span class="qlbl">in store</span></td>
      <td>${statusChips(i)}</td>
      <td class="num hide-m">${fq(i.qty_total)}</td>
      <td class="hide-m sub">${esc(i.locations || '—')}</td></tr>`).join('')
      : `<tr><td colspan="8" class="empty">No items match these filters.${S.inv.q ? ' Check the spelling or clear the search.' : ''}</td></tr>`;
    $('#all', main).checked = rows.length > 0 && rows.every(r => sel.has(r.id));
    this.drawBulk(main);
  },
  drawBulk(main) {
    const n = S.inv.sel.size; const b = $('#bulk', main);
    b.innerHTML = n ? `<div class="bulkbar"><b>${n} selected</b>
      <button class="btn small" id="b-labels">${ico('print')}Print labels</button>
      ${isAdmin() ? '<button class="btn small" id="b-edit">Edit selected</button>' : ''}
      <button class="btn small" id="b-clear">Clear</button></div>` : '';
    if (!n) return;
    $('#b-clear', b).onclick = () => { S.inv.sel.clear(); this.draw(main); };
    $('#b-labels', b).onclick = () => { sessionStorage.setItem('labels', JSON.stringify([...S.inv.sel])); go('#/labels'); };
    const e = $('#b-edit', b); if (e) e.onclick = () => bulkEdit([...S.inv.sel]);
  },
  bind(main) {
    const f = S.inv; const redraw = () => this.draw(main);
    const qi = $('#q', main);
    qi.oninput = debounce(() => { f.q = qi.value; redraw(); }, 120);
    qi.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const m = matchCode(qi.value); if (m.length === 1) go('#/item/' + m[0].id); } };
    $('#dept', main).onchange = e => { f.dept = e.target.value; f.cat = ''; render({ quiet: true }); };
    $('#cat', main).onchange = e => { f.cat = e.target.value; redraw(); };
    $('#type', main).onchange = e => { f.type = e.target.value; redraw(); };
    $('#loc', main).onchange = e => { f.loc = e.target.value; redraw(); };
    $$('#seg button', main).forEach(b => b.onclick = () => { f.view = b.dataset.v; $$('#seg button', main).forEach(x => x.classList.toggle('on', x === b)); redraw(); });
    $('#tbl tbody', main).onclick = e => {
      const cb = e.target.closest('[data-sel]');
      if (cb) { const id = +cb.dataset.sel; cb.checked ? f.sel.add(id) : f.sel.delete(id); this.drawBulk(main); e.stopPropagation(); return; }
      if (e.target.closest('td.cb')) return;
      const tr = e.target.closest('tr[data-id]'); if (tr) go('#/item/' + tr.dataset.id);
    };
    $('#all', main).onchange = e => { this.filtered().forEach(r => e.target.checked ? f.sel.add(r.id) : f.sel.delete(r.id)); redraw(); };
    $('#xls', main).onclick = () => exportInventory(this.rows);
    const add = $('#add', main); if (add) add.onclick = () => editItem(null);
    redraw();
  }
};

function matchCode(text) {
  const norm = s => String(s || '').toLowerCase().replace(/[\s’'’]/g, '');
  const t = norm(text); if (!t || !S.items) return [];
  return S.items.filter(i => norm(i.code) === t);
}

// ---------------------------------------------------------------- item editor (admin)
function deptCatFields(it) {
  const dept = it?.department_id || S.depts[0]?.id;
  return `<div class="row2"><label class="f">Department<select name="department_id" id="f-dept">${S.depts.map(d => opt(d.id, d.name, dept)).join('')}</select></label>
    <label class="f">Category<select name="category_id" id="f-cat"></select></label></div>
    <label class="f" id="f-newcat-wrap" hidden>New category name<input type="text" name="new_category"></label>`;
}
function wireDeptCat(d, it) {
  const ds = $('#f-dept', d), cs = $('#f-cat', d), wrap = $('#f-newcat-wrap', d);
  const fill = () => {
    cs.innerHTML = S.cats.filter(c => c.department_id == ds.value).map(c => opt(c.id, c.name, it?.category_id)).join('') + opt('new', '+ New category…');
    wrap.hidden = cs.value !== 'new';
  };
  ds.onchange = fill; cs.onchange = () => { wrap.hidden = cs.value !== 'new'; }; fill();
}
async function resolveCategory(data) {
  if (data.category_id !== 'new') return +data.category_id;
  const name = (data.new_category || '').trim(); if (!name) throw new Error('Type a name for the new category.');
  const c = await q(sb.from('categories').insert({ department_id: +data.department_id, name, sort: 999 }).select().single());
  S.cats.push(c); return c.id;
}
function editItem(it) {
  const isNew = !it;
  return modal({
    title: isNew ? 'Add item' : 'Edit item', submit: isNew ? 'Add item' : 'Save changes',
    body: `<div class="row2"><label class="f">Item code<input type="text" name="code" value="${esc(it?.code)}" placeholder="e.g. GES-SLT-STB-005"></label>
      <label class="f">Type<select name="item_type">${Object.entries(TYPES).map(([k, v]) => opt(k, v, it?.item_type || 'equipment')).join('')}</select></label></div>
      <label class="f">Description<input type="text" name="name" value="${esc(it?.name)}" required></label>
      ${deptCatFields(it)}
      <div class="row2"><label class="f">Reorder at (min)<span class="hint">Alert when the in-store quantity falls to this.</span><input type="number" step="any" min="0" name="min_qty" value="${esc(it?.min_qty)}"></label>
      <label class="f">Restock up to (max)<span class="hint">Used to suggest how many to order.</span><input type="number" step="any" min="0" name="max_qty" value="${esc(it?.max_qty)}"></label></div>
      <div class="row2"><label class="f">Unit<input type="text" name="unit" value="${esc(it?.unit || 'pcs')}"></label>
      <label class="f">OEM / supplier<input type="text" name="supplier" value="${esc(it?.supplier)}"></label></div>
      ${isNew ? `<div class="row2"><label class="f">Opening quantity<input type="number" step="any" min="0" name="qty" value="0"></label>
        <label class="f">At location<select name="location_id">${locOptions(S.locs[0]?.id)}</select></label></div>` : ''}
      <label class="f">Notes<textarea name="notes">${esc(it?.notes)}</textarea></label>
      ${isNew ? '' : `<label class="check"><input type="checkbox" name="active" ${it.active ? 'checked' : ''}> Active (untick to archive: it disappears from lists but keeps its history)</label>`}`,
    onOpen: d => wireDeptCat(d, it),
    onSubmit: async data => {
      if (!data.name.trim()) throw new Error('Enter a description.');
      const cat = await resolveCategory(data);
      if (isNew) {
        const id = await q(sb.rpc('create_item', { p_code: data.code, p_name: data.name, p_department: +data.department_id, p_category: cat,
          p_type: data.item_type, p_unit: data.unit, p_min: num(data.min_qty), p_max: num(data.max_qty), p_supplier: data.supplier, p_notes: data.notes,
          p_location: +data.location_id, p_qty: num(data.qty) || 0 }));
        toast('Item added'); invalidate(); go('#/item/' + id); return;
      }
      await q(sb.from('items').update({ code: data.code.trim() || null, name: data.name.trim(), department_id: +data.department_id, category_id: cat,
        item_type: data.item_type, unit: data.unit || 'pcs', min_qty: num(data.min_qty), max_qty: num(data.max_qty),
        supplier: data.supplier || null, notes: data.notes || null, active: !!data.active }).eq('id', it.id));
      toast('Changes saved'); refresh();
    }
  });
}
function bulkEdit(ids) {
  return modal({
    title: `Edit ${ids.length} items`, sub: 'Only the fields you fill in will change.', submit: 'Apply to all',
    body: `<label class="f">Type<select name="item_type"><option value="">No change</option>${Object.entries(TYPES).map(([k, v]) => opt(k, v)).join('')}</select></label>
      <div class="row2"><label class="f">Reorder at (min)<input type="number" step="any" min="0" name="min_qty"></label>
      <label class="f">Restock up to (max)<input type="number" step="any" min="0" name="max_qty"></label></div>
      <div class="row2"><label class="f">Unit<input type="text" name="unit"></label><label class="f">OEM / supplier<input type="text" name="supplier"></label></div>
      <label class="check"><input type="checkbox" name="clear_min"> Remove reorder levels from these items</label>`,
    onSubmit: async d => {
      const u = {};
      if (d.item_type) u.item_type = d.item_type;
      if (d.min_qty !== '') u.min_qty = num(d.min_qty);
      if (d.max_qty !== '') u.max_qty = num(d.max_qty);
      if (d.clear_min) { u.min_qty = null; u.max_qty = null; }
      if (d.unit) u.unit = d.unit; if (d.supplier) u.supplier = d.supplier;
      if (!Object.keys(u).length) throw new Error('Fill in at least one field.');
      for (let i = 0; i < ids.length; i += 200) await q(sb.from('items').update(u).in('id', ids.slice(i, i + 200)));
      toast(`Updated ${ids.length} items`); S.inv.sel.clear(); refresh();
    }
  });
}

// ================================================================ ITEM
const viewItem = {
  async load(parts) {
    const id = +parts[1];
    const [it, stock, cos, units, certs, moves] = await Promise.all([
      q(sb.from('item_overview').select('*').eq('id', id).maybeSingle()),
      q(sb.from('stock').select('*').eq('item_id', id).gt('qty', 0)),
      q(sb.from('checkouts').select('*').eq('item_id', id).is('closed_at', null).order('out_at')),
      q(sb.from('units').select('*').eq('item_id', id).eq('active', true).order('serial_no')),
      q(sb.from('certifications').select('*').eq('item_id', id).order('superseded').order('due_on', { nullsFirst: false })),
      q(sb.from('movements').select('*').eq('item_id', id).order('created_at', { ascending: false }).limit(60)),
    ]);
    if (!it) return topbar('Item not found', 'It may have been removed.') + '<a class="btn" href="#/inventory">Back to inventory</a>';
    this.ctx = { it, stock, cos, units, certs };
    const t = localISO(0);
    const canIssue = it.item_type !== 'equipment';
    const stockRows = stock.sort((a, b) => locName(a.location_id).localeCompare(locName(b.location_id)));
    const qr = qrSvg(itemUrl(it.id), 3);
    const current = certs.filter(c => !c.superseded), old = certs.filter(c => c.superseded);
    const unitLabel = u => u ? [u.serial_no && 'S/N ' + u.serial_no, u.lot_no && 'Lot ' + u.lot_no].filter(Boolean).join(' · ') : '';
    return `<a class="back" href="#/inventory">← Inventory</a>
      <div class="item-head"><div>${tag(it.code, 'big')}
        <h1>${esc(it.name)}</h1>
        <div class="facts"><span>${esc(it.department)}</span><span>${esc(it.category)}</span><span>${TYPES[it.item_type]}</span>
          ${it.supplier ? `<span>OEM: ${esc(it.supplier)}</span>` : ''}${it.active ? '' : chip('muted', 'Archived')}</div></div>
        <div class="qr-mini">${qr}<button class="btn small" id="lbl">${ico('print')}Label</button></div></div>
      <div class="qtybar">
        <div><div class="n">${fq(it.qty_available)}</div><div class="l">In store</div></div>
        <div><div class="n">${fq(it.qty_out)}</div><div class="l">Out on jobs</div></div>
        <div><div class="n">${fq(it.qty_reserved)}</div><div class="l">Reserved</div></div>
        <div><div class="n">${fq(it.qty_in_transit)}</div><div class="l">In transit</div></div>
        <div><div class="n">${fq(it.qty_damaged)}</div><div class="l">Damaged</div></div>
        <div><div class="n">${fq(it.qty_total)}</div><div class="l">Total ${esc(it.unit)}${it.min_qty != null ? ` · reorder at ${fq(it.min_qty)}` : ''}</div></div>
      </div>
      ${it.notes ? `<div class="notice">${esc(it.notes)}</div>` : ''}
      <div class="actionrow">
        <button class="btn tagbtn" data-a="checkout">${ico('out')}Check out</button>
        <button class="btn" data-a="receive">${ico('plus')}Receive stock</button>
        ${canIssue ? `<button class="btn" data-a="issue">${it.item_type === 'sales' ? 'Sell' : 'Issue'}</button>` : ''}
        <button class="btn" data-a="transfer">Move</button>
        <button class="btn" data-a="status">Change status</button>
        <button class="btn" data-a="count">Count / write off</button>
        ${isAdmin() ? '<button class="btn" data-a="edit">Edit item</button>' : ''}
      </div>
      ${cos.length ? `<section class="panel"><header><h2>Out on jobs</h2><span class="meta">${fq(it.qty_out)} ${esc(it.unit)}</span></header>
        <div class="tablewrap"><table class="t stack"><thead><tr><th>Job / well / site</th><th>With</th><th class="num">Qty</th><th>Out since</th><th>Due back</th><th></th></tr></thead><tbody>
        ${cos.map(c => `<tr><td class="full"><div class="name">${esc(c.job_ref)}</div>${c.serials ? `<div class="sub">S/N ${esc(c.serials)}</div>` : ''}</td>
          <td>${esc(c.issued_to || '—')}</td><td class="num">${fq(c.open_qty)}${c.open_qty != c.qty ? `<span class="sub"> of ${fq(c.qty)}</span>` : ''}</td>
          <td class="hide-m">${fd(c.out_at)}</td><td>${c.due_back ? (c.due_back < t ? chip('overdue', fd(c.due_back)) : fd(c.due_back)) : '—'}</td>
          <td class="num"><button class="btn small" data-ret="${c.id}">Return</button></td></tr>`).join('')}</tbody></table></div></section>` : ''}
      <div class="cols">
        <section class="panel"><header><h2>Where it is</h2></header>
          ${stockRows.length ? `<table class="t"><tbody>${stockRows.map(s => `<tr><td class="name">${esc(locName(s.location_id))}</td><td>${chip(s.status, STATUS[s.status])}</td><td class="num"><b>${fq(s.qty)}</b></td></tr>`).join('')}</tbody></table>`
            : `<div class="empty">${+it.qty_out ? 'Everything is out on jobs.' : 'None in stock. Use Receive stock when a delivery arrives.'}</div>`}</section>
        <section class="panel"><header><h2>Certificates & maintenance</h2><div class="right"><button class="btn small" data-a="cert">${ico('plus')}Record</button></div></header>
          ${current.length ? `<table class="t"><tbody>${current.map(c => `<tr><td><div class="name">${CERT_KINDS[c.kind]}${c.cert_no ? ' ' + esc(c.cert_no) : ''}</div>
            <div class="sub">${[unitLabel(units.find(u => u.id === c.unit_id)), c.provider, c.issued_on && 'Issued ' + fd(c.issued_on)].filter(Boolean).map(esc).join(' · ')}</div></td>
            <td class="num">${dueChip(c.due_on)}<div class="sub">${c.due_on ? 'Due ' + fd(c.due_on) : 'No due date'}</div></td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">No certificates or maintenance recorded. Record one to get a reminder before it expires.</div>'}
          ${old.length ? `<details class="body"><summary class="muted">${old.length} earlier record${old.length > 1 ? 's' : ''}</summary>
            <ul class="list">${old.map(c => `<li><div><div class="name">${CERT_KINDS[c.kind]} ${esc(c.cert_no || '')}</div><div class="sub">Due ${fd(c.due_on)}${c.provider ? ' · ' + esc(c.provider) : ''}</div></div></li>`).join('')}</ul></details>` : ''}
        </section>
      </div>
      <section class="panel mt"><header><h2>Serial & batch numbers</h2><span class="meta">${units.length || 'none recorded'}</span>
        ${isAdmin() ? `<div class="right"><button class="btn small" data-a="unit">${ico('plus')}Add</button></div>` : ''}</header>
        ${units.length ? `<div class="tablewrap"><table class="t stack"><thead><tr><th>Serial no.</th><th>Batch / lot</th><th>Supplier</th><th>Received</th><th>Notes</th>${isAdmin() ? '<th></th>' : ''}</tr></thead><tbody>
          ${units.map(u => `<tr><td class="name">${esc(u.serial_no || '—')}</td><td>${esc(u.lot_no || '—')}</td><td class="hide-m">${esc(u.supplier || '—')}</td>
            <td class="hide-m">${fd(u.received_on)}</td><td class="sub full">${esc(u.notes || '')}</td>${isAdmin() ? `<td class="num"><button class="btn small link" data-unit="${u.id}">Edit</button></td>` : ''}</tr>`).join('')}
          </tbody></table></div>` : `<div class="empty">Record serial numbers for traceability and per-unit certificates.${isAdmin() ? '' : ' Ask an admin to add them.'}</div>`}</section>
      <section class="panel"><header><h2>History</h2><span class="meta">latest ${moves.length}</span></header>
        ${moves.length ? `<ul class="list">${moves.map(m => `<li><div style="flex:1;min-width:0"><div class="name" style="white-space:normal">${esc(describeMove(m))}</div>
          <div class="sub">${[m.user_name, m.serials && 'S/N ' + m.serials, m.notes].filter(Boolean).map(esc).join(' · ')}</div></div>
          <div class="end sub">${fdt(m.created_at)}</div></li>`).join('')}</ul>` : '<div class="empty">No history yet.</div>'}</section>`;
  },
  bind(main) {
    const c = this.ctx; if (!c) return;
    $$('[data-a]', main).forEach(b => b.onclick = () => ACTIONS[b.dataset.a](c));
    $$('[data-ret]', main).forEach(b => b.onclick = () => actReturn(c.it, c.cos.find(x => x.id === +b.dataset.ret)));
    $$('[data-unit]', main).forEach(b => b.onclick = () => editUnit(c.it, c.units.find(u => u.id === +b.dataset.unit)));
    const l = $('#lbl', main); if (l) l.onclick = () => { sessionStorage.setItem('labels', JSON.stringify([c.it.id])); go('#/labels'); };
  }
};

// ---------------------------------------------------------------- stock actions
function stockAt(stock, loc, status) { return +(stock.find(s => s.location_id === +loc && s.status === status)?.qty || 0); }
function stockLocOptions(stock, statuses, sel) {
  const locs = [...new Set(stock.filter(s => statuses.includes(s.status) && s.qty > 0).map(s => s.location_id))];
  return locs.map(l => opt(l, `${locName(l)} (${statuses.map(st => stockAt(stock, l, st)).reduce((a, b) => a + b, 0)} here)`, sel)).join('');
}
const done = msg => { toast(msg); refresh(); };

const ACTIONS = {
  checkout({ it, stock }) {
    const opts = stockLocOptions(stock, ['available', 'reserved']);
    if (!opts) return toast('Nothing in store to check out. Return or receive stock first.', true);
    return modal({
      title: 'Check out', sub: `${esc(it.code || '')} ${esc(it.name)}`, submit: 'Check out',
      body: `<div class="row2"><label class="f">From<select name="loc" id="m-loc">${opts}</select></label>
        <label class="f">Take from<select name="st" id="m-st">${opt('available', 'Available')}${opt('reserved', 'Reserved')}</select></label></div>
        <label class="f">Quantity<span class="hint" id="m-have"></span><input type="number" name="qty" step="any" min="0" value="1" required></label>
        <label class="f">Job, well or site<input type="text" name="job" placeholder="e.g. Mahin-3 well intervention" required></label>
        <div class="row2"><label class="f">Issued to<input type="text" name="to" placeholder="Person responsible"></label>
        <label class="f">Due back<input type="date" name="due" min="${localISO(0)}"></label></div>
        <label class="f">Serial numbers<span class="hint">Optional, if specific units are going out.</span><input type="text" name="serials" list="m-serials"></label>
        <label class="f">Notes<textarea name="notes"></textarea></label>`,
      onOpen: d => { const upd = () => { $('#m-have', d).textContent = `${stockAt(stock, $('#m-loc', d).value, $('#m-st', d).value)} ${it.unit} ${$('#m-st', d).value} here`; };
        $('#m-loc', d).onchange = upd; $('#m-st', d).onchange = upd; upd(); },
      onSubmit: async x => {
        await q(sb.rpc('checkout_item', { p_item: it.id, p_location: +x.loc, p_qty: num(x.qty), p_job: x.job, p_issued_to: x.to,
          p_due: x.due || null, p_serials: x.serials || null, p_notes: x.notes || null, p_from_status: x.st }));
        done(`Checked out ${x.qty} to ${x.job}`);
      }
    });
  },
  receive({ it }) {
    return modal({
      title: 'Receive stock', sub: `${esc(it.code || '')} ${esc(it.name)}`, submit: 'Receive',
      body: `<div class="row2"><label class="f">Into<select name="loc">${locOptions(S.locs[0]?.id)}</select></label>
        <label class="f">Quantity<input type="number" name="qty" step="any" min="0" required></label></div>
        <label class="f">Reference<span class="hint">PO, waybill or delivery note number.</span><input type="text" name="ref"></label>
        <label class="f">Arrives as<select name="st">${opt('available', 'Available')}${opt('damaged', 'Damaged / needs inspection')}</select></label>
        <label class="f">Notes<textarea name="notes" placeholder="Supplier, condition, who delivered"></textarea></label>`,
      onSubmit: async x => {
        await q(sb.rpc('receive_stock', { p_item: it.id, p_location: +x.loc, p_qty: num(x.qty), p_ref: x.ref || null, p_notes: x.notes || null, p_status: x.st }));
        done(`Received ${x.qty} ${it.unit}`);
      }
    });
  },
  issue({ it, stock }) {
    const sale = it.item_type === 'sales';
    const opts = stockLocOptions(stock, ['available']);
    if (!opts) return toast('Nothing available in store.', true);
    return modal({
      title: sale ? 'Sell' : 'Issue', sub: `${esc(it.name)} leaves the inventory for good.`, submit: sale ? 'Record sale' : 'Issue',
      body: `<div class="row2"><label class="f">From<select name="loc">${opts}</select></label>
        <label class="f">Quantity<input type="number" name="qty" step="any" min="0" value="1" required></label></div>
        <label class="f">${sale ? 'Customer / job / invoice' : 'Job or purpose'}<input type="text" name="ref" required></label>
        <label class="f">Notes<textarea name="notes"></textarea></label>`,
      onSubmit: async x => {
        await q(sb.rpc('issue_stock', { p_item: it.id, p_location: +x.loc, p_qty: num(x.qty), p_kind: sale ? 'sale' : 'issue', p_ref: x.ref, p_notes: x.notes || null }));
        done(sale ? `Sale of ${x.qty} recorded` : `Issued ${x.qty}`);
      }
    });
  },
  transfer({ it, stock }) {
    const sts = Object.keys(STATUS).filter(s => stock.some(r => r.status === s));
    if (!sts.length) return toast('Nothing in stock to move.', true);
    return modal({
      title: 'Move to another location', sub: `${esc(it.code || '')} ${esc(it.name)}`, submit: 'Move',
      body: `<div class="row2"><label class="f">Status<select name="st" id="m-st">${sts.map(s => opt(s, STATUS[s])).join('')}</select></label>
        <label class="f">From<select name="from" id="m-from"></select></label></div>
        <div class="row2"><label class="f">To<select name="to">${locOptions()}</select></label>
        <label class="f">Quantity<input type="number" name="qty" step="any" min="0" value="1" required></label></div>
        <label class="check"><input type="checkbox" name="transit"> Still on its way (mark as in transit until someone confirms arrival)</label>
        <label class="f">Notes<textarea name="notes" placeholder="Truck, driver, waybill"></textarea></label>`,
      onOpen: d => { const fill = () => { $('#m-from', d).innerHTML = stockLocOptions(stock, [$('#m-st', d).value]); }; $('#m-st', d).onchange = fill; fill(); },
      onSubmit: async x => {
        await q(sb.rpc('transfer_stock', { p_item: it.id, p_from: +x.from, p_to: +x.to, p_qty: num(x.qty), p_status: x.st, p_in_transit: !!x.transit, p_notes: x.notes || null }));
        done(x.transit ? 'Marked as in transit' : `Moved to ${locName(+x.to)}`);
      }
    });
  },
  status({ it, stock }) {
    if (!stock.length) return toast('Nothing in stock.', true);
    return modal({
      title: 'Change status', sub: 'For example: reserve for a job, confirm a delivery arrived, or mark as damaged.', submit: 'Change status',
      body: `<label class="f">At<select name="loc" id="m-loc">${stockLocOptions(stock, Object.keys(STATUS))}</select></label>
        <div class="row2"><label class="f">From<select name="from" id="m-from"></select></label>
        <label class="f">To<select name="to">${Object.entries(STATUS).map(([k, v]) => opt(k, v, 'available')).join('')}</select></label></div>
        <label class="f">Quantity<span class="hint" id="m-have"></span><input type="number" name="qty" step="any" min="0" value="1" required></label>
        <label class="f">Notes<textarea name="notes" placeholder="Reason, job reference, damage description"></textarea></label>`,
      onOpen: d => {
        const fill = () => { const l = $('#m-loc', d).value; $('#m-from', d).innerHTML = Object.keys(STATUS).filter(s => stockAt(stock, l, s) > 0).map(s => opt(s, `${STATUS[s]} (${stockAt(stock, l, s)})`)).join(''); };
        $('#m-loc', d).onchange = fill; fill();
      },
      onSubmit: async x => {
        await q(sb.rpc('change_status', { p_item: it.id, p_location: +x.loc, p_qty: num(x.qty), p_from_status: x.from, p_to_status: x.to, p_notes: x.notes || null }));
        done(`Changed to ${STATUS[x.to].toLowerCase()}`);
      }
    });
  },
  count({ it, stock }) {
    return modal({
      title: 'Count / write off', sub: isAdmin() ? 'As an admin, your change applies straight away.' : 'Any admin will be asked to approve this before stock changes.',
      submit: isAdmin() ? 'Apply' : 'Send for approval',
      body: `<div class="row2"><label class="f">Location<select name="loc" id="m-loc">${locOptions(stock[0]?.location_id)}</select></label>
        <label class="f">Status<select name="st" id="m-st">${Object.entries(STATUS).map(([k, v]) => opt(k, v)).join('')}</select></label></div>
        <label class="f">What kind of change<select name="kind">${opt('count', 'Stock count correction')}${opt('writeoff', 'Write-off (lost, scrapped, used up)')}</select></label>
        <label class="f">Correct quantity now<span class="hint" id="m-have"></span><input type="number" name="qty" step="any" min="0" required></label>
        <label class="f">Reason<textarea name="reason" required placeholder="e.g. Monthly count found 2 extra; 1 lost downhole on Mahin-3"></textarea></label>`,
      onOpen: d => { const upd = () => { const h = stockAt(stock, $('#m-loc', d).value, $('#m-st', d).value); $('#m-have', d).textContent = `On record: ${h} ${it.unit}`; $('input[name=qty]', d).value = h; };
        $('#m-loc', d).onchange = upd; $('#m-st', d).onchange = upd; upd(); },
      onSubmit: async x => {
        const r = await q(sb.rpc('request_adjustment', { p_item: it.id, p_location: +x.loc, p_status: x.st, p_new_qty: num(x.qty), p_kind: x.kind, p_reason: x.reason }));
        done(r === 'applied' ? 'Stock updated' : 'Sent to admins for approval');
      }
    });
  },
  cert({ it, units }) {
    return modal({
      title: 'Record certificate or maintenance', sub: 'This replaces the previous record of the same kind, so reminders follow the latest date.', submit: 'Save record',
      body: `<div class="row2"><label class="f">Kind<select name="kind">${Object.entries(CERT_KINDS).map(([k, v]) => opt(k, v)).join('')}</select></label>
        <label class="f">For unit<select name="unit"><option value="">Whole item</option>${units.map(u => opt(u.id, u.serial_no ? 'S/N ' + u.serial_no : 'Lot ' + u.lot_no)).join('')}</select></label></div>
        <div class="row2"><label class="f">Certificate / job card no.<input type="text" name="no"></label><label class="f">Done by<input type="text" name="prov" placeholder="Company or person"></label></div>
        <div class="row2"><label class="f">Date done<input type="date" name="issued" value="${localISO(0)}"></label><label class="f">Next due<input type="date" name="due"></label></div>
        <label class="f">Notes<textarea name="notes"></textarea></label>`,
      onSubmit: async x => {
        if (!x.due) throw new Error('Enter the next due date so the reminder works.');
        await q(sb.rpc('record_certification', { p_item: it.id, p_unit: x.unit ? +x.unit : null, p_kind: x.kind, p_cert_no: x.no, p_provider: x.prov,
          p_issued: x.issued || null, p_due: x.due, p_notes: x.notes || null }));
        done('Record saved');
      }
    });
  },
  unit({ it }) { return editUnit(it, null); },
  edit({ it }) { return editItem(it); },
};

function actReturn(it, c) {
  return modal({
    title: 'Return from job', sub: `${esc(it.name)} · ${esc(c.job_ref)}`, submit: 'Return',
    body: `<div class="row2"><label class="f">Quantity<span class="hint">${fq(c.open_qty)} still out</span><input type="number" name="qty" step="any" min="0" max="${c.open_qty}" value="${c.open_qty}" required></label>
      <label class="f">Back to<select name="loc">${locOptions(c.location_id)}</select></label></div>
      <label class="f">Condition<select name="cond">${opt('good', 'Good: ready to use')}${opt('damaged', 'Damaged: needs repair or inspection')}</select></label>
      <label class="f">Notes<textarea name="notes" placeholder="Anything missing or worn?"></textarea></label>`,
    onSubmit: async x => {
      await q(sb.rpc('return_checkout', { p_checkout: c.id, p_qty: num(x.qty), p_location: +x.loc, p_condition: x.cond, p_notes: x.notes || null }));
      done(`Returned ${x.qty} to ${locName(+x.loc)}`);
    }
  });
}
function editUnit(it, u) {
  return modal({
    title: u ? 'Edit serial / batch' : 'Add serial / batch', sub: esc(it.name), submit: 'Save',
    body: `<div class="row2"><label class="f">Serial no.<input type="text" name="serial_no" value="${esc(u?.serial_no)}"></label><label class="f">Batch / lot no.<input type="text" name="lot_no" value="${esc(u?.lot_no)}"></label></div>
      <div class="row2"><label class="f">Supplier / OEM<input type="text" name="supplier" value="${esc(u?.supplier || it.supplier)}"></label><label class="f">Received on<input type="date" name="received_on" value="${esc(u?.received_on)}"></label></div>
      <label class="f">Notes<textarea name="notes">${esc(u?.notes)}</textarea></label>
      ${u ? '<label class="check"><input type="checkbox" name="remove"> Remove this unit (sold, scrapped or entered by mistake)</label>' : ''}`,
    onSubmit: async x => {
      if (!x.serial_no && !x.lot_no) throw new Error('Enter a serial number or a batch / lot number.');
      const row = { serial_no: x.serial_no || null, lot_no: x.lot_no || null, supplier: x.supplier || null, received_on: x.received_on || null, notes: x.notes || null };
      if (u) await q(sb.from('units').update({ ...row, active: !x.remove }).eq('id', u.id));
      else await q(sb.from('units').insert({ ...row, item_id: it.id }));
      done('Saved');
    }
  });
}

// ================================================================ CHECKOUTS
const viewCheckouts = {
  async load(parts, params) {
    if (params.get('v')) { S.co.view = params.get('v'); history.replaceState(null, '', '#/checkouts'); }
    const v = S.co.view;
    let qb = sb.from('checkouts').select('*, items(code,name,unit)');
    qb = v === 'returned' ? qb.not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(300) : qb.is('closed_at', null).order('due_back', { nullsFirst: false });
    this.rows = await q(qb);
    return topbar('Out on jobs', 'Equipment checked out to jobs, wells and sites', `<button class="btn" id="xls">${ico('down')}Export to Excel</button>`) +
      `<div class="filters"><input type="search" id="q" placeholder="Search job, person or item" value="${esc(S.co.q)}">
        <div class="seg" id="seg">${[['open', 'All open'], ['overdue', 'Overdue'], ['returned', 'Returned']].map(([k, l]) => `<button data-v="${k}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <section class="panel"><div class="tablewrap"><table class="t stack" id="tbl"><thead><tr><th>Item</th><th>Job / well / site</th><th>With</th><th class="num">Qty</th><th>Out since</th><th>${v === 'returned' ? 'Closed' : 'Due back'}</th><th></th></tr></thead><tbody></tbody></table></div></section>`;
  },
  filtered() {
    const t = localISO(0), qq = S.co.q.trim().toLowerCase();
    return this.rows.filter(c => (S.co.view !== 'overdue' || (c.due_back && c.due_back < t)) &&
      (!qq || `${c.job_ref} ${c.issued_to || ''} ${c.items?.code || ''} ${c.items?.name || ''}`.toLowerCase().includes(qq)));
  },
  bind(main) {
    const t = localISO(0); const ret = S.co.view === 'returned';
    const draw = () => {
      const rows = this.filtered();
      $('#tbl tbody', main).innerHTML = rows.length ? rows.map(c => `<tr>
        <td class="full"><a href="#/item/${c.item_id}" style="color:inherit;text-decoration:none">${tag(c.items?.code)} <span class="name">${esc(c.items?.name)}</span></a></td>
        <td><div class="name">${esc(c.job_ref)}</div>${c.serials ? `<div class="sub">S/N ${esc(c.serials)}</div>` : ''}</td>
        <td>${esc(c.issued_to || '—')}<div class="sub">by ${esc(personName(c.issued_by, ''))}</div></td>
        <td class="num">${fq(ret ? c.qty : c.open_qty)}</td><td class="hide-m">${fd(c.out_at)}</td>
        <td>${ret ? fd(c.closed_at) : c.due_back ? (c.due_back < t ? chip('overdue', fd(c.due_back)) : fd(c.due_back)) : '—'}</td>
        <td class="num">${ret ? '' : `<button class="btn small" data-ret="${c.id}">Return</button>`}</td></tr>`).join('')
        : `<tr><td colspan="7" class="empty">${S.co.view === 'overdue' ? 'Nothing is overdue.' : ret ? 'No returns yet.' : 'Nothing is checked out. Open an item and choose Check out.'}</td></tr>`;
      $$('[data-ret]', main).forEach(b => b.onclick = async () => {
        const c = this.rows.find(x => x.id === +b.dataset.ret);
        const it = { id: c.item_id, name: c.items?.name, unit: c.items?.unit };
        await actReturn(it, c);
      });
    };
    $('#q', main).oninput = debounce(e => { S.co.q = e.target.value; draw(); }, 120);
    $$('#seg button', main).forEach(b => b.onclick = () => { S.co.view = b.dataset.v; go('#/checkouts'); });
    $('#xls', main).onclick = () => exportRows(`Out_on_jobs_${localISO(0)}.xlsx`, 'Out on jobs',
      ['Item code', 'Item', 'Job / well / site', 'Issued to', 'Qty out', 'Out since', 'Due back', 'Serials', 'Notes'],
      this.filtered().map(c => [c.items?.code, c.items?.name, c.job_ref, c.issued_to, +(ret ? c.qty : c.open_qty), fd(c.out_at), c.due_back ? fd(c.due_back) : '', c.serials, c.notes]));
    draw();
  }
};

// ================================================================ CERTIFICATES
const viewCerts = {
  async load() {
    this.rows = await q(sb.from('certifications').select('*, items(code,name)').eq('superseded', false).order('due_on', { nullsFirst: false }));
    const v = S.certs.view;
    return topbar('Certificates & maintenance', 'Certifications, calibrations, inspections and maintenance, latest record per item') +
      `<div class="filters"><div class="seg" id="seg">${[['overdue', 'Overdue'], ['soon', 'Due in 30 days'], ['90', 'Due in 90 days'], ['all', 'All']].map(([k, l]) => `<button data-v="${k}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <section class="panel"><div class="tablewrap"><table class="t stack" id="tbl"><thead><tr><th>Item</th><th>Kind</th><th>Certificate no.</th><th>Done by</th><th>Due</th><th></th></tr></thead><tbody></tbody></table></div></section>`;
  },
  bind(main) {
    const draw = () => {
      const t = localISO(0), lim = { overdue: t, soon: localISO(30), '90': localISO(90) }[S.certs.view];
      const rows = this.rows.filter(c => S.certs.view === 'all' || (c.due_on && (S.certs.view === 'overdue' ? c.due_on < t : c.due_on <= lim)));
      $('#tbl tbody', main).innerHTML = rows.length ? rows.map(c => `<tr class="click" data-id="${c.item_id}">
        <td class="full">${tag(c.items?.code)} <span class="name">${esc(c.items?.name)}</span></td><td>${CERT_KINDS[c.kind]}</td>
        <td>${esc(c.cert_no || '—')}</td><td class="hide-m">${esc(c.provider || '—')}</td><td>${fd(c.due_on)}</td><td class="num">${dueChip(c.due_on)}</td></tr>`).join('')
        : `<tr><td colspan="6" class="empty">${this.rows.length ? 'Nothing in this range.' : 'No records yet. Open an item and choose Record under Certificates & maintenance.'}</td></tr>`;
    };
    $$('#seg button', main).forEach(b => b.onclick = () => { S.certs.view = b.dataset.v; $$('#seg button', main).forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#tbl tbody', main).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) go('#/item/' + tr.dataset.id); };
    draw();
  }
};

// ================================================================ ACTIVITY
const viewActivity = {
  async fetch(reset) {
    const a = S.act; if (reset) { a.rows = []; a.done = false; }
    let qb = sb.from('movements').select('*, items(code,name)').order('created_at', { ascending: false }).range(a.rows.length, a.rows.length + 199);
    if (a.type) qb = qb.eq('type', a.type);
    if (a.from) qb = qb.gte('created_at', a.from + 'T00:00:00');
    if (a.to) qb = qb.lte('created_at', a.to + 'T23:59:59');
    const rows = await q(qb); a.rows.push(...rows); if (rows.length < 200) a.done = true;
  },
  async load() {
    await this.fetch(true); const a = S.act;
    return topbar('Activity', 'Every movement, with who did it and when', `<button class="btn" id="xls">${ico('down')}Export to Excel</button>`) +
      `<div class="filters"><input type="search" id="q" placeholder="Filter by item, job or person" value="${esc(a.q)}">
        <select id="type"><option value="">All activity</option>${Object.entries(MOVE_TYPES).map(([k, v]) => opt(k, v, a.type)).join('')}</select>
        <input type="date" id="from" value="${esc(a.from)}" aria-label="From date" style="width:auto;margin:0"><input type="date" id="to" value="${esc(a.to)}" aria-label="To date" style="width:auto;margin:0"></div>
      <section class="panel"><ul class="list" id="list"></ul><div class="body" id="more"></div></section>`;
  },
  bind(main) {
    const a = S.act;
    const draw = () => {
      const qq = a.q.trim().toLowerCase();
      const rows = a.rows.filter(m => !qq || `${m.items?.code} ${m.items?.name} ${m.ref || ''} ${m.user_name || ''} ${m.notes || ''}`.toLowerCase().includes(qq));
      $('#list', main).innerHTML = rows.length ? rows.map(m => `<li><a class="main" href="#/item/${m.item_id}"><div class="name">${tag(m.items?.code)} ${esc(m.items?.name)}</div>
        <div class="sub" style="color:var(--ink)">${esc(describeMove(m))}</div><div class="sub">${[m.notes, m.serials && 'S/N ' + m.serials].filter(Boolean).map(esc).join(' · ')}</div></a>
        <div class="end sub">${esc(m.user_name || '')}<br>${fdt(m.created_at)}</div></li>`).join('') : '<li class="empty">No activity for these filters.</li>';
      $('#more', main).innerHTML = a.done ? '' : '<button class="btn" id="loadmore">Load older activity</button>';
      const lm = $('#loadmore', main); if (lm) lm.onclick = async () => { lm.disabled = true; await this.fetch(false); draw(); };
    };
    $('#q', main).oninput = debounce(e => { a.q = e.target.value; draw(); }, 120);
    $('#type', main).onchange = e => { a.type = e.target.value; render({ quiet: true }); };
    $('#from', main).onchange = e => { a.from = e.target.value; render({ quiet: true }); };
    $('#to', main).onchange = e => { a.to = e.target.value; render({ quiet: true }); };
    $('#xls', main).onclick = () => exportRows(`Activity_${localISO(0)}.xlsx`, 'Activity', ['Date', 'Item code', 'Item', 'Activity', 'Quantity', 'Reference', 'By', 'Notes'],
      a.rows.map(m => [new Date(m.created_at).toLocaleString('en-GB'), m.items?.code, m.items?.name, describeMove(m), +m.qty, m.ref, m.user_name, m.notes]));
    draw();
  }
};

// ================================================================ APPROVALS
const viewApprovals = {
  async load() {
    let pend = sb.from('adjustments').select('*, items(code,name,unit)').eq('state', 'pending').order('requested_at');
    if (!isAdmin()) pend = pend.eq('requested_by', S.profile.id);
    const [p, h] = await Promise.all([q(pend),
      q(sb.from('adjustments').select('*, items(code,name,unit)').neq('state', 'pending').order('decided_at', { ascending: false }).limit(40))]);
    this.p = p;
    const row = (a, actions) => `<li><a class="main" href="#/item/${a.item_id}"><div class="name">${tag(a.items?.code)} ${esc(a.items?.name)}</div>
      <div class="sub" style="color:var(--ink)">${a.kind === 'writeoff' ? 'Write-off' : 'Count correction'} at ${esc(locName(a.location_id))} (${STATUS[a.status].toLowerCase()}): ${fq(a.qty_before)} → <b>${fq(a.qty_after)}</b></div>
      <div class="sub">“${esc(a.reason)}” · asked by ${esc(personName(a.requested_by, 'unknown'))} ${fdt(a.requested_at)}${a.decision_note ? ` · ${esc(a.decision_note)}` : ''}</div></a>
      <div class="end">${actions}</div></li>`;
    return topbar('Approvals', isAdmin() ? 'Stock counts and write-offs from staff. Any admin can approve.' : 'Your stock counts and write-offs waiting for an admin.') +
      `<section class="panel"><header><h2>Waiting</h2><span class="meta">${p.length}</span></header>
        ${p.length ? `<ul class="list">${p.map(a => row(a, isAdmin() ? `<button class="btn small primary" data-ok="${a.id}">Approve</button> <button class="btn small" data-no="${a.id}">Reject</button>` : chip('pending', 'Waiting'))).join('')}</ul>` : '<div class="empty">Nothing waiting for approval.</div>'}</section>
      <section class="panel"><header><h2>Recently decided</h2></header>
        ${h.length ? `<ul class="list">${h.map(a => row(a, `${chip(a.state, a.state === 'approved' ? 'Approved' : 'Rejected')}<div class="sub">${esc(personName(a.decided_by, ''))}</div>`)).join('')}</ul>` : '<div class="empty">No decisions yet.</div>'}</section>`;
  },
  bind(main) {
    $$('[data-ok]', main).forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await q(sb.rpc('decide_adjustment', { p_id: +b.dataset.ok, p_approve: true })); toast('Approved, stock updated'); refreshPending(); refresh(); }
      catch (e) { toast(niceError(e), true); b.disabled = false; }
    });
    $$('[data-no]', main).forEach(b => b.onclick = () => modal({
      title: 'Reject request', submit: 'Reject', danger: true, body: '<label class="f">Reason<span class="hint">The requester will see this.</span><textarea name="note" required></textarea></label>',
      onSubmit: async x => { await q(sb.rpc('decide_adjustment', { p_id: +b.dataset.no, p_approve: false, p_note: x.note })); toast('Rejected'); refreshPending(); refresh(); }
    }));
  }
};

// ================================================================ LOCATIONS & CATEGORIES
const LOC_KINDS = { store: 'Store', warehouse: 'Warehouse', yard: 'Yard', site: 'Site / well', truck: 'Truck', vendor: 'Vendor / OEM', other: 'Other' };
const viewLocations = {
  async load() {
    await loadLookups();
    const stock = await fetchAll(() => sb.from('stock').select('location_id,item_id,qty').gt('qty', 0));
    const by = {}; stock.forEach(s => { (by[s.location_id] ||= { items: new Set(), qty: 0 }); by[s.location_id].items.add(s.item_id); by[s.location_id].qty += +s.qty; });
    this.by = by;
    return topbar('Locations', 'Stores, yards, trucks and sites where stock is kept', isAdmin() ? `<button class="btn primary" id="addloc">${ico('plus')}Add location</button>` : '') +
      `<section class="panel"><table class="t stack"><thead><tr><th>Location</th><th>Kind</th><th class="num">Items</th><th class="num">Quantity</th><th></th></tr></thead><tbody>
      ${S.locs.map(l => `<tr><td class="full"><div class="name">${esc(l.name)} ${l.active ? '' : chip('muted', 'Closed')}</div>${l.notes ? `<div class="sub">${esc(l.notes)}</div>` : ''}</td>
        <td>${LOC_KINDS[l.kind]}</td><td class="num">${by[l.id]?.items.size || 0}</td><td class="num">${fq(by[l.id]?.qty || 0)}</td>
        <td class="num"><a class="btn small" href="#/inventory" data-filter="${l.id}">View stock</a>${isAdmin() ? ` <button class="btn small link" data-edit="${l.id}">Edit</button>` : ''}</td></tr>`).join('')}
      </tbody></table></section>
      <div class="topbar" style="margin-top:28px"><div><h1 style="font-size:24px">Departments & categories</h1></div>${isAdmin() ? `<div class="actions"><button class="btn" id="adddept">${ico('plus')}Add department</button></div>` : ''}</div>
      <div class="cols">${S.depts.map(d => `<section class="panel"><header><h2>${esc(d.name)}</h2>${isAdmin() ? `<div class="right"><button class="btn small" data-addcat="${d.id}">${ico('plus')}Category</button></div>` : ''}</header>
        <ul class="list">${S.cats.filter(c => c.department_id === d.id).map(c => `<li><span>${esc(c.name)}</span>${isAdmin() ? `<span class="end"><button class="btn small link" data-cat="${c.id}">Rename</button></span>` : ''}</li>`).join('') || '<li class="muted">No categories</li>'}</ul></section>`).join('')}</div>`;
  },
  bind(main) {
    const editLoc = l => modal({
      title: l ? 'Edit location' : 'Add location', submit: 'Save',
      body: `<label class="f">Name<input type="text" name="name" value="${esc(l?.name)}" required placeholder="e.g. Onne Yard, Truck SLT-01"></label>
        <label class="f">Kind<select name="kind">${Object.entries(LOC_KINDS).map(([k, v]) => opt(k, v, l?.kind || 'store')).join('')}</select></label>
        <label class="f">Notes<textarea name="notes">${esc(l?.notes)}</textarea></label>
        ${l ? `<label class="check"><input type="checkbox" name="active" ${l.active ? 'checked' : ''}> Open (untick to hide it from pick lists)</label>` : ''}`,
      onSubmit: async x => {
        if (!x.name.trim()) throw new Error('Enter a name.');
        const row = { name: x.name.trim(), kind: x.kind, notes: x.notes || null };
        if (l) await q(sb.from('locations').update({ ...row, active: !!x.active }).eq('id', l.id)); else await q(sb.from('locations').insert(row));
        toast('Location saved'); render({ quiet: true });
      }
    });
    const a = $('#addloc', main); if (a) a.onclick = () => editLoc(null);
    $$('[data-edit]', main).forEach(b => b.onclick = () => editLoc(S.locs.find(l => l.id === +b.dataset.edit)));
    $$('[data-filter]', main).forEach(b => b.onclick = () => { Object.assign(S.inv, { loc: b.dataset.filter, view: 'all', dept: '', cat: '', q: '' }); });
    const ad = $('#adddept', main); if (ad) ad.onclick = () => modal({ title: 'Add department', submit: 'Add', body: '<label class="f">Name<input type="text" name="name" required></label>',
      onSubmit: async x => { if (!x.name.trim()) throw new Error('Enter a name.'); await q(sb.from('departments').insert({ name: x.name.trim(), sort: S.depts.length })); toast('Department added'); render({ quiet: true }); } });
    $$('[data-addcat]', main).forEach(b => b.onclick = () => modal({ title: 'Add category', submit: 'Add', body: '<label class="f">Name<input type="text" name="name" required></label>',
      onSubmit: async x => { if (!x.name.trim()) throw new Error('Enter a name.'); await q(sb.from('categories').insert({ department_id: +b.dataset.addcat, name: x.name.trim(), sort: 999 })); toast('Category added'); render({ quiet: true }); } }));
    $$('[data-cat]', main).forEach(b => { const c = S.cats.find(x => x.id === +b.dataset.cat); b.onclick = () => modal({ title: 'Rename category', submit: 'Save', body: `<label class="f">Name<input type="text" name="name" value="${esc(c.name)}" required></label>`,
      onSubmit: async x => { await q(sb.from('categories').update({ name: x.name.trim() }).eq('id', c.id)); toast('Renamed'); invalidate(); render({ quiet: true }); } }); });
  }
};

// ================================================================ TEAM
const ROLE_LABEL = { pending: 'Waiting for approval', staff: 'Staff', admin: 'Admin', disabled: 'No access' };
const viewTeam = {
  async load() {
    await loadLookups();
    const people = Object.values(S.people).sort((a, b) => (a.role === 'pending' ? -1 : 0) - (b.role === 'pending' ? -1 : 0) || (a.full_name || a.email).localeCompare(b.full_name || b.email));
    const pending = people.filter(p => p.role === 'pending').length;
    return topbar('Team', isAdmin() ? 'Approve new sign-ups and choose who is an admin. Keep at least two admins so approvals never get stuck.' : 'People with access to the inventory') +
      `${isAdmin() ? `<div class="notice ok">To add someone, send them this link and ask them to create an account: <b>${esc(location.origin + location.pathname)}</b>. They’ll appear here for you to approve.</div>` : ''}
      ${pending && isAdmin() ? `<div class="notice">${pending} ${pending === 1 ? 'person is' : 'people are'} waiting for approval.</div>` : ''}
      <section class="panel"><table class="t stack"><thead><tr><th>Name</th><th>Email</th><th>Access</th></tr></thead><tbody>
      ${people.map(p => `<tr><td class="full"><div class="name">${esc(p.full_name || '—')}${p.id === S.profile.id ? ' <span class="sub">(you)</span>' : ''}</div></td><td>${esc(p.email)}</td>
        <td>${isAdmin() ? `<select data-role="${p.id}" style="margin:0;min-width:180px">${Object.entries(ROLE_LABEL).map(([k, v]) => opt(k, v, p.role)).join('')}</select>` : ROLE_LABEL[p.role]}</td></tr>`).join('')}
      </tbody></table></section>
      <section class="panel"><div class="body"><b>What each role can do</b>
        <dl class="kv mt"><dt>Staff</dt><dd>Check equipment out and in, receive deliveries, move stock, change status, issue and sell, record certificates. Stock counts and write-offs go to an admin for approval.</dd>
        <dt>Admin</dt><dd>Everything staff can do, plus add and edit items, set reorder levels, approve counts and write-offs, manage locations and approve people.</dd></dl></div></section>`;
  },
  bind(main) {
    $$('[data-role]', main).forEach(s => s.onchange = async () => {
      const prev = S.people[s.dataset.role].role;
      try { await q(sb.rpc('set_user_role', { p_user: s.dataset.role, p_role: s.value })); toast(`Access changed to ${ROLE_LABEL[s.value]}`); S.people[s.dataset.role].role = s.value;
        if (s.dataset.role === S.profile.id) boot(); }
      catch (e) { toast(niceError(e), true); s.value = prev; }
    });
  }
};

// ================================================================ LABELS
function qrSvg(text, cell = 3) {
  const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 0, scalable: true });
}
const viewLabels = {
  async load() {
    const ids = JSON.parse(sessionStorage.getItem('labels') || '[]');
    const its = (await items()).filter(i => ids.includes(i.id));
    return topbar('Print labels', its.length ? `${its.length} label${its.length > 1 ? 's' : ''}. Scanning a label with any phone camera opens the item.` : '',
      its.length ? `<button class="btn primary" id="print">${ico('print')}Print</button>` : '') +
      (its.length ? `<div class="labels">${its.map(i => `<div class="lbl">${qrSvg(itemUrl(i.id), 3)}<div>${tag(i.code)}<div class="nm">${esc(i.name)}</div><div class="org">${esc(i.department || '')}</div><img class="lbl-logo" src="brand/logo-full.png" alt="${esc(ORG)}"></div></div>`).join('')}</div>`
        : `<div class="panel"><div class="empty">No items picked. In Inventory, tick the items you want labels for and choose Print labels.</div></div>`);
  },
  bind(main) { const p = $('#print', main); if (p) p.onclick = () => window.print(); }
};

// ================================================================ SCAN
let scanner = null;
function stopScanner() { if (scanner) { const s = scanner; scanner = null; try { Promise.resolve(s.stop()).then(() => s.clear()).catch(() => {}); } catch (e) { /* not running */ } } }
async function openScanned(text) {
  const m = String(text).match(/#\/item\/(\d+)/);
  if (m) return go('#/item/' + m[1]);
  await items();
  const hits = matchCode(text);
  if (hits.length === 1) return go('#/item/' + hits[0].id);
  S.inv.q = text.trim(); S.inv.view = 'all';
  if (hits.length > 1) { toast(`${hits.length} items share code ${text}. Pick one.`); return go('#/inventory'); }
  toast(`No item with code “${text}”. Showing search results.`, true); go('#/inventory');
}
const viewScan = {
  async load() {
    return topbar('Scan', 'Point the camera at an item’s QR label or barcode. A handheld scanner works too: scan anywhere in the app.') +
      `<div class="cols"><div><div class="scanbox"><div id="reader"></div></div><p class="muted" id="scanmsg">Starting camera…</p></div>
      <section class="panel" style="align-self:start"><header><h2>Type a code instead</h2></header><form class="body" id="manual">
        <label class="f">Item code<input type="text" name="code" placeholder="e.g. GES-SLT-STB-001" autocomplete="off"></label>
        <button class="btn primary" type="submit">Find item</button></form></section></div>`;
  },
  async bind(main) {
    $('#manual', main).onsubmit = e => { e.preventDefault(); const c = new FormData(e.target).get('code'); if (c.trim()) openScanned(c); };
    const msg = $('#scanmsg', main);
    try {
      await loadScript('vendor/html5-qrcode.min.js');
      if (!$('#reader')) return;
      scanner = new window.Html5Qrcode('reader', { verbose: false });
      let handled = false;
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } },
        text => { if (handled) return; handled = true; if (navigator.vibrate) navigator.vibrate(60); stopScanner(); openScanned(text); }, () => {});
      msg.textContent = 'Camera on. Hold the label inside the square.';
    } catch (e) {
      msg.textContent = /Permission|NotAllowed/i.test(String(e)) ? 'Camera access was blocked. Allow camera access for this site in your browser settings, or type the code.'
        : 'No camera available here. Type the code, or use a handheld scanner.';
    }
  }
};

// Handheld (keyboard-wedge) scanners: fast keystrokes ending in Enter, outside any text field
(() => {
  let buf = '', last = 0;
  document.addEventListener('keydown', e => {
    const t = e.target; if (!S.shellReady || t.closest('input,textarea,select,dialog')) return;
    const now = Date.now(); if (now - last > 60) buf = ''; last = now;
    if (e.key === 'Enter') { if (buf.length >= 4) { e.preventDefault(); openScanned(buf); } buf = ''; return; }
    if (e.key.length === 1) buf += e.key;
  });
})();

// ================================================================ ACCOUNT / MORE
const viewAccount = {
  async load() {
    const p = S.profile;
    return topbar('My account') + `<div class="cols"><section class="panel"><header><h2>Profile</h2></header><form class="body" id="prof">
        <label class="f">Full name<input type="text" name="name" value="${esc(p.full_name)}" required></label>
        <dl class="kv"><dt>Email</dt><dd>${esc(p.email)}</dd><dt>Access</dt><dd>${ROLE_LABEL[p.role]}</dd></dl>
        <button class="btn primary mt" type="submit">Save name</button></form></section>
      <section class="panel"><header><h2>Change password</h2></header><form class="body" id="pw">
        <label class="f">New password<span class="hint">At least 8 characters.</span><input type="password" name="pw" minlength="8" autocomplete="new-password" required></label>
        <button class="btn primary" type="submit">Change password</button></form></section></div>
      <button class="btn" id="out">Sign out</button>`;
  },
  bind(main) {
    $('#prof', main).onsubmit = async e => {
      e.preventDefault(); const name = new FormData(e.target).get('name').trim();
      try { await q(sb.from('profiles').update({ full_name: name }).eq('id', S.profile.id)); await sb.auth.updateUser({ data: { full_name: name } });
        S.profile.full_name = name; S.shellReady = false; toast('Name saved'); render(); } catch (ex) { toast(niceError(ex), true); }
    };
    $('#pw', main).onsubmit = async e => {
      e.preventDefault(); const pw = new FormData(e.target).get('pw');
      if (pw.length < 8) return toast('Use at least 8 characters.', true);
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) toast(niceError(error), true); else { toast('Password changed'); e.target.reset(); }
    };
    $('#out', main).onclick = () => sb.auth.signOut();
  }
};
const viewMore = {
  async load() {
    const links = [['certs', 'Certificates & maintenance', 'cert'], ['activity', 'Activity', 'clock'], ['approvals', 'Approvals', 'check'], ...NAV2];
    return topbar('More') + `<section class="panel"><ul class="list">${links.map(([r, l, i]) => `<li><a class="main" href="#/${r}" style="display:flex;gap:12px;align-items:center">${ico(i).replace('<svg', '<svg width="22" height="22"')}<span class="name">${l}</span>
      ${r === 'approvals' && S.pending ? `<span class="chip pending" style="margin-left:auto">${S.pending}</span>` : ''}</a></li>`).join('')}
      <li><a class="main" href="#" id="out2"><span class="name">Sign out</span></a></li></ul></section>`;
  },
  bind(main) { $('#out2', main).onclick = e => { e.preventDefault(); sb.auth.signOut(); }; }
};

// ================================================================ EXCEL
async function xlsx() { await loadScript('vendor/xlsx.full.min.js'); return window.XLSX; }
async function exportRows(file, sheet, head, rows) {
  try {
    const X = await xlsx(); const wb = X.utils.book_new(); const ws = X.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(60, Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)) + 2) }));
    X.utils.book_append_sheet(wb, ws, sheet.slice(0, 31)); X.writeFile(wb, file);
  } catch (e) { toast(niceError(e), true); }
}
async function exportInventory(rows) {
  try {
    const X = await xlsx(); const wb = X.utils.book_new();
    const head = ['S/N', 'Item Code', 'Description', 'Category', 'Type', 'In store', 'Out on jobs', 'Reserved', 'In transit', 'Damaged', 'Total', 'Unit', 'Reorder at', 'Locations', 'Next cert due', 'Notes'];
    const all = [];
    S.depts.forEach(d => {
      const its = rows.filter(i => i.department_id === d.id && i.active);
      const data = its.map((i, n) => [n + 1, i.code, i.name, i.category, TYPE_SHORT[i.item_type], +i.qty_available, +i.qty_out, +i.qty_reserved, +i.qty_in_transit, +i.qty_damaged, +i.qty_total, i.unit, i.min_qty ?? '', i.locations || '', i.next_due ? fd(i.next_due) : '', i.notes || '']);
      all.push(...its);
      const ws = X.utils.aoa_to_sheet([[`${CFG.APP_NAME}: ${d.name}`], [`As at ${new Date().toLocaleString('en-GB')}`], [], head, ...data]);
      ws['!cols'] = [6, 26, 60, 28, 12, 9, 11, 9, 9, 9, 8, 6, 10, 24, 14, 40].map(w => ({ wch: w }));
      const short = d.name.length <= 31 ? d.name : d.name.split(/ Technologies| &|,/)[0];
      X.utils.book_append_sheet(wb, ws, short.replace(/[\\/?*[\]:]/g, '').slice(0, 31));
    });
    const reorder = all.filter(needsReorder).map(i => [i.code, i.name, i.department, +i.qty_available, i.min_qty ?? '', i.max_qty != null ? Math.max(0, i.max_qty - i.qty_available) : '', i.supplier || '']);
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Item Code', 'Description', 'Department', 'In store', 'Reorder at', 'Suggested order qty', 'OEM / supplier'], ...reorder]), 'Restock list');
    X.writeFile(wb, `Inventory_${localISO(0)}.xlsx`);
  } catch (e) { toast(niceError(e), true); }
}

})();
