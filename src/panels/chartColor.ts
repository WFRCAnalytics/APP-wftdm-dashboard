// Pure — no DOM, no CSS custom-property reads (those happen in each
// consuming panel component via getComputedStyle against the mounted
// container, the same pattern every category-colored panel type already
// needs, since a CSS variable's resolved value isn't available to a
// Node-environment Vitest test). This module maps a `color_scheme` string
// to a concrete color array OR signals "use the token-derived default" —
// it never resolves the token values themselves.
//
// 061-appearance-controls: replaces panels/sankeyColor.ts,
// panels/hierarchyColor.ts, and panels/polarChartColor.ts — three
// separate, near-byte-identical copies of this exact lookup table, one
// per feature that introduced a new category-colored panel type
// (research.md §1). All four real consumers (SankeyPanel.tsx,
// HierarchicalChartHost.tsx, PieChartPanel.tsx, RadarChartPanel.tsx) now
// import from here instead.
import Color from 'color'
import {
  schemeAccent,
  schemeCategory10,
  schemeDark2,
  schemeObservable10,
  schemePaired,
  schemeSet1,
  schemeSet2,
  schemeSet3,
  schemeTableau10,
} from 'd3-scale-chromatic'

// project-docs/GRAMMAR.md documents only Tableau10 as a worked example, with no
// enumerated allow-list beyond it (research.md §6 of the prior sankeyColor.ts
// design) — this small set of well-known d3-scale-chromatic categorical
// scheme names (not every export — sequential/diverging schemes don't
// apply to discrete node/link/wedge/polygon coloring) is a reasonable,
// low-risk superset rather than hard-coding support for exactly one
// string. Set1/Set2/Paired/Dark2/Accent are real ColorBrewer qualitative
// schemes added by 061-appearance-controls (research.md §2) — confirmed
// directly against the installed d3-scale-chromatic package's own source,
// not assumed from its docs.
const NAMED_SCHEMES: Record<string, readonly string[]> = {
  Tableau10: schemeTableau10,
  Observable10: schemeObservable10,
  Category10: schemeCategory10,
  Set3: schemeSet3,
  Set1: schemeSet1,
  Set2: schemeSet2,
  Paired: schemePaired,
  Dark2: schemeDark2,
  Accent: schemeAccent,
}

// ColorBrewer's own published colorblind-safe qualitative schemes are
// exactly three: Set2, Dark2, and Paired (research.md §2) — Set1/Set3/
// Accent are not flagged colorblind-safe. A single, deterministic choice
// (Set2) is used for the "no explicit scheme, colorblind-safe mode on"
// default, rather than picking among the three arbitrarily.
const COLORBLIND_SAFE_DEFAULT: readonly string[] = schemeSet2

export interface ResolveNamedColorSchemeOptions {
  /** 061-appearance-controls: when true AND `colorScheme` is unset or
   * unrecognized, returns the colorblind-safe default pool instead of
   * `undefined` — never overrides an explicit, recognized `colorScheme`
   * name (FR-003, FR-008: an author's own explicit choice always wins). */
  colorblindSafe?: boolean
}

/** Returns the matching scheme's colors; with no recognized `colorScheme`
 * name, returns the colorblind-safe default when `colorblindSafe` is
 * true, else `undefined` — the caller falls back to
 * `resolveCategoryFallbackColors()` in that last case, never a hard error
 * (FR-005/FR-006's error-state reservation is for structural/query
 * problems only). */
export function resolveNamedColorScheme(
  colorScheme: string | undefined,
  options: ResolveNamedColorSchemeOptions = {},
): readonly string[] | undefined {
  if (colorScheme) {
    const named = NAMED_SCHEMES[colorScheme]
    if (named) return named
  }
  return options.colorblindSafe ? COLORBLIND_SAFE_DEFAULT : undefined
}

/**
 * Resolves the token-derived categorical fallback used when no
 * `color_scheme:`/colorblind-safe pool applies — generalizes what used to
 * be four separately duplicated `resolveFallbackColors()` functions (one
 * inside each of SankeyPanel.tsx/HierarchicalChartHost.tsx/
 * PieChartPanel.tsx/RadarChartPanel.tsx) into one, parameterized by the
 * caller's own token/hex arrays so each panel type's own existing,
 * deliberate fallback-count choice (Sankey: 4 tokens; the other three: 5)
 * is preserved exactly (research.md §1 — collapsing them to one shared
 * count would be an uninstructed visual change).
 */
export function resolveCategoryFallbackColors(
  el: Element,
  tokenVarNames: readonly string[],
  fallbackHexColors: readonly string[],
): string[] {
  const style = getComputedStyle(el)
  const resolved = tokenVarNames.map((v) => style.getPropertyValue(v).trim()).filter(Boolean)
  return resolved.length > 0 ? resolved : [...fallbackHexColors]
}

// ---------------------------------------------------------------------------
// 063 redesign: the semantic colour helpers from project-docs/redesign/01-visual-language.md §5.4. Pure — the caller
// passes the resolved token values (read once per draw via getComputedStyle), so these are Vitest-safe.

export interface ColorTokens {
  /** --surface (the tile), --ink (primary text) and the three user colors after theme adaptation (--c-1..3). */
  surface: string
  ink: string
  c1: string
  c2: string
  c3: string
  dark?: boolean
}

/** Plain sRGB interpolation between two colors, returned as a lowercase hex string. */
export function mixHex(a: string, b: string, t: number): string {
  return Color(a).mix(Color(b), t).hex().toLowerCase()
}

/** Categorical series that are not modes or scenarios (purposes, submodels, districts): i = 0..7, clamped. */
export function cat(i: number, k: ColorTokens): string {
  const list = [
    k.c1,
    k.c2,
    k.c3,
    mixHex(k.c1, k.c2, 0.5),
    mixHex(k.c2, k.c3, 0.5),
    mixHex(k.c3, k.c1, 0.5),
    mixHex(k.c1, '#ffffff', 0.35),
    mixHex(k.c2, '#ffffff', 0.35),
  ]
  return list[((i % 8) + 8) % 8]
}

/** Travel modes: neutrals for the car modes, then the three user colors (§5.4 table). */
export function modeColors(k: ColorTokens): Record<string, string> {
  return {
    'Drive alone': mixHex(k.surface, k.ink, 0.34),
    'Shared ride': mixHex(k.surface, k.ink, 0.58),
    Transit: k.c1,
    Walk: k.c2,
    Bike: k.c3,
    'School bus': mixHex(k.c2, k.c3, 0.5),
  }
}

/** Sequential single-hue ramp of `n` colors, from a pale tint of `color` up to `color` (§5.4). `lo` defaults to 0.72. */
export function ramp(color: string, n: number, k: Pick<ColorTokens, 'surface' | 'dark'>, lo = 0.72): string[] {
  const start = k.dark ? 0.5 : lo
  return Array.from({ length: n }, (_, i) =>
    mixHex(color, k.surface, n === 1 ? 0 : start * (1 - i / (n - 1))),
  )
}

/** Diverging interpolator for differences: negative = c2, midpoint = neutral, positive = c1. `t` runs -1..1. Never green/red. */
export function diverging(t: number, k: ColorTokens): string {
  const mid = mixHex(k.surface, k.ink, 0.16)
  const u = Math.max(-1, Math.min(1, t))
  return u < 0 ? mixHex(mid, k.c2, -u) : mixHex(mid, k.c1, u)
}

/** Token names of the 8 categorical colors, and their last-resort literals (tokens.css light defaults) for a browser
 * that resolves none of them. The one place panels get their no-`color_scheme` default from. */
export const CATEGORY_TOKEN_VARS: readonly string[] = [
  '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--chart-7', '--chart-8',
]
export const CATEGORY_FALLBACK_HEX: readonly string[] = [
  '#2fa598', '#c28940', '#a781eb', '#78976c', '#b48596', '#6b93c2', '#237c72', '#926730',
]
