/* GANKCO Nest 3.0.4 — PeopleCore Requisition: Expense, Overtime and Service (Admin, Supervisor, self service). */
'use strict';

const RQ = PC_MODS.req;
RQ.menu = [['', 'Overview', 'home'],
  ['expense', 'Expense requests', 'pay', ['manage-expense-requisitions', 'view-expense-requisition', 'view-requisitions']], ['expense-recalls', 'Expense recall requests', null, ['manage-expense-requisitions', 'view-requisitions']],
  ['expense-paid', 'Expense transactions', null, ['view-expense-requisitions-transactions', 'financial-control']], ['expense-policies', 'Expense policies', null, ['view-expense-requisition-policy', 'manage-expense-requisition-policies']],
  ['overtime', 'Overtime requests', 'clock', ['view-overtime-requisitions']], ['overtime-paid', 'Overtime transactions', null, ['view-overtime-transaction-records', 'financial-control']],
  ['overtime-policies', 'Overtime policies', null, ['view-overtime-requisition-policy', 'create-an-overtime-requisition-policy']],
  ['service', 'Service requests', 'kit', ['view-requisitions']], ['service-policies', 'Service policies', null, ['view-requisition-policies', 'add-requisition-policy']],
  ['raise', 'Raise a request', 'plus', ['raise-expense-request-for-employees', 'raise-service-request-for-employees']], ['settings', 'General settings', 'gear', ['manage-requisition-settings']]];
const PC_RQ_ST = { pending: ['pending', 'Pending'], approved: ['ok', 'Approved'], rejected: ['rejected', 'Declined'], cancelled: ['muted', 'Cancelled'], paid: ['out', 'Paid'], recalled: ['muted', 'Recalled'] };
const PC_RQ_KIND = { expense: 'Expense', overtime: 'Overtime', service: 'Service' };
const pcRqCfg = () => ({ overtime: { workdays: 22, day_hours: 8, hours_from: '09:00', hours_to: '17:00', rate_weekday: 1.5, rate_sat: 2, rate_sun: 2, rate_hol: 2, weekend_all_hours: true, days: [1, 2, 3, 4, 5, 6, 7] }, sla: {}, ...(hrSettings().req || {}) });
const pcAmt = r => r.amount == null ? (r.kind === 'overtime' ? '<span class="muted" title="Needs the person’s gross pay in their locked details">Not worked out</span>' : '—') : pcMoney(r.amount, r.currency);
async function pcRqPolicies(force) { if (force || !S.pc.rqp || Date.now() - S.pc.rqpAt > 30000) { S.pc.rqp = await q(sb.from('hr_req_policies').select('*').order('title')); S.pc.rqpAt = Date.now(); } return S.pc.rqp; }

// ---------------------------------------------------------------- Overview
RQ.pages[''] = {
  async load() {
    const o = await q(sb.rpc('hr_req_overview')); const sla = pcRqCfg().sla?.on;
    return topbar('Requisition', 'Expense, overtime and service requests: approvals, then payment.') +
      pcKpis([[o.pending, 'Waiting for approval', o.pending ? 'warn' : ''], [o.to_pay, 'Approved, not paid', o.to_pay ? 'warn' : '', '#/people/admin/req/overtime?st=approved'], [pcMoney(o.to_pay_amount), 'To pay'], [pcMoney(o.paid_month), 'Paid this month'], ...(sla ? [[o.late, 'Past SLA', o.late ? 'bad' : '']] : [])]) +
      `<div class="pc-grid2"><section class="panel"><header><h2>Requests per policy</h2></header>${pcBars(o.by_policy, { pct: true })}</section><section class="panel"><header><h2>By type</h2></header>${pcBars(o.by_kind, { pct: true })}</section></div>`;
  }
};

// ---------------------------------------------------------------- request lists (requests · recalls · transactions)
function pcRqList(kind, mode) {
  return { perms: RQ.menu.find(m => m[0] === kind + (mode === 'paid' ? '-paid' : mode === 'recalls' ? '-recalls' : ''))?.[3],
    async load(rest, params) {
      const all = await q(sb.rpc('hr_req_list', { p: { scope: 'admin', kind } })); await pcRqPolicies();
      const rows = mode === 'paid' ? all.filter(r => r.status === 'paid') : mode === 'recalls' ? all.filter(r => r.status === 'recalled') : all;
      S.pc.rq = rows; const st = params.get?.('st'); if (st) S.pc.tables['rq_' + kind + mode] = { f: { st } };
      const canPay = mode === 'requests' && pcCan('mark-requisition-as-paid', `mark-${kind}-requisition-as-paid`, 'financial-control') && kind !== 'service';
      const title = { requests: `${PC_RQ_KIND[kind]} requests`, paid: `${PC_RQ_KIND[kind]} transactions`, recalls: 'Expense recall requests' }[mode];
      const sub = { requests: kind === 'overtime' ? 'Worked out from gross monthly pay ÷ 176 hours × the rate for the day (1.5× weekdays, 2× weekends and public holidays).' : 'Approve through the workflow, then mark approved ones as paid.', paid: 'Paid requests (off-payroll until Payroll is live).', recalls: 'Requests taken back after approval, before payment.' }[mode];
      return topbar(title, sub, pcCan('raise-expense-request-for-employees', 'raise-service-request-for-employees') && mode === 'requests' ? `<a class="btn" href="#/people/admin/req/raise?kind=${kind}">${ico('plus')}Raise for staff</a>` : '') +
        pcTable('rq_' + kind + mode, [{ l: 'Name & ID', v: r => r.name, f: r => pcPerson(hrCard(r.employee_id) || { name: r.name }, esc(r.emp_no || '')) }, { k: 'policy', l: 'Policy' },
          ...(kind === 'overtime' ? [{ l: 'Hours', cls: 'num', v: r => +r.hours }] : []), ...(kind !== 'service' ? [{ l: 'Amount', cls: 'num', v: r => +r.amount || 0, csv: r => r.amount ?? '', f: pcAmt }] : []),
          ...(mode === 'paid' ? [{ l: 'Paid', v: r => r.paid_at, f: r => `${fd(r.paid_at)}<br><small class="muted">${esc(r.paid_by || '')}${r.paid_ref ? ' · ' + esc(r.paid_ref) : ''}</small>` }, { l: 'Payroll period', v: r => r.paid_mode, f: r => r.paid_mode === 'payroll' ? 'Payroll' : 'Off-payroll' }]
            : mode === 'recalls' ? [{ l: 'Recalled', v: r => r.recalled_at, f: r => fd(r.recalled_at) }, { k: 'recall_reason', l: 'Reason' }]
            : [{ l: 'Status', v: r => r.status, f: r => pcChip(...PC_RQ_ST[r.status]) + (r.step ? `<br><small class="muted">with ${esc(r.step)}</small>` : '') + (r.sla_late ? ' ' + pcChip('rejected', 'Past SLA') : '') }]),
          { l: 'Date raised', v: r => r.created_at, f: r => fd(r.created_at) + (r.raised_by ? `<br><small class="muted">by ${esc(r.raised_by)}</small>` : '') },
          { l: '', cls: 'num', sort: false, csv: false, f: r => `<button class="btn small" data-rq="${r.id}">View</button>` }], rows,
          { noun: 'request', csv: title, check: canPay, placeholder: 'Search name, staff ID or policy', search: r => [r.name, r.emp_no, r.policy, r.title].join(' '),
            filters: [...(mode === 'requests' ? [{ k: 'st', l: 'Status', opts: Object.entries(PC_RQ_ST).filter(([k]) => k !== 'recalled').map(([k, v]) => [k, v[1]]), test: (r, v) => r.status === v }] : []),
              { k: 'pol', l: 'Policy', opts: S.pc.rqp.filter(p => p.kind === kind).map(p => [p.id, p.title]), test: (r, v) => r.policy_id === +v },
              { k: 'd', l: 'Department', opts: hrUnitsOrdered().filter(u => u.tag === 'department').map(u => [u.id, u.name]), test: (r, v) => r.dept_id === +v }],
            actions: canPay ? `<button class="btn small primary" id="rqpay" disabled>Mark as paid</button>` : '',
            onSelect: s => { const b = $('#rqpay'); if (b) { b.disabled = !s.length; b.textContent = s.length ? `Mark ${s.length} as paid` : 'Mark as paid'; } } });
    },
    bind(main) {
      const pay = $('#rqpay', main); if (pay) pay.onclick = () => { const sel = pcSelected('rq_' + kind + mode);
        pcEdit({ title: `Mark ${plural(sel.length, 'request')} as paid`, sub: `Total ${pcMoney(sel.reduce((a, r) => a + (+r.amount || 0), 0))}`, wide: false, fields: [{ k: 'paid_on', l: 'Date paid', t: 'date', req: true }, { k: 'reference', l: 'Payment reference' }], vals: { paid_on: localISO(0) },
          save: async v => { await q(sb.rpc('hr_req_pay', { p_ids: sel.map(r => r.id), p: v })); toast('Marked as paid'); pcRefresh(); } }); };
      main.addEventListener('click', e => { const b = e.target.closest('[data-rq]'); if (b) pcRqView(S.pc.rq.find(r => r.id === +b.dataset.rq), 'admin'); });
    } };
}
['expense', 'overtime', 'service'].forEach(k => { RQ.pages[k] = pcRqList(k, 'requests'); if (k !== 'service') RQ.pages[k + '-paid'] = pcRqList(k, 'paid'); });
RQ.pages['expense-recalls'] = pcRqList('expense', 'recalls');

async function pcRqView(r, mode) {
  const d = r.details || {}; const own = r.employee_id === hrMe()?.id;
  const KIND = { weekday: 'Weekday', saturday: 'Saturday', sunday: 'Sunday', holiday: 'Public holiday' };
  const lines = d.lines ? `<div class="pc-sec">Overtime</div><table class="t"><thead><tr><th>Date</th><th>Time</th><th>Day</th><th class="num">Hours</th><th class="num">Rate</th>${r.amount != null ? '<th class="num">Amount</th>' : ''}</tr></thead><tbody>
    ${d.lines.map(l => `<tr><td>${fd(l.date)}</td><td>${esc(String(l.from).slice(0, 5))}–${esc(String(l.to).slice(0, 5))}</td><td>${KIND[l.kind] || l.kind}</td><td class="num">${+l.hours}</td><td class="num">${l.rate}×</td>${r.amount != null ? `<td class="num">${l.amount != null ? pcMoney(l.amount) : '—'}</td>` : ''}</tr>`).join('')}</tbody></table>` : '';
  const ans = d.answers ? `<div class="pc-sec">Details</div><dl class="kv">${Object.entries(d.answers).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
  const meta = d.meta && Object.keys(d.meta).length ? `<dl class="kv">${Object.entries(d.meta).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
  const steps = (r.steps || []).map((s, i) => `<li class="${s.state || 'waiting'}"><b>${esc(s.label)}</b>${s.names?.length ? ' · ' + esc(s.names.join(', ')) : ''} <small class="muted">${s.state === 'approved' ? 'approved' : s.state === 'rejected' ? 'declined' : ''}${s.by_name ? ' by ' + esc(s.by_name) : ''}${s.note ? ' · “' + esc(s.note) + '”' : ''}</small></li>`).join('');
  const acts = [];
  if (!r.paid_at && !r.recalled_at && ['pending', 'approved'].includes(r.request_status) && (own || pcCan('approve-expense-requisition-recall', 'financial-control'))) acts.push('<button type="button" class="btn" data-x="recall">Recall</button>');
  if (own && r.paid_at && !r.received_at) acts.push('<button type="button" class="btn primary" data-x="received">I’ve received it</button>');
  if (mode === 'admin' && d.type === 'advance' && r.paid_at && !r.reconciled_at && pcCan('confirm-expense-requisition-reconciliation')) acts.push('<button type="button" class="btn" data-x="reconciled">Advance retired</button>');
  if (mode === 'admin' && r.paid_at && pcCan('financial-control')) acts.push('<button type="button" class="btn" data-x="unpay">Undo paid</button>');
  await modal({ title: r.title, sub: `${PC_RQ_KIND[r.kind]} · raised ${fdt(r.created_at)}${r.raised_by ? ' by ' + esc(r.raised_by) : ''}`, wide: true, submit: null, cancel: 'Close',
    body: `<dl class="kv"><dt>Employee</dt><dd>${esc(r.name)}</dd><dt>Policy</dt><dd>${esc(r.policy)}</dd>${r.kind !== 'service' || r.amount != null ? `<dt>Amount</dt><dd>${pcAmt(r)}</dd>` : ''}${r.hours ? `<dt>Hours</dt><dd>${+r.hours}</dd>` : ''}
      <dt>Status</dt><dd>${pcChip(...PC_RQ_ST[r.status])}${r.paid_at ? ` ${fd(r.paid_at)}${r.paid_ref ? ' · ' + esc(r.paid_ref) : ''}` : ''}${r.received_at ? ' · received' : ''}</dd>${d.type ? `<dt>Type</dt><dd>${d.type === 'advance' ? 'Advance' : 'Reimbursement'}${r.reconciled_at ? ' · retired' : ''}</dd>` : ''}
      ${d.purpose ? `<dt>Purpose</dt><dd>${esc(d.purpose)}</dd>` : ''}${d.note ? `<dt>Note</dt><dd>${esc(d.note)}</dd>` : ''}${r.recall_reason ? `<dt>Recalled</dt><dd>${esc(r.recall_reason)}</dd>` : ''}
      ${r.document_id ? `<dt>Proof</dt><dd><button type="button" class="btn small" data-doc="${r.document_id}">${ico('down')}Download</button></dd>` : ''}</dl>${meta}${lines}${ans}
      ${steps ? `<div class="pc-sec">Approval</div><ol class="pc-steplist">${steps}</ol>` : ''}${acts.length ? `<div class="pc-acts" style="justify-content:flex-start;margin-top:12px">${acts.join('')}</div>` : ''}`,
    onOpen: (dl, close) => {
      const dc = $('[data-doc]', dl); if (dc) dc.onclick = async () => hrOpenFile(await q(sb.from('hr_documents').select('file_name,mime,data').eq('id', +dc.dataset.doc).single()));
      $$('[data-x]', dl).forEach(b => b.onclick = async () => { const x = b.dataset.x; close(null);
        if (x === 'recall') return pcEdit({ title: 'Recall this request?', wide: false, fields: [{ k: 'reason', l: 'Why', t: 'textarea', req: true }], submit: 'Recall', danger: true, save: async v => { await q(sb.rpc('hr_req_recall', { p_id: r.id, p_reason: v.reason })); toast('Recalled'); pcRefresh(); } });
        if (x === 'unpay') { await pcTry(() => q(sb.rpc('hr_req_unpay', { p_id: r.id })), 'Back to unpaid'); return pcRefresh(); }
        await pcTry(() => q(sb.rpc('hr_req_confirm', { p_id: r.id, p_what: x })), 'Thanks'); pcRefresh(); });
    } });
}

// ---------------------------------------------------------------- policies (3 steps: information, paygrades, departments)
function pcRqPolicyList(kind) {
  return { perms: RQ.menu.find(m => m[0] === kind + '-policies')[3],
    async load(rest) {
      const pols = (await pcRqPolicies(true)).filter(p => p.kind === kind); await pcWorkflows();
      if (rest[0]) return pcRqPolicyEditor(kind, rest[0] === 'new' ? null : pols.find(p => p.id === +rest[0]));
      return topbar(`${PC_RQ_KIND[kind]} policies`, kind === 'overtime' ? 'GANKCO’s overtime policies. Weekend and public holiday overtime are kept switched off, as in SeamlessHR.' : kind === 'expense' ? 'No expense policies yet: Finance/Admin add them here.' : 'Service requests with your own form fields. None yet.',
        `<a class="btn primary" href="#/people/admin/req/${kind}-policies/new">${ico('plus')}Create policy</a>`) +
        pcTable('rqp_' + kind, [{ k: 'title', l: 'Title', f: p => `<b>${esc(p.title)}</b><br><small class="muted">${esc(p.description || '')}</small>` }, { l: 'Status', v: p => p.active ? 'Active' : 'Deactivated', f: p => p.active ? pcChip('ok', 'Active') : pcChip('muted', 'Deactivated') },
          { l: 'Covers', v: p => ({ both: 'All staff', confirmed: 'Confirmed', unconfirmed: 'Unconfirmed' })[p.covers] }, { l: 'Workflow', v: p => S.pc.wfs.find(w => w.id === p.workflow_id)?.name || '—' },
          { l: '', cls: 'num', sort: false, csv: false, f: p => `<span class="pc-acts"><a class="btn small" href="#/people/admin/req/${kind}-policies/${p.id}">Edit</a><button class="btn small" data-ps="${p.active ? 'deactivate' : 'activate'}" data-id="${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button><button class="btn small" data-ps="duplicate" data-id="${p.id}">Duplicate</button><button class="btn small danger" data-ps="delete" data-id="${p.id}" aria-label="Delete">✕</button></span>` }], pols,
          { noun: 'policy', csv: PC_RQ_KIND[kind] + ' policies', empty: 'No policies yet.' });
    },
    bind(main, rest) {
      if (rest[0]) return pcBindRqPolicy(main, kind);
      main.addEventListener('click', async e => { const b = e.target.closest('[data-ps]'); if (!b) return; const a = b.dataset.ps;
        if (a === 'delete' && !await pcConfirm('Delete policy?', 'If it has requests, it’s deactivated instead.', 'Delete')) return;
        const r = await pcTry(() => q(sb.rpc('hr_req_policy_state', { p_id: +b.dataset.id, p_action: a })), a === 'delete' ? 'Done' : 'Saved'); S.pc.rqpAt = 0;
        if (a === 'duplicate') go(`#/people/admin/req/${kind}-policies/${r}`); else pcRefresh(); });
    } };
}
['expense', 'overtime', 'service'].forEach(k => RQ.pages[k + '-policies'] = pcRqPolicyList(k));
const PC_RQ_INFO = kind => [{ k: 'title', l: 'Title', req: true, hint: kind === 'overtime' ? 'Up to 40 characters' : '' }, { k: 'description', l: 'Description', t: 'textarea', rows: 2 },
  { k: 'covers', l: 'Who it covers', t: 'radio', opts: [['both', 'All staff'], ['confirmed', 'Confirmed'], ['unconfirmed', 'Unconfirmed']], def: 'both' }, { k: 'workflow_id', l: 'Approval workflow', t: 'select', req: true, opts: v => pcWfOpts(v) },
  { k: 'proof_required', l: 'Require proof', t: 'switch', hint: 'Receipt, timesheet or letter' }, { k: 'visible', l: 'Visible to all staff', t: 'switch', hint: 'Off: only HR can raise it for someone' },
  ...(kind === 'expense' ? [{ k: 'c.interval', l: 'Interval', t: 'select', blank: false, opts: [['none', 'None'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['biannual', 'Twice a year'], ['annual', 'Yearly'], ['oneoff', 'One-off']] },
    { k: 'c.see_balance', l: 'Employees see their balance', t: 'switch' }, { k: 'c.rollover', l: 'Unclaimed amount rolls over', t: 'switch' }, { k: 'c.multicurrency', l: 'Multicurrency', t: 'switch' },
    { k: 'c.currencies', l: 'Currencies (besides naira)', ph: 'USD, GBP', show: v => v['c.multicurrency'] }, { k: 'c.advance_upload', l: 'File upload on advance requests', t: 'switch' }, { k: 'c.confirm_receipt', l: 'Employee confirms receipt', t: 'switch' },
    { k: 'c.disbursement', l: 'Disbursement', t: 'radio', opts: [['none', 'None'], ['off_payroll', 'Off-payroll'], ['payroll', 'With payroll']], def: 'off_payroll' }, { k: 'c.reconcile_block', l: 'No new advance until the last one is retired', t: 'switch' }] : []),
  ...(kind === 'service' ? [{ k: 'c.attach_employees', l: 'Can attach other employees', t: 'switch' }, { k: 'c.signed_copy', l: 'Needs a signed copy / letter', t: 'switch' }] : [])];
function pcRqPolicyEditor(kind, p) {
  const v = p ? { ...p, ...Object.fromEntries(Object.entries(p.config || {}).map(([k, x]) => ['c.' + k, Array.isArray(x) ? x.join(', ') : x])) } : { covers: 'both', visible: true, workflow_id: S.pc.wfs.find(w => /requisition/i.test(w.name))?.id, 'c.interval': 'none', 'c.disbursement': 'off_payroll' };
  RQ.pol = { kind, p, v, fields: kind === 'service' ? [...(p?.config?.fields || [])] : [], meta: [...(p?.meta || [])] };
  const grades = pcLists('grade'); const depts = hrUnitsOrdered().filter(u => u.tag === 'department');
  return topbar(p ? esc(p.title) : `Create ${PC_RQ_KIND[kind].toLowerCase()} policy`, 'Information, then paygrades, then departments.', `<a class="btn" href="#/people/admin/req/${kind}-policies">Back</a><button class="btn primary" id="rpsave">Save policy</button>`) +
    `<nav class="pc-steps"><a href="#" class="on" data-st="1"><b>1</b>Information</a><a href="#" data-st="2"><b>2</b>Paygrades</a><a href="#" data-st="3"><b>3</b>Departments</a></nav>
    <form id="rpform" novalidate><div data-step="1"><section class="panel"><div class="body">${pcForm(PC_RQ_INFO(kind), v)}</div></section>
      ${kind === 'service' ? `<section class="panel"><header><h2>Form fields</h2><span class="meta">What staff fill in</span><span class="right"><button type="button" class="btn small" data-addf="fields">${ico('plus')}Field</button></span></header><div id="rpfields"></div></section>` : ''}
      <details class="panel pc-more-opts" ${RQ.pol.meta.length ? 'open' : ''}><summary>Metadata (optional)</summary><div class="body"><p class="muted">Extra questions on every request, e.g. “Project” or “Client”.</p><div id="rpmeta"></div><button type="button" class="btn small" data-addf="meta">${ico('plus')}Question</button></div></details></div>
    <section class="panel" data-step="2" hidden><header><h2>Paygrades</h2><span class="meta">Tick none for all paygrades${kind === 'expense' ? '; set the limit for each interval' : ''}</span></header><div class="tablewrap"><table class="t"><thead><tr><th>Paygrade</th><th>Eligible</th>${kind === 'expense' ? '<th>Limit (₦)</th>' : ''}</tr></thead><tbody>
      ${kind === 'expense' ? `<tr data-g="all"><td><b>Everyone else</b></td><td></td><td><input type="number" min="0" data-lim value="${p?.config?.limits?.all ?? ''}"></td></tr>` : ''}
      ${grades.map(g => `<tr data-g="${g.id}"><td>${esc(g.name)}</td><td><input type="checkbox" data-gr ${(p?.grades || []).includes(g.id) ? 'checked' : ''}></td>${kind === 'expense' ? `<td><input type="number" min="0" data-lim value="${p?.config?.limits?.[g.id] ?? ''}"></td>` : ''}</tr>`).join('')}</tbody></table></div></section>
    <section class="panel" data-step="3" hidden><header><h2>Departments</h2><span class="meta">Tick none for every department</span></header><div class="body"><div class="pc-checkgrid" style="max-height:none">${depts.map(u => `<label class="pc-ck"><input type="checkbox" data-un value="${u.id}" ${(p?.units || []).includes(u.id) ? 'checked' : ''}><span>${esc(u.name)}</span></label>`).join('')}</div></div></section>
    <div class="pc-stepnav"><button type="button" class="btn" id="rpprev" hidden>← Back</button><button type="button" class="btn primary" id="rpnext">Next →</button></div></form>`;
}
function pcBindRqPolicy(main, kind) {
  const P = RQ.pol; const f = $('#rpform', main); let step = 1;
  pcLiveShow(f, PC_RQ_INFO(kind), P.v, $('[data-step="1"] .pc-form', f));
  const T = [['text', 'Text'], ['textarea', 'Long text'], ['number', 'Number'], ['date', 'Date'], ['select', 'Choice']];
  const draw = () => {
    const fl = $('#rpfields', main); if (fl) fl.innerHTML = P.fields.length ? `<ol class="pc-wsteps">${P.fields.map((x, i) => `<li data-fi="${i}" data-set="fields"><span class="pc-wnum">${i + 1}</span><input data-k="label" value="${esc(x.label || '')}" placeholder="Label"><select data-k="type">${T.map(([a, b]) => opt(a, b, x.type || 'text')).join('')}</select><input data-k="options" value="${esc((x.options || []).join(', '))}" placeholder="Choices, comma separated" ${x.type === 'select' ? '' : 'hidden'}><span class="pc-wact"><label class="pc-ck"><input type="checkbox" data-k="required" ${x.required ? 'checked' : ''}><span>Required</span></label><button type="button" class="btn small danger" data-rmf>✕</button></span></li>`).join('')}</ol>` : '<div class="empty">No fields yet.</div>';
    $('#rpmeta', main).innerHTML = P.meta.map((x, i) => `<div class="pc-metarow" data-fi="${i}" data-set="meta"><input data-k="label" value="${esc(x.label || '')}" placeholder="Question"><label class="pc-ck"><input type="checkbox" data-k="required" ${x.required ? 'checked' : ''}><span>Required</span></label><button type="button" class="btn small danger" data-rmf>✕</button></div>`).join('');
  }; draw();
  f.addEventListener('input', e => { const row = e.target.closest('[data-fi]'); if (!row) return; const x = P[row.dataset.set][+row.dataset.fi]; const k = e.target.dataset.k;
    x[k] = k === 'required' ? e.target.checked : k === 'options' ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : e.target.value; if (k === 'type') draw(); });
  f.addEventListener('change', e => { if (e.target.dataset.k === 'type' || e.target.dataset.k === 'required') f.dispatchEvent(new Event('input')); });
  f.addEventListener('click', e => { const a = e.target.closest('[data-addf]'); if (a) { P[a.dataset.addf].push({ label: '', type: 'text', required: false }); draw(); }
    const r = e.target.closest('[data-rmf]'); if (r) { const row = r.closest('[data-fi]'); P[row.dataset.set].splice(+row.dataset.fi, 1); draw(); } });
  const show = n => { step = n; $$('[data-step]', f).forEach(s => s.hidden = +s.dataset.step !== n); $$('[data-st]', main).forEach(a => a.classList.toggle('on', +a.dataset.st === n)); $('#rpprev', main).hidden = n === 1; $('#rpnext', main).hidden = n === 3; };
  $$('[data-st]', main).forEach(a => a.onclick = e => { e.preventDefault(); show(+a.dataset.st); }); $('#rpnext', main).onclick = () => show(step + 1); $('#rpprev', main).onclick = () => show(step - 1);
  $('#rpsave', main).onclick = async () => {
    const v = pcRead($('[data-step="1"]', f), PC_RQ_INFO(kind));
    const config = {}; Object.entries(v).forEach(([k, x]) => { if (k.startsWith('c.')) config[k.slice(2)] = k === 'c.currencies' ? String(x || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : x; });
    if (kind === 'expense') config.limits = Object.fromEntries($$('[data-g]', f).map(tr => [tr.dataset.g, $('[data-lim]', tr)?.value]).filter(([, x]) => x !== '' && x != null).map(([k, x]) => [k, +x]));
    if (kind === 'service') config.fields = P.fields.filter(x => x.label);
    const p = { id: P.p?.id || null, kind, title: v.title, description: v.description, covers: v.covers, workflow_id: v.workflow_id, proof_required: v.proof_required, visible: v.visible, active: P.p ? P.p.active : true,
      grades: $$('[data-gr]', f).filter(c => c.checked).map(c => +c.closest('tr').dataset.g), units: $$('[data-un]', f).filter(c => c.checked).map(c => +c.value), meta: P.meta.filter(x => x.label), config };
    if (!p.title) { show(1); return toast('Enter the title', true); } if (!p.workflow_id) { show(1); return toast('Choose the approval workflow', true); }
    await pcTry(() => q(sb.rpc('hr_req_policy_save', { p })), 'Policy saved'); S.pc.rqpAt = 0; go(`#/people/admin/req/${kind}-policies`);
  };
}

// ---------------------------------------------------------------- raise on behalf / settings
RQ.pages.raise = { perms: ['raise-expense-request-for-employees', 'raise-service-request-for-employees'],
  async load(rest, params) {
    return topbar('Raise a request', 'Raise an expense, overtime or service request for someone. It follows the policy’s workflow as if they had raised it.') +
      `<section class="panel"><div class="body">${pcForm([{ k: 'employee_id', l: 'Employee', t: 'select', req: true, opts: v => pcPeopleOpts(v, 'Choose…') }], {})}<div id="rqbox" class="muted">Choose the employee first.</div></div></section>`;
  },
  bind(main, rest, params) {
    $('[name=employee_id]', main).onchange = async e => { const id = +e.target.value; if (!id) return; await pcRqForm($('#rqbox', main), id, params.get?.('kind')); };
  }
};
RQ.pages.settings = { perms: ['manage-requisition-settings'],
  async load(rest, params) {
    const tab = this.tab = params.get?.('tab') || 'overtime'; const c = pcRqCfg();
    const head = topbar('General settings', '') + pcTabs([['#/people/admin/req/settings?tab=overtime', 'Overtime requisition'], ['#/people/admin/req/settings?tab=sla', 'SLA compliance']], '#/people/admin/req/settings?tab=' + tab);
    if (tab === 'sla') return head + `<section class="panel"><div class="body"><form id="rsf">${pcForm([{ k: 'on', l: 'Track SLA compliance', t: 'switch', hint: 'Not in use at GANKCO: off.' }, { k: 'expense_minutes', l: 'Target for expense requests (minutes)', t: 'number', min: 1 }, { k: 'service_minutes', l: 'Target for service requests (minutes)', t: 'number', min: 1 },
      { k: 'show_employee', l: 'Employees see SLA metrics', t: 'switch' }, { k: 'show_supervisor', l: 'Supervisors and HODs see SLA metrics', t: 'switch' }], { expense_minutes: 60, service_minutes: 60, ...c.sla })}<button class="btn primary">Save</button></form></div></section>`;
    const o = c.overtime;
    return head + `<section class="panel"><header><h2>Overtime rule</h2><span class="meta">Hourly pay = gross monthly pay ÷ (work days × hours a day)</span></header><div class="body"><form id="rsf">${pcForm([
      { k: 'workdays', l: 'Monthly working days', t: 'select', blank: false, opts: [20, 21, 21.67, 22, 23, 24].map(x => [x, x]) }, { k: 'day_hours', l: 'Hours in a work day', t: 'number', min: 1, max: 24 },
      { k: 'hours_from', l: 'Weekday working hours from', t: 'time' }, { k: 'hours_to', l: 'to', t: 'time' }, { k: 'days', l: 'Days overtime is allowed', t: 'checks', opts: PC_DAYS },
      { k: 'rate_weekday', l: 'Rate Monday–Friday', t: 'select', blank: false, opts: [[1.5, '1.5×'], [2, '2.0×']] }, { k: 'rate_sat', l: 'Rate Saturday', t: 'select', blank: false, opts: [[1.5, '1.5×'], [2, '2.0×']] },
      { k: 'rate_sun', l: 'Rate Sunday', t: 'select', blank: false, opts: [[1.5, '1.5×'], [2, '2.0×']] }, { k: 'rate_hol', l: 'Rate public holiday', t: 'select', blank: false, opts: [[1.5, '1.5×'], [2, '2.0×']] },
      { k: 'weekend_all_hours', l: 'Every hour counts on Saturdays, Sundays and public holidays', t: 'switch', hint: 'GANKCO: on (12 am–12 am)' }], o)}
      <p class="muted">Example: ₦176,000 a month ÷ ${o.workdays * o.day_hours} = <b>${pcMoney(176000 / (o.workdays * o.day_hours))}</b> an hour. Three hours on a weekday evening = 3 × that × ${o.rate_weekday}.</p><button class="btn primary">Save</button></form></div></section>`;
  },
  bind(main) {
    const f = $('#rsf', main); f.onsubmit = async e => { e.preventDefault();
      const v = this.tab === 'sla' ? { sla: pcRead(f, [{ k: 'on', t: 'switch' }, { k: 'expense_minutes', t: 'number' }, { k: 'service_minutes', t: 'number' }, { k: 'show_employee', t: 'switch' }, { k: 'show_supervisor', t: 'switch' }]) }
        : { overtime: (x => ({ ...x, workdays: +x.workdays, rate_weekday: +x.rate_weekday, rate_sat: +x.rate_sat, rate_sun: +x.rate_sun, rate_hol: +x.rate_hol }))(pcRead(f, [{ k: 'workdays' }, { k: 'day_hours', t: 'number' }, { k: 'hours_from' }, { k: 'hours_to' }, { k: 'days', t: 'checks' }, { k: 'rate_weekday' }, { k: 'rate_sat' }, { k: 'rate_sun' }, { k: 'rate_hol' }, { k: 'weekend_all_hours', t: 'switch' }])) };
      await pcTry(() => q(sb.rpc('hr_req_settings_save', { p: v })), 'Saved'); S.settings.people = { ...(S.settings.people || {}), req: { ...pcRqCfg(), ...v } }; render({ quiet: true }); };
  }
};

// ---------------------------------------------------------------- the request form (self service and raise on behalf)
async function pcRqForm(box, emp, kindPick) {
  const opts = await q(sb.rpc('hr_req_options', { p_emp: emp === hrMe()?.id ? null : emp }));
  const kinds = ['overtime', 'expense', 'service'].filter(k => opts.some(o => o.kind === k));
  let kind = kindPick && kinds.includes(kindPick) ? kindPick : kinds[0];
  if (!kinds.length) { box.innerHTML = '<div class="empty">There are no requisition policies you can use yet.</div>'; return; }
  const draw = () => {
    const ps = opts.filter(o => o.kind === kind);
    box.innerHTML = `<div class="seg pc-kindseg">${kinds.map(k => `<button type="button" data-kind="${k}" class="${k === kind ? 'on' : ''}">${PC_RQ_KIND[k]}</button>`).join('')}</div>
      <form id="rqf" novalidate>${pcField({ k: 'policy_id', l: 'Policy', t: 'select', req: true, opts: ps.map(o => [o.id, o.title + (o.why_not ? ` (${o.why_not})` : '')]) }, ps.find(o => !o.why_not)?.id)}<div id="rqpol"></div>
      <div class="pc-acts" style="justify-content:flex-start;margin-top:12px"><button class="btn primary" type="submit">Send for approval</button></div></form>`;
    const f = $('#rqf', box); const sel = $('[name=policy_id]', f);
    const polForm = () => { const o = opts.find(x => x.id === +sel.value); const pb = $('#rqpol', f); if (!o) { pb.innerHTML = ''; return; }
      const meta = (o.meta || []).map(m => pcField({ k: 'm_' + m.label, l: m.label, req: m.required }, '')).join('');
      const bal = o.balance && o.balance.limit != null ? `<div class="pc-before">Limit ${pcMoney(o.balance.limit)}${o.balance.interval !== 'none' ? ' per ' + { monthly: 'month', quarterly: 'quarter', biannual: 'half year', annual: 'year', oneoff: 'once' }[o.balance.interval] : ''} · used ${pcMoney(o.balance.used)} · <b>${pcMoney(o.balance.left)} left</b></div>` : '';
      pb.innerHTML = (o.description ? `<p class="muted">${esc(o.description)}</p>` : '') + bal + (kind === 'overtime' ? `<div class="pc-sec">Days and times you worked</div><div id="otl"></div><button type="button" class="btn small" id="otadd">${ico('plus')}Add a day</button><div id="otsum" class="pc-otsum"></div>`
        : kind === 'expense' ? `<div class="pc-form">${pcField({ k: 'type', l: 'Type', t: 'radio', opts: [['reimbursement', 'Reimbursement'], ['advance', 'Advance']], def: 'reimbursement' })}${pcField({ k: 'amount', l: 'Amount', t: 'number', req: true, min: 0, step: 0.01 })}
            ${o.config?.multicurrency ? pcField({ k: 'currency', l: 'Currency', t: 'select', blank: false, opts: [['NGN', 'NGN'], ...(o.config.currencies || []).map(c => [c, c])] }) : ''}${pcField({ k: 'purpose', l: 'What it’s for', t: 'textarea', req: true })}</div>`
        : `<div class="pc-form">${(o.config?.fields || []).map(x => pcField({ k: 'a_' + x.label, l: x.label, t: x.type === 'select' ? 'select' : x.type, req: x.required, opts: (x.options || []).map(s => [s, s]) }, '')).join('')}
            ${o.config?.attach_employees ? pcField({ k: 'employees', l: 'Other employees involved', t: 'checks', opts: pcPeopleList(emp) }, []) : ''}</div>`) +
        `<div class="pc-form">${meta}${pcField({ k: 'note', l: 'Note', t: 'textarea', rows: 2 }, '')}</div><label class="f">Proof${o.proof_required ? ' <i class="req">*</i>' : ' (optional)'}<input type="file" name="doc"></label>`;
      if (kind === 'overtime') {
        const L = $('#otl', pb); const row = () => `<div class="pc-otrow"><input type="date" data-o="date" max="${localISO(0)}"><input type="time" data-o="from" value="17:00"><input type="time" data-o="to" value="20:00"><input data-o="note" placeholder="What you worked on"><button type="button" class="btn small danger" data-orm>✕</button></div>`;
        L.innerHTML = row(); const calc = debounce(async () => { const lines = $$('.pc-otrow', L).map(r => Object.fromEntries($$('[data-o]', r).map(i => [i.dataset.o, i.value]))).filter(l => l.date);
          if (!lines.length) { $('#otsum', pb).innerHTML = ''; return; } const c = await q(sb.rpc('hr_ot_preview', { p_emp: emp === hrMe()?.id ? null : emp, p_lines: lines })).catch(e => ({ error: niceError(e) }));
          if (c.error) { $('#otsum', pb).innerHTML = `<div class="notice bad">${esc(c.error)}</div>`; return; }
          $('#otsum', pb).innerHTML = `<table class="t"><tbody>${c.lines.map(l => `<tr><td>${fd(l.date)}</td><td>${({ weekday: 'Weekday', saturday: 'Saturday', sunday: 'Sunday', holiday: 'Public holiday' })[l.kind]}${l.note ? ` <small class="muted">${esc(l.note)}</small>` : ''}</td><td class="num">${+l.hours} h × ${l.rate}</td>${c.amount != null ? `<td class="num">${pcMoney(l.amount)}</td>` : ''}</tr>`).join('')}</tbody>
            <tfoot><tr><th>Total</th><th></th><th class="num">${+c.hours} h</th>${c.amount != null ? `<th class="num">${pcMoney(c.amount)}</th>` : ''}</tr></tfoot></table>${c.no_gross ? '<p class="muted">The amount is worked out once HR has your gross pay on record.</p>' : '<p class="muted">Weekdays count only the time outside 9:00–17:00.</p>'}`; }, 250);
        $('#otadd', pb).onclick = () => { L.insertAdjacentHTML('beforeend', row()); };
        L.addEventListener('input', calc); L.addEventListener('click', e => { if (e.target.closest('[data-orm]') && $$('.pc-otrow', L).length > 1) { e.target.closest('.pc-otrow').remove(); calc(); } });
      }
    };
    sel.onchange = polForm; polForm();
    $$('[data-kind]', box).forEach(b => b.onclick = () => { kind = b.dataset.kind; draw(); });
    f.onsubmit = async e => { e.preventDefault(); const o = opts.find(x => x.id === +sel.value); if (!o) return toast('Choose the policy', true);
      const all = {}; $$('[name]', f).forEach(i => { if (i.type === 'radio') { if (i.checked) all[i.name] = i.value; } else if (i.type !== 'file') all[i.name] = i.value; });
      const p = { policy_id: o.id, employee_id: emp === hrMe()?.id ? null : emp, note: all.note || null, meta_answers: Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('m_')).map(([k, v]) => [k.slice(2), v])) };
      if (kind === 'overtime') p.lines = $$('.pc-otrow', f).map(r => Object.fromEntries($$('[data-o]', r).map(i => [i.dataset.o, i.value]))).filter(l => l.date);
      if (kind === 'expense') Object.assign(p, { type: all.type, amount: all.amount, currency: all.currency || 'NGN', purpose: all.purpose });
      if (kind === 'service') Object.assign(p, { answers: Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('a_')).map(([k, v]) => [k.slice(2), v])), employees: $$('[data-ck="employees"]', f).filter(c => c.checked).map(c => +c.value) });
      const file = $('[name=doc]', f)?.files?.[0]; if (file) p.document = await hrReadFile(file);
      await pcTry(() => q(sb.rpc('hr_req_raise', { p })), 'Sent for approval'); pcRefresh(); };
  };
  draw();
}

// ---------------------------------------------------------------- self service: Work → Requisition
PC_SELF.requisition = {
  async load(rest, params) {
    const me = hrMe(); if (!me) return topbar('Requisition') + '<div class="notice">HR hasn’t added your PeopleCore record yet. Ask HR.</div>';
    const tab = this.tab = params.get?.('tab') || 'mine';
    const head = topbar('Requisition', 'Overtime, expense and service requests.') + pcTabs([['#/people/work/requisition', 'My requests'], ['#/people/work/requisition?tab=new', 'New request']], tab === 'new' ? '#/people/work/requisition?tab=new' : '#/people/work/requisition');
    if (tab === 'new') return head + `<section class="panel"><div class="body" id="rqbox"><div class="loading">Loading…</div></div></section>`;
    const rows = await q(sb.rpc('hr_req_list', { p: { scope: 'mine' } })); S.pc.rq = rows;
    return head + pcTable('rqmine', [{ k: 'policy', l: 'Policy', f: r => `<b>${esc(r.policy)}</b><br><small class="muted">${PC_RQ_KIND[r.kind]}</small>` }, { l: 'Amount / hours', v: r => +r.amount || +r.hours || 0, f: r => r.kind === 'overtime' ? `${+r.hours} h${r.amount != null ? ' · ' + pcMoney(r.amount) : ''}` : pcAmt(r) },
      { l: 'Status', v: r => r.status, f: r => pcChip(...PC_RQ_ST[r.status]) + (r.step ? `<br><small class="muted">with ${esc(r.step)}</small>` : '') }, { l: 'Raised', v: r => r.created_at, f: r => fd(r.created_at) },
      { l: '', cls: 'num', sort: false, csv: false, f: r => `<button class="btn small" data-rq="${r.id}">View</button>` }], rows, { noun: 'request', empty: 'No requests yet. Start a new one.', search: false,
        actions: `<a class="btn small primary" href="#/people/work/requisition?tab=new">${ico('plus')}New request</a>` });
  },
  bind(main) {
    if (this.tab === 'new') return pcRqForm($('#rqbox', main), hrMe().id);
    main.addEventListener('click', e => { const b = e.target.closest('[data-rq]'); if (b) pcRqView(S.pc.rq.find(r => r.id === +b.dataset.rq), 'self'); });
  }
};
PC_SUP.req = {
  async load() {
    const rows = await q(sb.rpc('hr_req_list', { p: { scope: 'team' } })); S.pc.rq = rows;
    return topbar('Team requisitions', 'Requests from your team. Those waiting for you are under Approvals.') +
      pcTable('rqteam', [{ l: 'Name', v: r => r.name, f: r => pcPerson(hrCard(r.employee_id) || { name: r.name }) }, { k: 'policy', l: 'Policy' }, { l: 'Hours / amount', v: r => +r.hours || +r.amount || 0, f: r => r.kind === 'overtime' ? `${+r.hours} h` : pcAmt(r) },
        { l: 'Status', v: r => r.status, f: r => pcChip(...PC_RQ_ST[r.status]) + (r.step ? `<br><small class="muted">with ${esc(r.step)}</small>` : '') }, { l: 'Raised', v: r => r.created_at, f: r => fd(r.created_at) },
        { l: '', cls: 'num', sort: false, csv: false, f: r => `<button class="btn small" data-rq="${r.id}">View</button>` }], rows, { noun: 'request', csv: 'Team requisitions' });
  },
  bind(main) { main.addEventListener('click', e => { const b = e.target.closest('[data-rq]'); if (b) pcRqView(S.pc.rq.find(r => r.id === +b.dataset.rq), 'sup'); }); }
};
