/* GANKCO Nest — signatures, job titles and report sign-off (preparer → line admin → Developer) */
'use strict';

const SO_STATUS = { review: ['pending', 'Waiting for line admin'], approval: ['soon', 'Waiting for Developer'], final: ['ok', 'Final'], returned: ['rejected', 'Returned'], cancelled: ['muted', 'Withdrawn'] };
const SO_KIND = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' };

// ---------------------------------------------------------------- signature image
// Takes a photo or scan of a signature on white paper and returns a cropped PNG with a see-through background.
async function processSignature(file) {
  if (!file) throw new Error('Choose a photo or scan of your signature.');
  if (!/^image\//.test(file.type)) throw new Error('That file isn’t an image. Use a JPG or PNG photo or scan.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Couldn’t open that image.')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    const D = x.getImageData(0, 0, w, h); const p = D.data;
    // paper brightness = a high percentile of brightness (works for grey-ish phone photos too)
    const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) hist[(p[i] * .299 + p[i + 1] * .587 + p[i + 2] * .114) | 0]++;
    let acc = 0, paper = 255; const target = (w * h) * .6;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) { paper = v; break; } }
    const hi = Math.max(60, paper - 28), lo = Math.max(10, hi - 80);
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4; const L = p[i] * .299 + p[i + 1] * .587 + p[i + 2] * .114;
      let a = L >= hi ? 0 : L <= lo ? 255 : Math.round(255 * (hi - L) / (hi - lo));
      if (p[i + 3] < 255) a = Math.min(a, p[i + 3]);
      // darken the ink a little so it prints crisply, keeping its colour (black or blue pen)
      p[i] = Math.round(p[i] * .55); p[i + 1] = Math.round(p[i + 1] * .55); p[i + 2] = Math.round(p[i + 2] * .7); p[i + 3] = a;
      if (a > 60) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
    }
    if (maxX < 0 || (maxX - minX) < 12 || (maxY - minY) < 6) throw new Error('Couldn’t find a signature in that image. Sign on plain white paper with a dark pen and try again.');
    const inkShare = (maxX - minX) * (maxY - minY) / (w * h);
    x.putImageData(D, 0, 0);
    const pad = 6; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    const s = Math.min(1, 640 / cw, 240 / ch);
    const o = document.createElement('canvas'); o.width = Math.round(cw * s); o.height = Math.round(ch * s);
    const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(c, minX, minY, cw, ch, 0, 0, o.width, o.height);
    const dataUrl = o.toDataURL('image/png');
    return { dataUrl, w: o.width, h: o.height, warn: inkShare > .85 ? 'The background may not have been removed fully. For the best result, sign on plain white paper in good light.' : '' };
  } finally { URL.revokeObjectURL(url); }
}

async function mySigImage() {
  if (!S.profile?.signature_id) return null;
  return (await sigImages([S.profile.signature_id]))[S.profile.signature_id] || null;
}
const sigBox = (img, cls = '') => `<div class="sigbox ${cls}">${img ? `<img src="${img.dataUrl}" alt="Signature">` : '<span class="sub">No signature yet</span>'}</div>`;

function uploadSignature() {
  let pick = null;
  return modal({
    title: S.profile.signature_id ? 'Replace your signature' : 'Add your signature', submit: 'Save signature',
    sub: 'Draw it, or upload a photo of it signed on white paper. Documents you’ve already signed keep the signature they were signed with.',
    body: sigPickerHtml(),
    onOpen: d => { pick = sigPickerBind(d, m => { const e = $('.err', d); e.textContent = m; e.hidden = false; }); },
    onSubmit: async () => {
      const img = pick.value(); if (!img) throw new Error(pick.mode() === 'draw' ? 'Sign in the box first.' : 'Choose a photo or scan of your signature first.');
      const id = await q(sb.rpc('save_signature', { p_image: img }));
      S.profile.signature_id = id; if (S.people[S.profile.id]) S.people[S.profile.id].signature_id = id;
      toast('Signature saved'); render({ quiet: true });
    }
  });
}

// Ask for a signature before signing; resolves true when one is on file
async function needSignature() {
  if (S.profile.signature_id) return true;
  await modal({ title: 'Add your signature first', submit: 'Add signature now', cancel: 'Not now',
    sub: 'Signing puts your signature on the document, so Nest needs a copy of it first. You only do this once.',
    body: '<p class="muted">You can change it later on your <b>My account</b> page.</p>',
    onSubmit: async () => { setTimeout(() => uploadSignature(), 0); } });
  return false;
}

function editJobTitle(p) {
  return modal({ title: `Job title for ${p.full_name || p.email}`, submit: 'Save',
    sub: 'Printed under their name wherever they sign, for example “Operations Manager” or “Store Supervisor”.',
    body: `<label class="f">Job title<input type="text" name="t" value="${esc(p.job_title || '')}" maxlength="80" placeholder="e.g. Thru-Tubing Supervisor"></label>`,
    onSubmit: async x => {
      await q(sb.rpc('set_job_title', { p_user: p.id, p_title: x.t || '' }));
      await loadLookups(); if (p.id === S.profile.id) S.profile.job_title = x.t || null;
      toast('Job title saved'); render({ quiet: true });
    } });
}
const canEditTitle = p => isSuper();

// ---------------------------------------------------------------- report sign-off
const soLine = r => r.department_id ? lineShort(r.department_id) : 'All lines';
function soNext(r) {
  if (r.status === 'review') return `${soLine(r)} admin to review and sign`;
  if (r.status === 'approval') return 'Developer to sign';
  if (r.status === 'returned') return `${r.prepared_name} to update and sign again`;
  return '';
}
const soFile = r => `GANKCO_${r.ref}_${r.title.replace(/ /g, '_')}_${r.period_label.replace(/[^A-Za-z0-9]+/g, '_')}${r.status === 'final' ? '_SIGNED' : '_DRAFT'}.pdf`;

async function soPdf(r, events) {
  toast('Preparing the PDF…');
  const P = r.payload || {}; const ev = step => events.find(e => e.step === step);
  const sigs = [sigFromEvent('Prepared by', ev('prepared'), { name: r.prepared_name })];
  if (r.department_id) sigs.push(sigFromEvent('Reviewed by (line admin)', ev('reviewed')));
  sigs.push(sigFromEvent('Approved by', ev('approved')));
  await brandPdf({ file: soFile(r), title: r.title, subtitle: r.subtitle, kpis: P.kpis || [], sections: P.sections || [], intro: P.intro || '',
    meta: [...(P.meta || []), ['Sign-off', `${r.ref} · ${SO_STATUS[r.status][1]}`]], signatures: sigs,
    draft: r.status === 'final' ? false : r.status === 'cancelled' ? 'WITHDRAWN' : 'DRAFT - AWAITING SIGN-OFF' });
}

// Called from Reports: sign and send the report on screen
async function signAndSubmitReport(spec) {
  if (!(await needSignature())) return;
  const dept = S.line ? +S.line : null;
  if (dept && !(inLine(dept) || isSuper())) return toast(`You can only sign off reports for your own service line(s). ${lineShort(dept)} isn’t one of them.`, true);
  const ex = await q(sb.from('report_signoffs').select('id,ref,status,prepared_by,prepared_name').eq('kind', spec.kind).eq('period_from', spec.from).neq('status', 'cancelled')
    [dept ? 'eq' : 'is']('department_id', dept));
  const prev = ex[0];
  if (prev && !(prev.status === 'returned' && (prev.prepared_by === S.profile.id || isSuper()))) {
    return modal({ title: `${spec.label} already has a sign-off`, submit: 'Open it', sub: `${esc(prev.ref)} · ${esc(SO_STATUS[prev.status][1])}${prev.status === 'returned' ? ' to ' + esc(prev.prepared_name) : ''}.`,
      body: '<p class="muted">Each report period and service line is signed off once. Open the existing one to see where it is.</p>', onSubmit: async () => go('#/signoff/' + prev.id) });
  }
  const img = await mySigImage();
  // 3.0.4: the line's main or backup admin reviews
  const reviewers = dept ? Object.values(S.people).filter(p => p.role !== 'superadmin' && p.id !== S.profile.id && isApproverOf(p.id, dept)) : [];
  const next = dept && reviewers.length ? `a ${esc(lineShort(dept))} admin signs as reviewer, then the Developer gives the final signature`
    : 'the Developer gives the final signature';
  return modal({
    title: prev ? `Sign & resubmit ${prev.ref}` : 'Sign & submit for sign-off', submit: prev ? 'Sign & resubmit' : 'Sign & submit',
    sub: `${esc(spec.title)} · ${esc(spec.subtitle)}`,
    body: `<div class="sigpaper">${img ? `<img src="${img.dataUrl}" alt="">` : ''}<div class="sigline"></div><div class="signame">${esc(S.profile.full_name || S.profile.email)}</div><div class="sub">${esc(S.profile.job_title || 'No job title yet (ask your admin)')}</div><div class="sub">Prepared by</div></div>
      <ul class="steps mt"><li>The figures are <b>frozen now</b>, so everyone signs exactly what you see (${plural(spec.count, 'item')}${spec.changedOnly ? ', only items that changed' : ''}).</li>
      <li>Next, ${next}.</li><li>If anyone returns it, you’ll get it back with their comment.</li></ul>`,
    onSubmit: async () => {
      const id = await q(sb.rpc('submit_report', { p_id: prev ? prev.id : null, p_kind: spec.kind, p_from: spec.from, p_to: spec.to, p_label: spec.label, p_dept: dept,
        p_title: spec.title, p_subtitle: spec.subtitle, p_payload: spec.payload }));
      REP.resubmit = null; toast('Signed and submitted'); go('#/signoff/' + id);
    } });
}

ROUTES.signoffs = {
  view: 'waiting',
  async load(parts, params) {
    if (params.get('v')) this.view = params.get('v');
    const rows = await q(sb.from('report_signoffs').select('id,ref,kind,period_label,period_from,department_id,title,subtitle,status,prepared_by,prepared_name,prepared_at,reviewed_name,approved_name,updated_at').order('updated_at', { ascending: false }).limit(500));
    this.rows = rows; const me = S.viewAs ? null : S.profile.id;
    const V = { waiting: r => canSignReport(r) || (r.status === 'returned' && r.prepared_by === me), mine: r => r.prepared_by === me && r.status !== 'cancelled', progress: r => ['review', 'approval'].includes(r.status),
      returned: r => r.status === 'returned', final: r => r.status === 'final', all: r => true };
    const list = rows.filter(V[this.view] || V.all).filter(r => !S.line || r.department_id === +S.line || r.department_id == null);
    const nWait = rows.filter(V.waiting).length;
    return topbar('Sign-offs', 'Reports signed by the preparer, the line admin and the Developer. Start one from Reports with “Sign & submit”.', `<a class="btn tagbtn" href="#/reports">${ico('chart')}Go to Reports</a>`) + lineChips() +
      `<div class="filters"><div class="seg" id="seg">${[['waiting', `Waiting for me${nWait ? ' (' + nWait + ')' : ''}`], ['mine', 'Prepared by me'], ['progress', 'In progress'], ['returned', 'Returned'], ['final', 'Final'], ['all', 'All']].map(([k, l]) => `<button data-v="${k}" class="${this.view === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <section class="panel"><div class="tablewrap"><table class="t stack"><thead><tr><th>Ref</th><th>Report</th><th>Service line</th><th>Status</th><th>Prepared by</th><th>Updated</th></tr></thead><tbody>
      ${list.length ? list.map(r => `<tr class="click" data-id="${r.id}"><td>${tag(r.ref)}</td><td class="full"><div class="name">${esc(r.title)}</div><div class="sub">${esc(r.period_label)}</div></td>
        <td>${esc(soLine(r))}</td><td>${chip(...SO_STATUS[r.status])}${canSignReport(r) ? ' ' + chip('soon', 'Your turn') : ''}</td><td>${esc(r.prepared_name || '')}</td><td class="sub">${fdt(r.updated_at)}</td></tr>`).join('')
        : `<tr><td colspan="6" class="empty">${this.view === 'waiting' ? 'Nothing is waiting for you.' : 'No sign-offs here yet.'}</td></tr>`}</tbody></table></div></section>`;
  },
  bind(main) {
    bindLineChips(main);
    $$('#seg button', main).forEach(b => b.onclick = () => { this.view = b.dataset.v; render({ quiet: true }); });
    $$('tr[data-id]', main).forEach(tr => tr.onclick = () => go('#/signoff/' + tr.dataset.id));
  }
};

ROUTES.signoff = {
  async load(parts) {
    const id = +parts[1];
    const [r, events] = await Promise.all([q(sb.from('report_signoffs').select('*').eq('id', id).maybeSingle()), signEvents('report', id)]);
    if (!r) return topbar('Sign-off not found') + '<a class="btn" href="#/signoffs">Back to sign-offs</a>';
    this.ctx = { r, events };
    const imgs = await sigImages(events.map(e => e.signature_id).filter(Boolean));
    const me = S.viewAs ? null : S.profile.id; const P = r.payload || {};
    const ev = step => events.find(e => e.step === step);
    const reviewers = r.department_id ? Object.values(S.people).filter(p => p.role !== 'superadmin' && p.id !== r.prepared_by && isApproverOf(p.id, r.department_id)) : [];
    const supers = Object.values(S.people).filter(p => p.role === 'superadmin');
    const step = (label, e, waiting, active) => `<div class="sostep ${e ? 'done' : active ? 'now' : ''}"><div class="sub upper">${esc(label)}</div>
      ${e ? `${sigBox(imgs[e.signature_id])}<div class="name">${esc(e.user_name)}</div><div class="sub">${esc(e.job_title || '')}</div><div class="sub">Signed ${fdt(e.signed_at)}</div>`
        : `<div class="sigbox empty"></div><div class="sub">${active ? 'Waiting for ' : ''}${esc(waiting)}</div>`}</div>`;
    const steps = [step('Prepared by', ev('prepared'), r.prepared_name, r.status === 'returned')];
    if (r.department_id) steps.push(step('Reviewed by (line admin)', ev('reviewed'), reviewers.length ? reviewers.map(p => p.full_name || p.email).join(' or ') : 'Skipped: no other admin in this line', r.status === 'review'));
    steps.push(step('Approved by (Developer)', ev('approved'), supers.map(p => p.full_name || p.email).join(' or '), r.status === 'approval'));
    const canSign = canSignReport(r);
    const mineBack = r.status === 'returned' && (r.prepared_by === me || isSuper());
    const canWithdraw = !['final', 'cancelled'].includes(r.status) && (r.prepared_by === me || isSuper());
    const sec = s => `<section class="panel"><header><h2>${esc(s.heading || '')}</h2>${s.headingNote ? `<span class="meta">${esc(s.headingNote)}</span>` : ''}</header>
      <div class="tablewrap"><table class="t"><thead><tr>${s.columns.map(c => `<th class="${c.align === 'right' ? 'num' : ''}">${esc(c.header)}</th>`).join('')}</tr></thead><tbody>
      ${s.rows.slice(0, 1500).map(row => row._group ? `<tr class="sogrp"><td colspan="${s.columns.length}"><b>${esc(row.code || '')}</b></td></tr>`
        : `<tr>${s.columns.map(c => `<td class="${c.align === 'right' ? 'num' : ''}">${c.bold ? '<b>' : ''}${esc(row[c.dataKey] ?? '')}${c.bold ? '</b>' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    return `<a class="back" href="#/signoffs">← Sign-offs</a>
      <div class="item-head"><div>${tag(r.ref, 'big')} ${chip(...SO_STATUS[r.status])}${canSign ? ' ' + chip('soon', 'Your turn') : ''}
        <h1>${esc(r.title)}</h1><div class="facts"><span>${esc(r.subtitle || r.period_label)}</span><span>${esc(SO_KIND[r.kind])} report</span><span>${esc(soLine(r))}</span></div>
        <div class="facts sub">Figures frozen ${fdt(r.prepared_at)} by ${esc(r.prepared_name || '')}${r.status !== 'final' && soNext(r) ? ` · Next: ${esc(soNext(r))}` : ''}</div></div></div>
      <div class="actionrow">
        ${canSign && r.status === 'review' ? `<button class="btn primary" id="sign">${ico('sign')}Sign &amp; send to Developer</button><button class="btn" id="ret">Return</button>` : ''}
        ${canSign && r.status === 'approval' ? `<button class="btn primary" id="sign">${ico('sign')}Sign &amp; approve</button><button class="btn" id="ret">Return</button>` : ''}
        ${mineBack ? `<button class="btn primary" id="redo">${ico('chart')}Update figures</button>` : ''}
        <button class="btn" id="pdf">${ico('pdf')}${r.status === 'final' ? 'Signed PDF' : 'Draft PDF'}</button>
        ${canWithdraw ? '<button class="btn danger" id="wd">Withdraw</button>' : ''}</div>
      ${r.status === 'returned' ? `<div class="notice bad"><b>Returned by ${esc(r.returned_by_name || '')}</b> · ${fdt(r.returned_at)}<br>${esc(r.return_note || '')}${mineBack ? '<br>Fix what’s needed, then press <b>Update figures</b>, check the report and press <b>Sign &amp; resubmit</b>.' : ''}</div>` : ''}
      ${r.status === 'final' ? '<div class="notice ok">Signed off. The PDF carries all signatures and no draft mark.</div>' : ''}
      ${r.status === 'cancelled' ? '<div class="notice">This sign-off was withdrawn. You can start a new one for the same period from Reports.</div>' : ''}
      <section class="panel"><header><h2>Signatures</h2></header><div class="body sosteps">${steps.join('')}</div></section>
      ${P.intro ? `<div class="notice">${esc(P.intro)}</div>` : ''}
      <div class="board b6">${(P.kpis || []).map(k => `<div class="kpi ${k.tone || ''}"><div class="n">${esc(k.value)}</div><div class="l">${esc(k.label)}</div></div>`).join('')}</div>
      ${(P.sections || []).map(sec).join('')}`;
  },
  bind(main) {
    const { r, events } = this.ctx || {}; if (!r) return;
    const b = id => $(id, main);
    b('#pdf').onclick = () => soPdf(r, events).catch(e => { console.error(e); toast(niceError(e), true); });
    if (b('#sign')) b('#sign').onclick = async () => {
      if (!(await needSignature())) return;
      const img = await mySigImage(); const final = r.status === 'approval';
      return modal({ title: final ? `Sign & approve ${r.ref}` : `Sign ${r.ref} as reviewer`, submit: final ? 'Sign & approve' : 'Sign & send',
        sub: `${esc(r.title)} · ${esc(r.subtitle || r.period_label)}`,
        body: `<div class="sigpaper">${img ? `<img src="${img.dataUrl}" alt="">` : ''}<div class="sigline"></div><div class="signame">${esc(S.profile.full_name || S.profile.email)}</div><div class="sub">${esc(S.profile.job_title || 'No job title yet')}</div><div class="sub">${final ? 'Approved by' : 'Reviewed by'}</div></div>
          <p class="muted mt">${final ? 'This is the final signature. The report becomes final and the signed PDF is available to everyone.' : 'It goes to the Developer for the final signature.'} You’re signing the frozen figures shown on this page.</p>`,
        onSubmit: async () => { await q(sb.rpc(final ? 'approve_report' : 'review_report', { p_id: r.id })); toast(final ? 'Signed off: the report is final' : 'Signed and sent to the Developer'); render({ quiet: true }); refreshAlerts(); } });
    };
    if (b('#ret')) b('#ret').onclick = () => modal({ title: `Return ${r.ref}`, submit: 'Return', danger: true,
      sub: `It goes back to ${esc(r.prepared_name || 'the preparer')} with your comment. Any signatures after theirs are cleared, and it starts again when they resubmit.`,
      body: '<label class="f">What needs to change?<textarea name="note" required></textarea></label>',
      onSubmit: async x => { await q(sb.rpc('return_report', { p_id: r.id, p_note: x.note })); toast('Returned'); render({ quiet: true }); refreshAlerts(); } });
    if (b('#wd')) b('#wd').onclick = async () => {
      if (!confirm(`Withdraw ${r.ref}? Its signatures are cancelled and a new sign-off can be started for the same period.`)) return;
      try { await q(sb.rpc('cancel_report', { p_id: r.id })); toast('Withdrawn'); render({ quiet: true }); } catch (e) { toast(niceError(e), true); }
    };
    if (b('#redo')) b('#redo').onclick = () => {
      REP.type = r.kind; const f = r.period_from;
      if (r.kind === 'monthly') REP.month = f; else { REP.year = +f.slice(0, 4); if (r.kind === 'quarterly') REP.quarter = Math.floor((+f.slice(5, 7) - 1) / 3) + 1; }
      setLine(r.department_id || ''); REP.resubmit = r.id; go('#/reports');
    };
  }
};

// ---------------------------------------------------------------- 3.0.4: draw a signature with a finger, stylus or mouse
function sigPad(canvas) {
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const fit = () => { const r = canvas.getBoundingClientRect(); canvas.width = Math.round(r.width * ratio); canvas.height = Math.round(r.height * ratio); const x = canvas.getContext('2d'); x.scale(ratio, ratio); x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#14213D'; x.lineWidth = 2.6; };
  fit(); let drawing = false, last = null, ink = false;
  const ctx = () => canvas.getContext('2d');
  const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.onpointerdown = e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); drawing = true; last = pt(e); const x = ctx(); x.beginPath(); x.arc(last.x, last.y, 1.2, 0, Math.PI * 2); x.fillStyle = '#14213D'; x.fill(); ink = true; canvas.dispatchEvent(new Event('ink')); };
  canvas.onpointermove = e => { if (!drawing) return; const p = pt(e); const x = ctx(); x.beginPath(); x.moveTo(last.x, last.y); x.quadraticCurveTo(last.x, last.y, p.x, p.y); x.stroke(); last = p; };
  canvas.onpointerup = canvas.onpointercancel = () => { drawing = false; };
  return {
    clear() { ctx().clearRect(0, 0, canvas.width, canvas.height); ink = false; },
    hasInk: () => ink,
    // the drawing cropped to the ink, as a see-through PNG
    toPng() {
      if (!ink) return null;
      const x = ctx(); const { width: w, height: h } = canvas; const d = x.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (d[(yy * w + xx) * 4 + 3] > 20) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
      if (maxX < 0 || maxX - minX < 20) return null;
      const pad = 8 * ratio; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
      const cw = maxX - minX + 1, ch = maxY - minY + 1; const s = Math.min(1, 640 / cw, 240 / ch);
      const o = document.createElement('canvas'); o.width = Math.round(cw * s); o.height = Math.round(ch * s);
      const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(canvas, minX, minY, cw, ch, 0, 0, o.width, o.height);
      return o.toDataURL('image/png');
    }
  };
}
// the signature picker used at sign-up and on My account: draw it, or upload a photo of it
function sigPickerHtml() {
  return `<div class="sigpick"><div class="seg sigtabs"><button type="button" data-st="draw" class="on">${ico('edit')}Draw it</button><button type="button" data-st="photo">${ico('up')}Upload a photo</button></div>
    <div class="sigtab" data-tab="draw"><div class="sigpadwrap"><canvas class="sigpad"></canvas><span class="sigpad-hint">Sign here</span><div class="sigpad-line"></div></div>
      <div class="actionrow"><button type="button" class="btn small" data-sigclear>Clear</button><span class="sub">Use your finger on a phone, or the mouse on a computer.</span></div></div>
    <div class="sigtab" data-tab="photo" hidden><label class="f">Photo or scan of your signature<span class="hint">Sign on plain white paper with a dark pen. Nest removes the white background.</span><input type="file" accept="image/*" data-sigfile></label>
      <div class="sigpaper sm" data-sigprev hidden><img alt=""></div><div class="notice" data-sigwarn hidden></div></div></div>`;
}
function sigPickerBind(root, onErr) {
  let mode = 'draw', upload = null; const cv = $('.sigpad', root); let pad = null;
  const ready = () => { if (!pad) { pad = sigPad(cv); cv.addEventListener('ink', () => { const h = $('.sigpad-hint', root); if (h) h.hidden = true; }); } };
  requestAnimationFrame(ready);
  $$('[data-st]', root).forEach(b => b.onclick = () => { mode = b.dataset.st; $$('[data-st]', root).forEach(x => x.classList.toggle('on', x === b)); $$('.sigtab', root).forEach(t => t.hidden = t.dataset.tab !== mode); if (mode === 'draw') ready(); });
  $('[data-sigclear]', root).onclick = () => { ready(); pad.clear(); const h = $('.sigpad-hint', root); if (h) h.hidden = false; };
  $('[data-sigfile]', root).onchange = async e => {
    upload = null; $('[data-sigprev]', root).hidden = true;
    try { const r = await processSignature(e.target.files[0]); upload = r.dataUrl; $('[data-sigprev] img', root).src = r.dataUrl; $('[data-sigprev]', root).hidden = false; const w = $('[data-sigwarn]', root); w.textContent = r.warn; w.hidden = !r.warn; }
    catch (ex) { onErr ? onErr(niceError(ex)) : toast(niceError(ex), true); }
  };
  return { value: () => mode === 'draw' ? (pad ? pad.toPng() : null) : upload, mode: () => mode };
}

// ---------------------------------------------------------------- 3.0.4: finish your profile (after the first sign-in)
const needsSetup = () => !!S.profile && S.profile.role !== 'disabled' && (!S.profile.photo || !S.profile.signature_id || !S.profile.first_name);
const setupSkipped = () => { try { return sessionStorage.getItem('nest.setupSkip') === S.profile?.id; } catch (e) { return false; } };
function renderSetup() {
  S.shellReady = false; const p = S.profile; const pending = p.role === 'pending'; let photo = null;
  authShell(`<form id="f" class="setup" novalidate>
    <div class="setup-steps"><span class="done">1 · Account</span><span class="on">2 · Your profile</span></div>
    <h1>Finish your profile</h1><p class="sub">${pending ? 'Your account is waiting for the Developer to approve it. While you wait, add your photo and signature.' : 'Add your photo and signature. Your signature goes on the documents you sign in Nest.'}</p>
    <div class="err notice bad" hidden></div>
    <div class="setup-photo"><span class="setup-av">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : `<b>${esc(((p.first_name || p.full_name || p.email || '?')[0] || '?').toUpperCase())}</b>`}</span>
      <div><b>Your photo</b><div class="sub">A clear photo of your face. It shows in Nest and PeopleCore.</div>
      <label class="btn small filebtn mt">${ico('up')}${p.photo ? 'Change photo' : 'Take or choose a photo'}<input type="file" accept="image/*" id="ph" hidden></label></div></div>
    ${p.hr_linked ? `<div class="f">Name<div class="sub" style="padding-top:6px"><b>${esc(p.full_name || '')}</b> · from your PeopleCore record</div></div><div class="row2"><div class="f">Phone<div class="sub" style="padding-top:8px">${esc(p.phone || '—')}</div></div>`
      : `<div class="row2"><label class="f">First name<input type="text" name="first" value="${esc(p.first_name || '')}" required></label><label class="f">Surname<input type="text" name="last" value="${esc(p.last_name || '')}" required></label></div>
    <div class="row2"><label class="f">Phone <span class="optl">(optional)</span><input type="tel" name="phone" value="${esc(p.phone || '')}"></label>`}
      ${p.job_title ? `<div class="f">Job title<div class="sub" style="padding-top:8px">${esc(p.job_title)}</div></div>` : '<label class="f">Job title<input type="text" name="title" placeholder="e.g. Slickline Operator"></label>'}</div>
    <div class="f"><b>Your signature</b>${p.signature_id ? ' <span class="chip ok">Added</span><div class="sub">You already have one. Draw or upload a new one only if you want to replace it.</div>' : ''}${sigPickerHtml()}</div>
    <button class="btn primary" type="submit">Save and continue</button>
    <div class="alt"><a href="#" id="skip">Skip for now</a><a href="#" id="out">Sign out</a></div></form>`);
  const f = $('#f'), err = $('.err', f); const sig = sigPickerBind(f, m => { err.textContent = m; err.hidden = false; });
  $('#ph').onchange = async e => { try { photo = await hrPhotoData(e.target.files[0]); $('.setup-av').innerHTML = `<img src="${photo}" alt="">`; } catch (ex) { err.textContent = niceError(ex); err.hidden = false; } };
  $('#skip').onclick = e => { e.preventDefault(); try { sessionStorage.setItem('nest.setupSkip', p.id); } catch (x) { } boot(); };
  $('#out').onclick = e => { e.preventDefault(); sb.auth.signOut(); };
  f.onsubmit = async e => {
    e.preventDefault(); err.hidden = true; const b = $('button[type=submit]', f); const d = Object.fromEntries(new FormData(f));
    const sg = sig.value();
    try {
      if (!p.hr_linked && (!(d.first || '').trim() || !(d.last || '').trim())) throw new Error('Enter your first name and surname.');
      if (!photo && !p.photo) throw new Error('Add your photo, or press Skip for now and add it later.');
      if (!sg && !p.signature_id) throw new Error(sig.mode() === 'draw' ? 'Sign in the box, or press Skip for now and add it later.' : 'Choose a photo of your signature, or press Skip for now.');
      b.disabled = true;
      const body = p.hr_linked ? {} : { first_name: d.first.trim(), last_name: d.last.trim(), phone: d.phone || '' };
      if (photo) body.photo = photo; if (d.title) body.job_title = d.title;
      await q(sb.rpc('my_profile_save', { p: body }));
      if (sg) await q(sb.rpc('save_signature', { p_image: sg }));
      toast('Profile saved'); boot();
    } catch (ex) { b.disabled = false; err.textContent = niceError(ex); err.hidden = false; window.scrollTo(0, 0); }
  };
}
