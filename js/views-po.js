/* GANKCO Nest 2.7 — Purchase Order app: list and history, the PO sheet, issue, revise, cancel, receive, suppliers, settings */
'use strict';

const PO_STATUS = { draft: ['muted', 'Draft'], issued: ['out', 'Issued'], partial: ['pending', 'Partly received'], received: ['ok', 'Fully received'], closed: ['muted', 'Closed'], cancelled: ['overdue', 'Cancelled'] };
const PO_SRC = { blank: 'Typed in', quote: 'From a supplier quote', planner: 'From the Job planner', import: 'Old PO added by hand' };
const poFull = o => o?.po_no ? (o.revision ? `${o.po_no}-R${o.revision}` : o.po_no) : null;
const poMyApps = () => S.profile?.apps || [];
const poCanView = () => !!appRole('po');
// 3.0.4: everyone in PO is Staff (raise and manage their own, no approval) or Viewer (look and download)
const poCanRaise = () => !S.viewAs && appRole('po') === 'staff';
const poOwner = o => isSuper() || (appRole('po') === 'staff' && !!o && o.created_by === S.profile?.id);
const poStatusChip = o => chip(PO_STATUS[o.status]?.[0] || 'muted', PO_STATUS[o.status]?.[1] || o.status) + (o.revising ? ' ' + chip('pending', `R${o.revision + 1} being prepared`) : '') + (o.is_import ? ' ' + chip('muted', 'Added by hand') : '');
const poLineName = id => S.po.lines.find(l => l.id === +id)?.name || '—';
const poLineCode = id => S.po.lines.find(l => l.id === +id)?.code || '';
const poMajors = () => S.po.lines.filter(l => !l.parent_id && l.for_po !== false && l.active !== false).sort((a, b) => a.sort - b.sort);
const poSubs = major => S.po.lines.filter(l => l.parent_id === +major && l.active !== false).sort((a, b) => a.sort - b.sort);
const poLineLabel = o => [poLineCode(o.line_id), o.sub_line_id ? poLineName(o.sub_line_id) : poLineName(o.line_id)].filter(Boolean).join(' · ');
const poSettings = () => setting('po', {}) || {};
const poOfficeLabel = k => k ? (poSettings().offices?.[k]?.label || k) : 'Left blank';
S.po = { lines: [], suppliers: [], terms: [], at: 0, f: { q: '', status: 'open', line: '', sub: '', sup: '', year: '', cur: '', sk: '', sd: '' } };

// ---------------------------------------------------------------- PO list order
// Default: drafts first (last edited on top), then POs issued in Nest by number (newest on top),
// then old POs added from before Nest by PO date (newest on top).
const poGroup = o => o.status === 'draft' && !o.po_no ? 0 : o.is_import ? 2 : 1;
const poNumOf = o => { if (o.seq != null) return +o.seq; const m = String(o.po_no || '').match(/-PO-(\d+)-/); return m ? +m[1] : null; };
const poCmp = (x, y) => x < y ? -1 : x > y ? 1 : 0;
function poDefaultOrder(a, b) {
  const g = poGroup(a) - poGroup(b); if (g) return g;
  if (poGroup(a) === 0) return poCmp(String(b.updated_at || b.created_at || ''), String(a.updated_at || a.created_at || ''));
  if (poGroup(a) === 1) return (poNumOf(b) ?? -1) - (poNumOf(a) ?? -1) || (b.revision || 0) - (a.revision || 0) || b.id - a.id;
  return poCmp(String(b.po_date || ''), String(a.po_date || '')) || poCmp(String(b.po_no || ''), String(a.po_no || '')) || b.id - a.id;
}
const poSortWord = k => PO_SORT[k][0].replace(/^(?!PO\b)\w/, m => m.toLowerCase());
const PO_STATUS_ORDER = ['draft', 'issued', 'partial', 'received', 'closed', 'cancelled'];
// column: [label, sort value, first-click direction, words for the order]
const PO_SORT = {
  no:   ['PO number', o => poNumOf(o) ?? (o.po_no || null), 'desc', ['lowest first', 'highest first']],
  date: ['PO date', o => o.po_date || null, 'desc', ['oldest first', 'newest first']],
  sup:  ['Supplier', o => (o.supplier_name || '').trim().toLowerCase() || null, 'asc', ['A to Z', 'Z to A']],
  line: ['Service line', o => `${poLineCode(o.line_id)} ${o.sub_line_id ? poLineName(o.sub_line_id) : ''}`.trim().toLowerCase() || null, 'asc', ['A to Z', 'Z to A']],
  del:  ['Delivery', o => o.delivery_date || null, 'asc', ['soonest first', 'latest first']],
  tot:  ['Order amount', o => +o.total || 0, 'desc', ['smallest first', 'largest first']],
  st:   ['Status', o => PO_STATUS_ORDER.indexOf(o.status), 'asc', ['draft to cancelled', 'cancelled to draft']],
  by:   ['Raised by', o => (o.created_by_name || '').trim().toLowerCase() || null, 'asc', ['A to Z', 'Z to A']]
};
function poSortRows(rows) {
  const f = S.po.f, col = PO_SORT[f.sk];
  if (!col) return rows.slice().sort(poDefaultOrder);
  const dir = f.sd === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const x = col[1](a), y = col[1](b), ex = x == null || x === '', ey = y == null || y === '';
    if (ex || ey) return ex === ey ? poDefaultOrder(a, b) : ex ? 1 : -1;   // blanks always at the bottom
    return (typeof x === typeof y ? poCmp(x, y) : poCmp(String(x), String(y))) * dir || poDefaultOrder(a, b);
  });
}

async function poLookups(force) {
  if (!force && S.po.at && Date.now() - S.po.at < 60000) return S.po;
  const [lines, suppliers, terms] = await Promise.all([
    q(sb.from('po_service_lines').select('*').order('sort')),
    q(sb.from('po_suppliers').select('*').order('name')),
    q(sb.from('po_terms').select('*').order('last_used_at', { ascending: false }).limit(60)),
  ]);
  Object.assign(S.po, { lines, suppliers, terms, at: Date.now() });
  return S.po;
}

// ---------------------------------------------------------------- shell: menu and phone bar for the PO app
function poNav() {
  const main = [['po/overview', 'Overview', 'chart'], ['po', 'Purchase orders', 'audit'], ...(poCanRaise() ? [['po/new', 'New purchase order', 'plus']] : []), ['po/suppliers', 'Suppliers', 'users']];
  const setup = [...(isSuper() ? [['po/settings', 'PO settings', 'gear'], ['team', 'Nest admin', 'users']] : [])];
  return { main, setup };
}
function poBottomBar() {
  return `<nav class="bottombar">
    <a href="#/po/overview" data-r="po/overview">${ico('chart')}Overview</a>
    <a href="#/po" data-r="po">${ico('audit')}Orders</a>
    ${poCanRaise() ? `<a href="#/po/new" data-r="po/new" class="scan"><span class="disc">${ico('plus')}</span>New PO</a>` : ''}
    <a href="#/po/suppliers" data-r="po/suppliers">${ico('users')}Suppliers</a>
    <a href="#/" data-r="home">${ico('grid')}Apps</a></nav>`;
}
async function poTileMeta(el) {
  try {
    const rows = await q(sb.from('po_orders').select('status,revising,created_by').in('status', ['draft', 'issued', 'partial']));
    const drafts = rows.filter(r => r.status === 'draft' && r.created_by === S.profile.id).length, open = rows.filter(r => r.status !== 'draft').length;
    el.textContent = [drafts ? plural(drafts, 'draft') + ' to finish' : '', open ? `${open} awaiting delivery` : ''].filter(Boolean).join(' · ') || 'Open';
    if (drafts) el.classList.add('hot');
  } catch (e) { el.textContent = 'Open'; }
}

// ---------------------------------------------------------------- router
ROUTES.po = {
  async load(parts, params) {
    if (!poCanView()) return topbar('Purchase Order') + `<div class="notice">You don’t have access to the Purchase Order app yet. Ask the Developer to switch it on for you on the Team page.</div><a class="btn" href="#/">Back to Nest home</a>`;
    await poLookups();
    const p1 = parts[1];
    this.mode = !p1 ? 'list' : p1 === 'new' ? 'edit' : p1 === 'suppliers' ? 'suppliers' : p1 === 'settings' ? 'settings' : p1 === 'overview' ? 'overview' : parts[2] === 'edit' ? 'edit' : 'view';
    if (this.mode === 'list') return poList.load(params);
    if (this.mode === 'overview') return poOverview.load(params);
    if (this.mode === 'edit') return poEditor.load(p1 === 'new' ? null : +p1, params);
    if (this.mode === 'view') { if (!(+p1 > 0)) { setTimeout(() => go('#/po'), 0); return '<div class="loading">Opening…</div>'; } return poView.load(+p1); }
    if (this.mode === 'suppliers') return poSuppliersView.load();
    if (this.mode === 'settings') return poSettingsView.load();
  },
  bind(main, parts, params) {
    if (!poCanView()) return;
    ({ list: poList, edit: poEditor, view: poView, suppliers: poSuppliersView, settings: poSettingsView, overview: poOverview })[this.mode]?.bind(main, parts, params);
  }
};

// ================================================================ LIST AND HISTORY
const poList = {
  async load(params) {
    if (params?.get('v') === 'late') { S.po.f.status = 'late'; history.replaceState(null, '', '#/po'); }
    this.sel = new Set();
    this.rows = await q(sb.from('po_orders').select('id,po_no,seq,revision,title,status,revising,line_id,sub_line_id,supplier_name,po_date,delivery_date,currency,total,created_by,created_by_name,created_at,updated_at,issued_at,is_import,source,quote_ref')
      .order('created_at', { ascending: false }).limit(3000));
    const yr = String(new Date().getFullYear());
    const issued = this.rows.filter(o => !['draft', 'cancelled'].includes(o.status));
    const thisYear = issued.filter(o => String(o.po_date || o.issued_at || '').slice(0, 4) === yr);
    const byCur = arr => Object.entries(arr.reduce((a, o) => (a[o.currency] = (a[o.currency] || 0) + +o.total, a), {})).map(([c, v]) => poMoney(v, c));
    const myDrafts = this.rows.filter(o => o.status === 'draft' && o.created_by === S.profile.id).length;
    const waiting = this.rows.filter(o => ['issued', 'partial'].includes(o.status));
    const late = waiting.filter(o => o.delivery_date && o.delivery_date < localISO(0));
    const years = [...new Set(this.rows.map(o => String(o.po_date || o.created_at || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    const f = S.po.f;
    return topbar('Purchase orders', 'Raise, sign and track purchase orders to OEMs and suppliers. One running PO number for every service line.',
      `${poCanRaise() ? `<button class="btn" id="po-import">${ico('up')}Add old POs</button><a class="btn tagbtn" href="#/po/new">${ico('plus')}New purchase order</a>` : ''}<button class="btn" id="po-xls">${ico('down')}Excel</button>`) +
      `<div class="board b4">
        <div class="kpi ${myDrafts ? 'warn' : ''}"><div class="n">${myDrafts}</div><div class="l">Your drafts to finish</div></div>
        <div class="kpi"><div class="n">${waiting.length}</div><div class="l">Awaiting delivery${late.length ? `<span class="sub neg"> · ${late.length} late</span>` : ''}</div></div>
        <div class="kpi"><div class="n">${thisYear.length}</div><div class="l">Issued in ${yr}</div></div>
        <div class="kpi"><div class="n small">${byCur(thisYear).join('<br>') || '—'}</div><div class="l">Value issued in ${yr}</div></div></div>
      <section class="panel"><div class="filters po-filters">
        <input type="search" id="po-q" placeholder="Search PO number, supplier or raised by" value="${esc(f.q)}" autocomplete="off">
        <div class="seg" id="po-seg">${[['open', 'Open'], ['late', 'Late'], ['draft', 'Drafts'], ['issued', 'Issued'], ['partial', 'Partly received'], ['received', 'Fully received'], ['closed', 'Closed'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) => `<button data-s="${k}" class="${f.status === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select id="po-line"><option value="">All service lines</option>${poMajors().map(l => opt(l.id, `${l.code} · ${l.name}`, f.line)).join('')}</select>
        <select id="po-sub" ${f.line ? '' : 'disabled'}><option value="">All sub lines</option>${f.line ? poSubs(f.line).map(l => opt(l.id, l.name, f.sub)).join('') : ''}</select>
        <select id="po-sup"><option value="">All suppliers</option>${[...new Set(this.rows.map(o => o.supplier_name).filter(Boolean))].sort().map(n => opt(n, n, f.sup)).join('')}</select>
        <select id="po-year"><option value="">All years</option>${years.map(y => opt(y, y, f.year)).join('')}</select>
        <select id="po-cur"><option value="">All currencies</option>${Object.keys(PO_CUR).map(c => opt(c, c, f.cur)).join('')}</select>
        <select id="po-msort" class="po-msort" aria-label="Order">${this.sortOptions()}</select></div>
        <div id="po-bulk"></div><div id="po-sortnote"></div>
        <div class="tablewrap"><table class="t stack potable"><thead><tr><th class="c-sel"></th>${Object.entries(PO_SORT).map(([k, c]) => `<th data-sk="${k}" class="sortable${k === 'tot' ? ' num' : ''}"><button type="button" class="thsort" title="Sort by ${poSortWord(k)}">${c[0]}<span class="arr" aria-hidden="true"></span></button></th>`).join('')}</tr></thead><tbody id="po-body"></tbody>
        <tfoot id="po-foot"></tfoot></table></div></section>`;
  },
  filtered() {
    const f = S.po.f; const t = f.q.trim().toLowerCase();
    return this.rows.filter(o => {
      const late = ['issued', 'partial'].includes(o.status) && o.delivery_date && o.delivery_date < localISO(0);
      if (f.status === 'open' ? !['draft', 'issued', 'partial'].includes(o.status) : f.status === 'late' ? !late : f.status !== 'all' && o.status !== f.status) return false;
      if (f.line && o.line_id !== +f.line) return false;
      if (f.sub && o.sub_line_id !== +f.sub) return false;
      if (f.sup && o.supplier_name !== f.sup) return false;
      if (f.year && String(o.po_date || o.created_at || '').slice(0, 4) !== f.year) return false;
      if (f.cur && o.currency !== f.cur) return false;
      if (t && !`${poFull(o) || 'draft'} ${o.supplier_name || ''} ${o.created_by_name || ''}`.toLowerCase().includes(t)) return false;
      return true;
    });
  },
  sorted() { return poSortRows(this.filtered()); },
  sortOptions() {
    const f = S.po.f, cur = f.sk ? `${f.sk}:${f.sd}` : '';
    return [['', 'Default order (newest first)'], ...['no', 'date', 'sup', 'del', 'tot', 'st', 'by'].flatMap(k => { const c = PO_SORT[k];
      const both = [['asc', c[3][0]], ['desc', c[3][1]]]; if (c[2] === 'desc') both.reverse(); return both.map(([d, w]) => [`${k}:${d}`, `${c[0]}: ${w}`]); })]
      .map(([v, l]) => opt(v, l, cur)).join('');
  },
  drawSort(main) {
    const f = S.po.f, col = PO_SORT[f.sk];
    $$('th[data-sk]', main).forEach(th => { const on = th.dataset.sk === f.sk; th.classList.toggle('on', on);
      th.setAttribute('aria-sort', on ? (f.sd === 'asc' ? 'ascending' : 'descending') : 'none');
      $('.arr', th).textContent = on ? (f.sd === 'asc' ? '↑' : '↓') : ''; });
    const ms = $('#po-msort', main); if (ms) ms.value = f.sk ? `${f.sk}:${f.sd}` : '';
    $('#po-sortnote', main).innerHTML = col ? `<div class="sortnote">Sorted by <b>${esc(poSortWord(f.sk))}</b>, ${esc(col[3][f.sd === 'asc' ? 0 : 1])}. <button type="button" class="linkbtn" id="po-sortreset">Back to the default order</button></div>` : '';
    const r = $('#po-sortreset', main); if (r) r.onclick = () => { f.sk = ''; f.sd = ''; this.draw(main); };
  },
  draw(main) {
    const rows = this.sorted();
    this.drawSort(main);
    $('#po-body', main).innerHTML = rows.length ? rows.map(o => {
      const late = ['issued', 'partial'].includes(o.status) && o.delivery_date && o.delivery_date < localISO(0);
      const del = o.status === 'draft' && !o.po_no && poOwner(o) && poCanRaise();
      return `<tr class="clickrow" data-go="${o.id}"><td class="c-sel">${del ? `<input type="checkbox" data-dsel="${o.id}" ${this.sel.has(o.id) ? 'checked' : ''} aria-label="Select draft">` : ''}</td><td class="name nowrap"><a href="#/po/${o.id}">${poFull(o) ? esc(poFull(o)) : '<span class="sub">Draft</span>'}</a></td>
        <td class="nowrap">${o.po_date ? fd(o.po_date) : '<span class="sub">—</span>'}</td><td class="full">${esc(o.supplier_name || '—')}</td>
        <td><span class="linebadge">${esc(poLineCode(o.line_id))}</span> <span class="sub">${esc(o.sub_line_id ? poLineName(o.sub_line_id) : '')}</span></td>
        <td class="nowrap">${o.delivery_date ? `<span class="${late ? 'neg' : ''}">${fd(o.delivery_date)}${late ? ' · late' : ''}</span>` : '<span class="sub">—</span>'}</td>
        <td class="num nowrap"><b>${poMoney(o.total, o.currency)}</b></td><td>${poStatusChip(o)}</td><td class="sub">${esc(o.created_by_name || '')}${del ? ` <button class="iconbtn danger" data-ddel="${o.id}" title="Delete this draft" aria-label="Delete this draft">${ico('trash')}</button>` : ''}</td></tr>`;
    }).join('') : `<tr><td colspan="9" class="empty">${this.rows.length ? 'No purchase orders match these filters.' : 'No purchase orders yet.' + (poCanRaise() ? ' Press <b>New purchase order</b> to raise the first one.' : '')}</td></tr>`;
    const counted = rows.filter(o => !['draft', 'cancelled'].includes(o.status));
    const sums = Object.entries(counted.reduce((a, o) => (a[o.currency] = (a[o.currency] || 0) + +o.total, a), {}));
    $('#po-foot', main).innerHTML = sums.length ? `<tr><td></td><td colspan="5"><b>Total</b> <span class="sub">${plural(counted.length, 'PO')} shown, not counting drafts and cancelled</span></td><td class="num nowrap"><b>${sums.map(([c, v]) => poMoney(v, c)).join('<br>')}</b></td><td colspan="2"></td></tr>` : '';
    $$('[data-go]', main).forEach(tr => tr.onclick = e => { if (!e.target.closest('a,input,button')) go('#/po/' + tr.dataset.go); });
    $$('[data-dsel]', main).forEach(c => c.onchange = () => { c.checked ? this.sel.add(+c.dataset.dsel) : this.sel.delete(+c.dataset.dsel); this.drawBulk(main); });
    $$('[data-ddel]', main).forEach(b => b.onclick = () => this.deleteDrafts(main, [+b.dataset.ddel]));
    this.drawBulk(main);
  },
  drawBulk(main) {
    const n = this.sel.size, el = $('#po-bulk', main);
    el.innerHTML = n ? `<div class="bulkbar"><b>${plural(n, 'draft')} selected</b><button class="btn small danger" id="pb-del">${ico('trash')}Delete ${n === 1 ? 'draft' : 'drafts'}</button><button class="btn small" id="pb-clear">Clear</button></div>` : '';
    if (!n) return;
    $('#pb-clear', el).onclick = () => { this.sel.clear(); this.draw(main); };
    $('#pb-del', el).onclick = () => this.deleteDrafts(main, [...this.sel]);
  },
  async deleteDrafts(main, ids) {
    const rows = this.rows.filter(o => ids.includes(o.id));
    const ok = await modal({ title: `Delete ${plural(rows.length, 'draft')}`, submit: 'Delete', danger: true,
      sub: 'Drafts were never issued, so no PO number is lost. The draft, its lines and any attached quote are removed completely. The Audit log keeps a line saying who deleted it.',
      body: `<ul class="list compact">${rows.map(o => `<li>Draft · ${esc(o.supplier_name || 'no supplier yet')} · ${poMoney(o.total, o.currency)} <span class="sub">${fd(o.created_at)}</span></li>`).join('')}</ul>`,
      onSubmit: async () => { for (const o of rows) await q(sb.rpc('po_delete_draft', { p_id: o.id })); } });
    if (!ok) return;
    toast(`${plural(rows.length, 'draft')} deleted`); this.sel.clear(); render({ quiet: true });
  },
  bind(main) {
    const f = S.po.f; const redraw = () => this.draw(main);
    $('#po-q', main).oninput = debounce(e => { f.q = e.target.value; redraw(); }, 140);
    $$('#po-seg button', main).forEach(b => b.onclick = () => { f.status = b.dataset.s; $$('#po-seg button', main).forEach(x => x.classList.toggle('on', x === b)); redraw(); });
    $('#po-line', main).onchange = e => { f.line = e.target.value; f.sub = ''; render({ quiet: true }); };
    $('#po-sub', main).onchange = e => { f.sub = e.target.value; redraw(); };
    $('#po-sup', main).onchange = e => { f.sup = e.target.value; redraw(); };
    $('#po-year', main).onchange = e => { f.year = e.target.value; redraw(); };
    $('#po-cur', main).onchange = e => { f.cur = e.target.value; redraw(); };
    // column headings sort: first press uses the natural order for that column, the second flips it, the third goes back to the default
    $$('th[data-sk] .thsort', main).forEach(b => b.onclick = () => {
      const k = b.parentNode.dataset.sk, first = PO_SORT[k][2];
      if (f.sk !== k) { f.sk = k; f.sd = first; } else if (f.sd === first) f.sd = first === 'asc' ? 'desc' : 'asc'; else { f.sk = ''; f.sd = ''; }
      redraw();
    });
    $('#po-msort', main).onchange = e => { const [k, d] = e.target.value.split(':'); f.sk = k || ''; f.sd = d || ''; redraw(); };
    const imp = $('#po-import', main); if (imp) imp.onclick = () => poBulkImport();
    $('#po-xls', main).onclick = () => brandXlsx({ file: `Purchase orders ${localISO(0)}.xlsx`, sheets: [{ name: 'Purchase orders', title: 'Purchase orders',
      subtitle: `${CFG.COMPANY || ''} · ${plural(this.filtered().length, 'purchase order')}${PO_SORT[f.sk] ? ` · sorted by ${poSortWord(f.sk)}, ${PO_SORT[f.sk][3][f.sd === 'asc' ? 0 : 1]}` : ''}`,
      columns: [{ header: 'PO number', key: 'no', width: 26 }, { header: 'PO date', key: 'date', width: 12, type: 'date' }, { header: 'Supplier', key: 'sup', width: 32 },
        { header: 'Service line', key: 'line', width: 8 }, { header: 'Sub service line', key: 'sub', width: 34 }, { header: 'Delivery date', key: 'del', width: 13, type: 'date' },
        { header: 'Currency', key: 'cur', width: 9 }, { header: 'Order amount', key: 'tot', width: 15, type: 'num' }, { header: 'Status', key: 'st', width: 15 }, { header: 'Raised by', key: 'by', width: 20 }],
      rows: this.sorted().map(o => ({ no: poFull(o) || 'Draft', date: o.po_date, sup: o.supplier_name || '', line: poLineCode(o.line_id), sub: o.sub_line_id ? poLineName(o.sub_line_id) : '',
        del: o.delivery_date, cur: o.currency, tot: +o.total, st: PO_STATUS[o.status]?.[1] + (o.revision ? ` (R${o.revision})` : ''), by: o.created_by_name || '' })) }] });
    redraw();
  }
};

// ================================================================ THE PO SHEET (new, draft, or a revision)
const poEditor = {
  async load(id, params) {
    if (!poCanRaise()) return topbar('Purchase order') + `<div class="notice">${readOnly() ? esc(S.viewAs ? VIEW_MSG : MGMT_MSG) : 'You don’t have access to raise purchase orders.'}</div>`;
    await items();
    let o, lines = [], files = [];
    if (id) {
      o = await q(sb.from('po_orders').select('*').eq('id', id).maybeSingle());
      if (!o) return topbar('Purchase order') + '<div class="notice bad">Purchase order not found.</div>';
      if (!poOwner(o)) return topbar(esc(poFull(o) || 'Draft purchase order')) + `<div class="notice">Only ${esc(o.created_by_name || 'the person who raised it')} or the Developer can change this PO. <a href="#/po/${o.id}">Open it</a></div>`;
      if (o.status !== 'draft' && !o.revising) { setTimeout(() => go('#/po/' + id), 0); return '<div class="loading">Opening…</div>'; }
      lines = await q(sb.from('po_order_lines').select('*').eq('po_id', id).order('sort').order('id'));
      files = await q(sb.from('po_files').select('id,kind,name,mime,size,added_by_name,added_at').eq('po_id', id).order('added_at'));
    } else {
      const last = (() => { try { return JSON.parse(localStorage.getItem('nest.po.last') || '{}'); } catch (e) { return {}; } })();
      o = { id: null, status: 'draft', revision: 0, line_id: last.line_id || poMajors()[0]?.id, sub_line_id: last.sub_line_id || null, currency: last.currency || 'USD',
        po_date: localISO(0), deliver_to: '', tax_summary: {}, source: 'blank' };
      if (params.get('from') === 'planner') {
        try { const pl = JSON.parse(sessionStorage.getItem('nest.po.planner') || 'null'); if (pl) { lines = pl.lines; Object.assign(o, pl.header || {}); o.source = 'planner'; } } catch (e) { }
        sessionStorage.removeItem('nest.po.planner');
      }
    }
    if (!lines.length) lines = [{ kind: 'item', qty: 1, uom: 'EA', rate: 0 }];
    this.st = { o: { ...o, tax_summary: o.tax_summary || {} }, lines: lines.map(l => ({ ...l })), files, dirty: false };
    const st = this.st, ro = st.o;
    const title = ro.revising ? `Revise ${esc(poFull(ro))}` : ro.id ? 'Draft purchase order' : 'New purchase order';
    const nextNo = (setting('po_counter', {}) || {}).next;
    return topbar(title, ro.revising ? `You’re preparing <b>R${ro.revision + 1}</b>. The issued ${esc(poFull(ro))} stays valid until you sign this revision.`
        : `Fill it in like the Excel PO. When you sign and issue it, Nest gives it the next number${nextNo ? ` (<b>${esc(poLineCode(ro.line_id) ? `GES-${poLineCode(ro.line_id)}-PO-${nextNo}-${String(ro.po_date || localISO(0)).slice(0, 4)}` : nextNo)}</b>)` : ''}.`,
      `${ro.id ? `<a class="btn" href="#/po/${ro.id}">Back</a>` : '<a class="btn" href="#/po">Back</a>'}`) +
      `${!S.profile.signature_id ? `<div class="notice">You haven’t added your signature yet, so the PO will show your name only. <a href="#/account">Add it in My account</a>.</div>` : ''}
      <form id="po-form" class="po-ed" autocomplete="off" novalidate>
      <section class="panel"><header><h2>Service line</h2><span class="meta">The line code goes into the PO number</span></header><div class="body">
        <div class="row2"><label class="f">Service line<span class="req" title="Required to issue">*</span><select name="line_id" id="pe-line" ${ro.revising ? 'disabled' : ''}>${poMajors().map(l => opt(l.id, `${l.code} · ${l.name}`, ro.line_id)).join('')}</select>${ro.revising ? '<span class="hint">Can’t change on a revision: the number belongs to this line.</span>' : ''}</label>
        <label class="f">Sub service line<span class="req" title="Required to issue">*</span><select name="sub_line_id" id="pe-sub"></select></label></div></div></section>
      <section class="panel"><header><h2>Supplier</h2><span class="meta">Pick a saved supplier or type a new one: it’s saved when you issue the PO</span></header><div class="body">
        <label class="f">Name<span class="req" title="Required to issue">*</span><input type="text" name="supplier_name" list="pe-sups" value="${esc(ro.supplier_name || '')}" placeholder="e.g. Thru Tubing Systems, Inc"><datalist id="pe-sups">${S.po.suppliers.map(s => `<option value="${esc(s.name)}"></option>`).join('')}</datalist></label>
        <label class="f">Address<span class="req" title="Required to issue">*</span><textarea name="supplier_address" rows="2">${esc(ro.supplier_address || '')}</textarea></label>
        <div class="row2"><label class="f">Phone<span class="req" title="Required to issue">*</span><span class="hint">Just the number: the PO already says Phone.</span><input type="tel" name="supplier_phone" value="${esc(ro.supplier_phone || '')}" placeholder="e.g. +1 713-433-2277"></label>
        <label class="f">Fax<span class="hint">Optional. Printed after the phone number as “Fax: …”.</span><input type="tel" name="supplier_fax" value="${esc(ro.supplier_fax || '')}"></label></div>
        <div class="row2"><label class="f">PAN<input type="text" name="pan" value="${esc(ro.pan || '')}"></label><label class="f">GSTIN<input type="text" name="gstin" value="${esc(ro.gstin || '')}"></label></div></div></section>
      <section class="panel"><header><h2>PO details</h2></header><div class="body">
        <div class="row4"><label class="f">P.O. date<input type="date" name="po_date" value="${esc(ro.po_date || '')}"></label>
          <label class="f">Delivery date<input type="date" name="delivery_date" value="${esc(ro.delivery_date || '')}"></label>
          <label class="f">Deliver to<select name="deliver_to">${opt('', 'Leave blank', ro.deliver_to || '')}${Object.entries(poSettings().offices || {}).map(([k, v]) => opt(k, v.label || k, ro.deliver_to)).join('')}</select></label>
          <label class="f">Supplier’s quote ref<input type="text" name="quote_ref" value="${esc(ro.quote_ref || '')}" placeholder="optional"></label></div>
        <div class="f">Currency<div class="seg" id="pe-cur">${Object.entries(PO_CUR).map(([c, v]) => `<button type="button" data-c="${c}" class="${ro.currency === c ? 'on' : ''}">${v.sym} ${c}</button>`).join('')}</div></div></div></section>
      <section class="panel"><header><h2>Lines</h2><span class="meta" id="pe-count"></span></header>
        <div class="body po-tools">
          <button type="button" class="btn small" id="pe-add">${ico('plus')}Add line</button>
          <button type="button" class="btn small" id="pe-head">${ico('plus')}Add heading</button>
          <button type="button" class="btn small" id="pe-pick">${ico('box')}Pick from Inventory</button>
          <span class="po-tools-sep"></span>
          <button type="button" class="btn small tagbtn" id="pe-quote">${ico('up')}Read a supplier quote</button>
          <button type="button" class="btn small" id="pe-paste">${ico('edit')}Paste from an AI chat</button></div>
        <div class="tablewrap"><table class="t poedit"><thead><tr><th class="c-no">S.No.</th><th class="c-part">Part No.</th><th>Item name</th><th class="c-hsn">HSN/SAC</th><th class="c-qty num">Qty</th><th class="c-uom">UOM</th><th class="c-rate num">Rate <span id="pe-curh"></span></th><th class="c-amt num">Amount</th><th class="c-x"></th></tr></thead><tbody id="pe-lines"></tbody></table></div>
        <div class="po-totals" id="pe-tot"></div></section>
      <section class="panel"><header><h2>GST tax summary</h2><span class="meta">Printed as you type it. Leave blank if it doesn’t apply.</span></header><div class="body">
        <div class="row4"><label class="f">HSN<input type="text" name="ts_hsn" value="${esc(ro.tax_summary.hsn || '')}"></label><label class="f">Taxable amount<input type="text" name="ts_taxable" inputmode="decimal" value="${esc(ro.tax_summary.taxable || '')}"></label>
        <label class="f">Rate<input type="text" name="ts_rate" value="${esc(ro.tax_summary.rate || '')}" placeholder="e.g. 7.5%"></label><label class="f">Total<input type="text" name="ts_total" inputmode="decimal" value="${esc(ro.tax_summary.total || '')}"></label></div></div></section>
      <section class="panel"><header><h2>Note and terms</h2></header><div class="body">
        <label class="f">Note<textarea name="note" rows="2" placeholder="optional">${esc(ro.note || '')}</textarea></label>
        <label class="f">Terms &amp; conditions<span class="hint">One term per line. Optional: if you leave it blank, the PO prints the heading with nothing after it.</span><textarea name="terms" rows="3" id="pe-terms">${esc(ro.terms || '')}</textarea></label>
        ${S.po.terms.length ? `<label class="f">Add a term you’ve used before<select id="pe-term"><option value="">Choose…</option>${S.po.terms.map(t => opt(t.id, t.body.length > 110 ? t.body.slice(0, 110) + '…' : t.body)).join('')}</select></label>` : ''}</div></section>
      <section class="panel"><header><h2>Supplier’s quote</h2><span class="meta">Kept with the PO</span></header><div class="body" id="pe-files"></div></section>
      <div class="po-actbar"><div>${ro.id && !ro.revising ? `<button type="button" class="btn small link danger" id="pe-del">Delete draft</button>` : ''}${ro.revising ? `<button type="button" class="btn small link danger" id="pe-discard">Discard revision</button>` : ''}<span class="sub" id="pe-saved">${ro.id ? 'Saved' : 'Not saved yet'}</span></div>
        <div class="actionrow"><button type="button" class="btn" id="pe-pdf">${ico('pdf')}Preview PDF</button><button type="button" class="btn" id="pe-save">Save draft</button>
        <button type="button" class="btn primary" id="pe-issue">${ico('sign')}${ro.revising ? `Sign &amp; issue R${ro.revision + 1}` : 'Sign &amp; issue'}</button></div></div>
      </form>`;
  },
  // read the form into the state
  read(main) {
    const f = $('#po-form', main), st = this.st, o = st.o;
    ['supplier_name', 'supplier_phone', 'supplier_fax', 'supplier_address', 'pan', 'gstin', 'po_date', 'delivery_date', 'deliver_to', 'quote_ref', 'note', 'terms'].forEach(k => { o[k] = f[k].value; });
    if (!o.revising) o.line_id = +f.line_id.value;
    o.sub_line_id = f.sub_line_id.value ? +f.sub_line_id.value : null;
    o.tax_summary = { hsn: f.ts_hsn.value.trim(), taxable: f.ts_taxable.value.trim(), rate: f.ts_rate.value.trim(), total: f.ts_total.value.trim() };
    const t = $('#pe-tax', main); o.tax_amount = t && t.value.trim() !== '' ? t.value.trim() : null;
  },
  payload() {
    const o = this.st.o;
    return { id: o.id || '', line_id: o.line_id, sub_line_id: o.sub_line_id || '', supplier_name: o.supplier_name, supplier_address: o.supplier_address, supplier_phone: o.supplier_phone, supplier_fax: o.supplier_fax,
      pan: o.pan, gstin: o.gstin, po_date: o.po_date, delivery_date: o.delivery_date, deliver_to: o.deliver_to || '', currency: o.currency, tax_amount: o.tax_amount ?? '',
      tax_summary: o.tax_summary, note: o.note, terms: o.terms, quote_ref: o.quote_ref, source: o.source || 'blank',
      supplier_id: (S.po.suppliers.find(s => s.name.trim().toLowerCase() === String(o.supplier_name || '').trim().toLowerCase()) || {}).id || '',
      lines: this.st.lines.filter(l => l.kind === 'heading' ? (l.description || '').trim() : ((l.description || '').trim() || (l.part_no || '').trim() || +l.qty || +l.rate))
        .map(l => ({ id: l.id || '', kind: l.kind || 'item', part_no: l.part_no || '', description: l.description || '', hsn: l.hsn || '', qty: l.kind === 'heading' ? 0 : (+l.qty || 0), uom: l.uom || '', rate: l.kind === 'heading' ? 0 : (+l.rate || 0), item_id: l.item_id || '' })) };
  },
  async save(main, quiet) {
    this.read(main);
    const id = await q(sb.rpc('po_save', { p: this.payload() }));
    const st = this.st; const wasNew = !st.o.id; st.o.id = id; st.dirty = false;
    try { localStorage.setItem('nest.po.last', JSON.stringify({ line_id: st.o.line_id, sub_line_id: st.o.sub_line_id, currency: st.o.currency })); } catch (e) { }
    // reload line ids (needed to keep received quantities on revisions)
    const fresh = await q(sb.from('po_order_lines').select('*').eq('po_id', id).order('sort').order('id'));
    st.lines = fresh.length ? fresh : [{ kind: 'item', qty: 1, uom: 'EA', rate: 0 }];
    if (wasNew) history.replaceState(null, '', `#/po/${id}/edit`);
    const s = $('#pe-saved', main); if (s) s.textContent = 'Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (!quiet) toast('Draft saved');
    this.drawLines(main); this.drawFiles(main);
    if (wasNew) { const b = $('.po-actbar > div', main); if (b && !$('#pe-del', main)) { b.insertAdjacentHTML('afterbegin', '<button type="button" class="btn small link danger" id="pe-del">Delete draft</button>'); $('#pe-del', main).onclick = () => this.del(); } }
    return id;
  },
  doc() {
    const o = this.st.o;
    return poDocFrom({ ...o, po_no_full: o.revising ? `${o.po_no}-R${o.revision + 1}` : null, lines: this.payload().lines, signature: { name: S.profile.full_name || S.profile.email, title: S.profile.job_title, signature_id: S.profile.signature_id } }, { draft: true });
  },
  drawSubs(main) {
    const o = this.st.o; const sel = $('#pe-sub', main);
    const subs = poSubs(o.line_id);
    sel.innerHTML = `<option value="">${subs.length ? 'Choose…' : 'None'}</option>` + subs.map(l => opt(l.id, l.name, o.sub_line_id)).join('');
  },
  drawLines(main) {
    const st = this.st; const tb = $('#pe-lines', main); const cur = st.o.currency;
    let h = 0, n = 0;
    tb.innerHTML = st.lines.map((l, i) => {
      if (l.kind === 'heading') { const letter = String.fromCharCode(65 + (h++ % 26));
        return `<tr class="pe-head" data-i="${i}"><td class="c-no"><span class="drag" draggable="true" title="Drag to move" aria-label="Drag to move">⋮⋮</span><b>${letter}</b></td><td colspan="7"><input type="text" data-k="description" value="${esc(l.description || '')}" placeholder="Section heading, e.g. 3-1/2 SCREEN-HANG-OFF & RBP ASSEMBLY"></td>
          <td class="c-x">${this.rowBtns(i, l)}</td></tr>`; }
      const it = l.item_id ? S.items.find(x => x.id === +l.item_id) : null;
      const rec = +l.received_qty || 0;
      return `<tr data-i="${i}"><td class="c-no"><span class="drag" draggable="true" title="Drag to move" aria-label="Drag to move">⋮⋮</span>${++n}</td>
        <td class="c-part"><input type="text" data-k="part_no" value="${esc(l.part_no || '')}" placeholder="optional"></td>
        <td><textarea data-k="description" rows="1" placeholder="Item name / description">${esc(l.description || '')}</textarea>
          ${it ? `<div class="pe-link">${tag(it.code)} <span class="sub">In Inventory: ${esc(it.name)}</span> <button type="button" class="btn small link" data-unlink="${i}">Unlink</button></div>` : ''}
          ${rec ? `<div class="sub">${fq(rec)} already received</div>` : ''}</td>
        <td class="c-hsn"><input type="text" data-k="hsn" value="${esc(l.hsn || '')}"></td>
        <td class="c-qty"><input type="text" inputmode="decimal" data-k="qty" class="num" value="${esc(l.qty ?? '')}"></td>
        <td class="c-uom"><input type="text" data-k="uom" value="${esc(l.uom || '')}" list="pe-uoms"></td>
        <td class="c-rate"><input type="text" inputmode="decimal" data-k="rate" class="num" value="${esc(l.rate ?? '')}"></td>
        <td class="c-amt num" data-amt="${i}">${poNum(poAmount(l))}</td><td class="c-x">${this.rowBtns(i, l)}</td></tr>`;
    }).join('') + `<datalist id="pe-uoms">${['EA', 'UNT', 'PCS', 'SET', 'KIT', 'LOT', 'JT', 'FT', 'M'].map(u => `<option value="${u}"></option>`).join('')}</datalist>`;
    $('#pe-curh', main).textContent = `(${cur})`;
    const items = st.lines.filter(l => l.kind !== 'heading').length;
    $('#pe-count', main).textContent = plural(items, 'line') + (st.lines.length > items ? ` · ${plural(st.lines.length - items, 'heading')}` : '');
    $$('textarea[data-k]', tb).forEach(autoGrow);
    $$('[data-k]', tb).forEach(inp => inp.oninput = () => {
      const i = +inp.closest('tr').dataset.i; const l = st.lines[i]; l[inp.dataset.k] = inp.value; st.dirty = true;
      if (inp.tagName === 'TEXTAREA') autoGrow(inp);
      if (['qty', 'rate'].includes(inp.dataset.k)) { const a = $(`[data-amt="${i}"]`, tb); if (a) a.textContent = poNum(poAmount(l)); this.drawTotals(main); }
    });
    $$('[data-up]', tb).forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [st.lines[i - 1], st.lines[i]] = [st.lines[i], st.lines[i - 1]]; st.dirty = true; this.drawLines(main); } });
    $$('[data-down]', tb).forEach(b => b.onclick = () => { const i = +b.dataset.down; if (i < st.lines.length - 1) { [st.lines[i + 1], st.lines[i]] = [st.lines[i], st.lines[i + 1]]; st.dirty = true; this.drawLines(main); } });
    $$('[data-rm]', tb).forEach(b => b.onclick = () => { const i = +b.dataset.rm; if (+st.lines[i].received_qty) return toast('This line has already been received, so it can’t be removed.', true); st.lines.splice(i, 1); if (!st.lines.length) st.lines.push({ kind: 'item', qty: 1, uom: 'EA', rate: 0 }); st.dirty = true; this.drawLines(main); });
    $$('[data-unlink]', tb).forEach(b => b.onclick = () => { st.lines[+b.dataset.unlink].item_id = null; st.dirty = true; this.drawLines(main); });
    // drag a line or heading by its handle
    let from = null;
    $$('.drag', tb).forEach(h => {
      h.ondragstart = e => { from = +h.closest('tr').dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(from)); h.closest('tr').classList.add('dragging'); };
      h.ondragend = () => { $$('tr', tb).forEach(r => r.classList.remove('dragging', 'drop-above', 'drop-below')); };
    });
    $$('tr[data-i]', tb).forEach(tr => {
      tr.ondragover = e => { if (from == null) return; e.preventDefault(); const r = tr.getBoundingClientRect(); const below = e.clientY > r.top + r.height / 2;
        $$('tr', tb).forEach(x => x.classList.remove('drop-above', 'drop-below')); tr.classList.add(below ? 'drop-below' : 'drop-above'); };
      tr.ondrop = e => { e.preventDefault(); if (from == null) return; const r = tr.getBoundingClientRect(); const below = e.clientY > r.top + r.height / 2;
        let to = +tr.dataset.i + (below ? 1 : 0); const [moved] = st.lines.splice(from, 1); if (from < to) to--; st.lines.splice(to, 0, moved); from = null; st.dirty = true; this.drawLines(main); };
    });
    this.drawTotals(main);
  },
  rowBtns(i, l) {
    return `<div class="pe-btns"><button type="button" class="iconbtn" data-up="${i}" title="Move up" aria-label="Move up">↑</button><button type="button" class="iconbtn" data-down="${i}" title="Move down" aria-label="Move down">↓</button><button type="button" class="rmbtn" data-rm="${i}" title="Remove this ${l.kind === 'heading' ? 'heading' : 'line'}">${ico('trash')}<span>Remove</span></button></div>`;
  },
  drawTotals(main) {
    const st = this.st, cur = st.o.currency, el = $('#pe-tot', main);
    const sub = Math.round(st.lines.filter(l => l.kind !== 'heading').reduce((a, l) => a + poAmount(l), 0) * 100) / 100;
    const taxIn = $('#pe-tax', main); const taxV = taxIn ? taxIn.value : (st.o.tax_amount ?? '');
    const total = Math.round((sub + (+taxV || 0)) * 100) / 100;
    if (!taxIn) {
      el.innerHTML = `<dl><dt>Sub total amount</dt><dd id="pe-sub-v"></dd><dt>Total tax amount<span class="hint">Type it if the supplier charges tax. Nest doesn’t work it out.</span></dt><dd><input type="text" inputmode="decimal" id="pe-tax" class="num" value="${esc(taxV ?? '')}" placeholder="0.00"></dd>
        <dt><b>Order amount</b></dt><dd id="pe-tot-v"></dd></dl><div class="po-words" id="pe-words"></div>`;
      $('#pe-tax', main).oninput = () => { st.dirty = true; this.drawTotals(main); };
    }
    $('#pe-sub-v', main).textContent = poMoney(sub, cur);
    $('#pe-tot-v', main).innerHTML = `<b>${poMoney(total, cur)}</b>`;
    $('#pe-words', main).textContent = poWords(total, cur);
  },
  drawFiles(main) {
    const st = this.st; const el = $('#pe-files', main); if (!el) return;
    el.innerHTML = `${st.files.length ? `<ul class="list po-files">${st.files.map(f => `<li><div class="pf-name">${ico('pdf')}<a href="#" data-dl="${f.id}">${esc(f.name)}</a> <span class="sub">${fbytes(f.size)} · ${esc(f.added_by_name || '')} · ${fdt(f.added_at)}</span></div><button type="button" class="btn small link danger" data-rmf="${f.id}">Remove</button></li>`).join('')}</ul>` : '<div class="muted">No quote attached. <b>Read a supplier quote</b> attaches it for you, or attach one here.</div>'}
      <label class="btn small mt filebtn">${ico('up')}Attach files<input type="file" id="pe-file" multiple accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.doc,.docx" hidden></label>`;
    $$('[data-dl]', el).forEach(a => a.onclick = e => { e.preventDefault(); poDownloadFile(+a.dataset.dl); });
    $$('[data-rmf]', el).forEach(b => b.onclick = async () => { if (!confirm('Remove this file from the PO?')) return; try { await q(sb.rpc('po_remove_file', { p_id: +b.dataset.rmf })); st.files = st.files.filter(f => f.id !== +b.dataset.rmf); this.drawFiles(main); } catch (e) { toast(niceError(e), true); } });
    $('#pe-file', el).onchange = async e => { for (const f of [...e.target.files]) { try { await this.attach(main, f, 'quote'); } catch (ex) { toast(niceError(ex), true); } } e.target.value = ''; };
  },
  async attach(main, file, kind) {
    if (file.size > 8 * 1024 * 1024) throw new Error('That file is too big (the limit is 8 MB).');
    if (!this.st.o.id) await this.save(main, true);
    const data = await fileB64(file);
    const id = await q(sb.rpc('po_add_file', { p_po: this.st.o.id, p_kind: kind, p_name: file.name, p_mime: file.type || '', p_data: data }));
    this.st.files.push({ id, kind, name: file.name, size: file.size, added_by_name: S.profile.full_name, added_at: new Date().toISOString() });
    this.drawFiles(main); toast('Attached ' + file.name);
  },
  addLines(main, rows) {
    const st = this.st;
    const blank = l => l.kind !== 'heading' && !(l.description || '').trim() && !(l.part_no || '').trim() && !+l.rate && !l.item_id;
    st.lines = st.lines.filter(l => !blank(l)).concat(rows.map(r => ({ kind: r.kind || 'item', part_no: r.part_no || '', description: r.description || '', hsn: r.hsn || '', qty: r.qty ?? 1, uom: r.uom || 'EA', rate: r.rate ?? 0, item_id: r.item_id || null })));
    st.dirty = true; this.drawLines(main);
  },
  fillSupplier(main, s, force) {
    const f = $('#po-form', main);
    const set = (k, v) => { if (v && (force || !f[k].value.trim())) f[k].value = v; };
    set('supplier_name', s.name); set('supplier_address', s.address); set('supplier_phone', s.phone); set('supplier_fax', s.fax); set('pan', s.pan); set('gstin', s.gstin);
    if (s.quote_ref) { const cur = f.quote_ref.value.split(',').map(x => x.trim()).filter(Boolean); [].concat(s.quote_ref).forEach(r => { if (r && !cur.includes(r)) cur.push(r); }); f.quote_ref.value = cur.join(', '); }
    this.read(main);
    if (s.currency && PO_CUR[s.currency] && s.currency !== this.st.o.currency) { this.st.o.currency = s.currency; $$('#pe-cur button', main).forEach(x => x.classList.toggle('on', x.dataset.c === s.currency)); this.drawLines(main); }
  },
  missing(main) {
    const o = this.st.o; const out = [];
    if (!o.line_id) out.push('service line');
    if (!o.sub_line_id && poSubs(o.line_id).length) out.push('sub service line');
    if (!String(o.supplier_name || '').trim()) out.push('supplier name');
    if (!String(o.supplier_address || '').trim()) out.push('address');
    if (!String(o.supplier_phone || '').trim()) out.push('phone');
    const f = $('#po-form', main);
    [['line_id', !o.line_id], ['sub_line_id', !o.sub_line_id && poSubs(o.line_id).length], ['supplier_name', !String(o.supplier_name || '').trim()], ['supplier_address', !String(o.supplier_address || '').trim()], ['supplier_phone', !String(o.supplier_phone || '').trim()]]
      .forEach(([k, bad]) => f[k]?.classList.toggle('invalid', !!bad));
    return out;
  },
  async del() {
    if (!confirm('Delete this draft? It was never issued, so no PO number is lost.')) return;
    try { await q(sb.rpc('po_delete_draft', { p_id: this.st.o.id })); this.st.dirty = false; toast('Draft deleted'); go('#/po'); } catch (e) { toast(niceError(e), true); }
  },
  bind(main) {
    if (!this.st) return;
    const st = this.st, f = $('#po-form', main);
    this.drawSubs(main); this.drawLines(main); this.drawFiles(main);
    f.onsubmit = e => e.preventDefault();
    f.addEventListener('input', e => { if (!e.target.closest('#pe-lines')) { st.dirty = true; this.read(main); } });
    f.addEventListener('change', e => { if (!e.target.closest('#pe-lines')) this.read(main); });
    $('#pe-line', main).onchange = e => { st.o.line_id = +e.target.value; st.o.sub_line_id = null; this.drawSubs(main); st.dirty = true; };
    $('#pe-sub', main).onchange = e => { st.o.sub_line_id = e.target.value ? +e.target.value : null; st.dirty = true; };
    f.supplier_name.onchange = () => { const s = S.po.suppliers.find(x => x.name.trim().toLowerCase() === f.supplier_name.value.trim().toLowerCase()); if (s) this.fillSupplier(main, s, true); };
    $$('#pe-cur button', main).forEach(b => b.onclick = () => { st.o.currency = b.dataset.c; $$('#pe-cur button', main).forEach(x => x.classList.toggle('on', x === b)); st.dirty = true; this.drawLines(main); });
    const tsel = $('#pe-term', main); if (tsel) tsel.onchange = () => { const t = S.po.terms.find(x => x.id === +tsel.value); if (t) { const ta = $('#pe-terms', main); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + t.body; st.dirty = true; } tsel.value = ''; };
    $('#pe-add', main).onclick = () => { st.lines.push({ kind: 'item', qty: 1, uom: 'EA', rate: 0 }); st.dirty = true; this.drawLines(main); $$('#pe-lines tr', main).pop()?.querySelector('[data-k=description]')?.focus(); };
    $('#pe-head', main).onclick = () => { st.lines.push({ kind: 'heading', description: '' }); st.dirty = true; this.drawLines(main); $$('#pe-lines tr', main).pop()?.querySelector('input')?.focus(); };
    $('#pe-pick', main).onclick = () => poPickItems(rows => this.addLines(main, rows));
    $('#pe-quote', main).onclick = () => poReadQuote(this, main);
    $('#pe-paste', main).onclick = () => poPasteAI(this, main);
    $('#pe-save', main).onclick = async e => { e.target.disabled = true; try { await this.save(main); } catch (ex) { toast(niceError(ex), true); } e.target.disabled = false; };
    $('#pe-pdf', main).onclick = async () => { this.read(main); try { await poPdf(this.doc()); } catch (ex) { console.error(ex); toast(niceError(ex), true); } };
    const del = $('#pe-del', main); if (del) del.onclick = () => this.del();
    const disc = $('#pe-discard', main); if (disc) disc.onclick = async () => {
      if (!confirm('Discard this revision? The PO goes back to exactly what was issued.')) return;
      try { await q(sb.rpc('po_discard_revision', { p_id: st.o.id })); st.dirty = false; toast('Revision discarded'); go('#/po/' + st.o.id); } catch (ex) { toast(niceError(ex), true); }
    };
    $('#pe-issue', main).onclick = async () => {
      this.read(main);
      const miss = this.missing(main); if (miss.length) { toast('Fill in before issuing: ' + miss.join(', '), true); return; }
      try { await this.save(main, true); } catch (ex) { return toast(niceError(ex), true); }
      const o = st.o; const doc = this.doc(); const rev = o.revising;
      const changes = rev ? await poRevisionChanges(o, this.payload()) : null;
      const nextNo = (setting('po_counter', {}) || {}).next;
      const no = rev ? `${o.po_no}-R${o.revision + 1}` : `GES-${poLineCode(o.line_id)}-PO-${nextNo || '…'}-${String(o.po_date || localISO(0)).slice(0, 4)}`;
      const ok = await modal({ title: rev ? `Sign & issue ${no}` : 'Sign & issue this purchase order', submit: rev ? `Sign & issue R${o.revision + 1}` : 'Sign & issue',
        sub: rev ? 'The earlier version is kept and marked Superseded.' : 'Once it’s issued, the PO number is fixed and the PO can only be revised or cancelled, not deleted.',
        body: `<dl class="kv"><dt>PO number</dt><dd><b>${esc(no)}</b>${rev ? '' : '<span class="sub"> (given when you sign)</span>'}</dd><dt>Supplier</dt><dd>${esc(o.supplier_name || '—')}</dd>
          <dt>Service line</dt><dd>${esc(poLineLabel(o))}</dd><dt>Lines</dt><dd>${plural(doc.lines.filter(l => l.kind !== 'heading').length, 'line')}</dd><dt>Order amount</dt><dd><b>${poMoney(doc.total, o.currency)}</b></dd>
          <dt>Signed by</dt><dd>${esc(S.profile.full_name || S.profile.email)}${S.profile.job_title ? ' · ' + esc(S.profile.job_title) : ''}${S.profile.signature_id ? '' : ' <span class="sub">(name only: no signature added)</span>'}</dd></dl>
          ${rev ? `<div class="pjf-sec">What changed</div>${changes.length ? `<ul class="changes">${changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="muted">Nothing in the lines or totals changed.</p>'}
            <label class="f">Reason for the revision<span class="hint">For example: “Supplier’s revised quote” or “Added redress kits”. The list of changes above is added for you and goes to the people who need to know.</span><textarea name="reason" rows="2" required></textarea></label>` : ''}
          ${!doc.lines.some(l => l.kind !== 'heading') ? '<div class="notice bad">Add at least one line first.</div>' : ''}`,
        onSubmit: async x => {
          if (rev && !(x.reason || '').trim()) throw new Error('Say what changed in this revision.');
          const n = await q(sb.rpc('po_issue', { p_id: o.id, p_reason: x.reason || null, p_changes: changes }));
          return n;
        } });
      if (!ok) return;
      st.dirty = false; await loadLookups(); S.po.at = 0;
      toast(`Issued ${ok}`); go('#/po/' + o.id + '?issued=1');
    };
    this.active = true;
  }
};
// leaving the PO sheet with unsaved changes: save the draft quietly so nothing typed is lost
window.addEventListener('beforeunload', e => { if (poEditor.active && poEditor.st?.dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', () => {
  if (!poEditor.active) return;
  poEditor.active = false;
  const st = poEditor.st; if (!st?.dirty) return;
  const p = poEditor.payload(); if (!p.supplier_name && !p.lines.length) return;
  st.dirty = false;
  sb.rpc('po_save', { p }).then(({ data, error }) => { if (error) toast('Your PO changes couldn’t be saved: ' + niceError(error), true); else { st.o.id = data; toast('Your draft PO was saved'); } });
});
function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(220, t.scrollHeight + 2) + 'px'; }
const fbytes = n => n == null ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function fileB64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(file); }); }
async function poDownloadFile(id) {
  try {
    const f = await q(sb.from('po_files').select('name,mime,data').eq('id', id).single());
    const bin = atob(f.data); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    saveBlob(new Blob([u], { type: f.mime || 'application/octet-stream' }), f.name);
  } catch (e) { toast(niceError(e), true); }
}

// ---------------------------------------------------------------- pick lines from Inventory
async function poPickItems(cb) {
  const picked = new Map(); const inv = appAllowed('inventory');
  let prices = {};
  if (inv && canSeePrices()) { try { prices = Object.fromEntries((await q(sb.from('item_prices').select('item_id,unit_price,currency'))).map(p => [p.item_id, p])); } catch (e) { } }
  if (inv) await items();
  return modal({
    title: 'Pick from Inventory', wide: true, submit: 'Add to the PO',
    sub: 'Search by code or description and tick the items. Their part number, name and unit fill in, and the item shows On order once the PO is issued.',
    body: `<input type="search" id="pk-q" placeholder="Search Inventory by code or description" autocomplete="off"><div id="pk-res" class="pickres pk-res"></div><h3 class="grp">Picked</h3><div id="pk-sel"><div class="muted">Nothing picked yet.</div></div>`,
    onOpen: d => {
      let its = inv ? S.items.filter(i => i.active) : [];
      const drawSel = () => {
        $('#pk-sel', d).innerHTML = picked.size ? `<ul class="list">${[...picked.values()].map(i => `<li><div style="flex:1">${tag(i.code)} ${esc(i.name)} <span class="sub">${esc(i.line || lineShort(i.department_id))}</span></div><button type="button" class="btn small link danger" data-x2="${i.id}">Remove</button></li>`).join('')}</ul>` : '<div class="muted">Nothing picked yet.</div>';
        $$('[data-x2]', d).forEach(b => b.onclick = () => { picked.delete(+b.dataset.x2); drawSel(); drawRes(); });
      };
      const qi = $('#pk-q', d), res = $('#pk-res', d);
      const drawRes = async () => {
        const t = qi.value.trim().toLowerCase(); if (!t) { res.innerHTML = ''; return; }
        // people without the Inventory app search through the PO app: code, name and unit only
        if (!inv) { try { its = await q(sb.rpc('po_item_search', { p_q: t })); } catch (e) { its = []; } }
        const hits = (inv ? its.filter(i => `${i.code || ''} ${i.name}`.toLowerCase().includes(t)) : its).slice(0, 30);
        res.innerHTML = hits.length ? hits.map(i => `<button type="button" class="pick ${picked.has(i.id) ? 'on' : ''}" data-id="${i.id}">${tag(i.code)} <span>${esc(i.name)}</span><span class="sub">${esc(i.line || lineShort(i.department_id))}${inv ? ` · ${fq(i.qty_available)} in store` : ''}${prices[i.id] ? ' · ' + poMoney(prices[i.id].unit_price, prices[i.id].currency) : ''}</span></button>`).join('') : '<div class="empty">No match.</div>';
        $$('[data-id]', res).forEach(b => b.onclick = () => { const i = its.find(x => x.id === +b.dataset.id); picked.has(i.id) ? picked.delete(i.id) : picked.set(i.id, i); drawSel(); drawRes(); });
      };
      qi.oninput = debounce(drawRes, 200);
    },
    onSubmit: async () => {
      if (!picked.size) throw new Error('Tick at least one item.');
      cb([...picked.values()].map(i => ({ part_no: i.code || '', description: i.name, uom: (i.unit || 'EA').toUpperCase() === 'PCS' ? 'EA' : (i.unit || 'EA').toUpperCase(), qty: 1, rate: prices[i.id] ? +prices[i.id].unit_price : 0, item_id: i.id })));
    }
  });
}

// ---------------------------------------------------------------- read a supplier quote (Excel, CSV or a PDF with selectable text)
const PO_NUM_RE = /^[-(]?\s*(?:[$£€₦]|USD|NGN|GBP|EUR)?\s*[\d,]*\.?\d+\s*\)?$/i;
const poParseNum = s => { const t = String(s ?? '').replace(/[$£€₦,\s]|USD|NGN|GBP|EUR/gi, '').replace(/^\((.*)\)$/, '-$1'); return t === '' || isNaN(+t) ? null : +t; };
const PO_UOMS = /^(ea|each|pcs?|pc|unt|unit|units|set|sets|kit|kits|lot|jt|jts|joint|joints|ft|m|nos?|no\.|pair|box|roll|lt|l|kg)$/i;
// one row of cells → a PO line, if qty × rate ≈ amount somewhere in it
function poRowToLine(cells) {
  cells = cells.map(c => String(c ?? '').replace(/\s+/g, ' ').trim()).filter(c => c !== '');
  if (cells.length < 3) return null;
  const nums = cells.map((c, i) => ({ i, v: PO_NUM_RE.test(c) ? poParseNum(c) : null })).filter(x => x.v != null);
  if (nums.length < 2) return null;
  const amt = nums[nums.length - 1];
  let pair = null;
  for (let a = nums.length - 2; a >= 0 && !pair; a--) for (let b = a - 1; b >= 0 && !pair; b--) {
    const x = nums[a].v, y = nums[b].v;
    if (x * y > 0 && Math.abs(x * y - amt.v) <= Math.max(0.011, Math.abs(amt.v) * 0.005)) pair = x >= y && Number.isInteger(y) ? { qty: y, rate: x, qi: nums[b].i, ri: nums[a].i } : Number.isInteger(x) && x < y ? { qty: x, rate: y, qi: nums[a].i, ri: nums[b].i } : { qty: y, rate: x, qi: nums[b].i, ri: nums[a].i };
  }
  if (!pair) {
    // no amount column: qty then unit price (only when the price looks like money)
    if (nums.length >= 2 && Number.isInteger(nums[nums.length - 2].v) && nums[nums.length - 2].v > 0 && nums[nums.length - 2].v < 10000 && String(cells[amt.i]).includes('.')) pair = { qty: nums[nums.length - 2].v, rate: amt.v, qi: nums[nums.length - 2].i, ri: amt.i };
    else return null;
  }
  const used = new Set([pair.qi, pair.ri, amt.i]);
  const text = cells.map((c, i) => ({ c, i })).filter(x => !used.has(x.i) && !(PO_NUM_RE.test(x.c) && x.i < pair.qi && poParseNum(x.c) < 1000 && x.c.length <= 4 && x.i === 0));
  let uom = ''; const uIdx = text.findIndex(x => PO_UOMS.test(x.c)); if (uIdx >= 0) { uom = text[uIdx].c.toUpperCase(); text.splice(uIdx, 1); }
  let part = ''; const pIdx = text.findIndex(x => /^[A-Z0-9][A-Z0-9._/-]{3,29}$/i.test(x.c) && /\d/.test(x.c) && (/[-/]/.test(x.c) || /[A-Z]/i.test(x.c)) && !/\s/.test(x.c));
  const descParts = text.filter((x, k) => k !== pIdx && !(PO_NUM_RE.test(x.c) && x.c.length <= 3));
  if (pIdx >= 0 && descParts.length) part = text[pIdx].c;
  const description = (descParts.length ? descParts : text).map(x => x.c).join(' ').replace(/^\d{1,3}[.)]?\s+/, '').trim();
  if (!description || /^(sub\s*total|total|grand total|tax|vat|freight|shipping)\b/i.test(description) && !part) return null;
  return { part_no: part, description, qty: pair.qty, uom: uom === 'EACH' ? 'EA' : uom || 'EA', rate: pair.rate, amount: amt.v };
}
function poQuoteMeta(textLines) {
  const all = textLines.join('\n'); const meta = {};
  const ref = all.match(/\b(?:quote|quotation|qtn|proposal)\s*(?:no\.?|number|#|ref\.?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9/._-]{2,})/i); if (ref) meta.quote_ref = ref[1];
  const cur = all.match(/\b(USD|NGN|GBP|EUR)\b/) || (/₦/.test(all) ? ['', 'NGN'] : /£/.test(all) ? ['', 'GBP'] : /€/.test(all) ? ['', 'EUR'] : /\$/.test(all) ? ['', 'USD'] : null); if (cur) meta.currency = cur[1];
  const tots = textLines.filter(l => /\b(grand\s+total|total\s+(amount|price|usd|due|value)|quote\s+total|order\s+amount|total)\b/i.test(l) && !/sub\s*-?\s*total|tax|vat|in words/i.test(l)).map(l => { const m = l.match(/([$£€₦]?\s*[\d,]+\.\d{2})\s*$/); return m ? poParseNum(m[1]) : null; }).filter(v => v != null);
  if (tots.length) meta.total = Math.max(...tots);
  return meta;
}
async function poReadFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase(); const rows = []; const textLines = [];
  if (['xlsx', 'xlsm'].includes(ext)) {
    await loadScript('vendor/exceljs.min.js');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    wb.eachSheet(ws => ws.eachRow({ includeEmpty: false }, r => {
      const cells = []; r.eachCell({ includeEmpty: true }, c => { if (c.isMerged && c.master && c.master !== c) return; let v = c.value; if (v && typeof v === 'object') v = v.result ?? v.text ?? (v.richText ? v.richText.map(t => t.text).join('') : ''); cells.push(v instanceof Date ? v.toISOString().slice(0, 10) : v ?? ''); });
      rows.push(cells); textLines.push(cells.filter(c => c !== '').join(' '));
    }));
  } else if (['csv', 'txt', 'tsv'].includes(ext)) {
    const t = await file.text();
    t.split(/\r?\n/).forEach(l => { const cells = l.includes('\t') ? l.split('\t') : l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/^"|"$/g, '')); rows.push(cells); textLines.push(l); });
  } else if (ext === 'pdf') {
    await loadScript('vendor/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    for (let p = 1; p <= Math.min(pdf.numPages, 15); p++) {
      const page = await pdf.getPage(p); const tc = await page.getTextContent();
      const its = tc.items.filter(i => i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
      its.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      its.forEach(i => { const l = lines.find(l => Math.abs(l.y - i.y) < 3); if (l) l.items.push(i); else lines.push({ y: i.y, items: [i] }); });
      lines.forEach(l => {
        l.items.sort((a, b) => a.x - b.x); const cells = []; let cur = null;
        l.items.forEach(i => { if (cur && i.x - (cur.x + cur.w) < 4.5) { cur.s += (i.x - (cur.x + cur.w) > 1 ? ' ' : '') + i.s; cur.w = i.x + i.w - cur.x; } else { cur = { ...i }; cells.push(cur); } });
        rows.push(cells.map(c => c.s.trim())); textLines.push(cells.map(c => c.s.trim()).join(' '));
      });
    }
    if (!textLines.join('').trim()) throw new Error('This PDF is a scan or picture, so Nest can’t read its text. Use “Paste from an AI chat” instead: free AI chats can read scanned quotes.');
  } else throw new Error('Nest can read Excel (.xlsx), CSV and PDF quotes. For a photo or a scanned PDF, use “Paste from an AI chat”.');
  const lines = rows.map(poRowToLine).filter(Boolean);
  return { lines, meta: poQuoteMeta(textLines), text: textLines };
}
function poPreviewLines(lines, meta, cur, fi) {
  const key = i => fi == null ? String(i) : `${fi}-${i}`;
  const sum = Math.round(lines.reduce((a, l) => a + (+l.qty || 0) * (+l.rate || 0), 0) * 100) / 100;
  const check = meta.total != null ? (Math.abs(meta.total - sum) < 0.02 ? `<div class="notice ok">✔ The lines add up to <b>${poMoney(sum, cur)}</b>, the same as the quote’s total.</div>`
    : `<div class="notice">The lines add up to <b>${poMoney(sum, cur)}</b>, but the quote’s total looks like <b>${poMoney(meta.total, cur)}</b>. Some lines may be missing or include tax or freight. Check against the quote after adding them.</div>`) : '';
  return `${check}<div class="tablewrap pk-prev"><table class="t"><thead><tr><th><input type="checkbox" class="qp-all" data-fi="${fi ?? ''}" checked aria-label="All"></th><th>Part No.</th><th>Item name</th><th class="num">Qty</th><th>UOM</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
    ${lines.map((l, i) => l.kind === 'heading' ? `<tr><td><input type="checkbox" data-qp="${key(i)}" checked></td><td colspan="6"><b>${esc(l.description)}</b> <span class="sub">heading</span></td></tr>`
      : `<tr><td><input type="checkbox" data-qp="${key(i)}" checked></td><td class="nowrap">${esc(l.part_no || '')}</td><td>${esc(l.description)}</td><td class="num">${fq(l.qty)}</td><td>${esc(l.uom || '')}</td><td class="num">${poNum(l.rate)}</td><td class="num">${poNum((+l.qty || 0) * (+l.rate || 0))}</td></tr>`).join('')}</tbody></table></div>`;
}
function poBindPreview(d) {
  $$('.qp-all', d).forEach(all => all.onchange = () => $$('[data-qp]', all.closest('table')).forEach(c => { c.checked = all.checked; }));
}
async function poReadQuote(ed, main) {
  let found = [];
  return modal({
    title: 'Read supplier quotes', wide: true, submit: 'Add these lines',
    sub: 'Choose one or more quotes: Excel files, or PDFs where you can select the text. Nest finds the lines and checks them against each quote’s total. All the lines go on this PO, and every quote is attached to it. You can change anything after adding them.',
    body: `<label class="f">Quote files<span class="hint">You can pick several at once (up to 20, 8 MB each).</span><input type="file" id="qr-file" multiple accept=".pdf,.xlsx,.xlsm,.csv,.txt"></label>
      <label class="check"><input type="checkbox" id="qr-head"> Put each quote’s lines under its own heading (for example “Quote 092624-01JH”)</label><div id="qr-out"></div>`,
    onOpen: d => {
      $('#qr-file', d).onchange = async e => {
        const files = [...e.target.files].slice(0, 20); if (!files.length) return; const out = $('#qr-out', d);
        out.innerHTML = '<div class="loading">Reading the quotes…</div>'; found = [];
        for (const file of files) {
          try { if (file.size > 8 * 1024 * 1024) throw new Error('Too big (the limit is 8 MB).'); const r = await poReadFile(file); found.push({ file, ...r }); }
          catch (ex) { found.push({ file, lines: [], meta: {}, error: niceError(ex) }); }
        }
        let k = 0;
        out.innerHTML = found.map((f, fi) => `<div class="qr-file"><div class="qr-head">${ico('pdf')}<b>${esc(f.file.name)}</b>${f.meta.quote_ref ? ` <span class="sub">· quote ${esc(f.meta.quote_ref)}</span>` : ''}${f.meta.currency ? ` <span class="sub">· ${esc(f.meta.currency)}</span>` : ''}</div>
          ${f.error ? `<div class="notice bad">${esc(f.error)}</div>` : f.lines.length ? poPreviewLines(f.lines, f.meta, f.meta.currency || ed.st.o.currency, fi)
            : '<div class="notice">No item lines with a quantity and price found in this file. Try <b>Paste from an AI chat</b> for it: that works with any layout, including scans.</div>'}
          <label class="f qr-ref">Quote number<input type="text" data-qref="${fi}" value="${esc(f.meta.quote_ref || '')}" placeholder="e.g. 092624-01JH"></label></div>`).join('');
        poBindPreview(d);
      };
    },
    onSubmit: async (x, d) => {
      if (!found.length) throw new Error('Choose at least one quote first.');
      const head = $('#qr-head', d).checked; const add = []; const refs = [];
      found.forEach((f, fi) => {
        const ref = ($(`[data-qref="${fi}"]`, d)?.value || '').trim(); if (ref) refs.push(ref);
        const keep = f.lines.filter((l, i) => $(`[data-qp="${fi}-${i}"]`, d)?.checked);
        if (keep.length && head) add.push({ kind: 'heading', description: ref ? `Quote ${ref}` : f.file.name.replace(/\.[^.]+$/, '') });
        add.push(...keep);
      });
      if (!add.some(l => l.kind !== 'heading')) throw new Error('Tick at least one line.');
      ed.addLines(main, add); ed.fillSupplier(main, { quote_ref: refs, currency: found.find(f => f.meta.currency)?.meta.currency });
      if (ed.st.o.source === 'blank') ed.st.o.source = 'quote';
      for (const f of found) { try { await ed.attach(main, f.file, 'quote'); } catch (e) { toast(`${f.file.name} couldn’t be attached: ${niceError(e)}`, true); } }
      toast(`Added ${plural(add.filter(l => l.kind !== 'heading').length, 'line')} from ${plural(found.length, 'quote')}: check them against the quotes`);
    }
  });
}

// ---------------------------------------------------------------- paste from a free AI chat
const PO_AI_PROMPT = `Read the attached supplier quote and reply with only the text below, filled in. No other words.

Supplier: <company name>
Address: <full address>
Phone: <phone number only>
Fax: <fax number, or leave empty>
Quote ref: <quote number>
Currency: <USD, NGN, GBP or EUR>

Part No | Description | Qty | UOM | Unit Price
<one row per item, columns separated by |>

Rules: plain numbers only (no currency symbols or commas). Leave Part No empty if there isn't one. If the quote groups items under section headings, add a row with HEADING as the Part No and the heading as the Description. Don't include totals, tax or freight rows unless they are charged items.`;
function poParseAI(text) {
  const meta = {}; const lines = [];
  text.split(/\r?\n/).forEach(raw => {
    const l = raw.replace(/^\s*[*-]\s+/, '').trim(); if (!l) return;
    const kv = l.match(/^\**\s*(supplier|address|phone|fax|quote ref|quote|currency)\s*\**\s*:\s*(.*)$/i);
    if (kv && !l.includes('|')) { const k = kv[1].toLowerCase(); const v = kv[2].replace(/\*+/g, '').trim(); if (!v || /^<.*>$/.test(v)) return;
      if (k === 'supplier') meta.name = v; else if (k === 'address') meta.address = v; else if (k === 'phone') { const m = v.match(/^(.*?)\s*fax\s*:?\s*(.*)$/i); if (m) { meta.phone = m[1].replace(/[;,·]+$/, '').trim(); meta.fax = m[2].trim(); } else meta.phone = v; } else if (k === 'fax') meta.fax = v; else if (k.startsWith('quote')) meta.quote_ref = v; else if (k === 'currency') meta.currency = (v.match(/USD|NGN|GBP|EUR/i) || [''])[0].toUpperCase(); return; }
    const cells = (l.includes('|') ? l.replace(/^\|/, '').replace(/\|$/, '').split('|') : l.split('\t')).map(c => c.replace(/\*+/g, '').trim());
    if (cells.length < 4) return;
    if (cells.every(c => /^:?-{2,}:?$/.test(c) || c === '')) return;
    if (/^part/i.test(cells[0]) && /desc/i.test(cells[1] || '')) return;
    if (/^heading$/i.test(cells[0])) { if (cells[1]) lines.push({ kind: 'heading', description: cells[1] }); return; }
    const [part, desc, qty, uom, rate] = cells;
    const qn = poParseNum(qty), rn = poParseNum(rate);
    if (!desc && !part) return;
    if (qn == null && rn == null) return;
    lines.push({ part_no: part || '', description: desc || part, qty: qn ?? 1, uom: (uom || 'EA').toUpperCase(), rate: rn ?? 0 });
  });
  return { lines, meta };
}
async function poPasteAI(ed, main) {
  let parsed = null;
  return modal({
    title: 'Paste from an AI chat', wide: true, submit: 'Add these lines',
    sub: 'Free and works with any quote, including scans and photos. Nothing is sent from Nest: you use the AI chat yourself.',
    body: `<ol class="steps"><li>Open a free AI chat (for example Claude at claude.ai, ChatGPT or Gemini) and attach the supplier’s quote.</li>
      <li>Copy this instruction, paste it into the chat and send it.</li></ol>
      <div class="aiprompt"><pre id="ai-p">${esc(PO_AI_PROMPT)}</pre><button type="button" class="btn small tagbtn" id="ai-copy">Copy instruction</button></div>
      <ol class="steps" start="3"><li>Copy the chat’s whole reply and paste it here.</li></ol>
      <label class="f"><textarea id="ai-in" rows="7" placeholder="Paste the reply here"></textarea></label><div id="ai-out"></div>`,
    onOpen: d => {
      $('#ai-copy', d).onclick = async () => { try { await navigator.clipboard.writeText(PO_AI_PROMPT); toast('Instruction copied'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('#ai-p', d)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Press Ctrl+C to copy'); } };
      $('#ai-in', d).oninput = debounce(() => {
        parsed = poParseAI($('#ai-in', d).value); const out = $('#ai-out', d); const m = parsed.meta;
        out.innerHTML = parsed.lines.length ? `<p>Found <b>${plural(parsed.lines.filter(l => l.kind !== 'heading').length, 'line')}</b>${m.name ? ` from <b>${esc(m.name)}</b>` : ''}${m.quote_ref ? ` · quote ref <b>${esc(m.quote_ref)}</b>` : ''}${m.currency ? ` · ${esc(m.currency)}` : ''}.</p>` + poPreviewLines(parsed.lines, {}, m.currency || ed.st.o.currency)
          + (m.name ? `<label class="check"><input type="checkbox" id="ai-sup" checked> Fill in the supplier’s name, address and phone from the quote</label>` : '')
          : ($('#ai-in', d).value.trim() ? '<div class="notice">No lines found yet. Paste the whole reply, including the table.</div>' : '');
        poBindPreview(d);
      }, 200);
    },
    onSubmit: async (x, d) => {
      if (!parsed || !parsed.lines.length) throw new Error('Paste the AI chat’s reply first.');
      const keep = parsed.lines.filter((l, i) => $(`[data-qp="${i}"]`, d)?.checked);
      if (!keep.length) throw new Error('Tick at least one line.');
      ed.addLines(main, keep);
      ed.fillSupplier(main, { ...(($('#ai-sup', d)?.checked) ? { name: parsed.meta.name, address: parsed.meta.address, phone: parsed.meta.phone, fax: parsed.meta.fax } : {}), quote_ref: parsed.meta.quote_ref, currency: parsed.meta.currency }, !!$('#ai-sup', d)?.checked);
      if (ed.st.o.source === 'blank') ed.st.o.source = 'quote';
      toast(`Added ${plural(keep.length, 'line')}: check them against the quote`);
    }
  });
}

// ---------------------------------------------------------------- what changed between two versions (lines matched by part number, else by name)
function poDiff(a, b, cur) {
  const key = l => (String(l.part_no || '').trim().toLowerCase() || String(l.description || '').trim().toLowerCase().slice(0, 80));
  const name = l => [l.part_no, l.description].filter(Boolean).join(' · ').slice(0, 90) || 'a line';
  const items = arr => (arr || []).filter(l => (l.kind || 'item') !== 'heading');
  const A = new Map(items(a.lines).map(l => [key(l), l])), B = new Map(items(b.lines).map(l => [key(l), l]));
  const out = [];
  for (const [k, l] of B) {
    const o = A.get(k);
    if (!o) { out.push(`Added ${name(l)} (${fq(l.qty)} × ${poNum(l.rate)})`); continue; }
    if (+o.qty !== +l.qty) out.push(`${name(l)}: quantity ${fq(o.qty)} → ${fq(l.qty)}`);
    if (+o.rate !== +l.rate) out.push(`${name(l)}: rate ${poNum(o.rate)} → ${poNum(l.rate)}`);
    if ((o.uom || '') !== (l.uom || '')) out.push(`${name(l)}: unit ${o.uom || '—'} → ${l.uom || '—'}`);
  }
  for (const [k, l] of A) if (!B.has(k)) out.push(`Removed ${name(l)}`);
  const tot = x => Math.round(items(x.lines).reduce((s2, l) => s2 + poAmount(l), 0) * 100) / 100 + (+x.tax_amount || 0);
  if ((+a.tax_amount || 0) !== (+b.tax_amount || 0)) out.push(`Tax ${poNum(a.tax_amount || 0)} → ${poNum(b.tax_amount || 0)}`);
  const ta = tot(a), tb = tot(b); if (ta !== tb) out.push(`Order amount ${poMoney(ta, cur)} → ${poMoney(tb, cur)}`);
  if ((a.currency || 'USD') !== (b.currency || 'USD')) out.push(`Currency ${a.currency} → ${b.currency}`);
  [['delivery_date', 'Delivery date', fd], ['supplier_name', 'Supplier', v => v], ['deliver_to', 'Deliver to', poOfficeLabel], ['terms', 'Terms', () => 'changed'], ['note', 'Note', () => 'changed']].forEach(([k, l, f]) => {
    if (String(a[k] || '') !== String(b[k] || '')) out.push(k === 'terms' || k === 'note' ? `${l} changed` : `${l}: ${a[k] ? f(a[k]) : '—'} → ${b[k] ? f(b[k]) : '—'}`);
  });
  return out;
}
async function poRevisionChanges(o, payload) {
  try { const r = await q(sb.from('po_revisions').select('snapshot').eq('po_id', o.id).order('revision', { ascending: false }).limit(1).single()); return poDiff(r.snapshot, payload, o.currency); }
  catch (e) { return []; }
}

// ================================================================ ONE PO: details, versions, receiving
const poView = {
  async load(id) {
    const o = await q(sb.from('po_orders').select('*').eq('id', id).maybeSingle());
    if (!o) return topbar('Purchase order') + '<div class="notice bad">Purchase order not found.</div><a class="btn" href="#/po">All purchase orders</a>';
    if (o.status === 'draft' && poOwner(o) && poCanRaise()) { setTimeout(() => go(`#/po/${id}/edit`), 0); return '<div class="loading">Opening the draft…</div>'; }
    const [lines, revs, recs, files] = await Promise.all([
      q(sb.from('po_order_lines').select('*').eq('po_id', id).order('sort').order('id')),
      q(sb.from('po_revisions').select('id,revision,po_no_full,reason,signed_by_name,job_title,signed_at,changes').eq('po_id', id).order('revision', { ascending: false })),
      q(sb.from('po_receipts').select('*').eq('po_id', id).order('received_at', { ascending: false })),
      q(sb.from('po_files').select('id,kind,name,mime,size,added_by_name,added_at').eq('po_id', id).order('added_at')),
    ]);
    if (appAllowed('inventory')) await items();
    Object.assign(this, { o, lines, revs, recs, files });
    const full = poFull(o); const cur = o.currency;
    const itemsOnly = lines.filter(l => l.kind === 'item');
    const canRecv = ['issued', 'partial'].includes(o.status) && !o.revising && !readOnly() && itemsOnly.some(l => +l.received_qty < +l.qty && poCanReceiveLine(l, o));
    const own = poOwner(o) && poCanRaise();
    const late = ['issued', 'partial'].includes(o.status) && o.delivery_date && o.delivery_date < localISO(0);
    let n = 0, hh = 0;
    return topbar(esc(full || 'Draft purchase order') + ' ' + poStatusChip(o), `${esc(o.supplier_name || '')} · ${esc(poLineLabel(o))}`,
      `<a class="btn" href="#/po">All POs</a>${!o.is_import ? `<button class="btn" id="pv-pdf">${ico('pdf')}PDF</button><button class="btn" id="pv-xls">${ico('down')}Excel</button>` : ''}
       ${own && !o.is_import && ['issued', 'partial', 'received'].includes(o.status) && !o.revising ? `<button class="btn" id="pv-rev">${ico('edit')}Revise</button>` : ''}
       ${own && o.revising ? `<a class="btn primary" href="#/po/${o.id}/edit">${ico('edit')}Continue revision</a>` : ''}
       ${own && ['issued', 'partial', 'received'].includes(o.status) && !o.revising ? `<button class="btn" id="pv-close">Close PO</button>` : ''}
       ${canRecv ? `<button class="btn tagbtn" id="pv-recv">${ico('box')}Receive goods</button>` : ''}`) +
      `${new URLSearchParams(location.hash.split('?')[1] || '').get('issued') ? `<div class="notice ok">✔ <b>${esc(full)}</b> is signed and issued. Download the PDF or Excel copy to send to ${esc(o.supplier_name || 'the supplier')}.</div>` : ''}
      ${o.revising ? `<div class="notice">A revision (<b>R${o.revision + 1}</b>) is being prepared by ${esc(o.created_by_name || '')}. Until it’s signed, <b>${esc(full)}</b> is the valid PO.</div>` : ''}
      ${o.status === 'cancelled' ? `<div class="notice bad"><b>Cancelled</b> by ${esc(o.cancelled_by_name || '')} on ${fd(o.cancelled_at)}: ${esc(o.cancel_reason || '')}</div>` : ''}
      ${o.status === 'closed' ? `<div class="notice"><b>Closed</b>${o.closed_by_name ? ` by ${esc(o.closed_by_name)}` : ''}${o.closed_at ? ` on ${fd(o.closed_at)}` : ''}${o.close_reason ? `: ${esc(o.close_reason)}` : ''}</div>` : ''}
      ${late ? `<div class="notice bad">The delivery date (${fd(o.delivery_date)}) has passed and ${o.status === 'partial' ? 'some goods are' : 'the goods are'} still to come.</div>` : ''}
      <div class="grid2 po-view">
      <section class="panel"><header><h2>Purchase order</h2></header><div class="body"><dl class="kv">
        <dt>PO number</dt><dd><b>${esc(full || 'Not issued')}</b></dd><dt>P.O. date</dt><dd>${o.po_date ? fd(o.po_date) : '—'}</dd>
        <dt>Supplier</dt><dd>${esc(o.supplier_name || '—')}${o.supplier_address ? `<div class="sub">${esc(o.supplier_address)}</div>` : ''}${o.supplier_phone || o.supplier_fax ? `<div class="sub">${esc(poPhoneText(o.supplier_phone, o.supplier_fax))}</div>` : ''}</dd>
        <dt>Service line</dt><dd>${esc(poLineName(o.line_id))}${o.sub_line_id ? `<div class="sub">${esc(poLineName(o.sub_line_id))}</div>` : ''}</dd>
        <dt>Delivery date</dt><dd>${o.delivery_date ? fd(o.delivery_date) : '—'}</dd><dt>Deliver to</dt><dd>${esc(poOfficeLabel(o.deliver_to))}</dd>
        ${o.quote_ref ? `<dt>Supplier’s quote</dt><dd>${esc(o.quote_ref)}</dd>` : ''}${o.pan ? `<dt>PAN</dt><dd>${esc(o.pan)}</dd>` : ''}${o.gstin ? `<dt>GSTIN</dt><dd>${esc(o.gstin)}</dd>` : ''}
        <dt>Raised by</dt><dd>${esc(o.created_by_name || '—')} · ${fd(o.created_at)}</dd>${o.issued_at && !o.is_import ? `<dt>Issued</dt><dd>${fdt(o.issued_at)} by ${esc(o.issued_by_name || '')}</dd>` : ''}
        <dt>How it started</dt><dd>${esc(PO_SRC[o.source] || o.source)}</dd></dl></div></section>
      <section class="panel"><header><h2>Order amount</h2><span class="meta">${esc(cur)}</span></header><div class="body"><dl class="kv po-sum">
        <dt>Sub total</dt><dd>${poMoney(o.subtotal, cur)}</dd><dt>Total tax</dt><dd>${o.tax_amount == null ? '<span class="sub">—</span>' : poMoney(o.tax_amount, cur)}</dd><dt><b>Order amount</b></dt><dd><b class="big">${poMoney(o.total, cur)}</b></dd></dl>
        <div class="po-words">${esc(poWords(o.total, cur))}</div>
        ${itemsOnly.length ? `<div class="po-recbar"><span>${fq(itemsOnly.reduce((a, l) => a + +l.received_qty, 0))} of ${fq(itemsOnly.reduce((a, l) => a + +l.qty, 0))} units received</span><i style="width:${Math.round(100 * itemsOnly.reduce((a, l) => a + Math.min(+l.received_qty, +l.qty), 0) / Math.max(1, itemsOnly.reduce((a, l) => a + +l.qty, 0)))}%"></i></div>` : ''}</div></section></div>
      ${lines.length ? `<section class="panel"><header><h2>Lines</h2><span class="meta">${plural(itemsOnly.length, 'line')}</span></header><div class="tablewrap"><table class="t stack"><thead><tr><th>S.No.</th><th>Part No.</th><th>Item name</th><th class="num">Qty</th><th>UOM</th><th class="num">Rate</th><th class="num">Amount</th><th class="num">Received</th></tr></thead><tbody>
        ${lines.map(l => { if (l.kind === 'heading') { return `<tr class="pe-head"><td><b>${String.fromCharCode(65 + (hh++ % 26))}</b></td><td colspan="7"><b>${esc(l.description || '')}</b></td></tr>`; }
          const it = l.item_id ? (S.items || []).find(x => x.id === +l.item_id) : null; const done = +l.received_qty >= +l.qty && +l.qty > 0;
          return `<tr><td>${++n}</td><td class="nowrap">${esc(l.part_no || '')}</td><td class="full">${esc(l.description || '')}${it ? `<div class="sub"><a href="#/item/${it.id}">${tag(it.code)} in Inventory</a></div>` : ''}</td><td class="num">${fq(l.qty)}</td><td>${esc(l.uom || '')}</td>
            <td class="num">${poNum(l.rate)}</td><td class="num">${poNum(poAmount(l))}</td><td class="num">${o.is_import ? '—' : `<span class="${done ? 'pos' : +l.received_qty ? '' : 'sub'}">${fq(l.received_qty)} / ${fq(l.qty)}</span>`}</td></tr>`; }).join('')}
        </tbody></table></div></section>` : ''}
      ${o.note || o.terms ? `<section class="panel"><div class="body">${o.note ? `<b>Note</b><p>${esc(o.note)}</p>` : ''}${o.terms ? `<b>Terms &amp; conditions</b><ul>${o.terms.split('\n').filter(s => s.trim()).map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</div></section>` : ''}
      ${revs.length ? `<section class="panel"><header><h2>Versions</h2><span class="meta">Each one as it was signed</span>${revs.length > 1 ? `<button class="btn small hdr-btn" id="pv-cmp">Compare versions</button>` : ''}</header><ul class="list">
        ${revs.map((r, i) => `<li><div style="flex:1"><div class="name">${esc(r.po_no_full)} ${i === 0 ? (o.status === 'cancelled' ? chip('overdue', 'Cancelled') : chip('ok', 'Current')) : chip('muted', 'Superseded')}</div>
          <div class="sub">Signed by ${esc(r.signed_by_name || '')}${r.job_title ? ' · ' + esc(r.job_title) : ''} · ${fdt(r.signed_at)}${r.reason ? ` · <b>Reason:</b> ${esc(r.reason)}` : ''}</div>
          ${(r.changes || []).length ? `<ul class="changes">${r.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</div>
          <div class="end"><button class="btn small" data-rpdf="${r.id}">${ico('pdf')}PDF</button> <button class="btn small" data-rxls="${r.id}">${ico('down')}Excel</button></div></li>`).join('')}</ul></section>` : ''}
      ${recs.length ? `<section class="panel"><header><h2>Received</h2><span class="meta">${plural(recs.length, 'delivery', 'deliveries')}</span></header><div class="tablewrap"><table class="t stack"><thead><tr><th>When</th><th>Item</th><th class="num">Qty</th><th>Put in</th><th>Received by</th><th>Note</th></tr></thead><tbody>
        ${recs.map(r => { const l = lines.find(x => x.id === r.line_id); return `<tr><td class="nowrap">${fdt(r.received_at)}</td><td class="full">${esc(l ? (l.part_no ? l.part_no + ' · ' : '') + (l.description || '') : 'Line removed')}</td><td class="num">${fq(r.qty)}</td><td>${r.location_id ? esc(locName(r.location_id)) : '<span class="sub">Not in Inventory</span>'}</td><td>${esc(r.received_by_name || '')}</td><td class="sub">${esc(r.note || '')}</td></tr>`; }).join('')}</tbody></table></div></section>` : ''}
      <section class="panel"><header><h2>Files</h2></header><div class="body">${files.length ? `<ul class="list po-files">${files.map(f => `<li><div class="pf-name">${ico('pdf')}<a href="#" data-dl="${f.id}">${esc(f.name)}</a> <span class="sub">${f.kind === 'original' ? 'Original PO · ' : f.kind === 'quote' ? 'Supplier’s quote · ' : ''}${fbytes(f.size)} · ${esc(f.added_by_name || '')} · ${fdt(f.added_at)}</span></div></li>`).join('')}</ul>` : '<div class="muted">No files attached.</div>'}</div></section>
      ${own && ['issued', 'partial'].includes(o.status) && !recs.length && !o.revising ? `<div class="po-danger"><button class="btn small link danger" id="pv-cancel">Cancel this PO</button><span class="sub">Cancelled POs keep their number; it’s never reused.</span></div>` : ''}
      ${isSuper() && !S.viewAs ? `<div class="po-danger dev"><button class="btn small link danger" id="pv-devdel">${ico('wrench')}Delete this PO</button><span class="sub">Developer only. Removes it from every list${recs.length ? ' and takes the goods received against it off stock' : ''}. A full copy stays in the audit log.</span></div>` : ''}`;
  },
  async docFor(revId) {
    const r = await q(sb.from('po_revisions').select('*').eq('id', revId).single());
    const latest = this.revs[0]?.id === revId;
    return poDocFrom(r.snapshot, { superseded: !latest });
  },
  bind(main) {
    if (!this.o) return; const o = this.o;
    if (location.hash.includes('?issued=1')) history.replaceState(null, '', location.hash.replace('?issued=1', ''));
    const latestDoc = async () => this.revs[0] ? this.docFor(this.revs[0].id) : poDocFrom({ ...o, po_no_full: poFull(o), lines: this.lines }, { draft: o.status === 'draft' });
    const pdf = $('#pv-pdf', main); if (pdf) pdf.onclick = async () => { try { await poPdf(await latestDoc()); } catch (e) { console.error(e); toast(niceError(e), true); } };
    const xls = $('#pv-xls', main); if (xls) xls.onclick = async () => { try { await poExcel(await latestDoc()); } catch (e) { console.error(e); toast(niceError(e), true); } };
    $$('[data-rpdf]', main).forEach(b => b.onclick = async () => { try { await poPdf(await this.docFor(+b.dataset.rpdf)); } catch (e) { toast(niceError(e), true); } });
    $$('[data-rxls]', main).forEach(b => b.onclick = async () => { try { await poExcel(await this.docFor(+b.dataset.rxls)); } catch (e) { toast(niceError(e), true); } });
    $$('[data-dl]', main).forEach(a => a.onclick = e => { e.preventDefault(); poDownloadFile(+a.dataset.dl); });
    const rev = $('#pv-rev', main); if (rev) rev.onclick = async () => {
      const ok = await modal({ title: `Revise ${poFull(o)}`, submit: 'Start the revision',
        sub: `You’ll edit a copy. When you sign it, it becomes <b>${esc(o.po_no)}-R${o.revision + 1}</b> and the current version is kept and marked Superseded. Until then, ${esc(poFull(o))} stays valid.`,
        body: (this.recs.length ? '<div class="notice">Some goods have already been received. Those lines can’t be removed, and their quantities can’t go below what was received.</div>' : '') + '<p class="muted">The PO number, the service line and the year stay the same.</p>',
        onSubmit: async () => q(sb.rpc('po_start_revision', { p_id: o.id })) });
      if (ok) go(`#/po/${o.id}/edit`);
    };
    const can = $('#pv-cancel', main); if (can) can.onclick = () => modal({ title: `Cancel ${poFull(o)}`, submit: 'Cancel the PO', cancel: 'Keep it', danger: true,
      sub: 'The PO stays in the history as Cancelled, and its number is never reused. Tell the supplier separately.',
      body: '<label class="f">Why is it cancelled?<textarea name="reason" rows="2" required></textarea></label>',
      onSubmit: async x => { if (!(x.reason || '').trim()) throw new Error('Say why the PO is cancelled.'); await q(sb.rpc('po_cancel', { p_id: o.id, p_reason: x.reason })); toast('PO cancelled'); render({ quiet: true }); } });
    const recv = $('#pv-recv', main); if (recv) recv.onclick = () => poReceiveDialog(o, this.lines);
    const cl = $('#pv-close', main); if (cl) cl.onclick = () => modal({ title: `Close ${poFull(o)}`, submit: 'Close the PO',
      sub: 'Use this when nothing more will come on this PO (for example the supplier can’t supply the rest) or the paperwork is finished. Anything still showing On order in Inventory is cleared.',
      body: `${o.status !== 'received' ? '<div class="notice">Some goods haven’t been received yet. Closing means you don’t expect them any more.</div>' : ''}<label class="f">Why is it closed?<textarea name="reason" rows="2" required></textarea></label>`,
      onSubmit: async x => { if (!(x.reason || '').trim()) throw new Error('Say why the PO is closed.'); await q(sb.rpc('po_close', { p_id: o.id, p_reason: x.reason })); toast('PO closed'); render({ quiet: true }); } });
    const cmp = $('#pv-cmp', main); if (cmp) cmp.onclick = () => poCompare(this.revs, o);
    const dd = $('#pv-devdel', main); if (dd) dd.onclick = () => devConfirm({ title: `Delete ${poFull(o) || 'this draft'}`, expect: o.po_no || 'Draft ' + o.id,
      sub: `Removes the PO, its revisions${this.recs.length ? ', and the goods received against it (they come off stock)' : ''}. The number is not reused.`,
      run: async c => { await q(sb.rpc('dev_delete_po', { p_id: o.id, p_confirm: c })); toast('PO deleted'); go('#/po'); } });
  }
};
function poCanReceiveLine(l, o) {
  if (isSuper()) return true;
  if (!l.item_id && o.created_by === S.profile?.id) return true;
  const it = l.item_id ? S.items?.find(x => x.id === +l.item_id) : null;
  const d = it ? it.department_id : o.department_id;
  if (d == null) return invRole() === 'admin';
  if (canApprove(d)) return true;
  return S.members.some(m => m.profile_id === S.profile.id && m.department_id === +d && m.po_receive);
}
async function poReceiveDialog(o, lines) {
  if (appAllowed('inventory')) await stockRows();
  const open = lines.filter(l => l.kind === 'item' && +l.received_qty < +l.qty);
  const its = id => id ? (S.items || []).find(x => x.id === +id) : null;
  const defLoc = l => { const it = its(l.item_id); if (!it) return ''; const best = (S.stock || []).filter(s => s.item_id === it.id && s.status === 'available').sort((a, b) => b.qty - a.qty)[0]; return best?.location_id || realLocs()[0]?.id || ''; };
  return modal({
    title: `Receive goods · ${poFull(o)}`, wide: true, submit: 'Record delivery',
    sub: 'Enter what arrived. Items linked to Inventory go into stock at the location you choose, and their price updates from the PO. Lines not in Inventory are only marked as received.',
    body: `<div class="tablewrap"><table class="t"><thead><tr><th>Item</th><th class="num">Still to come</th><th class="num">Received now</th><th>Put in</th></tr></thead><tbody>
      ${open.map(l => { const it = its(l.item_id); const mine = poCanReceiveLine(l, o); const left = +l.qty - +l.received_qty;
        return `<tr><td>${esc(l.part_no ? l.part_no + ' · ' : '')}${esc(l.description || '')}${it ? `<div class="sub">${tag(it.code)} ${esc(lineShort(it.department_id))}</div>` : '<div class="sub">Not in Inventory</div>'}${mine ? '' : '<div class="sub neg">Only that line’s admin can receive this</div>'}</td>
          <td class="num">${fq(left)} ${esc(l.uom || '')}</td><td class="num"><input type="text" inputmode="decimal" name="q${l.id}" value="${mine ? fq(left).replace(/,/g, '') : ''}" class="num narrow" ${mine ? '' : 'disabled'}></td>
          <td>${it ? `<select name="loc${l.id}" ${mine ? '' : 'disabled'}>${realLocOptions(defLoc(l))}</select>` : '<span class="sub">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>
      <label class="f">Note<span class="hint">Optional, for example the waybill or delivery note number.</span><input type="text" name="note"></label>`,
    onSubmit: async x => {
      const rows = open.filter(l => poCanReceiveLine(l, o)).map(l => ({ line_id: l.id, qty: x['q' + l.id] ? +String(x['q' + l.id]).replace(/,/g, '') : 0, location_id: x['loc' + l.id] || null, note: x.note || '' })).filter(r => r.qty > 0);
      if (!rows.length) throw new Error('Enter the quantity received on at least one line.');
      await q(sb.rpc('po_receive', { p_id: o.id, p_lines: rows }));
      invalidate(); toast('Delivery recorded'); render({ quiet: true });
    }
  });
}

// ---------------------------------------------------------------- an old PO, added by hand
async function poImportDialog() {
  let file = null;
  return modal({
    title: 'Add an old PO', submit: 'Add to the history',
    sub: 'For POs sent before Nest. They appear in the history and totals, with the original file attached. The running number isn’t affected.',
    body: `<div class="row2"><label class="f">PO number<input type="text" name="po_no" placeholder="GES-WI-PO-10023-2025" required></label><label class="f">P.O. date<input type="date" name="po_date"></label></div>
      <div class="row2"><label class="f">Service line<select name="line_id" id="im-line">${poMajors().map(l => opt(l.id, `${l.code} · ${l.name}`)).join('')}</select></label><label class="f">Sub service line<select name="sub_line_id" id="im-sub"></select></label></div>
      <label class="f">Supplier<span class="hint" id="im-suphint">A new supplier is added to your Suppliers list with the details below.</span><input type="text" name="supplier_name" id="im-sup" list="im-sups" required><datalist id="im-sups">${S.po.suppliers.map(s => `<option value="${esc(s.name)}"></option>`).join('')}</datalist></label>
      <label class="f">Supplier address<span class="hint">Optional.</span><textarea name="supplier_address" rows="2"></textarea></label>
      <div class="row2"><label class="f">Phone<span class="hint">Optional.</span><input type="text" name="supplier_phone"></label><label class="f">Fax<span class="hint">Optional.</span><input type="text" name="supplier_fax"></label></div>
      <div class="row3"><label class="f">Currency<select name="currency">${Object.keys(PO_CUR).map(c => opt(c, c, 'USD')).join('')}</select></label><label class="f">Order amount<input type="text" name="total" inputmode="decimal" required></label>
        <label class="f">Status<select name="status">${opt('issued', 'Issued (goods still to come)')}${opt('received', 'Received')}${opt('cancelled', 'Cancelled')}</select></label></div>
      <label class="f">Note<input type="text" name="note" placeholder="optional"></label>
      <label class="f">Original PO file<span class="hint">The PDF or Excel that was sent (up to 8 MB).</span><input type="file" id="im-file" accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg"></label>`,
    onOpen: d => {
      const ln = $('#im-line', d), sub = $('#im-sub', d);
      const draw = () => { const s = poSubs(ln.value); sub.innerHTML = `<option value="">${s.length ? 'Choose…' : 'None'}</option>` + s.map(l => opt(l.id, l.name)).join(''); };
      ln.onchange = draw; draw();
      $('#im-file', d).onchange = e => { file = e.target.files[0] || null; };
      $('#im-sup', d).oninput = e => { const known = S.po.suppliers.find(x => x.name.trim().toLowerCase() === e.target.value.trim().toLowerCase());
        $('#im-suphint', d).textContent = known ? `${known.name} is already in your Suppliers list. Details you add here only fill in what it’s missing.` : 'A new supplier is added to your Suppliers list with the details below.'; };
      $('[name=po_no]', d).oninput = e => { const m = e.target.value.toUpperCase().match(/^GES-([A-Z]+)-PO-/); if (m) { const l = poMajors().find(x => x.code === m[1]); if (l && +ln.value !== l.id) { ln.value = l.id; draw(); } } };
    },
    onSubmit: async x => {
      if (file && file.size > 8 * 1024 * 1024) throw new Error('That file is too big (the limit is 8 MB).');
      const p = { po_no: x.po_no, po_date: x.po_date, line_id: x.line_id, sub_line_id: x.sub_line_id, supplier_name: x.supplier_name,
        supplier_address: x.supplier_address, supplier_phone: x.supplier_phone, supplier_fax: x.supplier_fax, currency: x.currency,
        total: String(x.total || '').replace(/[^0-9.]/g, ''), status: x.status, note: x.note,
        ...(file ? { file: { name: file.name, mime: file.type, data: await fileB64(file) } } : {}) };
      const id = await q(sb.rpc('po_import', { p })); S.po.at = 0; toast('Added to the history'); go('#/po/' + id);
    }
  });
}

// ---------------------------------------------------------------- compare two versions side by side
function poCompare(revs, o) {
  const opts = revs.map(r => opt(r.id, r.po_no_full));
  return modal({ title: `Compare versions · ${o.po_no}`, wide: true, submit: '', cancel: 'Close',
    body: `<div class="row2"><label class="f">Earlier version<select id="cv-a">${revs.map((r, i) => opt(r.id, r.po_no_full, revs[1]?.id)).join('')}</select></label><label class="f">Later version<select id="cv-b">${revs.map(r => opt(r.id, r.po_no_full, revs[0].id)).join('')}</select></label></div><div id="cv-out"><div class="loading">Loading…</div></div>`,
    onOpen: d => {
      const cache = {};
      const get = async id => cache[id] ||= (await q(sb.from('po_revisions').select('snapshot').eq('id', id).single())).snapshot;
      const draw = async () => {
        const [a, b] = await Promise.all([get(+$('#cv-a', d).value), get(+$('#cv-b', d).value)]);
        const key = l => (String(l.part_no || '').trim().toLowerCase() || String(l.description || '').trim().toLowerCase().slice(0, 80));
        const A = (a.lines || []).filter(l => l.kind !== 'heading'), B = (b.lines || []).filter(l => l.kind !== 'heading');
        const keys = [...new Set([...A.map(key), ...B.map(key)])];
        const cell = (x, y, f) => x == null ? `<span class="pos">${f(y)}</span>` : y == null ? `<s class="neg">${f(x)}</s>` : +x === +y || x === y ? f(y) : `<s class="sub">${f(x)}</s> <b class="chg">${f(y)}</b>`;
        const rows = keys.map(k => { const x = A.find(l => key(l) === k), y = B.find(l => key(l) === k); const l = y || x;
          const st = !x ? 'added' : !y ? 'removed' : (+x.qty !== +y.qty || +x.rate !== +y.rate) ? 'changed' : '';
          return `<tr class="cv-${st}"><td>${esc(l.part_no || '')}</td><td class="full">${esc(l.description || '')}${st ? ` <span class="chip ${st === 'added' ? 'ok' : st === 'removed' ? 'overdue' : 'pending'}">${st === 'added' ? 'Added' : st === 'removed' ? 'Removed' : 'Changed'}</span>` : ''}</td>
            <td class="num">${cell(x?.qty, y?.qty, fq)}</td><td class="num">${cell(x?.rate, y?.rate, poNum)}</td><td class="num">${cell(x ? poAmount(x) : null, y ? poAmount(y) : null, poNum)}</td></tr>`; }).join('');
        const ta = poDocFrom(a).total, tb = poDocFrom(b).total;
        const ch = poDiff(a, b, b.currency);
        $('#cv-out', d).innerHTML = `${ch.length ? `<ul class="changes">${ch.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="muted">These two versions are the same.</p>'}
          <div class="tablewrap"><table class="t cv"><thead><tr><th>Part No.</th><th>Item name</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody>
          <tfoot><tr><td colspan="4"><b>Order amount</b></td><td class="num">${cell(ta, tb, v => poMoney(v, b.currency))}</td></tr></tfoot></table></div>`;
      };
      $('#cv-a', d).onchange = draw; $('#cv-b', d).onchange = draw; draw().catch(e => { $('#cv-out', d).innerHTML = `<div class="notice bad">${esc(niceError(e))}</div>`; });
    } });
}

// ---------------------------------------------------------------- bulk import of old POs (PDF or Excel in the company layout)
function poParseOld(text) {
  const all = text.join('\n'); const one = (re) => { const m = all.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
  const m = all.match(/GES[-_ ]([A-Z]{2,4})[-_ ]PO[-_ ]?(\d{4,6})[-_ ](\d{4})(?:[-_ ]?(R\d+))?/i);
  const po_no = m ? `GES-${m[1].toUpperCase()}-PO-${m[2]}-${m[3]}${m[4] ? '-' + m[4].toUpperCase() : ''}` : '';
  let po_date = '';
  const d1 = all.match(/P\.?\s?O\.?\s*Date\s*:?\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
  const d2 = all.match(/P\.?\s?O\.?\s*Date\s*:?\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i);
  if (d1) { const y = d1[3].length === 2 ? '20' + d1[3] : d1[3]; po_date = `${y}-${String(d1[2]).padStart(2, '0')}-${String(d1[1]).padStart(2, '0')}`; }
  else if (d2) { const t = new Date(`${d2[1]} ${d2[2]} ${d2[3]}`); if (!isNaN(t)) po_date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
  const stop = '(?=\\s{2,}|\\s+P\\.?\\s?O\\.?\\s|\\s+PAN\\b|\\s+Delivery|\\s+GSTIN|$)';
  const supplier = one(new RegExp('(?:^|\\n)\\s*Name\\s*:\\s*(.+?)' + stop, 'im'));
  const address = one(new RegExp('(?:^|\\n)\\s*Address\\s*:\\s*(.+?)' + stop, 'im'));
  const phoneRaw = one(new RegExp('(?:^|\\n)\\s*Phone\\s*:\\s*(.+?)(?=\\s+PAN\\b|$)', 'im'));
  const pf = phoneRaw.match(/^(?:phone\s*:?\s*)?(.*?)(?:\s*fax\s*:?\s*(.*))?$/i) || [];
  const cur = (all.match(/Rate\s*\((USD|NGN|GBP|EUR)\)/i) || all.match(/\b(USD|NGN|GBP|EUR)\s*[\d,]+\.\d{2}/) || [])[1]?.toUpperCase() || (/₦/.test(all) ? 'NGN' : /£/.test(all) ? 'GBP' : /€/.test(all) ? 'EUR' : 'USD');
  const tm = all.match(/Order\s*Amount\s*:?\s*(?:USD|NGN|GBP|EUR|[$₦£€])?\s*([\d,]+\.\d{1,2})/i) || all.match(/Sub\s*Total\s*Amount\s*:?\s*(?:USD|NGN|GBP|EUR|[$₦£€])?\s*([\d,]+\.\d{1,2})/i);
  const quote = (all.match(/\bQN[\s_:-]*([A-Z0-9][A-Z0-9_\/.-]{3,})/i) || [])[1] || '';
  return { po_no, po_date, supplier_name: supplier.replace(/^:\s*/, ''), supplier_address: address.replace(/^:\s*/, ''), supplier_phone: (pf[1] || '').trim(), supplier_fax: (pf[2] || '').trim(),
    currency: cur, total: tm ? +tm[1].replace(/,/g, '') : null, quote_ref: quote.replace(/_+/g, '-').replace(/-+$/, '') };
}
async function poBulkImport() {
  let rows = [];
  return modal({ title: 'Add old POs', wide: true, submit: 'Add to the history',
    sub: 'For POs sent before Nest. Choose the PDFs or Excel files (up to 20 at a time, 8 MB each). Nest reads the PO number, date, supplier, order amount and lines from each one. Check the table, then add them. The running number isn’t affected, and each original file is kept with its PO. A supplier that isn’t in your list yet is added with its address, phone and fax.',
    body: `<div class="actionrow"><label class="btn tagbtn filebtn">${ico('up')}Choose old PO files<input type="file" id="bi-files" multiple accept=".pdf,.xlsx,.xlsm" hidden></label><button type="button" class="btn" id="bi-hand">Add one by hand instead</button></div><div id="bi-out" class="mt"></div>`,
    onOpen: (d, close) => {
      d.classList.add('bulkimp');
      $('#bi-hand', d).onclick = () => { close(null); poImportDialog(); };
      $('#bi-files', d).onchange = async e => {
        const files = [...e.target.files].slice(0, 20); const out = $('#bi-out', d); out.innerHTML = '<div class="loading">Reading the POs…</div>'; rows = [];
        const existing = new Set((await q(sb.from('po_orders').select('po_no').not('po_no', 'is', null))).map(r => r.po_no));
        for (const file of files) {
          try { if (file.size > 8 * 1024 * 1024) throw new Error('Too big (the limit is 8 MB).');
            const r = await poReadFile(file); const h = poParseOld(r.text);
            const code = (h.po_no.match(/^GES-([A-Z]+)-/) || [])[1]; const major = poMajors().find(l => l.code === code);
            rows.push({ file, ...h, lines: r.lines, line_id: major?.id || poMajors()[0]?.id, sub_line_id: '', status: 'received', dup: existing.has(h.po_no.replace(/-R\d+$/, '')) || existing.has(h.po_no) });
          } catch (ex) { rows.push({ file, error: niceError(ex) }); }
        }
        out.innerHTML = `<div class="tablewrap"><table class="t bi"><thead><tr><th></th><th>File</th><th>PO number</th><th>P.O. date</th><th>Supplier</th><th>Service line</th><th>Order amount</th><th>Status</th></tr></thead><tbody>
          ${rows.map((r, i) => r.error ? `<tr><td></td><td>${esc(r.file.name)}</td><td colspan="6"><span class="neg">${esc(r.error)}</span></td></tr>` : `<tr>
            <td><input type="checkbox" data-bi="${i}" ${r.dup || !r.po_no ? '' : 'checked'}></td>
            <td class="sub">${esc(r.file.name)}<div>${plural(r.lines.length, 'line')} read</div>${r.dup ? '<div class="neg">Already in Nest</div>' : ''}</td>
            <td><input type="text" data-k="po_no" data-r="${i}" value="${esc(r.po_no)}" placeholder="GES-WI-PO-…"></td>
            <td><input type="date" data-k="po_date" data-r="${i}" value="${esc(r.po_date)}"></td>
            <td><input type="text" data-k="supplier_name" data-r="${i}" value="${esc(r.supplier_name)}"></td>
            <td><select data-k="line_id" data-r="${i}">${poMajors().map(l => opt(l.id, l.code, r.line_id)).join('')}</select><select data-k="sub_line_id" data-r="${i}"><option value="">Sub line…</option>${poSubs(r.line_id).map(l => opt(l.id, l.name)).join('')}</select></td>
            <td><div class="bi-amt"><select data-k="currency" data-r="${i}">${Object.keys(PO_CUR).map(c => opt(c, c, r.currency)).join('')}</select><input type="text" inputmode="decimal" data-k="total" data-r="${i}" value="${r.total ?? ''}"></div></td>
            <td><select data-k="status" data-r="${i}">${opt('received', 'Fully received', r.status)}${opt('issued', 'Issued (still to come)', r.status)}${opt('closed', 'Closed', r.status)}${opt('cancelled', 'Cancelled', r.status)}</select></td></tr>`).join('')}</tbody></table></div>`;
        $$('[data-k]', out).forEach(inp => inp.onchange = () => { const r = rows[+inp.dataset.r]; r[inp.dataset.k] = inp.value;
          if (inp.dataset.k === 'line_id') { const sub = $(`select[data-k=sub_line_id][data-r="${inp.dataset.r}"]`, out); sub.innerHTML = '<option value="">Sub line…</option>' + poSubs(inp.value).map(l => opt(l.id, l.name)).join(''); r.sub_line_id = ''; } });
      };
    },
    onSubmit: async (x, d) => {
      const pick = rows.filter((r, i) => !r.error && $(`[data-bi="${i}"]`, d)?.checked);
      if (!pick.length) throw new Error('Choose the files and tick at least one PO.');
      const bad = pick.find(r => !r.po_no || !r.supplier_name); if (bad) throw new Error(`${bad.file.name}: enter the PO number and supplier.`);
      let n = 0; const fails = []; const newSups = new Set();
      const known = new Set(S.po.suppliers.map(x => x.name.trim().toLowerCase()));
      for (const r of pick) {
        try {
          await q(sb.rpc('po_import', { p: { po_no: r.po_no, po_date: r.po_date, line_id: r.line_id, sub_line_id: r.sub_line_id, supplier_name: r.supplier_name, supplier_address: r.supplier_address,
            supplier_phone: r.supplier_phone, supplier_fax: r.supplier_fax, currency: r.currency, total: String(r.total ?? '').replace(/[^0-9.]/g, ''), status: r.status, quote_ref: r.quote_ref,
            lines: r.lines.map(l => ({ part_no: l.part_no, description: l.description, qty: l.qty, uom: l.uom, rate: l.rate })),
            file: { name: r.file.name, mime: r.file.type, data: await fileB64(r.file) } } }));
          n++; const k = String(r.supplier_name || '').trim().toLowerCase(); if (k && !known.has(k)) newSups.add(k);
        } catch (e) { fails.push(`${r.po_no}: ${niceError(e)}`); }
      }
      S.po.at = 0; render({ quiet: true });
      const sups = newSups.size ? ` · ${plural(newSups.size, 'new supplier')} added to Suppliers` : '';
      if (fails.length) { toast(`Added ${plural(n, 'PO')}${sups}. Not added: ${fails.join(' · ')}`, true); } else toast(`Added ${plural(n, 'old PO')} to the history${sups}`);
    } });
}

// ================================================================ OVERVIEW: what's coming, and where the money goes
const poOverview = {
  async load(params) {
    const yrs = new Set();
    const orders = await q(sb.from('po_orders').select('id,po_no,revision,status,revising,line_id,sub_line_id,supplier_name,po_date,delivery_date,currency,total,created_by,created_at,is_import').neq('status', 'draft').limit(5000));
    orders.forEach(o => yrs.add(String(o.po_date || o.created_at).slice(0, 4)));
    const P = this.P ||= { year: String(new Date().getFullYear()), cur: '' };
    const spendOrders = orders.filter(o => o.status !== 'cancelled');
    const curs = Object.entries(spendOrders.reduce((a, o) => (a[o.currency] = (a[o.currency] || 0) + +o.total, a), {})).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    if (!P.cur || !curs.includes(P.cur)) P.cur = curs[0] || 'USD';
    const inYear = o => P.year === 'all' || String(o.po_date || o.created_at).slice(0, 4) === P.year;
    const sel = spendOrders.filter(o => o.currency === P.cur && inYear(o));
    const today = localISO(0), week = localISO(7);
    const open = orders.filter(o => ['issued', 'partial'].includes(o.status));
    const late = open.filter(o => o.delivery_date && o.delivery_date < today);
    const soon = open.filter(o => o.delivery_date && o.delivery_date >= today && o.delivery_date <= week);
    const nodate = open.filter(o => !o.delivery_date);
    // lines for the price history
    const ids = sel.map(o => o.id);
    const lines = ids.length ? await fetchAll(() => sb.from('po_order_lines').select('po_id,kind,part_no,description,qty,uom,rate').in('po_id', ids.slice(0, 900)).eq('kind', 'item')) : [];
    this.data = { orders, sel, lines, late, soon, nodate, open, curs, years: [...yrs].sort().reverse() };
    const sum = arr => arr.reduce((a, o) => a + +o.total, 0);
    const openVal = open.filter(o => o.currency === P.cur);
    return topbar('Purchase Order overview', 'What’s due in, and where the money goes. Each currency is shown on its own, without converting.',
        poCanRaise() ? `<a class="btn tagbtn" href="#/po/new">${ico('plus')}New purchase order</a>` : '') +
      `<div class="filters ov-filters"><div class="seg" id="ov-cur">${(curs.length ? curs : ['USD']).map(c => `<button data-c="${c}" class="${P.cur === c ? 'on' : ''}">${PO_CUR[c]?.sym || ''} ${c}</button>`).join('')}</div>
        <select id="ov-year">${opt('all', 'All years', P.year)}${(this.data.years.length ? this.data.years : [P.year]).map(y => opt(y, y, P.year)).join('')}</select></div>
      <div class="board b4">
        <div class="kpi"><div class="n">${poMoney(sum(sel), P.cur)}</div><div class="l">Spent ${P.year === 'all' ? 'in total' : 'in ' + P.year} · ${plural(sel.length, 'PO')}</div></div>
        <div class="kpi"><div class="n">${open.length}</div><div class="l">Awaiting delivery${openVal.length ? `<span class="sub"> · ${poMoney(sum(openVal), P.cur)}</span>` : ''}</div></div>
        <div class="kpi ${late.length ? 'bad' : ''}"><div class="n">${late.length}</div><div class="l">Past the delivery date</div></div>
        <div class="kpi"><div class="n">${soon.length}</div><div class="l">Due in the next 7 days</div></div></div>
      ${this.expected(late, soon, nodate)}
      <div class="grid2 ov-grid">${this.byMonth(sel)}${this.bars('By service line', this.group(sel, o => [poLineCode(o.line_id), poLineName(o.line_id)].join(' · ')), P.cur)}</div>
      <div class="grid2 ov-grid">${this.bars('By sub service line', this.group(sel, o => o.sub_line_id ? poLineName(o.sub_line_id) : 'No sub line'), P.cur)}${this.bars('By supplier', this.group(sel, o => o.supplier_name || '—'), P.cur, 10)}</div>
      ${this.priceHistory(lines, sel, P.cur)}`;
  },
  group(arr, f) { const m = {}; arr.forEach(o => { const k = f(o); (m[k] ||= { v: 0, n: 0 }); m[k].v += +o.total; m[k].n++; }); return Object.entries(m).map(([k, x]) => ({ k, ...x })).sort((a, b) => b.v - a.v); },
  expected(late, soon, nodate) {
    const row = (o, tag2) => `<li><div style="flex:1"><a href="#/po/${o.id}"><b>${esc(poFull(o))}</b></a> · ${esc(o.supplier_name || '')} <span class="sub">${esc(poLineCode(o.line_id))}</span><div class="sub">${o.delivery_date ? (tag2 === 'late' ? `<span class="neg">Was due ${fd(o.delivery_date)}</span>` : `Due ${fd(o.delivery_date)}`) : 'No delivery date'} · ${PO_STATUS[o.status][1]}</div></div><div class="end"><b>${poMoney(o.total, o.currency)}</b></div></li>`;
    const all = [...late.map(o => row(o, 'late')), ...soon.sort((a, b) => a.delivery_date.localeCompare(b.delivery_date)).map(o => row(o))];
    return `<section class="panel"><header><h2>Expected deliveries</h2><span class="meta">Late, and due in the next 7 days</span>${nodate.length ? `<span class="meta">· ${plural(nodate.length, 'open PO')} with no delivery date</span>` : ''}</header>
      ${all.length ? `<ul class="list">${all.join('')}</ul>` : '<div class="body muted">Nothing is late or due this week.</div>'}</section>`;
  },
  byMonth(sel) {
    const P = this.P; const months = [];
    if (P.year === 'all') { const ys = [...new Set(sel.map(o => String(o.po_date || o.created_at).slice(0, 4)))].sort(); ys.forEach(y => months.push({ k: y, label: y })); }
    else for (let m = 1; m <= 12; m++) months.push({ k: `${P.year}-${String(m).padStart(2, '0')}`, label: new Date(+P.year, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' }) });
    months.forEach(m => { m.v = sel.filter(o => String(o.po_date || o.created_at).startsWith(m.k)).reduce((a, o) => a + +o.total, 0); m.n = sel.filter(o => String(o.po_date || o.created_at).startsWith(m.k)).length; });
    const max = Math.max(1, ...months.map(m => m.v)); const W = 560, H = 200, bw = W / months.length;
    const short = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v));
    return `<section class="panel"><header><h2>Spend by ${P.year === 'all' ? 'year' : 'month'}</h2><span class="meta">${esc(P.cur)}</span></header><div class="body">
      ${months.some(m => m.v) ? `<svg class="ov-cols" viewBox="0 0 ${W} ${H + 34}" role="img" aria-label="Spend by ${P.year === 'all' ? 'year' : 'month'}">
        <line x1="0" y1="${H}" x2="${W}" y2="${H}" class="ov-base"/>
        ${months.map((m, i) => { const h = m.v ? Math.max(3, m.v / max * (H - 26)) : 0; const x = i * bw + bw * .18, w = bw * .64;
          return `<g class="ov-col"><title>${esc(m.label)}: ${poMoney(m.v, P.cur)} · ${plural(m.n, 'PO')}</title><rect x="${i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>
            ${h ? `<path d="M${x},${H} V${H - h + 4} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H} Z" class="ov-bar"/><text x="${x + w / 2}" y="${H - h - 6}" text-anchor="middle" class="ov-val">${short(m.v)}</text>` : ''}
            <text x="${x + w / 2}" y="${H + 18}" text-anchor="middle" class="ov-lab">${esc(m.label)}</text></g>`; }).join('')}</svg>` : '<div class="muted">No spend in this period.</div>'}</div></section>`;
  },
  bars(title, rows, cur, top = 8) {
    const show = rows.slice(0, top); const rest = rows.slice(top); if (rest.length) show.push({ k: `${rest.length} others`, v: rest.reduce((a, r) => a + r.v, 0), n: rest.reduce((a, r) => a + r.n, 0) });
    const max = Math.max(1, ...show.map(r => r.v)); const tot = rows.reduce((a, r) => a + r.v, 0) || 1;
    return `<section class="panel"><header><h2>${esc(title)}</h2><span class="meta">${esc(cur)}</span></header><div class="body">
      ${show.length ? `<div class="hbars">${show.map(r => `<div class="hbar" title="${esc(r.k)}: ${esc(poMoney(r.v, cur))} · ${plural(r.n, 'PO')} · ${Math.round(r.v / tot * 100)}%">
        <div class="hb-l">${esc(r.k)}</div><div class="hb-t"><i style="width:${Math.max(1.5, r.v / max * 100)}%"></i></div><div class="hb-v"><b>${poMoney(r.v, cur)}</b><span class="sub"> · ${Math.round(r.v / tot * 100)}%</span></div></div>`).join('')}</div>` : '<div class="muted">No spend in this period.</div>'}</div></section>`;
  },
  priceHistory(lines, sel, cur) {
    const ord = new Map(sel.map(o => [o.id, o]));
    const g = {};
    lines.forEach(l => { const k = (l.part_no || l.description || '').trim().toLowerCase(); if (!k || /^(misc|crating)$/i.test(k)) return; const o = ord.get(l.po_id); if (!o) return;
      const x = g[k] ||= { part: l.part_no || '', name: l.description || '', pos: new Set(), qty: 0, spend: 0, pts: [] };
      x.pos.add(l.po_id); x.qty += +l.qty || 0; x.spend += (+l.qty || 0) * (+l.rate || 0); if (+l.rate) x.pts.push({ d: o.po_date || o.created_at, r: +l.rate, no: poFull(o) }); });
    const rows = Object.values(g).filter(x => x.pts.length).map(x => { x.pts.sort((a, b) => String(a.d).localeCompare(String(b.d))); x.last = x.pts[x.pts.length - 1]; x.first = x.pts[0];
      x.min = Math.min(...x.pts.map(p => p.r)); x.max = Math.max(...x.pts.map(p => p.r)); x.chg = x.first.r ? (x.last.r - x.first.r) / x.first.r * 100 : 0; return x; })
      .sort((a, b) => b.pos.size - a.pos.size || b.spend - a.spend).slice(0, 25);
    return `<section class="panel"><header><h2>Items bought most</h2><span class="meta">${esc(cur)} · price history from the POs · look for price rises and items worth buying in bulk</span></header>
      ${rows.length ? `<div class="tablewrap"><table class="t stack"><thead><tr><th>Part No.</th><th>Item</th><th class="num">POs</th><th class="num">Total qty</th><th class="num">Spent</th><th class="num">Last price</th><th class="num">Lowest</th><th class="num">Highest</th><th class="num">Change</th></tr></thead><tbody>
        ${rows.map(x => `<tr><td class="nowrap">${esc(x.part)}</td><td class="full">${esc(x.name)}<div class="sub">Last on ${esc(x.last.no || '')}${x.last.d ? ' · ' + fd(x.last.d) : ''}</div></td><td class="num">${x.pos.size}</td><td class="num">${fq(x.qty)}</td><td class="num">${poMoney(x.spend, cur)}</td>
          <td class="num"><b>${poNum(x.last.r)}</b></td><td class="num">${poNum(x.min)}</td><td class="num">${poNum(x.max)}</td>
          <td class="num">${x.pts.length > 1 && Math.abs(x.chg) >= .5 ? `<span class="${x.chg > 0 ? 'neg' : 'pos'}">${x.chg > 0 ? '▲' : '▼'} ${Math.abs(x.chg).toFixed(1)}%</span>` : '<span class="sub">—</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="body muted">No lines yet in this period. Old POs added with their lines also count here.</div>'}</section>`;
  },
  bind(main) {
    $$('#ov-cur button', main).forEach(b => b.onclick = () => { this.P.cur = b.dataset.c; render({ quiet: true }); });
    $('#ov-year', main).onchange = e => { this.P.year = e.target.value; render({ quiet: true }); };
  }
};

// ================================================================ SUPPLIERS
const poSuppliersView = {
  async load() {
    await poLookups(true);
    const counts = await q(sb.from('po_orders').select('supplier_name,status,total,currency')).catch(() => []);
    const used = {}; counts.filter(c => !['draft', 'cancelled'].includes(c.status)).forEach(c => { const k = (c.supplier_name || '').trim().toLowerCase(); used[k] = (used[k] || 0) + 1; });
    return topbar('Suppliers', 'Saved automatically the first time a supplier is used on a PO. Correct details here; they fill in on the next PO.', poCanRaise() ? `<button class="btn tagbtn" id="su-add">${ico('plus')}Add supplier</button>` : '') +
      `<section class="panel"><div class="tablewrap"><table class="t stack"><thead><tr><th>Supplier</th><th>Address</th><th>Phone</th><th class="num">POs</th><th>Last used</th><th></th></tr></thead><tbody>
      ${S.po.suppliers.map(s => `<tr><td class="name">${esc(s.name)}</td><td class="full sub">${esc(s.address || '')}</td><td class="sub">${esc(poPhoneText(s.phone, s.fax))}</td><td class="num">${used[s.name.trim().toLowerCase()] || 0}</td><td class="sub nowrap">${s.last_used_at ? fd(s.last_used_at) : '—'}</td>
        <td class="num">${poCanRaise() ? `<button class="btn small" data-su="${s.id}">Edit</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No suppliers yet.</td></tr>'}</tbody></table></div></section>`;
  },
  bind(main) {
    const edit = s => modal({ title: s ? `Edit ${s.name}` : 'Add supplier', submit: 'Save',
      body: `<label class="f">Name<input type="text" name="name" value="${esc(s?.name || '')}" required></label><label class="f">Address<textarea name="address" rows="2">${esc(s?.address || '')}</textarea></label>
        <div class="row2"><label class="f">Phone<input type="tel" name="phone" value="${esc(s?.phone || '')}"></label><label class="f">Fax<input type="tel" name="fax" value="${esc(s?.fax || '')}"></label></div><div class="row2"><label class="f">PAN<input type="text" name="pan" value="${esc(s?.pan || '')}"></label><label class="f">GSTIN<input type="text" name="gstin" value="${esc(s?.gstin || '')}"></label></div>`,
      onSubmit: async x => { await q(sb.rpc('po_save_supplier', { p: { id: s?.id || '', ...x } })); S.po.at = 0; toast('Supplier saved'); render({ quiet: true }); } });
    const a = $('#su-add', main); if (a) a.onclick = () => edit(null);
    $$('[data-su]', main).forEach(b => b.onclick = () => edit(S.po.suppliers.find(s => s.id === +b.dataset.su)));
  }
};

// ================================================================ PO SETTINGS (Developer)
const poSettingsView = {
  async load() {
    if (!isSuper()) return topbar('PO settings') + '<div class="notice">Only the Developer can change the PO settings.</div>';
    await loadLookups();
    const nxt = (setting('po_counter', {}) || {}).next;
    return topbar('PO settings', 'Numbering for purchase orders.') +
      `<div class="notice">The company name and the Abuja and Port Harcourt addresses printed on POs are in <a href="#/settings">Nest admin → Nest settings → Company details</a>.</div>
      <form id="ps-form"><section class="panel"><header><h2>PO numbers</h2></header><div class="body">
        <p>One running number for every service line: <b>GES-{line}-PO-{number}-{year}</b>, for example <b>GES-WI-PO-${esc(nxt || 10038)}-${new Date().getFullYear()}</b>. The number carries on when the year changes.</p>
        <label class="f">Next PO number<span class="hint">Change it only if POs were raised outside Nest. It can’t go below a number Nest has already used.</span><input type="number" name="next_no" value="${esc(nxt || 10038)}" min="1" step="1"></label>
        <h3 class="grp">Service lines</h3><ul class="list">${poMajors().map(l => `<li><div><b>${esc(l.code)}</b> · ${esc(l.name)}<div class="sub">${poSubs(l.id).map(s => esc(s.name)).join(' · ')}</div></div></li>`).join('')}</ul>
        <p class="muted">Service lines are shared with Inventory. Add, rename or archive them in <a href="#/settings#svc">Nest admin → Nest settings → Service lines</a>.</p></div></section>
      <div class="actionrow"><button class="btn primary" type="submit">Save</button></div></form>`;
  },
  bind(main) {
    const f = $('#ps-form', main); if (!f) return;
    f.onsubmit = async e => {
      e.preventDefault(); const x = Object.fromEntries(new FormData(f).entries());
      try { await q(sb.rpc('save_po_settings', { p: { next_no: x.next_no } })); await loadLookups(); toast('PO settings saved'); render({ quiet: true }); }
      catch (ex) { toast(niceError(ex), true); }
    };
  }
};

// ---------------------------------------------------------------- Nest settings → Company details (name and addresses on POs)
function companyPanel() {
  const st = poSettings(); const offs = st.offices || {};
  const off = (k, def) => { const o = offs[k] || {}; return `<div class="po-office"><div class="pjf-sec">${esc(o.label || def)}</div>
    <div class="row2"><label class="f">Name shown in Nest<input type="text" name="${k}_label" value="${esc(o.label || def)}"></label><label class="f">Contact number<input type="text" name="${k}_phone" value="${esc(o.phone || '')}"></label></div>
    <label class="f">Address line 1<input type="text" name="${k}_line1" value="${esc(o.line1 || '')}"></label><label class="f">Address line 2<input type="text" name="${k}_line2" value="${esc(o.line2 || '')}"></label></div>`; };
  return `<form id="co-form"><section class="panel" id="company"><header><h2>Company details</h2><span class="meta">Printed on purchase orders. POs already issued keep the details they were signed with.</span></header><div class="body">
    <div class="row2"><label class="f">Company name<input type="text" name="company" value="${esc(st.company || 'GANKCO ENERGY SERVICES')}"></label>
    <label class="f">Address in the PO header<select name="header_office">${Object.entries(offs).map(([k, o]) => opt(k, o.label || k, st.header_office || 'abuja')).join('')}</select></label></div>
    ${off('abuja', 'Abuja office')}${off('ph', 'Port Harcourt office')}
    <p class="muted">Both offices can be picked as the <b>Deliver to</b> address on a PO, or it can be left blank.</p>
    <div><button class="btn primary" type="submit">Save company details</button></div></div></section></form>`;
}
function bindCompanyPanel(main) {
  const f = $('#co-form', main); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault(); const x = Object.fromEntries(new FormData(f).entries());
    const offices = {}; ['abuja', 'ph'].forEach(k => { offices[k] = { label: x[k + '_label'], line1: x[k + '_line1'], line2: x[k + '_line2'], phone: x[k + '_phone'] }; });
    try { await q(sb.rpc('save_po_settings', { p: { company: x.company, header_office: x.header_office, offices } })); await loadLookups(); toast('Company details saved'); render({ quiet: true }); }
    catch (ex) { toast(niceError(ex), true); }
  };
}

// ================================================================ FROM THE JOB PLANNER'S SHIP-IN LIST
function poFromPlanner(E) {
  const its = new Map((S.items || []).map(i => [i.id, i]));
  const lines = E.lines.filter(l => l.total > 0).map(l => {
    const id = [...l.g.items][0]; const it = its.get(id);
    return { part_no: it?.code || '', description: it ? it.name : `${partName(l.part)} (${l.label})`, qty: l.total, uom: 'EA', rate: l.unit ?? 0, item_id: it ? it.id : null };
  });
  const wi = poMajors().find(x => x.code === 'WI'); const tt = wi && poSubs(wi.id).find(s => /through tubing/i.test(s.name));
  sessionStorage.setItem('nest.po.planner', JSON.stringify({ lines, header: { line_id: wi?.id, sub_line_id: tt?.id || null, currency: 'USD' } }));
  go('#/po/new?from=planner');
}
