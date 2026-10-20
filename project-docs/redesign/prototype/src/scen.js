/* scen.js: fifteen sample scenarios defined by their effect on the baseline. Everything else is derived. */
(function () {
  const BASE = [64.9, 21.5, 2.8, 8.0, 1.0, 1.8], BOARD0 = [36.9, 22.8, 12.1, 18.4, 9.9, 6.6];
  // name, tag, mode-share deltas (pp), trips M, VMT M, boardings multipliers per line, trip length x, zero-car x, zone {rail, core}, speed x, time-of-day effect, flow x
  const DEF = [
    ['Baseline', 'Base case', [0, 0, 0, 0, 0, 0], 9.86, 61.4, [1, 1, 1, 1, 1, 1], 1.03, 1, [0, 0], 1, {}, 1],
    ['Frequent transit', 'Transit', [-3.7, -.5, 3.2, .6, .3, .1], 9.81, 58.9, [1.67, 1.5, 1.87, 1.62, 1.33, 1.44], 1.07, 1.28, [6.5, 0], 1.03, {}, 1.06],
    ['Express bus', 'Transit', [-1.4, -.2, 1.3, .2, .1, 0], 9.85, 60.5, [1.05, 1.04, 1.04, 1.1, 1.5, 1.4], 1.04, 1.08, [2.2, .5], 1.01, {}, 1.02],
    ['BRT corridor', 'Transit', [-2.2, -.3, 2.0, .4, .1, 0], 9.84, 59.9, [1.1, 1.05, 1.05, 1.12, 1.8, 1.3], 1.03, 1.12, [4.0, .6], 1.02, {}, 1.03],
    ['Light rail extension', 'Transit', [-2.8, -.4, 2.6, .4, .2, 0], 9.84, 59.2, [1.45, 1.2, 1.2, 1.3, 1.1, 1.1], 1.04, 1.18, [5, 1.2], 1.02, {}, 1.04],
    ['Fare-free transit', 'Pricing', [-1.6, -.3, 1.9, 0, 0, 0], 9.86, 60.2, [1.35, 1.3, 1.3, 1.25, 1.4, 1.5], 1.0, 1.12, [2.4, 1.8], 1.01, {}, 1.02],
    ['Parking pricing', 'Pricing', [-3.0, .8, 1.1, .7, .3, .1], 9.78, 58.4, [1.22, 1.18, 1.2, 1.22, 1.2, 1.2], .97, 1.15, [1.2, 2.8], 1.02, { pm: .96 }, .99],
    ['Congestion pricing', 'Pricing', [-3.4, .6, 1.4, 1.0, .4, 0], 9.74, 57.9, [1.3, 1.25, 1.25, 1.3, 1.35, 1.3], .96, 1.2, [1.4, 3.0], 1.06, { am: .95, pm: .94 }, 1],
    ['Infill density', 'Land use', [-4.4, -.2, 1.6, 2.8, .6, -.4], 9.93, 57.6, [1.28, 1.18, 1.31, 1.18, 1.19, 1.26], .9, 1.22, [1.5, 3.2], .97, {}, .94],
    ['Job-center density', 'Land use', [-2.6, -.2, 1.2, 1.4, .2, 0], 9.90, 59.1, [1.15, 1.1, 1.1, 1.1, 1.12, 1.1], .94, 1.12, [1.2, 2.2], .98, {}, .97],
    ['Remote work', 'Behavior', [-1.0, -.2, -.1, .9, .3, .1], 9.62, 59.6, [.93, .92, .92, .9, .94, .95], 1.05, 1, [0, -.4], 1.04, { am: .88, mid: 1.15, pm: .9 }, 1],
    ['Road diet', 'Roads', [-1.2, -.1, .5, .5, .3, 0], 9.87, 60.1, [1.08, 1.06, 1.06, 1.1, 1.12, 1.1], .98, 1.05, [.6, .8], .96, {}, 1],
    ['Bike network', 'Roads', [-1.2, -.1, .2, .2, .9, 0], 9.88, 60.4, [1.04, 1.04, 1.04, 1.05, 1.06, 1.05], .97, 1.04, [.4, .8], 1, {}, 1],
    ['Autonomous vehicles', 'Technology', [2.6, .9, -1.7, -1.4, -.4, 0], 10.12, 66.8, [.82, .82, .82, .8, .85, .85], 1.12, .8, [-1.5, -1], 1.08, { am: 1.05, pm: 1.06 }, 1.02],
    ['Combined package', 'Package', [-6.4, -.6, 4.6, 1.7, .9, -.2], 9.86, 54.9, [1.9, 1.6, 1.6, 1.7, 1.9, 1.8], 1.0, 1.4, [8, 4], 1.02, {}, 1.08],
  ];
  const S = { SC: DEF.map((d) => d[0]), IDX: {}, SHARE: { Observed: [63.8, 22.1, 3.1, 8.4, 1.2, 1.4] }, TRIPS: { Observed: 9.82 }, VMT: { Observed: 61.9 }, BOARD: { Observed: [38.2, 21.4, 12.9, 17.6, 9.4, 7.1] },
    TL: { Observed: 1 }, A0F: { Observed: .91 }, ZFX: { Observed: [0, 0] }, SPEED: { Observed: 1 }, TODFX: {}, TAG: {}, FLOWT: { Observed: 1 },
    PAL: ['#8A94A6', '#4C8BF5', '#F2994A', '#2FBF8A', '#EB5757', '#A66CFF', '#18B4C8', '#E8C547', '#E26BA6', '#9C7A5B', '#7BC043', '#5865F2', '#B5179E', '#00897B', '#8E9E2A'],
    SAFE: ['#8C8C8C', '#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#F0E442', '#4D4D4D', '#004B7A', '#B37700', '#00694D', '#9E4400', '#A5548A', '#99D3F5'] };
  DEF.forEach(([n, tag, d, tr, vm, bm, tl, a0, z, sp, tf, fl], i) => {
    S.IDX[n] = i; S.SHARE[n] = BASE.map((v, k) => +(v + d[k]).toFixed(1)); S.TRIPS[n] = tr; S.VMT[n] = vm; S.BOARD[n] = BOARD0.map((v, k) => +(v * bm[k]).toFixed(1));
    S.TL[n] = tl; S.A0F[n] = a0; S.ZFX[n] = z; S.SPEED[n] = sp; S.TODFX[n] = tf; S.TAG[n] = tag; S.FLOWT[n] = fl;
  });

  /* calibration rounds: an ordered family that converges on the base case, with noise that fades as it settles */
  const rr = (seed) => { let q = seed; return () => { q = (q * 16807) % 2147483647; return q / 2147483647; }; };
  const R = rr(42), N = 50, FINAL = [1.4, 2.2, 2.6, 3.9, 1.7, 4.6, 5.8, 2.9], START = [7.5, 8.2, 9.0, 10.5, 9.6, 11.8, 12.5, 8.8], DEV = [7.5, -3.2, -1.2, -1.8, -.5], CALR = {};
  S.ROUND = {}; S.FAM = { cal: { label: 'Calibration rounds', names: [], n: N } };
  for (let r = 1; r <= N; r++) {
    const name = 'Round ' + r, k = Math.pow(.88, r - 1), nz = Math.sqrt(k);
    const d = DEV.map((v) => v * k + (R() - .5) * .9 * nz), sb = -d.reduce((a, b) => a + b, 0);
    S.SC.push(name); S.ROUND[name] = r; S.FAM.cal.names.push(name); S.TAG[name] = 'Calibration round'; S.IDX[name] = 99;
    S.SHARE[name] = BASE.map((v, i) => +(v + (i < 5 ? d[i] : sb)).toFixed(2));
    S.TRIPS[name] = +(9.86 * (1 + .045 * k)).toFixed(3); S.VMT[name] = +(61.4 * (1 + .08 * k)).toFixed(2); S.BOARD[name] = BOARD0.map((v) => +(v * (1 - .4 * k)).toFixed(1));
    S.TL[name] = 1.03 * (1 + .07 * k); S.A0F[name] = 1 + .45 * k; S.ZFX[name] = [0, 0]; S.SPEED[name] = 1 - .06 * k; S.TODFX[name] = { am: 1 + .3 * k, pm: 1 - .12 * k }; S.FLOWT[name] = 1;
    CALR[name] = FINAL.map((e, i) => Math.max(.3, +(e + (START[i] - e) * k + (R() - .5) * .5 * nz).toFixed(2)));
  }
  S.CALR = (n) => CALR[n] || FINAL;
  S.OBS = { share: { src: '2023 household travel survey', n: 'n = 14,820 households', moe: [1.4, 1.1, .5, .9, .3, .4] }, boards: { src: '2023 on-board transit survey and APC counts', n: '41,300 boardings sampled' }, vmt: { src: 'UDOT traffic counts, 2023', n: '1,240 count stations' }, auto: { src: '2023 household travel survey', n: 'n = 14,820 households' } };

  /* milestone years: every alternative has a run for each model year. Alternatives differ more as the plan builds out, and growth lifts every volume. */
  S.YEARS = [{ y: 2023, label: 'Base year' }, { y: 2027, label: 'Opening year' }, { y: 2032, label: 'End of STIP' }, { y: 2036, label: 'End of RTP Phase I' }, { y: 2046, label: 'End of RTP Phase II' }, { y: 2055, label: 'Horizon year' }];
  const GT = { 2023: 1, 2027: 1.07, 2032: 1.16, 2036: 1.24, 2046: 1.4, 2055: 1.52 }, GV = { 2023: 1, 2027: 1.08, 2032: 1.19, 2036: 1.29, 2046: 1.48, 2055: 1.63 }, GB = { 2023: 1, 2027: 1.12, 2032: 1.3, 2036: 1.45, 2046: 1.8, 2055: 2.1 }, EF = { 2023: 0, 2027: .3, 2032: .6, 2036: .85, 2046: 1.1, 2055: 1.3 };
  S.BASEYEAR = 2023; S.year = 2023;
  const P = {}; DEF.forEach(([n, tag, d, tr, vm, bm, tl, a0, z, sp, tf, fl]) => { P[n] = { d, tr, vm, bm, tl, a0, z, sp, tf, fl }; });
  const at = (n, y) => { const p = P[n], e = EF[y], gt = GT[y], gv = GV[y], gb = GB[y];
    return { share: BASE.map((v, k) => +(v + p.d[k] * e).toFixed(2)), trips: +(9.86 * gt * (1 + (p.tr / 9.86 - 1) * e)).toFixed(3), vmt: +(61.4 * gv * (1 + (p.vm / 61.4 - 1) * e)).toFixed(2), board: BOARD0.map((v, k) => +(v * gb * (1 + (p.bm[k] - 1) * e)).toFixed(1)),
      tl: 1.03 * (1 + (p.tl / 1.03 - 1) * e) * (1 + .05 * (gt - 1)), a0: 1 + (p.a0 - 1) * e, z: [p.z[0] * e, p.z[1] * e], sp: Math.max(.6, 1 + (p.sp - 1) * e - .18 * (gv - 1)), tf: Object.fromEntries(Object.entries(p.tf).map(([k, v]) => [k, 1 + (v - 1) * e])), fl: 1 + (p.fl - 1) * e }; };
  S.setYear = (y) => { S.year = y; DEF.forEach(([n]) => { const v = at(n, y); S.SHARE[n] = v.share; S.TRIPS[n] = v.trips; S.VMT[n] = v.vmt; S.BOARD[n] = v.board; S.TL[n] = v.tl; S.A0F[n] = v.a0; S.ZFX[n] = v.z; S.SPEED[n] = v.sp; S.TODFX[n] = v.tf; S.FLOWT[n] = v.fl; }); };
  /* a metric for any scenario in any model year, without changing the current year */
  S.valAt = (n, y, k) => { const v = at(n, y); return { trips: v.trips, drive: v.share[0], transit: v.share[2], active: v.share[3] + v.share[4], vmt: v.vmt, boards: d3.sum(v.board), len: 7.6 * v.tl }[k]; };
  window.SCN = S;
})();
