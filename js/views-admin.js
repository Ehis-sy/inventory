/* GANKCO Nest — Reports, setup (locations, team, audit, settings, labels), account */
'use strict';

// ================================================================ REPORTS
const REPORT_START = '2024-12-01';
function monthsList() {
  const out = []; const end = monthISO(); let d = new Date(REPORT_START + 'T00:00:00');
  while (true) { const m = monthISO(d); out.push(m); if (m >= end) break; d.setMonth(d.getMonth() + 1); }
  return out.reverse();
}
const addMonths = (m, n) => { const d = new Date(m + 'T00:00:00'); d.setMonth(d.getMonth() + n); return monthISO(d); };
const REP = { type: 'monthly', month: null, year: new Date().getFullYear(), quarter: Math.floor(new Date().getMonth() / 3) + 1, a: null, b: null, changedOnly: true, q: '' };

ROUTES.reports = {
  async load() {
    const months = monthsList(); REP.month ||= months[0]; REP.b ||= months[0]; REP.a ||= months[1] || months[0];
    const years = [...new Set(months.map(m => +m.slice(0, 4)))];
    const ctl = {
      monthly: `<label class="f">Month<select id="r-month">${months.map(m => opt(m, fmonth(m), REP.month)).join('')}</select></label>`,
      quarterly: `<div class="row2"><label class="f">Year<select id="r-year">${years.map(y => opt(y, y, REP.year)).join('')}</select></label>
        <label class="f">Quarter<select id="r-q">${[1, 2, 3, 4].map(n => opt(n, `Q${n} (${['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][n - 1]})`, REP.quarter)).join('')}</select></label></div>`,
      annual: `<label class="f">Year<select id="r-year">${years.map(y => opt(y, y, REP.year)).join('')}</select></label>`,
      compare: `<div class="row2"><label class="f">Compare<select id="r-a">${months.map(m => opt(m, fmonth(m), REP.a)).join('')}</select></label>
        <label class="f">with<select id="r-b">${months.map(m => opt(m, fmonth(m), REP.b)).join('')}</select></label></div>`,
    }[REP.type];
    const data = await this.compute();
    this.data = data;
    const P = this.period(); let so = null;
    if (REP.type !== 'compare') {
      let qy = sb.from('report_signoffs').select('id,ref,status,prepared_by,prepared_name').eq('kind', REP.type).eq('period_from', P.from).neq('status', 'cancelled');
      qy = S.line ? qy.eq('department_id', +S.line) : qy.is('department_id', null);
      so = (await q(qy).catch(() => []))[0] || null;
    }
    this.so = so;
    const mineBack = so && so.status === 'returned' && (so.prepared_by === S.profile.id || isSuper());
    const signBtn = REP.type === 'compare' || S.viewAs ? '' : so && !mineBack ? `<a class="btn" href="#/signoff/${so.id}">${ico('sign')}Sign-off ${esc(so.ref)}</a>`
      : `<button class="btn primary" id="signrep">${ico('sign')}${mineBack ? 'Sign &amp; resubmit ' + esc(so.ref) : 'Sign &amp; submit'}</button>`;
    return topbar('Reports', 'Monthly, quarterly and annual inventory reports, and month-to-month comparison.',
      `<button class="btn" id="xls">${ico('down')}Excel</button><button class="btn tagbtn" id="pdf">${ico('pdf')}PDF report</button>${signBtn}`) + lineChips() +
      `<section class="panel"><div class="body reportctl">
        <div class="seg" id="rtype">${[['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annual', 'Annual'], ['compare', 'Compare months']].map(([k, l]) => `<button data-t="${k}" class="${REP.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="rc">${ctl}</div></div></section>
      ${data.note ? `<div class="notice">${data.note}</div>` : ''}
      ${so ? `<div class="notice ${so.status === 'final' ? 'ok' : so.status === 'returned' ? 'bad' : ''}">This report has a sign-off: <a href="#/signoff/${so.id}"><b>${esc(so.ref)}</b></a> · ${esc(SO_STATUS[so.status][1])}${so.status === 'returned' ? ` to ${esc(so.prepared_name)}${mineBack ? '. Check the figures, then press <b>Sign &amp; resubmit</b>.' : ''}` : ''}${so.status === 'final' ? '. Download the signed PDF from the sign-off page.' : ''}</div>` : ''}
      <div class="board b6">${data.kpis.map(k => `<div class="kpi ${k.tone || ''}"><div class="n">${esc(k.value)}</div><div class="l">${esc(k.label)}</div></div>`).join('')}</div>
      <div class="filters"><input type="search" id="q" placeholder="Search items" value="${esc(REP.q)}">
        <label class="check" style="margin:0"><input type="checkbox" id="chg" ${REP.changedOnly ? 'checked' : ''}> Only items that changed</label><span class="muted" id="shown"></span></div>
      <section class="panel"><div class="tablewrap"><table class="t stack" id="tbl"><thead><tr>${data.cols.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody></tbody></table></div></section>`;
  },
  period() {
    if (REP.type === 'monthly') return { from: REP.month, to: REP.month, label: fmonth(REP.month) };
    if (REP.type === 'quarterly') { const f = `${REP.year}-${String((REP.quarter - 1) * 3 + 1).padStart(2, '0')}-01`; return { from: f, to: addMonths(f, 2), label: `Q${REP.quarter} ${REP.year}` }; }
    if (REP.type === 'annual') return { from: `${REP.year}-01-01`, to: `${REP.year}-12-01`, label: String(REP.year) };
    return { from: REP.a, to: REP.b, label: `${fmonth(REP.a)} vs ${fmonth(REP.b)}` };
  },
  async compute() {
    const its = await items(); const p = this.period(); const L = +S.line || null;
    const inScope = its.filter(i => (!L || i.department_id === L));
    if (REP.type === 'compare') {
      const [A, B] = await Promise.all([q(sb.rpc('month_totals', { p_month: REP.a })), q(sb.rpc('month_totals', { p_month: REP.b }))]);
      const ma = new Map(A.map(r => [r.item_id, r])), mb = new Map(B.map(r => [r.item_id, r]));
      const rows = inScope.map(i => { const a = ma.get(i.id)?.qty, b = mb.get(i.id)?.qty; return { it: i, a: a == null ? null : +a, b: b == null ? null : +b, d: (a != null && b != null) ? b - a : null }; });
      const has = rows.filter(r => r.a != null || r.b != null);
      const sum = k => has.reduce((s, r) => s + (r[k] || 0), 0);
      const noA = !A.some(r => r.qty != null), noB = !B.some(r => r.qty != null);
      return { p, rows, mode: 'compare', cols: [{ h: 'Code' }, { h: 'Description' }, { h: 'Service line' }, { h: fmonth(REP.a), num: true }, { h: fmonth(REP.b), num: true }, { h: 'Change', num: true }],
        note: noA || noB ? `No figures were recorded for ${[noA && fmonth(REP.a), noB && fmonth(REP.b)].filter(Boolean).join(' or ')} (no monthly sheet or count).` : '',
        kpis: [{ label: fmonth(REP.a) + ' total', value: fq(sum('a')) }, { label: fmonth(REP.b) + ' total', value: fq(sum('b')) }, { label: 'Net change', value: (sum('b') - sum('a') > 0 ? '+' : '') + fq(sum('b') - sum('a')) },
          { label: 'Items up', value: fq(rows.filter(r => r.d > 0).length) }, { label: 'Items down', value: fq(rows.filter(r => r.d < 0).length), tone: 'warn' }, { label: 'New / no data', value: fq(rows.filter(r => r.a == null && r.b != null).length) }] };
    }
    const prev = addMonths(p.from, -1); const endTs = addMonths(p.to, 1);
    const [O, C, F] = await Promise.all([q(sb.rpc('month_totals', { p_month: prev })), q(sb.rpc('month_totals', { p_month: p.to })),
      q(sb.rpc('period_flows', { p_from: p.from + 'T00:00:00+01:00', p_to: endTs + 'T00:00:00+01:00' }))]);
    const mo = new Map(O.map(r => [r.item_id, r])), mc = new Map(C.map(r => [r.item_id, r]));
    const fl = {}; F.forEach(f => { (fl[f.item_id] ||= {})[f.type] = +f.qty; });
    const rows = inScope.map(i => {
      const f = fl[i.id] || {}; const o = mo.get(i.id)?.qty, c = mc.get(i.id)?.qty;
      return { it: i, open: o == null ? null : +o, rec: f.receive || 0, used: f.issue || 0, sold: f.sale || 0, lost: (f.lost || 0) - (f.writeoff || 0), adj: f.adjust || 0, out: f.checkout || 0, back: f['return'] || 0, close: c == null ? null : +c };
    });
    const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
    const launched = endTs > '2026-11-01';
    return { p, rows, mode: 'period',
      cols: [{ h: 'Code' }, { h: 'Description' }, { h: 'Service line' }, { h: 'Opening', num: true }, { h: 'Received', num: true }, { h: 'Used', num: true }, { h: 'Sold', num: true }, { h: 'Lost / written off', num: true }, { h: 'Corrections', num: true }, { h: 'Closing', num: true }],
      note: !launched ? 'Movement details are recorded from November 2026, when Nest went live. Earlier periods show opening and closing figures from the monthly Excel sheets.' : (p.from < '2026-11-01' ? 'Movements before November 2026 weren’t recorded item by item; the opening and closing figures come from the monthly Excel sheets.' : ''),
      kpis: [{ label: 'Opening pieces', value: fq(sum('open')) }, { label: 'Received', value: fq(sum('rec')) }, { label: 'Used on jobs', value: fq(sum('used')) }, { label: 'Sold', value: fq(sum('sold')) },
        { label: 'Lost / written off', value: fq(Math.abs(sum('lost'))), tone: sum('lost') ? 'warn' : '' }, { label: 'Closing pieces', value: fq(sum('close')) }] };
  },
  filtered(noSearch) {
    const d = this.data; const qq = noSearch ? '' : REP.q.trim().toLowerCase();
    return d.rows.filter(r => (!qq || `${r.it.code || ''} ${r.it.name}`.toLowerCase().includes(qq)) &&
      (!REP.changedOnly || (d.mode === 'compare' ? (r.d !== 0 && !(r.a == null && r.b == null)) : (r.rec || r.used || r.sold || r.lost || r.adj || (r.open ?? 0) !== (r.close ?? 0)))));
  },
  bind(main) {
    bindLineChips(main);
    const d = this.data;
    $$('#rtype button', main).forEach(b => b.onclick = () => { REP.type = b.dataset.t; render({ quiet: true }); });
    const sel = (id, k, cast = x => x) => { const e = $(id, main); if (e) e.onchange = () => { REP[k] = cast(e.value); render({ quiet: true }); }; };
    sel('#r-month', 'month'); sel('#r-year', 'year', Number); sel('#r-q', 'quarter', Number); sel('#r-a', 'a'); sel('#r-b', 'b');
    const v = x => x == null ? '—' : fq(x);
    const sg = x => x ? (x > 0 ? '+' : '') + fq(x) : '·';
    const draw = () => {
      const rows = this.filtered(); $('#shown', main).textContent = `${rows.length} of ${d.rows.length} items`;
      $('#tbl tbody', main).innerHTML = rows.length ? rows.slice(0, 600).map(r => `<tr class="click" data-id="${r.it.id}"><td>${tag(r.it.code)}</td><td class="full"><div class="name">${esc(r.it.name)}</div></td><td>${esc(r.it.line)}</td>
        ${d.mode === 'compare' ? `<td class="num">${v(r.a)}</td><td class="num">${v(r.b)}</td><td class="num"><b class="${r.d < 0 ? 'neg' : r.d > 0 ? 'pos' : ''}">${r.d == null ? '—' : sg(r.d)}</b></td>`
          : `<td class="num">${v(r.open)}</td><td class="num">${sg(r.rec)}</td><td class="num">${r.used ? fq(r.used) : '·'}</td><td class="num">${r.sold ? fq(r.sold) : '·'}</td><td class="num">${r.lost ? fq(Math.abs(r.lost)) : '·'}</td><td class="num">${sg(r.adj)}</td><td class="num"><b>${v(r.close)}</b></td>`}</tr>`).join('')
        : `<tr><td colspan="${d.cols.length}" class="empty">${REP.changedOnly ? 'No changes in this period. Untick “Only items that changed” to see everything.' : 'No items.'}</td></tr>`;
    };
    $('#tbl tbody', main).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) go('#/item/' + tr.dataset.id); };
    $('#q', main).oninput = debounce(e => { REP.q = e.target.value; draw(); }, 140);
    $('#chg', main).onchange = e => { REP.changedOnly = e.target.checked; draw(); };
    $('#xls', main).onclick = () => reportExport('xlsx', this).catch(e => toast(niceError(e), true));
    $('#pdf', main).onclick = () => reportExport('pdf', this).catch(e => toast(niceError(e), true));
    if ($('#signrep', main)) $('#signrep', main).onclick = async () => {
      try {
        const rows = this.filtered(true); const spec = await reportPdfSpec(this, rows); const p = this.data.p;
        await signAndSubmitReport({ kind: REP.type, from: p.from, to: p.to, label: p.label, title: spec.title, subtitle: spec.subtitle, count: rows.length, changedOnly: REP.changedOnly,
          payload: { kpis: spec.kpis, sections: spec.sections, intro: spec.intro, meta: spec.meta } });
      } catch (e) { console.error(e); toast(niceError(e), true); }
    };
    draw();
  }
};

async function reportExport(kind, view) {
  toast('Preparing your report…');
  const d = view.data; const p = d.p; const rows = view.filtered();
  const title = { monthly: 'Monthly Inventory Report', quarterly: 'Quarterly Inventory Report', annual: 'Annual Inventory Report', compare: 'Inventory Comparison' }[REP.type];
  const scope = S.line ? lineName(S.line) : 'All service lines';
  const lines = S.depts.filter(x => rows.some(r => r.it.department_id === x.id));
  const sg = x => x ? (x > 0 ? '+' : '') + fq(x) : '';
  const mk = r => d.mode === 'compare' ? { code: r.it.code || '', name: r.it.name, cat: r.it.category, a: r.a ?? '', b: r.b ?? '', d: r.d ?? '', _neg: r.d < 0 }
    : { code: r.it.code || '', name: r.it.name, cat: r.it.category, open: r.open ?? '', rec: r.rec || '', used: r.used || '', sold: r.sold || '', lost: r.lost ? Math.abs(r.lost) : '', adj: r.adj || '', close: r.close ?? '' };
  const file = `GANKCO_${title.replace(/ /g, '_')}_${p.label.replace(/[^A-Za-z0-9]+/g, '_')}`;
  // count sign-offs for the period (monthly)
  let signs = [];
  if (REP.type === 'monthly') {
    const cs = await q(sb.from('counts').select('*').eq('month', p.from)).catch(() => []);
    signs = lines.map(l => { const c = cs.find(x => x.department_id === l.id); return [l.short_name || l.name, c ? `${c.state === 'verified' ? 'Verified' : c.state.replace('_', ' ')}${c.submitted_by_name ? ' · counted by ' + c.submitted_by_name : ''}${c.verified_by_name ? ' · verified by ' + c.verified_by_name : ''}` : 'No count recorded']; });
  }
  if (kind === 'xlsx') {
    const columns = d.mode === 'compare'
      ? [{ header: 'Item Code', key: 'code', width: 26, bold: true }, { header: 'Description', key: 'name', width: 52, wrap: true }, { header: 'Category', key: 'cat', width: 26 }, { header: fmonth(REP.a), key: 'a', width: 14, type: 'num' }, { header: fmonth(REP.b), key: 'b', width: 14, type: 'num' }, { header: 'Change', key: 'd', width: 11, type: 'num', bold: true }]
      : [{ header: 'Item Code', key: 'code', width: 26, bold: true }, { header: 'Description', key: 'name', width: 50, wrap: true }, { header: 'Category', key: 'cat', width: 24 }, { header: 'Opening', key: 'open', width: 10, type: 'num' },
        { header: 'Received', key: 'rec', width: 10, type: 'num' }, { header: 'Used', key: 'used', width: 9, type: 'num' }, { header: 'Sold', key: 'sold', width: 9, type: 'num' }, { header: 'Lost / written off', key: 'lost', width: 11, type: 'num' },
        { header: 'Corrections', key: 'adj', width: 11, type: 'num' }, { header: 'Closing', key: 'close', width: 10, type: 'num', bold: true }];
    const totals = d.mode === 'compare' ? ['a', 'b', 'd'] : ['open', 'rec', 'used', 'sold', 'lost', 'adj', 'close'];
    const sheets = [{ name: 'Summary', title, subtitle: `${scope} · ${p.label}`, note: d.note || '', kpis: d.kpis.slice(0, 4),
      columns: [{ header: 'Service line', key: 'line', width: 30 }, { header: 'Items', key: 'n', width: 10, type: 'num' }, ...(d.mode === 'compare'
        ? [{ header: fmonth(REP.a), key: 'a', width: 14, type: 'num' }, { header: fmonth(REP.b), key: 'b', width: 14, type: 'num' }, { header: 'Change', key: 'd', width: 12, type: 'num' }]
        : [{ header: 'Opening', key: 'open', width: 12, type: 'num' }, { header: 'Received', key: 'rec', width: 12, type: 'num' }, { header: 'Used + sold', key: 'us', width: 12, type: 'num' }, { header: 'Closing', key: 'close', width: 12, type: 'num' }]),
        ...(signs.length ? [{ header: 'Monthly count', key: 'count', width: 50, wrap: true }] : [])],
      rows: lines.map(l => { const rs = d.rows.filter(r => r.it.department_id === l.id); const s = k => rs.reduce((a, r) => a + (r[k] || 0), 0);
        return { line: l.name, n: rs.length, a: s('a'), b: s('b'), d: s('b') - s('a'), open: s('open'), rec: s('rec'), us: s('used') + s('sold'), close: s('close'), count: (signs.find(x => x[0] === (l.short_name || l.name)) || [])[1] || '' }; }),
      totals: d.mode === 'compare' ? ['n', 'a', 'b', 'd'] : ['n', 'open', 'rec', 'us', 'close'] },
      ...lines.map(l => ({ name: l.short_name || l.name, title: `${title}: ${l.name}`, subtitle: p.label, columns, rows: rows.filter(r => r.it.department_id === l.id).map(mk), totals,
        cellStyle: (r, k) => (k === 'd' && r._neg) ? 'warn' : null }))];
    await brandXlsx({ file: file + '.xlsx', sheets });
  } else {
    const spec = await reportPdfSpec(view, rows, signs);
    await brandPdf({ ...spec, file: file + '.pdf', meta: [...spec.meta, ['Prepared by', S.profile.full_name || S.profile.email]],
      signatures: [mySignature('Prepared by', `${spec.title} · ${spec.subtitle}`), { label: 'Reviewed by' }, { label: 'Approved by' }] });
  }
}

// The PDF content of a report as plain data (also frozen into a sign-off)
async function reportPdfSpec(view, rows, signs) {
  const d = view.data; const p = d.p;
  const title = { monthly: 'Monthly Inventory Report', quarterly: 'Quarterly Inventory Report', annual: 'Annual Inventory Report', compare: 'Inventory Comparison' }[REP.type];
  const scope = S.line ? lineName(S.line) : 'All service lines';
  const lines = S.depts.filter(x => rows.some(r => r.it.department_id === x.id));
  const sg = x => x ? (x > 0 ? '+' : '') + fq(x) : '';
  if (!signs) {
    signs = [];
    if (REP.type === 'monthly') {
      const cs = await q(sb.from('counts').select('*').eq('month', p.from)).catch(() => []);
      signs = lines.map(l => { const c = cs.find(x => x.department_id === l.id); return [l.short_name || l.name, c ? `${c.state === 'verified' ? 'Verified' : c.state.replace('_', ' ')}${c.submitted_by_name ? ' · counted by ' + c.submitted_by_name : ''}${c.verified_by_name ? ' · verified by ' + c.verified_by_name : ''}` : 'No count recorded']; });
    }
  }
  const mk = r => d.mode === 'compare' ? { code: r.it.code || '', name: r.it.name, a: r.a ?? '', b: r.b ?? '', dd: r.d == null ? '' : sg(r.d), ...(r.d < 0 ? { _st: { dd: 'warn' } } : {}) }
    : { code: r.it.code || '', name: r.it.name, open: r.open ?? '', rec: sg(r.rec), used: r.used || '', sold: r.sold || '', lost: r.lost ? Math.abs(r.lost) : '', adj: sg(r.adj), close: r.close ?? '' };
  const columns = d.mode === 'compare'
    ? [{ header: 'Item Code', dataKey: 'code', width: 44, bold: true }, { header: 'Description', dataKey: 'name' }, { header: fmonth(REP.a), dataKey: 'a', width: 28, align: 'right' }, { header: fmonth(REP.b), dataKey: 'b', width: 28, align: 'right' }, { header: 'Change', dataKey: 'dd', width: 20, align: 'right' }]
    : [{ header: 'Item Code', dataKey: 'code', width: 42, bold: true }, { header: 'Description', dataKey: 'name' }, { header: 'Opening', dataKey: 'open', width: 16, align: 'right' }, { header: 'Received', dataKey: 'rec', width: 17, align: 'right' },
      { header: 'Used', dataKey: 'used', width: 13, align: 'right' }, { header: 'Sold', dataKey: 'sold', width: 13, align: 'right' }, { header: 'Lost / W-off', dataKey: 'lost', width: 22, align: 'right' }, { header: 'Corr.', dataKey: 'adj', width: 13, align: 'right' }, { header: 'Closing', dataKey: 'close', width: 16, align: 'right', bold: true }];
  const sections = [];
  if (signs.length) sections.push({ heading: 'Monthly count sign-off', columns: [{ header: 'Service line', dataKey: 'l', width: 50 }, { header: 'Status', dataKey: 's' }], rows: signs.map(([l, s]) => ({ l, s })) });
  lines.forEach(l => {
    const rs = []; let lastCat = null;
    rows.filter(r => r.it.department_id === l.id).forEach(r => { if (r.it.category !== lastCat) { lastCat = r.it.category; rs.push({ code: r.it.category, _group: true }); } rs.push(mk(r)); });
    sections.push({ heading: l.name, headingNote: plural(rows.filter(r => r.it.department_id === l.id).length, 'item'), columns, rows: rs });
  });
  return { title, subtitle: `${scope} · ${p.label}`, kpis: d.kpis.slice(0, 5), sections, intro: d.note || (REP.changedOnly ? 'Only items that changed during the period are listed.' : ''),
    meta: [['Period', p.label], ['Scope', scope]] };
}

// ================================================================ LOCATIONS & CATEGORIES
const LOC_KINDS = { store: 'Store / base', warehouse: 'Warehouse', yard: 'Yard', site: 'Site / well', truck: 'Truck', vendor: 'Vendor / OEM', other: 'Other' };
ROUTES.locations = {
  async load() {
    if (!isAdmin()) return topbar('Locations') + '<div class="notice">Only admins can manage locations.</div>';
    await loadLookups();
    const stock = await fetchAll(() => sb.from('stock').select('location_id,item_id,qty').gt('qty', 0));
    const by = {}; stock.forEach(s => { (by[s.location_id] ||= { items: new Set(), qty: 0 }); by[s.location_id].items.add(s.item_id); by[s.location_id].qty += +s.qty; });
    return topbar('Locations', 'Bases and stores where stock is kept', `<button class="btn primary" id="addloc">${ico('plus')}Add location</button>`) +
      `<section class="panel"><table class="t stack"><thead><tr><th>Location</th><th>Kind</th><th class="num">Items</th><th class="num">Quantity</th><th></th></tr></thead><tbody>
      ${S.locs.map(l => `<tr><td class="full"><div class="name">${esc(l.name)} ${l.active ? '' : chip('muted', 'Closed')} ${l.is_placeholder ? chip('soon', 'Waiting to be placed') : ''}</div>${l.notes ? `<div class="sub">${esc(l.notes)}</div>` : ''}</td>
        <td>${l.is_placeholder ? '—' : LOC_KINDS[l.kind]}</td><td class="num">${by[l.id]?.items.size || 0}</td><td class="num">${fq(by[l.id]?.qty || 0)}</td>
        <td class="num nowrap"><a class="btn small" href="#/inventory" data-filter="${l.id}">View stock</a>${l.is_placeholder ? '' : ` <button class="btn small link" data-edit="${l.id}">Edit</button>`}${!by[l.id] && !l.is_placeholder ? ` <button class="btn small link danger" data-delloc="${l.id}">Delete</button>` : ''}</td></tr>`).join('')}
      </tbody></table></section>
      ${placeholderLoc() && by[placeholderLoc().id] ? `<div class="notice">${plural(by[placeholderLoc().id].items.size, 'item')} still have no location. Staff can place them from Inventory (select items → Move location) or with the Locations Excel template.</div>` : ''}
      <div class="notice">Types and sub-types (which used to be categories) are in <a href="#/invsettings">Inventory settings</a>. Service lines are in <a href="#/settings#svc">Nest settings</a>.</div>`;
  },
  bind(main) {
    if (!isAdmin()) return;
    const editLoc = l => modal({
      title: l ? 'Edit location' : 'Add location', submit: 'Save',
      body: `<label class="f">Name<input type="text" name="name" value="${esc(l?.name)}" required placeholder="e.g. Onne yard"></label>
        <label class="f">Kind<select name="kind">${Object.entries(LOC_KINDS).map(([k, v]) => opt(k, v, l?.kind || 'store')).join('')}</select></label>
        <label class="f">Notes<textarea name="notes">${esc(l?.notes)}</textarea></label>
        ${l ? `<label class="check"><input type="checkbox" name="active" ${l.active ? 'checked' : ''}> Open (untick to hide it from pick lists)</label>` : ''}`,
      onSubmit: async x => {
        if (!x.name.trim()) throw new Error('Enter a name.');
        const row = { name: x.name.trim(), kind: x.kind, notes: x.notes || null };
        if (l) await q(sb.from('locations').update({ ...row, active: !!x.active }).eq('id', l.id)); else await q(sb.from('locations').insert(row));
        toast('Location saved'); await loadLookups(); invalidate(); render({ quiet: true });
      }
    });
    $('#addloc', main).onclick = () => editLoc(null);
    $$('[data-edit]', main).forEach(b => b.onclick = () => editLoc(S.locs.find(l => l.id === +b.dataset.edit)));
    $$('[data-delloc]', main).forEach(b => b.onclick = async () => {
      const l = S.locs.find(x => x.id === +b.dataset.delloc);
      if (!confirm(`Delete ${l.name} for good? This only works for a location that has never been used.`)) return;
      try { await q(sb.rpc('delete_location', { p_id: l.id })); toast(`${l.name} deleted`); await loadLookups(); render({ quiet: true }); } catch (e) { toast(niceError(e), true); }
    });
    $$('[data-filter]', main).forEach(b => b.onclick = () => { Object.assign(S.inv, { loc: b.dataset.filter, view: 'all', cat: '', q: '' }); });
  }
};

// ================================================================ TEAM
const APP_LIST = [['inventory', 'Inventory'], ['po', 'Purchase Order'], ['people', 'PeopleCore']];
ROUTES.team = {
  async load() {
    if (!isAdmin()) return topbar('Team') + '<div class="notice">Only admins can manage the team.</div>';
    await loadLookups();
    const people = Object.values(S.people).sort((a, b) => (a.role === 'pending' ? 0 : 1) - (b.role === 'pending' ? 0 : 1) || (a.full_name || a.email).localeCompare(b.full_name || b.email));
    const linesOf = id => S.members.filter(m => m.profile_id === id).map(m => m.department_id);
    const pending = people.filter(p => p.role === 'pending');
    const admins = people.filter(p => ['admin', 'superadmin'].includes(p.role));
    const dom = (CFG.SIGNUP_DOMAIN || '').toLowerCase();
    // 3.0: staff without a company email who signed up with the email on their PeopleCore record are fine as they are
    const hrLinked = new Set(isSuper() ? (await q(sb.from('hr_employees').select('profile_id').not('profile_id', 'is', null)).catch(() => [])).map(x => x.profile_id) : []);
    const offDomain = dom ? people.filter(p => !String(p.email || '').toLowerCase().endsWith('@' + dom) && p.role !== 'disabled' && !hrLinked.has(p.id)) : [];
    this.offDomain = offDomain;
    const roleOpts = p => isSuper() ? ['pending', 'staff', 'admin', 'management', 'superadmin', 'disabled'] : (['pending', 'staff', 'disabled'].includes(p.role) ? ['pending', 'staff', 'disabled'] : null);
    return topbar('Team', isSuper() ? 'Approve people, choose their access and service lines, and set who approves for each line.' : 'Approve new staff and assign them to the service lines you look after.') +
      `<div class="notice ok">To add someone, send them this link and ask them to create an account: <b>${esc(location.origin + location.pathname)}</b>. They’ll appear here for approval.</div>
      ${offDomain.length && isSuper() ? `<div class="notice">${plural(offDomain.length, 'account')} ${offDomain.length === 1 ? 'isn’t' : 'aren’t'} on a GANKCO email address (@${esc(dom)}). They keep working, but should be moved to their company email. Press <b>Fix email</b> next to each one.</div>` : ''}
      ${people.some(p => !['pending', 'disabled'].includes(p.role) && !p.job_title && canEditTitle(p)) ? `<div class="notice">Some people have <b>no job title</b> yet. It’s printed under their name when they sign documents, so set it with <b>Set</b> in the Job title column.</div>` : ''}
      ${pending.length ? `<section class="panel"><header><h2>Waiting for approval</h2><span class="meta">${pending.length}</span></header><ul class="list">
        ${pending.map(p => `<li><div style="flex:1"><div class="name">${esc(p.full_name || '—')}</div><div class="sub">${esc(p.email)} · signed up ${fd(p.created_at)}</div></div>
          <div class="end"><button class="btn small tagbtn" data-approve="${p.id}">Approve</button> <button class="btn small" data-deny="${p.id}">Deny</button></div></li>`).join('')}</ul></section>` : ''}
      <section class="panel"><header><h2>Everyone</h2><span class="meta">${people.length}</span></header><div class="tablewrap"><table class="t stack"><thead><tr><th>Name</th><th>Job title</th><th>Email</th><th>Access</th><th>Service lines</th><th>Apps</th><th>Signature</th><th></th></tr></thead><tbody>
      ${people.map(p => { const ro = roleOpts(p); const ls = linesOf(p.id);
        const off = offDomain.includes(p);
        const act = !['pending', 'disabled'].includes(p.role);
        return `<tr><td class="full"><div class="name">${esc(p.full_name || '—')}${p.id === S.profile.id ? ' <span class="sub">(you)</span>' : ''}</div></td>
        <td>${p.job_title ? esc(p.job_title) : act ? chip('soon', 'No job title') : '<span class="sub">—</span>'}${canEditTitle(p) ? ` <button class="btn small link" data-title="${p.id}">${p.job_title ? 'Edit' : 'Set'}</button>` : ''}</td><td>${esc(p.email)}${off ? ' ' + chip('soon', 'Not a GANKCO email') : ''}</td>
        <td>${ro && p.id !== S.profile.id ? `<select data-role="${p.id}" class="inline">${ro.map(k => opt(k, ROLE_LABEL[k], p.role)).join('')}</select>` : chip(p.role === 'superadmin' ? 'out' : p.role === 'admin' ? 'reserved' : p.role === 'management' ? 'soon' : 'muted', ROLE_LABEL[p.role])}</td>
        <td>${p.role === 'superadmin' ? '<span class="sub">All lines</span>' : ls.length ? ls.map(d => `<span class="linebadge">${esc(lineShort(d))}</span>`).join(' ') : '<span class="sub">None</span>'}</td>
        <td class="apps-cell">${p.role === 'superadmin' ? '<span class="sub">All apps</span>' : p.role === 'disabled' ? '<span class="sub">—</span>'
          : APP_LIST.map(([k, l]) => { const on = (p.apps || []).includes(k); const can = isSuper() || ['staff', 'pending'].includes(p.role);
            return `<label class="appchk ${on ? 'on' : ''}" title="${esc(l)}${p.role === 'management' ? ' (view only)' : ''}"><input type="checkbox" data-app="${k}" data-pid="${p.id}" ${on ? 'checked' : ''} ${can ? '' : 'disabled'}>${esc(l)}</label>`; }).join('')}</td>
        <td>${p.signature_id ? chip('ok', 'Added') : '<span class="sub">Not added</span>'}${p.signature_id && isSuper() && p.id !== S.profile.id ? ` <button class="btn small link danger" data-unsig="${p.id}">Remove</button>` : ''}</td>
        <td class="num nowrap">${off && isSuper() ? `<button class="btn small" data-fix="${p.id}">Fix email</button> ` : ''}${p.role !== 'superadmin' && (isSuper() || ['staff', 'pending', 'disabled'].includes(p.role)) ? `<button class="btn small" data-lines="${p.id}">Lines</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div></section>
      ${(() => {
        const mine = S.depts.filter(d => canAdmin(d.id));
        const rows = mine.flatMap(d => S.members.filter(m => m.department_id === d.id && S.people[m.profile_id]?.role === 'staff').map(m => ({ d, m, p: S.people[m.profile_id] })));
        return mine.length ? `<section class="panel"><header><h2>Who can receive PO deliveries</h2><span class="meta">Purchase Order app</span></header>
          <div class="body muted">Each line’s admins can always book goods received against a PO into stock. Switch it on for staff too, for example a storekeeper.</div>
          ${rows.length ? `<div class="tablewrap"><table class="t stack"><thead><tr><th>Service line</th><th>Staff</th><th>Receive PO deliveries</th></tr></thead><tbody>
          ${rows.map(({ d, m, p }) => `<tr><td>${esc(d.short_name || d.name)}</td><td class="name">${esc(p.full_name || p.email)}</td><td><label class="switch mini"><input type="checkbox" data-porecv="${p.id}" data-dept="${d.id}" ${m.po_receive ? 'checked' : ''}><span class="sw"></span><span class="sub">${m.po_receive ? 'Yes' : 'No'}</span></label></td></tr>`).join('')}</tbody></table></div>` : '<div class="body"><span class="sub">No staff in your service lines yet.</span></div>'}</section>` : '';
      })()}
      ${isSuper() ? `<section class="panel"><header><h2>Who approves for each service line</h2></header><div class="tablewrap"><table class="t stack"><thead><tr><th>Service line</th><th>Main admin</th><th>Backup admin</th></tr></thead><tbody>
        ${S.depts.map(d => `<tr><td class="name">${esc(d.name)}</td>
          <td><select data-main="${d.id}" class="inline"><option value="">Any admin of the line</option>${admins.map(a => opt(a.id, a.full_name || a.email, d.main_admin)).join('')}</select></td>
          <td><select data-backup="${d.id}" class="inline"><option value="">None</option>${admins.map(a => opt(a.id, a.full_name || a.email, d.backup_admin)).join('')}</select></td></tr>`).join('')}
        </tbody></table></div><div class="body muted">Approval requests and alerts for a line go to its main and backup admin. As Super Admin you can approve anything.</div></section>` : ''}
      <section class="panel"><div class="body"><b>What each role can do</b>
        <dl class="kv mt"><dt>Staff</dt><dd>Day-to-day work in their own service line(s): check out and in, materials requests, receive, move between locations, issue and sell, monthly counts and certificates. Quantity corrections and kit details go to their admin for approval. Staff can see all stock but don’t see Setup.</dd>
        <dt>Admin</dt><dd>Everything staff can do, plus approving requests and managing items for their service lines, locations, labels, approving new staff, and the audit log for their lines.</dd>
        <dt>Management</dt><dd>View-only: Overview, Inventory, Job planner, Reports and Sign-offs, including prices. Can download reports but can’t change anything. Only the Super Admin can give this access.</dd>
        <dt>Super Admin</dt><dd>Everything, in every service line and every app: making admins, choosing who approves for each line, settings, and the full audit log.</dd>
        <dt>Apps</dt><dd>Tick the apps each person can open. Someone without Inventory can’t open it or read its data, even by typing the web address. In the Purchase Order app they can still pick Inventory items onto a PO (code, name and unit only).</dd></dl></div></section>`;
  },
  bind(main) {
    if (!isAdmin()) return;
    const editLines = (pid, approveAfter) => {
      const p = S.people[pid]; const cur = S.members.filter(m => m.profile_id === pid).map(m => m.department_id);
      return modal({ title: approveAfter ? `Approve ${p.full_name || p.email}` : `Service lines for ${p.full_name || p.email}`, submit: approveAfter ? 'Approve as staff' : 'Save',
        sub: approveAfter ? 'Choose which service line(s) they work in. They can then sign in straight away.' : 'They can change stock only in these lines.',
        body: S.depts.map(d => `<label class="check"><input type="checkbox" name="d${d.id}" ${cur.includes(d.id) ? 'checked' : ''} ${canAdmin(d.id) ? '' : 'disabled'}> ${esc(d.name)}${canAdmin(d.id) ? '' : ' <span class="sub">(not one of your lines)</span>'}</label>`).join('')
          + (approveAfter ? `<div class="pjf-sec">Apps they can use</div>${APP_LIST.map(([k, l]) => `<label class="check"><input type="checkbox" name="app_${k}" ${(p.apps || ['inventory', 'po', 'people']).includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}` : ''),
        onSubmit: async x => {
          const ids = S.depts.filter(d => x['d' + d.id] || (!canAdmin(d.id) && cur.includes(d.id))).map(d => d.id);
          if (approveAfter && !ids.length) throw new Error('Pick at least one service line.');
          await q(sb.rpc('set_user_lines', { p_user: pid, p_depts: ids }));
          if (approveAfter) {
            if (!APP_LIST.some(([k]) => x['app_' + k])) throw new Error('Tick at least one app.');
            for (const [k] of APP_LIST) await q(sb.rpc('set_app_access', { p_user: pid, p_app: k, p_on: !!x['app_' + k] }));
            await q(sb.rpc('set_user_role', { p_user: pid, p_role: 'staff' }));
          }
          toast(approveAfter ? 'Approved' : 'Service lines saved'); await loadLookups(); render({ quiet: true });
        } });
    };
    $$('[data-approve]', main).forEach(b => b.onclick = () => editLines(b.dataset.approve, true));
    $$('[data-deny]', main).forEach(b => b.onclick = async () => { if (!confirm('Deny access to this person?')) return; await q(sb.rpc('set_user_role', { p_user: b.dataset.deny, p_role: 'disabled' })); toast('Access denied'); render({ quiet: true }); });
    $$('[data-lines]', main).forEach(b => b.onclick = () => editLines(b.dataset.lines, false));
    $$('[data-fix]', main).forEach(b => b.onclick = () => fixEmail(S.people[b.dataset.fix]));
    $$('[data-title]', main).forEach(b => b.onclick = () => editJobTitle(S.people[b.dataset.title]));
    $$('[data-app]', main).forEach(c => c.onchange = async () => {
      const l = APP_LIST.find(a => a[0] === c.dataset.app)[1];
      try { await q(sb.rpc('set_app_access', { p_user: c.dataset.pid, p_app: c.dataset.app, p_on: c.checked })); toast(c.checked ? `${l} switched on` : `${l} switched off`); await loadLookups(); render({ quiet: true }); }
      catch (e) { c.checked = !c.checked; toast(niceError(e), true); }
    });
    $$('[data-porecv]', main).forEach(c => c.onchange = async () => {
      try { await q(sb.rpc('set_po_receiver', { p_user: c.dataset.porecv, p_dept: +c.dataset.dept, p_on: c.checked })); toast(c.checked ? 'Can receive PO deliveries' : 'Switched off'); await loadLookups(); render({ quiet: true }); }
      catch (e) { c.checked = !c.checked; toast(niceError(e), true); }
    });
    $$('[data-unsig]', main).forEach(b => b.onclick = async () => {
      const p = S.people[b.dataset.unsig]; if (!confirm(`Remove ${p.full_name || p.email}’s signature? Documents they already signed keep it.`)) return;
      try { await q(sb.rpc('remove_signature', { p_user: p.id })); toast('Signature removed'); await loadLookups(); render({ quiet: true }); } catch (e) { toast(niceError(e), true); }
    });
    $$('[data-role]', main).forEach(s => s.onchange = async () => {
      const prev = S.people[s.dataset.role].role;
      try { await q(sb.rpc('set_user_role', { p_user: s.dataset.role, p_role: s.value })); toast(`Access changed to ${ROLE_LABEL[s.value]}`); await loadLookups(); render({ quiet: true }); }
      catch (e) { toast(niceError(e), true); s.value = prev; }
    });
    const upd = async (id, field, val) => { try { await q(sb.from('departments').update({ [field]: val || null }).eq('id', id)); toast('Saved'); await loadLookups(); } catch (e) { toast(niceError(e), true); } };
    $$('[data-main]', main).forEach(s => s.onchange = () => upd(+s.dataset.main, 'main_admin', s.value));
    $$('[data-backup]', main).forEach(s => s.onchange = () => upd(+s.dataset.backup, 'backup_admin', s.value));
  }
};

// ================================================================ AUDIT LOG
const AUDIT_TABLES = { po_orders: 'Purchase orders', po_receipts: 'PO deliveries received', po_suppliers: 'Suppliers', stock: 'Stock movements', items: 'Items', units: 'Serials & kit numbers', unit_components: 'Kit component expiry', kit_components: 'Kit components', certifications: 'Certificates',
  locations: 'Locations', departments: 'Service lines', categories: 'Categories', profiles: 'People & access', memberships: 'Team membership', jobs: 'Materials requests', job_lines: 'Materials request lines', job_sections: 'Request approvals by line',
  change_batches: 'Requests & approvals', counts: 'Monthly counts', app_settings: 'Settings', report_signoffs: 'Report sign-offs', sign_events: 'Signatures on documents', documents: 'Signed downloads', signatures: 'Signature uploads', plan_jobs: 'Job planner', item_prices: 'Prices' };
const AUDIT_NOUN = { po_orders: 'Purchase order', po_receipts: 'PO delivery', po_suppliers: 'Supplier', po_service_lines: 'Service line', inv_subtypes: 'Sub-type', items: 'Item', units: 'Serial / kit number', unit_components: 'Kit component expiry', kit_components: 'Kit component', certifications: 'Certificate', locations: 'Location', departments: 'Team', categories: 'Category', profiles: 'Person', memberships: 'Service-line membership', jobs: 'Materials request', job_lines: 'Materials request line', job_sections: 'Materials request line approval', change_batches: 'Request', counts: 'Monthly count', app_settings: 'Setting', report_signoffs: 'Report sign-off', sign_events: 'Document', documents: 'Document', signatures: 'Signature', plan_jobs: 'Planned job', item_prices: 'Price' };
const FIELD_LABEL = { sub_line_id: 'Sub service line', subtype_id: 'Sub-type', for_po: 'Used on POs', parent_id: 'Service line', profile_id: 'Person', name: 'Description', code: 'Item code', min_qty: 'Reorder at', max_qty: 'Restock up to', item_type: 'Type', unit: 'Unit', supplier: 'Supplier', notes: 'Notes', active: 'Active', role: 'Access',
  state: 'Status', department_id: 'Team', category_id: 'Category', is_kit: 'Redress kit', serial_no: 'Serial / kit no.', lot_no: 'Lot', expiry_on: 'Expiry', due_on: 'Due', cert_no: 'Certificate no.',
  title: 'Job', status: 'Status', requester_name: 'Requester', requester_id: 'Requester', main_admin: 'Main admin', backup_admin: 'Backup admin', full_name: 'Name', value: 'Value', qty: 'Qty', location_id: 'Location', decision_note: 'Note', kind: 'Type', superseded: 'Superseded', job_title: 'Job title', signature_id: 'Signature', step: 'Step', document: 'Document', signature: 'Signature', removed_at: 'Removed', return_note: 'Return note', period_label: 'Period', ref: 'Ref', received_by_name: 'Receipt confirmed by', received_at: 'Receipt confirmed' };
const AUDIT_SKIP = ['item_type', 'requester_id', 'id', 'created_at', 'updated_at', 'import_ref', 'payload', 'created_by', 'decided_by', 'submitted_by', 'decided_at', 'submitted_at', 'verified_at', 'dispatched_at', 'closed_at', 'started_at', 'checkout_id', 'sort', 'apps', 'user_id', 'prepared_by', 'verified_by', 'updated_at', 'prepared_at', 'reviewed_at', 'approved_at', 'returned_at', 'period_from', 'period_to', 'removed_by_name'];
const auditVal = (k, v) => v === null || v === undefined || v === '' ? '—' : k === 'department_id' ? lineShort(v) : k === 'sub_line_id' || k === 'parent_id' ? svcLabel(v) : k === 'subtype_id' ? (subtypeName(v) || v) : k === 'kind' && KINDS[v] ? KINDS[v] : k === 'location_id' || k === 'base_location_id' ? locName(v)
  : k === 'category_id' ? (S.cats.find(c => c.id === +v)?.name || v) : ['main_admin', 'backup_admin', 'profile_id'].includes(k) ? personName(v, v) : k === 'role' ? (ROLE_LABEL[v] || v) : k === 'signature_id' ? 'Uploaded' : k === 'status' && SO_STATUS[v] ? SO_STATUS[v][1]
  : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'object' ? JSON.stringify(v) : String(v);
const AUD = { who: '', table: '', from: '', to: '', q: '', rows: [], moves: [], done: false };
ROUTES.audit = {
  async fetch(reset) {
    if (reset) { AUD.rows = []; AUD.moves = []; AUD.done = false; }
    const lim = 200;
    let a = sb.from('audit_log').select('*').order('at', { ascending: false }).range(AUD.rows.length, AUD.rows.length + lim - 1);
    let m = sb.from('movements').select('*, items(code,name,department_id)').order('created_at', { ascending: false }).range(AUD.moves.length, AUD.moves.length + lim - 1);
    if (AUD.who) { a = a.eq('user_id', AUD.who); m = m.eq('user_id', AUD.who); }
    if (AUD.from) { a = a.gte('at', AUD.from + 'T00:00:00'); m = m.gte('created_at', AUD.from + 'T00:00:00'); }
    if (AUD.to) { a = a.lte('at', AUD.to + 'T23:59:59'); m = m.lte('created_at', AUD.to + 'T23:59:59'); }
    if (AUD.table && AUD.table !== 'stock') a = a.eq('table_name', AUD.table);
    const [ra, rm] = await Promise.all([AUD.table === 'stock' ? [] : q(a), AUD.table && AUD.table !== 'stock' ? [] : q(m)]);
    AUD.rows.push(...ra); AUD.moves.push(...rm); if (ra.length < lim && rm.length < lim) AUD.done = true;
  },
  feed() {
    const its = new Map((S.items || []).map(i => [i.id, i]));
    const a = AUD.rows.map(r => {
      const changes = r.action === 'update' ? Object.keys(r.new_data || {}).filter(k => !AUDIT_SKIP.includes(k)).map(k => ({ k, o: auditVal(k, r.old_data?.[k]), n: auditVal(k, r.new_data?.[k]) })) : [];
      const data = r.new_data || r.old_data || {};
      const itemId = r.table_name === 'items' ? +r.record_id : data.item_id;
      const subject = r.summary || (itemId && its.get(+itemId)?.name) || (r.table_name === 'memberships' ? `${personName(data.profile_id, '')} · ${lineShort(data.department_id)}` : '') || `#${r.record_id}`;
      const verb = { insert: 'added', update: 'changed', delete: 'removed', signed: 'signed' }[r.action] || r.action;
      return { fresh: AUD.fresh?.has(r.id), at: r.at, who: r.user_name, line: r.department_id, what: `${AUDIT_NOUN[r.table_name] || r.table_name} ${verb}`, subject, changes, link: itemId ? `#/item/${itemId}` : r.table_name === 'report_signoffs' ? `#/signoff/${r.record_id}` : r.table_name === 'jobs' ? `#/job/${r.record_id}` : (r.table_name === 'job_sections' || r.table_name === 'job_lines') && data.job_id ? `#/job/${data.job_id}` : '',
        detail: r.action !== 'update' ? Object.entries(data).filter(([k, v]) => !AUDIT_SKIP.includes(k) && v !== null && v !== '').slice(0, 6).map(([k, v]) => `${FIELD_LABEL[k] || k}: ${auditVal(k, v)}`).join(' · ') : '' };
    });
    const m = AUD.moves.map(x => ({ at: x.created_at, who: x.user_name, line: x.items?.department_id, what: 'Stock movement', subject: `${x.items?.code || ''} ${x.items?.name || ''}`.trim(), changes: [], link: `#/item/${x.item_id}`, detail: describeMove(x) + (x.notes ? ' · ' + x.notes : '') }));
    const qq = AUD.q.trim().toLowerCase();
    return [...a, ...m].filter(r => (!S.line || r.line === +S.line) && (!qq || `${r.who} ${r.what} ${r.subject} ${r.detail} ${r.changes.map(c => c.o + ' ' + c.n).join(' ')}`.toLowerCase().includes(qq)))
      .sort((x, y) => x.at < y.at ? 1 : -1);
  },
  async load() {
    if (!isAdmin()) return topbar('Audit log') + '<div class="notice">Only admins can see the audit log.</div>';
    await Promise.all([this.fetch(true), items()]);
    const people = Object.values(S.people).sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
    return topbar('Audit log', `Every change, who made it and when${isSuper() ? '' : ' (your service lines)'}. Item edits show the value before and after.`, `<span class="live-dot" id="aud-live" title="New changes appear here as they happen">Live</span><button class="btn" id="xls">${ico('down')}Excel</button>`) + lineChips() +
      `<div class="filters"><select id="who"><option value="">Everyone</option>${people.map(p => opt(p.id, p.full_name || p.email, AUD.who)).join('')}</select>
        <select id="tbl"><option value="">All kinds of change</option>${Object.entries(AUDIT_TABLES).map(([k, v]) => opt(k, v, AUD.table)).join('')}</select>
        <input type="date" id="from" value="${esc(AUD.from)}" class="dateinp" aria-label="From"><input type="date" id="to" value="${esc(AUD.to)}" class="dateinp" aria-label="To">
        <input type="search" id="q" placeholder="Search" value="${esc(AUD.q)}"></div>
      <section class="panel"><ul class="list audit" id="list"></ul><div class="body" id="more"></div></section>`;
  },
  bind(main) {
    if (!isAdmin()) return;
    bindLineChips(main, () => draw());
    const draw = () => {
      $$('#lines button', main).forEach(b => b.classList.toggle('on', b.dataset.l === S.line));
      const rows = this.feed();
      $('#list', main).innerHTML = rows.length ? rows.slice(0, 600).map(r => `<li class="${r.fresh ? 'fresh' : ''}"><div class="aud-who"><b>${esc(r.who || 'System')}</b><span class="sub">${fdt(r.at)}</span></div>
        <div class="aud-body"><div><span class="aud-what">${esc(r.what)}</span> ${r.link ? `<a href="${r.link}">${esc(r.subject)}</a>` : `<b>${esc(r.subject)}</b>`} ${r.line ? `<span class="linebadge">${esc(lineShort(r.line))}</span>` : ''}</div>
        ${r.changes.length ? `<div class="diffs">${r.changes.map(c => `<span class="diff"><span class="k">${esc(FIELD_LABEL[c.k] || c.k)}</span> <s>${esc(c.o)}</s> → <b>${esc(c.n)}</b></span>`).join('')}</div>` : ''}
        ${r.detail ? `<div class="sub">${esc(r.detail)}</div>` : ''}</div></li>`).join('') : '<li class="empty">Nothing recorded for these filters.</li>';
      $('#more', main).innerHTML = AUD.done ? '' : '<button class="btn" id="lm">Load older</button>';
      $$('#list li.fresh', main).forEach(li => setTimeout(() => li.classList.remove('fresh'), 2500));
      const lm = $('#lm', main); if (lm) lm.onclick = async () => { lm.disabled = true; await this.fetch(false); draw(); };
    };
    const re = () => render({ quiet: true });
    $('#who', main).onchange = e => { AUD.who = e.target.value; re(); };
    $('#tbl', main).onchange = e => { AUD.table = e.target.value; re(); };
    $('#from', main).onchange = e => { AUD.from = e.target.value; re(); };
    $('#to', main).onchange = e => { AUD.to = e.target.value; re(); };
    $('#q', main).oninput = debounce(e => { AUD.q = e.target.value; draw(); }, 150);
    this.draw = draw; AUD.seenAt = Date.now(); auditLiveState();
    $('#xls', main).onclick = () => brandXlsx({ file: `GANKCO_Audit_log_${localISO(0)}.xlsx`, sheets: [{ name: 'Audit log', title: 'Audit log', subtitle: `${S.line ? lineName(S.line) : 'All service lines'}${AUD.who ? ' · ' + personName(AUD.who) : ''}`,
      columns: [{ header: 'When', key: 'at', width: 18 }, { header: 'Who', key: 'who', width: 20 }, { header: 'Service line', key: 'line', width: 13 }, { header: 'What', key: 'what', width: 26 }, { header: 'Record', key: 'subject', width: 40, wrap: true },
        { header: 'Before → after / details', key: 'det', width: 70, wrap: true }],
      rows: this.feed().map(r => ({ at: new Date(r.at).toLocaleString('en-GB'), who: r.who, line: r.line ? lineShort(r.line) : '', what: r.what, subject: r.subject, det: r.changes.length ? r.changes.map(c => `${FIELD_LABEL[c.k] || c.k}: ${c.o} → ${c.n}`).join('; ') : r.detail })) }] }).catch(e => toast(niceError(e), true));
    draw();
  }
};

// ================================================================ SETTINGS
// Nest settings (2.8): apply to every app
ROUTES.settings = {
  async load() {
    if (!isSuper()) return topbar('Nest settings') + '<div class="notice">Only the Super Admin can change settings.</div>';
    await loadLookups();
    return topbar('Nest settings', 'These apply to every app. Each app’s own settings are in that app’s menu: Inventory settings, and PO settings in the Purchase Order app.') +
      `${typeof companyPanel === 'function' ? companyPanel() : ''}${await svcPanel()}${await alertsPanel()}${maintPanel()}${backupPanel()}`;
  },
  bind(main) { if (typeof bindCompanyPanel === 'function') bindCompanyPanel(main); bindSvcPanel(main); bindBackup(main); bindAlertsPanel(main); bindMaintPanel(main);
    if (location.hash.includes('#svc')) setTimeout(() => $('#svc', main)?.scrollIntoView({ block: 'start' }), 50); }
};
// Inventory settings (2.8): count dates, warnings and the QMS form details
ROUTES.invsettings = {
  async load() {
    if (!isAdmin()) return topbar('Inventory settings') + '<div class="notice">Only admins and the Super Admin can change Inventory settings.</div>';
    await loadLookups(); await items();
    const s = k => esc(setting(k, ''));
    return topbar('Inventory settings', 'These apply to everyone using Inventory.') + subtypePanel() + (!isSuper() ? '' : `<form id="sf" class="cols">
      <section class="panel"><header><h2>Monthly count</h2></header><div class="body">
        <div class="row2"><label class="f">Count opens on day<input type="number" min="1" max="28" name="count_open_day" value="${s('count_open_day')}"></label>
        <label class="f">Deadline (end of day)<input type="number" min="1" max="28" name="count_close_day" value="${s('count_close_day')}"></label></div></div></section>
      <section class="panel"><header><h2>Alerts</h2></header><div class="body">
        <div class="row2"><label class="f">Warn about kit expiry (days ahead)<input type="number" min="1" name="kit_warn_days" value="${s('kit_warn_days')}"></label>
        <label class="f">Warn about certificates (days ahead)<input type="number" min="1" name="cert_warn_days" value="${s('cert_warn_days')}"></label></div></div></section>
      <section class="panel"><header><h2>QMS form details on reports</h2></header><div class="body">
        <label class="f">Ref No.<input type="text" name="form_ref" value="${s('form_ref')}"></label>
        <div class="row2"><label class="f">Issue date<input type="text" name="form_issue" value="${s('form_issue')}"></label><label class="f">Revision<input type="text" name="form_revision" value="${s('form_revision')}"></label></div></div></section>
      <div><button class="btn primary" type="submit">Save settings</button></div></form>`);
  },
  bind(main) {
    bindSubtypePanel(main);
    const f = $('#sf', main); if (!f) return;
    f.onsubmit = async e => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(f));
      if (+d.count_open_day > +d.count_close_day) return toast('The count must open before the deadline.', true);
      const rows = Object.entries(d).map(([key, v]) => ({ key, value: ['form_ref', 'form_issue', 'form_revision'].includes(key) ? String(v) : +v }));
      try { await q(sb.from('app_settings').upsert(rows)); await loadLookups(); toast('Settings saved'); } catch (ex) { toast(niceError(ex), true); }
    };
  }
};

// ================================================================ BACKUPS (2.5)
const lastBackup = () => { const v = setting('last_backup', null); return v && v.at ? v : null; };
const backupDue = () => { const b = lastBackup(); if (!b) return true; const ym = d => d.getFullYear() * 12 + d.getMonth(); return ym(new Date(b.at)) < ym(new Date()); };
function backupPanel() {
  const b = lastBackup(), due = backupDue();
  const next = new Date(); next.setMonth(next.getMonth() + (due ? 0 : 1), 1);
  return `<section class="panel" id="backups"><header><h2>Backups</h2>${due ? chip('overdue', 'Due this month') : chip('ok', 'Up to date')}</header><div class="body">
    <p class="muted">A backup is one file with everything in Nest: items, stock, movements, materials requests, counts, sign-offs, signatures, prices, the job planner, users and the audit log. Download one at the start of every month and save it in the <b>Nest Backups</b> folder in the Nest Gmail’s Google Drive.</p>
    <dl class="kv"><dt>Last backup</dt><dd>${b ? `${fdt(b.at)}${b.by_name ? ' · ' + esc(b.by_name) : ''}` : '<span class="sub">None yet</span>'}</dd>
      <dt>Next due</dt><dd>${due ? 'Now' : `1 ${next.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`}</dd></dl>
    <div class="actionrow mt"><button class="btn primary" type="button" id="bk-dl">${ico('down')}Download backup</button></div>
    <h3 class="mt">Restore from a backup</h3>
    <p class="muted">Only needed if data is lost or badly damaged. Nest turns a backup file into a restore script that you run in Supabase. <b>Restoring replaces all Nest data with what was in the backup</b>: anything entered after that backup is lost. Sign-in accounts aren’t affected. Follow the handover guide, step by step.</p>
    <div class="actionrow"><button class="btn" type="button" id="bk-rs">${ico('up')}Make restore script from a backup file</button></div></div></section>`;
}
function bindBackup(main) {
  const dl = $('#bk-dl', main), rs = $('#bk-rs', main);
  if (dl) dl.onclick = async () => {
    const t = dl.innerHTML; dl.disabled = true; dl.textContent = 'Preparing backup…';
    try {
      const data = await q(sb.rpc('export_backup'));
      const rows = Object.values(data.row_counts || {}).reduce((a, b) => a + b, 0);
      saveBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `gankco-nest-backup-${localISO(0)}.json`);
      await loadLookups(); refreshAlerts();
      toast(`Backup downloaded: ${plural(Object.keys(data.tables || {}).length, 'table')}, ${rows.toLocaleString()} records. Save it to Nest Backups in Google Drive.`);
      render({ quiet: true });
    } catch (e) { toast(niceError(e), true); dl.disabled = false; dl.innerHTML = t; }
  };
  if (rs) rs.onclick = () => modal({
    title: 'Make restore script', submit: 'Make script',
    sub: 'Choose a Nest backup file (gankco-nest-backup-….json). Nothing changes in Nest yet: this only makes the script.',
    body: '<label class="f">Backup file<input type="file" accept=".json,application/json" required></label>',
    onSubmit: async (x, d) => {
      const file = $('input[type=file]', d).files[0]; if (!file) throw new Error('Choose the backup file.');
      let data; try { data = JSON.parse(await file.text()); } catch { throw new Error('That file isn’t a Nest backup.'); }
      if (data.format !== 'gankco-nest-backup' || !data.tables) throw new Error('That file isn’t a Nest backup.');
      const parts = restoreParts(data);
      setTimeout(() => restoreDownloads(data, parts), 50);
    } });
}
function restoreParts(data, limit = 900000) {
  const all = JSON.stringify(data.tables);
  let tag = 'nest'; while (all.includes('$' + tag + '$')) tag = 'nest' + Math.random().toString(36).slice(2, 8);
  const lit = j => `$${tag}$${j}$${tag}$`;
  const stmts = [];
  Object.keys(data.tables).sort().forEach(tb => {
    const rows = data.tables[tb] || []; const name = tb.replace(/'/g, "''");
    if (!rows.length) { stmts.push(`select public._restore_table('${name}', '[]'::jsonb, false);`); return; }
    let chunk = [], size = 2, first = true;
    const flush = () => { stmts.push(`select public._restore_table('${name}', ${lit('[' + chunk.join(',') + ']')}::jsonb, ${first ? 'false' : 'true'});`); chunk = []; size = 2; first = false; };
    rows.forEach(r => { const j = JSON.stringify(r); if (chunk.length && size + j.length > limit) flush(); chunk.push(j); size += j.length + 1; });
    if (chunk.length) flush();
  });
  const parts = []; let cur = [], size = 0;
  stmts.forEach(st => { if (cur.length && size + st.length > limit) { parts.push(cur); cur = []; size = 0; } cur.push(st); size += st.length; });
  if (cur.length) parts.push(cur);
  return parts;
}
function restoreDownloads(data, parts) {
  const day = String(data.created_at || '').slice(0, 10), n = parts.length;
  const file = i => `nest-restore-${day}-part${i + 1}of${n}.sql`;
  const sql = (p, i) => [
    `-- GANKCO Nest restore script: part ${i + 1} of ${n}`,
    `-- Made from the backup taken ${fdt(data.created_at)}${data.created_by ? ' by ' + data.created_by : ''} (Nest ${data.schema_version || ''}).`,
    '-- THIS REPLACES NEST DATA WITH THE BACKUP. Run every part, in order, in Supabase → SQL Editor.',
    'begin;', 'set local session_replication_role = replica;', ...p, 'commit;', ''].join('\n');
  modal({
    title: 'Restore script ready', submit: '', cancel: 'Close', wide: true,
    sub: `Backup from <b>${esc(fdt(data.created_at))}</b>${data.created_by ? ' by ' + esc(data.created_by) : ''}. ${n === 1 ? 'One file.' : `${n} files: run them in order.`}`,
    body: `<ol class="rsteps">
      <li>Download a fresh backup first (so today’s data is saved too).</li>
      <li>Ask everyone to stop using Nest.</li>
      <li>In Supabase → <b>SQL Editor</b> → <b>New query</b>, paste the whole of part 1 and press <b>Run</b>. Wait for <b>Success</b>.${n > 1 ? ' Then do the same for each part, in order.' : ''}</li>
      <li>Open Nest and press <b>Ctrl + Shift + R</b>. Check the Inventory and a few records.</li></ol>
      <div class="actionrow mt">${parts.map((p, i) => `<button type="button" class="btn${i ? '' : ' primary'}" data-part="${i}">${ico('down')}Part ${i + 1} of ${n}</button>`).join('')}</div>`,
    onOpen: d => $$('[data-part]', d).forEach(b => b.onclick = () => { const i = +b.dataset.part; saveBlob(new Blob([sql(parts[i], i)], { type: 'application/sql' }), file(i)); b.classList.remove('primary'); b.innerHTML = `${ico('check')}Part ${i + 1} downloaded`; const nx = $(`[data-part="${i + 1}"]`, d); if (nx) nx.classList.add('primary'); })
  });
}

// ================================================================ LABELS
ROUTES.labels = {
  async load() {
    if (!isAdmin()) return topbar('Labels') + '<div class="notice">Ask an admin to print labels.</div>';
    const ids = JSON.parse(sessionStorage.getItem('labels') || '[]');
    const its = (await items()).filter(i => ids.includes(i.id));
    return topbar('Print labels', its.length ? `${plural(its.length, 'label')}. Scanning a label with any phone camera opens the item.` : '',
      its.length ? `<button class="btn primary" id="print">${ico('print')}Print</button>` : '') +
      (its.length ? `<div class="labels">${its.map(i => `<div class="lbl">${qrSvg(itemUrl(i.id), 3)}<div>${tag(i.code)}<div class="nm">${esc(i.name)}</div><div class="org">${esc(i.line || i.department || '')}</div><img class="lbl-logo" src="brand/logo-full.png" alt="${esc(ORG)}"></div></div>`).join('')}</div>`
        : `<div class="panel"><div class="empty">No items picked. In Inventory, tick the items you want labels for and choose Print labels.</div></div>`);
  },
  bind(main) { const p = $('#print', main); if (p) p.onclick = () => window.print(); }
};

// ================================================================ ACCOUNT / MORE
ROUTES.account = {
  async load() {
    const p = S.profile;
    return topbar('My account') + `<div class="cols"><section class="panel"><header><h2>Profile</h2></header><form class="body" id="prof">
        <label class="f">Full name<input type="text" name="name" value="${esc(p.full_name)}" required></label>
        <dl class="kv"><dt>Email</dt><dd>${esc(p.email)}</dd><dt>Job title</dt><dd>${p.job_title ? esc(p.job_title) : '<span class="sub">Not set yet</span>'}<div class="sub">Set by your admin. It’s printed under your name when you sign.</div></dd><dt>Access</dt><dd>${ROLE_LABEL[p.role]}</dd><dt>Service lines</dt><dd>${isSuper() ? 'All' : esc(myLineIds().map(lineName).join(', ') || 'None yet')}</dd></dl>
        <button class="btn primary mt" type="submit">Save name</button></form></section>
      <section class="panel"><header><h2>Change password</h2></header><form class="body" id="pw">
        <label class="f">New password<span class="hint">At least 8 characters.</span><input type="password" name="pw" minlength="8" autocomplete="new-password" required></label>
        <button class="btn primary" type="submit">Change password</button></form></section></div>
      <section class="panel"><header><h2>My signature</h2>${p.signature_id ? chip('ok', 'Added') : chip('soon', 'Not added')}</header><div class="body">
        <p class="muted">Used when you sign documents in Nest: reports you prepare or sign off, monthly counts, Load-out Manifests and receipts. Under it Nest prints your name, job title and “Signed in GANKCO Nest” with the date and time.</p>
        ${sigBox(await mySigImage(), 'big')}
        <div class="actionrow mt"><button class="btn primary" id="sigup">${ico('up')}${p.signature_id ? 'Replace signature' : 'Upload signature'}</button>${p.signature_id ? '<button class="btn" id="sigfit">Adjust size and position</button><button class="btn danger" id="sigrm">Remove</button>' : ''}</div>
        <p class="sub">Tip: sign on plain white paper with a dark pen, then take a straight photo in good light or scan it.</p></div></section>
      ${myAlertsPanel()}
      <section class="panel"><header><h2>About Nest</h2></header><div class="body">
        <dl class="kv"><dt>App</dt><dd>${esc(CFG.APP_NAME)} v${esc(CFG.VERSION || '')}</dd><dt>Company</dt><dd>${esc(CFG.COMPANY || '')}</dd><dt>Credit</dt><dd>${esc(CREDIT)}</dd></dl></div></section>
      <button class="btn" id="out">Sign out</button>`;
  },
  bind(main) {
    bindMyAlerts(main);
    $('#prof', main).onsubmit = async e => {
      e.preventDefault(); const name = new FormData(e.target).get('name').trim();
      try { await q(sb.from('profiles').update({ full_name: name }).eq('id', S.profile.id)); await sb.auth.updateUser({ data: { full_name: name } });
        S.profile.full_name = name; S.shellReady = false; toast('Name saved'); render(); } catch (ex) { toast(niceError(ex), true); }
    };
    $('#pw', main).onsubmit = async e => {
      e.preventDefault(); const pw = new FormData(e.target).get('pw');
      if (pw.length < 8) return toast('Use at least 8 characters.', true);
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) toast(niceError(error), true); else { toast('Password changed'); e.target.reset(); }
    };
    $('#out', main).onclick = () => sb.auth.signOut();
    $('#sigup', main).onclick = () => uploadSignature();
    const sf = $('#sigfit', main); if (sf) sf.onclick = () => adjustSignature();
    if ($('#sigrm', main)) $('#sigrm', main).onclick = async () => {
      if (!confirm('Remove your signature? Documents you already signed keep it. You’ll need to upload one again before you can sign reports.')) return;
      try { await q(sb.rpc('remove_signature', { p_user: null })); S.profile.signature_id = null; toast('Signature removed'); render({ quiet: true }); } catch (e) { toast(niceError(e), true); }
    };
  }
};
ROUTES.more = {
  async load() {
    const { main, setup } = navItems();
    const links = [['', 'All apps (Nest home)', 'grid'], ...main.filter(([r]) => !['dashboard', 'inventory', 'scan', 'jobs'].includes(r)), ...setup, ['account', 'My account', 'user']];
    return topbar('More') + `<section class="panel"><ul class="list">${links.map(([r, l, i]) => `<li><a class="main morelink" href="#/${r}">${ico(i)}<span class="name">${l}</span>
      ${r === 'approvals' && S.pending ? `<span class="chip pending">${S.pending}</span>` : ''}</a></li>`).join('')}
      <li><a class="main morelink" href="#" id="out2">${ico('out')}<span class="name">Sign out</span></a></li></ul></section>`;
  },
  bind(main) { $('#out2', main).onclick = e => { e.preventDefault(); sb.auth.signOut(); }; }
};

function fixEmail(p) {
  const dom = CFG.SIGNUP_DOMAIN || 'gankcoenergy.com';
  return modal({
    title: `Move ${p.full_name || p.email} to a GANKCO email`, submit: null, cancel: 'Close', wide: true,
    sub: 'Type their company email, then copy the generated code into Supabase → SQL Editor → New query and press Run. Their password, history and access stay the same; they sign in with the new email from then on.',
    body: `<label class="f">Company email<input type="email" id="fx-new" placeholder="name@${esc(dom)}"></label>
      <label class="f">Code to run in Supabase<textarea id="fx-sql" rows="7" readonly style="font-family:monospace;font-size:13px"></textarea></label>
      <button type="button" class="btn small" id="fx-copy">Copy code</button>`,
    onOpen: d => {
      const upd = () => {
        const n = $('#fx-new', d).value.trim().toLowerCase().replace(/'/g, '');
        $('#fx-sql', d).value = n ? `-- Move ${p.email} to ${n}\nupdate auth.users set email = '${n}', email_change = '' where id = '${p.id}';\nupdate auth.identities set identity_data = jsonb_set(identity_data, '{email}', '"${n}"') where user_id = '${p.id}' and provider = 'email';\nupdate public.profiles set email = '${n}' where id = '${p.id}';` : '';
      };
      $('#fx-new', d).oninput = upd;
      $('#fx-copy', d).onclick = async () => { const t = $('#fx-sql', d).value; if (!t) return toast('Type the new email first.', true); try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { $('#fx-sql', d).select(); } };
    }
  });
}

// ---------------------------------------------------------------- live Audit log (2.7)
// new rows arrive through the realtime channel; when the tab was in the background, it catches up on return
function onAuditLive(p) {
  if (!location.hash.startsWith('#/audit') || !ROUTES.audit.draw) return;
  const r = p.new; if (!r || AUD.rows.some(x => x.id === r.id)) return;
  if (AUD.who && r.user_id !== AUD.who) return;
  if (AUD.table && AUD.table !== r.table_name) return;
  if (AUD.to && r.at > AUD.to + 'T23:59:59') return;
  (AUD.fresh ||= new Set()).add(r.id);
  AUD.rows.unshift(r); ROUTES.audit.draw(); pulseLive();
}
function pulseLive() { const d = $('#aud-live'); if (d) { d.classList.remove('pulse'); void d.offsetWidth; d.classList.add('pulse'); } }
function auditLiveState() {
  const d = $('#aud-live'); if (!d) return;
  const ok = S.channel && ['joined', 'SUBSCRIBED'].includes(S.channel.state);
  d.classList.toggle('off', !ok); d.textContent = ok ? 'Live' : 'Reconnecting…';
}
setInterval(() => { if (location.hash.startsWith('#/audit')) auditLiveState(); }, 5000);
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !location.hash.startsWith('#/audit') || !ROUTES.audit.draw || !AUD.rows.length) return;
  // catch up on anything missed while the tab was hidden
  try {
    const newest = AUD.rows[0].at;
    let a = sb.from('audit_log').select('*').gt('at', newest).order('at', { ascending: false }).limit(300);
    if (AUD.who) a = a.eq('user_id', AUD.who); if (AUD.table && AUD.table !== 'stock') a = a.eq('table_name', AUD.table);
    const rows = await q(a); const m = await q(sb.from('movements').select('*, items(code,name,department_id)').gt('created_at', AUD.moves[0]?.created_at || newest).order('created_at', { ascending: false }).limit(300));
    const add = rows.filter(r => !AUD.rows.some(x => x.id === r.id));
    if (add.length || m.length) { (AUD.fresh ||= new Set()); add.forEach(r => AUD.fresh.add(r.id)); AUD.rows.unshift(...add); AUD.moves.unshift(...m.filter(x => !AUD.moves.some(y => y.id === x.id))); ROUTES.audit.draw(); pulseLive(); toast(`${plural(add.length + m.length, 'change')} while you were away`); }
  } catch (e) { /* the next render catches up */ }
});

// ---------------------------------------------------------------- 2.8: size and position of my signature on documents
async function adjustSignature() {
  const id = S.profile.signature_id; if (!id) return;
  sigCacheClear(id); const img = (await sigImages([id]))[id]; if (!img) return toast('Couldn’t load your signature.', true);
  let k = img.scale || 1, dy = img.dy || 0;
  return modal({ title: 'Adjust your signature', submit: 'Save',
    sub: 'Make it bigger or smaller, and move it up or down so it sits neatly on “Signed”. This applies to every document Nest signs for you, including purchase orders. Documents already downloaded don’t change.',
    body: `<div class="sigfit"><div class="sf-sheet"><div class="sf-for">For : GANKCO ENERGY SERVICES</div><div class="sf-area"><img id="sf-img" src="${img.dataUrl}" alt="Your signature"></div><div class="sf-signed">Signed</div></div>
      <label class="f">Size <span class="sub" id="sf-kv"></span><input type="range" id="sf-k" min="50" max="180" step="5" value="${Math.round(k * 100)}"></label>
      <label class="f">Up or down <span class="sub" id="sf-dv"></span><input type="range" id="sf-d" min="-8" max="8" step="0.5" value="${dy}"></label>
      <button type="button" class="btn small" id="sf-reset">Reset</button></div>`,
    onOpen: d => {
      const draw = () => { k = +$('#sf-k', d).value / 100; dy = +$('#sf-d', d).value;
        const im = $('#sf-img', d); im.style.height = (13 * k * 3.2) + 'px'; im.style.transform = `translate(-50%, ${dy * 3.2}px)`;
        $('#sf-kv', d).textContent = Math.round(k * 100) + '%'; $('#sf-dv', d).textContent = dy === 0 ? 'centred on Signed' : dy < 0 ? `${Math.abs(dy)} mm higher` : `${dy} mm lower`; };
      $('#sf-k', d).oninput = draw; $('#sf-d', d).oninput = draw;
      $('#sf-reset', d).onclick = () => { $('#sf-k', d).value = 100; $('#sf-d', d).value = 0; draw(); };
      draw();
    },
    onSubmit: async () => { await q(sb.rpc('set_signature_fit', { p_scale: k, p_dy: dy })); sigCacheClear(id); toast('Signature size saved'); }
  });
}

// ================================================================ 2.9 · SERVICE LINES (Nest settings, Super Admin)
async function svcPanel() {
  const its = await items().catch(() => []);
  const cnt = id => its.filter(i => i.sub_line_id === id).length;
  const majors = svcMajors(true);
  const sub = l => `<li class="svcsub ${l.active ? '' : 'archived'}" data-id="${l.id}">
      <div class="grow"><b>${esc(l.name)}</b>${l.active ? '' : ' ' + chip('muted', 'Archived')}<div class="sub">${plural(cnt(l.id), 'item')}</div></div>
      <label class="svcteam"><span class="sub">Team</span><select data-team="${l.id}">${`<option value="">No team yet (Super Admin)</option>` + S.depts.map(d => opt(d.id, d.short_name || d.name, l.department_id)).join('')}</select></label>
      <span class="end nowrap"><button class="iconbtn" data-up="${l.id}" title="Move up" aria-label="Move up">↑</button><button class="iconbtn" data-dn="${l.id}" title="Move down" aria-label="Move down">↓</button>
        <button class="btn small link" data-ren="${l.id}">Rename</button><button class="btn small link" data-arc="${l.id}">${l.active ? 'Archive' : 'Restore'}</button>${cnt(l.id) ? '' : `<button class="btn small link danger" data-del="${l.id}">Delete</button>`}</span></li>`;
  return `<section class="panel" id="svc"><header><h2>Service lines</h2><span class="meta">One list for Inventory and Purchase Orders</span>
      <div class="right"><button class="btn small" id="svc-addmajor">${ico('plus')}Service line</button></div></header>
    <div class="body"><p class="muted">Each sub service line has a <b>team</b>: that team’s admins look after its items and approve changes to them. Changing the team moves the sub line’s items to the new team. The main line’s code goes into PO numbers (GES-<b>WI</b>-PO-…).</p>
    ${majors.map(m => `<div class="svcmajor ${m.active ? '' : 'archived'}" data-id="${m.id}"><div class="svchead"><span class="linebadge">${esc(m.code || '')}</span> <b>${esc(m.name)}</b>${m.for_po === false ? ' ' + chip('muted', 'Inventory only, not on POs') : ''}${m.active ? '' : ' ' + chip('muted', 'Archived')}
        <span class="end nowrap"><button class="iconbtn" data-up="${m.id}" title="Move up" aria-label="Move up">↑</button><button class="iconbtn" data-dn="${m.id}" title="Move down" aria-label="Move down">↓</button>
          <button class="btn small link" data-ren="${m.id}">Edit</button><button class="btn small link" data-arc="${m.id}">${m.active ? 'Archive' : 'Restore'}</button><button class="btn small" data-addsub="${m.id}">${ico('plus')}Sub service line</button></span></div>
      <ul class="list svcsubs">${svcSubs(m.id, true).map(sub).join('') || '<li class="muted">No sub service lines yet.</li>'}</ul></div>`).join('')}</div></section>`;
}
function bindSvcPanel(main) {
  const p = $('#svc', main); if (!p) return;
  const save = async (x, msg) => { try { await q(sb.rpc('svc_line_save', { p: x })); toast(msg); await loadLookups(); S.po.at = 0; invalidate(); render({ quiet: true }); } catch (e) { toast(niceError(e), true); } };
  const edit = (l, parent) => modal({
    title: l ? `Edit ${l.parent_id ? 'sub service line' : 'service line'}` : parent ? 'Add a sub service line' : 'Add a service line', submit: 'Save',
    sub: parent ? `Under ${svcById(parent)?.code} · ${svcById(parent)?.name}` : '',
    body: `${(!l && !parent) || (l && !l.parent_id) ? `<label class="f">Code<span class="hint">2 to 5 letters. It goes into PO numbers, so it can’t change once POs are issued.</span><input type="text" name="code" value="${esc(l?.code)}" maxlength="5" ${l ? '' : 'required'} style="text-transform:uppercase"></label>` : ''}
      <label class="f">Name<input type="text" name="name" value="${esc(l?.name)}" required></label>
      ${!parent && !(l && l.parent_id) ? `<label class="check"><input type="checkbox" name="for_po" ${l?.for_po === false ? '' : 'checked'}> Used on purchase orders</label>` : ''}
      ${parent ? `<label class="f">Team that looks after its items<select name="department_id"><option value="">No team yet (Super Admin)</option>${S.depts.map(d => opt(d.id, d.name)).join('')}</select></label>` : ''}`,
    onSubmit: async x => {
      const body = { name: x.name };
      if (l) body.id = l.id; if (parent) { body.parent_id = parent; if (x.department_id) body.department_id = +x.department_id; }
      if ('code' in x) body.code = x.code; if (!parent && !(l && l.parent_id)) body.for_po = !!x.for_po;
      await q(sb.rpc('svc_line_save', { p: body })); toast('Saved'); await loadLookups(); S.po.at = 0; invalidate(); render({ quiet: true });
    }
  });
  $('#svc-addmajor', p).onclick = () => edit(null, null);
  $$('[data-addsub]', p).forEach(b => b.onclick = () => edit(null, +b.dataset.addsub));
  $$('[data-ren]', p).forEach(b => b.onclick = () => edit(svcById(b.dataset.ren), null));
  $$('[data-arc]', p).forEach(b => b.onclick = () => { const l = svcById(b.dataset.arc); save({ id: l.id, active: !l.active }, l.active ? `${l.name} archived: it no longer shows in pick lists` : `${l.name} restored`); });
  $$('[data-del]', p).forEach(b => b.onclick = async () => { const l = svcById(b.dataset.del); if (!confirm(`Delete ${l.name} for good?`)) return;
    try { await q(sb.rpc('svc_line_delete', { p_id: l.id })); toast(`${l.name} deleted`); await loadLookups(); render({ quiet: true }); } catch (e) { toast(niceError(e), true); } });
  $$('[data-team]', p).forEach(sel => sel.onchange = async () => {
    const l = svcById(sel.dataset.team); const n = (S.items || []).filter(i => i.sub_line_id === l.id).length; const d = sel.value ? lineName(sel.value) : null;
    if (sel.value && n && !confirm(`${plural(n, 'item')} in ${l.name} will be looked after by ${d}. Their admins get a bell alert. Continue?`)) { sel.value = l.department_id || ''; return; }
    if (!sel.value && n) { toast('Items need a team: choose the team that should look after them instead.', true); sel.value = l.department_id || ''; return; }
    save({ id: l.id, department_id: sel.value ? +sel.value : null }, d ? `${l.name}: ${d} now looks after it` : 'Saved');
  });
  const order = async (id, dir) => {
    const l = svcById(id); const sibs = l.parent_id ? svcSubs(l.parent_id, true) : svcMajors(true); const i = sibs.findIndex(x => x.id === l.id); const j = i + dir;
    if (j < 0 || j >= sibs.length) return; [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
    try { await q(sb.rpc('svc_line_order', { p_ids: sibs.map(x => x.id) })); await loadLookups(); S.po.at = 0; render({ quiet: true }); } catch (e) { toast(niceError(e), true); }
  };
  $$('[data-up]', p).forEach(b => b.onclick = () => order(+b.dataset.up, -1));
  $$('[data-dn]', p).forEach(b => b.onclick = () => order(+b.dataset.dn, 1));
}

// ================================================================ 2.9 · TYPES & SUB-TYPES (Inventory settings, Super Admin and admins)
function subtypePanel() {
  const its = S.items || []; const cnt = id => its.filter(i => i.subtype_id === id).length;
  const kcnt = k => its.filter(i => i.kind === k && i.active).length;
  return `<section class="panel" id="subtypes"><header><h2>Types &amp; sub-types</h2><span class="meta">The Type and Sub-type filters in Inventory</span></header>
    <div class="body"><p class="muted">The four types are fixed, because each one decides how items behave on jobs. Under each type, add the sub-types people filter by. A sub-type that items use can’t be deleted: archive it, or move its items to another sub-type first.</p>
    <div class="stgrid">${Object.entries(KINDS).map(([k, v]) => `<div class="stcol"><div class="sthead"><b>${esc(v)}</b><span class="sub">${esc(KIND_HINT[k])} · ${plural(kcnt(k), 'item')}</span></div>
      <ul class="list compact">${subtypesOf(k, true).map(t => `<li class="${t.active ? '' : 'archived'}"><div class="grow"><b>${esc(t.name)}</b>${t.active ? '' : ' ' + chip('muted', 'Archived')}<div class="sub">${plural(cnt(t.id), 'item')}${t.notes ? ' · ' + esc(t.notes) : ''}</div></div>
        <span class="end nowrap"><button class="iconbtn" data-stup="${t.id}" title="Move up" aria-label="Move up">↑</button><button class="iconbtn" data-stdn="${t.id}" title="Move down" aria-label="Move down">↓</button>
        <button class="btn small link" data-sted="${t.id}">Edit</button><button class="btn small link" data-starc="${t.id}">${t.active ? 'Archive' : 'Restore'}</button>${cnt(t.id) ? '' : `<button class="btn small link danger" data-stdel="${t.id}">Delete</button>`}</span></li>`).join('') || '<li class="muted">No sub-types yet.</li>'}</ul>
      <button class="btn small" data-stadd="${k}">${ico('plus')}Sub-type</button></div>`).join('')}</div></div></section>`;
}
function bindSubtypePanel(main) {
  const p = $('#subtypes', main); if (!p) return;
  const st = id => (S.subtypes || []).find(t => t.id === +id);
  const reload = async msg => { if (msg) toast(msg); await loadLookups(); invalidate(); render({ quiet: true }); };
  const edit = (t, kind) => modal({
    title: t ? 'Edit sub-type' : `Add a sub-type to ${KINDS[kind]}`, submit: 'Save',
    body: `<label class="f">Name<input type="text" name="name" value="${esc(t?.name)}" required></label>
      <label class="f">What goes in it<span class="hint">Optional: examples, so people put items in the right place.</span><input type="text" name="notes" value="${esc(t?.notes)}"></label>`,
    onSubmit: async x => { await q(sb.rpc('subtype_save', { p: t ? { id: t.id, name: x.name, notes: x.notes } : { kind, name: x.name, notes: x.notes } })); await reload(t ? 'Saved' : 'Sub-type added'); }
  });
  $$('[data-stadd]', p).forEach(b => b.onclick = () => edit(null, b.dataset.stadd));
  $$('[data-sted]', p).forEach(b => b.onclick = () => edit(st(b.dataset.sted)));
  $$('[data-starc]', p).forEach(b => b.onclick = async () => { const t = st(b.dataset.starc);
    try { await q(sb.rpc('subtype_save', { p: { id: t.id, active: !t.active } })); await reload(t.active ? `${t.name} archived: items keep it, but it’s no longer offered for new items` : `${t.name} restored`); } catch (e) { toast(niceError(e), true); } });
  $$('[data-stdel]', p).forEach(b => b.onclick = async () => { const t = st(b.dataset.stdel); if (!confirm(`Delete the sub-type ${t.name}?`)) return;
    try { await q(sb.rpc('subtype_delete', { p_id: t.id })); await reload(`${t.name} deleted`); } catch (e) { toast(niceError(e), true); } });
  const order = async (id, dir) => { const t = st(id); const sibs = subtypesOf(t.kind, true); const i = sibs.findIndex(x => x.id === t.id), j = i + dir; if (j < 0 || j >= sibs.length) return;
    [sibs[i], sibs[j]] = [sibs[j], sibs[i]]; try { await q(sb.rpc('subtype_order', { p_ids: sibs.map(x => x.id) })); await reload(); } catch (e) { toast(niceError(e), true); } };
  $$('[data-stup]', p).forEach(b => b.onclick = () => order(+b.dataset.stup, -1));
  $$('[data-stdn]', p).forEach(b => b.onclick = () => order(+b.dataset.stdn, 1));
}
