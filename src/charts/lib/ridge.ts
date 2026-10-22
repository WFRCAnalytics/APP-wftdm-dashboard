// Pure geometry of the trip-length ridgeline (project-docs/redesign/04-chart-catalogue.md section 15). The demo data is
// a histogram (one row per purpose and one-mile bin); a ridge is the share of trips per mile.

export const RIDGE_MAX_MILES = 30
export const RIDGE_MARGIN = { left: 82, bottom: 22, right: 10, top: 6 }
/** Ridge height in rows. */
export const RIDGE_HEIGHT_ROWS = 1.75

export interface RidgeSeries {
  /** Trips per one-mile bin, bins 0 to 29. */
  bins: number[]
  total: number
  /** Share of trips per mile in each bin (sums to 1). */
  density: number[]
  /** Mean trip length in miles (bin centres), NaN when there are no trips. */
  mean: number
  /** Percent of trips shorter than 2 miles. */
  under2: number
}

export function ridgeSeries(rows: readonly { bin: number; trips: number }[]): RidgeSeries {
  const bins = new Array<number>(RIDGE_MAX_MILES).fill(0)
  for (const r of rows) if (r.bin >= 0 && r.bin < RIDGE_MAX_MILES) bins[r.bin] += r.trips
  const total = bins.reduce((a, b) => a + b, 0)
  const density = bins.map((b) => (total ? b / total : 0))
  const mean = total ? bins.reduce((a, b, i) => a + (i + 0.5) * b, 0) / total : NaN
  const under2 = total ? ((bins[0] + bins[1]) / total) * 100 : 0
  return { bins, total, density, mean, under2 }
}

/** The curve's anchor points as [miles, density]: zero at 0 mi, the bin centres, the last density at 30 mi. */
export function ridgePoints(density: readonly number[]): [number, number][] {
  return [[0, 0], ...density.map((d, i) => [i + 0.5, d] as [number, number]), [RIDGE_MAX_MILES, density[density.length - 1] ?? 0]]
}

/** Row pitch, and the baseline y of row i (0 = first purpose). */
export function ridgeRows(h: number, n: number): { rowH: number; base: (i: number) => number; chartBottom: number } {
  const rowH = (h - RIDGE_MARGIN.bottom - RIDGE_MARGIN.top) / n
  return { rowH, base: (i) => RIDGE_MARGIN.top + rowH * (i + 1) - 2, chartBottom: h - RIDGE_MARGIN.bottom }
}

/** Mean-distance markers need rows taller than 46px. */
export const showMeanMarkers = (rowH: number): boolean => rowH > 46
