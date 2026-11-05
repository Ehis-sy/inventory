/* GANKCO Nest 3.0.4 — PeopleCore HRIS: overview, employees and their profiles, groups, employee settings,
   contracts, requests, redeployment, department schedules, audit trail (Admin view), and the Supervisor team. */
'use strict';

const HRIS = PC_MODS.hris;
HRIS.menu = [['', 'Overview', 'home'], ['employees', 'Employees', 'users', ['view-employees']], ['groups', 'Employee groups', 'grid', ['view-employee-groups', 'manage-employee-groups']],
  ['contracts', 'Contracts', 'cert', ['view-contracts', 'manage-contracts']], ['requests', 'Requests', 'check', ['view-profile-update-requests', 'approve-profile-update-requests', 'approve-contract-requests']],
  ['redeploy', 'Redeployment', 'move', ['view-redeployments', 'redeploy-employees']], ['schedules', 'Department schedules', 'plan', ['view-department-schedules', 'manage-department-schedules']],
  ['settings', 'Employee settings', 'gear', ['manage-employee-settings']], ['audit', 'Audit trail', 'audit', ['view-audit-trail']]];

const PC_STATUS = { active: ['ok', 'Active'], suspended: ['pending', 'Deactivated'], exited: ['muted', 'Exited'] };
const pcStatus = s => pcChip(...(PC_STATUS[s] || ['muted', s || '—']));
const hrisCfg = () => ({ profile_approval: true, empno_auto: true, contract_remind_days: 30, ...(hrSettings().hris || {}) });
async function hrisSaveCfg(patch, msg = 'Saved') {
  const next = { ...(hrSettings().hris || {}), ...patch };
  await q(sb.rpc('hr_settings_save', { p: { hris: next } })); S.settings.people = { ...(S.settings.people || {}), hris: next }; toast(msg);
}
const pcDeptName = c => hrUnit(c?.dept_id)?.name || '';
const pcEmpSub = c => [c.title, c.unit && c.unit !== pcDeptName(c) ? c.unit : null, pcDeptName(c)].filter(Boolean).map(esc).join(' · ');

// ---------------------------------------------------------------- the 13 profile sections (SeamlessHR) and the list-type ones
const PC_SECTIONS = [['profile', 'Profile'], ['dependant', 'Dependants'], ['family', 'Family'], ['account', 'Account details'], ['address', 'Address'], ['experience', 'Experience'],
  ['education', 'Education'], ['training', 'Trainings'], ['kin', 'Next of kin'], ['documents', 'Documents'], ['job', 'Department and job role'], ['ext_sup', 'External supervisor'], ['social', 'Social media accounts']];
const PC_ITEM_FIELDS = {
  dependant: [{ k: 'name', l: 'Full name', req: true }, { k: 'relationship', l: 'Relationship', t: 'select', opts: ['Child', 'Spouse', 'Parent', 'Sibling', 'Other'].map(x => [x, x]) }, { k: 'date_of_birth', l: 'Date of birth', t: 'date' }, { k: 'gender', l: 'Gender', t: 'select', opts: GENDERS.map(x => [x, x]) }],
  family: [{ k: 'name', l: 'Full name', req: true }, { k: 'relationship', l: 'Relationship', t: 'select', opts: ['Spouse', 'Father', 'Mother', 'Brother', 'Sister', 'Child', 'Other'].map(x => [x, x]) }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'occupation', l: 'Occupation' }],
  experience: [{ k: 'company', l: 'Company', req: true }, { k: 'job_title', l: 'Job title', req: true }, { k: 'from', l: 'From', t: 'date' }, { k: 'to', l: 'To', t: 'date', hint: 'Leave empty if it’s current' }, { k: 'description', l: 'What you did', t: 'textarea' }],
  education: [{ k: 'school', l: 'School', req: true }, { k: 'qualification', l: 'Qualification', t: 'select', opts: ['SSCE / O Level', 'OND', 'HND', 'B.Sc / B.Eng / BA', 'PGD', 'M.Sc / MBA / MA', 'PhD', 'Other'].map(x => [x, x]) }, { k: 'course', l: 'Course' }, { k: 'grade', l: 'Class / grade' }, { k: 'from', l: 'From', t: 'date' }, { k: 'to', l: 'To', t: 'date' }],
  training: [{ k: 'title', l: 'Training or certification', req: true }, { k: 'provider', l: 'Provider' }, { k: 'date', l: 'Date', t: 'date' }, { k: 'expires', l: 'Expires', t: 'date' }],
  social: [{ k: 'platform', l: 'Platform', t: 'select', req: true, opts: ['LinkedIn', 'X (Twitter)', 'Facebook', 'Instagram', 'Other'].map(x => [x, x]) }, { k: 'handle', l: 'Profile link or handle', req: true }]
};
const pcItemLine = (sec, d) => ({
  dependant: [d.name, [d.relationship, d.date_of_birth && fd(d.date_of_birth)].filter(Boolean).join(' · ')],
  family: [d.name, [d.relationship, d.phone, d.occupation].filter(Boolean).join(' · ')],
  experience: [`${d.job_title || ''} · ${d.company || ''}`, [d.from && fmonth(d.from), d.to ? fmonth(d.to) : 'now'].filter(Boolean).join(' – ')],
  education: [d.school, [d.qualification, d.course, d.grade, d.to && new Date(d.to).getFullYear()].filter(Boolean).join(' · ')],
  training: [d.title, [d.provider, d.date && fd(d.date), d.expires && 'expires ' + fd(d.expires)].filter(Boolean).join(' · ')],
  social: [d.platform, d.handle]
}[sec] || ['', '']);

// ---------------------------------------------------------------- Overview
HRIS.pages[''] = {
  async load() {
    const o = await q(sb.rpc('hr_hris_overview'));
    const ql = [['#/people/admin/hris/new', 'plus', 'Add an employee', 'add-employee'], ['#/people/admin/hris/employees', 'users', 'Active employees', 'view-employees'],
      ['#/people/admin/hris/requests', 'check', `Approve profile update requests${o.pending_updates ? ` (${o.pending_updates})` : ''}`, 'view-profile-update-requests'],
      ['#/people/admin/flow', 'plan', 'Manage approval workflows', 'view-approval-workflow'], ['#/people/admin/ann/new', 'bell', 'Publish an announcement', 'add-announcement'],
      ['#/people/admin/hris/audit', 'audit', 'View audit trail', 'view-audit-trail']].filter(x => pcCan(x[3]));
    const panel = (t, rows, pct) => `<section class="panel"><header><h2>${t}</h2></header>${pcBars(rows, { pct })}</section>`;
    return topbar('HRIS', 'Everyone at GANKCO, their records and how the company is set up.') +
      `<div class="pc-quick">${ql.map(([h, i, l]) => `<a href="${h}">${ico(i)}${esc(l)}</a>`).join('')}</div>` +
      pcKpis([[o.employees, 'Employees', '', '#/people/admin/hris/employees'], [o.redeployments, 'Redeployments this year', '', '#/people/admin/hris/redeploy'],
        [o.avg_age ?? '—', 'Average age'], [o.avg_service ?? '—', 'Average years of service'], [o.inactive, 'Deactivated', o.inactive ? 'warn' : ''], [o.pending_updates, 'Profile updates waiting', o.pending_updates ? 'warn' : '', '#/people/admin/hris/requests']]) +
      `<div class="pc-grid2">${panel('By department', o.by_dept, true)}${panel('By location', o.by_location, true)}${panel('By contract type', o.by_type, true)}
        ${panel('By gender', o.by_gender, true)}${panel('By age group', o.by_age, true)}${panel('Redeployments by status', (o.by_redeploy || []).map(r => ({ ...r, name: { approved: 'Approved', pending: 'Pending', rejected: 'Declined', cancelled: 'Cancelled' }[r.name] || r.name })))}</div>`;
  }
};

// ---------------------------------------------------------------- Employees
HRIS.pages.employees = { perms: ['view-employees'],
  async load(rest, params) {
    const rows = await q(sb.rpc('hr_emp_list')); S.pc.emps = rows;
    const st = S.pc.tables.emps; if (!st && params.get?.('status') !== 'all') S.pc.tables.emps = { f: { status: 'active' } };
    const cols = [{ k: 'name', l: 'Name & ID', v: r => r.name, f: r => pcPerson(r, esc(r.emp_no || 'No staff ID')) },
      { l: 'Department & position', v: r => pcDeptName(r) + ' ' + (r.title || ''), f: r => `<b>${esc(r.title || '—')}</b><br><small class="muted">${esc([r.unit !== pcDeptName(r) ? r.unit : null, pcDeptName(r)].filter(Boolean).join(' · ') || 'No department')}</small>` },
      { l: 'Resumption date', v: r => r.start_date || '', f: r => pcDate(r.start_date) },
      { l: 'Profile', v: r => r.completeness, f: r => `<span class="pc-person">${pcRing(r.completeness, 32)}${r.pending_update ? pcChip('pending', 'Update waiting') : ''}</span>` },
      { l: 'Status', v: r => r.status, f: r => pcStatus(r.status) + (r.signin ? '' : ` <span class="muted" title="No Nest sign-in yet">· no sign-in</span>`) },
      { l: 'Email', k: 'work_email', cls: 'hide-sm' }, { l: 'Phone', k: 'mobile', csv: r => r.mobile, f: () => '', cls: 'pc-hidden' }];
    const depts = hrUnitsOrdered().filter(u => u.tag === 'department');
    return topbar('Employees', plural(rows.filter(r => r.status === 'active').length, 'active employee'),
      `${pcCan('upload-employees') ? `<button class="btn" id="eup">${ico('up')}Upload</button>` : ''}${pcCan('add-employee') ? `<a class="btn primary" href="#/people/admin/hris/new">${ico('plus')}Add employee</a>` : ''}`) +
      pcTable('emps', cols, rows, { noun: 'employee', csv: 'GANKCO employees', href: r => '#/people/admin/hris/employee/' + r.id, placeholder: 'Search name, staff ID, email or job role',
        search: r => [r.name, r.emp_no, r.work_email, r.title, r.unit].join(' '),
        filters: [{ k: 'status', l: 'Status', opts: [['active', 'Active'], ['suspended', 'Deactivated'], ['exited', 'Exited']], test: (r, v) => r.status === v },
          { k: 'dept', l: 'Department', opts: depts.map(u => [u.id, u.name]), test: (r, v) => r.dept_id === +v },
          { k: 'loc', l: 'Location', opts: pcLists('location').map(l => [l.id, l.name]), test: (r, v) => r.location_id === +v },
          { k: 'type', l: 'Contract type', opts: pcLists('emp_type').map(l => [l.id, l.name]), test: (r, v) => r.emp_type_id === +v },
          { k: 'pg', l: 'Pay group', opts: pcLists('pay_group').map(l => [l.name, l.name]), test: (r, v) => r.pay_group === v },
          { k: 'upd', l: 'Profile updates', opts: [['1', 'Waiting for approval'], ['low', 'Profile under 50%']], test: (r, v) => v === '1' ? r.pending_update : r.completeness < 50 }] });
  },
  bind(main) { const u = $('#eup', main); if (u) u.onclick = () => pcEmpUpload(); }
};

// ---------------------------------------------------------------- Add / edit employee (SeamlessHR's form: basic, then pay)
const PC_EMP_BASIC = () => [
  { k: 'first_name', l: 'First name', req: true }, { k: 'last_name', l: 'Last name', req: true }, { k: 'middle_name', l: 'Middle name' },
  { k: 'emp_no', l: 'Staff ID', req: !hrisCfg().empno_auto, hint: hrisCfg().empno_auto ? 'Leave empty to number them automatically' : '' },
  { k: 'emp_type_id', l: 'Contract type', t: 'select', req: true, opts: v => pcListOpts('emp_type', v, 'Choose…') },
  { k: 'mobile', l: 'Phone number', t: 'tel', req: true }, { k: 'work_email', l: 'Email', t: 'email', hint: 'Their GANKCO email. They sign in to Nest with it.' },
  { k: 'gender', l: 'Gender', t: 'select', opts: GENDERS.map(x => [x, x]) },
  { k: 'region_id', l: 'Region', t: 'select', opts: v => pcListOpts('region', v) }, { k: 'location_id', l: 'Location', t: 'select', opts: v => pcListOpts('location', v) },
  { k: 'unit_id', l: 'Department / unit', t: 'select', opts: v => pcDeptOpts(v) }, { k: 'job_role_id', l: 'Job role', t: 'select', opts: v => pcJobOpts(v) },
  { k: 'cost_centre_id', l: 'Cost centre', t: 'select', opts: v => pcListOpts('cost_centre', v) }, { k: 'tag_id', l: 'Employee tag', t: 'select', opts: v => pcListOpts('emp_tag', v, 'None') }];
const PC_EMP_PAY = (isNew) => [
  { k: 'grade_id', l: 'Paygrade', t: 'select', req: true, opts: v => pcGradeOpts(v, 'Choose…'), hint: 'Grouped by pay group' },
  ...(pcCan('edit-employee-private-data') ? [{ k: 'gross_annual', l: 'Annual gross salary', t: 'money', hint: 'Locked: only people with “Edit employee private data” see it. Overtime uses it.' }] : []),
  { k: 'start_date', l: 'Date of employment', t: 'date', req: true }, { k: 'end_date', l: 'End date of employment', t: 'date', hint: 'For contracts that end' },
  { k: 'manager_id', l: 'Supervisor', t: 'select', opts: v => pcPeopleOpts(v, 'No supervisor') },
  { k: 'probation_months', l: 'Probation (months)', t: 'number', min: 0, max: 24 },
  ...(isNew ? [{ k: 'send_login', l: 'Send login details', t: 'switch', hint: 'Emails them how to create their Nest account' }] : []),
  { k: 'remarks', l: 'Remarks', t: 'textarea' }];
const PC_EMP_MORE = [{ k: 'title', l: 'Title', t: 'select', opts: TITLES.map(x => [x, x]) }, { k: 'preferred_name', l: 'Preferred name' }, { k: 'date_of_birth', l: 'Date of birth', t: 'date' },
  { k: 'marital_status', l: 'Marital status', t: 'select', opts: MARITAL.map(x => [x, x]) }, { k: 'nationality', l: 'Nationality' }, { k: 'state_of_origin', l: 'State of origin' },
  { k: 'personal_email', l: 'Personal email', t: 'email' }, { k: 'work_phone', l: 'Work phone', t: 'tel' }, { k: 'address', l: 'Home address', t: 'textarea' },
  { k: 'confirmation_due', l: 'Confirmation due', t: 'date' }, { k: 'confirmed_on', l: 'Confirmed on', t: 'date' }];

HRIS.pages.new = { perms: ['add-employee'],
  async load() { return this.form(null, {}); },
  form(e, v) {
    const isNew = !e;
    return topbar(isNew ? 'Add employee' : 'Edit ' + esc(hrFullName(e)), isNew ? 'Fields marked * are required. You can fill in the rest of the profile later.' : 'Changes to department, job role, paygrade, location or supervisor go into job history.',
      `<a class="btn" href="${isNew ? '#/people/admin/hris/employees' : '#/people/admin/hris/employee/' + e.id}">Cancel</a><button class="btn primary" id="esave">${isNew ? 'Add employee' : 'Save changes'}</button>`) +
      `<form id="eform" novalidate><section class="panel"><header><h2>Basic information</h2></header><div class="body">${pcForm(PC_EMP_BASIC(), v)}</div></section>
       <section class="panel"><header><h2>Pay and employment</h2></header><div class="body">${pcForm(PC_EMP_PAY(isNew), v)}</div></section>
       ${isNew ? '' : `<section class="panel"><header><h2>Personal details</h2></header><div class="body">${pcForm(PC_EMP_MORE, v)}</div></section>
       <section class="panel"><header><h2>When the change takes effect</h2></header><div class="body">${pcForm([{ k: 'effective', l: 'Effective date', t: 'date', hint: 'For job history. Today if empty.' }, { k: 'change_note', l: 'Note for job history' }], {})}</div></section>`}</form>`;
  },
  bind(main, rest, params, parts) {
    const e = this.emp; const isNew = parts[3] === 'new';
    const f = $('#eform', main); const all = [...PC_EMP_BASIC(), ...PC_EMP_PAY(isNew), ...(isNew ? [] : [...PC_EMP_MORE, { k: 'effective', t: 'date' }, { k: 'change_note' }])];
    const unit = $('[name=unit_id]', f), job = $('[name=job_role_id]', f);
    unit.onchange = () => { const cur = job.value; job.innerHTML = pcJobOpts(cur, unit.value); };
    if (unit.value) job.innerHTML = pcJobOpts(job.value, unit.value);
    $('#esave', main).onclick = async () => {
      const v = pcRead(f, all);
      const miss = all.find(x => x.req && (v[x.k] == null || v[x.k] === '')); if (miss) return toast(`${miss.l} is required`, true);
      const id = await pcTry(() => q(sb.rpc('hr_employee_save', { p: { ...(isNew ? {} : { id: this.emp.id }), ...v } })), isNew ? 'Employee added' : 'Saved');
      pcInvalidate(); go('#/people/admin/hris/employee/' + id);
    };
  }
};
HRIS.pages.edit = { perms: ['edit-employee'],
  async load(rest) {
    const e = await q(sb.rpc('hr_emp_get', { p_emp: +rest[0] })); HRIS.pages.new.emp = e;
    return HRIS.pages.new.form(e, { ...e, gross_annual: e.gross_annual });
  },
  bind(main, rest, params, parts) { HRIS.pages.new.bind(main, rest, params, parts); }
};

// ---------------------------------------------------------------- one employee's profile (admin and supervisor)
HRIS.pages.employee = { perms: ['view-employees'],
  async load(rest) { return pcProfile(+rest[0], 'admin', rest[1] || (S.pc.profEmp === +rest[0] ? S.pc.profSec : null)); },
  bind(main, rest) { pcBindProfile(main, +rest[0], 'admin'); }
};

const pcSecCount = (e, k) => { const n = ['dependant', 'family', 'experience', 'education', 'training', 'social'].includes(k) ? e.items.filter(x => x.section === k).length : k === 'kin' ? e.kin.length : k === 'documents' ? e.documents.length : 0; return n ? `<small class="muted">${n}</small>` : ''; };
async function pcProfile(id, mode, sec) {
  const e = await q(sb.rpc('hr_emp_get', { p_emp: id })); S.pc.emp = e; if (S.pc.profEmp !== id) { S.pc.profEmp = id; S.pc.profSec = null; } const all = sec === '*'; if (all) sec = null;
  const c = e.card; const admin = mode === 'admin'; const canEdit = admin && pcCan('edit-employee'); const selfMode = mode === 'self'; const G = hrisCfg().sections || {};
  const canItem = sec => canEdit || (selfMode && G[sec]?.emp_edit !== false);
  const priv = (admin && pcCan('view-employee-private-data')) || selfMode ? await q(sb.rpc('hr_private_get', { p_emp: id })).catch(() => null) : null;
  const L = id => hrListName(id) || '—';
  const kv = (rows) => `<dl class="pc-kv">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v == null || v === '' ? '<span class="muted">—</span>' : v}</dd></div>`).join('')}</dl>`;
  const it = s => e.items.filter(x => x.section === s);
  const first = sec || 'profile'; const box = (key, title, inner, act = '') => `<section class="panel" id="sec-${key}" ${key === first || all ? '' : 'hidden'}><header><h2>${esc(title)}</h2><span class="right">${act}</span></header>${inner}</section>`;
  const items = s => { const xs = it(s); return xs.length ? `<ul class="pc-items">${xs.map(x => { const [a, b] = pcItemLine(s, x.data); return `<li><div class="main"><b>${esc(a || '—')}</b><small>${esc(b || '')}</small></div>${canItem(s) ? `<button class="btn small" data-item="${x.id}">Edit</button>` : ''}</li>`; }).join('')}</ul>` : '<div class="empty">Nothing added yet.</div>'; };
  const addBtn = s => canItem(s) ? `<button class="btn small" data-additem="${s}">${ico('plus')}Add</button>` : '';
  const editBtn = s => canEdit ? `<button class="btn small" data-editsec="${s}">Edit</button>` : selfMode && ['profile', 'address', 'kin', 'account'].includes(s) && G[s]?.emp_edit !== false ? `<button class="btn small" data-selfchg>Update</button>` : '';
  const H = { joined: 'Joined', edit: 'Record changed', redeployment: 'Redeployed', move: 'Moved', contract_extended: 'Contract extended', contract_updated: 'Contract updated', activated: 'Activated', deactivated: 'Deactivated', exited: 'Exited' };
  const hist = e.history.length ? `<ul class="pc-timeline">${e.history.map(h => `<li><b>${esc(H[h.kind] || h.kind)}${h.title ? ' · ' + esc(h.title) : ''}</b><small>${pcDate(h.from_date)}${h.unit_name ? ' · ' + esc(h.unit_name) : ''}${h.by_name ? ' · by ' + esc(h.by_name) : ''}</small>
      ${Object.entries(h.details || {}).filter(([, d]) => d && typeof d === 'object').map(([k, d]) => `<div class="muted" style="font-size:13px">${esc(k.replace('_', ' '))}: ${esc(d.from ?? '—')} → ${esc(d.to ?? '—')}</div>`).join('')}${h.note ? `<div style="font-size:13px">${esc(h.note)}</div>` : ''}</li>`).join('')}</ul>` : '<div class="empty">No history yet.</div>';
  const docs = e.documents.length ? `<ul class="pc-items">${e.documents.map(d => `<li><div class="main"><b>${esc(d.title)}</b><small>${esc([d.kind, d.expires_on && 'expires ' + fd(d.expires_on), d.uploaded_by_name].filter(Boolean).join(' · '))}</small></div>${hrDays(d.expires_on) != null && hrDays(d.expires_on) < 30 ? pcChip(hrDays(d.expires_on) < 0 ? 'rejected' : 'pending', hrDays(d.expires_on) < 0 ? 'Expired' : 'Expiring') : ''}</li>`).join('')}</ul>` : '<div class="empty">No documents yet.</div>';
  const secs = [
    ['profile', 'Profile', kv([['Title', esc(e.title || '')], ['First name', esc(e.first_name)], ['Middle name', esc(e.middle_name || '')], ['Last name', esc(e.last_name)], ['Preferred name', esc(e.preferred_name || '')],
      ['Staff ID', esc(e.emp_no || '')], ['Gender', esc(e.gender || '')], ['Date of birth', admin || mode === 'self' ? pcDate(e.date_of_birth) : (c.birthday ? esc(c.birthday) : '')], ['Marital status', esc(e.marital_status || '')],
      ['Nationality', esc(e.nationality || '')], ['State of origin', esc(e.state_of_origin || '')], ['Work email', esc(e.work_email || '')], ['Personal email', esc(e.personal_email || '')],
      ['Phone', esc(e.mobile || '')], ['Work phone', esc(e.work_phone || '')], ['Contract type', esc(L(e.emp_type_id))], ['Date of employment', pcDate(e.start_date)], ['End date', pcDate(e.end_date)],
      ['Probation', e.probation_months ? e.probation_months + ' months' : ''], ['Confirmation', e.confirmed_on ? 'Confirmed ' + fd(e.confirmed_on) : e.confirmation_due ? 'Due ' + fd(e.confirmation_due) : ''],
      ['Employee tag', esc(hrListName(e.tag_id))], ['Remarks', esc(e.remarks || '')],
      ...S.hr.fields.filter(f => f.active && e.custom?.[f.key] != null).map(f => [f.label, esc(String(e.custom[f.key]))])]), editBtn('profile')],
    ['job', 'Department and job role', kv([['Department', esc(pcDeptName(c))], ['Unit', esc(c.unit !== pcDeptName(c) ? c.unit || '' : '')], ['Job role', esc(c.title || '')], ['Paygrade', esc(c.grade || '')], ['Pay group', esc(c.pay_group || '')],
      ['Location', esc(c.location || '')], ['Region', esc(hrListName(e.region_id))], ['Cost centre', esc(hrListName(e.cost_centre_id))],
      ['Groups', (e.groups || []).map(g => esc(S.pc.look.groups.find(x => x.id === g)?.name || '')).join(', ')],
      ...(admin && pcCan('view-employee-private-data') ? [['Annual gross salary', e.gross_annual ? `<span class="eye-val" data-secret="${esc(pcMoney(e.gross_annual))}">••••••</span> <button class="btn link small" data-reveal type="button">Show</button>` : '']] : [])]) +
      `<div class="pc-sec" style="margin:4px 16px 0">Reporting lines</div>${kv(e.lines.map(l => [l.label, l.id ? `${esc(l.name)}${l.override ? ' <span class="chip muted">set for this person</span>' : ''}` : '']))}`,
      (canEdit ? `<button class="btn small" data-lines>Reporting lines</button>` : '') + editBtn('job')],
    ['account', 'Account details', admin && !pcCan('view-employee-private-data') ? '<div class="empty">Locked. You need “View employee private data”.</div>' :
      kv(HR_PRIVATE.map(([k, l]) => [l, priv ? esc(priv[k] || '') : ''])), admin && pcCan('edit-employee-private-data') ? `<button class="btn small" data-priv>Edit</button>` : editBtn('account')],
    ['address', 'Address', kv([['Home address', esc(e.address || '')], ['Location', esc(c.location || '')]]), editBtn('address')],
    ['kin', 'Next of kin', e.kin.length ? `<ul class="pc-items">${e.kin.map(k => `<li><div class="main"><b>${esc(k.name)}</b><small>${esc([k.kind === 'emergency' ? 'Emergency contact' : 'Next of kin', k.relationship, k.phone, k.email].filter(Boolean).join(' · '))}</small></div></li>`).join('')}</ul>` : '<div class="empty">No next of kin yet.</div>', editBtn('kin')],
    ['dependant', 'Dependants', items('dependant'), addBtn('dependant')], ['family', 'Family', items('family'), addBtn('family')],
    ['experience', 'Experience', items('experience'), addBtn('experience')], ['education', 'Education', items('education'), addBtn('education')], ['training', 'Trainings', items('training'), addBtn('training')],
    ['documents', 'Documents', docs, admin && pcCan('manage-employee-documents', 'edit-employee') ? `<button class="btn small" data-adddoc>${ico('plus')}Add</button>` : ''],
    ['ext_sup', 'External supervisor', kv([['Name', esc(e.external_supervisor?.name || '')], ['Organisation', esc(e.external_supervisor?.org || '')], ['Email', esc(e.external_supervisor?.email || '')], ['Phone', esc(e.external_supervisor?.phone || '')]]), editBtn('ext_sup')],
    ['social', 'Social media accounts', items('social'), addBtn('social')],
    ['history', 'Job history', hist, '']];
  const grid = hrisCfg().sections || {};
  const show = secs.filter(([k]) => admin || selfMode || k === 'history' || grid[k]?.sup_view !== false && !(k === 'account' && mode === 'sup'));
  const acts = admin ? [pcCan('edit-employee') && `<a class="btn" href="#/people/admin/hris/edit/${e.id}">${ico('edit')}Edit</a>`,
    pcCan('redeploy-employees') && `<button class="btn" data-redeploy>${ico('move')}Redeploy</button>`,
    pcCan('manage-contracts', 'extend-contracts') && `<button class="btn" data-contract>${ico('cert')}Contract</button>`,
    e.status === 'active' && pcCan('deactivate-employee') && `<button class="btn" data-status="suspended">Deactivate</button>`,
    e.status !== 'active' && pcCan('activate-employee') && `<button class="btn" data-status="active">Activate</button>`,
    e.status !== 'exited' && pcCan('mark-employee-as-exited') && `<button class="btn danger" data-status="exited">Mark as exited</button>`].filter(Boolean).join('') : '';
  return topbar(selfMode ? 'My profile' : esc(hrFullName(e)), pcEmpSub(c) || 'Employee', selfMode ? `<button class="btn primary" data-selfchg>${ico('edit')}Update my details</button>` : `<a class="btn" href="${admin ? '#/people/admin/hris/employees' : '#/people/sup/team'}">Back</a>`) + (selfMode && hrisCfg().profile_approval !== false ? '<div class="notice">Changes you make go to HR for approval before they show.</div>' : '') +
    `<div class="pc-prof"><aside class="pc-prof-side"><section class="panel"><div class="pc-prof-card">${hrAv(c)}<h2>${esc(c.name)}</h2><div class="sub">${esc(c.title || '')}</div>
        <div style="margin:10px 0 4px">${pcStatus(e.status)} ${pcRing(e.completeness, 38)}</div><div class="sub">${esc(e.emp_no || '')}${c.work_email ? ' · ' + esc(c.work_email) : ''}</div></div>
        <nav class="pc-prof-nav">${show.map(([k, l], i) => `<a href="#sec-${k}" data-jump="${k}" class="${(sec ? k === sec : i === 0) ? 'on' : ''}">${esc(l)}${pcSecCount(e, k)}</a>`).join('')}<a href="#" data-jump="*">Show everything</a></nav></section>
        ${acts ? `<div class="pc-prof-acts">${acts}</div>` : ''}</aside>
      <div class="pc-prof-main">${show.map(([k, t, inner, act]) => box(k, t, inner, act)).join('')}</div></div>`;
}

function pcBindProfile(main, id, mode) {
  const e = S.pc.emp; const back = () => { pcInvalidate(); render({ quiet: true }); };
  main.addEventListener('click', async ev => {
    const j = ev.target.closest('[data-jump]'); if (j) { ev.preventDefault(); const k = j.dataset.jump; $$('.pc-prof-main > section', main).forEach(x => x.hidden = k !== '*' && x.id !== 'sec-' + k); $$('[data-jump]', main).forEach(a => a.classList.toggle('on', a === j)); S.pc.profSec = k; if (innerWidth < 900) $('.pc-prof-main', main).scrollIntoView({ behavior: 'smooth' }); return; }
    const rv = ev.target.closest('[data-reveal]'); if (rv) { const s = rv.previousElementSibling; const shown = s.textContent !== '••••••'; s.textContent = shown ? '••••••' : s.dataset.secret; rv.textContent = shown ? 'Show' : 'Hide'; return; }
    const ai = ev.target.closest('[data-additem]'), ei = ev.target.closest('[data-item]');
    if (ai || ei) {
      const x = ei ? e.items.find(i => i.id === +ei.dataset.item) : { section: ai.dataset.additem, data: {} };
      const sec = x.section; const label = PC_SECTIONS.find(s => s[0] === sec)?.[1] || sec;
      return pcEdit({ title: (ei ? 'Edit ' : 'Add to ') + label, fields: PC_ITEM_FIELDS[sec], vals: x.data, wide: false,
        onOpen: d => { if (ei) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn danger'; b.textContent = 'Remove'; b.style.marginRight = 'auto'; b.onclick = async () => { await pcTry(() => q(sb.rpc('hr_profile_item_delete', { p_id: x.id })), 'Removed'); d.close(); d.remove(); back(); }; $('.mf', d).prepend(b); } },
        save: async v => { const r = await q(sb.rpc('hr_profile_item_save', { p_emp: id, p: { id: x.id || null, section: sec, data: v } })); toast(r === 'sent' ? 'Sent to HR for approval' : 'Saved'); back(); } });
    }
    if (ev.target.closest('[data-selfchg]')) return hrChangeRequest(hrMe());
    const es = ev.target.closest('[data-editsec]');
    if (es) {
      const s = es.dataset.editsec;
      if (s === 'profile' || s === 'job') return go('#/people/admin/hris/edit/' + id);
      if (s === 'address') return pcEdit({ title: 'Address', fields: [{ k: 'address', l: 'Home address', t: 'textarea' }], vals: e, save: async v => { await q(sb.rpc('hr_employee_save', { p: { id, ...v } })); toast('Saved'); back(); } });
      if (s === 'ext_sup') return pcEdit({ title: 'External supervisor', sub: 'Someone outside GANKCO who supervises their work (e.g. at a client site).', fields: [{ k: 'name', l: 'Name' }, { k: 'org', l: 'Organisation' }, { k: 'email', l: 'Email', t: 'email' }, { k: 'phone', l: 'Phone', t: 'tel' }],
        vals: e.external_supervisor || {}, save: async v => { await q(sb.rpc('hr_employee_save', { p: { id, external_supervisor: v } })); toast('Saved'); back(); } });
      if (s === 'kin') return pcKinEdit(e, async kin => { await q(sb.rpc('hr_employee_save', { p: { id, kin } })); toast('Saved'); back(); });
    }
    if (ev.target.closest('[data-priv]')) {
      const priv = await q(sb.rpc('hr_private_get', { p_emp: id }));
      return pcEdit({ title: 'Account details', sub: 'Locked data. Every change is logged.', fields: [...HR_PRIVATE.map(([k, l]) => k === 'pfa' ? { k, l, t: 'select', opts: pcLists('pfa').map(p => [p.name, p.name]) } : { k, l }), { k: 'gross_annual', l: 'Annual gross salary', t: 'money' }],
        vals: priv, save: async v => { await q(sb.rpc('hr_private_save', { p_emp: id, p: v })); toast('Saved'); back(); } });
    }
    if (ev.target.closest('[data-lines]')) return pcLinesEdit(e, back);
    if (ev.target.closest('[data-redeploy]')) return pcRedeployForm([id], back);
    if (ev.target.closest('[data-contract]')) return pcContractForm([id], e, back);
    if (ev.target.closest('[data-adddoc]')) return hrAddDoc(id).then(r => { if (r) back(); });
    const st = ev.target.closest('[data-status]');
    if (st) {
      const to = st.dataset.status; const L = { active: 'Activate', suspended: 'Deactivate', exited: 'Mark as exited' }[to];
      return pcEdit({ title: `${L} ${esc(e.first_name)}?`, sub: to === 'suspended' ? 'They stay on record but can’t sign in to PeopleCore until activated.' : to === 'exited' ? 'Use Exit for resignations and terminations; this marks someone as gone straight away.' : '',
        fields: [...(to === 'exited' ? [{ k: 'date', l: 'Exit date', t: 'date', req: true }] : []), { k: 'note', l: to === 'exited' ? 'Reason' : 'Note', t: 'textarea', req: to === 'exited' }], vals: { date: localISO(0) }, submit: L, danger: to !== 'active',
        save: async v => { await q(sb.rpc('hr_employee_status', { p_emp: id, p_status: to, p_note: v.note, p_date: v.date || null })); toast('Done'); back(); } });
    }
  });
}

function pcKinEdit(e, save) {
  const rows = (e.kin.length ? e.kin : [{ kind: 'next_of_kin' }]).slice(0, 4);
  const one = (k, i) => `<div class="pc-form hr-kin" data-i="${i}">${pcForm([{ k: 'kind', l: 'Type', t: 'select', blank: false, opts: [['next_of_kin', 'Next of kin'], ['emergency', 'Emergency contact']] }, { k: 'name', l: 'Full name' }, { k: 'relationship', l: 'Relationship' }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'email', l: 'Email', t: 'email' }, { k: 'address', l: 'Address' }], k)}</div>`;
  return modal({ title: 'Next of kin and emergency contacts', wide: true, body: `<div id="kins">${rows.map(one).join('<hr>')}</div><button type="button" class="btn small" id="addkin">${ico('plus')}Add another</button>`,
    onOpen: d => { $('#addkin', d).onclick = () => { const n = $$('.hr-kin', d).length; if (n >= 4) return; $('#kins', d).insertAdjacentHTML('beforeend', '<hr>' + one({ kind: 'emergency' }, n)); }; },
    onSubmit: async (_, d) => save($$('.hr-kin', d).map(b => { const o = {}; $$('[name]', b).forEach(x => o[x.name] = x.value.trim()); return o; })) });
}
function pcLinesEdit(e, done) {
  const lines = S.pc.look.lines.filter(l => l.active && !l.company_wide);
  return pcEdit({ title: 'Reporting lines for ' + e.first_name, sub: 'Filled in from the org chart. Choose someone only where this person is different.',
    fields: lines.map(l => ({ k: l.key, l: l.label, t: 'select', opts: v => pcPeopleOpts(v, l.key === 'line_manager' ? 'No supervisor' : 'From the org chart', e.id) })),
    vals: Object.fromEntries(e.lines.map(l => [l.key, l.key === 'line_manager' ? e.manager_id : (l.override ? l.id : '')])), wide: false,
    save: async v => { for (const l of lines) { const cur = e.lines.find(x => x.key === l.key); const was = l.key === 'line_manager' ? e.manager_id : (cur?.override ? cur.id : null); const now = v[l.key] ? +v[l.key] : null;
      if (now !== (was || null)) await q(sb.rpc('hr_emp_line_set', { p_emp: e.id, p_key: l.key, p_approver: now })); } toast('Saved'); done(); } });
}
function pcRedeployForm(ids, done) {
  return pcEdit({ title: ids.length > 1 ? `Redeploy ${ids.length} employees` : 'Redeploy ' + (pcName(ids[0]) || ''), sub: 'Only what you choose changes. It goes into job history.',
    fields: [{ k: 'unit_id', l: 'Department / unit', t: 'select', opts: v => pcDeptOpts(v, 'No change') }, { k: 'job_role_id', l: 'Job role', t: 'select', opts: v => pcJobOpts(v, null, 'No change') },
      { k: 'location_id', l: 'Location', t: 'select', opts: v => pcListOpts('location', v, 'No change') }, { k: 'grade_id', l: 'Paygrade', t: 'select', opts: v => pcGradeOpts(v, 'No change') },
      { k: 'manager_id', l: 'Supervisor', t: 'select', opts: v => pcPeopleOpts(v, 'No change') }, { k: 'effective', l: 'Effective date', t: 'date', req: true }, { k: 'reason', l: 'Reason', t: 'textarea' }],
    vals: { effective: localISO(0) },
    save: async v => { const to = Object.fromEntries(['unit_id', 'job_role_id', 'location_id', 'grade_id', 'manager_id'].filter(k => v[k]).map(k => [k, +v[k]]));
      if (!Object.keys(to).length) throw new Error('Choose at least one thing to change');
      await q(sb.rpc('hr_redeploy', { p: { employees: ids, to, effective: v.effective, reason: v.reason } })); toast(ids.length > 1 ? `${ids.length} employees redeployed` : 'Redeployed'); done(); } });
}
function pcContractForm(ids, e, done) {
  return pcEdit({ title: ids.length > 1 ? `Extend ${ids.length} contracts` : 'Contract: ' + (e ? e.first_name : pcName(ids[0])), wide: false,
    fields: [{ k: 'kind', l: 'Change', t: 'radio', opts: [['extension', 'Extend'], ['update', 'Update']], def: 'extension' },
      { k: 'emp_type_id', l: 'Contract type', t: 'select', opts: v => pcListOpts('emp_type', v, 'No change'), show: v => v.kind === 'update' },
      { k: 'start_date', l: 'Contract start', t: 'date', show: v => v.kind === 'update' }, { k: 'end_date', l: 'New end date', t: 'date', req: true }, { k: 'reason', l: 'Note', t: 'textarea' }],
    vals: { kind: 'extension', end_date: e?.end_date || '' },
    save: async v => { const to = { end_date: v.end_date, ...(v.emp_type_id ? { emp_type_id: +v.emp_type_id } : {}), ...(v.start_date ? { start_date: v.start_date } : {}) };
      await q(sb.rpc('hr_contract_change', { p: { kind: v.kind || 'extension', employees: ids, to, reason: v.reason } })); toast('Contract saved'); done(); } });
}

// ---------------------------------------------------------------- upload employees (our template, or a SeamlessHR export)
const PC_UP_COLS = [['emp_no', 'Staff ID', ['staff id', 'employee id', 'staff number', 'employee number', 'id number']], ['first_name', 'First name', ['first name', 'firstname']], ['middle_name', 'Middle name', ['middle name', 'other name', 'other names']],
  ['last_name', 'Last name', ['last name', 'surname', 'lastname']], ['work_email', 'Email', ['email', 'work email', 'official email', 'email address']], ['mobile', 'Phone', ['phone', 'phone number', 'mobile', 'telephone']],
  ['gender', 'Gender', ['gender', 'sex']], ['date_of_birth', 'Date of birth', ['date of birth', 'dob', 'birthday']], ['marital_status', 'Marital status', ['marital status']],
  ['emp_type', 'Contract type', ['contract type', 'employment type', 'employee type']], ['department', 'Department', ['department']], ['unit', 'Unit', ['unit', 'sub department']],
  ['job_role', 'Job role', ['job role', 'position', 'designation', 'job title', 'role']], ['location', 'Location', ['location', 'branch', 'office']], ['region', 'Region', ['region']],
  ['cost_centre', 'Cost centre', ['cost centre', 'cost center']], ['grade', 'Paygrade', ['pay grade', 'paygrade', 'grade', 'level']], ['start_date', 'Date of employment', ['date of employment', 'resumption date', 'employment date', 'hire date', 'start date', 'date joined']],
  ['end_date', 'End date', ['end date', 'end date of employment', 'contract end date']], ['supervisor', 'Supervisor staff ID or email', ['supervisor', 'supervisor id', 'supervisor email', 'line manager', 'manager']],
  ['address', 'Address', ['address', 'home address', 'residential address']], ['nationality', 'Nationality', ['nationality']], ['state_of_origin', 'State of origin', ['state of origin', 'state']], ['personal_email', 'Personal email', ['personal email']]];
async function pcEmpUpload() {
  await modal({ title: 'Upload employees', wide: true, submit: 'Read file',
    sub: 'Use a SeamlessHR employee export, or our template. We match columns by their headings (Staff ID, First Name, Department, Job Role, Pay Grade, Supervisor…). Existing staff IDs are updated; new ones are added.',
    body: `<label class="f">Excel file (.xlsx)<input type="file" name="file" accept=".xlsx" required></label><p><button type="button" class="btn small" id="tpl">${ico('down')}Download our template</button></p>`,
    onOpen: d => { $('#tpl', d).onclick = () => brandXlsx({ file: `PeopleCore employees template_${localISO(0)}.xlsx`, sheets: [{ name: 'Employees', title: 'PeopleCore employees', columns: PC_UP_COLS.map(([k, h]) => ({ header: h, key: k, width: 18, input: true })), rows: [] }] }); },
    onSubmit: async (_, d) => {
      const file = $('[name=file]', d).files[0]; if (!file) throw new Error('Choose a file');
      await loadScript('vendor/exceljs.min.js'); const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const val = v => v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? (v.richText ? v.richText.map(t => t.text).join('') : v.text ?? v.result ?? '') : String(v);
      let rows = [];
      for (const ws of wb.worksheets) {
        let head = null, map = {};
        ws.eachRow((row, i) => {
          const vals = row.values.map(v => val(v).trim());
          if (!head) { const low = vals.map(v => v.toLowerCase().replace(/\s*\*\s*$/, '').trim()); const m = {}; PC_UP_COLS.forEach(([k, h, al]) => { const ix = low.findIndex(x => x === h.toLowerCase() || al.includes(x)); if (ix > 0) m[k] = ix; }); if (m.first_name && m.last_name) { head = i; map = m; } return; }
          const o = {}; Object.entries(map).forEach(([k, ix]) => { const v = vals[ix]; if (v) o[k] = v; }); if (o.first_name || o.emp_no) rows.push(o);
        });
        if (rows.length) break;
      }
      if (!rows.length) throw new Error('No employees found. The sheet needs at least First Name and Last Name columns.');
      const res = await q(sb.rpc('hr_bulk_employees2', { p_rows: rows }));
      toast(`${res.added} added · ${res.updated} updated${res.skipped ? ' · ' + res.skipped + ' skipped' : ''}`);
      if (res.notes?.length) await modal({ title: 'Upload notes', body: `<ul>${res.notes.slice(0, 60).map(n => `<li>${esc(n)}</li>`).join('')}</ul>`, submit: null, cancel: 'Close' });
      pcRefresh();
    } });
}

// ---------------------------------------------------------------- Employee groups
HRIS.pages.groups = { perms: ['view-employee-groups', 'manage-employee-groups'],
  async load() {
    const L = S.pc.look; const can = pcCan('manage-employee-groups', 'add-group', 'edit-group');
    const rows = L.groups.map(g => ({ ...g, n: L.members.filter(m => m.group_id === g.id).length }));
    return topbar('Employee groups', 'Groups (squads) can receive announcements, be used in workflows and have a supervisor.') +
      pcTable('groups', [{ k: 'name', l: 'Group', f: r => `<b>${esc(r.name)}</b><br><small class="muted">${esc(r.description || '')}</small>` },
        { l: 'Departments', v: r => r.unit_ids.map(u => hrUnit(u)?.name).join(', '), f: r => r.unit_ids.map(u => esc(hrUnit(u)?.name || '')).join(', ') || '—' },
        { l: 'Supervisor', v: r => pcName(r.supervisor_id), f: r => esc(pcName(r.supervisor_id) || '—') }, { k: 'n', l: 'Employees', cls: 'num' },
        { l: '', cls: 'num', sort: false, csv: false, f: r => can ? `<button class="btn small" data-g="${r.id}">Edit</button>` : '' }], rows,
        { noun: 'group', csv: 'Employee groups', actions: can ? `<button class="btn primary small" data-g="new">${ico('plus')}New group</button>` : '' });
  },
  bind(main) {
    main.addEventListener('click', e => {
      const b = e.target.closest('[data-g]'); if (!b) return;
      const g = b.dataset.g === 'new' ? { unit_ids: [], active: true } : S.pc.look.groups.find(x => x.id === +b.dataset.g);
      const mem = S.pc.look.members.filter(m => m.group_id === g.id).map(m => m.employee_id);
      pcEdit({ title: g.id ? 'Edit group' : 'New group', fields: [{ k: 'name', l: 'Name', req: true }, { k: 'supervisor_id', l: 'Supervisor', t: 'select', opts: v => pcPeopleOpts(v, 'None') }, { k: 'description', l: 'Description', wide: true },
        { k: 'unit_ids', l: 'Departments', t: 'checks', opts: hrUnitsOrdered().filter(u => u.tag === 'department').map(u => [u.id, u.name]) }, { k: 'members', l: 'Employees', t: 'checks', opts: pcPeopleList() }],
        vals: { ...g, members: mem },
        onOpen: d => { if (g.id) { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn danger'; x.textContent = 'Delete'; x.style.marginRight = 'auto'; x.onclick = async () => { await pcTry(() => q(sb.rpc('hr_group_delete', { p_id: g.id })), 'Deleted'); d.close(); d.remove(); pcRefresh(); }; $('.mf', d).prepend(x); } },
        save: async v => { await q(sb.rpc('hr_group_save', { p: { id: g.id || null, ...v } })); toast('Saved'); pcRefresh(); } });
    });
  }
};

// ---------------------------------------------------------------- Contracts
HRIS.pages.contracts = { perms: ['view-contracts', 'manage-contracts'],
  async load() {
    const rows = (await q(sb.rpc('hr_emp_list'))).filter(r => r.status !== 'exited');
    const exp = r => { const t = S.hr.lists.find(l => l.id === r.emp_type_id); return !!t?.meta?.expires; };
    const st = r => !r.end_date ? (exp(r) ? ['pending', 'No end date'] : ['ok', 'Open-ended']) : hrDays(r.end_date) < 0 ? ['rejected', 'Expired'] : hrDays(r.end_date) <= (hrisCfg().contract_remind_days || 30) ? ['pending', 'Expiring'] : ['ok', 'Running'];
    rows.forEach(r => r._st = st(r));
    const can = pcCan('extend-contracts', 'manage-contracts');
    return topbar('Contracts', 'Contract type and dates for everyone. Tick people to extend their contracts together.',
      `${pcCan('manage-contracts') ? `<button class="btn" id="cplan">${ico('up')}Contract plan upload</button>` : ''}`) +
      pcTable('contracts', [{ k: 'name', l: 'Name & ID', v: r => r.name, f: r => pcPerson(r, esc(r.emp_no || '')) }, { l: 'Contract type', v: r => r.emp_type || '', f: r => esc(r.emp_type || '—') },
        { l: 'Contract date', v: r => r.start_date || '', f: r => `${pcDate(r.start_date)}${r.end_date ? ' – ' + fd(r.end_date) : ''}` }, { l: 'Status', v: r => r._st[1], f: r => pcChip(...r._st) }], rows,
        { noun: 'contract', csv: 'Contracts', check: can, href: r => '#/people/admin/hris/employee/' + r.id,
          filters: [{ k: 'st', l: 'Status', opts: [['Running', 'Running'], ['Expiring', 'Expiring'], ['Expired', 'Expired'], ['Open-ended', 'Open-ended'], ['No end date', 'No end date']], test: (r, v) => r._st[1] === v },
            { k: 'type', l: 'Contract type', opts: pcLists('emp_type').map(l => [l.id, l.name]), test: (r, v) => r.emp_type_id === +v }],
          actions: can ? `<button class="btn small primary" id="cbulk" disabled>Extend selected</button>` : '', onSelect: sel => { const b = $('#cbulk'); if (b) { b.disabled = !sel.length; b.textContent = sel.length ? `Extend ${sel.length} selected` : 'Extend selected'; } } });
  },
  bind(main) {
    const b = $('#cbulk', main); if (b) b.onclick = () => pcContractForm(pcSelected('contracts').map(r => r.id), null, pcRefresh);
    const p = $('#cplan', main); if (p) p.onclick = () => modal({ title: 'Contract plan upload', submit: 'Upload', sub: 'Columns: Staff ID, Contract type, Contract start, Contract end. Each row updates that person’s contract.',
      body: `<label class="f">Excel file (.xlsx)<input type="file" name="file" accept=".xlsx" required></label><p><button type="button" class="btn small" id="ctpl">${ico('down')}Template</button></p>`,
      onOpen: d => { $('#ctpl', d).onclick = () => brandXlsx({ file: `Contract plan_${localISO(0)}.xlsx`, lists: [{ name: 'Types', values: pcLists('emp_type').map(l => l.name) }],
        sheets: [{ name: 'Contracts', title: 'Contract plan', columns: [{ header: 'Staff ID', key: 'emp_no', width: 14, input: true }, { header: 'Name', key: 'name', width: 26 }, { header: 'Contract type', key: 'contract_type', width: 18, input: true, validate: () => 'Types' }, { header: 'Contract start', key: 'start_date', width: 14, input: true, type: 'date' }, { header: 'Contract end', key: 'end_date', width: 14, input: true, type: 'date' }],
          rows: S.pc.tables.contracts.rows.map(r => ({ emp_no: r.emp_no, name: r.name, contract_type: r.emp_type || '', start_date: r.start_date || '', end_date: r.end_date || '' })) }] }); },
      onSubmit: async (_, d) => {
        await loadScript('vendor/exceljs.min.js'); const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await $('[name=file]', d).files[0].arrayBuffer());
        const rows = []; const val = v => v instanceof Date ? v.toISOString().slice(0, 10) : v?.text ?? v?.result ?? (v == null ? '' : String(v));
        wb.worksheets.forEach(ws => { let head = null; ws.eachRow((row, i) => { const vs = row.values.map(v => val(v).trim()); if (!head) { if (vs.includes('Staff ID')) head = Object.fromEntries(vs.map((h, ix) => [h, ix])); return; }
          if (vs[head['Staff ID']]) rows.push({ emp_no: vs[head['Staff ID']], contract_type: vs[head['Contract type']], start_date: vs[head['Contract start']], end_date: vs[head['Contract end']] }); }); });
        const r = await q(sb.rpc('hr_contract_bulk', { p_rows: rows })); toast(`${r.updated} contracts updated${r.not_found.length ? ` · ${r.not_found.length} staff IDs not found` : ''}`); pcRefresh();
      } });
  }
};

// ---------------------------------------------------------------- Requests (profile updates, contract update/extension, redeployment)
const PC_REQ_KIND = { profile_change: 'Profile update', contract_update: 'Contract update', contract_extension: 'Contract extension', redeployment: 'Redeployment' };
HRIS.pages.requests = { perms: ['view-profile-update-requests', 'approve-profile-update-requests', 'approve-contract-requests'],
  async load(rest, params) {
    const rows = await q(sb.from('hr_requests').select('id,kind,employee_id,title,status,created_at,current_step,steps,payload,decided_at').in('kind', Object.keys(PC_REQ_KIND)).order('created_at', { ascending: false }).limit(500));
    S.pc.reqs = rows; const mine = new Set(S.hr.appr.map(a => a.id));
    if (!S.pc.tables.hreq) S.pc.tables.hreq = { f: { st: 'pending' } };
    return topbar('Requests', 'Profile updates, contract updates and extensions, and redeployment requests from staff.') +
      pcTable('hreq', [{ l: 'Employee', v: r => pcName(r.employee_id), f: r => pcPerson(hrCard(r.employee_id) || { name: pcName(r.employee_id) }, esc(PC_REQ_KIND[r.kind] || r.kind)) },
        { k: 'title', l: 'Request' }, { l: 'Sent', v: r => r.created_at, f: r => fdt(r.created_at) },
        { l: 'Status', v: r => r.status, f: r => pcChip(r.status === 'pending' ? 'pending' : r.status === 'approved' ? 'ok' : 'rejected', r.status === 'pending' ? `Waiting · ${(r.steps[r.current_step] || {}).label || ''}` : r.status) },
        { l: '', cls: 'num', sort: false, csv: false, f: r => mine.has(r.id) ? `<button class="btn small primary" data-dec="${r.id}">Review</button>` : `<button class="btn small" data-dec="${r.id}">View</button>` }], rows,
        { noun: 'request', csv: 'HRIS requests', filters: [{ k: 'st', l: 'Status', opts: [['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Declined'], ['cancelled', 'Cancelled']], test: (r, v) => r.status === v },
          { k: 'kind', l: 'Type', opts: Object.entries(PC_REQ_KIND), test: (r, v) => r.kind === v }] });
  },
  bind(main) { main.addEventListener('click', e => { const b = e.target.closest('[data-dec]'); if (b) pcReqReview(S.pc.reqs.find(r => r.id === +b.dataset.dec)); }); }
};
function pcReqDetail(r) {
  const p = r.payload || {};
  if (p.section && p.item) return `<p><b>${esc(p.action === 'delete' ? 'Remove from' : p.action === 'add' ? 'Add to' : 'Change in')} ${esc(PC_SECTIONS.find(s => s[0] === p.section)?.[1] || p.section)}</b></p><dl class="kv">${Object.entries(p.item.data || {}).map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  if (p.to) return `<dl class="kv">${Object.entries(p.to).map(([k, v]) => `<dt>${esc({ unit_id: 'Department', job_role_id: 'Job role', location_id: 'Location', grade_id: 'Paygrade', manager_id: 'Supervisor', emp_type_id: 'Contract type', end_date: 'End date', start_date: 'Start date' }[k] || k)}</dt><dd>${esc(k === 'unit_id' ? hrUnit(v)?.name : k === 'job_role_id' ? pcJob(v)?.name : k === 'manager_id' ? pcName(v) : /_id$/.test(k) ? hrListName(v) : /date/.test(k) ? fd(v) : v)}</dd>`).join('')}${p.reason ? `<dt>Reason</dt><dd>${esc(p.reason)}</dd>` : ''}</dl>`;
  const ch = { ...(p.changes || {}) }; const pr = p.private || {};
  return `<dl class="kv">${Object.entries(ch).map(([k, v]) => `<dt>${esc(HR_LABEL[k] || k)}</dt><dd>${k === 'photo' ? 'New photo' : esc(v)}</dd>`).join('')}${Object.keys(pr).map(k => `<dt>${esc(HR_LABEL[k] || k)}</dt><dd><span class="muted">Locked: changed</span></dd>`).join('')}${p.kin ? '<dt>Next of kin</dt><dd>Updated</dd>' : ''}</dl>`;
}
async function pcReqReview(r) {
  const can = S.hr.appr.some(a => a.id === r.id);
  const steps = (r.steps || []).map((s, i) => `<li class="${s.state || 'waiting'}"><b>${esc(s.label)}</b> <small class="muted">${esc(s.state === 'approved' ? 'Approved by ' + (s.by_name || '') : s.state === 'rejected' ? 'Declined by ' + (s.by_name || '') : i === r.current_step && r.status === 'pending' ? 'Waiting' : '')}${s.note ? ' · “' + esc(s.note) + '”' : ''}</small></li>`).join('');
  await modal({ title: r.title, sub: `${esc(pcName(r.employee_id))} · sent ${fdt(r.created_at)}`, submit: can ? 'Approve' : null, cancel: 'Close',
    body: `${pcReqDetail(r)}${steps ? `<div class="pc-sec">Approval</div><ol class="pc-steplist">${steps}</ol>` : ''}${can ? `<label class="f">Comment<textarea name="note" rows="2"></textarea></label><button type="button" class="btn danger" id="rdecl">Decline</button>` : ''}`,
    onOpen: (d, close) => { const x = $('#rdecl', d); if (x) x.onclick = async () => { const note = $('[name=note]', d).value.trim(); if (!note) return toast('Say why you’re declining it', true); await pcTry(() => q(sb.rpc('hr_request_decide', { p_id: r.id, p_approve: false, p_note: note })), 'Declined'); close(true); pcRefresh(); }; },
    onSubmit: async data => { await q(sb.rpc('hr_request_decide', { p_id: r.id, p_approve: true, p_note: data.note || null })); toast('Approved'); pcRefresh(); } });
}

// ---------------------------------------------------------------- Redeployment
HRIS.pages.redeploy = { perms: ['view-redeployments', 'redeploy-employees'],
  async load(rest, params) {
    const tab = params.get?.('tab') || 'history';
    const tabs = pcTabs([['#/people/admin/hris/redeploy', 'History & requests'], ['#/people/admin/hris/redeploy?tab=bulk', 'Redeploy employees in bulk', 'redeploy-employees'], ['#/people/admin/hris/redeploy?tab=settings', 'Settings', 'manage-redeployment-settings']],
      tab === 'history' ? '#/people/admin/hris/redeploy' : '#/people/admin/hris/redeploy?tab=' + tab);
    const head = topbar('Redeployment', 'Moves between departments, units, job roles, locations and paygrades.') + tabs;
    if (tab === 'settings') {
      const c = hrisCfg().redeploy || {};
      return head + `<section class="panel"><div class="body"><form id="rdset">${pcForm([{ k: 'self_service', l: 'Employees can apply for redeployment', t: 'switch', hint: 'From My self service. The request follows the Redeployment approval workflow.' }], c)}<button class="btn primary">Save</button></form></div></section>`;
    }
    if (tab === 'bulk') {
      const rows = (await q(sb.rpc('hr_emp_list'))).filter(r => r.status === 'active');
      return head + pcTable('rdbulk', [{ k: 'name', l: 'Employee', v: r => r.name, f: r => pcPerson(r, esc(r.emp_no || '')) }, { l: 'Job role', v: r => r.title || '', f: r => esc(r.title || '—') }, { l: 'Department', v: r => pcDeptName(r), f: r => esc(pcDeptName(r) || '—') }, { l: 'Location', k: 'location' }], rows,
        { noun: 'employee', check: true, actions: `<button class="btn small primary" id="rdgo" disabled>Redeploy selected</button>`, onSelect: s => { const b = $('#rdgo'); b.disabled = !s.length; b.textContent = s.length ? `Redeploy ${s.length} selected` : 'Redeploy selected'; },
          filters: [{ k: 'd', l: 'Department', opts: hrUnitsOrdered().filter(u => u.tag === 'department').map(u => [u.id, u.name]), test: (r, v) => r.dept_id === +v }] });
    }
    const [reqs, hist] = await Promise.all([q(sb.from('hr_requests').select('id,employee_id,title,status,created_at,payload,steps,current_step').eq('kind', 'redeployment').order('created_at', { ascending: false }).limit(500)),
      q(sb.from('hr_job_history').select('*').eq('kind', 'redeployment').order('from_date', { ascending: false }).limit(500))]);
    S.pc.reqs = reqs;
    const rows = reqs.map(r => ({ ...r, h: hist.find(h => h.employee_id === r.employee_id && Math.abs(new Date(h.created_at) - new Date(r.created_at)) < 120000) }));
    return head + pcTable('rdh', [{ l: 'Employee', v: r => pcName(r.employee_id), f: r => pcPerson(hrCard(r.employee_id) || { name: pcName(r.employee_id) }) },
      { l: 'Change', sort: false, v: r => Object.entries(r.h?.details || {}).map(([k, d]) => `${k}: ${d.from} → ${d.to}`).join('; '), f: r => r.h ? Object.entries(r.h.details || {}).map(([k, d]) => `<div><small class="muted">${esc(k.replace('_', ' '))}</small> ${esc(d.from || '—')} → <b>${esc(d.to || '—')}</b></div>`).join('') : pcReqDetail(r) },
      { l: 'Effective', v: r => r.payload?.effective || '', f: r => pcDate(r.payload?.effective) }, { l: 'Status', v: r => r.status, f: r => pcChip(r.status === 'pending' ? 'pending' : r.status === 'approved' ? 'ok' : 'rejected', r.status) },
      { l: '', cls: 'num', sort: false, csv: false, f: r => r.status === 'pending' ? `<button class="btn small" data-dec="${r.id}">Review</button>` : '' }], rows,
      { noun: 'redeployment', csv: 'Redeployments', empty: 'No redeployments yet.', filters: [{ k: 'st', l: 'Status', opts: [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Declined']], test: (r, v) => r.status === v }] });
  },
  bind(main) {
    const f = $('#rdset', main); if (f) f.onsubmit = async e => { e.preventDefault(); await pcTry(() => hrisSaveCfg({ redeploy: pcRead(f, [{ k: 'self_service', t: 'switch' }]) })); render({ quiet: true }); };
    const g = $('#rdgo', main); if (g) g.onclick = () => pcRedeployForm(pcSelected('rdbulk').map(r => r.id), pcRefresh);
    main.addEventListener('click', e => { const b = e.target.closest('[data-dec]'); if (b) pcReqReview(S.pc.reqs.find(r => r.id === +b.dataset.dec)); });
  }
};

// ---------------------------------------------------------------- Department schedules
const PC_DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const pcDaysView = d => `<span class="pc-days">${PC_DAYS.map(([n, l]) => `<span class="${(d || []).includes(n) ? 'on' : ''}" title="${l}">${l[0]}${l[1]}</span>`).join('')}</span>`;
HRIS.pages.schedules = { perms: ['view-department-schedules', 'manage-department-schedules'],
  async load() {
    const rows = await q(sb.from('hr_schedules').select('*').order('scope'));
    S.pc.sched = rows; const can = pcCan('manage-department-schedules', 'update-work-days');
    return topbar('Department schedules', 'Work days per department or paygrade. Leave counts only these days. Everyone else works Monday to Friday.') +
      pcTable('sched', [{ l: 'Applies to', v: r => r.scope === 'unit' ? hrUnit(r.ref_id)?.name : hrListName(r.ref_id), f: r => `<b>${esc(r.scope === 'unit' ? hrUnit(r.ref_id)?.name || 'Department' : hrListName(r.ref_id) || 'Paygrade')}</b><br><small class="muted">${r.scope === 'unit' ? 'Department / unit' : 'Paygrade'}</small>` },
        { l: 'Work days', sort: false, v: r => r.days.map(d => PC_DAYS[d - 1][1]).join(' '), f: r => pcDaysView(r.days) }, { k: 'note', l: 'Note' }, { l: 'Updated', v: r => r.updated_at, f: r => `${esc(r.updated_by_name || '')}<br><small class="muted">${fd(r.updated_at)}</small>` },
        { l: '', cls: 'num', sort: false, csv: false, f: r => can ? `<button class="btn small" data-s="${r.id}">Edit</button>` : '' }], rows,
        { noun: 'schedule', empty: 'No special schedules: everyone works Monday to Friday.', actions: can ? `<button class="btn small primary" data-s="new">${ico('plus')}Add schedule</button>` : '' });
  },
  bind(main) {
    main.addEventListener('click', e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const r = b.dataset.s === 'new' ? { scope: 'unit', days: [1, 2, 3, 4, 5] } : S.pc.sched.find(x => x.id === +b.dataset.s);
      pcEdit({ title: r.id ? 'Edit schedule' : 'Add schedule', wide: false, fields: [{ k: 'scope', l: 'Applies to', t: 'radio', opts: [['unit', 'A department'], ['grade', 'A paygrade']], def: 'unit', dis: !!r.id },
        { k: 'unit_ref', l: 'Department / unit', t: 'select', opts: v => pcDeptOpts(v, 'Choose…'), show: v => v.scope !== 'grade' }, { k: 'grade_ref', l: 'Paygrade', t: 'select', opts: v => pcGradeOpts(v, 'Choose…'), show: v => v.scope === 'grade' },
        { k: 'days', l: 'Work days', t: 'checks', opts: PC_DAYS }, { k: 'note', l: 'Note' }], vals: { ...r, unit_ref: r.scope === 'unit' ? r.ref_id : '', grade_ref: r.scope === 'grade' ? r.ref_id : '' },
        onOpen: d => { if (r.id) { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn danger'; x.textContent = 'Delete'; x.style.marginRight = 'auto'; x.onclick = async () => { await pcTry(() => q(sb.rpc('hr_schedule_delete', { p_id: r.id })), 'Deleted'); d.close(); d.remove(); pcRefresh(); }; $('.mf', d).prepend(x); } },
        save: async v => { const scope = r.id ? r.scope : v.scope || 'unit'; const ref = scope === 'grade' ? v.grade_ref : v.unit_ref; if (!ref) throw new Error('Choose what it applies to');
          await q(sb.rpc('hr_schedule_save', { p: { scope, ref_id: +ref, days: v.days, note: v.note } })); toast('Saved'); pcRefresh(); } });
    });
  }
};

// ---------------------------------------------------------------- Audit trail (HRIS and System control)
const pcAuditPage = {
  async load(rest, params) {
    const f = { who: params.get?.('who') || '', action: params.get?.('action') || '', from: params.get?.('from') || '', to: params.get?.('to') || '', table: params.get?.('table') || '' };
    const rows = await q(sb.rpc('hr_audit', { p: { ...f, limit: 1000 } })); S.pc.audit = rows;
    const T = typeof HR_LOG_TBL !== 'undefined' ? HR_LOG_TBL : {};
    const desc = r => Object.entries(r.detail || {}).slice(0, 4).map(([k, d]) => d && typeof d === 'object' && 'to' in d ? `${k.replace(/_/g, ' ')}: ${d.from ?? '—'} → ${d.to ?? '—'}` : k.replace(/_/g, ' ') + (d?.changed ? ' changed' : '')).join('; ');
    return topbar('Audit trail', 'Every change in PeopleCore: who, what and when. Locked data shows only that it changed.') +
      `<form class="filters" id="audf">${['who:Initiator', 'from:From:date', 'to:To:date'].map(s => { const [k, l, t] = s.split(':'); return `<input type="${t || 'search'}" name="${k}" placeholder="${l}" value="${esc(f[k])}" aria-label="${l}">`; }).join('')}
        <select name="action"><option value="">Any action</option>${['insert', 'update', 'delete', 'request', 'admin', 'role'].map(a => opt(a, { insert: 'Added', update: 'Changed', delete: 'Deleted', request: 'Request', admin: 'Admin roles', role: 'HR role' }[a], f.action)).join('')}</select><button class="btn">Filter</button></form>` +
      pcTable('audit', [{ k: 'n', l: '#', v: r => r.id, f: r => `<small class="muted">${r.id}</small>` }, { k: 'who', l: 'Initiator', f: r => esc(r.who || 'System') }, { l: 'Action', v: r => r.action, f: r => esc({ insert: 'Added', update: 'Changed', delete: 'Deleted' }[r.action] || r.action) + ` <small class="muted">${esc(T[r.table] || r.table.replace(/^hr_/, '').replace(/_/g, ' '))}</small>` },
        { l: 'Description', sort: false, v: desc, f: r => `<small>${esc(desc(r))}</small>` }, { l: 'Subject', v: r => r.subject || '', f: r => esc(r.subject || '') }, { l: 'Date', v: r => r.at, f: r => fdt(r.at) }], rows,
        { noun: 'entry', csv: 'PeopleCore audit trail', search: r => [r.who, r.subject, r.table, desc(r)].join(' ') });
  },
  bind(main, rest, params, parts) {
    $('#audf', main).onsubmit = e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); const qs = new URLSearchParams(Object.entries(v).filter(([, x]) => x)).toString(); location.hash = '#/' + parts.slice(0, parts[1] === 'system' ? 3 : 4).join('/') + (qs ? '?' + qs : ''); };
  }
};
HRIS.pages.audit = { perms: ['view-audit-trail'], ...pcAuditPage };
PC_SYS.audit = pcAuditPage;

// self service: My profile shows the same 13 sections; changes follow the approval setting
PC_SELF.me = {
  async load() { const me = hrMe(); if (!me) return topbar('My profile') + '<div class="notice">HR hasn’t added your PeopleCore record yet. Ask HR.</div>'; return pcProfile(me.id, 'self'); },
  bind(main) { if (hrMe()) pcBindProfile(main, hrMe().id, 'self'); }
};
