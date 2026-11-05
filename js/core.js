/* GANKCO Nest — core: config, data, auth, shell, routing */
'use strict';
const CFG = window.APP_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ---------------------------------------------------------------- state
const S = {
  orders: {}, ordersAt: 0,
  session: null, profile: null, recovery: false,
  depts: [], cats: [], locs: [], people: {}, members: [], settings: {},
  items: null, stock: null, pending: 0, alerts: { unread: 0, reminders: [] },
  line: (() => { try { return localStorage.getItem('nest.line') || ''; } catch (e) { return ''; } })(),
  inv: { q: '', svc: '', sub: '', kind: '', st: '', kit: false, loc: '', view: 'all', moved: '', sel: new Set(), edit: false, changes: new Map() },
  co: { view: 'open', q: '' },
  act: { type: '', from: '', to: '', q: '', rows: [], done: false },
  certs: { view: 'soon', tab: 'certs' },
  appr: { view: 'pending', sel: new Set() },
  shellReady: false, channel: null,
  viewAs: (() => { try { const v = JSON.parse(sessionStorage.getItem('nest.viewAs') || 'null'); return v && !('inventory' in v) ? null : v; } catch (e) { return null; } })(),
  invMy: (() => { try { return localStorage.getItem('nest.invMy') === '1'; } catch (e) { return false; } })(),
};

// ---------------------------------------------------------------- helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (v === null || v === undefined || v === '') ? null : Number(v);
const fq = n => n == null ? '—' : (+n).toLocaleString('en-GB', { maximumFractionDigits: 2 });
const fd = d => d ? new Date(String(d).length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fdt = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmonth = m => m ? new Date(String(m).slice(0, 7) + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '—';
const localISO = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const monthISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const tag = (code, cls = '') => code ? `<span class="tag ${cls}">${esc(code)}</span>` : `<span class="tag none ${cls}">No code</span>`;
const chip = (cls, text) => `<span class="chip ${cls}">${esc(text)}</span>`;
const ORG = CFG.ORG_SHORT || 'GANKCO';
const wordmark = () => `<span class="wordmark"><span class="a">${esc(ORG.slice(0, 3))}</span><span class="b">${esc(ORG.slice(3))}</span></span>`;
const itemUrl = id => `${location.origin}${location.pathname}#/item/${id}`;
const ord = n => { n = +n; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const plural = (n, w, p) => `${fq(n)} ${n == 1 ? w : (p || w + 's')}`;
const STATUS = { available: 'Available', reserved: 'Reserved', in_transit: 'In transit', damaged: 'Damaged' };
const TYPES = { equipment: 'Equipment (returns)', consumable: 'Consumable', sales: 'Sales item' };
const TYPE_SHORT = { equipment: 'Equipment', consumable: 'Consumable', sales: 'Sales' };
// 2.9: the four inventory types (the behaviour above follows from them: rental items and company tools come back from jobs)
const KINDS = { sales: 'Sales items', rental: 'Rental items', consumable: 'Consumables', asset: 'Company tools & assets' };
const KIND_HINT = { sales: 'Sold to the client: they leave for good.', rental: 'Go out on jobs and come back.', consumable: 'Used up on jobs.', asset: 'Company tools and assets: go out and come back.' };
const kindLabel = k => KINDS[k] || '—';
// service lines (one list for Inventory and PO) and sub-types
const svcMajors = (all) => (S.svc || []).filter(l => !l.parent_id && (all || l.active !== false)).sort((a, b) => a.sort - b.sort || a.id - b.id);
const svcSubs = (major, all) => (S.svc || []).filter(l => l.parent_id === +major && (all || l.active !== false)).sort((a, b) => a.sort - b.sort || a.id - b.id);
const svcById = id => (S.svc || []).find(l => l.id === +id);
const svcLabel = id => { const s = svcById(id); if (!s) return '—'; const m = svcById(s.parent_id); return m ? `${m.code} · ${s.name}` : s.name; };
const subtypesOf = (kind, all) => (S.subtypes || []).filter(t => t.kind === kind && (all || t.active)).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
const subtypeName = id => (S.subtypes || []).find(t => t.id === +id)?.name || '';
const CERT_KINDS = { certification: 'Certification', calibration: 'Calibration', maintenance: 'Maintenance', inspection: 'Inspection', pressure_test: 'Pressure test' };
const ROLE_LABEL = { pending: 'Waiting for approval', staff: 'Staff', superadmin: 'Developer', disabled: 'No access', admin: 'Admin', viewer: 'Viewer', management: 'Viewer' };
// 3.0.4: a role per app. The Developer (key 'superadmin') is admin everywhere; being an admin in one app gives nothing in another.
const APP_ROLES = { inventory: [['admin', 'Admin'], ['staff', 'Staff'], ['viewer', 'Viewer']], po: [['staff', 'Staff'], ['viewer', 'Viewer']], proforma: [['admin', 'Admin'], ['staff', 'Staff']] };
const APP_ROLE_HINT = { inventory: { admin: 'Manages items and stock. Approves for the lines where they are main or backup admin.', staff: 'Requests, counts and returns for their service lines.', viewer: 'Sees the Overview and stock, and adds jobs to the Job planner.' },
  po: { staff: 'Raises, revises, cancels and closes their own POs.', viewer: 'Sees the Overview and POs, and downloads them.' }, proforma: { admin: 'Manages PFIs and quotes.', staff: 'Makes PFIs and quotes.' } };
const appRoleOf = (p, app) => !p ? null : p.role === 'superadmin' ? (app === 'po' ? 'staff' : 'admin') : p.role !== 'staff' ? null
  : (p.apps || []).includes(app) ? ((p.app_roles || {})[app] || 'staff') : null;

// roles & service lines
const realRole = () => S.profile?.role;
const realSuper = () => realRole() === 'superadmin';
const viewAsOn = () => !!(S.viewAs && realSuper());
const role = () => viewAsOn() ? (S.viewAs.role === 'superadmin' ? 'superadmin' : 'staff') : realRole();
const isSuper = () => role() === 'superadmin';
const appRole = app => viewAsOn() ? (S.viewAs.role === 'superadmin' ? appRoleOf({ role: 'superadmin' }, app) : (S.viewAs[app] || null)) : appRoleOf(S.profile, app);
const invRole = () => appRole('inventory');
// Inventory admins can switch to My view (what staff see) and back
const invAdminReal = () => invRole() === 'admin';
const invMyView = () => !isSuper() && invAdminReal() && S.invMy;
const isAdmin = () => invAdminReal() && !invMyView();
const isActive = () => ['staff', 'superadmin'].includes(role());
const isMgmt = () => invRole() === 'viewer';
const myLineIds = () => isSuper() ? S.depts.map(d => d.id) : viewAsOn() ? (S.viewAs.lines || []).map(Number) : S.members.filter(m => m.profile_id === S.profile?.id).map(m => m.department_id);
const inLine = d => myLineIds().includes(+d);
const canAct = d => isAdmin() || (['staff', 'admin'].includes(invRole()) && inLine(d));
const canAdmin = d => isAdmin();
const myRoleLabel = () => isSuper() ? 'Developer' : S.shellApp === 'admin' || S.shellApp === 'people' ? 'Staff' : (ROLE_LABEL[appRole(curApp())] || 'Staff') + (invMyView() && curApp() === 'inventory' ? ' · My view' : '');
// approving a line's requests and counts: its main or backup admin, or the Developer
const approverLineIds = () => isSuper() ? S.depts.map(d => d.id) : !isAdmin() ? [] : viewAsOn() ? (S.viewAs.lines || []).map(Number)
  : S.depts.filter(d => [d.main_admin, d.backup_admin].includes(S.profile?.id)).map(d => d.id);
const canApprove = d => approverLineIds().includes(+d);
const isApproverOf = (pid, d) => { const p = S.people[pid]; const x = S.depts.find(y => y.id === +d); return !!p && (p.role === 'superadmin' || (appRoleOf(p, 'inventory') === 'admin' && !!x && [x.main_admin, x.backup_admin].includes(pid))); };
const lineName = id => S.depts.find(d => d.id === +id)?.name || '—';
const lineShort = id => { const d = S.depts.find(x => x.id === +id); return d ? (d.short_name || d.name) : '—'; };
const locName = id => S.locs.find(l => l.id === +id)?.name || '—';
const placeholderLoc = () => S.locs.find(l => l.is_placeholder);
const realLocs = () => S.locs.filter(l => l.active && !l.is_placeholder);
const personName = (id, fallback = '') => { const p = S.people[id]; return p ? (p.full_name || p.email) : fallback; };
const setting = (k, d) => S.settings[k] ?? d;
// 2.8: which apps a person can open (the Developer always has all of them)
// 3.0.3: while viewing as a role, apps follow that role (Inventory and PO; PeopleCore only for the Developer until go-live)
const appAllowed = app => viewAsOn() ? (S.viewAs.role === 'superadmin' || !!S.viewAs[app]) : (realSuper() || (realRole() === 'staff' && (S.profile?.apps || []).includes(app)));
// 3.0.4: PeopleCore is under construction until the Developer opens it (the Developer and the testers they tick can go in)
const peopleBuilding = () => { const c = setting('people_construction', null); return !!(c && c.on) && !realSuper() && !((c.testers || []).includes(S.profile?.id)); };
const ADMIN_ROUTES = ['team', 'audit', 'settings', 'devtools'];

// "View as" is read-only: block every write while it's on
const VIEW_MSG = 'You’re viewing Nest as another role, so changes are switched off. Press Exit on the orange bar to make changes.';
const MGMT_MSG = 'You have view-only access to this app, so changes are switched off.';
const curApp = () => S.shellApp === 'po' ? 'po' : S.shellApp === 'proforma' ? 'proforma' : 'inventory';
const readOnly = () => !!S.viewAs || appRole(curApp()) === 'viewer';
(() => {
  const READ_RPC = new Set(['month_totals', 'period_flows', 'mark_notifications_read', 'log_signed_export', 'save_plan_snapshot', 'alert_status', 'preview_alert']);
  const blocked = () => { const msg = S.viewAs ? VIEW_MSG : MGMT_MSG; const p = new Proxy(function () { }, { get: (t, k) => k === 'then' ? (res => res({ data: null, error: { message: msg } })) : () => p, apply: () => p }); return p; };
  const _rpc = sb.rpc.bind(sb), _from = sb.from.bind(sb);
  // 3.0: PeopleCore is everyone's own HR self-service, so Management can use it too (but nothing changes while viewing as a role)
  const HR_READ = /^hr_(directory|team|my_profile|my_approvals|next_empno)$/;
  // 3.0.4: only "View as" blocks writes here; what a Viewer can't do, the server refuses
  sb.rpc = (fn, args, opts) => (S.viewAs && !READ_RPC.has(fn) && fn !== 'log_signed_export' && !HR_READ.test(fn)) ? blocked() : _rpc(fn, args, opts);
  sb.from = t => { const b = _from(t); if (S.viewAs) ['insert', 'update', 'delete', 'upsert'].forEach(m => { b[m] = () => blocked(); }); return b; };
})();
function setViewAs(v) { S.viewAs = v; try { v ? sessionStorage.setItem('nest.viewAs', JSON.stringify(v)) : sessionStorage.removeItem('nest.viewAs'); } catch (e) { } S.shellReady = false; S.inv.edit = false; S.inv.changes.clear(); refreshAlerts(); render(); }
function viewAsBar() {
  if (!viewAsOn()) return '';
  const v = S.viewAs; const bits = v.role === 'superadmin' ? ['Developer'] : [['inventory', 'Inventory'], ['po', 'PO']].filter(([k]) => v[k]).map(([k, l]) => `${l} ${ROLE_LABEL[v[k]]}`);
  return `<div class="viewas-bar">Viewing as <b>${esc(bits.join(' · ') || 'Staff, no apps')}</b>${v.inventory && v.inventory !== 'viewer' ? ' · ' + esc((v.lines || []).map(lineShort).join(', ') || 'no service line') : ''} · read only <button class="btn small" id="va-exit">Exit</button></div>`;
}
function bindViewAs() { const x = $('#va-exit'); if (x) x.onclick = () => setViewAs(null); }
function openViewAs() {
  const sel = (n, app) => `<label class="f">${app === 'inventory' ? 'Inventory' : 'Purchase Order'}<select name="${n}"><option value="">No access</option>${APP_ROLES[app].map(([k, l]) => opt(k, l, app === 'inventory' ? 'staff' : 'staff')).join('')}</select></label>`;
  return modal({
    title: 'View Nest as…', sub: 'See exactly what a person with these roles sees: menu, what can be edited, approvals and reminders. Read only: nothing can be changed while viewing.', submit: 'Start viewing',
    body: `<div class="grid2">${sel('inventory', 'inventory')}${sel('po', 'po')}</div>
      <div class="f">Service line(s)<span class="hint">An Admin here is treated as main admin of the lines you tick. Not needed for a Viewer.</span>${S.depts.map(d => `<label class="check"><input type="checkbox" name="l${d.id}"> ${esc(d.name)}</label>`).join('')}</div>`,
    onSubmit: async x => { const lines = S.depts.filter(d => x['l' + d.id]).map(d => d.id);
      if (x.inventory && x.inventory !== 'viewer' && !lines.length) throw new Error('Tick at least one service line.');
      setTimeout(() => setViewAs({ role: 'staff', inventory: x.inventory || null, po: x.po || null, lines }), 0); }
  });
}
function niceError(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/permission denied|row-level security/i.test(m)) return 'You don’t have permission to do that.';
  if (/JWT expired|invalid JWT/i.test(m)) return 'Your sign-in expired. Sign in again.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Can’t reach the server. Check your internet connection and try again.';
  if (/rate limit/i.test(m)) return 'Too many emails were sent in the last hour. Try again later, or ask an admin.';
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
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), bad ? 6500 : 3200);
}
// Loads a tool (PDF, Excel, quote reader…) once. Two things make it reliable on every computer:
// - some browser add-ons put a "script loader" (define / module / exports) on every page; the tools would register with it
//   instead of with Nest ("Cannot read properties of undefined (reading 'jsPDF')"), so those are hidden while a tool loads;
// - a press while the tool is still loading waits for it, and a failed load is tried again on the next press.
const SCRIPT_LOADS = {};
function loadScript(src) {
  if (SCRIPT_LOADS[src]) return SCRIPT_LOADS[src];
  const p = new Promise((res, rej) => {
    const old = $(`script[data-src="${src}"]`); if (old) old.remove();
    const s = document.createElement('script'); s.src = src + '?v=' + encodeURIComponent(CFG.VERSION || ''); s.dataset.src = src; s.async = false;
    const keep = {}; const names = ['define', 'module', 'exports'];
    const hide = () => names.forEach(n => { if (n in window) { keep[n] = window[n]; try { window[n] = undefined; } catch (e) { } } });
    const restore = () => names.forEach(n => { if (n in keep) { try { window[n] = keep[n]; } catch (e) { } } });
    s.onload = () => { restore(); res(); };
    s.onerror = () => { restore(); s.remove(); delete SCRIPT_LOADS[src]; rej(new Error('Could not load ' + src.replace(/^.*\//, '') + '. Check your connection and try again.')); };
    hide(); document.head.appendChild(s);
  });
  SCRIPT_LOADS[src] = p;
  return p;
}
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '').split('#')[0];
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}
function go(h) { if (location.hash === h) render(); else location.hash = h; }
function setLine(v) { S.line = v ? String(v) : ''; try { localStorage.setItem('nest.line', S.line); } catch (e) { } }

// ---------------------------------------------------------------- icons
const I = {
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/>',
  out: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cert: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  count: '<path d="M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2"/><path d="M9 13l2 2 4-4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
  label: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 15l2 2 4-4"/>',
  sign: '<path d="M4 20h16"/><path d="M14.5 4.5l3 3L8 17H5v-3z"/>',
  audit: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><path d="M7 14h10v7H7z"/>',
  pdf: '<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5M9 13h6M9 17h4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  move: '<path d="M5 12h14M15 8l4 4-4 4M9 16l-4-4 4-4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  pay: '<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.8"/><path d="M6 9.5h.01M18 15.5h.01"/>',
  building: '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/>',
  kit: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.4-.4-2.4z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
};
const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

// ---------------------------------------------------------------- modal
function modal({ title, sub = '', body, submit = 'Save', cancel = 'Cancel', onSubmit, onOpen, danger = false, wide = false }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'modal' + (wide ? ' wide' : '');
    d.innerHTML = `<form method="dialog" novalidate>
      <div class="mh"><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
      <div class="mb"><div class="err" hidden></div>${body}</div>
      <div class="mf"><button type="button" class="btn" data-x>${esc(cancel)}</button>
      ${submit ? `<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(submit)}</button>` : ''}</div></form>`;
    document.body.appendChild(d);
    const f = $('form', d), err = $('.err', d), btn = $('button[type=submit]', d);
    const close = v => { d.close(); d.remove(); resolve(v); };
    $('[data-x]', d).onclick = () => close(null);
    d.addEventListener('cancel', e => { e.preventDefault(); close(null); });
    f.onsubmit = async e => {
      e.preventDefault(); if (!btn) return; err.hidden = true; btn.disabled = true;
      const data = Object.fromEntries(new FormData(f).entries());
      $$('input[type=checkbox]', f).forEach(c => { if (c.name) data[c.name] = c.checked; });
      try { const r = await onSubmit(data, d); close(r ?? true); }
      catch (ex) { if (ex && ex.quiet) { err.hidden = true; btn.disabled = false; return; } console.error(ex); err.textContent = niceError(ex); err.hidden = false; btn.disabled = false; d.querySelector('.mb').scrollTop = 0; }
    };
    d.showModal();
    if (onOpen) onOpen(d, close);
    const first = $('input:not([type=hidden]):not([type=checkbox]):not([type=file]),select,textarea', d); if (first && !first.readOnly) first.focus();
  });
}
const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(sel) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
const locOptions = (sel, filter) => S.locs.filter(l => l.active && (!filter || filter(l))).map(l => opt(l.id, l.name, sel)).join('');
const realLocOptions = sel => locOptions(sel, l => !l.is_placeholder);
const lineOptions = (sel, filter) => S.depts.filter(d => !filter || filter(d)).map(d => opt(d.id, d.short_name || d.name, sel)).join('');

// ---------------------------------------------------------------- data
async function loadLookups() {
  const [depts, cats, locs, people, members, settings, svc, subtypes] = await Promise.all([
    q(sb.from('departments').select('*').order('sort')),
    q(sb.from('categories').select('*').order('sort')),
    q(sb.from('locations').select('*').order('is_placeholder').order('name')),
    q(sb.from('profiles').select('id,full_name,email,role,created_at,apps,app_roles,job_title,signature_id')),
    q(sb.from('memberships').select('*')),
    q(sb.from('app_settings').select('*')),
    q(sb.from('po_service_lines').select('*').order('sort')).catch(() => []),
    q(sb.from('inv_subtypes').select('*').order('sort')).catch(() => []),
  ]);
  S.depts = depts; S.cats = cats; S.locs = locs; S.members = members; S.svc = svc; S.subtypes = subtypes;
  S.people = Object.fromEntries(people.map(p => [p.id, p]));
  S.settings = Object.fromEntries(settings.map(s => [s.key, s.value]));
}
async function items(force = false) {
  if (!S.items || force) {
    S.items = await fetchAll(() => sb.from('item_overview').select('*').order('department_id').order('import_ref', { nullsFirst: false }).order('id'));
  }
  return S.items;
}
async function stockRows(force = false) {
  if (!S.stock || force) S.stock = await fetchAll(() => sb.from('stock').select('item_id,location_id,status,qty').gt('qty', 0));
  return S.stock;
}
function stockOf(itemId, locId, status = 'available') {
  return +((S.stock || []).find(s => s.item_id === itemId && s.location_id === +locId && s.status === status)?.qty || 0);
}
function invalidate() { S.items = null; S.stock = null; S.plan = null; S.ordersAt = 0; }
// items marked On order (2.6), keyed by item id
async function loadOrders() {
  if (S.ordersAt && Date.now() - S.ordersAt < 60000) return S.orders;
  try { const r = await q(sb.from('item_orders').select('*')); S.orders = Object.fromEntries(r.map(o => [o.item_id, o])); S.ordersAt = Date.now(); } catch (e) { S.orders = S.orders || {}; }
  return S.orders;
}
const fdm = d => d ? new Date(String(d).length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const lineFilter = arr => S.line ? arr.filter(x => x.department_id === +S.line) : arr;

// ---------------------------------------------------------------- alerts (bell)
async function refreshAlerts() {
  if (!isActive()) return;
  try {
    const mine = myLineIds(); const t = localISO(0);
    const [{ count: unreadReal }, appr, counts, kits, certs, overdue, mrs, sos] = await Promise.all([
      sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
      approverLineIds().length ? q(sb.from('change_batches').select('id,department_id,submitted_by').eq('state', 'pending')) : [],
      q(sb.from('counts').select('department_id,state').eq('month', monthISO())),
      q(sb.from('kit_status').select('unit_id,department_id,expiry_on').lte('expiry_on', localISO(+setting('kit_warn_days', 60))).not('expiry_on', 'is', null)),
      q(sb.from('certifications').select('id,item_id,items(department_id)').eq('superseded', false).not('due_on', 'is', null).lte('due_on', localISO(+setting('cert_warn_days', 30)))),
      q(sb.from('checkouts').select('id,items(department_id)').is('closed_at', null).lt('due_back', t)),
      q(sb.from('jobs').select('id,job_no,status,requester_id,created_by,expected_return,received_at,job_sections(department_id,state)').in('status', ['submitted', 'partial', 'out'])),
      q(sb.from('report_signoffs').select('id,ref,status,department_id,prepared_by').in('status', ['review', 'approval', 'returned'])).catch(() => []),
    ]);
    const unread = S.viewAs ? 0 : unreadReal;
    const R = [];
    const myAppr = appr.filter(b => canApprove(b.department_id));
    S.pending = myAppr.length;
    if (myAppr.length) R.push({ kind: 'approval', title: `${plural(myAppr.length, 'request')} waiting for your approval`, link: '#/approvals' });
    // 3.0.4: the line's main or backup admin approves; nobody approves their own request
    const mrWait = mrs.filter(j => ['submitted', 'partial'].includes(j.status) && (isSuper() || (j.requester_id !== S.profile.id && j.created_by !== S.profile.id)) && (j.job_sections || []).some(s => s.state === 'pending' && canApprove(s.department_id)));
    S.pendingMR = mrWait.length;
    if (mrWait.length) R.push({ kind: 'approval', title: `${plural(mrWait.length, 'materials request')} waiting for you to approve & issue`, link: mrWait.length === 1 ? '#/job/' + mrWait[0].id : '#/jobs?v=waiting' });
    const meId = S.viewAs ? null : S.profile.id;
    const mine2 = mrs.filter(j => j.requester_id === meId && ['out', 'partial'].includes(j.status) && j.expected_return && j.expected_return < t);
    if (mine2.length) R.push({ kind: 'late', title: `${plural(mine2.length, 'of your materials requests', 'of your materials requests')} overdue for return`, link: mine2.length === 1 ? '#/job/' + mine2[0].id : '#/jobs?v=out' });
    const rcpt = mrs.filter(j => j.requester_id === meId && j.status === 'out' && !j.received_at);
    if (rcpt.length) R.push({ kind: 'issued', title: `Confirm receipt: ${rcpt.length === 1 ? rcpt[0].job_no : plural(rcpt.length, 'materials request')}`, body: 'Check the items you were issued, then confirm receipt to sign the Load-out Manifest.', link: rcpt.length === 1 ? '#/job/' + rcpt[0].id : '#/jobs?v=mine' });
    const soWait = sos.filter(r => canSignReport(r));
    S.pendingSO = soWait.length;
    if (soWait.length) R.push({ kind: 'signoff', title: `${plural(soWait.length, 'report')} waiting for your signature`, link: soWait.length === 1 ? '#/signoff/' + soWait[0].id : '#/signoffs' });
    const soBack = sos.filter(r => r.status === 'returned' && r.prepared_by === meId);
    if (soBack.length) R.push({ kind: 'signoff', title: `${plural(soBack.length, 'report')} returned to you`, body: 'Update the figures and sign again.', link: soBack.length === 1 ? '#/signoff/' + soBack[0].id : '#/signoffs?v=returned' });
    const day = new Date().getDate(), open = +setting('count_open_day', 23), close = +setting('count_close_day', 26);
    const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });
    if (day >= open) {
      mine.forEach(d => {
        const c = counts.find(x => x.department_id === d);
        if (c && ['submitted', 'verified'].includes(c.state)) return;
        R.push(day > close
          ? { kind: 'late', title: `${lineShort(d)}: ${monthName} count is late`, body: `It was due on the ${ord(close)}.`, link: '#/count' }
          : { kind: 'count', title: `${lineShort(d)}: ${monthName} count is open`, body: `Submit by the ${ord(close)}.`, link: '#/count' });
      });
    } else if (day >= open - 3) {
      R.push({ kind: 'count', title: `Monthly count opens on the ${ord(open)}`, body: `Due by the ${ord(close)}.`, link: '#/count' });
    }
    const km = kits.filter(k => mine.includes(k.department_id));
    if (km.length) R.push({ kind: 'kit', title: `${plural(km.length, 'redress kit')} expiring or expired`, link: '#/certs?tab=kits' });
    const cm = certs.filter(c => mine.includes(c.items?.department_id));
    if (cm.length) R.push({ kind: 'cert', title: `${plural(cm.length, 'certificate')} due within ${setting('cert_warn_days', 30)} days`, link: '#/certs' });
    const om = overdue.filter(c => mine.includes(c.items?.department_id));
    if (om.length) R.push({ kind: 'late', title: `${plural(om.length, 'item')} overdue back from jobs`, link: '#/checkouts?v=overdue' });
    if (isSuper() && !S.viewAs && typeof backupDue === 'function' && backupDue()) R.push({ kind: 'backup', title: 'Monthly backup due', body: 'Settings → Backups → Download backup, then save it to Nest Backups in Google Drive.', link: '#/settings' });
    S.alerts = { unread: unread || 0, reminders: R };
    const n = (unread || 0) + R.length;
    $$('.bell-count').forEach(b => { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; });
    const pc = $('#pendingCount'); if (pc) { pc.textContent = S.pending; pc.hidden = !S.pending; }
  } catch (e) { console.warn('alerts', e); }
}
async function openBell() {
  const notes = await q(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(40)).catch(() => []);
  const R = S.alerts.reminders;
  if (S.viewAs) notes.length = 0;
  const icon = k => ({ issued: 'truck', approval: 'check', count: 'count', late: 'clock', kit: 'kit', cert: 'cert', low: 'box', faulty: 'box', missing: 'truck', decision: 'check', signup: 'users', signoff: 'sign', backup: 'down', po: 'audit', people: 'users' }[k] || 'bell');
  const li = (n, unread) => `<li class="${unread ? 'unread' : ''}"><a href="${esc(n.link || '#/dashboard')}" data-close><span class="ni ni-${esc(n.kind || 'x')}">${ico(icon(n.kind))}</span>
    <span><b>${esc(n.title)}</b>${n.body ? `<span class="sub">${esc(n.body)}</span>` : ''}${n.created_at ? `<span class="sub">${fdt(n.created_at)}</span>` : ''}</span></a></li>`;
  const d = document.createElement('div'); d.className = 'bellpanel'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Notifications');
  d.innerHTML = `<div class="bp-head"><b>Notifications</b><button class="btn small" data-close>Close</button></div>
    ${R.length ? `<div class="bp-sec">Needs attention</div><ul>${R.map(r => li(r, true)).join('')}</ul>` : ''}
    <div class="bp-sec">Recent</div>
    ${S.viewAs ? '<div class="empty">Personal notifications aren’t shown while viewing as a role.</div>' : notes.length ? `<ul>${notes.map(n => li(n, !n.read_at)).join('')}</ul>` : '<div class="empty">No notifications yet.</div>'}`;
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const close = () => { d.remove(); scrim.remove(); };
  scrim.onclick = close; d.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  document.body.append(scrim, d);
  if (!S.viewAs && notes.some(n => !n.read_at)) { await sb.rpc('mark_notifications_read', { p_ids: null }); refreshAlerts(); }
}

// ---------------------------------------------------------------- realtime
function subscribe() {
  if (S.channel) return;
  const onChange = debounce(() => {
    invalidate(); refreshAlerts();
    if (!document.querySelector('dialog[open]') && !S.inv.edit && document.visibilityState === 'visible' && !location.hash.startsWith('#/count')) render({ quiet: true });
  }, 900);
  try {
    S.channel = sb.channel('nest-live');
    ['stock', 'checkouts', 'movements', 'change_batches', 'items', 'counts', 'jobs', 'job_sections', 'report_signoffs', 'plan_jobs', 'item_orders', 'service_log', 'po_orders', 'po_receipts', 'po_revisions'].forEach(t =>
      S.channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange));
    S.channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => refreshAlerts());
    S.channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, p => typeof onAuditLive === 'function' && onAuditLive(p));
    S.channel.on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_windows' }, () => typeof onMaintChange === 'function' && onMaintChange());
    S.channel.subscribe();
  } catch (e) { console.warn('Live updates unavailable', e); }
  setInterval(refreshAlerts, 5 * 60 * 1000);
}

// ---------------------------------------------------------------- version check
async function checkVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
    const v = await r.json();
    if (v.version && v.version !== CFG.VERSION && !$('#newver')) {
      const b = document.createElement('div'); b.id = 'newver'; b.className = 'newver';
      b.innerHTML = `A new version of ${esc(CFG.APP_NAME)} is available. <button class="btn small tagbtn">Reload</button>`;
      $('button', b).onclick = () => location.reload(); document.body.appendChild(b);
    }
  } catch (e) { }
}

// ---------------------------------------------------------------- auth
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') S.recovery = true;
  const changed = (session?.user?.id || null) !== (S.session?.user?.id || null);
  S.session = session;
  if (event === 'SIGNED_OUT') { S.profile = null; invalidate(); S.shellReady = false; if (S.channel) { sb.removeChannel(S.channel); S.channel = null; } }
  if (event === 'INITIAL_SESSION' || changed || event === 'PASSWORD_RECOVERY' || event === 'SIGNED_OUT') whenReady(boot);
});

function whenReady(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(fn, 0), { once: true }); else setTimeout(fn, 0); }
async function boot() {
  if (S.recovery) return renderReset();
  if (!S.session) return renderAuth('signin');
  try {
    S.profile = await q(sb.from('profiles').select('*').eq('id', S.session.user.id).maybeSingle());
  } catch (e) { return renderAuth('signin', niceError(e)); }
  if (!isActive()) return renderPending();
  if (S.viewAs && !realSuper()) setViewAs(null);
  try { await loadLookups(); } catch (e) { return renderAuth('signin', niceError(e)); }
  if (typeof loadMaint === 'function') { await loadMaint(); S.maint.sig = maintSig(); }
  if (!isSuper() && !S.depts.some(d => +S.line === d.id)) setLine('');
  if (!S.line && !isSuper() && !isAdmin()) { const m = myLineIds(); if (m.length === 1) setLine(m[0]); }
  refreshAlerts(); subscribe(); checkVersion();
  S.shellReady = false;
  render();
  setTimeout(() => { if (typeof refreshPlanSnapshot === 'function' && !S.viewAs) refreshPlanSnapshot(); }, 8000);
}

const CREDIT = 'Designed and built by Ehigie Momodu';

function authShell(inner) {
  $('#app').innerHTML = `<div class="auth">
    <div class="auth-art">
      <img class="eagle" src="brand/mark.png" alt="">
      <div class="lockup">${wordmark()}<div class="sublock">NEST</div>
        <div class="motto">${esc(CFG.TAGLINE || '')}</div></div>
      <div class="foot"><span>${esc(CFG.COMPANY || '')} · ${esc(CFG.MOTTO || '')}</span></div></div>
    <div class="auth-form"><div class="auth-col">${inner}<p class="credit">${esc(CREDIT)}</p></div></div></div>`;
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
      <h1>Create an account</h1><p class="sub">Use your ${esc(CFG.SIGNUP_DOMAIN ? '@' + CFG.SIGNUP_DOMAIN : 'company')} email (no company email? use the one HR has for you). An admin approves new accounts and assigns your service line.</p>${note}
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
  if (mode === 'signin') signinMaintNotice();
  const f = $('#f');
  f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)); const b = $('button[type=submit]', f); b.disabled = true;
    try {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email: d.email.trim(), password: d.password });
        if (error) throw new Error(/invalid login/i.test(error.message) ? 'Wrong email or password.' : /not confirmed/i.test(error.message) ? 'Confirm your email first: open the link we sent you.' : error.message);
      } else if (mode === 'signup') {
        // 3.0: the email domain is checked by the database (it also lets in the email HR has on someone's PeopleCore record)
        if (d.password.length < 8) throw new Error('Use at least 8 characters for the password.');
        const { data, error } = await sb.auth.signUp({ email: d.email.trim(), password: d.password,
          options: { data: { full_name: d.name.trim() }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw new Error(/database error|only gankco/i.test(error.message) ? `Use your GANKCO email (@${CFG.SIGNUP_DOMAIN || 'gankcoenergy.com'}). If you don’t have one, ask HR to put your email on your PeopleCore record first.` : error.message);
        if (!data.session) return renderAuth('signin', 'Account created. Check your email for a confirmation link, then sign in.', true);
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(d.email.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        return renderAuth('signin', 'If that email has an account, a reset link is on its way.', true);
      }
    } catch (ex) { b.disabled = false; renderAuth(mode, niceError(ex)); }
  };
}

// Sign-in page: say when Nest is under maintenance (or about to be), before anyone signs in
async function signinMaintNotice() {
  try {
    const { data: w } = await sb.rpc('maint_public'); if (!w || !$('#f')) return;
    const t = d => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
    const back = w.back_by ? (new Date(w.back_by) < new Date() ? 'shortly' : 'by ' + t(w.back_by)) : 'soon';
    const n = document.createElement('div'); n.className = 'notice maint-signin';
    n.innerHTML = w.on ? `<b>Nest is being updated.</b> ${esc(w.message || 'Your data is safe.')} It’ll be back ${esc(back)}. You can sign in now, but you’ll see the maintenance screen until it’s done.`
      : `<b>Heads-up:</b> Nest will be updated on ${esc(t(w.starts_at))}${w.back_by ? `, back by ${esc(t(w.back_by))}` : ''}. Save your work before then.`;
    ($('#f p.sub') || $('#f h1')).insertAdjacentElement('afterend', n);
  } catch (e) { /* not important */ }
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
      : 'Your account is set up. An admin needs to approve it and assign your service line before you can see the inventory.'}</p>
    <p class="muted">Signed in as ${esc(S.session.user.email)}</p>
    <div class="actionrow"><button class="btn primary" id="again">Check again</button><button class="btn" id="out">Sign out</button></div></div>`);
  $('#again').onclick = boot; $('#out').onclick = () => sb.auth.signOut();
}

// ---------------------------------------------------------------- shell
// Report sign-off: can I sign it at its current step?
function canSignReport(r) {
  const me = S.viewAs ? null : S.profile.id;
  if (r.status === 'review') return !isSuper() && isAdmin() && r.department_id != null && canApprove(r.department_id) && r.prepared_by !== me;
  if (r.status === 'approval') return isSuper();
  return false;
}

function navItems() {
  if (S.shellApp === 'po' && typeof poNav === 'function') return poNav();
  if (S.shellApp === 'people' && peopleBuilding()) return { main: [['', 'Nest home', 'grid']], setup: [] };
  if (S.shellApp === 'people' && typeof peopleNav === 'function') return peopleNav();
  if (S.shellApp === 'admin') return { main: [...(isSuper() ? [['team', 'Team & access', 'users'], ['audit', 'Audit log', 'audit'], ['settings', 'Nest settings', 'gear'], ['devtools', 'Developer tools', 'wrench']] : []), ['account', 'My account', 'user']],
    setup: [...(appAllowed('inventory') ? [['dashboard', 'Inventory', 'box']] : []), ...(appAllowed('po') ? [['po/overview', 'Purchase Order', 'audit']] : []), ...(appAllowed('people') ? [['people', 'PeopleCore', 'users']] : [])] };
  const main = [['dashboard', 'Overview', 'home'], ['inventory', 'Inventory', 'box'], ['scan', 'Scan', 'scan'],
    ['jobs', 'Materials requests', 'truck'], ['planner', 'Job planner', 'plan'], ['checkouts', 'Out on jobs', 'out'], ['count', 'Monthly count', 'count'],
    ['certs', 'Certificates & kits', 'cert'], ['reports', 'Reports', 'chart'], ['signoffs', 'Sign-offs', 'sign'], ['activity', 'Activity', 'clock'],
    ['approvals', approverLineIds().length ? 'Approvals' : 'My requests', 'check']];
  if (isMgmt()) return { main: main.filter(([r]) => ['dashboard', 'inventory', 'planner', 'reports', 'signoffs'].includes(r)), setup: [] };
  const setup = [...(isAdmin() ? [['locations', 'Locations', 'pin'], ['labels', 'Labels', 'label'], ['invsettings', 'Inventory settings', 'gear']] : []), ...(isSuper() ? [['team', 'Nest admin', 'users']] : [])];
  // 3.0.4: Inventory admins switch between what staff see (My view) and the admin tools
  const top = invAdminReal() && !isSuper() ? `<div class="seg viewseg" id="invmode" role="group" aria-label="View"><button type="button" data-m="my" class="${invMyView() ? 'on' : ''}">My view</button><button type="button" data-m="admin" class="${invMyView() ? '' : 'on'}">Admin view</button></div>` : '';
  return { main, setup, top };
}

function shell() {
  if (S.shellReady) return;
  const p = S.profile; const { main, setup, top } = navItems();
  const link = ([r, l, i]) => i === null ? `<a class="subitem" href="#/${r}" data-r="${r}">${l}</a>` : `<a href="#/${r}" data-r="${r}">${ico(i)}${l}${r === 'approvals' && approverLineIds().length ? `<span class="count" id="pendingCount" ${S.pending ? '' : 'hidden'}>${S.pending}</span>` : ''}</a>`;
  $('#app').innerHTML = `<div class="shell">
    <aside class="side">
      <a class="brand" href="#/"><img src="brand/mark-96.png" alt="">
        <span class="brand-name">${wordmark()}<small>Nest · ${S.shellApp === 'po' ? 'Purchasing' : S.shellApp === 'admin' ? 'Admin' : S.shellApp === 'people' ? 'PeopleCore' : 'Inventory'}</small></span></a>
      <a class="apps-link" href="#/">${ico('grid')}All apps</a>
      <nav class="nav">${top || ''}${main.map(link).join('')}
        ${setup.length ? `<div class="nav-group">${S.shellApp === 'admin' ? 'Apps' : navItems().setupLabel || 'Setup'}</div>${setup.map(link).join('')}` : ''}</nav>
      <div class="side-foot">${CFG.TAGLINE ? `<div class="motto">${esc(CFG.TAGLINE)}</div>` : ''}
        <a class="who" href="#/account">${esc(p.full_name || p.email)}</a><div class="role">${S.shellApp === 'people' && typeof hrRole === 'function' ? esc(hrRole() === 'hr_admin' ? 'HR admin' : hrRole() === 'hr_officer' ? 'HR officer' : S.hr?.me?.card?.title || ROLE_LABEL[role()]) : esc(myRoleLabel()) + (S.shellApp !== 'po' && S.shellApp !== 'admin' && !isSuper() && !isMgmt() ? ' · ' + esc(myLineIds().map(lineShort).join(', ') || 'no service line') : '')}</div>
        ${realSuper() ? `<button class="btn small viewas-btn" id="viewas">${S.viewAs ? 'Change view' : 'View as…'}</button>` : ''}
        <a href="#" id="signout">Sign out</a></div>
    </aside>${viewAsBar()}
    <main id="main"></main>
    <button class="bell" id="bell" aria-label="Notifications">${ico('bell')}<span class="bell-count" hidden></span></button>
    ${S.shellApp === 'po' && typeof poBottomBar === 'function' ? poBottomBar() : S.shellApp === 'people' && !peopleBuilding() && typeof peopleBottomBar === 'function' ? peopleBottomBar() : S.shellApp === 'admin' ? `<nav class="bottombar">
      ${isSuper() ? `<a href="#/team" data-r="team">${ico('users')}Team</a><a href="#/devtools" data-r="devtools">${ico('wrench')}Tools</a><a href="#/settings" data-r="settings">${ico('gear')}Settings</a>` : ''}
      <a href="#/account" data-r="account">${ico('user')}Account</a><a href="#/" data-r="home">${ico('grid')}Apps</a></nav>` : `<nav class="bottombar">
      <a href="#/dashboard" data-r="dashboard">${ico('home')}Overview</a>
      <a href="#/inventory" data-r="inventory">${ico('box')}Inventory</a>
      <a href="#/scan" data-r="scan" class="scan"><span class="disc">${ico('scan')}</span>Scan</a>
      <a href="#/jobs" data-r="jobs">${ico('truck')}Requests</a>
      <a href="#/more" data-r="more">${ico('more')}More</a>
    </nav>`}</div>`;
  $('#signout').onclick = e => { e.preventDefault(); sb.auth.signOut(); };
  $('#bell').onclick = openBell;
  const va = $('#viewas'); if (va) va.onclick = openViewAs; bindViewAs();
  $$('#invmode button').forEach(b => b.onclick = () => { S.invMy = b.dataset.m === 'my'; try { localStorage.setItem('nest.invMy', S.invMy ? '1' : '0'); } catch (e) { } S.shellReady = false; S.inv.edit = false; S.inv.changes.clear(); render(); });
  document.body.classList.toggle('viewing-as', !!(S.viewAs && realSuper()));
  S.shellReady = true; refreshAlerts();
}
function setNav(r) { $$('[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === r)); }

const ROUTES = {};
const APP_NAMES = { inventory: 'Inventory', po: 'Purchase Order', people: 'PeopleCore' };
ROUTES.building = { load: async () => `<div class="build-screen"><div class="build-card"><span class="build-ico">${ico('wrench')}</span><div><span class="maint-pill">PeopleCore · under construction</span></div>
    <h1>PeopleCore is being built</h1><p>Your HR self-service (profile, leave, requests, approvals and the company directory) opens here soon. Nothing for you to do yet.</p>
    <a class="btn primary" href="#/">Back to Nest home</a></div></div>` };
ROUTES.noapp = { load: async () => topbar(APP_NAMES[S.shellApp] || 'Nest') + `<div class="notice">You don’t have access to ${esc(APP_NAMES[S.shellApp] || 'this app')}. Ask the Developer if you need it.</div><a class="btn" href="#/">Back to Nest home</a>` };
let renderSeq = 0;
async function render(opts = {}) {
  if (!S.session || !isActive()) return;
  if (typeof stopScanner === 'function') stopScanner();
  const { parts, params } = parseHash();
  const r = parts[0] || '';
  if (typeof maintGate === 'function' && maintGate(r)) return;
  if (r === '' || r === 'home') { S.shellReady = false; return renderLauncher(); }
  if (S.inv.edit && r !== 'inventory') { S.inv.edit = false; S.inv.changes.clear(); }
  const app = r === 'po' ? 'po' : r === 'people' ? 'people' : ADMIN_ROUTES.includes(r) ? 'admin' : r === 'account' ? (S.shellApp || 'admin') : 'inventory';
  if (S.shellApp !== app) { S.shellApp = app; S.shellReady = false; }
  shell();
  // 2.8: an app someone doesn't have can't be opened, even by typing its address
  const blocked = (app === 'inventory' || app === 'people') && !appAllowed(app);
  // 3.0.4: PeopleCore is under construction for everyone but the Developer and the testers they tick
  const view = blocked ? ROUTES.noapp : app === 'people' && peopleBuilding() ? ROUTES.building : (ROUTES[r] || ROUTES.dashboard);
  setNav(r === 'item' ? 'inventory' : r === 'job' ? 'jobs' : r === 'po' ? (parts[1] && isNaN(+parts[1]) ? 'po/' + parts[1] : 'po') : r === 'people' ? (typeof pcNavKey === 'function' ? pcNavKey(parts) : typeof hrNavKey === 'function' ? hrNavKey(parts) : 'people') : r);
  let main = $('#main'); const seq = ++renderSeq;
  const y = window.scrollY;
  if (!opts.quiet) main.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const html = await view.load(parts, params);
    if (seq !== renderSeq) return;
    // 3.0: a page may rebuild the menu while it loads (PeopleCore), so write into the current main area
    if (!main.isConnected) main = $('#main');
    main.innerHTML = (typeof maintBars === 'function' ? maintBars(app, true) : '') + html + `<div class="pagefoot">${esc(CFG.APP_NAME)} · ${esc(CFG.TAGLINE || '')} · v${esc(CFG.VERSION || '')}</div>`;
    if (typeof bindMaintBars === 'function') bindMaintBars(main);
    view.bind && view.bind(main, parts, params);
    if (opts.quiet) window.scrollTo(0, y); else window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (!main.isConnected) main = $('#main') || main;
    if (seq === renderSeq) main.innerHTML = `<div class="notice bad">${esc(niceError(e))}</div><button class="btn" onclick="location.reload()">Reload</button>`;
  }
}
window.addEventListener('hashchange', () => render());

// 3.0.3: settings pages show each section as a bar; opening one closes the others. The open one stays open after a save.
const ACC = { page: null, open: null, seq: 0 };
function settingsAccordion(main, page) {
  const secs = $$('section.panel', main).filter(x => !x.parentElement.closest('section.panel'));
  if (secs.length < 2) return;
  const first = ACC.page !== page || ACC.seq !== renderSeq - 1; ACC.seq = renderSeq; if (first) { ACC.page = page; ACC.open = null; }
  const anchor = location.hash.split('#')[2] || '';
  secs.forEach((x, i) => { x.dataset.acc = x.id || 'p' + i; });
  if (first && anchor && secs.some(x => x.dataset.acc === anchor)) ACC.open = anchor;
  const head = x => x.querySelector(':scope > header');
  const name = x => (head(x)?.querySelector('h2')?.textContent || 'this section').trim();
  const apply = () => secs.forEach(x => { const on = x.dataset.acc === ACC.open; x.classList.toggle('open', on); head(x)?.setAttribute('aria-expanded', on); });
  const toggle = x => {
    const cur = secs.find(y => y.dataset.acc === ACC.open && y.dataset.dirty === '1');
    const next = ACC.open === x.dataset.acc ? null : x.dataset.acc;
    if (cur) { if (!confirm(`You have unsaved changes in ${name(cur)}. Close it and lose them?`)) return; ACC.open = next; return render({ quiet: true }); }
    ACC.open = next; apply();
    if (next) setTimeout(() => { const r = x.getBoundingClientRect(); if (r.top < 70 || r.top > innerHeight - 120) x.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30);
  };
  secs.forEach(x => {
    x.classList.add('acc'); const h = head(x); if (!h) return;
    h.tabIndex = 0; h.setAttribute('role', 'button'); h.insertAdjacentHTML('beforeend', '<span class="acc-chev" aria-hidden="true"></span>');
    h.addEventListener('click', e => { if (e.target.closest('button, a, input, select, textarea, label')) return; toggle(x); });
    h.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === h) { e.preventDefault(); toggle(x); } });
    const mark = e => { const t = e.target; if (t.closest('header') || t.type === 'file' || !t.form || !t.form.querySelector('[type=submit]')) return; x.dataset.dirty = '1'; };
    x.addEventListener('input', mark); x.addEventListener('change', mark);
    const clear = e => { secs.forEach(y => { if (e.target.contains(y) || y.contains(e.target)) y.dataset.dirty = ''; }); };
    x.addEventListener('submit', clear, true); const f = x.closest('form'); if (f) f.addEventListener('submit', clear, true);
  });
  apply();
}
const refresh = () => { invalidate(); refreshAlerts(); render({ quiet: true }); };

function topbar(title, sub = '', actions = '') {
  return `<div class="topbar"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
// service-line switcher
function lineChips(id = 'lines', all = true) {
  return `<div class="linechips" id="${id}" role="tablist">${all ? `<button type="button" data-l="" class="${!S.line ? 'on' : ''}">All lines</button>` : ''}
    ${S.depts.map(d => `<button type="button" data-l="${d.id}" class="${+S.line === d.id ? 'on' : ''}">${esc(d.short_name || d.name)}${!isSuper() && inLine(d.id) ? '<i class="mine" title="Your service line"></i>' : ''}</button>`).join('')}</div>`;
}
function bindLineChips(main, cb, id = 'lines') {
  $$(`#${id} button`, main).forEach(b => b.onclick = () => { setLine(b.dataset.l); cb ? cb() : render({ quiet: true }); });
}

// ---------------------------------------------------------------- launcher (Nest home)
// One app tile; shows the maintenance state when that app (or all of Nest) is locked
function appTile(scope, href, icon, name, desc, meta, live) {
  const m = typeof maintTile === 'function' ? maintTile(scope) : null;
  const inner = `<span class="t-ico">${ico(icon)}</span><span class="t-name">${name}</span><span class="t-desc">${desc}</span>`;
  if (m && m.cls === 'maint') return `<div class="tile maint" aria-disabled="true">${inner}<span class="t-meta">${m.meta}</span>${m.badge}</div>`;
  if (m) return href ? `<a class="tile live maint-open" href="${href}">${inner}<span class="t-meta">${m.meta}</span>${m.badge}</a>` : `<div class="tile soon">${inner}<span class="t-meta">${m.meta}</span>${m.badge}</div>`;
  return live && href ? `<a class="tile live" href="${href}">${inner}${meta}</a>` : `<div class="tile soon">${inner}${meta}</div>`;
}
// an app the person hasn't been given: shown, but locked
function lockedTile(icon, name, desc) {
  return `<div class="tile locked" aria-disabled="true" title="You don’t have access to ${name}"><span class="t-ico">${ico(icon)}</span><span class="t-name">${name}<span class="t-lock" aria-hidden="true">${ico('lock')}</span></span><span class="t-desc">${desc}</span><span class="t-meta">You don’t have access. Ask the Developer.</span></div>`;
}
async function renderLauncher() {
  const p = S.profile; const first = S.viewAs ? '' : (p.full_name || '').split(' ')[0];
  const apps = p.apps || ['inventory'];
  $('#app').innerHTML = `${viewAsBar()}<div class="launcher">${typeof maintBars === 'function' ? maintBars('launcher') : ''}
    <header class="l-top"><a class="brand" href="#/"><img src="brand/mark-96.png" alt=""><span class="brand-name">${wordmark()}<small>Nest</small></span></a>
      <div class="l-right">${isSuper() ? `<a class="btn small ghost" href="#/team">${ico('gear')}Nest admin</a>` : ''}${realSuper() ? `<button class="btn small ghost" id="viewas">${S.viewAs ? 'Change view' : 'View as…'}</button>` : ''}<button class="bell inline" id="bell" aria-label="Notifications">${ico('bell')}<span class="bell-count" hidden></span></button>
      <a class="btn small ghost" href="#/account">${esc(p.full_name || p.email)}</a><button class="btn small ghost" id="out">Sign out</button></div></header>
    <section class="l-hero"><img class="l-mark" src="brand/mark.png" alt="">
      <div><div class="l-tag">${esc(CFG.TAGLINE || '')}</div><h1>${first ? `Welcome back, ${esc(first)}` : 'Welcome'}</h1>
      <p>Where would you like to go?</p></div></section>
    <section class="tiles">
      ${appAllowed('inventory') ? appTile('inventory', '#/dashboard', 'box', 'Inventory', 'Equipment, stock, materials requests, monthly counts and reports.', '<span class="t-meta" id="invMeta">Open</span>', true) : lockedTile('box', 'Inventory', 'Equipment, stock, materials requests, monthly counts and reports.')}
      ${typeof poCanView === 'function' && poCanView() ? appTile('po', '#/po/overview', 'audit', 'Purchase Order', 'Raise, sign and track purchase orders to OEMs and suppliers.', '<span class="t-meta" id="poMeta">Open</span>', true) : lockedTile('audit', 'Purchase Order', 'Raise, sign and track purchase orders to OEMs and suppliers.')}
      ${appAllowed('people') && peopleBuilding() ? appTile('people', null, 'users', 'PeopleCore', 'Your HR self-service: profile, leave, requests, approvals and the company directory.', '<span class="t-meta">Under construction</span><span class="t-badge build">Under construction</span>')
        : appAllowed('people') ? appTile('people', '#/people', 'users', 'PeopleCore', 'Your HR self-service: profile, leave, requests, approvals and the company directory.', `<span class="t-meta" id="hrMeta">Open</span>${setting('people_construction', null)?.on ? '<span class="t-badge build">Under construction · testing</span>' : ''}`, true)
        : setting('people_live', false) === true ? lockedTile('users', 'PeopleCore', 'Your HR self-service: profile, leave, requests, approvals and the company directory.')
        : appTile('people', null, 'users', 'PeopleCore', 'Your HR self-service: profile, leave, requests, approvals and the company directory.', `<span class="t-meta">${setting('people_construction', null)?.on ? 'Under construction' : 'Coming soon'}</span>`)}
      ${appTile('proforma', null, 'chart', 'Proforma Invoice &amp; Quote', 'Prepare quotes and proforma invoices for clients.', '<span class="t-meta">Coming later</span>')}
    </section>
    <footer class="l-foot">${esc(CFG.COMPANY || '')} · ${esc(CFG.MOTTO || '')}<br><span>${esc(CFG.APP_NAME)} v${esc(CFG.VERSION || '')} · <span class="credit">${esc(CREDIT)}</span></span></footer></div>`;
  $('#out').onclick = () => sb.auth.signOut(); $('#bell').onclick = openBell;
  if (typeof bindMaintBars === 'function') bindMaintBars($('#app'));
  const va = $('#viewas'); if (va) va.onclick = openViewAs; bindViewAs();
  document.body.classList.toggle('viewing-as', !!(S.viewAs && realSuper()));
  await refreshAlerts();
  const m = $('#invMeta'); if (m) { const n = S.alerts.reminders.length; m.textContent = n ? `${plural(n, 'thing')} ${n === 1 ? 'needs' : 'need'} attention` : 'All up to date'; if (n) m.classList.add('hot'); }
  const pm = $('#poMeta'); if (pm && typeof poTileMeta === 'function') poTileMeta(pm);
  const hm = $('#hrMeta'); if (hm && typeof peopleTileMeta === 'function') peopleTileMeta(hm);
}

// Handheld (keyboard-wedge) scanners: fast keystrokes ending in Enter, outside any text field
(() => {
  let buf = '', last = 0;
  document.addEventListener('keydown', e => {
    const t = e.target; if (!S.shellReady || t.closest('input,textarea,select,dialog')) return;
    const now = Date.now(); if (now - last > 60) buf = ''; last = now;
    if (e.key === 'Enter') { if (buf.length >= 4 && typeof openScanned === 'function') { e.preventDefault(); openScanned(buf); } buf = ''; return; }
    if (e.key.length === 1) buf += e.key;
  });
})();
