/* GANKCO Nest 3.0.4 — PeopleCore Disciplinary: cases, grievances, whistleblowing, queries, sanctions, appeals,
   meetings, letters and historic data. Admin, Supervisor and self service. */
'use strict';

const DC = PC_MODS.disc;
DC.menu = [['', 'Overview', 'home'], ['cases', 'Cases', 'audit', ['view-disciplinary-cases', 'view-disciplinary-admin']], ['grievances', 'Grievances', 'users', ['view-grievances']],
  ['queries', 'Queries', 'check', ['view-disciplinary-queries', 'view-disciplinary-query']], ['whistles', 'Whistleblowing', 'bell', ['view-disciplinary-whistles', 'view-disciplinary-whistle']],
  ['sanctions', 'Sanctions', 'lock', ['view-disciplinary-sanctions', 'view-disciplinary-sanction']], ['appeals', 'Appeals', 'move', ['view-appeal-processes', 'view-appeal-process']],
  ['settings', 'Settings', 'gear', ['manage-disciplinary-settings']], ['historic', 'Historic data', 'up', ['view-disciplinary-historic-data']]];
const pcDcCfg = () => hrSettings().disc || {};
const pcTerm = (k, d) => pcDcCfg().terms?.[k] || d;
const PC_DC_ST = { open: ['pending', 'Open'], resolved: ['ok', 'Resolved'], closed: ['muted', 'Closed'] };
const PC_OUT = { notified: ['muted', 'was notified'], sanctioned: ['rejected', 'Sanctioned'], acquitted: ['ok', 'Acquitted'], resolved: ['ok', 'Resolved'], queried: ['pending', 'Queried'] };
const PC_SAN_ST = { active: ['rejected', 'Active'], reverted: ['ok', 'Reversed'], recalled: ['ok', 'Recalled'], completed: ['muted', 'Completed'] };
const pcLevel = n => n >= 2 ? 'Level II' : 'Level I';
const pcOffence = id => { const o = hrList(id); if (!o) return ''; return (hrListName(o.parent_id) ? hrListName(o.parent_id) + ': ' : '') + o.name; };
const pcOffenceOpts = sel => '<option value="">Choose…</option>' + pcLists('offence_category', true).map(c => `<optgroup label="${esc(c.name)}">${S.hr.lists.filter(o => o.kind === 'offence' && o.parent_id === c.id && (o.active || o.id === +sel)).map(o => opt(o.id, o.name, sel)).join('')}</optgroup>`).join('');

// ---------------------------------------------------------------- Overview
DC.pages[''] = {
  async load() {
    const o = await q(sb.rpc('hr_disc_overview'));
    return topbar('Disciplinary', 'Cases, queries, sanctions, grievances and whistleblowing.', pcCan('create-disciplinary-case') ? `<button class="btn primary" id="dcnew">${ico('plus')}Report a ${esc(pcTerm('case', 'case').toLowerCase())}</button>` : '') +
      pcKpis([[o.open, 'Open', o.open ? 'warn' : '', '#/people/admin/disc/cases'], [o.cases, pcTerm('case', 'Case') + 's'], [o.grievances, pcTerm('grievance', 'Grievance') + 's', '', '#/people/admin/disc/grievances'],
        [o.queries_open, 'Queries waiting', o.queries_open ? 'warn' : '', '#/people/admin/disc/queries'], [o.sanctions, pcTerm('sanction', 'Sanction') + 's', '', '#/people/admin/disc/sanctions'], [o.suspended, 'Suspended today'], [o.appeals, 'Appeals waiting', o.appeals ? 'warn' : '', '#/people/admin/disc/appeals'], [o.whistles, 'Whistles']]) +
      `<div class="pc-grid2"><section class="panel"><header><h2>Cases and grievances per month</h2></header>${pcBars(o.by_month)}</section><section class="panel"><header><h2>Case level</h2></header>${pcBars(o.by_level, { pct: true })}</section>
        <section class="panel"><header><h2>Sanctions by type</h2></header>${pcBars(o.by_sanction, { pct: true })}</section>
        <section class="panel"><header><h2>Meetings and closure</h2></header>${pcBars([{ name: 'Meetings scheduled', n: o.meetings.scheduled }, { name: 'Meetings held', n: o.meetings.held }, { name: 'Created', n: o.created_closed.created }, { name: 'Closed', n: o.created_closed.closed }])}</section></div>`;
  },
  bind(main) { const b = $('#dcnew', main); if (b) b.onclick = () => pcDiscReport('case'); }
};

// report a case / raise a grievance / blow the whistle
function pcDiscReport(kind) {
  const isCase = kind === 'case', wh = kind === 'whistle';
  const fields = [...(isCase || kind === 'grievance' ? [{ k: 'offence_id', l: pcTerm('offence', 'Offence'), t: 'select', req: isCase, opts: v => pcOffenceOpts(v) }] : [{ k: 'title', l: 'Subject', req: true }]),
    { k: 'employees', l: isCase ? 'Employees involved' : 'Who it’s about (optional)', t: 'checks', opts: pcPeopleList(isCase ? null : hrMe()?.id) },
    { k: 'description', l: 'What happened', t: 'textarea', req: true, rows: 5 }, { k: 'incident_at', l: 'Date and time of the incident', t: 'datetime-local' },
    ...(isCase ? [{ k: 'level', l: 'Severity level', t: 'radio', opts: [['1', 'Level I'], ['2', 'Level II']], def: '1' }] : []),
    ...(wh ? [{ k: 'anonymous', l: 'Report anonymously', t: 'switch', hint: 'Your name isn’t stored with the report.' }] : []), { k: 'files', l: 'Attachments (up to 5, 3 MB each)', t: 'file' }];
  return pcEdit({ title: isCase ? `Report a ${pcTerm('case', 'case').toLowerCase()}` : wh ? 'Blow the whistle' : `Raise a ${pcTerm('grievance', 'grievance').toLowerCase()}`,
    sub: wh ? 'Report wrongdoing safely. Only disciplinary admins see it.' : kind === 'grievance' ? 'Tell HR about something that’s wrong at work. It goes to the disciplinary admins.' : '', fields, vals: { level: '1', anonymous: true },
    onOpen: d => { const f = $('[name=files]', d); if (f) { f.multiple = true; f.accept = '.png,.jpg,.jpeg,.doc,.docx,.pdf,.xls,.xlsx,.csv'; } },
    save: async (v, d) => { const files = []; for (const f of [...($('[name=files]', d)?.files || [])].slice(0, 5)) { if (f.size > 3 * 1024 * 1024) throw new Error(f.name + ' is bigger than 3 MB'); files.push(await hrReadFile(f)); }
      const id = await q(sb.rpc('hr_disc_report', { p: { ...v, kind, files, incident_at: v.incident_at ? new Date(v.incident_at).toISOString() : null } }));
      toast(wh ? 'Sent. Thank you for speaking up.' : 'Sent'); pcInvalidate(); if (isCase) go('#/people/admin/disc/case/' + id); else pcRefresh(); } });
}

// ---------------------------------------------------------------- lists
const pcDcList = (kind, title, sub, perms) => ({ perms,
  async load() {
    const rows = (await q(sb.rpc('hr_disc_list', { p_scope: 'admin' }))).filter(r => r.kind === kind); S.pc.dcl = rows;
    return topbar(title, sub, kind === 'case' && pcCan('create-disciplinary-case') ? `<button class="btn primary" id="dcnew">${ico('plus')}Report a ${esc(pcTerm('case', 'case').toLowerCase())}</button>` : '') +
      pcTable('dc_' + kind, [{ k: 'case_no', l: 'Case ID', f: r => `<b>${esc(r.case_no)}</b>${r.historic ? ' ' + pcChip('muted', 'Historic') : ''}` }, { k: 'title', l: kind === 'case' ? 'Report title' : 'Subject', f: r => esc(r.title) + (r.category ? `<br><small class="muted">${esc(r.category)}</small>` : '') },
        ...(kind === 'case' ? [{ l: 'Severity', v: r => r.level, f: r => pcChip(r.level >= 2 ? 'rejected' : 'pending', pcLevel(r.level)) }] : []), { l: 'Reported by', v: r => r.reported_by || 'Anonymous', f: r => esc(r.reported_by || 'Anonymous') },
        { l: 'Employee(s) involved', sort: false, v: r => r.people.map(p => p.name).join(', '), f: r => r.people.map(p => `${esc(p.name)} ${pcChip(...(PC_OUT[p.outcome] || ['muted', p.outcome]))}`).join('<br>') || '—' },
        { l: 'Status', v: r => r.status, f: r => pcChip(...PC_DC_ST[r.status]) }, { l: 'Date', v: r => r.created_at, f: r => fd(r.created_at) }], rows,
        { noun: kind, csv: title, href: r => '#/people/admin/disc/case/' + r.id, empty: `No ${title.toLowerCase()} yet.`, search: r => [r.case_no, r.title, r.reported_by, ...r.people.map(p => p.name)].join(' '),
          filters: [{ k: 's', l: 'Status', opts: Object.entries(PC_DC_ST).map(([k, v]) => [k, v[1]]), test: (r, v) => r.status === v }, ...(kind === 'case' ? [{ k: 'l', l: 'Level', opts: [['1', 'Level I'], ['2', 'Level II']], test: (r, v) => String(r.level) === v }] : [])] });
  },
  bind(main) { const b = $('#dcnew', main); if (b) b.onclick = () => pcDiscReport('case'); }
});
DC.pages.cases = pcDcList('case', 'Cases', 'Disciplinary cases. Open one to add reviewers, meetings, queries and sanctions.', ['view-disciplinary-cases', 'view-disciplinary-admin']);
DC.pages.grievances = pcDcList('grievance', 'Grievances', 'Raised by staff. Resolve them, or convert one into a disciplinary case.', ['view-grievances']);
DC.pages.whistles = pcDcList('whistle', 'Whistleblowing', 'Reports staff made, some anonymously. Convert one into a case to act on it.', ['view-disciplinary-whistles', 'view-disciplinary-whistle']);

// ---------------------------------------------------------------- one case
DC.pages.case = { perms: ['view-disciplinary-admin', 'view-disciplinary-cases', 'view-grievances'],
  async load(rest) { return pcCasePage(+rest[0], 'admin'); },
  bind(main, rest) { pcBindCase(main, +rest[0]); }
};
async function pcCasePage(id, mode) {
  const c = await q(sb.rpc('hr_disc_get', { p_id: id })); S.pc.case = c; S.pc.caseMode = mode;
  const adm = c.admin; const open = c.status !== 'closed'; const canS = adm ? pcCan('sanction-employee') : (c.my_parts || []).length > 0;
  const me = hrMe()?.id;
  const person = p => `<li><div class="main"><b>${esc(p.name)}</b> ${pcChip(...(PC_OUT[p.outcome] || ['muted', p.outcome]))}${p.sanctions ? ' <small class="muted">has a sanction history on this case</small>' : ''}${p.note ? `<small>${esc(p.note)}</small>` : ''}</div>
    ${open && (adm || canS) ? `<span class="pc-acts">${canS ? `<button class="btn small" data-act="sanction" data-emp="${p.employee_id}">${esc(pcTerm('sanction', 'Sanction'))}</button>` : ''}${adm && pcCan('acquit-an-employee') && p.outcome !== 'acquitted' ? `<button class="btn small" data-act="acquit" data-emp="${p.employee_id}">Acquit</button>` : ''}${adm && pcCan('create-manual-query') ? `<button class="btn small" data-act="query" data-emp="${p.employee_id}">${esc(pcTerm('query', 'Query'))}</button>` : ''}</span>` : ''}</li>`;
  const sanction = s => `<li><div class="main"><b>${esc(s.type || '')} ${pcChip(...PC_SAN_ST[s.status])}</b><small>${esc(s.name)} · ${s.from_date ? fd(s.from_date) : ''}${s.to_date ? ' – ' + fd(s.to_date) : ''}${s.points ? ` · ${s.points} points` : ''}${s.note ? ' · ' + esc(s.note) : ''}${s.reverted_reason ? ' · reversed: ' + esc(s.reverted_reason) : ''}${s.recalled_on ? ' · recalled ' + fd(s.recalled_on) : ''}${s.exit_id ? ` · <a href="#/people/admin/exit/view/${s.exit_id}">exit opened</a>` : ''}${s.appeal ? ` · appeal ${esc(s.appeal.status)}` : ''}</small></div>
    <span class="pc-acts">${s.template_id ? `<button class="btn small" data-letter="${s.id}">${ico('print')}Letter</button>` : ''}${adm && open && s.status === 'active' && pcCan('reverse-sanction') ? `<button class="btn small" data-act="revert" data-s="${s.id}">Reverse</button>` : ''}
      ${adm && open && s.status === 'active' && s.affects === 'suspension' && pcCan('recall-from-suspension') ? `<button class="btn small" data-act="recall" data-s="${s.id}">Recall from suspension</button>` : ''}
      ${mode === 'self' && s.employee_id === me && s.status === 'active' && pcDcCfg().appeals_on !== false && !s.appeal ? `<button class="btn small primary" data-appeal="${s.id}">Appeal</button>` : ''}</span></li>`;
  const meeting = m => `<li><div class="main"><b>${esc(m.title)}</b> ${pcChip(m.status === 'held' ? 'ok' : m.status === 'cancelled' ? 'muted' : 'out', m.status)}<small>${fdt(m.at)}${m.place ? ' · ' + esc(m.place) : ''} · ${m.attendees.map(a => esc(pcName(a))).join(', ')}${m.minutes ? '<br>' + esc(m.minutes) : ''}</small></div>
    ${adm && open && m.status === 'scheduled' ? `<span class="pc-acts"><button class="btn small" data-meet="${m.id}" data-st="held">Mark held</button><button class="btn small" data-meet="${m.id}" data-st="cancelled">Cancel</button></span>` : ''}</li>`;
  const acts = adm && open ? [pcCan('edit-disciplinary-case') && '<button class="btn" data-act="add_reviewer">Add reviewer</button>', pcCan('edit-disciplinary-case') && '<button class="btn" data-act="add_committee">Add committee members</button>',
    pcCan('create-disciplinary-meeting') && '<button class="btn" data-act="meeting">New meeting</button>', c.kind === 'case' && c.level < 2 && pcCan('edit-disciplinary-case') && '<button class="btn" data-act="escalate">Escalate to Level II</button>',
    c.kind !== 'case' && pcCan('convert-grievance-to-disciplinary-case', 'convert-disciplinary-whistle-to-disciplinary-case') && '<button class="btn" data-act="convert">Convert to a case</button>',
    c.kind === 'grievance' && c.status === 'open' && '<button class="btn" data-act="resolve">Resolve grievance</button>', pcCan('close-disciplinary-case') && '<button class="btn danger" data-act="close">Close case</button>'].filter(Boolean)
    : adm && pcCan('close-disciplinary-case') ? ['<button class="btn" data-act="reopen">Reopen</button>'] : (c.my_parts || []).length && open && c.kind === 'grievance' ? ['<button class="btn" data-act="resolve">Resolve grievance</button>'] : [];
  const back = mode === 'admin' ? '#/people/admin/disc/' + (c.kind === 'case' ? 'cases' : c.kind === 'grievance' ? 'grievances' : 'whistles') : mode === 'sup' ? '#/people/sup/disc' : '#/people/disciplinary';
  return topbar(esc(c.title), `${esc(c.case_no)} · ${c.kind === 'case' ? pcLevel(c.level) : c.kind === 'grievance' ? pcTerm('grievance', 'Grievance') : 'Whistleblowing'} · reported by ${esc(c.reported_by || 'Anonymous')} ${fd(c.created_at)}`, `<a class="btn" href="${back}">Back</a>`) +
    `<div class="pc-prof"><aside class="pc-prof-side"><section class="panel"><header><h2>${esc(pcTerm('case', 'Case'))}</h2><span class="right">${pcChip(...PC_DC_ST[c.status])}</span></header><dl class="pc-kv" style="grid-template-columns:1fr">
        <div><dt>Case ID</dt><dd>${esc(c.case_no)}</dd></div>${c.offence_id ? `<div><dt>${esc(pcTerm('offence', 'Offence'))}</dt><dd>${esc(pcOffence(c.offence_id))}</dd></div>` : ''}<div><dt>Severity</dt><dd>${pcLevel(c.level)}</dd></div>
        <div><dt>Incident</dt><dd>${c.incident_at ? fdt(c.incident_at) : '—'}</dd></div><div><dt>Reported by</dt><dd>${esc(c.reported_by || 'Anonymous')}</dd></div>${c.closed_at ? `<div><dt>Closed</dt><dd>${fd(c.closed_at)} · ${esc(c.closed_by || '')}</dd></div>` : ''}
        ${c.reviewers.length ? `<div><dt>Reviewers</dt><dd>${c.reviewers.map(r => `${esc(r.name)} <small class="muted">${esc(r.part)}</small>`).join('<br>')}</dd></div>` : ''}</dl></section>
        ${acts.length ? `<div class="pc-prof-acts">${acts.join('')}</div>` : ''}</aside>
      <div><section class="panel"><header><h2>Description</h2></header><div class="body" style="white-space:pre-wrap">${esc(c.description || '')}</div>
          ${c.files.length ? `<div class="body" style="border-top:1px solid var(--line)">${c.files.map(f => `<button class="apfile" data-file="${f.id}">${ico('pdf')}${esc(f.file_name)}</button>`).join(' ')}</div>` : ''}</section>
        <section class="panel"><header><h2>Employees involved</h2>${adm && open && pcCan('edit-disciplinary-case') ? '<span class="right"><button class="btn small" data-act="add_people">Add</button></span>' : ''}</header>${c.people.length ? `<ul class="pc-items">${c.people.map(person).join('')}</ul>` : '<div class="empty">Nobody named.</div>'}</section>
        ${c.sanctions.length ? `<section class="panel"><header><h2>${esc(pcTerm('sanction', 'Sanction'))}s</h2></header><ul class="pc-items">${c.sanctions.map(sanction).join('')}</ul></section>` : ''}
        ${c.queries.length ? `<section class="panel"><header><h2>Queries</h2></header><ul class="pc-items">${c.queries.map(qq => `<li><div class="main"><b>${esc(qq.subject)}</b> · ${esc(pcName(qq.employee_id))} ${pcChip(qq.status === 'open' ? 'pending' : 'ok', qq.status)}<small>${qq.response ? '“' + esc(qq.response) + '”' : 'Due ' + fdt(qq.response_due)}</small></div></li>`).join('')}</ul></section>` : ''}
        ${c.meetings.length || adm ? `<section class="panel"><header><h2>Meetings</h2></header>${c.meetings.length ? `<ul class="pc-items">${c.meetings.map(meeting).join('')}</ul>` : '<div class="empty">No meetings yet.</div>'}</section>` : ''}
        <section class="panel"><header><h2>Comments and activity</h2></header><ul class="pc-timeline">${c.events.map(ev => `<li><b>${ev.kind === 'log' ? esc(ev.body) : esc(ev.by || '')}</b><small>${ev.kind === 'log' ? esc(ev.by || '') : `<span class="chip muted">${esc(ev.source || '')}</span>`} · ${fdt(ev.at)}</small>${ev.kind !== 'log' ? `<div style="white-space:pre-wrap">${esc(ev.body)}</div>` : ''}</li>`).join('') || '<li><small class="muted">Nothing yet.</small></li>'}</ul>
          <form class="body" id="dccom" style="border-top:1px solid var(--line)"><label class="f">Add a comment<textarea name="body" rows="2"></textarea></label><button class="btn small">Post</button></form></section></div></div>`;
}
function pcBindCase(main, id) {
  const c = S.pc.case; const run = async (action, p, msg = 'Done') => { await pcTry(() => q(sb.rpc('hr_disc_action', { p_case: id, p_action: action, p })), msg); pcRefresh(); };
  $('#dccom', main).onsubmit = async e => { e.preventDefault(); const b = e.target.body.value.trim(); if (!b) return; await run('comment', { body: b }, 'Posted'); };
  main.addEventListener('click', async e => {
    const fl = e.target.closest('[data-file]'); if (fl) return hrOpenFile(await q(sb.from('hr_disc_files').select('file_name,mime,data').eq('id', +fl.dataset.file).single()));
    const lt = e.target.closest('[data-letter]'); if (lt) return pcDiscLetter(c, c.sanctions.find(s => s.id === +lt.dataset.letter));
    const ap = e.target.closest('[data-appeal]'); if (ap) return pcEdit({ title: 'Appeal this ' + pcTerm('sanction', 'sanction').toLowerCase(), wide: false, fields: [{ k: 'reason', l: 'Why you’re appealing', t: 'textarea', req: true, rows: 5 }], submit: 'Send appeal',
      save: async v => { await q(sb.rpc('hr_disc_appeal', { p_sanction: +ap.dataset.appeal, p_reason: v.reason })); toast('Appeal sent'); pcRefresh(); } });
    const mt = e.target.closest('[data-meet]'); if (mt) { const st = mt.dataset.st;
      if (st === 'held') { const m = c.meetings.find(x => x.id === +mt.dataset.meet); return pcEdit({ title: 'Meeting held', fields: [{ k: 'present', l: 'Who attended', t: 'checks', opts: m.attendees.map(a => [a, pcName(a)]) }, { k: 'minutes', l: 'Minutes / outcome', t: 'textarea', rows: 5 }], vals: { present: m.attendees },
        save: v => run('meeting', { id: m.id, status: 'held', ...v }, 'Saved') }); }
      return run('meeting', { id: +mt.dataset.meet, status: st }); }
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; const emp = +b.dataset.emp || null;
    const pick = (title, part) => pcEdit({ title, fields: [{ k: 'employees', l: 'People', t: 'checks', req: true, opts: pcPeopleList() }, ...(part ? [{ k: 'part', l: 'Their part', t: 'select', blank: false, opts: ['Disciplinary Admin', 'Head of Department', 'Line Manager', 'Decision Maker', 'Witness'].map(x => [x, x]) }] : [])], save: v => run(a, v, 'Added') });
    if (a === 'add_people') return pick('Add employees involved');
    if (a === 'add_reviewer') return pick('Add reviewer', true);
    if (a === 'add_committee') return pick('Add ' + pcTerm('admin', 'committee').toLowerCase() + ' members');
    if (a === 'meeting') return pcEdit({ title: 'New disciplinary meeting', fields: [{ k: 'title', l: 'Title', req: true }, { k: 'at', l: 'Date and time', t: 'datetime-local', req: true }, { k: 'place', l: 'Where' }, { k: 'attendees', l: 'Invite', t: 'checks', req: true, opts: pcPeopleList() }],
      vals: { title: 'Disciplinary committee meeting', attendees: [...c.people.map(p => p.employee_id), ...c.reviewers.map(r => r.employee_id)] }, save: v => run('meeting', { ...v, at: new Date(v.at).toISOString() }, 'Meeting scheduled') });
    if (a === 'escalate') return pcEdit({ title: 'Escalate to Level II', wide: false, fields: [{ k: 'reason', l: 'Why', t: 'textarea' }], save: v => run('escalate', v, 'Escalated') });
    if (a === 'convert') return pcEdit({ title: 'Convert to a disciplinary case', wide: false, fields: [{ k: 'offence_id', l: pcTerm('offence', 'Offence'), t: 'select', req: true, opts: v => pcOffenceOpts(v) }], save: v => run('convert', v, 'Converted') });
    if (['resolve', 'close', 'reopen'].includes(a)) return pcEdit({ title: { resolve: 'Resolve grievance', close: 'Close case', reopen: 'Reopen case' }[a], wide: false, fields: [{ k: 'reason', l: 'Note', t: 'textarea' }], submit: { resolve: 'Resolve', close: 'Close', reopen: 'Reopen' }[a], save: v => run(a, v) });
    if (a === 'acquit') return pcEdit({ title: 'Acquit ' + pcName(emp), wide: false, fields: [{ k: 'reason', l: 'Reason', t: 'textarea', req: true }], submit: 'Acquit', save: v => run('acquit', { employee_id: emp, ...v }, 'Acquitted') });
    if (a === 'revert') return pcEdit({ title: 'Reverse ' + pcTerm('sanction', 'sanction').toLowerCase(), wide: false, fields: [{ k: 'reason', l: 'Reason', t: 'textarea', req: true }], submit: 'Reverse', save: v => run('revert', { sanction_id: +b.dataset.s, ...v }, 'Reversed') });
    if (a === 'recall') return pcEdit({ title: 'Recall from suspension', wide: false, fields: [{ k: 'date', l: 'Resume on', t: 'date', req: true }], vals: { date: localISO(0) }, submit: 'Recall', save: v => run('recall', { sanction_id: +b.dataset.s, ...v }, 'Recalled') });
    if (a === 'query') return pcDiscQuery([emp], id);
    if (a === 'sanction') {
      const types = pcLists('sanction_type'); const tpls = await q(sb.from('hr_disc_templates').select('*').eq('kind', 'sanction').eq('archived', false));
      return pcEdit({ title: `${pcTerm('sanction', 'Sanction')} for ${pcName(emp)}`, fields: [{ k: 'type_id', l: 'Type', t: 'select', req: true, opts: types.map(t => [t.id, t.name + ({ suspension: ' (switches off Nest sign-in for the dates)', exit: ' (opens an exit)', performance: ' (stored for Performance)' }[t.meta?.affects] || '')]) },
        { k: 'from_date', l: 'From', t: 'date' }, { k: 'to_date', l: 'To', t: 'date', hint: 'For suspensions' }, { k: 'points', l: 'Performance points', t: 'number', min: 0 }, { k: 'template_id', l: 'Letter', t: 'select', opts: tpls.map(t => [t.id, t.name]), blank: 'No letter' }, { k: 'note', l: 'Note', t: 'textarea' }],
        vals: { from_date: localISO(0) }, submit: 'Issue', save: v => run('sanction', { employee_id: emp, ...v }, 'Issued') });
    }
  });
}
async function pcDiscQuery(emps, caseId) {
  const tpls = await q(sb.from('hr_disc_templates').select('*').eq('kind', 'query').eq('archived', false));
  return pcEdit({ title: `Send a ${pcTerm('query', 'query').toLowerCase()}`, fields: [...(emps ? [] : [{ k: 'employees', l: 'Employees', t: 'checks', req: true, opts: pcPeopleList() }]), { k: 'template_id', l: 'Template', t: 'select', opts: tpls.map(t => [t.id, t.name]), blank: 'None' },
    { k: 'subject', l: 'Subject', req: true }, { k: 'body', l: 'Query', t: 'textarea', rows: 8 }, { k: 'response_hours', l: 'Reply within (hours)', t: 'number', min: 1 }], vals: { response_hours: 48 },
    onOpen: d => { $('[name=template_id]', d).onchange = e => { const t = tpls.find(x => x.id === +e.target.value); if (!t) return; $('[name=subject]', d).value = t.name;
      $('[name=body]', d).value = pcFill(t.body, { first_name: emps?.length === 1 ? (hrCard(emps[0])?.first_name || '') : '{first_name}', response_hours: $('[name=response_hours]', d).value, issuer: S.profile.full_name || '', incident_date: fd(localISO(0)) }); }; },
    save: async v => { await q(sb.rpc('hr_disc_query_send', { p: { ...v, employees: emps || v.employees, case_id: caseId || null } })); toast('Sent'); pcRefresh(); } });
}
const pcFill = (t, ctx) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => ctx[k] ?? m);
function pcDiscLetter(c, s) {
  q(sb.from('hr_disc_templates').select('*').eq('id', s.template_id).single()).then(t => {
    const card = hrCard(s.employee_id) || {};
    const body = pcFill(t.body, { name: s.name, first_name: (s.name || '').split(' ')[0], staff_id: card.emp_no || '', job_role: card.title || '', department: hrUnit(card.dept_id)?.name || '', case_id: c.case_no,
      offence: c.offence_id ? pcOffence(c.offence_id) : c.title, from_date: s.from_date ? fd(s.from_date) : '', to_date: s.to_date ? fd(s.to_date) : '', points: s.points ?? '', sanction: s.type, date: fd(localISO(0)),
      incident_date: c.incident_at ? fd(c.incident_at) : '', issuer: S.profile.full_name || 'HR', company: CFG.COMPANY || 'GANKCO', response_hours: '48' });
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print the letter', true);
    w.document.write(`<!doctype html><title>${esc(t.name)} · ${esc(s.name)}</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:50px auto;color:#1C1D20;line-height:1.6}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #E8552C;padding-bottom:10px;margin-bottom:24px}.ref{color:#62666C;font-size:13px}</style>
      <div class="top"><img src="${location.origin}${location.pathname.replace(/[^/]*$/, '')}brand/logo-full.png" style="height:46px" onerror="this.remove()"><div class="ref">${esc(t.code || '')} · ${esc(c.case_no)}<br>${fd(localISO(0))}</div></div>
      <p><b>${esc(s.name)}</b><br>${esc(card.title || '')}</p>${esc(body).split(/\n/).map(l => `<p>${l || '&nbsp;'}</p>`).join('')}<script>setTimeout(()=>print(),400)<\/script>`);
    w.document.close();
  }).catch(e => toast(niceError(e), true));
}

// ---------------------------------------------------------------- queries, sanctions, appeals
DC.pages.queries = { perms: ['view-disciplinary-queries', 'view-disciplinary-query'],
  async load() {
    const rows = await q(sb.from('hr_disc_queries').select('*').order('created_at', { ascending: false })); S.pc.dcq = rows;
    return topbar('Queries', 'Queries sent to staff and their replies.', pcCan('create-manual-query', 'create-bulk-manual-query') ? `<button class="btn primary" id="dcq">${ico('plus')}Create query</button>` : '') +
      pcTable('dcq', [{ l: 'Employee', v: r => pcName(r.employee_id), f: r => pcPerson(hrCard(r.employee_id) || { name: pcName(r.employee_id) }) }, { k: 'subject', l: 'Subject' }, { l: 'Reply due', v: r => r.response_due, f: r => fdt(r.response_due) },
        { l: 'Status', v: r => r.status, f: r => pcChip(r.status === 'open' ? (new Date(r.response_due) < new Date() ? 'rejected' : 'pending') : r.status === 'escalated' ? 'out' : 'ok', r.status === 'open' && new Date(r.response_due) < new Date() ? 'Overdue' : r.status) },
        { l: '', cls: 'num', sort: false, csv: false, f: r => `<button class="btn small" data-q="${r.id}">View</button>` }], rows, { noun: 'query', csv: 'Disciplinary queries', filters: [{ k: 's', l: 'Status', opts: [['open', 'Open'], ['answered', 'Answered'], ['resolved', 'Resolved'], ['escalated', 'Escalated']], test: (r, v) => r.status === v }] });
  },
  bind(main) {
    const n = $('#dcq', main); if (n) n.onclick = () => pcDiscQuery(null, null);
    main.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; const r = S.pc.dcq.find(x => x.id === +b.dataset.q);
      modal({ title: r.subject, sub: `${esc(pcName(r.employee_id))} · sent ${fdt(r.created_at)} by ${esc(r.by_name || '')}`, wide: true, submit: null, cancel: 'Close',
        body: `<div style="white-space:pre-wrap">${esc(r.body || '')}</div><div class="pc-sec">Reply</div>${r.response ? `<div style="white-space:pre-wrap">${esc(r.response)}</div><small class="muted">${fdt(r.responded_at)}</small>` : '<p class="muted">No reply yet.</p>'}
          ${['open', 'answered'].includes(r.status) ? `<div class="pc-acts" style="justify-content:flex-start;margin-top:12px">${pcCan('resolve-disciplinary-query') ? '<button type="button" class="btn" data-x="resolve">Resolve</button>' : ''}${pcCan('convert-query-to-case') ? '<button type="button" class="btn" data-x="escalate">Escalate to a case</button>' : ''}${r.case_id ? `<a class="btn" href="#/people/admin/disc/case/${r.case_id}">Open case</a>` : ''}</div>` : ''}`,
        onOpen: (d, close) => $$('[data-x]', d).forEach(x => x.onclick = async () => { close(null);
          if (x.dataset.x === 'escalate' && !r.case_id) return pcEdit({ title: 'Escalate to a case', wide: false, fields: [{ k: 'offence_id', l: pcTerm('offence', 'Offence'), t: 'select', req: true, opts: v => pcOffenceOpts(v) }], save: async v => { const cid = await q(sb.rpc('hr_disc_query_close', { p_id: r.id, p_action: 'escalate', p: v })); go('#/people/admin/disc/case/' + cid); } });
          await pcTry(() => q(sb.rpc('hr_disc_query_close', { p_id: r.id, p_action: x.dataset.x, p: {} })), 'Done'); pcRefresh(); }) }); });
  }
};
DC.pages.sanctions = { perms: ['view-disciplinary-sanctions', 'view-disciplinary-sanction'],
  async load() {
    const [rows, cases] = await Promise.all([q(sb.from('hr_disc_sanctions').select('*').order('created_at', { ascending: false })), q(sb.from('hr_disc_cases').select('id,case_no'))]);
    const cn = id => cases.find(c => c.id === id)?.case_no || '';
    return topbar(pcTerm('sanction', 'Sanction') + 's', 'Every sanction issued, and its status.') +
      pcTable('dcs', [{ l: 'Case ID', v: r => cn(r.case_id), f: r => r.case_id ? `<a href="#/people/admin/disc/case/${r.case_id}">${esc(cn(r.case_id))}</a>` : '—' }, { l: 'Sanction type', v: r => hrListName(r.type_id) }, { l: 'Status', v: r => r.status, f: r => pcChip(...PC_SAN_ST[r.status]) + (r.historic ? ' ' + pcChip('muted', 'Historic') : '') },
        { l: 'Employee', v: r => pcName(r.employee_id), f: r => pcPerson(hrCard(r.employee_id) || { name: pcName(r.employee_id) }) }, { l: 'Date', v: r => r.from_date || r.created_at, f: r => fd(r.from_date || r.created_at) + (r.to_date ? ' – ' + fd(r.to_date) : '') }], rows,
        { noun: 'sanction', csv: 'Disciplinary sanctions', filters: [{ k: 't', l: 'Type', opts: pcLists('sanction_type').map(l => [l.id, l.name]), test: (r, v) => r.type_id === +v }, { k: 's', l: 'Status', opts: Object.entries(PC_SAN_ST).map(([k, v]) => [k, v[1]]), test: (r, v) => r.status === v }] });
  }
};
DC.pages.appeals = { perms: ['view-appeal-processes', 'view-appeal-process'],
  async load() {
    const [rows, sans] = await Promise.all([q(sb.from('hr_disc_appeals').select('*').order('created_at', { ascending: false })), q(sb.from('hr_disc_sanctions').select('id,type_id,case_id'))]); S.pc.dca = rows;
    const sn = id => sans.find(s => s.id === id) || {};
    return topbar('Appeals', 'Staff asking for a sanction to be reviewed.') +
      pcTable('dca', [{ l: 'Sanction type', v: r => hrListName(sn(r.sanction_id).type_id) }, { l: 'Employee', v: r => pcName(r.employee_id), f: r => pcPerson(hrCard(r.employee_id) || { name: pcName(r.employee_id) }) }, { k: 'reason', l: 'Reason', f: r => `<small>${esc(r.reason)}</small>` },
        { l: 'Date', v: r => r.created_at, f: r => fd(r.created_at) }, { l: 'Status', v: r => r.status, f: r => pcChip(r.status === 'pending' ? 'pending' : r.status === 'overturned' ? 'ok' : 'muted', r.status === 'upheld' ? 'Verdict upheld' : r.status === 'overturned' ? 'Overturned' : 'Pending') },
        { l: '', cls: 'num', sort: false, csv: false, f: r => `<span class="pc-acts">${sn(r.sanction_id).case_id ? `<a class="btn small" href="#/people/admin/disc/case/${sn(r.sanction_id).case_id}">Case</a>` : ''}${r.status === 'pending' && pcCan('approve-appeal-request', 'decline-appeal-request') ? `<button class="btn small primary" data-ap="${r.id}">Decide</button>` : ''}</span>` }], rows,
        { noun: 'appeal', csv: 'Appeals', empty: 'No appeals.' });
  },
  bind(main) { main.addEventListener('click', e => { const b = e.target.closest('[data-ap]'); if (!b) return;
    pcEdit({ title: 'Decide appeal', wide: false, fields: [{ k: 'decision', l: 'Decision', t: 'radio', opts: [['uphold', pcTerm('uphold', 'Uphold verdict')], ['overturn', 'Overturn the sanction']], def: 'uphold' }, { k: 'note', l: 'Note to the employee', t: 'textarea' }],
      save: async v => { await q(sb.rpc('hr_disc_appeal_decide', { p_id: +b.dataset.ap, p_overturn: v.decision === 'overturn', p_note: v.note })); toast('Decided'); pcRefresh(); } }); }); }
};

// ---------------------------------------------------------------- settings and historic data
DC.pages.settings = { perms: ['manage-disciplinary-settings'],
  async load(rest, params) {
    const tab = this.tab = params.get?.('tab') || 'offences'; const c = pcDcCfg();
    const head = topbar('Disciplinary settings', '') + pcTabs([['offences', 'Offences'], ['categories', 'Offence categories'], ['sanctions', 'Sanction types'], ['policies', 'Policies'], ['terms', 'Terminologies'], ['idformat', 'ID format'], ['letters', 'Letter templates']]
      .map(([k, l]) => ['#/people/admin/disc/settings?tab=' + k, l]), '#/people/admin/disc/settings?tab=' + tab);
    if (this.list()) return head + await pcListPage(this.list()).load();
    if (tab === 'letters') { const ts = await q(sb.from('hr_disc_templates').select('*').order('id')); S.pc.dct = ts;
      return head + pcTable('dct', [{ k: 'name', l: 'Template', f: t => `<b>${esc(t.name)}</b>${t.archived ? ' ' + pcChip('muted', 'Archived') : ''}` }, { l: 'For', v: t => t.kind === 'query' ? 'Query' : 'Sanction' }, { k: 'code', l: 'Code' }, { l: '', cls: 'num', sort: false, csv: false, f: t => `<button class="btn small" data-t="${t.id}">Edit</button>` }], ts,
        { noun: 'template', actions: `<button class="btn small primary" data-t="new">${ico('plus')}New template</button>` }) + '<p class="muted">Fill-ins: {name}, {first_name}, {staff_id}, {job_role}, {department}, {case_id}, {offence}, {sanction}, {from_date}, {to_date}, {points}, {incident_date}, {date}, {issuer}, {response_hours}, {company}.</p>'; }
    this.F = tab === 'terms' ? [['admin', 'Disciplinary Admin / Committee'], ['sanction', 'Sanction'], ['query', 'Query'], ['grievance', 'Grievance'], ['case', 'Case'], ['offence', 'Offence'], ['decision_maker', 'Decision Maker'], ['appeal_hearing', 'Proceed To Appeal Hearing'], ['uphold', 'Uphold Verdict']].map(([k, l]) => ({ k, l, ph: l }))
      : tab === 'idformat' ? [{ k: 'case_prefix', l: 'Prefix', ph: 'GESL' }, { k: 'case_suffix', l: 'Suffix', ph: 'CASE' }, { k: 'case_next', l: 'Next number', t: 'number', min: 1 }]
      : [{ k: 'notify_hr', l: 'Tell HR when a grievance or case is submitted', t: 'switch' }, { k: 'notify_involved', l: 'Tell the employees involved when a case is reported', t: 'switch', hint: 'GANKCO: off (“disable employee case notification”)' }, { k: 'grievance_feedback', l: 'Send employees feedback on their grievance', t: 'switch' },
        { k: 'involved_see_log', l: 'Involved employees can see the activity log', t: 'switch' }, { k: 'involved_see_reviewers', l: 'Involved employees can see the reviewers', t: 'switch' }, { k: 'involved_see_files', l: 'Involved employees can see attachments', t: 'switch' },
        { k: 'anonymous_grievance', l: 'Allow anonymous grievances', t: 'switch' }, { k: 'sup_sanction_grievance', l: 'Supervisors can sanction on a grievance', t: 'switch' }, { k: 'hod_sanction_grievance', l: 'HODs can sanction on a grievance', t: 'switch' },
        { k: 'sup_sanction_case', l: 'Supervisors can sanction on a case', t: 'switch' }, { k: 'hod_sanction_case', l: 'HODs can sanction on a case', t: 'switch' }, { k: 'remind_days', l: 'Remind about cases with no action every (days)', t: 'number', min: 1 },
        { k: 'whistle_on', l: 'Whistleblowing on', t: 'switch' }, { k: 'appeals_on', l: 'Staff can appeal a sanction', t: 'switch' }];
    return head + `<section class="panel"><div class="body"><form id="dcs">${pcForm(this.F, tab === 'terms' ? (c.terms || {}) : c)}${tab === 'idformat' ? `<p class="muted">Next case ID: <b>${esc([c.case_prefix, String(c.case_next || 1).padStart(4, '0'), c.case_suffix].filter(Boolean).join('/'))}</b></p>` : ''}<button class="btn primary">Save</button></form></div></section>`;
  },
  list() { const t = this.tab; const P = { add: ['manage-disciplinary-settings'], edit: ['manage-disciplinary-settings'], del: ['manage-disciplinary-settings'] };
    if (t === 'offences') return { kind: 'offence', title: 'Offences', noun: 'offence', perm: P, cols: [{ l: 'Category', v: r => hrListName(r.parent_id) }], fields: [{ k: 'parent_id', l: 'Category', t: 'select', req: true, opts: v => pcListOpts('offence_category', v, 'Choose…') }] };
    if (t === 'categories') return { kind: 'offence_category', title: 'Offence categories', noun: 'category', perm: P };
    if (t === 'sanctions') return { kind: 'sanction_type', title: 'Sanction types', noun: 'sanction type', perm: P, cols: [{ l: 'Module affected', v: r => ({ none: 'None', suspension: 'Sign-in (suspension)', exit: 'Exit', performance: 'Performance' })[r.meta?.affects || 'none'] }],
      fields: [{ k: 'meta.affects', l: 'What it does', t: 'select', blank: false, opts: [['none', 'Nothing else'], ['suspension', 'Switches off Nest sign-in for its dates'], ['exit', 'Opens an exit'], ['performance', 'Stored for Performance']] }, { k: 'meta.exit_policy', l: 'Exit policy (when it opens an exit)', ph: 'Termination' }] };
    return null; },
  bind(main) {
    if (this.list()) return pcListPage(this.list()).bind(main);
    if (this.tab === 'letters') return main.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; const t = b.dataset.t === 'new' ? { kind: 'sanction' } : S.pc.dct.find(x => x.id === +b.dataset.t);
      pcEdit({ title: t.id ? 'Edit template' : 'New template', fields: [{ k: 'name', l: 'Name', req: true }, { k: 'kind', l: 'For', t: 'radio', opts: [['query', 'Query'], ['sanction', 'Sanction']], def: 'sanction' }, { k: 'code', l: 'Code' }, { k: 'body', l: 'Letter', t: 'textarea', rows: 14 }, { k: 'archived', l: 'Archived', t: 'switch' }], vals: t,
        save: async v => { await q(sb.rpc('hr_disc_template_save', { p: { id: t.id || null, ...v } })); toast('Saved'); pcRefresh(); } }); });
    const f = $('#dcs', main); f.onsubmit = async e => { e.preventDefault(); let v = pcRead(f, this.F); if (this.tab === 'terms') v = { terms: Object.fromEntries(Object.entries(v).filter(([, x]) => x)) };
      await pcTry(() => q(sb.rpc('hr_disc_settings_save', { p: v })), 'Saved'); S.settings.people = { ...(S.settings.people || {}), disc: { ...pcDcCfg(), ...v } }; render({ quiet: true }); };
  }
};
DC.pages.historic = { perms: ['view-disciplinary-historic-data'],
  async load() {
    return topbar('Historic data', 'Import past cases and sanctions (for example GANKCO’s cases from SeamlessHR). They’re marked “Historic”.') +
      `<section class="panel"><div class="body"><p class="muted">Columns: Case ID, Title, Offence, Staff ID, Sanction, Date, From, To, Status, Note. One row per person per case.</p><p><button class="btn small" id="htpl">${ico('down')}Template</button></p>
        <label class="f">Excel file<input type="file" accept=".xlsx" id="hup"></label></div></section>`;
  },
  bind(main) {
    const C = [['case_no', 'Case ID'], ['title', 'Title'], ['offence', 'Offence'], ['emp_no', 'Staff ID'], ['sanction', 'Sanction'], ['date', 'Date', 'date'], ['from_date', 'From', 'date'], ['to_date', 'To', 'date'], ['status', 'Status'], ['note', 'Note']];
    $('#htpl', main).onclick = () => brandXlsx({ file: `Disciplinary historic data_${localISO(0)}.xlsx`, lists: [{ name: 'Offences', values: pcLists('offence').map(l => l.name) }, { name: 'Sanctions', values: pcLists('sanction_type').map(l => l.name) }, { name: 'Statuses', values: ['Closed', 'Open'] }],
      sheets: [{ name: 'Cases', title: 'Disciplinary historic data', columns: C.map(([key, header, type]) => ({ key, header, width: 18, input: true, ...(type ? { type } : {}), ...(key === 'offence' ? { validate: () => 'Offences' } : key === 'sanction' ? { validate: () => 'Sanctions' } : key === 'status' ? { validate: () => 'Statuses' } : {}) })), rows: [] }] });
    $('#hup', main).onchange = async e => { const file = e.target.files[0]; if (!file) return; await loadScript('vendor/exceljs.min.js'); const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const val = v => v instanceof Date ? v.toISOString().slice(0, 10) : v?.text ?? v?.result ?? (v == null ? '' : String(v)); const rows = [];
      wb.worksheets.forEach(ws => { let h = null; ws.eachRow(row => { const vs = row.values.map(v => val(v).trim()); if (!h) { if (vs.includes('Staff ID')) h = Object.fromEntries(vs.map((x, i) => [x.replace(/\s*\*$/, ''), i])); return; } const o = {}; C.forEach(([k, l]) => o[k] = vs[h[l]]); if (o.emp_no) rows.push(o); }); });
      const r = await pcTry(() => q(sb.rpc('hr_disc_historic', { p_rows: rows }))); e.target.value = ''; toast(`${r.saved} rows imported${r.not_found.length ? ` · ${r.not_found.length} staff IDs not found` : ''}`); };
  }
};

// ---------------------------------------------------------------- self service and Supervisor
PC_SELF.disciplinary = {
  async load(rest, params) {
    if (rest[0]) { this.id = +rest[0]; return pcCasePage(+rest[0], 'self'); }
    this.id = null; const me = hrMe(); if (!me) return topbar('Disciplinary') + '<div class="notice">HR hasn’t added your PeopleCore record yet.</div>';
    const tab = this.tab = params.get?.('tab') || 'cases';
    const [cases, qs, sans, aps] = await Promise.all([q(sb.rpc('hr_disc_list', { p_scope: 'mine' })), q(sb.from('hr_disc_queries').select('*').eq('employee_id', me.id).order('created_at', { ascending: false })),
      q(sb.from('hr_disc_sanctions').select('*').eq('employee_id', me.id).order('created_at', { ascending: false })), q(sb.from('hr_disc_appeals').select('*').eq('employee_id', me.id).order('created_at', { ascending: false }))]);
    Object.assign(this, { qs, sans });
    const openQ = qs.filter(x => x.status === 'open').length;
    const head = topbar('Disciplinary', 'Private to you and the disciplinary admins.', `${pcDcCfg().whistle_on !== false ? '<button class="btn" id="whistle">Blow the whistle</button>' : ''}<button class="btn primary" id="griev">Raise a ${esc(pcTerm('grievance', 'grievance').toLowerCase())}</button>`) +
      pcTabs([['#/people/disciplinary', 'Cases'], ['#/people/disciplinary?tab=queries', `Queries${openQ ? ` (${openQ})` : ''}`], ['#/people/disciplinary?tab=sanctions', pcTerm('sanction', 'Sanction') + 's'], ['#/people/disciplinary?tab=appeals', 'Appeals']], tab === 'cases' ? '#/people/disciplinary' : '#/people/disciplinary?tab=' + tab);
    if (tab === 'queries') return head + (qs.length ? `<section class="panel"><ul class="pc-items">${qs.map(x => `<li><div class="main"><b>${esc(x.subject)}</b><small>${fdt(x.created_at)} · reply by ${fdt(x.response_due)}</small></div>${x.status === 'open' ? `<button class="btn small primary" data-qr="${x.id}">Reply</button>` : pcChip('ok', x.status)}</li>`).join('')}</ul></section>` : '<section class="panel"><div class="empty">No queries.</div></section>');
    if (tab === 'sanctions') return head + (sans.length ? `<section class="panel"><ul class="pc-items">${sans.map(s => `<li><div class="main"><b>${esc(hrListName(s.type_id))}</b> ${pcChip(...PC_SAN_ST[s.status])}<small>${fd(s.from_date || s.created_at)}${s.to_date ? ' – ' + fd(s.to_date) : ''}${s.note ? ' · ' + esc(s.note) : ''}</small></div>${s.case_id ? `<a class="btn small" href="#/people/disciplinary/${s.case_id}">Case</a>` : ''}${s.status === 'active' && pcDcCfg().appeals_on !== false && !aps.some(a => a.sanction_id === s.id) ? ` <button class="btn small primary" data-appeal="${s.id}">Appeal</button>` : ''}</li>`).join('')}</ul></section>` : '<section class="panel"><div class="empty">No sanctions.</div></section>');
    if (tab === 'appeals') return head + (aps.length ? `<section class="panel"><ul class="pc-items">${aps.map(a => `<li><div class="main"><b>${esc(a.reason)}</b><small>${fd(a.created_at)}${a.decision_note ? ' · ' + esc(a.decision_note) : ''}</small></div>${pcChip(a.status === 'pending' ? 'pending' : a.status === 'overturned' ? 'ok' : 'muted', a.status === 'upheld' ? 'Verdict upheld' : a.status === 'overturned' ? 'Overturned' : 'Pending')}</li>`).join('')}</ul></section>` : '<section class="panel"><div class="empty">No appeals.</div></section>');
    return head + pcTable('dcmine', [{ k: 'case_no', l: 'Case ID' }, { k: 'title', l: 'Report title' }, { l: 'Type', v: r => r.kind, f: r => r.kind === 'case' ? pcLevel(r.level) : r.kind === 'grievance' ? pcTerm('grievance', 'Grievance') : 'Whistle' },
      { l: 'Employees involved', sort: false, v: r => r.people.map(p => p.name).join(', ') }, { l: 'Status', v: r => r.status, f: r => pcChip(...PC_DC_ST[r.status]) }], cases,
      { noun: 'case', search: false, href: r => '#/people/disciplinary/' + r.id, empty: 'Nothing here. Raise a grievance if something is wrong at work.' });
  },
  bind(main, rest, params) {
    if (this.id) return pcBindCase(main, this.id);
    $('#griev', main).onclick = () => pcDiscReport('grievance'); const w = $('#whistle', main); if (w) w.onclick = () => pcDiscReport('whistle');
    if (params?.get?.('raise') === 'grievance') { history.replaceState(null, '', '#/people/disciplinary'); pcDiscReport('grievance'); }
    main.addEventListener('click', e => {
      const r = e.target.closest('[data-qr]'); if (r) { const x = this.qs.find(z => z.id === +r.dataset.qr); return pcEdit({ title: x.subject, sub: `<div style="white-space:pre-wrap;margin-top:8px">${esc(x.body || '')}</div>`, fields: [{ k: 'text', l: 'Your reply', t: 'textarea', req: true, rows: 6 }], submit: 'Send reply',
        save: async v => { await q(sb.rpc('hr_disc_query_respond', { p_id: x.id, p_text: v.text })); toast('Reply sent'); pcRefresh(); } }); }
      const a = e.target.closest('[data-appeal]'); if (a) return pcEdit({ title: 'Appeal', wide: false, fields: [{ k: 'reason', l: 'Why you’re appealing', t: 'textarea', req: true, rows: 5 }], submit: 'Send appeal', save: async v => { await q(sb.rpc('hr_disc_appeal', { p_sanction: +a.dataset.appeal, p_reason: v.reason })); toast('Appeal sent'); pcRefresh(); } });
    });
  }
};
PC_SUP.disc = {
  async load(rest) {
    if (rest[0]) { this.id = +rest[0]; return pcCasePage(+rest[0], 'sup'); }
    this.id = null; const [rows, team] = await Promise.all([q(sb.rpc('hr_disc_list', { p_scope: 'team' })), q(sb.rpc('hr_sup_team'))]);
    const ids = team.map(t => t.id); const sans = ids.length ? await q(sb.from('hr_disc_sanctions').select('*').in('employee_id', ids).order('created_at', { ascending: false })) : [];
    return topbar('Team disciplinary', 'Cases involving your team, and those where you’re a reviewer.') +
      pcTable('dcteam', [{ k: 'case_no', l: 'Case ID' }, { k: 'title', l: 'Report title' }, { l: 'Employees involved', sort: false, v: r => r.people.map(p => p.name).join(', ') }, { l: 'Status', v: r => r.status, f: r => pcChip(...PC_DC_ST[r.status]) }, { l: 'Date', v: r => r.created_at, f: r => fd(r.created_at) }], rows,
        { noun: 'case', href: r => '#/people/sup/disc/' + r.id, empty: 'No cases involve your team.' }) +
      `<section class="panel"><header><h2>Sanctioned employees</h2></header>${sans.length ? `<ul class="pc-items">${sans.map(s => `<li><div class="main"><b>${esc(pcName(s.employee_id))}</b> · ${esc(hrListName(s.type_id))} ${pcChip(...PC_SAN_ST[s.status])}<small>${fd(s.from_date || s.created_at)}${s.to_date ? ' – ' + fd(s.to_date) : ''}</small></div></li>`).join('')}</ul>` : '<div class="empty">None.</div>'}</section>`;
  },
  bind(main) { if (this.id) pcBindCase(main, this.id); }
};

// ---------------------------------------------------------------- self service: redeployment request, and the Work page labels
PC_SELF.redeployment = {
  async load() {
    const me = hrMe(); if (!me) return topbar('Redeployment') + '<div class="notice">HR hasn’t added your PeopleCore record yet.</div>';
    const on = !!hrisCfg().redeploy?.self_service;
    const reqs = await q(sb.from('hr_requests').select('id,title,status,created_at,steps,current_step,payload').eq('kind', 'redeployment').eq('employee_id', me.id).order('created_at', { ascending: false }));
    return topbar('Redeployment', 'Ask to move to another department, unit, job role or location.', on ? `<button class="btn primary" id="rdreq">${ico('move')}Ask to move</button>` : '') +
      (on ? '' : '<div class="notice">HR handles redeployments at GANKCO. Speak to HR if you’d like to move.</div>') +
      `<section class="panel"><header><h2>Your requests</h2></header>${reqs.length ? `<ul class="pc-items">${reqs.map(r => `<li><div class="main"><b>${esc(r.title)}</b><small>${fd(r.created_at)}${r.status === 'pending' ? ' · with ' + esc(r.steps?.[r.current_step]?.label || '') : ''}</small></div>${pcChip(r.status === 'pending' ? 'pending' : r.status === 'approved' ? 'ok' : 'muted', r.status)}</li>`).join('')}</ul>` : '<div class="empty">No requests.</div>'}</section>`;
  },
  bind(main) { const b = $('#rdreq', main); if (b) b.onclick = () => pcEdit({ title: 'Ask to move', sub: 'Only what you choose changes. It goes to your line manager, then HR.',
    fields: [{ k: 'unit_id', l: 'Department / unit', t: 'select', opts: v => pcDeptOpts(v, 'No change') }, { k: 'job_role_id', l: 'Job role', t: 'select', opts: v => pcJobOpts(v, null, 'No change') }, { k: 'location_id', l: 'Location', t: 'select', opts: v => pcListOpts('location', v, 'No change') }, { k: 'effective', l: 'From', t: 'date' }, { k: 'reason', l: 'Why', t: 'textarea', req: true }],
    save: async v => { const to = Object.fromEntries(['unit_id', 'job_role_id', 'location_id'].filter(k => v[k]).map(k => [k, +v[k]])); if (!Object.keys(to).length) throw new Error('Choose where you’d like to move');
      await q(sb.rpc('hr_redeploy', { p: { self: true, to, effective: v.effective, reason: v.reason } })); toast('Sent'); pcRefresh(); } }); }
};
['requisition', 'exit', 'disciplinary', 'redeployment'].forEach(k => { if (HR_SOON[k]) HR_SOON[k][2] = 'Ready'; });
if (HR_SOON.exit) HR_SOON.exit[1] = 'Resign, then complete your handover, exit interview and clearance.';
if (HR_SOON.disciplinary) HR_SOON.disciplinary[1] = 'Cases, queries and sanctions that concern you, appeals, and raising a grievance or blowing the whistle.';
