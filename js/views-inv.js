/* GANKCO Nest — Inventory: dashboard, list, item page, stock actions */
'use strict';

function statusChips(it) {
  const c = [];
  if (+it.qty_out) c.push(chip('out', `${fq(it.qty_out)} out`));
  if (+it.qty_reserved) c.push(chip('reserved', `${fq(it.qty_reserved)} reserved`));
  if (+it.qty_in_transit) c.push(chip('in_transit', `${fq(it.qty_in_transit)} in transit`));
  if (+it.qty_damaged) c.push(chip('damaged', `${fq(it.qty_damaged)} damaged`));
  if (+it.qty_available === 0 && (it.item_type !== 'equipment' || it.is_low)) c.push(chip('low', 'None left'));
  else if (it.is_low) c.push(chip('low', 'Low'));
  if (it.kit_expiry) { const k = kitState(it.kit_expiry); if (k !== 'ok') c.push(chip(k === 'expired' ? 'overdue' : 'soon', k === 'expired' ? 'Kit expired' : 'Kit expiring')); }
  return c.join(' ');
}
function kitState(exp) { if (!exp) return 'none'; if (exp < localISO(0)) return 'expired'; if (exp <= localISO(+setting('kit_warn_days', 60))) return 'soon'; return 'ok'; }
function dueChip(due, warn = 30) {
  if (!due) return '';
  if (due < localISO(0)) return chip('overdue', 'Overdue');
  if (due <= localISO(warn)) return chip('soon', 'Due soon');
  return chip('ok', 'Valid');
}
// ---------------------------------------------------------------- 2.9: where an item sits (service line, sub line, type, sub-type)
const invPlace = i => [i.svc_code && i.sub_line ? `${i.svc_code} · ${i.sub_line}` : (i.sub_line || i.line), i.subtype || kindLabel(i.kind)].filter(Boolean).join(' · ');
function invSubtypeOptions(kind, sel, opts = {}) {
  const head = opts.none ? `<option value="">${esc(opts.none)}</option>` : `<option value="">${kind ? 'All sub-types' : 'All sub-types'}</option>`;
  const all = !!opts.all;
  if (kind) return head + subtypesOf(kind, all).map(t => opt(t.id, t.name + (t.active ? '' : ' (archived)'), sel)).join('');
  return head + Object.entries(KINDS).map(([k, v]) => { const ts = subtypesOf(k, all); return ts.length ? `<optgroup label="${esc(v)}">${ts.map(t => opt(t.id, t.name, sel)).join('')}</optgroup>` : ''; }).join('');
}
// service line → sub service line → type → sub-type fields, used by Add/Edit item and Move to
function placeFields(it, { change } = {}) {
  const sub = it?.sub_line_id ? svcById(it.sub_line_id) : null; const major = sub ? sub.parent_id : '';
  const nc = change ? '<option value="">No change</option>' : '<option value="">Choose…</option>';
  return `<div class="row2"><label class="f">Service line<select name="svc" id="pf-svc">${nc}${svcMajors().map(l => opt(l.id, `${l.code} · ${l.name}`, change ? '' : major)).join('')}</select></label>
      <label class="f">Sub service line<select name="sub_line_id" id="pf-sub"></select></label></div>
    <div class="row2"><label class="f">Type<select name="kind" id="pf-kind">${nc}${Object.entries(KINDS).map(([k, v]) => opt(k, v, change ? '' : it?.kind)).join('')}</select><span class="hint" id="pf-kindhint"></span></label>
      <label class="f">Sub-type<select name="subtype_id" id="pf-st"></select></label></div>
    <div class="notice small" id="pf-team" hidden></div>`;
}
function wirePlaceFields(d, it, { change, items: list } = {}) {
  const sv = $('#pf-svc', d), sb_ = $('#pf-sub', d), kd = $('#pf-kind', d), st = $('#pf-st', d), team = $('#pf-team', d), hint = $('#pf-kindhint', d);
  const curSub = change ? '' : it?.sub_line_id, curSt = change ? '' : it?.subtype_id;
  const fillSub = keep => { const subs = sv.value ? svcSubs(sv.value) : [];
    sb_.innerHTML = (change ? '<option value="">No change</option>' : `<option value="">${sv.value ? 'Choose…' : 'Choose the service line first'}</option>`) + subs.map(l => opt(l.id, l.name + (l.department_id ? '' : ' (no team yet)'), keep ? curSub : '')).join('');
    sb_.disabled = !sv.value; showTeam(); };
  const fillSt = keep => {
    const k = kd.value || (change && list && new Set(list.map(x => x.kind)).size === 1 ? list[0].kind : '');
    const ts = k ? subtypesOf(k) : [];
    if (change && !kd.value) st.innerHTML = '<option value="__">No change</option>' + (ts.length ? '<option value="">None</option>' + ts.map(t => opt(t.id, t.name)).join('') : '');
    else st.innerHTML = '<option value="">None</option>' + ts.map(t => opt(t.id, t.name, keep ? curSt : '')).join('');
    st.disabled = !ts.length && !(change && !kd.value);
    hint.textContent = kd.value ? KIND_HINT[kd.value] : '';
  };
  const showTeam = () => {
    const sub = svcById(sb_.value); team.hidden = true; if (!sub) return;
    const from = [...new Set((list || (it ? [it] : [])).map(x => x.department_id))];
    if (sub.department_id && from.length && from.some(x => x !== sub.department_id)) { team.hidden = false; team.innerHTML = `${ico('users')}<span>These items will be looked after by <b>${esc(lineName(sub.department_id))}</b>. Its admins get a bell alert.</span>`; }
    else if (!sub.department_id && !from.length) { team.hidden = false; team.innerHTML = `<span><b>${esc(sub.name)}</b> has no team yet: choose which team looks after this item below.</span>`; }
    const tw = $('#pf-teamwrap', d); if (tw) tw.hidden = !!sub.department_id;
  };
  sv.onchange = () => fillSub(false); sb_.onchange = showTeam; kd.onchange = () => fillSt(false);
  fillSub(true); fillSt(true);
}
// one line for the item's History: what changed in its place (service line, team, type, sub-type)
function itemDetailChange(a) {
  const o = a.old_data || {}, n = a.new_data || {}; const parts = [];
  const v = (k, x) => x == null ? 'none' : k === 'sub_line_id' ? svcLabel(x) : k === 'subtype_id' ? (subtypeName(x) || '#' + x) : k === 'department_id' ? lineName(x) : k === 'kind' ? kindLabel(x) : String(x);
  [['sub_line_id', 'Sub service line'], ['kind', 'Type'], ['subtype_id', 'Sub-type'], ['department_id', 'Team']].forEach(([k, l]) => { if (k in n) parts.push(`${l}: ${v(k, o[k])} → ${v(k, n[k])}`); });
  return parts.join(' · ');
}
// Move to… (admins): sub service line, type and sub-type for the selected items
function moveItemsTo(list) {
  const out = list.filter(i => +i.qty_out > 0);
  return modal({
    title: `Move ${plural(list.length, 'item')}`, submit: 'Move', wide: false,
    sub: 'Choose where these items belong. Anything left as “No change” stays as it is. Moving into another team’s sub service line hands the items to that team.',
    body: placeFields(null, { change: true }) + (out.length ? `<p class="muted small">${plural(out.length, 'item')} ${out.length === 1 ? 'is' : 'are'} out on a job, so ${out.length === 1 ? 'its' : 'their'} type can’t change until ${out.length === 1 ? 'it’s' : 'they’re'} back.</p>` : ''),
    onOpen: d => wirePlaceFields(d, null, { change: true, items: list }),
    onSubmit: async x => {
      const p = {};
      if (x.sub_line_id) p.sub_line_id = +x.sub_line_id; else if (x.svc) throw new Error('Choose the sub service line too, or set Service line back to “No change”.');
      if (x.kind) p.kind = x.kind;
      if (x.subtype_id !== '__' && x.subtype_id !== undefined) p.subtype_id = x.subtype_id ? +x.subtype_id : null;
      if (!Object.keys(p).length) throw new Error('Choose at least one thing to change.');
      const n = await q(sb.rpc('item_move', { p_ids: list.map(i => i.id), p }));
      toast(`Moved ${plural(n, 'item')}`); S.inv.sel.clear(); invalidate(); refresh();
    }
  });
}

function needsReorder(it) { return it.active && (it.is_low || (it.item_type !== 'equipment' && +it.qty_available === 0)); }
function unplacedQty(it) { const ph = placeholderLoc(); return ph ? stockOf(it.id, ph.id) + stockOf(it.id, ph.id, 'damaged') + stockOf(it.id, ph.id, 'reserved') : 0; }

function describeMove(m) {
  const n = fq(Math.abs(m.qty)), fl = locName(m.from_location_id), tl = locName(m.to_location_id);
  switch (m.type) {
    case 'opening': return `Opening balance of ${n} at ${tl}`;
    case 'receive': return `Received ${n} into ${tl}${m.to_status && m.to_status !== 'available' ? ` (${STATUS[m.to_status].toLowerCase()})` : ''}`;
    case 'checkout': return `Checked out ${n} to ${m.ref || 'a job'}`;
    case 'return': return `Returned ${n} to ${tl}${m.to_status === 'damaged' ? ' as damaged' : ''}${m.ref ? ` from ${m.ref}` : ''}`;
    case 'transfer': return `Moved ${n} from ${fl} to ${tl}${m.to_status === 'in_transit' ? ' (in transit)' : ''}`;
    case 'status': return `${n} at ${fl} changed from ${(STATUS[m.from_status] || '').toLowerCase()} to ${(STATUS[m.to_status] || '').toLowerCase()}`;
    case 'issue': return `Used ${n} on ${m.ref}`;
    case 'sale': return `Sold ${n}: ${m.ref}`;
    case 'adjust': return `${m.ref === 'Monthly count' ? 'Monthly count' : 'Quantity correction'} at ${fl}: ${m.qty > 0 ? '+' : '−'}${n}`;
    case 'writeoff': return `Wrote off ${n} at ${fl}`;
    case 'lost': return `Wrote off ${n} lost on ${m.ref || 'a job'}`;
    case 'certificate': return `Recorded ${m.ref || 'certificate'}`;
    default: return `${m.type} ${n}`;
  }
}
const MOVE_TYPES = { receive: 'Received', checkout: 'Checked out', return: 'Returned', transfer: 'Moved', status: 'Status change', issue: 'Used on job / issued', sale: 'Sold', adjust: 'Corrections & counts', writeoff: 'Write-off', lost: 'Lost on job', certificate: 'Certificate', opening: 'Opening balance' };

// ================================================================ DASHBOARD
ROUTES.dashboard = {
  async load() {
    const t = localISO(0);
    const [its, cos, certs, kits, moves, counts] = await Promise.all([
      items(),
      q(sb.from('checkouts').select('*, items(code,name,department_id)').is('closed_at', null).order('due_back', { nullsFirst: false })),
      q(sb.from('certifications').select('*, items(code,name,department_id)').eq('superseded', false).not('due_on', 'is', null).lte('due_on', localISO(+setting('cert_warn_days', 30))).order('due_on')),
      q(sb.from('kit_status').select('*').not('expiry_on', 'is', null).lte('expiry_on', localISO(+setting('kit_warn_days', 60))).order('expiry_on')),
      q(sb.from('movements').select('*, items(code,name,department_id)').order('created_at', { ascending: false }).limit(40)),
      q(sb.from('counts').select('*').eq('month', monthISO())),
      refreshAlerts(), stockRows(), loadOrders(),
    ]);
    const L = +S.line || null; const inL = d => !L || d === L;
    const active = its.filter(i => i.active && inL(i.department_id));
    const low = active.filter(needsReorder);
    const co = cos.filter(c => inL(c.items?.department_id));
    const overdue = co.filter(c => c.due_back && c.due_back < t);
    const ce = certs.filter(c => inL(c.items?.department_id));
    const ki = kits.filter(k => inL(k.department_id));
    const dmg = active.filter(i => +i.qty_damaged > 0);
    const unplaced = active.filter(i => unplacedQty(i) > 0);
    const mv = moves.filter(m => inL(m.items?.department_id)).slice(0, 8);
    const first = (S.profile.full_name || '').split(' ')[0];
    const k = (href, n, l, cls = '') => `<a href="${href}" class="${n ? cls : ''}"><div class="n">${n}</div><div class="l">${l}</div></a>`;
    const li = (href, main, sub, end = '') => `<li><a class="main" href="${href}"><div class="name">${main}</div><div class="sub">${sub}</div></a><div class="end">${end}</div></li>`;
    const day = new Date().getDate(), open = +setting('count_open_day', 23), close = +setting('count_close_day', 26);
    const cStatus = d => {
      const c = counts.find(x => x.department_id === d.id);
      if (c?.state === 'verified') return chip('ok', 'Verified');
      if (c?.state === 'submitted') return chip('pending', 'Awaiting approval');
      if (day > close) return chip('overdue', c ? 'Late · in progress' : 'Late · not started');
      if (c) return chip('out', 'In progress');
      return day >= open ? chip('muted', 'Not started') : chip('muted', `Opens ${ord(open)}`);
    };
    return `<section class="hero"><img class="bgmark" src="brand/mark.png" alt="">
      <div><div class="motto">${esc(L ? lineName(L) : CFG.TAGLINE || '')}</div><h1>${first ? `Good to see you, ${esc(first)}` : 'Overview'}</h1>
      <div class="sub">${plural(active.length, 'item')} · ${co.length} out on jobs right now</div></div>
      <div class="actions"><a class="btn" href="#/scan">${ico('scan')}Scan an item</a><a class="btn tagbtn" href="#/jobs">${ico('truck')}Materials requests</a></div></section>
      ${lineChips()}
      <div class="board b8">
        ${k('#/inventory', active.length, 'Items tracked')}
        ${k('#/checkouts', co.length, 'Out on jobs')}
        ${k('#/checkouts?v=overdue', overdue.length, 'Overdue returns', 'alert')}
        ${k('#/inventory?v=reorder', low.length, 'Need restocking', 'warn')}
        ${k('#/inventory?v=damaged', dmg.length, 'Faulty / damaged', 'alert')}
        ${k('#/certs', ce.length, `Certificates due (${setting('cert_warn_days', 30)} days)`, ce.some(c => c.due_on < t) ? 'alert' : 'warn')}
        ${k('#/certs?tab=kits', ki.length, `Redress kits expiring (${setting('kit_warn_days', 60)} days)`, ki.some(x => x.expiry_on < t) ? 'alert' : 'warn')}
        ${k('#/inventory?v=noloc', unplaced.length, 'Location not set', 'warn')}
      </div>
      <section class="panel"><header><h2>Monthly count · ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
        <span class="meta">count window ${ord(open)}–${ord(close)}</span><div class="right"><a class="btn small" href="#/count">Open counts</a></div></header>
        <div class="countgrid">${S.depts.map(d => `<a href="#/count" class="cg ${inL(d.id) ? '' : 'dim'}"><span class="name">${esc(d.short_name || d.name)}</span>${cStatus(d)}</a>`).join('')}</div></section>
      <div class="cols">
        <section class="panel"><header><h2>Out on jobs</h2><span class="meta">soonest due first</span><div class="right"><a class="btn small" href="#/checkouts">See all</a></div></header>
          ${co.length ? `<ul class="list">${co.slice(0, 7).map(c => li(`#/item/${c.item_id}`, `${tag(c.items?.code)} ${esc(c.items?.name)}`,
            `${esc(c.job_ref)}${c.issued_to ? ' / ' + esc(c.issued_to) : ''} · ${fq(c.open_qty)} out`,
            c.due_back ? (c.due_back < t ? chip('overdue', 'Due ' + fd(c.due_back)) : `<span class="sub">Due ${fd(c.due_back)}</span>`) : '<span class="sub">No due date</span>')).join('')}</ul>`
            : '<div class="empty">Nothing is checked out right now.</div>'}</section>
        <section class="panel"><header><h2>Need restocking</h2><span class="meta">at or below reorder level</span><div class="right"><a class="btn small" href="#/inventory?v=reorder">See all</a></div></header>
          ${low.length ? `<ul class="list">${low.slice(0, 7).map(i => li(`#/item/${i.id}`, `${tag(i.code)} ${esc(i.name)}`, `${esc(i.sub_line || i.line)} · ${esc(kindLabel(i.kind))}`,
            `${S.orders[i.id] ? (S.orders[i.id].expected_on && S.orders[i.id].expected_on < t ? chip('overdue', 'On order · late') : chip('onorder', 'On order' + (S.orders[i.id].expected_on ? ' · ' + fdm(S.orders[i.id].expected_on) : ''))) + ' ' : ''}<b>${fq(i.qty_available)}</b> <span class="sub">left${i.min_qty != null ? ` / min ${fq(i.min_qty)}` : ''}</span>`)).join('')}</ul>`
            : '<div class="empty">Nothing is below its reorder level. Set a minimum on an item to get alerts.</div>'}</section>
        <section class="panel"><header><h2>Expiring soon</h2><span class="meta">certificates and redress kits</span><div class="right"><a class="btn small" href="#/certs">See all</a></div></header>
          ${ce.length + ki.length ? `<ul class="list">${[
            ...ce.map(c => ({ d: c.due_on, h: li(`#/item/${c.item_id}`, `${tag(c.items?.code)} ${esc(c.items?.name)}`, `${CERT_KINDS[c.kind]}${c.cert_no ? ' ' + esc(c.cert_no) : ''}`, `${dueChip(c.due_on)} <span class="sub">${fd(c.due_on)}</span>`) })),
            ...ki.map(x => ({ d: x.expiry_on, h: li(`#/item/${x.item_id}`, `${tag(x.code)} Kit ${esc(x.kit_no)}`, `${esc(x.name)} · ${esc(x.expiring_component || '')}`, `${dueChip(x.expiry_on, +setting('kit_warn_days', 60))} <span class="sub">${fd(x.expiry_on)}</span>`) }))
          ].sort((a, b) => a.d < b.d ? -1 : 1).slice(0, 7).map(x => x.h).join('')}</ul>`
            : '<div class="empty">Nothing expiring soon.</div>'}</section>
        <section class="panel"><header><h2>Latest activity</h2><div class="right"><a class="btn small" href="#/activity">See all</a></div></header>
          ${mv.length ? `<ul class="list">${mv.map(m => li(`#/item/${m.item_id}`, `${tag(m.items?.code)} ${esc(m.items?.name)}`,
            `${esc(describeMove(m))}`, `<span class="sub">${esc(m.user_name || '')}<br>${fdt(m.created_at)}</span>`)).join('')}</ul>`
            : '<div class="empty">No activity yet.</div>'}</section>
      </div>`;
  },
  bind(main) { bindLineChips(main); }
};

// ================================================================ INVENTORY
ROUTES.inventory = {
  async load(parts, params) {
    const f = S.inv;
    if (params.get('v')) f.view = params.get('v');
    if (params.get('q') !== null) f.q = params.get('q');
    if ([...params.keys()].length) history.replaceState(null, '', '#/inventory');
    const [its] = await Promise.all([items(), stockRows()]);
    this.rows = its;
    const locCols = [...realLocs(), ...(placeholderLoc() ? [placeholderLoc()] : [])];
    this.locCols = locCols;
    const canEditAny = S.depts.some(d => canAct(d.id));
    return topbar('Inventory', `${its.filter(i => i.active).length} active items`,
      `<button class="btn" id="tpl">${ico('up')}Excel templates</button>
       <button class="btn" id="xls">${ico('down')}Excel</button><button class="btn" id="pdf">${ico('pdf')}PDF</button>
       ${canEditAny ? `<button class="btn ${f.edit ? 'tagbtn' : ''}" id="editmode">${ico('edit')}${f.edit ? 'Editing quantities' : 'Edit quantities'}</button>` : ''}
       ${isAdmin() ? `<button class="btn primary" id="add">${ico('plus')}Add item</button>` : ''}`) +
      `<div class="filters invfilters">
        <input type="search" id="q" placeholder="Search code, description, serial or kit no., or scan a label" value="${esc(f.q)}" autocomplete="off">
        <select id="f-svc" aria-label="Service line"><option value="">All service lines</option>${svcMajors().map(l => opt(l.id, `${l.code} · ${l.name}`, f.svc)).join('')}</select>
        <select id="f-sub" aria-label="Sub service line" ${f.svc ? '' : 'disabled'}><option value="">All sub service lines</option>${f.svc ? svcSubs(f.svc).map(l => opt(l.id, l.name, f.sub)).join('') : ''}</select>
        <select id="f-kind" aria-label="Type"><option value="">All types</option>${Object.entries(KINDS).map(([k, v]) => opt(k, v, f.kind)).join('')}</select>
        <select id="f-st" aria-label="Sub-type">${invSubtypeOptions(f.kind, f.st)}</select>
      </div>
      <div class="filters">
        <select id="loc" aria-label="Location"><option value="">All locations</option>${S.locs.map(l => opt(l.id, l.name, f.loc)).join('')}</select>
        <select id="moved" aria-label="Last moved"><option value="">Any date</option>${[['7', 'Moved in last 7 days'], ['30', 'Moved in last 30 days'], ['90', 'Moved in last 90 days'], ['never', 'Not moved since import']].map(([k, v]) => opt(k, v, f.moved)).join('')}</select>
        <label class="check inline"><input type="checkbox" id="f-kit" ${f.kit ? 'checked' : ''}> Redress kits only</label>
        <button type="button" class="linkbtn" id="f-clear" hidden>Clear filters</button>
      </div>
      <div class="filters"><div class="seg" id="seg">${[['all', 'All'], ['available', 'In store'], ['out', 'Out on jobs'], ['reorder', 'Need restocking'], ['damaged', 'Damaged'], ['noloc', 'Location not set'], ['zero', 'Zero balance'], ['archived', 'Archived']]
        .map(([k, l]) => `<button type="button" data-v="${k}" class="${f.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="muted" id="shown"></span></div>
      ${f.edit ? `<div class="notice ok editnote">${ico('edit')} <span><b>Edit mode:</b> type the correct in-store numbers in the location columns. ${isAdmin() ? 'Your changes apply when you press Apply.' : 'When you’re done, press Review &amp; submit: your admin gets them all as one request.'} Only items your team looks after can be edited.</span></div>` : ''}
      <div id="bulk"></div>
      <section class="panel"><div class="tablewrap"><table class="t stack inv ${f.edit ? 'editing' : ''}" id="tbl"><thead><tr>
        <th class="cb"><input type="checkbox" id="all" aria-label="Select all shown"></th><th>Code</th><th>Description</th>
        ${locCols.map(l => `<th class="num loccol">${esc(l.is_placeholder ? 'Not set' : l.name)}</th>`).join('')}
        <th class="num">Out</th><th>Status</th><th class="num">Total</th></tr></thead><tbody></tbody></table></div></section>
      <div id="editbar"></div>`;
  },
  filtered() {
    const f = S.inv; const qq = f.q.trim().toLowerCase().replace(/\s+/g, ' ');
    // items with stock at the chosen location (by the location itself, so any name works)
    const atLoc = f.loc ? new Set((S.stock || []).filter(x => x.location_id === +f.loc && +x.qty > 0).map(x => x.item_id)) : null;
    const since = f.moved && f.moved !== 'never' ? localISO(-+f.moved) : null;
    return this.rows.filter(i => {
      if (f.view === 'archived' ? i.active : !i.active) return false;
      if (f.svc && i.svc_line_id !== +f.svc) return false;
      if (f.sub && i.sub_line_id !== +f.sub) return false;
      if (f.kind && i.kind !== f.kind) return false;
      if (f.st && i.subtype_id !== +f.st) return false;
      if (f.kit && !i.is_kit) return false;
      if (atLoc && !atLoc.has(i.id)) return false;
      if (f.moved === 'never' && i.last_moved_at) return false;
      if (since && !(i.last_moved_at && i.last_moved_at.slice(0, 10) >= since)) return false;
      if (f.view === 'available' && !(+i.qty_available > 0)) return false;
      if (f.view === 'out' && !(+i.qty_out > 0)) return false;
      if (f.view === 'reorder' && !needsReorder(i)) return false;
      if (f.view === 'damaged' && !(+i.qty_damaged > 0)) return false;
      if (f.view === 'noloc' && !(unplacedQty(i) > 0)) return false;
      if (f.view === 'zero' && +i.qty_total !== 0) return false;
      if (qq && !(`${i.code || ''} ${i.name} ${i.category || ''} ${i.sub_line || ''} ${i.supplier || ''} ${i.serials || ''}`.toLowerCase().includes(qq))) return false;
      return true;
    });
  },
  draw(main) {
    const rows = this.filtered(); const sel = S.inv.sel; const f = S.inv;
    $('#shown', main).textContent = `${rows.length} shown`;
    const fc = $('#f-clear', main); if (fc) fc.hidden = !(f.svc || f.sub || f.kind || f.st || f.kit || f.loc || f.moved);
    const shownRows = rows.slice(0, 800);
    $('#tbl tbody', main).innerHTML = shownRows.length ? shownRows.map(i => {
      const editable = f.edit && canAct(i.department_id);
      const cells = this.locCols.map(l => {
        const v = stockOf(i.id, l.id); const key = `${i.id}:${l.id}`;
        const changed = f.changes.has(key);
        if (editable) return `<td class="num loccell"><input type="number" min="0" step="any" class="qin ${changed ? 'changed' : ''}" data-k="${key}" value="${changed ? f.changes.get(key) : v}" aria-label="${esc(l.name)} quantity for ${esc(i.name)}"><span class="qlbl">${esc(l.is_placeholder ? 'Not set' : l.name)}</span></td>`;
        return `<td class="num loccell ${v ? '' : 'zero'}">${v ? `<b>${fq(v)}</b>` : '·'}<span class="qlbl">${esc(l.is_placeholder ? 'Not set' : l.name)}</span></td>`;
      }).join('');
      return `<tr class="${f.edit ? '' : 'click'} ${f.edit && !editable ? 'locked' : ''}" data-id="${i.id}">
      <td class="cb"><input type="checkbox" data-sel="${i.id}" ${sel.has(i.id) ? 'checked' : ''} aria-label="Select ${esc(i.name)}"></td>
      <td class="codecell">${tag(i.code)}</td>
      <td class="full desc"><div class="name">${f.edit ? `<a href="#/item/${i.id}">${esc(i.name)}</a>` : esc(i.name)}</div><div class="sub">${esc(invPlace(i))}${i.is_kit ? ' · Kit' : ''}</div></td>
      ${cells}
      <td class="num outcell ${+i.qty_out ? '' : 'zero'}">${+i.qty_out ? `<b>${fq(i.qty_out)}</b>` : '·'}<span class="qlbl">Out</span></td>
      <td class="full chips">${statusChips(i)}</td>
      <td class="num hide-m">${fq(i.qty_total)}</td></tr>`;
    }).join('') + (rows.length > 800 ? `<tr><td colspan="${6 + this.locCols.length}" class="empty">Showing the first 800. Narrow the search to see the rest.</td></tr>` : '')
      : `<tr><td colspan="${6 + this.locCols.length}" class="empty">No items match these filters.${S.inv.q ? ' Check the spelling or clear the search.' : ''}</td></tr>`;
    $('#all', main).checked = rows.length > 0 && rows.every(r => sel.has(r.id));
    this.drawBulk(main); this.drawEditBar(main);
  },
  drawBulk(main) {
    const n = S.inv.sel.size; const b = $('#bulk', main);
    const selItems = this.rows.filter(i => S.inv.sel.has(i.id));
    const canMove = selItems.length && selItems.every(i => canAct(i.department_id));
    const canEdit = selItems.length && selItems.every(i => canAdmin(i.department_id));
    b.innerHTML = n ? `<div class="bulkbar"><b>${n} selected</b>
      <button class="btn small tagbtn" id="b-mr">${ico('truck')}Add to materials request</button>
      ${canMove ? `<button class="btn small" id="b-move">${ico('pin')}Move location</button>` : ''}
      ${isAdmin() ? `<button class="btn small" id="b-labels">${ico('print')}Print labels</button>` : ''}
      ${canEdit ? `<button class="btn small" id="b-place">${ico('move')}Move to…</button>` : ''}
      ${canEdit ? '<button class="btn small" id="b-edit">Edit details</button>' : ''}
      ${canEdit ? (S.inv.view === 'archived' ? '<button class="btn small" id="b-restore">Restore</button>' : '<button class="btn small" id="b-archive">Archive</button>') : ''}
      ${canEdit ? `<button class="btn small link danger" id="b-del">${ico('trash')}Delete</button>` : ''}
      <button class="btn small" id="b-clear">Clear</button></div>` : '';
    if (!n) return;
    $('#b-clear', b).onclick = () => { S.inv.sel.clear(); this.draw(main); };
    const l = $('#b-labels', b); if (l) l.onclick = () => { sessionStorage.setItem('labels', JSON.stringify([...S.inv.sel])); go('#/labels'); };
    const e = $('#b-edit', b); if (e) e.onclick = () => bulkEdit([...S.inv.sel]);
    const pl = $('#b-place', b); if (pl) pl.onclick = () => moveItemsTo(selItems);
    const m = $('#b-move', b); if (m) m.onclick = () => bulkMove(selItems);
    $('#b-mr', b).onclick = () => addSelectedToRequest(selItems);
    const ar = $('#b-archive', b); if (ar) ar.onclick = () => bulkArchive(selItems, false);
    const rs = $('#b-restore', b); if (rs) rs.onclick = () => bulkArchive(selItems, true);
    const dl = $('#b-del', b); if (dl) dl.onclick = () => bulkDelete(selItems);
  },
  drawEditBar(main) {
    const f = S.inv; const bar = $('#editbar', main); if (!bar) return;
    if (!f.edit) { bar.innerHTML = ''; return; }
    const n = f.changes.size;
    bar.innerHTML = `<div class="editbar"><span><b>${plural(n, 'change')}</b>${n ? '' : ' · type new numbers in the table'}</span>
      <button class="btn small" id="e-cancel">${n ? 'Discard' : 'Exit edit mode'}</button>
      <button class="btn small tagbtn" id="e-submit" ${n ? '' : 'disabled'}>${isAdmin() ? 'Review & apply' : 'Review & submit'}</button></div>`;
    $('#e-cancel', bar).onclick = () => { if (n && !confirm('Discard your unsaved changes?')) return; f.changes.clear(); f.edit = false; render({ quiet: true }); };
    $('#e-submit', bar).onclick = () => reviewChanges();
  },
  bind(main) {
    const f = S.inv; const redraw = () => this.draw(main);
    const qi = $('#q', main);
    qi.oninput = debounce(() => { f.q = qi.value; redraw(); }, 140);
    qi.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const m = matchCode(qi.value); if (m.length === 1 && !f.edit) go('#/item/' + m[0].id); } };
    $('#f-svc', main).onchange = e => { f.svc = e.target.value; f.sub = ''; render({ quiet: true }); };
    $('#f-sub', main).onchange = e => { f.sub = e.target.value; redraw(); };
    $('#f-kind', main).onchange = e => { f.kind = e.target.value; if (f.st && !subtypesOf(f.kind, true).some(t => t.id === +f.st)) f.st = ''; $('#f-st', main).innerHTML = invSubtypeOptions(f.kind, f.st); redraw(); };
    $('#f-st', main).onchange = e => { f.st = e.target.value; const t = (S.subtypes || []).find(x => x.id === +f.st); if (t && !f.kind) { f.kind = t.kind; $('#f-kind', main).value = t.kind; $('#f-st', main).innerHTML = invSubtypeOptions(f.kind, f.st); } redraw(); };
    $('#f-kit', main).onchange = e => { f.kit = e.target.checked; redraw(); };
    const fc = $('#f-clear', main); if (fc) fc.onclick = () => { Object.assign(f, { svc: '', sub: '', kind: '', st: '', kit: false, loc: '', moved: '' }); render({ quiet: true }); };
    $('#loc', main).onchange = e => { f.loc = e.target.value; redraw(); };
    $('#moved', main).onchange = e => { f.moved = e.target.value; redraw(); };
    $$('#seg button', main).forEach(b => b.onclick = () => { f.view = b.dataset.v; $$('#seg button', main).forEach(x => x.classList.toggle('on', x === b)); redraw(); });
    const tb = $('#tbl tbody', main);
    tb.onclick = e => {
      const cb = e.target.closest('[data-sel]');
      if (cb) { const id = +cb.dataset.sel; cb.checked ? f.sel.add(id) : f.sel.delete(id); this.drawBulk(main); e.stopPropagation(); return; }
      if (f.edit || e.target.closest('td.cb') || e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-id]'); if (tr) go('#/item/' + tr.dataset.id);
    };
    tb.oninput = e => {
      const inp = e.target.closest('.qin'); if (!inp) return;
      const [iid, lid] = inp.dataset.k.split(':').map(Number);
      const orig = stockOf(iid, lid); const v = inp.value;
      if (v === '' || +v === orig) { f.changes.delete(inp.dataset.k); inp.classList.remove('changed'); }
      else { f.changes.set(inp.dataset.k, v); inp.classList.add('changed'); }
      this.drawEditBar(main);
    };
    $('#all', main).onchange = e => { this.filtered().forEach(r => e.target.checked ? f.sel.add(r.id) : f.sel.delete(r.id)); redraw(); };
    $('#xls', main).onclick = () => exportInventory('xlsx', this.filtered());
    $('#pdf', main).onclick = () => exportInventory('pdf', this.filtered());
    $('#tpl', main).onclick = templatesMenu;
    const em = $('#editmode', main); if (em) em.onclick = () => { if (f.edit && f.changes.size && !confirm('Discard your unsaved changes?')) return; f.edit = !f.edit; f.changes.clear(); render({ quiet: true }); };
    const add = $('#add', main); if (add) add.onclick = () => editItem(null);
    redraw();
  }
};

function templatesMenu() {
  return modal({
    title: 'Excel templates', sub: 'Download a template for your service line, fill it in, then upload it. You’ll see a preview before anything changes.', submit: null, cancel: 'Close',
    body: `<div class="tplgrid">
      ${Object.entries(TEMPLATE_INFO).map(([k, v]) => `<div class="tplcard"><b>${esc(v.title)}</b><span class="sub">${{
        items: 'Change item details (service line, type, sub-type, codes, reorder levels) and add new items. Uses the Inventory filters you have set.',
        locations: 'Set how many of each item are in each store location. Applies as moves.',
        quantities: 'Correct in-store numbers. Staff corrections go to the admin as one request.',
        kits: 'Kit numbers, components and expiry dates for redress kits.' }[k]}</span>
        <button type="button" class="btn small" data-dl="${k}">${ico('down')}Download</button></div>`).join('')}</div>
      <button type="button" class="btn tagbtn mt" id="ul">${ico('up')}Upload a filled template</button>
      <p class="muted mt">Templates cover ${isAdmin() ? 'every team' : 'your team'}. The items template only has the items shown on the Inventory page, so set the filters first to narrow it.</p>`,
    onOpen: (d, close) => {
      $$('[data-dl]', d).forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = 'Preparing…'; try { await downloadTemplate(b.dataset.dl); } catch (e) { toast(niceError(e), true); } b.disabled = false; b.innerHTML = `${ico('down')}Download`; });
      $('#ul', d).onclick = () => { close(null); uploadTemplate(); };
    }
  });
}

async function reviewChanges() {
  const f = S.inv; const its = await items();
  const rows = [...f.changes.entries()].map(([k, v]) => { const [iid, lid] = k.split(':').map(Number); const it = its.find(i => i.id === iid); return { it, lid, was: stockOf(iid, lid), now: +v }; });
  const byLine = {}; rows.forEach(r => { (byLine[r.it.department_id] ||= []).push(r); });
  return modal({
    title: isAdmin() ? 'Review & apply changes' : 'Review & submit for approval', wide: true, submit: isAdmin() ? 'Apply changes' : 'Send for approval',
    sub: isAdmin() ? 'Changes in the lines you approve for apply straight away; others go to that line’s main or backup admin.' : `Your admin gets ${Object.keys(byLine).length > 1 ? 'one request per service line' : 'these as one request'}.`,
    body: Object.entries(byLine).map(([d, rs]) => `<h3 class="grp">${esc(lineName(d))}${canApprove(+d) ? chip('ok', 'applies now') : chip('pending', 'needs approval')}</h3>
      <table class="t"><thead><tr><th>Item</th><th>Location</th><th class="num">Was</th><th class="num">Now</th><th>Reason (optional)</th></tr></thead><tbody>
      ${rs.map(r => `<tr><td>${tag(r.it.code)} ${esc(r.it.name)}</td><td>${esc(locName(r.lid))}</td><td class="num">${fq(r.was)}</td><td class="num"><b>${fq(r.now)}</b></td>
        <td><input type="text" name="r_${r.it.id}_${r.lid}" placeholder="e.g. found in Warri yard"></td></tr>`).join('')}</tbody></table>`).join('') +
      `<label class="f mt">Reason for these changes<span class="hint">Applies to every line without its own reason.</span><input type="text" name="reason" required placeholder="e.g. Store walk-through 3 Nov"></label>`,
    onSubmit: async d => {
      if (!String(d.reason || '').trim()) throw new Error('Give a reason for these changes.');
      const changes = rows.map(r => ({ item_id: r.it.id, location_id: r.lid, status: 'available', qty_after: r.now, reason: d[`r_${r.it.id}_${r.lid}`] || '' }));
      const res = await q(sb.rpc('submit_changes', { p_changes: changes, p_reason: d.reason }));
      f.changes.clear(); f.edit = false; toast(describeSubmit(res)); refresh();
    }
  });
}

function bulkMove(sel) {
  const from0 = placeholderLoc()?.id || S.locs[0]?.id;
  return modal({
    title: `Move ${plural(sel.length, 'item')}`, sub: 'Moves everything that’s in store at the “From” location. Moves apply straight away and are recorded with your name.', submit: 'Move',
    body: `<div class="row2"><label class="f">From<select name="from" id="m-from">${locOptions(from0)}</select></label>
      <label class="f">To<select name="to">${realLocOptions(realLocs()[0]?.id)}</select></label></div>
      <div id="m-sum" class="muted"></div><label class="f mt">Notes<input type="text" name="notes" placeholder="e.g. Initial location setup"></label>`,
    onOpen: d => { const upd = () => { const fr = +$('#m-from', d).value; const n = sel.filter(i => stockOf(i.id, fr) > 0); $('#m-sum', d).textContent = `${plural(n.length, 'item')} of ${sel.length} have stock at ${locName(fr)}.`; }; $('#m-from', d).onchange = upd; upd(); },
    onSubmit: async x => {
      if (x.from === x.to) throw new Error('Pick a different destination.');
      const moves = sel.map(i => ({ item_id: i.id, from: +x.from, to: +x.to, qty: stockOf(i.id, +x.from) })).filter(m => m.qty > 0);
      if (!moves.length) throw new Error(`None of the selected items have stock at ${locName(+x.from)}.`);
      const n = await q(sb.rpc('bulk_move', { p_moves: moves, p_notes: x.notes || null }));
      S.inv.sel.clear(); toast(`Moved ${plural(n, 'item')} to ${locName(+x.to)}`); refresh();
    }
  });
}

function matchCode(text) {
  const norm = s => String(s || '').toLowerCase().replace(/[\s’'’]/g, '');
  const t = norm(text); if (!t || !S.items) return [];
  return S.items.filter(i => norm(i.code) === t);
}

async function exportInventory(kind, rows) {
  rows = rows || [];
  if (!rows.length) return toast('Nothing to export: no items match the current filters. Clear the search or filters and try again.', true);
  try {
    toast('Preparing your file…');
    await stockRows();
    const real = realLocs(); const ph = placeholderLoc();
    // 2.9: grouped by sub service line, then type and sub-type
    const kOrd = Object.keys(KINDS); const stOrd = id => { const t = (S.subtypes || []).find(x => x.id === id); return t ? t.sort : 999; };
    const groups = []; svcMajors(true).forEach(m => svcSubs(m.id, true).forEach(sl => { if (rows.some(r => r.sub_line_id === sl.id)) groups.push({ id: sl.id, name: `${m.code} · ${sl.name}`, short: `${m.code} ${sl.name}` }); }));
    if (rows.some(r => !r.sub_line_id)) groups.push({ id: null, name: 'No service line', short: 'No service line' });
    const inG = (r, g) => (r.sub_line_id || null) === g.id;
    rows = rows.slice().sort((a, b) => kOrd.indexOf(a.kind) - kOrd.indexOf(b.kind) || stOrd(a.subtype_id) - stOrd(b.subtype_id) || String(a.subtype || '').localeCompare(String(b.subtype || '')));
    const title = 'Equipment Inventory';
    const f = S.inv; const scope = [f.svc && svcById(f.svc) ? `${svcById(f.svc).code} · ${svcById(f.svc).name}` : '', f.sub ? svcById(f.sub)?.name : '', f.kind ? kindLabel(f.kind) : '', f.st ? subtypeName(f.st) : ''].filter(Boolean).join(' · ');
    const subtitle = `${scope || 'All service lines'} · as at ${fd(localISO(0))}`;
    const tone = (r, k) => (k === 'status' && r._low) ? 'low' : (k === 'damaged' && +r.damaged) ? 'damaged' : (k === 'out' && +r.out) ? 'out' : null;
    const mk = i => ({ code: i.code || '', name: i.name, category: i.subtype || '', type: kindLabel(i.kind), team: i.line || '', ...Object.fromEntries(real.map(l => ['L' + l.id, stockOf(i.id, l.id) || ''])),
      unset: ph ? (stockOf(i.id, ph.id) || '') : '', out: +i.qty_out || '', damaged: +i.qty_damaged || '', total: +i.qty_total, min: i.min_qty ?? '',
      next: i.next_due || i.kit_expiry || '', status: needsReorder(i) ? 'Restock' : '', _low: needsReorder(i), line: i.department });
    const kpis = [{ label: 'Items', value: fq(rows.length) }, { label: 'Out on jobs', value: fq(rows.filter(r => +r.qty_out).length) },
      { label: 'Need restocking', value: fq(rows.filter(needsReorder).length), tone: 'warn' }, { label: 'Damaged', value: fq(rows.filter(r => +r.qty_damaged).length), tone: 'bad' }];
    if (kind === 'xlsx') {
      const columns = [{ header: 'Item Code', key: 'code', width: 26, bold: true }, { header: 'Description', key: 'name', width: 54, wrap: true }, { header: 'Type', key: 'type', width: 20 },
        { header: 'Sub-type', key: 'category', width: 26 }, { header: 'Team', key: 'team', width: 14 }, ...real.map(l => ({ header: l.name, key: 'L' + l.id, width: 12, type: 'num' })), { header: 'Location not set', key: 'unset', width: 11, type: 'num' },
        { header: 'Out on jobs', key: 'out', width: 10, type: 'num' }, { header: 'Damaged', key: 'damaged', width: 10, type: 'num' }, { header: 'Total', key: 'total', width: 9, type: 'num', bold: true },
        { header: 'Reorder at', key: 'min', width: 10, type: 'num' }, { header: 'Next cert / kit expiry', key: 'next', width: 14, type: 'date' }, { header: 'Status', key: 'status', width: 11 }];
      const used = new Set(); const sheetName = g => { let n = g.short.replace(/[\\/?*\[\]:]/g, '').slice(0, 31); let k = 2; while (used.has(n)) n = n.slice(0, 28) + ' ' + k++; used.add(n); return n; };
      const sheets = groups.map(g => ({ name: sheetName(g), title: `${title}: ${g.name}`, subtitle: `As at ${fd(localISO(0))}`, columns, group: null,
        rows: rows.filter(r => inG(r, g)).map(mk), cellStyle: tone, totals: ['total', 'out', 'damaged', ...real.map(l => 'L' + l.id), 'unset'],
        kpis: [{ label: 'Items', value: rows.filter(r => inG(r, g)).length }, { label: 'Need restocking', value: rows.filter(r => inG(r, g) && needsReorder(r)).length, tone: 'warn' }] }));
      const reorder = rows.filter(needsReorder).map(i => ({ code: i.code, name: i.name, line: i.sub_line || i.line, avail: +i.qty_available, min: i.min_qty ?? '', order: i.max_qty != null ? Math.max(0, i.max_qty - i.qty_available) : '', supplier: i.supplier || '' }));
      sheets.push({ name: 'Restock list', title: 'Restock list', subtitle, rows: reorder, columns: [{ header: 'Item Code', key: 'code', width: 26 }, { header: 'Description', key: 'name', width: 54, wrap: true },
        { header: 'Sub service line', key: 'line', width: 26 }, { header: 'In store', key: 'avail', width: 10, type: 'num' }, { header: 'Reorder at', key: 'min', width: 10, type: 'num' },
        { header: 'Suggested order', key: 'order', width: 12, type: 'num' }, { header: 'OEM / supplier', key: 'supplier', width: 22 }] });
      await brandXlsx({ file: `GANKCO_Inventory_${localISO(0)}.xlsx`, sheets });
    } else {
      const columns = [{ header: 'Item Code', dataKey: 'code', width: 40, bold: true }, { header: 'Description', dataKey: 'name' }, ...real.map(l => ({ header: l.name, dataKey: 'L' + l.id, width: 17, align: 'right' })),
        { header: 'Not set', dataKey: 'unset', width: 14, align: 'right' }, { header: 'Out', dataKey: 'out', width: 11, align: 'right' }, { header: 'Damaged', dataKey: 'damaged', width: 15, align: 'right' },
        { header: 'Total', dataKey: 'total', width: 12, align: 'right' }, { header: 'Status', dataKey: 'status', width: 16 }];
      const sections = groups.map(g => {
        const rs = []; let last = null;
        rows.filter(r => inG(r, g)).forEach(i => { const h = `${kindLabel(i.kind)}${i.subtype ? ' · ' + i.subtype : ''}`; if (h !== last) { last = h; rs.push({ code: h, _group: true }); } rs.push(mk(i)); });
        return { heading: g.name, headingNote: `${plural(rows.filter(r => inG(r, g)).length, 'item')}`, columns, rows: rs, cellStyle: tone };
      });
      await brandPdf({ file: `GANKCO_Inventory_${localISO(0)}.pdf`, title, subtitle, kpis, sections, meta: [['Prepared by', S.profile.full_name || S.profile.email]], signatures: [mySignature('Prepared by', `${title} · ${subtitle}`)] });
    }
  } catch (e) { console.error(e); toast(niceError(e), true); }
}

// ---------------------------------------------------------------- item editor (admin)
const SVC_OPTS = (cur, bulk) => [[bulk ? 'none' : '', 'No idle-service rule'], ['6', '6 months'], ['12', '12 months (1 year)'], ['18', '18 months'], ['24', '24 months (2 years)']]
  .map(([v, l]) => opt(v, l, cur == null ? (bulk ? undefined : '') : String(cur))).join('');
function editItem(it) {
  const isNew = !it;
  const myTeam = it?.department_id || S.depts.find(d => canAdmin(d.id))?.id;
  return modal({
    title: isNew ? 'Add item' : 'Edit item', submit: isNew ? 'Add item' : 'Save changes',
    body: `<div class="row2"><label class="f">Item code<input type="text" name="code" value="${esc(it?.code)}" placeholder="e.g. GES-SLT-STB-005"></label>
      <label class="f">Unit<input type="text" name="unit" value="${esc(it?.unit || 'pcs')}"></label></div>
      <label class="f">Description<input type="text" name="name" value="${esc(it?.name)}" required></label>
      ${placeFields(it)}
      ${isNew ? `<label class="f" id="pf-teamwrap" hidden>Team that looks after it<span class="hint">The sub service line has no team yet. Set one in Nest settings → Service lines.</span><select name="department_id">${lineOptions(myTeam, d => canAdmin(d.id))}</select></label>` : ''}
      <div class="row2"><label class="f">Reorder at (min)<span class="hint">Alert when the in-store quantity falls to this.</span><input type="number" step="any" min="0" name="min_qty" value="${esc(it?.min_qty)}"></label>
      <label class="f">Restock up to (max)<span class="hint">Used to suggest how many to order.</span><input type="number" step="any" min="0" name="max_qty" value="${esc(it?.max_qty)}"></label></div>
      <label class="f">OEM / supplier<input type="text" name="supplier" value="${esc(it?.supplier)}"></label>
      <label class="f">Service if idle on the shelf<span class="hint">Nest reminds the line admin when the tool hasn’t been used or serviced for this long.</span><select name="svc">${SVC_OPTS(it?.service_idle_months)}</select></label>
      ${isNew ? `<div class="row2"><label class="f">Opening quantity<input type="number" step="any" min="0" name="qty" value="0"></label>
        <label class="f">At location<select name="location_id">${locOptions(realLocs()[0]?.id)}</select></label></div>` : ''}
      <label class="f">Notes<textarea name="notes">${esc(it?.notes)}</textarea></label>
      <label class="check"><input type="checkbox" name="is_kit" ${it?.is_kit ? 'checked' : ''}> This is a redress kit (track kit numbers, components and expiry dates)</label>
      ${isNew ? '' : `<label class="check"><input type="checkbox" name="active" ${it.active ? 'checked' : ''}> Active (untick to archive: it disappears from lists but keeps its history)</label>`}`,
    onOpen: d => wirePlaceFields(d, it),
    onSubmit: async data => {
      if (!data.name.trim()) throw new Error('Enter a description.');
      if (!data.sub_line_id) throw new Error('Choose the service line and sub service line.');
      if (!data.kind) throw new Error('Choose the type.');
      const p = { code: data.code, name: data.name, sub_line_id: +data.sub_line_id, kind: data.kind, subtype_id: data.subtype_id ? +data.subtype_id : null,
        unit: data.unit, min_qty: data.min_qty, max_qty: data.max_qty, supplier: data.supplier, notes: data.notes, is_kit: !!data.is_kit,
        service_idle_months: data.svc ? +data.svc : null };
      if (isNew) {
        if (data.department_id) p.department_id = +data.department_id;
        if (num(data.qty) > 0) p.stock = [{ location_id: +data.location_id, qty: num(data.qty) }];
        const id = await q(sb.rpc('item_save', { p }));
        toast('Item added'); invalidate(); go('#/item/' + id); return;
      }
      p.id = it.id; p.active = !!data.active;
      if (!('service_idle_months' in it)) delete p.service_idle_months;
      await q(sb.rpc('item_save', { p }));
      const moved = svcById(p.sub_line_id)?.department_id; toast(moved && moved !== it.department_id ? `Saved. ${lineName(moved)} now looks after this item.` : 'Changes saved'); invalidate(); refresh();
    }
  });
}
function bulkEdit(ids) {
  return modal({
    title: `Edit ${plural(ids.length, 'item')}`, sub: 'Only the fields you fill in will change.', submit: 'Apply to all',
    body: `<p class="muted">To change the service line, type or sub-type, use <b>Move to…</b>.</p>
      <div class="row2"><label class="f">Reorder at (min)<input type="number" step="any" min="0" name="min_qty"></label>
      <label class="f">Restock up to (max)<input type="number" step="any" min="0" name="max_qty"></label></div>
      <div class="row2"><label class="f">Unit<input type="text" name="unit"></label><label class="f">OEM / supplier<input type="text" name="supplier"></label></div>
      <div class="row2"><label class="f">Redress kit<select name="is_kit"><option value="">No change</option><option value="yes">Yes, these are redress kits</option><option value="no">No</option></select></label>
      <label class="f">Service if idle on the shelf<select name="svc"><option value="">No change</option>${SVC_OPTS(undefined, true)}</select></label></div>
      <label class="check"><input type="checkbox" name="clear_min"> Remove reorder levels from these items</label>`,
    onSubmit: async d => {
      const u = {};
      if (d.min_qty !== '') u.min_qty = num(d.min_qty);
      if (d.max_qty !== '') u.max_qty = num(d.max_qty);
      if (d.clear_min) { u.min_qty = null; u.max_qty = null; }
      if (d.unit) u.unit = d.unit; if (d.supplier) u.supplier = d.supplier;
      if (d.is_kit) u.is_kit = d.is_kit === 'yes';
      if (d.svc) u.service_idle_months = d.svc === 'none' ? null : +d.svc;
      if (!Object.keys(u).length) throw new Error('Fill in at least one field.');
      for (let i = 0; i < ids.length; i += 200) await q(sb.from('items').update(u).in('id', ids.slice(i, i + 200)));
      toast(`Updated ${plural(ids.length, 'item')}`); S.inv.sel.clear(); refresh();
    }
  });
}

// ================================================================ ITEM
ROUTES.item = {
  async load(parts) {
    const id = +parts[1];
    const [it, stock, cos, units, certs, moves, comps, price, order, svc, svcLog, lastUse, details] = await Promise.all([
      q(sb.from('item_overview').select('*').eq('id', id).maybeSingle()),
      q(sb.from('stock').select('*').eq('item_id', id).gt('qty', 0)),
      q(sb.from('checkouts').select('*, jobs(id,job_no)').eq('item_id', id).is('closed_at', null).order('out_at')),
      q(sb.from('units').select('*, unit_components(id,expiry_on,batch_no,notes,component_id)').eq('item_id', id).eq('active', true).order('serial_no')),
      q(sb.from('certifications').select('*').eq('item_id', id).order('superseded').order('due_on', { nullsFirst: false })),
      q(sb.from('movements').select('*').eq('item_id', id).order('created_at', { ascending: false }).limit(60)),
      q(sb.from('kit_components').select('*').eq('item_id', id).order('sort')),
      canSeePrices() ? q(sb.from('item_prices').select('*').eq('item_id', id).maybeSingle()).catch(() => null) : null,
      q(sb.from('item_orders').select('*').eq('item_id', id).maybeSingle()).catch(() => null),
      q(sb.from('service_status').select('*').eq('item_id', id).maybeSingle()).catch(() => null),
      q(sb.from('service_log').select('*').eq('item_id', id).order('serviced_at', { ascending: false }).limit(10)).catch(() => []),
      q(sb.from('checkouts').select('out_at').eq('item_id', id).order('out_at', { ascending: false }).limit(1)).catch(() => []),
      isAdmin() ? q(sb.from('audit_log').select('at,user_name,action,old_data,new_data').eq('table_name', 'items').eq('record_id', String(id)).eq('action', 'update').order('at', { ascending: false }).limit(20)).catch(() => []) : Promise.resolve([]),
    ]);
    if (!it) return topbar('Item not found', 'It may have been removed.') + '<a class="btn" href="#/inventory">Back to inventory</a>';
    it.service_idle_months = svc?.service_idle_months ?? null;
    this.ctx = { it, stock, cos, units, certs, comps, price, order, svc };
    const t = localISO(0); const act = canAct(it.department_id); const adm = canAdmin(it.department_id);
    const canIssue = it.item_type !== 'equipment';
    const stockRowsSorted = stock.sort((a, b) => locName(a.location_id).localeCompare(locName(b.location_id)));
    const qr = qrSvg(itemUrl(it.id), 3);
    const current = certs.filter(c => !c.superseded), old = certs.filter(c => c.superseded);
    const unitLabel = u => u ? [u.serial_no && (it.is_kit ? 'Kit ' : 'S/N ') + u.serial_no, u.lot_no && 'Lot ' + u.lot_no].filter(Boolean).join(' · ') : '';
    const kitExp = u => (u.unit_components || []).map(c => c.expiry_on).filter(Boolean).sort()[0];
    const compName = cid => comps.find(c => c.id === cid)?.name || '';
    const ph = placeholderLoc();
    return `<a class="back" href="#/inventory">← Inventory</a>
      <div class="item-head"><div>${tag(it.code, 'big')}
        <h1>${esc(it.name)}</h1>
        <div class="facts"><span class="linebadge">${esc(it.svc_code || it.line || it.department)}</span><span>${esc(it.sub_line || it.department)}</span><span>${esc(kindLabel(it.kind))}</span>${it.subtype ? `<span>${esc(it.subtype)}</span>` : ''}<span class="sub">Team: ${esc(it.line || it.department)}</span>${it.is_kit ? '<span>Redress kit</span>' : ''}
          ${it.supplier ? `<span>OEM: ${esc(it.supplier)}</span>` : ''}${it.active ? '' : chip('muted', 'Archived')}</div></div>
        <div class="qr-mini">${qr}${isAdmin() ? `<button class="btn small" id="lbl">${ico('print')}Label</button>` : ''}</div></div>
      <div class="qtybar">
        <div><div class="n">${fq(it.qty_available)}</div><div class="l">In store</div></div>
        <div><div class="n">${fq(it.qty_out)}</div><div class="l">Out on jobs</div></div>
        <div><div class="n">${fq(it.qty_reserved)}</div><div class="l">Reserved</div></div>
        <div><div class="n">${fq(it.qty_in_transit)}</div><div class="l">In transit</div></div>
        <div><div class="n">${fq(it.qty_damaged)}</div><div class="l">Damaged</div></div>
        <div><div class="n">${fq(it.qty_total)}</div><div class="l">Total ${esc(it.unit)}${it.min_qty != null ? ` · reorder at ${fq(it.min_qty)}` : ''}</div></div>
      </div>
      ${it.notes ? `<div class="notice">${esc(it.notes)}</div>` : ''}
      ${ph && stock.some(s => s.location_id === ph.id) && act ? `<div class="notice">Some of this item has no location yet. Use <b>Move</b> to put it in its store location.</div>` : ''}
      ${act ? `<div class="actionrow">
        <button class="btn tagbtn" data-a="checkout">${ico('out')}Check out</button>
        <button class="btn" data-a="receive">${ico('plus')}Receive stock</button>
        ${canIssue ? `<button class="btn" data-a="issue">${it.item_type === 'sales' ? 'Sell' : 'Issue'}</button>` : ''}
        <button class="btn" data-a="transfer">${ico('move')}Move</button>
        <button class="btn" data-a="status">Change status</button>
        <button class="btn" data-a="count">Correct quantity</button>
        ${adm ? '<button class="btn" data-a="edit">Edit item</button>' : ''}
      </div>` : `<div class="notice">This item belongs to <b>${esc(it.line)}</b>. You can view it, but only ${esc(it.line)} staff and admins can change it.</div>`}
      ${cos.length ? `<section class="panel"><header><h2>Out on jobs</h2><span class="meta">${fq(it.qty_out)} ${esc(it.unit)}</span></header>
        <div class="tablewrap"><table class="t stack"><thead><tr><th>Job / well / site</th><th>With</th><th class="num">Qty</th><th>Out since</th><th>Due back</th><th></th></tr></thead><tbody>
        ${cos.map(c => `<tr><td class="full"><div class="name">${c.jobs ? `<a href="#/job/${c.jobs.id}">${esc(c.job_ref)}</a>` : esc(c.job_ref)}</div>${c.serials ? `<div class="sub">S/N ${esc(c.serials)}</div>` : ''}${+c.missing_qty ? chip('overdue', `${fq(c.missing_qty)} reported missing`) : ''}</td>
          <td>${esc(c.issued_to || '—')}</td><td class="num">${fq(c.open_qty)}${c.open_qty != c.qty ? `<span class="sub"> of ${fq(c.qty)}</span>` : ''}</td>
          <td class="hide-m">${fd(c.out_at)}</td><td>${c.due_back ? (c.due_back < t ? chip('overdue', fd(c.due_back)) : fd(c.due_back)) : '—'}</td>
          <td class="num nowrap">${act ? `<button class="btn small" data-ret="${c.id}">Return</button> <button class="btn small" data-use="${c.id}">Used / sold</button>` : ''}
            ${adm ? ` <button class="btn small link danger" data-lost="${c.id}">Write off lost</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${it.is_kit ? `<section class="panel"><header><h2>Redress kits</h2><span class="meta">${plural(units.length, 'kit')} recorded · ${fq(it.qty_total)} on record</span>
        ${act ? `<div class="right"><button class="btn small" data-a="kit">${ico('plus')}Add / update kit</button></div>` : ''}</header>
        ${units.length !== +it.qty_total && units.length ? `<div class="body"><div class="notice">${plural(units.length, 'kit number')} recorded but ${fq(it.qty_total)} kits on record. Add the missing kit numbers so every kit’s expiry is tracked.</div></div>` : ''}
        ${units.length ? `<div class="tablewrap"><table class="t stack"><thead><tr><th>Kit no.</th><th>Earliest expiry</th><th>Expiring component</th><th class="num">Components</th><th></th></tr></thead><tbody>
          ${units.map(u => { const e = kitExp(u); const ec = (u.unit_components || []).filter(c => c.expiry_on === e).map(c => compName(c.component_id)).join(', ');
            return `<tr><td class="name">${esc(u.serial_no || u.lot_no || '—')}</td><td>${e ? `${dueChip(e, +setting('kit_warn_days', 60))} ${fd(e)}` : chip('muted', 'No expiry dates')}</td>
            <td class="sub">${esc(ec)}</td><td class="num">${(u.unit_components || []).length}</td><td class="num"><button class="btn small" data-kit="${u.id}">View</button></td></tr>`; }).join('')}
          </tbody></table></div>` : `<div class="empty">No kit numbers yet. ${act ? 'Use Add / update kit, or fill in the Redress kits Excel template.' : ''}</div>`}
        ${comps.length ? `<div class="body"><span class="muted">Components in this kit type: ${comps.map(c => esc(c.name) + (c.has_expiry ? '' : ' (no expiry)')).join(', ')}</span></div>` : ''}</section>` : ''}
      <div class="cols">
        <section class="panel"><header><h2>Where it is</h2></header>
          ${stockRowsSorted.length ? `<table class="t"><tbody>${stockRowsSorted.map(s => `<tr><td class="name">${esc(locName(s.location_id))}</td><td>${chip(s.status, STATUS[s.status])}</td><td class="num"><b>${fq(s.qty)}</b></td></tr>`).join('')}</tbody></table>`
            : `<div class="empty">${+it.qty_out ? 'Everything is out on jobs.' : 'None in stock. Use Receive stock when a delivery arrives.'}</div>`}</section>
        <section class="panel"><header><h2>Certificates & maintenance</h2>${act ? `<div class="right"><button class="btn small" data-a="cert">${ico('plus')}Record</button></div>` : ''}</header>
          ${current.length ? `<table class="t"><tbody>${current.map(c => `<tr><td><div class="name">${CERT_KINDS[c.kind]}${c.cert_no ? ' ' + esc(c.cert_no) : ''}</div>
            <div class="sub">${[unitLabel(units.find(u => u.id === c.unit_id)), c.provider, c.issued_on && 'Done ' + fd(c.issued_on)].filter(Boolean).map(esc).join(' · ')}</div></td>
            <td class="num">${dueChip(c.due_on, +setting('cert_warn_days', 30))}<div class="sub">${c.due_on ? 'Due ' + fd(c.due_on) : 'No due date'}</div></td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">No certificates or maintenance recorded. Record one to get a reminder before it expires.</div>'}
          ${old.length ? `<details class="body"><summary class="muted">${plural(old.length, 'earlier record')}</summary>
            <ul class="list">${old.map(c => `<li><div><div class="name">${CERT_KINDS[c.kind]} ${esc(c.cert_no || '')}</div><div class="sub">Due ${fd(c.due_on)}${c.provider ? ' · ' + esc(c.provider) : ''}</div></div></li>`).join('')}</ul></details>` : ''}
        </section>
      </div>
      <div class="cols">${itemPricePanel(it, price, order, adm)}${itemServicePanel(it, svc, svcLog, lastUse[0]?.out_at, adm)}</div>
      ${!it.is_kit ? `<section class="panel mt"><header><h2>Serial & batch numbers</h2><span class="meta">${units.length || 'none recorded'}</span>
        ${adm ? `<div class="right"><button class="btn small" data-a="unit">${ico('plus')}Add</button></div>` : ''}</header>
        ${units.length ? `<div class="tablewrap"><table class="t stack"><thead><tr><th>Serial no.</th><th>Batch / lot</th><th>Expiry</th><th>Supplier</th><th>Notes</th>${adm ? '<th></th>' : ''}</tr></thead><tbody>
          ${units.map(u => `<tr><td class="name">${esc(u.serial_no || '—')}</td><td>${esc(u.lot_no || '—')}</td><td>${u.expiry_on ? `${dueChip(u.expiry_on, 60)} ${fd(u.expiry_on)}` : '—'}</td><td class="hide-m">${esc(u.supplier || '—')}</td>
            <td class="sub full">${esc(u.notes || '')}</td>${adm ? `<td class="num"><button class="btn small link" data-unit="${u.id}">Edit</button></td>` : ''}</tr>`).join('')}
          </tbody></table></div>` : `<div class="empty">Record serial numbers for traceability and per-unit certificates.${adm ? '' : ' Ask an admin to add them.'}</div>`}</section>` : ''}
      ${(() => { const hist = [...moves.map(m => ({ at: m.created_at, html: `<div class="name" style="white-space:normal">${esc(describeMove(m))}</div>
          <div class="sub">${[m.user_name, m.serials && 'S/N ' + m.serials, m.notes].filter(Boolean).map(esc).join(' · ')}</div>` })),
        ...(details || []).map(a => ({ a, txt: itemDetailChange(a) })).filter(x => x.txt).map(({ a, txt }) => ({ at: a.at, html: `<div class="name" style="white-space:normal">${esc(txt)}</div><div class="sub">${esc(a.user_name || '')} · details changed</div>` }))]
        .sort((x, y) => String(y.at).localeCompare(String(x.at)));
        return `<section class="panel"><header><h2>History</h2><span class="meta">latest ${hist.length}</span></header>
        ${hist.length ? `<ul class="list">${hist.map(h => `<li><div style="flex:1;min-width:0">${h.html}</div><div class="end sub">${fdt(h.at)}</div></li>`).join('')}</ul>` : '<div class="empty">No history yet.</div>'}</section>`; })()}`;
  },
  bind(main) {
    const c = this.ctx; if (!c) return;
    $$('[data-a]', main).forEach(b => b.onclick = () => ACTIONS[b.dataset.a](c));
    $$('[data-ret]', main).forEach(b => b.onclick = () => actReturn(c.it, c.cos.find(x => x.id === +b.dataset.ret)));
    $$('[data-use]', main).forEach(b => b.onclick = () => actConsume(c.it, c.cos.find(x => x.id === +b.dataset.use)));
    $$('[data-lost]', main).forEach(b => b.onclick = () => actLost(c.it, c.cos.find(x => x.id === +b.dataset.lost)));
    $$('[data-unit]', main).forEach(b => b.onclick = () => editUnit(c.it, c.units.find(u => u.id === +b.dataset.unit)));
    $$('[data-kit]', main).forEach(b => b.onclick = () => editKit(c, c.units.find(u => u.id === +b.dataset.kit)));
    const l = $('#lbl', main); if (l) l.onclick = () => { sessionStorage.setItem('labels', JSON.stringify([c.it.id])); go('#/labels'); };
    bindItemExtras(main, c);
  }
};

// ---------------------------------------------------------------- stock actions
function stockAt(stock, loc, status) { return +(stock.find(s => s.location_id === +loc && s.status === status)?.qty || 0); }
function stockLocOptions(stock, statuses, sel) {
  const locs = [...new Set(stock.filter(s => statuses.includes(s.status) && s.qty > 0).map(s => s.location_id))];
  return locs.map(l => opt(l, `${locName(l)} (${statuses.map(st => stockAt(stock, l, st)).reduce((a, b) => a + b, 0)} here)`, sel)).join('');
}
const done = msg => { toast(msg); refresh(); };

const ACTIONS = {
  checkout({ it, stock }) {
    const opts = stockLocOptions(stock, ['available', 'reserved']);
    if (!opts) return toast('Nothing in store to check out. Return or receive stock first.', true);
    return modal({
      title: 'Check out', sub: `${esc(it.code || '')} ${esc(it.name)}. For several items going to one job, use a materials request.`, submit: 'Check out',
      body: `<div class="row2"><label class="f">From<select name="loc" id="m-loc">${opts}</select></label>
        <label class="f">Take from<select name="st" id="m-st">${opt('available', 'Available')}${opt('reserved', 'Reserved')}</select></label></div>
        <label class="f">Quantity<span class="hint" id="m-have"></span><input type="number" name="qty" step="any" min="0" value="1" required></label>
        <label class="f">Job, well or site<input type="text" name="job" placeholder="e.g. Mahin-3 well intervention" required></label>
        <div class="row2"><label class="f">Issued to<input type="text" name="to" placeholder="Person responsible"></label>
        <label class="f">Due back<input type="date" name="due" min="${localISO(0)}"></label></div>
        <label class="f">Serial numbers<span class="hint">Optional, if specific units are going out.</span><input type="text" name="serials"></label>
        <label class="f">Notes<textarea name="notes"></textarea></label>`,
      onOpen: d => { const upd = () => { $('#m-have', d).textContent = `${stockAt(stock, $('#m-loc', d).value, $('#m-st', d).value)} ${it.unit} ${$('#m-st', d).value} here`; };
        $('#m-loc', d).onchange = upd; $('#m-st', d).onchange = upd; upd(); },
      onSubmit: async x => {
        await q(sb.rpc('checkout_item', { p_item: it.id, p_location: +x.loc, p_qty: num(x.qty), p_job: x.job, p_issued_to: x.to,
          p_due: x.due || null, p_serials: x.serials || null, p_notes: x.notes || null, p_from_status: x.st }));
        done(`Checked out ${x.qty} to ${x.job}`);
      }
    });
  },
  receive({ it }) {
    return modal({
      title: 'Receive stock', sub: `${esc(it.code || '')} ${esc(it.name)}`, submit: 'Receive',
      body: `<div class="row2"><label class="f">Into<select name="loc">${realLocOptions(realLocs()[0]?.id)}</select></label>
        <label class="f">Quantity<input type="number" name="qty" step="any" min="0" required></label></div>
        <label class="f">Reference<span class="hint">PO, waybill or delivery note number.</span><input type="text" name="ref"></label>
        <label class="f">Arrives as<select name="st">${opt('available', 'Available')}${opt('damaged', 'Damaged / needs inspection')}</select></label>
        <label class="f">Notes<textarea name="notes" placeholder="Supplier, condition, who delivered"></textarea></label>
        ${it.is_kit ? '<p class="muted">After receiving, add the new kit numbers and expiry dates under Redress kits.</p>' : ''}`,
      onSubmit: async x => {
        await q(sb.rpc('receive_stock', { p_item: it.id, p_location: +x.loc, p_qty: num(x.qty), p_ref: x.ref || null, p_notes: x.notes || null, p_status: x.st }));
        done(`Received ${x.qty} ${it.unit}`);
      }
    });
  },
  issue({ it, stock }) {
    const sale = it.item_type === 'sales';
    const opts = stockLocOptions(stock, ['available']);
    if (!opts) return toast('Nothing available in store.', true);
    return modal({
      title: sale ? 'Sell' : 'Issue', sub: `${esc(it.name)} leaves the inventory for good.`, submit: sale ? 'Record sale' : 'Issue',
      body: `<div class="row2"><label class="f">From<select name="loc">${opts}</select></label>
        <label class="f">Quantity<input type="number" name="qty" step="any" min="0" value="1" required></label></div>
        <label class="f">${sale ? 'Customer / job / invoice' : 'Job or purpose'}<input type="text" name="ref" required></label>
        <label class="f">Notes<textarea name="notes"></textarea></label>`,
      onSubmit: async x => {
        await q(sb.rpc('issue_stock', { p_item: it.id, p_location: +x.loc, p_qty: num(x.qty), p_kind: sale ? 'sale' : 'issue', p_ref: x.ref, p_notes: x.notes || null }));
        done(sale ? `Sale of ${x.qty} recorded` : `Issued ${x.qty}`);
      }
    });
  },
  transfer({ it, stock }) {
    const sts = Object.keys(STATUS).filter(s => stock.some(r => r.status === s));
    if (!sts.length) return toast('Nothing in stock to move.', true);
    return modal({
      title: 'Move to another location', sub: `${esc(it.code || '')} ${esc(it.name)}`, submit: 'Move',
      body: `<div class="row2"><label class="f">Status<select name="st" id="m-st">${sts.map(s => opt(s, STATUS[s])).join('')}</select></label>
        <label class="f">From<select name="from" id="m-from"></select></label></div>
        <div class="row2"><label class="f">To<select name="to">${realLocOptions()}</select></label>
        <label class="f">Quantity<span class="hint" id="m-have"></span><input type="number" name="qty" step="any" min="0" required></label></div>
        <label class="check"><input type="checkbox" name="transit"> Still on its way (mark as in transit until someone confirms arrival)</label>
        <label class="f">Notes<textarea name="notes" placeholder="Truck, driver, waybill"></textarea></label>`,
      onOpen: d => {
        const fill = () => { $('#m-from', d).innerHTML = stockLocOptions(stock, [$('#m-st', d).value], placeholderLoc()?.id); upd(); };
        const upd = () => { const h = stockAt(stock, $('#m-from', d).value, $('#m-st', d).value); $('#m-have', d).textContent = `${h} here`; $('input[name=qty]', d).value = h; };
        $('#m-st', d).onchange = fill; $('#m-from', d).onchange = upd; fill();
      },
      onSubmit: async x => {
        await q(sb.rpc('transfer_stock', { p_item: it.id, p_from: +x.from, p_to: +x.to, p_qty: num(x.qty), p_status: x.st, p_in_transit: !!x.transit, p_notes: x.notes || null }));
        done(x.transit ? 'Marked as in transit' : `Moved to ${locName(+x.to)}`);
      }
    });
  },
  status({ it, stock }) {
    if (!stock.length) return toast('Nothing in stock.', true);
    return modal({
      title: 'Change status', sub: 'For example: reserve for a job, confirm a delivery arrived, or mark as damaged (the admin is alerted).', submit: 'Change status',
      body: `<label class="f">At<select name="loc" id="m-loc">${stockLocOptions(stock, Object.keys(STATUS))}</select></label>
        <div class="row2"><label class="f">From<select name="from" id="m-from"></select></label>
        <label class="f">To<select name="to">${Object.entries(STATUS).map(([k, v]) => opt(k, v, 'damaged')).join('')}</select></label></div>
        <label class="f">Quantity<input type="number" name="qty" step="any" min="0" value="1" required></label>
        <label class="f">Notes<textarea name="notes" placeholder="Reason, job reference, damage description"></textarea></label>`,
      onOpen: d => {
        const fill = () => { const l = $('#m-loc', d).value; $('#m-from', d).innerHTML = Object.keys(STATUS).filter(s => stockAt(stock, l, s) > 0).map(s => opt(s, `${STATUS[s]} (${stockAt(stock, l, s)})`)).join(''); };
        $('#m-loc', d).onchange = fill; fill();
      },
      onSubmit: async x => {
        await q(sb.rpc('change_status', { p_item: it.id, p_location: +x.loc, p_qty: num(x.qty), p_from_status: x.from, p_to_status: x.to, p_notes: x.notes || null }));
        done(`Changed to ${STATUS[x.to].toLowerCase()}`);
      }
    });
  },
  count({ it, stock }) {
    const adm = canAdmin(it.department_id);
    return modal({
      title: 'Correct quantity', sub: adm ? 'As an admin of this line, your change applies straight away.' : 'Your service-line admin will be asked to approve this. To correct many items at once, use Edit quantities on the Inventory page.',
      submit: adm ? 'Apply' : 'Send for approval',
      body: `<div class="row2"><label class="f">Location<select name="loc" id="m-loc">${locOptions(stock[0]?.location_id)}</select></label>
        <label class="f">Status<select name="st" id="m-st">${Object.entries(STATUS).map(([k, v]) => opt(k, v)).join('')}</select></label></div>
        <label class="f">Correct quantity now<span class="hint" id="m-have"></span><input type="number" name="qty" step="any" min="0" required></label>
        <label class="f">Reason<textarea name="reason" required placeholder="e.g. Found 2 extra in Warri store; 1 lost downhole on Mahin-3"></textarea></label>`,
      onOpen: d => { const upd = () => { const h = stockAt(stock, $('#m-loc', d).value, $('#m-st', d).value); $('#m-have', d).textContent = `On record: ${h} ${it.unit}`; $('input[name=qty]', d).value = h; };
        $('#m-loc', d).onchange = upd; $('#m-st', d).onchange = upd; upd(); },
      onSubmit: async x => {
        const res = await q(sb.rpc('submit_changes', { p_changes: [{ item_id: it.id, location_id: +x.loc, status: x.st, qty_after: num(x.qty) }], p_reason: x.reason }));
        done(describeSubmit(res));
      }
    });
  },
  cert({ it, units }) {
    return modal({
      title: 'Record certificate or maintenance', sub: 'This replaces the previous record of the same kind, so reminders follow the latest date.', submit: 'Save record',
      body: `<div class="row2"><label class="f">Kind<select name="kind">${Object.entries(CERT_KINDS).map(([k, v]) => opt(k, v)).join('')}</select></label>
        <label class="f">For unit<select name="unit"><option value="">Whole item</option>${units.map(u => opt(u.id, u.serial_no ? (it.is_kit ? 'Kit ' : 'S/N ') + u.serial_no : 'Lot ' + u.lot_no)).join('')}</select></label></div>
        <div class="row2"><label class="f">Certificate / job card no.<input type="text" name="no"></label><label class="f">Done by<input type="text" name="prov" placeholder="Company or person"></label></div>
        <div class="row2"><label class="f">Date done<input type="date" name="issued" value="${localISO(0)}"></label><label class="f">Next due<input type="date" name="due"></label></div>
        <label class="f">Notes<textarea name="notes"></textarea></label>`,
      onSubmit: async x => {
        if (!x.due) throw new Error('Enter the next due date so the reminder works.');
        await q(sb.rpc('record_certification', { p_item: it.id, p_unit: x.unit ? +x.unit : null, p_kind: x.kind, p_cert_no: x.no, p_provider: x.prov,
          p_issued: x.issued || null, p_due: x.due, p_notes: x.notes || null }));
        done('Record saved');
      }
    });
  },
  kit(ctx) { return editKit(ctx, null); },
  unit({ it }) { return editUnit(it, null); },
  edit({ it }) { return editItem(it); },
};

function actReturn(it, c) {
  return modal({
    title: 'Return from job', sub: `${esc(it.name)} · ${esc(c.job_ref)}`, submit: 'Return',
    body: `<div class="row2"><label class="f">Quantity<span class="hint">${fq(c.open_qty)} still out</span><input type="number" name="qty" step="any" min="0" max="${c.open_qty}" value="${c.open_qty}" required></label>
      <label class="f">Back to<select name="loc">${realLocOptions(c.location_id)}</select></label></div>
      <label class="f">Condition<select name="cond">${opt('good', 'Good: ready to use')}${opt('damaged', 'Damaged: needs repair or inspection')}</select></label>
      <label class="f">Notes<textarea name="notes" placeholder="Anything missing or worn?"></textarea></label>`,
    onSubmit: async x => {
      await q(sb.rpc('return_checkout', { p_checkout: c.id, p_qty: num(x.qty), p_location: +x.loc, p_condition: x.cond, p_notes: x.notes || null }));
      done(`Returned ${x.qty} to ${locName(+x.loc)}`);
    }
  });
}
function actConsume(it, c) {
  return modal({
    title: 'Used or sold on the job', sub: `${esc(it.name)} · ${esc(c.job_ref)}. These don’t come back to the store.`, submit: 'Record',
    body: `<div class="row2"><label class="f">Quantity<span class="hint">${fq(c.open_qty)} still out</span><input type="number" name="qty" step="any" min="0" max="${c.open_qty}" value="${c.open_qty}" required></label>
      <label class="f">What happened<select name="kind">${opt('issue', 'Used up on the job')}${opt('sale', 'Sold to the client (left in the well)', it.item_type === 'sales' ? 'sale' : '')}</select></label></div>
      <label class="f">Reference<input type="text" name="ref" placeholder="Invoice or reference no. (optional)"></label>
      <label class="f">Notes<textarea name="notes"></textarea></label>`,
    onSubmit: async x => {
      await q(sb.rpc('consume_checkout', { p_checkout: c.id, p_qty: num(x.qty), p_kind: x.kind, p_ref: x.ref || null, p_notes: x.notes || null }));
      done(x.kind === 'sale' ? 'Sale recorded' : 'Recorded as used');
    }
  });
}
function actLost(it, c) {
  return modal({
    title: 'Write off as lost', sub: `${esc(it.name)} · ${esc(c.job_ref)}. This is recorded in the audit log with your name.`, submit: 'Write off', danger: true,
    body: `<label class="f">Quantity<span class="hint">${fq(c.open_qty)} still out</span><input type="number" name="qty" step="any" min="0" max="${c.open_qty}" value="${+c.missing_qty || c.open_qty}" required></label>
      <label class="f">Reason<textarea name="reason" required placeholder="e.g. Lost in hole on Mahin-3, fishing unsuccessful"></textarea></label>`,
    onSubmit: async x => {
      await q(sb.rpc('writeoff_checkout', { p_checkout: c.id, p_qty: num(x.qty), p_reason: x.reason }));
      done('Written off');
    }
  });
}
function editUnit(it, u) {
  return modal({
    title: u ? 'Edit serial / batch' : 'Add serial / batch', sub: esc(it.name), submit: 'Save',
    body: `<div class="row2"><label class="f">Serial no.<input type="text" name="serial_no" value="${esc(u?.serial_no)}"></label><label class="f">Batch / lot no.<input type="text" name="lot_no" value="${esc(u?.lot_no)}"></label></div>
      <div class="row2"><label class="f">Supplier / OEM<input type="text" name="supplier" value="${esc(u?.supplier || it.supplier)}"></label><label class="f">Received on<input type="date" name="received_on" value="${esc(u?.received_on)}"></label></div>
      <label class="f">Expiry date<span class="hint">For batches that expire (elastomers, chemicals). Leave blank if none.</span><input type="date" name="expiry_on" value="${esc(u?.expiry_on)}"></label>
      <label class="f">Notes<textarea name="notes">${esc(u?.notes)}</textarea></label>
      ${u ? '<label class="check"><input type="checkbox" name="remove"> Remove this unit (sold, scrapped or entered by mistake)</label>' : ''}`,
    onSubmit: async x => {
      if (!x.serial_no && !x.lot_no) throw new Error('Enter a serial number or a batch / lot number.');
      const row = { serial_no: x.serial_no || null, lot_no: x.lot_no || null, supplier: x.supplier || null, received_on: x.received_on || null, expiry_on: x.expiry_on || null, notes: x.notes || null };
      if (u) await q(sb.from('units').update({ ...row, active: !x.remove }).eq('id', u.id));
      else await q(sb.from('units').insert({ ...row, item_id: it.id }));
      done('Saved');
    }
  });
}
function editKit({ it, comps }, u) {
  const adm = canAdmin(it.department_id);
  const existing = u ? (u.unit_components || []) : [];
  const val = cid => existing.find(c => c.component_id === cid) || {};
  return modal({
    title: u ? `Kit ${u.serial_no}` : 'Add / update a redress kit', wide: true, sub: `${esc(it.name)}. ${adm ? 'Changes apply straight away.' : 'Your admin approves changes before they show.'}`,
    submit: adm ? 'Save kit' : 'Send for approval',
    body: `<div class="row2"><label class="f">Kit no.<input type="text" name="kit_no" value="${esc(u?.serial_no || '')}" ${u ? 'readonly' : ''} required placeholder="e.g. K-03"></label><div></div></div>
      <table class="t kittbl"><thead><tr><th>Component</th><th>Expiry date</th><th>Batch / lot</th></tr></thead><tbody>
      ${comps.map(c => `<tr><td>${esc(c.name)}${c.part_no ? `<div class="sub">${esc(c.part_no)}</div>` : ''}</td>
        <td><input type="date" name="e_${c.id}" value="${esc(val(c.id).expiry_on || '')}"></td><td><input type="text" name="b_${c.id}" value="${esc(val(c.id).batch_no || '')}"></td></tr>`).join('')}
      ${[1, 2, 3].map(n => `<tr class="newcomp"><td><input type="text" name="nc_${n}" placeholder="${comps.length ? 'Another component' : 'Component name, e.g. O-ring 211'}"></td>
        <td><input type="date" name="ne_${n}"></td><td><input type="text" name="nb_${n}"></td></tr>`).join('')}
      </tbody></table>
      <p class="muted">Leave the expiry date blank for components that don’t expire. A kit’s expiry is its earliest component expiry.</p>
      ${u && adm ? '<label class="check"><input type="checkbox" name="remove"> This kit has been used or scrapped: remove it</label>' : ''}`,
    onSubmit: async x => {
      const kit = String(x.kit_no || '').trim(); if (!kit) throw new Error('Enter the kit number.');
      if (x.remove && u) { await q(sb.from('units').update({ active: false }).eq('id', u.id)); return done(`Kit ${kit} removed`); }
      const rows = comps.map(c => ({ item_id: it.id, kit_no: kit, component: c.name, part_no: c.part_no, expiry_on: x['e_' + c.id] || null, batch_no: x['b_' + c.id] || '' }));
      [1, 2, 3].forEach(n => { if (String(x['nc_' + n] || '').trim()) rows.push({ item_id: it.id, kit_no: kit, component: x['nc_' + n].trim(), expiry_on: x['ne_' + n] || null, batch_no: x['nb_' + n] || '' }); });
      if (!rows.length) rows.push({ item_id: it.id, kit_no: kit });
      const res = await q(sb.rpc('submit_kits', { p_rows: rows, p_reason: `Kit ${kit}` }));
      done(describeSubmit(res));
    }
  });
}

// ================================================================ SCAN
let scanner = null;
function stopScanner() { if (scanner) { const s = scanner; scanner = null; try { Promise.resolve(s.stop()).then(() => s.clear()).catch(() => { }); } catch (e) { } } }
async function openScanned(text) {
  const m = String(text).match(/#\/item\/(\d+)/);
  if (m) return go('#/item/' + m[1]);
  await items();
  const hits = matchCode(text);
  if (hits.length === 1) return go('#/item/' + hits[0].id);
  S.inv.q = text.trim(); S.inv.view = 'all'; setLine('');
  if (hits.length > 1) { toast(`${hits.length} items share code ${text}. Pick one.`); return go('#/inventory'); }
  toast(`No item with code “${text}”. Showing search results.`, true); go('#/inventory');
}
ROUTES.scan = {
  async load() {
    return topbar('Scan', 'Point the camera at an item’s QR label or barcode. A handheld scanner works too: scan anywhere in the app.') +
      `<div class="cols"><div><div class="scanbox"><div id="reader"></div></div><p class="muted" id="scanmsg">Starting camera…</p></div>
      <section class="panel" style="align-self:start"><header><h2>Type a code instead</h2></header><form class="body" id="manual">
        <label class="f">Item code<input type="text" name="code" placeholder="e.g. GES-SLT-STB-001" autocomplete="off"></label>
        <button class="btn primary" type="submit">Find item</button></form></section></div>`;
  },
  async bind(main) {
    $('#manual', main).onsubmit = e => { e.preventDefault(); const c = new FormData(e.target).get('code'); if (c.trim()) openScanned(c); };
    const msg = $('#scanmsg', main);
    try {
      await loadScript('vendor/html5-qrcode.min.js');
      if (!$('#reader')) return;
      scanner = new window.Html5Qrcode('reader', { verbose: false });
      let handled = false;
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } },
        text => { if (handled) return; handled = true; if (navigator.vibrate) navigator.vibrate(60); stopScanner(); openScanned(text); }, () => { });
      msg.textContent = 'Camera on. Hold the label inside the square.';
    } catch (e) {
      msg.textContent = /Permission|NotAllowed/i.test(String(e)) ? 'Camera access was blocked. Allow camera access for this site in your browser settings, or type the code.'
        : 'No camera available here. Type the code, or use a handheld scanner.';
    }
  }
};

function qrSvg(text, cell = 3) {
  const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 0, scalable: true });
}

// ================================================================ ITEM: price, on order, servicing (2.6)
function itemPricePanel(it, price, order, adm) {
  const t = localISO(0); const sp = canSeePrices();
  const ord = order ? `<div class="ordbox ${order.expected_on && order.expected_on < t ? 'late' : ''}"><div><b>On order: ${fq(order.qty)} ${esc(it.unit)}</b>
      <div class="sub">${order.expected_on ? `Expected ${fd(order.expected_on)}${order.expected_on < t ? ' · late' : ''}` : 'No expected date'}${order.set_by_name ? ' · set by ' + esc(order.set_by_name) : ''}${order.note ? ' · ' + esc(order.note) : ''}</div></div>
      ${adm && !readOnly() ? `<div class="actionrow"><button class="btn small" data-x2="order">Update</button><button class="btn small link danger" data-x2="unorder">Clear</button></div>` : ''}</div>`
    : `<div class="sub">${needsReorder(it) ? 'Below reorder level and not on order yet.' : 'Not on order.'}</div>${adm && !readOnly() ? `<div class="actionrow mt"><button class="btn small" data-x2="order">${ico('truck')}Mark on order</button></div>` : ''}`;
  return `<section class="panel"><header><h2>${sp ? 'Price &amp; ordering' : 'Ordering'}</h2></header><div class="body">
    ${sp ? `<div class="pricebox"><div><span class="sub">Unit price</span><b>${price ? `${price.currency === 'NGN' ? '₦' : '$'}${Number(price.unit_price).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '<span class="sub">No price</span>'}</b>
      ${price ? `<span class="sub">${esc(price.source || '')}${price.updated_by_name ? ' · ' + esc(price.updated_by_name) : ''}${price.updated_at ? ' · ' + fd(price.updated_at) : ''}</span>` : ''}</div>
      ${isAdmin() && !readOnly() ? `<button class="btn small" data-x2="price">${price ? 'Edit price' : 'Add price'}</button>` : ''}</div>` : ''}
    <div class="pjf-sec">On order</div>${ord}</div></section>`;
}
function itemServicePanel(it, svc, log, lastUse, adm) {
  const t = localISO(0); const ro = readOnly();
  if (!it.service_idle_months) return `<section class="panel"><header><h2>Servicing</h2>${chip('muted', 'No rule')}</header><div class="body">
    <p class="muted">Set an idle-service rule for tools that must be serviced if they sit on the shelf unused, for example every 12 months. Nest then reminds the line admin.</p>
    ${lastUse ? `<dl class="kv"><dt>Last used</dt><dd>${fd(lastUse)}</dd></dl>` : ''}
    ${adm && !ro ? `<div class="actionrow mt"><button class="btn small" data-x2="rule">Set a rule</button></div>` : ''}</div></section>`;
  const due = svc?.service_due_on; const soon = due && due <= localISO(30);
  return `<section class="panel"><header><h2>Servicing</h2>${svc?.out_now ? chip('out', 'Out on a job') : due && due <= t ? chip('overdue', 'Service due') : soon ? chip('soon', 'Due soon') : chip('ok', 'Up to date')}</header><div class="body">
    <dl class="kv"><dt>Rule</dt><dd>Service if idle ${it.service_idle_months} months</dd>
      <dt>Last used</dt><dd>${svc?.last_used_at ? fd(svc.last_used_at) : '<span class="sub">Never issued in Nest</span>'}</dd>
      <dt>Last serviced</dt><dd>${svc?.last_serviced_at ? `${fd(svc.last_serviced_at)}${svc.last_serviced_by_name ? ' · ' + esc(svc.last_serviced_by_name) : ''}` : '<span class="sub">Not recorded</span>'}</dd>
      <dt>Next service</dt><dd>${due ? `<b class="${due <= t ? 'neg' : ''}">${fd(due)}</b>${svc?.out_now ? '<span class="sub"> · paused while out on a job</span>' : ''}` : '—'}</dd></dl>
    ${adm && !ro ? `<div class="actionrow mt"><button class="btn small tagbtn" data-x2="serviced">${ico('check')}Mark serviced</button><button class="btn small" data-x2="rule">Change rule</button></div>` : ''}
    ${log.length ? `<details class="mt"><summary class="muted">Service history (${log.length})</summary><ul class="list">${log.map(l => `<li><div><div class="name">${fd(l.serviced_at)} · ${esc(l.serviced_by_name || '')}</div>${l.note ? `<div class="sub">${esc(l.note)}</div>` : ''}</div></li>`).join('')}</ul></details>` : ''}
  </div></section>`;
}
function bindItemExtras(main, c) {
  const it = c.it;
  const A = {
    price: () => modal({ title: `Price · ${it.code || it.name}`, submit: 'Save price', sub: 'Seen by admins, the Developer and Management. Staff never see prices. Every change is in the audit log.',
      body: `<div class="row2"><label class="f">Unit price<input type="number" min="0" step="0.01" name="p" value="${c.price ? +c.price.unit_price : ''}" placeholder="Leave empty for no price"></label>
        <label class="f">Currency<select name="cur">${opt('USD', 'USD ($)', c.price?.currency || 'USD')}${opt('NGN', 'NGN (₦)', c.price?.currency)}</select></label></div>`,
      onSubmit: async x => {
        if (String(x.p).trim() === '') { if (c.price) await q(sb.from('item_prices').delete().eq('item_id', it.id)); }
        else await q(sb.from('item_prices').upsert({ item_id: it.id, unit_price: +x.p, currency: x.cur, source: 'Entered in Nest' }));
        S.plan = null; toast('Price saved'); refresh();
      } }),
    order: () => modal({ title: `On order · ${it.code || it.name}`, submit: 'Save', sub: 'Shows in the Monday email and on the low-stock lists. It clears itself when the stock is received in Nest.',
      body: `<div class="row2"><label class="f">Quantity on order<input type="number" min="0" step="any" name="qty" required value="${c.order ? +c.order.qty : (it.max_qty != null ? Math.max(1, it.max_qty - it.qty_available) : '')}"></label>
        <label class="f">Expected<input type="date" name="exp" value="${esc(c.order?.expected_on || '')}"></label></div>
        <label class="f">Note<span class="hint">Optional, for example the PO number or supplier.</span><input type="text" name="note" value="${esc(c.order?.note || '')}"></label>`,
      onSubmit: async x => { await q(sb.rpc('set_item_order', { p_item: it.id, p_qty: +x.qty, p_expected: x.exp || null, p_note: x.note || '' })); toast('Marked on order'); refresh(); } }),
    unorder: async () => { try { await q(sb.rpc('clear_item_order', { p_item: it.id })); toast('No longer on order'); refresh(); } catch (e) { toast(niceError(e), true); } },
    serviced: () => modal({ title: `Mark serviced · ${it.code || it.name}`, submit: 'Mark serviced', sub: 'Restarts the idle clock from today and records it in the service history.',
      body: '<label class="f">Note<span class="hint">Optional, for example who did it or what was done.</span><textarea name="note" rows="2"></textarea></label>',
      onSubmit: async x => { await q(sb.rpc('mark_serviced', { p_item: it.id, p_note: x.note || '' })); toast('Marked serviced'); refresh(); } }),
    rule: () => modal({ title: `Idle-service rule · ${it.code || it.name}`, submit: 'Save rule',
      body: `<label class="f">Service if idle on the shelf<span class="hint">The clock starts from the last time it was issued on a job, serviced, or added to Nest.</span><select name="svc">${SVC_OPTS(it.service_idle_months)}</select></label>`,
      onSubmit: async x => { await q(sb.rpc('set_service_rule', { p_items: [it.id], p_months: x.svc ? +x.svc : null })); toast(x.svc ? 'Rule saved' : 'Rule removed'); refresh(); } }),
  };
  $$('[data-x2]', main).forEach(b => b.onclick = () => A[b.dataset.x2]());
}

// ---------------------------------------------------------------- 2.7: archive / restore several items, delete items added by mistake
function bulkArchive(list, restore) {
  return modal({
    title: restore ? `Restore ${plural(list.length, 'item')}` : `Archive ${plural(list.length, 'item')}`, submit: restore ? 'Restore' : 'Archive',
    sub: restore ? 'They come back into the lists, counts and reports.' : 'Archived items disappear from the lists, monthly counts and reports, but keep all their history. You can restore them from the Archived filter at any time.',
    body: `<ul class="list compact">${list.slice(0, 12).map(i => `<li>${tag(i.code)} ${esc(i.name)}${!restore && +i.qty_total ? ` <span class="sub">· ${fq(i.qty_total)} still counted in stock</span>` : ''}</li>`).join('')}${list.length > 12 ? `<li class="sub">and ${list.length - 12} more</li>` : ''}</ul>
      ${!restore && list.some(i => +i.qty_total) ? '<div class="notice">Some of these still have stock. Archiving doesn’t change the stock; it only hides the item.</div>' : ''}`,
    onSubmit: async () => {
      const n = await q(sb.rpc('set_items_active', { p_ids: list.map(i => i.id), p_active: !!restore }));
      S.inv.sel.clear(); invalidate(); toast(`${plural(n, 'item')} ${restore ? 'restored' : 'archived'}`); render({ quiet: true });
    }
  });
}
async function bulkDelete(list) {
  return modal({
    title: `Delete ${plural(list.length, 'item')}`, submit: 'Delete', danger: true,
    sub: 'Only for items added by mistake. An item that has ever had stock movements, requests, counts, certificates or planner links can’t be deleted: archive it instead. Deleting can’t be undone.',
    body: `<ul class="list compact">${list.slice(0, 12).map(i => `<li>${tag(i.code)} ${esc(i.name)}</li>`).join('')}${list.length > 12 ? `<li class="sub">and ${list.length - 12} more</li>` : ''}</ul><div id="bd-out"></div>`,
    onSubmit: async (x, d) => {
      const done = [], kept = [];
      for (const i of list) { try { await q(sb.rpc('delete_unused_item', { p_item: i.id })); done.push(i); } catch (e) { kept.push({ i, why: niceError(e) }); } }
      S.inv.sel.clear(); invalidate();
      if (kept.length) {
        render({ quiet: true });
        setTimeout(() => modal({ title: done.length ? `Deleted ${plural(done.length, 'item')}` : 'Nothing was deleted', submit: '', cancel: 'Close',
          body: `<p>${plural(kept.length, 'item')} couldn’t be deleted because ${kept.length === 1 ? 'it has' : 'they have'} been used in Nest. Archive ${kept.length === 1 ? 'it' : 'them'} instead.</p><ul class="list compact">${kept.map(k => `<li>${tag(k.i.code)} ${esc(k.i.name)}<div class="sub">${esc(k.why.replace(/\. It can.*$/, ''))}</div></li>`).join('')}</ul>` }), 0);
      } else { toast(`${plural(done.length, 'item')} deleted`); render({ quiet: true }); }
    }
  });
}
