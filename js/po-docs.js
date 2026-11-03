/* GANKCO Nest 2.7 — purchase order documents: the Excel copy (the same layout as the Sand Screens PO) and the PDF */
'use strict';

const PO_CUR = {
  USD: { sym: '$', name: 'US Dollars', one: 'US Dollar', minor: 'Cents', minor1: 'Cent' },
  NGN: { sym: '₦', name: 'Naira', one: 'Naira', minor: 'Kobo', minor1: 'Kobo' },
  GBP: { sym: '£', name: 'Pounds Sterling', one: 'Pound Sterling', minor: 'Pence', minor1: 'Penny' },
  EUR: { sym: '€', name: 'Euros', one: 'Euro', minor: 'Cents', minor1: 'Cent' },
};
const poMoney = (n, cur = 'USD') => (PO_CUR[cur]?.sym || '') + (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const poNum = n => (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const poDate = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const poAmount = l => Math.round((+l.qty || 0) * (+l.rate || 0) * 100) / 100;

// "Fifteen Thousand Five Hundred and Eighty US Dollars Only"
function poWords(n, cur = 'USD') {
  const C = PO_CUR[cur] || PO_CUR.USD;
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const below1000 = x => {
    const h = Math.floor(x / 100), r = x % 100; const out = [];
    if (h) out.push(ones[h] + ' Hundred');
    if (r) out.push((h ? 'and ' : '') + (r < 20 ? ones[r] : tens[Math.floor(r / 10)] + (r % 10 ? '-' + ones[r % 10] : '')));
    return out.join(' ');
  };
  const words = x => {
    if (x === 0) return 'Zero';
    const parts = []; const scales = [[1e12, 'Trillion'], [1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
    for (const [v, w] of scales) if (x >= v) { parts.push(below1000(Math.floor(x / v)) + ' ' + w); x %= v; }
    if (x) parts.push((parts.length && x < 100 ? 'and ' : '') + below1000(x));
    return parts.join(' ');
  };
  const v = Math.round((+n || 0) * 100); const major = Math.floor(v / 100), minor = v % 100;
  let s = `${words(major)} ${major === 1 ? C.one : C.name}`;
  if (minor) s += ` and ${words(minor)} ${minor === 1 ? C.minor1 : C.minor}`;
  return s + ' Only';
}

// The company header and delivery address, from the PO settings saved with the document
const poOffices = st => (st || setting('po', {}) || {});
function poOfficeText(st, key) {
  const o = poOffices(st).offices?.[key]; if (!o) return '';
  return [o.line1, o.line2].filter(Boolean).join(', ');
}

/* A document: { no, draft, superseded, po_date, delivery_date, deliver_to, currency, supplier_name, supplier_address, supplier_phone, pan, gstin,
   lines: [{kind, part_no, description, hsn, qty, uom, rate}], tax_amount, tax_summary, note, terms, settings, signature: {name, title, signature_id, signed_at} } */
function poDocFrom(src, extra = {}) {
  const lines = (src.lines || []).map(l => ({ kind: l.kind || 'item', part_no: l.part_no || '', description: l.description || '', hsn: l.hsn || '', qty: +l.qty || 0, uom: l.uom || '', rate: +l.rate || 0 }));
  const subtotal = Math.round(lines.filter(l => l.kind === 'item').reduce((a, l) => a + poAmount(l), 0) * 100) / 100;
  const tax = src.tax_amount == null || src.tax_amount === '' ? null : +src.tax_amount;
  return { no: src.po_no_full || null, po_date: src.po_date, delivery_date: src.delivery_date, deliver_to: src.deliver_to || '', currency: src.currency || 'USD',
    supplier_name: src.supplier_name || '', supplier_address: src.supplier_address || '', supplier_phone: src.supplier_phone || '', pan: src.pan || '', gstin: src.gstin || '',
    lines, subtotal, tax_amount: tax, total: Math.round((subtotal + (tax || 0)) * 100) / 100, tax_summary: src.tax_summary || {}, note: src.note || '', terms: src.terms || '',
    settings: src.settings || setting('po', {}), signature: src.signature || null, draft: false, superseded: false, ...extra };
}
const poFileName = (doc, ext) => `${(doc.no || 'Draft PO').replace(/[^A-Za-z0-9-]+/g, '-')}${doc.supplier_name ? ' ' + doc.supplier_name.replace(/[^A-Za-z0-9 &-]+/g, '').trim().slice(0, 40) : ''}${doc.draft ? ' (draft)' : ''}.${ext}`;
// lines numbered like the Excel POs: headings are A, B, C…; items restart at 1 after each heading
function poNumber(lines) {
  let h = 0, n = 0; const out = [];
  for (const l of lines) { if (l.kind === 'heading') { out.push({ ...l, sno: String.fromCharCode(65 + (h++ % 26)) }); n = 0; } else out.push({ ...l, sno: ++n }); }
  return out;
}

// ================================================================ EXCEL (cell for cell the Sand Screens layout)
async function poExcel(doc) {
  await loadScript('vendor/exceljs.min.js'); await loadScript('js/po-sheet.js');
  const P = PO_SHEET, C = PO_CUR[doc.currency] || PO_CUR.USD, st = poOffices(doc.settings);
  const head = st.offices?.[st.header_office || 'abuja'] || {};
  const wb = new ExcelJS.Workbook(); wb.creator = 'GANKCO Nest'; wb.created = new Date();
  const ws = wb.addWorksheet('Purchase Order', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, scale: 68,
    margins: { left: P.margins.left, right: P.margins.right, top: P.margins.top, bottom: P.margins.bottom, header: P.margins.header, footer: P.margins.footer } } });
  ws.properties.defaultRowHeight = 14.4;
  ws.headerFooter = { oddHeader: '&L&D &T', oddFooter: '&R&P/&N' };
  Object.entries(P.cols).forEach(([L, w]) => { ws.getColumn(L).width = w; });
  const money = f => f.replace(/"\$"/g, `"${C.sym}"`);
  const style = (cell, si, fmtMoney) => {
    const s = P.styles[si]; if (!s) return;
    if (s.font) cell.font = { ...s.font };
    if (s.fill) cell.fill = { type: 'pattern', pattern: s.fill.pattern, fgColor: s.fill.fgColor };
    if (s.border) cell.border = s.border;
    if (s.alignment) cell.alignment = { ...s.alignment, ...(s.alignment.vertical === 'center' ? { vertical: 'middle' } : {}) };
    if (s.numFmt) cell.numFmt = fmtMoney ? money(s.numFmt) : s.numFmt;
  };
  // copy a template row (styles + its fixed text) to row r, then set values
  const put = (r, tpl, values = {}, opt = {}) => {
    const row = ws.getRow(r); if (opt.h !== undefined ? opt.h : tpl.h) row.height = opt.h !== undefined ? opt.h : tpl.h;
    for (const [c, [si, v]] of Object.entries(tpl.c)) {
      const cell = ws.getCell(r, +c); style(cell, si, opt.money);
      const val = c in values ? values[c] : (typeof v === 'string' && v.startsWith('=') ? undefined : v);
      if (val !== undefined && val !== null) cell.value = val;
    }
  };
  const merge = rng => { try { ws.mergeCells(rng); } catch (e) { /* already merged */ } };
  const R = P.rows; const colon = v => ': ' + (v || '');
  const colonOnly = v => v ? ': ' + v : ':';

  // 1–11: company block and the PO header (as in the sample)
  for (let r = 1; r <= 11; r++) put(r, R[r]);
  ws.getCell('K2').value = st.company || 'GANKCO ENERGY SERVICES';
  ws.getCell('K3').value = head.line1 || ''; ws.getCell('K4').value = head.line2 || '';
  ws.getCell('K5').value = 'Contact No: ' + (head.phone || '');
  ws.getCell('C8').value = colonOnly(doc.supplier_name); ws.getCell('I8').value = colonOnly(poDate(doc.po_date));
  ws.getCell('C9').value = colonOnly(doc.supplier_address); ws.getCell('I9').value = colonOnly(doc.no || 'Draft');
  ws.getCell('C10').value = colonOnly(doc.supplier_phone); ws.getCell('I10').value = colonOnly(doc.pan);
  ws.getCell('C11').value = colonOnly(doc.gstin); ws.getCell('I11').value = colonOnly(poDate(doc.delivery_date));
  P.merges.filter(m => +m.match(/\d+/)[0] <= 11).forEach(merge);
  // 12: Deliver To (Abuja office, Port Harcourt office, or blank)
  put(12, R[11], { 1: 'Deliver To', 3: colonOnly(doc.deliver_to ? poOfficeText(doc.settings, doc.deliver_to) : ''), 6: null, 9: null });
  merge('A12:B12'); merge('C12:K12');
  // 13: table header
  put(13, R[12], { 10: `Rate (${doc.currency})`, 11: `Amount (${doc.currency})` });
  merge('B13:C13'); merge('D13:F13'); merge('G13:H13');

  // lines
  let r = 14; const first = r; let firstItem = true;
  const lines = poNumber(doc.lines);
  for (const l of lines) {
    if (l.kind === 'heading') {
      put(r, P.heading, { 1: l.sno, 2: l.description || l.part_no || '' });
      merge(`B${r}:K${r}`); r++; continue;
    }
    const tpl = firstItem ? R[13] : R[14]; firstItem = false;
    const text = l.description || ''; const split = !!l.part_no;
    const perLine = split ? 80 : 110;
    const nl = Math.max(1, String(text).split('\n').reduce((a, s) => a + Math.max(1, Math.ceil(s.length / perLine)), 0));
    put(r, tpl, { 1: l.sno, 2: split ? l.part_no : text, 4: l.hsn || null, 7: l.qty, 9: l.uom || null, 10: l.rate,
      11: { formula: `J${r}*G${r}`, result: poAmount(l) } }, { h: Math.max(tpl.h && !split ? 22.5 : 24, 12 * nl + 10.5) });
    if (split) {
      // part number in B, item name in C (as on the SHO Assy & RBP sheet)
      const [sb2] = P.partline.c[2], [sc] = P.partline.c[3];
      style(ws.getCell(r, 2), sb2); style(ws.getCell(r, 3), sc);
      if (firstItem === false && r === first) { ws.getCell(r, 2).border = { ...ws.getCell(r, 2).border, top: { style: 'medium', color: { indexed: 64 } } }; ws.getCell(r, 3).border = { ...ws.getCell(r, 3).border, top: { style: 'medium', color: { indexed: 64 } } }; }
      ws.getCell(r, 3).value = text;
    } else merge(`B${r}:C${r}`);
    merge(`D${r}:F${r}`); merge(`G${r}:H${r}`);
    r++;
  }
  if (r === first) { put(r, R[13]); merge(`B${r}:C${r}`); merge(`D${r}:F${r}`); merge(`G${r}:H${r}`); r++; }
  const last = r - 1;
  put(r, R[21]); r++;                         // spacer
  const o = r - 22;                           // footer = sample rows 22–39, moved down
  for (let s = 22; s <= 39; s++) put(s + o, R[s], {}, { money: s >= 22 && s <= 24 || s === 31 });
  P.merges.filter(m => +m.match(/\d+/)[0] >= 22).forEach(m => merge(m.replace(/(\d+)/g, d => String(+d + o))));
  ws.getCell(`K${22 + o}`).value = { formula: `SUM(K${first}:K${last})`, result: doc.subtotal };
  ws.getCell(`K${23 + o}`).value = doc.tax_amount == null ? null : doc.tax_amount;
  ws.getCell(`K${24 + o}`).value = { formula: `K${22 + o}+K${23 + o}`, result: doc.total };
  ws.getCell(`A${25 + o}`).value = 'Total Amount in Words:   ' + poWords(doc.total, doc.currency);
  ws.getCell(`B${26 + o}`).value = doc.note || null;
  if (doc.note) ws.getCell(`B${26 + o}`).alignment = { vertical: 'top', wrapText: true };
  const ts = doc.tax_summary || {};
  ws.getCell(`A${31 + o}`).value = ts.hsn || null;
  ws.getCell(`C${31 + o}`).value = ts.taxable === '' || ts.taxable == null ? null : (isNaN(+ts.taxable) ? ts.taxable : +ts.taxable);
  ws.getCell(`E${31 + o}`).value = ts.rate || null; ws.getCell(`E${31 + o}`).numFmt = '@';
  ws.getCell(`G${31 + o}`).value = null;
  ws.getCell(`J${31 + o}`).value = ts.total === '' || ts.total == null ? null : (isNaN(+ts.total) ? ts.total : +ts.total);
  const terms = String(doc.terms || '').trim();
  ws.getCell(`A${33 + o}`).value = 'Terms & Conditions :- ' + (terms ? terms.split('\n').map(s => s.trim()).filter(Boolean).join('   ') : '');
  if (terms) { ws.getCell(`A${33 + o}`).alignment = { vertical: 'top', wrapText: true }; ws.getRow(33 + o).height = Math.max(22.5, 13 * Math.ceil(terms.length / 120) + 9); }
  ws.getCell(`A${35 + o}`).value = 'For : ' + (st.company || 'GANKCO ENERGY SERVICES');

  // logo and signature, where they sit on the sample
  const logo = await imageB64('brand/po-logo.png');
  ws.addImage(wb.addImage({ base64: logo.base64, extension: 'png' }), { tl: { col: 0.09, row: 0.4 }, ext: { width: 164, height: 47 } });
  const sig = doc.signature?.signature_id ? (await sigImages([doc.signature.signature_id]))[doc.signature.signature_id] : null;
  if (sig) {
    let h = 71, w = h * sig.w / sig.h; if (w > 162) { w = 162; h = w * sig.h / sig.w; }
    ws.addImage(wb.addImage({ base64: sig.dataUrl.split(',')[1], extension: 'png' }), { tl: { col: 8.2, row: 34.65 + o }, ext: { width: w, height: h } });
  }
  if (doc.draft || doc.superseded) {
    const c = ws.getCell('A6'); c.value = doc.draft ? 'DRAFT: not issued' : 'SUPERSEDED: a later revision replaces this PO';
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFB3261E' } };
  }
  ws.pageSetup.printArea = `A1:K${39 + o}`;
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), poFileName(doc, 'xlsx'));
}

// ================================================================ PDF (same layout, A4 portrait)
async function poPdf(doc, { output } = {}) {
  await loadScript('vendor/jspdf.umd.min.js'); await loadScript('vendor/jspdf.plugin.autotable.min.js'); await loadScript('vendor/po-fonts.js');
  const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const F = window.PO_FONTS;
  pdf.addFileToVFS('Carlito-Regular.ttf', F['Carlito-Regular']); pdf.addFont('Carlito-Regular.ttf', 'Carlito', 'normal');
  pdf.addFileToVFS('Carlito-Bold.ttf', F['Carlito-Bold']); pdf.addFont('Carlito-Bold.ttf', 'Carlito', 'bold');
  const autoTable = window.autoTable || (window.jspdf_autotable && window.jspdf_autotable.autoTable);
  const C = PO_CUR[doc.currency] || PO_CUR.USD, st = poOffices(doc.settings), head = st.offices?.[st.header_office || 'abuja'] || {};
  const W = 210, H = 297, L = 12, Rr = W - 12, CW = Rr - L;
  // column widths from the Excel layout (A … K)
  const XW = [4.44, 16.11, 56.33, 6.55, 2.33, 5.0, 4.33, 3.11, 7.0, 10.11, 12.66]; const tot = XW.reduce((a, b) => a + b, 0);
  const cw = XW.map(w => w / tot * CW); const cx = []; cw.reduce((a, w, i) => (cx[i] = a, a + w), L);
  const span = (a, b) => cw.slice(a, b + 1).reduce((x, y) => x + y, 0);
  const ink = [0, 0, 0];
  const font = (b, s, c = ink) => { pdf.setFont('Carlito', b ? 'bold' : 'normal'); pdf.setFontSize(s); pdf.setTextColor(...c); };
  const line = (x1, y1, x2, y2, w = .5) => { pdf.setDrawColor(0); pdf.setLineWidth(w); pdf.line(x1, y1, x2, y2); };
  const T = s => String(s ?? '');
  const logo = await imageB64('brand/logo-full.png');
  const sig = doc.signature?.signature_id ? (await sigImages([doc.signature.signature_id]))[doc.signature.signature_id] : null;

  // company block
  let y = 12;
  const lh = 13, lw = lh * logo.w / logo.h; pdf.addImage(logo.dataUrl, 'PNG', L, y, lw, lh, 'po-logo', 'FAST');
  font(true, 10); pdf.text(T(st.company || 'GANKCO ENERGY SERVICES'), Rr, y + 3, { align: 'right' });
  font(false, 7.6); pdf.text(T(head.line1), Rr, y + 7.2, { align: 'right' }); pdf.text(T(head.line2), Rr, y + 10.8, { align: 'right' });
  pdf.text('Contact No: ' + T(head.phone), Rr, y + 14.4, { align: 'right' });
  y = 33;
  line(L, y, Rr, y, .6); font(true, 10.5, [166, 166, 166]); pdf.text('P U R C H A S E   O R D E R', W / 2, y + 4.4, { align: 'center' }); line(L, y + 6.2, Rr, y + 6.2, .6);
  // header block
  y += 6.2;
  const rows = [['Name', doc.supplier_name, 'P.O. Date', poDate(doc.po_date)], ['Address', doc.supplier_address, 'P.O. No.', doc.no || 'Draft'],
    ['Phone', doc.supplier_phone, 'PAN', doc.pan], ['GSTIN', doc.gstin, 'Delivery Date', poDate(doc.delivery_date)],
    ['Deliver To', doc.deliver_to ? poOfficeText(doc.settings, doc.deliver_to) : '', null, null]];
  const vx = cx[2], vw = span(2, 4) - 2, rx = cx[5], rvx = cx[8], rvw = span(8, 10);
  rows.forEach(([k, v, k2, v2]) => {
    font(true, 7.6); const wrapW = k2 ? vw : Rr - vx;
    const vl = pdf.splitTextToSize(colonTxt(v), wrapW); const v2l = k2 ? pdf.splitTextToSize(colonTxt(v2), rvw) : [];
    const rh = Math.max(5, 3.4 * Math.max(vl.length, v2l.length) + 1.8);
    font(false, 7.6); pdf.text(k, L + 1, y + 3.6);
    font(true, 7.6); pdf.text(vl, vx, y + 3.6);
    if (k2) { font(false, 7.6); pdf.text(k2, rx, y + 3.6); font(true, 7.6); pdf.text(v2l, rvx, y + 3.6); }
    y += rh;
  });
  function colonTxt(v) { return v ? ': ' + v : ':'; }
  y += 1;

  // lines table
  const lines = poNumber(doc.lines);
  const split = lines.some(l => l.kind === 'item' && l.part_no);
  const cols = split
    ? [['S.No.', span(0, 0)], ['Part No.', span(1, 1)], ['Item Name', span(2, 2)], ['HSN/SAC', span(3, 5)], ['Qty', span(6, 7)], ['UOM', span(8, 8)], [`Rate (${doc.currency})`, span(9, 9)], [`Amount (${doc.currency})`, span(10, 10)]]
    : [['S.No.', span(0, 0)], ['Item Name', span(1, 2)], ['HSN/SAC', span(3, 5)], ['Qty', span(6, 7)], ['UOM', span(8, 8)], [`Rate (${doc.currency})`, span(9, 9)], [`Amount (${doc.currency})`, span(10, 10)]];
  // S.No. needs room for its heading; take it from the item name column
  const need = 10 - cols[0][1]; if (need > 0) { cols[0][1] += need; cols[split ? 2 : 1][1] -= need; }
  const n = cols.length;
  const body = lines.map(l => l.kind === 'heading'
    ? [{ content: l.sno, styles: { fontStyle: 'bold', halign: 'center' } }, { content: T(l.description || l.part_no), colSpan: n - 1, styles: { fontStyle: 'bold', halign: 'center' } }]
    : [l.sno, ...(split ? [T(l.part_no), T(l.description)] : [T(l.description || l.part_no)]), T(l.hsn), fq(l.qty), T(l.uom), poNum(l.rate), poAmount(l) ? poNum(poAmount(l)) : '-']);
  autoTable(pdf, {
    startY: y, margin: { left: L, right: W - Rr, top: 14, bottom: 16 }, theme: 'grid', tableWidth: CW,
    head: [cols.map(c => c[0])], body: body.length ? body : [Array(n).fill('')],
    styles: { font: 'Carlito', fontSize: 7.6, textColor: 0, lineColor: 0, lineWidth: .15, cellPadding: { top: 1.4, bottom: 1.4, left: 1.2, right: 1.2 }, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold', lineWidth: .35 },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, { cellWidth: c[1], halign: i === 0 ? 'center' : (i >= n - 4 && i !== n - 3) ? (i === n - 4 ? 'center' : 'right') : i === n - 3 ? 'center' : 'left' }])),
  });
  y = pdf.lastAutoTable.finalY + 3;

  const room = (h) => { if (y + h > H - 16) { pdf.addPage(); y = 16; } };
  // totals
  room(20);
  const tx = cx[6], vx2 = Rr;
  [['Sub Total Amount:', poMoney(doc.subtotal, doc.currency)], ['Total TaxAmount:', doc.tax_amount == null ? C.sym + '   -' : poMoney(doc.tax_amount, doc.currency)], ['Order Amount:', poMoney(doc.total, doc.currency)]].forEach(([k, v], i) => {
    font(i === 2, 8.4); pdf.text(k, tx, y + 3.6); pdf.text(v, vx2, y + 3.6, { align: 'right' }); y += 5;
  });
  line(L, y, Rr, y, .5);
  // amount in words
  font(false, 8.6); const wl = pdf.splitTextToSize('Total Amount in Words:   ' + poWords(doc.total, doc.currency), CW);
  room(wl.length * 4 + 4); pdf.text(wl, L, y + 4); y += wl.length * 4 + 2.5; line(L, y, Rr, y, .9); y += 1;
  // note
  font(false, 7.6); const nl = pdf.splitTextToSize(T(doc.note), CW - 12);
  room(Math.max(10, nl.length * 3.6 + 4)); pdf.text('Note:', L, y + 3.6); if (doc.note) pdf.text(nl, L + 12, y + 3.6); y += Math.max(10, nl.length * 3.6 + 4);
  // GST tax summary
  room(18); font(true, 7.8); pdf.text('GST TAX SUMMARY', W / 2, y + 3, { align: 'center' }); y += 5;
  const ts = doc.tax_summary || {};
  autoTable(pdf, {
    startY: y, margin: { left: L, right: W - Rr }, theme: 'grid', tableWidth: CW,
    head: [[{ content: 'HSN', styles: { halign: 'left' } }, 'Taxable Amt', 'Rate', '', 'Total']],
    body: [[T(ts.hsn), ts.taxable ? poNum(ts.taxable) : '', T(ts.rate), '', ts.total ? poNum(ts.total) : '']],
    styles: { font: 'Carlito', fontSize: 7.6, textColor: 0, lineColor: 0, lineWidth: .3, cellPadding: 1.2, minCellHeight: 4.5 },
    headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold', halign: 'right' }, bodyStyles: { halign: 'right' },
    columnStyles: { 0: { cellWidth: span(0, 1), halign: 'left' }, 1: { cellWidth: span(2, 3) }, 2: { cellWidth: span(4, 5) }, 3: { cellWidth: span(6, 8) }, 4: { cellWidth: span(9, 10) } },
  });
  y = pdf.lastAutoTable.finalY + 4;
  // terms
  font(false, 8.6, [68, 114, 196]); const terms = String(doc.terms || '').trim();
  const tl = pdf.splitTextToSize('Terms & Conditions :- ' + (terms ? terms.split('\n').map(s => s.trim()).filter(Boolean).join('   ') : ''), CW);
  room(tl.length * 4 + 4); pdf.text(tl, L, y + 4); y += tl.length * 4 + 2; line(L, y, Rr, y, .5);
  // for: company, signature
  room(34); y += 6;
  font(true, 9.2); pdf.text('For : ' + T(st.company || 'GANKCO ENERGY SERVICES'), Rr, y, { align: 'right' });
  if (sig) { let h = 16, w = h * sig.w / sig.h; if (w > 44) { w = 44; h = w * sig.h / sig.w; } pdf.addImage(sig.dataUrl, 'PNG', Rr - 12 - w, y + 1.5, w, h, 'po-sig', 'FAST'); }
  font(true, 8.4); pdf.text('Signed', Rr - 22, y + 21, { align: 'center' });
  if (doc.signature?.name) { font(false, 7.4, [90, 90, 90]); pdf.text(T(doc.signature.name) + (doc.signature.title ? ' · ' + T(doc.signature.title) : ''), Rr, y + 25, { align: 'right' }); }
  // page numbers and marks
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); font(false, 7, [120, 120, 120]);
    pdf.text(`${doc.no || 'Draft purchase order'} · Page ${i} of ${pages}`, Rr, H - 8, { align: 'right' });
    if (doc.signature?.signed_at && !doc.draft) pdf.text(`Signed in GANKCO Nest · ${pdfStamp(doc.signature.signed_at)}`, L, H - 8);
    if (doc.draft || doc.superseded) {
      pdf.saveGraphicsState(); pdf.setGState(new pdf.GState({ opacity: 0.12 }));
      font(true, 64, [120, 120, 120]); pdf.text(doc.draft ? 'DRAFT' : 'SUPERSEDED', W / 2, H / 2 + 12, { align: 'center', angle: 28 });
      pdf.restoreGraphicsState();
    }
  }
  if (output === 'blob') return pdf.output('blob');
  pdf.save(poFileName(doc, 'pdf'));
}
