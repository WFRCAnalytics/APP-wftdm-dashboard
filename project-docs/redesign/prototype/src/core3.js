/* core3: scenario comparison. Reference-aware charts, group-by data, difference and swipe maps, scorecard, ranked change. */
(function () {
  const WF = window.WF, D = WF.D, U = WF.U, MODES = WF.MODES, SHARE = WF.SHARE, SC = WF.SC, SCN = window.SCN;
  const { svgRoot, tipper, mix, onC, fmtK, f1, tipRow } = U, TT = WF.TT;
  const TRIPS = D.TRIPS, VMT = D.VMT, BOARD = D.BOARD, PURP = D.PURP, INC = D.INC;
  const on = (c) => SC.filter((s) => c.active.has(s));
  const ref = (c) => c.ref || 'Observed';
  const dv = (a, r, m) => (m === 'abs' ? a - r : m === 'pct' ? (r ? (a / r - 1) * 100 : 0) : a);
  const sgn = (v) => (v > 0.0049 ? '+' : v < -0.0049 ? '−' : '');
  const fD = (v, m, dec) => (m === 'val' ? v.toFixed(dec == null ? 1 : dec) : sgn(v) + Math.abs(v).toFixed(dec == null ? 1 : dec) + (m === 'pct' ? '%' : ''));
  const base = (t, w, h, o) => Object.assign({ width: w, height: h, style: { background: 'transparent', color: t.mute, fontFamily: t.font, fontSize: t.fs + 'px', overflow: 'visible' } }, o);
  const tipO = (t) => ({ fill: t.surface, stroke: t.line, fontFamily: t.font, fontSize: t.fs });
  const hourFmt = (d) => (d % 12 || 12) + (d < 12 ? 'a' : 'p');

  /* ---- metrics for scorecard and ranking ---- */
  const METRICS = [
    { k: 'trips', label: 'Daily trips', unit: 'M', dec: 2, get: (s) => TRIPS[s] },
    { k: 'drive', label: 'Drive-alone share', unit: '%', dec: 1, get: (s) => SHARE[s][0] },
    { k: 'transit', label: 'Transit share', unit: '%', dec: 1, get: (s) => SHARE[s][2] },
    { k: 'active', label: 'Walk and bike share', unit: '%', dec: 1, get: (s) => SHARE[s][3] + SHARE[s][4] },
    { k: 'vmt', label: 'Daily VMT', unit: 'M mi', dec: 1, get: (s) => VMT[s] },
    { k: 'boards', label: 'Transit boardings', unit: 'k', dec: 0, get: (s) => d3.sum(BOARD[s]) },
    { k: 'len', label: 'Average trip length', unit: 'mi', dec: 1, get: (s) => 7.6 * D.TLadj[s] },
  ];
  WF.METRICS = METRICS;

  /* ---- series for mode-share charts ---- */
  function modeSeries(c) {
    const k = WF.K(), g = c.group || 'scn';
    if (g === 'purpose') { const m = D.PM(c.focus); return { names: PURP, color: (n) => k.cat(PURP.indexOf(n)), val: (n, j) => { const i = PURP.indexOf(n); return m[i][j] / d3.sum(m[i]) * 100; }, ref: (j) => SHARE[c.focus][j], refName: 'Overall ' + c.focus, self: false }; }
    if (g === 'income') { const m = D.modeInc(c.focus), rp = k.ramp(k.P, 4, .55); return { names: INC, color: (n) => rp[INC.indexOf(n)], val: (n, j) => m[INC.indexOf(n)][j], ref: (j) => SHARE[c.focus][j], refName: 'Overall ' + c.focus, self: false }; }
    return { names: on(c), color: (n) => WF.scColor(n), val: (n, j) => SHARE[n][j], ref: (j) => SHARE[ref(c)][j], refName: ref(c), self: true };
  }

  function modeBars(el, c, w, h) {
    const t = WF.tok(), s = modeSeries(c), m = c.diff || 'val', names = s.names.filter((n) => !(s.self && m !== 'val' && n === ref(c)));
    if (!names.length) { el.innerHTML = '<div style="color:var(--mute);padding:20px">Pick a scenario other than the reference to see differences.</div>'; return; }
    const rows = names.flatMap((n) => MODES.map((mo, j) => ({ mode: mo, s: n, v: dv(s.val(n, j), s.ref(j), m) })));
    const rl = MODES.map((mo, j) => ({ mode: mo, v: s.ref(j) }));
    const yf = (d) => (m === 'val' ? d + '%' : sgn(d) + Math.abs(d) + (m === 'pct' ? '%' : ''));
    const plot = Plot.plot(base(t, w, h, {
      marginLeft: 40, marginBottom: 30, marginTop: 14, marginRight: 4,
      fx: { label: null, padding: 0.14, domain: MODES }, x: { axis: null, domain: names, paddingInner: 0.1, paddingOuter: 0.08 }, y: { label: null, grid: true, tickFormat: yf, ticks: 5 },
      color: { domain: names, range: names.map(s.color) },
      marks: [Plot.gridY({ stroke: t.grid, strokeOpacity: 1 }), Plot.barY(rows, { fx: 'mode', x: 's', y: 'v', fill: 's', rx: t.r, title: (d, i) => 'wfa:' + i }),
        m === 'val' && s.self && ref(c) === 'Observed' ? Plot.rect(MODES.map((mo, j) => ({ mode: mo, lo: s.ref(j) - SCN.OBS.share.moe[j], hi: s.ref(j) + SCN.OBS.share.moe[j] })), { fx: 'mode', y1: 'lo', y2: 'hi', fill: t.ink, fillOpacity: .12 }) : null,
        m === 'val' ? Plot.ruleY(rl, { fx: 'mode', y: 'v', stroke: t.ink, strokeWidth: 1.6, strokeDasharray: '4 3' }) : null, Plot.ruleY([0], { stroke: m === 'val' ? t.line : t.mute })].filter(Boolean),
    }));
    TT.arm(plot, { a: rows }, (d) => {
      const j = MODES.indexOf(d.mode), rv = s.ref(j), obs = s.self && ref(c) === 'Observed', moe = obs ? SCN.OBS.share.moe[j] : null;
      const all = names.map((n) => ({ n, val: s.val(n, j), v: dv(s.val(n, j), rv, m) })).sort((x, y) => y.val - x.val), shown = all.filter((q, i) => i < 8 || q.n === d.s), more = all.length - shown.length;
      return { title: d.mode, sub: m === 'val' ? 'share of trips' : m === 'abs' ? 'change in points' : 'percent change',
        rows: shown.map((q) => ({ k: WF.L(q.n), v: m === 'val' ? f1(q.val) + '%' : fD(q.v, m) + (m === 'abs' ? ' pts' : ''), c: s.color(q.n), b: q.n === d.s, d: m === 'val' ? fD(q.val - rv, 'abs') + ' pts' : f1(q.val) + '%' })).concat([{ k: (s.refName === 'Observed' ? '' : 'Reference · ') + WF.L(s.refName), v: f1(rv) + '%' + (moe ? ' ±' + f1(moe) : ''), b: true }]),
        foot: (obs ? 'Observed: ' + SCN.OBS.share.src + ', ' + SCN.OBS.share.n : '') + (more ? (obs ? '. ' : '') + more + ' more not shown' : '') || undefined };
    });
    el.replaceChildren(plot);
  }

  function gapDots(el, c, w, h) {
    const t = WF.tok(), s = modeSeries(c), m = c.diff === 'pct' ? 'pct' : 'abs', names = s.names.filter((n) => !(s.self && n === ref(c)));
    if (!names.length) { el.innerHTML = '<div style="color:var(--mute);padding:20px">Pick a scenario other than the reference to see differences.</div>'; return; }
    const rows = names.flatMap((n) => MODES.map((mo, j) => ({ mode: mo, s: n, gap: +dv(s.val(n, j), s.ref(j), m).toFixed(1) })));
    const L = Math.max(4, Math.ceil(d3.max(rows, (d) => Math.abs(d.gap)) / 2) * 2);
    const plot = Plot.plot(base(t, w, h, {
      marginLeft: 84, marginBottom: 36, marginTop: 8, marginRight: 14,
      x: { domain: [-L, L], label: (m === 'pct' ? 'Percent change' : 'Percentage points') + ' vs ' + s.refName.toLowerCase().replace(/^./, (x) => x.toUpperCase()), labelAnchor: 'center', labelArrow: 'none', tickFormat: (d) => sgn(d) + Math.abs(d) + (m === 'pct' ? '%' : ''), ticks: 8 },
      y: { label: null, domain: MODES, padding: 0.5 }, color: { domain: names, range: names.map(s.color) },
      marks: [m === 'abs' && ref(c) === 'Observed' ? Plot.rectX([{ a: -1, b: 1 }], { x1: 'a', x2: 'b', fill: t.ok, fillOpacity: 0.12 }) : null, Plot.ruleY(MODES, { stroke: t.grid, strokeOpacity: 1 }), Plot.ruleX([0], { stroke: t.ink, strokeOpacity: 0.55 }),
        Plot.dot(rows, { x: 'gap', y: 'mode', fill: 's', r: 5.5, stroke: t.surface, strokeWidth: 2, title: (d, i) => 'wfa:' + i })].filter(Boolean),
    }));
    TT.arm(plot, { a: rows }, (d) => {
      const j = MODES.indexOf(d.mode), obs = s.self && ref(c) === 'Observed', moe = obs ? SCN.OBS.share.moe[j] : null;
      const all = rows.filter((q) => q.mode === d.mode).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
      return { title: d.mode, sub: m === 'pct' ? 'percent change vs reference' : 'points vs reference',
        rows: all.map((q) => ({ k: WF.L(q.s), v: fD(q.gap, m) + (m === 'abs' ? ' pts' : ''), c: s.color(q.s), b: q.s === d.s, d: moe != null && m === 'abs' ? (Math.abs(q.gap) <= moe ? 'within error' : '') : f1(s.val(q.s, j)) + '%', dc: moe != null && m === 'abs' && Math.abs(q.gap) <= moe ? 'var(--ok)' : 'var(--mute)' })).concat([{ k: (s.refName === 'Observed' ? 'Observed' : 'Reference · ' + WF.L(s.refName)), v: f1(s.ref(j)) + '%' + (moe ? ' ±' + f1(moe) : ''), b: true }]),
        foot: obs ? 'Observed: ' + SCN.OBS.share.src + ', ' + SCN.OBS.share.n : undefined };
    });
    el.replaceChildren(plot);
  }

  /* ---- time series with group-by ---- */
  const GRP_NAMES = { mode: MODES, purpose: PURP, income: INC };
  function tsRows(c, group) {
    const g = group || c.group || 'scn', k = WF.K(), f = c.focus, out = [];
    if (g === 'scn') { on(c).forEach((s) => WF.tod(s).forEach((d) => out.push({ g: s, hour: d.hour, v: d.share / 100 * TRIPS[s] * 1000 }))); return { rows: out, names: on(c), color: (n) => WF.scColor(n), unit: 'k trips' }; }
    if (g === 'mode') { D.modeHour(f).forEach((d) => out.push({ g: d.mode, hour: d.hour, v: d.v })); return { rows: out, names: MODES, color: (n) => k.mode[n] }; }
    if (g === 'purpose') { PURP.forEach((p, i) => { const tot = D.PT[i] * TRIPS[f] / 9.86, w = d3.range(24).map((h) => D.purTod(p, h)), sm = d3.sum(w); w.forEach((v, h) => out.push({ g: p, hour: h, v: v / sm * tot })); }); return { rows: out, names: PURP, color: (n) => k.cat(PURP.indexOf(n)) }; }
    if (g === 'income') { const rp = k.ramp(k.P, 4, .55), td = WF.tod(f); INC.forEach((n, i) => { const w = td.map((d, h) => d.share * (1 + (1.5 - i) * .12 * (Math.exp(-.5 * ((h - 12) / 3) ** 2) - .5 * Math.exp(-.5 * ((h - 7.5) / 1.5) ** 2)))), sm = d3.sum(w), tot = TRIPS[f] * 1000 * D.INCSH[i]; w.forEach((v, h) => out.push({ g: n, hour: h, v: v / sm * tot })); }); return { rows: out, names: INC, color: (n) => rp[INC.indexOf(n)] }; }
    WF.tod(f).forEach((d) => out.push({ g: 'All trips', hour: d.hour, v: d.share / 100 * TRIPS[f] * 1000 }));
    return { rows: out, names: ['All trips'], color: () => WF.K().P };
  }

  function timeLines(el, c, w, h) {
    const t = WF.tok(), g = c.group || 'scn', m = g === 'scn' ? c.diff || 'val' : 'val', ts = tsRows(c, g);
    let rows = ts.rows, names = ts.names, refRows = null;
    if (g === 'scn') {
      const rr = WF.tod(ref(c)).map((d) => d.share / 100 * TRIPS[ref(c)] * 1000);
      if (m === 'val') refRows = rr.map((v, i) => ({ hour: i, v }));
      else { names = names.filter((n) => n !== ref(c)); rows = rows.filter((d) => d.g !== ref(c)).map((d) => ({ ...d, v: dv(d.v, rr[d.hour], m) })); }
    }
    const yf = (d) => (m === 'val' ? (g === 'scn' || true ? Math.round(d) + 'k' : d) : sgn(d) + Math.abs(+d.toFixed(1)) + (m === 'pct' ? '%' : 'k'));
    const ctxN = names.filter((n) => g === 'scn' && WF.scColor(n) === WF.scColor('__none__'));
    const plot = Plot.plot(base(t, w, h, {
      marginLeft: 44, marginBottom: 30, marginTop: 10, marginRight: 8,
      x: { label: null, domain: [0, 23], ticks: [0, 3, 6, 9, 12, 15, 18, 21], tickFormat: hourFmt }, y: { label: null, grid: true, tickFormat: yf, ticks: 4 },
      color: { domain: names, range: names.map(ts.color) },
      marks: [Plot.gridY({ stroke: t.grid, strokeOpacity: 1 }), refRows ? Plot.areaY(refRows, { x: 'hour', y: 'v', fill: t.ink, fillOpacity: .06, curve: 'catmull-rom' }) : null,
        refRows ? Plot.line(refRows, { x: 'hour', y: 'v', stroke: t.ink, strokeWidth: 1.5, strokeDasharray: '4 3', curve: 'catmull-rom' }) : Plot.ruleY([0], { stroke: t.mute }),
        Plot.line(rows, { x: 'hour', y: 'v', stroke: 'g', strokeWidth: 2.25, curve: 'catmull-rom', strokeLinecap: 'round' })].filter(Boolean),
    }));
    const at = (n, v) => rows.find((d) => d.g === n && d.hour === v), refAt = (v) => (refRows ? refRows[v].v : null);
    TT.cross(plot, { ml: 44, mr: 8, mt: 10, mb: 30, w, h, x0: 0, x1: 23, bg: t.surface,
      spec: (v) => ({ title: (v % 12 || 12) + (v < 12 ? ' AM' : ' PM'), sub: g === 'scn' ? 'trips per hour' : WF.L(c.focus), rows: names.map((n) => ({ n, d: at(n, v) })).filter((q) => q.d).sort((a, b) => b.d.v - a.d.v).map((q) => ({ k: g === 'scn' ? WF.L(q.n) : q.n, v: m === 'val' ? Math.round(q.d.v) + 'k' : fD(q.d.v, m, m === 'pct' ? 1 : 0) + (m === 'abs' ? 'k' : ''), c: ts.color(q.n), b: false })).concat(refRows ? [{ k: 'Reference', v: Math.round(refAt(v)) + 'k', b: true }] : []) }),
      ys: (v) => names.map((n) => ({ n, d: at(n, v) })).filter((q) => q.d).map((q) => ({ y: plot.scale('y').apply(q.d.v), c: ts.color(q.n) })) });
    el.replaceChildren(plot);
  }

  function streamT(el, c, w, h) {
    const t = WF.tok(), g = c.group === 'scn' || !c.group ? 'mode' : c.group, ts = tsRows(c, g);
    const mk = g === 'none' ? Plot.areaY(ts.rows, { x: 'hour', y: 'v', fill: ts.color(), curve: 'basis' }) : Plot.areaY(ts.rows, { x: 'hour', y: 'v', z: 'g', fill: 'g', curve: 'basis', offset: 'wiggle', order: 'inside-out', stroke: t.surface, strokeWidth: .8 });
    const plot = Plot.plot(base(t, w, h, { marginLeft: 8, marginBottom: 26, marginTop: 6, marginRight: 8, x: { label: null, domain: [0, 23], ticks: [0, 3, 6, 9, 12, 15, 18, 21], tickFormat: hourFmt }, y: { axis: null }, color: { domain: ts.names, range: ts.names.map(ts.color) }, marks: [mk] }));
    TT.cross(plot, { ml: 8, mr: 8, mt: 6, mb: 26, w, h, x0: 0, x1: 23, bg: t.surface,
      spec: (v) => { const r = ts.rows.filter((d) => d.hour === v).sort((a, b) => b.v - a.v), tot = d3.sum(r, (d) => d.v); return { title: (v % 12 || 12) + (v < 12 ? ' AM' : ' PM'), sub: WF.L(c.focus), rows: r.map((d) => ({ k: d.g, v: Math.round(d.v) + 'k', c: ts.color(d.g), d: Math.round(d.v / tot * 100) + '%' })), foot: 'Total ' + Math.round(tot) + 'k trips in this hour' }; } });
    el.replaceChildren(plot);
  }

  function heatT(el, c, w, h) {
    const t = WF.tok(), k = WF.K(), g = c.group || 'scn', ts = tsRows(c, g), rows = [];
    ts.names.forEach((n) => { const r = ts.rows.filter((d) => d.g === n), sm = d3.sum(r, (d) => d.v); r.forEach((d) => rows.push({ hour: d.hour, g: n, v: d.v / sm * 100 })); });
    const plot = Plot.plot(base(t, w, h, { marginLeft: g === 'scn' ? 118 : 78, marginBottom: 26, marginTop: 4, marginRight: 6, x: { label: null, domain: d3.range(24), tickFormat: (d) => (d % 3 ? '' : hourFmt(d)), padding: .08 }, y: { label: null, domain: ts.names, padding: .12 }, color: { type: 'sqrt', range: [mix(t.surface, k.P, .1), k.P], domain: [0, 16] },
      marks: [Plot.cell(rows, { x: 'hour', y: 'g', fill: 'v', rx: 4, title: (d, i) => 'wfa:' + i })] }));
    TT.arm(plot, { a: rows }, (d) => ({ title: g === 'scn' ? WF.L(d.g) : d.g, sub: (d.hour % 12 || 12) + (d.hour < 12 ? ' AM' : ' PM'), rows: [{ k: 'Share of its trips', v: d.v.toFixed(1) + '%', b: true }] }));
    el.replaceChildren(plot);
  }

  /* ---- maps: difference and swipe ---- */
  const MW = 900, MH = 560;
  function mapShell(el, w, h) {
    el.innerHTML = ''; el.style.position = 'relative'; el.style.background = WF.getBM().land || '';
    const svg = d3.select(el).append('svg').attr('width', w).attr('height', h).style('display', 'block').style('touch-action', 'none').style('font-family', WF.tok().font);
    const k0 = Math.max(w / MW, h / MH), tx = (w - MW * k0) / 2, ty = (h - MH * k0) / 2;
    return { svg, k0, tx, ty, w, h };
  }
  function drawZones(g, fill, t, tp, label) {
    const paths = g.selectAll('path.z').data(WF.ZONES).join('path').attr('class', 'z').attr('d', (z) => z.cell).attr('fill', (z, i) => fill(i)).attr('fill-opacity', WF.baseAlpha()).attr('stroke', t.line).attr('stroke-width', .6).attr('vector-effect', 'non-scaling-stroke');
    if (tp) paths.on('mousemove', function (e, z) { tp.show(label(z), e); d3.select(this).attr('stroke', t.ink).attr('stroke-width', 1.4).raise(); }).on('mouseleave', function () { tp.hide(); d3.select(this).attr('stroke', t.line).attr('stroke-width', .6); });
    return paths;
  }
  function railLayer(g, t) {
    g.append('path').attr('d', d3.line().curve(d3.curveCatmullRom.alpha(.5))(WF.RAIL)).attr('fill', 'none').attr('stroke', t.ink).attr('stroke-width', 2.2).attr('vector-effect', 'non-scaling-stroke').attr('opacity', .8).style('pointer-events', 'none');
    g.selectAll('circle.st').data(WF.RAIL).join('circle').attr('r', 4).attr('cx', (d) => d[0]).attr('cy', (d) => d[1]).attr('fill', t.surface).attr('stroke', t.ink).attr('stroke-width', 2).attr('vector-effect', 'non-scaling-stroke').style('pointer-events', 'none');
  }
  function ctl(el, mc) {
    const bar = document.createElement('div'); bar.style.cssText = 'position:absolute;right:10px;top:10px;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden;z-index:6';
    [['+', 'Zoom in', () => mc.zoom(1.6)], ['−', 'Zoom out', () => mc.zoom(1 / 1.6)], ['⌂', 'Reset view', () => mc.reset()]].forEach(([tx, a, f], i) => { const b = document.createElement('button'); b.textContent = tx; b.setAttribute('aria-label', a); b.onclick = f; b.style.cssText = 'width:30px;height:30px;border:0;background:transparent;color:var(--ink);cursor:pointer;font-size:15px' + (i ? ';border-top:1px solid var(--line)' : ''); bar.appendChild(b); });
    el.appendChild(bar);
  }
  const chip = (el, txt, side) => { const d = document.createElement('div'); d.textContent = txt; d.style.cssText = `position:absolute;top:10px;${side}:12px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:3px 11px;font-size:12px;font-weight:600;z-index:5;max-width:40%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`; el.appendChild(d); };
  const mapRef = (c) => (ref(c) === 'Observed' ? 'Baseline' : ref(c));

  function diffMap(el, c, w, h) {
    const t = WF.tok(), pal = WF.palette(), a = c.focus, b = mapRef(c), m = c.diff === 'pct' ? 'pct' : 'abs', S = mapShell(el, w, h), tp = tipper(el);
    const vals = WF.ZONES.map((z) => { const va = WF.zoneVal(z.i, a), vb = WF.zoneVal(z.i, b); return m === 'pct' ? (va / Math.max(vb, .5) - 1) * 100 : va - vb; });
    const L = Math.max(.5, d3.quantile(vals.map(Math.abs).sort(d3.ascending), .96)), mid = mix(t.surface, t.ink, .14);
    const sc = (v) => { const x = Math.max(-1, Math.min(1, v / L)); return x < 0 ? mix(mid, pal[1], -x) : mix(mid, pal[0], x); };
    const gz = S.svg.append('g'), gb = gz.append('g').attr('transform', `translate(${S.tx},${S.ty}) scale(${S.k0})`);
    WF.baseLayer(gb); drawZones(gb, (i) => sc(vals[i]), t, tp, (z) => tipRow('TAZ ' + z.id, [{ k: 'Change vs ' + WF.L(b), v: fD(vals[z.i], m) + (m === 'abs' ? ' pts' : ''), b: true, c: sc(vals[z.i]) }, { k: WF.L(a), v: WF.zoneVal(z.i, a).toFixed(1) + '%' }, { k: WF.L(b), v: WF.zoneVal(z.i, b).toFixed(1) + '%' }])); railLayer(gb, t);
    const zoom = d3.zoom().scaleExtent([1, 8]).on('zoom', (e) => gz.attr('transform', e.transform)); S.svg.call(zoom);
    ctl(el, { zoom: (f) => S.svg.transition().duration(250).call(zoom.scaleBy, f), reset: () => S.svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity) });
    chip(el, a === b ? 'Pick a focus that differs from the reference' : `${a} minus ${b}`, 'left');
    const rg = document.createElement('div'); rg.style.cssText = 'position:absolute;left:10px;bottom:10px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:7px 10px;font-size:11.5px;color:var(--mute);z-index:6';
    rg.innerHTML = `<div style="width:170px;height:7px;border-radius:4px;margin-bottom:4px;background:linear-gradient(90deg,${pal[1]},${mid},${pal[0]})"></div><div style="display:flex;justify-content:space-between"><span>−${L.toFixed(1)}${m === 'pct' ? '%' : ' pts'}</span><span>0</span><span>+${L.toFixed(1)}${m === 'pct' ? '%' : ' pts'}</span></div>`; el.appendChild(rg);
  }

  function swipeMap(el, c, w, h) {
    const t = WF.tok(), k = WF.K(), a = mapRef(c), b = c.focus, S = mapShell(el, w, h), tp = tipper(el);
    const seq = d3.scaleSequential(d3.interpolateRgb(t.surface, k.P)).domain([0, 14]);
    const id = 'sw' + Math.random().toString(36).slice(2, 7); let pos = c._swipe || w / 2;
    const defs = S.svg.append('defs'), clA = defs.append('clipPath').attr('id', id + 'a').append('rect').attr('x', 0).attr('y', 0).attr('height', h), clB = defs.append('clipPath').attr('id', id + 'b').append('rect').attr('y', 0).attr('height', h);
    const gz = S.svg.append('g'), mk = (cl, sc) => { const o = gz.append('g').attr('clip-path', `url(#${id}${cl})`); return o; };
    const zA = S.svg.append('g').attr('clip-path', `url(#${id}a)`).append('g'), zB = S.svg.append('g').attr('clip-path', `url(#${id}b)`).append('g');
    const bA = zA.append('g').attr('transform', `translate(${S.tx},${S.ty}) scale(${S.k0})`), bB = zB.append('g').attr('transform', `translate(${S.tx},${S.ty}) scale(${S.k0})`);
    WF.baseLayer(bA); WF.baseLayer(bB); drawZones(bA, (i) => seq(WF.zoneVal(i, a)), t, null); drawZones(bB, (i) => seq(WF.zoneVal(i, b)), t, null); railLayer(bA, t); railLayer(bB, t);
    const line = S.svg.append('g').attr('role', 'slider').attr('tabindex', 0).attr('aria-label', 'Swipe between scenarios').attr('aria-valuemin', 0).attr('aria-valuemax', 100).style('cursor', 'ew-resize');
    line.append('rect').attr('y', 0).attr('height', h).attr('width', 3).attr('x', -1.5).attr('fill', t.ink);
    line.append('circle').attr('cy', h / 2).attr('r', 15).attr('fill', t.surface).attr('stroke', t.ink).attr('stroke-width', 2.5);
    line.append('path').attr('d', 'M-5 -5 L-10 0 L-5 5 M5 -5 L10 0 L5 5').attr('transform', `translate(0,${h / 2})`).attr('fill', 'none').attr('stroke', t.ink).attr('stroke-width', 2).attr('stroke-linecap', 'round');
    line.append('rect').attr('x', -14).attr('width', 28).attr('y', 0).attr('height', h).attr('fill', 'transparent');
    const set = (x) => { pos = Math.max(24, Math.min(w - 24, x)); c._swipe = pos; clA.attr('width', Math.max(0, pos)); clB.attr('x', pos).attr('width', Math.max(0, w - pos)); line.attr('transform', `translate(${pos},0)`); line.attr('aria-valuenow', Math.round(pos / w * 100)); };
    set(pos);
    line.call(d3.drag().on('drag', (e) => set(e.x))); line.on('keydown', (e) => { if (e.key === 'ArrowLeft') set(pos - 24); if (e.key === 'ArrowRight') set(pos + 24); });
    const zoom = d3.zoom().scaleExtent([1, 8]).filter((e) => e.type === 'wheel' || (e.type === 'mousedown' && !e.target.closest('[role=slider]'))).on('zoom', (e) => { zA.attr('transform', e.transform); zB.attr('transform', e.transform); }); S.svg.call(zoom);
    ctl(el, { zoom: (f) => S.svg.transition().duration(250).call(zoom.scaleBy, f), reset: () => S.svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity) });
    chip(el, a, 'left'); chip(el, b, 'right'); el.querySelectorAll('div[style*="right:12px"]').forEach((d) => (d.style.right = '52px'));
  }

  /* ---- scenario comparison tiles ---- */
  let sortKey = null, sortDir = -1;
  function scoreTable(el, c) {
    const t = WF.tok(), pal = WF.palette(), m = c.diff || 'val', rf = ref(c), names = on(c).filter((n) => n !== rf), tag = SCN.TAG;
    const cols = METRICS.map((mt) => { const rv = mt.get(rf), ds = names.map((n) => dv(mt.get(n), rv, 'pct')), mx = Math.max(.5, d3.max(ds, Math.abs) || 1); return { mt, rv, mx }; });
    let rows = names.map((n) => ({ n }));
    if (sortKey != null) { const cc = cols[sortKey]; rows.sort((a, b) => sortDir * (cc.mt.get(a.n) - cc.mt.get(b.n))); }
    const cell = (cc, v) => { const p = dv(v, cc.rv, 'pct'), x = Math.max(-1, Math.min(1, p / cc.mx)), col = x < 0 ? pal[1] : pal[0], txt = m === 'val' ? v.toFixed(cc.mt.dec) : fD(dv(v, cc.rv, m), m, cc.mt.dec);
      return `<td class="num" style="background:color-mix(in srgb,${col} ${Math.round(Math.abs(x) * 38)}%,transparent)">${txt}</td>`; };
    const head = cols.map((cc, i) => `<th class="num sortable" data-s="${i}" role="columnheader" aria-sort="${sortKey === i ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}" tabindex="0">${cc.mt.label}<small>${cc.mt.unit}${sortKey === i ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</small></th>`).join('');
    const dot = (n) => `<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${WF.scColor(n)};margin-right:9px;${WF.scColor(n) === WF.scColor('__none__') ? 'opacity:.7' : ''}"></i>`;
    el.innerHTML = `<div style="overflow:auto;height:100%"><table class="tbl score"><thead><tr><th>Scenario</th>${head}</tr></thead><tbody>
      <tr class="refrow"><td>${rf === 'Observed' ? '<i style="display:inline-block;width:14px;border-top:2px dashed var(--ink);margin-right:7px;vertical-align:middle"></i>' : dot(rf)}<b>${WF.L(rf)}</b> <span class="tag">Reference</span></td>${cols.map((cc) => `<td class="num"><b>${cc.rv.toFixed(cc.mt.dec)}</b></td>`).join('')}</tr>
      ${rows.map((r) => `<tr><td>${dot(r.n)}${WF.L(r.n)} <span class="tag">${tag[r.n]}</span></td>${cols.map((cc) => cell(cc, cc.mt.get(r.n))).join('')}</tr>`).join('')}</tbody></table></div>`;
    el.querySelectorAll('.sortable').forEach((th) => { const f = () => { const i = +th.dataset.s; if (sortKey === i) sortDir = -sortDir; else { sortKey = i; sortDir = -1; } scoreTable(el, c); }; th.onclick = f; th.onkeydown = (e) => { if (e.key === 'Enter') f(); }; });
  }

  function rank(el, c, w, h) {
    if (w < 320) { el.innerHTML = ''; return; }
    const t = WF.tok(), m = c.diff || 'val', mt = METRICS.find((x) => x.k === (c.group || 'transit')) || METRICS[2], rf = ref(c), rv = mt.get(rf);
    const names = on(c).filter((n) => (m === 'val' ? true : n !== rf));
    const rows = names.map((n) => ({ s: n, v: m === 'val' ? mt.get(n) : dv(mt.get(n), rv, m) })).sort((a, b) => b.v - a.v);
    const lab = (d) => (m === 'val' ? d.toFixed(mt.dec) : fD(d, m, m === 'pct' ? 1 : mt.dec));
    const xs = m === 'val' ? { label: mt.label + ' (' + mt.unit + ')', labelAnchor: 'center' } : { label: (m === 'pct' ? 'Percent change in ' : 'Change in ') + mt.label.toLowerCase() + ' vs ' + rf, labelAnchor: 'center', tickFormat: (d) => fD(d, m, m === 'pct' ? 0 : mt.dec) };
    const plot = Plot.plot(base(t, w, h, { marginLeft: 124, marginRight: 48, marginBottom: 38, marginTop: 6, x: { grid: false, nice: true, inset: 40, ...xs }, y: { label: null, domain: rows.map((r) => r.s), padding: .32, tickFormat: (d) => WF.L(d) }, color: { domain: rows.map((r) => r.s), range: rows.map((r) => WF.scColor(r.s)) },
      marks: [Plot.barX(rows, { x: 'v', y: 's', fill: 's', rx: 4, title: (d, i) => 'wfa:' + i }), Plot.text(rows.filter((d) => d.v >= 0), { x: 'v', y: 's', text: (d) => lab(d.v), dx: 6, textAnchor: 'start', fill: t.ink }), Plot.text(rows.filter((d) => d.v < 0), { x: 'v', y: 's', text: (d) => lab(d.v), dx: -6, textAnchor: 'end', fill: t.ink }),
        m === 'val' ? Plot.ruleX([rv], { stroke: t.ink, strokeWidth: 1.6, strokeDasharray: '4 3' }) : Plot.ruleX([0], { stroke: t.mute }), Plot.ruleX([0], { stroke: t.line })] }));
    TT.arm(plot, { a: rows }, (d) => ({ title: WF.L(d.s), swatch: WF.scColor(d.s), rows: [{ k: mt.label, v: m === 'val' ? d.v.toFixed(mt.dec) + ' ' + mt.unit : lab(d.v) + (m === 'abs' ? ' ' + mt.unit : ''), b: true }, { k: 'Reference', v: rv.toFixed(mt.dec) + ' ' + mt.unit }] }));
    el.replaceChildren(plot);
  }

  function stackedScn(el, c, w, h) {
    const k = WF.K(), rf = ref(c), ids = [rf, ...on(c).filter((n) => n !== rf)];
    WF.CH.stacked(el, c, w, h, { rows: ids.map((n) => ({ label: WF.L(n), vals: SHARE[n] })), keys: MODES, colors: MODES.map((x) => k.mode[x]), isMode: true, ml: 124, of: 'trips' });
  }

  WF.kpis = (sc, rf) => {
    rf = rf || 'Observed'; const pct = (a, b) => (a - b) / b * 100, rows = WF.calRows(sc), ok = rows.filter((r) => r.st === 'ok').length;
    const bd = (s) => d3.sum(BOARD[s]), tl = (s) => 7.6 * D.TLadj[s];
    const mk = (label, val, unit, p, spark) => ({ label, val, unit, pct: p, st: rf !== 'Observed' || sc !== 'Baseline' ? 'info' : Math.abs(p) <= 3 ? 'ok' : Math.abs(p) <= 5 ? 'warn' : 'fail', spark, sub: 'vs ' + (rf === 'Observed' ? 'observed' : rf.toLowerCase()) });
    return [mk('Daily trips', TRIPS[sc].toFixed(2), 'M', pct(TRIPS[sc], TRIPS[rf]), [5, 5, 6, 5, 6, 7, 6]), mk('Transit boardings', bd(sc).toFixed(0), 'k', pct(bd(sc), bd(rf)), [3, 3, 4, 4, 5, 5, 6]), mk('Vehicle miles', VMT[sc].toFixed(1), 'M', pct(VMT[sc], VMT[rf]), [7, 7, 6, 6, 5, 5, 4]), mk('Average trip length', tl(sc).toFixed(1), 'mi', pct(tl(sc), tl(rf)), [4, 5, 5, 6, 6, 6, 7]),
      { label: 'Calibration', val: String(ok), unit: 'of ' + rows.length, pct: 0, st: 'ok', spark: null, sub: 'submodels within 3%', plain: true }];
  };


  /* ---- calibration rounds: the model's own calibration metrics across the whole family ---- */
  const ROUNDS = SCN.FAM.cal.names, SUBN = ['Auto ownership', 'Activity pattern', 'Work location', 'School location', 'Tour mode', 'Tour timing', 'Stop frequency', 'Trip mode'];
  const LINEN = ['Blue Line (rail)', 'Red Line (rail)', 'Green Line (rail)', 'FrontRunner', 'Route 200 (bus)', 'Route 2 (bus)'];
  const volOf = (n) => [TRIPS[n], VMT[n], d3.sum(BOARD[n]), 7.6 * D.TLadj[n]];
  function traceMeta(metric) {
    const k = WF.K(), t = WF.tok();
    if (metric === 'vol') return { label: 'Volumes', names: ['Daily trips', 'Vehicle miles', 'Transit boardings', 'Average trip length'], color: (i) => k.cat(i), val: (n, i) => volOf(n)[i], obs: (i) => volOf('Observed')[i], pct: true, tol: 5, tolLabel: '±5% of observed', vfmt: (v, i) => [v.toFixed(2) + 'M', v.toFixed(1) + 'M mi', v.toFixed(0) + 'k', v.toFixed(1) + ' mi'][i] };
    if (metric === 'boards') return { label: 'Boardings by line', names: LINEN, color: (i) => k.cat(i), val: (n, i) => BOARD[n][i], obs: (i) => BOARD.Observed[i], pct: true, tol: 10, tolLabel: '±10% of observed', vfmt: (v) => v.toFixed(1) + 'k' };
    if (metric === 'err') return { label: 'Submodel error', names: SUBN, color: (i) => (i < 7 ? k.cat(i) : mix(t.surface, t.ink, .5)), val: (n, i) => SCN.CALR(n)[i], obs: () => 0, pct: false, tol: 3, tolLabel: '3% tolerance', err: true, vfmt: (v) => v.toFixed(1) + '%' };
    return { label: 'Mode share', names: MODES, color: (i) => k.mode[MODES[i]], val: (n, i) => SHARE[n][i], obs: (i) => SHARE.Observed[i], pct: false, tol: 1, tolLabel: '±1 point of observed', vfmt: (v) => v.toFixed(1) + '%' };
  }
  const traceRows = (m) => ROUNDS.flatMap((n, ri) => m.names.map((nm, i) => { const v = m.val(n, i), o = m.obs(i), d = m.err ? v : m.pct ? (v / o - 1) * 100 : v - o; return { r: ri + 1, i, name: nm, v, o, d }; }));
  const selRounds = (c) => ROUNDS.filter((n) => c.active.has(n) || n === c.focus).map((n) => ({ n, r: SCN.ROUND[n], foc: n === c.focus }));
  const pickFn = (c) => (v, e) => c.pick && c.pick('Round ' + v, e && e.shiftKey);
  const dfmt = (d, m) => (m.err ? d.toFixed(1) + '%' : (d > 0.005 ? '+' : d < -0.005 ? '−' : '') + Math.abs(d).toFixed(1) + (m.pct ? '%' : ' pts'));
  function traceLines(el, c, w, h, values) {
    const t = WF.tok(), m = traceMeta(c.group || 'mode'), rows = traceRows(m), sel = selRounds(c), yv = values ? 'v' : 'd';
    const yTick = values ? (m.pct ? (d) => d : (d) => d + (m.names === MODES ? '%' : '')) : (d) => (m.err ? d + '%' : (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + (m.pct ? '%' : ''));
    const marks = [Plot.gridY({ stroke: t.grid, strokeOpacity: 1 })];
    if (!values) marks.push(Plot.rectY([{ a: m.err ? 0 : -m.tol, b: m.tol }], { y1: 'a', y2: 'b', fill: t.ok, fillOpacity: .09 }), Plot.ruleY(m.err ? [m.tol] : [-m.tol, m.tol], { stroke: t.ok, strokeDasharray: '4 3', strokeOpacity: .7 }), m.err ? null : Plot.ruleY([0], { stroke: t.mute }));
    else marks.push(Plot.ruleY(m.names.map((nm, i) => ({ y: m.obs(i), i })), { y: 'y', stroke: (d) => m.color(d.i), strokeDasharray: '4 3', strokeOpacity: .85 }));
    marks.push(Plot.line(rows, { x: 'r', y: yv, z: 'i', stroke: (d) => m.color(d.i), strokeWidth: 1.9, strokeOpacity: .92, curve: 'monotone-x' }), Plot.ruleX(sel, { x: 'r', stroke: (d) => (d.foc ? t.ink : WF.scColor(d.n)), strokeWidth: 2, strokeOpacity: .75 }));
    const plot = Plot.plot(base(t, w, h, { marginLeft: 44, marginBottom: 32, marginTop: 8, marginRight: 10, x: { label: 'Calibration round', labelAnchor: 'center', domain: [1, ROUNDS.length], ticks: [1, 10, 20, 30, 40, 50] }, y: { label: null, grid: true, tickFormat: yTick, ticks: 5 }, marks: marks.filter(Boolean) }));
    TT.cross(plot, { ml: 44, mr: 10, mt: 8, mb: 32, w, h, x0: 1, x1: ROUNDS.length, bg: t.surface, click: pickFn(c),
      spec: (v) => { const rr = rows.filter((q) => q.r === v).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)), within = rr.filter((q) => (m.err ? q.d <= m.tol : Math.abs(q.d) <= m.tol)).length;
        return { title: 'Round ' + v, sub: m.err ? 'worst-segment error' : 'vs observed', rows: rr.map((q) => ({ k: q.name, v: values ? m.vfmt(q.v, q.i) : dfmt(q.d, m), c: m.color(q.i), d: values ? (m.err ? '' : dfmt(q.d, m)) : m.err ? '' : m.vfmt(q.v, q.i), dc: 'var(--mute)' })), foot: within + ' of ' + rr.length + ' within ' + m.tolLabel + '. Click to focus this round, shift-click to compare.' }; },
      ys: (v) => rows.filter((q) => q.r === v).map((q) => ({ y: plot.scale('y').apply(q[yv]), c: m.color(q.i) })) });
    el.replaceChildren(plot);
  }
  const traceValues = (el, c, w, h) => traceLines(el, c, w, h, true);
  function traceHeat(el, c, w, h) {
    const t = WF.tok(), pal = WF.palette(), m = traceMeta(c.group || 'mode'), rows = traceRows(m), sel = selRounds(c), mid = mix(t.surface, t.ink, .16), L = m.tol * 4;
    const color = m.err ? { type: 'linear', domain: [0, 3, 6, 12], range: [t.ok, t.ok, t.warn, t.fail] } : { type: 'diverging', pivot: 0, domain: [-L, L], range: [pal[1], mid, pal[0]], interpolate: (a, b) => (x) => x };
    const cs = m.err ? color : { type: 'linear', domain: [-L, 0, L], range: [pal[1], mid, pal[0]] };
    const plot = Plot.plot(base(t, w, h, { marginLeft: 124, marginBottom: 32, marginTop: 8, marginRight: 8, x: { label: 'Calibration round', labelAnchor: 'center', domain: d3.range(1, ROUNDS.length + 1), ticks: [1, 10, 20, 30, 40, 50], tickFormat: (d) => d, padding: .06 }, y: { label: null, domain: m.names, padding: .12 }, color: cs,
      marks: [Plot.cell(rows, { x: 'r', y: 'name', fill: 'd', rx: 3, title: (d, i) => 'wfa:' + i }), Plot.ruleX(sel, { x: 'r', stroke: (d) => (d.foc ? t.ink : WF.scColor(d.n)), strokeWidth: 2, strokeOpacity: .9 })] }));
    TT.arm(plot, { a: rows }, (d) => ({ title: 'Round ' + d.r, sub: d.name, rows: [{ k: m.err ? 'Worst-segment error' : 'Difference from observed', v: dfmt(d.d, m), b: true }].concat(m.err ? [] : [{ k: 'Modeled', v: m.vfmt(d.v, d.i) }, { k: 'Observed', v: m.vfmt(d.o, d.i) }]), foot: 'Click to focus this round. Shift-click to compare.' }), (d, k, e) => pickFn(c)(d.r, e));
    plot.style.cursor = 'pointer'; el.replaceChildren(plot);
  }
  WF.traceMeta = traceMeta;

  /* ---- across model years: the trend that drives year selection ---- */
  const YEARS = SCN.YEARS.map((q) => q.y), yl = (y) => SCN.YEARS.find((q) => q.y === y).label;
  function yearsTrend(el, c, w, h) {
    const t = WF.tok(), mt = METRICS.find((x) => x.k === (c.group || 'transit')) || METRICS[2], m = c.diff || 'val';
    const rf = c.ref === 'Observed' || SCN.ROUND[c.ref] ? 'Baseline' : c.ref, names = on(c).filter((n) => !SCN.ROUND[n] && !(m !== 'val' && n === rf));
    const val = (n, y) => SCN.valAt(n, y, mt.k), rows = names.flatMap((n) => YEARS.map((y) => ({ n, y, v: m === 'val' ? val(n, y) : dv(val(n, y), val(rf, y), m), raw: val(n, y) })));
    const obs = m === 'val' ? [{ y: SCN.BASEYEAR, v: mt.get('Observed') }] : [], yf = (d) => (m === 'val' ? d + '' : sgn(d) + Math.abs(+d.toFixed(1)) + (m === 'pct' ? '%' : ''));
    const plot = Plot.plot(base(t, w, h, { marginLeft: 46, marginBottom: 34, marginTop: 10, marginRight: 14,
      x: { label: null, domain: [2023, 2055], ticks: YEARS, tickFormat: (d) => String(d), inset: 8 }, y: { label: null, grid: true, tickFormat: yf, ticks: 5 }, color: { domain: names, range: names.map((n) => WF.scColor(n)) },
      marks: [Plot.gridY({ stroke: t.grid, strokeOpacity: 1 }), m === 'val' ? null : Plot.ruleY([0], { stroke: t.mute }), Plot.ruleX([c.year], { stroke: t.ink, strokeOpacity: .5, strokeDasharray: '3 3' }),
        Plot.line(rows, { x: 'y', y: 'v', z: 'n', stroke: 'n', strokeWidth: 2.4, strokeLinecap: 'round', curve: 'monotone-x' }), Plot.dot(rows, { x: 'y', y: 'v', fill: 'n', stroke: t.surface, strokeWidth: 2, r: 4.5 }),
        Plot.dot(obs, { x: 'y', y: 'v', r: 6.5, fill: t.surface, stroke: t.ink, strokeWidth: 2.2 })].filter(Boolean) }));
    const snap = (raw) => YEARS.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
    TT.cross(plot, { ml: 46, mr: 14, mt: 10, mb: 34, w, h, x0: 2023, x1: 2055, snap, bg: t.surface, click: (y) => c.setYear && c.setYear(y),
      spec: (y) => ({ title: y + '', sub: yl(y), rows: rows.filter((q) => q.y === y).sort((a, b) => b.v - a.v).map((q) => ({ k: WF.L(q.n), v: m === 'val' ? q.v.toFixed(mt.dec) + ' ' + mt.unit : fD(q.v, m, m === 'pct' ? 1 : mt.dec) + (m === 'abs' ? ' ' + mt.unit : ''), c: WF.scColor(q.n), d: m === 'val' ? '' : q.raw.toFixed(mt.dec) + ' ' + mt.unit, dc: 'var(--mute)' })).concat(m !== 'val' ? [{ k: 'Reference · ' + WF.L(rf), v: val(rf, y).toFixed(mt.dec) + ' ' + mt.unit, b: true }] : y === SCN.BASEYEAR ? [{ k: 'Observed', v: mt.get('Observed').toFixed(mt.dec) + ' ' + mt.unit, b: true }] : []), foot: 'Click to switch the dashboard to ' + y + '.' }),
      ys: (y) => rows.filter((q) => q.y === y).map((q) => ({ y: plot.scale('y').apply(q.v), c: WF.scColor(q.n) })) });
    el.replaceChildren(plot);
  }

  Object.assign(WF.CH, { traceLines, traceValues, traceHeat, yearsTrend, modeBars, gapDots, timeLines, streamT, heatT, diffMap, swipeMap, scoreTable, rank, stackedScn });
})();
