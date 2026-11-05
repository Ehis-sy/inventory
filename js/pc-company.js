/* GANKCO Nest 3.0.4 — PeopleCore: Company settings (structure, reporting lines, organogram), HRIS employee settings,
   and the Supervisor view's dashboard and team. */
'use strict';

const COMP = PC_MODS.company;
COMP.menu = [['', 'Departments & units', 'building'], ['jobroles', 'Job roles', 'kit', ['add-job-role', 'edit-job-role', 'view-organisational-settings']], ['locations', 'Locations', 'pin'], ['regions', 'Regions', 'compass'],
  ['costcentres', 'Cost centres', 'pay'], ['jobfamilies', 'Job families', 'users'], ['paygroups', 'Pay groups & paygrades', 'chart'], ['lines', 'Reporting lines', 'move'],
  ['documents', 'Company documents', 'audit', ['add-company-document', 'edit-company-document', 'view-settings']], ['organogram', 'Organogram', 'grid', ['view-organogram', 'view-organisational-settings']]];

// ---------------------------------------------------------------- Departments & units (tree), with job roles inside each
COMP.pages[''] = {
  async load() {
    const us = hrUnitsOrdered(); const L = S.pc.look; const people = S.hr.dir;
    const canA = pcCan('add-department'), canE = pcCan('edit-department');
    const n = id => people.filter(c => c.unit_id === id).length;
    const tree = us.length ? `<ul class="pc-tree">${us.map(u => {
      const jobs = L.jobs.filter(j => j.unit_id === u.id && j.active);
      return `<li class="${u.tag}" style="padding-left:${16 + u.depth * 26}px">${u.depth ? '<span class="ind muted">└</span>' : ''}
        <span><span class="nm">${esc(u.name)}</span> ${u.tag === 'unit' ? pcChip('muted', 'Unit') : pcChip('out', 'Department')}${u.code ? ` <small class="muted">${esc(u.code)}</small>` : ''}${u.active ? '' : ' ' + pcChip('muted', 'Off')}
        <br><small class="muted">${u.head_employee_id ? 'Head: ' + esc(pcName(u.head_employee_id)) : 'No head set'} · ${plural(n(u.id), 'person', 'people')} · ${plural(jobs.length, 'job role')}</small></span>
        <span class="end">${canA ? `<button class="btn small" data-addin="${u.id}" title="Add a unit inside">${ico('plus')}Unit</button>` : ''}${canE ? `<button class="btn small" data-u="${u.id}">Edit</button>` : ''}</span></li>`;
    }).join('')}</ul>` : '<div class="pc-empty-hero"><b>No departments yet</b>Add GANKCO’s departments, then the units inside them.</div>';
    return topbar('Departments & units', 'SeamlessHR’s structure: departments, with units inside them. Heads of department approve as H.O.D; unit heads as Unit Head.',
      `${canA ? `<button class="btn" id="dbulk">${ico('up')}Bulk add</button><button class="btn primary" data-u="new">${ico('plus')}Add department</button>` : ''}`) +
      `<section class="panel"><header><h2>GANKCO</h2><span class="meta">${plural(us.filter(u => u.tag === 'department').length, 'department')} · ${plural(us.filter(u => u.tag === 'unit').length, 'unit')}</span></header>${tree}</section>`;
  },
  bind(main) {
    const edit = (u) => pcEdit({ title: u.id ? 'Edit ' + (u.tag === 'unit' ? 'unit' : 'department') : 'Add ' + (u.tag === 'unit' ? 'unit' : 'department'),
      fields: [{ k: 'name', l: 'Name', req: true }, { k: 'code', l: 'Code', ph: 'e.g. ENG' }, { k: 'tag', l: 'Tag', t: 'radio', opts: [['department', 'Department'], ['unit', 'Unit']], def: 'department' },
        { k: 'parent_id', l: 'Parent department', t: 'select', opts: v => pcDeptOpts(v, 'None (top level)') }, { k: 'head_employee_id', l: u.tag === 'unit' ? 'Head of unit' : 'Head of department', t: 'select', opts: v => pcPeopleOpts(v, 'Not set') },
        { k: 'regional', l: 'Regional', t: 'switch', hint: 'This department belongs to one region' }, { k: 'region_id', l: 'Region', t: 'select', opts: v => pcListOpts('region', v), show: v => v.regional },
        { k: 'description', l: 'Description', t: 'textarea' }, ...(u.id ? [{ k: 'active', l: 'In use', t: 'switch' }] : [])], vals: u,
      onOpen: d => { if (u.id && pcCan('delete-department')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn danger'; x.textContent = 'Delete'; x.style.marginRight = 'auto'; x.onclick = async () => { await pcTry(() => q(sb.rpc('hr_dept_delete', { p_id: u.id })), 'Deleted'); d.close(); d.remove(); pcRefresh(); }; $('.mf', d).prepend(x); } },
      save: async v => { await q(sb.rpc('hr_dept_save', { p: { id: u.id || null, ...v, tag: v.tag || u.tag || 'department' } })); toast('Saved'); pcRefresh(); } });
    main.addEventListener('click', e => {
      const b = e.target.closest('[data-u]'); if (b) return edit(b.dataset.u === 'new' ? { tag: 'department', active: true } : hrUnit(b.dataset.u));
      const a = e.target.closest('[data-addin]'); if (a) return edit({ tag: 'unit', parent_id: +a.dataset.addin, active: true });
    });
    const bk = $('#dbulk', main); if (bk) bk.onclick = () => modal({ title: 'Bulk add departments and job roles', submit: 'Upload',
      sub: 'One row per job role: Department, Parent department, Tag (Department or Unit), Code, Head staff ID, Job role. Existing names are kept.',
      body: `<label class="f">Excel file (.xlsx)<input type="file" name="file" accept=".xlsx" required></label><p><button type="button" class="btn small" id="btpl">${ico('down')}Template</button></p>`,
      onOpen: d => { $('#btpl', d).onclick = () => brandXlsx({ file: `Departments and job roles_${localISO(0)}.xlsx`, lists: [{ name: 'Tags', values: ['Department', 'Unit'] }],
        sheets: [{ name: 'Structure', title: 'Departments and job roles', columns: [['department', 'Department', 26], ['parent', 'Parent department', 24], ['tag', 'Tag', 12], ['code', 'Code', 10], ['head_emp_no', 'Head staff ID', 14], ['job_role', 'Job role', 30]].map(([key, header, width]) => ({ key, header, width, input: true, ...(key === 'tag' ? { validate: () => 'Tags' } : {}) })),
          rows: S.pc.look.jobs.map(j => { const u = hrUnit(j.unit_id); return { department: u?.name || '', parent: hrUnit(u?.parent_id)?.name || '', tag: u?.tag === 'unit' ? 'Unit' : 'Department', code: u?.code || '', head_emp_no: '', job_role: j.name }; }) }] }); },
      onSubmit: async (_, d) => {
        await loadScript('vendor/exceljs.min.js'); const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await $('[name=file]', d).files[0].arrayBuffer());
        const rows = []; const val = v => v?.text ?? v?.result ?? (v == null ? '' : String(v));
        wb.worksheets.forEach(ws => { let h = null; ws.eachRow((row, i) => { const vs = row.values.map(v => val(v).trim()); if (!h) { if (vs.includes('Department') && vs.includes('Job role')) h = Object.fromEntries(vs.map((x, ix) => [x, ix])); return; }
          rows.push({ department: vs[h['Department']], parent: vs[h['Parent department']], tag: vs[h['Tag']], code: vs[h['Code']], head_emp_no: vs[h['Head staff ID']], job_role: vs[h['Job role']] }); }); });
        const r = await q(sb.rpc('hr_bulk_structure', { p_rows: rows })); toast(`${plural(r.departments, 'department')} and ${plural(r.job_roles, 'job role')} added`); pcRefresh();
      } });
  }
};

// ---------------------------------------------------------------- Job roles
COMP.pages.jobroles = { perms: ['add-job-role', 'edit-job-role', 'view-organisational-settings'],
  async load() {
    const L = S.pc.look; const rows = L.jobs.map(j => ({ ...j, n: S.hr.dir.filter(c => c.job_role_id === j.id).length, dept: hrUnit(j.unit_id)?.name || '' }));
    const can = pcCan('edit-job-role');
    return topbar('Job roles', 'Job roles sit inside a department. Each employee has one.') +
      pcTable('jobs', [{ k: 'name', l: 'Job role', f: r => `<b>${esc(r.name)}</b>${r.active ? '' : ' ' + pcChip('muted', 'Off')}` }, { k: 'dept', l: 'Department' }, { l: 'Job family', v: r => hrListName(r.job_family_id), f: r => esc(hrListName(r.job_family_id) || '—') },
        { k: 'n', l: 'People', cls: 'num' }, { l: '', cls: 'num', sort: false, csv: false, f: r => can ? `<button class="btn small" data-j="${r.id}">Edit</button>` : '' }], rows,
        { noun: 'job role', csv: 'Job roles', filters: [{ k: 'd', l: 'Department', opts: hrUnitsOrdered().map(u => [u.id, u.name]), test: (r, v) => r.unit_id === +v }],
          actions: pcCan('add-job-role') ? `<button class="btn small primary" data-j="new">${ico('plus')}Add job role</button>` : '' });
  },
  bind(main) {
    main.addEventListener('click', e => {
      const b = e.target.closest('[data-j]'); if (!b) return;
      const j = b.dataset.j === 'new' ? { active: true } : pcJob(b.dataset.j);
      pcEdit({ title: j.id ? 'Edit job role' : 'Add job role', wide: false, fields: [{ k: 'name', l: 'Job role', req: true }, { k: 'unit_id', l: 'Department', t: 'select', opts: v => pcDeptOpts(v, 'Not set') },
        { k: 'job_family_id', l: 'Job family', t: 'select', opts: v => pcListOpts('job_family', v, 'None') }, { k: 'description', l: 'Description', t: 'textarea' }, ...(j.id ? [{ k: 'active', l: 'In use', t: 'switch' }] : [])], vals: j,
        onOpen: d => { if (j.id && pcCan('delete-job-role')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn danger'; x.textContent = 'Delete'; x.style.marginRight = 'auto'; x.onclick = async () => { const r = await pcTry(() => q(sb.rpc('hr_job_role_delete', { p_id: j.id }))); toast(r === 'deleted' ? 'Deleted' : 'People have this job role, so it was switched off'); d.close(); d.remove(); pcRefresh(); }; $('.mf', d).prepend(x); } },
        save: async v => { await q(sb.rpc('hr_job_role_save', { p: { id: j.id || null, ...v } })); toast('Saved'); pcRefresh(); } });
    });
  }
};

// ---------------------------------------------------------------- the simple lists
const pcPerm = (a, e, d) => ({ add: [a], edit: [e], del: [d] });
COMP.pages.locations = pcListPage({ kind: 'location', title: 'Locations', noun: 'location', perm: pcPerm('add-location', 'edit-location', 'delete-location'),
  cols: [{ l: 'Address', v: r => r.meta?.address || '', f: r => esc(r.meta?.address || '—') }, { l: 'Country', v: r => r.meta?.country || '', f: r => esc(r.meta?.country || '') }, { l: 'People', cls: 'num', v: r => S.hr.dir.filter(c => c.location_id === r.id).length }],
  fields: [{ k: 'meta.country', l: 'Country', ph: 'Nigeria' }, { k: 'meta.address', l: 'Address', t: 'textarea' }] });
COMP.pages.regions = pcListPage({ kind: 'region', title: 'Regions', noun: 'region', perm: pcPerm('add-region', 'edit-region', 'delete-region'),
  cols: [{ k: 'code', l: 'Code' }, { l: 'Time zone', v: r => r.meta?.timezone || '', f: r => esc(r.meta?.timezone || '') }],
  fields: [{ k: 'code', l: 'Code' }, { k: 'meta.timezone', l: 'Time zone', t: 'select', opts: ['Africa/Lagos', 'Africa/Accra', 'Africa/Johannesburg', 'Africa/Nairobi', 'Europe/London', 'America/New_York', 'Asia/Dubai'].map(x => [x, x]) }] });
COMP.pages.costcentres = pcListPage({ kind: 'cost_centre', title: 'Cost centres', noun: 'cost centre', perm: pcPerm('add-cost-centre', 'edit-cost-centre', 'delete-cost-centre'),
  cols: [{ k: 'code', l: 'Code' }], fields: [{ k: 'code', l: 'Code' }, { k: 'meta.description', l: 'Description' }] });
COMP.pages.jobfamilies = pcListPage({ kind: 'job_family', title: 'Job families', noun: 'job family', perm: pcPerm('add-job-family', 'edit-job-family', 'delete-job-family'),
  cols: [{ l: 'Job roles', cls: 'num', v: r => (S.pc.look?.jobs || []).filter(j => j.job_family_id === r.id).length }], fields: [{ k: 'meta.description', l: 'Description' }] });

COMP.pages.paygroups = {
  async load() {
    const groups = pcLists('pay_group', true); const grades = S.hr.lists.filter(l => l.kind === 'grade');
    const can = pcCan('edit-pay-group'), canA = pcCan('add-pay-group');
    const n = g => S.hr.dir.length ? '' : '';
    return topbar('Pay groups & paygrades', 'Each paygrade belongs to a pay group. Leave days and policies can differ by paygrade.',
      canA ? `<button class="btn" data-pg="new">${ico('plus')}Pay group</button><button class="btn primary" data-gr="new">${ico('plus')}Paygrade</button>` : '') +
      [...groups, { id: null, name: 'Not in a pay group', active: true }].map(g => {
        const gs = grades.filter(x => (x.parent_id || null) === g.id).sort((a, b) => a.sort - b.sort);
        if (!g.id && !gs.length) return '';
        return `<section class="panel"><header><h2>${esc(g.name)}</h2><span class="meta">${plural(gs.length, 'paygrade')}${g.active ? '' : ' · off'}</span><span class="right">${g.id && can ? `<button class="btn small" data-pg="${g.id}">Edit</button>` : ''}</span></header>
          <div class="body" style="display:flex;gap:8px;flex-wrap:wrap">${gs.map(x => `<button class="btn small ${x.active ? '' : 'muted'}" data-gr="${x.id}" ${can ? '' : 'disabled'}>${esc(x.name)}${x.active ? '' : ' (off)'}</button>`).join('') || '<span class="muted">No paygrades yet</span>'}</div></section>`;
      }).join('');
  },
  bind(main) {
    const save = (kind, r) => pcEdit({ title: (r.id ? 'Edit ' : 'Add ') + (kind === 'grade' ? 'paygrade' : 'pay group'), wide: false,
      fields: [{ k: 'name', l: 'Name', req: true }, ...(kind === 'grade' ? [{ k: 'parent_id', l: 'Pay group', t: 'select', req: true, opts: v => pcListOpts('pay_group', v, 'Choose…') }] : []), { k: 'code', l: 'Code' }, { k: 'active', l: 'In use', t: 'switch' }],
      vals: { active: true, ...r },
      onOpen: d => { if (r.id && pcCan('delete-pay-group')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn danger'; x.textContent = 'Delete'; x.style.marginRight = 'auto'; x.onclick = async () => { const res = await pcTry(() => q(sb.rpc('hr_struct_delete', { p_kind: kind, p_id: r.id }))); toast(res === 'deleted' ? 'Deleted' : 'In use, so it was switched off'); d.close(); d.remove(); pcRefresh(); }; $('.mf', d).prepend(x); } },
      save: async v => { await q(sb.rpc('hr_struct_save', { p_kind: kind, p: { id: r.id || null, ...v } })); toast('Saved'); pcRefresh(); } });
    main.addEventListener('click', e => {
      const g = e.target.closest('[data-pg]'), x = e.target.closest('[data-gr]');
      if (g) save('pay_group', g.dataset.pg === 'new' ? {} : hrList(g.dataset.pg));
      if (x) save('grade', x.dataset.gr === 'new' ? {} : hrList(x.dataset.gr));
    });
  }
};

// ---------------------------------------------------------------- Reporting lines
COMP.pages.lines = {
  async load() {
    const L = S.pc.look.lines; const can = pcCan('edit-reporting-line');
    const sample = S.hr.dir.find(c => c.manager_id) || S.hr.dir[0];
    const how = { line_manager: 'The supervisor on each person’s record', counter_signing: 'The supervisor’s supervisor', hod: 'The head of the person’s department (or the department above, for heads)', unit_head: 'The head of the person’s unit (or department)' };
    return topbar('Reporting lines', 'The six levels approval workflows can send requests to. Set a different person for one employee on their profile.') +
      `<section class="panel"><div class="tablewrap"><table class="t"><thead><tr><th>Reporting line</th><th>Who it is</th><th>In use</th><th></th></tr></thead><tbody>${L.map(l => `<tr>
        <td><b>${esc(l.label)}</b><br><small class="muted">${esc(l.description || '')}</small></td>
        <td>${l.company_wide ? (l.holder_id ? pcPerson(hrCard(l.holder_id) || { name: pcName(l.holder_id) }, 'Everyone’s ' + esc(l.label)) : '<span class="chip pending">Not set</span>') : `<span class="muted">${esc(how[l.key] || '')}</span>`}</td>
        <td>${l.active ? pcChip('ok', 'On') : pcChip('muted', 'Off')}</td><td class="num">${can ? `<button class="btn small" data-l="${l.key}">Edit</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>` +
      (sample ? `<section class="panel"><header><h2>Check someone’s lines</h2><span class="right"><select id="lchk" style="margin:0;width:auto">${pcPeopleOpts(sample.id, 'Choose…')}</select></span></header><div id="lout"></div></section>` : '');
  },
  bind(main) {
    main.addEventListener('click', e => {
      const b = e.target.closest('[data-l]'); if (!b) return;
      const l = S.pc.look.lines.find(x => x.key === b.dataset.l);
      pcEdit({ title: 'Edit ' + l.label, wide: false, fields: [{ k: 'label', l: 'Name', req: true }, { k: 'description', l: 'Description' }, ...(l.company_wide ? [{ k: 'holder_id', l: 'Who holds it', t: 'select', opts: v => pcPeopleOpts(v, 'Not set') }] : []), { k: 'active', l: 'In use', t: 'switch' }],
        vals: l, save: async v => { await q(sb.rpc('hr_line_save', { p: { key: l.key, ...v } })); toast('Saved'); pcRefresh(); } });
    });
    const s = $('#lchk', main); if (!s) return;
    const show = async () => { if (!s.value) return; const ls = await q(sb.rpc('hr_lines_of', { p_emp: +s.value })); $('#lout', main).innerHTML = `<dl class="pc-kv">${ls.map(l => `<div><dt>${esc(l.label)}</dt><dd>${l.id ? esc(l.name) + (l.override ? ' <span class="chip muted">set for this person</span>' : '') : '<span class="muted">Nobody</span>'}</dd></div>`).join('')}</dl>`; };
    s.onchange = show; show();
  }
};

// ---------------------------------------------------------------- Organogram (people, by supervisor)
function pcOrgTree(rootSel) {
  const ppl = S.hr.dir.filter(c => c.status !== 'exited'); const by = {};
  ppl.forEach(c => { const m = c.manager_id && ppl.some(x => x.id === c.manager_id) ? c.manager_id : 0; (by[m] = by[m] || []).push(c); });
  const node = (c, d) => { const kids = (by[c.id] || []).sort((a, b) => a.name.localeCompare(b.name));
    return `<li><div class="pc-oc" data-oc="${c.id}">${hrAv(c, 'sm')}<span><b>${esc(c.name)}</b><small>${esc(c.title || '')}</small><small class="muted">${esc(hrUnit(c.dept_id)?.name || c.unit || '')}</small></span>${kids.length ? `<button type="button" class="pc-oc-t" aria-label="Show or hide team">${kids.length}</button>` : ''}</div>
      ${kids.length ? `<ul ${d >= 2 ? 'hidden' : ''}>${kids.map(k => node(k, d + 1)).join('')}</ul>` : ''}</li>`; };
  const roots = rootSel ? ppl.filter(c => c.id === +rootSel) : (by[0] || []);
  return `<div class="pc-org"><ul>${roots.map(r => node(r, 0)).join('')}</ul></div>`;
}
const pcOrgPage = (title, sub) => ({
  async load(rest, params) {
    const root = params.get?.('from') || '';
    return topbar(title, sub, `<button class="btn" id="ocall">Expand all</button><button class="btn" onclick="window.print()">${ico('print')}Print</button>`) +
      `<div class="filters"><select id="ocroot" style="width:auto">${pcPeopleOpts(root, 'Whole company')}</select></div><section class="panel pc-orgwrap">${pcOrgTree(root)}</section>`;
  },
  bind(main, rest, params, parts) {
    main.addEventListener('click', e => { const t = e.target.closest('.pc-oc-t'); if (t) { const ul = t.closest('li').querySelector(':scope > ul'); if (ul) ul.hidden = !ul.hidden; } });
    $('#ocall', main).onclick = () => { const any = $$('.pc-org ul[hidden]', main).length; $$('.pc-org li > ul', main).forEach(u => u.hidden = !any); };
    $('#ocroot', main).onchange = e => { location.hash = '#/' + parts.join('/') + (e.target.value ? '?from=' + e.target.value : ''); };
  }
});
COMP.pages.organogram = { perms: ['view-organogram', 'view-organisational-settings'], ...pcOrgPage('Organogram', 'Everyone by who they report to. Change a supervisor on the person’s record.') };
PC_SELF.org = pcOrgPage('Organogram', 'Who reports to whom at GANKCO.');

// ---------------------------------------------------------------- HRIS · Employee settings (SeamlessHR's tabs)
const PC_SET_TABS = [['id', 'Employee ID'], ['documents', 'Employee documents'], ['contracts', 'Contract types'], ['profile', 'Profile settings'], ['visibility', 'Profile sections'], ['notifications', 'Notifications'],
  ['weights', 'Profile completeness'], ['fields', 'Dynamic fields'], ['dashboard', 'Employee dashboard'], ['pfa', 'PFA list'], ['tags', 'Employee tags']];
PC_MODS.hris.pages.settings = { perms: ['manage-employee-settings'],
  async load(rest, params) {
    const tab = params.get?.('tab') || 'id'; this.tab = tab; const c = hrisCfg();
    const head = topbar('Employee settings', 'How employee records work at GANKCO.') + pcTabs(PC_SET_TABS.map(([k, l]) => ['#/people/admin/hris/settings?tab=' + k, l]), '#/people/admin/hris/settings?tab=' + tab);
    const panel = (title, inner, sub = '') => `<section class="panel"><header><h2>${esc(title)}</h2>${sub ? `<span class="meta">${sub}</span>` : ''}</header><div class="body"><form id="sform">${inner}<button class="btn primary">Save</button></form></div></section>`;
    if (tab === 'id') { const f = hrEmpnoFmt();
      return head + panel('Employee ID', pcForm([{ k: 'empno_auto', l: 'Generate staff IDs automatically', t: 'switch', hint: 'When on, a new employee without a staff ID gets the next number.' },
        { k: 'prefix', l: 'Prefix', ph: 'GES' }, { k: 'digits', l: 'Digits in the running number', t: 'number', min: 1, max: 8 },
        { k: 'order', l: 'Order', t: 'select', blank: false, opts: [['prefix,seq,year', 'Prefix · number · year (e.g. GES0052022)'], ['prefix,year,seq', 'Prefix · year · number'], ['prefix,seq', 'Prefix · number']] }], { empno_auto: c.empno_auto, ...f }) +
        `<p class="muted">Example: <b id="idx">${esc(hrEmpnoSample(f))}</b></p>`); }
    if (tab === 'documents') return head + await pcListPage({ kind: 'doc_type', title: 'Document types', noun: 'document type', perm: { add: ['manage-employee-settings'], edit: ['manage-employee-settings'], del: ['manage-employee-settings'] },
      cols: [{ l: 'Formats', v: r => r.meta?.formats || '', f: r => esc(r.meta?.formats || 'Any') }, { l: 'Uploads', cls: 'num', v: r => r.meta?.max_uploads || 1 }, { l: 'Expires', v: r => r.meta?.expires ? 'Yes' : 'No', f: r => r.meta?.expires ? `Yes · remind ${r.meta?.remind_days || 30} days before` : 'No' }, { l: 'Staff upload', v: r => pcYes(r.meta?.staff_upload !== false) }],
      fields: [{ k: 'meta.formats', l: 'Allowed formats', ph: 'pdf,jpg,png' }, { k: 'meta.max_uploads', l: 'Number of uploads', t: 'number', min: 1, max: 10 }, { k: 'meta.expires', l: 'Has an expiry date', t: 'switch' }, { k: 'meta.remind_days', l: 'Remind this many days before it expires', t: 'number', min: 1, max: 365 }, { k: 'meta.staff_upload', l: 'Staff can upload it themselves', t: 'switch' }] }).load();
    if (tab === 'contracts') return head + await pcListPage({ kind: 'emp_type', title: 'Contract types', noun: 'contract type', perm: { add: ['manage-employee-settings'], edit: ['manage-employee-settings'], del: ['manage-employee-settings'] },
      cols: [{ l: 'Expires', v: r => pcYes(r.meta?.expires) }, { l: 'Auto-exit on expiry', v: r => pcYes(r.meta?.auto_exit) }, { l: 'Can be extended', v: r => pcYes(r.meta?.extendable) }, { l: 'People', cls: 'num', v: r => S.hr.dir.filter(x => x.emp_type_id === r.id).length }],
      fields: [{ k: 'meta.description', l: 'Description' }, { k: 'meta.expires', l: 'This contract expires', t: 'switch' }, { k: 'meta.auto_exit', l: 'Exit the employee automatically when it expires', t: 'switch' }, { k: 'meta.extendable', l: 'Can be extended', t: 'switch', hint: 'Extension requests follow the Contract approval workflow' }] }).load() +
      panel('Contract expiry reminders', pcForm([{ k: 'contract_remind_days', l: 'Remind HR and the supervisor this many days before a contract ends', t: 'number', min: 1, max: 180 }], c));
    if (tab === 'profile') return head + panel('Profile updates', pcForm([{ k: 'profile_approval', l: 'Profile changes need HR approval', t: 'switch', hint: 'When on, what staff change on their profile waits for HR (the Profile update workflow). You can switch approval off for single sections under Profile sections.' },
      { k: 'notify_each_update', l: 'Tell admins about each profile update', t: 'switch' }, { k: 'weekly_reminder', l: 'Weekly reminder to staff whose profile is incomplete', t: 'switch' }], c));
    if (tab === 'visibility') { const g = c.sections || {}; const D = { emp_edit: true, sup_view: true, hod_view: true, admin_view: true, admin_edit: true, approval: true };
      const cols = [['emp_edit', 'Employee can edit'], ['sup_view', 'Supervisor can view'], ['hod_view', 'HOD can view'], ['admin_view', 'Admin can view'], ['admin_edit', 'Admin can edit'], ['approval', 'Needs approval']];
      return head + `<section class="panel"><header><h2>Profile sections</h2><span class="meta">Who sees and changes each part of a profile</span></header><form id="sform"><div class="tablewrap"><table class="pc-matrix"><thead><tr><th>Section</th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
        ${PC_SECTIONS.map(([k, l]) => `<tr><td><b>${esc(l)}</b></td>${cols.map(([ck]) => { const v = g[k]?.[ck] ?? (['account', 'documents'].includes(k) && ['sup_view', 'hod_view'].includes(ck) ? false : D[ck]); return `<td><input type="checkbox" data-sec="${k}" data-col="${ck}" ${v ? 'checked' : ''} aria-label="${esc(l)}: ${ck}"></td>`; }).join('')}</tr>`).join('')}
        </tbody></table></div><div class="body"><button class="btn primary">Save</button></div></form></section>`; }
    if (tab === 'notifications') { const roles = S.pc.look.roles.filter(r => !r.is_system);
      return head + panel('Notifications', pcForm([{ k: 'notify_birthdays', l: 'Birthday notifications', t: 'switch', hint: 'Shown on Discover and sent to colleagues' }, { k: 'notify_anniversaries', l: 'Work anniversary notifications', t: 'switch' },
        { k: 'notify_new_roles', l: 'When an employee is added, tell admins with these roles', t: 'checks', opts: roles.map(r => [r.id, r.name]) }], { notify_birthdays: true, notify_anniversaries: true, ...c })); }
    if (tab === 'weights') { const w = { biodata: 30, dependant: 5, document: 20, experience: 10, family: 5, kin: 15, qualification: 10, training: 5, ...(c.weights || {}) };
      const L = { biodata: 'Biodata', dependant: 'Dependants', document: 'Documents', experience: 'Experience', family: 'Family', kin: 'Next of kin', qualification: 'Qualifications', training: 'Trainings' };
      return head + panel('Profile completeness', pcForm(Object.keys(L).map(k => ({ k, l: L[k], t: 'number', min: 0, max: 100 })), w) + `<p class="muted">Total: <b id="wtot">${Object.values(w).reduce((a, b) => a + +b, 0)}</b>. The bar on each profile is the share of these that’s filled in.</p>`); }
    if (tab === 'fields') return head + hrSetFields();
    if (tab === 'dashboard') return head + panel('Employee dashboard', pcForm([{ k: 'others_scope', l: 'Staff see colleagues’ leave and birthdays from', t: 'radio', opts: [['org', 'The whole organisation'], ['dept', 'Their department']], def: 'org' },
      { k: 'show_pay_group', l: 'Staff can see their own pay group', t: 'switch' }, { k: 'show_job_role', l: 'Staff can see their own job role', t: 'switch', hint: 'GANKCO: off in SeamlessHR' }], c.dashboard || {}));
    if (tab === 'pfa') return head + await pcListPage({ kind: 'pfa', title: 'Pension fund administrators', noun: 'PFA', perm: { add: ['manage-employee-settings'], edit: ['manage-employee-settings'], del: ['manage-employee-settings'] } }).load();
    if (tab === 'tags') return head + await pcListPage({ kind: 'emp_tag', title: 'Employee tags', noun: 'tag', perm: { add: ['manage-employee-settings'], edit: ['manage-employee-settings'], del: ['manage-employee-settings'] } }).load();
    return head;
  },
  bind(main, rest, params) {
    const tab = this.tab; const f = $('#sform', main);
    const kinds = { documents: 'doc_type', contracts: 'emp_type', pfa: 'pfa', tags: 'emp_tag' };
    if (kinds[tab]) pcListPage({ kind: kinds[tab], title: '', noun: { documents: 'document type', contracts: 'contract type', pfa: 'PFA', tags: 'tag' }[tab],
      perm: { add: ['manage-employee-settings'], edit: ['manage-employee-settings'], del: ['manage-employee-settings'] },
      fields: { documents: [{ k: 'meta.formats', l: 'Allowed formats', ph: 'pdf,jpg,png' }, { k: 'meta.max_uploads', l: 'Number of uploads', t: 'number', min: 1, max: 10 }, { k: 'meta.expires', l: 'Has an expiry date', t: 'switch' }, { k: 'meta.remind_days', l: 'Remind this many days before it expires', t: 'number', min: 1, max: 365 }, { k: 'meta.staff_upload', l: 'Staff can upload it themselves', t: 'switch' }],
        contracts: [{ k: 'meta.description', l: 'Description' }, { k: 'meta.expires', l: 'This contract expires', t: 'switch' }, { k: 'meta.auto_exit', l: 'Exit the employee automatically when it expires', t: 'switch' }, { k: 'meta.extendable', l: 'Can be extended', t: 'switch' }] }[tab] || [] }).bind(main);
    if (tab === 'fields') return hrBindFields(main);
    if (!f) return;
    if (tab === 'weights') f.oninput = () => $('#wtot', main).textContent = $$('input', f).reduce((a, i) => a + (+i.value || 0), 0);
    if (tab === 'id') f.oninput = () => { const v = pcRead(f, [{ k: 'prefix' }, { k: 'digits', t: 'number' }, { k: 'order' }]); $('#idx', main).textContent = hrEmpnoSample({ ...hrEmpnoFmt(), ...v, prefix: v.prefix || '' }); };
    f.onsubmit = async e => {
      e.preventDefault();
      await pcTry(async () => {
        if (tab === 'id') { const v = pcRead(f, [{ k: 'empno_auto', t: 'switch' }, { k: 'prefix' }, { k: 'digits', t: 'number' }, { k: 'order' }]);
          const empno = { prefix: v.prefix || '', digits: v.digits || 3, order: v.order }; await q(sb.rpc('hr_settings_save', { p: { empno } })); S.settings.people = { ...(S.settings.people || {}), empno }; await hrisSaveCfg({ empno_auto: v.empno_auto }); }
        else if (tab === 'contracts') await hrisSaveCfg(pcRead(f, [{ k: 'contract_remind_days', t: 'number' }]));
        else if (tab === 'profile') await hrisSaveCfg(pcRead(f, [{ k: 'profile_approval', t: 'switch' }, { k: 'notify_each_update', t: 'switch' }, { k: 'weekly_reminder', t: 'switch' }]));
        else if (tab === 'visibility') { const g = {}; $$('[data-sec]', f).forEach(i => { (g[i.dataset.sec] = g[i.dataset.sec] || {})[i.dataset.col] = i.checked; }); await hrisSaveCfg({ sections: g }); }
        else if (tab === 'notifications') await hrisSaveCfg(pcRead(f, [{ k: 'notify_birthdays', t: 'switch' }, { k: 'notify_anniversaries', t: 'switch' }, { k: 'notify_new_roles', t: 'checks' }]));
        else if (tab === 'weights') await hrisSaveCfg({ weights: Object.fromEntries($$('input', f).map(i => [i.name, +i.value || 0])) });
        else if (tab === 'dashboard') await hrisSaveCfg({ dashboard: pcRead(f, [{ k: 'others_scope', t: 'radio' }, { k: 'show_pay_group', t: 'switch' }, { k: 'show_job_role', t: 'switch' }]) });
      });
      render({ quiet: true });
    };
  }
};

// ---------------------------------------------------------------- Supervisor view
PC_SUP[''] = {
  async load() {
    const team = await q(sb.rpc('hr_sup_team')); S.pc.team = team;
    const direct = team.filter(t => t.direct); const today = localISO(0);
    const out = await q(sb.rpc('hr_out', { p_from: today, p_to: localISO(14) })).catch(() => []);
    const mineOut = (out || []).filter(o => team.some(t => t.id === o.employee_id));
    const by = k => { const m = {}; team.forEach(t => { const v = t[k] || 'Not set'; m[v] = (m[v] || 0) + 1; }); return Object.entries(m).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n); };
    const conf = team.filter(t => t.confirmation_due && !t.confirmed_on && hrDays(t.confirmation_due) <= 30);
    const ends = team.filter(t => t.end_date && hrDays(t.end_date) <= 60 && hrDays(t.end_date) >= 0);
    const appr = S.hr.appr.length;
    return topbar('Supervisor', `${plural(direct.length, 'person', 'people')} report to you directly · ${plural(team.length, 'person', 'people')} in your team in all.`) +
      pcKpis([[team.length, 'In your team', '', '#/people/sup/team'], [direct.length, 'Direct reports', '', '#/people/sup/team'], [appr, 'Waiting for your approval', appr ? 'warn' : '', '#/people/sup/approvals'],
        [mineOut.filter(o => o.from <= today).length, 'Away today'], [conf.length, 'Confirmations due', conf.length ? 'warn' : ''], [ends.length, 'Contracts ending soon', ends.length ? 'warn' : '']]) +
      `<div class="pc-grid2"><section class="panel"><header><h2>Away in the next two weeks</h2></header>${mineOut.length ? `<ul class="list">${mineOut.slice(0, 10).map(o => `<li>${hrAv(hrCard(o.employee_id), 'sm')}<div class="main"><div class="name">${esc(pcName(o.employee_id))}</div><div class="sub">${esc(o.label || 'Away')} · ${fd(o.from)} – ${fd(o.to)}</div></div></li>`).join('')}</ul>` : '<div class="empty">Nobody in your team is away.</div>'}</section>
        <section class="panel"><header><h2>By department</h2></header>${pcBars(team.map(t => ({ ...t, dn: hrUnit(t.dept_id)?.name })).reduce((a, t) => { const x = a.find(y => y.name === (t.dn || 'Not set')); x ? x.n++ : a.push({ name: t.dn || 'Not set', n: 1 }); return a; }, []), { pct: true })}</section>
        <section class="panel"><header><h2>By job role</h2></header>${pcBars(by('title').slice(0, 8))}</section>
        <section class="panel"><header><h2>By gender</h2></header>${pcBars(by('gender'), { pct: true })}</section>
        <section class="panel"><header><h2>By contract type</h2></header>${pcBars(by('emp_type'), { pct: true })}</section>
        <section class="panel"><header><h2>Needs attention</h2></header>${conf.length || ends.length ? `<ul class="list">${conf.map(t => `<li>${hrAv(t, 'sm')}<div class="main"><div class="name">${esc(t.name)}</div><div class="sub">Confirmation due ${fd(t.confirmation_due)}</div></div></li>`).join('')}${ends.map(t => `<li>${hrAv(t, 'sm')}<div class="main"><div class="name">${esc(t.name)}</div><div class="sub">Contract ends ${fd(t.end_date)}</div></div></li>`).join('')}</ul>` : '<div class="empty">Nothing needs you right now.</div>'}</section></div>`;
  }
};
PC_SUP.team = {
  async load(rest) {
    if (rest[0]) return pcProfile(+rest[0], 'sup');
    const team = await q(sb.rpc('hr_sup_team')); S.pc.team = team;
    return topbar('My team', 'Everyone who reports to you, directly or through someone else.', `<a class="btn" href="#/people/org?from=${hrMe()?.id || ''}">${ico('grid')}Organogram</a>`) +
      pcTable('team', [{ k: 'name', l: 'Name', v: r => r.name, f: r => pcPerson(r, esc(r.emp_no || '')) }, { l: 'Job role', v: r => r.title || '', f: r => esc(r.title || '—') }, { l: 'Department', v: r => pcDeptName(r), f: r => esc(pcDeptName(r) || '—') },
        { l: 'Reports to', v: r => pcName(r.manager_id), f: r => r.direct ? pcChip('ok', 'You') : esc(pcName(r.manager_id)) }, { l: 'Profile', v: r => r.completeness, f: r => pcRing(r.completeness, 30) }, { l: 'Status', v: r => r.status, f: r => pcStatus(r.status) }], team,
        { noun: 'person', csv: 'My team', href: r => '#/people/sup/team/' + r.id, filters: [{ k: 'd', l: 'Reporting', opts: [['1', 'Direct reports'], ['0', 'Through someone else']], test: (r, v) => String(+r.direct) === v }] });
  },
  bind(main, rest) { if (rest[0]) pcBindProfile(main, +rest[0], 'sup'); }
};
PC_SUP.approvals = { load: (r, p) => hrApprPage.load(['people', 'approvals'], p), bind: (m, r, p) => hrApprPage.bind && hrApprPage.bind(m, ['people', 'approvals'], p) };
