// Pure — no DOM, no CSS custom-property reads (those happen in
// SankeyPanel.tsx via getComputedStyle against the mounted container, the
// same pattern any design-token-consuming render code in this app already
// needs, since a CSS variable's resolved value isn't available to a
// Node-environment Vitest test). This module maps a `color_scheme` string
// to a concrete color array OR signals "use the token-derived default" —
// it never resolves the token values themselves.
import { schemeTableau10, schemeObservable10, schemeCategory10, schemeSet3 } from 'd3-scale-chromatic'

// docs/GRAMMAR.md documents only Tableau10 as a worked example, with no
// enumerated allow-list beyond it (research.md §6) — supporting this small
// set of other well-known d3-scale-chromatic categorical scheme names (not
// every export — sequential/diverging schemes don't apply to discrete
// node/link coloring) is a reasonable, low-risk superset rather than
// hard-coding support for exactly one string.
const NAMED_SCHEMES: Record<string, readonly string[]> = {
  Tableau10: schemeTableau10,
  Observable10: schemeObservable10,
  Category10: schemeCategory10,
  Set3: schemeSet3,
}

/** Returns the matching scheme's colors, or undefined for an omitted/
 * unrecognized name — the caller falls back to the token-derived default
 * in either case, never a hard error (FR-005, FR-006's error-state
 * reservation is for structural/query problems only). */
export function resolveNamedColorScheme(colorScheme: string | undefined): readonly string[] | undefined {
  if (!colorScheme) return undefined
  return NAMED_SCHEMES[colorScheme]
}
