/* GANKCO Nest 3.0.4 — PeopleCore: the four views (My self service · Supervisor · Admin · System control),
   module menus, and the building blocks every module page uses (tables, forms, lists, charts). */
'use strict';

S.pc = { acc: null, accAt: 0, view: 'self', mod: null, tables: {}, look: null, lookAt: 0 };

// ================================================================ access
async function pcAccess(force) {
  if (!force && S.pc.acc && Date.now() - S.pc.accAt < 60000) return S.pc.acc;
  S.pc.acc = await q(sb.rpc('hr_my_access')); S.pc.accAt = Date.now(); return S.pc.acc;
}
// "View as" (Developer previewing another role) shows PeopleCore as that role would: no admin views unless it's a Developer view
const pcAcc = () => {
  const a = S.pc.acc || { perms: [], reports: 0, admin: false, system: false };
  if (S.viewAs && realSuper() && S.viewAs.role !== 'superadmin') return { ...a, perms: [], admin: false, system: false, super: false };
  return a;
};
const pcCan = (...perms) => { if (S.pc.view === 'self') return false; const a = pcAcc(); return perms.flat().some(p => a.perms.includes(p)); };
const pcInvalidate = () => { S.pc.accAt = 0; S.pc.lookAt = 0; hrInvalidate(); };
const pcRefresh = () => { pcInvalidate(); render({ quiet: true }); };

// lookups the new structure needs (on top of hrLookups)
async function pcLookups(force) {
  if (!force && S.pc.look && Date.now() - S.pc.lookAt < 60000) return S.pc.look;
  const [jobs, groups, members, lines, roles] = await Promise.all([
    q(sb.from('hr_job_roles').select('*').order('sort')), q(sb.from('hr_groups').select('*').order('name')),
    q(sb.from('hr_group_members').select('*')), q(sb.from('hr_reporting_lines').select('*').order('sort')),
    q(sb.from('hr_admin_roles').select('id,name,description,is_system,perms,updated_at,updated_by_name').order('name'))]);
  S.pc.look = { jobs, groups, members, lines, roles }; S.pc.lookAt = Date.now(); return S.pc.look;
}
const pcJob = id => S.pc.look?.jobs.find(j => j.id === +id);
const pcLists = (kind, all) => S.hr.lists.filter(l => l.kind === kind && (all || l.active)).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
const pcListOpts = (kind, sel, blank = 'Not set') => `<option value="">${esc(blank)}</option>` + S.hr.lists.filter(l => l.kind === kind && (l.active || l.id === +sel)).sort((a, b) => a.sort - b.sort).map(l => opt(l.id, l.name, sel)).join('');
const pcDepts = () => hrUnitsOrdered();
const pcDeptOpts = (sel, blank = 'Not set', only) => `<option value="">${esc(blank)}</option>` + hrUnitsOrdered().filter(u => (u.active || u.id === +sel) && (!only || u.tag === only)).map(u => `<option value="${u.id}" ${+sel === u.id ? 'selected' : ''}>${' '.repeat(u.depth)}${esc(u.name)}${u.tag === 'unit' ? ' (unit)' : ''}</option>`).join('');
const pcJobOpts = (sel, unit, blank = 'Not set') => {
  const jobs = (S.pc.look?.jobs || []).filter(j => j.active || j.id === +sel);
  const near = unit ? jobs.filter(j => j.unit_id === +unit || j.unit_id === hrUnit(unit)?.parent_id) : [];
  const rest = jobs.filter(j => !near.includes(j));
  return `<option value="">${esc(blank)}</option>` + (near.length ? `<optgroup label="In this department">${near.map(j => opt(j.id, j.name, sel)).join('')}</optgroup><optgroup label="Other job roles">` : '') +
    rest.sort((a, b) => a.name.localeCompare(b.name)).map(j => opt(j.id, j.name, sel)).join('') + (near.length ? '</optgroup>' : '');
};
const pcGradeOpts = (sel, blank = 'Not set') => `<option value="">${esc(blank)}</option>` + pcLists('pay_group', true).map(g => {
  const gs = S.hr.lists.filter(l => l.kind === 'grade' && l.parent_id === g.id && (l.active || l.id === +sel)).sort((a, b) => a.sort - b.sort);
  return gs.length ? `<optgroup label="${esc(g.name)}">${gs.map(l => opt(l.id, l.name, sel)).join('')}</optgroup>` : '';
}).join('') + S.hr.lists.filter(l => l.kind === 'grade' && !l.parent_id && (l.active || l.id === +sel)).map(l => opt(l.id, l.name, sel)).join('');

// ================================================================ views and menus
const PC_VIEWS = [['self', 'My self service', 'user'], ['sup', 'Supervisor', 'users'], ['admin', 'Admin', 'grid'], ['system', 'System control', 'lock']];
const pcViews = () => { const a = pcAcc(); return PC_VIEWS.filter(([k]) => k === 'self' || (k === 'sup' && a.reports > 0) || (k === 'admin' && a.admin) || (k === 'system' && a.system)); };
const pcViewHome = v => v === 'self' ? '#/people' : '#/people/' + v;

// admin modules: each module file fills in its pages (PC_MODS.x.pages)
const PC_MODS = {
  hris: { name: 'HRIS', icon: 'users', desc: 'Employees, profiles, contracts, redeployment, groups and the audit trail.', perms: ['view-employees', 'add-employee', 'manage-employee-settings', 'view-audit-trail'], pages: {}, menu: [] },
  company: { name: 'Company settings', icon: 'building', desc: 'Departments and units, job roles, locations, pay groups, reporting lines and company documents.', perms: ['view-settings', 'view-organisational-settings', 'add-department', 'edit-department'], pages: {}, menu: [] },
  ann: { name: 'Announcements', icon: 'bell', desc: 'News and notices for everyone or chosen departments, locations and groups.', perms: ['view-announcements', 'add-announcement', 'view-all-announcements'], pages: {}, menu: [] },
  flow: { name: 'Approval workflow', icon: 'check', desc: 'Who approves what, step by step. Every module picks its workflow from here.', perms: ['view-approval-workflow', 'add-approval-workflow', 'edit-approval-workflow'], pages: {}, menu: [] },
  leave: { name: 'Leave', icon: 'plan', desc: 'Requests, balances, policies, public holidays, resumption and leave allowance.', perms: ['view-leave-requests', 'view-leave-policies', 'view-leaves-list-menu', 'view-leave-balance'], pages: {}, menu: [] },
  req: { name: 'Requisition', icon: 'pay', desc: 'Expense, overtime and service requests, their policies and payment.', perms: ['view-requisitions', 'view-requisition-policies', 'manage-expense-requisitions', 'view-overtime-requisitions'], pages: {}, menu: [] },
  exit: { name: 'Exit', icon: 'out', desc: 'Resignations, terminations and retirements: notice, activities, clearance and settlement.', perms: ['view-exit-request', 'view-exit-activities', 'view-exit-policies', 'view-exit-history'], pages: {}, menu: [] },
  disc: { name: 'Disciplinary', icon: 'audit', desc: 'Cases, queries, sanctions, grievances and whistleblowing.', perms: ['view-disciplinary-admin', 'view-disciplinary-menu', 'view-disciplinary-cases', 'view-grievances'], pages: {}, menu: [] }
};
const pcModOk = k => PC_MODS[k] && pcCan(PC_MODS[k].perms);
// supervisor and system pages, and new self-service pages
const PC_SUP = {}, PC_SYS = {}, PC_SELF = {};
const PC_SUP_MENU = [['', 'Dashboard', 'home'], ['team', 'My team', 'users'], ['leave', 'Leave', 'plan'], ['req', 'Requisition', 'pay'], ['exit', 'Exit', 'out'], ['disc', 'Disciplinary', 'audit'], ['approvals', 'Approvals', 'check']];
const PC_SYS_MENU = [['', 'Admins', 'users', ['view-admins', 'view-admin-management', 'system-control']], ['roles', 'Roles & permissions', 'lock', ['view-roles', 'view-permissions', 'system-control']], ['audit', 'Audit trail', 'audit', ['view-audit-trail']]];

function pcNavKey(parts) {
  const a = parts[1] || '';
  if (a === 'admin') return parts[2] ? 'people/admin/' + parts[2] + (parts[3] && !/^\d+$/.test(parts[3]) ? '/' + parts[3] : '') : 'people/admin';
  if (a === 'sup' || a === 'system') return 'people/' + a + (parts[2] ? '/' + parts[2] : '');
  if (a === 'emp') return 'people/staff';
  if (['directory', 'org', 'company'].includes(a)) return 'people/company';
  if (a === 'work' && parts[2]) return 'people/work/' + parts[2];
  return a ? 'people/' + a : 'people';
}

function pcViewSwitch() {
  const vs = pcViews(); if (vs.length < 2) return '';
  return `<div class="pc-views" role="tablist" aria-label="PeopleCore view">${vs.map(([k, l, i]) => `<a href="${pcViewHome(k)}" class="${S.pc.view === k ? 'on' : ''}" title="${esc(l)}">${ico(i)}<span>${esc(l)}</span></a>`).join('')}</div>`;
}

function peopleNav() {
  const v = S.pc.view, top = pcViewSwitch();
  if (v === 'sup') return { top, main: PC_SUP_MENU.map(([k, l, i]) => ['people/sup' + (k ? '/' + k : ''), l, i]), setup: [] };
  if (v === 'system') return { top, main: PC_SYS_MENU.filter(m => pcCan(m[3])).map(([k, l, i]) => ['people/system' + (k ? '/' + k : ''), l, i]), setup: [] };
  if (v === 'admin') {
    const m = S.pc.mod && PC_MODS[S.pc.mod];
    if (m) return { top, main: [['people/admin', 'All modules', 'grid'], ...m.menu.filter(x => !x[3] || pcCan(x[3])).map(([k, l, i]) => ['people/admin/' + S.pc.mod + (k ? '/' + k : ''), l, i ?? null])], setup: [], setupLabel: m.name, modName: m.name };
    return { top, main: [['people/admin', 'Home', 'home'], ...Object.entries(PC_MODS).filter(([k]) => pcModOk(k)).map(([k, x]) => ['people/admin/' + k, x.name, x.icon])], setup: [] };
  }
  // Work opens its list; pressing Work again closes it (3.0.4)
  const inWork = /^people\/work/.test(S.hr.navKey || '') && !S.pc.workShut;
  const main = [['people', 'Discover', 'compass'], ['people/me', 'My profile', 'user'], ['people/work', 'Work', 'kit'],
    ...(inWork ? HR_WORK.map(([k, l]) => ['people/work/' + k, l, null]) : []),
    ['people/pay', 'Pay', 'pay'], ['people/approvals', 'Approvals', 'check'], ['people/company', 'Company', 'building']];
  return { top, main, setup: [], setupLabel: 'Nest' };
}
function peopleBottomBar() {
  const v = S.pc.view;
  if (v === 'admin') return `<nav class="bottombar"><a href="#/people/admin" data-r="people/admin">${ico('grid')}Modules</a><a href="#/people/admin/hris/employees" data-r="people/admin/hris/employees">${ico('users')}Employees</a>
    <a href="#/people/approvals" data-r="people/approvals">${ico('check')}Approvals</a><a href="#/people" data-r="people">${ico('user')}Self service</a><a href="#/" data-r="home">${ico('grid')}Apps</a></nav>`;
  if (v === 'sup') return `<nav class="bottombar"><a href="#/people/sup" data-r="people/sup">${ico('home')}Dashboard</a><a href="#/people/sup/team" data-r="people/sup/team">${ico('users')}Team</a>
    <a href="#/people/sup/approvals" data-r="people/sup/approvals">${ico('check')}Approvals</a><a href="#/people" data-r="people">${ico('user')}Self service</a><a href="#/" data-r="home">${ico('grid')}Apps</a></nav>`;
  return `<nav class="bottombar"><a href="#/people" data-r="people">${ico('compass')}Discover</a><a href="#/people/work" data-r="people/work">${ico('kit')}Work</a>
    <a href="#/people/approvals" data-r="people/approvals">${ico('check')}Approvals</a><a href="#/people/company" data-r="people/company">${ico('building')}Company</a><a href="#/" data-r="home">${ico('grid')}Apps</a></nav>`;
}
function peopleReshell(navKey) {
  S.hr.navKey = navKey;
  const sig = [S.pc.view, S.pc.mod, pcViews().map(v => v[0]).join(','), S.hr.appr.length, /^people\/work/.test(navKey), !!S.pc.workShut, S.viewAs?.role || ''].join('|');
  if (sig === S.hr.navSig) return;
  S.hr.navSig = sig; S.shellReady = false; shell(); setNav(navKey);
  const a = $(`.nav [data-r="people/approvals"]`) || $(`.nav [data-r="people/sup/approvals"]`);
  if (a && S.hr.appr.length) a.insertAdjacentHTML('beforeend', `<span class="count">${S.hr.appr.length}</span>`);
}

// ================================================================ router
const PC_OLD = ROUTES.people;
// phones have no sidebar: the view switcher and the module's menu sit at the top of the page instead
function pcPhoneNav() {
  const vs = pcViews(); const { main } = peopleNav(); const on = S.hr.navKey;
  if (vs.length < 2 && S.pc.view === 'self') return '';
  return `<nav class="pc-phonenav">${vs.length > 1 ? `<div class="pc-pv">${vs.map(([k, l, i]) => `<a href="${pcViewHome(k)}" class="${S.pc.view === k ? 'on' : ''}">${ico(i)}${esc(l)}</a>`).join('')}</div>` : ''}
    ${S.pc.view !== 'self' ? `<div class="pc-pm">${main.map(([r, l]) => `<a href="#/${r}" class="${on === r ? 'on' : ''}">${esc(l)}</a>`).join('')}</div>` : ''}</nav>`;
}
ROUTES.people = {
  async load(parts, params) { const html = await this.load2(parts, params); return pcPhoneNav() + html; },
  async load2(parts, params) {
    await Promise.all([hrLookups(), pcAccess(), pcLookups()]);
    const a = parts[1] || '';
    // 3.0 HR pages moved into the Admin view
    const moved = { staff: '#/people/admin/hris/employees', settings: '#/people/admin/hris/settings', time: '#/people/admin/leave', engage: '#/people/admin/ann', team: '#/people/sup/team' };
    if (moved[a] && (a !== 'team' || pcAcc().reports > 0)) { setTimeout(() => go(moved[a]), 0); return '<div class="loading">Opening…</div>'; }
    if (a === 'emp' && parts[2]) { setTimeout(() => go('#/people/admin/hris/employee/' + parts[2]), 0); return '<div class="loading">Opening…</div>'; }
    S.pc.view = ['sup', 'admin', 'system'].includes(a) ? a : 'self';
    S.pc.mod = a === 'admin' && PC_MODS[parts[2]] ? parts[2] : null;
    peopleReshell(pcNavKey(parts));
    this.page = null;
    if (S.pc.view === 'admin') {
      if (!pcAcc().admin) return pcDenied('the Admin view');
      if (!S.pc.mod) { this.page = pcAdminHome; return pcAdminHome.load(parts, params); }
      const m = PC_MODS[S.pc.mod];
      if (!pcModOk(S.pc.mod)) return pcDenied(m.name);
      const key = parts[3] || '', pg = m.pages[key] || m.pages[''];
      if (!pg) return topbar(m.name) + pcSoon(m.name);
      if (pg.perms && !pcCan(pg.perms)) return pcDenied(m.name + ' · ' + (m.menu.find(x => x[0] === key)?.[1] || ''));
      this.page = pg; return pg.load(parts.slice(4), params, parts);
    }
    if (S.pc.view === 'sup') {
      if (!pcAcc().reports) return topbar('Supervisor') + '<div class="notice">Nobody reports to you in PeopleCore. When someone’s supervisor is set to you, this view opens.</div>';
      const pg = PC_SUP[parts[2] || ''] || PC_SUP[''];
      if (!pg) return topbar('Supervisor') + pcSoon('This page');
      this.page = pg; return pg.load(parts.slice(3), params, parts);
    }
    if (S.pc.view === 'system') {
      if (!pcAcc().system) return pcDenied('System control');
      const key = parts[2] || '', pg = PC_SYS[key];
      const m = PC_SYS_MENU.find(x => x[0] === key);
      if (!pg) return topbar('System control') + pcSoon('This page');
      if (m && !pcCan(m[3])) return pcDenied('System control · ' + m[1]);
      this.page = pg; return pg.load(parts.slice(3), params, parts);
    }
    if (a === 'work' && PC_SELF[parts[2]]) { this.page = PC_SELF[parts[2]]; return this.page.load(parts.slice(3), params, parts); }
    if (PC_SELF[a]) { this.page = PC_SELF[a]; return this.page.load(parts.slice(2), params, parts); }
    this.page = 'old';
    return PC_OLD.load(parts, params);
  },
  bind(main, parts, params) {
    // pages add click handlers to the main area: start each page with a fresh one so they don't pile up
    const fresh = main.cloneNode(true); main.replaceWith(fresh); main = fresh; if (typeof bindMaintBars === 'function') bindMaintBars(main);
    if (this.page === 'old') return PC_OLD.bind(main, parts, params);
    if (this.page?.bind) {
      const rest = S.pc.view === 'admin' ? parts.slice(4) : S.pc.view === 'sup' || S.pc.view === 'system' ? parts.slice(3) : parts[1] === 'work' ? parts.slice(3) : parts.slice(2);
      this.page.bind(main, rest, params, parts);
    }
    pcBindTables(main);
  }
};
const pcDenied = what => topbar('PeopleCore') + `<div class="notice">You don’t have permission to open ${esc(what)}. Ask the Developer to add it to your admin role in System control.</div>`;
const pcSoon = what => `<div class="panel"><div class="empty">${esc(what)} is being set up.</div></div>`;

// ================================================================ Admin home: one tile per module
const pcAdminHome = {
  async load() {
    const mods = Object.entries(PC_MODS).filter(([k]) => pcModOk(k));
    const counts = await q(sb.rpc('hr_admin_counts')).catch(() => ({}));
    const a = pcAcc();
    return topbar('Admin', `${esc((S.profile.full_name || '').split(' ')[0] || 'Hello')}, you’re signed in as ${esc(a.super ? 'Developer' : (a.roles || []).join(', ') || 'admin')}. Pick a module.`) +
      `<div class="hr-tiles pc-modtiles">${mods.map(([k, m]) => {
        const c = counts?.[k]; const meta = c ? `${c.n} ${esc(c.l)}` : 'Open';
        return `<a class="hr-tile" href="#/people/admin/${k}"><span class="t-ico">${ico(m.icon)}</span><span class="t-name">${esc(m.name)}</span><span class="t-desc">${esc(m.desc)}</span><span class="t-meta ${c?.hot ? 'hot' : ''}">${meta}</span></a>`;
      }).join('')}</div>` + (!mods.length ? '<div class="notice">Your admin role doesn’t include any PeopleCore module yet.</div>' : '');
  }
};

// ================================================================ building blocks
// a page header with module sub-tabs (when a module page has several parts)
const pcTabs = (items, on) => `<nav class="pc-tabs">${items.filter(x => !x[2] || pcCan(x[2])).map(([href, l]) => `<a href="${href}" class="${on === href ? 'on' : ''}">${esc(l)}</a>`).join('')}</nav>`;
const pcChip = (cls, l) => `<span class="chip ${cls}">${esc(l)}</span>`;
const pcYes = v => v ? 'Yes' : 'No';
const pcDate = d => d ? fd(d) : '—';
const pcMoney = (n, cur = 'NGN') => n == null || n === '' ? '—' : (cur === 'NGN' ? '₦' : cur + ' ') + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const pcName = id => hrNameOf(id) || (id ? 'Employee #' + id : '');
const pcInitials = n => hrInitials(n);
function pcCsv(file, cols, rows) {
  const cell = v => { const s = String(v ?? '').replace(/\r?\n/g, ' '); return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const txt = [cols.map(c => cell(c.l)).join(','), ...rows.map(r => cols.map(c => cell(c.csv ? c.csv(r) : (c.v ? c.v(r) : r[c.k]))).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv' })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* pcTable: a searchable, filterable, exportable table.
   cols: [{ k, l, f(row) → html, v(row) → text for sort/search/csv, cls, sort: false }]
   o: { search(row) → text, filters: [{ k, l, opts: [[v, label]], test(row, v) }], empty, href(row), onRow(row), csv: 'file name', per: 50, actions: html, sortBy, check } */
function pcTable(id, cols, rows, o = {}) {
  const st = S.pc.tables[id] = { cols, rows, o, q: S.pc.tables[id]?.q || '', f: S.pc.tables[id]?.f || {}, page: 0, sort: S.pc.tables[id]?.sort || o.sortBy || null };
  const fil = (o.filters || []).map(f => `<select data-f="${f.k}" aria-label="${esc(f.l)}"><option value="">${esc(f.l)}: all</option>${f.opts.map(([v, l]) => opt(v, l, st.f[f.k] ?? '')).join('')}</select>`).join('');
  return `<section class="panel pc-tbl" data-tbl="${id}">
    ${o.search !== false || fil || o.csv || o.actions ? `<div class="pc-tbar">${o.search !== false ? `<input type="search" placeholder="${esc(o.placeholder || 'Search')}" value="${esc(st.q)}" data-q>` : ''}${fil}
      <span class="pc-count" data-n></span><span class="right">${o.actions || ''}${o.csv ? `<button class="btn small" type="button" data-csv>${ico('down')}Export</button>` : ''}</span></div>` : ''}
    <div class="tablewrap"><table class="t"><thead><tr>${o.check ? '<th class="cb"><input type="checkbox" data-all aria-label="Select all"></th>' : ''}${cols.map((c, i) => `<th class="${c.cls || ''} ${c.sort === false ? '' : 'srt'}" data-i="${i}">${esc(c.l)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
    <div class="pc-more" hidden><button class="btn small" type="button" data-more>Show more</button></div></section>`;
}
function pcTableRows(id) {
  const st = S.pc.tables[id]; if (!st) return [];
  const qq = st.q.trim().toLowerCase();
  let rows = st.rows.filter(r => (!qq || (st.o.search ? st.o.search(r) : st.cols.map(c => c.v ? c.v(r) : r[c.k]).join(' ')).toLowerCase().includes(qq))
    && (st.o.filters || []).every(f => st.f[f.k] == null || st.f[f.k] === '' || f.test(r, st.f[f.k])));
  if (st.sort) { const [i, dir] = st.sort; const c = st.cols[i]; if (c) { const val = r => c.v ? c.v(r) : r[c.k]; rows = [...rows].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * dir; }); } }
  return rows;
}
function pcBindTables(main) {
  $$('[data-tbl]', main).forEach(box => {
    const id = box.dataset.tbl, st = S.pc.tables[id]; if (!st || box.dataset.bound) return; box.dataset.bound = 1;
    const per = st.o.per || 60; let shown = per; st.sel = st.sel || new Set();
    const draw = () => {
      const rows = pcTableRows(id); const tb = $('tbody', box);
      $('[data-n]', box) && ($('[data-n]', box).textContent = rows.length === st.rows.length ? plural(rows.length, st.o.noun || 'row') : `${rows.length} of ${st.rows.length}`);
      tb.innerHTML = rows.length ? rows.slice(0, shown).map((r, n) => {
        const href = st.o.href ? st.o.href(r) : null;
        return `<tr class="${href || st.o.onRow ? 'click' : ''}" data-ix="${st.rows.indexOf(r)}" ${href ? `data-href="${esc(href)}"` : ''}>${st.o.check ? `<td class="cb"><input type="checkbox" data-c="${st.rows.indexOf(r)}" ${st.sel.has(st.rows.indexOf(r)) ? 'checked' : ''}></td>` : ''}${st.cols.map(c => `<td class="${c.cls || ''}">${c.f ? c.f(r) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`;
      }).join('') : `<tr><td colspan="${st.cols.length + (st.o.check ? 1 : 0)}" class="pc-empty">${st.o.empty || 'Nothing here yet.'}</td></tr>`;
      $('.pc-more', box).hidden = rows.length <= shown;
      $$('th.srt', box).forEach(th => { th.classList.toggle('asc', st.sort?.[0] === +th.dataset.i && st.sort[1] === 1); th.classList.toggle('desc', st.sort?.[0] === +th.dataset.i && st.sort[1] === -1); });
      st.o.onDraw && st.o.onDraw(box, rows);
    };
    const qi = $('[data-q]', box); if (qi) qi.oninput = debounce(() => { st.q = qi.value; shown = per; draw(); }, 150);
    $$('[data-f]', box).forEach(s => s.onchange = () => { st.f[s.dataset.f] = s.value; shown = per; draw(); });
    $$('th.srt', box).forEach(th => th.onclick = () => { const i = +th.dataset.i; st.sort = st.sort?.[0] === i ? (st.sort[1] === 1 ? [i, -1] : null) : [i, 1]; draw(); });
    $('[data-more]', box).onclick = () => { shown += per; draw(); };
    const csv = $('[data-csv]', box); if (csv) csv.onclick = () => pcCsv(`${st.o.csv}_${localISO(0)}.csv`, st.cols.filter(c => c.csv !== false && c.l), pcTableRows(id));
    $('tbody', box).onclick = e => {
      const cb = e.target.closest('[data-c]'); if (cb) { const i = +cb.dataset.c; cb.checked ? st.sel.add(i) : st.sel.delete(i); st.o.onSelect && st.o.onSelect([...st.sel].map(i => st.rows[i])); return; }
      if (e.target.closest('a,button,input,select,label')) return;
      const tr = e.target.closest('tr[data-ix]'); if (!tr) return;
      if (tr.dataset.href) location.hash = tr.dataset.href.replace(/^#/, ''); else if (st.o.onRow) st.o.onRow(st.rows[+tr.dataset.ix]);
    };
    const all = $('[data-all]', box); if (all) all.onchange = () => { pcTableRows(id).forEach(r => all.checked ? st.sel.add(st.rows.indexOf(r)) : st.sel.delete(st.rows.indexOf(r))); draw(); st.o.onSelect && st.o.onSelect([...st.sel].map(i => st.rows[i])); };
    draw();
  });
}
const pcSelected = id => { const st = S.pc.tables[id]; return st ? [...(st.sel || [])].map(i => st.rows[i]) : []; };

/* pcForm: fields → html; pcRead: form → values.
   field: { k, l, t: text|email|tel|number|date|time|select|textarea|switch|checks|radio|html|money|color, opts: [[v, label]] | html string, req, hint, wide, ph, sub, min, max, step, dis, show(vals) } */
function pcForm(fields, vals = {}) {
  return `<div class="pc-form">${fields.filter(f => !f.show || f.show(vals)).map(f => pcField(f, vals[f.k])).join('')}</div>`;
}
function pcField(f, v) {
  const id = 'pf_' + f.k, req = f.req ? ' required' : '', dis = f.dis ? ' disabled' : '', hint = f.hint ? `<small class="pc-hint">${f.hint}</small>` : '';
  const lab = `${esc(f.l)}${f.req ? ' <i class="req">*</i>' : ''}`;
  const wide = f.wide || ['textarea', 'checks', 'html', 'switch', 'radio'].includes(f.t) ? ' wide' : '';
  const ops = (typeof f.opts === 'function' ? f.opts(v) : f.opts) || [];
  switch (f.t) {
    case 'select': return `<label class="f${wide}" data-k="${f.k}">${lab}<select name="${f.k}" id="${id}"${req}${dis}>${typeof ops === 'string' ? ops : (f.blank === false ? '' : `<option value="">${esc(f.blank || 'Choose…')}</option>`) + ops.map(([a, b]) => opt(a, b, v ?? '')).join('')}</select>${hint}</label>`;
    case 'textarea': return `<label class="f wide" data-k="${f.k}">${lab}<textarea name="${f.k}" id="${id}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}"${req}${dis}>${esc(v ?? '')}</textarea>${hint}</label>`;
    case 'switch': return `<label class="switch pc-sw wide" data-k="${f.k}"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}${dis}><span class="sw"></span><span><b>${esc(f.l)}</b>${f.hint ? `<span class="sub muted">${f.hint}</span>` : ''}</span></label>`;
    case 'checks': { const set = new Set((v || []).map(String)); return `<fieldset class="f wide pc-checks" data-k="${f.k}"><legend>${lab}</legend>${ops.length > 8 ? `<input type="search" class="pc-ckf" placeholder="Filter…" aria-label="Filter ${esc(f.l)}" oninput="const v=this.value.toLowerCase();this.nextElementSibling.querySelectorAll('.pc-ck').forEach(l=>l.hidden=v&&!l.textContent.toLowerCase().includes(v))">` : ''}<div class="pc-checkgrid">${ops.map(([a, b]) => `<label class="pc-ck"><input type="checkbox" data-ck="${f.k}" value="${esc(a)}" ${set.has(String(a)) ? 'checked' : ''}${dis}><span>${esc(b)}</span></label>`).join('') || '<span class="muted">Nothing to choose from yet</span>'}</div>${hint}</fieldset>`; }
    case 'radio': return `<fieldset class="f wide pc-radio" data-k="${f.k}"><legend>${lab}</legend><div class="seg">${ops.map(([a, b]) => `<label class="segi"><input type="radio" name="${f.k}" value="${esc(a)}" ${String(v ?? f.def ?? '') === String(a) ? 'checked' : ''}${dis}><span>${esc(b)}</span></label>`).join('')}</div>${hint}</fieldset>`;
    case 'html': return `<div class="pc-fld wide" data-k="${f.k}">${f.l ? `<span class="lbl">${lab}</span>` : ''}${f.html}${hint}</div>`;
    case 'money': return `<label class="f${wide}" data-k="${f.k}">${lab}<span class="pc-money"><i>₦</i><input type="number" name="${f.k}" id="${id}" min="0" step="0.01" value="${esc(v ?? '')}" placeholder="${esc(f.ph || '0.00')}"${req}${dis}></span>${hint}</label>`;
    default: return `<label class="f${wide}" data-k="${f.k}">${lab}<input type="${f.t || 'text'}" name="${f.k}" id="${id}" value="${esc(v ?? '')}" placeholder="${esc(f.ph || '')}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''}${f.step != null ? ` step="${f.step}"` : ''}${req}${dis}>${hint}</label>`;
  }
}
function pcRead(root, fields) {
  const out = {};
  fields.forEach(f => {
    if (f.t === 'html') return;
    if (f.t === 'checks') { out[f.k] = $$(`[data-ck="${f.k}"]`, root).filter(c => c.checked).map(c => isNaN(+c.value) || c.value === '' ? c.value : +c.value); return; }
    if (f.t === 'radio') { const c = $(`input[name="${f.k}"]:checked`, root); out[f.k] = c ? c.value : null; return; }
    const el = $(`[name="${f.k}"]`, root); if (!el) return;
    if (f.t === 'switch') out[f.k] = el.checked;
    else if (f.t === 'number' || f.t === 'money') out[f.k] = el.value === '' ? null : +el.value;
    else out[f.k] = el.value.trim() === '' ? null : el.value.trim();
  });
  return out;
}
// a form in a modal that calls one function
async function pcEdit({ title, sub, fields, vals = {}, save, submit = 'Save', wide, danger, onOpen }) {
  return modal({ title, sub, wide: wide ?? fields.length > 6, submit, danger, body: pcForm(fields, vals),
    onOpen: (d, close) => { pcLiveShow(d, fields, vals); onOpen && onOpen(d, close); },
    onSubmit: async (_, d) => {
      const v = pcRead(d, fields);
      const miss = fields.find(f => f.req && (v[f.k] == null || v[f.k] === '' || (Array.isArray(v[f.k]) && !v[f.k].length)) && (!f.show || f.show(v)));
      if (miss) throw new Error(`${miss.l} is required`);
      return save(v, d);
    } });
}
// fields with show(vals) appear and disappear as the form changes
function pcLiveShow(root, fields, vals, box) {
  const cond = fields.filter(f => f.show); if (!cond.length) return;
  const all = fields.map(f => f); box = box || $('.pc-form', root);
  const redo = () => { const v = { ...vals, ...pcRead(root, all) }; cond.forEach(f => { const el = $(`[data-k="${f.k}"]`, box); const on = f.show(v); if (on && !el) { const tmp = document.createElement('div'); tmp.innerHTML = pcField(f, vals[f.k]); const idx = fields.indexOf(f); const after = fields.slice(0, idx).reverse().map(x => $(`[data-k="${x.k}"]`, box)).find(Boolean); after ? after.after(tmp.firstElementChild) : box.prepend(tmp.firstElementChild); } else if (!on && el) el.remove(); }); };
  box.addEventListener('change', redo); box.addEventListener('input', debounce(redo, 200));
}
async function pcTry(fn, ok) { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(niceError(e), true); throw e; } }
async function pcConfirm(title, text, yes = 'Yes', danger = true) { return modal({ title, body: `<p>${text}</p>`, submit: yes, danger, onSubmit: async () => true }); }

// horizontal bars (dashboards)
function pcBars(rows, o = {}) {
  const max = Math.max(1, ...rows.map(r => +r.n || 0)); const tot = rows.reduce((a, r) => a + (+r.n || 0), 0);
  return rows.length ? `<ul class="pc-bars">${rows.map((r, i) => `<li><span class="pc-bl">${esc(r.name ?? '—')}</span><span class="pc-bt"><i style="width:${Math.max(2, (+r.n || 0) / max * 100)}%" class="c${i % 6}"></i></span><span class="pc-bv">${r.n}${o.pct && tot ? ` <small>${Math.round(r.n / tot * 100)}%</small>` : ''}</span></li>`).join('')}</ul>` : '<div class="empty">No data yet</div>';
}
// a ring for one percentage (profile completeness)
const pcRing = (pct, size = 34) => `<span class="pc-ring" style="--p:${Math.max(0, Math.min(100, pct || 0))};--s:${size}px" title="${pct || 0}% complete"><b>${pct || 0}%</b></span>`;
// a person cell: avatar + name + sub line
const pcPerson = (c, sub) => c ? `<span class="pc-person">${hrAv(c, 'sm')}<span><b>${esc(c.name || ((c.first_name || '') + ' ' + (c.last_name || '')))}</b>${sub != null ? `<small>${sub}</small>` : ''}</span></span>` : '—';
// the KPI strip
const pcKpis = items => `<div class="board pc-kpis">${items.map(([n, l, cls, href]) => href ? `<a class="${cls || ''}" href="${href}"><div class="n">${n ?? 0}</div><div class="l">${esc(l)}</div></a>` : `<div class="kpi ${cls || ''}"><div class="n">${n ?? 0}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>`;

/* a whole settings list page for one kind of hr_lists entry (regions, locations, cost centres…)
   cfg: { kind, title, noun, cols: [{ l, f(row) }], fields: [extra field defs with k='meta.x' or 'code'/'parent_id'], perm: { add, edit, del } } */
function pcListPage(cfg) {
  return {
    async load() {
      const rows = pcLists(cfg.kind, true);
      const cols = [{ k: 'name', l: cfg.nameLabel || 'Name', f: r => `<b>${esc(r.name)}</b>${r.active ? '' : ' ' + pcChip('muted', 'Off')}` }, ...(cfg.cols || []),
        { l: '', cls: 'num', sort: false, csv: false, f: r => pcCan(cfg.perm?.edit || []) ? `<button class="btn small" type="button" data-edit="${r.id}">Edit</button>` : '' }];
      return (cfg.head ? cfg.head() : '') + pcTable('lst_' + cfg.kind, cols, rows, { noun: cfg.noun, csv: cfg.title, empty: cfg.empty || `No ${cfg.title.toLowerCase()} yet.`,
        actions: pcCan(cfg.perm?.add || []) ? `<button class="btn primary small" type="button" data-add>${ico('plus')}Add ${esc(cfg.noun)}</button>` : '' });
    },
    bind(main) {
      const fields = (r = {}) => [{ k: 'name', l: cfg.nameLabel || 'Name', req: true, wide: !cfg.fields?.length }, ...(cfg.fields || []).map(f => typeof f === 'function' ? f(r) : f),
        { k: 'active', l: 'In use', t: 'switch', hint: 'Switch off to hide it from new choices. Records that use it keep it.' }];
      const flat = r => { const v = { ...r, active: r.id ? r.active : true }; Object.entries(r.meta || {}).forEach(([k, x]) => v['meta.' + k] = x); return v; };
      const edit = r => pcEdit({ title: r.id ? `Edit ${cfg.noun}` : `Add ${cfg.noun}`, fields: fields(r), vals: flat(r),
        onOpen: d => { if (r.id && pcCan(cfg.perm?.del || [])) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn danger'; b.textContent = 'Delete'; b.style.marginRight = 'auto';
          b.onclick = async () => { const res = await pcTry(() => q(sb.rpc('hr_struct_delete', { p_kind: cfg.kind, p_id: r.id }))); toast(res === 'deleted' ? 'Deleted' : 'It’s in use, so it was switched off instead'); d.close(); d.remove(); pcRefresh(); };
          $('.mf', d).prepend(b); } },
        save: async v => {
          const p = { id: r.id || null, name: v.name, active: v.active, meta: {} };
          Object.entries(v).forEach(([k, x]) => { if (k.startsWith('meta.')) p.meta[k.slice(5)] = x; else if (!['name', 'active'].includes(k)) p[k] = x; });
          await q(sb.rpc('hr_struct_save', { p_kind: cfg.kind, p })); toast('Saved'); pcRefresh();
        } });
      const add = $('[data-add]', main); if (add) add.onclick = () => edit({});
      main.addEventListener('click', e => { const b = e.target.closest('[data-edit]'); if (b && b.closest(`[data-tbl="lst_${cfg.kind}"]`)) edit(S.hr.lists.find(l => l.id === +b.dataset.edit)); });
    }
  };
}

// people pickers
const pcPeopleOpts = (sel, blank = 'Choose…', skip) => `<option value="">${esc(blank)}</option>` + S.hr.dir.filter(c => c.id !== skip).map(c => opt(c.id, c.name + (c.title ? ' · ' + c.title : ''), sel)).join('');
const pcPeopleList = (skip) => S.hr.dir.filter(c => c.id !== skip).map(c => [c.id, c.name + (c.title ? ' · ' + c.title : '')]);

// ================================================================ System control
PC_SYS[''] = {
  async load() {
    const [admins, roles] = await Promise.all([q(sb.rpc('hr_admins')), pcLookups(true).then(l => l.roles)]);
    S.pc.admins = admins;
    const rn = id => roles.find(r => r.id === id)?.name || '';
    const cols = [{ k: 'name', l: 'Admin', v: r => r.name, f: r => pcPerson({ name: r.name, photo: hrCard(r.employee_id)?.photo }, esc(r.email)) },
      { l: 'Roles', v: r => r.super ? 'Developer' : r.roles.map(rn).join(', '), f: r => r.super ? pcChip('ok', 'Developer (Nest)') : r.roles.map(id => pcChip('out', rn(id))).join(' ') },
      { l: 'Added by', v: r => r.set_by || '', f: r => r.super ? '<span class="muted">Nest settings</span>' : `${esc(r.set_by || '')}<br><small class="muted">${r.set_at ? fd(r.set_at) : ''}</small>` },
      { l: '', cls: 'num', sort: false, csv: false, f: r => !r.super && pcCan('edit-admin') ? `<button class="btn small" data-adm="${esc(r.profile_id)}">Change roles</button>` : '' }];
    return topbar('Admins', 'People who can open the Admin view, and what each can do. Nest Developers have everything.') +
      pcTable('admins', cols, admins, { noun: 'admin', csv: 'PeopleCore admins', actions: pcCan('add-admin') ? `<button class="btn primary small" data-addadm>${ico('plus')}Add admin</button>` : '' });
  },
  bind(main) {
    const roles = S.pc.look.roles.filter(r => !r.is_system);
    const pick = async (a) => {
      const cand = a ? null : await q(sb.rpc('hr_admin_candidates'));
      const fields = [...(a ? [] : [{ k: 'profile_id', l: 'Person', t: 'select', req: true, opts: cand.filter(c => !S.pc.admins.some(x => x.profile_id === c.profile_id)).map(c => [c.profile_id, `${c.name} · ${c.email}`]), hint: 'Anyone with a Nest sign-in.' }]),
        { k: 'roles', l: 'Admin roles', t: 'checks', opts: roles.map(r => [r.id, r.name]), hint: a ? 'Untick every role to remove them as an admin.' : 'Each role is a set of permissions. Set roles up under Roles & permissions.' }];
      await pcEdit({ title: a ? `Roles for ${a.name}` : 'Add admin', fields, vals: { roles: a?.roles || [] }, wide: false,
        save: async v => { await q(sb.rpc('hr_admin_set', { p_profile: a?.profile_id || v.profile_id, p_roles: v.roles })); toast(v.roles.length ? 'Saved' : 'Admin removed'); pcRefresh(); } });
    };
    const add = $('[data-addadm]', main); if (add) add.onclick = () => pick(null);
    main.addEventListener('click', e => { const b = e.target.closest('[data-adm]'); if (b) pick(S.pc.admins.find(a => a.profile_id === b.dataset.adm)); });
  }
};

const PC_MOD_LABEL = { system: 'System control', company: 'Company settings', hris: 'HRIS (employees)', ann: 'Announcements', flow: 'Approval workflow', leave: 'Leave', req: 'Requisition', exit: 'Exit', disc: 'Disciplinary' };
PC_SYS.roles = {
  async load(rest) {
    const roles = (await pcLookups(true)).roles;
    if (rest[0]) return this.editor(rest[0] === 'new' ? null : roles.find(r => r.id === +rest[0]));
    const cat = await this.catalog();
    const members = await q(sb.from('hr_role_members').select('role_id'));
    const cols = [{ k: 'name', l: 'Role', f: r => `<b>${esc(r.name)}</b>${r.is_system ? ' ' + pcChip('muted', 'Built in') : ''}<br><small class="muted">${esc(r.description || '')}</small>` },
      { l: 'Permissions', v: r => r.perms.length, f: r => `${r.perms.length} of ${cat.length}` },
      { l: 'Modules', sort: false, f: r => Object.keys(PC_MOD_LABEL).filter(m => cat.some(c => c.module === m && r.perms.includes(c.key))).map(m => `<span class="chip muted">${esc(PC_MOD_LABEL[m])}</span>`).join(' ') },
      { l: 'Admins', cls: 'num', v: r => r.is_system ? 0 : members.filter(m => m.role_id === r.id).length, f: r => r.is_system ? '—' : members.filter(m => m.role_id === r.id).length }];
    return topbar('Roles & permissions', 'A role is a set of permissions, as in SeamlessHR. Give admins one or more roles.') +
      pcTable('roles', cols, roles, { noun: 'role', href: r => '#/people/system/roles/' + r.id, csv: 'PeopleCore roles', actions: pcCan('add-role') ? `<a class="btn primary small" href="#/people/system/roles/new">${ico('plus')}New role</a>` : '' });
  },
  async catalog() { if (!S.pc.cat) S.pc.cat = await q(sb.from('hr_perm_catalog').select('*').order('sort')); return S.pc.cat; },
  async editor(r) {
    const cat = await this.catalog(); const has = new Set(r?.perms || []); const ro = r?.is_system || !pcCan(r ? 'edit-role' : 'add-role');
    const mods = Object.keys(PC_MOD_LABEL).filter(m => cat.some(c => c.module === m));
    this.r = r;
    return topbar(r ? esc(r.name) : 'New role', r?.is_system ? 'Built in: every permission, given to Nest Developers.' : 'Tick what this role may do. Search to find a permission quickly.',
      `<a class="btn" href="#/people/system/roles">Back to roles</a>${ro ? '' : `${r ? `<button class="btn danger" id="rdel">Delete</button>` : ''}<button class="btn primary" id="rsave">Save role</button>`}`) +
      `<section class="panel"><div class="body">${pcForm([{ k: 'name', l: 'Role name', req: true, dis: ro }, { k: 'description', l: 'What it’s for', dis: ro }], r || {})}</div></section>
      <div class="filters"><input type="search" id="psearch" placeholder="Search permissions (e.g. approve, policy, export)"><span class="muted" id="pcount"></span></div>
      ${mods.map(m => { const ps = cat.filter(c => c.module === m); const on = ps.filter(c => has.has(c.key)).length;
        return `<section class="panel pc-permmod" data-mod="${m}"><header><h2>${esc(PC_MOD_LABEL[m])}</h2><span class="meta" data-mc>${on} of ${ps.length}</span>
          <span class="right">${ro ? '' : `<button class="btn small" type="button" data-all="${m}">Tick all</button><button class="btn small" type="button" data-none="${m}">Clear</button>`}</span></header>
          <div class="pc-permgrid">${ps.map(c => `<label class="pc-ck" data-p="${esc(c.key + ' ' + c.label.toLowerCase())}"><input type="checkbox" value="${esc(c.key)}" ${has.has(c.key) ? 'checked' : ''} ${ro ? 'disabled' : ''}><span>${esc(c.label)}</span></label>`).join('')}</div></section>`; }).join('')}`;
  },
  bind(main, rest) {
    if (!rest[0]) return;
    const cnt = () => { $$('.pc-permmod', main).forEach(s => { const b = $$('input', s); $('[data-mc]', s).textContent = `${b.filter(x => x.checked).length} of ${b.length}`; }); $('#pcount').textContent = `${$$('.pc-permmod input:checked', main).length} permissions ticked`; };
    main.addEventListener('change', cnt); cnt();
    $('#psearch').oninput = debounce(e => { const v = e.target.value.trim().toLowerCase(); $$('[data-p]', main).forEach(l => l.hidden = v && !l.dataset.p.includes(v)); $$('.pc-permmod', main).forEach(s => s.hidden = v && !$$('[data-p]', s).some(l => !l.hidden)); }, 120);
    main.addEventListener('click', e => { const a = e.target.closest('[data-all],[data-none]'); if (!a) return; $$(`[data-mod="${a.dataset.all || a.dataset.none}"] input`, main).filter(i => !i.closest('[hidden]')).forEach(i => i.checked = !!a.dataset.all); cnt(); });
    const sv = $('#rsave', main); if (sv) sv.onclick = async () => {
      const v = pcRead(main, [{ k: 'name' }, { k: 'description' }]);
      const id = await pcTry(() => q(sb.rpc('hr_admin_role_save', { p: { id: this.r?.id || null, ...v, perms: $$('.pc-permmod input:checked', main).map(i => i.value) } })), 'Role saved');
      pcInvalidate(); go('#/people/system/roles/' + id);
    };
    const del = $('#rdel', main); if (del) del.onclick = async () => { if (!await pcConfirm('Delete role?', `Delete “${esc(this.r.name)}”? Admins must be taken off it first.`, 'Delete')) return;
      await pcTry(() => q(sb.rpc('hr_admin_role_delete', { p_id: this.r.id })), 'Deleted'); pcInvalidate(); go('#/people/system/roles'); };
  }
};

// Work in the PeopleCore menu: a second press closes its list
document.addEventListener('click', e => {
  const a = e.target.closest('.nav a[data-r="people/work"], .pc-phonenav a[href="#/people/work"]'); if (!a || S.shellApp !== 'people') return;
  const open = /^people\/work/.test(S.hr.navKey || '') && !S.pc.workShut;
  if (open) { e.preventDefault(); S.pc.workShut = true; }
  else { S.pc.workShut = false; if (location.hash !== '#/people/work') return; e.preventDefault(); }
  S.hr.navSig = ''; peopleReshell(S.hr.navKey);
  if (window.matchMedia('(max-width: 760px)').matches) render({ quiet: true });
}, true);
