"""Build the synthetic demo data for the 063 UI redesign (Corridor Pro prototype).

Ports the data model of project-docs/redesign/prototype/src/{scen,core,core2,core3}.js
to deterministic Python and writes REAL Parquet files, so the real app
(DuckDB-WASM reading Parquet) can draw every chart in the prototype.

Writes (all under public/):
  demo-synthetic/scenarios/<slug>[-<year>]/        15 alternatives x 6 model years = 90 scenario runs
  demo-synthetic/scenarios/observed-2023/          the Observed reference (kind: observed)
  demo-synthetic/scenarios/round-01 .. round-50/   calibration rounds (kind: round, family: calibration)
  demo-synthetic/scenarios/families/calibration/calibration_by_round.parquet   roll-up (NOT a run)
  demo-synthetic/scenarios/index.json              new runs first, then the six real activitysim-* runs
  demo-geometry/wasatch-zones.geoparquet 150-ish jittered-grid TAZ polygons (WKB, WGS84)
  demo-geometry/wasatch-rail.geoparquet  rail polyline + station points

Every run folder holds manifest.yaml + summary/*.parquet + summary/index.json.
All numbers are SYNTHETIC. Existing activitysim-* folders are never touched.

Run (idempotent, deterministic, no network, no spatial extension):

    python scripts/build-demo-redesign-data.py

Needs only duckdb, numpy, PyYAML and the stdlib.
"""

from __future__ import annotations

import json
import math
import shutil
import struct
from pathlib import Path

import duckdb
import numpy as np
import yaml

ROOT = Path(__file__).resolve().parent.parent
SCEN_DIR = ROOT / "public" / "demo-synthetic" / "scenarios"
GEO_DIR = ROOT / "public" / "demo-geometry"
EXISTING = [
    "activitysim-baseline", "activitysim-density-variant", "activitysim-transit-variant",
    "activitysim-baseline-2036", "activitysim-density-variant-2036",
    "activitysim-transit-variant-2036",
]

# --------------------------------------------------------------------------- constants (scen.js, core.js, core2.js)
MODES = ["Drive alone", "Shared ride", "Transit", "Walk", "Bike", "School bus"]
PURP = ["Work", "School", "Shopping", "Other", "Non-home"]
PT = [1420, 980, 1310, 2540, 3610]
SEED = [[84, 8, 4.2, 2.6, 1.2, 0], [9, 31, 3, 13, 1, 43], [68, 25.6, 1.6, 4, .8, 0],
        [66, 25.5, 1.9, 5.3, 1, .3], [69, 23, 2.1, 5, .7, .2]]
INC = ["Under $35k", "$35k to $75k", "$75k to $125k", "Over $125k"]
HHK = [164, 219, 283, 246]
AUTOS = ["0 cars", "1 car", "2 cars", "3 cars", "4+ cars"]
AUTO_SEED = [[27, 46, 21, 5, 1], [7, 36, 41, 12, 4], [2, 21, 50, 19, 8], [1, 12, 43, 28, 16]]
MODE_INC = [[48, 24, 7, 12, 1.2, 7.8], [60, 23, 3.5, 8, 1.1, 4.4], [68, 21, 2.4, 5.5, 1, 2.1],
            [72, 21, 1.5, 3.5, .9, 1.1]]
INCSH = [.14, .23, .33, .30]
BAND = ["Under 2 mi", "2 to 8 mi", "Over 8 mi"]
BANDSH = [[.18, .47, .35], [.22, .46, .32], [.04, .46, .5], [.9, .1, 0], [.5, .5, 0], [.1, .72, .18]]
DIST = ["Weber", "Davis", "Salt Lake", "Utah", "Tooele"]
FLOW = [[820, 120, 25, 4, .5], [118, 790, 90, 6, .7], [22, 95, 3100, 160, 22], [3, 5, 150, 1500, 3],
        [.4, .6, 20, 2, 140]]
CAL_SHORT = ["Auto ownership", "Activity pattern", "Work location", "School location", "Tour mode",
             "Tour timing", "Stop frequency", "Trip mode"]
COUNTY = ["Salt Lake", "Utah", "Davis", "Weber", "Tooele", "External"]
COUNTY_V = [26.8, 15.1, 8.0, 6.9, 2.3, 2.3]
FAC = ["Freeway", "Arterial", "Collector", "Local"]
FAC_SH = [[.44, .37, .12, .07], [.38, .38, .15, .09], [.46, .36, .12, .06], [.35, .4, .16, .09],
          [.5, .3, .12, .08], [.7, .22, .06, .02]]
LINES = ["Blue Line (rail)", "Red Line (rail)", "Green Line (rail)", "FrontRunner",
         "Route 200 (bus)", "Route 2 (bus)"]
AGES = ["0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49",
        "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80+"]
AGEW = [8.2, 8.4, 8.3, 8.0, 8.6, 9.0, 8.7, 8.0, 7.0, 6.1, 5.4, 4.8, 4.2, 3.4, 2.5, 1.7, 1.5]
TLP = {"Work": [2.6, 4.4], "School": [2.2, 2.2], "Shopping": [1.9, 2.6], "Other": [1.8, 3.6],
       "Non-home": [1.7, 3.8]}
PUR_TOD = {"Work": [[7.2, 1.1, 1], [16.6, 1.5, .85], [12, 2, .18]],
           "School": [[7.6, .7, 1], [14.8, .9, .8], [16, 2, .12]],
           "Shopping": [[10.8, 2, .8], [17.2, 2.2, 1], [13.5, 2, .5]],
           "Other": [[8.3, 1.4, .5], [12.5, 2.5, .6], [17.8, 2.6, 1]],
           "Non-home": [[7.8, 1.3, .7], [12.2, 2.2, .85], [16.9, 1.8, 1]]}
TOD_P = {"Observed": [7.5, 1, 12.5, 0.62, 16.8, 1.05], "Baseline": [7.7, 1.08, 12.4, 0.6, 16.9, 1.0],
         "Frequent transit": [7.6, 1.03, 12.5, 0.62, 16.8, 0.99],
         "Infill density": [7.5, 0.99, 12.6, 0.64, 16.7, 1.04]}

BASE = [64.9, 21.5, 2.8, 8.0, 1.0, 1.8]
BOARD0 = [36.9, 22.8, 12.1, 18.4, 9.9, 6.6]
# name, tag, mode-share deltas (pp), trips M, VMT M, boardings multipliers, trip length x, zero-car x,
# zone {rail, core}, speed x, time-of-day effect, flow x
DEF = [
    ["Baseline", "Base case", [0, 0, 0, 0, 0, 0], 9.86, 61.4, [1, 1, 1, 1, 1, 1], 1.03, 1, [0, 0], 1, {}, 1],
    ["Frequent transit", "Transit", [-3.7, -.5, 3.2, .6, .3, .1], 9.81, 58.9, [1.67, 1.5, 1.87, 1.62, 1.33, 1.44], 1.07, 1.28, [6.5, 0], 1.03, {}, 1.06],
    ["Express bus", "Transit", [-1.4, -.2, 1.3, .2, .1, 0], 9.85, 60.5, [1.05, 1.04, 1.04, 1.1, 1.5, 1.4], 1.04, 1.08, [2.2, .5], 1.01, {}, 1.02],
    ["BRT corridor", "Transit", [-2.2, -.3, 2.0, .4, .1, 0], 9.84, 59.9, [1.1, 1.05, 1.05, 1.12, 1.8, 1.3], 1.03, 1.12, [4.0, .6], 1.02, {}, 1.03],
    ["Light rail extension", "Transit", [-2.8, -.4, 2.6, .4, .2, 0], 9.84, 59.2, [1.45, 1.2, 1.2, 1.3, 1.1, 1.1], 1.04, 1.18, [5, 1.2], 1.02, {}, 1.04],
    ["Fare-free transit", "Pricing", [-1.6, -.3, 1.9, 0, 0, 0], 9.86, 60.2, [1.35, 1.3, 1.3, 1.25, 1.4, 1.5], 1.0, 1.12, [2.4, 1.8], 1.01, {}, 1.02],
    ["Parking pricing", "Pricing", [-3.0, .8, 1.1, .7, .3, .1], 9.78, 58.4, [1.22, 1.18, 1.2, 1.22, 1.2, 1.2], .97, 1.15, [1.2, 2.8], 1.02, {"pm": .96}, .99],
    ["Congestion pricing", "Pricing", [-3.4, .6, 1.4, 1.0, .4, 0], 9.74, 57.9, [1.3, 1.25, 1.25, 1.3, 1.35, 1.3], .96, 1.2, [1.4, 3.0], 1.06, {"am": .95, "pm": .94}, 1],
    ["Infill density", "Land use", [-4.4, -.2, 1.6, 2.8, .6, -.4], 9.93, 57.6, [1.28, 1.18, 1.31, 1.18, 1.19, 1.26], .9, 1.22, [1.5, 3.2], .97, {}, .94],
    ["Job-center density", "Land use", [-2.6, -.2, 1.2, 1.4, .2, 0], 9.90, 59.1, [1.15, 1.1, 1.1, 1.1, 1.12, 1.1], .94, 1.12, [1.2, 2.2], .98, {}, .97],
    ["Remote work", "Behavior", [-1.0, -.2, -.1, .9, .3, .1], 9.62, 59.6, [.93, .92, .92, .9, .94, .95], 1.05, 1, [0, -.4], 1.04, {"am": .88, "mid": 1.15, "pm": .9}, 1],
    ["Road diet", "Roads", [-1.2, -.1, .5, .5, .3, 0], 9.87, 60.1, [1.08, 1.06, 1.06, 1.1, 1.12, 1.1], .98, 1.05, [.6, .8], .96, {}, 1],
    ["Bike network", "Roads", [-1.2, -.1, .2, .2, .9, 0], 9.88, 60.4, [1.04, 1.04, 1.04, 1.05, 1.06, 1.05], .97, 1.04, [.4, .8], 1, {}, 1],
    ["Autonomous vehicles", "Technology", [2.6, .9, -1.7, -1.4, -.4, 0], 10.12, 66.8, [.82, .82, .82, .8, .85, .85], 1.12, .8, [-1.5, -1], 1.08, {"am": 1.05, "pm": 1.06}, 1.02],
    ["Combined package", "Package", [-6.4, -.6, 4.6, 1.7, .9, -.2], 9.86, 54.9, [1.9, 1.6, 1.6, 1.7, 1.9, 1.8], 1.0, 1.4, [8, 4], 1.02, {}, 1.08],
]
PAL = ["#8A94A6", "#4C8BF5", "#F2994A", "#2FBF8A", "#EB5757", "#A66CFF", "#18B4C8", "#E8C547",
       "#E26BA6", "#9C7A5B", "#7BC043", "#5865F2", "#B5179E", "#00897B", "#8E9E2A"]
YEARS = [2023, 2027, 2032, 2036, 2046, 2055]
GT = {2023: 1, 2027: 1.07, 2032: 1.16, 2036: 1.24, 2046: 1.4, 2055: 1.52}
GV = {2023: 1, 2027: 1.08, 2032: 1.19, 2036: 1.29, 2046: 1.48, 2055: 1.63}
GB = {2023: 1, 2027: 1.12, 2032: 1.3, 2036: 1.45, 2046: 1.8, 2055: 2.1}
EF = {2023: 0, 2027: .3, 2032: .6, 2036: .85, 2046: 1.1, 2055: 1.3}
OBS_SHARE_MOE = [1.4, 1.1, .5, .9, .3, .4]
RUN_DATE = "2026-09-08"
DEMO_NOTE = "DEMO DATA: synthetic, generated by scripts/build-demo-redesign-data.py"


def slug(name: str) -> str:
    return name.lower().replace(" ", "-")


def r_(x, n):
    return round(x, n)


# --------------------------------------------------------------------------- run states
def state_observed():
    return dict(preset="Observed", share=[63.8, 22.1, 3.1, 8.4, 1.2, 1.4], trips=9.82, vmt=61.9,
                board=[38.2, 21.4, 12.9, 17.6, 9.4, 7.1], tl=1.0, a0=.91, z=[0, 0], sp=1.0,
                tf={}, fl=1.0, calr=None)


def state_at(i, year):
    name, tag, d, tr, vm, bm, tl, a0, z, sp, tf, fl = DEF[i]
    e, gt, gv, gb = EF[year], GT[year], GV[year], GB[year]
    return dict(
        preset=name,
        share=[r_(v + d[k] * e, 2) for k, v in enumerate(BASE)],
        trips=r_(9.86 * gt * (1 + (tr / 9.86 - 1) * e), 3),
        vmt=r_(61.4 * gv * (1 + (vm / 61.4 - 1) * e), 2),
        board=[r_(v * gb * (1 + (bm[k] - 1) * e), 1) for k, v in enumerate(BOARD0)],
        tl=1.03 * (1 + (tl / 1.03 - 1) * e) * (1 + .05 * (gt - 1)),
        a0=1 + (a0 - 1) * e, z=[z[0] * e, z[1] * e],
        sp=max(.6, 1 + (sp - 1) * e - .18 * (gv - 1)),
        tf={k: 1 + (v - 1) * e for k, v in tf.items()}, fl=1 + (fl - 1) * e,
        calr=list(FINAL))


FINAL = [1.4, 2.2, 2.6, 3.9, 1.7, 4.6, 5.8, 2.9]
START = [7.5, 8.2, 9.0, 10.5, 9.6, 11.8, 12.5, 8.8]
DEV = [7.5, -3.2, -1.2, -1.8, -.5]


def build_rounds(n=50):
    q = [42]

    def R():
        q[0] = (q[0] * 16807) % 2147483647
        return q[0] / 2147483647

    out = []
    for r in range(1, n + 1):
        k = .88 ** (r - 1)
        nz = math.sqrt(k)
        d = [v * k + (R() - .5) * .9 * nz for v in DEV]
        sb = -sum(d)
        share = [r_(v + (d[i] if i < 5 else sb), 2) for i, v in enumerate(BASE)]
        calr = [max(.3, r_(e + (START[i] - e) * k + (R() - .5) * .5 * nz, 2)) for i, e in enumerate(FINAL)]
        out.append(dict(preset="Baseline", share=share, trips=r_(9.86 * (1 + .045 * k), 3),
                        vmt=r_(61.4 * (1 + .08 * k), 2), board=[r_(v * (1 - .4 * k), 1) for v in BOARD0],
                        tl=1.03 * (1 + .07 * k), a0=1 + .45 * k, z=[0, 0], sp=1 - .06 * k,
                        tf={"am": 1 + .3 * k, "pm": 1 - .12 * k}, fl=1.0, calr=calr))
    return out


# --------------------------------------------------------------------------- math helpers (core2.js)
def g(h, m, s):
    return math.exp(-0.5 * ((h - m) / s) ** 2)


def ipf(rows, cols, seed):
    m = [r[:] for r in seed]
    for _ in range(80):
        nm = []
        for i, r in enumerate(m):
            s = sum(r)
            nm.append([v * rows[i] / s if s else 0 for v in r])
        m = nm
        for j in range(len(cols)):
            s = sum(r[j] for r in m)
            for r in m:
                r[j] = r[j] * cols[j] / s if s else 0
    return m


def PM(st):  # thousands of trips: purpose x mode
    tot = st["trips"] * 1000
    return ipf([v * tot / 9860 for v in PT], [s / 100 * tot for s in st["share"]], SEED)


def mode_trips(st):
    m = PM(st)
    return [sum(r[j] for r in m) for j in range(6)]


def auto_row(st, i):
    r = AUTO_SEED[i][:]
    r[0] *= st["a0"]
    s = sum(r)
    return [v / s * 100 for v in r]


def mode_inc(st):
    out = []
    for row in MODE_INC:
        r = [v * st["share"][j] / BASE[j] for j, v in enumerate(row)]
        s = sum(r)
        out.append([v / s * 100 for v in r])
    return out


def pur_tod(p, h):
    return sum(a * g(h, m, s) for m, s, a in PUR_TOD[p]) + .02


MODE_W = {
    "Drive alone": lambda h: 1,
    "Shared ride": lambda h: 1 + .25 * g(h, 12.5, 3) + .2 * g(h, 19, 2),
    "Transit": lambda h: .55 + 1.4 * g(h, 7.5, 1.2) + 1.6 * g(h, 17, 1.4),
    "Walk": lambda h: .7 + .9 * g(h, 12, 2.2) + .7 * g(h, 15, 1.5),
    "Bike": lambda h: .5 + .9 * g(h, 16.5, 2) + .5 * g(h, 8, 1.5),
    "School bus": lambda h: g(h, 7.7, .7) + g(h, 14.8, .8) + .001,
}


def tod(st):  # share (percent) per hour
    p = TOD_P.get(st["preset"], TOD_P["Baseline"])[:]
    fx = st["tf"]
    p[1] *= fx.get("am", 1)
    p[3] *= fx.get("mid", 1)
    p[5] *= fx.get("pm", 1)
    raw = [p[1] * g(h, p[0], 1.3) + p[3] * g(h, p[2], 2.6) + p[5] * g(h, p[4], 1.7)
           + 0.35 * g(h, 21, 2.6) + 0.06 for h in range(24)]
    s = sum(raw)
    return [v / s * 100 for v in raw]


def mode_hour(st):  # thousands
    td = tod(st)
    mt = mode_trips(st)
    out = {}
    for j, m in enumerate(MODES):
        raw = [td[h] * MODE_W[m](h) for h in range(24)]
        k = mt[j] / sum(raw)
        for h in range(24):
            out[(m, h)] = raw[h] * k
    return out


_LGC = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
        .001208650973866179, -5.395239384953e-6]


def lg(z):
    y = x = z
    tmp = x + 5.5
    tmp -= (x + .5) * math.log(tmp)
    s = 1.000000000190015
    for c in _LGC:
        y += 1
        s += c / y
    return -tmp + math.log(2.5066282746310005 * s / x)


def gam(x, k, th):
    return 0 if x <= 0 else math.exp((k - 1) * math.log(x) - x / th - lg(k) - k * math.log(th))


def speed(st, fac, h):
    base = [62, 33, 28, 22][fac]
    dip = [.34, .22, .15, .08][fac]
    return base * st["sp"] * (1 - dip * (g(h, 7.7, 1.4) * .85 + g(h, 17, 1.8)))


def pyramid():
    tot = sum(AGEW)
    P = 2731
    s = [5]

    def rnd():
        s[0] = (s[0] * 16807) % 2147483647
        return s[0] / 2147483647

    rows = []
    for i, a in enumerate(AGES):
        t = AGEW[i] / tot * P
        ms = .5 - (i - 12) * .018 if i > 12 else .506
        om, of = t * ms, t * (1 - ms)
        mm = om * (1 + (rnd() - .5) * .07)
        mf = of * (1 + (rnd() - .5) * .07)
        rows.append((a, om, of, mm, mf))
    return rows


PYR = pyramid()


# --------------------------------------------------------------------------- geometry (jittered quad grid, no shapely)
LON0, LAT0, DLON, DLAT, NX, NY = -112.2, 40.05, 0.065, 0.065, 10, 20
# front-centre longitude and half-width as functions of latitude
_CLAT = [40.05, 40.25, 40.60, 40.76, 41.00, 41.30]
_CLON = [-111.75, -111.72, -111.90, -111.92, -111.95, -111.98]
_HLAT = [40.05, 40.30, 40.76, 41.00, 41.35]
_HW = [.14, .24, .27, .22, .14]
ZONE_ID0, ZONE_ID_STEP = 1000, 7


def front_c(lat):
    return float(np.interp(lat, _CLAT, _CLON))


def build_mesh():
    rng = np.random.default_rng(2024)
    vx = np.zeros((NY + 1, NX + 1))
    vy = np.zeros((NY + 1, NX + 1))
    for j in range(NY + 1):
        for i in range(NX + 1):
            vx[j, i] = LON0 + i * DLON + rng.uniform(-.3, .3) * DLON
            vy[j, i] = LAT0 + j * DLAT + rng.uniform(-.3, .3) * DLAT
    cells = []
    for j in range(NY):
        for i in range(NX):
            clon, clat = LON0 + (i + .5) * DLON, LAT0 + (j + .5) * DLAT
            c = front_c(clat)
            hw = float(np.interp(clat, _HLAT, _HW))
            keep = abs(clon - c) <= hw
            if 40.40 <= clat <= 40.88 and clon < c - hw and clon >= -112.2:  # Tooele arm to the west
                keep = True
            if keep:
                ring = [(vx[j, i], vy[j, i]), (vx[j, i + 1], vy[j, i + 1]),
                        (vx[j + 1, i + 1], vy[j + 1, i + 1]), (vx[j + 1, i], vy[j + 1, i]),
                        (vx[j, i], vy[j, i])]
                cells.append((j, i, ring))
    return cells


def district_of(lon, lat):
    if lon < -112.06 and 40.40 <= lat <= 40.90:
        return "Tooele"
    if lat >= 41.12:
        return "Weber"
    if lat >= 40.86:
        return "Davis"
    if lat >= 40.43:
        return "Salt Lake"
    return "Utah"


def wkb_polygon(ring):
    return struct.pack("<BIII", 1, 3, 1, len(ring)) + b"".join(struct.pack("<dd", x, y) for x, y in ring)


def wkb_line(pts):
    return struct.pack("<BII", 1, 2, len(pts)) + b"".join(struct.pack("<dd", x, y) for x, y in pts)


def wkb_point(x, y):
    return struct.pack("<BIdd", 1, 1, x, y)


STATIONS = ["Provo Central", "Orem Central", "Lehi", "Draper", "Sandy Civic Center", "Murray Central",
            "Salt Lake Central", "North Temple", "Woods Cross", "Farmington", "Layton", "Ogden"]


def build_rail():
    lats = np.linspace(40.26, 41.20, len(STATIONS))
    pts = [(front_c(la) + .02, float(la)) for la in lats]
    # densify with a uniform Catmull-Rom spline through the station points
    dense = []
    P = [pts[0]] + pts + [pts[-1]]
    for k in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[k - 1], P[k], P[k + 1], P[k + 2]
        for s in range(8):
            t = s / 8
            dense.append(tuple(0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t
                                     + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t * t
                                     + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t ** 3) for a in (0, 1)))
    dense.append(pts[-1])
    return pts, dense


def to_km(lon, lat):
    return (lon + 111.9) * 111.32 * math.cos(math.radians(40.7)), (lat - 40.7) * 110.57


def seg_dist(p, line):
    px, py = to_km(*p)
    best = 1e9
    for a, b in zip(line[:-1], line[1:]):
        ax, ay = to_km(*a)
        bx, by = to_km(*b)
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


# zone model scales (prototype pixels -> km); cores: Salt Lake dominant, Ogden and Provo weaker
CORES = [((-111.89, 40.76), 1.0), ((-111.97, 41.22), 1.7), ((-111.66, 40.23), 1.7)]
L_CORE, L_CORE_EFFECT, L_RAIL, L_POP = 18.0, 20.0, 4.0, 25.0   # km (prototype 130px, 160px, 55px, 200px)
ZONE_AMP = 7.5


def build_zones():
    cells = build_mesh()
    rail_pts, rail_dense = build_rail()
    nrng = np.random.default_rng(11)
    zones = []
    for idx, (j, i, ring) in enumerate(cells):
        cx = sum(p[0] for p in ring[:-1]) / 4
        cy = sum(p[1] for p in ring[:-1]) / 4
        dc = min(math.hypot(*[a - b for a, b in zip(to_km(cx, cy), to_km(*c))]) * w for c, w in CORES)
        dr = seg_dist((cx, cy), rail_dense)
        noise = float((nrng.random() - .5) * 1.2)
        zones.append(dict(id=ZONE_ID0 + ZONE_ID_STEP * idx, ring=ring, cx=cx, cy=cy, dc=dc, dr=dr,
                          noise=noise, district=district_of(cx, cy)))
    raw = [1800 + 5200 * math.exp(-z["dc"] / L_POP) + 400 * z["noise"] for z in zones]
    scale = sum(r[3] + r[4] for r in PYR) * 1000 / sum(raw)
    for z, r in zip(zones, raw):
        z["pop"] = max(100, int(round(r * scale)))
    return zones, rail_pts, rail_dense


def zone_val(z, zfx):
    v = .4 + ZONE_AMP * math.exp(-z["dc"] / L_CORE) + z["noise"]
    v += zfx[0] * math.exp(-z["dr"] / L_RAIL) + zfx[1] * math.exp(-z["dc"] / L_CORE_EFFECT)
    return max(0.0, v)


# --------------------------------------------------------------------------- tables
SCHEMAS = {
    "summary_kpis": "total_households BIGINT, total_persons BIGINT, total_trips BIGINT, total_tours BIGINT, avg_trip_mode_choice_logsum DOUBLE, trips_per_household DOUBLE, total_vmt DOUBLE, transit_boardings DOUBLE, avg_trip_length_miles DOUBLE, drive_share DOUBLE, transit_share DOUBLE, active_share DOUBLE",
    "trip_mode_share": "major_trip_mode VARCHAR, trips BIGINT, share DOUBLE",
    "trip_mode_share_obs": "major_trip_mode VARCHAR, trips BIGINT, share DOUBLE, moe DOUBLE",
    "trip_mode_share_by_purpose": "primary_purpose VARCHAR, major_trip_mode VARCHAR, trips BIGINT, share DOUBLE",
    "trip_mode_share_by_income": "income_group VARCHAR, major_trip_mode VARCHAR, trips BIGINT, share DOUBLE",
    "purpose_mode_flow": "primary_purpose VARCHAR, major_trip_mode VARCHAR, trips BIGINT",
    "purpose_mode_distance_flow": "primary_purpose VARCHAR, major_trip_mode VARCHAR, distance_band VARCHAR, trips BIGINT",
    "trips_by_hour": "hour INTEGER, trips BIGINT",
    "trips_by_hour_mode": "hour INTEGER, major_trip_mode VARCHAR, trips BIGINT",
    "trips_by_hour_purpose": "hour INTEGER, primary_purpose VARCHAR, trips BIGINT",
    "trips_by_hour_income": "hour INTEGER, income_group VARCHAR, trips BIGINT",
    "zone_transit_share": "taz_id INTEGER, transit_share DOUBLE, residents INTEGER, district VARCHAR",
    "od_district": "orig_district VARCHAR, dest_district VARCHAR, trips DOUBLE",
    "auto_ownership_summary": "auto_ownership VARCHAR, income_group VARCHAR, households BIGINT",
    "population_age_sex": "age_band VARCHAR, sex VARCHAR, persons BIGINT",
    "population_age_sex_obs": "age_band VARCHAR, sex VARCHAR, persons BIGINT, moe BIGINT",
    "trip_length_frequency": "primary_purpose VARCHAR, distance_bin_miles INTEGER, trips BIGINT",
    "transit_boardings": "line VARCHAR, boardings DOUBLE",
    "speed_by_facility_hour": "facility_type VARCHAR, hour INTEGER, avg_speed_mph DOUBLE",
    "vmt_county_facility": "county VARCHAR, facility_type VARCHAR, vmt DOUBLE",
    "calibration_errors": "submodel VARCHAR, worst_segment_error_pct DOUBLE",
    "calibration_by_round": "round INTEGER, metric_group VARCHAR, series VARCHAR, value DOUBLE, observed_value DOUBLE",
    "wasatch_zones": "taz_id INTEGER, district VARCHAR, geometry BLOB",
    "wasatch_rail": "kind VARCHAR, name VARCHAR, geometry BLOB",
}
FILE_OF = {"trip_mode_share_obs": "trip_mode_share", "population_age_sex_obs": "population_age_sex"}

_con = duckdb.connect()
_con.execute("PRAGMA threads=1")
for _n, _s in SCHEMAS.items():
    _con.execute(f"CREATE TABLE {_n} ({_s})")


def write_pq(table, rows, path: Path):
    _con.execute(f"DELETE FROM {table}")
    if rows:
        ph = ",".join("?" * len(rows[0]))
        _con.executemany(f"INSERT INTO {table} VALUES ({ph})", rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    _con.execute(f"COPY (SELECT * FROM {table}) TO '{path.as_posix()}' (FORMAT PARQUET)")


def I(x):
    return int(round(x))


def make_tables(st, observed=False, zones=None):
    """Return {table_name: rows} for one run state."""
    T = {}
    pm = PM(st)
    mt = [sum(r[j] for r in pm) for j in range(6)]
    tot_trips_k = st["trips"] * 1000
    sh = st["share"]
    boards = st["board"]
    hh = sum(HHK) * 1000
    persons = I(sum((r[1] + r[2]) if observed else (r[3] + r[4]) for r in PYR) * 1000)
    trips = I(st["trips"] * 1e6)
    logsum = r_(-0.742 + 0.012 * (sh[2] - 2.8) + 0.004 * (sh[3] - 8.0), 4)
    T["summary_kpis"] = [(hh, persons, trips, I(trips * .41), logsum, trips / hh, float(st["vmt"] * 1e6),
                          float(sum(boards) * 1000), 7.6 * st["tl"], sh[0] / 100, sh[2] / 100,
                          (sh[3] + sh[4]) / 100)]
    if observed:
        T["trip_mode_share_obs"] = [(m, I(mt[j] * 1000), sh[j] / 100, OBS_SHARE_MOE[j] / 100)
                                    for j, m in enumerate(MODES)]
    else:
        T["trip_mode_share"] = [(m, I(mt[j] * 1000), sh[j] / 100) for j, m in enumerate(MODES)]
    T["trip_mode_share_by_purpose"] = [
        (p, m, I(pm[i][j] * 1000), pm[i][j] / sum(pm[i])) for i, p in enumerate(PURP) for j, m in enumerate(MODES)]
    mi = mode_inc(st)
    T["trip_mode_share_by_income"] = [
        (n, m, I(tot_trips_k * 1000 * INCSH[i] * mi[i][j] / 100), mi[i][j] / 100)
        for i, n in enumerate(INC) for j, m in enumerate(MODES)]
    T["purpose_mode_flow"] = [(p, m, I(pm[i][j] * 1000)) for i, p in enumerate(PURP) for j, m in enumerate(MODES)]
    T["purpose_mode_distance_flow"] = [
        (p, m, b, I(pm[i][j] * BANDSH[j][q] * 1000))
        for i, p in enumerate(PURP) for j, m in enumerate(MODES) for q, b in enumerate(BAND)]
    td = tod(st)
    T["trips_by_hour"] = [(h, I(td[h] / 100 * st["trips"] * 1e6)) for h in range(24)]
    mh = mode_hour(st)
    T["trips_by_hour_mode"] = [(h, m, I(mh[(m, h)] * 1000)) for m in MODES for h in range(24)]
    ph = []
    for i, p in enumerate(PURP):
        tot = PT[i] * st["trips"] / 9.86
        w = [pur_tod(p, h) for h in range(24)]
        sm = sum(w)
        ph += [(h, p, I(w[h] / sm * tot * 1000)) for h in range(24)]
    T["trips_by_hour_purpose"] = ph
    ih = []
    for i, n in enumerate(INC):
        w = [td[h] * (1 + (1.5 - i) * .12 * (math.exp(-.5 * ((h - 12) / 3) ** 2)
                                           - .5 * math.exp(-.5 * ((h - 7.5) / 1.5) ** 2))) for h in range(24)]
        sm = sum(w)
        tot = st["trips"] * 1000 * INCSH[i]
        ih += [(h, n, I(w[h] / sm * tot * 1000)) for h in range(24)]
    T["trips_by_hour_income"] = ih
    if not observed:
        T["zone_transit_share"] = [(z["id"], zone_val(z, st["z"]) / 100, z["pop"], z["district"]) for z in zones]
    T["od_district"] = [(DIST[i], DIST[j], float(FLOW[i][j] * 1000 * (st["fl"] if i != j else 1)))
                        for i in range(5) for j in range(5)]
    T["auto_ownership_summary"] = [
        (a, n, I(HHK[i] * 1000 * auto_row(st, i)[j] / 100)) for i, n in enumerate(INC) for j, a in enumerate(AUTOS)]
    if observed:
        T["population_age_sex_obs"] = [row for r in PYR for row in (
            (r[0], "Male", I(r[1] * 1000), I(r[1] * 1000 * .03)), (r[0], "Female", I(r[2] * 1000), I(r[2] * 1000 * .03)))]
    else:
        T["population_age_sex"] = [row for r in PYR for row in (
            (r[0], "Male", I(r[3] * 1000)), (r[0], "Female", I(r[4] * 1000)))]
    tl = []
    for i, p in enumerate(PURP):
        kk, th = TLP[p]
        w = [gam(b + .5, kk, th * st["tl"]) for b in range(30)]
        sm = sum(w)
        tot = PT[i] * st["trips"] / 9.86 * 1000
        tl += [(p, b, I(w[b] / sm * tot)) for b in range(30)]
    T["trip_length_frequency"] = tl
    T["transit_boardings"] = [(ln, float(boards[i] * 1000)) for i, ln in enumerate(LINES)]
    T["speed_by_facility_hour"] = [(f, h, float(speed(st, i, h))) for i, f in enumerate(FAC) for h in range(24)]
    sc = st["vmt"] / 61.4
    T["vmt_county_facility"] = [(c, f, float(COUNTY_V[i] * FAC_SH[i][j] * sc * 1e6))
                                for i, c in enumerate(COUNTY) for j, f in enumerate(FAC)]
    if not observed:
        T["calibration_errors"] = [(n, float(st["calr"][i])) for i, n in enumerate(CAL_SHORT)]
    return T


def write_run(folder: str, manifest: dict, st, observed=False, zones=None):
    d = SCEN_DIR / folder
    if (d / "summary").exists():
        shutil.rmtree(d / "summary")
    d.mkdir(parents=True, exist_ok=True)
    T = make_tables(st, observed, zones)
    names = []
    for tbl, rows in T.items():
        fname = FILE_OF.get(tbl, tbl) + ".parquet"
        write_pq(tbl, rows, d / "summary" / fname)
        names.append(fname)
    (d / "summary" / "index.json").write_text(json.dumps(sorted(names), indent=2) + "\n", encoding="utf-8")
    (d / "manifest.yaml").write_text(
        yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True, width=1000), encoding="utf-8")
    return len(names)


# --------------------------------------------------------------------------- main
def main():
    zones, rail_pts, rail_dense = build_zones()
    SCEN_DIR.mkdir(parents=True, exist_ok=True)
    GEO_DIR.mkdir(parents=True, exist_ok=True)

    # geometry
    write_pq("wasatch_zones", [(z["id"], z["district"], wkb_polygon(z["ring"])) for z in zones],
             GEO_DIR / "wasatch-zones.geoparquet")
    rail_rows = [("line", "Wasatch rail", wkb_line(rail_dense))] + [
        ("station", n, wkb_point(*p)) for n, p in zip(STATIONS, rail_pts)]
    write_pq("wasatch_rail", rail_rows, GEO_DIR / "wasatch-rail.geoparquet")

    order_first, order_years, folders = [], {y: [] for y in YEARS[1:]}, set()
    ntab = 0
    for y in YEARS:
        for i, d in enumerate(DEF):
            name = d[0]
            folder = slug(name) if y == 2023 else f"{slug(name)}-{y}"
            man = dict(scenario_name=folder, display_name=name, engine="activitysim", run_date=RUN_DATE,
                       kind="scenario", alternative=slug(name), year=y, tag=d[1], color=PAL[i], pinned=False,
                       description=DEMO_NOTE)
            ntab = write_run(folder, man, state_at(i, y), zones=zones)
            (order_first if y == 2023 else order_years[y]).append(folder)
            folders.add(folder)

    obs = state_observed()
    write_run("observed-2023", dict(
        scenario_name="observed-2023", display_name="Observed", engine="observed", run_date=RUN_DATE,
        kind="observed", alternative="observed", year=2023, tag="Observed", pinned=False,
        description=DEMO_NOTE,
        observed=dict(source="2023 household travel survey", sample="n = 14,820 households",
                      metrics=dict(
                          trip_mode_share=dict(source="2023 household travel survey", sample="n = 14,820 households"),
                          transit_boardings=dict(source="2023 on-board transit survey and APC counts", sample="41,300 boardings sampled"),
                          total_vmt=dict(source="UDOT traffic counts, 2023", sample="1,240 count stations"),
                          auto_ownership_summary=dict(source="2023 household travel survey", sample="n = 14,820 households"),
                          population_age_sex=dict(source="American Community Survey (ACS) estimate", sample="census estimate with margin of error")))),
        obs, observed=True)

    rounds = build_rounds(50)
    for n, st in enumerate(rounds, 1):
        folder = f"round-{n:02d}"
        write_run(folder, dict(scenario_name=folder, display_name=f"Round {n}", engine="activitysim",
                               run_date=RUN_DATE, kind="round", family="calibration", family_index=n,
                               alternative=folder, year=2023, tag="Calibration round", pinned=False,
                               description=DEMO_NOTE), st, zones=zones)

    # calibration roll-up
    roll = []
    vol = lambda s: [s["trips"], s["vmt"], sum(s["board"]), 7.6 * s["tl"]]
    VN = ["Daily trips", "Vehicle miles", "Transit boardings", "Average trip length"]
    ov = vol(obs)
    for n, st in enumerate(rounds, 1):
        for i, m in enumerate(MODES):
            roll.append((n, "mode_share", m, float(st["share"][i]), float(obs["share"][i])))
        for i, nm in enumerate(VN):
            roll.append((n, "volumes", nm, float(vol(st)[i]), float(ov[i])))
        for i, ln in enumerate(LINES):
            roll.append((n, "boardings_by_line", ln, float(st["board"][i]), float(obs["board"][i])))
        for i, sm in enumerate(CAL_SHORT):
            roll.append((n, "submodel_error", sm, float(st["calr"][i]), 0.0))
    write_pq("calibration_by_round", roll, SCEN_DIR / "families" / "calibration" / "calibration_by_round.parquet")

    index = list(order_first)
    for y in YEARS[1:]:
        index += order_years[y]
    index += ["observed-2023"] + [f"round-{n:02d}" for n in range(1, 51)] + EXISTING
    (SCEN_DIR / "index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")

    cnt = {}
    for z in zones:
        cnt[z["district"]] = cnt.get(z["district"], 0) + 1
    wm = sum(zone_val(z, [0, 0]) * z["pop"] for z in zones) / sum(z["pop"] for z in zones)
    print(f"runs written: {len(folders)} scenario + 1 observed + 50 rounds; index.json entries: {len(index)}")
    print(f"tables per scenario run: {ntab}; roll-up rows: {len(roll)}")
    print(f"zones: {len(zones)} {cnt}; baseline pop-weighted zone transit share {wm:.2f}%")


if __name__ == "__main__":
    main()
