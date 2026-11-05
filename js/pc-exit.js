/* GANKCO Nest 3.0.4 — PeopleCore Exit: requests, activities (handover, interview, survey, return assets, clearance),
   settlement entered by hand, certificate of service. Admin, Supervisor and self service. */
'use strict';

const EX = PC_MODS.exit;
EX.menu = [['', 'Overview', 'home'], ['requests', 'Exit requests', 'out', ['view-exit-request']], ['contracts', 'Expiring contracts', 'clock', ['view-exit-request']],
  ['ongoing', 'Ongoing exits', 'plan', ['view-exit-activities']], ['history', 'Exit history', 'audit', ['view-exit-history']], ['activities', 'Exit activities', 'check', ['view-exit-activities', 'create-exit-activities']],
  ['certificate', 'Certificate of service', 'cert', ['view-exit-history']], ['policies', 'Exit policies', 'cert', ['view-exit-policies']], ['modes', 'Exit modes & reasons', 'grid', ['create-exit-modes', 'edit-exit-modes']],
  ['settings', 'Settings', 'gear', ['configure-exit-notifications', 'edit-exit-policies']]];
const PC_EX_ST = { pending: ['pending', 'Pending approval'], approved: ['out', 'Ongoing'], completed: ['muted', 'Exited'], declined: ['rejected', 'Declined'], cancelled: ['muted', 'Cancelled'], reinstated: ['ok', 'Reinstated'] };
const pcExCfg = () => hrSettings().exit || {};
const pcExRows = (id, rows, o = {}) => pcTable(id, [{ l: 'Name & ID', v: r => r.name, f: r => pcPerson(hrCard(r.employee_id) || { name: r.name }, esc(r.emp_no || '')) }, { l: 'Exit', v: r => r.mode || '', f: r => `<b>${esc(r.mode || r.policy || '')}</b><br><small class="muted">${esc([...(r.reasons || []), r.reason_text].filter(Boolean).join(', '))}</small>` },
  { l: 'Last working day', v: r => r.last_day, f: r => fd(r.last_day) + (r.status === 'approved' && hrDays(r.last_day) >= 0 ? `<br><small class="muted">in ${hrDays(r.last_day)} days</small>` : '') },
  { l: 'Activities', v: r => r.tasks ? r.tasks_done / r.tasks : -1, f: r => r.tasks ? `${r.tasks_done} of ${r.tasks}` : '—' }, { l: 'Status', v: r => r.status, f: r => pcChip(...PC_EX_ST[r.status]) + (r.step ? `<br><small class="muted">with ${esc(r.step)}</small>` : '') },
  { l: 'Raised', v: r => r.created_at, f: r => `${fd(r.created_at)}<br><small class="muted">${esc(r.by || '')}</small>` }], rows,
  { noun: 'exit', csv: o.csv || 'Exits', href: r => (o.base || '#/people/admin/exit/view/') + r.id, empty: o.empty || 'No exits.', filters: o.filters, actions: o.actions });

// ---------------------------------------------------------------- Overview and lists
EX.pages[''] = {
  async load() {
    const o = await q(sb.rpc('hr_exit_overview'));
    return topbar('Exit', 'Resignations, terminations and retirements: approvals, activities and the last day.', pcCan('start-the-exit-process-for-an-exiting-employee') ? `<button class="btn primary" id="exstart">${ico('plus')}Start an exit</button>` : '') +
      pcKpis([[o.pending, 'Waiting for approval', o.pending ? 'warn' : '', '#/people/admin/exit/requests'], [o.ongoing, 'Ongoing exits', '', '#/people/admin/exit/ongoing'], [o.exited_year, 'Left this year', '', '#/people/admin/exit/history'],
        [o.attrition + '%', 'Attrition this year'], [o.expiring, 'Contracts ending in 30 days', o.expiring ? 'warn' : '', '#/people/admin/exit/contracts']]) +
      `<div class="pc-grid2"><section class="panel"><header><h2>Exit requests by status</h2></header>${pcBars(o.by_status.map(s => ({ ...s, name: PC_EX_ST[s.name]?.[1] || s.name })), { pct: true })}</section><section class="panel"><header><h2>By exit mode</h2></header>${pcBars(o.by_mode, { pct: true })}</section></div>`;
  },
  bind(main) { const b = $('#exstart', main); if (b) b.onclick = () => pcExitStart(null); }
};
const pcExList = (title, sub, filter, o = {}) => ({ perms: o.perms,
  async load() {
    const rows = (await q(sb.rpc('hr_exit_list', { p_scope: 'admin' }))).filter(filter); S.pc.exits = rows;
    return topbar(title, sub, pcCan('start-the-exit-process-for-an-exiting-employee') && o.start ? `<button class="btn primary" id="exstart">${ico('plus')}Start an exit</button>` : '') +
      pcExRows('ex_' + title.replace(/\W/g, ''), rows, { csv: title, empty: o.empty, filters: [{ k: 'm', l: 'Exit mode', opts: pcLists('exit_mode').map(l => [l.name, l.name]), test: (r, v) => r.mode === v }, ...(o.filters || [])] });
  },
  bind(main) { const b = $('#exstart', main); if (b) b.onclick = () => pcExitStart(null); }
});
EX.pages.requests = pcExList('Exit requests', 'Approve or decline exits, change the last day, and start activities.', () => true,
  { start: true, perms: ['view-exit-request'], filters: [{ k: 's', l: 'Status', opts: Object.entries(PC_EX_ST).map(([k, v]) => [k, v[1]]), test: (r, v) => r.status === v }] });
EX.pages.ongoing = pcExList('Ongoing exits', 'Approved exits: activities in progress and scheduled last days.', r => r.status === 'approved', { perms: ['view-exit-activities'], empty: 'Nobody is leaving right now.' });
EX.pages.history = pcExList('Exit history', 'Exited and reinstated employees.', r => ['completed', 'reinstated'].includes(r.status), { perms: ['view-exit-history'], filters: [{ k: 's', l: 'Status', opts: [['completed', 'Exited'], ['reinstated', 'Reinstated']], test: (r, v) => r.status === v }] });
EX.pages.contracts = { perms: ['view-exit-request'],
  async load() {
    const rows = (await q(sb.rpc('hr_emp_list'))).filter(r => r.status === 'active' && r.end_date && hrDays(r.end_date) <= 31);
    return topbar('Expiring contracts', 'Contracts ending within a month. Extend them in HRIS, or start an End of contract exit.') +
      pcTable('excon', [{ k: 'name', l: 'Name & ID', f: r => pcPerson(r, esc(r.emp_no || '')) }, { l: 'Contract type', v: r => r.emp_type || '' }, { l: 'Ends', v: r => r.end_date, f: r => fd(r.end_date) + ` <small class="muted">${hrDays(r.end_date) < 0 ? 'ended' : 'in ' + hrDays(r.end_date) + ' days'}</small>` },
        { l: '', cls: 'num', sort: false, csv: false, f: r => `<span class="pc-acts">${pcCan('extend-contracts') ? `<button class="btn small" data-ext="${r.id}">Extend</button>` : ''}${pcCan('start-the-exit-process-for-an-exiting-employee') ? `<button class="btn small" data-exit="${r.id}">Start exit</button>` : ''}</span>` }], rows,
        { noun: 'contract', csv: 'Expiring contracts', empty: 'No contracts end in the next month.' });
  },
  bind(main) { main.addEventListener('click', e => { const x = e.target.closest('[data-ext]'); if (x) return pcContractForm([+x.dataset.ext], null, pcRefresh); const s = e.target.closest('[data-exit]'); if (s) pcExitStart(+s.dataset.exit); }); }
};

// ---------------------------------------------------------------- starting an exit (staff resign, HR starts one)
async function pcExitStart(empId, self) {
  const pickEmp = !self && !empId;
  const load = async emp => q(sb.rpc('hr_exit_options', { p_emp: self ? null : emp }));
  let opts = self || empId ? await load(empId) : [];
  if ((self || empId) && !opts.length) return toast(self ? 'There is no exit you can start yourself. Speak to HR.' : 'You can’t start an exit for this person', true);
  const cfg = pcExCfg(); const reasons = pcLists('exit_reason').map(l => [l.id, l.name]);
  const fields = () => [...(pickEmp ? [{ k: 'employee_id', l: 'Employee', t: 'select', req: true, opts: v => pcPeopleOpts(v, 'Choose…') }] : []),
    { k: 'policy_id', l: self ? 'Type of exit' : 'Exit policy', t: 'select', req: true, opts: opts.map(o => [o.id, `${o.title}${o.notice != null ? ` · ${o.notice} days’ notice` : ''}`]) },
    { k: 'reasons', l: cfg.one_reason ? 'Reason' : 'Reasons', t: 'checks', opts: reasons },
    ...(cfg.no_own_reason && self ? [] : [{ k: 'reason_text', l: 'Other reason / details', t: 'textarea', rows: 2 }]),
    { k: 'request_date', l: 'Date of notice', t: 'date', req: true }, { k: 'last_day', l: 'Last working day', t: 'date', hint: 'Empty: worked out from the notice period' },
    ...(cfg.letter !== 'upload' ? [{ k: 'letter', l: self ? 'Resignation letter' : 'Letter / note', t: 'textarea', rows: 5 }] : []), ...(cfg.letter !== 'text' ? [{ k: 'file', l: 'Upload a letter', t: 'file' }] : [])];
  return pcEdit({ title: self ? 'Resign' : 'Start an exit', sub: self ? 'Your request goes through the Exit workflow. HR will set up your handover and exit activities.' : '', fields: fields(), vals: { request_date: localISO(0), employee_id: empId },
    submit: self ? 'Send resignation' : 'Start exit',
    onOpen: d => { const s = $('[name=employee_id]', d); if (s) s.onchange = async () => { opts = s.value ? await load(+s.value) : []; $('[name=policy_id]', d).innerHTML = '<option value="">Choose…</option>' + opts.map(o => opt(o.id, `${o.title}${o.notice != null ? ` · ${o.notice} days’ notice` : ''}`)).join('');
      if (s.value && !opts.length) toast('No exit policy lets you start an exit for this person', true); };
      const pol = $('[name=policy_id]', d); pol.onchange = () => { const o = opts.find(x => x.id === +pol.value); const rd = $('[name=request_date]', d).value || localISO(0); if (o && o.notice != null) { const dd = new Date(rd + 'T00:00:00Z'); dd.setUTCDate(dd.getUTCDate() + +o.notice - (pcExCfg().count_request_day ? 1 : 0)); $('[name=last_day]', d).value = dd.toISOString().slice(0, 10); } }; },
    save: async (v, d) => { const f = $('[name=file]', d)?.files?.[0];
      const id = await q(sb.rpc('hr_exit_start', { p: { ...v, employee_id: self ? null : (v.employee_id || empId), document: f ? await hrReadFile(f) : null } }));
      toast(self ? 'Resignation sent' : 'Exit started'); pcInvalidate(); go(self ? '#/people/exit' : '#/people/admin/exit/view/' + id); } });
}

// ---------------------------------------------------------------- one exit
EX.pages.view = { perms: ['view-exit-request', 'view-exit-activities'],
  async load(rest) { return pcExitPage(+rest[0], 'admin'); },
  bind(main, rest) { pcBindExit(main, +rest[0], 'admin'); }
};
const PC_TK = { handover: 'Handover note', interview: 'Exit interview', survey: 'Exit survey', clearance: 'Clearance', assets: 'Return assets', custom: 'Activity' };
async function pcExitPage(id, mode) {
  const x = await q(sb.rpc('hr_exit_get', { p_id: id })); S.pc.exit = x; const admin = mode === 'admin';
  const st = (x.steps || []).map(s => `<li class="${s.state || 'waiting'}"><b>${esc(s.label)}</b>${s.names?.length ? ' · ' + esc(s.names.join(', ')) : ''} <small class="muted">${s.state === 'approved' ? 'approved' : s.state === 'rejected' ? 'declined' : ''}${s.by_name ? ' by ' + esc(s.by_name) : ''}${s.note ? ' · “' + esc(s.note) + '”' : ''}</small></li>`).join('');
  const task = t => { const done = ['done', 'approved'].includes(t.status);
    const extra = t.kind === 'clearance' ? `<div class="pc-signoffs">${(t.data.signoffs || []).map(s => `<span class="chip ${s.done ? 'ok' : 'muted'}">${esc(s.name)}${s.done ? ' ✓' : ''}</span>`).join(' ')}</div>`
      : t.kind === 'assets' ? `<small class="muted"> · ${plural((t.data.items || []).length, 'item')} out when it started</small>` : '';
    return `<li><span class="pc-tk ${done ? 'done' : ''}">${done ? '✓' : ''}</span><div class="main"><b>${esc(t.title)}</b><small>${esc(PC_TK[t.kind] || '')} · due ${pcDate(t.due_date)}${done ? ` · done by ${esc(t.completed_by_name || '')} ${t.completed_at ? fd(t.completed_at) : ''}` : ''}</small>${extra}</div>
      <button class="btn small ${!done && t.can ? 'primary' : ''}" data-task="${t.id}">${!done && (t.can || t.kind === 'clearance') ? 'Open' : 'View'}</button></li>`; };
  const s = x.settlement || {}; const pd = x.policy_detail || {};
  const acts = admin ? [x.status === 'approved' && !x.tasks.length && pcCan('create-exit-activities') && '<button class="btn" data-ex="start_activities">Start activities</button>',
    ['pending', 'approved'].includes(x.status) && pcCan('configure-for-employee') && '<button class="btn" data-ex="last_day">Change last day</button>',
    x.status === 'approved' && x.tasks.length > x.tasks_done && pcCan('mark-all-activities-as-completed-for-an-exiting-employee') && pcExCfg().admin_complete_all !== false && '<button class="btn" data-ex="complete_all">Mark all activities done</button>',
    x.status === 'approved' && pcCan('mark-an-employee-as-exited') && '<button class="btn primary" data-ex="complete">Mark as exited</button>',
    x.status === 'completed' && pcCan('mark-an-employee-as-exited') && '<button class="btn" data-ex="reinstate">Reinstate</button>',
    ['pending', 'approved'].includes(x.status) && pcCan('cancel-exit-request') && '<button class="btn danger" data-ex="cancel">Cancel exit</button>'].filter(Boolean)
    : mode === 'self' && ['pending', 'approved'].includes(x.status) && (x.status === 'pending' || pcExCfg().employee_cancel !== false) ? ['<button class="btn danger" data-ex="cancel">Withdraw resignation</button>'] : [];
  const back = admin ? '#/people/admin/exit/requests' : mode === 'sup' ? '#/people/sup/exit' : '#/people/exit';
  return topbar(esc(x.name), `${esc(x.mode || x.policy || 'Exit')} · last working day ${fd(x.last_day)}`, `<a class="btn" href="${back}">Back</a>`) +
    `<div class="pc-grid2"><section class="panel"><header><h2>Exit</h2><span class="right">${pcChip(...PC_EX_ST[x.status])}</span></header><dl class="pc-kv">
      <div><dt>Policy</dt><dd>${esc(x.policy || '—')}</dd></div><div><dt>Exit mode</dt><dd>${esc(x.mode || '—')}</dd></div><div><dt>Date of notice</dt><dd>${fd(x.request_date)}</dd></div>
      <div><dt>Notice</dt><dd>${x.notice_days != null ? x.notice_days + ' days' : '—'}</dd></div><div><dt>Last working day</dt><dd><b>${fd(x.last_day)}</b></dd></div><div><dt>Started by</dt><dd>${esc(x.by || '')} <small class="muted">(${esc(x.initiator)})</small></dd></div>
      <div style="grid-column:1/-1"><dt>Reasons</dt><dd>${esc([...(x.reasons || []), x.reason_text].filter(Boolean).join(' · ') || '—')}</dd></div>
      ${x.letter ? `<div style="grid-column:1/-1"><dt>Letter</dt><dd style="white-space:pre-wrap">${esc(x.letter)}</dd></div>` : ''}${x.letter_doc_id ? `<div><dt>Letter file</dt><dd><button class="btn small" data-doc="${x.letter_doc_id}">${ico('down')}Download</button></dd></div>` : ''}</dl>
      ${acts.length ? `<div class="body pc-acts" style="justify-content:flex-start;border-top:1px solid var(--line)">${acts.join('')}</div>` : ''}</section>
      <section class="panel"><header><h2>Approval</h2></header>${st ? `<ol class="pc-steplist" style="padding:10px 16px 10px 34px">${st}</ol>` : `<div class="empty">${x.status === 'pending' ? 'Waiting' : 'No approval needed (started by HR)'}</div>`}</section></div>
    <section class="panel"><header><h2>Exit activities</h2><span class="meta">${x.tasks.length ? `${x.tasks_done} of ${x.tasks.length} done` : 'They start when the exit is approved'}</span></header>${(x.tasks || []).length ? `<ul class="pc-items">${x.tasks.map(task).join('')}</ul>` : '<div class="empty">No activities yet.</div>'}</section>
    ${admin || (Object.keys(s).length && mode === 'self') ? `<section class="panel"><header><h2>Final settlement</h2><span class="meta">${s.by_hand ? 'Entered by hand' + (s.by ? ' · ' + esc(s.by) : '') : 'Not entered yet'}</span><span class="right">${admin && pcCan('create-exit-benefits', 'edit-exit-benefits') ? '<button class="btn small" data-ex="settlement">Enter amounts</button>' : ''}</span></header>
      <dl class="pc-kv">${[['Pay in lieu of notice', s.pay_in_lieu, pd.pay_in_lieu ? `${pd.pay_in_lieu_pct || 100}% of monthly gross${pd.prorated ? ', prorated' : ''}` : 'Not in this policy'], ['Leave encashment', s.leave_encash], ['Benefits', s.benefits], ['Deductions', s.deductions], ['Total', s.total]].map(([l, v, h]) => `<div><dt>${l}</dt><dd>${v != null && v !== '' ? pcMoney(v) : '<span class="muted">—</span>'}${h ? `<br><small class="muted">${esc(h)}</small>` : ''}</dd></div>`).join('')}
        ${s.note ? `<div style="grid-column:1/-1"><dt>Note</dt><dd>${esc(s.note)}</dd></div>` : ''}${s.paid_on ? `<div><dt>Paid on</dt><dd>${fd(s.paid_on)}</dd></div>` : ''}</dl>
      <div class="body muted" style="font-size:13px">When Payroll goes live, open exits get “Recalculate from payroll”; paid exits keep what was paid.</div></section>` : ''}
    ${admin && x.status === 'completed' && pd.certificate ? `<section class="panel"><header><h2>Certificate of service</h2><span class="right"><button class="btn small" data-ex="certificate">${ico('print')}${x.certificate_at ? 'Print again' : 'Print certificate'}</button></span></header><div class="body muted">${pcExCfg().certificate_on ? (x.certificate_at ? 'Issued ' + fd(x.certificate_at) : 'Not issued yet') : 'Switched off. Turn it on in Exit settings.'}</div></section>` : ''}`;
}
function pcBindExit(main, id, mode) {
  const x = S.pc.exit;
  main.addEventListener('click', async e => {
    const dc = e.target.closest('[data-doc]'); if (dc) return hrOpenFile(await q(sb.from('hr_documents').select('file_name,mime,data').eq('id', +dc.dataset.doc).single()));
    const tk = e.target.closest('[data-task]'); if (tk) return pcExitTask(x, x.tasks.find(t => t.id === +tk.dataset.task));
    const b = e.target.closest('[data-ex]'); if (!b) return; const a = b.dataset.ex;
    const run = async (p = {}, msg = 'Done') => { await pcTry(() => q(sb.rpc('hr_exit_admin', { p_id: id, p_action: a, p })), msg); pcRefresh(); };
    if (a === 'last_day') return pcEdit({ title: 'Change last working day', wide: false, fields: [{ k: 'last_day', l: 'Last working day', t: 'date', req: true }], vals: x, save: v => run(v, 'Saved') });
    if (a === 'cancel') { if (!await pcConfirm(mode === 'self' ? 'Withdraw your resignation?' : 'Cancel this exit?', 'The exit stops; activities are kept for the record.', 'Yes')) return; return run(); }
    if (a === 'complete') { const open = x.tasks_done < x.tasks.length; if (!await pcConfirm('Mark as exited?', `${esc(x.name)} leaves on ${fd(x.last_day)}. Their Nest sign-in is switched off after the last day.${open ? '<br><br><b>Some activities aren’t done yet.</b>' : ''}`, 'Mark as exited')) return; return run({ force: open }); }
    if (a === 'reinstate') { if (!await pcConfirm('Reinstate?', `${esc(x.name)} becomes active again and gets their Nest sign-in back.`, 'Reinstate', false)) return; return run({}, 'Reinstated'); }
    if (a === 'settlement') return pcEdit({ title: 'Final settlement', sub: 'Entered by hand until Payroll is live.', wide: false, fields: [{ k: 'pay_in_lieu', l: 'Pay in lieu of notice', t: 'money' }, { k: 'leave_encash', l: 'Leave encashment', t: 'money' }, { k: 'benefits', l: 'Benefits', t: 'money' }, { k: 'deductions', l: 'Deductions', t: 'money' }, { k: 'total', l: 'Total', t: 'money' }, { k: 'paid_on', l: 'Paid on', t: 'date' }, { k: 'note', l: 'Note', t: 'textarea' }],
      vals: x.settlement || {}, save: v => run(v, 'Saved') });
    if (a === 'certificate') { if (!pcExCfg().certificate_on) return toast('Switch the certificate on in Exit settings first', true); pcExitCertificate(x); return run({}, 'Recorded'); }
    run();
  });
}
function pcExitTask(x, t) {
  const done = ['done', 'approved'].includes(t.status); const ro = done || !t.can; const d = t.data || {};
  if (t.kind === 'clearance') return modal({ title: t.title, sub: 'Each department signs off that nothing is owed or outstanding.', submit: null, cancel: 'Close',
    body: `<ul class="pc-items">${(d.signoffs || []).map(s => `<li><div class="main"><b>${esc(s.name)}</b><small>${s.done ? `Signed off by ${esc(s.by || '')} ${s.at ? fd(s.at) : ''}${s.note ? ' · ' + esc(s.note) : ''}` : 'Waiting'}</small></div>${s.done ? pcChip('ok', 'Cleared') : `<button type="button" class="btn small primary" data-so="${esc(s.name)}">Sign off</button>`}</li>`).join('')}</ul>`,
    onOpen: (dl, close) => $$('[data-so]', dl).forEach(b => b.onclick = async () => { close(null); await pcEdit({ title: 'Sign off: ' + b.dataset.so, wide: false, fields: [{ k: 'note', l: 'Note (optional)' }], submit: 'Sign off', save: async v => { await q(sb.rpc('hr_exit_task_save', { p_task: t.id, p: { signoff: b.dataset.so, note: v.note } })); toast('Signed off'); pcRefresh(); } }); }) });
  if (t.kind === 'assets') { const items = (x.assets_now || d.items || []);
    return modal({ title: t.title, sub: 'Equipment from Inventory still out on their materials requests and job crews.', submit: ro ? null : 'Confirm all returned', cancel: 'Close',
      body: items.length ? `<table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th>Job</th><th>Out since</th></tr></thead><tbody>${items.map(i => `<tr><td><b>${esc(i.item)}</b><br><small class="muted">${esc(i.code || '')}</small></td><td class="num">${+i.qty}</td><td>${esc(i.job_no || '')} ${esc(i.job || '')}</td><td>${pcDate(i.out_at)}</td></tr>`).join('')}</tbody></table>${ro ? '' : '<p class="notice">Check these are back in Inventory before confirming.</p>'}<label class="f">Note<textarea name="note" rows="2"></textarea></label>`
        : '<p class="notice ok">Nothing is out with them in Inventory.</p><label class="f">Note<textarea name="note" rows="2"></textarea></label>',
      onSubmit: async v => { await q(sb.rpc('hr_exit_task_save', { p_task: t.id, p: { note: v.note } })); toast('Confirmed'); pcRefresh(); } }); }
  if (t.kind === 'interview' || t.kind === 'survey') {
    const qs = d.questions || []; const a = d.answers || {};
    const field = (qq, i) => qq.t === 'rating' ? `<fieldset class="f pc-radio"><legend>${esc(qq.q)}</legend><div class="seg">${[1, 2, 3, 4, 5].map(n => `<label class="segi"><input type="radio" name="q${i}" value="${n}" ${+a[qq.q] === n ? 'checked' : ''} ${ro ? 'disabled' : ''}><span>${n}</span></label>`).join('')}</div><small class="pc-hint">1 poor · 5 excellent</small></fieldset>`
      : qq.t === 'yesno' ? `<fieldset class="f pc-radio"><legend>${esc(qq.q)}</legend><div class="seg">${['Yes', 'No', 'Not sure'].map(n => `<label class="segi"><input type="radio" name="q${i}" value="${n}" ${a[qq.q] === n ? 'checked' : ''} ${ro ? 'disabled' : ''}><span>${n}</span></label>`).join('')}</div></fieldset>`
      : `<label class="f">${esc(qq.q)}<textarea name="q${i}" rows="2" ${ro ? 'disabled' : ''}>${esc(a[qq.q] || '')}</textarea></label>`;
    return modal({ title: t.title, wide: true, submit: ro ? null : 'Submit', cancel: 'Close', body: qs.map(field).join(''),
      onSubmit: async (_, dl) => { const ans = {}; qs.forEach((qq, i) => { const el = $(`[name=q${i}]:checked`, dl) || $(`textarea[name=q${i}]`, dl); ans[qq.q] = el ? el.value : ''; });
        await q(sb.rpc('hr_exit_task_save', { p_task: t.id, p: { answers: ans } })); toast('Thank you'); pcRefresh(); } });
  }
  return pcEdit({ title: t.title, sub: t.kind === 'handover' ? 'What’s in progress, who to contact, where things are. Type it or attach a document.' : '', submit: ro ? null : 'Mark done',
    fields: [{ k: 'text', l: t.kind === 'handover' ? 'Handover note' : 'Note', t: 'textarea', rows: 8, dis: ro }, ...(ro ? [] : [{ k: 'file', l: 'Attach a file', t: 'file' }])], vals: { text: d.text },
    save: async (v, dl) => { const f = $('[name=file]', dl)?.files?.[0]; await q(sb.rpc('hr_exit_task_save', { p_task: t.id, p: { text: v.text, document: f ? await hrReadFile(f) : null } })); toast('Done'); pcRefresh(); } });
}
function pcExitCertificate(x) {
  const c = x.card || {}; const tpl = pcExCfg().certificate_text || '';
  const txt = tpl.replace(/\{(\w+)\}/g, (_, k) => ({ name: x.name, first_name: (x.name || '').split(' ')[0], company: CFG.COMPANY || 'GANKCO Energy Services Limited', job_role: c.title || '', department: hrUnit(c.dept_id)?.name || c.unit || '',
    start_date: c.start_date ? fd(c.start_date) : '', last_day: fd(x.last_day), staff_id: x.emp_no || '' })[k] ?? '');
  const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print the certificate', true);
  w.document.write(`<!doctype html><title>Certificate of service · ${esc(x.name)}</title><style>body{font-family:Georgia,serif;max-width:700px;margin:60px auto;color:#1C1D20;line-height:1.7}h1{font-family:Montserrat,Arial,sans-serif;letter-spacing:1px;text-align:center;margin:30px 0}.logo{text-align:center}.sig{margin-top:70px}.sig div{border-top:1px solid #333;width:240px;padding-top:6px}</style>
    <div class="logo"><img src="${location.origin}${location.pathname.replace(/[^/]*$/, '')}brand/logo-full.png" style="height:60px" onerror="this.remove()"></div><h1>CERTIFICATE OF SERVICE</h1><p>${fd(localISO(0))}</p>${esc(txt).split(/\n/).map(l => `<p>${l}</p>`).join('')}
    <div class="sig"><div>Head of HR<br>${esc(CFG.COMPANY || 'GANKCO')}</div></div><script>setTimeout(()=>print(),400)<\/script>`);
  w.document.close();
}

// ---------------------------------------------------------------- setup pages
EX.pages.activities = { perms: ['view-exit-activities', 'create-exit-activities'],
  async load() {
    const defs = await q(sb.from('hr_exit_activity_defs').select('*').order('sort')); S.pc.exdefs = defs;
    const O = { employee: 'The employee', line_manager: 'Line manager', hr: 'HR', role: 'An admin role' };
    return topbar('Exit activities', 'What happens before someone leaves. Each starts when the exit is approved and is due a set number of days before the last day.') +
      pcTable('exdefs', [{ k: 'title', l: 'Activity', f: r => `<b>${esc(r.title)}</b>${r.active ? '' : ' ' + pcChip('muted', 'Off')}<br><small class="muted">${esc(r.description || '')}</small>` }, { l: 'Type', v: r => PC_TK[r.kind] }, { l: 'Due', v: r => r.days_before, f: r => r.days_before ? `${r.days_before} days before the last day` : 'On the last day' },
        { l: 'Done by', v: r => O[r.owner], f: r => esc(O[r.owner]) + (r.owner === 'role' ? ` <small class="muted">${esc(S.pc.look.roles.find(x => x.id === r.role_id)?.name || '')}</small>` : '') }, { l: 'Exit modes', v: r => r.modes.length ? r.modes.map(hrListName).join(', ') : 'All', f: r => r.modes.length ? r.modes.map(m => esc(hrListName(m))).join(', ') : 'All' },
        { l: '', cls: 'num', sort: false, csv: false, f: r => pcCan('edit-exit-activities') ? `<button class="btn small" data-d="${r.id}">Edit</button>` : '' }], defs,
        { noun: 'activity', actions: pcCan('create-exit-activities') ? `<button class="btn small primary" data-d="new">${ico('plus')}Add activity</button>` : '' });
  },
  bind(main) {
    main.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; const r = b.dataset.d === 'new' ? { kind: 'custom', owner: 'employee', days_before: 7, active: true, modes: [], config: {} } : S.pc.exdefs.find(x => x.id === +b.dataset.d);
      const qtext = (r.config?.questions || []).map(qq => `${qq.t === 'rating' ? '[1-5] ' : qq.t === 'yesno' ? '[yes/no] ' : ''}${qq.q}`).join('\n');
      const signs = (r.config?.signoffs || []).map(s => s.name).join(', ');
      pcEdit({ title: r.id ? 'Edit activity' : 'Add activity', fields: [{ k: 'title', l: 'Title', req: true }, { k: 'kind', l: 'Type', t: 'select', blank: false, opts: Object.entries(PC_TK), dis: !!r.id }, { k: 'description', l: 'Description', t: 'textarea', rows: 2 },
        { k: 'days_before', l: 'Due (days before the last day)', t: 'number', min: 0 }, { k: 'owner', l: 'Done by', t: 'select', blank: false, opts: [['employee', 'The employee'], ['line_manager', 'Line manager'], ['hr', 'HR'], ['role', 'An admin role']] },
        { k: 'role_id', l: 'Admin role', t: 'select', opts: v => '<option value="">Choose…</option>' + S.pc.look.roles.map(x => opt(x.id, x.name, v)).join(''), show: v => v.owner === 'role' },
        { k: 'modes', l: 'Exit modes (none ticked: all)', t: 'checks', opts: pcLists('exit_mode').map(l => [l.id, l.name]) },
        { k: 'questions', l: 'Questions (one per line; start with [1-5] for a rating or [yes/no])', t: 'textarea', rows: 8, show: v => ['interview', 'survey'].includes(v.kind || r.kind) },
        { k: 'signoffs', l: 'Sign-offs (comma separated)', ph: 'IT, Finance, Admin, HR', show: v => (v.kind || r.kind) === 'clearance' }, { k: 'active', l: 'In use', t: 'switch' }], vals: { ...r, questions: qtext, signoffs: signs },
        onOpen: d => { if (r.id && pcCan('delete-exit-activities')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn danger'; x.textContent = 'Delete'; x.style.marginRight = 'auto'; x.onclick = async () => { await pcTry(() => q(sb.rpc('hr_exit_activity_delete', { p_id: r.id })), 'Deleted'); d.close(); d.remove(); pcRefresh(); }; $('.mf', d).prepend(x); } },
        save: async v => { const kind = r.id ? r.kind : v.kind; const config = { ...(r.config || {}) };
          if (['interview', 'survey'].includes(kind)) config.questions = String(v.questions || '').split('\n').map(s => s.trim()).filter(Boolean).map(s => s.startsWith('[1-5]') ? { q: s.slice(5).trim(), t: 'rating' } : s.toLowerCase().startsWith('[yes/no]') ? { q: s.slice(8).trim(), t: 'yesno' } : { q: s, t: 'text' });
          if (kind === 'clearance') config.signoffs = String(v.signoffs || '').split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name, ...((r.config?.signoffs || []).find(x => x.name === name)?.role_id ? { role_id: r.config.signoffs.find(x => x.name === name).role_id } : {}) }));
          await q(sb.rpc('hr_exit_activity_save', { p: { id: r.id || null, ...v, kind, config, questions: undefined, signoffs: undefined } })); toast('Saved'); pcRefresh(); } }); });
  }
};
EX.pages.policies = { perms: ['view-exit-policies'],
  async load(rest) {
    const pols = await q(sb.from('hr_exit_policies').select('*').order('title')); await pcWorkflows(); S.pc.expols = pols;
    const W = i => i.who === 'role' ? (S.pc.look.roles.find(r => r.id === +i.role_id)?.name || 'Admin role') : { employee: 'Exiting employee', line_manager: 'Line manager', hod: 'H.O.D' }[i.who];
    return topbar('Exit policies', 'Who can start each kind of exit, the notice period and what is paid.') +
      pcTable('expol', [{ k: 'title', l: 'Policy', f: p => `<b>${esc(p.title)}</b>${p.active ? '' : ' ' + pcChip('muted', 'Off')}<br><small class="muted">${esc(p.description || '')}</small>` }, { l: 'Exit mode', v: p => hrListName(p.mode_id) },
        { l: 'Started by', v: p => p.initiators.map(W).join(', '), f: p => p.initiators.map(i => `<span class="chip muted">${esc(W(i))}${i.bypass ? ' · no approval' : ''}</span>`).join(' ') },
        { l: 'Notice', v: p => p.notice_confirmed ?? '', f: p => p.retire_age ? `Age ${p.retire_age} or ${p.retire_years} years’ service` : `${p.notice_confirmed ?? 0} days confirmed · ${p.notice_unconfirmed ?? p.notice_confirmed ?? 0} unconfirmed` },
        { l: 'Pay in lieu', v: p => p.pay_in_lieu ? p.pay_in_lieu_pct + '%' : 'No' }, { l: '', cls: 'num', sort: false, csv: false, f: p => pcCan('edit-exit-policies') ? `<button class="btn small" data-p="${p.id}">Edit</button>` : '' }], pols,
        { noun: 'policy', actions: pcCan('create-exit-policies') ? `<button class="btn small primary" data-p="new">${ico('plus')}Create policy</button>` : '' });
  },
  bind(main) {
    main.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; const p = b.dataset.p === 'new' ? { target: 'both', initiators: [], pay_groups: [], active: true } : S.pc.expols.find(x => x.id === +b.dataset.p);
      const ini = p.initiators || []; const has = w => ini.find(i => i.who === w);
      const roles = S.pc.look.roles; const roleIni = ini.filter(i => i.who === 'role').map(i => +i.role_id);
      pcEdit({ title: p.id ? 'Edit exit policy' : 'Create exit policy', fields: [{ k: 'title', l: 'Title', req: true }, { k: 'mode_id', l: 'Exit mode', t: 'select', opts: v => pcListOpts('exit_mode', v, 'Choose…') }, { k: 'description', l: 'Description', t: 'textarea', rows: 2 },
        { k: 'target', l: 'For', t: 'radio', opts: [['both', 'All staff'], ['confirmed', 'Confirmed'], ['unconfirmed', 'Unconfirmed']], def: 'both' },
        { k: 'i_employee', l: 'The exiting employee can start it', t: 'switch' }, { k: 'i_line_manager', l: 'Their line manager can start it', t: 'switch' }, { k: 'i_hod', l: 'Their H.O.D can start it', t: 'switch' },
        { k: 'i_roles', l: 'Admin roles that can start it', t: 'checks', opts: roles.map(r => [r.id, r.name]) }, { k: 'workflow_id', l: 'Approval workflow', t: 'select', opts: v => pcWfOpts(v) },
        { k: 'bypass_admin', l: 'No approval when an admin role starts it', t: 'switch' },
        { k: 'notice_confirmed', l: 'Notice for confirmed staff (days)', t: 'number', min: 0 }, { k: 'notice_unconfirmed', l: 'Notice for unconfirmed staff (days)', t: 'number', min: 0 },
        { k: 'pay_in_lieu', l: 'Payment in lieu of notice', t: 'switch' }, { k: 'pay_in_lieu_pct', l: 'Of monthly gross (%)', t: 'number', min: 0, max: 100, show: v => v.pay_in_lieu }, { k: 'prorated', l: 'Prorated', t: 'switch', show: v => v.pay_in_lieu },
        { k: 'leave_encash', l: 'Leave encashment', t: 'switch' }, { k: 'offset_leave', l: 'Offset notice with leave balance', t: 'switch' }, { k: 'certificate', l: 'Certificate of service', t: 'switch' },
        { k: 'retire_age', l: 'Retirement age', t: 'number', min: 40 }, { k: 'retire_years', l: 'Or years of service', t: 'number', min: 1 }, { k: 'retire_remind_months', l: 'Remind this many months before', t: 'number', min: 1 },
        { k: 'pay_groups', l: 'Pay groups (none ticked: all)', t: 'checks', opts: pcLists('pay_group').map(l => [l.id, l.name]) }, { k: 'active', l: 'In use', t: 'switch' }],
        vals: { ...p, i_employee: !!has('employee'), i_line_manager: !!has('line_manager'), i_hod: !!has('hod'), i_roles: roleIni, workflow_id: p.workflow_id || ini[0]?.workflow_id, bypass_admin: ini.some(i => i.who === 'role' && i.bypass) },
        onOpen: d => { if (p.id && pcCan('delete-exit-policies')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn danger'; x.textContent = 'Delete'; x.style.marginRight = 'auto'; x.onclick = async () => { const r = await pcTry(() => q(sb.rpc('hr_exit_policy_delete', { p_id: p.id }))); toast(r === 'deleted' ? 'Deleted' : 'Used by exits, so switched off'); d.close(); d.remove(); pcRefresh(); }; $('.mf', d).prepend(x); } },
        save: async v => { const wf = v.workflow_id ? +v.workflow_id : null;
          const initiators = [...['employee', 'line_manager', 'hod'].filter(w => v['i_' + w]).map(w => ({ who: w, workflow_id: wf, bypass: false })), ...(v.i_roles || []).map(r => ({ who: 'role', role_id: +r, workflow_id: wf, bypass: !!v.bypass_admin }))];
          await q(sb.rpc('hr_exit_policy_save', { p: { id: p.id || null, ...v, initiators } })); toast('Saved'); pcRefresh(); } }); });
  }
};
EX.pages.modes = { perms: ['create-exit-modes', 'edit-exit-modes'],
  async load(rest, params) {
    const tab = this.tab = params.get?.('tab') || 'modes';
    const cfg = { kind: tab === 'reasons' ? 'exit_reason' : 'exit_mode', title: tab === 'reasons' ? 'Exit reasons' : 'Exit modes', noun: tab === 'reasons' ? 'reason' : 'exit mode', perm: { add: ['create-exit-modes'], edit: ['edit-exit-modes'], del: ['delete-exit-modes'] } };
    this.cfg = cfg;
    return topbar('Exit modes & reasons', '') + pcTabs([['#/people/admin/exit/modes', 'Exit modes'], ['#/people/admin/exit/modes?tab=reasons', 'Exit reasons']], tab === 'reasons' ? '#/people/admin/exit/modes?tab=reasons' : '#/people/admin/exit/modes') + await pcListPage(cfg).load();
  },
  bind(main) { pcListPage(this.cfg).bind(main); }
};
EX.pages.certificate = { perms: ['view-exit-history'],
  async load() {
    const rows = (await q(sb.rpc('hr_exit_list', { p_scope: 'admin' }))).filter(r => r.certificate_at); S.pc.exits = rows;
    return topbar('Certificate of service', pcExCfg().certificate_on ? 'Certificates printed so far. Print one from the exit’s page.' : 'Switched off. HR can switch it on and edit the wording in Exit settings.') +
      pcExRows('excert', rows, { csv: 'Certificates', empty: 'No certificates yet.' });
  }
};
EX.pages.settings = { perms: ['configure-exit-notifications', 'edit-exit-policies'],
  async load(rest, params) {
    const tab = this.tab = params.get?.('tab') || 'general'; const c = pcExCfg();
    const head = topbar('Exit settings', '') + pcTabs([['#/people/admin/exit/settings', 'General'], ['#/people/admin/exit/settings?tab=notify', 'Notifications'], ['#/people/admin/exit/settings?tab=certificate', 'Certificate of service']], tab === 'general' ? '#/people/admin/exit/settings' : '#/people/admin/exit/settings?tab=' + tab);
    const F = this.F = tab === 'notify' ? ['raised', 'approved', 'activity', 'last_day'].map(k => ({ k, l: { raised: 'When an exit is raised, tell', approved: 'When it’s approved, tell', activity: 'When an activity is done, tell', last_day: 'On the last day, tell' }[k], t: 'checks', opts: [['employee', 'The employee'], ['line_manager', 'Line manager'], ['hr', 'HR (exit admins)']] }))
      : tab === 'certificate' ? [{ k: 'certificate_on', l: 'Use the certificate of service', t: 'switch', hint: 'Off until HR switches it on.' }, { k: 'certificate_text', l: 'Wording', t: 'textarea', rows: 8, hint: 'You can use {name}, {first_name}, {job_role}, {department}, {start_date}, {last_day}, {staff_id}, {company}.' }]
      : [{ k: 'exit_on_last_day', l: 'Exit employees on their last working day', t: 'switch' }, { k: 'count_request_day', l: 'Count the request day in the notice period', t: 'switch' }, { k: 'admin_complete_all', l: 'Admins can mark all activities done', t: 'switch' },
        { k: 'start_on_approve', l: 'Start activities when the exit is approved', t: 'switch' }, { k: 'start_on_raise', l: 'Start activities as soon as it’s raised', t: 'switch' }, { k: 'employee_cancel', l: 'Employees can cancel an approved exit', t: 'switch' },
        { k: 'hide_settlement', l: 'Hide the final settlement from the exiting employee', t: 'switch' }, { k: 'one_reason', l: 'One exit reason only', t: 'switch' }, { k: 'no_own_reason', l: 'Employees can’t type their own reason', t: 'switch' },
        { k: 'letter', l: 'Resignation letter', t: 'radio', opts: [['text', 'Typed'], ['upload', 'Uploaded'], ['both', 'Both']], def: 'both' }];
    return head + `<section class="panel"><div class="body"><form id="exs">${pcForm(F, tab === 'notify' ? (c.notify || {}) : c)}<button class="btn primary">Save</button></form></div></section>`;
  },
  bind(main) { const f = $('#exs', main); f.onsubmit = async e => { e.preventDefault(); let v = pcRead(f, this.F); if (this.tab === 'notify') v = { notify: v };
    await pcTry(() => q(sb.rpc('hr_exit_settings_save', { p: v })), 'Saved'); S.settings.people = { ...(S.settings.people || {}), exit: { ...pcExCfg(), ...v } }; }; }
};

// ---------------------------------------------------------------- self service and Supervisor
PC_SELF.exit = {
  async load(rest) {
    const me = hrMe(); if (!me) return topbar('Exit') + '<div class="notice">HR hasn’t added your PeopleCore record yet.</div>';
    if (rest[0]) { this.id = +rest[0]; return pcExitPage(+rest[0], 'self'); }
    this.id = null; const rows = await q(sb.rpc('hr_exit_list', { p_scope: 'mine' })); const cur = rows.find(r => ['pending', 'approved'].includes(r.status));
    if (cur) { this.id = cur.id; return pcExitPage(cur.id, 'self'); }
    return topbar('Exit', 'Apply for exit, then complete your handover and exit activities.') +
      `<section class="panel"><div class="pc-empty-hero"><b>No exit in progress</b>If you decide to leave GANKCO, start your resignation here. It goes through the Exit workflow and HR guides you from there.<p><button class="btn primary" id="resign">Resign</button></p></div></section>` +
      (rows.length ? pcExRows('exmine', rows, { base: '#/people/exit/' }) : '');
  },
  bind(main) { const r = $('#resign', main); if (r) r.onclick = () => pcExitStart(null, true); if (this.id) pcBindExit(main, this.id, 'self'); }
};
PC_SUP.exit = {
  async load(rest) {
    if (rest[0]) { this.id = +rest[0]; return pcExitPage(+rest[0], 'sup'); }
    this.id = null; const rows = await q(sb.rpc('hr_exit_list', { p_scope: 'team' })); S.pc.exits = rows;
    const team = await q(sb.rpc('hr_sup_team')); const ending = team.filter(t => t.end_date && hrDays(t.end_date) <= 31 && hrDays(t.end_date) >= 0);
    return topbar('Team exits', 'Exit requests, ongoing exits and scheduled last days in your team.') + pcExRows('exteam', rows, { base: '#/people/sup/exit/', empty: 'Nobody in your team is leaving.' }) +
      `<section class="panel"><header><h2>Expiring contracts</h2></header>${ending.length ? `<ul class="list">${ending.map(t => `<li>${hrAv(t, 'sm')}<div class="main"><div class="name">${esc(t.name)}</div><div class="sub">Contract ends ${fd(t.end_date)}</div></div></li>`).join('')}</ul>` : '<div class="empty">No contracts end in the next month.</div>'}</section>`;
  },
  bind(main) { if (this.id) pcBindExit(main, this.id, 'sup'); }
};
