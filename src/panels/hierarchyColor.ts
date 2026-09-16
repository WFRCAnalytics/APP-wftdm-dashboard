// Pure — no DOM, no CSS custom-property reads (those happen in
// HierarchicalChartHost.tsx via getComputedStyle against the mounted
// container, the same pattern SankeyPanel.tsx's own resolveFallbackColors()
// already established — a CSS variable's resolved value isn't available to
// a Node-environment Vitest test). This module maps a `color_scheme` string
// to a concrete color array OR signals "use the token-derived default" — it
// never resolves the token values themselves. Mirrors sankeyColor.ts's own
// exact shape (058-hierarchical-chart-panels, research.md §4/§5).
import { schemeTableau10, schemeObservable10, schemeCategory10, schemeSet3 } from 'd3-scale-chromatic'

// Same small, well-known superset SankeyPanel.tsx's own NAMED_SCHEMES
// already supports — project-docs/GRAMMAR.md's own worked example only names
// Tableau10, with no enumerated allow-list beyond it.
const NAMED_SCHEMES: Record<string, readonly string[]> = {
  Tableau10: schemeTableau10,
  Observable10: schemeObservable10,
  Category10: schemeCategory10,
  Set3: schemeSet3,
}

/** Returns the matching scheme's colors, or undefined for an omitted/
 * unrecognized name — the caller falls back to the token-derived default
 * in either case, never a hard error. */
export function resolveHierarchyColorScheme(colorScheme: string | undefined): readonly string[] | undefined {
  if (!colorScheme) return undefined
  return NAMED_SCHEMES[colorScheme]
}
