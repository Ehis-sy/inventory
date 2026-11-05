/* GANKCO Nest 3.0.4 — PeopleCore Leave: the Admin module (SeamlessHR's menu), the Supervisor page,
   and the staff apply form with a "before you apply" note and a Preview step. */
'use strict';

const LV = PC_MODS.leave;
LV.menu = [['', 'Dashboard', 'home'], ['requests', 'Leave requests', 'plan', ['view-leave-requests', 'view-leaves-list-menu']], ['resumption', 'Resumption', 'check', ['view-resumption-request-list']],
  ['plans', 'Leave plan history', 'clock', ['view-approved-leaveplans-list', 'view-approved-leave-plan']], ['policies', 'Leave policies', 'cert', ['view-leave-policies', 'view-leaves-policies-menu']],
  ['upload', 'Upload leave history', 'up', ['upload-leave-history']], ['balance', 'Leave balance', 'chart', ['view-leave-balance']],
  ['reserved', 'Reserved days', 'lock', ['view-reserved-days', 'view-reserve-leaves-days-menu']], ['additional', 'Additional days', 'plus', ['view-additional-days', 'view-additional-leaves-days-menu']],
  ['blocked', 'Blocked days', 'out', ['view-blocked-days', 'view-blocked-leaves-days-menu']], ['allowances', 'Leave allowances', 'pay', ['manage-leaves-allowances', 'mark-leave-allowance-as-paid']],
  ['settings', 'Leave settings', 'gear', ['view-leaves-settings-menu', 'add-public-holiday', 'manage-resumption-settings']]];
const PC_LST = { pending: ['pending', 'Pending'], approved: ['ok', 'Approved'], rejected: ['rejected', 'Declined'], cancelled: ['muted', 'Cancelled'] };
let PC_LTYPES = null;
async function pcLeaveTypes(force) { if (force || !PC_LTYPES) PC_LTYPES = await q(sb.from('hr_leave_types').select('*').order('sort')); return PC_LTYPES; }
const pcLType = id => (PC_LTYPES || []).find(t => t.id === +id);
const pcLTypeOpts = (sel, blank = 'Choose…', all) => `<option value="">${esc(blank)}</option>` + (PC_LTYPES || []).filter(t => all || t.active || t.id === +sel).map(t => opt(t.id, t.name, sel)).join('');
const pcYear = params => +(params.get?.('y') || new Date().getFullYear());
const pcYearNav = (base, y) => `<span class="pc-ynav"><a class="btn small" href="${base}${base.includes('?') ? '&' : '?'}y=${y - 1}">← ${y - 1}</a><b>${y}</b><a class="btn small" href="${base}${base.includes('?') ? '&' : '?'}y=${y + 1}">${y + 1} →</a></span>`;

// ---------------------------------------------------------------- Dashboard
LV.pages[''] = {
  async load(rest, params) {
    const y = pcYear(params); const [d] = await Promise.all([q(sb.rpc('hr_leave_dash', { p_year: y })), pcLeaveTypes()]);
    return topbar('Leave', `Leave across GANKCO in ${y}.`, pcYearNav('#/people/admin/leave', y)) +
      pcKpis([[d.pending, 'Waiting for approval', d.pending ? 'warn' : '', '#/people/admin/leave/requests'], [d.away, 'On leave today', '', '#/people/admin/leave/requests'], [d.starting, 'Starting in 7 days'],
        [d.not_back, 'Not confirmed back', d.not_back ? 'warn' : '', '#/people/admin/leave/resumption'], [d.allowance_due, 'Allowances due', d.allowance_due ? 'warn' : '', '#/people/admin/leave/allowances']]) +
      `<div class="pc-grid2"><section class="panel"><header><h2>Applications by policy</h2></header>${pcBars(d.by_policy, { pct: true })}</section>
        <section class="panel"><header><h2>Days taken by month</h2></header>${pcBars(d.by_month)}</section>
        <section class="panel"><header><h2>By status</h2></header>${pcBars(d.by_status.map(s => ({ ...s, name: PC_LST[s.name]?.[1] || s.name })), { pct: true })}</section></div>`;
  }
};

// ---------------------------------------------------------------- Requests (SeamlessHR's filters)
LV.pages.requests = { perms: ['view-leave-requests', 'view-leaves-list-menu'],
  async load(rest, params) {
    const from = params.get?.('from') || `${new Date().getFullYear()}-01-01`, to = params.get?.('to') || '';
    const [rows] = await Promise.all([q(sb.rpc('hr_leave_requests', { p: { from, to } })), pcLeaveTypes()]); S.pc.lreq = rows;
    const depts = hrUnitsOrdered().filter(u => u.tag === 'department');
    return topbar('Leave requests', 'Every application. Open one to see its approvals, handover note and proof.', pcCan('apply-for-leave-for-staff') ? `<button class="btn primary" id="lstaff">${ico('plus')}Apply for staff</button>` : '') +
      `<form class="filters" id="lrf"><label class="muted">From <input type="date" name="from" value="${esc(from)}"></label><label class="muted">To <input type="date" name="to" value="${esc(to)}"></label><button class="btn small">Show</button></form>` +
      pcTable('lreq', [{ l: 'Name & ID', v: r => r.name, f: r => pcPerson(hrCard(r.employee_id) || { name: r.name }, esc(r.emp_no || '')) }, { k: 'type', l: 'Type' },
        { l: 'Start', v: r => r.start, f: r => fd(r.start) }, { l: 'End', v: r => r.end, f: r => fd(r.end) + (r.original_end && r.original_end !== r.end ? `<br><small class="muted">was ${fd(r.original_end)}</small>` : '') },
        { l: 'Days', cls: 'num', v: r => +r.days }, { l: 'Status', v: r => r.status, f: r => pcChip(...PC_LST[r.status]) + (r.status === 'pending' ? `<br><small class="muted">${esc(r.step || '')}${r.step_names?.length ? ' (' + esc(r.step_names.join(', ')) + ')' : ''}</small>` : '') + (r.recalled ? ' ' + pcChip('muted', 'Recalled') : '') + (r.history ? ' ' + pcChip('muted', 'History') : '') },
        { l: '', cls: 'num', sort: false, csv: false, f: r => `<button class="btn small" data-lv="${r.id}">View</button>` }], rows,
        { noun: 'request', csv: 'Leave requests', search: r => [r.name, r.emp_no, r.type].join(' '), filters: [
          { k: 'st', l: 'Status', opts: Object.entries(PC_LST).map(([k, v]) => [k, v[1]]), test: (r, v) => r.status === v },
          { k: 'pol', l: 'Policy', opts: PC_LTYPES.map(t => [t.id, t.name]), test: (r, v) => r.type_id === +v },
          { k: 'dept', l: 'Department', opts: depts.map(u => [u.id, u.name]), test: (r, v) => r.dept_id === +v },
          { k: 'grp', l: 'Group', opts: S.pc.look.groups.map(g => [g.id, g.name]), test: (r, v) => r.groups.includes(+v) },
          { k: 'loc', l: 'Location', opts: pcLists('location').map(l => [l.id, l.name]), test: (r, v) => r.location_id === +v },
          { k: 'job', l: 'Job role', opts: S.pc.look.jobs.filter(j => j.active).map(j => [j.id, j.name]), test: (r, v) => r.job_role_id === +v },
          { k: 'gr', l: 'Paygrade', opts: pcLists('grade').map(l => [l.id, l.name]), test: (r, v) => r.grade_id === +v },
          { k: 'ct', l: 'Contract type', opts: pcLists('emp_type').map(l => [l.id, l.name]), test: (r, v) => r.emp_type_id === +v },
          { k: 'cf', l: 'Confirmation', opts: [['1', 'Confirmed'], ['0', 'Not confirmed']], test: (r, v) => String(+r.confirmed) === v }] });
  },
  bind(main) {
    $('#lrf', main).onsubmit = e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); location.hash = '#/people/admin/leave/requests?' + new URLSearchParams(v).toString(); };
    const st = $('#lstaff', main); if (st) st.onclick = () => hrApplyLeave(null, null, null, true);
    main.addEventListener('click', e => { const b = e.target.closest('[data-lv]'); if (b) pcLeaveView(S.pc.lreq.find(r => r.id === +b.dataset.lv)); });
  }
};
async function pcLeaveView(r) {
  const steps = (r.steps || []).map((s, i) => `<li class="${s.state || 'waiting'}"><b>${esc(s.label)}</b>${s.names?.length ? ' · ' + esc(s.names.join(', ')) : ''} <small class="muted">${esc(s.state === 'approved' ? 'approved' + (s.by_name ? ' by ' + s.by_name : '') : s.state === 'rejected' ? 'declined' + (s.by_name ? ' by ' + s.by_name : '') : i === (r.steps.findIndex(x => x.state === 'waiting')) && r.status === 'pending' ? 'waiting' : '')}${s.note ? ' · “' + esc(s.note) + '”' : ''}</small></li>`).join('');
  const acts = r.status === 'approved' && !r.history ? [pcCan('recall-leave-request') && r.end >= localISO(0) && '<button type="button" class="btn" data-a="recall">Recall</button>', pcCan('extend-leave-request') && '<button type="button" class="btn" data-a="extend">Extend</button>'] : [];
  if (['pending', 'approved'].includes(r.status) && pcCan('cancel-leave-request')) acts.push('<button type="button" class="btn danger" data-a="cancel">Cancel leave</button>');
  if (r.relief_id !== undefined && pcCan('edit-leave-request-leave-officer') && ['pending', 'approved'].includes(r.status)) acts.push('<button type="button" class="btn" data-a="relief">Change relief officer</button>');
  await modal({ title: `${r.type} · ${r.name}`, sub: `Applied ${fdt(r.applied)}${r.by ? ' by ' + esc(r.by) : ''}`, submit: null, cancel: 'Close', wide: true,
    body: `<dl class="kv"><dt>Type</dt><dd>${esc(r.type)}</dd><dt>Start</dt><dd>${fd(r.start)}</dd><dt>End</dt><dd>${fd(r.end)}${r.original_end && r.original_end !== r.end ? ` (first asked: ${fd(r.original_end)})` : ''}</dd>
      <dt>Duration</dt><dd>${nDays(r.days)}</dd><dt>Resumption date</dt><dd>${pcDate(r.resumption)}${r.resumed_on ? ` · back ${fd(r.resumed_on)}` : ''}</dd><dt>Relief officer</dt><dd>${esc(r.relief || '—')}</dd>
      <dt>Reason</dt><dd>${esc(r.reason || '—')}</dd>${pcCan('view-leave-request-handover-note') ? `<dt>Handover note</dt><dd style="white-space:pre-wrap">${esc(r.handover || '—')}</dd>` : ''}
      ${r.document_id && pcCan('view-leave-request-proof') ? `<dt>Proof</dt><dd><button type="button" class="btn small" data-proof="${r.document_id}">${ico('down')}Download proof</button></dd>` : ''}</dl>
      ${steps ? `<div class="pc-sec">Approval details</div><ol class="pc-steplist">${steps}</ol>` : ''}${acts.filter(Boolean).length ? `<div class="pc-acts" style="justify-content:flex-start;margin-top:14px">${acts.filter(Boolean).join('')}</div>` : ''}`,
    onOpen: (d, close) => {
      const pf = $('[data-proof]', d); if (pf) pf.onclick = async () => { const doc = await q(sb.from('hr_documents').select('file_name,mime,data').eq('id', +pf.dataset.proof).single()); hrOpenFile(doc); };
      $$('[data-a]', d).forEach(b => b.onclick = async () => {
        const a = b.dataset.a; close(null);
        const F = { recall: [{ k: 'date', l: 'New last day of leave', t: 'date', req: true }, { k: 'note', l: 'Message to them', t: 'textarea' }], extend: [{ k: 'date', l: 'New last day of leave', t: 'date', req: true }],
          cancel: [{ k: 'note', l: 'Reason', t: 'textarea', req: true }], relief: [{ k: 'relief_id', l: 'Relief officer', t: 'select', opts: v => pcPeopleOpts(v, 'None', r.employee_id) }] }[a];
        pcEdit({ title: b.textContent + ' · ' + r.name, fields: F, vals: { relief_id: r.relief_id, date: a === 'recall' ? localISO(0) : r.end }, wide: false, danger: a === 'cancel',
          save: async v => { await q(sb.rpc('hr_leave_admin', { p_id: r.id, p_action: a, p: v })); toast('Done'); pcRefresh(); } });
      });
    } });
}

// ---------------------------------------------------------------- Resumption
LV.pages.resumption = { perms: ['view-resumption-request-list'],
  async load() {
    const rows = (await q(sb.rpc('hr_leave_requests', { p: { from: localISO(-120) } }))).filter(r => r.status === 'approved' && !r.history && r.resumption && r.resumption <= localISO(1));
    S.pc.lres = rows; const can = pcCan('approve-resumption-request', 'approve-or-decline-resumption-request');
    if (!S.pc.tables.lres) S.pc.tables.lres = { f: { st: 'no' } };
    return topbar('Resumption', 'Staff tap “I’m back” when they resume. Those who haven’t are listed here; their line manager and HR get a reminder two days after.') +
      pcTable('lres', [{ l: 'Name & ID', v: r => r.name, f: r => pcPerson(hrCard(r.employee_id) || { name: r.name }, esc(r.emp_no || '')) }, { k: 'type', l: 'Leave' }, { l: 'Leave dates', v: r => r.start, f: r => hrRange(r.start, r.end) },
        { l: 'Due back', v: r => r.resumption, f: r => fd(r.resumption) + (r.resumed_on ? '' : hrDays(r.resumption) < 0 ? ` <small class="muted">${-hrDays(r.resumption)} days ago</small>` : '') },
        { l: 'Back', v: r => r.resumed_on || '', f: r => r.resumed_on ? pcChip('ok', fd(r.resumed_on)) : pcChip('pending', 'Not confirmed') },
        { l: '', cls: 'num', sort: false, csv: false, f: r => !r.resumed_on && can ? `<button class="btn small" data-back="${r.id}">Mark back</button>` : '' }], rows,
        { noun: 'person', csv: 'Leave resumption', filters: [{ k: 'st', l: 'Status', opts: [['no', 'Not confirmed'], ['yes', 'Back']], test: (r, v) => v === 'yes' ? !!r.resumed_on : !r.resumed_on }] });
  },
  bind(main) {
    main.addEventListener('click', e => { const b = e.target.closest('[data-back]'); if (!b) return; const r = S.pc.lres.find(x => x.id === +b.dataset.back);
      pcEdit({ title: 'Back from leave: ' + r.name, sub: 'If they came back early, the days they didn’t use go back to their balance.', wide: false, fields: [{ k: 'date', l: 'Day they resumed', t: 'date', req: true }], vals: { date: r.resumption < localISO(0) ? r.resumption : localISO(0) },
        save: async v => { await q(sb.rpc('hr_leave_resume', { p_leave: r.id, p_date: v.date })); toast('Saved'); pcRefresh(); } }); });
  }
};

// ---------------------------------------------------------------- Leave plan history
LV.pages.plans = { perms: ['view-approved-leaveplans-list', 'view-approved-leave-plan'],
  async load(rest, params) {
    const y = pcYear(params);
    const [plans, leave] = await Promise.all([q(sb.from('hr_leave_plans').select('*').gte('end_date', `${y}-01-01`).lte('start_date', `${y}-12-31`)), q(sb.rpc('hr_leave_requests', { p: { from: `${y}-01-01`, to: `${y}-12-31` } }))]);
    const by = {}; plans.forEach(p => { (by[p.employee_id] = by[p.employee_id] || { id: p.employee_id, plans: [], planned: 0 }).plans.push(p); by[p.employee_id].planned += hrCountDays(p.start_date, p.end_date, true); });
    const rows = Object.values(by).map(x => { const c = hrCard(x.id) || {}; const taken = leave.filter(l => l.employee_id === x.id && l.status === 'approved' && !l.history);
      const inPlan = taken.filter(l => x.plans.some(p => l.start <= p.end_date && l.end >= p.start_date)).reduce((a, l) => a + +l.days, 0);
      return { ...x, name: c.name || pcName(x.id), dept: hrUnit(c.dept_id)?.name || '', grade: c.grade || '', applied: x.plans.map(p => p.created_at).sort()[0], total: taken.reduce((a, l) => a + +l.days, 0), inPlan, outPlan: taken.reduce((a, l) => a + +l.days, 0) - inPlan }; });
    return topbar('Leave plan history', 'What staff planned for the year, against what they took.', pcYearNav('#/people/admin/leave/plans', y)) +
      pcTable('lplans', [{ k: 'name', l: 'Name', f: r => pcPerson(hrCard(r.id) || { name: r.name }) }, { k: 'dept', l: 'Department' }, { k: 'grade', l: 'Paygrade' }, { l: 'Applied on', v: r => r.applied, f: r => pcDate(r.applied) },
        { l: 'Planned days', cls: 'num', v: r => r.planned }, { l: 'Taken in plan', cls: 'num', v: r => r.inPlan }, { l: 'Taken outside plan', cls: 'num', v: r => r.outPlan },
        { l: 'Plan', sort: false, v: r => r.plans.map(p => p.start_date + '–' + p.end_date).join('; '), f: r => r.plans.map(p => `<small>${hrRange(p.start_date, p.end_date)}</small>`).join('<br>') }], rows,
        { noun: 'person', csv: 'Leave plans ' + y, empty: 'Nobody has a leave plan for this year yet.' });
  }
};

// ---------------------------------------------------------------- Policies: list + 3-step editor
LV.pages.policies = { perms: ['view-leave-policies', 'view-leaves-policies-menu'],
  async load(rest) {
    await Promise.all([pcLeaveTypes(true), pcWorkflows()]);
    if (rest[0]) return pcLeavePolicyEditor(rest[0] === 'new' ? null : pcLType(rest[0]));
    const days = await q(sb.from('hr_leave_days').select('*'));
    const range = t => { const ds = days.filter(d => d.type_id === t.id && d.eligible).map(d => +d.days); return ds.length ? (Math.min(...ds) === Math.max(...ds) ? ds[0] : `${Math.min(...ds)}–${Math.max(...ds)}`) + ' days' : '—'; };
    const can = pcCan('edit-leave-policy');
    return topbar('Leave policies', 'GANKCO’s leave policies. Each one sets who can take it, how many days per paygrade, and which workflow approves it.', pcCan('add-leave-policy') ? `<a class="btn primary" href="#/people/admin/leave/policies/new">${ico('plus')}Create policy</a>` : '') +
      pcTable('lpol', [{ k: 'name', l: 'Name', f: t => `<b>${esc(t.name)}</b>${t.active ? '' : ' ' + pcChip('muted', 'Off')}<br><small class="muted">${esc(t.description || '')}</small>` }, { l: 'Days', v: range },
        { l: 'Accrual', v: () => 'No', f: () => 'No' }, { l: 'Splittable', v: t => pcYes(t.splittable) }, { l: 'Visible to employees', v: t => pcYes(t.visible) }, { l: 'Has allowance', v: t => pcYes(t.allowance) },
        { l: 'Workflow', v: t => S.pc.wfs.find(w => w.id === t.workflow_id)?.name || '', f: t => `<small>${esc(S.pc.wfs.find(w => w.id === t.workflow_id)?.name || '—')}</small>` },
        { l: '', cls: 'num', sort: false, csv: false, f: t => `<span class="pc-acts">${can ? `<a class="btn small" href="#/people/admin/leave/policies/${t.id}">Edit</a>` : ''}${pcCan('nudge-employees-leave-policy') && t.active ? `<button class="btn small" data-nudge="${t.id}">Nudge</button>` : ''}${pcCan('duplicate-leave-policy') ? `<button class="btn small" data-dup="${t.id}">Duplicate</button>` : ''}${pcCan('delete-leave-policy') ? `<button class="btn small danger" data-pdel="${t.id}" aria-label="Delete">✕</button>` : ''}</span>` }],
        PC_LTYPES, { noun: 'policy', csv: 'Leave policies' });
  },
  bind(main, rest) {
    if (rest[0]) return pcBindLeavePolicy(main);
    main.addEventListener('click', async e => {
      const n = e.target.closest('[data-nudge]'); if (n) { const c = await pcTry(() => q(sb.rpc('hr_leave_nudge', { p_id: +n.dataset.nudge }))); return toast(`Reminded ${plural(c, 'person', 'people')} who still have days`); }
      const d = e.target.closest('[data-dup]'); if (d) { const id = await pcTry(() => q(sb.rpc('hr_leave_policy_dup', { p_id: +d.dataset.dup })), 'Copied (switched off until you edit it)'); return go('#/people/admin/leave/policies/' + id); }
      const x = e.target.closest('[data-pdel]'); if (x) { if (!await pcConfirm('Delete policy?', 'If anyone has used it, it’s switched off instead.', 'Delete')) return; const r = await pcTry(() => q(sb.rpc('hr_leave_policy_delete', { p_id: +x.dataset.pdel }))); toast(r === 'deleted' ? 'Deleted' : 'Switched off (it has been used)'); PC_LTYPES = null; pcRefresh(); }
    });
  }
};
const PC_LP_INFO = () => [
  { k: 'name', l: 'Name', req: true, hint: 'Up to 50 characters' }, { k: 'paid', l: 'Payment', t: 'radio', opts: [['true', 'Paid'], ['false', 'Unpaid']], def: 'true' },
  { k: 'description', l: 'Description', t: 'textarea', hint: 'Up to 250 characters', rows: 2 },
  { k: 'depends_on', l: 'Depends on another policy', t: 'select', opts: v => pcLTypeOpts(v, 'No'), hint: 'Staff must use that one up first' },
  { k: 'shows_as', l: 'Shows on calendars as', t: 'select', blank: false, opts: [['leave', 'On leave'], ['training', 'Training']] },
  { k: 'eligible', l: 'Eligible staff', t: 'radio', opts: [['all', 'All staff'], ['confirmed', 'Confirmed staff']], def: 'all' }, { k: 'min_service_months', l: 'Length of service at least (months)', t: 'number', min: 0 },
  { k: 'gender', l: 'Gender', t: 'select', blank: false, opts: [['any', 'Everyone'], ['female', 'Women'], ['male', 'Men']] },
  { k: 'usage_month', l: 'Usage limit per month', t: 'number', min: 1, hint: 'Times; empty for no limit' }, { k: 'usage_year', l: 'Usage limit per year', t: 'number', min: 1 },
  { k: 'splittable', l: 'Splittable', t: 'switch', hint: 'Can be taken in parts. Off: the whole balance in one go.' }, { k: 'span_years', l: 'Can run into the next year', t: 'switch' },
  { k: 'weekends_count', l: 'Weekends count as leave days', t: 'switch' }, { k: 'holidays_count', l: 'Public holidays count as leave days', t: 'switch' },
  { k: 'visible', l: 'Visible to employees', t: 'switch', hint: 'Off: only HR can apply it for someone (e.g. Exceptional leave).' }, { k: 'allow_past', l: 'Can backdate', t: 'switch' },
  { k: 'reason_required', l: 'Reason required', t: 'switch' }, { k: 'proof_required', l: 'Proof required', t: 'switch', hint: 'A letter, certificate or medical note' },
  { k: 'block_portal', l: 'Block portal access while on leave', t: 'switch' }, { k: 'sup_can_add', l: 'Supervisor can add days', t: 'switch' },
  { k: 'relief_mode', l: 'Relief officer', t: 'radio', opts: [['optional', 'Optional'], ['required', 'Required'], ['disabled', 'Not used']], def: 'optional' },
  { k: 'relief_scope', l: 'Relief officer from', t: 'radio', opts: [['org', 'Anyone in GANKCO'], ['dept', 'Their department']], def: 'org', show: v => v.relief_mode !== 'disabled' },
  { k: 'allowance', l: 'Tied to leave allowance', t: 'switch' }, { k: 'allowance_min_days', l: 'Allowance due when at least this many days are taken', t: 'number', min: 1, show: v => v.allowance },
  { k: 'plannable', l: 'Staff can plan it (leave plan)', t: 'switch' }, { k: 'active', l: 'In use', t: 'switch' }];
const PC_LP_APPR = () => [
  { k: 'workflow_id', l: 'Approval workflow', t: 'select', req: true, opts: v => pcWfOpts(v) },
  { k: 'relief_approval', l: 'Relief officer approval', t: 'radio', opts: [['none', 'None'], ['relief', 'Relief officer'], ['line_manager', 'Line manager']], def: 'none', hint: 'Who accepts the relief arrangement before the workflow starts' },
  { k: 'n_start', l: 'Leave-start reminder', t: 'checks', opts: [['employee', 'Employee'], ['line_manager', 'Line manager'], ['admin', 'HR']] }, { k: 'n_start_days', l: 'Days before leave starts', t: 'number', min: 0 },
  { k: 'n_resume', l: 'Resumption reminder', t: 'checks', opts: [['employee', 'Employee'], ['line_manager', 'Line manager'], ['admin', 'HR']] }, { k: 'n_resume_days', l: 'Days before resumption', t: 'number', min: 0 }];
function pcLeavePolicyEditor(t) {
  const v = t ? { ...t, paid: String(t.paid), n_start: t.notify?.start || [], n_start_days: t.notify?.start_days ?? 1, n_resume: t.notify?.resume || [], n_resume_days: t.notify?.resume_days ?? 1 }
    : { paid: 'true', eligible: 'all', gender: 'any', shows_as: 'leave', splittable: true, visible: true, relief_mode: 'optional', relief_scope: 'org', relief_approval: 'none', active: true, workflow_id: S.pc.wfs.find(w => /leave approval/i.test(w.name))?.id, n_start: ['employee'], n_start_days: 1, n_resume: ['employee'], n_resume_days: 1 };
  LV.pol = { t, v };
  const ro = !pcCan(t ? 'edit-leave-policy' : 'add-leave-policy');
  return topbar(t ? esc(t.name) : 'Create leave policy', 'Three steps, as in SeamlessHR: information, approval, paygrades.', `<a class="btn" href="#/people/admin/leave/policies">Back</a>${ro ? '' : '<button class="btn primary" id="lpsave">Save policy</button>'}`) +
    `<nav class="pc-steps"><a href="#lp1" class="on" data-st="1"><b>1</b>Information</a><a href="#lp2" data-st="2"><b>2</b>Approval</a><a href="#lp3" data-st="3"><b>3</b>Paygrades</a></nav>
    <form id="lpform" novalidate><section class="panel" data-step="1"><div class="body">${pcForm(PC_LP_INFO(), v)}</div></section>
    <section class="panel" data-step="2" hidden><div class="body">${pcForm(PC_LP_APPR(), v)}</div></section>
    <section class="panel" data-step="3" hidden><header><h2>Paygrades</h2><span class="meta">Tick who can take it and set their days. The “All other paygrades” row covers anyone not listed.</span></header><div class="tablewrap" id="lpgrades"></div></section>
    <div class="pc-stepnav"><button type="button" class="btn" id="lpprev" hidden>← Back</button><button type="button" class="btn primary" id="lpnext">Next →</button></div></form>`;
}
async function pcBindLeavePolicy(main) {
  const { t } = LV.pol; const f = $('#lpform', main); let step = 1;
  const rows = t ? await q(sb.from('hr_leave_days').select('*').eq('type_id', t.id)) : [];
  const grades = [{ id: null, name: 'All other paygrades', parent: '' }, ...pcLists('pay_group', true).flatMap(g => S.hr.lists.filter(l => l.kind === 'grade' && l.parent_id === g.id && l.active).sort((a, b) => a.sort - b.sort).map(l => ({ id: l.id, name: l.name, parent: g.name }))),
    ...S.hr.lists.filter(l => l.kind === 'grade' && !l.parent_id && l.active).map(l => ({ id: l.id, name: l.name, parent: '' }))];
  const M = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  $('#lpgrades', main).innerHTML = `<table class="t pc-gtable"><thead><tr><th>Paygrade</th><th>Eligible</th><th>Days (confirmed)</th><th>Days (unconfirmed)</th><th>Notice (days)</th><th>Rollover days</th><th>Rollover expires</th><th>Handover note</th></tr></thead><tbody>
    ${grades.map(g => { const r = rows.find(x => (x.grade_id || null) === g.id); return `<tr data-g="${g.id ?? ''}"><td><b>${esc(g.name)}</b>${g.parent ? `<br><small class="muted">${esc(g.parent)}</small>` : ''}</td>
      <td><input type="checkbox" data-c="eligible" ${r ? (r.eligible ? 'checked' : '') : ''}></td><td><input type="number" min="0" step="0.5" data-c="days" value="${r?.days ?? ''}"></td><td><input type="number" min="0" step="0.5" data-c="days_unconfirmed" value="${r?.days_unconfirmed ?? ''}" placeholder="same"></td>
      <td><input type="number" min="0" data-c="notice_days" value="${r?.notice_days ?? ''}"></td><td><input type="number" min="0" step="0.5" data-c="rollover_days" value="${r?.rollover_days || ''}"></td>
      <td><select data-c="rollover_expiry_month"><option value="">Never</option>${M.slice(1).map((m, i) => opt(i + 1, 'End of ' + m, r?.rollover_expiry_month)).join('')}</select></td><td><input type="checkbox" data-c="handover" ${r?.handover ? 'checked' : ''}></td></tr>`; }).join('')}</tbody></table>`;
  $('#lpgrades', main).addEventListener('input', e => { const tr = e.target.closest('tr'); if (e.target.dataset.c === 'days' && e.target.value) $('[data-c=eligible]', tr).checked = true; });
  pcLiveShow(f, PC_LP_INFO(), LV.pol.v, $('[data-step="1"] .pc-form', f));
  const show = n => { step = n; $$('[data-step]', f).forEach(s => s.hidden = +s.dataset.step !== n); $$('[data-st]', main).forEach(a => a.classList.toggle('on', +a.dataset.st === n)); $('#lpprev', main).hidden = n === 1; $('#lpnext', main).hidden = n === 3; };
  $$('[data-st]', main).forEach(a => a.onclick = e => { e.preventDefault(); show(+a.dataset.st); });
  $('#lpnext', main).onclick = () => show(step + 1); $('#lpprev', main).onclick = () => show(step - 1);
  const sv = $('#lpsave', main); if (!sv) return;
  sv.onclick = async () => {
    const a = pcRead($('[data-step="1"]', f), PC_LP_INFO()), b = pcRead($('[data-step="2"]', f), PC_LP_APPR());
    const gradesOut = $$('#lpgrades tbody tr', main).map(tr => { const o = { grade_id: tr.dataset.g || null }; $$('[data-c]', tr).forEach(i => o[i.dataset.c] = i.type === 'checkbox' ? i.checked : i.value); return o; })
      .filter(o => o.eligible || o.days !== '');
    const p = { id: t?.id || null, ...a, paid: a.paid !== 'false', ...b, notify: { start: b.n_start, start_days: b.n_start_days, resume: b.n_resume, resume_days: b.n_resume_days }, grades: gradesOut };
    if (!p.name) { show(1); return toast('Enter the policy name', true); } if (!p.workflow_id) { show(2); return toast('Choose the approval workflow', true); }
    if (!gradesOut.some(g => g.eligible)) { show(3); return toast('Tick at least one paygrade', true); }
    const id = await pcTry(() => q(sb.rpc('hr_leave_policy_save', { p })), 'Policy saved'); PC_LTYPES = null; go('#/people/admin/leave/policies');
  };
}

// ---------------------------------------------------------------- Upload leave history and opening balances
LV.pages.upload = { perms: ['upload-leave-history'],
  async load() {
    await pcLeaveTypes();
    return topbar('Upload leave history', 'Bring in leave already taken (for example from SeamlessHR) and opening balances, from Excel.') +
      `<div class="pc-grid2"><section class="panel"><header><h2>Leave already taken</h2></header><div class="body"><p class="muted">Columns: Staff ID, Policy, Start date, End date, Days (optional). Counted as approved leave.</p>
        <p><button class="btn small" data-tpl="history">${ico('down')}Template</button></p><label class="f">Excel file<input type="file" accept=".xlsx" data-up="history"></label></div></section>
      <section class="panel"><header><h2>Opening balances</h2></header><div class="body"><p class="muted">Columns: Staff ID, Policy, Year, Days. Added to their balance as “opening balance”.</p>
        <p><button class="btn small" data-tpl="opening">${ico('down')}Template</button></p><label class="f">Excel file<input type="file" accept=".xlsx" data-up="opening"></label></div></section></div>`;
  },
  bind(main) {
    const cols = { history: [['emp_no', 'Staff ID'], ['policy', 'Policy'], ['start_date', 'Start date', 'date'], ['end_date', 'End date', 'date'], ['days', 'Days']], opening: [['emp_no', 'Staff ID'], ['policy', 'Policy'], ['year', 'Year'], ['days', 'Days']] };
    $$('[data-tpl]', main).forEach(b => b.onclick = () => brandXlsx({ file: `Leave ${b.dataset.tpl}_${localISO(0)}.xlsx`, lists: [{ name: 'Policies', values: PC_LTYPES.filter(t => t.active).map(t => t.name) }],
      sheets: [{ name: 'Leave', title: b.dataset.tpl === 'history' ? 'Leave history' : 'Opening balances', columns: cols[b.dataset.tpl].map(([key, header, type]) => ({ key, header, width: 16, input: true, ...(type ? { type } : {}), ...(key === 'policy' ? { validate: () => 'Policies' } : {}) })), rows: [] }] }));
    $$('[data-up]', main).forEach(inp => inp.onchange = async () => {
      const kind = inp.dataset.up; const file = inp.files[0]; if (!file) return;
      await loadScript('vendor/exceljs.min.js'); const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const val = v => v instanceof Date ? v.toISOString().slice(0, 10) : v?.text ?? v?.result ?? (v == null ? '' : String(v));
      const rows = []; wb.worksheets.forEach(ws => { let h = null; ws.eachRow((row) => { const vs = row.values.map(v => val(v).trim()); if (!h) { if (vs.includes('Staff ID')) h = Object.fromEntries(vs.map((x, i) => [x.replace(/\s*\*$/, ''), i])); return; }
        const o = {}; cols[kind].forEach(([k, l]) => o[k] = vs[h[l]]); if (o.emp_no) rows.push(o); }); });
      const r = await pcTry(() => q(sb.rpc('hr_leave_upload', { p_kind: kind, p_rows: rows }))); inp.value = '';
      toast(`${r.saved} saved${r.not_found.length ? ` · ${r.not_found.length} not matched` : ''}`);
      if (r.not_found.length) modal({ title: 'Not matched', body: `<p class="muted">Check the staff ID and policy name.</p><ul>${r.not_found.slice(0, 50).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`, submit: null, cancel: 'Close' });
    });
  }
};

// ---------------------------------------------------------------- Balance
LV.pages.balance = { perms: ['view-leave-balance'],
  async load(rest, params) {
    const y = pcYear(params); const [rows] = await Promise.all([q(sb.rpc('hr_leave_balance_all', { p_year: y })), pcLeaveTypes()]);
    const pols = PC_LTYPES.filter(t => t.active);
    const cell = (r, t) => { const b = r.balances.find(x => x.type_id === t.id); return b && !b.why_not ? +b.left : null; };
    return topbar('Leave balance', 'Days left for everyone, per policy. Taken and waiting days are already counted.', pcYearNav('#/people/admin/leave/balance', y)) +
      pcTable('lbal', [{ k: 'name', l: 'Name', f: r => pcPerson(hrCard(r.employee_id) || { name: r.name }, esc(r.emp_no || '')) },
        ...pols.map(t => ({ l: t.name.replace(/ Leave$/, ''), cls: 'num', v: r => cell(r, t) ?? '', f: r => { const b = r.balances.find(x => x.type_id === t.id); return !b || b.why_not ? '<span class="muted">—</span>' : `<b>${+b.left}</b>${+b.pending ? ` <small class="muted">(${+b.pending} waiting)</small>` : ''}`; } }))], rows,
        { noun: 'person', csv: 'Leave balances ' + y, filters: [{ k: 'd', l: 'Department', opts: hrUnitsOrdered().filter(u => u.tag === 'department').map(u => [u.id, u.name]), test: (r, v) => r.dept_id === +v }] });
  }
};

// ---------------------------------------------------------------- Reserved / additional / blocked days
const pcDaysPage = (kind, title, sub, perms, cols, fields, fetch) => ({ perms,
  async load(rest, params) {
    await pcLeaveTypes(); const rows = await fetch(params); S.pc['ld_' + kind] = rows;
    const can = pcCan(perms[0].replace(/^view-/, 'add-')) || pcCan(perms);
    return topbar(title, sub) + pcTable('ld_' + kind, [{ l: 'Employee', v: r => pcName(r.employee_id), f: r => pcPerson(hrCard(r.employee_id) || { name: pcName(r.employee_id) }) }, ...cols,
      { l: '', cls: 'num', sort: false, csv: false, f: r => `<span class="pc-acts"><button class="btn small" data-ed="${r.id}">Edit</button><button class="btn small danger" data-rm="${r.id}" aria-label="Delete">✕</button></span>` }], rows,
      { noun: 'entry', csv: title, actions: `<button class="btn small primary" data-new>${ico('plus')}Add</button>` });
  },
  bind(main) {
    const edit = r => pcEdit({ title: (r.id ? 'Edit ' : 'Add ') + title.toLowerCase(), fields: [...(r.id ? [] : [{ k: 'employees', l: 'Employees', t: 'checks', req: true, opts: pcPeopleList() }]), ...fields()], vals: r,
      save: async v => { await q(sb.rpc('hr_leave_days_save', { p_kind: kind, p: { ...v, id: r.id || null, ...(r.id ? { employee_id: r.employee_id } : {}) } })); toast('Saved'); pcRefresh(); } });
    main.addEventListener('click', async e => {
      if (e.target.closest('[data-new]')) return edit({ year: new Date().getFullYear() });
      const ed = e.target.closest('[data-ed]'); if (ed) return edit({ ...S.pc['ld_' + kind].find(x => x.id === +ed.dataset.ed), remark: S.pc['ld_' + kind].find(x => x.id === +ed.dataset.ed).remark ?? S.pc['ld_' + kind].find(x => x.id === +ed.dataset.ed).reason });
      const rm = e.target.closest('[data-rm]'); if (rm) { if (!await pcConfirm('Delete?', 'Remove this entry?', 'Delete')) return; await pcTry(() => q(sb.rpc('hr_leave_days_delete', { p_kind: kind, p_id: +rm.dataset.rm })), 'Deleted'); pcRefresh(); }
    });
  } });
const pcLdFields = (withName) => () => [{ k: 'type_id', l: 'Policy', t: 'select', req: true, opts: v => pcLTypeOpts(v) }, { k: 'year', l: 'Year', t: 'number', req: true, min: 2020, max: 2100 }, { k: 'days', l: 'Days', t: 'number', req: true, step: 0.5 },
  ...(withName ? [{ k: 'name', l: 'Name', ph: 'e.g. Christmas shutdown' }] : []), { k: 'remark', l: 'Remark', t: 'textarea' }];
LV.pages.reserved = pcDaysPage('reserved', 'Reserved days', 'Days set aside from someone’s balance (for example a company shutdown). They can’t apply for them.', ['view-reserved-days', 'add-reserved-days', 'view-reserve-leaves-days-menu'],
  [{ k: 'name', l: 'Name' }, { l: 'Policy', v: r => pcLType(r.type_id)?.name || '' }, { k: 'year', l: 'Year', cls: 'num' }, { l: 'Days', cls: 'num', v: r => +r.days }, { k: 'remark', l: 'Remark' }, { l: 'Added', v: r => r.created_at, f: r => fd(r.created_at) }],
  pcLdFields(true), () => q(sb.from('hr_leave_reserved').select('*').order('created_at', { ascending: false })));
LV.pages.additional = pcDaysPage('additional', 'Additional days', 'Extra days added to someone’s balance (for example for working a weekend). Opening balances show here too.', ['view-additional-days', 'add-additional-days', 'view-additional-leaves-days-menu'],
  [{ l: 'Policy', v: r => pcLType(r.type_id)?.name || '' }, { k: 'year', l: 'Year', cls: 'num' }, { l: 'Days', cls: 'num', v: r => +r.days }, { l: 'Remark', v: r => r.reason || '' }, { l: 'Kind', v: r => r.kind, f: r => pcChip('muted', { opening: 'Opening balance', additional: 'Additional', adjust: 'Adjustment' }[r.kind] || r.kind) }, { l: 'Added', v: r => r.created_at, f: r => `${fd(r.created_at)}<br><small class="muted">${esc(r.by_name || '')}</small>` }],
  pcLdFields(false), () => q(sb.from('hr_leave_adjust').select('*').order('created_at', { ascending: false })));
LV.pages.blocked = pcDaysPage('blocked', 'Blocked days', 'Someone can’t take leave (of one policy, or any) between these dates.', ['view-blocked-days', 'add-blocked-days', 'view-blocked-leaves-days-menu'],
  [{ l: 'Policy', v: r => pcLType(r.type_id)?.name || 'Any leave' }, { l: 'From', v: r => r.from_date, f: r => fd(r.from_date) }, { l: 'To', v: r => r.to_date, f: r => fd(r.to_date) }, { k: 'remark', l: 'Remark' }],
  () => [{ k: 'type_id', l: 'Policy', t: 'select', opts: v => pcLTypeOpts(v, 'Any leave') }, { k: 'from_date', l: 'From', t: 'date', req: true }, { k: 'to_date', l: 'To', t: 'date', req: true }, { k: 'remark', l: 'Remark', t: 'textarea' }],
  () => q(sb.from('hr_leave_blocked').select('*').order('from_date', { ascending: false })));

// ---------------------------------------------------------------- Leave allowances: Due and Paid
LV.pages.allowances = { perms: ['manage-leaves-allowances', 'mark-leave-allowance-as-paid'],
  async load(rest, params) {
    const tab = params.get?.('tab') || 'due'; const y = pcYear(params);
    const rows = (await q(sb.rpc('hr_leave_allowance_list', { p_year: y }))).filter(r => r.status === tab); S.pc.allow = rows;
    const canPay = pcCan('mark-leave-allowance-as-paid');
    return topbar('Leave allowances', 'Due when someone’s annual leave is approved. Record the amount, then mark it paid (Payroll will take this over later).', pcYearNav('#/people/admin/leave/allowances?tab=' + tab, y)) +
      pcTabs([['#/people/admin/leave/allowances?tab=due&y=' + y, 'Due'], ['#/people/admin/leave/allowances?tab=paid&y=' + y, 'Paid']], '#/people/admin/leave/allowances?tab=' + tab + '&y=' + y) +
      pcTable('allow', [{ l: 'Employee', v: r => r.name, f: r => pcPerson(hrCard(r.employee_id) || { name: r.name }, esc(r.emp_no || '')) }, { l: 'Policy', v: r => r.type || '' }, { l: 'Leave days', cls: 'num', v: r => +r.days || 0 },
        { l: 'Amount', cls: 'num', v: r => r.amount ?? '', f: r => r.amount != null ? pcMoney(r.amount) : '<span class="muted">Not recorded</span>' }, { l: 'Requested', v: r => pcYes(r.requested), f: r => r.requested ? pcChip('pending', 'Yes') : 'No' },
        { l: tab === 'due' ? 'Date due' : 'Date paid', v: r => tab === 'due' ? r.due_on : r.paid_on, f: r => pcDate(tab === 'due' ? r.due_on : r.paid_on) },
        ...(tab === 'due' ? [{ l: 'Pay with payroll', v: r => pcYes(r.with_payroll) }] : [{ l: 'By', k: 'by' }]),
        { l: '', cls: 'num', sort: false, csv: false, f: r => `<span class="pc-acts">${pcCan('manage-leaves-allowances') && tab === 'due' ? `<button class="btn small" data-amt="${r.id}">Amount</button>` : ''}${tab === 'paid' && pcCan('revert-leave-allowance-as-paid') ? `<button class="btn small" data-unpaid="${r.id}">Revert</button>` : ''}</span>` }], rows,
        { noun: 'allowance', csv: `Leave allowances ${tab} ${y}`, check: tab === 'due' && canPay, empty: tab === 'due' ? 'No allowances due.' : 'None paid yet.',
          actions: tab === 'due' && canPay ? `<button class="btn small primary" id="apay" disabled>Mark selected as paid</button>` : '', onSelect: s => { const b = $('#apay'); if (b) { b.disabled = !s.length; b.textContent = s.length ? `Mark ${s.length} as paid` : 'Mark selected as paid'; } } });
  },
  bind(main) {
    const p = $('#apay', main); if (p) p.onclick = () => { const sel = pcSelected('allow');
      pcEdit({ title: `Mark ${plural(sel.length, 'allowance')} as paid`, wide: false, fields: [{ k: 'paid_on', l: 'Date paid', t: 'date', req: true }, ...(sel.some(s => s.amount == null) ? [{ k: 'amount', l: 'Amount (for those without one)', t: 'money' }] : [])], vals: { paid_on: localISO(0) },
        save: async v => { await q(sb.rpc('hr_leave_allowance_set', { p_ids: sel.map(s => s.id), p_action: 'paid', p: v })); toast('Marked as paid'); pcRefresh(); } }); };
    main.addEventListener('click', async e => {
      const a = e.target.closest('[data-amt]'); if (a) { const r = S.pc.allow.find(x => x.id === +a.dataset.amt);
        return pcEdit({ title: 'Allowance for ' + r.name, wide: false, fields: [{ k: 'amount', l: 'Amount', t: 'money', req: true }, { k: 'note', l: 'Note' }, ...(pcCan('mark-leave-allowance-go-with-next-payroll') ? [{ k: 'with_payroll', l: 'Pay with the next payroll', t: 'switch' }] : [])], vals: r,
          save: async v => { await q(sb.rpc('hr_leave_allowance_set', { p_ids: [r.id], p_action: 'amount', p: v })); if (v.with_payroll !== undefined && v.with_payroll !== r.with_payroll) await q(sb.rpc('hr_leave_allowance_set', { p_ids: [r.id], p_action: 'payroll', p: { on: v.with_payroll } })); toast('Saved'); pcRefresh(); } }); }
      const u = e.target.closest('[data-unpaid]'); if (u) { await pcTry(() => q(sb.rpc('hr_leave_allowance_set', { p_ids: [+u.dataset.unpaid], p_action: 'unpaid', p: {} })), 'Moved back to due'); pcRefresh(); }
    });
  }
};

// ---------------------------------------------------------------- Settings: public holidays, leave plan, resumption, document formats
LV.pages.settings = { perms: ['view-leaves-settings-menu', 'add-public-holiday', 'manage-resumption-settings'],
  async load(rest, params) {
    const tab = this.tab = params.get?.('tab') || 'holidays';
    const tabs = pcTabs([['#/people/admin/leave/settings?tab=holidays', 'Public holidays'], ['#/people/admin/leave/settings?tab=plan', 'Leave plan'], ['#/people/admin/leave/settings?tab=resumption', 'Resumption'], ['#/people/admin/leave/settings?tab=formats', 'Document formats']], '#/people/admin/leave/settings?tab=' + tab);
    const head = topbar('Leave settings', '') + tabs; await Promise.all([pcLeaveTypes(), pcWorkflows()]);
    if (tab === 'holidays') {
      const hs = await q(sb.from('hr_holidays').select('*').order('day')); S.pc.hols = hs;
      const y = new Date().getFullYear(); const next = h => h.recurring ? `${y}-${h.day.slice(5)}` < localISO(0) ? `${y + 1}-${h.day.slice(5)}` : `${y}-${h.day.slice(5)}` : h.day;
      return head + pcTable('hols', [{ k: 'name', l: 'Holiday', f: h => `<b>${esc(h.name)}</b>` }, { l: 'Date', v: h => next(h), f: h => h.recurring ? `${new Date(h.day + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} <small class="muted">every year</small>` : fd(h.day) },
        { l: 'Recurring', v: h => pcYes(h.recurring) }, { l: 'Region', v: h => hrListName(h.region_id) || 'All' }, { l: '', cls: 'num', sort: false, csv: false, f: h => pcCan('edit-public-holiday') ? `<button class="btn small" data-h="${h.id}">Edit</button>` : '' }], hs,
        { noun: 'holiday', csv: 'Public holidays', sortBy: [1, 1], actions: pcCan('add-public-holiday') ? `<button class="btn small primary" data-h="new">${ico('plus')}Add holiday</button>` : '' }) +
        `<p class="muted">To tell staff about a holiday, publish an announcement.</p>`;
    }
    if (tab === 'plan') return head + `<section class="panel"><header><h2>Policies staff can plan</h2></header><div class="body"><form id="lsf">${pcForm([{ k: 'plannable', l: 'Plannable policies', t: 'checks', opts: PC_LTYPES.filter(t => t.active).map(t => [t.id, t.name]) }], { plannable: PC_LTYPES.filter(t => t.plannable).map(t => t.id) })}<button class="btn primary">Save</button></form></div></section>`;
    if (tab === 'resumption') { const f = await q(sb.from('hr_flows').select('*').eq('kind', 'resumption').maybeSingle());
      return head + `<section class="panel"><header><h2>Resumption</h2></header><div class="body"><form id="lsf">${pcForm([{ k: 'active', l: 'Send “I’m back” for approval', t: 'switch', hint: 'Off (GANKCO today): staff confirm and it’s recorded straight away. On: it follows the workflow below.' }, { k: 'workflow_id', l: 'Resumption workflow', t: 'select', opts: v => pcWfOpts(v, 'None') }], { active: f?.active, workflow_id: f?.workflow_id })}<button class="btn primary">Save</button></form></div></section>`; }
    const fm = hrSettings().leave_formats || { proof: 'pdf,jpg,png', handover: 'pdf,doc,docx' };
    return head + `<section class="panel"><header><h2>Document formats</h2></header><div class="body"><form id="lsf">${pcForm([{ k: 'proof', l: 'Proof of leave: allowed file types', ph: 'pdf,jpg,png' }, { k: 'handover', l: 'Handover note attachments: allowed file types', ph: 'pdf,doc,docx' }], fm)}<button class="btn primary">Save</button></form></div></section>`;
  },
  bind(main) {
    const tab = this.tab; const f = $('#lsf', main);
    if (tab === 'holidays') main.addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (!b) return; const h = b.dataset.h === 'new' ? { recurring: false } : S.pc.hols.find(x => x.id === +b.dataset.h);
      pcEdit({ title: h.id ? 'Edit holiday' : 'Add public holiday', wide: false, fields: [{ k: 'name', l: 'Name', req: true }, { k: 'day', l: 'Date', t: 'date', req: true }, { k: 'recurring', l: 'Every year on this date', t: 'switch' }, { k: 'region_id', l: 'Region', t: 'select', opts: v => pcListOpts('region', v, 'All regions') }], vals: h,
        onOpen: d => { if (h.id && pcCan('delete-public-holiday')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn danger'; x.textContent = 'Delete'; x.style.marginRight = 'auto'; x.onclick = async () => { await pcTry(() => q(sb.rpc('hr_holiday_delete', { p_id: h.id })), 'Deleted'); d.close(); d.remove(); pcRefresh(); }; $('.mf', d).prepend(x); } },
        save: async v => { await q(sb.rpc('hr_holiday_save', { p: { id: h.id || null, ...v } })); toast('Saved'); HR_HOL = null; pcRefresh(); } }); });
    if (!f) return;
    f.onsubmit = async e => { e.preventDefault();
      await pcTry(async () => {
        if (tab === 'plan') { const on = pcRead(f, [{ k: 'plannable', t: 'checks' }]).plannable; for (const t of PC_LTYPES.filter(t => t.active)) if (!!t.plannable !== on.includes(t.id)) await q(sb.rpc('hr_leave_policy_save', { p: { ...t, paid: t.paid, plannable: on.includes(t.id), grades: undefined } })); PC_LTYPES = null; }
        else if (tab === 'resumption') { const v = pcRead(f, [{ k: 'active', t: 'switch' }, { k: 'workflow_id' }]); await q(sb.rpc('hr_flow_use', { p_kind: 'resumption', p_workflow: v.workflow_id ? +v.workflow_id : null })); await q(sb.rpc('hr_flow_active', { p_kind: 'resumption', p_on: v.active })); }
        else { const v = pcRead(f, [{ k: 'proof' }, { k: 'handover' }]); await q(sb.rpc('hr_settings_save', { p: { leave_formats: v } })); S.settings.people = { ...(S.settings.people || {}), leave_formats: v }; }
      }, 'Saved');
    };
  }
};

// ---------------------------------------------------------------- Supervisor: team leave
PC_SUP.leave = {
  async load(rest, params) {
    const team = await q(sb.rpc('hr_sup_team')); const ids = new Set(team.map(t => t.id)); const y = pcYear(params);
    const rows = (await q(sb.from('hr_leave').select('*, hr_requests(status,current_step,steps)').gte('end_date', `${y}-01-01`).order('start_date', { ascending: false }))).filter(l => ids.has(l.employee_id));
    await pcLeaveTypes(); const cal = team.length ? await hrTeamCalendar(team, 2).catch(() => '') : '';
    return topbar('Team leave', 'Who is away, and leave for everyone in your team. Requests waiting for you are under Approvals.') + cal +
      pcTable('supl', [{ l: 'Name', v: r => pcName(r.employee_id), f: r => pcPerson(hrCard(r.employee_id) || { name: pcName(r.employee_id) }) }, { l: 'Leave', v: r => pcLType(r.type_id)?.name || '' }, { l: 'Dates', v: r => r.start_date, f: r => hrRange(r.start_date, r.end_date) },
        { l: 'Days', cls: 'num', v: r => +r.days }, { l: 'Status', v: r => r.hr_requests?.status, f: r => pcChip(...(PC_LST[r.hr_requests?.status] || ['muted', '—'])) + (r.hr_requests?.status === 'pending' ? `<br><small class="muted">with ${esc(r.hr_requests.steps?.[r.hr_requests.current_step]?.label || '')}</small>` : '') }], rows,
        { noun: 'request', csv: 'Team leave', filters: [{ k: 'st', l: 'Status', opts: Object.entries(PC_LST).map(([k, v]) => [k, v[1]]), test: (r, v) => r.hr_requests?.status === v }] });
  }
};

// ================================================================ staff: apply (requirements note, resumption date, preview)
async function hrApplyLeave(bal, typeId, plan, forStaff) {
  const me = hrMe(); let who = forStaff ? null : me?.id;
  const loadBal = async emp => q(sb.rpc('hr_leave_balances', { p_emp: emp, p_year: new Date().getFullYear() }));
  bal = bal || (who ? await loadBal(who) : []);
  const pick = list => list.filter(b => forStaff || (b.visible !== false && !b.why_not));
  const reqNote = b => { if (!b) return ''; const L = [];
    L.push(b.unlimited ? 'No set limit.' : `<b>${+b.left - +b.pending}</b> days available${+b.pending ? ` (${+b.pending} waiting)` : ''}.`);
    if (+b.min_notice_days) L.push(`Apply at least <b>${b.min_notice_days} days</b> before you start.`);
    if (b.reason_required) L.push('A reason is required.'); if (b.proof_required) L.push('Attach proof (letter, certificate or medical note).');
    if (b.handover) L.push('Write a handover note.'); if (b.relief_mode === 'required') L.push('Choose a relief officer' + (b.relief_scope === 'dept' ? ' from your department' : '') + '.');
    if (b.splittable === false) L.push('Taken in one go.'); if (b.weekends_count) L.push('Weekends and public holidays count.'); else L.push('Only work days count; weekends and public holidays don’t.');
    if (b.allowance) L.push('Your leave allowance becomes due when this is approved.'); if (b.description) L.push(esc(b.description));
    return `<div class="pc-before"><b>Before you apply</b><ul>${L.map(x => `<li>${x}</li>`).join('')}</ul></div>`; };
  const form = (b, v = {}) => `${forStaff ? pcField({ k: 'employee_id', l: 'Employee', t: 'select', req: true, opts: x => pcPeopleOpts(x, 'Choose…') }, v.employee_id) : ''}
    ${pcField({ k: 'type_id', l: 'Leave policy', t: 'select', req: true, opts: pick(bal).map(x => [x.type_id, x.name + (x.why_not ? ` (${x.why_not})` : '')]) }, b?.type_id)}
    <div id="lnote">${reqNote(b)}</div><div class="row2">${pcField({ k: 'start_date', l: 'Start date', t: 'date', req: true }, v.start_date)}${pcField({ k: 'resumption_date', l: 'Resumption date', t: 'date', req: true, hint: 'The day you’re back at work' }, v.resumption_date)}</div>
    <div id="ldyn">${dyn(b, v)}</div>`;
  const dyn = (b, v = {}) => !b ? '' : `${b.relief_mode !== 'disabled' ? pcField({ k: 'relief_id', l: 'Relief officer' + (b.relief_mode === 'required' ? '' : ' (optional)'), t: 'select', req: b.relief_mode === 'required', opts: x => pcPeopleOpts(x, 'None', who) }, v.relief_id) : ''}
    ${pcField({ k: 'reason', l: 'Reason' + (b.reason_required ? '' : ' (optional)'), t: 'textarea', req: b.reason_required, rows: 2 }, v.reason)}
    ${b.handover ? pcField({ k: 'handover_note', l: 'Handover note', t: 'textarea', req: true, rows: 3, hint: 'What’s in progress, who to contact, where things are' }, v.handover_note) : ''}
    ${b.proof_required || b.doc_after_days ? `<label class="f">Proof${b.proof_required ? ' <i class="req">*</i>' : ' (if longer than ' + b.doc_after_days + ' days)'}<input type="file" name="doc"></label>` : ''}
    ${b.allowance ? pcField({ k: 'request_allowance', l: 'Request my leave allowance with this leave', t: 'switch' }, v.request_allowance) : ''}`;
  let cur = bal.find(b => b.type_id === +typeId) || null; let preview = null; let vals = plan ? { start_date: plan.start_date } : {};
  return modal({ title: forStaff ? 'Apply for leave for staff' : 'Apply for leave', wide: true, submit: 'Preview',
    body: `<div id="lform">${form(cur, vals)}</div><div id="lprev" hidden></div>`,
    onOpen: d => {
      const box = $('#lform', d);
      box.addEventListener('change', async e => {
        if (e.target.name === 'employee_id') { who = +e.target.value || null; bal = who ? await loadBal(who) : []; cur = null; vals = pcRead(box, [{ k: 'employee_id' }]); box.innerHTML = form(cur, vals); return; }
        if (e.target.name === 'type_id') { cur = bal.find(b => b.type_id === +e.target.value) || null; $('#lnote', d).innerHTML = reqNote(cur); const keep = pcRead(box, [{ k: 'relief_id' }, { k: 'reason' }, { k: 'handover_note' }]); $('#ldyn', d).innerHTML = dyn(cur, keep); }
      });
    },
    onSubmit: async (_, d) => {
      const btn = $('button[type=submit]', d);
      const v = pcRead($('#lform', d), [{ k: 'employee_id' }, { k: 'type_id' }, { k: 'start_date' }, { k: 'resumption_date' }, { k: 'relief_id' }, { k: 'reason' }, { k: 'handover_note' }, { k: 'request_allowance', t: 'switch' }]);
      if (!preview) {
        if (!v.type_id) throw new Error('Choose the leave policy'); if (!v.start_date || !v.resumption_date) throw new Error('Choose the start and resumption dates');
        const pv = await q(sb.rpc('hr_leave_preview', { p: { ...v, employee_id: forStaff ? v.employee_id : null } })); if (!pv) throw new Error('Check the dates');
        if (!pv.days) throw new Error('Those dates have no leave days in them');
        preview = { v, file: $('[name=doc]', d)?.files?.[0] || null };
        $('#lform', d).hidden = true; $('#lprev', d).hidden = false; btn.textContent = 'Send for approval'; btn.disabled = false;
        $('#lprev', d).innerHTML = `<div class="pc-preview"><div class="pc-sec">Preview</div><dl class="kv"><dt>Leave</dt><dd>${esc(cur?.name || '')}</dd>${forStaff ? `<dt>Employee</dt><dd>${esc(pcName(v.employee_id))}</dd>` : ''}
          <dt>Dates</dt><dd>${hrRange(pv.start, pv.end)}</dd><dt>Days</dt><dd><b>${nDays(pv.days)}</b></dd><dt>Back at work</dt><dd>${fd(pv.resumption)}</dd>
          ${pv.left_before != null && !cur?.unlimited ? `<dt>Balance</dt><dd>${+pv.left_before} → <b>${+pv.left_after}</b> days</dd>` : ''}${v.relief_id ? `<dt>Relief officer</dt><dd>${esc(pcName(v.relief_id))}</dd>` : ''}
          ${v.reason ? `<dt>Reason</dt><dd>${esc(v.reason)}</dd>` : ''}<dt>Approval</dt><dd>${esc(pv.workflow || 'HR')}</dd></dl>
          ${pv.left_after < 0 ? '<div class="notice bad">That’s more than the days available.</div>' : ''}<button type="button" class="btn small" id="ledit">← Change something</button></div>`;
        $('#ledit', d).onclick = () => { preview = null; $('#lform', d).hidden = false; $('#lprev', d).hidden = true; btn.textContent = 'Preview'; };
        throw Object.assign(new Error(''), { quiet: true });
      }
      const document = preview.file ? await hrReadFile(preview.file) : null;
      await q(sb.rpc('hr_leave_apply', { p: { ...preview.v, employee_id: forStaff ? preview.v.employee_id : null, document } }));
      toast('Sent for approval'); hrInvalidate(); pcRefresh();
    } });
}

// staff leave page: "I'm back" and the allowance request
(() => { const old = hrLeavePage.bind; hrLeavePage.bind = function (main, parts, params) {
  old.call(this, main, parts, params);
  $$('[data-lback]', main).forEach(b => b.onclick = () => pcEdit({ title: 'Welcome back', sub: 'If you came back early, the days you didn’t use go back to your balance.', wide: false, fields: [{ k: 'date', l: 'The day you resumed', t: 'date', req: true }], vals: { date: localISO(0) },
    save: async v => { const r = await q(sb.rpc('hr_leave_resume', { p_leave: +b.dataset.lback, p_date: v.date })); toast(r === 'sent' ? 'Sent for approval' : 'Thanks, recorded'); render({ quiet: true }); } }));
  $$('[data-areq]', main).forEach(b => b.onclick = async () => { await pcTry(() => q(sb.rpc('hr_leave_allowance_request', { p_year: +b.dataset.areq })), 'Asked HR for your leave allowance'); render({ quiet: true }); });
}; })();
