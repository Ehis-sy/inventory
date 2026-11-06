/* GANKCO Nest 3.0 — PeopleCore (HR), Wave 1a: home, my profile, directory, my team, approvals, org chart */
'use strict';

// ================================================================ state and lookups
S.hr = { at: 0, units: [], positions: [], lists: [], fields: [], flows: [], roles: [], me: null, dir: [], appr: [], navSig: '',
  dirf: { q: '', unit: '' }, stf: { q: '', unit: '', status: 'active', type: '' }, orgRoot: '' };

const HR_STATUS = { active: ['ok', 'Active'], suspended: ['pending', 'Suspended'], exited: ['muted', 'Left'] };
const HR_VIS = { everyone: 'Everyone', manager: 'Managers and HR', hr: 'HR only', locked: 'Locked (HR admins)' };
const HR_WHO = { line_manager: 'Line manager', next_level: 'Next level up (manager’s manager)', hod: 'Head of department', hr: 'HR', position: 'A position (e.g. MD)', person: 'A named person' };
const HR_REQ = { profile_change: 'Profile change', leave: 'Leave', redeployment: 'Redeployment', contract_update: 'Contract update', contract_extension: 'Contract extension', leave_plan: 'Leave plan', resumption: 'Back from leave', expense: 'Expense', overtime: 'Overtime', service: 'Service request', exit: 'Exit' };
const HR_LIST_KINDS = { grade: ['Grades', 'Grade'], location: ['Work locations', 'Location'], emp_type: ['Employment types', 'Employment type'] };
// the locked section (HR admins and the person only)
const HR_PRIVATE = [['bank_name', 'Bank name'], ['account_no', 'Account number'], ['account_name', 'Account name'], ['tin', 'Tax ID (TIN)'],
  ['pfa', 'Pension fund administrator (PFA)'], ['rsa_pin', 'RSA PIN'], ['nhf_no', 'NHF number'], ['nin', 'NIN']];
// what staff can ask HR to change on their own record
const HR_SELF = [['title', 'Title'], ['preferred_name', 'Preferred name'], ['marital_status', 'Marital status'], ['mobile', 'Mobile'], ['work_phone', 'Work phone'],
  ['personal_email', 'Personal email'], ['address', 'Home address']];
const HR_LABEL = Object.fromEntries([...HR_PRIVATE, ...HR_SELF, ['photo', 'Photo'], ['kin', 'Next of kin and emergency contacts']]);
const MARITAL = ['Single', 'Married', 'Divorced', 'Separated', 'Widowed'];
const GENDERS = ['Female', 'Male'];
const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Engr', 'Prof'];

// 3.0.4: in My self service everyone sees exactly what staff see, admins and the Developer included
const pcSelfView = () => S.shellApp === 'people' && (!S.pc || S.pc.view === 'self');
const hrRoleReal = () => realSuper() ? 'hr_admin' : (S.hr.roles.find(r => r.profile_id === S.profile?.id)?.role || null);
const hrRole = () => pcSelfView() ? null : hrRoleReal();
const isHR = () => !!hrRole();
const isHRAdmin = () => hrRole() === 'hr_admin';
const hrMe = () => S.hr.me;
const hrUnit = id => S.hr.units.find(u => u.id === +id);
const hrPos = id => S.hr.positions.find(p => p.id === +id);
const hrList = id => S.hr.lists.find(l => l.id === +id);
const hrListName = id => hrList(id)?.name || '';
const hrListOpts = (kind, sel, blank = 'Not set') => `<option value="">${esc(blank)}</option>` + S.hr.lists.filter(l => l.kind === kind && (l.active || l.id === +sel)).sort((a, b) => a.sort - b.sort).map(l => opt(l.id, l.name, sel)).join('');
const hrCard = id => S.hr.dir.find(c => c.id === +id);
const hrNameOf = id => hrCard(id)?.name || '';
const hrInitials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const hrAv = (c, cls = '') => `<span class="hr-av ${cls}">${c?.photo ? `<img src="${esc(c.photo)}" alt="">` : `<b>${esc(hrInitials(c?.name || ((c?.first_name || '') + ' ' + (c?.last_name || ''))))}</b>`}</span>`;
const hrFullName = e => [e.title, e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');
const hrUnitPath = id => { const out = []; let u = hrUnit(id), g = 0; while (u && g++ < 12) { out.unshift(u.name); u = hrUnit(u.parent_id); } return out.length > 2 ? out.slice(-2).join(' › ') : out.join(' › '); };
const hrUnitsOrdered = () => {   // depth-first, with depth
  const out = []; const walk = (pid, d) => S.hr.units.filter(u => (u.parent_id || null) === pid).sort((a, b) => a.sort - b.sort || a.id - b.id).forEach(u => { out.push({ ...u, depth: d }); walk(u.id, d + 1); });
  walk(null, 0); return out;
};
const hrUnitOpts = (sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + hrUnitsOrdered().filter(u => u.active || u.id === +sel).map(u => `<option value="${u.id}" ${+sel === u.id ? 'selected' : ''}>${'  '.repeat(u.depth)}${esc(u.name)}</option>`).join('');
const hrPosOpts = (sel, blank = 'Not set', skip) => `<option value="">${esc(blank)}</option>` + hrUnitsOrdered().map(u => {
  const ps = S.hr.positions.filter(p => p.unit_id === u.id && (p.active || p.id === +sel) && p.id !== skip).sort((a, b) => a.sort - b.sort || a.id - b.id);
  return ps.length ? `<optgroup label="${esc(u.name)}">${ps.map(p => opt(p.id, p.title, sel)).join('')}</optgroup>` : '';
}).join('');
const hrPeopleOpts = (sel, blank = 'Choose…', skip) => `<option value="">${esc(blank)}</option>` + S.hr.dir.filter(c => c.id !== skip).map(c => opt(c.id, c.name + (c.title ? ' · ' + c.title : ''), sel)).join('');
const hrSettings = () => setting('people', {}) || {};
const hrEmpnoFmt = () => ({ prefix: 'GES', digits: 3, order: 'prefix,seq,year', ...(hrSettings().empno || {}) });
const hrEmpnoSample = (f = hrEmpnoFmt(), seq = 5, year = 2022) => f.order.split(',').map(p => p === 'prefix' ? f.prefix : p === 'seq' ? String(seq).padStart(+f.digits || 3, '0') : p === 'year' ? year : '').join('');
const hrDays = d => d ? Math.round((new Date(d + 'T00:00:00') - new Date(localISO(0) + 'T00:00:00')) / 864e5) : null;

async function hrLookups(force) {
  if (!force && S.hr.at && Date.now() - S.hr.at < 60000) return S.hr;
  const [units, positions, lists, fields, flows, roles, me, dir, appr] = await Promise.all([
    q(sb.from('hr_units').select('*').order('sort')), q(sb.from('hr_positions').select('*').order('sort')),
    q(sb.from('hr_lists').select('*').order('sort')), q(sb.from('hr_fields').select('*').order('sort')),
    q(sb.from('hr_flows').select('*')), q(sb.from('hr_roles').select('*')),
    q(sb.rpc('hr_my_profile')), q(sb.rpc('hr_directory')), q(sb.rpc('hr_my_approvals'))]);
  Object.assign(S.hr, { units, positions, lists, fields, flows, roles, me, dir: dir || [], appr: appr || [], at: Date.now() });
  return S.hr;
}
const hrInvalidate = () => { S.hr.at = 0; };
const hrHasTeam = () => { const me = hrMe(); return !!me && S.hr.dir.some(c => c.manager_id === me.id); };

// ================================================================ shell: menu and phone bar
// 3.0.2: the staff menu agreed for PeopleCore (Discover · Work · Pay · Approvals · My team · Company)
const HR_WORK = [['leave', 'Leave'], ['requisition', 'Requisition'], ['performance', 'Performance'], ['competency', 'Competency'], ['promotion', 'Promotion'],
  ['redeployment', 'Redeployment'], ['disciplinary', 'Disciplinary'], ['onboarding', 'Onboarding'], ['exit', 'Exit'], ['surveys', 'Surveys']];
// what each part will hold, and when it arrives (shown on pages that aren't built yet)
const HR_SOON = {
  leave: ['Leave', 'Your leave balances for each type, apply with a relief officer, your leave plan for the year, history, and your leave allowance status.', 'Ready'],
  requisition: ['Requisition', 'Overtime, expense and service requests, each worked out and approved the way HR sets it up.', 'Coming soon'],
  performance: ['Performance', 'Your objectives and progress, self-appraisal, your manager’s review and your final rating.', 'A later update'],
  competency: ['Competency', 'The skills your role needs, your assessed level and your gaps.', 'A later update'],
  promotion: ['Promotion', 'Promotions and salary reviews: your history and any recommendation in progress.', 'A later update'],
  redeployment: ['Redeployment', 'Ask to move to another unit, location or position, and follow your request.', 'A later update'],
  disciplinary: ['Disciplinary', 'Queries addressed to you, your replies and the outcome. Private to you and HR.', 'A later update'],
  onboarding: ['Onboarding', 'Your onboarding checklist and your confirmation at the end of probation.', 'A later update'],
  exit: ['Exit', 'Resign, and follow your handover and clearance.', 'A later update'],
  surveys: ['Surveys', 'Surveys HR sends you. The anonymous mood check-in is on Discover.', 'A later update'],
  pay: ['Pay', 'Your payslips, salary history and yearly tax summary. Amounts stay hidden until you tap the eye.', 'With Payroll'],
  announcements: ['Announcements', 'News from HR and Admin, pinned notices, and policies to read and confirm.', 'Ready'],
  policies: ['Policies & handbook', 'The staff handbook and company policies, published by HR.', 'Ready'],
  holidays: ['Public holidays', 'This year’s public holidays, kept by HR.', 'Ready'] };
const hrNavKey = parts => { const a = parts[1] || '', b = parts[2] || '';
  if (a === 'emp') return 'people/staff';
  if (['directory', 'org', 'company'].includes(a)) return 'people/company';
  if (a === 'work' && b) return 'people/work/' + b;
  return a ? 'people/' + a : 'people'; };
function peopleNav() {
  const inWork = /^people\/work/.test(S.hr.navKey || '');
  const main = [['people', 'Discover', 'compass'], ['people/work', 'Work', 'kit'],
    ...(inWork ? HR_WORK.map(([k, l]) => ['people/work/' + k, l, null]) : []),
    ['people/pay', 'Pay', 'pay'], ['people/approvals', 'Approvals', 'check'],
    ...(hrHasTeam() ? [['people/team', 'My team', 'users']] : []), ['people/company', 'Company', 'building']];
  const setup = [...(isHR() ? [['people/staff', 'Staff records', 'audit'], ['people/time', 'Time & pay', 'plan'], ['people/engage', 'Engage', 'bell']] : []), ...(isHRAdmin() ? [['people/settings', 'PeopleCore settings', 'gear']] : []),
    ...(isSuper() ? [['team', 'Nest admin', 'users']] : [])];
  return { main, setup, setupLabel: 'HR' };
}
function peopleBottomBar() {
  return `<nav class="bottombar">
    <a href="#/people" data-r="people">${ico('compass')}Discover</a>
    <a href="#/people/work" data-r="people/work">${ico('kit')}Work</a>
    <a href="#/people/approvals" data-r="people/approvals">${ico('check')}Approvals</a>
    <a href="#/people/company" data-r="people/company">${ico('building')}Company</a>
    <a href="#/" data-r="home">${ico('grid')}Apps</a></nav>`;
}
// the menu depends on HR role and whether you manage anyone: rebuild it when that changes
function peopleReshell(navKey) {
  S.hr.navKey = navKey;
  const sig = [hrRole(), hrHasTeam(), S.hr.appr.length, /^people\/work/.test(navKey)].join('|');
  if (sig === S.hr.navSig) return;
  S.hr.navSig = sig; S.shellReady = false; shell(); setNav(navKey);
  const a = $(`.nav [data-r="people/approvals"]`); if (a && S.hr.appr.length) a.insertAdjacentHTML('beforeend', `<span class="count">${S.hr.appr.length}</span>`);
}
async function peopleTileMeta(el) {
  try { const a = await q(sb.rpc('hr_my_approvals')); el.textContent = a.length ? `${plural(a.length, 'request')} waiting for you` : 'Open'; if (a.length) el.classList.add('hot'); }
  catch (e) { el.textContent = 'Open'; }
}

// ================================================================ router
ROUTES.people = {
  async load(parts, params) {
    await hrLookups();
    const p1 = parts[1] || '';
    const pages = { '': typeof hrDiscover !== 'undefined' ? hrDiscover : hrHome, me: hrMePage, directory: hrDirPage, company: parts[2] && typeof hrCompanyAnn !== 'undefined' ? hrCompanyAnn : hrDirPage,
      team: hrTeamPage, approvals: hrApprPage, org: hrOrgPage, work: parts[2] === 'leave' && typeof hrLeavePage !== 'undefined' ? hrLeavePage : hrWorkPage, pay: hrSoonPage,
      time: typeof hrTimePage !== 'undefined' ? hrTimePage : null, engage: typeof hrEngagePage !== 'undefined' ? hrEngagePage : null,
      staff: typeof hrStaffPage !== 'undefined' ? hrStaffPage : null, emp: typeof hrEmpPage !== 'undefined' ? hrEmpPage : null, settings: typeof hrSettingsPage !== 'undefined' ? hrSettingsPage : null };
    this.page = pages[p1] || hrHome;
    peopleReshell(hrNavKey(parts));
    if ((p1 === 'time' || p1 === 'engage') && !isHR()) return topbar('PeopleCore') + '<div class="notice">Only HR can see this.</div>';
    if ((p1 === 'staff' || p1 === 'emp') && !isHR()) return topbar('Staff records') + '<div class="notice">Only HR can see staff records.</div>';
    if (p1 === 'settings' && !isHRAdmin()) return topbar('PeopleCore settings') + '<div class="notice">Only HR admins can change PeopleCore settings. Ask the Developer if you need it.</div>';
    return this.page.load(parts, params);
  },
  bind(main, parts, params) {
    const p1 = parts[1] || '';
    if (((p1 === 'staff' || p1 === 'emp' || p1 === 'time' || p1 === 'engage') && !isHR()) || (p1 === 'settings' && !isHRAdmin())) return;
    this.page.bind && this.page.bind(main, parts, params);
  }
};
const hrRefresh = () => { hrInvalidate(); render({ quiet: true }); };

// ================================================================ HOME
const hrHome = {
  async load() {
    const me = hrMe(); const first = (me?.preferred_name || me?.first_name || (S.profile.full_name || '').split(' ')[0] || '');
    const team = me ? S.hr.dir.filter(c => c.manager_id === me.id) : [];
    const tile = (href, icon, name, desc, meta, hot) => `<a class="hr-tile" href="${href}"><span class="t-ico">${ico(icon)}</span><span class="t-name">${name}</span><span class="t-desc">${desc}</span>${meta ? `<span class="t-meta ${hot ? 'hot' : ''}">${meta}</span>` : ''}</a>`;
    let hr = '';
    if (isHR()) {
      const all = await q(sb.from('hr_employees').select('id,status,position_id,profile_id,confirmation_due,confirmed_on,start_date,work_email'));
      const act = all.filter(e => e.status === 'active');
      const conf = act.filter(e => e.confirmation_due && !e.confirmed_on && hrDays(e.confirmation_due) <= 30);
      const noPos = act.filter(e => !e.position_id), noLink = act.filter(e => !e.profile_id);
      const filled = new Set(act.map(e => e.position_id)); const vacant = S.hr.positions.filter(p => p.active && !p.is_external && !filled.has(p.id));
      hr = `<section class="panel"><header><h2>HR at a glance</h2><span class="meta">Only HR sees this</span><div class="right"><a class="btn small" href="#/people/staff">${ico('audit')}Staff records</a></div></header>
        <div class="board b4 hr-board">
          <a class="kpi" href="#/people/staff"><div class="n">${act.length}</div><div class="l">Active staff</div></a>
          <a class="kpi ${conf.length ? 'warn' : ''}" href="#/people/staff?v=confirm"><div class="n">${conf.length}</div><div class="l">Confirmations due in 30 days</div></a>
          <a class="kpi" href="#/people/org"><div class="n">${vacant.length}</div><div class="l">Vacant positions</div></a>
          <a class="kpi ${noLink.length ? 'warn' : ''}" href="#/people/staff?v=nolink"><div class="n">${noLink.length}</div><div class="l">Not linked to a Nest sign-in</div></a></div>
        ${noPos.length ? `<div class="body"><div class="notice small">${plural(noPos.length, 'active record')} ${noPos.length === 1 ? 'has' : 'have'} no position yet, so ${noPos.length === 1 ? 'it has' : 'they have'} no line manager for approvals. <a href="#/people/staff?v=nopos">Fix them</a></div></div>` : ''}</section>`;
    }
    return `<section class="hero hr-hero"><img class="bgmark" src="brand/mark.png" alt="">
        <div>${hrAv(me ? { ...me.card } : { name: S.profile.full_name }, 'xl')}</div>
        <div><div class="motto">PeopleCore · Discover</div><h1>${first ? `Hello, ${esc(first)}` : 'Hello'}</h1>
        <div class="sub">${me ? `${esc(me.card?.title || 'No position yet')}${me.card?.unit ? ' · ' + esc(me.card.unit) : ''}${me.manager ? ` · reports to ${esc(me.manager)}` : ''}` : 'HR hasn’t added your PeopleCore record yet. You can still use the directory and org chart.'}</div></div>
        <div class="actions">${me ? `<a class="btn" href="#/people/me">${ico('user')}My profile</a>` : ''}${S.hr.appr.length ? `<a class="btn tagbtn" href="#/people/approvals">${ico('check')}${plural(S.hr.appr.length, 'approval')} waiting</a>` : ''}</div></section>
      ${hr}
      <div class="hr-tiles">
        ${tile('#/people/me', 'user', 'My profile', 'Your details, next of kin, documents and job history. Ask HR to change something.', '')}
        ${tile('#/people/directory', 'users', 'Directory', 'Find anyone in GANKCO: role, team, email and phone.', plural(S.hr.dir.length, 'person', 'people'))}
        ${team.length ? tile('#/people/team', 'users', 'My team', 'The people who report to you, and their confirmation dates.', plural(team.length, 'direct report')) : ''}
        ${tile('#/people/approvals', 'check', 'Approvals', 'Requests waiting for you, and the ones you sent.', S.hr.appr.length ? plural(S.hr.appr.length, 'waiting for you', 'waiting for you') : 'Nothing waiting', S.hr.appr.length)}
        ${tile('#/people/org', 'chart', 'Org chart', 'Who reports to whom, across every department. Print it in one click.', '')}
      </div>
      <div class="hr-next"><b>Coming next in PeopleCore</b><span>Leave requests and balances · Announcements · then Onboarding, Exit, Performance and Payroll</span></div>`;
  },
  bind() { }
};

// ================================================================ MY PROFILE
const hrMePage = {
  async load() {
    const me = hrMe();
    if (!me) return topbar('My profile') + `<div class="notice">HR hasn’t added your PeopleCore record yet, or it isn’t linked to your sign-in (${esc(S.profile.email)}). Ask HR to add you or link your account.</div>`;
    this.reqs = await q(sb.from('hr_requests').select('id,kind,title,status,created_at,decided_at,steps,current_step,payload').eq('employee_id', me.id).order('created_at', { ascending: false }).limit(20));
    const pend = this.reqs.find(r => r.kind === 'profile_change' && r.status === 'pending');
    const c = me.card || {}; const pv = me.private || {};
    const kv = rows => `<dl class="kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === '' || v == null ? '<span class="sub">—</span>' : v}</dd>`).join('')}</dl>`;
    const cust = S.hr.fields.filter(f => f.active && f.visibility !== 'locked' && me.custom?.[f.key] != null && me.custom[f.key] !== '');
    const pcust = S.hr.fields.filter(f => f.active && f.visibility === 'locked' && pv.custom?.[f.key]);
    return topbar('My profile', 'What HR holds about you. To change something, send a change request: HR checks it, then it’s updated.',
        `<button class="btn primary" id="chg" ${pend ? 'disabled title="A change is already waiting for HR"' : ''}>${ico('edit')}Request a change</button>`) +
      (pend ? `<div class="notice">Your change request from ${fd(pend.created_at)} is waiting for ${esc(pend.steps?.[pend.current_step]?.label || 'HR')}. <button class="btn small link" data-cancel="${pend.id}">Cancel it</button></div>` : '') +
      `<section class="panel hr-idcard"><div class="body hr-idrow">${hrAv(c, 'xl')}
        <div class="hr-idmain"><h2>${esc(hrFullName(me))}</h2><div class="sub">${esc(c.title || 'No position yet')}${c.unit ? ' · ' + esc(c.unit) : ''}</div>
          <div class="hr-chips">${c.emp_no ? `<span class="tag">${esc(c.emp_no)}</span>` : ''}${chip(HR_STATUS[me.status]?.[0] || 'muted', HR_STATUS[me.status]?.[1] || me.status)}${c.emp_type ? chip('muted', c.emp_type) : ''}${c.location ? chip('muted', c.location) : ''}</div></div>
        <dl class="kv hr-idkv"><dt>Line manager</dt><dd>${esc(me.manager || '—')}</dd><dt>Head of department</dt><dd>${esc(me.hod || '—')}</dd><dt>Started</dt><dd>${fd(me.start_date)}</dd>
          <dt>Confirmation</dt><dd>${me.confirmed_on ? 'Confirmed ' + fd(me.confirmed_on) : me.confirmation_due ? 'Due ' + fd(me.confirmation_due) : '—'}</dd></dl></div></section>
      <div class="grid2">
        <section class="panel"><header><h2>Personal</h2></header><div class="body">${kv([['Full name', esc(hrFullName(me))], ['Preferred name', esc(me.preferred_name || '')], ['Gender', esc(me.gender || '')],
          ['Date of birth', me.date_of_birth ? fd(me.date_of_birth) : ''], ['Marital status', esc(me.marital_status || '')], ['Nationality', esc(me.nationality || '')], ['State of origin', esc(me.state_of_origin || '')],
          ...cust.map(f => [f.label, esc(me.custom[f.key])])])}</div></section>
        <section class="panel"><header><h2>Contact</h2></header><div class="body">${kv([['Work email', esc(me.work_email || '')], ['Personal email', esc(me.personal_email || '')], ['Work phone', esc(me.work_phone || '')],
          ['Mobile', esc(me.mobile || '')], ['Home address', esc(me.address || '')]])}</div></section>
      </div>
      <div class="grid2">
        <section class="panel"><header><h2>Next of kin &amp; emergency contacts</h2></header>${me.kin.length ? `<ul class="list">${me.kin.map(k => `<li><div><div class="name">${esc(k.name)} ${chip('muted', k.kind === 'emergency' ? 'Emergency contact' : 'Next of kin')}</div>
          <div class="sub">${[k.relationship, k.phone, k.email].filter(Boolean).map(esc).join(' · ')}</div>${k.address ? `<div class="sub">${esc(k.address)}</div>` : ''}</div></li>`).join('')}</ul>` : '<div class="empty">None yet. Add them with Request a change.</div>'}</section>
        <section class="panel hr-locked"><header><h2>${ico('lock')}Bank, tax &amp; pension</h2><span class="meta">Only you and HR admins see this</span></header><div class="body">
          ${kv([...HR_PRIVATE.map(([k, l]) => [l, esc(pv[k] || '')]), ...pcust.map(f => [f.label, esc(pv.custom[f.key])])])}</div></section>
      </div>
      <div class="grid2">
        <section class="panel"><header><h2>Documents</h2><div class="right"><button class="btn small" id="doc">${ico('plus')}Add</button></div></header>
          ${me.documents.length ? `<ul class="list">${me.documents.map(d => hrDocLi(d, false)).join('')}</ul>` : '<div class="empty">No documents yet. Add your CV, certificates or IDs.</div>'}</section>
        <section class="panel"><header><h2>Job history</h2></header>${me.history.length ? `<ul class="list">${me.history.map(h => `<li><div><div class="name">${esc(h.title || '—')}</div><div class="sub">${esc(h.unit_name || '')} · ${fd(h.from_date)} – ${h.to_date ? fd(h.to_date) : 'now'}</div></div></li>`).join('')}</ul>` : '<div class="empty">No history yet.</div>'}</section>
      </div>
      <section class="panel"><header><h2>Stand-in while you’re away</h2><span class="meta">They can approve requests for you between the dates you set</span><div class="right"><button class="btn small" id="standin">${ico('plus')}Set a stand-in</button></div></header>
        ${me.standins.length ? `<ul class="list">${me.standins.map(s => `<li><div><div class="name">${esc(s.standin)}</div><div class="sub">${fd(s.from_date)} – ${fd(s.to_date)}${s.note ? ' · ' + esc(s.note) : ''}</div></div><div class="end"><button class="btn small" data-unstand="${s.id}">Remove</button></div></li>`).join('')}</ul>` : '<div class="empty">No stand-in set.</div>'}
        ${me.standing_in_for.length ? `<div class="body"><div class="notice ok small">You’re standing in for ${me.standing_in_for.map(s => `<b>${esc(s.name)}</b> (${fd(s.from)} – ${fd(s.to)})`).join(', ')}.</div></div>` : ''}</section>
      <section class="panel"><header><h2>My requests</h2><div class="right"><a class="btn small" href="#/people/approvals?tab=mine">See all</a></div></header>
        ${this.reqs.length ? `<ul class="list">${this.reqs.slice(0, 5).map(hrReqLi).join('')}</ul>` : '<div class="empty">No requests yet.</div>'}</section>`;
  },
  bind(main) {
    const me = hrMe();
    if (!me) return;
    const b = $('#chg', main); if (b) b.onclick = () => hrChangeRequest(me);
    $$('[data-cancel]', main).forEach(x => x.onclick = () => hrCancelReq(+x.dataset.cancel));
    $('#doc', main).onclick = () => hrAddDoc(me.id);
    $('#standin', main).onclick = () => hrStandin(me.id);
    $$('[data-unstand]', main).forEach(x => x.onclick = async () => { try { await q(sb.rpc('hr_standin_delete', { p_id: +x.dataset.unstand })); toast('Stand-in removed'); hrRefresh(); } catch (e) { toast(niceError(e), true); } });
    hrBindDocs(main);
  }
};
const hrReqLi = r => {
  const st = { pending: ['pending', 'Waiting'], approved: ['ok', 'Approved'], rejected: ['rejected', 'Not approved'], cancelled: ['muted', 'Cancelled'] }[r.status] || ['muted', r.status];
  const step = r.status === 'pending' ? r.steps?.[r.current_step] : null;
  const rej = r.status === 'rejected' ? (r.steps || []).find(s => s.state === 'rejected') : null;
  return `<li><div style="flex:1;min-width:0"><div class="name">${esc(r.title)}</div><div class="sub">${HR_REQ[r.kind] || esc(r.kind)} · sent ${fd(r.created_at)}${step ? ` · with ${esc(step.label)}${step.names?.length ? ' (' + esc(step.names.join(', ')) + ')' : ''}` : ''}${rej ? ` · ${esc(rej.by_name)}: “${esc(rej.note || '')}”` : ''}</div>
    ${hrStepsBar(r)}</div><div class="end">${chip(st[0], st[1])}</div></li>`;
};
const hrStepsBar = r => `<div class="hr-steps">${(r.steps || []).map((s, i) => `<span class="hr-step ${s.state === 'approved' ? 'done' : s.state === 'rejected' ? 'no' : r.status === 'pending' && i === r.current_step ? 'now' : ''}" title="${esc((s.names || []).join(', '))}">${esc(s.label)}${s.by_name ? ` · ${esc(s.by_name)}${s.standin ? ' (stand-in)' : ''}` : ''}</span>`).join('<i></i>')}</div>`;
async function hrCancelReq(id) {
  if (!confirm('Cancel this request?')) return;
  try { await q(sb.rpc('hr_request_cancel', { p_id: id })); toast('Request cancelled'); hrRefresh(); } catch (e) { toast(niceError(e), true); }
}

// a small square JPEG from a picked photo (keeps records light)
function hrPhotoData(file, size = 320) {
  return new Promise((res, rej) => {
    if (!/^image\//.test(file.type)) return rej(new Error('Choose a photo (JPG or PNG)'));
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .85)); };
    img.onerror = () => rej(new Error('That photo couldn’t be read'));
    img.src = url;
  });
}
const hrKinRows = kin => {
  const rows = [...(kin || [])]; while (rows.length < 2) rows.push({ kind: rows.length ? 'emergency' : 'next_of_kin' });
  return rows.slice(0, 4).map((k, i) => `<fieldset class="hr-kin" data-kin="${i}"><legend>${i === 0 ? 'Next of kin' : 'Contact ' + (i + 1)}</legend>
    <div class="row2"><label class="f">Name<input name="k${i}_name" value="${esc(k.name || '')}"></label>
      <label class="f">Type<select name="k${i}_kind">${opt('next_of_kin', 'Next of kin', k.kind)}${opt('emergency', 'Emergency contact', k.kind)}</select></label></div>
    <div class="row3"><label class="f">Relationship<input name="k${i}_relationship" value="${esc(k.relationship || '')}"></label>
      <label class="f">Phone<input name="k${i}_phone" value="${esc(k.phone || '')}"></label><label class="f">Email<input name="k${i}_email" type="email" value="${esc(k.email || '')}"></label></div>
    <label class="f">Address<input name="k${i}_address" value="${esc(k.address || '')}"></label></fieldset>`).join('');
};
const hrKinRead = (x, n = 4) => Array.from({ length: n }, (_, i) => ({ kind: x[`k${i}_kind`], name: (x[`k${i}_name`] || '').trim(), relationship: x[`k${i}_relationship`] || '', phone: x[`k${i}_phone`] || '', email: x[`k${i}_email`] || '', address: x[`k${i}_address`] || '' }))
  .filter(k => k.kind !== undefined && k.name);
const hrKinSig = kin => JSON.stringify((kin || []).map(k => [k.kind, k.name, k.relationship || '', k.phone || '', k.email || '', k.address || '']));

function hrChangeRequest(me) {
  const pv = me.private || {}; let photo;
  return modal({
    title: 'Request a change', wide: true, submit: 'Send to HR',
    sub: 'Change what’s wrong or out of date. HR checks it, then your record is updated. Your name, position and dates can only be changed by HR.',
    body: `<div class="hr-photo-pick">${hrAv(me.card, 'lg')}<label class="btn small filebtn">${ico('up')}New photo<input type="file" accept="image/*" id="ph" hidden></label><span class="sub" id="phs"></span></div>
      <div class="row3"><label class="f">Title<select name="title"><option value=""></option>${TITLES.map(t => opt(t, t, me.title)).join('')}</select></label>
        <label class="f">Preferred name<input name="preferred_name" value="${esc(me.preferred_name || '')}"></label>
        <label class="f">Marital status<select name="marital_status"><option value=""></option>${MARITAL.map(t => opt(t, t, me.marital_status)).join('')}</select></label></div>
      <div class="row3"><label class="f">Mobile<input name="mobile" value="${esc(me.mobile || '')}"></label><label class="f">Work phone<input name="work_phone" value="${esc(me.work_phone || '')}"></label>
        <label class="f">Personal email<input name="personal_email" type="email" value="${esc(me.personal_email || '')}"></label></div>
      <label class="f">Home address<textarea name="address" rows="2">${esc(me.address || '')}</textarea></label>
      <div class="pjf-sec">Next of kin &amp; emergency contacts</div>${hrKinRows(me.kin)}
      <details class="hr-lockbox"><summary>${ico('lock')}Bank, tax &amp; pension details <span class="sub">· changes here go to HR admins only</span></summary>
        <div class="row2">${HR_PRIVATE.map(([k, l]) => `<label class="f">${esc(l)}<input name="p_${k}" value="${esc(pv[k] || '')}" autocomplete="off"></label>`).join('')}</div></details>
      <label class="f">Note for HR <span class="hint">Optional</span><input name="note" placeholder="e.g. I moved house in October"></label>`,
    onOpen: d => { $('#ph', d).onchange = async e => { try { photo = await hrPhotoData(e.target.files[0]); $('.hr-photo-pick .hr-av', d).outerHTML = hrAv({ photo }, 'lg'); $('#phs', d).textContent = 'New photo chosen'; } catch (ex) { toast(niceError(ex), true); } }; },
    onSubmit: async x => {
      const changes = {}, priv = {};
      HR_SELF.forEach(([k]) => { const v = (x[k] || '').trim(); if (v !== (me[k] || '')) changes[k] = v; });
      if (photo) changes.photo = photo;
      HR_PRIVATE.forEach(([k]) => { const v = (x['p_' + k] || '').trim(); if (v !== (pv[k] || '')) priv[k] = v; });
      const kin = hrKinRead(x); const p = { changes, note: x.note || undefined };
      if (Object.keys(priv).length) p.private = priv;
      if (hrKinSig(kin) !== hrKinSig(me.kin)) p.kin = kin;
      if (!Object.keys(changes).length && !p.private && !p.kin) throw new Error('Nothing changed yet.');
      await q(sb.rpc('hr_profile_change', { p }));
      toast(p.private ? 'Sent. HR admins will check it.' : 'Sent to HR'); hrRefresh();
    }
  });
}

function hrStandin(empId) {
  return modal({ title: 'Set a stand-in', submit: 'Save', sub: 'While you’re away, your stand-in can approve PeopleCore requests that are waiting for you. They get a bell alert.',
    body: `<label class="f">Who stands in<select name="sid" required>${hrPeopleOpts('', 'Choose…', empId)}</select></label>
      <div class="row2"><label class="f">From<input type="date" name="from" value="${localISO(0)}" required></label><label class="f">To<input type="date" name="to" value="${localISO(7)}" required></label></div>
      <label class="f">Note <span class="hint">Optional</span><input name="note" placeholder="e.g. Annual leave"></label>`,
    onSubmit: async x => { if (!x.sid) throw new Error('Choose who stands in for you.'); await q(sb.rpc('hr_standin_save', { p: { employee_id: empId, standin_id: x.sid, from_date: x.from, to_date: x.to, note: x.note } })); toast('Stand-in set'); hrRefresh(); } });
}

// documents (own, or HR on any record)
const hrDocLi = (d, canRemove) => {
  const exp = d.expires_on ? hrDays(d.expires_on) : null;
  return `<li><span class="hr-docico">${ico('pdf')}</span><div style="flex:1;min-width:0"><div class="name">${esc(d.title)}</div><div class="sub">${[d.kind, d.file_name, d.size_bytes ? Math.max(1, Math.round(d.size_bytes / 1024)) + ' KB' : '', 'added ' + fd(d.created_at) + (d.uploaded_by_name ? ' by ' + d.uploaded_by_name : '')].filter(Boolean).map(esc).join(' · ')}</div></div>
    <div class="end">${exp != null ? (exp < 0 ? chip('overdue', 'Expired ' + fd(d.expires_on)) : exp <= 60 ? chip('pending', 'Expires ' + fd(d.expires_on)) : chip('muted', 'Expires ' + fd(d.expires_on))) + ' ' : ''}
      <button class="btn small" data-docdl="${d.id}">${ico('down')}Open</button>${canRemove ? ` <button class="btn small danger" data-docrm="${d.id}">Remove</button>` : ''}</div></li>`;
};
function hrBindDocs(main) {
  $$('[data-docdl]', main).forEach(b => b.onclick = async () => {
    try { const [d] = await q(sb.from('hr_documents').select('file_name,mime,data').eq('id', +b.dataset.docdl));
      const bin = atob(d.data || ''); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([a], { type: d.mime || 'application/octet-stream' }));
      const w = /pdf|image/.test(d.mime || '') ? window.open(url, '_blank') : null;
      if (!w) { const l = document.createElement('a'); l.href = url; l.download = d.file_name || 'document'; l.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast(niceError(e), true); }
  });
  $$('[data-docrm]', main).forEach(b => b.onclick = async () => {
    if (!confirm('Remove this document? This can’t be undone.')) return;
    try { await q(sb.rpc('hr_document_remove', { p_id: +b.dataset.docrm })); toast('Document removed'); hrRefresh(); } catch (e) { toast(niceError(e), true); }
  });
}
function hrAddDoc(empId) {
  return modal({ title: 'Add a document', submit: 'Upload', sub: 'PDF, Word or a photo, up to 8 MB.',
    body: `<label class="f">File<input type="file" name="file" id="df" required></label>
      <label class="f">Name<input name="title" id="dt" placeholder="e.g. Degree certificate" required></label>
      <div class="row2"><label class="f">Kind<select name="kind">${['CV', 'Certificate', 'ID', 'Offer / contract letter', 'Medical', 'Other'].map(k => opt(k, k, '')).join('')}</select></label>
        <label class="f">Expires on <span class="hint">For certificates, IDs, medicals</span><input type="date" name="expires_on"></label></div>`,
    onOpen: d => { $('#df', d).onchange = e => { const f = e.target.files[0]; if (f && !$('#dt', d).value) $('#dt', d).value = f.name.replace(/\.[^.]+$/, ''); }; },
    onSubmit: async (x, d) => {
      const f = $('#df', d).files[0]; if (!f) throw new Error('Choose a file.');
      if (f.size > 8 * 1024 * 1024) throw new Error('That file is bigger than 8 MB.');
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('The file couldn’t be read')); r.readAsDataURL(f); });
      await q(sb.rpc('hr_document_add', { p_emp: empId, p: { title: x.title, kind: x.kind, expires_on: x.expires_on || null, file_name: f.name, mime: f.type, data } }));
      toast('Document added'); hrRefresh();
    } });
}

// ================================================================ DIRECTORY
const hrDirPage = {
  async load(parts = []) {
    const f = S.hr.dirf;
    const depts = hrUnitsOrdered().filter(u => u.active);
    const inUnit = (c, uid) => { let u = hrUnit(c.unit_id), g = 0; while (u && g++ < 12) { if (u.id === +uid) return true; u = hrUnit(u.parent_id); } return false; };
    const ql = f.q.trim().toLowerCase();
    const rows = S.hr.dir.filter(c => (!f.unit || inUnit(c, f.unit)) && (!ql || [c.name, c.first_name, c.last_name, c.title, c.unit, c.location, c.work_email, c.emp_no].join(' ').toLowerCase().includes(ql)));
    const pub = S.hr.fields.filter(x => x.active && x.visibility === 'everyone');
    if (parts[1] === 'company' && parts[2]) return hrSoonPage.load(['people', parts[2]]);
    return topbar('Company', `${plural(S.hr.dir.length, 'person', 'people')} at ${esc(CFG.ORG_SHORT || 'GANKCO')}`) + hrCompanyTabs('directory') +
      `<div class="filters"><input type="search" id="dq" placeholder="Search by name, role, team or email" value="${esc(f.q)}">
        <select id="du"><option value="">Every department</option>${depts.map(u => `<option value="${u.id}" ${+f.unit === u.id ? 'selected' : ''}>${'  '.repeat(u.depth)}${esc(u.name)}</option>`).join('')}</select>
        <span class="sub" id="dn">${plural(rows.length, 'person', 'people')}</span></div>
      ${rows.length ? `<div class="hr-dir">${rows.map(c => `<button class="hr-person" data-p="${c.id}">${hrAv(c, 'lg')}<span class="hp-name">${esc(c.name)}</span>
        <span class="hp-title">${esc(c.title || '—')}</span><span class="hp-unit">${esc(c.unit || '')}${c.location ? ' · ' + esc(c.location) : ''}</span>
        ${c.work_email ? `<span class="hp-mail">${esc(c.work_email)}</span>` : ''}${pub.filter(x => c.custom?.[x.key]).map(x => `<span class="hp-x">${esc(x.label)}: ${esc(c.custom[x.key])}</span>`).join('')}</button>`).join('')}</div>`
        : `<div class="panel"><div class="empty">${S.hr.dir.length ? 'Nobody matches. Try another search.' : 'Nobody is in the directory yet. HR adds staff records in Staff records.'}</div></div>`}`;
  },
  bind(main) {
    const f = S.hr.dirf;
    const qi = $('#dq', main); if (!qi) return; qi.oninput = debounce(() => { f.q = qi.value; render({ quiet: true }).then(() => { const n = $('#dq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250);
    $('#du', main).onchange = e => { f.unit = e.target.value; render({ quiet: true }); };
    $$('[data-p]', main).forEach(b => b.onclick = () => hrPersonCard(+b.dataset.p));
  }
};
function hrPersonCard(id) {
  const c = hrCard(id); if (!c) return;
  const reports = S.hr.dir.filter(x => x.manager_id === c.id);
  const pub = S.hr.fields.filter(x => x.active && x.visibility === 'everyone' && c.custom?.[x.key]);
  return modal({ title: c.name, submit: '', cancel: 'Close',
    body: `<div class="hr-pc">${hrAv(c, 'xl')}<div><div class="hp-title">${esc(c.title || '—')}</div><div class="sub">${esc(c.unit || '')}${c.location ? ' · ' + esc(c.location) : ''}</div></div></div>
      <dl class="kv mt">${c.work_email ? `<dt>Email</dt><dd><a href="mailto:${esc(c.work_email)}">${esc(c.work_email)}</a></dd>` : ''}${c.work_phone ? `<dt>Work phone</dt><dd><a href="tel:${esc(c.work_phone)}">${esc(c.work_phone)}</a></dd>` : ''}
        <dt>Reports to</dt><dd>${c.manager_id ? `<a href="#" data-pc="${c.manager_id}">${esc(hrNameOf(c.manager_id))}</a>` : '—'}</dd>
        ${reports.length ? `<dt>Team</dt><dd>${reports.map(r => `<a href="#" data-pc="${r.id}">${esc(r.name)}</a>`).join(', ')}</dd>` : ''}
        ${pub.map(x => `<dt>${esc(x.label)}</dt><dd>${esc(c.custom[x.key])}</dd>`).join('')}</dl>
      ${isHR() ? `<div class="mt"><a class="btn small" href="#/people/emp/${c.id}" data-x>${ico('audit')}Open staff record</a></div>` : ''}`,
    onOpen: (d, close) => $$('[data-pc]', d).forEach(a => a.onclick = e => { e.preventDefault(); close(null); hrPersonCard(+a.dataset.pc); })
  });
}

// ================================================================ MY TEAM
const hrTeamPage = {
  async load() {
    const team = await q(sb.rpc('hr_team'));
    const direct = team.filter(t => t.direct), others = team.filter(t => !t.direct);
    const mf = S.hr.fields.filter(x => x.active && ['everyone', 'manager'].includes(x.visibility));
    const row = t => { const dd = t.confirmation_due && !t.confirmed_on ? hrDays(t.confirmation_due) : null;
      return `<tr class="clickrow" data-p="${t.id}"><td class="full"><div class="hr-namecell">${hrAv(t)}<div><div class="name">${esc(t.name)}</div><div class="sub">${esc(t.emp_no || '')}</div></div></div></td>
        <td>${esc(t.title || '—')}<div class="sub">${esc(t.unit || '')}</div></td><td>${esc(t.location || '—')}</td><td>${esc(t.emp_type || '—')}</td><td>${fd(t.start_date)}</td>
        <td>${t.confirmed_on ? chip('ok', 'Confirmed') : dd == null ? '<span class="sub">—</span>' : dd < 0 ? chip('overdue', 'Overdue · ' + fd(t.confirmation_due)) : dd <= 30 ? chip('pending', 'Due ' + fd(t.confirmation_due)) : fd(t.confirmation_due)}</td>
        <td>${t.mobile ? `<a href="tel:${esc(t.mobile)}">${esc(t.mobile)}</a>` : t.work_phone ? esc(t.work_phone) : '—'}</td>
        ${mf.map(x => `<td>${esc(t.custom?.[x.key] ?? '')}</td>`).join('')}</tr>`; };
    const table = (rows) => `<div class="tablewrap"><table class="t stack"><thead><tr><th>Name</th><th>Position</th><th>Location</th><th>Type</th><th>Started</th><th>Confirmation</th><th>Phone</th>${mf.map(x => `<th>${esc(x.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>`;
    const cal = team.length && typeof hrTeamCalendar === 'function' ? await hrTeamCalendar(team.map(t => ({ ...t, title: t.title })), 2) : '';
    return topbar('My team', 'The people who report to you. You approve their requests as their line manager.') + cal +
      (team.length ? `<section class="panel"><header><h2>Direct reports</h2><span class="meta">${direct.length}</span></header>${direct.length ? table(direct) : '<div class="empty">None.</div>'}</section>
        ${others.length ? `<section class="panel"><header><h2>Further down your line</h2><span class="meta">${others.length}</span></header>${table(others)}</section>` : ''}`
        : '<div class="panel"><div class="empty">Nobody reports to you in PeopleCore.</div></div>');
  },
  bind(main) { $$('[data-p]', main).forEach(r => r.onclick = () => hrPersonCard(+r.dataset.p)); }
};

// ================================================================ APPROVALS
const hrApprPage = {
  async load(parts, params) {
    const tab = this.tab = params.get('tab') || (S.hr.appr.length || !hrMe() ? 'waiting' : 'mine');
    let body = '';
    if (tab === 'waiting') {
      const a = S.hr.appr;
      body = a.length ? a.map(r => hrApprCard(r)).join('') : `<div class="panel"><div class="empty">Nothing is waiting for you. ${ico('check')}</div></div>`;
    } else {
      const me = hrMe();
      let qy = sb.from('hr_requests').select('id,kind,title,status,created_at,decided_at,steps,current_step,employee_id').order('created_at', { ascending: false }).limit(100);
      if (tab === 'mine') qy = me ? qy.eq('employee_id', me.id) : null;
      else if (params.get('st')) qy = qy.eq('status', params.get('st'));
      const rows = qy ? await q(qy) : [];
      this.rows = rows;
      body = `${tab === 'all' ? `<div class="filters"><div class="seg" id="st">${[['', 'All'], ['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Not approved'], ['cancelled', 'Cancelled']].map(([k, l]) => `<button data-s="${k}" class="${(params.get('st') || '') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
        <section class="panel">${rows.length ? `<ul class="list hr-reqs">${rows.map(r => hrReqLi(r).replace('<div class="end">', `<div class="end">${tab === 'all' ? `<span class="sub">${esc(hrNameOf(r.employee_id))}</span> ` : ''}${r.status === 'pending' && (tab === 'mine' || isHR()) ? `<button class="btn small" data-cancel="${r.id}">Cancel</button> ` : ''}`)).join('')}</ul>` : '<div class="empty">No requests yet.</div>'}</section>`;
    }
    return topbar('Approvals', 'PeopleCore requests: the ones waiting for your decision, and the ones you sent.') +
      `<div class="tabs" id="atabs"><button data-t="waiting" class="${tab === 'waiting' ? 'on' : ''}">Waiting for me${S.hr.appr.length ? ` <span class="count">${S.hr.appr.length}</span>` : ''}</button>
        <button data-t="mine" class="${tab === 'mine' ? 'on' : ''}">My requests</button>${isHR() ? `<button data-t="all" class="${tab === 'all' ? 'on' : ''}">All requests</button>` : ''}</div>${body}`;
  },
  bind(main, parts, params) {
    $$('#atabs button', main).forEach(b => b.onclick = () => go('#/people/approvals?tab=' + b.dataset.t));
    $$('#st button', main).forEach(b => b.onclick = () => go('#/people/approvals?tab=all' + (b.dataset.s ? '&st=' + b.dataset.s : '')));
    $$('[data-cancel]', main).forEach(x => x.onclick = () => hrCancelReq(+x.dataset.cancel));
    // leave: balance after, back at work, team clashes and jobs on those dates
    $$('[data-linfo]', main).forEach(async el => {
      try { const i = await q(sb.rpc('hr_leave_info', { p_req: +el.dataset.linfo })); if (!i) return; const card = el.closest('.hr-appr');
        const b = i.balance; const l = i.leave; const after = b && b.left != null ? +b.left - (+b.pending - 0) : null;
        const bk = $('[data-lback]', card); if (bk) bk.textContent = i.back ? fd(i.back) : '—';
        const bl = $('[data-lbal]', card); if (bl) bl.innerHTML = b ? (b.unlimited ? 'No set limit' : `<b>${Math.round((+b.left - +b.pending) * 10) / 10}</b> of ${+b.entitled + +b.carried + +b.adjusted} days left after this and other waiting requests`) : '—';
        const notes = [];
        if (i.team_out.length) notes.push(`<b>Team clash:</b> ${i.team_out.map(t => `${esc(t.name)} (${fd(t.from)}${t.to !== t.from ? ' – ' + fd(t.to) : ''})`).join(', ')} ${i.team_out.length === 1 ? 'is' : 'are'} also off then${i.team_size ? `: ${i.team_out.length + 1} of ${i.team_size} in the team` : ''}.`);
        if (i.jobs.length) notes.push(`<b>On a job:</b> they’re on the crew for ${i.jobs.map(j => `${esc(j.job_no)} ${esc(j.field || j.title || '')} as ${esc(j.designation)} (${fd(j.from)} – ${fd(j.to)})`).join('; ')}.`);
        el.innerHTML = notes.length ? notes.map(n => `<div class="notice small">${ico('plan')}<span>${n}</span></div>`).join('')
          : `<div class="notice small good">${ico('check')}<span>No clash: nobody else in ${i.team_size ? 'the team' : 'their team'} is off then, and they’re not on a job crew for those dates.</span></div>`;
      } catch (e) { el.innerHTML = ''; }
    });
    $$('[data-ok]', main).forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { const r = await q(sb.rpc('hr_request_decide', { p_id: +b.dataset.ok, p_approve: true, p_note: $(`[data-note="${b.dataset.ok}"]`, main)?.value || null }));
        toast(r === 'approved' ? 'Approved and applied' : 'Approved. It moves to the next step.'); hrInvalidate(); go('#/people/approvals?tab=waiting'); }
      catch (e) { toast(niceError(e), true); b.disabled = false; }
    });
    $$('[data-no]', main).forEach(b => b.onclick = () => modal({ title: 'Don’t approve', submit: 'Send back', danger: true, sub: 'They’ll see your reason.',
      body: `<label class="f">Reason<textarea name="note" rows="3" required></textarea></label>`,
      onSubmit: async x => { if (!x.note.trim()) throw new Error('Give a reason.'); await q(sb.rpc('hr_request_decide', { p_id: +b.dataset.no, p_approve: false, p_note: x.note })); toast('Sent back'); hrInvalidate(); go('#/people/approvals?tab=waiting'); } }));
  }
};
function hrApprCard(r) {
  const p = r.payload || {}; const step = r.steps[r.step];
  const changes = Object.entries(p.changes || {}).map(([k, v]) => k === 'photo' ? `<dt>Photo</dt><dd><span class="hr-av lg"><img src="${esc(v)}" alt=""></span></dd>` : `<dt>${esc(HR_LABEL[k] || k)}</dt><dd>${v ? esc(v) : '<span class="sub">(clear it)</span>'}</dd>`).join('');
  const priv = Object.entries(p.private || {}).map(([k, v]) => `<dt>${ico('lock')}${esc(HR_LABEL[k] || k)}</dt><dd>${v ? esc(v) : '<span class="sub">(clear it)</span>'}</dd>`).join('');
  const kin = p.kin ? `<dt>Next of kin</dt><dd>${p.kin.length ? p.kin.map(k => `${esc(k.name)} <span class="sub">(${k.kind === 'emergency' ? 'emergency' : 'next of kin'}${k.relationship ? ', ' + esc(k.relationship) : ''}${k.phone ? ', ' + esc(k.phone) : ''})</span>`).join('<br>') : '<span class="sub">(remove all)</span>'}</dd>` : '';
  const other = r.kind === 'leave' ? `<dt>Leave</dt><dd><b>${esc(p.type || '')}</b></dd><dt>Dates</dt><dd>${esc(fd(p.start))}${p.end !== p.start ? ' – ' + esc(fd(p.end)) : ''} · <b>${p.days} ${p.days == 1 ? 'day' : 'days'}</b></dd>
      ${p.relief ? `<dt>Relief officer</dt><dd>${esc(p.relief)}</dd>` : ''}${p.reason ? `<dt>Reason</dt><dd>${esc(p.reason)}</dd>` : ''}<dt>Back at work</dt><dd data-lback>…</dd><dt>Balance after</dt><dd data-lbal>…</dd>`
    : r.kind !== 'profile_change' ? Object.entries(p).filter(([k]) => k !== 'note').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`).join('') : '';
  const relief = step?.who === 'relief';
  return `<section class="panel hr-appr"><header>${hrAv(hrCard(r.employee_id) || { name: r.who })}<div><h2>${esc(r.title)}</h2><div class="sub">${esc(r.who || '')} · ${HR_REQ[r.kind] || esc(r.kind)} · sent ${fdt(r.created_at)}</div></div>
      <div class="right">${chip('pending', 'Step ' + (r.step + 1) + ' of ' + r.steps.length + ': ' + (step?.label || ''))}</div></header>
    <div class="body">${hrStepsBar({ steps: r.steps, current_step: r.step, status: 'pending' })}
      <dl class="kv mt">${changes}${priv}${kin}${other}${p.note ? `<dt>Their note</dt><dd>${esc(p.note)}</dd>` : ''}</dl>
      ${r.kind === 'leave' ? `<div data-linfo="${r.id}"></div>` : ''}
      ${relief ? '<p class="sub">You’re named as the relief officer: accept if you can cover while they’re away. Then it goes to their manager.</p>' : ''}
      <div class="hr-decide"><input data-note="${r.id}" placeholder="Note (optional)"><button class="btn" data-no="${r.id}">${relief ? 'Decline' : 'Don’t approve'}</button><button class="btn primary" data-ok="${r.id}">${ico('check')}${relief ? 'Accept' : 'Approve'}</button></div></div></section>`;
}

// ================================================================ ORG CHART
const hrOrgPage = {
  async load() {
    const ps = S.hr.positions.filter(p => p.active);
    const holders = pid => S.hr.dir.filter(c => c.position_id === pid);
    const kids = pid => ps.filter(p => (p.reports_to || null) === pid).sort((a, b) => (hrUnit(a.unit_id)?.sort ?? 0) - (hrUnit(b.unit_id)?.sort ?? 0) || a.sort - b.sort || a.id - b.id);
    const ids = new Set(ps.map(p => p.id));
    const roots = ps.filter(p => !p.reports_to || !ids.has(p.reports_to));
    const root = S.hr.orgRoot ? ps.filter(p => p.id === +S.hr.orgRoot) : roots;
    const seen = new Set();
    const node = p => {
      if (seen.has(p.id)) return ''; seen.add(p.id);
      const h = holders(p.id), ch = kids(p.id);
      const vac = !h.length && !p.is_external; const open = Math.max(0, (p.headcount || 1) - h.length);
      return `<li><div class="org-card ${vac ? 'vacant' : ''} ${p.is_external ? 'ext' : ''}" data-pos="${p.id}">
          <div class="oc-title">${esc(p.title)}</div>
          ${h.length ? h.map(c => `<button class="oc-person" data-p="${c.id}">${hrAv(c, 'sm')}<span>${esc(c.name)}</span></button>`).join('') : `<div class="oc-vac">${p.is_external ? 'External adviser' : 'Vacant'}</div>`}
          ${open && h.length ? `<div class="oc-vac">${open} more to fill</div>` : ''}
          <div class="oc-unit">${esc(hrUnit(p.unit_id)?.name || '')}</div>
          ${p.dotted_to && hrPos(p.dotted_to) ? `<div class="oc-dot">┄ also reports to ${esc(hrPos(p.dotted_to).title)}</div>` : ''}</div>
        ${ch.length ? `<ul class="${ch.length > 1 && ch.every(c => !kids(c.id).length) ? 'leafs' : ''}">${ch.map(node).join('')}</ul>` : ''}</li>`;
    };
    const heads = S.hr.units.filter(u => u.active && u.head_position_id && hrPos(u.head_position_id)?.active);
    const filled = ps.filter(p => holders(p.id).length).length;
    return topbar('Company', `Org chart · ${plural(ps.length, 'position')} · ${filled} filled · ${ps.filter(p => !holders(p.id).length && !p.is_external).length} vacant`,
        `<select id="oroot" class="inline"><option value="">Whole company</option>${heads.map(u => opt(u.head_position_id, u.name, S.hr.orgRoot)).join('')}</select>
         <div class="seg" id="ozoom"><button data-z="out" title="Smaller">−</button><button data-z="fit" class="${S.hr.orgZoom === 'fit' || !S.hr.orgZoom ? 'on' : ''}">Fit</button><button data-z="in" title="Bigger">+</button></div>
         <button class="btn" id="oprint">${ico('print')}Print</button>${isHRAdmin() ? `<a class="btn" href="#/people/settings?tab=org">${ico('edit')}Change the structure</a>` : ''}`) + hrCompanyTabs('org') +
      (ps.length ? `<div class="org-wrap" id="orgwrap"><div class="org-print-head">${wordmark()}<b>${esc(CFG.COMPANY || '')}</b><span>Organisational chart · ${fd(localISO(0))}</span></div>
        <ul class="org">${root.map(node).join('')}</ul></div>
        <div class="org-legend"><span><i class="lg-filled"></i>Filled</span><span><i class="lg-vac"></i>Vacant</span><span><i class="lg-ext"></i>External</span><span>┄ dotted line</span></div>`
        : `<div class="panel"><div class="empty">No positions yet. ${isHRAdmin() ? 'Add the structure in PeopleCore settings.' : 'HR sets up the structure.'}</div></div>`);
  },
  bind(main) {
    const r = $('#oroot', main); if (r) r.onchange = () => { S.hr.orgRoot = r.value; render({ quiet: true }); };
    const pr = $('#oprint', main); if (pr) pr.onclick = () => { document.body.classList.add('print-org'); setTimeout(() => { window.print(); document.body.classList.remove('print-org'); }, 50); };
    $$('[data-p]', main).forEach(b => b.onclick = e => { e.stopPropagation(); hrPersonCard(+b.dataset.p); });
    // zoom: "Fit" shows the whole chart in the page width; − and + step from there
    const w = $('#orgwrap', main), o = $('.org', main);
    const apply = () => { if (!w || !o) return; o.style.zoom = 1; const fit = Math.max(.3, Math.min(1, (w.clientWidth - 36) / o.scrollWidth));
      const z = S.hr.orgZoom === 'fit' || !S.hr.orgZoom ? fit : S.hr.orgZoom; o.style.zoom = z;
      if (w.scrollWidth > w.clientWidth) w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2; };
    $$('#ozoom button', main).forEach(bt => bt.onclick = () => { const cur = parseFloat(o.style.zoom) || 1;
      S.hr.orgZoom = bt.dataset.z === 'fit' ? 'fit' : Math.max(.35, Math.min(1.4, cur + (bt.dataset.z === 'in' ? .1 : -.1)));
      $$('#ozoom button', main).forEach(x => x.classList.toggle('on', x.dataset.z === 'fit' && S.hr.orgZoom === 'fit')); apply(); });
    apply();
  }
};

// ================================================================ 3.0.2: COMPANY TABS, WORK, PAGES STILL TO COME
function hrCompanyTabs(on) {
  const t = [['directory', 'Directory', '#/people/company'], ['org', 'Org chart', '#/people/org'], ['announcements', 'Announcements', '#/people/company/announcements'],
    ['policies', 'Policies', '#/people/company/policies'], ['holidays', 'Holidays', '#/people/company/holidays']];
  return `<div class="tabs hr-ctabs">${t.map(([k, l, h]) => `<a href="${h}" class="${on === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
}
const hrSoonPanel = k => { const [t, d, when] = HR_SOON[k] || [k, '', 'A later update'];
  return `<section class="panel hr-soon"><div class="body"><span class="hr-soon-ico">${ico('clock')}</span><div><div class="hr-soon-when">${esc(when)}</div><h2>${esc(t)}</h2><p>${esc(d)}</p>
    <p class="sub">This part of PeopleCore is being built. PeopleCore goes live for everyone once all of it is ready.</p></div></div></section>`; };
const hrSoonPage = {
  async load(parts) {
    const k = parts[1] === 'work' ? parts[2] : parts[1] === 'company' ? parts[2] : parts[1];
    const title = parts[1] === 'company' || ['announcements', 'policies', 'holidays'].includes(k) ? 'Company' : HR_SOON[k]?.[0] || 'PeopleCore';
    return topbar(title) + (title === 'Company' ? hrCompanyTabs(k) : '') + hrSoonPanel(k);
  }
};
// the share of a person's own record that's filled in (shown as "Complete your profile")
function hrProfileDone(me) {
  const pv = me.private || {};
  const checks = [['photo', 'a photo', me.photo], ['dob', 'your date of birth', me.date_of_birth], ['mobile', 'your mobile number', me.mobile], ['addr', 'your home address', me.address],
    ['pemail', 'a personal email', me.personal_email], ['kin', 'a next of kin', (me.kin || []).some(k => k.kind === 'next_of_kin')], ['emerg', 'an emergency contact', (me.kin || []).some(k => k.kind === 'emergency')],
    ['bank', 'your bank details', pv.account_no], ['tin', 'your tax ID', pv.tin], ['pen', 'your pension details', pv.rsa_pin], ['nhf', 'your NHF number', pv.nhf_no], ['nin', 'your NIN', pv.nin]];
  const missing = checks.filter(c => !c[2]).map(c => c[1]);
  return { pct: Math.round((checks.length - missing.length) / checks.length * 100), missing };
}
const hrWorkPage = {
  async load(parts) {
    if (parts[2]) return parts[2] === 'requisition' || parts[2] === 'leave' || HR_SOON[parts[2]] ? hrSoonPage.load(parts) : hrSoonPage.load(['people', 'work', 'leave']);
    const me = hrMe();
    if (!me) return topbar('Work') + `<div class="notice">HR hasn’t added your PeopleCore record yet, or it isn’t linked to your sign-in. Ask HR.</div>`;
    const c = me.card || {}; const done = hrProfileDone(me);
    this.bal = typeof thisYear === 'function' ? await q(sb.rpc('hr_leave_balances', { p_emp: me.id, p_year: thisYear() })).catch(() => []) : [];
    const reqs = this.reqs = await q(sb.from('hr_requests').select('id,kind,title,status,created_at,steps,current_step,employee_id').eq('employee_id', me.id).eq('status', 'pending').order('created_at', { ascending: false }));
    const qa = (icon, label, k) => `<a href="#/people/work/${k}">${ico(icon)}${label}</a>`;
    return `<section class="panel hr-wcard"><div class="body">${hrAv(c, 'xl')}
        <div class="hr-idmain"><h2>${esc(hrFullName(me))}</h2><div class="sub">${esc(c.title || 'No position yet')}${c.unit ? ' · ' + esc(c.unit) : ''}</div>
          <div class="hr-chips">${c.emp_no ? `<span class="tag">${esc(c.emp_no)}</span>` : ''}${chip(HR_STATUS[me.status]?.[0] || 'muted', HR_STATUS[me.status]?.[1] || me.status)}${c.emp_type ? chip('muted', c.emp_type) : ''}${c.location ? chip('muted', c.location) : ''}</div></div>
        <div class="hr-wmgr"><div class="mlbl">Line manager</div><div class="who">${me.manager_id ? hrAv(hrCard(me.manager_id) || { name: me.manager }, 'sm') : ''}<b>${esc(me.manager || '—')}</b></div>
          <div class="hr-wbtns"><a class="btn small" href="#/people/me">${ico('user')}My profile</a><a class="btn small" href="#/people/org">View org chart</a></div></div></div></section>
      ${done.pct < 100 ? `<section class="hr-complete"><span class="hr-ring" style="--p:${done.pct}"><b>${done.pct}%</b></span><div><div class="t">Complete your profile</div><div class="sub">Still missing: ${esc(done.missing.slice(0, 4).join(', '))}${done.missing.length > 4 ? ` and ${done.missing.length - 4} more` : ''}. HR checks every change.</div></div>
        <a class="btn small primary" href="#/people/me">Complete it</a></section>` : ''}
      <section class="hr-qa">${qa('plan', 'Apply for leave', 'leave')}<a href="#/people/work/requisition?tab=new">${ico('clock')}Raise overtime</a><a href="#/people/work/requisition?tab=new">${ico('plus')}New requisition</a>${qa('move', 'Request redeployment', 'redeployment')}<a href="#/people/disciplinary?raise=grievance">${ico('audit')}Raise a grievance</a></section>
      ${this.bal?.length ? `<section class="panel"><header><h2>My leave</h2><span class="meta">${thisYear()} · resets 1 January</span><div class="right"><a class="btn small" href="#/people/work/leave">Leave plan &amp; history</a></div></header>
        <div class="leaves">${this.bal.filter(b => !b.why_not && !b.unlimited).map(b => { const tot = +b.entitled + +b.carried - +b.lapsed + +b.adjusted; return `<div class="lv"><div class="t">${esc(b.name)}</div><div class="n">${+b.left} <small>of ${tot} days left</small></div><div class="bar"><i style="width:${tot ? Math.max(0, Math.min(100, b.left / tot * 100)) : 0}%"></i></div><a href="#/people/work/leave?apply=1">Apply →</a></div>`; }).join('')}</div></section>` : ''}
      <section class="panel"><header><h2>My open requests</h2><span class="meta">${reqs.length}</span><div class="right"><a class="btn small" href="#/people/approvals?tab=mine">All requests</a></div></header>
        ${reqs.length ? `<ul class="list">${reqs.map(hrReqLi).join('')}</ul>` : '<div class="empty">Nothing waiting.</div>'}</section>
      <section class="panel"><header><h2>My work</h2><span class="meta">Everything about your job in PeopleCore</span></header>
        <div class="hr-wgrid">${HR_WORK.map(([k, l]) => `<a class="hr-wtile" href="#/people/work/${k}"><b>${esc(l)}</b><span>${esc(HR_SOON[k][1])}</span><em>${esc(HR_SOON[k][2])}</em></a>`).join('')}</div></section>`;
  },
  bind() { }
};
