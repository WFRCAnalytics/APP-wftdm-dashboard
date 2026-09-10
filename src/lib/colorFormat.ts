// 036-scenario-color-picker — pure, dependency-free helpers backing
// components/ui/color-picker.tsx's own editable hex/RGB fields (the one
// deliberate behavior change from the real shadcnblocks/kibo source,
// whose own hex/RGB fields are read-only — data-model.md §4). Kept
// separate from color-picker.tsx itself for the same Vitest-testability
// reason every other pure-logic split in this codebase exists
// (plotlyTraces.ts, sankeyGraph.ts, panels/scenarioDisplay.ts, ...).

/** Clamps a number to a valid 8-bit color channel value (FR-015) —
 * never errors, never silently ignores an out-of-range input. */
export function clampByte(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(255, Math.max(0, Math.round(value)))
}

/**
 * Parses a hex color string into an [r, g, b] triple, or `null` when the
 * input isn't a complete, valid hex color (FR-014 — an incomplete/
 * malformed entry must never propagate to colorOverride). Accepts both
 * 6-digit (`#ff0000`) and 3-digit shorthand (`#f00`) forms, with or
 * without a leading `#`, case-insensitively — the same real-world input
 * shapes a viewer might type.
 */
export function parseHexColor(value: string): [number, number, number] | null {
  const trimmed = value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return [
      parseInt(trimmed.slice(0, 2), 16),
      parseInt(trimmed.slice(2, 4), 16),
      parseInt(trimmed.slice(4, 6), 16),
    ]
  }
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return [
      parseInt(trimmed[0] + trimmed[0], 16),
      parseInt(trimmed[1] + trimmed[1], 16),
      parseInt(trimmed[2] + trimmed[2], 16),
    ]
  }
  return null
}
