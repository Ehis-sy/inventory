/* GANKCO Nest — Job planner: upcoming Thru-Tubing screen hang-off jobs checked against live stock */
'use strict';

const PL = { tab: 'jobs', view: 'active' };
const PLAN_STATUS = { planned: ['pending', 'Planned'], hold: ['muted', 'On hold'], run: ['ok', 'Run'], cancelled: ['muted', 'Cancelled'] };
const QTY_FIELDS = [['packer', 'Paragon II Packer'], ['xo', 'Hang-off Crossover'], ['sj', 'Safety Joint'], ['coupling', 'Beveled Coupling'], ['bullnose', 'Bull Nose'], ['pcm', 'PCM']];
// every BHA component counted per job (the six above plus any part added on Setup)
const qtyFields = P => (P?.parts || []).filter(p => p.kind === 'qty' && p.job_key).sort((a, b) => a.sort - b.sort).map(p => [p.job_key, partName(p), p]);
const PART_KINDS = { qty: ['BHA component', 'A quantity is entered on each job, like the packer or safety joint.'], service: ['Service tool', 'Needed once per tubing size, like the EMST or a retrieving tool.'],
  blank: ['Blank pipe length', 'A new blank length to choose on the job sheet.'], screen: ['Screen size', 'A new screen micron to choose on the job sheet.'] };
const planCfg = () => setting('planner', {}) || {};
const canSeePrices = () => ['admin', 'viewer'].includes(invRole());
const canEditPlan = () => canAdmin(planCfg().department_id);
const canEditPrices = () => !readOnly() && isAdmin();
// 3.0.4: Inventory Viewers (MD, COO) add and edit planned jobs too; turning one into a materials request needs Staff or Admin
const isWriter = () => !S.viewAs && ['staff', 'admin', 'viewer'].includes(invRole());
const canRequest = () => !S.viewAs && ['staff', 'admin'].includes(invRole());
const usd = n => n == null ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const partName = p => p.tool + (p.spec && p.spec !== 'Std' ? ' ' + p.spec : '');
// the parts that came from the Excel tracker (the 20 originals and the 2-3/8" EMST extension rod split out in 2.6.2)
const stdPart = p => p.id <= 20 || (p.tool === 'Extension Rod' && p.spec === '2-3/8" EMST');
const fmonthD = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—';
const jobEff = j => (j.mr && ['out', 'closed', 'partial'].includes(j.mr.status)) ? 'run' : j.status;

async function planData(force) {
  if (!S.plan || force) {
    const [parts, links, jobs, prices] = await Promise.all([
      q(sb.from('plan_parts').select('*').eq('kit', 'tt_sho').order('sort')),
      q(sb.from('plan_links').select('*')),
      q(sb.from('plan_jobs').select('*, mr:jobs(id,job_no,status)').order('planned_on').order('id')),
      canSeePrices() ? q(sb.from('item_prices').select('*')).catch(() => []) : [],
    ]);
    S.plan = { parts, links, jobs, prices: Object.fromEntries(prices.map(p => [p.item_id, p])) };
  }
  await Promise.all([items(), stockRows()]);
  return S.plan;
}

// ---------------------------------------------------------------- the stock-check engine
// Same rules as the Excel tracker: jobs claim shelf stock in date order; pooled sizes share stock;
// service tools (EMST, sleeves, rods, adapter kits, retrieving tools) are needed once per size and reused.
function planEngine(P, override) {
  const cfg = planCfg(); const sizes = cfg.sizes || [];
  const avail = {}; (S.stock || []).forEach(s => { if (s.status === 'available') avail[s.item_id] = (avail[s.item_id] || 0) + +s.qty; });
  const linkOf = (pid, z) => P.links.find(l => l.part_id === pid && l.size === z);
  const gkey = (p, z) => p.id + '|' + (linkOf(p.id, z)?.pool || z);
  const G = {};
  P.parts.forEach(p => sizes.forEach(z => {
    const l = linkOf(p.id, z); const k = gkey(p, z);
    const g = G[k] ||= { key: k, part: p, sizes: [], items: new Set(), modes: {}, stock: 0, need: 0, short: 0, svc: false };
    g.sizes.push(z); g.modes[z] = l?.mode || 'items'; (l?.item_ids || []).forEach(i => g.items.add(+i));
  }));
  Object.values(G).forEach(g => {
    g.stock = [...g.items].reduce((a, i) => a + (avail[i] || 0), 0); g.rem = g.stock; g.linked = g.items.size > 0;
    g.label = g.sizes.length > 1 ? `${g.sizes.join(' / ')} (${g.part.kind === 'blank' ? 'pooled' : 'shared'})` : g.sizes[0];
  });
  let jobs = P.jobs.slice();
  if (override) { jobs = jobs.filter(j => j.id !== override.id); jobs.push(override); }
  const active = jobs.filter(j => jobEff(j) === 'planned').sort((a, b) => (a.planned_on || '').localeCompare(b.planned_on || '') || (a.id || 1e15) - (b.id || 1e15));
  const demands = j => {
    const out = [];
    P.parts.forEach(p => {
      let z = j.tubing_size, qty = 0;
      if (p.kind === 'qty') qty = +((j.qty || {})[p.job_key] ?? 0);
      else if (p.kind === 'blank') qty = j.blank_length === p.spec ? +j.blank_qty || 0 : 0;
      else if (p.kind === 'screen') { z = j.screen_size || j.tubing_size; qty = j.screen_micron === p.spec ? +j.screen_qty || 0 : 0; }
      if (!sizes.includes(z)) return;
      const l = linkOf(p.id, z); if (l?.mode === 'not_needed') return;
      if (p.kind === 'service') { const st = l?.setting || p.setting; qty = (!st || st === j.setting_tool) ? 1 : 0; }
      if (!(qty > 0)) return;
      out.push({ part: p, size: z, qty, g: G[gkey(p, z)], notCarried: l?.mode === 'not_carried' });
    });
    return out;
  };
  const results = new Map();
  active.forEach(j => {
    const r = { job: j, lines: [], short: [] };
    demands(j).forEach(d => {
      const g = d.g; let need = d.qty;
      if (d.part.kind === 'service') { if (g.svc) { r.lines.push({ ...d, need: 0, got: 0, reused: true, before: g.rem }); return; } need = 1; g.svc = true; }
      g.need += need;
      if (d.notCarried) { g.short += need; r.short.push({ ...d, need, missing: need, reason: 'Not carried' }); r.lines.push({ ...d, need, got: 0, before: 0, missing: need }); return; }
      const before = g.rem; const got = Math.min(g.rem, need); g.rem -= got; const miss = need - got; d.before = before;
      if (miss > 0) { g.short += miss; r.short.push({ ...d, need, missing: miss, reason: g.linked ? 'Not enough on the shelf' : 'No Nest item linked' }); }
      r.lines.push({ ...d, need, got, missing: miss, reason: miss > 0 ? (g.linked ? 'Not enough on the shelf' : 'No Nest item linked') : '' });
    });
    r.ok = !r.short.length; results.set(j.id ?? 'new', r);
  });
  // safety stock top-up and EMST spares, priced from the price list
  const price = g => { for (const i of g.items) { const pr = P.prices[i]; if (pr) return +pr.unit_price; } return null; };
  const lines = Object.values(G).map(g => {
    const p = g.part; const net = g.stock - g.need; const live = g.sizes.filter(z => g.modes[z] === 'items');
    let target = 0;
    if (p.safety && (p.kind !== 'blank' || p.spec === (cfg.safety_blank || '10 ft'))) target = live.reduce((a, z) => a + (+(cfg.safety_bhas || {})[z] || 0) * (+p.per_bha || 1), 0);
    if (p.tool === 'EMST') target = live.reduce((a, z) => a + (+(cfg.emst_spares || {})[z] || 0), 0);
    const topup = target ? Math.max(0, target - Math.max(0, net)) : 0;
    const total = g.short + topup; const up = price(g);
    return { g, part: p, label: g.label, stock: g.stock, need: g.need, net, forJobs: g.short, topup, total, target, unit: up, cost: up == null ? null : up * total };
  });
  // complete BHAs on hand (before jobs) per size, and what limits it — the Excel tracker's rules (E6:H7, AA23:AD24)
  const sBlank = cfg.safety_blank || '10 ft';
  const bhaParts = P.parts.filter(p => p.safety && (p.kind !== 'blank' || p.spec === sBlank));
  const blankPart = bhaParts.find(p => p.kind === 'blank');
  const shortNm = p => ({ packer: 'Packer', xo: 'XO', sj: 'Safety Jt', coupling: 'Bev. Cplg', bullnose: 'Bull Nose' }[p.job_key] || partName(p));
  const live = (g, z) => g.modes[z] === 'items';
  const bha = sizes.map(z => {
    const tg = +(cfg.safety_bhas || {})[z] || 0;
    const vals = bhaParts.map(p => { const g = G[gkey(p, z)]; const per = +p.per_bha || 1; const st = live(g, z) ? g.stock : 0;
      return { p, g, per, st, n: Math.floor(st / per), pooled: g.sizes.length > 1 }; });
    const n = vals.length ? Math.min(...vals.map(v => v.n)) : 0;
    // Limited by: parts below the safety target (Excel: tg − q pcs), and blanks short of the packers (Excel: packers × blanks/BHA − blanks)
    const out = [];
    vals.filter(v => v.p.kind !== 'blank').forEach(v => { if (v.st < tg * v.per) out.push(`${fq(tg * v.per - v.st)} pcs ${shortNm(v.p)}`); });
    const bv = vals.find(v => v.p.kind === 'blank'); const pk = vals.find(v => v.p.job_key === 'packer') || vals.find(v => v.p.kind !== 'blank');
    if (bv && pk) { const gb = pk.st * bv.per - bv.st; if (gb > 0) out.push(`${fq(gb)} pcs ${bv.p.spec} Blank${bv.pooled ? ' (pooled)' : ''}`); }
    // left after jobs: shared stock goes to the earlier sizes' safety target first (Excel AB23)
    const after = vals.length ? Math.min(...vals.map(v => {
      let net = v.g.stock - v.g.need; if (!live(v.g, z)) net = 0;
      const i = v.g.sizes.indexOf(z); for (let k = 0; k < i; k++) net -= (+(cfg.safety_bhas || {})[v.g.sizes[k]] || 0) * v.per;
      return Math.floor(Math.max(0, net) / v.per);
    })) : 0;
    return { size: z, n, limitedBy: out.length ? out.join(', ') : 'None', target: tg, after, vs: after - tg,
      screens: P.parts.filter(p => p.kind === 'screen').reduce((a, p) => { const g = G[gkey(p, z)]; return a + (g.sizes[0] === z ? g.stock : 0); }, 0) };
  });
  // sizes that share the safety blank: how many complete BHAs they can really make together
  const pools = [];
  if (blankPart) {
    const seen = new Set();
    sizes.forEach(z => { const g = G[gkey(blankPart, z)]; if (g.sizes.length > 1 && !seen.has(g.key)) { seen.add(g.key);
      const per = +blankPart.per_bha || 1;
      const others = g.sizes.reduce((a, zz) => a + Math.min(...bhaParts.filter(p => p.kind !== 'blank').map(p => { const gg = G[gkey(p, zz)]; return live(gg, zz) ? Math.floor(gg.stock / (+p.per_bha || 1)) : 0; })), 0);
      pools.push({ sizes: g.sizes, blank: blankPart.spec, blanks: g.stock, total: Math.min(others, Math.floor(g.stock / per)) }); } });
  }
  // Excel B6: part × size cells short for the jobs (shared stock counted once)
  const shortCells = Object.values(G).filter(g => g.need > 0 && (g.short > 0)).length;
  const rs = [...results.values()];
  const tot = k => lines.reduce((a, l) => a + l[k], 0);
  const costKnown = lines.filter(l => l.total && l.cost != null).reduce((a, l) => a + l.cost, 0);
  const unpriced = lines.filter(l => l.total && l.cost == null).length;
  return { G, gkey, linkOf, results, active, lines, bha, pools, avail,
    kpi: { active: active.length, ready: rs.filter(r => r.ok).length, short: rs.filter(r => !r.ok).length, shortCells, forJobs: tot('forJobs'), topup: tot('topup'), total: tot('total'),
      next: active[0]?.planned_on || null, cost: costKnown, unpriced } };
}

function shortText(r) {
  if (!r) return '';
  if (r.ok) return '✔ Can be done from shelf';
  return '✖ Short: ' + r.short.map(s => `${fq(s.missing)} ${partName(s.part)}${s.size !== r.job.tubing_size ? ` (${s.size})` : ''}${s.reason !== 'Not enough on the shelf' ? ` [${s.reason === 'Not carried' ? 'not carried' : 'no Nest item linked'}]` : ''}`).join(', ');
}
function bhaText(j) {
  const bits = [];
  if (j.blank_length && +j.blank_qty) bits.push(`${fq(j.blank_qty)} × ${j.blank_length} blank`);
  if (j.screen_micron && +j.screen_qty) bits.push(`${fq(j.screen_qty)} × ${j.screen_micron.replace(' micron', 'µ')} screen${j.screen_size && j.screen_size !== j.tubing_size ? ` (${j.screen_size})` : ''}`);
  bits.push(j.setting_tool);
  const odd = qtyFields(S.plan).filter(([k, , p]) => +((j.qty || {})[k] ?? (p.id > 20 ? 0 : 1)) !== (p.id > 20 ? 0 : 1)).map(([k, l]) => `${fq((j.qty || {})[k] || 0)} × ${l}`);
  return [...bits, ...odd].join(' · ');
}

// ---------------------------------------------------------------- page
ROUTES.planner = {
  async load(parts, params) {
    if (params.get('tab')) PL.tab = params.get('tab');
    const P = await planData(true); const E = planEngine(P); this.ctx = { P, E }; savePlanSnapshot(E);
    const cfg = planCfg(); const k = E.kpi;
    const tabs = [['jobs', 'Upcoming jobs'], ['summary', 'Summary'], ['shipin', 'Ship-in list'], ...(canEditPlan() ? [['setup', 'Setup']] : [])];
    if (!tabs.some(t => t[0] === PL.tab)) PL.tab = 'jobs';
    const unlinked = Object.values(E.G).filter(g => !g.linked && g.need > 0 && g.sizes.some(z => g.modes[z] === 'items')).length;
    const head = topbar('Job planner', `${esc(lineName(cfg.department_id))}: screen hang-off BHAs. Add upcoming jobs and Nest checks them against what’s on the shelf now.`,
      `${isWriter() ? `<button class="btn tagbtn" id="pl-add">${ico('plus')}Add upcoming job</button>` : ''}<button class="btn" id="pl-xls">${ico('down')}Excel</button><button class="btn" id="pl-pdf">${ico('pdf')}Management report</button>`) +
      `<div class="board b6">
        <div class="kpi"><div class="n">${k.active}</div><div class="l">Active jobs</div></div>
        <div class="kpi ok"><div class="n">${k.ready}</div><div class="l">Can be done from shelf</div></div>
        <div class="kpi ${k.short ? 'bad' : ''}"><div class="n">${k.short}</div><div class="l">Jobs short<span class="sub"> · ${plural(k.shortCells, 'shortfall cell')}</span></div></div>
        <div class="kpi ${k.forJobs ? 'warn' : ''}"><div class="n">${fq(k.total)}</div><div class="l">Units to ship in<span class="sub"> · ${fq(k.forJobs)} for jobs, ${fq(k.topup)} safety</span></div></div>
        <div class="kpi"><div class="n">${k.next ? fmonthD(k.next) : '—'}</div><div class="l">Next job</div></div>
        ${canSeePrices() ? `<div class="kpi"><div class="n">${usd(k.cost)}</div><div class="l">Est. ship-in cost${k.unpriced ? ` · ${k.unpriced} line${k.unpriced === 1 ? '' : 's'} not priced` : ''}</div></div>` : ''}</div>
      <div class="seg" id="pl-tabs">${tabs.map(([t, l]) => `<button data-t="${t}" class="${PL.tab === t ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${unlinked && canEditPlan() && PL.tab !== 'setup' ? `<div class="notice">${plural(unlinked, 'part')} needed by upcoming jobs ${unlinked === 1 ? 'has' : 'have'} no Nest item linked, so ${unlinked === 1 ? 'it counts' : 'they count'} as zero on the shelf. Link ${unlinked === 1 ? 'it' : 'them'} on <a href="#/planner?tab=setup">Setup</a> if you do carry ${unlinked === 1 ? 'it' : 'them'}.</div>` : ''}`;
    return head + this[PL.tab](P, E);
  },
  jobs(P, E) {
    const V = { active: j => jobEff(j) === 'planned', hold: j => jobEff(j) === 'hold', run: j => jobEff(j) === 'run', all: j => jobEff(j) !== 'cancelled' };
    const list = P.jobs.filter(V[PL.view] || V.active).sort((a, b) => (a.planned_on || '').localeCompare(b.planned_on || '') || a.id - b.id);
    const me = S.viewAs ? null : S.profile.id;
    return `<div class="filters"><div class="seg" id="pl-view">${[['active', 'Active'], ['hold', 'On hold'], ['run', 'Run'], ['all', 'All']].map(([v, l]) => `<button data-v="${v}" class="${PL.view === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <span class="muted">Jobs are checked in date order: earlier jobs get the stock first.</span></div>
      <section class="panel"><div class="tablewrap"><table class="t stack pljobs"><thead><tr><th>Month</th><th>Well</th><th>Tubing</th><th>BHA</th><th>Stock check</th><th></th></tr></thead><tbody>
      ${list.length ? list.map(j => { const r = E.results.get(j.id); const eff = jobEff(j);
        const badge = eff !== 'planned' ? chip(...PLAN_STATUS[eff]) : r?.ok ? chip('ok', 'Ready') : chip('overdue', `Short ${plural(r.short.length, 'part')}`);
        const detail = eff === 'planned' ? (r?.ok ? 'Can be done from the shelf' : r.short.map(x => `${fq(x.missing)} × ${partName(x.part)}${x.size !== j.tubing_size ? ` (${x.size})` : ''}${x.reason !== 'Not enough on the shelf' ? ` · ${x.reason === 'Not carried' ? 'not carried' : 'no Nest item linked'}` : ''}`).join(', '))
          : eff === 'run' ? 'Run: no longer counted' : eff === 'hold' ? 'On hold: not counted' : 'Cancelled';
        return `<tr class="${eff === 'planned' && !r?.ok ? 'is-short' : ''}"><td class="nowrap">${fmonthD(j.planned_on)}</td>
          <td class="full"><div class="name">${esc(j.title)}</div><div class="sub">${esc(j.customer || '')}</div></td>
          <td class="nowrap"><b>${esc(j.tubing_size)}</b><div class="sub">${esc(j.setting_tool)}</div></td>
          <td class="sub">${esc(bhaText(j).replace(/ · (EMST|TTS)$/, '').replace(/^(EMST|TTS)$/, '—'))}</td>
          <td class="plchk">${badge}<div class="sub ${eff === 'planned' && !r?.ok ? 'neg' : ''}">${esc(detail)}</div>
            ${j.mr ? `<div class="sub"><a href="#/job/${j.mr.id}">${esc(j.mr.job_no)}</a> · ${esc((JOB_STATUS[j.mr.status] || [0, j.mr.status])[1])}</div>` : j.mr_note ? `<div class="sub muted">${esc(j.mr_note)}: make a new request when ready</div>` : ''}</td>
          <td class="num nowrap">${isWriter() ? `<div class="btngrp"><button class="btn small" data-edit="${j.id}">${ico('sign')}Edit</button>${!j.mr && eff === 'planned' && canRequest() ? `<button class="btn small" data-mr="${j.id}">${ico('truck')}Request</button>` : ''}${(j.created_by === me || isAdmin()) ? `<button class="btn small" data-del="${j.id}" aria-label="Delete" title="Delete">${ico('trash')}</button>` : ''}</div>` : ''}</td></tr>`; }).join('')
        : `<tr><td colspan="6" class="empty">${PL.view === 'active' ? 'No upcoming jobs. Press <b>Add upcoming job</b> to check one against the shelf.' : 'Nothing here.'}</td></tr>`}</tbody></table></div></section>`;
  },
  summary(P, E) {
    const cfg = planCfg(); const sizes = cfg.sizes || [];
    const cell = (p, z) => {
      const g = E.G[E.gkey(p, z)]; const mode = g.modes[z];
      if (mode === 'not_needed') return '<td class="num sub">—</td>';
      if (g.sizes.length > 1 && g.sizes[0] !== z) return `<td class="num sub">with ${esc(g.sizes[0])}</td>`;
      if (mode === 'not_carried') return `<td class="num">${g.need ? '<b class="neg">Not carried</b>' : '<span class="sub">n/a</span>'}</td>`;
      const net = g.stock - g.need;
      return `<td class="num"><b class="${net < 0 ? 'neg' : g.need ? 'pos' : ''}">${net < 0 ? '(' + fq(-net) + ')' : fq(net)}</b><div class="sub">${fq(g.stock)} on shelf${g.need ? ' · ' + fq(g.need) + ' needed' : ''}</div></td>`;
    };
    return `<section class="panel"><header><h2>Complete BHAs on the shelf</h2><span class="meta">Packer, crossover, safety joint, coupling, ${esc(cfg.safety_blank || '10 ft')} blank and bull nose · screens not included</span></header>
      <div class="tablewrap"><table class="t plbha"><thead><tr><th>Tubing size</th><th class="num">On the shelf now</th><th>Limited by <span class="sub">(below the safety target)</span></th><th class="num">Complete BHAs after all upcoming jobs<span class="sub th-sub">After every active job on the list takes its parts</span></th><th class="num">Safety target</th><th class="num">Compared with safety target</th><th class="num">Screens (all µ)</th></tr></thead><tbody>
      ${E.bha.map(b => `<tr><td><b>${esc(b.size)}</b>${E.pools.some(pl => pl.sizes.includes(b.size)) ? ` <span class="chip muted">shared ${esc(cfg.safety_blank || '10 ft')} blanks</span>` : ''}</td><td class="num"><b>${b.n}</b></td>
        <td class="${b.limitedBy === 'None' ? 'sub' : ''}">${esc(b.limitedBy)}</td><td class="num"><b>${b.after}</b></td><td class="num">${fq(b.target)}</td>
        <td class="num"><b class="${b.vs < 0 ? 'neg' : 'pos'}">${b.vs < 0 ? '(' + fq(-b.vs) + ')' : fq(b.vs)}</b></td><td class="num">${fq(b.screens)}</td></tr>`).join('')}</tbody></table></div>
      ${E.pools.map(pl => `<div class="body plpool">${ico('box')}<span><b>${pl.sizes.map(esc).join(' and ')} share ${esc(pl.blank)} blanks</b> (${fq(pl.blanks)} on the shelf): <b>${pl.total} complete BHA${pl.total === 1 ? '' : 's'} in total</b> across ${pl.sizes.length === 2 ? 'both sizes' : 'these sizes'}, not ${pl.sizes.map(z => E.bha.find(b => b.size === z)?.n ?? 0).join(' + ')}. The numbers above show each size on its own.</span></div>`).join('')}</section>
      <section class="panel"><header><h2>Surplus / (shortfall) after all active jobs</h2><span class="meta">Live shelf stock, in store and available</span></header>
      <div class="tablewrap"><table class="t"><thead><tr><th>Part</th>${sizes.map(z => `<th class="num">${esc(z)}</th>`).join('')}</tr></thead><tbody>
      ${P.parts.map(p => `<tr><td class="full"><div class="name">${esc(partName(p))}</div>${p.kind === 'service' ? '<div class="sub">Reusable: 1 per size</div>' : ''}</td>${sizes.map(z => cell(p, z)).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  },
  shipin(P, E) {
    const show = E.lines.filter(l => l.total > 0).sort((a, b) => a.part.sort - b.part.sort || a.label.localeCompare(b.label));
    const byJob = [...E.results.values()].filter(r => !r.ok);
    const pr = canSeePrices();
    return `<section class="panel"><header><h2>Ship-in order</h2><span class="meta">${fq(E.kpi.total)} units · ${fq(E.kpi.forJobs)} short for jobs + ${fq(E.kpi.topup)} safety top-up${pr ? ' · est. ' + usd(E.kpi.cost) : ''}</span>${show.length && typeof poCanRaise === 'function' && poCanRaise() ? `<button class="btn small tagbtn hdr-btn" id="pl-po">${ico('audit')}Create purchase order</button>` : ''}</header>
      <div class="tablewrap"><table class="t"><thead><tr><th>Part</th><th>Tubing size</th><th class="num">For jobs</th><th class="num">Safety top-up</th><th class="num">Total</th>${pr ? '<th class="num">Unit price</th><th class="num">Est. cost</th>' : ''}${canEditPrices() ? '<th></th>' : ''}</tr></thead><tbody>
      ${show.length ? show.map(l => `<tr><td class="full"><div class="name">${esc(partName(l.part))}</div>${!l.g.linked ? '<div class="sub neg">No Nest item linked</div>' : ''}</td><td>${esc(l.label)}</td><td class="num">${l.forJobs ? fq(l.forJobs) : '·'}</td><td class="num">${l.topup ? fq(l.topup) : '·'}</td><td class="num"><b>${fq(l.total)}</b></td>
        ${pr ? `<td class="num">${l.unit == null ? '<span class="sub">no price</span>' : usd(l.unit)}</td><td class="num">${l.cost == null ? '' : usd(l.cost)}</td>` : ''}
        ${canEditPrices() ? `<td class="num">${l.g.linked ? `<button class="btn small link" data-price="${esc(l.g.key)}">Edit price</button>` : ''}</td>` : ''}</tr>`).join('') : `<tr><td colspan="${pr ? 7 : 5}" class="empty">Nothing to ship in: every active job can be done from the shelf and safety stock is met.</td></tr>`}
      </tbody>${show.length ? `<tfoot><tr class="totalrow"><td><b>Total</b></td><td></td><td class="num"><b>${fq(E.kpi.forJobs)}</b></td><td class="num"><b>${fq(E.kpi.topup)}</b></td><td class="num"><b>${fq(E.kpi.total)}</b></td>
        ${pr ? `<td></td><td class="num"><b>${usd(E.kpi.cost)}</b>${E.kpi.unpriced ? `<div class="sub">excludes ${plural(E.kpi.unpriced, 'line')} with no price</div>` : ''}</td>` : ''}${canEditPrices() ? '<td></td>' : ''}</tr></tfoot>` : ''}</table></div><div class="body muted">Safety top-up keeps ${Object.entries(planCfg().safety_bhas || {}).map(([z, n]) => `${n} BHA${n == 1 ? '' : 's'} for ${z}`).join(', ')} on the shelf after the jobs${Object.values(planCfg().emst_spares || {}).some(Number) ? ', plus spare EMSTs' : ''}.${pr ? ' Prices come from the last purchase orders.' : ''}</div></section>
      <section class="panel"><header><h2>Short, job by job</h2></header><ul class="list">${byJob.length ? byJob.map(r => `<li><div style="flex:1"><div class="name">${fmonthD(r.job.planned_on)} · ${esc(r.job.title)} <span class="sub">${esc(r.job.tubing_size)}</span></div>
        <div class="sub">${r.short.map(s => `${fq(s.missing)} × ${esc(partName(s.part))} (${esc(s.size)})${s.reason !== 'Not enough on the shelf' ? ' · ' + esc(s.reason) : ''}`).join(' · ')}</div></div></li>`).join('') : '<li class="empty">No job is short.</li>'}</ul></section>`;
  },
  setup(P, E) {
    const cfg = planCfg(); const sizes = cfg.sizes || []; const its = new Map((S.items || []).map(i => [i.id, i]));
    const cell = (p, z) => {
      const l = E.linkOf(p.id, z); const mode = l?.mode || 'items';
      const body = mode === 'not_needed' ? '<span class="sub">Not needed</span>' : mode === 'not_carried' ? '<span class="sub">Not carried</span>'
        : (l?.item_ids || []).length ? (l.item_ids.map(i => its.get(+i)).filter(Boolean).map(i => `<div>${tag(i.code)} <span class="sub">${fq(E.avail[i.id] || 0)}</span></div>`).join('')) : '<b class="neg">Not linked</b>';
      return `<td class="plcell" data-part="${p.id}" data-size="${esc(z)}">${body}${l?.pool ? `<div class="sub">Shared stock: ${esc(l.pool)}</div>` : ''}${l?.setting && mode !== 'not_needed' ? `<div class="sub">${esc(l.setting)} jobs only</div>` : ''}</td>`;
    };
    const priced = [...new Set(P.links.flatMap(l => l.item_ids || []).map(Number))].map(i => its.get(i)).filter(Boolean).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    return `<div class="notice">Each part is linked to the Nest item(s) it uses for each tubing size. Nest linked them by part number from your Excel; check them, especially the service tools. Click a cell to change it. Sizes with the same <b>shared stock</b> name use one pool (for example 10 ft blanks for 2-3/8" and 2-7/8").</div>
      <section class="panel"><header><h2>Parts and Nest items</h2><span class="meta">${plural(P.parts.length, 'part')}</span><div class="right"><button class="btn small primary" id="pl-newpart">${ico('plus')}Add part</button></div></header><div class="tablewrap"><table class="t plsetup"><thead><tr><th>Part</th>${sizes.map(z => `<th>${esc(z)}</th>`).join('')}</tr></thead><tbody>
      ${[...P.parts].sort((a, b) => a.sort - b.sort).map(p => `<tr><td class="name"><button type="button" class="linkbtn" data-part-edit="${p.id}">${esc(partName(p))}</button><div class="sub">${esc(PART_KINDS[p.kind]?.[0] || '')}${p.safety ? ' · counts in a complete BHA' : ''}${p.setting ? ' · ' + esc(p.setting) + ' only' : ''}${stdPart(p) ? '' : ' · added'}</div></td>${sizes.map(z => cell(p, z)).join('')}</tr>`).join('')}</tbody></table></div></section>
      <section class="panel"><header><h2>Safety stock</h2></header><form class="body" id="pl-cfg">
        <div class="tablewrap"><table class="t"><thead><tr><th></th>${sizes.map(z => `<th>${esc(z)}</th>`).join('')}</tr></thead><tbody>
        <tr><td>Complete BHAs to keep on the shelf after jobs</td>${sizes.map(z => `<td><input type="number" min="0" step="1" name="sb_${esc(z)}" value="${+(cfg.safety_bhas || {})[z] || 0}" style="width:80px"></td>`).join('')}</tr>
        <tr><td>Spare EMSTs</td>${sizes.map(z => `<td><input type="number" min="0" step="1" name="es_${esc(z)}" value="${+(cfg.emst_spares || {})[z] || 0}" style="width:80px"></td>`).join('')}</tr></tbody></table></div>
        <label class="f mt" style="max-width:260px">Blank length counted in safety BHAs<select name="sblank">${(cfg.blanks || []).map(b => opt(b, b, cfg.safety_blank)).join('')}</select></label>
        <button class="btn primary mt" type="submit">Save safety stock</button></form></section>
      ${canSeePrices() ? `<section class="panel"><header><h2>Prices (USD)</h2><span class="meta">Used for the estimated ship-in cost. Seen by admins and Management only.</span></header>
        <div class="tablewrap"><table class="t"><thead><tr><th>Item</th><th class="num">Unit price (USD)</th><th>Source</th></tr></thead><tbody>
        ${priced.map(i => { const pr = P.prices[i.id]; return `<tr><td class="full">${tag(i.code)} <span class="name">${esc(i.name)}</span></td><td class="num"><input type="number" min="0" step="0.01" class="prin" data-item="${i.id}" value="${pr ? +pr.unit_price : ''}" placeholder="no price" style="width:120px;text-align:right" ${canEditPrices() ? '' : 'disabled'}></td><td class="sub">${esc(pr ? `${pr.source || ''} · ${pr.updated_by_name || ''} ${fd(pr.updated_at)}` : '')}</td></tr>`; }).join('')}
        </tbody></table></div></section>` : ''}`;
  },
  bind(main) {
    const { P, E } = this.ctx || {}; if (!P) return;
    $$('#pl-tabs button', main).forEach(b => b.onclick = () => { PL.tab = b.dataset.t; go('#/planner?tab=' + PL.tab); });
    $$('#pl-view button', main).forEach(b => b.onclick = () => { PL.view = b.dataset.v; render({ quiet: true }); });
    if ($('#pl-add', main)) $('#pl-add', main).onclick = () => editPlanJob(null);
    $('#pl-pdf', main).onclick = () => planReport('pdf').catch(e => { console.error(e); toast(niceError(e), true); });
    $('#pl-xls', main).onclick = () => planReport('xlsx').catch(e => { console.error(e); toast(niceError(e), true); });
    $$('[data-edit]', main).forEach(b => b.onclick = () => editPlanJob(P.jobs.find(j => j.id === +b.dataset.edit)));
    $$('[data-mr]', main).forEach(b => b.onclick = () => planToRequest(P.jobs.find(j => j.id === +b.dataset.mr)));
    $$('[data-del]', main).forEach(b => b.onclick = async () => {
      const j = P.jobs.find(x => x.id === +b.dataset.del); if (!confirm(`Delete ${j.title} from the planner?`)) return;
      try { await q(sb.from('plan_jobs').delete().eq('id', j.id)); toast('Deleted'); render({ quiet: true }); } catch (e) { toast(niceError(e), true); }
    });
    $$('.plcell', main).forEach(td => td.onclick = () => editPlanLink(P, +td.dataset.part, td.dataset.size));
    const np = $('#pl-newpart', main); if (np) np.onclick = () => editPlanPart(null);
    $$('[data-part-edit]', main).forEach(b => b.onclick = () => editPlanPart(P.parts.find(p => p.id === +b.dataset.partEdit)));
    $$('[data-price]', main).forEach(b => b.onclick = () => editLinePrice(P, E.G[b.dataset.price]));
    const po = $('#pl-po', main); if (po) po.onclick = async () => { await poLookups(); poFromPlanner(E); };
    const f = $('#pl-cfg', main);
    if (f) f.onsubmit = async e => {
      e.preventDefault(); const cfg = planCfg(); const x = Object.fromEntries(new FormData(f).entries());
      const v = { safety_bhas: Object.fromEntries((cfg.sizes || []).map(z => [z, +x['sb_' + z] || 0])), emst_spares: Object.fromEntries((cfg.sizes || []).map(z => [z, +x['es_' + z] || 0])), safety_blank: x.sblank };
      try { await q(sb.rpc('save_planner_config', { p_value: v })); await loadLookups(); toast('Safety stock saved'); render({ quiet: true }); } catch (ex) { toast(niceError(ex), true); }
    };
    $$('.prin', main).forEach(inp => inp.onchange = async () => {
      const id = +inp.dataset.item; const v = inp.value.trim();
      try {
        if (v === '') await q(sb.from('item_prices').delete().eq('item_id', id));
        else await q(sb.from('item_prices').upsert({ item_id: id, unit_price: +v, source: 'Entered in Nest' }));
        S.plan = null; toast('Price saved');
      } catch (e) { toast(niceError(e), true); }
    });
  }
};

// ---------------------------------------------------------------- add / edit an upcoming job (with a live check)
function editPlanJob(j) {
  const cfg = planCfg(); const sizes = cfg.sizes || []; const P = S.plan;
  const q0 = j?.qty || {};
  const seg = (name, vals, cur) => `<div class="segi">${vals.map(v => `<label><input type="radio" name="${name}" value="${esc(v)}" ${v === cur ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
  const qin = (n, v) => `<input type="number" min="0" step="1" name="${n}" value="${v ?? ''}" class="qin">`;
  const part = (tool, spec) => P.parts.find(p => p.tool === tool && (spec == null || p.spec === spec));
  const rows = []; let seenBlank = false, seenScreen = false;
  [...P.parts].sort((a, b) => a.sort - b.sort).forEach(p => {
    if (p.kind === 'qty' && p.job_key) rows.push([p.job_key, partName(p), 'Std', qin('q_' + p.job_key, q0[p.job_key] ?? (j && p.id > 20 ? 0 : +p.default_qty))]);
    else if (p.kind === 'blank' && !seenBlank) { seenBlank = true;
      rows.push(['blank', 'Blank Pipe', `<select name="blen" class="inline"><option value="">None</option>${(cfg.blanks || []).map(b => opt(b, b, j ? j.blank_length : '10 ft')).join('')}</select>`, qin('bqty', j ? j.blank_qty : 1)]); }
    else if (p.kind === 'screen' && !seenScreen) { seenScreen = true;
      rows.push(['screen', 'Deltapore Screen', `<select name="mic" class="inline"><option value="">None</option>${(cfg.microns || []).map(m => opt(m, m.replace(' micron', 'µ'), j?.screen_micron)).join('')}</select>
      <select name="ssize" class="inline" title="Screen size, if different from the tubing"><option value="">Same size</option>${sizes.map(z => opt(z, z, j?.screen_size)).join('')}</select>`, qin('sqty', j ? j.screen_qty : 1)]); }
  });
  return modal({
    title: j ? `Edit ${j.title}` : 'Add upcoming job', wide: true, submit: j ? 'Save changes' : 'Add job',
    sub: `${esc(lineName(cfg.department_id))} · screen hang-off BHA`,
    body: `<div class="pjf"><div class="pjf-main">
      <div class="pjf-sec">Job</div>
      <div class="row2"><label class="f">Well<input type="text" name="title" required value="${esc(j?.title || '')}" placeholder="Olomoro 39L"></label>
        <label class="f">Customer<input type="text" name="customer" value="${esc(j?.customer || '')}" placeholder="HEOSL - OML 30"></label></div>
      <div class="row2"><label class="f">Planned month<input type="month" name="month" required value="${esc((j?.planned_on || localISO(0)).slice(0, 7))}"></label>
        <label class="f">Status<select name="status">${Object.entries(PLAN_STATUS).map(([k, [, l]]) => opt(k, l, j?.status || 'planned')).join('')}</select></label></div>
      <div class="pjf-sec">String</div>
      <div class="pjf-string"><div class="f">Tubing size${seg('size', sizes, j?.tubing_size || sizes[2])}</div>
        <div class="f">Setting tool${seg('tool', cfg.tools || ['EMST', 'TTS'], j?.setting_tool || 'EMST')}</div></div>
      <div class="pjf-sec">BHA make-up</div>
      <div class="pjf-tw"><table class="t pjf-bha"><thead><tr><th>Component</th><th>Spec</th><th class="num">Qty</th><th class="num">Shelf</th></tr></thead><tbody>
        ${rows.map(([k, name, spec, q]) => `<tr data-row="${k}"><td class="name">${esc(name)}</td><td>${spec === 'Std' ? '<span class="sub">Std</span>' : spec}</td><td class="num">${q}</td><td class="num shelf"></td></tr>`).join('')}
        <tr class="svc"><td class="name sub">Setting tools</td><td colspan="3" class="svcline"></td></tr>
      </tbody></table></div>
    </div>
    <aside class="pjf-side"><div class="pjf-sec">Stock check</div><div id="pl-live" class="pllive"></div><div class="sub" id="pl-pos"></div>
      <div class="pjf-sec" style="margin-top:16px">Notes</div><textarea name="notes" rows="4" placeholder="Anything the store should know">${esc(j?.notes || '')}</textarea></aside></div>`,
    onOpen: d => {
      const f = $('form', d);
      const draw = () => {
        const x = Object.fromEntries(new FormData(f).entries()); const cand = planRow(x, j);
        const E = planEngine(P, { ...cand, id: j?.id ?? undefined, mr: j?.mr });
        const r = E.results.get(j?.id ?? 'new'); const planned = cand.status === 'planned' && r;
        const lineFor = p => p && r ? r.lines.find(l => l.part.id === p.id) : null;
        $$('tr[data-row]', d).forEach(tr => {
          const k = tr.dataset.row; const cell = $('.shelf', tr);
          const p = k === 'blank' ? P.parts.find(pp => pp.kind === 'blank' && pp.spec === x.blen) : k === 'screen' ? P.parts.find(pp => pp.kind === 'screen' && pp.spec === x.mic) : P.parts.find(pp => pp.job_key === k);
          const ln = lineFor(p);
          if (!planned) { cell.innerHTML = '<span class="sub">—</span>'; return; }
          if (!ln || !ln.need) { cell.innerHTML = '<span class="sub">—</span>'; return; }
          cell.innerHTML = ln.missing ? `<span class="neg"><b>✖ ${ln.reason === 'Not carried' ? 'not carried' : ln.reason === 'No Nest item linked' ? 'not linked' : `short ${fq(ln.missing)}`}</b><span class="sub"> · ${fq(ln.before || 0)} free</span></span>` : `<span class="pos"><b>✔</b> ${fq(ln.before)} free</span>`;
        });
        const svc = r ? r.lines.filter(l => l.part.kind === 'service') : [];
        $('.svcline', d).innerHTML = !planned ? '<span class="sub">Checked only for planned jobs</span>' : svc.length ? svc.map(l => `<span class="${l.missing ? 'neg' : 'pos'}">${l.missing ? '✖' : '✔'} ${esc(partName(l.part))}${l.reused ? ' <span class="sub">(reused)</span>' : ''}</span>`).join(' · ') : '<span class="sub">None needed</span>';
        const box = $('#pl-live', d), pos = $('#pl-pos', d);
        if (!planned) { box.className = 'pllive'; box.innerHTML = `<b>Not checked</b><div class="sub">${cand.status === 'hold' ? 'On hold' : cand.status === 'run' ? 'Run' : 'Cancelled'} jobs don’t claim stock.</div>`; pos.textContent = ''; return; }
        box.className = 'pllive ' + (r.ok ? 'ok' : 'bad');
        box.innerHTML = r.ok ? '<b class="big">✔ Ready</b><div>Can be done from the shelf.</div>'
          : `<b class="big">✖ Short ${plural(r.short.length, 'part')}</b><ul>${r.short.map(sh => `<li>${fq(sh.missing)} × ${esc(partName(sh.part))}${sh.size !== cand.tubing_size ? ` (${esc(sh.size)})` : ''}${sh.reason !== 'Not enough on the shelf' ? ` <span class="sub">· ${sh.reason === 'Not carried' ? 'not carried' : 'no Nest item linked'}</span>` : ''}</li>`).join('')}</ul>`;
        const idx = E.active.indexOf(r.job) + 1;
        pos.textContent = `${ord(idx)} of ${E.active.length} job${E.active.length === 1 ? '' : 's'} in date order. Earlier jobs take stock first.`;
      };
      f.addEventListener('input', debounce(draw, 100)); f.addEventListener('change', draw); draw();
    },
    onSubmit: async x => {
      const row = planRow(x, j);
      if (!row.title) throw new Error('Enter the well name.');
      if (j) await q(sb.from('plan_jobs').update(row).eq('id', j.id));
      else await q(sb.from('plan_jobs').insert({ ...row, department_id: planCfg().department_id }));
      toast(j ? 'Saved' : 'Job added'); S.plan = null; render({ quiet: true });
    }
  });
}
function planRow(x, j) {
  return { title: (x.title || '').trim(), customer: (x.customer || '').trim() || null, planned_on: (x.month || localISO(0).slice(0, 7)) + '-01', tubing_size: x.size, setting_tool: x.tool,
    blank_length: x.blen || null, blank_qty: x.blen ? +x.bqty || 0 : 0, screen_micron: x.mic || null, screen_qty: x.mic ? +x.sqty || 0 : 0, screen_size: x.ssize || null,
    qty: Object.fromEntries(qtyFields(S.plan).map(([k]) => [k, +x['q_' + k] || 0])), status: x.status || 'planned', notes: (x.notes || '').trim() || null };
}

function editPlanLink(P, partId, size) {
  const p = P.parts.find(x => x.id === partId); const l = P.links.find(x => x.part_id === partId && x.size === size) || { mode: 'items', item_ids: [], pool: '' };
  const picked = new Set((l.item_ids || []).map(Number)); const cfg = planCfg(); const dept = cfg.department_id;
  return modal({
    title: `${partName(p)} · ${size}`, wide: true, submit: 'Save',
    sub: 'Choose the Nest item(s) this part uses for this tubing size. Stock of all chosen items is added together.',
    body: `<div class="row2"><label class="f">For this size<select name="mode">${opt('items', 'Use these Nest items', l.mode)}${opt('not_needed', 'Not needed for this size', l.mode)}${opt('not_carried', 'Not carried (always short if a job needs it)', l.mode)}</select></label>
      <label class="f">Shared stock name<span class="hint">Give sizes that share stock the same name, or leave blank.</span><input type="text" name="pool" value="${esc(l.pool || '')}" placeholder="e.g. small"></label></div>
      ${p.kind === 'service' ? `<label class="f">Needed for this size when the job uses<span class="hint">${p.setting ? `The part is set to ${esc(p.setting)} only. Pick a tool here to change that for ${esc(size)}.` : 'Leave on “Any setting tool” unless this size only needs it for one tool.'}</span><select name="setting"><option value="">${p.setting ? 'Same as the part (' + esc(p.setting) + ' only)' : 'Any setting tool'}</option>${(cfg.tools || ['EMST', 'TTS']).map(t => opt(t, t + ' jobs only', l.setting)).join('')}</select></label>` : ''}
      <input type="search" id="lk-q" placeholder="Search Thru-Tubing items by code or description" autocomplete="off"><div id="lk-res" class="pickres"></div>
      <h3 class="grp">Linked items</h3><div id="lk-sel"></div>`,
    onOpen: d => {
      const its = S.items.filter(i => i.department_id === dept);
      const drawSel = () => {
        const sel = $('#lk-sel', d);
        sel.innerHTML = picked.size ? `<ul class="list">${[...picked].map(id => its.find(i => i.id === id) || S.items.find(i => i.id === id)).filter(Boolean).map(i => `<li><div style="flex:1">${tag(i.code)} ${esc(i.name)} <span class="sub">${fq(i.qty_available)} in store</span></div><button type="button" class="btn small link danger" data-rm="${i.id}">Remove</button></li>`).join('')}</ul>` : '<div class="muted">No items linked.</div>';
        $$('[data-rm]', sel).forEach(b => b.onclick = () => { picked.delete(+b.dataset.rm); drawSel(); });
      };
      const qi = $('#lk-q', d), res = $('#lk-res', d);
      qi.oninput = debounce(() => {
        const t = qi.value.trim().toLowerCase(); if (!t) { res.innerHTML = ''; return; }
        const hits = its.filter(i => `${i.code || ''} ${i.name}`.toLowerCase().includes(t)).slice(0, 20);
        res.innerHTML = hits.length ? hits.map(i => `<button type="button" class="pick" data-id="${i.id}">${tag(i.code)} <span>${esc(i.name)}</span><span class="sub">${fq(i.qty_available)} in store</span></button>`).join('') : '<div class="empty">No match.</div>';
        $$('[data-id]', res).forEach(b => b.onclick = () => { picked.add(+b.dataset.id); qi.value = ''; res.innerHTML = ''; drawSel(); });
      }, 140);
      drawSel();
    },
    onSubmit: async x => {
      const row = { part_id: partId, size, mode: x.mode, item_ids: x.mode === 'items' ? [...picked] : [], pool: (x.pool || '').trim() || null };
      if (p.kind === 'service') row.setting = x.setting || null;
      await q(sb.from('plan_links').upsert(row));
      toast('Saved'); S.plan = null; render({ quiet: true });
    }
  });
}

// ---------------------------------------------------------------- planned job → materials request
async function planToRequest(j) {
  const P = await planData(true); const E = planEngine(P);
  const r = E.results.get(j.id); if (!r) return toast('Only planned jobs can become a materials request.', true);
  await stockRows(true);
  const used = {}; const rows = []; const missing = [];
  const take = (itemId, n) => {
    const locs = S.locs.filter(l => l.active).map(l => ({ l, q: stockOf(itemId, l.id) - (used[itemId + ':' + l.id] || 0) })).filter(x => x.q > 0).sort((a, b) => b.q - a.q);
    let left = n;
    for (const x of locs) { if (!left) break; const t = Math.min(left, x.q); used[itemId + ':' + x.l.id] = (used[itemId + ':' + x.l.id] || 0) + t; rows.push({ item_id: itemId, location_id: x.l.id, qty: t }); left -= t; }
    return left;
  };
  r.lines.forEach(ln => {
    const want = ln.part.kind === 'service' ? 1 : ln.qty; const l = E.linkOf(ln.part.id, ln.size);
    let left = want;
    for (const id of (l?.item_ids || []).map(Number).sort((a, b) => (E.avail[b] || 0) - (E.avail[a] || 0))) { if (!left) break; left = take(id, left); }
    if (left > 0) missing.push(`${fq(left)} × ${partName(ln.part)} (${ln.size})`);
  });
  const merged = {}; rows.forEach(x => { const k = x.item_id + ':' + x.location_id; merged[k] = merged[k] ? { ...merged[k], qty: merged[k].qty + x.qty } : { ...x }; });
  const lines = Object.values(merged);
  const locCount = {}; lines.forEach(x => locCount[x.location_id] = (locCount[x.location_id] || 0) + 1);
  const base = +Object.entries(locCount).sort((a, b) => b[1] - a[1])[0]?.[0] || realLocs()[0]?.id;
  return modal({
    title: `Materials request for ${j.title}`, submit: 'Create draft request',
    sub: `Nest picks the linked items from the locations with the most stock. You can change anything on the draft before submitting it.`,
    body: `<p><b>${plural(lines.length, 'line')}</b> ready to add${lines.length ? `, leaving from ${esc(locName(base))}` : ''}.</p>
      ${missing.length ? `<div class="notice bad">Not on the shelf, so not added: ${esc(missing.join(', '))}.</div>` : ''}`,
    onSubmit: async () => {
      if (!lines.length) throw new Error('Nothing on the shelf to add for this job.');
      const nj = await q(sb.from('jobs').insert({ title: j.title, client: j.customer || null, field: j.title, base_location_id: base, start_date: j.planned_on, notes: `From Job planner · ${j.tubing_size} screen hang-off BHA` }).select().single());
      await q(sb.from('job_lines').insert(lines.map(x => ({ ...x, job_id: nj.id }))));
      await q(sb.from('plan_jobs').update({ mr_id: nj.id }).eq('id', j.id));
      S.plan = null; toast(`${nj.job_no} created as a draft`); go('#/job/' + nj.id);
    }
  });
}

// ---------------------------------------------------------------- Inventory vs Jobs report (management)
async function planReport(kind) {
  toast('Preparing the report…');
  const P = await planData(true); const E = planEngine(P); const k = E.kpi; const cfg = planCfg(); const pr = canSeePrices();
  const title = 'Inventory vs Upcoming Jobs'; const subtitle = `${lineName(cfg.department_id)} · Screen hang-off BHAs · ${fd(localISO(0))}`;
  const active = E.active.map(j => ({ j, r: E.results.get(j.id) }));
  const jobRows = active.map(({ j, r }) => ({ m: fmonthD(j.planned_on), well: j.title, cust: j.customer || '', size: j.tubing_size, bha: bhaText(j), chk: shortText(r), _st: { chk: r.ok ? 'ok' : 'overdue' } }));
  const ship = E.lines.filter(l => l.total > 0).sort((a, b) => a.part.sort - b.part.sort || a.label.localeCompare(b.label))
    .map(l => ({ part: partName(l.part), size: l.label, jobs: l.forJobs || '', top: l.topup || '', tot: l.total, unit: l.unit == null ? (pr ? 'no price' : '') : usd(l.unit), cost: l.cost == null ? '' : usd(l.cost), _unit: l.unit, _cost: l.cost }));
  const bha = E.bha.map(b => ({ size: b.size, n: b.n, lim: b.limitedBy, after: b.after, tgt: b.target, vs: b.vs < 0 ? `(${fq(-b.vs)})` : fq(b.vs), scr: b.screens }));
  const poolNote = E.pools.map(pl => `${pl.sizes.join(' and ')} share ${pl.blank} blanks (${fq(pl.blanks)} on the shelf): ${pl.total} complete BHA${pl.total === 1 ? '' : 's'} in total across both sizes. Each row shows the size on its own.`).join(' ');
  const kpis = [{ label: 'Active jobs', value: k.active }, { label: 'Can be done from shelf', value: k.ready }, { label: 'Short', value: k.short, tone: k.short ? 'bad' : '' },
    { label: 'Units to ship in', value: fq(k.total) }, ...(pr ? [{ label: 'Est. ship-in cost (USD)', value: usd(k.cost) }] : [{ label: 'Next job', value: k.next ? fmonthD(k.next) : '-' }])];
  if (kind === 'xlsx') {
    await brandXlsx({ file: `GANKCO_Inventory_vs_Jobs_${localISO(0)}.xlsx`, sheets: [
      { name: 'Jobs', title, subtitle, kpis: kpis.slice(0, 4), columns: [{ header: 'Month', key: 'm', width: 11 }, { header: 'Well', key: 'well', width: 22, bold: true }, { header: 'Customer', key: 'cust', width: 28 }, { header: 'Tubing', key: 'size', width: 9 },
        { header: 'BHA', key: 'bha', width: 44, wrap: true }, { header: 'Stock check', key: 'chk', width: 60, wrap: true }], rows: jobRows, cellStyle: (r, c) => c === 'chk' ? r._st.chk : null },
      { name: 'Ship-in order', title: 'Ship-in order', subtitle, columns: [{ header: 'Part', key: 'part', width: 30, bold: true }, { header: 'Tubing size', key: 'size', width: 26 }, { header: 'For jobs', key: 'jobs', width: 10, type: 'num' },
        { header: 'Safety top-up', key: 'top', width: 12, type: 'num' }, { header: 'Total', key: 'tot', width: 9, type: 'num', bold: true }, ...(pr ? [{ header: 'Unit price (USD)', key: '_unit', width: 15, type: 'num' }, { header: 'Est. cost (USD)', key: '_cost', width: 15, type: 'num' }] : [])],
        rows: ship, totals: ['jobs', 'top', 'tot', ...(pr ? ['_cost'] : [])], note: pr ? `Prices from the last purchase orders.${k.unpriced ? ` The total cost excludes ${plural(k.unpriced, 'line')} with no price.` : ''}` : '' },
      { name: 'BHAs on shelf', title: 'Complete BHAs on the shelf', subtitle, note: poolNote, columns: [{ header: 'Tubing size', key: 'size', width: 12 }, { header: 'On the shelf now', key: 'n', width: 15, type: 'num', bold: true },
        { header: 'Limited by (below the safety target)', key: 'lim', width: 40, wrap: true }, { header: 'Complete BHAs after all upcoming jobs', key: 'after', width: 20, type: 'num' }, { header: 'Safety target', key: 'tgt', width: 13, type: 'num' },
        { header: 'Compared with safety target', key: 'vs', width: 18 }, { header: 'Screens (all µ)', key: 'scr', width: 14, type: 'num' }], rows: bha }] });
    return;
  }
  await brandPdf({ file: `GANKCO_Inventory_vs_Jobs_${localISO(0)}.pdf`, title, subtitle, kpis,
    intro: `${k.active} active job${k.active === 1 ? '' : 's'}${k.next ? `, the next in ${fmonthD(k.next)}` : ''}. Checked against live shelf stock in date order. ${fq(k.forJobs)} unit${k.forJobs == 1 ? '' : 's'} short for jobs and ${fq(k.topup)} for safety stock.`,
    meta: [['Prepared by', S.profile.full_name || S.profile.email]],
    sections: [
      { heading: 'Upcoming jobs', headingNote: plural(active.length, 'job'), columns: [{ header: 'Month', dataKey: 'm', width: 20 }, { header: 'Well', dataKey: 'well', width: 34, bold: true }, { header: 'Customer', dataKey: 'cust', width: 40 },
        { header: 'Tubing', dataKey: 'size', width: 16 }, { header: 'BHA', dataKey: 'bha', width: 62 }, { header: 'Stock check', dataKey: 'chk' }], rows: jobRows },
      { heading: 'Ship-in order', headingNote: `${fq(k.total)} units${pr ? ' · est. ' + usd(k.cost) : ''}`, columns: [{ header: 'Part', dataKey: 'part', bold: true }, { header: 'Tubing size', dataKey: 'size', width: 46 },
        { header: 'For jobs', dataKey: 'jobs', width: 18, align: 'right' }, { header: 'Safety top-up', dataKey: 'top', width: 24, align: 'right' }, { header: 'Total', dataKey: 'tot', width: 15, align: 'right' },
        ...(pr ? [{ header: 'Unit (USD)', dataKey: 'unit', width: 24, align: 'right' }, { header: 'Est. cost (USD)', dataKey: 'cost', width: 28, align: 'right' }] : [])],
        rows: ship.length ? [...ship, { part: 'Total', size: pr && k.unpriced ? `Cost excludes ${plural(k.unpriced, 'line')} with no price` : '', jobs: fq(k.forJobs), top: fq(k.topup), tot: fq(k.total), unit: '', cost: pr ? usd(k.cost) : '', _total: true }] : [{ part: 'Nothing to ship in' }] },
      { heading: 'Complete BHAs on the shelf', note: poolNote, columns: [{ header: 'Tubing size', dataKey: 'size', width: 24 }, { header: 'On shelf now', dataKey: 'n', width: 22, align: 'right' }, { header: 'Limited by (below safety target)', dataKey: 'lim' },
        { header: 'After all upcoming jobs', dataKey: 'after', width: 26, align: 'right' }, { header: 'Safety target', dataKey: 'tgt', width: 22, align: 'right' }, { header: 'Compared with target', dataKey: 'vs', width: 26, align: 'right' }, { header: 'Screens', dataKey: 'scr', width: 18, align: 'right' }], rows: bha },
    ],
    signatures: [mySignature('Prepared by', `${title} · ${subtitle}`)] });
}

// Edit the price of the item(s) on one ship-in line
function editLinePrice(P, g) {
  const its = [...g.items].map(id => S.items.find(i => i.id === id)).filter(Boolean);
  return modal({
    title: `Price: ${partName(g.part)} · ${g.label}`, submit: 'Save prices',
    sub: 'Unit prices in USD. Leave a box empty for "no price". Every change is recorded in the audit log.',
    body: its.map(i => { const pr = P.prices[i.id]; return `<label class="f">${tag(i.code)} ${esc(i.name)}
      <span class="hint">${pr ? `Now ${usd(pr.unit_price)} · ${esc(pr.source || '')}${pr.updated_by_name ? ' · ' + esc(pr.updated_by_name) : ''} ${fd(pr.updated_at)}` : 'No price yet'}</span>
      <input type="number" min="0" step="0.01" name="p${i.id}" value="${pr ? +pr.unit_price : ''}" placeholder="no price"></label>`; }).join(''),
    onSubmit: async x => {
      for (const i of its) {
        const v = String(x['p' + i.id] ?? '').trim(); const cur = P.prices[i.id];
        if (v === '' && cur) await q(sb.from('item_prices').delete().eq('item_id', i.id));
        else if (v !== '' && (!cur || +cur.unit_price !== +v)) {
          if (!(+v >= 0)) throw new Error('Enter a price of zero or more.');
          await q(sb.from('item_prices').upsert({ item_id: i.id, unit_price: +v, source: 'Entered in Nest' }));
        }
      }
      S.plan = null; toast('Prices saved'); render({ quiet: true });
    }
  });
}

// ---------------------------------------------------------------- planner parts (2.6)
function editPlanPart(p) {
  const isNew = !p; const cfg = planCfg();
  const kindRadios = Object.entries(PART_KINDS).map(([k, [l, d]], i) => `<label class="mopt"><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}><span><b>${esc(l)}</b><span class="sub">${esc(d)}</span></span></label>`).join('');
  return modal({
    title: isNew ? 'Add a planner part' : `Edit ${partName(p)}`, submit: isNew ? 'Add part' : 'Save', wide: isNew,
    sub: isNew ? 'After adding it, link it to the Nest item(s) it uses for each tubing size, in the table.' : `${esc(PART_KINDS[p.kind]?.[0] || '')}${stdPart(p) ? ' · one of the parts from the Excel tracker' : ''}`,
    body: `${isNew ? `<div class="pjf-sec">Type of part</div><div class="mscope">${kindRadios}</div><div class="pjf-sec">Details</div>` : ''}
      <div class="row2"><label class="f">Name<input type="text" name="tool" required value="${esc(p?.tool || '')}" placeholder="Swell Packer"></label>
        <label class="f"><span class="pp-spec-l">${p && ['blank', 'screen'].includes(p.kind) ? (p.kind === 'blank' ? 'Length' : 'Micron') : 'Size / spec'}</span><span class="hint pp-spec-h">${p && ['blank', 'screen'].includes(p.kind) ? 'Can’t be changed: jobs use it.' : 'Optional. Leave empty for standard.'}</span>
          <input type="text" name="spec" value="${esc(p && p.spec !== 'Std' ? p.spec : '')}" ${p && ['blank', 'screen'].includes(p.kind) ? 'readonly' : ''} placeholder="e.g. 6 ft or 300 micron"></label></div>
      <div class="row3 pp-qty"><label class="f">Default quantity<span class="hint">Pre-filled on new jobs.</span><input type="number" min="0" step="1" name="def" value="${p ? +p.default_qty : 1}"></label>
        <label class="f">Per complete BHA<span class="hint">For the safety-stock count.</span><input type="number" min="1" step="1" name="per" value="${p ? +p.per_bha || 1 : 1}"></label>
        <label class="f pp-svc" ${p?.kind === 'service' ? '' : 'hidden'}>Only with setting tool<select name="setting"><option value="">Any</option>${(cfg.tools || ['EMST', 'TTS']).map(t => opt(t, t, p?.setting)).join('')}</select></label></div>
      <label class="check pp-safe"><input type="checkbox" name="safety" ${p ? (p.safety ? 'checked' : '') : 'checked'}> Counts toward a complete BHA on the shelf (and the safety top-up)</label>
      ${!isNew && !stdPart(p) ? '<div class="mt"><button type="button" class="btn small link danger" id="pp-del">Remove this part from the planner</button></div>' : ''}`,
    onOpen: d => {
      const f = $('form', d);
      const sync = () => {
        const k = isNew ? f.kind.value : p.kind;
        $('.pp-svc', d).hidden = k !== 'service'; $('.pp-safe', d).hidden = k === 'service';
        $$('.pp-qty label', d)[0].hidden = k !== 'qty';
        if (isNew) { $('.pp-spec-l', d).textContent = k === 'blank' ? 'Length' : k === 'screen' ? 'Micron' : 'Size / spec'; $('.pp-spec-h', d).textContent = k === 'blank' ? 'For example 6 ft.' : k === 'screen' ? 'For example 300 micron.' : 'Optional. Leave empty for standard.';
          if (k === 'blank') f.tool.value = f.tool.value || 'Blank Pipe'; if (k === 'screen') f.tool.value = f.tool.value || 'Deltapore Screen'; }
      };
      if (isNew) $$('[name=kind]', d).forEach(r => r.onchange = sync);
      sync();
      const del = $('#pp-del', d); if (del) del.onclick = async () => {
        if (!confirm(`Remove ${partName(p)} from the planner? Its links are removed too. Jobs keep their other parts.`)) return;
        try { await q(sb.rpc('remove_plan_part', { p_id: p.id })); toast('Part removed'); d.close(); d.remove(); S.plan = null; render({ quiet: true }); } catch (e) { toast(niceError(e), true); }
      };
    },
    onSubmit: async x => {
      if (!x.tool.trim()) throw new Error('Enter the part name.');
      if (isNew && ['blank', 'screen'].includes(x.kind) && !x.spec.trim()) throw new Error(x.kind === 'blank' ? 'Enter the length, for example 6 ft.' : 'Enter the micron, for example 300 micron.');
      if (isNew) await q(sb.rpc('add_plan_part', { p_tool: x.tool, p_spec: x.spec, p_kind: x.kind, p_setting: x.setting || '', p_safety: !!x.safety, p_per_bha: +x.per || 1, p_default_qty: +x.def || 0 }));
      else await q(sb.rpc('update_plan_part', { p_id: p.id, p_tool: x.tool, p_spec: x.spec, p_safety: !!x.safety, p_per_bha: +x.per || 1, p_default_qty: +x.def || 0, p_setting: x.setting || '' }));
      await loadLookups(); S.plan = null; toast(isNew ? 'Part added. Now link it to its Nest items.' : 'Saved'); render({ quiet: true });
    }
  });
}

// The stock check runs here in the browser; save the latest result so the morning emails can say which jobs are short
let planSnapAt = 0;
function savePlanSnapshot(E) {
  if (Date.now() - planSnapAt < 5 * 60 * 1000 || S.viewAs) return; planSnapAt = Date.now();
  try {
    const jobs = E.active.map(j => { const r = E.results.get(j.id); return { id: j.id, title: j.title, planned_on: j.planned_on, tubing_size: j.tubing_size, ok: !!r?.ok,
      short_n: r ? r.short.length : 0, short: r ? r.short.map(sh => `${fq(sh.missing)} × ${partName(sh.part)}${sh.size !== j.tubing_size ? ` (${sh.size})` : ''}`) : [] }; });
    const ship = E.lines.filter(l => l.total > 0).map(l => ({ part: partName(l.part), label: l.label, total: l.total, items: [...l.g.items] }));
    sb.rpc('save_plan_snapshot', { p_value: { jobs, ship, kpi: { active: E.kpi.active, ready: E.kpi.ready, short: E.kpi.short, total: E.kpi.total } } }).then(() => { }, () => { });
  } catch (e) { console.warn('plan snapshot', e); }
}
// keep the snapshot fresh even when nobody opens the planner (once every 6 hours, in the background)
async function refreshPlanSnapshot() {
  try {
    const at = setting('plan_snapshot', null)?.at; if (at && Date.now() - new Date(at).getTime() < 6 * 3600e3) return;
    const P = await planData(); savePlanSnapshot(planEngine(P));
  } catch (e) { console.warn('plan snapshot refresh', e); }
}
