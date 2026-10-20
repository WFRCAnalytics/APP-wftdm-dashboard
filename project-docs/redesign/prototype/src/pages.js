/* pages.js: shared tile catalogue. A tile can offer several chart types (views), several grouping variables (groups) and, in compare mode, a strategy suited to its chart type. */
(function () {
  const WF = window.WF, CH = WF.CH, D = WF.D;
  const V = (k, label, leg, fn, o) => Object.assign({ k, label, leg, fn, cmp: ['overlay'] }, o || {});
  const STRAT = { overlay: 'Overlay', multi: 'Side by side', diff: 'Difference', switch: 'One at a time', grid: 'Side by side', swipe: 'Swipe' };
  WF.STRAT = STRAT;
  const mapCell = (el, c) => { WF.zoneMap(el, c.focus, { syncGroup: c.mapGroup }); };
  const mapView = (el, c) => {
    const mc = WF.zoneMap(el, c.focus, {});
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;right:10px;top:10px;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden;z-index:6';
    [['+', 'Zoom in', () => mc.zoom(1.6)], ['−', 'Zoom out', () => mc.zoom(1 / 1.6)], ['⌂', 'Reset view', () => mc.reset()]].forEach(([t, a, f], i) => { const b = document.createElement('button'); b.textContent = t; b.setAttribute('aria-label', a); b.onclick = f; b.style.cssText = 'width:30px;height:30px;border:0;background:transparent;color:var(--ink);cursor:pointer;font-size:15px' + (i ? ';border-top:1px solid var(--line)' : ''); bar.appendChild(b); });
    el.appendChild(bar);
    const rp = document.createElement('div');
    rp.style.cssText = 'position:absolute;left:10px;bottom:10px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:7px 10px;font-size:11.5px;color:var(--mute);z-index:6';
    rp.innerHTML = '<div style="width:150px;height:7px;border-radius:4px;margin:0 0 4px;background:linear-gradient(90deg,var(--surface),var(--accent));border:1px solid var(--line)"></div><div style="display:flex;justify-content:space-between"><span>0%</span><span>14%+ transit share</span></div>';
    el.appendChild(rp);
    const ch = document.createElement('div'); ch.textContent = WF.L(c.focus); ch.style.cssText = 'position:absolute;top:10px;left:12px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:3px 11px;font-size:12px;font-weight:600;z-index:5'; el.appendChild(ch);
  };
  const flowTable = (el) => CH.htmlTable(el, ['From \\ to', ...D.DIST], D.DIST.map((n, i) => [n, ...D.FLOW[i].map((v) => (v >= 100 ? Math.round(v) : v.toFixed(1)) + 'k')]));
  const G = (...a) => a.map(([k, l]) => ({ k, label: l }));
  const donutOrDiff = (e, c, w, h) => (c.diff !== 'val' ? CH.modeBars(e, Object.assign(Object.create(c), { group: 'scn' }), w, h) : CH.donut(e, c, w, h));

  WF.TILES = {
    mix: { title: 'Trips by purpose and mode', sub: 'Daily trips for the focus scenario. Hover a mode to trace it across every chart.', parquet: 'trips_by_purpose_mode.parquet', about: 'Counts every simulated trip. Area is proportional to trips. Group by changes how the rectangles nest. In compare mode the treemap can sit side by side or colour each cell by its change from the reference.',
      groups: G(['pm', 'Purpose › Mode'], ['mp', 'Mode › Purpose'], ['im', 'Income › Mode']), groupLabel: 'Group by',
      views: [V('tree', 'Treemap', (c) => (c.group === 'mp' ? 'purpose' : c.diff !== 'val' && (c.group || 'pm') === 'pm' ? 'diverge' : 'mode'), (e, c, w, h) => CH.treemap(e, c, w, h, 'trips'), { cmp: ['multi', 'diff'], diff: true }),
        V('sun', 'Sunburst', (c) => (c.group === 'mp' ? 'purpose' : 'mode'), (e, c, w, h) => CH.sunburst(e, c, w, h, 'trips'), { cmp: ['multi'] }),
        V('flow', 'Flow', 'mode', CH.sankey, { cmp: ['switch'] }), V('bars', '100% bars', 'mode', CH.stackedTrips, { cmp: ['multi'] })] },
    share: { title: 'Mode share', sub: 'Share of daily trips. The dashed line is the reference.', parquet: 'mode_share.parquet', about: 'Trip mode share. Compare by splits the same shares by scenario, trip purpose or household income. Change mode shows differences from the reference.',
      groups: G(['scn', 'Scenario'], ['purpose', 'Purpose'], ['income', 'Income']), groupLabel: 'Compare by',
      views: [V('bars', 'Bars', (c) => (c.group === 'purpose' ? 'purpose' : c.group === 'income' ? 'income' : 'scn'), CH.modeBars, { diff: true }), V('gap', 'Gap', (c) => (c.group === 'purpose' ? 'purpose' : c.group === 'income' ? 'income' : 'scn'), CH.gapDots, { diff: true }),
        V('stack', '100% bars', 'mode', CH.stackedScn), V('slope', 'Slope', null, CH.slope, { cmp: ['switch'] }), V('donut', 'Donut', null, donutOrDiff, { cmp: ['switch', 'diff'], diff: true }), V('tbl', 'Table', null, CH.modeTbl)] },
    trace: { title: 'Calibration progress', sub: 'Your own calibration metrics across the rounds. Click a round to focus it, shift-click to compare it.', parquet: 'calibration_by_round.parquet', about: 'Every calibration round is a run in the same ordered family. Pick the metric you are tuning. Difference shows the gap to observed, with the target band shaded. Selected rounds are marked and join the comparison like any scenario.', family: true, baseOnly: true,
      groups: G(['mode', 'Mode share'], ['vol', 'Volumes'], ['boards', 'Boardings by line'], ['err', 'Submodel error']), groupLabel: 'Metric',
      views: [V('diff', 'Difference', 'trace', CH.traceLines, { cmp: [] }), V('vals', 'Values', 'trace', CH.traceValues, { cmp: [] }), V('heat', 'Heatmap', null, CH.traceHeat, { cmp: [] })] },
    years: { title: 'Across model years', sub: 'How each alternative develops from the base year to the horizon year. Click a year to switch the dashboard to it.', parquet: 'scenario_summary_by_year.parquet', about: 'Every alternative has a run for each model year: base year 2023, opening year 2027, end of STIP 2032, and the RTP phases through the 2055 horizon. The open circle is the observed base-year value.', baseless: true,
      groups: G(...WF.METRICS.map((m) => [m.k, m.label])), groupLabel: 'Metric', views: [V('lines', 'Lines', null, CH.yearsTrend, { diff: true })] },
    fp: { title: 'Calibration fingerprint', sub: 'Worst-segment error per submodel. The dashed ring is the 3% tolerance. Compare rounds to see the shape tighten. Shows up to six.', parquet: 'calibration_errors.parquet', baseOnly: true, about: 'One axis per ActivitySim submodel. Calibration is measured on the base year, so forecast scenarios share the base-year errors. Calibration rounds each have their own.',
      views: [V('radar', 'Radar', 'scn', CH.radar, { cmp: ['overlay'] }), V('tbl', 'Table', null, (e, c) => CH.calTbl(e, c), { cmp: ['overlay'] })] },
    time: { title: 'Trips through the day', sub: 'Departure hour. Group by chooses what the lines or bands represent.', parquet: 'trips_by_hour.parquet', about: 'Departure time of day. Group by Scenario overlays the compared scenarios; the other groupings split one scenario. In Change mode, lines show the difference from the reference.',
      groups: G(['scn', 'Scenario'], ['mode', 'Mode'], ['purpose', 'Purpose'], ['income', 'Income'], ['none', 'All trips']), groupLabel: 'Group by',
      views: [V('lines', 'Lines', (c) => ({ scn: 'scn', mode: 'mode', purpose: 'purpose', income: 'income' }[c.group || 'scn'] || null), CH.timeLines, { diff: true }),
        V('stream', 'Stream', (c) => ({ mode: 'mode', purpose: 'purpose', income: 'income' }[c.group] || 'mode'), CH.streamT, { cmp: ['switch', 'multi'] }), V('heat', 'Heatmap', null, CH.heatT)] },
    zones: { title: 'Where transit grows', sub: 'Transit share by traffic analysis zone. Scroll to zoom.', parquet: 'zone_transit_share.geoparquet', about: 'Zone-level transit share. In compare mode: Values puts scenarios side by side (up to four), Difference fills each zone by its change from the reference, and Swipe slides between the reference and the focus scenario.',
      views: [V('map', 'Values', null, mapView, { cmp: ['grid', 'switch'], fnCell: mapCell, cap: 4, mapSync: true }), V('diffm', 'Difference', 'diverge', CH.diffMap, { diff: true, needs: true, cmp: ['diff'] }), V('swipe', 'Swipe', null, CH.swipeMap, { needs: true, cmp: ['swipe'] })] },
    flows: { title: 'District flows', sub: 'Daily trips between districts, leaving out trips that stay inside one. Hover a district to isolate it.', parquet: 'od_district.parquet', about: 'Origin to destination trips aggregated to five districts.', views: [V('chord', 'Chord', null, CH.chord, { cmp: ['switch'] }), V('tbl', 'Table', null, (e) => flowTable(e), { cmp: ['switch'] })] },
    hh: { title: 'Auto ownership', sub: 'Households by number of cars for the focus scenario.', parquet: 'auto_ownership.parquet', about: 'Output of the auto ownership submodel, segmented by household income.',
      views: [V('waffle', 'Waffle', null, CH.waffle, { cmp: ['multi'] }), V('sun', 'Sunburst', null, (e, c, w, h) => CH.sunburst(e, c, w, h, 'hh'), { cmp: ['multi'] }), V('tree', 'Treemap', null, (e, c, w, h) => CH.treemap(e, c, w, h, 'hh'), { cmp: ['multi'] }), V('bars', '100% bars', null, CH.stackedAuto, { cmp: ['multi'] }), V('db', 'Dumbbell', 'scn', (e, c, w, h) => CH.dumbbell(e, c, w, h, 'hh'))] },
    pyramid: { title: 'Population by age and sex', sub: 'Synthetic population in bars. Ticks mark the census estimate.', parquet: 'persons_age_sex.parquet', about: 'Checks the synthetic population against ACS estimates before any model runs. The population is the same in every scenario.', indep: true, views: [V('pyr', 'Pyramid', null, CH.pyramid, { cmp: [] })] },
    tlfd: { title: 'Trip length distribution', sub: 'Share of trips by distance. Dashed line is observed.', parquet: 'trip_length_frequency.parquet', about: 'TLFD by purpose for the focus scenario. Average length is shown under each ridge.', views: [V('ridge', 'Ridgeline', null, CH.ridge, { cmp: ['multi'] })] },
    modeinc: { title: 'Mode share by household income', sub: 'Lower-income households use transit, walking and school buses most.', parquet: 'mode_by_income.parquet', about: 'Trip mode shares segmented by income group.', views: [V('bars', '100% bars', 'mode', CH.stackedInc, { cmp: ['multi'] })] },
    flowbig: { title: 'From purpose to mode to distance', sub: 'Each band is a share of daily trips.', parquet: 'trips_by_purpose_mode.parquet', about: 'Follows trips from why people travel, to how, to how far.', views: [V('flow', 'Flow', 'mode', CH.sankey, { cmp: ['switch'] })] },
    boards: { title: 'Transit boardings by line', sub: 'Weekday boardings. Open circle is observed.', parquet: 'transit_boardings.parquet', about: 'Boardings assigned to each line compared with the agency counts.', views: [V('db', 'Dumbbell', 'scn', (e, c, w, h) => CH.dumbbell(e, c, w, h, 'boards'))] },
    speed: { title: 'Average speed by hour', sub: 'Slow hours are darkest.', parquet: 'speed_by_facility_hour.parquet', about: 'Congested speeds by facility type through the day.', views: [V('heat', 'Heatmap', null, (e, c, w, h) => CH.heat(e, c, w, h, 'speed'), { cmp: ['multi'] })] },
    vmt: { title: 'Vehicle miles by county and road type', sub: 'Millions of miles per day.', parquet: 'vmt_county_facility.parquet', about: 'Assigned vehicle miles of travel.', views: [V('tree', 'Treemap', null, (e, c, w, h) => CH.treemap(e, c, w, h, 'vmt'), { cmp: ['multi'] }), V('sun', 'Sunburst', null, (e, c, w, h) => CH.sunburst(e, c, w, h, 'vmt'), { cmp: ['multi'] })] },
    score: { title: 'Scenario scorecard', sub: 'Every compared scenario against the reference. Click a column to sort.', parquet: 'scenario_summary.parquet', about: 'One row per scenario, one column per headline metric. Cell shading shows how far each value is from the reference, so fifteen scenarios can be read at a glance.', needs: true, views: [V('matrix', 'Matrix', null, CH.scoreTable, { diff: true })] },
    rank: { title: 'Ranked by metric', sub: 'Scenarios sorted by the chosen metric.', parquet: 'scenario_summary.parquet', about: 'Pick a metric to rank every compared scenario. In Change mode bars show the difference from the reference.', needs: true,
      groups: G(...WF.METRICS.map((m) => [m.k, m.label])), groupLabel: 'Metric', views: [V('bars', 'Bars', null, CH.rank, { diff: true })] },
  };
  WF.viewsFor = (T, compare) => T.views.filter((v) => !v.needs || compare);

  WF.NAV = [
    { k: 'summary', label: 'Summary', icon: 'summary', title: 'Summary', sub: 'Regional totals and calibration status' },
    { k: 'hh', label: 'Person and household', icon: 'people', title: 'Person and household models', sub: 'Who lives where, and how many cars they own', subs: [['Auto ownership', 'hh'], ['Population', 'pyramid']] },
    { k: 'tours', label: 'Tour models', icon: 'tours', title: 'Tour models', sub: 'When, how far and between which districts people travel', subs: [['Trip length', 'tlfd'], ['Timing', 'time'], ['Districts', 'flows']] },
    { k: 'mode', label: 'Mode choice', icon: 'mode', title: 'Mode choice', sub: 'How people choose between driving, transit, walking and biking', subs: [['Shares', 'share'], ['Segments', 'modeinc'], ['Flow', 'flowbig']] },
    { k: 'network', label: 'Network', icon: 'map', title: 'Network', sub: 'Roads, rail and the places they serve', subs: [['Transit', 'boards'], ['Roads', 'vmt']] },
    { k: 'explore', label: 'Explore', icon: 'explore', title: 'Explore', sub: 'Free-form analysis', stub: true },
  ];
  WF.PAGE_TILES = {
    summary: [['trace', 'diff'], ['years', 'lines'], ['score', 'matrix'], ['rank', 'bars'], ['mix', 'tree'], ['share', 'bars'], ['fp', 'radar'], ['time', 'lines'], ['zones', 'map'], ['flows', 'chord']],
    hh: [['hh', 'waffle'], ['pyramid', 'pyr'], ['modeinc', 'bars']],
    tours: [['tlfd', 'ridge'], ['time', 'heat'], ['flows', 'chord']],
    mode: [['share', 'bars'], ['modeinc', 'bars'], ['flowbig', 'flow'], ['time', 'stream'], ['mix', 'sun']],
    network: [['zones', 'map'], ['boards', 'db'], ['speed', 'heat'], ['vmt', 'tree']],
  };

  /* legends */
  WF.legendFor = (kind, c) => {
    const k = WF.K(), t = WF.tok();
    if (kind === 'scn') return WF.legendHTML(c.active, c.ref);
    if (kind === 'mode') return WF.modeLegend();
    if (kind === 'trace') { const m = WF.traceMeta(c.group || 'mode'); return m.names.map((n, i) => `<span class="lg"><i style="background:${m.color(i)}"></i>${n}</span>`).join('') + `<span class="lg"><i style="background:var(--ok)"></i>${m.tolLabel}</span>`; }
    if (kind === 'sub') return ['Auto ownership', 'Activity pattern', 'Work location', 'School location', 'Tour mode', 'Tour timing', 'Stop frequency', 'Trip mode'].map((n, i) => `<span class="lg"><i style="background:${i < 7 ? k.cat(i) : WF.U.mix(t.surface, t.ink, .5)}"></i>${n}</span>`).join('') + '<span class="lg"><i style="background:var(--ok)"></i>3% tolerance</span>';
    if (kind === 'purpose') return D.PURP.map((p, i) => `<span class="lg"><i style="background:${k.cat(i)}"></i>${p}</span>`).join('');
    if (kind === 'income') { const rp = k.ramp(k.P, 4, .55); return D.INC.map((n, i) => `<span class="lg"><i style="background:${rp[i]}"></i>${n}</span>`).join(''); }
    if (kind === 'diverge') { const pal = WF.palette(), mid = WF.U.mix(t.surface, t.ink, .16); return `<span class="lg" style="gap:8px">Lower than ${c.ref === 'Observed' ? 'observed' : WF.L(c.ref)}<i style="width:120px;height:8px;border-radius:4px;background:linear-gradient(90deg,${pal[1]},${mid},${pal[0]})"></i>Higher</span>`; }
    return '';
  };
  WF.hiScn = (root, name) => {
    const cols = new Map(); WF.SC.forEach((s) => cols.set(WF.scColor(s).toLowerCase(), s));
    root.querySelectorAll('svg *').forEach((e) => { const sn = cols.get((e.getAttribute('fill') || '').toLowerCase()) || cols.get((e.getAttribute('stroke') || '').toLowerCase()); if (!sn) return; e.style.opacity = !name || sn === name ? '' : '.14'; e.style.transition = 'opacity .12s'; });
  };

  /* side-by-side renderer: the reference first, then the compared scenarios, a page of up to cap at a time */
  function renderMulti(view, cc, body, w, h, st) {
    const cap = view.cap || 4, ref = cc.ref, set = WF.SC.filter((s) => cc.active.has(s) && s !== ref);
    const per = Math.max(1, cap - 1), pages = Math.max(1, Math.ceil(set.length / per)); st.pg = Math.min(st.pg || 0, pages - 1);
    const items = [ref, ...set.slice(st.pg * per, st.pg * per + per)];
    const n = items.length, pagerH = pages > 1 ? 30 : 0, gap = 10, cols = w < 480 ? 1 : n <= 2 ? n : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    const cw = Math.floor((w - gap * (cols - 1)) / cols), chh = Math.max(150, Math.floor((h - pagerH - gap * (rows - 1)) / rows));
    body.innerHTML = ''; body.style.overflow = 'auto';
    if (view.mapSync) { st.mg = st.mg || 'mg' + Math.random().toString(36).slice(2, 7); WF.mapSync.start(st.mg); }
    const grid = document.createElement('div'); grid.className = 'wf-multi'; grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:${gap}px`; body.appendChild(grid);
    items.forEach((s) => {
      const cell = document.createElement('div'); cell.dataset.s = s; cell.dataset.c = s === 'Observed' ? 'var(--ink)' : WF.scColor(s); cell.style.cssText = `position:relative;height:${chh}px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--tile-hi,var(--surface))`;
      const cap2 = document.createElement('div'); cap2.style.cssText = 'position:absolute;left:10px;top:8px;z-index:7;display:flex;gap:7px;align-items:center;font-size:12px;font-weight:600;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:2px 10px 2px 8px;max-width:calc(100% - 20px)';
      cap2.innerHTML = `<i style="width:9px;height:9px;border-radius:50%;background:${s === 'Observed' ? 'var(--ink)' : WF.scColor(s)}"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${WF.L(s)}</span>${s === ref ? '<span style="color:var(--mute);font-weight:400">reference</span>' : ''}`;
      const inner = document.createElement('div'); inner.style.cssText = `position:absolute;inset:34px 6px 6px 6px`; cell.append(inner, cap2); grid.appendChild(cell);
      const c2 = Object.create(cc); c2.focus = s; c2.active = new Set([s]); c2.mapGroup = st.mg; c2.diff = view.cmp.includes('diff') && cc.diff !== 'val' && s !== ref ? cc.diff : 'val';
      const ww = cw - 12, hh = chh - 40; try { (view.fnCell || view.fn)(inner, c2, ww, hh); } catch (e) { inner.textContent = e.message; }
    });
    if (view.mapSync) { const bar = document.createElement('div'); bar.style.cssText = 'position:absolute;right:14px;top:12px;display:flex;align-items:center;gap:8px;z-index:9';
      bar.innerHTML = `<span style="font-size:12px;color:var(--mute);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:3px 10px">Zoom and pan are linked</span><div style="display:flex;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden">${[['+','Zoom in'],['−','Zoom out'],['⌂','Reset view']].map(([t, a], i) => `<button data-z="${i}" aria-label="${a}" style="width:30px;height:30px;border:0;background:transparent;color:var(--ink);cursor:pointer;font-size:15px${i ? ';border-left:1px solid var(--line)' : ''}">${t}</button>`).join('')}</div>`;
      body.style.position = 'relative'; body.appendChild(bar);
      bar.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => { const i = +b.dataset.z; if (i === 2) WF.mapSync.reset(st.mg); else WF.mapSync.zoomBy(st.mg, i ? 1 / 1.6 : 1.6); })); }
    const cellsEl = [...grid.children], clear = () => { grid.classList.remove('syncing'); grid.querySelectorAll('.sync').forEach((x) => x.classList.remove('sync')); WF.TT.hide(); };
    grid.addEventListener('mousemove', (e) => {
      const t = e.target.closest && e.target.closest('[data-key]'); if (!t || !grid.contains(t)) { clear(); return; }
      const key = t.dataset.key, hit = cellsEl.map((cl) => [...cl.querySelectorAll('[data-key]')].filter((x) => x.dataset.key === key));
      grid.classList.add('syncing'); grid.querySelectorAll('.sync').forEach((x) => x.classList.remove('sync')); hit.forEach((a) => a.forEach((x) => x.classList.add('sync')));
      const ref0 = hit[0] && hit[0][0], rn = ref0 ? +ref0.dataset.num : null, rel = t.dataset.rel === '1', unit = t.dataset.unit || '';
      const rows = cellsEl.map((cl, i) => { const el = hit[i] && hit[i][0]; if (!el) return null; const num = +el.dataset.num, d = i > 0 && rn != null && isFinite(rn) ? (rel ? (rn ? ((num / rn - 1) * 100) : 0) : num - rn) : null;
        return { k: WF.L(cl.dataset.s) + (i === 0 ? ' · reference' : ''), v: el.dataset.val, c: cl.dataset.c, b: i === 0, d: d == null ? '' : (d > 0.005 ? '+' : d < -0.005 ? '−' : '') + Math.abs(d).toFixed(1) + (rel ? '%' : unit), dc: 'var(--mute)' }; }).filter(Boolean);
      WF.TT.show({ title: t.dataset.title, sub: rows.length + ' scenarios', rows }, { clientX: e.clientX, clientY: e.clientY, target: document.body });
    });
    grid.addEventListener('mouseleave', clear);
    if (pages > 1) { const pg = document.createElement('div'); pg.style.cssText = 'display:flex;align-items:center;gap:10px;justify-content:flex-end;margin-top:8px;font-size:12.5px;color:var(--mute)';
      pg.innerHTML = `<span>Scenarios ${st.pg * per + 1}–${Math.min(set.length, st.pg * per + per)} of ${set.length}</span><button class="mini" ${st.pg ? '' : 'disabled'} data-pg="-1" aria-label="Previous scenarios">‹</button><button class="mini" ${st.pg < pages - 1 ? '' : 'disabled'} data-pg="1" aria-label="Next scenarios">›</button>`; body.appendChild(pg);
      pg.querySelectorAll('[data-pg]').forEach((b) => (b.onclick = () => { st.pg += +b.dataset.pg; renderMulti(view, cc, body, w, h, st); })); }
  }

  /* mount: draws one view into body, wires legends and resize. st = per-tile state {strat, sw, pg} */
  const reg = [];
  WF.clearTiles = () => { reg.length = 0; };
  WF.redrawAll = () => reg.forEach((r) => r());
  WF.mountTile = (id, viewKey, group, body, legendEl, ctx, st) => {
    st = st || {};
    const tile = WF.TILES[id], vs = WF.viewsFor(tile, ctx.compare), view = vs.find((v) => v.k === viewKey) || vs[0];
    const cmps = ctx.compare && !tile.indep ? view.cmp : [], strat = cmps.includes(st.strat) ? st.strat : cmps[0] || null;
    const cc = Object.create(ctx); cc.group = group || (tile.groups && tile.groups[0].k) || null;
    if (!ctx.compare) { cc.active = new Set([ctx.focus]); cc.diff = 'val'; cc.compare = false; }
    else if (strat === 'diff') { cc.active = new Set([ctx.focus]); cc.diff = ctx.diff === 'val' ? 'abs' : ctx.diff; }
    else if (strat === 'switch') { cc.focus = st.sw && ctx.active.has(st.sw) ? st.sw : ctx.focus; cc.active = new Set([cc.focus]); cc.diff = 'val'; }
    else if (strat === 'multi' || strat === 'grid') { cc.diff = ctx.diff; }
    else if (tile.indep) { cc.active = new Set([ctx.focus]); cc.diff = 'val'; }
    const multi = strat === 'multi' || strat === 'grid';
    const k0 = typeof view.leg === 'function' ? view.leg(cc) : view.leg, kind = multi ? (k0 === 'scn' ? null : k0) : k0;
    if (legendEl) {
      legendEl.innerHTML = kind ? WF.legendFor(kind, cc) : ''; legendEl.hidden = !kind;
      legendEl.querySelectorAll('[data-lm]').forEach((l) => { l.onmouseenter = () => WF.hi(l.dataset.lm); l.onmouseleave = () => WF.hi(null); });
      legendEl.querySelectorAll('[data-sc]').forEach((l) => { l.onmouseenter = () => WF.hiScn(body, l.dataset.sc); l.onmouseleave = () => WF.hiScn(body, null); });
    }
    const run = () => { const [w, h] = WF.box(body); if (w > 20 && h > 20) { try { body.style.overflow = ''; if (multi) renderMulti(view, cc, body, w, h, st); else view.fn(body, cc, w, h); } catch (e) { body.textContent = 'This chart could not be drawn: ' + e.message; console.error(e); } } };
    run(); reg.push(run); WF.watch(body, run);
    return { view, strat, cmps, cc };
  };
})();
