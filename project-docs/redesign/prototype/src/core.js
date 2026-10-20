/* WFRC prototype core: sample data + Observable Plot / D3 chart builders.
   All visual styling comes from CSS tokens read live from :root. */
(function () {
  const SC = SCN.SC, SHARE = SCN.SHARE;
  const MODES = ['Drive alone', 'Shared ride', 'Transit', 'Walk', 'Bike', 'School bus'];
  const CAL = [
    ['Auto ownership', 'Households by vehicles', 1.4],
    ['Coordinated daily activity pattern', 'Persons by pattern', 2.2],
    ['Work location', 'Mean commute distance', 2.6],
    ['School location', 'Mean school distance', 3.9],
    ['Tour mode choice', 'Tours by mode', 1.7],
    ['Tour scheduling', 'Departure by hour', 4.6],
    ['Stop frequency', 'Stops per tour', 5.8],
    ['Trip mode choice', 'Trips by mode', 2.9],
  ];
  const status = (e) => (e <= 3 ? 'ok' : e <= 5 ? 'warn' : 'fail');
  const STATUS_LABEL = { ok: 'Within 3%', warn: 'Review', fail: 'Off target' };

  /* seeded RNG */
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* time of day */
  function tod(sc) {
    const P = { Observed: [7.5, 1, 12.5, 0.62, 16.8, 1.05], Baseline: [7.7, 1.08, 12.4, 0.6, 16.9, 1.0], 'Frequent transit': [7.6, 1.03, 12.5, 0.62, 16.8, 0.99], 'Infill density': [7.5, 0.99, 12.6, 0.64, 16.7, 1.04] };
    const fx = SCN.TODFX[sc] || {}, p = (P[sc] || P.Baseline).slice();
    p[1] *= fx.am || 1; p[3] *= fx.mid || 1; p[5] *= fx.pm || 1;
    const g = (h, m, s) => Math.exp(-0.5 * ((h - m) / s) ** 2);
    const raw = d3.range(24).map((h) => p[1] * g(h, p[0], 1.3) + p[3] * g(h, p[2], 2.6) + p[5] * g(h, p[4], 1.7) + 0.35 * g(h, 21, 2.6) + 0.06);
    const sum = d3.sum(raw);
    return raw.map((v, h) => ({ sc, hour: h, share: (v / sum) * 100 }));
  }

  /* synthetic zones (stand-in for TAZ geometry; the real app draws GeoParquet on MapLibre) */
  const W = 900, H = 560;
  const r = rng(11);
  const pts = d3.range(190).map(() => { const a = r() * 6.283, rad = Math.pow(r(), 0.8) * 0.5; return [W * (0.5 + Math.cos(a) * rad * 0.95 + (r() - 0.5) * 0.06), H * (0.5 + Math.sin(a) * rad * 0.95 + (r() - 0.5) * 0.06)]; });
  const vor = d3.Delaunay.from(pts).voronoi([10, 10, W - 10, H - 10]);
  const CORE = [W * 0.46, H * 0.5];
  const distCore = (p) => Math.hypot(p[0] - CORE[0], p[1] - CORE[1]);
  // rail corridor: a gentle diagonal polyline
  const RAIL = [[120, 470], [250, 410], [380, 340], [460, 285], [540, 235], [660, 170], [790, 110]];
  const distRail = (p) => d3.min(RAIL.slice(1).map((b, i) => { const a = RAIL[i]; const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); }));
  const noise = pts.map(() => (r() - 0.5) * 1.2);
  function zoneVal(i, sc) {
    const dc = distCore(pts[i]), dr = distRail(pts[i]);
    let v = 0.4 + 7.5 * Math.exp(-dc / 130) + noise[i];
    const z = SCN.ZFX[sc] || [0, 0]; v += z[0] * Math.exp(-dr / 55) + z[1] * Math.exp(-dc / 160);
    return Math.max(0, v);
  }
  const ZONES = pts.map((p, i) => ({ id: 1000 + i * 7, i, cell: vor.renderCell(i), pop: Math.round(1800 + 5200 * Math.exp(-distCore(p) / 200) + 400 * noise[i]) }));

  /* tokens */
  function tok() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    return { ink: g('--ink'), mute: g('--mute'), grid: g('--grid'), surface: g('--surface'), bg: g('--bg'), line: g('--line'),
      font: g('--font'), fs: parseFloat(g('--chart-fs')) || 12, r: parseFloat(g('--chart-r')) || 3,
      obs: g('--c-obs'), c: Object.fromEntries(SC.map((s) => [s, scColor(s)])),
      ok: g('--ok'), warn: g('--warn'), fail: g('--fail'), primary: g('--c-1') };
  }
  const tipOpt = (t) => ({ fill: t.surface, stroke: t.line, fontFamily: t.font, fontSize: t.fs });
  const base = (t, w, h, o) => Object.assign({ width: w, height: h, style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: t.fs + 'px', overflow: 'visible' } }, o);

  function modeBars(el, active, w, h) {
    const t = tok(); const ids = SC.filter((s) => active.has(s));
    const rows = []; ids.forEach((s) => MODES.forEach((m, i) => rows.push({ mode: m, sc: s, share: SHARE[s][i] })));
    const obs = MODES.map((m, i) => ({ mode: m, share: SHARE.Observed[i] }));
    const plot = Plot.plot(base(t, w, h, {
      marginLeft: 36, marginBottom: 30, marginTop: 14, marginRight: 4,
      fx: { label: null, padding: 0.14, domain: MODES }, x: { axis: null, domain: ids, paddingInner: 0.1, paddingOuter: 0.08 },
      y: { label: null, grid: true, tickFormat: (d) => d + '%', ticks: 5 },
      color: { domain: ids, range: ids.map((s) => t.c[s]) },
      marks: [Plot.gridY({ stroke: t.grid, strokeOpacity: 1 }),
        Plot.barY(rows, { fx: 'mode', x: 'sc', y: 'share', fill: 'sc', rx: t.r, insetBottom: 0, tip: tipOpt(t), channels: {} }),
        Plot.ruleY(obs, { fx: 'mode', y: 'share', stroke: t.ink, strokeWidth: 1.6, strokeDasharray: '4 3' }),
        Plot.ruleY([0], { stroke: t.line })],
    }));
    el.replaceChildren(plot);
  }

  function gapDots(el, active, w, h) {
    const t = tok(); const ids = SC.filter((s) => active.has(s));
    const rows = []; ids.forEach((s) => MODES.forEach((m, i) => rows.push({ mode: m, sc: s, gap: +(SHARE[s][i] - SHARE.Observed[i]).toFixed(1) })));
    const plot = Plot.plot(base(t, w, h, {
      marginLeft: 82, marginBottom: 34, marginTop: 8, marginRight: 14,
      x: { domain: [-4, 4], grid: false, label: 'Percentage points vs observed', labelAnchor: 'center', labelArrow: 'none', tickFormat: (d) => (d > 0 ? '+' : '') + d, ticks: 8 },
      y: { label: null, domain: MODES, padding: 0.5 },
      color: { domain: ids, range: ids.map((s) => t.c[s]) },
      marks: [Plot.rectX([{ a: -1, b: 1 }], { x1: 'a', x2: 'b', fill: t.ok, fillOpacity: 0.12 }),
        Plot.ruleY(MODES, { stroke: t.grid, strokeOpacity: 1 }),
        Plot.ruleX([0], { stroke: t.ink, strokeOpacity: 0.55 }),
        Plot.dot(rows, { x: 'gap', y: 'mode', fill: 'sc', r: 5.5, stroke: t.surface, strokeWidth: 2, tip: tipOpt(t) })],
    }));
    el.replaceChildren(plot);
  }

  function todLine(el, active, w, h) {
    const t = tok(); const ids = SC.filter((s) => active.has(s));
    const rows = ids.flatMap(tod); const obs = tod('Observed');
    const plot = Plot.plot(base(t, w, h, {
      marginLeft: 36, marginBottom: 30, marginTop: 10, marginRight: 8,
      x: { label: null, domain: [0, 23], ticks: [0, 3, 6, 9, 12, 15, 18, 21], tickFormat: (d) => (d % 12 || 12) + (d < 12 ? 'a' : 'p') },
      y: { label: null, grid: true, tickFormat: (d) => d + '%', ticks: 4 },
      color: { domain: ids, range: ids.map((s) => t.c[s]) },
      marks: [Plot.gridY({ stroke: t.grid, strokeOpacity: 1 }),
        Plot.areaY(obs, { x: 'hour', y: 'share', fill: t.ink, fillOpacity: 0.06, curve: 'catmull-rom' }),
        Plot.line(obs, { x: 'hour', y: 'share', stroke: t.ink, strokeWidth: 1.5, strokeDasharray: '4 3', curve: 'catmull-rom' }),
        Plot.line(rows, { x: 'hour', y: 'share', stroke: 'sc', strokeWidth: 2.25, curve: 'catmull-rom', strokeLinecap: 'round' }),
        Plot.ruleX(rows, Plot.pointerX({ x: 'hour', stroke: t.line })),
        Plot.dot(rows, Plot.pointerX({ x: 'hour', y: 'share', fill: 'sc', stroke: t.surface, strokeWidth: 2, r: 4.5 })),
        Plot.tip(rows, Plot.pointerX({ x: 'hour', y: 'share', ...tipOpt(t), format: { y: (d) => d.toFixed(1) + '%', x: (d) => (d % 12 || 12) + (d < 12 ? ' AM' : ' PM') } }))],
    }));
    el.replaceChildren(plot);
  }

  /* zone map: d3 zoom + sequential scale from surface -> primary */
  const MS = { r: {}, t: {} };
  const mapSync = { start(g) { MS.r[g] = []; }, zoomBy(g, k) { const f = (MS.r[g] || [])[0]; if (f) f.svg.transition().duration(250).call(f.zoom.scaleBy, k); }, reset(g) { const f = (MS.r[g] || [])[0]; if (f) f.svg.transition().duration(300).call(f.zoom.transform, d3.zoomIdentity); } };
  function zoneMap(el, sc, opts) {
    opts = opts || {}; const t = tok();
    const vals = ZONES.map((z) => zoneVal(z.i, sc));
    const max = 14;
    const color = d3.scaleSequential(d3.interpolateRgb(opts.lo || t.surface, opts.hi || t.primary)).domain([0, max]);
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid slice').style('width', '100%').style('height', '100%').style('display', 'block').style('touch-action', 'none');
    el.style.background = curBM().land || ''; const g = svg.append('g'); baseLayer(g);
    const paths = g.selectAll('path.z').data(ZONES).join('path').attr('class', 'z').attr('d', (z) => z.cell).attr('fill', (z, i) => color(vals[i])).attr('fill-opacity', baseAlpha()).attr('data-key', (z) => z.id).attr('data-title', (z) => 'TAZ ' + z.id).attr('data-val', (z, i) => vals[i].toFixed(1) + '%').attr('data-num', (z, i) => vals[i]).attr('data-unit', ' pts').attr('stroke', opts.stroke || t.line).attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke').style('cursor', 'pointer');
    g.append('path').attr('d', d3.line().curve(d3.curveCatmullRom.alpha(0.5))(RAIL)).attr('fill', 'none').attr('stroke', t.ink).attr('stroke-width', 2.2).attr('stroke-dasharray', '1 0').attr('vector-effect', 'non-scaling-stroke').attr('opacity', 0.85).style('pointer-events', 'none');
    g.selectAll('circle.st').data(RAIL).join('circle').attr('r', 4).attr('cx', (d) => d[0]).attr('cy', (d) => d[1]).attr('fill', t.surface).attr('stroke', t.ink).attr('stroke-width', 2).attr('vector-effect', 'non-scaling-stroke').style('pointer-events', 'none');
    const me = { svg, silent: false }, grp = opts.syncGroup;
    const zoom = d3.zoom().scaleExtent([1, 8]).on('zoom', (e) => { g.attr('transform', e.transform); if (grp) { MS.t[grp] = e.transform; if (!me.silent) (MS.r[grp] || []).forEach((o) => { if (o !== me) { o.silent = true; o.svg.call(o.zoom.transform, e.transform); o.silent = false; } }); } });
    me.zoom = zoom; svg.call(zoom);
    if (grp) { (MS.r[grp] = MS.r[grp] || []).push(me); if (MS.t[grp]) { me.silent = true; svg.call(zoom.transform, MS.t[grp]); me.silent = false; } }
    let sel = null;
    paths.on('mousemove', function (e, z) {
      WF.TT.show({ title: 'TAZ ' + z.id, rows: [{ k: 'Transit share', v: vals[z.i].toFixed(1) + '%', c: color(vals[z.i]), b: true }, { k: 'Residents', v: z.pop.toLocaleString() }] }, e);
      d3.select(this).attr('stroke', t.ink).attr('stroke-width', 1.4).raise();
    }).on('mouseleave', function (e, z) { WF.TT.hide(); if (sel !== z) d3.select(this).attr('stroke', opts.stroke || t.line).attr('stroke-width', 0.6); })
      .on('click', function (e, z) { sel = z; paths.attr('stroke', (d) => (d === z ? t.ink : opts.stroke || t.line)).attr('stroke-width', (d) => (d === z ? 2 : 0.6)); d3.select(this).raise(); if (opts.onSelect) opts.onSelect({ id: z.id, pop: z.pop, v: vals[z.i] }); });
    return { zoom: (k) => svg.transition().duration(250).call(zoom.scaleBy, k), reset: () => svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity), mean: d3.sum(ZONES.map((z, i) => vals[i] * z.pop)) / d3.sum(ZONES.map((z) => z.pop)), max };
  }

  /* scenario identity: stable default colour per scenario, viewer overrides for colour and label, colour-blind-safe alternative */
  const over = {}; let safe = false;
  const lab = (s) => (over[s] && over[s].label) || s;
  const defColor = (s) => { const P = safe ? SCN.SAFE : SCN.PAL; return P[SCN.IDX[s] % P.length]; };
  function scColor(s) {
    if (over[s] && over[s].color) return over[s].color;
    const rd = SCN.ROUND[s]; if (rd) { const cs = getComputedStyle(document.documentElement), P = cs.getPropertyValue('--c-1').trim(), sf = cs.getPropertyValue('--surface').trim(); return d3.color(d3.interpolateRgb(d3.interpolateRgb(sf, P)(isDark() ? .55 : .4), P)((rd - 1) / 49)).formatHex(); }
    const h = d3.hcl(defColor(s)); h.l = isDark() ? Math.max(h.l, 62) : Math.min(h.l, 60); return h.formatHex();
  }
  function assign() {}
  function palette() { const cs = getComputedStyle(document.documentElement), a = [1, 2, 3].map((i) => cs.getPropertyValue('--c-' + i).trim());
    return [...a, ...a.map((c) => { const h = d3.hcl(c); return d3.hcl((h.h + 40) % 360, h.c * .8, h.l > 55 ? h.l - 15 : h.l + 17).formatHex(); })]; }
  function legendHTML(active, ref) {
    const t = tok(), on = SC.filter((s) => active.has(s));
    return on.map((s) => `<span class="lg sclg" data-sc="${s}"><i style="background:${t.c[s]}"></i>${lab(s)}</span>`).join('') + `<span class="lg"><i class="dash"></i>${ref && ref !== 'Observed' ? 'Reference: ' + lab(ref) : 'Observed'}</span>`;
  }

  /* basemap stand-ins: stylised land, water, parks and streets drawn under the zones (the product draws real tiles on MapLibre) */
  const BM = [
    { id: 'theme', name: 'Zones only', group: 'Default', none: true },
    { id: 'ugrc-light', name: 'UGRC Light', group: 'UGRC Vector Tiles', land: '#ECEAE2', water: '#BDD6E8', road: '#C8C3B3', park: '#D3E1C4' },
    { id: 'ugrc-dark', name: 'UGRC Dark', group: 'UGRC Vector Tiles', land: '#22262D', water: '#193349', road: '#393F49', park: '#29392D', dark: true },
    { id: 'ugrc-terrain', name: 'UGRC Terrain', group: 'UGRC Vector Tiles', land: '#E3DECE', water: '#B4CFE3', road: '#BBB39D', park: '#C9DCB2', relief: true },
    { id: 'carto-positron', name: 'Positron', group: 'CARTO Vector Tiles', land: '#F1F1EF', water: '#D3D9DC', road: '#DCDCDC', park: '#E2EADC' },
    { id: 'carto-dark', name: 'Dark Matter', group: 'CARTO Vector Tiles', land: '#1D1E23', water: '#13171E', road: '#2C2E35', park: '#1E2521', dark: true },
    { id: 'carto-voyager', name: 'Voyager', group: 'CARTO Vector Tiles', land: '#F2EEE5', water: '#A9D2DE', road: '#E2DBCA', park: '#C7E5BF' },
    { id: 'ofm-liberty', name: 'Liberty', group: 'OpenFreeMap', land: '#EEECE3', water: '#A4CBE3', road: '#D8D3C3', park: '#CEE5B7' },
    { id: 'ofm-bright', name: 'Bright', group: 'OpenFreeMap', land: '#F4F2ED', water: '#9ECFE7', road: '#DFD7C5', park: '#C4E4AD' },
    { id: 'ofm-positron', name: 'Positron', group: 'OpenFreeMap', land: '#F0F0EE', water: '#D1D8DB', road: '#DADADA', park: '#E1E9DB' },
    { id: 'pm-light', name: 'Light', group: 'Protomaps', land: '#F2F0EB', water: '#CEDFEA', road: '#E0DCD1', park: '#DBE6D2', needsSource: true },
    { id: 'pm-dark', name: 'Dark', group: 'Protomaps', land: '#1A1C21', water: '#12253A', road: '#2F333A', park: '#202923', dark: true, needsSource: true },
    { id: 'pm-grayscale', name: 'Grayscale', group: 'Protomaps', land: '#E5E5E5', water: '#C8CDD0', road: '#D1D1D1', park: '#D9DCD7', needsSource: true },
    { id: 'r-osm', name: 'OpenStreetMap Standard', group: 'Raster Tiles', land: '#F2EFE9', water: '#AAD3DF', road: '#E5D7BD', park: '#B7DAA8', raster: true },
    { id: 'r-esri-sat', name: 'Esri World Imagery', group: 'Raster Tiles', land: '#49593B', water: '#1E3A50', road: '#7C7660', park: '#33502E', dark: true, raster: true, sat: true },
    { id: 'r-esri-topo', name: 'Esri World Topographic', group: 'Raster Tiles', land: '#EAE6D6', water: '#A8CCE0', road: '#CFC6A8', park: '#C3DAA8', raster: true, relief: true },
  ];
  let bmId = 'theme';
  const curBM = () => { const b = BM.find((x) => x.id === bmId) || BM[0]; return b.needsSource ? { ...BM[0], blocked: b } : b; };
  function baseLayer(g, b) {
    b = b || curBM(); if (b.none) return;
    const rr = rng(5);
    g.append('rect').attr('x', -500).attr('y', -400).attr('width', W + 1000).attr('height', H + 800).attr('fill', b.land);
    if (b.relief) for (let i = 0; i < 26; i++) g.append('ellipse').attr('cx', rr() * W).attr('cy', rr() * H).attr('rx', 40 + rr() * 90).attr('ry', 20 + rr() * 50).attr('fill', b.road).attr('opacity', .16);
    if (b.sat) for (let i = 0; i < 90; i++) g.append('ellipse').attr('cx', rr() * W).attr('cy', rr() * H).attr('rx', 10 + rr() * 50).attr('ry', 8 + rr() * 30).attr('fill', rr() > .5 ? b.park : '#5E5A45').attr('opacity', .45);
    g.append('path').attr('d', 'M-60 60 C80 20 140 110 120 210 C100 310 150 380 60 440 C-20 490 -80 420 -90 300 Z').attr('fill', b.water);
    g.append('path').attr('d', 'M520 -40 C560 60 640 90 700 150 C770 215 860 220 980 200 L980 240 C850 270 740 270 660 200 C600 140 520 100 480 -40 Z').attr('fill', b.water).attr('opacity', .85);
    [[300, 120, 70, 44], [610, 410, 90, 50], [220, 470, 60, 34], [780, 330, 50, 36], [450, 60, 46, 26]].forEach(([x, y, rx, ry]) => g.append('ellipse').attr('cx', x).attr('cy', y).attr('rx', rx).attr('ry', ry).attr('fill', b.park));
    if (!b.sat) {
      const gl = g.append('g').attr('stroke', b.road).attr('fill', 'none').attr('opacity', .9);
      for (let x = 0; x <= W; x += 34) gl.append('line').attr('x1', x).attr('x2', x + 12).attr('y1', 0).attr('y2', H).attr('stroke-width', .8).attr('vector-effect', 'non-scaling-stroke');
      for (let y = 0; y <= H; y += 28) gl.append('line').attr('x1', 0).attr('x2', W).attr('y1', y).attr('y2', y - 8).attr('stroke-width', .8).attr('vector-effect', 'non-scaling-stroke');
      [[0, 300, 900, 250], [180, 0, 330, 560], [560, 0, 640, 560]].forEach(([x1, y1, x2, y2]) => gl.append('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2).attr('stroke-width', 2.6).attr('vector-effect', 'non-scaling-stroke'));
    } else { g.append('path').attr('d', 'M0 300 L900 250 M180 0 L330 560').attr('stroke', b.road).attr('stroke-width', 1.4).attr('fill', 'none').attr('opacity', .6).attr('vector-effect', 'non-scaling-stroke'); }
  }
  const baseAlpha = () => (curBM().none ? 1 : .8);

  function calRows(sc) { const E = SCN.CALR(sc); return CAL.map(([n, m], i) => ({ name: n, metric: m, err: E[i], st: status(E[i]), label: STATUS_LABEL[status(E[i])] })); }

  /* three-colour theme editor; defaults restored by reset */
  function themeEditor(root, defaults, onChange, initial) {
    const keys = [['primary', 'Primary'], ['secondary', 'Secondary'], ['tertiary', 'Tertiary']];
    root.innerHTML = keys.map(([k, l]) => `<label class="te-row" for="te-${k}"><span>${l}</span><input type="color" id="te-${k}" value="${defaults[k]}"><code id="te-${k}-v">${defaults[k]}</code></label>`).join('') +
      `<div class="te-presets">${[['WFRC blue', '#2457D6', '#D98A00', '#7A4FD8'], ['Wasatch', '#0E7C7B', '#E4572E', '#5C6BC0'], ['Slate', '#334E68', '#E0A100', '#2F9E8F'], ['Plum', '#6D3FC8', '#0C8F6F', '#D9534F']].map(([n, a, b, c]) => `<button type="button" class="te-p" data-c="${a},${b},${c}" title="${n}"><i style="background:${a}"></i><i style="background:${b}"></i><i style="background:${c}"></i></button>`).join('')}<button type="button" class="te-reset">Reset</button></div>`;
    const set = (a, b, c) => { const d = document.documentElement.style; d.setProperty('--primary', a); d.setProperty('--secondary', b); d.setProperty('--tertiary', c); accents(); keys.forEach(([k], i) => { const v = [a, b, c][i]; root.querySelector('#te-' + k).value = v; root.querySelector('#te-' + k + '-v').textContent = v; }); onChange(); };
    keys.forEach(([k]) => root.querySelector('#te-' + k).addEventListener('input', () => set(...keys.map(([kk]) => root.querySelector('#te-' + kk).value))));
    root.querySelectorAll('.te-p').forEach((b) => b.addEventListener('click', () => set(...b.dataset.c.split(','))));
    root.querySelector('.te-reset').addEventListener('click', () => set(defaults.primary, defaults.secondary, defaults.tertiary));
    const i0 = initial || defaults; set(i0.primary, i0.secondary, i0.tertiary);
  }

  function isDark() { const t = document.documentElement.dataset.theme; if (t) return t === 'dark'; return window.WF && WF.darkFirst ? !matchMedia('(prefers-color-scheme: light)').matches : matchMedia('(prefers-color-scheme: dark)').matches; }
  function accents() { const cs = getComputedStyle(document.documentElement), d = document.documentElement.style, dark = isDark();
    ['primary', 'secondary', 'tertiary'].forEach((k, i) => { const v = cs.getPropertyValue('--' + k).trim(); const c = dark ? d3.interpolateRgb(v, '#ffffff')(0.28) : v; d.setProperty('--c-' + (i + 1), d3.color(c).formatHex()); });
    d.setProperty('--accent', d.getPropertyValue('--c-1')); }

  function sparkPath(vals, w, h) { const x = d3.scaleLinear([0, vals.length - 1], [1, w - 1]), y = d3.scaleLinear(d3.extent(vals), [h - 2, 2]); return d3.line().x((d, i) => x(i)).y((d) => y(d)).curve(d3.curveMonotoneX)(vals); }

  window.WF = { mapSync, assign, scColor, palette, scOver: over, setSafe(v) { safe = v; }, isSafe: () => safe, L: lab, BM, setBM(id) { bmId = id; }, getBM: curBM, bmId: () => bmId, baseLayer, baseAlpha, SC, MODES, SHARE, CAL, status, STATUS_LABEL, modeBars, gapDots, todLine, zoneMap, legendHTML, calRows, themeEditor, tok, sparkPath, tod, ZONES, zoneVal, RAIL, W, H,
    box(el) { const cs = getComputedStyle(el); return [Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), Math.floor(el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom))]; },
    watch(el, fn) { const ro = new ResizeObserver(() => { const [w, h] = WF.box(el); if (w > 20 && h > 20) fn(w, h); }); ro.observe(el); return fn; },
    setTheme(m) { document.documentElement.dataset.theme = m; accents(); }, accents, isDark };
})();
