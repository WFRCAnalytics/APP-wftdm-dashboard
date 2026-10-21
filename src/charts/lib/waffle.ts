// Pure logic of the auto-ownership waffle (project-docs/redesign/04-chart-catalogue.md section 17).

/**
 * Largest-remainder rounding: `counts[i]` are whole squares that sum to exactly `total` (100). Shares are rescaled to
 * sum to `total` first, so percentages that add to 99.9 or 100.2 still fill the grid.
 */
export function largestRemainder(shares: readonly number[], total = 100): number[] {
  const clean = shares.map((s) => (Number.isFinite(s) && s > 0 ? s : 0))
  const sum = clean.reduce((a, b) => a + b, 0)
  if (sum <= 0) return clean.map(() => 0)
  const scaled = clean.map((s) => (s / sum) * total)
  const counts = scaled.map(Math.floor)
  const rest = total - counts.reduce((a, b) => a + b, 0)
  scaled
    .map((v, i) => [v - Math.floor(v), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, rest)
    .forEach(([, i]) => counts[i]++)
  return counts
}

/** Category index of each square, in fill order (bottom row first, left to right). */
export function waffleCells(counts: readonly number[]): number[] {
  const cells: number[] = []
  counts.forEach((n, j) => {
    for (let q = 0; q < n; q++) cells.push(j)
  })
  return cells
}

export interface WaffleLayout {
  /** Side of the whole grid in px. */
  size: number
  /** Cell pitch in px. */
  cs: number
  ox: number
  oy: number
  legend: boolean
}

/** Grid size and position: the grid takes half the width when the legend list fits (body wider than 380px). */
export function waffleLayout(w: number, h: number): WaffleLayout {
  const legend = w > 380
  const size = Math.max(10, Math.min(h - 8, w * (legend ? 0.5 : 1) - 4))
  return { size, cs: size / 10, ox: legend ? 4 : (w - size) / 2, oy: (h - size) / 2, legend }
}

/** Square i (fill order) to its column and its row counted from the top (the grid fills from the bottom). */
export const waffleSlot = (i: number): { col: number; row: number } => ({ col: i % 10, row: 9 - Math.floor(i / 10) })
