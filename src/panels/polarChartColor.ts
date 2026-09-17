// Pure — no DOM, no CSS custom-property reads (those happen in
// PieChartPanel.tsx/RadarChartPanel.tsx via getComputedStyle against the
// mounted container, the same pattern SankeyPanel.tsx's/
// HierarchicalChartHost.tsx's own resolveFallbackColors() already
// established — a CSS variable's resolved value isn't available to a
// Node-environment Vitest test). This module maps a `color_scheme`
// string to a concrete color array OR signals "use the token-derived
// default" — it never resolves the token values themselves.
//
// 060-radar-pie-charts: deliberately SHARED by both new panel types
// (research.md §5) rather than duplicated into a third `pieColor.ts` and
// a fourth `radarColor.ts` — sankeyColor.ts and hierarchyColor.ts are
// already two near-byte-identical copies of this same ~25-line lookup
// table, one per prior feature; introducing a third/fourth copy WITHIN
// one feature (as opposed to across separately-shipped features, which
// is how the first two came to exist) is the kind of avoidable
// duplication this project's own "reuse, simplify" guidance flags.
// Neither pre-existing file is touched — no retroactive consolidation of
// prior features' own choices.
import { schemeTableau10, schemeObservable10, schemeCategory10, schemeSet3 } from 'd3-scale-chromatic'

// Same small, well-known superset sankeyColor.ts/hierarchyColor.ts
// already support — project-docs/GRAMMAR.md's own worked example only names
// Tableau10, with no enumerated allow-list beyond it.
const NAMED_SCHEMES: Record<string, readonly string[]> = {
  Tableau10: schemeTableau10,
  Observable10: schemeObservable10,
  Category10: schemeCategory10,
  Set3: schemeSet3,
}

/** Returns the matching scheme's colors, or undefined for an omitted/
 * unrecognized name — the caller (PieChartPanel.tsx/RadarChartPanel.tsx)
 * falls back to the token-derived --chart-1..5 default in either case,
 * never a hard error. */
export function resolvePolarColorScheme(colorScheme: string | undefined): readonly string[] | undefined {
  if (!colorScheme) return undefined
  return NAMED_SCHEMES[colorScheme]
}
