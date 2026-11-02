/* GANKCO Nest — Operations: materials requests, out on jobs, monthly count, approvals, certificates & kits, activity */
'use strict';

const zq = n => +n ? fq(n) : '·';
const JOB_STATUS = { draft: ['muted', 'Draft'], submitted: ['pending', 'Waiting for approval'], partial: ['soon', 'Partly issued'], out: ['out', 'Issued · out on job'],
  closed: ['ok', 'Closed'], cancelled: ['muted', 'Cancelled'], rejected: ['rejected', 'Rejected'] };
const SEC_STATUS = { pending: ['pending', 'Waiting for approval'], issued: ['ok', 'Issued'], rejected: ['rejected', 'Rejected'] };
const activePeople = () => Object.values(S.people).filter(p => ['staff', 'admin', 'superadmin'].includes(p.role)).sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));

// ================================================================ MATERIALS REQUESTS
ROUTES.jobs = {
  async load(parts, params) {
    if (params.get('v')) { this.view = params.get('v'); history.replaceState(null, '', '#/jobs'); }
    this.view = this.view || 'open';
    const jobs = await q(sb.from('jobs').select('*, job_lines(id), job_sections(department_id,state)').order('created_at', { ascending: false }).limit(300));
    this.rows = jobs;
    return topbar('Materials requests', 'Request everything for a job in one go. Each service line’s admin approves and issues its own items.',
      `<button class="btn tagbtn" id="newjob">${ico('plus')}New materials request</button>`) +
      `<div class="filters"><input type="search" id="q" placeholder="Search request no., well, client or requester">
        <div class="seg" id="seg">${[['open', 'Open'], ['mine', 'My requests'], ['waiting', 'Waiting for approval'], ['out', 'Out on job'], ['draft', 'Drafts'], ['closed', 'Closed'], ['all', 'All']].map(([k, l]) => `<button data-v="${k}" class="${this.view === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <section class="panel"><div class="tablewrap"><table class="t stack" id="tbl"><thead><tr><th>Request</th><th>Job / well</th><th>Client</th><th>Requester</th><th>Service lines</th><th class="num">Items</th><th>Return by</th><th>Status</th></tr></thead><tbody></tbody></table></div></section>`;
  },
  bind(main) {
    const t = localISO(0); let qq = '';
    const draw = () => {
      const v = this.view; const me = S.viewAs ? null : S.profile.id;
      const rows = this.rows.filter(j => (v === 'all' || (v === 'open' ? ['draft', 'submitted', 'partial', 'out'].includes(j.status)
          : v === 'mine' ? (j.requester_id === me || j.created_by === me) && !['cancelled'].includes(j.status)
          : v === 'waiting' ? ['submitted', 'partial'].includes(j.status) : v === 'out' ? ['out', 'partial'].includes(j.status) : j.status === v))
        && (!qq || `${j.job_no} ${j.title} ${j.client || ''} ${j.requester_name || ''} ${j.field || ''}`.toLowerCase().includes(qq)));
      $('#tbl tbody', main).innerHTML = rows.length ? rows.map(j => {
        const waitMine = (j.job_sections || []).some(s => s.state === 'pending' && canAdmin(s.department_id));
        return `<tr class="click" data-id="${j.id}">
        <td>${tag(j.job_no)}</td><td class="full"><div class="name">${esc(j.title)}</div>${j.field ? `<div class="sub">${esc(j.field)}</div>` : ''}</td>
        <td>${esc(j.client || '—')}</td><td>${esc(j.requester_name || '—')}</td>
        <td class="hide-m">${(j.job_sections || []).map(s => `<span class="linebadge sec-${s.state}">${esc(lineShort(s.department_id))}</span>`).join(' ') || '<span class="sub">—</span>'}</td>
        <td class="num">${(j.job_lines || []).length}</td>
        <td>${j.expected_return ? (['out', 'partial'].includes(j.status) && j.expected_return < t ? chip('overdue', fd(j.expected_return)) : fd(j.expected_return)) : '—'}</td>
        <td>${chip(...JOB_STATUS[j.status])}${waitMine ? ' ' + chip('soon', 'Needs you') : ''}</td></tr>`;
      }).join('')
        : `<tr><td colspan="8" class="empty">${this.rows.length ? 'No requests here.' : 'No materials requests yet. Create one when equipment is needed for a job.'}</td></tr>`;
    };
    $('#q', main).oninput = debounce(e => { qq = e.target.value.toLowerCase(); draw(); }, 120);
    $$('#seg button', main).forEach(b => b.onclick = () => { this.view = b.dataset.v; $$('#seg button', main).forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#tbl tbody', main).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) go('#/job/' + tr.dataset.id); };
    $('#newjob', main).onclick = () => editJob(null);
    draw();
  }
};

function editJob(j, after) {
  const me = S.profile.id;
  return modal({
    title: j ? 'Edit request details' : 'New materials request', submit: j ? 'Save' : 'Create request',
    body: `<label class="f">Job, well or site<input type="text" name="title" value="${esc(j?.title)}" required placeholder="e.g. Mahin-5 slickline intervention"></label>
      <div class="row2"><label class="f">Requester<select name="req">${activePeople().map(p => opt(p.id, p.full_name || p.email, j?.requester_id || me)).join('')}</select></label>
      <label class="f">Client<input type="text" name="client" value="${esc(j?.client)}" placeholder="e.g. NPDC"></label></div>
      <div class="row2"><label class="f">Field / location<input type="text" name="field" value="${esc(j?.field)}" placeholder="e.g. Mahin field"></label>
      <label class="f">Leaves from<select name="base">${realLocOptions(j?.base_location_id || realLocs()[0]?.id)}</select></label></div>
      <div class="row2"><label class="f">Needed from<input type="date" name="start" value="${esc(j?.start_date || localISO(0))}"></label>
      <label class="f">Expected back<input type="date" name="ret" value="${esc(j?.expected_return)}"></label></div>
      <label class="f">Notes<textarea name="notes">${esc(j?.notes)}</textarea></label>`,
    onSubmit: async x => {
      if (!x.title.trim()) throw new Error('Enter the job, well or site.');
      const row = { title: x.title.trim(), requester_id: x.req, client: x.client || null, field: x.field || null, base_location_id: +x.base, start_date: x.start || null, expected_return: x.ret || null, notes: x.notes || null };
      if (j) { await q(sb.from('jobs').update(row).eq('id', j.id)); toast('Saved'); render({ quiet: true }); return; }
      const nj = await q(sb.from('jobs').insert(row).select().single());
      if (after) return after(nj);
      toast(`Request ${nj.job_no} created. Now add the items.`); go('#/job/' + nj.id);
    }
  });
}

ROUTES.job = {
  async load(parts) {
    const id = +parts[1];
    const [j, lines, secs] = await Promise.all([
      q(sb.from('jobs').select('*').eq('id', id).maybeSingle()),
      q(sb.from('job_lines').select('*, items(id,code,name,unit,item_type,department_id), checkouts(id,qty,open_qty,missing_qty,closed_at)').eq('job_id', id).order('id')),
      q(sb.from('job_sections').select('*').eq('job_id', id)),
      items(), stockRows(),
    ]);
    if (!j) return topbar('Request not found') + '<a class="btn" href="#/jobs">Back to materials requests</a>';
    const moves = j.status !== 'draft' && lines.some(l => l.checkout_id) ? await q(sb.from('movements').select('type,qty,checkout_id,to_status').in('checkout_id', lines.map(l => l.checkout_id).filter(Boolean)).in('type', ['return', 'issue', 'sale', 'lost'])) : [];
    this.ctx = { j, lines, secs, moves };
    const draft = j.status === 'draft';
    const canReturn = ['out', 'partial'].includes(j.status) && lines.some(l => l.checkouts && !l.checkouts.closed_at);
    const isRequester = !S.viewAs && j.requester_id === S.profile.id;
    const canConfirm = isRequester && ['out', 'closed'].includes(j.status) && !j.received_at && secs.some(s => s.state === 'issued');
    const tally = (l, type, st) => moves.filter(m => m.checkout_id === l.checkout_id && m.type === type && (!st || m.to_status === st)).reduce((a, m) => a + +m.qty, 0);
    const lineIds = [...new Set(lines.map(l => l.items?.department_id))].sort((a, b) => (S.depts.findIndex(d => d.id === a)) - (S.depts.findIndex(d => d.id === b)));
    const section = d => {
      const sec = secs.find(s => s.department_id === d); const ls = lines.filter(l => l.items?.department_id === d);
      const st = sec ? sec.state : draft ? null : 'pending';
      return `<section class="panel mrsec ${st ? 'sec-' + st : ''}"><header><h2>${esc(lineName(d))}</h2>${st ? chip(...SEC_STATUS[st]) : ''}
        <span class="meta">${sec?.decided_by_name ? `${sec.state === 'issued' ? 'Issued' : 'Rejected'} by ${esc(sec.decided_by_name)} · ${fdt(sec.decided_at)}` : plural(ls.length, 'item')}</span>
        ${st === 'pending' && canAdmin(d) ? `<div class="right"><button class="btn small tagbtn" data-issue="${d}">${ico('truck')}Approve &amp; issue</button><button class="btn small" data-reject="${d}">Reject</button></div>` : ''}</header>
        ${sec?.note ? `<div class="body"><div class="notice bad">Reason: ${esc(sec.note)}</div></div>` : ''}
        <div class="tablewrap"><table class="t stack"><thead><tr><th>Item</th><th>From</th><th class="num">Qty</th><th>Serials</th>
          ${st === 'issued' ? '<th class="num">Back</th><th class="num">Damaged</th><th class="num">Used</th><th class="num">Sold</th><th class="num">Still out</th>' : '<th class="num">In store now</th><th></th>'}</tr></thead><tbody>
          ${ls.map(l => `<tr><td class="full"><a href="#/item/${l.item_id}" class="plain">${tag(l.items?.code)} <span class="name">${esc(l.items?.name)}</span></a></td>
            <td>${esc(locName(l.location_id))}</td><td class="num"><b>${fq(l.qty)}</b></td><td class="sub">${esc(l.serials || '')}</td>
            ${st === 'issued' ? `<td class="num">${zq(tally(l, 'return', 'available'))}</td><td class="num">${zq(tally(l, 'return', 'damaged'))}</td><td class="num">${zq(tally(l, 'issue'))}</td><td class="num">${zq(tally(l, 'sale'))}</td>
                 <td class="num">${l.checkouts && !l.checkouts.closed_at ? `<b>${fq(l.checkouts.open_qty)}</b>${+l.checkouts.missing_qty ? ' ' + chip('overdue', fq(l.checkouts.missing_qty) + ' missing') : ''}` : chip('ok', 'Done')}</td>`
              : `<td class="num">${stockOf(l.item_id, l.location_id) < l.qty && st !== 'rejected' ? chip('overdue', fq(stockOf(l.item_id, l.location_id)) + ' only') : fq(stockOf(l.item_id, l.location_id))}</td>
                 <td class="num">${draft ? `<button class="btn small link danger" data-del="${l.id}">Remove</button>` : ''}</td>`}</tr>`).join('')}
          </tbody></table></div></section>`;
    };
    return `<a class="back" href="#/jobs">← Materials requests</a>
      <div class="item-head"><div>${tag(j.job_no, 'big')} ${chip(...JOB_STATUS[j.status])}
        <h1>${esc(j.title)}</h1>
        <div class="facts"><span>Requester: <b>${esc(j.requester_name || '—')}</b></span>${j.client ? `<span>Client: ${esc(j.client)}</span>` : ''}${j.field ? `<span>${esc(j.field)}</span>` : ''}<span>From ${esc(locName(j.base_location_id))}</span>
          ${j.expected_return ? `<span>Back by ${fd(j.expected_return)}</span>` : ''}</div>
        <div class="facts sub">Created by ${esc(j.created_by_name || '')} ${fdt(j.created_at)}${j.submitted_at ? ` · submitted ${fdt(j.submitted_at)}` : ''}${j.received_at ? ` · receipt confirmed by ${esc(j.received_by_name || '')} ${fdt(j.received_at)}` : ''}${j.closed_at ? ` · closed ${fdt(j.closed_at)}` : ''}</div></div></div>
      <div class="actionrow">
        ${draft ? `<button class="btn tagbtn" id="add">${ico('plus')}Add items</button><button class="btn primary" id="submit" ${lines.length ? '' : 'disabled'}>${ico('check')}Submit request</button>
          <button class="btn" id="edit">Edit details</button>` : ''}
        ${canConfirm ? `<button class="btn primary" id="rcpt">${ico('sign')}Confirm receipt</button>` : ''}
        ${canReturn ? `<button class="btn tagbtn" id="ret">${ico('out')}Record return</button>` : ''}
        ${secs.some(s => s.state === 'issued') ? `<button class="btn" id="manifest">${ico('pdf')}Load-out Manifest (PDF)</button>` : ''}
        ${draft ? '<button class="btn danger" id="cancel">Cancel request</button>' : ''}
      </div>
      ${draft ? `<div class="notice">Draft: nothing has left the store. Add the items, then press <b>Submit request</b>. Each service line’s admin approves and issues its own items${lineIds.some(d => canAdmin(d)) ? ' (items from lines you look after are issued as soon as you submit)' : ''}.</div>` : ''}
      ${j.status === 'partial' ? `<div class="notice">Partly issued: some service lines have issued their items; others are still waiting for their admin.${isRequester ? ' You can confirm receipt once every line has been issued or rejected.' : ''}</div>` : ''}
      ${canConfirm ? `<div class="notice">You’re the requester. Check the items you were given against the list, then press <b>Confirm receipt</b> to sign the Requester box on the Load-out Manifest.</div>` : ''}
      ${lines.length ? lineIds.map(section).join('') : `<section class="panel"><div class="empty">No items yet. Press <b>Add items</b> and search or scan what’s needed. You can also tick items on the Inventory page and choose <b>Add to materials request</b>.</div></section>`}
      ${j.notes ? `<section class="panel"><div class="body">${esc(j.notes)}</div></section>` : ''}`;
  },
  bind(main) {
    const { j, lines, secs } = this.ctx || {}; if (!j) return;
    const b = id => $(id, main);
    if (b('#add')) b('#add').onclick = () => addJobItems(j);
    if (b('#edit')) b('#edit').onclick = () => editJob(j);
    if (b('#cancel')) b('#cancel').onclick = async () => { if (!confirm('Cancel this request? Nothing has gone out, so nothing changes in stock.')) return; try { await q(sb.from('jobs').update({ status: 'cancelled' }).eq('id', j.id)); toast('Request cancelled'); render(); } catch (e) { toast(niceError(e), true); } };
    if (b('#submit')) b('#submit').onclick = () => {
      const ds = [...new Set(lines.map(l => l.items?.department_id))];
      return modal({ title: `Submit ${j.job_no}`, submit: 'Submit request',
        sub: `${plural(lines.length, 'item')} for ${esc(j.title)}, requested by ${esc(j.requester_name || '')}.`,
        body: `<ul class="steps">${ds.map(d => `<li><b>${esc(lineName(d))}</b>: ${canAdmin(d) ? 'issued straight away (you’re an admin of this line)' : 'sent to this line’s admin to approve &amp; issue'}</li>`).join('')}</ul>`,
        onSubmit: async () => { const st = await q(sb.rpc('submit_request', { p_job: j.id })); toast(st === 'out' ? `${j.job_no} issued` : `${j.job_no} submitted`); refresh(); } });
    };
    $$('[data-issue]', main).forEach(x => x.onclick = () => {
      const d = +x.dataset.issue; const ls = lines.filter(l => l.items?.department_id === d);
      return modal({ title: `Approve & issue: ${lineShort(d)}`, submit: 'Approve & issue',
        sub: `${plural(ls.length, 'item')} will be checked out to ${esc(j.job_no)} ${esc(j.title)} with ${esc(j.requester_name || '')}.`,
        body: `<table class="t"><tbody>${ls.map(l => `<tr><td>${tag(l.items?.code)} ${esc(l.items?.name)}</td><td>${esc(locName(l.location_id))}</td><td class="num"><b>${fq(l.qty)}</b></td></tr>`).join('')}</tbody></table>`,
        onSubmit: async () => { const st = await q(sb.rpc('issue_section', { p_job: j.id, p_dept: d })); toast(`${lineShort(d)} items issued`); refresh(); } });
    });
    $$('[data-reject]', main).forEach(x => x.onclick = () => {
      const d = +x.dataset.reject;
      return modal({ title: `Reject ${lineShort(d)} items`, submit: 'Reject', danger: true, sub: 'Nothing leaves the store. The requester sees your reason. Other service lines on this request aren’t affected.',
        body: '<label class="f">Reason<textarea name="note" required></textarea></label>',
        onSubmit: async y => { await q(sb.rpc('reject_section', { p_job: j.id, p_dept: d, p_note: y.note })); toast('Rejected'); refresh(); } });
    });
    if (b('#ret')) b('#ret').onclick = () => jobReturn(j, lines);
    if (b('#rcpt')) b('#rcpt').onclick = async () => {
      if (!(await needSignature())) return;
      const img = await mySigImage(); const iss = secs.filter(s => s.state === 'issued');
      return modal({ title: `Confirm receipt: ${j.job_no}`, submit: 'Confirm & sign',
        sub: `You confirm you received the items issued on this request for ${esc(j.title)}.`,
        body: `<ul class="steps">${iss.map(s => `<li><b>${esc(lineName(s.department_id))}</b>: ${plural(lines.filter(l => l.items?.department_id === s.department_id).length, 'item')}, issued by ${esc(s.decided_by_name || '')}</li>`).join('')}</ul>
          <div class="sigpaper mt">${img ? `<img src="${img.dataUrl}" alt="">` : ''}<div class="sigline"></div><div class="signame">${esc(S.profile.full_name || S.profile.email)}</div><div class="sub">${esc(S.profile.job_title || '')}</div><div class="sub">Requester</div></div>`,
        onSubmit: async () => { await q(sb.rpc('confirm_receipt', { p_job: j.id })); toast('Receipt confirmed and signed'); refresh(); } });
    };
    if (b('#manifest')) b('#manifest').onclick = () => jobManifest(j, lines, this.ctx.moves, secs);
    $$('[data-del]', main).forEach(x => x.onclick = async () => { try { await q(sb.from('job_lines').delete().eq('id', +x.dataset.del)); render({ quiet: true }); } catch (e) { toast(niceError(e), true); } });
  }
};

// Add ticked items from the Inventory list to a draft request
async function addSelectedToRequest(sel) {
  const drafts = await q(sb.from('jobs').select('id,job_no,title,base_location_id,requester_name').eq('status', 'draft').order('created_at', { ascending: false }).limit(50));
  await stockRows();
  const addTo = async j => {
    const existing = await q(sb.from('job_lines').select('item_id').eq('job_id', j.id));
    const rows = sel.filter(i => !existing.some(e => e.item_id === i.id)).map(i => {
      const loc = stockOf(i.id, j.base_location_id) > 0 ? j.base_location_id : (S.locs.filter(l => stockOf(i.id, l.id) > 0).sort((a, b) => stockOf(i.id, b.id) - stockOf(i.id, a.id))[0]?.id);
      return loc ? { job_id: j.id, item_id: i.id, location_id: loc, qty: 1 } : null;
    });
    const ok = rows.filter(Boolean);
    if (ok.length) await q(sb.from('job_lines').insert(ok));
    const skipped = sel.length - ok.length;
    S.inv.sel.clear(); toast(`Added ${plural(ok.length, 'item')} to ${j.job_no}${skipped ? ` · ${skipped} skipped (none in store or already on it)` : ''}. Check the quantities.`);
    go('#/job/' + j.id);
  };
  return modal({
    title: `Add ${plural(sel.length, 'item')} to a materials request`, submit: 'Add items', sub: 'Each item is added with quantity 1 from where it’s in store. You can change quantities on the request before submitting.',
    body: `<label class="f">Request<select name="job"><option value="new">+ New materials request</option>${drafts.map(d => opt(d.id, `${d.job_no} · ${d.title}${d.requester_name ? ' · ' + d.requester_name : ''}`)).join('')}</select></label>`,
    onSubmit: async x => {
      if (x.job === 'new') { setTimeout(() => editJob(null, nj => addTo(nj)), 0); return; }
      await addTo(drafts.find(d => d.id === +x.job));
    }
  });
}

function addJobItems(j) {
  const picked = new Map();
  return modal({
    title: `Add items to ${j.job_no}`, wide: true, submit: 'Add to request',
    sub: `Search or scan. Items come from ${esc(locName(j.base_location_id))} unless you pick another location. Items from any service line can go on one request.`,
    body: `<input type="search" id="pk-q" placeholder="Search code or description, or scan a label" autocomplete="off">
      <div id="pk-res" class="pickres"></div><h3 class="grp">On this request</h3><div id="pk-sel" class="muted">Nothing picked yet.</div>`,
    onOpen: d => {
      const res = $('#pk-res', d), sel = $('#pk-sel', d), qi = $('#pk-q', d);
      const avail = (id, loc) => stockOf(id, loc);
      const drawSel = () => {
        if (!picked.size) { sel.innerHTML = 'Nothing picked yet.'; return; }
        sel.innerHTML = `<table class="t"><thead><tr><th>Item</th><th>From</th><th class="num">Qty</th><th>Serials</th><th></th></tr></thead><tbody>${[...picked.values()].map(p => `<tr data-k="${p.it.id}">
          <td>${tag(p.it.code)} ${esc(p.it.name)}<div class="sub">${esc(lineShort(p.it.department_id))}</div></td>
          <td><select data-f="loc">${S.locs.filter(l => avail(p.it.id, l.id) > 0 || l.id === p.loc).map(l => opt(l.id, `${l.name} (${avail(p.it.id, l.id)})`, p.loc)).join('')}</select></td>
          <td class="num"><input type="number" data-f="qty" min="0" step="any" value="${p.qty}" style="width:80px"></td>
          <td><input type="text" data-f="serials" value="${esc(p.serials)}" placeholder="optional"></td>
          <td><button type="button" class="btn small link danger" data-rm="${p.it.id}">Remove</button></td></tr>`).join('')}</tbody></table>`;
        $$('[data-rm]', sel).forEach(x => x.onclick = () => { picked.delete(+x.dataset.rm); drawSel(); });
        $$('tr[data-k]', sel).forEach(tr => $$('[data-f]', tr).forEach(inp => inp.onchange = () => { const p = picked.get(+tr.dataset.k); const f = inp.dataset.f; p[f] = f === 'loc' ? +inp.value : inp.value; }));
      };
      const add = it => {
        if (!picked.has(it.id)) {
          const loc = avail(it.id, j.base_location_id) > 0 ? j.base_location_id : (S.locs.find(l => avail(it.id, l.id) > 0)?.id || j.base_location_id);
          picked.set(it.id, { it, loc, qty: 1, serials: '' });
        }
        drawSel(); qi.value = ''; res.innerHTML = ''; qi.focus();
      };
      const search = () => {
        const t = qi.value.trim().toLowerCase(); if (!t) { res.innerHTML = ''; return; }
        const exact = matchCode(t); if (exact.length === 1 && t.length > 6) { add(exact[0]); return; }
        const hits = S.items.filter(i => i.active && `${i.code || ''} ${i.name} ${i.serials || ''}`.toLowerCase().includes(t)).slice(0, 25);
        res.innerHTML = hits.length ? hits.map(i => `<button type="button" class="pick" data-id="${i.id}">${tag(i.code)} <span>${esc(i.name)}</span>
          <span class="sub">${esc(i.line)} · ${fq(avail(i.id, j.base_location_id))} at ${esc(locName(j.base_location_id))} · ${fq(i.qty_available)} in store</span></button>`).join('') : '<div class="empty">No match.</div>';
        $$('[data-id]', res).forEach(x => x.onclick = () => add(S.items.find(i => i.id === +x.dataset.id)));
      };
      qi.oninput = debounce(search, 150);
      qi.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const m = matchCode(qi.value); if (m.length === 1) add(m[0]); else search(); } };
    },
    onSubmit: async () => {
      if (!picked.size) throw new Error('Pick at least one item.');
      const rows = [...picked.values()].map(p => {
        const n = +p.qty; if (!(n > 0)) throw new Error(`Enter a quantity for ${p.it.name}.`);
        if (n > stockOf(p.it.id, p.loc)) throw new Error(`Only ${stockOf(p.it.id, p.loc)} of ${p.it.name} available at ${locName(p.loc)}.`);
        return { job_id: j.id, item_id: p.it.id, location_id: p.loc, qty: n, serials: p.serials || null };
      });
      await q(sb.from('job_lines').insert(rows)); toast(`Added ${plural(rows.length, 'item')}`); render({ quiet: true });
    }
  });
}

function jobReturn(j, lines) {
  const open = lines.filter(l => l.checkouts && !l.checkouts.closed_at);
  if (!open.length) return toast('Everything issued on this request is already accounted for.');
  return modal({
    title: `Record return: ${j.job_no}`, wide: true, submit: 'Save return',
    sub: 'For each line, enter what came back and what was used, sold or is missing. Anything not entered stays out on the job.',
    body: `<div class="row2"><label class="f">Coming back to<select name="loc">${realLocOptions(j.base_location_id)}</select></label><div></div></div>
      <div class="tablewrap"><table class="t rettbl"><thead><tr><th>Item</th><th class="num">Still out</th><th>Back good</th><th>Back damaged</th><th>Used</th><th>Sold</th><th>Missing</th></tr></thead><tbody>
      ${open.map(l => { const o = +l.checkouts.open_qty; const t = l.items?.item_type;
        return `<tr><td>${tag(l.items?.code)} ${esc(l.items?.name)}</td><td class="num"><b>${fq(o)}</b></td>
        ${['good', 'damaged', 'used', 'sold', 'missing'].map(k => `<td><input type="number" min="0" step="any" max="${o}" name="${k}_${l.id}" value="${(k === 'good' && t === 'equipment') ? o : ''}" placeholder="0"></td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div>
      <label class="f mt">Notes<input type="text" name="notes" placeholder="Condition, who brought it back"></label>
      <p class="muted">Missing items stay on the request and the service line’s admin is alerted. An admin can write them off from the item page.</p>`,
    onSubmit: async x => {
      const rows = open.map(l => ({ line_id: l.id, good: x['good_' + l.id], damaged: x['damaged_' + l.id], used: x['used_' + l.id], sold: x['sold_' + l.id], missing: x['missing_' + l.id], location_id: +x.loc, notes: x.notes || null }))
        .filter(r => ['good', 'damaged', 'used', 'sold', 'missing'].some(k => +r[k] > 0));
      if (!rows.length) throw new Error('Enter at least one quantity.');
      const st = await q(sb.rpc('job_return', { p_job: j.id, p_rows: rows }));
      toast(st === 'closed' ? `${j.job_no} closed: everything accounted for` : 'Return saved'); refresh();
    }
  });
}

async function jobManifest(j, lines, moves = [], secs = []) {
  try {
    toast('Preparing the PDF…');
    const tally = (l, type, st) => moves.filter(m => m.checkout_id === l.checkout_id && m.type === type && (!st || m.to_status === st)).reduce((a, m) => a + +m.qty, 0);
    const closed = j.status === 'closed';
    const ds = [...new Set(lines.map(l => l.items?.department_id))].sort((a, b) => S.depts.findIndex(d => d.id === a) - S.depts.findIndex(d => d.id === b));
    let n = 0;
    const columns = [{ header: '#', dataKey: 'n', width: 8 }, { header: 'Item Code', dataKey: 'code', width: 42, bold: true }, { header: 'Description', dataKey: 'name' },
      { header: 'From', dataKey: 'from', width: 34 }, { header: 'Qty', dataKey: 'qty', width: 12, align: 'right' }, { header: 'Serials', dataKey: 'serials', width: 30 },
      ...(closed ? [{ header: 'Returned', dataKey: 'back', width: 18, align: 'right' }, { header: 'Used / sold', dataKey: 'used', width: 20, align: 'right' }] : [{ header: 'Loaded', dataKey: 'chk1', width: 16 }, { header: 'Returned', dataKey: 'chk2', width: 18 }])];
    const sections = ds.map(d => {
      const sec = secs.find(s => s.department_id === d);
      const st = sec?.state || 'pending';
      return { heading: lineName(d), headingNote: st === 'issued' ? `Issued by ${sec.decided_by_name || ''} · ${fdt(sec.decided_at)}` : st === 'rejected' ? 'Rejected · not issued' : 'Waiting for approval · not issued yet',
        columns, rows: lines.filter(l => l.items?.department_id === d).map(l => ({ n: ++n, code: l.items?.code || '', name: l.items?.name || '', from: locName(l.location_id), qty: fq(l.qty), serials: l.serials || '',
          back: closed ? fq(tally(l, 'return')) : '', used: closed ? fq(tally(l, 'issue') + tally(l, 'sale')) : '', chk1: '', chk2: '' })) };
    });
    const pending = secs.filter(s => s.state === 'pending').length;
    const [secEv, rcEv] = await Promise.all([signEvents('job_section', secs.map(s => s.id)), signEvents('job_receipt', j.id)]);
    await brandPdf({
      file: `${j.job_no}_Load-out_Manifest.pdf`, title: 'Load-out Manifest', subtitle: `${j.job_no} · ${j.title}`,
      meta: [['Request', j.job_no], ['Requester', j.requester_name || '—'], ['Client', j.client || '—'], ['Field / site', j.field || j.title], ['Leaves from', locName(j.base_location_id)],
        ['First issued', j.dispatched_at ? fdt(j.dispatched_at) : 'Not yet'], ['Expected back', j.expected_return ? fd(j.expected_return) : '—']],
      kpis: [{ label: 'Lines', value: lines.length }, { label: 'Total pieces', value: fq(lines.reduce((a, l) => a + +l.qty, 0)) }, ...(pending ? [{ label: 'Lines not yet issued', value: pending, tone: 'warn' }] : [])],
      intro: `${j.title}${j.client ? ' for ' + j.client : ''}. Check every item against this list when loading and again on return.${pending ? ' Sections marked “waiting for approval” have not been issued and must not be loaded.' : ''}`,
      sections,
      signatures: [sigFromEvent('Requester (received)', rcEv.find(e => e.step === 'received'), { name: j.requester_name || '', title: S.people[j.requester_id]?.job_title || '' }),
        ...secs.filter(s => s.state === 'issued').map(s => sigFromEvent(`Issued by (${lineShort(s.department_id)})`, secEv.find(e => e.doc_id === s.id && e.step === 'issued'), { name: s.decided_by_name || '', title: S.people[s.decided_by]?.job_title || '', date: s.decided_at ? fd(s.decided_at) : '' })),
        { label: 'Driver' }, { label: 'Client representative' }],
    });
  } catch (e) { console.error(e); toast(niceError(e), true); }
}

// ================================================================ OUT ON JOBS
ROUTES.checkouts = {
  async load(parts, params) {
    if (params.get('v')) { S.co.view = params.get('v'); history.replaceState(null, '', '#/checkouts'); }
    const v = S.co.view;
    let qb = sb.from('checkouts').select('*, items(code,name,unit,item_type,department_id), jobs(id,job_no)');
    qb = v === 'returned' ? qb.not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(300) : qb.is('closed_at', null).order('due_back', { nullsFirst: false });
    this.rows = await q(qb);
    return topbar('Out on jobs', 'Everything checked out to jobs, wells and sites', `<button class="btn" id="xls">${ico('down')}Excel</button>`) + lineChips() +
      `<div class="filters"><input type="search" id="q" placeholder="Search job, person or item" value="${esc(S.co.q)}">
        <div class="seg" id="seg">${[['open', 'All open'], ['overdue', 'Overdue'], ['missing', 'Missing'], ['returned', 'Returned']].map(([k, l]) => `<button data-v="${k}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <section class="panel"><div class="tablewrap"><table class="t stack" id="tbl"><thead><tr><th>Item</th><th>Job / well / site</th><th>With</th><th class="num">Qty</th><th>Out since</th><th>${v === 'returned' ? 'Closed' : 'Due back'}</th><th></th></tr></thead><tbody></tbody></table></div></section>`;
  },
  filtered() {
    const t = localISO(0), qq = S.co.q.trim().toLowerCase();
    return this.rows.filter(c => (!S.line || c.items?.department_id === +S.line) && (S.co.view !== 'overdue' || (c.due_back && c.due_back < t)) && (S.co.view !== 'missing' || +c.missing_qty > 0) &&
      (!qq || `${c.job_ref} ${c.issued_to || ''} ${c.items?.code || ''} ${c.items?.name || ''}`.toLowerCase().includes(qq)));
  },
  bind(main) {
    const t = localISO(0); const ret = S.co.view === 'returned';
    bindLineChips(main);
    const draw = () => {
      const rows = this.filtered();
      $('#tbl tbody', main).innerHTML = rows.length ? rows.map(c => {
        const act = canAct(c.items?.department_id);
        return `<tr><td class="full"><a href="#/item/${c.item_id}" class="plain">${tag(c.items?.code)} <span class="name">${esc(c.items?.name)}</span></a></td>
        <td><div class="name">${c.jobs ? `<a href="#/job/${c.jobs.id}">${esc(c.job_ref)}</a>` : esc(c.job_ref)}</div>${c.serials ? `<div class="sub">S/N ${esc(c.serials)}</div>` : ''}${+c.missing_qty ? chip('overdue', fq(c.missing_qty) + ' missing') : ''}</td>
        <td>${esc(c.issued_to || '—')}<div class="sub">by ${esc(personName(c.issued_by, ''))}</div></td>
        <td class="num">${fq(ret ? c.qty : c.open_qty)}</td><td class="hide-m">${fd(c.out_at)}</td>
        <td>${ret ? fd(c.closed_at) : c.due_back ? (c.due_back < t ? chip('overdue', fd(c.due_back)) : fd(c.due_back)) : '—'}</td>
        <td class="num nowrap">${ret || !act ? '' : `<button class="btn small" data-ret="${c.id}">Return</button> <button class="btn small" data-use="${c.id}">Used / sold</button>`}</td></tr>`;
      }).join('')
        : `<tr><td colspan="7" class="empty">${S.co.view === 'overdue' ? 'Nothing is overdue.' : ret ? 'No returns yet.' : 'Nothing is checked out.'}</td></tr>`;
      const itOf = c => ({ id: c.item_id, name: c.items?.name, unit: c.items?.unit, item_type: c.items?.item_type });
      $$('[data-ret]', main).forEach(b => b.onclick = () => { const c = this.rows.find(x => x.id === +b.dataset.ret); actReturn(itOf(c), c); });
      $$('[data-use]', main).forEach(b => b.onclick = () => { const c = this.rows.find(x => x.id === +b.dataset.use); actConsume(itOf(c), c); });
    };
    $('#q', main).oninput = debounce(e => { S.co.q = e.target.value; draw(); }, 120);
    $$('#seg button', main).forEach(b => b.onclick = () => { S.co.view = b.dataset.v; render(); });
    $('#xls', main).onclick = () => brandXlsx({ file: `GANKCO_Out_on_jobs_${localISO(0)}.xlsx`, sheets: [{ name: 'Out on jobs', title: 'Equipment out on jobs', subtitle: `${S.line ? lineName(S.line) : 'All service lines'} · ${fd(localISO(0))}`,
      columns: [{ header: 'Item Code', key: 'code', width: 26, bold: true }, { header: 'Description', key: 'name', width: 46, wrap: true }, { header: 'Service line', key: 'line', width: 13 }, { header: 'Job / well / site', key: 'job', width: 34, wrap: true },
        { header: 'Issued to', key: 'to', width: 18 }, { header: 'Qty', key: 'qty', width: 8, type: 'num' }, { header: 'Out since', key: 'out', width: 13, type: 'date' }, { header: 'Due back', key: 'due', width: 13, type: 'date' }, { header: 'Missing', key: 'miss', width: 9, type: 'num' }],
      rows: this.filtered().map(c => ({ code: c.items?.code, name: c.items?.name, line: lineShort(c.items?.department_id), job: c.job_ref, to: c.issued_to, qty: +(ret ? c.qty : c.open_qty), out: c.out_at, due: c.due_back, miss: +c.missing_qty || '', _over: c.due_back && c.due_back < t })),
      cellStyle: (r, k) => (k === 'due' && r._over) ? 'overdue' : (k === 'miss' && r.miss) ? 'damaged' : null }] });
    draw();
  }
};

// ================================================================ MONTHLY COUNT
ROUTES.count = {
  async load(parts) {
    if (parts[1]) return this.loadSheet(+parts[1]);
    this.mode = 'list';
    const m = monthISO();
    const [cur, hist] = await Promise.all([
      q(sb.from('counts').select('*').eq('month', m)),
      q(sb.from('counts').select('*').neq('month', m).order('month', { ascending: false }).limit(48)),
    ]);
    const ids = cur.map(c => c.id);
    const lines = ids.length ? await fetchAll(() => sb.from('count_lines').select('count_id,counted_qty').in('count_id', ids)) : [];
    const prog = id => { const ls = lines.filter(l => l.count_id === id); return [ls.filter(l => l.counted_qty !== null).length, ls.length]; };
    const day = new Date().getDate(), open = +setting('count_open_day', 23), close = +setting('count_close_day', 26);
    const monthName = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const windowTxt = day < open ? `opens on the ${ord(open)}` : day <= close ? `is open until the end of the ${ord(close)}` : `closed on the ${ord(close)}`;
    return topbar('Monthly count', `${monthName}: the count window ${windowTxt}.`) +
      `<div class="countcards">${S.depts.map(d => {
        const c = cur.find(x => x.department_id === d.id); const [done, tot] = c ? prog(c.id) : [0, 0];
        const st = c ? c.state : 'none'; const late = day > close && !['submitted', 'verified'].includes(st);
        const status = { none: chip(late ? 'overdue' : 'muted', late ? 'Late · not started' : 'Not started'), in_progress: chip(late ? 'overdue' : 'out', late ? 'Late · in progress' : 'In progress'),
          rejected: chip('overdue', 'Sent back: recount'), submitted: chip('pending', 'Awaiting approval'), verified: chip('ok', 'Verified') }[st];
        const act = canAct(d.id);
        return `<div class="ccard ${act ? '' : 'dim'}"><div class="cc-head"><b>${esc(d.short_name || d.name)}</b>${status}</div>
          <div class="progress"><span style="width:${tot ? Math.round(done / tot * 100) : 0}%"></span></div>
          <div class="sub">${c ? `${done} of ${tot} counted${c.submitted_by_name ? ` · submitted by ${esc(c.submitted_by_name)}` : ''}${c.verified_by_name ? ` · verified by ${esc(c.verified_by_name)}` : ''}` : 'No count yet this month'}</div>
          <div class="cc-act">${c ? `<a class="btn small ${act && ['in_progress', 'rejected'].includes(st) ? 'tagbtn' : ''}" href="#/count/${c.id}">${act && ['in_progress', 'rejected'].includes(st) ? 'Continue counting' : 'View'}</a>`
            : act ? `<button class="btn small tagbtn" data-start="${d.id}">Start ${esc(d.short_name || d.name)} count</button>` : ''}</div></div>`;
      }).join('')}</div>
      <section class="panel"><header><h2>How the monthly count works</h2></header><div class="body"><ol class="steps">
        <li>Between the ${ord(open)} and ${ord(close)}, each service line counts what’s physically in its stores. Use your phone in the store, or download the count sheet and fill it in.</li>
        <li>Tick ✓ where the number matches, or type the real number where it doesn’t. Your progress saves as you go.</li>
        <li>Submit when everything is counted. Your service-line admin reviews only the differences and approves.</li>
        <li>Approval locks that month’s snapshot, signed with who counted and who approved. It feeds the monthly reports and comparisons.</li></ol></div></section>
      <section class="panel"><header><h2>Previous counts</h2></header>
        ${hist.length ? `<table class="t stack"><thead><tr><th>Month</th><th>Service line</th><th>Status</th><th>Counted by</th><th>Verified by</th><th></th></tr></thead><tbody>
          ${hist.map(c => `<tr><td class="name">${fmonth(c.month)}</td><td>${esc(lineShort(c.department_id))}</td><td>${chip(c.state === 'verified' ? 'ok' : c.state === 'submitted' ? 'pending' : 'muted', c.state.replace('_', ' '))}</td>
            <td>${esc(c.submitted_by_name || c.started_by_name || '—')}</td><td>${esc(c.verified_by_name || '—')}</td><td class="num"><a class="btn small" href="#/count/${c.id}">Open</a></td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">No previous counts yet. This month’s count will be the first.</div>'}</section>`;
  },
  async loadSheet(id) {
    this.mode = 'sheet';
    const [c, lines] = await Promise.all([q(sb.from('counts').select('*').eq('id', id).maybeSingle()),
      fetchAll(() => sb.from('count_lines').select('*, items(code,name,category_id,unit,import_ref)').eq('count_id', id).order('id')), items()]);
    lines.sort((a, b) => (a.items?.import_ref ?? 1e9) - (b.items?.import_ref ?? 1e9) || String(a.items?.code).localeCompare(String(b.items?.code)) || a.location_id - b.location_id);
    if (!c) return topbar('Count not found') + '<a class="btn" href="#/count">Back</a>';
    this.c = c; this.lines = lines; this.dirty = new Map(); this.filter = this.filter || { q: '', only: false };
    const editable = canAct(c.department_id) && ['in_progress', 'rejected'].includes(c.state);
    this.editable = editable;
    const done = lines.filter(l => l.counted_qty !== null).length, diffs = lines.filter(l => l.counted_qty !== null && +l.counted_qty !== +l.system_qty).length;
    return `<a class="back" href="#/count">← Monthly count</a>` +
      topbar(`${esc(lineShort(c.department_id))} count · ${fmonth(c.month)}`, `${{ in_progress: 'In progress', rejected: 'Sent back for a recount', submitted: 'Submitted, awaiting approval', verified: 'Verified' }[c.state]}
        ${c.started_by_name ? ` · started by ${esc(c.started_by_name)}` : ''}${c.submitted_by_name ? ` · submitted by ${esc(c.submitted_by_name)}` : ''}${c.verified_by_name ? ` · verified by ${esc(c.verified_by_name)} ${fdt(c.verified_at)}` : ''}`,
        `<button class="btn" id="sheetpdf">${ico('pdf')}${c.state === 'verified' ? 'Count report' : 'Printable count sheet'}</button>
         ${editable ? `<button class="btn" id="dl">${ico('down')}Excel sheet</button><button class="btn" id="ul">${ico('up')}Upload filled sheet</button>` : ''}`) +
      `<div class="countbar"><div class="progress big"><span id="pbar" style="width:${Math.round(done / Math.max(1, lines.length) * 100)}%"></span></div>
        <span id="ptxt"><b>${done}</b> of ${lines.length} counted · <b>${diffs}</b> difference${diffs === 1 ? '' : 's'}</span></div>
      ${c.state === 'rejected' ? `<div class="notice bad">The admin sent this count back. Recount the items and submit again.</div>` : ''}
      <div class="filters"><input type="search" id="q" placeholder="Search code or description" value="${esc(this.filter.q)}">
        <label class="check" style="margin:0"><input type="checkbox" id="only" ${this.filter.only ? 'checked' : ''}> Only items not counted yet</label>
        ${editable ? '<button class="btn small" id="matchall">Mark all shown as matching</button>' : ''}</div>
      <section class="panel"><div class="tablewrap"><table class="t stack counttbl" id="tbl"><thead><tr><th>Code</th><th>Description</th><th>Location</th><th class="num">On record</th><th class="num">Counted</th><th></th><th>Note</th></tr></thead><tbody></tbody></table></div></section>
      ${editable ? `<div class="editbar"><span id="savestate">All changes saved</span><button class="btn small tagbtn" id="submit">Submit count</button></div>` : ''}`;
  },
  bind(main, parts) {
    if (this.mode === 'list') {
      $$('[data-start]', main).forEach(b => b.onclick = async () => { b.disabled = true; try { const id = await q(sb.rpc('start_count', { p_dept: +b.dataset.start })); go('#/count/' + id); } catch (e) { toast(niceError(e), true); b.disabled = false; } });
      return;
    }
    const { c, lines } = this; const ed = this.editable; const f = this.filter;
    const save = debounce(async () => {
      if (!this.dirty.size) return;
      const batch = [...this.dirty.values()]; this.dirty.clear();
      const st = $('#savestate', main); if (st) st.textContent = 'Saving…';
      try { await q(sb.rpc('save_count', { p_count: c.id, p_lines: batch })); if (st) st.textContent = 'All changes saved'; }
      catch (e) { toast(niceError(e), true); batch.forEach(b => this.dirty.set(b.id, b)); if (st) st.textContent = 'Not saved, retrying…'; setTimeout(save, 3000); }
    }, 700);
    const prog = () => {
      const done = lines.filter(l => l.counted_qty !== null).length, diffs = lines.filter(l => l.counted_qty !== null && +l.counted_qty !== +l.system_qty).length;
      $('#pbar', main).style.width = Math.round(done / Math.max(1, lines.length) * 100) + '%';
      $('#ptxt', main).innerHTML = `<b>${done}</b> of ${lines.length} counted · <b>${diffs}</b> difference${diffs === 1 ? '' : 's'}`;
    };
    const setVal = (l, v, note) => { l.counted_qty = v === '' || v === null ? null : +v; if (note !== undefined) l.note = note; this.dirty.set(l.id, { id: l.id, counted_qty: l.counted_qty, note: l.note || '' }); save(); prog(); };
    const draw = () => {
      const qq = f.q.toLowerCase();
      const rows = lines.filter(l => (!f.only || l.counted_qty === null) && (!qq || `${l.items?.code || ''} ${l.items?.name || ''}`.toLowerCase().includes(qq)));
      $('#tbl tbody', main).innerHTML = rows.length ? rows.map(l => {
        const diff = l.counted_qty !== null && +l.counted_qty !== +l.system_qty;
        return `<tr data-id="${l.id}" class="${l.counted_qty === null ? '' : diff ? 'diff' : 'match'}"><td class="codecell">${tag(l.items?.code)}</td><td class="full"><div class="name">${esc(l.items?.name)}</div></td>
        <td>${esc(locName(l.location_id))}</td><td class="num"><b>${fq(l.system_qty)}</b><span class="qlbl">on record</span></td>
        <td class="num">${ed ? `<input type="number" min="0" step="any" class="qin ${diff ? 'changed' : ''}" value="${l.counted_qty ?? ''}" placeholder="?" aria-label="Counted">` : `<b>${l.counted_qty ?? '—'}</b>`}<span class="qlbl">counted</span></td>
        <td>${ed ? `<button class="btn small ${l.counted_qty !== null && !diff ? 'okbtn' : ''}" data-match title="Matches the record">✓</button>` : (diff ? chip('soon', (l.counted_qty - l.system_qty > 0 ? '+' : '') + fq(l.counted_qty - l.system_qty)) : '')}</td>
        <td class="full">${ed ? `<input type="text" class="note" value="${esc(l.note || '')}" placeholder="${diff ? 'Why is it different?' : 'Note'}">` : `<span class="sub">${esc(l.note || '')}</span>`}</td></tr>`;
      }).join('') : '<tr><td colspan="7" class="empty">Nothing to show. Everything shown has been counted.</td></tr>';
    };
    const tb = $('#tbl tbody', main);
    if (ed) {
      tb.oninput = debounce(e => {
        const tr = e.target.closest('tr[data-id]'); if (!tr) return; const l = lines.find(x => x.id === +tr.dataset.id);
        if (e.target.classList.contains('qin')) { setVal(l, e.target.value); const diff = l.counted_qty !== null && +l.counted_qty !== +l.system_qty; tr.className = l.counted_qty === null ? '' : diff ? 'diff' : 'match'; e.target.classList.toggle('changed', diff); const mb = $('[data-match]', tr); if (mb) mb.classList.toggle('okbtn', l.counted_qty !== null && !diff); }
        if (e.target.classList.contains('note')) setVal(l, l.counted_qty, e.target.value);
      }, 250);
      tb.onclick = e => { const b = e.target.closest('[data-match]'); if (!b) return; const tr = b.closest('tr'); const l = lines.find(x => x.id === +tr.dataset.id); setVal(l, l.system_qty); $('.qin', tr).value = l.system_qty; tr.className = 'match'; b.classList.add('okbtn'); };
      $('#matchall', main).onclick = () => { const qq = f.q.toLowerCase(); lines.filter(l => l.counted_qty === null && (!qq || `${l.items?.code} ${l.items?.name}`.toLowerCase().includes(qq))).forEach(l => setVal(l, l.system_qty)); draw(); };
      $('#submit', main).onclick = () => {
        const left = lines.filter(l => l.counted_qty === null).length;
        if (left) return toast(`${plural(left, 'item')} still to count. Use “Only items not counted yet” to find them.`, true);
        const diffs = lines.filter(l => +l.counted_qty !== +l.system_qty);
        return modal({ title: `Submit ${lineShort(c.department_id)} count`, submit: canAdmin(c.department_id) ? 'Submit & verify' : 'Submit for approval',
          sub: `${plural(diffs.length, 'difference')} from the record. ${canAdmin(c.department_id) ? 'As the line admin, this verifies the count straight away.' : 'Your admin reviews the differences and approves.'}`,
          body: `${diffs.length ? `<table class="t"><thead><tr><th>Item</th><th>Location</th><th class="num">Record</th><th class="num">Counted</th><th>Note</th></tr></thead><tbody>${diffs.slice(0, 60).map(l => `<tr><td>${tag(l.items?.code)} ${esc(l.items?.name)}</td><td>${esc(locName(l.location_id))}</td><td class="num">${fq(l.system_qty)}</td><td class="num"><b>${fq(l.counted_qty)}</b></td><td class="sub">${esc(l.note || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="notice ok">Everything matches the record.</div>'}
            <label class="f mt">Note for the admin (optional)<input type="text" name="note"></label>`,
          onSubmit: async x => { await new Promise(r => setTimeout(r, 800)); const st = await q(sb.rpc('submit_count', { p_count: c.id, p_note: x.note || null })); toast(st === 'verified' ? 'Count verified' : 'Count submitted for approval'); refresh(); } });
      };
      $('#dl', main).onclick = () => countSheetXlsx(c, lines);
      $('#ul', main).onclick = () => modal({ title: 'Upload filled count sheet', submit: 'Upload', body: '<label class="f">File<input type="file" accept=".xlsx" required></label>',
        onSubmit: async (x, d) => {
          const file = $('input[type=file]', d).files[0]; if (!file) throw new Error('Choose the file.');
          const rows = await readXlsx(file); let n = 0;
          rows.forEach(r => { const l = lines.find(x => x.id === +r['App ID']); const v = r['Counted qty']; if (l && v !== '' && v != null && !isNaN(+v)) { setVal(l, +v, r['Note'] ? String(r['Note']) : l.note); n++; } });
          draw(); toast(`Filled in ${plural(n, 'line')} from the file`);
        } });
    }
    $('#sheetpdf', main).onclick = () => countSheetPdf(c, lines);
    $('#q', main).oninput = debounce(e => { f.q = e.target.value; draw(); }, 140);
    $('#only', main).onchange = e => { f.only = e.target.checked; draw(); };
    draw();
  }
};
async function countSheetXlsx(c, lines) {
  try {
    await brandXlsx({ file: `Count_${lineShort(c.department_id)}_${c.month.slice(0, 7)}.xlsx`, sheets: [{ name: 'Count sheet', title: `Monthly count: ${lineName(c.department_id)}`, subtitle: fmonth(c.month),
      columns: [{ header: 'App ID', key: 'id', width: 8 }, { header: 'Item Code', key: 'code', width: 26 }, { header: 'Description', key: 'name', width: 50, wrap: true }, { header: 'Location', key: 'loc', width: 16 },
        { header: 'On record', key: 'sys', width: 10, type: 'num' }, { header: 'Counted qty', key: 'cnt', width: 11, type: 'num', input: true }, { header: 'Note', key: 'note', width: 30, input: true }],
      rows: lines.map(l => ({ id: l.id, code: l.items?.code, name: l.items?.name, loc: locName(l.location_id), sys: +l.system_qty, cnt: l.counted_qty ?? '', note: l.note || '' })) }],
      instructions: ['How to use the count sheet', '1. Count what is physically in the store and type it in “Counted qty”. Type the same number as “On record” if it matches.', '2. Add a note where the number is different.', '3. Don’t change the App ID column.', '4. In Nest, open this month’s count and press “Upload filled sheet”. Then review and submit.'] });
  } catch (e) { toast(niceError(e), true); }
}
async function countSheetPdf(c, lines) {
  try {
    toast('Preparing the PDF…');
    const verified = c.state === 'verified';
    const diffs = lines.filter(l => l.counted_qty !== null && +l.counted_qty !== +l.system_qty).length;
    const cev = await signEvents('count', c.id); const e1 = cev.find(e => e.step === 'counted'), e2 = cev.find(e => e.step === 'approved');
    await brandPdf({
      file: `Count_${lineShort(c.department_id)}_${c.month.slice(0, 7)}.pdf`, title: verified ? 'Monthly Count Report' : 'Monthly Count Sheet', subtitle: `${lineName(c.department_id)} · ${fmonth(c.month)}`,
      meta: [['Service line', lineName(c.department_id)], ['Month', fmonth(c.month)], ['Status', c.state.replace('_', ' ')]],
      kpis: [{ label: 'Lines', value: lines.length }, { label: 'Counted', value: lines.filter(l => l.counted_qty !== null).length }, { label: 'Differences', value: diffs, tone: diffs ? 'warn' : '' }],
      sections: [{ heading: 'Count', columns: [{ header: 'Item Code', dataKey: 'code', width: 44, bold: true }, { header: 'Description', dataKey: 'name' }, { header: 'Location', dataKey: 'loc', width: 28 },
        { header: 'On record', dataKey: 'sys', width: 18, align: 'right' }, { header: 'Counted', dataKey: 'cnt', width: 18, align: 'right' }, { header: 'Difference', dataKey: 'diff', width: 20, align: 'right' }, { header: 'Note', dataKey: 'note', width: 50 }],
        rows: lines.map(l => ({ code: l.items?.code || '', name: l.items?.name, loc: locName(l.location_id), sys: fq(l.system_qty), cnt: l.counted_qty === null ? '' : fq(l.counted_qty),
          diff: l.counted_qty !== null && +l.counted_qty !== +l.system_qty ? ((l.counted_qty - l.system_qty > 0 ? '+' : '') + fq(l.counted_qty - l.system_qty)) : '', note: l.note || '', _d: l.counted_qty !== null && +l.counted_qty !== +l.system_qty })),
        cellStyle: (r, k) => k === 'diff' && r._d ? 'warn' : null }],
      signatures: [['submitted', 'verified'].includes(c.state) ? sigFromEvent('Counted by', e1, { name: c.submitted_by_name || '', title: S.people[c.submitted_by]?.job_title || '', date: c.submitted_at ? fd(c.submitted_at) : '' }) : { label: 'Counted by' },
        verified ? sigFromEvent('Approved by (line admin)', e2, { name: c.verified_by_name || '', date: c.verified_at ? fd(c.verified_at) : '' }) : { label: 'Approved by (line admin)' }],
    });
  } catch (e) { console.error(e); toast(niceError(e), true); }
}

// ================================================================ APPROVALS
const BATCH_KIND = { edit: 'Quantity changes', count: 'Monthly count', kits: 'Redress kit details' };
ROUTES.approvals = {
  async load() {
    const v = S.appr.view;
    let qb = sb.from('change_batches').select('*, change_lines(*, items(code,name))').order('submitted_at', { ascending: v === 'pending' }).limit(v === 'pending' ? 500 : 80);
    qb = v === 'pending' ? qb.eq('state', 'pending') : qb.neq('state', 'pending');
    if (!isAdmin()) qb = qb.eq('submitted_by', S.profile.id);
    let rows = await q(qb);
    if (S.line) rows = rows.filter(b => b.department_id === +S.line);
    this.rows = rows; S.appr.sel = new Set([...S.appr.sel].filter(id => rows.some(r => r.id === id)));
    const mrs = isAdmin() && v === 'pending' ? (await q(sb.from('jobs').select('id,job_no,title,requester_name,submitted_at,job_sections(department_id,state)').in('status', ['submitted', 'partial'])))
      .filter(j => (j.job_sections || []).some(s => s.state === 'pending' && canAdmin(s.department_id) && (!S.line || s.department_id === +S.line))) : [];
    const groups = S.depts.map(d => ({ d, bs: rows.filter(b => b.department_id === d.id) })).filter(g => g.bs.length);
    return topbar(isAdmin() ? 'Approvals' : 'My requests', isAdmin() ? 'Quantity changes, monthly counts and kit details from staff. Approve one by one, in bulk, or a whole service line at once.' : 'Changes you sent for approval, and what happened to them.') +
      lineChips() + `<div class="filters"><div class="seg" id="seg">${[['pending', 'Waiting'], ['done', 'Decided']].map(([k, l]) => `<button data-v="${k}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${mrs.length ? `<section class="panel"><header><h2>Materials requests to approve &amp; issue</h2><span class="meta">${mrs.length}</span></header><ul class="list">
        ${mrs.map(j => `<li><a class="main" href="#/job/${j.id}"><div class="name">${tag(j.job_no)} ${esc(j.title)}</div><div class="sub">${esc(j.requester_name || '')} · submitted ${fdt(j.submitted_at)} · waiting: ${j.job_sections.filter(s => s.state === 'pending' && canAdmin(s.department_id)).map(s => lineShort(s.department_id)).join(', ')}</div></a>
          <div class="end"><a class="btn small tagbtn" href="#/job/${j.id}">Open</a></div></li>`).join('')}</ul></section>` : ''}
      <div id="bulk"></div>
      ${groups.length || mrs.length ? groups.map(({ d, bs }) => `<section class="apgroup"><header><h2>${esc(d.name)}</h2><span class="meta">${plural(bs.length, 'request')}</span>
        ${v === 'pending' && canAdmin(d.id) ? `<div class="right"><button class="btn small primary" data-all="${d.id}">Approve all ${esc(d.short_name || d.name)}</button></div>` : ''}</header>
        ${bs.map(b => batchCard(b, v === 'pending' && canAdmin(b.department_id))).join('')}</section>`).join('')
        : `<section class="panel"><div class="empty">${v === 'pending' ? (isAdmin() ? 'Nothing waiting for approval.' : 'You have nothing waiting for approval.') : 'No decisions yet.'}</div></section>`}`;
  },
  bind(main) {
    bindLineChips(main);
    $$('#seg button', main).forEach(b => b.onclick = () => { S.appr.view = b.dataset.v; render(); });
    const drawBulk = () => {
      const n = S.appr.sel.size; $('#bulk', main).innerHTML = n ? `<div class="bulkbar"><b>${plural(n, 'request')} selected</b>
        <button class="btn small tagbtn" id="b-ok">Approve selected</button><button class="btn small" id="b-no">Reject selected</button><button class="btn small" id="b-clear">Clear</button></div>` : '';
      if (!n) return;
      $('#b-ok', main).onclick = () => decide([...S.appr.sel], true);
      $('#b-no', main).onclick = () => decide([...S.appr.sel], false);
      $('#b-clear', main).onclick = () => { S.appr.sel.clear(); $$('[data-sel]', main).forEach(c => c.checked = false); drawBulk(); };
    };
    const decide = (ids, ok, lineIds) => modal({
      title: ok ? `Approve ${plural(lineIds ? lineIds.length : ids.length, lineIds ? 'line' : 'request')}` : `Reject ${plural(lineIds ? lineIds.length : ids.length, lineIds ? 'line' : 'request')}`,
      submit: ok ? 'Approve' : 'Reject', danger: !ok,
      sub: ok ? 'Stock updates straight away and the requester is notified.' : 'Nothing changes in stock. The requester sees your reason.',
      body: `<label class="f">${ok ? 'Note (optional)' : 'Reason'}<textarea name="note" ${ok ? '' : 'required'}></textarea></label>`,
      onSubmit: async x => {
        if (lineIds) await q(sb.rpc('decide_lines', { p_ids: lineIds, p_approve: ok, p_note: x.note || null }));
        else await q(sb.rpc('decide_batches', { p_ids: ids, p_approve: ok, p_note: x.note || null }));
        S.appr.sel.clear(); toast(ok ? 'Approved' : 'Rejected'); refresh();
      }
    });
    $$('[data-sel]', main).forEach(c => c.onchange = () => { const id = +c.dataset.sel; c.checked ? S.appr.sel.add(id) : S.appr.sel.delete(id); drawBulk(); });
    $$('[data-ok]', main).forEach(b => b.onclick = () => decide([+b.dataset.ok], true));
    $$('[data-no]', main).forEach(b => b.onclick = () => decide([+b.dataset.no], false));
    $$('[data-lok]', main).forEach(b => b.onclick = () => decide([], true, [+b.dataset.lok]));
    $$('[data-lno]', main).forEach(b => b.onclick = () => decide([], false, [+b.dataset.lno]));
    $$('[data-all]', main).forEach(b => b.onclick = () => decide(this.rows.filter(r => r.department_id === +b.dataset.all && r.state === 'pending').map(r => r.id), true));
    drawBulk();
  }
};
function batchCard(b, canDecide) {
  const lines = b.change_lines || [];
  const kindChip = b.kind === 'count' ? chip('out', 'Monthly count') : b.kind === 'kits' ? chip('reserved', 'Kit details') : chip('muted', 'Quantity changes');
  const stateChip = b.state === 'pending' ? chip('pending', 'Waiting') : chip(b.state === 'rejected' ? 'rejected' : 'approved', b.state);
  const body = b.kind === 'kits'
    ? `<table class="t"><thead><tr><th>Kit</th><th>Kit no.</th><th>Component</th><th>Expiry</th></tr></thead><tbody>${(b.payload || []).slice(0, 80).map(r => { const it = (S.items || []).find(i => i.id === +r.item_id); return `<tr><td>${tag(it?.code)} ${esc(it?.name || '')}</td><td>${esc(r.kit_no)}</td><td>${esc(r.component || '—')}</td><td>${r.expiry_on ? fd(r.expiry_on) : 'No expiry'}</td></tr>`; }).join('')}</tbody></table>`
    : lines.length ? `<table class="t"><thead><tr><th>Item</th><th>Location</th><th class="num">Was</th><th class="num">Now</th><th>Reason</th>${canDecide && b.kind === 'edit' ? '<th></th>' : '<th></th>'}</tr></thead><tbody>
      ${lines.map(l => `<tr><td>${tag(l.items?.code)} ${esc(l.items?.name)}</td><td>${esc(locName(l.location_id))}${l.status !== 'available' ? ` (${STATUS[l.status].toLowerCase()})` : ''}</td>
        <td class="num">${fq(l.qty_before)}</td><td class="num"><b>${fq(l.qty_after)}</b> <span class="sub">${l.qty_after - l.qty_before > 0 ? '+' : ''}${fq(l.qty_after - l.qty_before)}</span></td><td class="sub">${esc(l.reason || '')}</td>
        <td class="num nowrap">${canDecide && b.kind === 'edit' && l.state === 'pending' ? `<button class="btn small link" data-lok="${l.id}">Approve</button><button class="btn small link danger" data-lno="${l.id}">Reject</button>` : l.state !== 'pending' ? chip(l.state === 'approved' ? 'approved' : 'rejected', l.state) : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No differences: everything matched the record.</div>';
  return `<article class="batch">
    <div class="bh">${canDecide ? `<input type="checkbox" data-sel="${b.id}" ${S.appr.sel.has(b.id) ? 'checked' : ''} aria-label="Select request ${b.id}">` : ''}
      <div class="bt"><div>${kindChip} ${stateChip} <b>${esc(b.submitted_by_name || 'Someone')}</b> <span class="sub">${fdt(b.submitted_at)} · #${b.id}</span></div>
      <div class="sub">“${esc(b.reason || '')}”${b.decided_by_name ? ` · ${b.state} by ${esc(b.decided_by_name)} ${fdt(b.decided_at)}` : ''}${b.decision_note ? ` · ${esc(b.decision_note)}` : ''}</div></div>
      ${canDecide ? `<div class="right"><button class="btn small primary" data-ok="${b.id}">Approve</button><button class="btn small" data-no="${b.id}">Reject</button></div>` : ''}</div>
    <details ${lines.length <= 6 || b.kind === 'kits' ? 'open' : ''}><summary>${b.kind === 'kits' ? plural((b.payload || []).length, 'row') : plural(lines.length, 'change')}</summary><div class="tablewrap">${body}</div></details></article>`;
}

// ================================================================ CERTIFICATES & KITS
ROUTES.certs = {
  async load(parts, params) {
    if (params.get('tab')) { S.certs.tab = params.get('tab'); history.replaceState(null, '', '#/certs'); }
    const [certs, kits] = await Promise.all([
      q(sb.from('certifications').select('*, items(code,name,department_id)').eq('superseded', false).order('due_on', { nullsFirst: false })),
      q(sb.from('kit_status').select('*').order('expiry_on', { nullsFirst: false })),
    ]);
    this.certRows = certs; this.kitRows = kits;
    const tab = S.certs.tab;
    return topbar('Certificates & kits', 'Certifications, calibrations, maintenance and redress-kit expiry: latest record per item.',
      `<button class="btn" id="xls">${ico('down')}Excel</button><button class="btn" id="pdf">${ico('pdf')}PDF</button>`) + lineChips() +
      `<div class="tabs"><button data-t="certs" class="${tab === 'certs' ? 'on' : ''}">Certificates & maintenance</button><button data-t="kits" class="${tab === 'kits' ? 'on' : ''}">Redress kits</button></div>
      <div class="filters"><div class="seg" id="seg">${[['overdue', 'Expired / overdue'], ['soon', 'Due soon'], ['90', 'Next 90 days'], ['all', 'All']].map(([k, l]) => `<button data-v="${k}" class="${S.certs.view === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <section class="panel"><div class="tablewrap"><table class="t stack" id="tbl"><thead></thead><tbody></tbody></table></div></section>`;
  },
  rowsNow() {
    const t = localISO(0); const warn = S.certs.tab === 'kits' ? +setting('kit_warn_days', 60) : +setting('cert_warn_days', 30);
    const lim = { overdue: t, soon: localISO(warn), '90': localISO(90) }[S.certs.view];
    const due = r => S.certs.tab === 'kits' ? r.expiry_on : r.due_on;
    const dep = r => S.certs.tab === 'kits' ? r.department_id : r.items?.department_id;
    return (S.certs.tab === 'kits' ? this.kitRows : this.certRows).filter(r => (!S.line || dep(r) === +S.line) &&
      (S.certs.view === 'all' || (due(r) && (S.certs.view === 'overdue' ? due(r) < t : due(r) <= lim))));
  },
  bind(main) {
    bindLineChips(main);
    const draw = () => {
      const rows = this.rowsNow(); const kits = S.certs.tab === 'kits';
      $('#tbl thead', main).innerHTML = kits ? '<tr><th>Kit</th><th>Kit no.</th><th>Service line</th><th>Expires first</th><th>Expiry</th><th></th></tr>' : '<tr><th>Item</th><th>Kind</th><th>Certificate no.</th><th>Done by</th><th>Due</th><th></th></tr>';
      $('#tbl tbody', main).innerHTML = rows.length ? rows.map(r => kits
        ? `<tr class="click" data-id="${r.item_id}"><td class="full">${tag(r.code)} <span class="name">${esc(r.name)}</span></td><td class="name">${esc(r.kit_no)}</td><td>${esc(lineShort(r.department_id))}</td>
          <td class="sub">${esc(r.expiring_component || '—')}</td><td>${r.expiry_on ? fd(r.expiry_on) : 'No expiry dates'}</td><td class="num">${r.expiry_on ? dueChip(r.expiry_on, +setting('kit_warn_days', 60)) : ''}</td></tr>`
        : `<tr class="click" data-id="${r.item_id}"><td class="full">${tag(r.items?.code)} <span class="name">${esc(r.items?.name)}</span></td><td>${CERT_KINDS[r.kind]}</td>
          <td>${esc(r.cert_no || '—')}</td><td class="hide-m">${esc(r.provider || '—')}</td><td>${fd(r.due_on)}</td><td class="num">${dueChip(r.due_on, +setting('cert_warn_days', 30))}</td></tr>`).join('')
        : `<tr><td colspan="6" class="empty">${kits ? (this.kitRows.length ? 'Nothing in this range.' : 'No redress kits recorded yet. Open a kit item and add its kit numbers, or use the Redress kits Excel template.') : (this.certRows.length ? 'Nothing in this range.' : 'No records yet. Open an item and choose Record under Certificates & maintenance.')}</td></tr>`;
    };
    $$('.tabs button', main).forEach(b => b.onclick = () => { S.certs.tab = b.dataset.t; $$('.tabs button', main).forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $$('#seg button', main).forEach(b => b.onclick = () => { S.certs.view = b.dataset.v; $$('#seg button', main).forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#tbl tbody', main).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) go('#/item/' + tr.dataset.id); };
    const exp = async kind => {
      const kits = S.certs.tab === 'kits'; const rows = this.rowsNow(); const t = localISO(0);
      const R = rows.map(r => kits ? { code: r.code, name: r.name, kit: r.kit_no, line: lineShort(r.department_id), comp: r.expiring_component || '', due: r.expiry_on || '', st: r.expiry_on ? (r.expiry_on < t ? 'Expired' : r.expiry_on <= localISO(+setting('kit_warn_days', 60)) ? 'Expiring' : 'Valid') : 'No expiry' }
        : { code: r.items?.code, name: r.items?.name, kit: CERT_KINDS[r.kind], line: lineShort(r.items?.department_id), comp: r.cert_no || '', due: r.due_on || '', st: r.due_on ? (r.due_on < t ? 'Overdue' : r.due_on <= localISO(+setting('cert_warn_days', 30)) ? 'Due soon' : 'Valid') : '' });
      const tone = (r, k) => k === 'st' ? ({ Expired: 'overdue', Overdue: 'overdue', Expiring: 'warn', 'Due soon': 'warn', Valid: 'ok' }[r.st]) : null;
      const title = kits ? 'Redress Kit Expiry' : 'Certificates & Maintenance';
      if (kind === 'xlsx') await brandXlsx({ file: `GANKCO_${kits ? 'Redress_Kits' : 'Certificates'}_${t}.xlsx`, sheets: [{ name: kits ? 'Redress kits' : 'Certificates', title, subtitle: `${S.line ? lineName(S.line) : 'All service lines'} · ${fd(t)}`,
        columns: [{ header: 'Item Code', key: 'code', width: 26, bold: true }, { header: 'Description', key: 'name', width: 46, wrap: true }, { header: kits ? 'Kit no.' : 'Kind', key: 'kit', width: 14 }, { header: 'Service line', key: 'line', width: 13 },
          { header: kits ? 'Expires first' : 'Certificate no.', key: 'comp', width: 24 }, { header: kits ? 'Expiry' : 'Due', key: 'due', width: 13, type: 'date' }, { header: 'Status', key: 'st', width: 12 }], rows: R, cellStyle: tone }] });
      else await brandPdf({ file: `GANKCO_${kits ? 'Redress_Kits' : 'Certificates'}_${t}.pdf`, title, subtitle: `${S.line ? lineName(S.line) : 'All service lines'} · ${fd(t)}`,
        kpis: [{ label: 'Records', value: R.length }, { label: kits ? 'Expired' : 'Overdue', value: R.filter(r => ['Expired', 'Overdue'].includes(r.st)).length, tone: 'bad' }, { label: 'Due soon', value: R.filter(r => ['Expiring', 'Due soon'].includes(r.st)).length, tone: 'warn' }],
        sections: [{ heading: title, columns: [{ header: 'Item Code', dataKey: 'code', width: 44, bold: true }, { header: 'Description', dataKey: 'name' }, { header: kits ? 'Kit no.' : 'Kind', dataKey: 'kit', width: 24 }, { header: 'Line', dataKey: 'line', width: 22 },
          { header: kits ? 'Expires first' : 'Cert no.', dataKey: 'comp', width: 36 }, { header: kits ? 'Expiry' : 'Due', dataKey: 'dueF', width: 24 }, { header: 'Status', dataKey: 'st', width: 20 }], rows: R.map(r => ({ ...r, dueF: r.due ? fd(r.due) : '' })), cellStyle: tone }], signatures: [mySignature('Prepared by', title)] });
    };
    $('#xls', main).onclick = () => exp('xlsx').catch(e => toast(niceError(e), true));
    $('#pdf', main).onclick = () => exp('pdf').catch(e => toast(niceError(e), true));
    draw();
  }
};

// ================================================================ ACTIVITY
ROUTES.activity = {
  async fetch(reset) {
    const a = S.act; if (reset) { a.rows = []; a.done = false; }
    let qb = sb.from('movements').select('*, items(code,name,department_id)').order('created_at', { ascending: false }).range(a.rows.length, a.rows.length + 299);
    if (a.type) qb = qb.eq('type', a.type);
    if (a.from) qb = qb.gte('created_at', a.from + 'T00:00:00');
    if (a.to) qb = qb.lte('created_at', a.to + 'T23:59:59');
    const rows = await q(qb); a.rows.push(...rows); if (rows.length < 300) a.done = true;
  },
  async load() {
    await this.fetch(true); const a = S.act;
    return topbar('Activity', 'Every stock movement, with who did it and when', `<button class="btn" id="xls">${ico('down')}Excel</button>`) + lineChips() +
      `<div class="filters"><input type="search" id="q" placeholder="Filter by item, job or person" value="${esc(a.q)}">
        <select id="type"><option value="">All activity</option>${Object.entries(MOVE_TYPES).map(([k, v]) => opt(k, v, a.type)).join('')}</select>
        <input type="date" id="from" value="${esc(a.from)}" aria-label="From date" class="dateinp"><input type="date" id="to" value="${esc(a.to)}" aria-label="To date" class="dateinp"></div>
      <section class="panel"><ul class="list" id="list"></ul><div class="body" id="more"></div></section>`;
  },
  bind(main) {
    const a = S.act;
    bindLineChips(main, () => draw());
    const filtered = () => { const qq = a.q.trim().toLowerCase(); return a.rows.filter(m => (!S.line || m.items?.department_id === +S.line) && (!qq || `${m.items?.code} ${m.items?.name} ${m.ref || ''} ${m.user_name || ''} ${m.notes || ''}`.toLowerCase().includes(qq))); };
    const draw = () => {
      $$('#lines button', main).forEach(b => b.classList.toggle('on', b.dataset.l === S.line));
      const rows = filtered();
      $('#list', main).innerHTML = rows.length ? rows.map(m => `<li><a class="main" href="#/item/${m.item_id}"><div class="name">${tag(m.items?.code)} ${esc(m.items?.name)}</div>
        <div class="sub" style="color:var(--ink)">${esc(describeMove(m))}</div><div class="sub">${[m.notes, m.serials && 'S/N ' + m.serials].filter(Boolean).map(esc).join(' · ')}</div></a>
        <div class="end sub">${esc(m.user_name || '')}<br>${fdt(m.created_at)}</div></li>`).join('') : '<li class="empty">No activity for these filters.</li>';
      $('#more', main).innerHTML = a.done ? '' : '<button class="btn" id="loadmore">Load older activity</button>';
      const lm = $('#loadmore', main); if (lm) lm.onclick = async () => { lm.disabled = true; await this.fetch(false); draw(); };
    };
    $('#q', main).oninput = debounce(e => { a.q = e.target.value; draw(); }, 120);
    $('#type', main).onchange = e => { a.type = e.target.value; render({ quiet: true }); };
    $('#from', main).onchange = e => { a.from = e.target.value; render({ quiet: true }); };
    $('#to', main).onchange = e => { a.to = e.target.value; render({ quiet: true }); };
    $('#xls', main).onclick = () => brandXlsx({ file: `GANKCO_Activity_${localISO(0)}.xlsx`, sheets: [{ name: 'Activity', title: 'Stock activity', subtitle: `${S.line ? lineName(S.line) : 'All service lines'}${a.from || a.to ? ` · ${a.from ? fd(a.from) : '…'} to ${a.to ? fd(a.to) : 'today'}` : ''}`,
      columns: [{ header: 'Date & time', key: 'at', width: 18 }, { header: 'Item Code', key: 'code', width: 26 }, { header: 'Item', key: 'name', width: 40, wrap: true }, { header: 'What happened', key: 'what', width: 46, wrap: true },
        { header: 'Qty', key: 'qty', width: 8, type: 'num' }, { header: 'By', key: 'by', width: 18 }, { header: 'Notes', key: 'notes', width: 34, wrap: true }],
      rows: filtered().map(m => ({ at: new Date(m.created_at).toLocaleString('en-GB'), code: m.items?.code, name: m.items?.name, what: describeMove(m), qty: +m.qty, by: m.user_name, notes: m.notes })) }] }).catch(e => toast(niceError(e), true));
    draw();
  }
};
