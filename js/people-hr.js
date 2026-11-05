/* GANKCO Nest 3.0 — PeopleCore (HR), Wave 1a: staff records, the employee page, Excel upload, settings */
'use strict';

// ================================================================ STAFF RECORDS (HR)
const HR_EMP_COLS = 'id,emp_no,title,first_name,middle_name,last_name,preferred_name,position_id,manager_id,emp_type_id,grade_id,location_id,start_date,confirmation_due,confirmed_on,status,profile_id,work_email,personal_email,mobile';
const hrStaffPage = {
  async load(parts, params) {
    const f = S.hr.stf; const v = params.get('v') || '';
    const all = this.all = await q(sb.from('hr_employees').select(HR_EMP_COLS).order('first_name').order('last_name'));
    const ql = f.q.trim().toLowerCase();
    const inUnit = (e, uid) => { let u = hrUnit(hrPos(e.position_id)?.unit_id), g = 0; while (u && g++ < 12) { if (u.id === +uid) return true; u = hrUnit(u.parent_id); } return false; };
    const rows = all.filter(e => (v ? e.status === 'active' : (!f.status || e.status === f.status)) && (!f.unit || inUnit(e, f.unit)) && (!f.type || e.emp_type_id === +f.type)
      && (v !== 'confirm' || (e.confirmation_due && !e.confirmed_on && hrDays(e.confirmation_due) <= 30)) && (v !== 'nolink' || !e.profile_id) && (v !== 'nopos' || !e.position_id)
      && (!ql || [hrFullName(e), e.preferred_name, e.emp_no, e.work_email, hrPos(e.position_id)?.title].join(' ').toLowerCase().includes(ql)));
    const VIEWS = { confirm: 'Confirmations due in 30 days', nolink: 'Not linked to a Nest sign-in', nopos: 'No position yet' };
    return topbar('Staff records', `${plural(all.filter(e => e.status === 'active').length, 'active record')} · ${plural(all.length, 'record')} in all`,
        `<div class="btngrp"><button class="btn" id="xl">${ico('down')}Excel</button>${isHRAdmin() ? `<button class="btn" id="xlu">${ico('up')}Upload</button>` : ''}</div>
         <button class="btn primary" id="add">${ico('plus')}Add a person</button>`) +
      (v ? `<div class="notice small">Showing: <b>${esc(VIEWS[v] || v)}</b> · <a href="#/people/staff">Show everyone</a></div>` : '') +
      `<div class="filters"><input type="search" id="sq" placeholder="Search by name, employee number, email or position" value="${esc(f.q)}">
        <select id="su">${hrUnitOpts(f.unit, 'Every department')}</select>
        <select id="st">${[['active', 'Active'], ['suspended', 'Suspended'], ['exited', 'Left'], ['', 'Everyone']].map(([k, l]) => opt(k, l, f.status)).join('')}</select>
        <select id="sy">${hrListOpts('emp_type', f.type, 'Every employment type')}</select><span class="sub">${plural(rows.length, 'person', 'people')}</span></div>
      <section class="panel">${rows.length ? `<div class="tablewrap"><table class="t stack hr-staff"><thead><tr><th>Name</th><th>Employee no.</th><th>Position</th><th>Line manager</th><th>Type</th><th>Location</th><th>Started</th><th>Nest sign-in</th><th>Status</th></tr></thead><tbody>
        ${rows.map(e => { const p = hrPos(e.position_id); const c = hrCard(e.id);
          return `<tr class="clickrow" data-e="${e.id}"><td class="full"><div class="hr-namecell">${hrAv(c || { name: e.first_name + ' ' + e.last_name })}<div><div class="name">${esc(hrFullName(e))}</div><div class="sub">${esc(e.work_email || e.personal_email || 'No email')}</div></div></div></td>
            <td>${e.emp_no ? `<span class="tag">${esc(e.emp_no)}</span>` : '—'}</td><td>${p ? esc(p.title) + `<div class="sub">${esc(hrUnit(p.unit_id)?.name || '')}</div>` : chip('pending', 'No position')}</td>
            <td>${esc(c?.manager_id ? hrNameOf(c.manager_id) : '') || '<span class="sub">—</span>'}</td><td>${esc(hrListName(e.emp_type_id)) || '—'}</td><td>${esc(hrListName(e.location_id || p?.location_id)) || '—'}</td><td>${fd(e.start_date)}</td>
            <td>${e.profile_id ? chip('ok', 'Linked') : chip('muted', 'Not linked')}</td><td>${chip(HR_STATUS[e.status]?.[0], HR_STATUS[e.status]?.[1])}</td></tr>`; }).join('')}
        </tbody></table></div>` : `<div class="empty">${all.length ? 'Nobody matches these filters.' : 'No staff records yet. Add people one at a time, or fill the Excel staff template and upload it.'}</div>`}</section>`;
  },
  bind(main) {
    const f = S.hr.stf;
    const qi = $('#sq', main); qi.oninput = debounce(() => { f.q = qi.value; render({ quiet: true }).then(() => { const n = $('#sq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250);
    $('#su', main).onchange = e => { f.unit = e.target.value; render({ quiet: true }); };
    $('#st', main).onchange = e => { f.status = e.target.value; render({ quiet: true }); };
    $('#sy', main).onchange = e => { f.type = e.target.value; render({ quiet: true }); };
    $$('[data-e]', main).forEach(r => r.onclick = () => go('#/people/emp/' + r.dataset.e));
    $('#add', main).onclick = () => hrEditEmp(null, this.all);
    $('#xl', main).onclick = () => hrExcelMenu();
    const u = $('#xlu', main); if (u) u.onclick = () => hrUpload();
  }
};

// the record form (add and edit)
function hrEmpForm(e, linked) {
  e = e || { status: 'active', custom: {} };
  const signins = Object.values(S.people).filter(p => !['pending', 'disabled'].includes(p.role) && (!linked.has(p.id) || p.id === e.profile_id)).sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
  const cust = S.hr.fields.filter(x => x.active && x.visibility !== 'locked');
  const inp = (n, l, v, t = 'text', extra = '') => `<label class="f">${l}<input name="${n}" type="${t}" value="${esc(v ?? '')}" ${extra}></label>`;
  const sel = (n, l, vals, v) => `<label class="f">${l}<select name="${n}"><option value=""></option>${vals.map(x => opt(x, x, v)).join('')}</select></label>`;
  const cf = x => { const v = e.custom?.[x.key] ?? '';
    return x.kind === 'list' ? sel('c_' + x.key, esc(x.label), x.options || [], v) : inp('c_' + x.key, `${esc(x.label)} <span class="hint">${esc(HR_VIS[x.visibility])}</span>`, v, x.kind === 'number' ? 'number' : x.kind === 'date' ? 'date' : 'text'); };
  return `<div class="pjf-sec">Name</div>
    <div class="row4">${sel('title', 'Title', TITLES, e.title)}${inp('first_name', 'First name', e.first_name, 'text', 'required')}${inp('middle_name', 'Middle name', e.middle_name)}${inp('last_name', 'Last name', e.last_name, 'text', 'required')}</div>
    <div class="row4">${inp('preferred_name', 'Preferred name', e.preferred_name)}${sel('gender', 'Gender', GENDERS, e.gender)}${inp('date_of_birth', 'Date of birth', e.date_of_birth, 'date')}${sel('marital_status', 'Marital status', MARITAL, e.marital_status)}</div>
    <div class="row2">${inp('nationality', 'Nationality', e.nationality ?? (e.id ? '' : 'Nigerian'))}${inp('state_of_origin', 'State of origin', e.state_of_origin)}</div>
    <div class="pjf-sec">Contact</div>
    <div class="row2">${inp('work_email', 'Work email <span class="hint">Their Nest sign-in links by this email</span>', e.work_email, 'email')}${inp('personal_email', 'Personal email', e.personal_email, 'email')}</div>
    <div class="row2">${inp('mobile', 'Mobile', e.mobile)}${inp('work_phone', 'Work phone', e.work_phone)}</div>
    <label class="f">Home address<textarea name="address" rows="2">${esc(e.address || '')}</textarea></label>
    <div class="pjf-sec">Job</div>
    <div class="row2">${inp('emp_no', `Employee number <span class="hint">${e.id ? 'HR can overwrite it' : 'Leave blank to give the next one (' + esc(hrEmpnoSample(undefined, 'N', 'year joined').replace('N', '###')) + ')'}</span>`, e.emp_no)}
      <label class="f">Position<select name="position_id">${hrPosOpts(e.position_id, 'No position yet')}</select></label></div>
    <div class="row3"><label class="f">Employment type<select name="emp_type_id">${hrListOpts('emp_type', e.emp_type_id)}</select></label>
      <label class="f">Grade<select name="grade_id">${hrListOpts('grade', e.grade_id, 'Not set (from the position)')}</select></label>
      <label class="f">Work location<select name="location_id">${hrListOpts('location', e.location_id, 'Not set (from the position)')}</select></label></div>
    <div class="row4">${inp('start_date', 'Start date', e.start_date, 'date')}${inp('probation_months', 'Probation (months)', e.probation_months, 'number', 'min="0" max="24"')}
      ${inp('confirmation_due', 'Confirmation due <span class="hint">Worked out from probation if blank</span>', e.confirmation_due, 'date')}${inp('confirmed_on', 'Confirmed on', e.confirmed_on, 'date')}</div>
    <div class="row2"><label class="f">Line manager <span class="hint">Only if it isn’t whoever holds the position above</span><select name="manager_id">${hrPeopleOpts(e.manager_id, 'From the org structure', e.id)}</select></label>
      <label class="f">Nest sign-in <span class="hint">Links automatically by email; pick one for staff who signed up with another email</span><select name="profile_id"><option value="">Not linked</option>${signins.map(p => opt(p.id, (p.full_name || '') + ' · ' + p.email, e.profile_id)).join('')}</select></label></div>
    <div class="row3"><label class="f">Status<select name="status">${Object.entries(HR_STATUS).map(([k, [, l]]) => opt(k, l, e.status)).join('')}</select></label>
      ${inp('exit_date', 'Exit date', e.exit_date, 'date')}${inp('exit_reason', 'Exit reason', e.exit_reason)}</div>
    ${cust.length ? `<div class="pjf-sec">More</div><div class="row2">${cust.map(cf).join('')}</div>` : ''}`;
}
const HR_FORM_KEYS = ['title', 'first_name', 'middle_name', 'last_name', 'preferred_name', 'gender', 'date_of_birth', 'marital_status', 'nationality', 'state_of_origin', 'work_email', 'personal_email',
  'mobile', 'work_phone', 'address', 'emp_no', 'position_id', 'emp_type_id', 'grade_id', 'location_id', 'start_date', 'probation_months', 'confirmation_due', 'confirmed_on', 'manager_id', 'profile_id', 'status', 'exit_date', 'exit_reason'];
async function hrEditEmp(e, all) {
  const ids = all || await q(sb.from('hr_employees').select('id,profile_id'));
  const linked = new Set(ids.map(x => x.profile_id).filter(Boolean));
  return modal({ title: e ? `Edit ${hrFullName(e)}` : 'Add a person', wide: true, submit: e ? 'Save' : 'Add',
    sub: e ? 'Changes are logged in PeopleCore’s activity log.' : 'Name is enough to start. Bank, tax and pension details go in the locked section after adding.',
    body: hrEmpForm(e, linked),
    onSubmit: async x => {
      const p = {}; HR_FORM_KEYS.forEach(k => { p[k] = (x[k] ?? '').trim(); });
      if (e) { p.id = e.id; if (!p.emp_no) delete p.emp_no; }
      p.custom = Object.fromEntries(S.hr.fields.filter(f => f.active && f.visibility !== 'locked').map(f => [f.key, (x['c_' + f.key] ?? '').trim() || null]));
      const id = await q(sb.rpc('hr_employee_save', { p }));
      toast(e ? 'Saved' : 'Added'); hrInvalidate();
      if (e) render({ quiet: true }); else go('#/people/emp/' + id);
    } });
}

// ================================================================ THE EMPLOYEE PAGE (HR)
const hrEmpPage = {
  async load(parts, params) {
    const id = +parts[2]; this.tab = params.get('tab') || 'profile';
    const [rows, kin, docs, hist, reqs] = await Promise.all([
      q(sb.from('hr_employees').select('*').eq('id', id)), q(sb.from('hr_kin').select('*').eq('employee_id', id).order('sort')),
      q(sb.from('hr_documents').select('id,title,kind,expires_on,file_name,mime,size_bytes,uploaded_by_name,created_at').eq('employee_id', id).order('created_at', { ascending: false })),
      q(sb.from('hr_job_history').select('*').eq('employee_id', id).order('from_date', { ascending: false, nullsFirst: false })),
      q(sb.from('hr_requests').select('id,kind,title,status,created_at,decided_at,steps,current_step,employee_id').eq('employee_id', id).order('created_at', { ascending: false }).limit(30))]);
    const e = this.e = rows[0]; if (!e) return topbar('Staff record') + '<div class="notice">This record wasn’t found.</div><a class="btn" href="#/people/staff">Back to staff records</a>';
    this.kin = kin;
    const c = hrCard(e.id) || {}; const p = hrPos(e.position_id);
    const kv = rs => `<dl class="kv">${rs.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === '' || v == null ? '<span class="sub">—</span>' : v}</dd>`).join('')}</dl>`;
    const cust = S.hr.fields.filter(f => f.active && f.visibility !== 'locked');
    const tabs = [['profile', 'Profile'], ['kin', 'Next of kin'], ...(isHRAdmin() ? [['locked', 'Locked section']] : []), ['docs', `Documents${docs.length ? ` (${docs.length})` : ''}`], ['history', 'Job history'], ['requests', 'Requests']];
    const dd = e.confirmation_due && !e.confirmed_on ? hrDays(e.confirmation_due) : null;
    const body = {
      profile: () => `<div class="grid2"><section class="panel"><header><h2>Personal</h2></header><div class="body">${kv([['Full name', esc(hrFullName(e))], ['Preferred name', esc(e.preferred_name || '')], ['Gender', esc(e.gender || '')],
          ['Date of birth', e.date_of_birth ? fd(e.date_of_birth) : ''], ['Marital status', esc(e.marital_status || '')], ['Nationality', esc(e.nationality || '')], ['State of origin', esc(e.state_of_origin || '')]])}</div></section>
        <section class="panel"><header><h2>Contact</h2></header><div class="body">${kv([['Work email', esc(e.work_email || '')], ['Personal email', esc(e.personal_email || '')], ['Mobile', esc(e.mobile || '')], ['Work phone', esc(e.work_phone || '')], ['Home address', esc(e.address || '')],
          ['Nest sign-in', e.profile_id ? chip('ok', 'Linked') + ' ' + esc(S.people[e.profile_id]?.email || '') : chip('muted', 'Not linked')]])}</div></section></div>
        <div class="grid2"><section class="panel"><header><h2>Job</h2></header><div class="body">${kv([['Position', p ? esc(p.title) : chip('pending', 'No position')], ['Unit', esc(hrUnitPath(p?.unit_id))], ['Line manager', esc(hrNameOf(c.manager_id)) + (e.manager_id ? ' <span class="sub">(set by hand)</span>' : '')],
          ['Employment type', esc(hrListName(e.emp_type_id))], ['Grade', esc(hrListName(e.grade_id || p?.grade_id))], ['Location', esc(hrListName(e.location_id || p?.location_id))],
          ['Start date', e.start_date ? fd(e.start_date) : ''], ['Probation', e.probation_months ? plural(e.probation_months, 'month') : ''],
          ['Confirmation', e.confirmed_on ? chip('ok', 'Confirmed ' + fd(e.confirmed_on)) : dd == null ? '' : dd < 0 ? chip('overdue', 'Overdue · due ' + fd(e.confirmation_due)) : dd <= 30 ? chip('pending', 'Due ' + fd(e.confirmation_due)) : 'Due ' + fd(e.confirmation_due)],
          e.status === 'exited' ? ['Left', fd(e.exit_date) + (e.exit_reason ? ' · ' + esc(e.exit_reason) : '')] : null])}</div></section>
        <section class="panel"><header><h2>More</h2><span class="meta">Custom fields</span>${isHRAdmin() ? '<div class="right"><a class="btn small" href="#/people/settings?tab=fields">Manage fields</a></div>' : ''}</header>
          <div class="body">${cust.length ? kv(cust.map(f => [f.label, esc(e.custom?.[f.key] ?? '') + ` <span class="sub hr-vis">${esc(HR_VIS[f.visibility])}</span>`])) : '<span class="sub">No custom fields yet.</span>'}</div></section></div>
        <div class="sub">Added ${fdt(e.created_at)}${e.created_by_name ? ' by ' + esc(e.created_by_name) : ''} · last changed ${fdt(e.updated_at)}${e.updated_by_name ? ' by ' + esc(e.updated_by_name) : ''}</div>`,
      kin: () => `<section class="panel"><header><h2>Next of kin &amp; emergency contacts</h2><div class="right"><button class="btn small" id="kinedit">${ico('edit')}Edit</button></div></header>
        ${kin.length ? `<ul class="list">${kin.map(k => `<li><div><div class="name">${esc(k.name)} ${chip('muted', k.kind === 'emergency' ? 'Emergency contact' : 'Next of kin')}</div><div class="sub">${[k.relationship, k.phone, k.email].filter(Boolean).map(esc).join(' · ')}</div>${k.address ? `<div class="sub">${esc(k.address)}</div>` : ''}</div></li>`).join('')}</ul>` : '<div class="empty">None recorded.</div>'}</section>`,
      locked: () => `<section class="panel hr-locked"><header><h2>${ico('lock')}Locked section</h2><span class="meta">Bank, tax, pension and ID numbers. Only HR admins and the person see it, and every look is logged.</span>
          <div class="right"><button class="btn small" id="pvshow">${ico('lock')}Show details</button></div></header><div class="body" id="pvbody"><span class="sub">Hidden until you press Show details.</span></div></section>`,
      docs: () => `<section class="panel"><header><h2>Documents</h2><div class="right"><button class="btn small" id="doc">${ico('plus')}Add</button></div></header>
        ${docs.length ? `<ul class="list">${docs.map(d => hrDocLi(d, true)).join('')}</ul>` : '<div class="empty">No documents yet.</div>'}</section>`,
      history: () => `<section class="panel"><header><h2>Job history</h2><div class="right"><button class="btn small" id="move">${ico('move')}Move to another position</button></div></header>
        ${hist.length ? `<ul class="list">${hist.map(h => `<li><div><div class="name">${esc(h.title || '—')}</div><div class="sub">${esc(h.unit_name || '')} · ${fd(h.from_date)} – ${h.to_date ? fd(h.to_date) : 'now'}${h.note ? ' · ' + esc(h.note) : ''}${h.by_name ? ' · by ' + esc(h.by_name) : ''}</div></div>${!h.to_date ? `<div class="end">${chip('ok', 'Current')}</div>` : ''}</li>`).join('')}</ul>` : '<div class="empty">No positions recorded yet.</div>'}</section>`,
      requests: () => `<section class="panel">${reqs.length ? `<ul class="list">${reqs.map(hrReqLi).join('')}</ul>` : '<div class="empty">No requests.</div>'}</section>`
    };
    return `<div class="back"><a href="#/people/staff">← Staff records</a></div>
      <section class="panel hr-idcard"><div class="body hr-idrow"><div class="hr-photo-edit">${hrAv({ ...c, photo: e.photo, name: e.first_name + ' ' + e.last_name }, 'xl')}<label class="hr-photo-btn" title="Change photo">${ico('edit')}<input type="file" accept="image/*" id="photo" hidden></label></div>
        <div class="hr-idmain"><h2>${esc(hrFullName(e))}</h2><div class="sub">${esc(p?.title || 'No position yet')}${p ? ' · ' + esc(hrUnit(p.unit_id)?.name || '') : ''}</div>
          <div class="hr-chips">${e.emp_no ? `<span class="tag">${esc(e.emp_no)}</span>` : ''}${chip(HR_STATUS[e.status]?.[0], HR_STATUS[e.status]?.[1])}${e.emp_type_id ? chip('muted', hrListName(e.emp_type_id)) : ''}${e.profile_id ? '' : chip('muted', 'No Nest sign-in')}</div></div>
        <div class="hr-idact"><button class="btn primary" id="edit">${ico('edit')}Edit record</button></div></div></section>
      <div class="tabs" id="etabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>${(body[this.tab] || body.profile)()}`;
  },
  bind(main, parts) {
    const e = this.e; if (!e) return;
    $$('#etabs button', main).forEach(b => b.onclick = () => go(`#/people/emp/${e.id}?tab=${b.dataset.t}`));
    $('#edit', main).onclick = () => hrEditEmp(e);
    $('#photo', main).onchange = async ev => { try { const photo = await hrPhotoData(ev.target.files[0]); await q(sb.rpc('hr_employee_save', { p: { id: e.id, photo } })); toast('Photo updated'); hrRefresh(); } catch (x) { toast(niceError(x), true); } };
    const ke = $('#kinedit', main); if (ke) ke.onclick = () => modal({ title: 'Next of kin & emergency contacts', wide: true, submit: 'Save', body: hrKinRows(this.kin),
      onSubmit: async x => { await q(sb.rpc('hr_employee_save', { p: { id: e.id, kin: hrKinRead(x) } })); toast('Saved'); hrRefresh(); } });
    const dc = $('#doc', main); if (dc) dc.onclick = () => hrAddDoc(e.id);
    hrBindDocs(main);
    const mv = $('#move', main); if (mv) mv.onclick = () => modal({ title: 'Move to another position', submit: 'Move', sub: 'Promotion, transfer or a new role. Their job history keeps the old position.',
      body: `<label class="f">New position<select name="pos" required>${hrPosOpts('', 'Choose…', e.position_id)}</select></label>
        <div class="row2"><label class="f">From<input type="date" name="from" value="${localISO(0)}"></label><label class="f">Note <span class="hint">Optional</span><input name="note" placeholder="e.g. Promoted"></label></div>`,
      onSubmit: async x => { if (!x.pos) throw new Error('Choose the new position.'); await q(sb.rpc('hr_employee_move', { p_emp: e.id, p_pos: +x.pos, p_from: x.from || null, p_note: x.note })); toast('Moved'); hrRefresh(); } });
    const sh = $('#pvshow', main); if (sh) sh.onclick = async () => {
      try { const pv = await q(sb.rpc('hr_private_get', { p_emp: e.id })); const lc = S.hr.fields.filter(f => f.active && f.visibility === 'locked');
        $('#pvbody', main).innerHTML = `<dl class="kv">${HR_PRIVATE.map(([k, l]) => `<dt>${esc(l)}</dt><dd>${esc(pv[k] || '') || '<span class="sub">—</span>'}</dd>`).join('')}${lc.map(f => `<dt>${esc(f.label)}</dt><dd>${esc(pv.custom?.[f.key] || '') || '<span class="sub">—</span>'}</dd>`).join('')}</dl>
          <div class="mt"><button class="btn small" id="pvedit">${ico('edit')}Edit</button> <span class="sub">${pv.updated_at ? 'Last changed ' + fdt(pv.updated_at) + (pv.updated_by_name ? ' by ' + esc(pv.updated_by_name) : '') : ''}</span></div>`;
        sh.remove();
        $('#pvedit', main).onclick = () => modal({ title: 'Locked section', submit: 'Save', sub: 'Only HR admins and the person see these. The change is logged (without the values).',
          body: `<div class="row2">${HR_PRIVATE.map(([k, l]) => `<label class="f">${esc(l)}<input name="${k}" value="${esc(pv[k] || '')}" autocomplete="off"></label>`).join('')}
            ${lc.map(f => `<label class="f">${esc(f.label)}<input name="c_${f.key}" value="${esc(pv.custom?.[f.key] || '')}" autocomplete="off"></label>`).join('')}</div>`,
          onSubmit: async x => { const p = Object.fromEntries(HR_PRIVATE.map(([k]) => [k, (x[k] || '').trim()])); if (lc.length) p.custom = Object.fromEntries(lc.map(f => [f.key, (x['c_' + f.key] || '').trim() || null]));
            await q(sb.rpc('hr_private_save', { p_emp: e.id, p })); toast('Saved'); hrRefresh(); } });
      } catch (x) { toast(niceError(x), true); }
    };
  }
};

// ================================================================ EXCEL (placeholder formats: to be agreed with HR)
const ST_COLS = [['id', 'App ID', 8], ['emp_no', 'Employee no.', 14], ['title', 'Title', 8], ['first_name', 'First name', 16], ['middle_name', 'Middle name', 14], ['last_name', 'Last name', 16],
  ['preferred_name', 'Preferred name', 14], ['gender', 'Gender', 10], ['date_of_birth', 'Date of birth', 13], ['marital_status', 'Marital status', 13], ['nationality', 'Nationality', 12], ['state_of_origin', 'State of origin', 14],
  ['work_email', 'Work email', 28], ['personal_email', 'Personal email', 26], ['work_phone', 'Work phone', 15], ['mobile', 'Mobile', 15], ['address', 'Home address', 30],
  ['position', 'Position', 40], ['manager_emp_no', 'Line manager (employee no.)', 16], ['emp_type', 'Employment type', 18], ['grade', 'Grade', 12], ['location', 'Work location', 18],
  ['start_date', 'Start date', 12], ['probation_months', 'Probation (months)', 11], ['confirmation_due', 'Confirmation due', 13], ['confirmed_on', 'Confirmed on', 13], ['status', 'Status', 11]];
const ST_STATUS = { active: 'Active', suspended: 'Suspended', exited: 'Left' };
const hrPosLabel = p => p ? `${p.title} (${hrUnit(p.unit_id)?.name || '—'})` : '';
const hrDate = v => { if (v == null || v === '') return ''; if (v instanceof Date) return v.toISOString().slice(0, 10); const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + +s * 864e5); return d.toISOString().slice(0, 10); } return 'bad:' + s; };

function hrExcelMenu() {
  return modal({ title: 'Excel templates', submit: '', cancel: 'Close',
    sub: 'Starting formats: HR will agree the final columns with you. Fill a template, then upload it here. You see every change before it’s saved.',
    body: `<div class="tplgrid"><button type="button" class="tplcard" data-dl="staff"><b>Staff template</b><span>Everyone’s record, ready to edit, with empty rows to add people. Positions, types and locations are dropdowns.</span></button>
      <button type="button" class="tplcard" data-dl="org"><b>Organisation template</b><span>Departments, units and positions, and who reports to whom.</span></button></div>
      ${isHRAdmin() ? `<div class="mt"><button type="button" class="btn" id="xlup">${ico('up')}Upload a filled template</button></div>` : '<p class="sub mt">Only HR admins can upload templates.</p>'}`,
    onOpen: (d, close) => {
      $$('[data-dl]', d).forEach(b => b.onclick = async () => { b.disabled = true; try { await (b.dataset.dl === 'staff' ? hrStaffTemplate() : hrOrgTemplate()); } catch (e) { toast(niceError(e), true); } b.disabled = false; });
      const u = $('#xlup', d); if (u) u.onclick = () => { close(null); hrUpload(); };
    } });
}
async function hrStaffTemplate() {
  const emps = await q(sb.from('hr_employees').select('*').order('emp_no', { nullsFirst: false }));
  const cust = S.hr.fields.filter(f => f.active && f.visibility !== 'locked');
  const locked = isHRAdmin() ? [...HR_PRIVATE, ...S.hr.fields.filter(f => f.active && f.visibility === 'locked').map(f => ['c_' + f.key, f.label])] : [];
  const byId = Object.fromEntries(emps.map(e => [e.id, e]));
  const rows = emps.map(e => ({ ...Object.fromEntries(ST_COLS.map(([k]) => [k, e[k] ?? ''])), position: hrPosLabel(hrPos(e.position_id)), manager_emp_no: e.manager_id ? byId[e.manager_id]?.emp_no || '' : '',
    emp_type: hrListName(e.emp_type_id), grade: hrListName(e.grade_id), location: hrListName(e.location_id), status: ST_STATUS[e.status] || '', ...Object.fromEntries(cust.map(f => ['x_' + f.key, e.custom?.[f.key] ?? '']))}));
  const lists = [{ name: 'Positions', values: hrUnitsOrdered().flatMap(u => S.hr.positions.filter(p => p.unit_id === u.id && p.active).map(hrPosLabel)) },
    { name: 'EmpTypes', values: S.hr.lists.filter(l => l.kind === 'emp_type' && l.active).map(l => l.name) }, { name: 'Grades', values: S.hr.lists.filter(l => l.kind === 'grade' && l.active).map(l => l.name) },
    { name: 'Locations', values: S.hr.lists.filter(l => l.kind === 'location' && l.active).map(l => l.name) }, { name: 'Genders', values: GENDERS }, { name: 'Marital', values: MARITAL },
    { name: 'Titles', values: TITLES }, { name: 'Statuses', values: Object.values(ST_STATUS) }];
  const V = { position: 'Positions', emp_type: 'EmpTypes', grade: 'Grades', location: 'Locations', gender: 'Genders', marital_status: 'Marital', title: 'Titles', status: 'Statuses' };
  const columns = [...ST_COLS.map(([k, h, w]) => ({ header: h, key: k, width: w, input: k !== 'id', ...(V[k] && lists.find(l => l.name === V[k]).values.length ? { validate: () => V[k] } : {}), ...(/date|due|_on$/.test(k) ? { type: 'date' } : {}) })),
    ...cust.map(f => ({ header: f.label, key: 'x_' + f.key, width: 16, input: true })), ...locked.map(([k, l]) => ({ header: '🔒 ' + l, key: 'p_' + k, width: 16, newInput: true }))];
  // what each record looked like when the file was made: on upload only the cells HR changed count
  const original = { name: 'Original', header: ['ID', ...columns.map(c => c.header)], rows: rows.map(r => [r.id, ...columns.map(c => String(r[c.key] ?? ''))]) };
  await brandXlsx({ file: `PeopleCore staff template_${localISO(0)}.xlsx`, lists, hidden: [original],
    sheets: [{ name: 'Staff', title: 'PeopleCore · Staff template', subtitle: `${plural(rows.length, 'record')} · ${CFG.COMPANY || ''} · starting format, to be agreed`, columns, rows, blankRows: 100,
      note: 'Edit the orange cells, or add people in the empty rows (leave App ID blank). Empty cells don’t clear anything.' }],
    instructions: ['How to use the staff template',
      '1. Each row is one person. To change someone, edit their cells. To add someone, fill an empty row at the bottom and leave App ID blank: First name and Last name are needed.',
      '2. Leave Employee no. blank for new people: Nest gives the next number (' + hrEmpnoSample() + ' style). Type one to use your own.',
      '3. Choose Position, Employment type, Grade and Location from the dropdowns. Line manager is only needed if it isn’t whoever holds the position above: type their employee number.',
      '4. Dates as 2026-01-31 or 31/01/2026. Status: Active, Suspended or Left.',
      isHRAdmin() ? '5. The 🔒 columns (bank, tax, pension, IDs) are the locked section. They come out empty for privacy: fill them only to set or change a value.' : '5. Bank, tax and pension details are not in this file.',
      '6. Don’t change App ID. Save the file, then in PeopleCore → Staff records → Upload. You’ll see what will change first.',
      'This is a starting format. HR will agree the final columns, and the template will follow.'] });
}
async function hrOrgTemplate() {
  const rows = [];
  hrUnitsOrdered().forEach(u => {
    const par = hrUnit(u.parent_id)?.name || ''; const ps = S.hr.positions.filter(p => p.unit_id === u.id && p.active).sort((a, b) => a.sort - b.sort);
    const base = { unit: u.name, parent_unit: par, is_department: u.is_department ? 'Yes' : 'No' };
    if (!ps.length) rows.push({ id: '', ...base });
    ps.forEach(p => { const r = hrPos(p.reports_to); rows.push({ id: p.id, ...base, position: p.title, reports_to: r ? `${r.title} @ ${hrUnit(r.unit_id)?.name || ''}` : '', grade: hrListName(p.grade_id), location: hrListName(p.location_id), headcount: p.headcount }); });
  });
  await brandXlsx({ file: `PeopleCore organisation template_${localISO(0)}.xlsx`, lists: [{ name: 'YesNo', values: ['Yes', 'No'] }, { name: 'Grades', values: S.hr.lists.filter(l => l.kind === 'grade' && l.active).map(l => l.name) }, { name: 'Locations', values: S.hr.lists.filter(l => l.kind === 'location' && l.active).map(l => l.name) }],
    sheets: [{ name: 'Organisation', title: 'PeopleCore · Organisation template', subtitle: `${plural(S.hr.units.length, 'unit')} · ${plural(S.hr.positions.length, 'position')} · starting format, to be agreed`, blankRows: 60,
      columns: [{ header: 'App ID', key: 'id', width: 8 }, { header: 'Unit', key: 'unit', width: 30, input: true }, { header: 'Parent unit', key: 'parent_unit', width: 28, input: true }, { header: 'Department', key: 'is_department', width: 12, input: true, validate: () => 'YesNo' },
        { header: 'Position', key: 'position', width: 36, input: true }, { header: 'Reports to (position @ unit)', key: 'reports_to', width: 44, input: true },
        { header: 'Grade', key: 'grade', width: 12, input: true, ...(S.hr.lists.some(l => l.kind === 'grade') ? { validate: () => 'Grades' } : {}) }, { header: 'Work location', key: 'location', width: 18, input: true, validate: () => 'Locations' },
        { header: 'Headcount', key: 'headcount', width: 10, type: 'num', input: true }], rows,
      note: 'One row per position. New units and positions are added; existing ones are matched by name. Renames and removals are done in PeopleCore settings.' }],
    instructions: ['How to use the organisation template', '1. One row per position, with the unit it sits in. A unit with no positions can have a row with Position left blank.',
      '2. Parent unit puts a unit under another. Department = Yes marks a department: its head is the Head of department for everyone under it.',
      '3. Reports to: the position’s manager, written as Position @ Unit (copy it from another row).', '4. Upload it in PeopleCore → Staff records → Upload. New units and positions are added and reporting lines updated.',
      'This is a starting format. HR will agree the final columns, and the template will follow.'] });
}
function hrUpload() {
  return modal({ title: 'Upload a filled template', submit: 'Check the file', sub: 'The staff template or the organisation template. Nothing is saved until you confirm.',
    body: `<label class="f">File<input type="file" accept=".xlsx" required></label>`,
    onSubmit: async (x, d) => {
      const file = $('input[type=file]', d).files[0]; if (!file) throw new Error('Choose the file.');
      const rows = await readXlsx(file);
      if (rows.sheet === 'Organisation') setTimeout(() => hrPreviewOrg(rows), 0);
      else if (rows.sheet === 'Staff') setTimeout(() => hrPreviewStaff(rows), 0);
      else throw new Error('This isn’t a PeopleCore template. Download the staff or organisation template and try again.');
    } });
}
function hrPreviewStaff(rows) {
  const H = Object.fromEntries(ST_COLS.map(([k, h]) => [h, k]));
  const posBy = new Map(S.hr.positions.map(p => [hrPosLabel(p).toLowerCase(), p.id]));
  const listBy = kind => new Map(S.hr.lists.filter(l => l.kind === kind).map(l => [l.name.toLowerCase(), l.id]));
  const LT = listBy('emp_type'), LG = listBy('grade'), LL = listBy('location');
  const stBy = Object.fromEntries(Object.entries(ST_STATUS).map(([k, v]) => [v.toLowerCase(), k]));
  const cust = Object.fromEntries(S.hr.fields.filter(f => f.active && f.visibility !== 'locked').map(f => [f.label, f.key]));
  const lockedCols = Object.fromEntries([...HR_PRIVATE.map(([k, l]) => ['🔒 ' + l, k]), ...S.hr.fields.filter(f => f.visibility === 'locked').map(f => ['🔒 ' + f.label, 'c_' + f.key])]);
  const errs = [], out = []; let made = 0, changed = 0;
  rows.forEach((r, i) => {
    const n = i + 1; const p = {}; const t = v => v == null ? '' : String(v).trim();
    const was = r['App ID'] ? rows.orig?.get(+r['App ID']) : null;
    for (const [h, v] of Object.entries(r)) {
      const s = t(v); if (!s) continue; const k = H[h];
      if (was && k !== 'id' && (k && /date|due|_on$/.test(k) ? hrDate(v) : s) === (was[h] ?? '').trim()) continue;   // unchanged since the file was made
      if (k === 'id') p.id = +s;
      else if (k === 'position') { const id = posBy.get(s.toLowerCase()); if (!id) errs.push(`Row ${n}: “${s}” isn’t a position. Pick it from the dropdown.`); else p.position_id = id; }
      else if (k === 'emp_type' || k === 'grade' || k === 'location') { const m = { emp_type: LT, grade: LG, location: LL }[k]; const id = m.get(s.toLowerCase()); if (!id) errs.push(`Row ${n}: “${s}” isn’t in the ${h} list.`); else p[k + '_id'] = id; }
      else if (k === 'status') { const st = stBy[s.toLowerCase()]; if (!st) errs.push(`Row ${n}: status must be Active, Suspended or Left.`); else p.status = st; }
      else if (k && /date|due|_on$/.test(k)) { const dt = hrDate(v); if (dt.startsWith('bad:')) errs.push(`Row ${n}: “${s}” in ${h} isn’t a date.`); else p[k] = dt; }
      else if (k) p[k] = s;
      else if (cust[h]) (p.custom = p.custom || {})[cust[h]] = s;
      else if (lockedCols[h] && isHRAdmin()) { const lk = lockedCols[h]; p.private = p.private || {}; if (lk.startsWith('c_')) (p.private.custom = p.private.custom || {})[lk.slice(2)] = s; else p.private[lk] = s; }
    }
    if (!Object.keys(p).filter(k => k !== 'id').length) return;
    if (!p.id && (!p.first_name || !p.last_name)) { errs.push(`Row ${n}: a new person needs a first and last name.`); return; }
    if (p.id) changed++; else made++;
    out.push(p);
  });
  const locked = out.filter(p => p.private).length;
  return modal({ title: 'Staff template', submit: errs.length || !out.length ? '' : `Save ${plural(out.length, 'record')}`, cancel: errs.length || !out.length ? 'Close' : 'Cancel',
    sub: errs.length ? 'Fix these in the file, then upload it again. Nothing was saved.' : out.length ? 'Check the numbers, then save.' : 'Nothing to save in this file.',
    body: errs.length ? `<ul class="errlist">${errs.slice(0, 40).map(e => `<li>${esc(e)}</li>`).join('')}${errs.length > 40 ? `<li>…and ${errs.length - 40} more</li>` : ''}</ul>`
      : `<div class="board b3"><div class="kpi"><div class="n">${made}</div><div class="l">New people</div></div><div class="kpi"><div class="n">${changed}</div><div class="l">Records updated</div></div><div class="kpi"><div class="n">${locked}</div><div class="l">Locked sections set</div></div></div>
        <p class="sub">Empty cells are left as they are. Position changes are added to each person’s job history.</p>`,
    onSubmit: async () => { const r = await q(sb.rpc('hr_bulk_employees', { p_rows: out })); toast(`${plural(r.created, 'person', 'people')} added, ${plural(r.changed, 'record')} updated`); hrInvalidate(); render({ quiet: true }); } });
}
function hrPreviewOrg(rows) {
  const t = v => v == null ? '' : String(v).trim(); const errs = [], out = [];
  rows.forEach((r, i) => {
    const o = { unit: t(r['Unit']), parent_unit: t(r['Parent unit']), is_department: /^y/i.test(t(r['Department'])) ? true : /^n/i.test(t(r['Department'])) ? false : null,
      position: t(r['Position']), reports_to: t(r['Reports to (position @ unit)']), grade: t(r['Grade']), location: t(r['Work location']), headcount: t(r['Headcount']) };
    if (!o.unit && !o.position) return;
    if (!o.unit) errs.push(`Row ${i + 1}: the unit is missing.`); else out.push(o);
  });
  const newUnits = new Set(out.filter(o => !S.hr.units.some(u => u.name.toLowerCase() === o.unit.toLowerCase())).map(o => o.unit.toLowerCase())).size;
  const newPos = out.filter(o => o.position && !S.hr.positions.some(p => p.title.toLowerCase() === o.position.toLowerCase() && hrUnit(p.unit_id)?.name.toLowerCase() === o.unit.toLowerCase())).length;
  return modal({ title: 'Organisation template', submit: errs.length || !out.length ? '' : 'Save', cancel: errs.length || !out.length ? 'Close' : 'Cancel',
    sub: errs.length ? 'Fix these in the file, then upload it again. Nothing was saved.' : 'Check the numbers, then save.',
    body: errs.length ? `<ul class="errlist">${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : `<div class="board b3"><div class="kpi"><div class="n">${out.length}</div><div class="l">Rows</div></div><div class="kpi"><div class="n">${newUnits}</div><div class="l">New units</div></div><div class="kpi"><div class="n">${newPos}</div><div class="l">New positions</div></div></div>
      <p class="sub">Existing units and positions are matched by name; reporting lines, grades, locations and headcounts are updated.</p>`,
    onSubmit: async () => { const r = await q(sb.rpc('hr_bulk_org', { p_rows: out })); toast(`${plural(r.units, 'unit')} and ${plural(r.positions, 'position')} added`); hrInvalidate(); render({ quiet: true }); } });
}

// ================================================================ SETTINGS (HR admins)
const HR_TABS = [['org', 'Organisation'], ['lists', 'Lists'], ['fields', 'Custom fields'], ['leave', 'Leave types'], ['holidays', 'Public holidays'], ['flows', 'Approvals'], ['empno', 'Employee numbers'], ['roles', 'HR team'], ['log', 'Activity log']];
const HR_TAB_DESC = { org: () => `${plural(S.hr.units.length, 'unit')} · ${plural(S.hr.positions.length, 'position')} · who reports to whom`, lists: () => 'Grades, work locations and employment types',
  fields: () => 'Extra details HR keeps on each record', leave: () => 'Leave types and days per grade', holidays: () => 'Not counted as leave days', flows: () => 'Who approves each kind of request, in order',
  empno: () => 'How new employee numbers are made', roles: () => `${plural((S.hr.roles || []).length, 'person', 'people')} besides the Developer`, log: () => 'Every change made in PeopleCore' };
// 3.0.3: one bar per section; opening one closes the others
const hrSettingsPage = {
  async load(parts, params) {
    const tab = this.tab = HR_TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : null;
    const panel = tab ? await ({ org: hrSetOrg, lists: hrSetLists, fields: hrSetFields, leave: hrSetLeave, holidays: hrSetHolidays, flows: hrSetFlows, empno: hrSetEmpno, roles: hrSetRoles, log: () => hrSetLog(params) }[tab])() : '';
    return topbar('PeopleCore settings', 'The company structure, lists, fields and approval chains. Open a section to change it. Everything here can be changed at any time.') +
      `<div class="hacc">${HR_TABS.map(([k, l]) => `<section class="panel acc ${tab === k ? 'open' : ''}" data-t="${k}" id="hs-${k}"><header tabindex="0" role="button" aria-expanded="${tab === k}"><h2>${l}</h2><span class="meta">${esc(HR_TAB_DESC[k]())}</span><span class="acc-chev" aria-hidden="true"></span></header>
        ${tab === k ? `<div class="acc-in">${panel}</div>` : ''}</section>`).join('')}</div>`;
  },
  bind(main, parts, params) {
    const open = $('.hacc .acc.open', main);
    if (open) { const l = $(':scope > header h2', open).textContent.trim(); $$('.acc-in section.panel > header > h2', open).forEach(h => { if (h.textContent.trim() !== l && !(h.textContent.trim() === 'Approval chains' && l === 'Approvals')) return; const m = h.parentElement.querySelector('.meta'); if (m && /^\d+$/.test(m.textContent.trim())) m.textContent = `${m.textContent.trim()} ${l.toLowerCase()}`; h.remove(); });
      const mark = e => { const t = e.target; if (t.type === 'file' || !t.form || !t.form.querySelector('[type=submit]')) return; open.dataset.dirty = '1'; };
      $('.acc-in', open).addEventListener('input', mark); $('.acc-in', open).addEventListener('change', mark);
      $('.acc-in', open).addEventListener('submit', () => { open.dataset.dirty = ''; }, true);
      if (!this.seen) setTimeout(() => open.scrollIntoView({ block: 'start' }), 30); }
    this.seen = true;
    $$('.hacc .acc > header', main).forEach(h => { const k = h.parentElement.dataset.t;
      const act = () => { if (open?.dataset.dirty === '1' && !confirm(`You have unsaved changes in ${$(':scope > header h2', open).textContent.trim()}. Close it and lose them?`)) return;
        this.seen = false; go(this.tab === k ? '#/people/settings' : '#/people/settings?tab=' + k); };
      h.onclick = e => { if (e.target.closest('button, a, input, select, textarea, label')) return; act(); };
      h.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === h) { e.preventDefault(); act(); } }; });
    const B = { org: hrBindOrg, lists: hrBindLists, fields: hrBindFields, leave: hrBindLeave, holidays: hrBindHolidays, flows: hrBindFlows, empno: hrBindEmpno, roles: hrBindRoles, log: hrBindLog }[this.tab];
    B && B(main, params);
  }
};
const hrSave = async (fn, args, msg = 'Saved') => { await q(sb.rpc(fn, args)); toast(msg); hrInvalidate(); render({ quiet: true }); };
const hrTry = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(niceError(e), true); } };

// ---- organisation
function hrSetOrg() {
  const holders = pid => S.hr.dir.filter(c => c.position_id === pid);
  const units = hrUnitsOrdered();
  return `<section class="panel"><header><h2>Organisation</h2><span class="meta">${plural(S.hr.units.length, 'unit')} · ${plural(S.hr.positions.length, 'position')}</span>
      <div class="right"><button class="btn small" id="xlorg">${ico('down')}Excel</button><button class="btn small primary" id="nu">${ico('plus')}Add a unit</button></div></header>
    <div class="body muted">Units are departments and the teams inside them. Positions sit in a unit and report to another position: that’s how Nest knows everyone’s line manager.
      A <b>department</b>’s head is the Head of department for everyone under it. Vacant positions are skipped: approvals go to the next person up.</div>
    <div class="hr-orgset">${units.map(u => { const ps = S.hr.positions.filter(p => p.unit_id === u.id).sort((a, b) => a.sort - b.sort || a.id - b.id);
      return `<div class="hu ${u.active ? '' : 'off'}" style="--d:${u.depth}"><div class="hu-head"><b>${esc(u.name)}</b>${u.is_department ? chip('out', 'Department') : ''}${!u.active ? chip('muted', 'Archived') : ''}
          <span class="sub">${u.head_position_id && hrPos(u.head_position_id) ? 'Head: ' + esc(hrPos(u.head_position_id).title) : ''}</span>
          <span class="hu-act"><button class="btn small link" data-np="${u.id}">${ico('plus')}Position</button><button class="btn small link" data-nu="${u.id}">${ico('plus')}Unit inside</button><button class="btn small link" data-eu="${u.id}">Edit</button></span></div>
        ${ps.length ? `<ul class="hu-pos">${ps.map(p => { const h = holders(p.id); const r = hrPos(p.reports_to);
          return `<li class="${p.active ? '' : 'off'}"><span class="hp-t">${esc(p.title)}${p.headcount > 1 ? ` <span class="sub">×${p.headcount}</span>` : ''}</span>
            <span class="sub">${r ? 'reports to ' + esc(r.title) : 'top of the chart'}${p.dotted_to && hrPos(p.dotted_to) ? ' · ┄ ' + esc(hrPos(p.dotted_to).title) : ''}</span>
            <span class="hp-h">${h.length ? h.map(c => esc(c.name)).join(', ') : p.is_external ? chip('muted', 'External') : chip('pending', 'Vacant')}${!p.active ? ' ' + chip('muted', 'Archived') : ''}</span>
            <button class="btn small link" data-ep="${p.id}">Edit</button></li>`; }).join('')}</ul>` : ''}</div>`; }).join('') || '<div class="empty">No units yet. Add the first one, or upload the organisation template.</div>'}</div></section>`;
}
function hrBindOrg(main) {
  $('#xlorg', main).onclick = () => hrExcelMenu();
  $('#nu', main).onclick = () => hrUnitForm(null);
  $$('[data-nu]', main).forEach(b => b.onclick = () => hrUnitForm(null, +b.dataset.nu));
  $$('[data-eu]', main).forEach(b => b.onclick = () => hrUnitForm(hrUnit(+b.dataset.eu)));
  $$('[data-np]', main).forEach(b => b.onclick = () => hrPosForm(null, +b.dataset.np));
  $$('[data-ep]', main).forEach(b => b.onclick = () => hrPosForm(hrPos(+b.dataset.ep)));
}
function hrUnitForm(u, parent) {
  const below = new Set(); if (u) { const walk = id => S.hr.units.filter(x => x.parent_id === id).forEach(x => { below.add(x.id); walk(x.id); }); walk(u.id); below.add(u.id); }
  return modal({ title: u ? 'Edit unit' : 'Add a unit', submit: 'Save', danger: false,
    body: `<label class="f">Name<input name="name" value="${esc(u?.name || '')}" required></label>
      <label class="f">Inside<select name="parent_id"><option value="">Nothing (top level)</option>${hrUnitsOrdered().filter(x => !below.has(x.id)).map(x => `<option value="${x.id}" ${(u ? u.parent_id : parent) === x.id ? 'selected' : ''}>${'  '.repeat(x.depth)}${esc(x.name)}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="is_department" ${u?.is_department ? 'checked' : ''}> It’s a department <span class="sub">(its head is the Head of department for everyone under it)</span></label>
      ${u ? `<label class="f mt">Head of the unit<select name="head_position_id">${hrPosOpts(u.head_position_id, 'The top position in the unit')}</select></label>
      <label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> In use <span class="sub">(untick to archive it)</span></label>
      <div class="mt"><button type="button" class="btn small danger" id="del">Delete this unit</button></div>` : ''}`,
    onOpen: (d, close) => { const x = $('#del', d); if (x) x.onclick = hrTry(async () => { if (!confirm('Delete this unit?')) return; await q(sb.rpc('hr_unit_delete', { p_id: u.id })); close(null); toast('Deleted'); hrInvalidate(); render({ quiet: true }); }); },
    onSubmit: async x => { const p = { id: u?.id, name: x.name, parent_id: x.parent_id, is_department: !!x.is_department };
      if (u) { p.head_position_id = x.head_position_id; p.active = !!x.active; }
      await hrSave('hr_unit_save', { p }); } });
}
function hrPosForm(p, unit) {
  return modal({ title: p ? 'Edit position' : 'Add a position', submit: 'Save', wide: true,
    body: `<div class="row2"><label class="f">Title<input name="title" value="${esc(p?.title || '')}" required></label><label class="f">Unit<select name="unit_id">${hrUnitOpts(p ? p.unit_id : unit)}</select></label></div>
      <div class="row2"><label class="f">Reports to<select name="reports_to">${hrPosOpts(p?.reports_to, 'Nobody (top of the chart)', p?.id)}</select></label>
        <label class="f">Dotted line to <span class="hint">Optional: a second manager, shown on the chart</span><select name="dotted_to">${hrPosOpts(p?.dotted_to, 'None', p?.id)}</select></label></div>
      <div class="row3"><label class="f">Grade<select name="grade_id">${hrListOpts('grade', p?.grade_id)}</select></label><label class="f">Work location<select name="location_id">${hrListOpts('location', p?.location_id)}</select></label>
        <label class="f">How many people<input type="number" name="headcount" min="1" value="${p?.headcount || 1}"></label></div>
      <label class="f">Notes<input name="notes" value="${esc(p?.notes || '')}"></label>
      <label class="check"><input type="checkbox" name="is_external" ${p?.is_external ? 'checked' : ''}> External adviser or firm <span class="sub">(not an employee, never “vacant”)</span></label>
      ${p ? `<label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> In use <span class="sub">(untick to archive it)</span></label><div class="mt"><button type="button" class="btn small danger" id="del">Delete this position</button></div>` : ''}`,
    onOpen: (d, close) => { const x = $('#del', d); if (x) x.onclick = hrTry(async () => { if (!confirm('Delete this position? Positions reporting to it move up a level.')) return; await q(sb.rpc('hr_position_delete', { p_id: p.id })); close(null); toast('Deleted'); hrInvalidate(); render({ quiet: true }); }); },
    onSubmit: async x => { const v = { id: p?.id, title: x.title, unit_id: x.unit_id, reports_to: x.reports_to, dotted_to: x.dotted_to, grade_id: x.grade_id, location_id: x.location_id, headcount: x.headcount, notes: x.notes, is_external: !!x.is_external };
      if (p) v.active = !!x.active; await hrSave('hr_position_save', { p: v }); } });
}

// ---- lists
function hrSetLists() {
  return `<div class="grid3 hr-lists">${Object.entries(HR_LIST_KINDS).map(([k, [title]]) => { const ls = S.hr.lists.filter(l => l.kind === k).sort((a, b) => a.sort - b.sort);
    return `<section class="panel"><header><h2>${title}</h2><span class="meta">${ls.length}</span></header>
      ${ls.length ? `<ul class="list">${ls.map(l => `<li class="${l.active ? '' : 'off'}"><span class="name">${esc(l.name)}</span>${l.active ? '' : chip('muted', 'Archived')}<span class="end"><button class="btn small link" data-le="${l.id}">Rename</button><button class="btn small link" data-la="${l.id}">${l.active ? 'Archive' : 'Restore'}</button><button class="btn small link danger" data-ld="${l.id}">Delete</button></span></li>`).join('')}</ul>` : `<div class="empty">None yet.${k === 'grade' ? ' Add your grade levels (e.g. G1–G10).' : ''}</div>`}
      <form class="body hr-addrow" data-la-kind="${k}"><input name="name" placeholder="Add a ${esc(HR_LIST_KINDS[k][1].toLowerCase())}"><button class="btn small" type="submit">${ico('plus')}Add</button></form></section>`; }).join('')}</div>`;
}
function hrBindLists(main) {
  $$('[data-la-kind]', main).forEach(f => f.onsubmit = hrTry(async e => { e.preventDefault(); const n = f.name.value.trim(); if (!n) return; await hrSave('hr_list_save', { p: { kind: f.dataset.laKind, name: n } }, 'Added'); }));
  $$('[data-le]', main).forEach(b => b.onclick = () => { const l = hrList(+b.dataset.le); modal({ title: 'Rename', body: `<label class="f">Name<input name="name" value="${esc(l.name)}" required></label>`, onSubmit: x => hrSave('hr_list_save', { p: { id: l.id, name: x.name } }) }); });
  $$('[data-la]', main).forEach(b => b.onclick = hrTry(() => { const l = hrList(+b.dataset.la); return hrSave('hr_list_save', { p: { id: l.id, active: !l.active } }); }));
  $$('[data-ld]', main).forEach(b => b.onclick = hrTry(() => confirm('Delete it?') && hrSave('hr_list_delete', { p_id: +b.dataset.ld }, 'Deleted')));
}

// ---- custom fields
function hrSetFields() {
  const fs = S.hr.fields.slice().sort((a, b) => a.sort - b.sort);
  return `<section class="panel"><header><h2>Custom fields</h2><span class="meta">Extra details HR keeps on each record</span><div class="right"><button class="btn small primary" id="nf">${ico('plus')}Add a field</button></div></header>
    <div class="body muted">Choose who can see each field. <b>Everyone</b>: shown in the directory. <b>Managers and HR</b>: line managers see it for their team. <b>HR only</b>: HR and the person. <b>Locked</b>: like bank details: HR admins and the person, and every look is logged.</div>
    ${fs.length ? `<div class="tablewrap"><table class="t stack"><thead><tr><th>Field</th><th>Kind</th><th>Who can see it</th><th></th></tr></thead><tbody>${fs.map(f => `<tr class="${f.active ? '' : 'off'}"><td class="name">${esc(f.label)}${f.active ? '' : ' ' + chip('muted', 'Archived')}</td>
      <td>${esc({ text: 'Text', number: 'Number', date: 'Date', list: 'List: ' + (f.options || []).join(', ') }[f.kind])}</td><td>${f.visibility === 'locked' ? ico('lock') : ''}${esc(HR_VIS[f.visibility])}</td><td class="num"><button class="btn small" data-ef="${f.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">No custom fields yet. Examples: Blood group, T-shirt size, Offshore survival (BOSIET) expiry, Professional body.</div>'}</section>`;
}
function hrBindFields(main) {
  const form = f => modal({ title: f ? 'Edit field' : 'Add a field', submit: 'Save',
    body: `<label class="f">Field name<input name="label" value="${esc(f?.label || '')}" required></label>
      <div class="row2"><label class="f">Kind<select name="kind" id="fk">${[['text', 'Text'], ['number', 'Number'], ['date', 'Date'], ['list', 'Pick from a list']].map(([k, l]) => opt(k, l, f?.kind || 'text')).join('')}</select></label>
        <label class="f" id="fo">Choices <span class="hint">Separate with commas</span><input name="options" value="${esc((f?.options || []).join(', '))}"></label></div>
      <div class="f">Who can see it<div class="segi">${Object.entries(HR_VIS).map(([k, l]) => `<label><input type="radio" name="visibility" value="${k}" ${(f?.visibility || 'hr') === k ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></div>
      ${f ? `<label class="check"><input type="checkbox" name="active" ${f.active ? 'checked' : ''}> In use</label><div class="mt"><button type="button" class="btn small danger" id="del">Delete this field</button></div>` : ''}`,
    onOpen: (d, close) => { const k = $('#fk', d), o = $('#fo', d); const sync = () => { o.hidden = k.value !== 'list'; }; k.onchange = sync; sync();
      const x = $('#del', d); if (x) x.onclick = hrTry(async () => { if (!confirm('Delete this field?')) return; await q(sb.rpc('hr_field_delete', { p_id: f.id })); close(null); toast('Deleted'); hrInvalidate(); render({ quiet: true }); }); },
    onSubmit: x => { if (f && f.visibility !== x.visibility && (f.visibility === 'locked' || x.visibility === 'locked')) throw new Error('A field can’t be moved in or out of the locked section once it exists. Add a new field instead.');
      return hrSave('hr_field_save', { p: { id: f?.id, label: x.label, kind: x.kind, visibility: x.visibility, options: x.kind === 'list' ? x.options.split(',').map(s => s.trim()).filter(Boolean) : null, ...(f ? { active: !!x.active } : {}) } }); } });
  $('#nf', main).onclick = () => form(null);
  $$('[data-ef]', main).forEach(b => b.onclick = () => form(S.hr.fields.find(f => f.id === +b.dataset.ef)));
}

// ---- approval chains
const HR_FLOW_INFO = { profile_change: 'When someone asks to change their own details. Changes to bank, tax and pension details always go to HR admins only.', leave: 'Leave requests. When the person names a relief officer, the relief officer accepts first, then these steps.' };
function hrStepText(s) {
  const who = s.who === 'position' ? (hrPos(s.position_id)?.title || 'Position') : s.who === 'person' ? (hrNameOf(s.employee_id) || 'Named person') : HR_WHO[s.who];
  return (s.label && s.label !== who ? `${s.label} (${who})` : who) + (s.if?.field ? ` · only if ${s.if.field} ${s.if.op} ${s.if.value}` : '');
}
function hrSetFlows() {
  const kinds = [...new Set([...Object.keys(HR_REQ), ...S.hr.flows.map(f => f.kind)])];
  return `<section class="panel"><header><h2>Approval chains</h2><span class="meta">Who approves each kind of request, in order</span></header>
    <div class="body muted">Each step is decided by one person. Steps with nobody to decide (for example a vacant manager) are skipped, and so is someone who already approved an earlier step.
      Stand-ins set on My profile can approve for the person they cover. Reminders go out when a step waits longer than the reminder time.</div>
    <ul class="list">${kinds.map(k => { const f = S.hr.flows.find(x => x.kind === k);
      return `<li><div style="flex:1"><div class="name">${esc(f?.name || HR_REQ[k] || k)} ${f && !f.active ? chip('muted', 'Off') : ''}</div><div class="sub">${esc(HR_FLOW_INFO[k] || '')}</div>
        <div class="hr-steps">${(f?.steps || []).map(s => `<span class="hr-step">${esc(hrStepText(s))}</span>`).join('<i></i>') || '<span class="sub">Not set up</span>'}</div>
        ${f ? `<div class="sub">Reminder after ${plural(f.remind_days, 'day')} waiting${f.updated_by_name ? ' · changed by ' + esc(f.updated_by_name) + ' ' + fdt(f.updated_at) : ''}</div>` : ''}</div>
        <div class="end"><button class="btn small" data-fl="${esc(k)}">${ico('edit')}Edit</button></div></li>`; }).join('')}</ul></section>`;
}
function hrBindFlows(main) {
  $$('[data-fl]', main).forEach(b => b.onclick = () => {
    const k = b.dataset.fl; const f = S.hr.flows.find(x => x.kind === k) || { kind: k, name: HR_REQ[k] || k, steps: [{ who: 'hr' }], remind_days: 2, active: true };
    let steps = JSON.parse(JSON.stringify(f.steps || []));
    const row = (s, i) => `<div class="hr-flowrow" data-i="${i}"><span class="hr-fnum">${i + 1}</span>
      <select data-k="who">${Object.entries(HR_WHO).map(([w, l]) => opt(w, l, s.who)).join('')}</select>
      ${s.who === 'position' ? `<select data-k="position_id">${hrPosOpts(s.position_id, 'Choose the position…')}</select>` : s.who === 'person' ? `<select data-k="employee_id">${hrPeopleOpts(s.employee_id)}</select>` : ''}
      <input data-k="label" placeholder="Name on screen (optional)" value="${esc(s.label || '')}">
      <span class="hr-fif">only if <input data-k="if_field" placeholder="field" value="${esc(s.if?.field || '')}" size="6"><select data-k="if_op">${['>', '>=', '<', '<=', '='].map(o => opt(o, o, s.if?.op || '>')).join('')}</select><input data-k="if_value" placeholder="value" value="${esc(s.if?.value ?? '')}" size="4"></span>
      <span class="hr-fbtn"><button type="button" class="btn small link" data-up="${i}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn small link" data-dn="${i}" ${i < steps.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="btn small link danger" data-rm="${i}">✕</button></span></div>`;
    const read = d => { steps = $$('.hr-flowrow', d).map(r => { const g = k2 => $(`[data-k="${k2}"]`, r)?.value ?? ''; const s = { who: g('who') };
      if (s.who === 'position') s.position_id = +g('position_id') || null; if (s.who === 'person') s.employee_id = +g('employee_id') || null;
      if (g('label').trim()) s.label = g('label').trim(); if (g('if_field').trim() && g('if_value').trim() !== '') s.if = { field: g('if_field').trim(), op: g('if_op'), value: +g('if_value') };
      return s; }); };
    const draw = d => { const box = $('#fsteps', d); box.innerHTML = steps.map(row).join('') || '<div class="sub">No steps yet.</div>';
      $$('[data-k="who"]', box).forEach(x => x.onchange = () => { read(d); draw(d); });
      $$('[data-up]', box).forEach(x => x.onclick = () => { read(d); const i = +x.dataset.up; [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; draw(d); });
      $$('[data-dn]', box).forEach(x => x.onclick = () => { read(d); const i = +x.dataset.dn; [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; draw(d); });
      $$('[data-rm]', box).forEach(x => x.onclick = () => { read(d); steps.splice(+x.dataset.rm, 1); draw(d); }); };
    modal({ title: `Approval chain: ${f.name}`, wide: true, submit: 'Save', sub: esc(HR_FLOW_INFO[k] || ''),
      body: `<div id="fsteps" class="hr-flow"></div><button type="button" class="btn small" id="fadd">${ico('plus')}Add a step</button>
        <div class="row2 mt"><label class="f">Reminder after (days waiting)<input type="number" name="remind_days" min="1" max="30" value="${f.remind_days}"></label>
        <label class="check" style="align-self:end"><input type="checkbox" name="active" ${f.active ? 'checked' : ''}> In use</label></div>
        <p class="sub">“Only if” uses a number on the request, for example <b>days &gt; 10</b> for long leave. Leave it empty for a step that always applies.</p>`,
      onOpen: d => { draw(d); $('#fadd', d).onclick = () => { read(d); steps.push({ who: 'line_manager' }); draw(d); }; },
      onSubmit: (x, d) => { read(d); return hrSave('hr_flow_save', { p: { kind: k, name: f.name, steps, remind_days: x.remind_days, active: !!x.active } }); } });
  });
}

// ---- employee numbers
function hrSetEmpno() {
  const f = hrEmpnoFmt();
  const ORDERS = [['prefix,seq,year', 'Prefix · number · year joined'], ['prefix,year,seq', 'Prefix · year joined · number'], ['prefix,seq', 'Prefix · number']];
  return `<section class="panel"><header><h2>Employee numbers</h2></header><div class="body">
    <p class="muted">New records get the next number automatically. HR can type over it on any record.</p>
    <form id="enf" class="hr-empno"><div class="row3"><label class="f">Prefix<input name="prefix" value="${esc(f.prefix)}" maxlength="8"></label>
      <label class="f">Running number digits<select name="digits">${[1, 2, 3, 4, 5, 6].map(n => opt(n, n + (n === 3 ? ' (001)' : ''), f.digits)).join('')}</select></label>
      <label class="f">Order<select name="order">${ORDERS.map(([k, l]) => opt(k, l, f.order)).join('')}</select></label></div>
      <div class="hr-sample">Example: <b id="ens">${esc(hrEmpnoSample(f))}</b> <span class="sub">(the 5th person, joined in 2022)</span></div>
      <button class="btn primary" type="submit">Save</button></form></div></section>`;
}
function hrBindEmpno(main) {
  const f = $('#enf', main); const val = () => ({ prefix: f.prefix.value.trim(), digits: +f.digits.value, order: f.order.value });
  f.oninput = f.onchange = () => { $('#ens', main).textContent = hrEmpnoSample(val()); };
  f.onsubmit = hrTry(async e => { e.preventDefault(); const v = val(); await q(sb.rpc('hr_settings_save', { p: { empno: v } })); S.settings.people = { ...(S.settings.people || {}), empno: v }; toast('Saved'); render({ quiet: true }); });
}

// ---- HR team
function hrSetRoles() {
  const sup = Object.values(S.people).filter(p => p.role === 'superadmin');
  const rows = [...sup.map(p => ({ p, role: 'hr_admin', fixed: true })), ...S.hr.roles.filter(r => !sup.some(s => s.id === r.profile_id)).map(r => ({ p: S.people[r.profile_id] || { id: r.profile_id, email: '?' }, role: r.role, by: r.set_by_name, at: r.set_at }))];
  const taken = new Set(rows.map(r => r.p.id));
  const cand = Object.values(S.people).filter(p => !taken.has(p.id) && !['pending', 'disabled'].includes(p.role)).sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
  return `<section class="panel"><header><h2>HR team</h2><span class="meta">Who can see and manage staff records</span></header>
    <div class="body muted"><b>HR admins</b> see and change everything, including the locked section and these settings. <b>HR officers</b> see and update staff records and approve HR steps, but not the locked section.
      ${realSuper() ? 'You (Developer) are always an HR admin.' : 'Only the Developer can add HR admins.'}</div>
    <ul class="list">${rows.map(r => `<li><div style="flex:1"><div class="name">${esc(r.p.full_name || r.p.email)}</div><div class="sub">${esc(r.p.email || '')}${r.fixed ? ' · Developer' : r.by ? ` · added by ${esc(r.by)} ${fd(r.at)}` : ''}</div></div>
      <div class="end">${chip(r.role === 'hr_admin' ? 'out' : 'reserved', r.role === 'hr_admin' ? 'HR admin' : 'HR officer')}${!r.fixed && (realSuper() || r.role === 'hr_officer') ? ` <button class="btn small" data-rr="${r.p.id}">Remove</button>` : ''}</div></li>`).join('')}</ul>
    <form class="body hr-addrow" id="radd"><select name="pid"><option value="">Add someone…</option>${cand.map(p => opt(p.id, (p.full_name || p.email) + ' · ' + p.email, '')).join('')}</select>
      <select name="role">${opt('hr_officer', 'HR officer', '')}${realSuper() ? opt('hr_admin', 'HR admin', '') : ''}</select><button class="btn small primary" type="submit">${ico('plus')}Add</button></form></section>`;
}
function hrBindRoles(main) {
  const f = $('#radd', main); f.onsubmit = hrTry(async e => { e.preventDefault(); if (!f.pid.value) return toast('Choose someone first', true); await hrSave('hr_role_set', { p_profile: f.pid.value, p_role: f.role.value }, 'Added to the HR team'); });
  $$('[data-rr]', main).forEach(b => b.onclick = hrTry(() => confirm('Remove them from the HR team?') && hrSave('hr_role_set', { p_profile: b.dataset.rr, p_role: null }, 'Removed')));
}

// ---- activity log
const HR_LOG_ACT = { insert: 'Added', update: 'Changed', delete: 'Removed', view: 'Viewed', request: 'Request sent', backup: 'Downloaded a backup' };
const HR_LOG_TBL = { hr_employees: 'record', hr_private: 'locked section', hr_kin: 'next of kin', hr_documents: 'document', hr_units: 'unit', hr_positions: 'position', hr_lists: 'list item',
  hr_fields: 'custom field', hr_flows: 'approval chain', hr_roles: 'HR team', hr_standins: 'stand-in', hr_requests: 'request' };
async function hrSetLog(params) {
  const emp = params.get('emp'), act = params.get('a');
  let qy = sb.from('hr_log').select('*').order('at', { ascending: false }).limit(300);
  if (emp) qy = qy.eq('employee_id', +emp); if (act) qy = qy.eq('action', act);
  const rows = await q(qy);
  const det = r => { const d = r.detail || {}; if (r.action === 'view' || r.action === 'backup') return esc(d.what || '');
    if (r.action === 'request') return esc(d.title || '');
    return Object.entries(d).filter(([k]) => !['id', 'employee_id', 'custom', 'sort'].includes(k) || r.action === 'update').slice(0, 8).map(([k, v]) => v?.changed ? `<span class="hr-lk">${esc(HR_LABEL[k] || k)}</span>` : v && typeof v === 'object' && 'to' in v ? `<span class="hr-lk">${esc(HR_LABEL[k] || k)}</span>${r.action === 'update' ? `: ${esc(fmtv(v.from))} → ${esc(fmtv(v.to))}` : `: ${esc(fmtv(v.to))}`}` : '').filter(Boolean).join(' · '); };
  const fmtv = v => v == null || v === '' ? '(blank)' : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60);
  return `<div class="filters"><select id="le"><option value="">Everyone</option>${S.hr.dir.map(c => opt(c.id, c.name, emp)).join('')}</select>
      <select id="la"><option value="">Every action</option>${Object.entries(HR_LOG_ACT).map(([k, l]) => opt(k, l, act)).join('')}</select><span class="sub">Latest ${rows.length}. Only HR admins see this log. Locked values are never stored in it.</span></div>
    <section class="panel">${rows.length ? `<ul class="list audit">${rows.map(r => `<li><div style="flex:1;min-width:0"><div><b>${esc(r.user_name || 'System')}</b> ${esc((HR_LOG_ACT[r.action] || r.action).toLowerCase())} ${esc(HR_LOG_TBL[r.table_name] || r.table_name || '')}${r.employee_id ? ` · <a href="#/people/emp/${r.employee_id}">${esc(hrNameOf(r.employee_id) || 'record ' + r.employee_id)}</a>` : ''}
      ${r.action === 'view' || r.action === 'backup' ? ' ' + chip('pending', 'Locked data viewed') : ''}</div><div class="sub">${det(r)}</div></div><div class="end sub">${fdt(r.at)}</div></li>`).join('')}</ul>` : '<div class="empty">Nothing logged yet.</div>'}</section>`;
}
function hrBindLog(main, params) {
  const upd = () => { const e = $('#le', main).value, a = $('#la', main).value; go('#/people/settings?tab=log' + (e ? '&emp=' + e : '') + (a ? '&a=' + a : '')); };
  $('#le', main).onchange = upd; $('#la', main).onchange = upd;
}
