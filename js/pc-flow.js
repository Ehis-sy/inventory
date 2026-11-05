/* GANKCO Nest 3.0.4 — PeopleCore: Approval workflow, Announcements and Company documents (Admin view),
   plus the tidy rich-text editor and the staff reader for announcements. */
'use strict';

// ================================================================ safe HTML (the editor's tidy set)
const PC_TAGS = new Set(['H2', 'H3', 'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'BLOCKQUOTE', 'DIV', 'SPAN', 'HR']);
function pcSafeHtml(html) {
  const t = document.createElement('template'); t.innerHTML = html || '';
  const walk = n => [...n.childNodes].forEach(c => {
    if (c.nodeType === 8) return c.remove();
    if (c.nodeType !== 1) return;
    if (!PC_TAGS.has(c.tagName)) { if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(c.tagName)) return c.remove(); walk(c); c.replaceWith(...c.childNodes); return; }
    const align = c.getAttribute('align') || (c.style && c.style.textAlign) || '';
    [...c.attributes].forEach(a => { if (!(c.tagName === 'A' && a.name === 'href') && !(c.tagName === 'IMG' && ['src', 'alt'].includes(a.name)) && !(['TD', 'TH'].includes(c.tagName) && ['colspan', 'rowspan'].includes(a.name))) c.removeAttribute(a.name); });
    if (/^(left|center|right|justify)$/.test(align) && ['P', 'H2', 'H3', 'DIV', 'TD', 'TH'].includes(c.tagName)) c.setAttribute('align', align);
    if (c.tagName === 'A') { if (!/^(https?:|mailto:)/i.test(c.getAttribute('href') || '')) c.removeAttribute('href'); else { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); } }
    if (c.tagName === 'IMG' && !/^(https:|data:image\/(png|jpe?g|gif|webp);)/i.test(c.getAttribute('src') || '')) c.remove();
    walk(c);
  });
  walk(t.content); return t.innerHTML.trim();
}
// YouTube / Vimeo link → embed address
function pcVideoEmbed(u) {
  let m = String(u).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/); if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1];
  m = String(u).match(/vimeo\.com\/(?:video\/)?(\d+)/); if (m) return 'https://player.vimeo.com/video/' + m[1];
  return null;
}
const pcVideos = vs => (vs || []).map(pcVideoEmbed).filter(Boolean).map(src => `<div class="pc-video"><iframe src="${esc(src)}" title="Video" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`).join('');

// a contenteditable editor with a tidy toolbar (no fonts or colours)
function pcRich(name, html) {
  const b = (cmd, label, ic, arg = '') => `<button type="button" class="pc-rt-b" data-cmd="${cmd}" data-arg="${arg}" title="${label}" aria-label="${label}">${ic}</button>`;
  return `<div class="pc-rich" data-rich="${name}"><div class="pc-rt">
    ${b('formatBlock', 'Heading', '<b>H</b>', 'H2')}${b('formatBlock', 'Sub-heading', '<b style="font-size:12px">H</b>', 'H3')}${b('formatBlock', 'Paragraph', '¶', 'P')}<i></i>
    ${b('bold', 'Bold', '<b>B</b>')}${b('italic', 'Italic', '<i>I</i>')}${b('underline', 'Underline', '<u>U</u>')}<i></i>
    ${b('insertUnorderedList', 'Bullet list', '•≡')}${b('insertOrderedList', 'Numbered list', '1≡')}<i></i>
    ${b('justifyLeft', 'Align left', '⇤')}${b('justifyCenter', 'Centre', '↔')}${b('justifyRight', 'Align right', '⇥')}<i></i>
    ${b('link', 'Link', '🔗')}${b('table', 'Table', '▦')}${b('image', 'Picture', '🖼')}${b('removeFormat', 'Clear formatting', '⌫')}</div>
    <div class="pc-rt-area" contenteditable="true" role="textbox" aria-multiline="true">${pcSafeHtml(html) || '<p><br></p>'}</div><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden data-img></div>`;
}
function pcBindRich(root) {
  $$('[data-rich]', root).forEach(box => {
    const area = $('.pc-rt-area', box), img = $('[data-img]', box);
    const focus = () => area.focus();
    $('.pc-rt', box).addEventListener('mousedown', e => { if (e.target.closest('[data-cmd]')) e.preventDefault(); });
    $('.pc-rt', box).onclick = async e => {
      const t = e.target.closest('[data-cmd]'); if (!t) return; focus(); const c = t.dataset.cmd;
      if (c === 'link') { const u = prompt('Link address (https://…)'); if (u && /^(https?:|mailto:)/i.test(u.trim())) document.execCommand('createLink', false, u.trim()); return; }
      if (c === 'table') { const r = Math.min(+prompt('How many rows?', '3') || 3, 20), k = Math.min(+prompt('How many columns?', '3') || 3, 8);
        document.execCommand('insertHTML', false, `<table><tbody>${Array.from({ length: r }, (_, i) => `<tr>${Array.from({ length: k }, () => i ? '<td><br></td>' : '<th><br></th>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`); return; }
      if (c === 'image') { img.click(); return; }
      document.execCommand(c, false, t.dataset.arg ? `<${t.dataset.arg}>` : null);
    };
    img.onchange = () => { const f = img.files[0]; img.value = ''; if (!f) return; if (f.size > 1.5 * 1024 * 1024) return toast('Pictures up to 1.5 MB', true);
      const r = new FileReader(); r.onload = () => { focus(); document.execCommand('insertImage', false, r.result); }; r.readAsDataURL(f); };
    area.addEventListener('paste', e => { const h = e.clipboardData.getData('text/html'); if (!h) return; e.preventDefault(); document.execCommand('insertHTML', false, pcSafeHtml(h)); });
  });
}
const pcRichVal = (root, name) => { const a = $(`[data-rich="${name}"] .pc-rt-area`, root); if (!a) return ''; const h = pcSafeHtml(a.innerHTML); return a.textContent.trim() || /<(img|table)/i.test(h) ? h : ''; };

// ================================================================ APPROVAL WORKFLOW
const FLOW = PC_MODS.flow;
FLOW.menu = [['', 'Workflows', 'check'], ['use', 'Where they’re used', 'grid'], ['new', 'Create workflow', 'plus', ['add-approval-workflow']]];
const PC_FLOW_KINDS = { leave: 'Leave (when the policy has none)', leave_plan: 'Leave plans', resumption: 'Leave resumption', profile_change: 'Profile updates', redeployment: 'Redeployment', contract_update: 'Contract updates', contract_extension: 'Contract extensions',
  expense: 'Expense requests (when the policy has none)', overtime: 'Overtime requests (when the policy has none)', service: 'Service requests (when the policy has none)', exit: 'Exit (when the policy has none)', appeal: 'Disciplinary appeals' };
const pcStepName = s => s.type === 'line' ? (S.pc.look.lines.find(l => l.key === s.line)?.label || s.line) : s.type === 'role' ? (S.pc.look.roles.find(r => r.id === +s.role_id)?.name || 'Admin role') : (pcName(s.employee_id) || 'Named person');
const pcChain = steps => `<span class="pc-chain">${(steps || []).map(s => `<span class="pc-step ${s.type}">${esc(s.label || pcStepName(s))}${s.optional ? ' <small>optional</small>' : ''}${s.if ? ' <small>if…</small>' : ''}</span>`).join('<i>→</i>')}</span>`;
async function pcWorkflows(force) { if (force || !S.pc.wfs || Date.now() - S.pc.wfsAt > 30000) { S.pc.wfs = await q(sb.from('hr_workflows').select('*').order('name')); S.pc.wfsAt = Date.now(); } return S.pc.wfs; }
const pcWfOpts = (sel, blank = 'Choose a workflow…') => `<option value="">${esc(blank)}</option>` + (S.pc.wfs || []).filter(w => w.active || w.id === +sel).map(w => opt(w.id, w.name, sel)).join('');

FLOW.pages[''] = { perms: ['view-approval-workflow', 'add-approval-workflow', 'edit-approval-workflow'],
  async load() {
    const [wfs, flows] = await Promise.all([pcWorkflows(true), q(sb.from('hr_flows').select('kind,workflow_id'))]);
    const used = w => flows.filter(f => f.workflow_id === w.id).map(f => PC_FLOW_KINDS[f.kind] || f.kind);
    const gmc = !!hrSettings().flow?.global_mc; const can = pcCan('edit-approval-workflow');
    return topbar('Approval workflow', 'Who approves what, step by step. Leave, requisition and exit policies each pick one of these.',
      pcCan('add-approval-workflow') ? `<a class="btn primary" href="#/people/admin/flow/new">${ico('plus')}Create workflow</a>` : '') +
      `<section class="panel"><div class="body"><label class="switch"><input type="checkbox" id="gmc" ${gmc ? 'checked' : ''} ${can ? '' : 'disabled'}><span class="sw"></span><span><b>Global maker-checker</b><span class="sub muted">Nobody can approve a request they raised themselves, in any workflow.</span></span></label></div></section>` +
      pcTable('wfs', [{ k: 'name', l: 'Workflow', f: r => `<b>${esc(r.name)}</b>${r.active ? '' : ' ' + pcChip('muted', 'Off')}<br><small class="muted">${esc(r.description || '')}</small>` },
        { l: 'Approval steps', sort: false, v: r => r.steps.map(pcStepName).join(' → '), f: r => pcChain(r.steps) },
        { l: 'Used for', sort: false, v: r => used(r).join(', '), f: r => used(r).map(u => `<span class="chip muted">${esc(u.replace(/ \(.*\)/, ''))}</span>`).join(' ') || '<span class="muted">Policies only</span>' },
        { l: '', cls: 'num', sort: false, csv: false, f: r => can ? `<a class="btn small" href="#/people/admin/flow/edit/${r.id}">Edit</a>` : '' }], wfs, { noun: 'workflow', csv: 'Approval workflows', href: can ? r => '#/people/admin/flow/edit/' + r.id : null });
  },
  bind(main) { const g = $('#gmc', main); if (g) g.onchange = async () => { await pcTry(() => q(sb.rpc('hr_flow_global_mc', { p_on: g.checked })), 'Saved'); S.settings.people = { ...(S.settings.people || {}), flow: { ...(hrSettings().flow || {}), global_mc: g.checked } }; }; }
};

FLOW.pages.use = { perms: ['view-approval-workflow', 'edit-approval-workflow'],
  async load() {
    await pcWorkflows(); const flows = await q(sb.from('hr_flows').select('*')); this.flows = flows; const can = pcCan('edit-approval-workflow');
    return topbar('Where they’re used', 'Requests that aren’t tied to a policy use the workflow chosen here. Policies (leave, requisition, exit) choose their own.') +
      `<section class="panel"><div class="tablewrap"><table class="t"><thead><tr><th>Request</th><th>Workflow</th></tr></thead><tbody>${Object.entries(PC_FLOW_KINDS).map(([k, l]) => {
        const f = flows.find(x => x.kind === k);
        return `<tr><td><b>${esc(l)}</b></td><td>${can ? `<select data-kind="${k}" style="margin:0;max-width:340px">${pcWfOpts(f?.workflow_id, f?.steps?.length ? 'The 3.0 chain' : 'None')}</select>` : esc(S.pc.wfs.find(w => w.id === f?.workflow_id)?.name || '—')}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  },
  bind(main) { $$('[data-kind]', main).forEach(s => s.onchange = () => pcTry(() => q(sb.rpc('hr_flow_use', { p_kind: s.dataset.kind, p_workflow: s.value ? +s.value : null })), 'Saved')); }
};

FLOW.pages.new = { perms: ['add-approval-workflow'],
  async load(rest, params, parts) {
    await pcWorkflows();
    const w = parts[3] === 'edit' ? S.pc.wfs.find(x => x.id === +rest[0]) : { name: '', steps: [{ type: 'line', line: 'line_manager' }], settings: { approve_comment: 'show', decline_comment: 'required', remind: 'daily', remind_time: '09:00', reroute: true, maker_checker: true }, active: true };
    if (!w) return topbar('Workflow') + '<div class="notice">Workflow not found.</div>';
    this.w = JSON.parse(JSON.stringify(w)); const st = w.settings || {};
    return topbar(w.id ? 'Edit workflow' : 'Create workflow', 'Steps run from top to bottom. Each step is a reporting line (worked out for the person asking) or an admin role (anyone holding it; the first to act decides).',
      `<a class="btn" href="#/people/admin/flow">Cancel</a>${w.id && pcCan('delete-approval-workflow') ? '<button class="btn danger" id="wdel">Delete</button>' : ''}<button class="btn primary" id="wsave">Save workflow</button>`) +
      `<section class="panel"><div class="body">${pcForm([{ k: 'name', l: 'Name', req: true, ph: 'e.g. Leave Approval Workflow' }, { k: 'description', l: 'What it’s for' }, ...(w.id ? [{ k: 'active', l: 'In use', t: 'switch' }] : [])], w)}</div></section>
      <section class="panel"><header><h2>Approval steps</h2><span class="right"><button class="btn small" id="addline">${ico('plus')}Reporting line</button><button class="btn small" id="addrole">${ico('plus')}Admin role</button></span></header><ol class="pc-wsteps" id="wsteps"></ol></section>
      <section class="panel"><header><h2>Settings</h2></header><div class="body">${pcForm([
        { k: 'approve_comment', l: 'Comment when approving', t: 'radio', opts: [['hide', 'Don’t ask'], ['show', 'Optional'], ['required', 'Required']], def: 'show' },
        { k: 'decline_comment', l: 'Comment when declining', t: 'radio', opts: [['show', 'Optional'], ['required', 'Required']], def: 'required' },
        { k: 'remind', l: 'Remind approvers', t: 'radio', opts: [['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly']], def: 'daily' }, { k: 'remind_time', l: 'Reminder time', t: 'time' },
        { k: 'reroute', l: 'Auto re-route', t: 'switch', hint: 'If an approver is on leave, deactivated or has no Nest sign-in, the request goes to their stand-in, or else to the next step.' },
        { k: 'maker_checker', l: 'Maker-checker', t: 'switch', hint: 'Nobody approves a request they raised themselves.' }], st)}</div></section>
      <details class="panel pc-more-opts"><summary>More options</summary><div class="body muted">Add a <b>named person</b> as a step, or give any step a <b>condition</b> (for example, MD/CEO only when the request is over 10 days or ₦500,000). Conditions use the request’s numbers: <code>days</code> for leave, <code>amount</code> for requisition, <code>hours</code> for overtime.
        <p><button class="btn small" id="addperson" type="button">${ico('plus')}Named person</button></p></div></details>`;
  },
  draw(main) {
    const L = S.pc.look; const steps = this.w.steps;
    $('#wsteps', main).innerHTML = steps.length ? steps.map((s, i) => `<li data-i="${i}"><span class="pc-wnum">${i + 1}</span>
      <span class="pc-wwho">${s.type === 'line' ? `<select data-f="line">${L.lines.filter(l => l.active || l.key === s.line).map(l => opt(l.key, l.label, s.line)).join('')}</select><small class="muted">Reporting line</small>`
        : s.type === 'role' ? `<select data-f="role_id">${L.roles.map(r => opt(r.id, r.name, s.role_id)).join('')}</select><small class="muted">Admin role · anyone holding it</small>`
        : `<select data-f="employee_id">${pcPeopleOpts(s.employee_id, 'Choose person…')}</select><small class="muted">Named person</small>`}</span>
      ${s.type === 'line' ? `<label class="pc-ck"><input type="checkbox" data-f="optional" ${s.optional ? 'checked' : ''}><span>Optional</span></label>` : '<span></span>'}
      <span class="pc-wif">${s.if ? `<small>if ${esc(s.if.field)} ${esc(s.if.op)} ${esc(s.if.value)}</small> ` : ''}<button type="button" class="btn link small" data-cond>${s.if ? 'Change' : 'Condition'}</button></span>
      <span class="pc-wact"><button type="button" class="btn small" data-mv="-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button type="button" class="btn small" data-mv="1" ${i < steps.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button type="button" class="btn small danger" data-rm aria-label="Remove">✕</button></span></li>`).join('')
      : '<li class="muted">No steps yet. Add a reporting line or an admin role.</li>';
  },
  bind(main) {
    const W = this.w; const redraw = () => this.draw(main); redraw();
    const box = $('#wsteps', main);
    box.addEventListener('change', e => { const li = e.target.closest('[data-i]'); if (!li) return; const s = W.steps[+li.dataset.i]; const f = e.target.dataset.f; s[f] = f === 'optional' ? e.target.checked : e.target.value; });
    box.addEventListener('click', async e => {
      const li = e.target.closest('[data-i]'); if (!li) return; const i = +li.dataset.i;
      const mv = e.target.closest('[data-mv]'); if (mv) { const j = i + +mv.dataset.mv; [W.steps[i], W.steps[j]] = [W.steps[j], W.steps[i]]; return redraw(); }
      if (e.target.closest('[data-rm]')) { W.steps.splice(i, 1); return redraw(); }
      if (e.target.closest('[data-cond]')) {
        const c = W.steps[i].if || {};
        await pcEdit({ title: 'Condition for step ' + (i + 1), sub: 'The step only runs when this is true. Leave the field empty to remove the condition.', wide: false,
          fields: [{ k: 'field', l: 'Number', t: 'select', opts: [['days', 'Leave days'], ['amount', 'Amount (₦)'], ['hours', 'Overtime hours']], blank: 'No condition' }, { k: 'op', l: 'Is', t: 'select', blank: false, opts: [['>', 'more than'], ['>=', 'at least'], ['<', 'less than'], ['<=', 'at most']] }, { k: 'value', l: 'Value', t: 'number' }],
          vals: c, save: async v => { W.steps[i].if = v.field && v.value != null ? { field: v.field, op: v.op || '>', value: v.value } : undefined; redraw(); } });
      }
    });
    $('#addline', main).onclick = () => { W.steps.push({ type: 'line', line: 'line_manager' }); redraw(); };
    $('#addrole', main).onclick = () => { W.steps.push({ type: 'role', role_id: S.pc.look.roles[0]?.id }); redraw(); };
    $('#addperson', main).onclick = () => { W.steps.push({ type: 'person', employee_id: '' }); redraw(); };
    $('#wsave', main).onclick = async () => {
      const v = pcRead(main, [{ k: 'name' }, { k: 'description' }, { k: 'active', t: 'switch' }, { k: 'approve_comment', t: 'radio' }, { k: 'decline_comment', t: 'radio' }, { k: 'remind', t: 'radio' }, { k: 'remind_time' }, { k: 'reroute', t: 'switch' }, { k: 'maker_checker', t: 'switch' }]);
      const p = { id: W.id || null, name: v.name, description: v.description, active: W.id ? v.active : true, steps: W.steps.map(s => ({ ...s, role_id: s.role_id ? +s.role_id : undefined, employee_id: s.employee_id ? +s.employee_id : undefined })),
        settings: { approve_comment: v.approve_comment, decline_comment: v.decline_comment, remind: v.remind, remind_time: v.remind_time || '09:00', reroute: v.reroute, maker_checker: v.maker_checker } };
      await pcTry(() => q(sb.rpc('hr_workflow_save', { p })), 'Workflow saved'); S.pc.wfsAt = 0; go('#/people/admin/flow');
    };
    const d = $('#wdel', main); if (d) d.onclick = async () => { if (!await pcConfirm('Delete workflow?', `Delete “${esc(W.name)}”?`, 'Delete')) return; await pcTry(() => q(sb.rpc('hr_workflow_delete', { p_id: W.id })), 'Deleted'); S.pc.wfsAt = 0; go('#/people/admin/flow'); };
  }
};
FLOW.pages.edit = { perms: ['edit-approval-workflow'], load: (r, p, parts) => FLOW.pages.new.load(r, p, parts), bind: (m, r, p, parts) => FLOW.pages.new.bind(m, r, p, parts) };

// ================================================================ ANNOUNCEMENTS
const ANN = PC_MODS.ann;
ANN.menu = [['', 'All announcements', 'bell'], ['new', 'Create announcement', 'plus', ['add-announcement']]];
const PC_ANN_ST = { draft: ['muted', 'Draft'], published: ['ok', 'Published'], scheduled: ['out', 'Scheduled'], expired: ['muted', 'Expired'] };
const pcAud = a => !a || a.all ? 'All staff' : [...(a.units || []).map(u => hrUnit(u)?.name), ...(a.locations || []).map(hrListName), ...(a.groups || []).map(g => S.pc.look.groups.find(x => x.id === +g)?.name)].filter(Boolean).join(', ') || 'Nobody';
ANN.pages[''] = { perms: ['view-announcements', 'view-all-announcements', 'add-announcement'],
  async load() {
    const rows = await q(sb.rpc('hr_ann_admin_list')); S.pc.anns = rows;
    const cE = pcCan('edit-announcement'), cP = pcCan('publish-announcement'), cU = pcCan('unpublish-announcement'), cD = pcCan('delete-announcement');
    return topbar('Announcements', 'News and notices for all staff, or chosen departments, locations and groups.', pcCan('add-announcement') ? `<a class="btn primary" href="#/people/admin/ann/new">${ico('plus')}Create announcement</a>` : '') +
      pcTable('anns', [{ k: 'title', l: 'Title', f: r => `<b>${r.pinned ? '📌 ' : ''}${esc(r.title)}</b><br><small class="muted">${esc(pcAud(r.audience))}</small>` }, { k: 'summary', l: 'Summary', f: r => `<small>${esc((r.summary || '').slice(0, 90))}</small>` },
        { l: 'Staff', cls: 'num', v: r => r.staff, f: r => `${r.staff}${r.state !== 'draft' ? `<br><small class="muted">${r.reads} read${r.require_confirm ? ` · ${r.confirms} confirmed` : ''}</small>` : ''}` },
        { l: 'Published', v: r => r.state, f: r => pcChip(...PC_ANN_ST[r.state]) }, { l: 'Published date', v: r => r.publish_at, f: r => r.state === 'draft' ? '—' : fdt(r.publish_at) },
        { l: 'Expiry date', v: r => r.expires_at || '', f: r => pcDate(r.expires_at) }, { l: 'Created', v: r => r.created_at, f: r => `${fd(r.created_at)}<br><small class="muted">${esc(r.by || '')}</small>` },
        { l: 'Actions', cls: 'num', sort: false, csv: false, f: r => `<span class="pc-acts">${cE ? `<a class="btn small" href="#/people/admin/ann/edit/${r.id}">Edit</a>` : ''}${r.state === 'draft' && cP ? `<button class="btn small" data-pub="${r.id}">Publish</button>` : ''}${r.state !== 'draft' && cU ? `<button class="btn small" data-unpub="${r.id}">Unpublish</button>` : ''}${r.state !== 'draft' ? `<button class="btn small" data-rep="${r.id}">Who read</button>` : ''}${cD ? `<button class="btn small danger" data-del="${r.id}" aria-label="Delete">✕</button>` : ''}</span>` }], rows,
        { noun: 'announcement', csv: 'Announcements', placeholder: 'Search announcements', filters: [{ k: 'st', l: 'Status', opts: [['draft', 'Draft'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['expired', 'Expired']], test: (r, v) => r.state === v },
          { k: 'from', l: 'Created', opts: [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 3 months'], ['365', 'Last year']], test: (r, v) => (Date.now() - new Date(r.created_at)) / 864e5 <= +v }],
          empty: 'No announcements yet. Create the first one.' });
  },
  bind(main) {
    main.addEventListener('click', async e => {
      const b = e.target.closest('[data-pub],[data-unpub],[data-rep],[data-del]'); if (!b) return;
      if (b.dataset.pub) { const a = S.pc.anns.find(x => x.id === +b.dataset.pub); return pcEdit({ title: 'Publish “' + a.title + '”?', wide: false, submit: 'Publish', fields: [{ k: 'expires_at', l: 'Expiry date', t: 'date', req: true }], vals: { expires_at: a.expires_at?.slice(0, 10) || localISO(14) },
        save: async v => { await q(sb.rpc('hr_ann_publish', { p_id: a.id, p_on: true, p_expires: v.expires_at + 'T23:59:00' })); toast('Published'); pcRefresh(); } }); }
      if (b.dataset.unpub) { if (!await pcConfirm('Unpublish?', 'Staff won’t see it any more. It stays here as a draft.', 'Unpublish', false)) return; await pcTry(() => q(sb.rpc('hr_ann_publish', { p_id: +b.dataset.unpub, p_on: false })), 'Unpublished'); return pcRefresh(); }
      if (b.dataset.rep) { const r = await q(sb.rpc('hr_ann_report', { p_id: +b.dataset.rep })); return hrReadReport('Who has read it', r); }
      if (b.dataset.del) { if (!await pcConfirm('Delete announcement?', 'This can’t be undone.', 'Delete')) return; await pcTry(() => q(sb.rpc('hr_ann_delete', { p_id: +b.dataset.del })), 'Deleted'); pcRefresh(); }
    });
  }
};

const PC_ANN_ACT = [{ k: 'action', l: 'Action', t: 'radio', opts: [['none', 'None'], ['link', 'External link']], def: 'none' }, { k: 'action_url', l: 'Link', t: 'url', ph: 'https://…', wide: true, show: v => v.action === 'link' }];
const PC_ANN_PUB = [{ k: 'published', l: 'Publish now', t: 'switch', hint: 'Off: save it as a draft.' }, { k: 'email', l: 'Receive email notification', t: 'switch', show: v => v.published },
  { k: 'in_app', l: 'Receive in-app notification', t: 'switch', show: v => v.published }, { k: 'expires_at', l: 'Expiry date', t: 'date', req: true, show: v => v.published }];
ANN.pages.new = { perms: ['add-announcement'],
  async load(rest, params, parts) {
    const a = parts[3] === 'edit' ? await q(sb.rpc('hr_ann_get', { p_id: +rest[0] })) : { audience: { all: true }, published: true, email: true, in_app: true, expires_at: localISO(14), videos: [], files: [] };
    this.a = a; const aud = a.audience || { all: true }; const isAll = !!aud.all;
    const cats = [['units', 'Departments and units', hrUnitsOrdered().filter(u => u.active).map(u => [u.id, ' '.repeat(u.depth) + u.name])], ['locations', 'Locations', pcLists('location').map(l => [l.id, l.name])], ['groups', 'Groups', S.pc.look.groups.filter(g => g.active).map(g => [g.id, g.name])]];
    return topbar(a.id ? 'Edit announcement' : 'Create announcement', a.sent_at ? 'Already sent. Changes show to staff straight away; emails aren’t sent again.' : 'Fill it in from top to bottom, as in SeamlessHR.',
      `<a class="btn" href="#/people/admin/ann">Cancel</a><button class="btn primary" id="asave">${a.published && a.id ? 'Save' : 'Save'}</button>`) +
      `<form id="aform" novalidate><section class="panel"><div class="body">${pcForm([{ k: 'title', l: 'Title', req: true, wide: true }, { k: 'summary', l: 'Summary', req: true, wide: true, hint: 'One or two lines. Shown in the list and at the top of the email.' }], a)}
        <div class="pc-fld wide"><span class="lbl">Content <i class="req">*</i></span>${pcRich('content', a.content || (a.body ? esc(a.body).replace(/\n/g, '<br>') : ''))}</div>
        <div id="actbox">${pcForm(PC_ANN_ACT, { ...a, action: a.action_url ? 'link' : 'none' })}</div>
        <div class="pc-fld wide"><span class="lbl">Videos</span><div id="vids">${[...(a.videos || []), ''].map(v => `<input type="url" class="pc-vid" placeholder="YouTube or Vimeo link" value="${esc(v)}">`).join('')}</div><small class="pc-hint">Paste a YouTube or Vimeo link; it plays inside the announcement. Up to 5.</small></div></div></section>
      <section class="panel"><header><h2>Who it’s for</h2></header><div class="body">${pcForm([{ k: 'who', l: 'Send to', t: 'radio', opts: [['all', 'All staff'], ['some', 'Category of staff']], def: isAll ? 'all' : 'some' }], { who: isAll ? 'all' : 'some' })}
        <div id="aud" ${isAll ? 'hidden' : ''}>${cats.map(([k, l, o]) => pcField({ k: 'aud_' + k, l, t: 'checks', opts: o }, aud[k] || [])).join('')}</div></div></section>
      <section class="panel"><header><h2>Publish</h2></header><div class="body"><div id="pubbox">${pcForm(PC_ANN_PUB, { ...a, expires_at: a.expires_at?.slice(0, 10) || localISO(14) })}</div></div></section>
      <details class="panel pc-more-opts" ${a.pinned || a.require_confirm || a.files?.length || (a.publish_at && new Date(a.publish_at) > new Date()) ? 'open' : ''}><summary>More options</summary><div class="body">${pcForm([
        { k: 'pinned', l: 'Pin to the top', t: 'switch' }, { k: 'require_confirm', l: 'Ask staff to confirm they’ve read it', t: 'switch', hint: 'You can see who has confirmed.' },
        { k: 'publish_at', l: 'Publish later (date and time)', t: 'datetime-local', hint: 'Leave empty to publish when you save.', dis: !!a.sent_at }], { ...a, publish_at: a.publish_at && !a.sent_at && new Date(a.publish_at) > new Date() ? a.publish_at.slice(0, 16) : '' })}
        <div class="pc-fld wide"><span class="lbl">Attachments</span>${(a.files || []).map(f => `<label class="pc-ck"><input type="checkbox" data-rmf="${f.id}"><span>Remove ${esc(f.file_name)}</span></label>`).join('')}<input type="file" id="afiles" multiple><small class="pc-hint">Up to 8 MB each.</small></div></div></details></form>`;
  },
  bind(main) {
    const f = $('#aform', main); pcBindRich(f);
    pcLiveShow($('#pubbox', f), PC_ANN_PUB, { email: this.a.email ?? true, in_app: this.a.in_app ?? true, expires_at: this.a.expires_at?.slice(0, 10) || localISO(14) }, $('#pubbox .pc-form', f));
    pcLiveShow($('#actbox', f), PC_ANN_ACT, { action_url: this.a.action_url }, $('#actbox .pc-form', f));
    f.addEventListener('change', e => { if (e.target.name === 'who') $('#aud', f).hidden = e.target.value === 'all'; });
    $('#vids', f).addEventListener('input', () => { const ins = $$('.pc-vid', f); if (ins.length < 5 && ins.every(i => i.value.trim())) $('#vids', f).insertAdjacentHTML('beforeend', '<input type="url" class="pc-vid" placeholder="YouTube or Vimeo link">'); });
    $('#asave', main).onclick = async () => {
      const v = pcRead(f, [{ k: 'title' }, { k: 'summary' }, { k: 'action', t: 'radio' }, { k: 'action_url' }, { k: 'who', t: 'radio' }, { k: 'published', t: 'switch' }, { k: 'email', t: 'switch' }, { k: 'in_app', t: 'switch' }, { k: 'expires_at' }, { k: 'pinned', t: 'switch' }, { k: 'require_confirm', t: 'switch' }, { k: 'publish_at' }]);
      const audience = v.who === 'all' ? { all: true } : Object.fromEntries(['units', 'locations', 'groups'].map(k => [k, $$(`[data-ck="aud_${k}"]`, f).filter(c => c.checked).map(c => +c.value)]));
      const files = []; for (const x of [...($('#afiles', f).files || [])]) files.push(await hrReadFile(x));
      const p = { id: this.a.id || null, ...v, content: pcRichVal(f, 'content'), audience, videos: $$('.pc-vid', f).map(i => i.value.trim()).filter(Boolean), files,
        remove_files: $$('[data-rmf]', f).filter(c => c.checked).map(c => +c.dataset.rmf),
        expires_at: v.published && v.expires_at ? v.expires_at + 'T23:59:00' : (v.expires_at ? v.expires_at + 'T23:59:00' : null), publish_at: v.publish_at ? new Date(v.publish_at).toISOString() : null };
      if (!p.content) return toast('Write the content', true);
      await pcTry(() => q(sb.rpc('hr_ann_save', { p })), v.published ? (p.publish_at && new Date(p.publish_at) > new Date() ? 'Scheduled' : 'Published') : 'Saved as a draft');
      go('#/people/admin/ann');
    };
  }
};
ANN.pages.edit = { perms: ['edit-announcement'], load: (r, p, parts) => ANN.pages.new.load(r, p, parts), bind: (m, r, p, parts) => ANN.pages.new.bind(m, r, p, parts) };

// staff reader: summary, tidy content, videos and the action link
async function hrOpenAnn(id) {
  const feed = await q(sb.rpc('hr_feed')); const a = feed.announcements.find(x => x.id === id); if (!a) return;
  if (!a.read_at) q(sb.rpc('hr_ann_read', { p_id: id, p_confirm: false })).catch(() => {});
  return modal({ title: a.title, wide: true, submit: a.require_confirm && !a.confirmed_at && hrMe() ? 'I’ve read it' : '', cancel: 'Close',
    sub: `${esc(a.by || 'HR')} · ${fdt(a.publish_at)}${a.pinned ? ' · 📌 Pinned' : ''}`,
    body: `${a.summary ? `<p class="pc-ann-sum">${esc(a.summary)}</p>` : ''}<div class="ann-body pc-ann-content">${a.content ? pcSafeHtml(a.content) : hrText(a.body) || '<span class="sub">No text.</span>'}</div>
      ${pcVideos(a.videos)}${a.action_url ? `<p><a class="btn primary" href="${esc(a.action_url)}" target="_blank" rel="noopener">Open the link</a></p>` : ''}
      ${a.files.length ? `<div class="ann-files">${a.files.map(f => `<button type="button" class="apfile" data-af="${f.id}">${ico('pdf')}${esc(f.file_name)}</button>`).join('')}</div>` : ''}
      ${a.require_confirm ? `<p class="sub mt">${a.confirmed_at ? `${ico('check')}You confirmed you read this on ${fdt(a.confirmed_at)}.` : 'HR asks everyone to confirm they have read this.'}</p>` : ''}`,
    onOpen: d => $$('[data-af]', d).forEach(b => b.onclick = async () => { try { hrOpenFile(await q(sb.rpc('hr_ann_file', { p_id: +b.dataset.af }))); } catch (e) { toast(niceError(e), true); } }),
    onSubmit: async () => { await q(sb.rpc('hr_ann_read', { p_id: id, p_confirm: true })); toast('Thanks. HR can see you’ve read it.'); render({ quiet: true }); } });
}

// ================================================================ COMPANY DOCUMENTS (3.0 policies, with folders)
PC_MODS.company.pages.documents = { perms: ['add-company-document', 'edit-company-document', 'view-settings'],
  async load(rest, params) {
    const tab = params.get?.('tab') || '';
    const tabs = pcTabs([['#/people/admin/company/documents', 'Documents'], ['#/people/admin/company/documents?tab=folders', 'Folders', ['add-company-document']]], tab ? '#/people/admin/company/documents?tab=' + tab : '#/people/admin/company/documents');
    if (tab === 'folders') return topbar('Company documents', '') + tabs + await pcListPage({ kind: 'doc_folder', title: 'Folders', noun: 'folder', perm: { add: ['add-company-document'], edit: ['edit-company-document'], del: ['delete-company-document'] } }).load();
    const rows = await q(sb.from('hr_policies').select('id,title,category,version,file_name,size_bytes,require_confirm,published_at,active,updated_by_name,folder_id,description,visible,notify,restrict_download').order('title'));
    S.pc.docs = rows; const can = pcCan('edit-company-document');
    return topbar('Company documents', 'Statutory and policy documents staff can open from Company in self service.') + tabs +
      pcTable('docs', [{ k: 'title', l: 'Document', f: r => `<b>${esc(r.title)}</b>${r.active ? '' : ' ' + pcChip('muted', 'Off')}<br><small class="muted">${esc(r.description || r.file_name || '')}</small>` },
        { l: 'Folder', v: r => hrListName(r.folder_id), f: r => esc(hrListName(r.folder_id) || '—') }, { l: 'Visible to staff', v: r => pcYes(r.visible), f: r => r.visible ? pcChip('ok', 'Yes') : pcChip('muted', 'No') },
        { l: 'Download', v: r => r.restrict_download ? 'View only' : 'Allowed', f: r => r.restrict_download ? 'View only' : 'Allowed' }, { l: 'Version', cls: 'num', k: 'version' },
        { l: '', cls: 'num', sort: false, csv: false, f: r => `<span class="pc-acts">${r.require_confirm ? `<button class="btn small" data-prep="${r.id}">Who confirmed</button>` : ''}${can ? `<button class="btn small" data-doc="${r.id}">Edit</button>` : ''}</span>` }], rows,
        { noun: 'document', csv: 'Company documents', filters: [{ k: 'f', l: 'Folder', opts: pcLists('doc_folder').map(l => [l.id, l.name]), test: (r, v) => r.folder_id === +v }],
          actions: pcCan('add-company-document') ? `<button class="btn small primary" data-doc="new">${ico('plus')}Add document</button>` : '' });
  },
  bind(main, rest, params) {
    if (params.get?.('tab') === 'folders') return pcListPage({ kind: 'doc_folder', title: '', noun: 'folder', perm: { add: ['add-company-document'], edit: ['edit-company-document'], del: ['delete-company-document'] } }).bind(main);
    main.addEventListener('click', async e => {
      const r = e.target.closest('[data-prep]'); if (r) return hrReadReport('Who has confirmed it', await q(sb.rpc('hr_policy_report', { p_id: +r.dataset.prep })));
      const b = e.target.closest('[data-doc]'); if (!b) return;
      const d = b.dataset.doc === 'new' ? { visible: true, active: true } : S.pc.docs.find(x => x.id === +b.dataset.doc);
      pcEdit({ title: d.id ? 'Edit document' : 'Add document', fields: [{ k: 'title', l: 'Name', req: true }, { k: 'folder_id', l: 'Folder', t: 'select', opts: v => pcListOpts('doc_folder', v, 'No folder') },
        { k: 'description', l: 'Description', t: 'textarea' }, { k: 'file', l: d.id ? 'Replace the file (a new version)' : 'File', t: 'file', req: !d.id, hint: 'Up to 10 MB' },
        { k: 'visible', l: 'Visible to employees', t: 'switch' }, { k: 'notify', l: 'Notify employees', t: 'switch', hint: 'Sends everyone an in-app notification when you save' }, { k: 'restrict_download', l: 'Restrict download', t: 'switch', hint: 'Staff can view it but aren’t offered a download button' },
        { k: 'require_confirm', l: 'Ask staff to confirm they’ve read it', t: 'switch' }, ...(d.id ? [{ k: 'active', l: 'In use', t: 'switch' }] : [])], vals: d,
        onOpen: dl => { if (d.id && pcCan('delete-company-document')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn danger'; x.textContent = 'Delete'; x.style.marginRight = 'auto'; x.onclick = async () => { await pcTry(() => q(sb.rpc('hr_policy_delete', { p_id: d.id })), 'Deleted'); dl.close(); dl.remove(); pcRefresh(); }; $('.mf', dl).prepend(x); } },
        save: async (v, dl) => { const file = $('[name=file]', dl).files[0]; const fd0 = file ? await hrReadFile10(file) : {};
          await q(sb.rpc('hr_policy_save', { p: { id: d.id || null, ...v, file: undefined, category: hrListName(v.folder_id) || null, active: d.id ? v.active : true, ...fd0 } })); toast('Saved'); pcRefresh(); } });
    });
  }
};
const hrReadFile10 = file => new Promise((res, rej) => { if (file.size > 10 * 1024 * 1024) return rej(new Error(`${file.name} is bigger than 10 MB`));
  const r = new FileReader(); r.onload = () => res({ file_name: file.name, mime: file.type, data: String(r.result).split(',')[1] }); r.onerror = () => rej(new Error('The file couldn’t be read')); r.readAsDataURL(file); });
