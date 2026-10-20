/* core2: richer sample data + D3 / Plot chart library built on core.js. */
(function () {
  const WF = window.WF, MODES = WF.MODES, SHARE = WF.SHARE, SC = WF.SC;
  const TRIPS = SCN.TRIPS;
  const VMT = SCN.VMT;
  const PURP = ['Work', 'School', 'Shopping', 'Other', 'Non-home'];
  const PT = [1420, 980, 1310, 2540, 3610];
  const SEED = [[84, 8, 4.2, 2.6, 1.2, 0], [9, 31, 3, 13, 1, 43], [68, 25.6, 1.6, 4, .8, 0], [66, 25.5, 1.9, 5.3, 1, .3], [69, 23, 2.1, 5, .7, .2]];
  const INC = ['Under $35k', '$35k to $75k', '$75k to $125k', 'Over $125k'];
  const HHK = [164, 219, 283, 246];
  const AUTOS = ['0 cars', '1 car', '2 cars', '3 cars', '4+ cars'];
  const AUTO_SEED = [[27, 46, 21, 5, 1], [7, 36, 41, 12, 4], [2, 21, 50, 19, 8], [1, 12, 43, 28, 16]];
  const MODE_INC = [[48, 24, 7, 12, 1.2, 7.8], [60, 23, 3.5, 8, 1.1, 4.4], [68, 21, 2.4, 5.5, 1, 2.1], [72, 21, 1.5, 3.5, .9, 1.1]];
  const INCSH = [.14, .23, .33, .30];
  const BAND = ['Under 2 mi', '2 to 8 mi', 'Over 8 mi'];
  const BANDSH = [[.18, .47, .35], [.22, .46, .32], [.04, .46, .5], [.9, .1, 0], [.5, .5, 0], [.1, .72, .18]];
  const DIST = ['Weber', 'Davis', 'Salt Lake', 'Utah', 'Tooele'];
  const FLOW = [[820, 120, 25, 4, .5], [118, 790, 90, 6, .7], [22, 95, 3100, 160, 22], [3, 5, 150, 1500, 3], [.4, .6, 20, 2, 140]];
  const CAL_SHORT = ['Auto ownership', 'Activity pattern', 'Work location', 'School location', 'Tour mode', 'Tour timing', 'Stop frequency', 'Trip mode'];
  const COUNTY = ['Salt Lake', 'Utah', 'Davis', 'Weber', 'Tooele', 'External'];
  const COUNTY_V = [26.8, 15.1, 8.0, 6.9, 2.3, 2.3];
  const FAC = ['Freeway', 'Arterial', 'Collector', 'Local'];
  const FAC_SH = [[.44, .37, .12, .07], [.38, .38, .15, .09], [.46, .36, .12, .06], [.35, .4, .16, .09], [.5, .3, .12, .08], [.7, .22, .06, .02]];
  const LINES = ['Blue Line (rail)', 'Red Line (rail)', 'Green Line (rail)', 'FrontRunner', 'Route 200 (bus)', 'Route 2 (bus)'];
  const BOARD = SCN.BOARD;
  const FWY = ['Freeway', 'Arterial', 'Collector', 'Local'];

  const hex = (c) => d3.color(c).formatHex();
  const mix = (a, b, t) => hex(d3.interpolateRgb(a, b)(t));
  const onC = (c) => (d3.hcl(c).l > 62 ? '#0c1118' : '#ffffff');
  const fmtK = (v) => (v >= 1000 ? (v / 1000).toFixed(2) + 'M' : Math.round(v) + 'k');
  const f1 = (v) => v.toFixed(1);

  function K() {
    const t = WF.tok(), pal = WF.palette(), P = pal[0], S = pal[1], T = pal[2];
    const mode = { 'Drive alone': mix(t.surface, t.ink, .34), 'Shared ride': mix(t.surface, t.ink, .58), Transit: P, Walk: S, Bike: T, 'School bus': mix(S, T, .5) };
    const base3 = [P, S, T], cat = (i) => (i < 3 ? base3[i] : mix(base3[i - 3], base3[(i - 2) % 3], .5));
    const dk = WF.isDark(), ramp = (col, n, lo) => d3.range(n).map((i) => mix(mix(col, t.surface, dk ? .5 : (lo == null ? .72 : lo)), col, i / (n - 1)));
    return { t, P, S, T, mode, cat, ramp, neutral: (i) => mix(t.surface, t.ink, .2 + .08 * i) };
  }

  /* data */
  function ipf(rows, cols, seed) {
    let m = seed.map((r) => r.slice());
    for (let it = 0; it < 80; it++) {
      m = m.map((r, i) => { const s = d3.sum(r); return r.map((v) => (s ? v * rows[i] / s : 0)); });
      for (let j = 0; j < cols.length; j++) { const s = d3.sum(m, (r) => r[j]); m.forEach((r) => (r[j] = s ? r[j] * cols[j] / s : 0)); }
    }
    return m;
  }
  const pmCache = {};
  const PM = (sc) => pmCache[sc] || (pmCache[sc] = (() => { const tot = TRIPS[sc] * 1000; return ipf(PT.map((v) => v * tot / 9860), SHARE[sc].map((s) => s / 100 * tot), SEED); })());
  const modeTrips = (sc) => MODES.map((m, j) => d3.sum(PM(sc), (r) => r[j]));
  const A0F = SCN.A0F;
  const autoRow = (sc, i) => { const r = AUTO_SEED[i].slice(); r[0] *= A0F[sc]; const s = d3.sum(r); return r.map((v) => v / s * 100); };
  const autoAll = (sc) => AUTOS.map((a, j) => d3.sum(INC, (_, i) => HHK[i] * autoRow(sc, i)[j]) / d3.sum(HHK));
  const modeInc = (sc) => MODE_INC.map((row) => { const r = row.map((v, j) => v * SHARE[sc][j] / SHARE.Baseline[j]); const s = d3.sum(r); return r.map((v) => v / s * 100); });
  const g = (h, m, s) => Math.exp(-0.5 * ((h - m) / s) ** 2);
  const PUR_TOD = { Work: [[7.2, 1.1, 1], [16.6, 1.5, .85], [12, 2, .18]], School: [[7.6, .7, 1], [14.8, .9, .8], [16, 2, .12]], Shopping: [[10.8, 2, .8], [17.2, 2.2, 1], [13.5, 2, .5]], Other: [[8.3, 1.4, .5], [12.5, 2.5, .6], [17.8, 2.6, 1]], 'Non-home': [[7.8, 1.3, .7], [12.2, 2.2, .85], [16.9, 1.8, 1]] };
  const purTod = (p, h) => d3.sum(PUR_TOD[p], ([m, s, a]) => a * g(h, m, s)) + .02;
  const modeW = {
    'Drive alone': (h) => 1, 'Shared ride': (h) => 1 + .25 * g(h, 12.5, 3) + .2 * g(h, 19, 2),
    Transit: (h) => .55 + 1.4 * g(h, 7.5, 1.2) + 1.6 * g(h, 17, 1.4), Walk: (h) => .7 + .9 * g(h, 12, 2.2) + .7 * g(h, 15, 1.5),
    Bike: (h) => .5 + .9 * g(h, 16.5, 2) + .5 * g(h, 8, 1.5), 'School bus': (h) => g(h, 7.7, .7) + g(h, 14.8, .8) + .001,
  };
  function modeHour(sc) {
    const td = WF.tod(sc), mt = modeTrips(sc), out = [];
    MODES.forEach((m, j) => { const raw = td.map((d) => d.share * modeW[m](d.hour)); const k = mt[j] / d3.sum(raw); raw.forEach((v, h) => out.push({ mode: m, hour: h, v: v * k })); });
    return out;
  }
  const lg = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, .001208650973866179, -5.395239384953e-6]; let y = z, x = z, tmp = x + 5.5; tmp -= (x + .5) * Math.log(tmp); let s = 1.000000000190015; for (let j = 0; j < 6; j++) s += c[j] / ++y; return -tmp + Math.log(2.5066282746310005 * s / x); };
  const gam = (x, k, th) => (x <= 0 ? 0 : Math.exp((k - 1) * Math.log(x) - x / th - lg(k) - k * Math.log(th)));
  const TL = { Work: [2.6, 4.4], School: [2.2, 2.2], Shopping: [1.9, 2.6], Other: [1.8, 3.6], 'Non-home': [1.7, 3.8] };
  const TLadj = SCN.TL;
  const AGES = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80+'];
  const AGEW = [8.2, 8.4, 8.3, 8.0, 8.6, 9.0, 8.7, 8.0, 7.0, 6.1, 5.4, 4.8, 4.2, 3.4, 2.5, 1.7, 1.5];
  const pyr = () => { const tot = d3.sum(AGEW), P = 2731; const rnd = (() => { let s = 5; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })(); return AGES.map((a, i) => { const t = AGEW[i] / tot * P, mShare = i > 12 ? .5 - (i - 12) * .018 : .506; const o = { m: t * mShare, f: t * (1 - mShare) }; return { age: a, om: o.m, of: o.f, mm: o.m * (1 + (rnd() - .5) * .07), mf: o.f * (1 + (rnd() - .5) * .07) }; }); };
  const speed = (sc, fac, h) => { const base = [62, 33, 28, 22][fac], dip = [.34, .22, .15, .08][fac]; const adj = SCN.SPEED[sc]; return base * adj * (1 - dip * (g(h, 7.7, 1.4) * .85 + g(h, 17, 1.8))); };

  const D = { clearCache: () => { Object.keys(pmCache).forEach((k) => delete pmCache[k]); }, INCSH, modeHour, purTod, PUR_TOD, TLadj, TRIPS, VMT, PURP, PT, PM, modeTrips, INC, HHK, AUTOS, autoRow, autoAll, modeInc, DIST, FLOW, LINES, BOARD, COUNTY, FAC, COUNTY_V, FAC_SH, ipf };
  WF.D = D; WF.K = K;

  /* helpers */
  function svgRoot(el, w, h) { el.innerHTML = ''; return d3.select(el).append('svg').attr('width', w).attr('height', h).style('display', 'block').style('overflow', 'visible').style('font-family', WF.tok().font).style('font-size', '12px'); }
  const tipper = () => ({ show(h, e) { WF.TT.show(h, e); }, hide() { WF.TT.hide(); } });
  WF.hi = (mode) => { document.querySelectorAll('[data-m]').forEach((e) => { e.style.opacity = !mode || e.dataset.m === mode ? '' : '.2'; e.style.transition = 'opacity .15s'; }); };
  const parseLine = (x) => { if (typeof x !== 'string') return x; const i = x.lastIndexOf(': '); return i > 0 ? { k: x.slice(0, i), v: x.slice(i + 2) } : { k: '', v: x }; };
  const tipRow = (title, lines, extra) => WF.TT.html(Object.assign({ title, rows: lines.map(parseLine) }, extra || {}));

  /* hierarchy specs */
  const specs = {
    trips: (c) => {
      const k = K(), t = WF.tok(), g = c.group || 'pm', m = PM(c.focus);
      if (g === 'mp') return { groups: MODES.map((mo, j) => ({ name: mo, idx: j, children: PURP.map((p, i) => ({ name: p, v: m[i][j] })).filter((d) => d.v > 1) })), leaf: (n) => k.cat(PURP.indexOf(n)), fmt: fmtK, unit: 'daily trips', isMode: false, ofLabel: 'trips' };
      if (g === 'im') { const mi = modeInc(c.focus); return { groups: INC.map((n, i) => ({ name: n, idx: i, children: MODES.map((mo, j) => ({ name: mo, v: TRIPS[c.focus] * 1000 * INCSH[i] * mi[i][j] / 100 })).filter((d) => d.v > 1) })), leaf: (n) => k.mode[n], fmt: fmtK, unit: 'daily trips', isMode: true, ofLabel: 'trips' }; }
      const base = { groups: PURP.map((p, i) => ({ name: p, idx: i, children: MODES.map((mo, j) => ({ name: mo, v: m[i][j] })).filter((d) => d.v > 1) })), leaf: (n) => k.mode[n], fmt: fmtK, unit: 'daily trips', isMode: true, ofLabel: 'trips' };
      if (c.diff && c.diff !== 'val' && c.ref && c.ref !== c.focus) {
        const ref = PM(c.ref), pal = WF.palette(), mid = mix(t.surface, t.ink, .16), chg = (p, n, v) => { const r = ref[PURP.indexOf(p)][MODES.indexOf(n)]; return r ? v / r - 1 : 0; };
        base.leaf = (n, p, v) => { const x = Math.max(-1, Math.min(1, chg(p, n, v) / .25)); return x < 0 ? mix(mid, pal[1], -x) : mix(mid, pal[0], x); };
        base.delta = (p, n, v) => { const x = chg(p, n, v) * 100; return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1) + '%'; };
        base.isMode = false;
      }
      return base;
    },
    hh: (c) => { const k = K(), cols = k.ramp(k.S, 5, .8); return { groups: INC.map((n, i) => ({ name: n, idx: i, children: AUTOS.map((a, j) => ({ name: a, v: HHK[i] * autoRow(c.focus, i)[j] / 100 })).filter((d) => d.v > .5) })), leaf: (n) => cols[AUTOS.indexOf(n)], fmt: (v) => Math.round(v) + 'k', unit: 'households', ofLabel: 'households' }; },
    vmt: (c) => { const k = K(), sc = VMT[c.focus] / 61.4; return { groups: COUNTY.map((n, i) => ({ name: n, idx: i, children: FAC.map((f, j) => ({ name: f, v: COUNTY_V[i] * FAC_SH[i][j] * sc })) })), leaf: (n) => k.ramp(k.P, 4, .75)[FAC.indexOf(n)], fmt: (v) => v.toFixed(1) + 'M', unit: 'million vehicle miles', ofLabel: 'miles' }; },
  };

  function treemap(el, c, w, h, kind) {
    const sp = specs[kind](c), t = WF.tok();
    const root = d3.hierarchy({ name: 'all', children: sp.groups }).sum((d) => d.v || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([w, h]).paddingInner(3).paddingTop((d) => (d.depth === 1 ? 22 : 0)).round(true)(root);
    const svg = svgRoot(el, w, h), tp = tipper(el);
    const grp = svg.selectAll('g.p').data(root.children).join('g');
    grp.append('text').attr('x', (d) => d.x0 + 1).attr('y', (d) => d.y0 + 14).attr('fill', t.ink).attr('font-weight', 600).style('pointer-events', 'none')
      .text((d) => ((d.x1 - d.x0) < 46 ? '' : d.data.name)).append('tspan').attr('fill', t.mute).attr('font-weight', 400).text((d) => ((d.x1 - d.x0) < 110 ? '' : '  ' + sp.fmt(d.value)));
    const leaf = svg.selectAll('g.l').data(root.leaves()).join('g').attr('transform', (d) => `translate(${d.x0},${d.y0})`).attr('data-key', (d) => d.parent.data.name + '|' + d.data.name).attr('data-title', (d) => d.parent.data.name + ' · ' + d.data.name).attr('data-val', (d) => sp.fmt(d.value)).attr('data-num', (d) => d.value).attr('data-rel', '1').style('cursor', 'default');
    if (sp.isMode) leaf.attr('data-m', (d) => d.data.name);
    leaf.append('rect').attr('width', (d) => Math.max(0, d.x1 - d.x0)).attr('height', (d) => Math.max(0, d.y1 - d.y0)).attr('rx', 6).attr('fill', (d) => sp.leaf(d.data.name, d.parent.data.name, d.value));
    leaf.filter((d) => d.x1 - d.x0 > 66 && d.y1 - d.y0 > 40).append('text').attr('x', 9).attr('y', 20).attr('fill', (d) => onC(sp.leaf(d.data.name, d.parent.data.name, d.value))).attr('font-weight', 600).style('pointer-events', 'none').text((d) => d.data.name)
      .append('tspan').attr('x', 9).attr('dy', 16).attr('font-weight', 400).attr('opacity', .85).text((d) => sp.fmt(d.value) + (sp.delta ? '  ' + sp.delta(d.parent.data.name, d.data.name, d.value) : ''));
    leaf.on('mousemove', (e, d) => { tp.show(tipRow(`${d.parent.data.name} · ${d.data.name}`, [{ k: 'Total', v: `${sp.fmt(d.value)} ${sp.ofLabel}`, b: true, c: sp.leaf(d.data.name, d.parent.data.name, d.value) }, `Share of ${d.parent.data.name.toLowerCase()}: ${f1(d.value / d.parent.value * 100)}%`].concat(sp.delta ? [`Change vs reference: ${sp.delta(d.parent.data.name, d.data.name, d.value)}`] : [])), e); if (sp.isMode) WF.hi(d.data.name); })
      .on('mouseleave', () => { tp.hide(); if (sp.isMode) WF.hi(null); });
  }

  function sunburst(el, c, w, h, kind) {
    const sp = specs[kind](Object.assign(Object.create(c), { diff: 'val' })), t = WF.tok(); let scope = null;
    const svg = svgRoot(el, w, h), tp = tipper(el), R = Math.min(w, h) / 2 - 6;
    const gg = svg.append('g').attr('transform', `translate(${w / 2},${h / 2})`);
    function draw() {
      gg.selectAll('*').remove();
      const kids = scope == null ? sp.groups : sp.groups.find((x) => x.name === scope).children;
      const root = d3.hierarchy({ name: 'all', children: kids }).sum((d) => d.v || 0);
      d3.partition().size([2 * Math.PI, 1])(root);
      const r0 = R * .34, n = scope == null ? 2 : 1, ring = (R - r0) / n;
      const arc = d3.arc().startAngle((d) => d.x0).endAngle((d) => d.x1).padAngle(.012).padRadius(R / 2).cornerRadius(4).innerRadius((d) => r0 + (d.depth - 1) * ring + (d.depth > 1 ? 2 : 0)).outerRadius((d) => r0 + d.depth * ring - 2);
      const nodes = root.descendants().filter((d) => d.depth > 0);
      const fill = (d) => (d.children ? K().neutral(d.data.idx || 0) : sp.leaf(d.data.name, scope || (d.parent && d.parent.data.name), d.value));
      const p = gg.selectAll('path').data(nodes).join('path').attr('d', arc).attr('fill', fill).attr('data-key', (d) => (d.children ? 'grp|' : (scope || (d.parent && d.parent.data.name)) + '|') + d.data.name).attr('data-title', (d) => (d.children ? d.data.name : (scope || (d.parent && d.parent.data.name)) + ' · ' + d.data.name)).attr('data-val', (d) => sp.fmt(d.value)).attr('data-num', (d) => d.value).attr('data-rel', '1').style('cursor', (d) => (d.children ? 'zoom-in' : 'default'));
      if (sp.isMode) p.attr('data-m', (d) => (d.children ? null : d.data.name));
      p.on('click', (e, d) => { if (d.children) { scope = d.data.name; tp.hide(); draw(); } })
        .on('mousemove', (e, d) => { tp.show(tipRow(d.children ? d.data.name : `${d.parent.data.name === 'all' ? scope : d.parent.data.name} · ${d.data.name}`, [`Total: ${sp.fmt(d.value)} ${sp.ofLabel}`, d.children ? { k: '', v: 'Click to zoom in' } : `Share of ${(d.parent.data.name === 'all' ? scope : d.parent.data.name).toLowerCase()}: ${f1(d.value / (d.parent.value || 1) * 100)}%`]), e); if (sp.isMode && !d.children) WF.hi(d.data.name); })
        .on('mouseleave', () => { tp.hide(); if (sp.isMode) WF.hi(null); });
      gg.selectAll('text.a').data(nodes.filter((d) => d.children && d.x1 - d.x0 > .32)).join('text').attr('class', 'a').style('pointer-events', 'none').attr('text-anchor', 'middle').attr('dy', '.35em').attr('fill', t.ink).attr('font-weight', 600)
        .attr('transform', (d) => { const a = (d.x0 + d.x1) / 2 * 180 / Math.PI - 90, r = r0 + ring * .5; return `rotate(${a}) translate(${r},0) rotate(${a > 90 ? 180 : 0})`; }).text((d) => d.data.name);
      const cg = gg.append('g').style('cursor', scope ? 'pointer' : 'default').on('click', () => { if (scope) { scope = null; draw(); } });
      cg.append('circle').attr('r', r0 - 6).attr('fill', 'transparent');
      cg.append('text').attr('text-anchor', 'middle').attr('y', -2).attr('font-size', Math.max(16, R * .16)).attr('font-weight', 600).attr('fill', t.ink).text(sp.fmt(root.value));
      cg.append('text').attr('text-anchor', 'middle').attr('y', 16).attr('fill', t.mute).attr('font-size', 11.5).text(scope ? scope + ' · tap to go back' : sp.unit);
    }
    draw();
  }

  function sankey(el, c, w, h) {
    const t = WF.tok(), k = K(), m = PM(c.focus), mt = modeTrips(c.focus);
    if (!d3.sankey) { el.textContent = 'Sankey library unavailable'; return; }
    const nodes = [...PURP.map((p) => ({ id: 'p:' + p, name: p })), ...MODES.map((x) => ({ id: 'm:' + x, name: x, mode: x })), ...BAND.map((b) => ({ id: 'b:' + b, name: b }))];
    const links = [];
    PURP.forEach((p, i) => MODES.forEach((x, j) => { if (m[i][j] > 5) links.push({ source: 'p:' + p, target: 'm:' + x, value: m[i][j], mode: x }); }));
    MODES.forEach((x, j) => BAND.forEach((b, q) => { const v = mt[j] * BANDSH[j][q]; if (v > 5) links.push({ source: 'm:' + x, target: 'b:' + b, value: v, mode: x }); }));
    const sk = d3.sankey().nodeId((d) => d.id).nodeWidth(12).nodePadding(10).nodeSort(null).extent([[2, 6], [w - 2, h - 6]]);
    const gr = sk({ nodes: nodes.map((d) => ({ ...d })), links: links.map((d) => ({ ...d })) });
    const svg = svgRoot(el, w, h), tp = tipper(el);
    const lk = svg.append('g').attr('fill', 'none').selectAll('path').data(gr.links).join('path').attr('data-m', (d) => d.mode).attr('d', d3.sankeyLinkHorizontal()).attr('stroke', (d) => k.mode[d.mode]).attr('stroke-width', (d) => Math.max(1, d.width)).attr('stroke-opacity', .4);
    lk.on('mousemove', (e, d) => { tp.show(tipRow(`${d.source.name} → ${d.target.name}`, [`Daily trips: ${fmtK(d.value)}`, `Share of mode: ${f1(d.value / d.source.value * 100)}%`.replace(/^/, '')]), e); WF.hi(d.mode); lk.attr('stroke-opacity', (x) => (x === d ? .75 : .4)); }).on('mouseleave', () => { tp.hide(); WF.hi(null); lk.attr('stroke-opacity', .4); });
    const nd = svg.append('g').selectAll('g').data(gr.nodes).join('g');
    nd.append('rect').attr('x', (d) => d.x0).attr('y', (d) => d.y0).attr('width', (d) => d.x1 - d.x0).attr('height', (d) => Math.max(1, d.y1 - d.y0)).attr('rx', 3).attr('fill', (d) => (d.mode ? k.mode[d.mode] : mix(t.surface, t.ink, .5))).attr('data-m', (d) => d.mode || null);
    nd.append('text').attr('x', (d) => (d.depth === 2 ? d.x0 - 7 : d.x1 + 7)).attr('y', (d) => (d.y0 + d.y1) / 2).attr('dy', '.35em').attr('text-anchor', (d) => (d.depth === 2 ? 'end' : 'start')).attr('fill', t.ink).attr('stroke', t.surface).attr('stroke-width', 3).attr('paint-order', 'stroke').attr('font-weight', 500).style('pointer-events', 'none').text((d) => (d.y1 - d.y0 < 9 ? '' : d.name));
    nd.on('mouseenter', (e, d) => d.mode && WF.hi(d.mode)).on('mouseleave', () => WF.hi(null));
  }

  function donut(el, c, w, h) {
    const t = WF.tok(), k = K(), sc = c.focus, vals = SHARE[sc];
    const svg = svgRoot(el, w, h), tp = tipper(el), size = Math.min(h, w * (w > 420 ? .5 : 1)), R = size / 2 - 4, cx = w > 420 ? size / 2 + 4 : w / 2, cy = h / 2;
    const gg = svg.append('g').attr('transform', `translate(${cx},${cy})`);
    const pie = d3.pie().sort(null).value((d) => d)(vals);
    const arc = d3.arc().innerRadius(R * .64).outerRadius(R).padAngle(.012).cornerRadius(5);
    const big = gg.append('text').attr('text-anchor', 'middle').attr('y', 2).attr('font-size', R * .3).attr('font-weight', 600).attr('fill', t.ink).text(TRIPS[sc].toFixed(2) + 'M');
    const sub = gg.append('text').attr('text-anchor', 'middle').attr('y', R * .22 + 6).attr('fill', t.mute).text('daily trips');
    gg.selectAll('path').data(pie).join('path').attr('d', arc).attr('fill', (d, i) => k.mode[MODES[i]]).attr('data-m', (d, i) => MODES[i])
      .on('mouseenter', (e, d) => { const i = d.index; WF.hi(MODES[i]); big.text(f1(vals[i]) + '%'); sub.text(MODES[i]); }).on('mouseleave', () => { WF.hi(null); big.text(TRIPS[sc].toFixed(2) + 'M'); sub.text('daily trips'); });
    if (w > 420) {
      const x0 = size + 40, rowH = Math.min(34, (h - 12) / 6);
      const order = d3.range(6).sort((a, b) => vals[b] - vals[a]);
      const L = svg.append('g').attr('transform', `translate(${x0},${(h - rowH * 6) / 2})`);
      order.forEach((i, r) => { const row = L.append('g').attr('transform', `translate(0,${r * rowH})`).attr('data-m', MODES[i]).style('cursor', 'default');
        row.append('circle').attr('cx', 6).attr('cy', rowH / 2).attr('r', 6).attr('fill', k.mode[MODES[i]]);
        row.append('text').attr('x', 20).attr('y', rowH / 2).attr('dy', '.35em').attr('fill', t.ink).text(MODES[i]);
        row.append('text').attr('x', w - x0 - 62).attr('y', rowH / 2).attr('dy', '.35em').attr('text-anchor', 'end').attr('fill', t.ink).attr('font-weight', 600).text(f1(vals[i]) + '%');
        const gap = vals[i] - SHARE.Observed[i];
        row.append('text').attr('x', w - x0 - 4).attr('y', rowH / 2).attr('dy', '.35em').attr('text-anchor', 'end').attr('fill', Math.abs(gap) <= 1 ? t.ok : Math.abs(gap) <= 2.5 ? t.warn : t.fail).text((gap > 0 ? '+' : '−') + Math.abs(gap).toFixed(1));
        row.on('mouseenter', () => WF.hi(MODES[i])).on('mouseleave', () => WF.hi(null)); });
      L.append('text').attr('x', w - x0 - 4).attr('y', -6).attr('text-anchor', 'end').attr('fill', t.mute).attr('font-size', 11).text('vs observed, pts');
    }
  }

  function stacked(el, c, w, h, spec) {
    const t = WF.tok(), svg = svgRoot(el, w, h), tp = tipper(el), ml = spec.ml || 100, n = spec.rows.length, step = (h - 6) / n, bh = Math.min(38, step * .66);
    const x = d3.scaleLinear([0, 100], [ml, w - 6]);
    [25, 50, 75].forEach((v) => svg.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', 0).attr('y2', h - 4).attr('stroke', t.grid));
    spec.rows.forEach((r, i) => {
      const yc = 3 + step * i + step / 2, tot = d3.sum(r.vals); let acc = 0;
      svg.append('text').attr('x', ml - 12).attr('y', yc).attr('dy', '.35em').attr('text-anchor', 'end').attr('fill', t.ink).text(r.label);
      r.vals.forEach((v, j) => { const pc = v / tot * 100, x0 = x(acc), x1 = x(acc + pc); acc += pc; if (pc < .4) return;
        const gg = svg.append('g').attr('data-m', spec.isMode ? spec.keys[j] : null).attr('data-key', r.label + '|' + spec.keys[j]).attr('data-title', r.label + ' · ' + spec.keys[j]).attr('data-val', f1(pc) + '%').attr('data-num', pc).attr('data-unit', ' pts');
        gg.append('rect').attr('x', x0).attr('y', yc - bh / 2).attr('width', Math.max(0, x1 - x0 - 2)).attr('height', bh).attr('rx', 5).attr('fill', spec.colors[j]);
        if (x1 - x0 > 38) gg.append('text').attr('x', (x0 + x1) / 2 - 1).attr('y', yc).attr('dy', '.35em').attr('text-anchor', 'middle').attr('fill', onC(spec.colors[j])).attr('font-weight', 500).style('pointer-events', 'none').text(pc >= 10 ? Math.round(pc) + '%' : f1(pc) + '%');
        gg.on('mousemove', (e) => { tp.show(tipRow(`${r.label} · ${spec.keys[j]}`, [{ k: 'Share', v: f1(pc) + '%', b: true, c: spec.colors[j] }, `Of: ${spec.of || 'trips'}`]), e); if (spec.isMode) WF.hi(spec.keys[j]); }).on('mouseleave', () => { tp.hide(); if (spec.isMode) WF.hi(null); }); });
    });
  }
  const stackedTrips = (el, c, w, h) => { const k = K(), m = PM(c.focus); stacked(el, c, w, h, { rows: PURP.map((p, i) => ({ label: p, vals: m[i] })), keys: MODES, colors: MODES.map((x) => k.mode[x]), isMode: true, ml: 86, of: 'purpose trips' }); };
  const stackedInc = (el, c, w, h) => { const k = K(), m = modeInc(c.focus); stacked(el, c, w, h, { rows: INC.map((n, i) => ({ label: n, vals: m[i] })), keys: MODES, colors: MODES.map((x) => k.mode[x]), isMode: true, ml: 104, of: 'income-group trips' }); };
  const stackedAuto = (el, c, w, h) => { const k = K(), cols = k.ramp(k.S, 5, .8); stacked(el, c, w, h, { rows: INC.map((n, i) => ({ label: n, vals: autoRow(c.focus, i) })), keys: AUTOS, colors: cols, ml: 104, of: 'households' }); };

  function radar(el, c, w, h) {
    const t = WF.tok(), k = K(), n = WF.CAL.length, list = SC.filter((s) => c.active.has(s)).slice(0, 6), ids = list.length ? list : [c.focus];
    const E = ids.map((s) => SCN.CALR(s)), max = Math.max(6.5, Math.ceil(d3.max(E.flat()) / 2) * 2 + 1), R = Math.min(w, h) / 2 - 56, cx = w / 2, cy = h / 2 + 4;
    const svg = svgRoot(el, w, h), tp = tipper(el), ang = (i) => -Math.PI / 2 + i * 2 * Math.PI / n, r = d3.scaleLinear([0, max], [0, R]);
    const pt = (i, v) => [cx + Math.cos(ang(i)) * r(v), cy + Math.sin(ang(i)) * r(v)], rings = [1, 2, 3].map((q) => Math.round(max * q / 3));
    rings.forEach((v) => svg.append('polygon').attr('points', d3.range(n).map((i) => pt(i, v)).join(' ')).attr('fill', 'none').attr('stroke', t.grid));
    svg.append('polygon').attr('points', d3.range(n).map((i) => pt(i, 3)).join(' ')).attr('fill', t.ok).attr('fill-opacity', .08).attr('stroke', t.ok).attr('stroke-dasharray', '4 3').attr('stroke-opacity', .8);
    d3.range(n).forEach((i) => svg.append('line').attr('x1', cx).attr('y1', cy).attr('x2', pt(i, max)[0]).attr('y2', pt(i, max)[1]).attr('stroke', t.grid));
    const cols = ids.map((s) => (ids.length > 1 ? WF.scColor(s) : k.P));
    ids.forEach((s, si) => { svg.append('polygon').attr('points', E[si].map((e, i) => pt(i, e)).join(' ')).attr('fill', cols[si]).attr('fill-opacity', ids.length > 1 ? .12 : .22).attr('stroke', cols[si]).attr('stroke-width', 2).attr('stroke-linejoin', 'round');
      E[si].forEach((e, i) => { const [px, py] = pt(i, e), st = WF.status(e); svg.append('circle').attr('cx', px).attr('cy', py).attr('r', ids.length > 1 ? 4 : 5).attr('fill', ids.length > 1 ? cols[si] : st === 'ok' ? t.ok : st === 'warn' ? t.warn : t.fail).attr('stroke', t.surface).attr('stroke-width', 2).style('pointer-events', 'none'); }); });
    WF.CAL.forEach((d, i) => { const [lx, ly] = pt(i, max + 1.15), a = Math.cos(ang(i)), st0 = WF.status(E[0][i]), col0 = st0 === 'ok' ? t.mute : st0 === 'warn' ? t.warn : t.fail;
      svg.append('text').attr('x', lx).attr('y', ly).attr('dy', '.35em').attr('text-anchor', Math.abs(a) < .2 ? 'middle' : a > 0 ? 'start' : 'end').attr('fill', col0).attr('font-weight', st0 === 'ok' ? 400 : 600).style('pointer-events', 'none').text(CAL_SHORT[i]);
      svg.append('line').attr('x1', cx).attr('y1', cy).attr('x2', pt(i, max)[0]).attr('y2', pt(i, max)[1]).attr('stroke', 'transparent').attr('stroke-width', 26).style('cursor', 'default')
        .on('mousemove', (e) => tp.show(tipRow(d[0], ids.map((s, si) => ({ k: ids.length > 1 ? WF.L(s) : 'Worst-segment error', v: f1(E[si][i]) + '%', c: ids.length > 1 ? cols[si] : null, b: si === 0, d: WF.status(E[si][i]) === 'ok' ? 'within 3%' : WF.STATUS_LABEL[WF.status(E[si][i])].toLowerCase(), dc: WF.status(E[si][i]) === 'ok' ? 'var(--ok)' : WF.status(E[si][i]) === 'warn' ? 'var(--warn)' : 'var(--fail)' })), { sub: d[1] }), e)).on('mouseleave', tp.hide); });
    rings.forEach((v) => { const a0 = ang(0) + Math.PI / n, px = cx + Math.cos(a0) * r(v), py = cy + Math.sin(a0) * r(v); svg.append('text').attr('x', px + 3).attr('y', py - 2).attr('fill', t.mute).attr('font-size', 10.5).style('pointer-events', 'none').text(v + '%'); });
  }

  function chord(el, c, w, h) {
    const t = WF.tok(), k = K(), svg = svgRoot(el, w, h), tp = tipper(el), R = Math.min(w, h) / 2 - 58;
    const sc = c.focus, f = FLOW.map((r, i) => r.map((v, j) => (i === j ? 0 : v * SCN.FLOWT[sc])));
    const ch = d3.chord().padAngle(.05).sortSubgroups(d3.descending)(f), cols = DIST.map((_, i) => k.cat(i));
    const gg = svg.append('g').attr('transform', `translate(${w / 2},${h / 2})`);
    const rib = gg.append('g').selectAll('path').data(ch).join('path').attr('d', d3.ribbon().radius(R - 3)).attr('fill', (d) => cols[d.source.index]).attr('fill-opacity', .55).attr('stroke', t.surface).attr('stroke-width', .6);
    const arcs = gg.append('g').selectAll('g').data(ch.groups).join('g');
    arcs.append('path').attr('d', d3.arc().innerRadius(R).outerRadius(R + 10).cornerRadius(3)).attr('fill', (d) => cols[d.index]);
    arcs.append('text').each((d) => (d.angle = (d.startAngle + d.endAngle) / 2)).attr('dy', '.35em').attr('transform', (d) => `rotate(${d.angle * 180 / Math.PI - 90}) translate(${R + 20}) ${d.angle > Math.PI ? 'rotate(180)' : ''}`).attr('text-anchor', (d) => (d.angle > Math.PI ? 'end' : null)).attr('fill', t.ink).attr('font-weight', 500).text((d) => DIST[d.index]);
    const hl = (i) => rib.attr('fill-opacity', (d) => (i == null || d.source.index === i || d.target.index === i ? (i == null ? .55 : .8) : .08));
    arcs.on('mouseenter', (e, d) => hl(d.index)).on('mouseleave', () => hl(null));
    rib.on('mousemove', (e, d) => { tp.show(tipRow(`${DIST[d.source.index]} → ${DIST[d.target.index]}`, [{ k: 'Daily trips', v: fmtK(f[d.source.index][d.target.index]), b: true, c: cols[d.source.index] }, `In return: ${fmtK(f[d.target.index][d.source.index])}`]), e); }).on('mouseleave', tp.hide);
  }

  function ridge(el, c, w, h) {
    const t = WF.tok(), k = K(), svg = svgRoot(el, w, h), ml = 82, mb = 22, n = PURP.length, rowH = (h - mb - 6) / n, xs = d3.scaleLinear([0, 30], [ml, w - 10]);
    const pts = d3.range(0, 30.01, .5), adj = TLadj[c.focus], labels = [];
    svg.append('g').selectAll('line').data(d3.range(0, 31, 5)).join('line').attr('x1', xs).attr('x2', xs).attr('y1', 0).attr('y2', h - mb).attr('stroke', t.grid);
    svg.append('g').selectAll('text').data(d3.range(0, 31, 5)).join('text').attr('x', xs).attr('y', h - 5).attr('text-anchor', 'middle').attr('fill', t.mute).text((d) => d + (d === 30 ? ' mi' : ''));
    PURP.forEach((p, i) => { const [kk, th] = TL[p], base = 6 + rowH * (i + 1) - 2, mod = pts.map((x) => gam(x, kk, th * adj)), obs = pts.map((x) => gam(x, kk, th));
      const ymax = d3.max(PURP.map((q) => d3.max(pts, (x) => gam(x, TL[q][0], TL[q][1])))), ys = d3.scaleLinear([0, ymax], [0, rowH * 1.75]);
      const a = d3.area().x((d, j) => xs(pts[j])).y0(base).y1((d) => base - ys(d)).curve(d3.curveBasis), l = d3.line().x((d, j) => xs(pts[j])).y((d) => base - ys(d)).curve(d3.curveBasis);
      svg.append('path').attr('d', a(mod)).attr('fill', mix(k.P, t.surface, .12 + .05 * i)).attr('fill-opacity', .92).attr('stroke', t.surface).attr('stroke-width', 1.5);
      svg.append('path').attr('d', l(obs)).attr('fill', 'none').attr('stroke', t.ink).attr('stroke-dasharray', '3 3').attr('stroke-width', 1.3).attr('opacity', .8);
      svg.append('text').attr('x', ml - 10).attr('y', base - 4).attr('text-anchor', 'end').attr('fill', t.ink).text(p);
      labels.push([xs(kk * th * adj), base + 12, f1(kk * th * adj) + ' mi avg']); });
    labels.forEach(([x, y, tx]) => svg.append('text').attr('x', x).attr('y', y).attr('text-anchor', 'middle').attr('fill', t.ink).attr('stroke', t.surface).attr('stroke-width', 3).attr('paint-order', 'stroke').attr('font-size', 10.5).style('display', rowH > 46 ? null : 'none').text(tx));
  }

  function pyramid(el, c, w, h) {
    const t = WF.tok(), k = K(), rows = pyr();
    const long = rows.flatMap((d) => [{ age: d.age, sex: 'Male', v: -d.mm, o: -d.om }, { age: d.age, sex: 'Female', v: d.mf, o: d.of }]);
    const plot = Plot.plot({ width: w, height: h, marginLeft: 44, marginBottom: 26, marginTop: 6, marginRight: 6, style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: '11.5px', overflow: 'visible' },
      x: { label: null, grid: false, tickFormat: (d) => Math.abs(d) + 'k', ticks: 6 }, y: { label: null, domain: AGES, padding: .22 }, color: { domain: ['Male', 'Female'], range: [k.P, k.S] },
      marks: [Plot.barX(long, { x: 'v', y: 'age', fill: 'sex', rx: 3, title: (d, i) => 'wfa:' + i }), Plot.tickX(long, { x: 'o', y: 'age', stroke: t.ink, strokeWidth: 1.6, strokeOpacity: .85 }), Plot.ruleX([0], { stroke: t.line })] });
    WF.TT.arm(plot, { a: long }, (d) => ({ title: 'Age ' + d.age, rows: [{ k: d.sex, v: Math.abs(Math.round(d.v)) + 'k', c: d.sex === 'Male' ? k.P : k.S, b: true }, { k: 'Census estimate', v: Math.abs(Math.round(d.o)) + 'k' }, { k: 'Difference', v: (Math.abs(d.v) - Math.abs(d.o) >= 0 ? '+' : '−') + Math.abs(Math.round(Math.abs(d.v) - Math.abs(d.o))) + 'k' }] }));
    el.replaceChildren(plot);
  }

  function waffle(el, c, w, h) {
    const t = WF.tok(), k = K(), svg = svgRoot(el, w, h), tp = tipper(el), sh = autoAll(c.focus), cols = k.ramp(k.S, 5, .8);
    let counts = sh.map(Math.floor), rem = 100 - d3.sum(counts); sh.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).slice(0, rem).forEach(([, i]) => counts[i]++);
    const cells = []; let idx = 0; counts.forEach((n, j) => { for (let q = 0; q < n; q++) cells.push(j); });
    const size = Math.min(h - 8, w * (w > 380 ? .5 : 1) - 4), cs = size / 10, ox = w > 380 ? 4 : (w - size) / 2;
    const gg = svg.append('g').attr('transform', `translate(${ox},${(h - size) / 2})`);
    const rect = gg.selectAll('rect').data(cells).join('rect').attr('x', (d, i) => (i % 10) * cs + 1.5).attr('y', (d, i) => (9 - Math.floor(i / 10)) * cs + 1.5).attr('width', cs - 3).attr('height', cs - 3).attr('rx', Math.max(2, cs * .2)).attr('data-key', (d) => AUTOS[d]).attr('data-title', (d) => AUTOS[d]).attr('data-val', (d) => f1(sh[d]) + '%').attr('data-num', (d) => sh[d]).attr('data-unit', ' pts').attr('fill', (d) => cols[d]);
    const hl = (j) => rect.attr('opacity', (d) => (j == null || d === j ? 1 : .18));
    rect.on('mouseenter', (e, d) => hl(d)).on('mouseleave', () => hl(null)).on('mousemove', (e, d) => tp.show(tipRow(AUTOS[d], [{ k: 'Households', v: f1(sh[d]) + '%', b: true, c: cols[d] }, `Count: ${Math.round(sh[d] / 100 * d3.sum(HHK))}k`]), e));
    if (w > 380) { const x0 = size + 40, rh = Math.min(40, (h - 20) / 5), L = svg.append('g').attr('transform', `translate(${x0},${(h - rh * 5) / 2})`);
      AUTOS.forEach((a, j) => { const r = L.append('g').attr('transform', `translate(0,${j * rh})`).style('cursor', 'default'); r.append('rect').attr('width', 14).attr('height', 14).attr('y', rh / 2 - 7).attr('rx', 4).attr('fill', cols[j]);
        r.append('text').attr('x', 24).attr('y', rh / 2).attr('dy', '.35em').attr('fill', t.ink).text(a); r.append('text').attr('x', Math.min(260, w - x0 - 4)).attr('y', rh / 2).attr('dy', '.35em').attr('text-anchor', 'end').attr('fill', t.ink).attr('font-weight', 600).text(f1(sh[j]) + '%');
        r.on('mouseenter', () => hl(j)).on('mouseleave', () => hl(null)); });
      svg.append('text').attr('x', x0).attr('y', (h - rh * 5) / 2 - 10).attr('fill', t.mute).attr('font-size', 11.5).text('Each square is 1% of ' + Math.round(d3.sum(HHK)) + 'k households'); }
  }

  function heat(el, c, w, h, kind) {
    const t = WF.tok(), k = K();
    if (kind === 'speed') {
      const rows = FWY.flatMap((f, i) => d3.range(24).map((hr) => ({ hour: hr, fac: f, v: speed(c.focus, i, hr) })));
      const plot = Plot.plot({ width: w, height: h, marginLeft: 70, marginBottom: 26, marginTop: 4, marginRight: 6, style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: '11.5px', overflow: 'visible' },
        x: { label: null, domain: d3.range(24), tickFormat: (d) => (d % 3 ? '' : (d % 12 || 12) + (d < 12 ? 'a' : 'p')), padding: .08 }, y: { label: null, domain: FWY, padding: .12 }, color: { type: 'linear', range: [k.P, mix(t.surface, k.P, .12)], domain: [10, 62], legend: false },
        marks: [Plot.cell(rows, { x: 'hour', y: 'fac', fill: 'v', rx: 4, title: (d, i) => 'wfa:' + i })] });
      WF.TT.arm(plot, { a: rows }, (d) => ({ title: d.fac, sub: ((h) => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'))(d.hour), rows: [{ k: 'Average speed', v: d.v.toFixed(0) + ' mph', b: true }] }));
      el.replaceChildren(plot); return;
    }
    const rows = PURP.flatMap((p) => { const s = d3.sum(d3.range(24), (hr) => purTod(p, hr)); return d3.range(24).map((hr) => ({ hour: hr, purpose: p, v: purTod(p, hr) / s * 100 })); });
    const plot = Plot.plot({ width: w, height: h, marginLeft: 76, marginBottom: 26, marginTop: 4, marginRight: 6, style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: '11.5px', overflow: 'visible' },
      x: { label: null, domain: d3.range(24), tickFormat: (d) => (d % 3 ? '' : (d % 12 || 12) + (d < 12 ? 'a' : 'p')), padding: .08 }, y: { label: null, domain: PURP, padding: .12 }, color: { type: 'sqrt', range: [mix(t.surface, k.P, .1), k.P], domain: [0, 16] },
      marks: [Plot.cell(rows, { x: 'hour', y: 'purpose', fill: 'v', rx: 4, title: (d, i) => 'wfa:' + i })] });
    WF.TT.arm(plot, { a: rows }, (d) => ({ title: d.purpose, sub: ((h) => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'))(d.hour), rows: [{ k: 'Share of purpose trips', v: d.v.toFixed(1) + '%', b: true }] }));
    el.replaceChildren(plot);
  }

  function stream(el, c, w, h) {
    const t = WF.tok(), k = K(), rows = modeHour(c.focus);
    const plot = Plot.plot({ width: w, height: h, marginLeft: 8, marginBottom: 26, marginTop: 6, marginRight: 8, style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: '11.5px', overflow: 'visible' },
      x: { label: null, domain: [0, 23], ticks: [0, 3, 6, 9, 12, 15, 18, 21], tickFormat: (d) => (d % 12 || 12) + (d < 12 ? 'a' : 'p') }, y: { axis: null }, color: { domain: MODES, range: MODES.map((m) => k.mode[m]) },
      marks: [Plot.areaY(rows, { x: 'hour', y: 'v', z: 'mode', fill: 'mode', curve: 'basis', offset: 'wiggle', order: 'inside-out', stroke: t.surface, strokeWidth: .8, tip: { fill: t.surface, stroke: t.line, fontFamily: t.font } })] });
    el.replaceChildren(plot);
  }

  function slope(el, c, w, h) {
    const t = WF.tok(), k = K(), a = 'Observed', b = c.focus === 'Observed' ? 'Baseline' : c.focus;
    const rows = MODES.flatMap((m, j) => [{ x: a, mode: m, v: SHARE.Observed[j] }, { x: b, mode: m, v: SHARE[b][j] }]);
    const plot = Plot.plot({ width: w, height: h, marginLeft: 120, marginRight: 120, marginTop: 14, marginBottom: 8, style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: '12px', overflow: 'visible' },
      x: { label: null, domain: [a, b], axis: 'top', tickSize: 0, padding: 0 }, y: { type: 'log', axis: null, domain: [.8, 90] }, color: { domain: MODES, range: MODES.map((m) => k.mode[m]) },
      marks: [Plot.line(rows, { x: 'x', y: 'v', z: 'mode', stroke: 'mode', strokeWidth: 3, strokeLinecap: 'round' }), Plot.dot(rows, { x: 'x', y: 'v', fill: 'mode', stroke: t.surface, strokeWidth: 2, r: 5.5, title: (d, i) => 'wfa:' + i }),
        Plot.text(rows.filter((d) => d.x === a), { x: 'x', y: 'v', text: (d) => `${d.mode}  ${f1(d.v)}%`, textAnchor: 'end', dx: -12, fill: t.ink }), Plot.text(rows.filter((d) => d.x === b), { x: 'x', y: 'v', text: (d) => `${f1(d.v)}%  ${d.mode}`, textAnchor: 'start', dx: 12, fill: t.ink })] });
    WF.TT.arm(plot, { a: rows }, (d) => ({ title: d.mode, swatch: k.mode[d.mode], rows: [{ k: d.x, v: f1(d.v) + '%', b: true }, { k: d.x === a ? b : a, v: f1(rows.find((q) => q.mode === d.mode && q.x !== d.x).v) + '%' }] }));
    el.replaceChildren(plot);
  }

  function dumbbell(el, c, w, h, kind) {
    const t = WF.tok(), ids = SC.filter((s) => c.active.has(s)), tkn = t.c;
    let rows, unit, dom, label;
    if (kind === 'boards') { unit = 'k'; label = 'Weekday boardings (thousand)'; rows = LINES.map((n, i) => ({ label: n, obs: BOARD.Observed[i], v: Object.fromEntries(SC.map((s) => [s, BOARD[s][i]])) })); }
    else { unit = '%'; label = 'Households with no car (%)'; rows = INC.map((n, i) => ({ label: n, obs: autoRow('Observed', i)[0], v: Object.fromEntries(SC.map((s) => [s, autoRow(s, i)[0]])) })); }
    const flat = rows.flatMap((r) => ids.map((s) => ({ label: r.label, sc: s, v: r.v[s] }))), seg = rows.map((r) => ({ label: r.label, a: Math.min(r.obs, ...ids.map((s) => r.v[s])), b: Math.max(r.obs, ...ids.map((s) => r.v[s])) }));
    const plot = Plot.plot({ width: w, height: h, marginLeft: kind === 'boards' ? 118 : 100, marginBottom: 32, marginTop: 6, marginRight: 14, style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: '12px', overflow: 'visible' },
      x: { label, labelAnchor: 'center', grid: false, tickFormat: (d) => d + (unit === '%' ? '%' : ''), nice: true }, y: { label: null, domain: rows.map((r) => r.label), padding: .6 }, color: { domain: ids, range: ids.map((s) => tkn[s]) },
      marks: [Plot.ruleY(rows, { y: 'label', stroke: t.grid, strokeOpacity: 1 }), Plot.link(seg, { x1: 'a', x2: 'b', y1: 'label', y2: 'label', stroke: t.line, strokeWidth: 5, strokeLinecap: 'round' }),
        Plot.dot(flat, { x: 'v', y: 'label', fill: 'sc', r: 6, stroke: t.surface, strokeWidth: 2, title: (d, i) => 'wfa:' + i }),
        Plot.dot(rows, { x: 'obs', y: 'label', r: 7.5, fill: t.surface, stroke: t.ink, strokeWidth: 2.2, title: (d, i) => 'wfb:' + i })] });
    const fv = (v) => v.toFixed(unit === '%' ? 1 : 0) + (unit === '%' ? '%' : 'k');
    WF.TT.arm(plot, { a: flat, b: rows }, (d, kk) => { if (kk === 'b') return { title: d.label, rows: [{ k: 'Observed', v: fv(d.obs), b: true }] }; const o = rows.find((r) => r.label === d.label).obs, row = flat.filter((q) => q.label === d.label).sort((a, b) => b.v - a.v), meta = kind === 'boards' ? SCN.OBS.boards : SCN.OBS.auto; return { title: d.label, sub: kind === 'boards' ? 'weekday boardings' : 'households with no car', rows: row.map((q) => { const df = q.v - o; return { k: WF.L(q.sc), v: fv(q.v), c: tkn[q.sc], b: q.sc === d.sc, d: (df >= 0 ? '+' : '−') + Math.abs(df).toFixed(unit === '%' ? 1 : 0) + (unit === '%' ? ' pts' : 'k'), dc: 'var(--mute)' }; }).concat([{ k: 'Observed', v: fv(o), b: true }]), foot: 'Observed: ' + meta.src + ', ' + meta.n }; });
    el.replaceChildren(plot);
  }

  function htmlTable(el, head, rows) {
    el.innerHTML = `<div style="overflow:auto;height:100%"><table class="tbl"><thead><tr>${head.map((x, i) => `<th class="${i ? 'num' : ''}">${x}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x, i) => `<td class="${i ? 'num' : ''}">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function modeTbl(el, c) {
    const ids = SC.filter((s) => c.active.has(s));
    htmlTable(el, ['Mode', 'Observed', ...ids], MODES.map((m, i) => [m, f1(SHARE.Observed[i]) + '%', ...ids.map((s) => { const d = SHARE[s][i] - SHARE.Observed[i]; const col = Math.abs(d) <= 1 ? 'var(--ok)' : Math.abs(d) <= 2.5 ? 'var(--warn)' : 'var(--fail)'; return `${f1(SHARE[s][i])}% <span style="color:${col}">${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}</span>`; })]));
  }
  function calTbl(el, c) {
    const ids = (c ? SC.filter((s) => c.active.has(s)) : []).slice(0, 6), cols = ids.length ? ids : [(c && c.focus) || 'Baseline'];
    el.innerHTML = `<div style="overflow:auto;height:100%"><table class="tbl"><thead><tr><th>Submodel</th>${cols.map((s) => `<th class="num">${WF.L(s)}</th>`).join('')}</tr></thead><tbody>${WF.CAL.map(([n, m], i) => `<tr><td>${n}<div style="color:var(--mute);font-size:12px">${m}</div></td>${cols.map((s) => { const e = SCN.CALR(s)[i], st = WF.status(e); return `<td class="num"><span class="pill ${st}">${f1(e)}%</span></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* legends */
  WF.modeLegend = () => { const k = K(); return MODES.map((m) => `<span class="lg mlg" data-lm="${m}"><i style="background:${k.mode[m]}"></i>${m}</span>`).join(''); };

  WF.U = { svgRoot, tipper, mix, onC, fmtK, f1, tipRow, hex };
  WF.CH = { treemap, sunburst, sankey, donut, stacked, stackedTrips, stackedInc, stackedAuto, radar, chord, ridge, pyramid, waffle, heat, stream, slope, dumbbell, modeTbl, calTbl, htmlTable };
})();
