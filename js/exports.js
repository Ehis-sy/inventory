/* GANKCO Nest — branded Excel & PDF exports, Excel templates and uploads */
'use strict';

const BRAND = { charcoal: '1E1F22', charcoal2: '2C2E33', orange: 'E8552C', deep: 'C93100', flame: 'FF7A1A', grey: '8E9196',
  zebra: 'F6F7F8', line: 'DCDDE0', ink: '1C1D20', muted: '62666C', input: 'FFF6E0', groupFill: 'FCE9E2' };
const STATUS_FILL = { low: ['FFF1D1', '8A5A00'], damaged: ['FBE4E2', 'B3261E'], overdue: ['FBE4E2', 'B3261E'], ok: ['E2F3EA', '217A4B'], out: ['E3ECFB', '2257C9'], warn: ['FFF1D1', '8A5A00'] };

let _logoCache = {};
async function imageB64(path) {
  if (_logoCache[path]) return _logoCache[path];
  const r = await fetch(path); const b = await r.blob();
  const d = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = d; });
  return (_logoCache[path] = { dataUrl: d, base64: d.split(',')[1], w: img.naturalWidth, h: img.naturalHeight });
}
function qmsMeta() {
  return { ref: setting('form_ref', 'GES-QMS-FOM-020'), issue: setting('form_issue', ''), rev: setting('form_revision', '0') };
}
function saveBlob(blob, file) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const safeSheet = n => String(n).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet';

// ================================================================ EXCEL
/* sheets: [{ name, title, subtitle, columns:[{header,key,width,type:'num'|'date'|'text',input?}], rows:[obj],
              group?: key, cellStyle?(row,key) -> 'low'|'damaged'|..., totals?: [keys], note? }] */
async function brandXlsx({ file, sheets, instructions }) {
  await loadScript('vendor/exceljs.min.js');
  const X = window.ExcelJS; const wb = new X.Workbook();
  wb.creator = 'GANKCO Nest'; wb.created = new Date();
  const logo = await imageB64('brand/logo-full.png');
  const logoId = wb.addImage({ base64: logo.base64, extension: 'png' });
  const m = qmsMeta(); const who = S.profile?.full_name || S.profile?.email || '';
  const thin = { style: 'thin', color: { argb: 'FF' + BRAND.line } }; const box = { style: 'thin', color: { argb: 'FFBFC1C5' } };
  if (instructions) sheets = [...sheets, { name: 'How to use', instructions }];
  for (const sh of sheets) {
    const ws = wb.addWorksheet(safeSheet(sh.name), { views: [{ showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: .4, right: .4, top: .5, bottom: .6, header: .2, footer: .3 } },
      headerFooter: { oddFooter: `&L&8${CFG.COMPANY || ''} · ${CFG.MOTTO || ''}&C&8${sh.title || sh.name}&R&8Page &P of &N` } });
    if (sh.instructions) {
      ws.getColumn(1).width = 4; ws.getColumn(2).width = 110;
      ws.addImage(logoId, { tl: { col: 1, row: 0.3 }, ext: { width: 190, height: 190 * logo.h / logo.w } });
      ws.getRow(1).height = 52;
      let r = 3;
      sh.instructions.forEach((line, i) => {
        const c = ws.getCell(r, 2); c.value = line; c.alignment = { wrapText: true, vertical: 'top' };
        c.font = i === 0 ? { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF' + BRAND.charcoal } } : { name: 'Calibri', size: 11, color: { argb: 'FF' + BRAND.ink } };
        ws.getRow(r).height = i === 0 ? 22 : Math.max(18, Math.ceil(String(line).length / 105) * 15); r++;
      });
      continue;
    }
    const cols = sh.columns; const n = cols.length;
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 14; });
    // header block
    ws.getRow(1).height = 26; ws.getRow(2).height = 18; ws.getRow(3).height = 16; ws.getRow(4).height = 16;
    ws.addImage(logoId, { tl: { col: 0, row: 0.15 }, ext: { width: 210, height: 210 * logo.h / logo.w } });
    const tStart = Math.min(3, n); const wideMeta = n >= 8;
    Object.assign(ws.getCell(1, tStart), { value: sh.title || sh.name });
    ws.getCell(1, tStart).font = { name: 'Calibri', size: 17, bold: true, color: { argb: 'FF' + BRAND.charcoal } };
    ws.getCell(2, tStart).value = sh.subtitle || ''; ws.getCell(2, tStart).font = { name: 'Calibri', size: 11, color: { argb: 'FF' + BRAND.muted } };
    ws.getCell(3, tStart).value = CFG.MOTTO || ''; ws.getCell(3, tStart).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF' + BRAND.orange } };
    [1, 2, 3].forEach(r => { ws.getCell(r, tStart).alignment = { vertical: 'middle', wrapText: false }; });
    if (!wideMeta) {
      const c = ws.getCell(4, tStart); c.value = `Ref No: ${m.ref}  ·  Issue date: ${m.issue}  ·  Revision: ${m.rev}  ·  Generated ${new Date().toLocaleString('en-GB')} by ${who}`;
      c.font = { name: 'Calibri', size: 8.5, color: { argb: 'FF' + BRAND.muted } }; c.alignment = { wrapText: false };
    } else {
      const meta = [['Ref No:', m.ref], ['Issue date:', m.issue], ['Revision:', m.rev], ['Generated:', `${new Date().toLocaleString('en-GB')} by ${who}`]];
      meta.forEach(([k, v], i) => {
        const a = ws.getCell(i + 1, n - 1), b = ws.getCell(i + 1, n);
        a.value = k; b.value = v;
        a.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF' + BRAND.muted } }; a.alignment = { horizontal: 'right' };
        b.font = { name: 'Calibri', size: 9, color: { argb: 'FF' + BRAND.ink } };
      });
    }
    // orange rule
    const rule = ws.getRow(5); rule.height = 5;
    rule.height = 3; for (let i = 1; i <= n; i++) ws.getCell(5, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND.orange } };
    let r = 6;
    if (sh.note) { ws.mergeCells(r, 1, r, n); const c = ws.getCell(r, 1); c.value = sh.note; c.font = { size: 10, italic: true, color: { argb: 'FF' + BRAND.muted } }; c.alignment = { wrapText: true }; ws.getRow(r).height = 30; r++; }
    if (sh.kpis?.length && n < sh.kpis.length * 2) {
      sh.kpis.forEach(k => {
        const a = ws.getCell(r, 1), b = ws.getCell(r, 2); a.value = k.label; b.value = k.value;
        a.font = { size: 10, color: { argb: 'FF' + BRAND.muted } }; b.font = { size: 12, bold: true, color: { argb: 'FF' + (k.tone === 'bad' ? 'B3261E' : k.tone === 'warn' ? '8A5A00' : BRAND.charcoal) } };
        b.alignment = { horizontal: 'left' }; r++;
      });
      r++;
    } else if (sh.kpis?.length) {
      const per = Math.max(1, Math.floor(n / sh.kpis.length));
      sh.kpis.forEach((k, i) => {
        const c0 = 1 + i * per, c1 = Math.min(n, c0 + per - 1);
        if (c1 > c0) { ws.mergeCells(r, c0, r, c1); ws.mergeCells(r + 1, c0, r + 1, c1); }
        const v = ws.getCell(r, c0), l = ws.getCell(r + 1, c0);
        v.value = k.value; v.font = { size: 18, bold: true, color: { argb: 'FF' + (k.tone === 'bad' ? 'B3261E' : k.tone === 'warn' ? '8A5A00' : BRAND.charcoal) } };
        l.value = k.label; l.font = { size: 9, color: { argb: 'FF' + BRAND.muted } };
        for (let cc = c0; cc <= c1; cc++) { ws.getCell(r, cc).border = { top: box, ...(cc === c0 ? { left: box } : {}), ...(cc === c1 ? { right: box } : {}) }; ws.getCell(r + 1, cc).border = { bottom: box, ...(cc === c0 ? { left: box } : {}), ...(cc === c1 ? { right: box } : {}) }; }
      });
      ws.getRow(r).height = 26; r += 3;
    }
    const headRow = r;
    const hr = ws.getRow(headRow); hr.height = 30;
    cols.forEach((c, i) => {
      const cell = ws.getCell(headRow, i + 1); cell.value = c.header;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF' + BRAND.ink } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (c.input ? 'FCE3C4' : 'EDEEF0') } };
      cell.alignment = { vertical: 'middle', horizontal: c.type === 'num' ? 'right' : 'left', wrapText: true };
      cell.border = { top: thin, bottom: { style: 'medium', color: { argb: 'FF' + BRAND.ink } } };
    });
    r++;
    let zebra = 0, lastGroup = null;
    const firstData = r;
    for (const row of sh.rows) {
      if (sh.group && row[sh.group] !== lastGroup) {
        lastGroup = row[sh.group];
        ws.mergeCells(r, 1, r, n); const g = ws.getCell(r, 1); g.value = lastGroup || '—';
        g.font = { bold: true, size: 10.5, color: { argb: 'FF' + BRAND.ink } }; g.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F6F7' } };
        g.border = { bottom: thin }; ws.getRow(r).height = 18; r++; zebra = 0;
      }
      cols.forEach((c, i) => {
        const cell = ws.getCell(r, i + 1); let v = row[c.key];
        if (c.type === 'date' && v) { v = new Date(String(v).length === 10 ? v + 'T00:00:00' : v); cell.numFmt = 'dd mmm yyyy'; }
        if (c.type === 'num' && v !== '' && v != null && !isNaN(+v)) { v = +v; cell.numFmt = '#,##0.##'; }
        cell.value = v ?? '';
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF' + BRAND.ink }, bold: !!c.bold };
        cell.alignment = { vertical: 'top', horizontal: c.type === 'num' ? 'right' : 'left', wrapText: !!c.wrap };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FF' + BRAND.line } } };
        const fill = c.input ? BRAND.input : null;
        const st = sh.cellStyle && sh.cellStyle(row, c.key);
        if (st && STATUS_FILL[st]) cell.font = { ...cell.font, bold: true, color: { argb: 'FF' + STATUS_FILL[st][1] } };
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } };
        if (c.input) cell.protection = { locked: false };
      });
      r++; zebra++;
    }
    if (!sh.rows.length) { ws.mergeCells(r, 1, r, n); ws.getCell(r, 1).value = 'No rows.'; ws.getCell(r, 1).font = { italic: true, color: { argb: 'FF' + BRAND.muted } }; r++; }
    if (sh.totals?.length && sh.rows.length) {
      cols.forEach((c, i) => {
        const cell = ws.getCell(r, i + 1);
        if (i === 0) cell.value = 'Total';
        if (sh.totals.includes(c.key)) { cell.value = sh.rows.reduce((a, x) => a + (+x[c.key] || 0), 0); cell.numFmt = '#,##0.##'; }
        cell.font = { bold: true, color: { argb: 'FF' + BRAND.ink } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEEF0' } };
        cell.border = { top: { style: 'thin', color: { argb: 'FF' + BRAND.ink } } };
        cell.alignment = { horizontal: c.type === 'num' ? 'right' : 'left' };
      });
      r++;
    }
    ws.views = [{ state: 'frozen', ySplit: headRow, xSplit: 0, showGridLines: false }];
    if (sh.rows.length && !sh.group) ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: r - 1, column: n } };
    ws.pageSetup.printTitlesRow = `${headRow}:${headRow}`;
    if (sh.hideFirst) ws.getColumn(1).hidden = true;
    r += 1; ws.getCell(r, 1).value = `${CFG.COMPANY || ''} · ${CFG.MOTTO || ''}`;
    ws.getCell(r, 1).font = { size: 9, italic: true, color: { argb: 'FF' + BRAND.grey } };
    sh._firstData = firstData;
  }
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), file);
}

async function readXlsx(fileObj) {
  await loadScript('vendor/exceljs.min.js');
  const wb = new window.ExcelJS.Workbook();
  await wb.xlsx.load(await fileObj.arrayBuffer());
  for (const ws of wb.worksheets) {
    let headRow = null, headers = [];
    ws.eachRow((row, i) => {
      if (headRow) return;
      const vals = row.values.map(v => String(v?.richText ? v.richText.map(t => t.text).join('') : v ?? '').trim());
      if (vals.includes('App ID')) { headRow = i; headers = vals; }
    });
    if (!headRow) continue;
    const out = [];
    ws.eachRow((row, i) => {
      if (i <= headRow) return;
      const o = {}; let any = false;
      headers.forEach((h, c) => {
        if (!h) return; let v = row.getCell(c).value;
        if (v && typeof v === 'object') { if (v instanceof Date) v = v.toISOString().slice(0, 10); else if (v.result !== undefined) v = v.result; else if (v.richText) v = v.richText.map(t => t.text).join(''); else if (v.text) v = v.text; }
        if (v !== null && v !== undefined && String(v).trim() !== '') any = true;
        o[h] = v;
      });
      if (any && o['App ID'] !== 'Total') out.push(o);
    });
    return out;
  }
  throw new Error('This file doesn’t look like one of the Nest templates (no “App ID” column found). Download a fresh template and try again.');
}
function cellDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().slice(0, 10); }
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const d = new Date(s); if (!isNaN(d)) { d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  return 'invalid';
}

// ================================================================ PDF
// Design A (printer-friendly): white page, colour logo, one thin orange rule,
// light grey table headers, statuses as coloured bold text.
const PDF_INK = { ink: '1C1D20', muted: '62666C', rule: 'D5D7DA', box: 'BFC1C5', head: 'EDEEF0', group: 'F6F6F7', orange: 'E8552C' };
const STATUS_TEXT = { low: '8A5A00', warn: '8A5A00', damaged: 'B3261E', overdue: 'B3261E', bad: 'B3261E', ok: '217A4B', out: '2257C9' };
const PDF_TOP = 30, PDF_BOTTOM = 15;

async function pdfInit(orientation = 'landscape') {
  await loadScript('vendor/jspdf.umd.min.js'); await loadScript('vendor/jspdf.plugin.autotable.min.js'); await loadScript('vendor/pdf-fonts.js');
  const doc = new window.jspdf.jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  const F = window.PDF_FONTS;
  doc.addFileToVFS('Barlow-Regular.ttf', F['Barlow-Regular']); doc.addFont('Barlow-Regular.ttf', 'Barlow', 'normal');
  doc.addFileToVFS('Barlow-SemiBold.ttf', F['Barlow-SemiBold']); doc.addFont('Barlow-SemiBold.ttf', 'Barlow', 'bold');
  doc.addFileToVFS('Montserrat-ExtraBold.ttf', F['Montserrat-ExtraBold']); doc.addFont('Montserrat-ExtraBold.ttf', 'Montserrat', 'bold');
  doc.setFont('Barlow', 'normal');
  return doc;
}
const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
// Replace glyphs the PDF fonts can't draw
const pdfText = s => String(s ?? '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/⅞/g, ' 7/8').replace(/⅛/g, ' 1/8').replace(/⅜/g, ' 3/8').replace(/⅝/g, ' 5/8').replace(/–|—/g, '-').replace(/µ/g, 'µ').replace(/→/g, '>');
const pdfStamp = d => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function dataImage(dataUrl) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  return { dataUrl, w: img.naturalWidth, h: img.naturalHeight };
}

async function pdfFrame(doc, { title, subtitle, draft }) {
  const logo = await imageB64('brand/logo-full.png');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const m = qmsMeta(); const who = S.profile?.full_name || S.profile?.email || '';
  const stamp = pdfStamp(Date.now());
  return function decorate(pageNo) {
    // header: logo left, title right, one thin orange rule
    const lh = 11, lw = lh * logo.w / logo.h;
    doc.addImage(logo.dataUrl, 'PNG', 10, 8, lw, lh, 'gankco-logo', 'FAST');
    const maxT = W - 20 - lw - 12;
    let fs = 14; doc.setFont('Montserrat', 'bold');
    do { doc.setFontSize(fs); fs -= .5; } while (doc.getTextWidth(pdfText(title)) > maxT && fs > 9);
    doc.setTextColor(...rgb(PDF_INK.ink)); doc.text(pdfText(title), W - 10, 13, { align: 'right' });
    if (subtitle) {
      doc.setFont('Barlow', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...rgb(PDF_INK.muted));
      const st = doc.splitTextToSize(pdfText(subtitle), maxT)[0];
      doc.text(st, W - 10, 18.5, { align: 'right' });
    }
    doc.setFillColor(...rgb(PDF_INK.orange)); doc.rect(10, 22.5, W - 20, .6, 'F');
    // footer
    doc.setDrawColor(...rgb(PDF_INK.rule)); doc.setLineWidth(.2); doc.line(10, H - 11, W - 10, H - 11);
    doc.setFont('Barlow', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...rgb(PDF_INK.muted));
    doc.text(pdfText(`${CFG.COMPANY || ''} · ${CFG.MOTTO || ''}`), 10, H - 6.5);
    doc.text(pdfText(`Ref ${m.ref} · Rev ${m.rev} · Generated ${stamp} by ${who}`), W / 2, H - 6.5, { align: 'center' });
    doc.text(`Page ${pageNo} of {total}`, W - 10, H - 6.5, { align: 'right' });
    if (draft) {
      doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.13 }));
      doc.setFont('Montserrat', 'bold'); doc.setFontSize(W > H ? 50 : 40); doc.setTextColor(120, 120, 120);
      doc.text(pdfText(typeof draft === 'string' ? draft : 'DRAFT'), W / 2, H / 2 + 10, { align: 'center', angle: 18 });
      doc.restoreGraphicsState();
    }
  };
}

// Signature images by id (cached). 2.8: blank edges and stray specks are trimmed, and each person's size and position are applied.
const _sigCache = {};
async function trimSignature(dataUrl) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return { dataUrl, w, h };
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const p = x.getImageData(0, 0, w, h).data; const col = new Float64Array(w), row = new Float64Array(h); let tot = 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const i = (yy * w + xx) * 4; const L = p[i] * .299 + p[i + 1] * .587 + p[i + 2] * .114;
    const ink = p[i + 3] > 40 && L < 235 ? p[i + 3] / 255 : 0; if (ink) { col[xx] += ink; row[yy] += ink; tot += ink; } }
  if (!tot) return { dataUrl, w, h };
  // keep 99.4% of the ink: drops specks and dots far from the signature
  const cut = (arr) => { let a = 0, lo = 0, hi = arr.length - 1, s = 0; for (; lo < arr.length; lo++) { s += arr[lo]; if (s > tot * .003) break; } s = 0; for (; hi > 0; hi--) { s += arr[hi]; if (s > tot * .003) break; } return [lo, hi]; };
  const [x0, x1] = cut(col), [y0, y1] = cut(row); const pad = 3;
  const sx = Math.max(0, x0 - pad), sy = Math.max(0, y0 - pad), cw = Math.min(w - 1, x1 + pad) - sx + 1, ch = Math.min(h - 1, y1 + pad) - sy + 1;
  if (cw < 8 || ch < 4 || (cw >= w - 2 && ch >= h - 2)) return { dataUrl, w, h };
  const o = document.createElement('canvas'); o.width = cw; o.height = ch; o.getContext('2d').drawImage(c, sx, sy, cw, ch, 0, 0, cw, ch);
  return { dataUrl: o.toDataURL('image/png'), w: cw, h: ch };
}
function sigCacheClear(id) { if (id) delete _sigCache[id]; else Object.keys(_sigCache).forEach(k => delete _sigCache[k]); }
async function sigImages(ids) {
  const need = [...new Set(ids.filter(id => id && !_sigCache[id]))];
  if (need.length) {
    let rows = await q(sb.from('signatures').select('id,image,fit_scale,fit_dy').in('id', need)).catch(() => null);
    if (!rows) rows = await q(sb.from('signatures').select('id,image').in('id', need)).catch(() => []);
    for (const r of rows) { try { const t = await trimSignature(r.image); _sigCache[r.id] = { ...t, scale: +r.fit_scale || 1, dy: +r.fit_dy || 0 }; } catch (e) { /* skip broken image */ } }
  }
  return Object.fromEntries(ids.filter(id => _sigCache[id]).map(id => [id, _sigCache[id]]));
}
// A signature box filled from a sign_events row
const sigFromEvent = (label, ev, fallback = {}) => ev
  ? { label, name: ev.user_name, title: ev.job_title || fallback.title || '', sigId: ev.signature_id, signedAt: ev.signed_at }
  : { label, name: fallback.name || '', title: fallback.title || '', date: fallback.date || '' };
// "Prepared by" signed by whoever downloads the document
function mySignature(label = 'Prepared by', docTitle) {
  if (docTitle) sb.rpc('log_signed_export', { p_title: docTitle, p_dept: S.line ? +S.line : null }).then(() => { }, () => { });
  return { label, name: S.profile.full_name || S.profile.email, title: S.profile.job_title || '', sigId: S.profile.signature_id, signedAt: new Date().toISOString() };
}
async function signEvents(type, ids) {
  ids = [].concat(ids).filter(Boolean); if (!ids.length) return [];
  return q(sb.from('sign_events').select('*').eq('doc_type', type).in('doc_id', ids).eq('void', false).order('signed_at')).catch(() => []);
}

function drawSignatures(doc, signatures, y, imgs) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const per = Math.min(Math.max(signatures.length, 3), W > H ? 4 : 3), gap = 8, sw = (W - 20 - (per - 1) * gap) / per, rowH = 38;
  signatures.forEach((s, i) => {
    if (i % per === 0) {
      if (i) y += rowH;
      if (y + rowH > H - PDF_BOTTOM - 2) { doc.addPage(); y = PDF_TOP + 6; }
    }
    const x = 10 + (i % per) * (sw + gap);
    doc.setFont('Barlow', 'bold'); doc.setFontSize(7.8); doc.setTextColor(...rgb(PDF_INK.muted));
    doc.text(pdfText(String(s.label || '').toUpperCase()), x, y, { charSpace: .4, maxWidth: sw });
    const img = s.sigId && imgs[s.sigId];
    if (img) {
      const k = img.scale || 1, maxH = 13 * k, maxW = Math.min(sw * .9, 55 * k); let h = maxH, w = h * img.w / img.h;
      if (w > maxW) { w = maxW; h = w * img.h / img.w; }
      doc.addImage(img.dataUrl, 'PNG', x, y + 2 + (13 - h) + (img.dy || 0), w, h, 'sig-' + s.sigId, 'FAST');
    }
    doc.setDrawColor(...rgb(PDF_INK.ink)); doc.setLineWidth(.25); doc.line(x, y + 16, x + sw, y + 16);
    doc.setFont('Barlow', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...rgb(PDF_INK.ink));
    if (s.name) doc.text(pdfText(s.name), x, y + 20.5, { maxWidth: sw });
    doc.setFontSize(7.8); doc.setTextColor(...rgb(PDF_INK.muted));
    if (s.title) doc.text(pdfText(s.title), x, y + 24.5, { maxWidth: sw });
    const foot = s.signedAt ? `Signed in GANKCO Nest · ${pdfStamp(s.signedAt)}` : s.date ? `Date: ${s.date}` : (s.name ? 'Signature / date' : 'Name, signature / date');
    doc.setFontSize(7.2); doc.text(pdfText(foot), x, y + (s.title ? 28.5 : 24.5), { maxWidth: sw });
  });
  return y + rowH;
}

/* sections: [{ heading, headingNote, note, columns:[{header,dataKey,width,align,bold}], rows:[obj], cellStyle?(row,key)->status, fontSize }]
   rows may carry _group (category heading) and _st:{dataKey: status} (for frozen reports)
   kpis: [{label, value, tone}], meta: [[k,v]], signatures: [{label, name, title, sigId|image, signedAt, date}]
   draft: false | true | 'TEXT' (light diagonal mark on every page) */
async function brandPdf({ file, title, subtitle, orientation = 'landscape', meta = [], kpis = [], sections = [], signatures = [], intro, draft = false, output }) {
  const doc = await pdfInit(orientation);
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const decorate = await pdfFrame(doc, { title, subtitle, draft });
  const sigIds = signatures.map(s => s.sigId).filter(Boolean);
  const imgs = sigIds.length ? await sigImages(sigIds) : {};
  for (const s of signatures) if (s.image && !s.sigId) { s.sigId = 'x' + Math.random(); imgs[s.sigId] = await dataImage(s.image); }
  let y = PDF_TOP;
  // QMS block (+ extra details) in a thin box on the right
  const m = qmsMeta();
  const metaRows = [['Ref No', m.ref], ['Issue date', m.issue], ['Revision', m.rev], ...meta];
  const boxW = 78, rowH = 4.6, boxX = W - 10 - boxW;
  doc.setDrawColor(...rgb(PDF_INK.box)); doc.setLineWidth(.25); doc.rect(boxX, y, boxW, metaRows.length * rowH + 3, 'S');
  metaRows.forEach(([k, v], i) => {
    doc.setFontSize(7.6); doc.setTextColor(...rgb(PDF_INK.muted)); doc.setFont('Barlow', 'bold'); doc.text(pdfText(k), boxX + 3, y + 4.6 + i * rowH);
    doc.setFont('Barlow', 'normal'); doc.setTextColor(...rgb(PDF_INK.ink)); doc.text(doc.splitTextToSize(pdfText(v), boxW - 29)[0] || '', boxX + 26, y + 4.6 + i * rowH);
  });
  const metaBottom = y + metaRows.length * rowH + 3;
  let introH = 0;
  if (intro) {
    doc.setFont('Barlow', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...rgb(PDF_INK.ink));
    const L = doc.splitTextToSize(pdfText(intro), W - 20 - boxW - 8); doc.text(L, 10, y + 4); introH = L.length * 4.2 + 5;
  }
  // summary boxes
  if (kpis.length) {
    const avail = W - 20 - boxW - 8; const gap = 3; const cw = Math.min(42, (avail - gap * (kpis.length - 1)) / kpis.length);
    const ky = y + introH;
    kpis.forEach((k, i) => {
      const x = 10 + i * (cw + gap);
      doc.setDrawColor(...rgb(PDF_INK.box)); doc.setLineWidth(.25); doc.rect(x, ky, cw, 16, 'S');
      doc.setFont('Montserrat', 'bold'); doc.setFontSize(14); doc.setTextColor(...rgb(k.tone === 'bad' ? 'B3261E' : PDF_INK.ink));
      doc.text(pdfText(k.value), x + 3.5, ky + 8.5);
      doc.setFont('Barlow', 'normal'); doc.setFontSize(7.4); doc.setTextColor(...rgb(PDF_INK.muted)); doc.text(doc.splitTextToSize(pdfText(k.label), cw - 5)[0], x + 3.5, ky + 13.5);
    });
    y = Math.max(metaBottom, ky + 16) + 8;
  } else y = Math.max(metaBottom, y + introH) + 8;

  const autoTable = window.autoTable || (window.jspdf_autotable && window.jspdf_autotable.autoTable);
  const tableOpts = (s, R, startY, hook) => ({
    startY, margin: { left: 10, right: 10, top: PDF_TOP, bottom: PDF_BOTTOM }, rowPageBreak: 'avoid',
    columns: s.columns.map(c => ({ header: c.header, dataKey: c.dataKey })),
    body: R.map(r => Object.fromEntries(s.columns.map(c => [c.dataKey, r._spacer ? '' : pdfText(r[c.dataKey] ?? '')]))),
    theme: 'plain',
    styles: { font: 'Barlow', fontStyle: 'normal', fontSize: s.fontSize || 8, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, textColor: rgb(PDF_INK.ink), lineColor: rgb(PDF_INK.rule), lineWidth: { bottom: .15 }, overflow: 'linebreak', valign: 'middle' },
    headStyles: { font: 'Barlow', fontStyle: 'bold', fillColor: rgb(PDF_INK.head), textColor: rgb(PDF_INK.ink), fontSize: (s.fontSize || 8) + .2, lineColor: rgb(PDF_INK.ink), lineWidth: { bottom: .35 } },
    columnStyles: Object.fromEntries(s.columns.map(c => [c.dataKey, { cellWidth: c.width || 'auto', halign: c.align || 'left', fontStyle: c.bold ? 'bold' : 'normal' }])),
    didParseCell: d => {
      const col = s.columns.find(c => c.dataKey === d.column.dataKey);
      if (col?.align === 'right') d.cell.styles.halign = 'right';
      if (d.section !== 'body') return;
      const row = R[d.row.index]; if (!row) return;
      if (row._spacer) { Object.assign(d.cell.styles, { minCellHeight: row.h, fillColor: false, lineWidth: 0, cellPadding: 0 }); if (d.column.index === 0) d.cell.colSpan = s.columns.length; return; }
      if (row._group) { Object.assign(d.cell.styles, { fillColor: rgb(PDF_INK.group), textColor: rgb(PDF_INK.ink), fontStyle: 'bold' }); if (d.column.index === 0) { d.cell.colSpan = s.columns.length; d.cell.styles.halign = 'left'; } return; }
      if (row._total) { Object.assign(d.cell.styles, { fillColor: rgb(PDF_INK.head), fontStyle: 'bold', lineColor: rgb(PDF_INK.ink), lineWidth: { top: .35 } }); if (d.column.dataKey === 'size') d.cell.styles.fontStyle = 'normal'; return; }
      const st = (s.cellStyle && s.cellStyle(row, d.column.dataKey)) || (row._st && row._st[d.column.dataKey]);
      if (st && STATUS_TEXT[st]) { d.cell.styles.textColor = rgb(STATUS_TEXT[st]); d.cell.styles.fontStyle = 'bold'; }
    },
    didDrawCell: hook,
  });
  for (const s of sections) {
    if (y > H - 40) { doc.addPage(); y = PDF_TOP + 2; }
    if (s.heading) {
      doc.setFont('Montserrat', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...rgb(PDF_INK.ink)); doc.text(pdfText(s.heading), 10, y + .4);
      doc.setFillColor(...rgb(PDF_INK.orange)); doc.rect(10, y + 1.8, 12, .6, 'F');
      if (s.headingNote) { doc.setFont('Barlow', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...rgb(PDF_INK.muted)); doc.text(pdfText(s.headingNote), W - 10, y + .4, { align: 'right' }); }
      y += 5;
    }
    if (s.note) { doc.setFont('Barlow', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...rgb(PDF_INK.muted)); const L = doc.splitTextToSize(pdfText(s.note), W - 20); doc.text(L, 10, y + 2); y += L.length * 3.8 + 1; }
    // keep each category heading with its first item: dry run, then push stranded headings to the next page
    let R = s.rows.slice();
    if (R.some(r => r._group)) {
      for (let pass = 0; pass < 12; pass++) {
        const pos = {}; const dry = await pdfInit(orientation);
        autoTable(dry, tableOpts(s, R, y + 1, d => { if (d.section === 'body' && d.column.index === 0) pos[d.row.index] = { page: d.pageNumber, y: d.cell.y }; }));
        const i = R.findIndex((r, k) => r._group && pos[k] && pos[k + 1] && pos[k + 1].page !== pos[k].page);
        if (i < 0) break;
        R.splice(i, 0, { _spacer: true, h: Math.max(1, H - PDF_BOTTOM - pos[i].y - 0.3) });
      }
    }
    autoTable(doc, tableOpts(s, R, y + 1));
    y = doc.lastAutoTable.finalY + 9;
  }
  if (signatures.length) {
    y += 3;
    if (y > H - PDF_BOTTOM - 38) { doc.addPage(); y = PDF_TOP + 6; }
    drawSignatures(doc, signatures, y, imgs);
  }
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); decorate(p); }
  doc.putTotalPages('{total}');
  if (output === 'blob') return doc.output('blob');
  doc.save(file);
}

// ================================================================ TEMPLATES & UPLOADS
const TEMPLATE_INFO = {
  locations: { title: 'Item locations', file: 'Nest_Template_Locations' },
  quantities: { title: 'Quantity corrections', file: 'Nest_Template_Quantities' },
  kits: { title: 'Redress kits & expiry dates', file: 'Nest_Template_Redress_Kits' },
};
function templateLines() { const ids = myLineIds(); return S.depts.filter(d => (!S.line || d.id === +S.line) && (isAdmin() || ids.includes(d.id))); }

async function downloadTemplate(kind) {
  const its = await items(); await stockRows(true);
  const lines = templateLines(); const lineIds = lines.map(d => d.id);
  const mine = its.filter(i => i.active && lineIds.includes(i.department_id));
  const real = realLocs(); const ph = placeholderLoc();
  const scope = lines.length === S.depts.length ? 'All service lines' : lines.map(d => d.short_name || d.name).join(', ');
  const info = TEMPLATE_INFO[kind];
  let sheet, instructions;
  if (kind === 'locations') {
    sheet = { name: 'Locations', title: info.title, subtitle: scope, hideFirst: false, group: 'line',
      columns: [{ header: 'App ID', key: 'id', width: 8 }, { header: 'Item Code', key: 'code', width: 24 }, { header: 'Description', key: 'name', width: 52, wrap: true },
        { header: 'In store (available)', key: 'total', width: 12, type: 'num' },
        ...real.map(l => ({ header: l.name, key: 'L' + l.id, width: 14, type: 'num', input: true })),
        { header: 'Location not set (now)', key: 'unset', width: 13, type: 'num' }],
      rows: mine.map(i => { const r = { id: i.id, code: i.code, name: i.name, line: i.department, total: 0, unset: ph ? stockOf(i.id, ph.id) : 0 };
        S.locs.forEach(l => { r.total += stockOf(i.id, l.id); }); real.forEach(l => { r['L' + l.id] = stockOf(i.id, l.id) || ''; }); return r; }) };
    instructions = ['How to fill in the locations template', '1. For each item, type how many are in each location (the orange columns). Leave blank or 0 if none.',
      '2. The numbers across the location columns must not add up to more than “In store (available)”. Anything not placed stays as “Location not set”.',
      '3. Don’t change the App ID column: the app uses it to find the item.', '4. Save the file, then in Nest go to Inventory → Excel templates → Upload, and pick this file. You’ll see a preview before anything changes.',
      'Location changes are moves: they apply straight away and are recorded in the history with your name.'];
  } else if (kind === 'quantities') {
    const rows = [];
    mine.forEach(i => {
      const st = S.stock.filter(s => s.item_id === i.id);
      if (!st.length) rows.push({ id: i.id, code: i.code, name: i.name, line: i.department, loc: '', status: 'Available', cur: 0, neu: '', reason: '' });
      st.forEach(s => rows.push({ id: i.id, code: i.code, name: i.name, line: i.department, loc: locName(s.location_id), status: STATUS[s.status], cur: s.qty, neu: '', reason: '' }));
    });
    sheet = { name: 'Quantities', title: info.title, subtitle: scope, group: 'line',
      columns: [{ header: 'App ID', key: 'id', width: 8 }, { header: 'Item Code', key: 'code', width: 24 }, { header: 'Description', key: 'name', width: 50, wrap: true },
        { header: 'Location', key: 'loc', width: 16, input: true }, { header: 'Status', key: 'status', width: 12 }, { header: 'Current qty', key: 'cur', width: 11, type: 'num' },
        { header: 'New qty', key: 'neu', width: 11, type: 'num', input: true }, { header: 'Reason', key: 'reason', width: 34, input: true, wrap: true }],
      rows };
    instructions = ['How to fill in the quantity corrections template', '1. Type the correct number in “New qty” only for the rows that are wrong. Leave the rest blank.',
      '2. Add a short reason (for example “found 2 extra in Warri store”). If you leave it blank, the reason you give when uploading is used.',
      `3. Location must be one of: ${S.locs.map(l => l.name).join(', ')}.`, '4. Upload it from Inventory → Excel templates → Upload. Staff changes go to your service-line admin for approval as one request.'];
  } else if (kind === 'kits') {
    const kitItems = mine.filter(i => i.is_kit);
    const units = kitItems.length ? await q(sb.from('units').select('id,item_id,serial_no,unit_components(expiry_on,batch_no,notes,kit_components(name,part_no))').in('item_id', kitItems.map(i => i.id)).eq('active', true)) : [];
    const rows = [];
    kitItems.forEach(i => {
      const us = units.filter(u => u.item_id === i.id);
      if (!us.length) rows.push({ id: i.id, code: i.code, name: i.name, line: i.department, kit: '', comp: '', part: '', exp: '', batch: '', notes: '' });
      us.forEach(u => {
        const cs = u.unit_components || [];
        if (!cs.length) rows.push({ id: i.id, code: i.code, name: i.name, line: i.department, kit: u.serial_no, comp: '', part: '', exp: '', batch: '', notes: '' });
        cs.forEach(c => rows.push({ id: i.id, code: i.code, name: i.name, line: i.department, kit: u.serial_no, comp: c.kit_components?.name, part: c.kit_components?.part_no || '', exp: c.expiry_on || '', batch: c.batch_no || '', notes: c.notes || '' }));
      });
    });
    sheet = { name: 'Redress kits', title: info.title, subtitle: scope, group: 'line',
      columns: [{ header: 'App ID', key: 'id', width: 8 }, { header: 'Item Code', key: 'code', width: 26 }, { header: 'Kit description', key: 'name', width: 44, wrap: true },
        { header: 'Kit no.', key: 'kit', width: 12, input: true }, { header: 'Component', key: 'comp', width: 26, input: true }, { header: 'Part no.', key: 'part', width: 14, input: true },
        { header: 'Expiry date', key: 'exp', width: 13, type: 'date', input: true }, { header: 'Batch / lot', key: 'batch', width: 13, input: true }, { header: 'Notes', key: 'notes', width: 24, input: true }],
      rows };
    instructions = ['How to fill in the redress kit template', '1. One row per component per physical kit. Give each physical kit a number (for example K-01, K-02) and use it on every row for that kit.',
      '2. To add rows, copy an existing row for the same kit type (keep the App ID and Item Code) and change the kit number and component.',
      '3. Expiry date: use the date printed on the packaging (for example 15/03/2027). Leave it blank for components that don’t expire.',
      '4. A kit’s expiry is the earliest expiry of its components. Nest warns you ' + setting('kit_warn_days', 60) + ' days before.',
      '5. Upload from Inventory → Excel templates → Upload. Staff uploads go to the service-line admin for approval.'];
  }
  await brandXlsx({ file: `${info.file}_${localISO(0)}.xlsx`, sheets: [sheet], instructions });
}

async function uploadTemplate() {
  return modal({
    title: 'Upload a filled template', sub: 'Pick a Nest template you downloaded and filled in. You’ll see what will change before anything is saved.', submit: 'Check file',
    body: `<label class="f">Template<select name="kind">${Object.entries(TEMPLATE_INFO).map(([k, v]) => opt(k, v.title)).join('')}</select></label>
      <label class="f">File<input type="file" name="file" accept=".xlsx" required></label>`,
    onSubmit: async (d, dlg) => {
      const f = $('input[type=file]', dlg).files[0]; if (!f) throw new Error('Choose the Excel file.');
      const rows = await readXlsx(f);
      setTimeout(() => previewUpload(d.kind, rows), 50);
    }
  });
}

async function previewUpload(kind, rows) {
  const its = await items(); await stockRows(true);
  const byId = new Map(its.map(i => [i.id, i])); const byCode = new Map();
  its.forEach(i => { const k = (i.code || '').toLowerCase(); if (!byCode.has(k)) byCode.set(k, []); byCode.get(k).push(i); });
  const find = r => { const id = +r['App ID']; if (id && byId.has(id)) return byId.get(id); const c = byCode.get(String(r['Item Code'] || '').trim().toLowerCase()); return c && c.length === 1 ? c[0] : null; };
  const locByName = n => S.locs.find(l => l.name.toLowerCase() === String(n || '').trim().toLowerCase());
  const errs = [], ok = [];
  if (kind === 'locations') {
    const real = realLocs(); const ph = placeholderLoc();
    rows.forEach((r, ix) => {
      const it = find(r); if (!it) return errs.push(`Row ${ix + 1}: item not found (${r['Item Code'] || r['App ID']})`);
      if (!canAct(it.department_id)) return errs.push(`${it.code || it.name}: not in your service line`);
      const want = {}; let placed = 0;
      for (const l of real) { const v = r[l.name]; const n = v === '' || v == null ? 0 : +v; if (isNaN(n) || n < 0) return errs.push(`${it.code}: “${l.name}” must be a number`); want[l.id] = n; placed += n; }
      const have = {}; let total = 0; S.locs.forEach(l => { have[l.id] = stockOf(it.id, l.id); total += have[l.id]; });
      if (placed > total) return errs.push(`${it.code || it.name}: ${placed} placed but only ${total} in store`);
      if (ph) want[ph.id] = total - placed;
      S.locs.forEach(l => { if (want[l.id] === undefined) want[l.id] = have[l.id]; });
      // compute moves from surplus to deficit
      const surplus = S.locs.filter(l => have[l.id] > want[l.id]).map(l => ({ id: l.id, n: have[l.id] - want[l.id] }));
      const deficit = S.locs.filter(l => have[l.id] < want[l.id]).map(l => ({ id: l.id, n: want[l.id] - have[l.id] }));
      for (const dd of deficit) for (const ss of surplus) { if (!dd.n) break; const m = Math.min(dd.n, ss.n); if (m > 0) { ok.push({ item: it, from: ss.id, to: dd.id, qty: m }); dd.n -= m; ss.n -= m; } }
    });
    return confirmUpload(kind, ok, errs, ['Item', 'From', 'To', 'Qty'], o => [`${o.item.code || ''} ${o.item.name}`, locName(o.from), locName(o.to), fq(o.qty)],
      async () => { await q(sb.rpc('bulk_move', { p_moves: ok.map(o => ({ item_id: o.item.id, from: o.from, to: o.to, qty: o.qty })), p_notes: 'Excel upload' })); return `Moved ${plural(ok.length, 'item')}`; });
  }
  if (kind === 'quantities') {
    rows.forEach((r, ix) => {
      if (r['New qty'] === '' || r['New qty'] == null) return;
      const it = find(r); if (!it) return errs.push(`Row ${ix + 1}: item not found (${r['Item Code'] || r['App ID']})`);
      if (!canAct(it.department_id)) return errs.push(`${it.code || it.name}: not in your service line`);
      const loc = locByName(r['Location']); if (!loc) return errs.push(`${it.code}: location “${r['Location'] || ''}” not recognised`);
      const st = Object.keys(STATUS).find(k => STATUS[k].toLowerCase() === String(r['Status'] || 'Available').toLowerCase()) || 'available';
      const n = +r['New qty']; if (isNaN(n) || n < 0) return errs.push(`${it.code}: new qty must be 0 or more`);
      const cur = stockOf(it.id, loc.id, st); if (cur === n) return;
      ok.push({ item: it, loc: loc.id, status: st, cur, n, reason: r['Reason'] || '' });
    });
    return confirmUpload(kind, ok, errs, ['Item', 'Location', 'Was', 'Now', 'Reason'], o => [`${o.item.code || ''} ${o.item.name}`, `${locName(o.loc)} (${STATUS[o.status].toLowerCase()})`, fq(o.cur), fq(o.n), o.reason],
      async (reason) => { const res = await q(sb.rpc('submit_changes', { p_changes: ok.map(o => ({ item_id: o.item.id, location_id: o.loc, status: o.status, qty_after: o.n, reason: o.reason })), p_reason: reason })); return describeSubmit(res); }, true);
  }
  if (kind === 'kits') {
    rows.forEach((r, ix) => {
      const it = find(r); if (!it) return errs.push(`Row ${ix + 1}: item not found (${r['Item Code'] || r['App ID']})`);
      const kit = String(r['Kit no.'] ?? '').trim(); if (!kit) return;
      if (!canAct(it.department_id)) return errs.push(`${it.code || it.name}: not in your service line`);
      const exp = cellDate(r['Expiry date']); if (exp === 'invalid') return errs.push(`${it.code} kit ${kit}: expiry date “${r['Expiry date']}” not understood`);
      ok.push({ item: it, kit_no: kit, component: String(r['Component'] ?? '').trim(), part_no: String(r['Part no.'] ?? '').trim(), expiry_on: exp, batch_no: String(r['Batch / lot'] ?? '').trim(), notes: String(r['Notes'] ?? '').trim() });
    });
    return confirmUpload(kind, ok, errs, ['Kit', 'Kit no.', 'Component', 'Expiry'], o => [`${o.item.code || ''} ${o.item.name}`, o.kit_no, o.component || '—', o.expiry_on ? fd(o.expiry_on) : 'No expiry'],
      async (reason) => { const res = await q(sb.rpc('submit_kits', { p_rows: ok.map(o => ({ item_id: o.item.id, kit_no: o.kit_no, component: o.component, part_no: o.part_no, expiry_on: o.expiry_on, batch_no: o.batch_no, notes: o.notes })), p_reason: reason })); return describeSubmit(res); }, true);
  }
}
function describeSubmit(res) {
  const applied = res.filter(r => r.state === 'approved').length, pend = res.filter(r => r.state === 'pending').length;
  return [applied ? `Applied ${plural(applied, 'request')}` : '', pend ? `Sent ${plural(pend, 'request')} for approval` : ''].filter(Boolean).join(' · ') || 'Done';
}
function confirmUpload(kind, ok, errs, head, cells, apply, needsReason) {
  return modal({
    title: `Check: ${TEMPLATE_INFO[kind].title}`, wide: true, submit: ok.length ? (needsReason && !isAdmin() ? 'Send for approval' : 'Apply changes') : null,
    sub: `${plural(ok.length, 'change')} ready${errs.length ? `, ${plural(errs.length, 'row')} skipped` : ''}.`,
    body: `${errs.length ? `<div class="notice bad"><b>Skipped rows</b><ul class="errlist">${errs.slice(0, 30).map(e => `<li>${esc(e)}</li>`).join('')}${errs.length > 30 ? `<li>…and ${errs.length - 30} more</li>` : ''}</ul></div>` : ''}
      ${ok.length ? `<div class="tablewrap" style="max-height:46vh"><table class="t"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${ok.slice(0, 400).map(o => `<tr>${cells(o).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${needsReason ? `<label class="f mt">Reason for this upload<input type="text" name="reason" required placeholder="e.g. October stock-take, Warri store"></label>` : ''}`
        : '<div class="empty">Nothing to change: the file matches what is on record.</div>'}`,
    onSubmit: async d => {
      if (needsReason && !String(d.reason || '').trim()) throw new Error('Give a reason for this upload.');
      const msg = await apply(String(d.reason || '').trim()); toast(msg); refresh();
    }
  });
}
