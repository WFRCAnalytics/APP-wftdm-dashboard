import Color from 'color'

// 035-scenario-label-color — pure, dependency-free (no React, no
// state/appState.ts import) resolver over an already-built
// ScenarioDisplayMap, matching panels/expandablePanelTypes.ts's own
// precedent for Vitest-importability: several of this feature's own
// consumers (a retired chart helper in particular) must stay safe to import from
// a plain-Node unit test, so nothing in this module may pull in a
// browser-global-touching or store-touching dependency. See
// specs/035-scenario-label-color/data-model.md §2 and research.md §2.

export interface ScenarioDisplay {
  /** The scenario's custom label, if one is set — undefined means "no
   * label," NOT "resolved to the real name" (that resolution is
   * resolveScenarioLabel()'s own job, below). */
  label?: string
  /** Already fully resolved by hooks/useScenarioDisplay.ts as
   * colorOverride ?? manifest color ?? undefined (FR-007/FR-008/FR-011's
   * precedence, computed once, never re-derived per call site). */
  color?: string
}

export type ScenarioDisplayMap = ReadonlyMap<string, ScenarioDisplay>

/**
 * `label ?? name` (FR-001) — the one substitution rule every real display
 * surface in this feature uses. Safe to call with a name absent from the
 * map at all (not yet registered, or already unregistered) — falls
 * through to the real name unchanged, never throws.
 */
export function resolveScenarioLabel(name: string, display: ScenarioDisplayMap): string {
  return display.get(name)?.label ?? name
}

/**
 * The scenario's effective color, or `undefined` when neither an
 * override nor a manifest color exists — callers fall through to their
 * own panel type's default palette-cycling behavior in that case
 * (FR-008); this function never invents a color. Also `undefined` for a
 * name absent from the map entirely, same fail-open behavior as
 * resolveScenarioLabel() above.
 */
export function resolveScenarioColor(name: string, display: ScenarioDisplayMap): string | undefined {
  return display.get(name)?.color
}

// 036-scenario-color-picker (Part A) — replaces 035's own "manifest color
// is the default" resolution with a deployer-configured-or-shipped-
// default categorical palette. Still fully DOM-free/pure: an entry here
// may be a literal color a deployer configured, or one of DEFAULT_PALETTE's
// own `var(--chart-N)` REFERENCE strings — resolving that reference to a
// concrete value is hooks/useScenarioDisplay.ts's own job (the one place
// with real DOM access), not this module's (specs/036-scenario-color-
// picker/research.md §4).

/** 15 stable default scenario colors (project-docs/redesign/01-visual-language.md §5.2). Index 0 (slate) is meant for
 * the baseline so scenario groups stand out. Adapted per theme by adaptScenarioColor(). */
export const scenarioPalette15: readonly string[] = [
  '#8a94a6', '#4c8bf5', '#f2994a', '#2fbf8a', '#eb5757', '#a66cff', '#18b4c8', '#e8c547',
  '#e26ba6', '#9c7a5b', '#7bc043', '#5865f2', '#b5179e', '#00897b', '#8e9e2a',
]

let deployerPalette: readonly string[] | undefined

/** Set once, at boot, from main.tsx — never a reactive store (a
 * deployer's own configuration is fixed for the session's lifetime).
 * `undefined` or an empty array both mean "nothing configured," falling
 * through to DEFAULT_PALETTE (or COLORBLIND_SAFE_DEFAULT_PALETTE below). */
export function setDeployerScenarioPalette(palette: readonly string[] | undefined): void {
  deployerPalette = palette && palette.length > 0 ? palette : undefined
}

/** Colour-blind-safe 15 (§5.2): the first eight are Okabe-Ito based, the rest are lightness variants. Used when the
 * Appearance-tab switch is on; never replaces a deployer's explicit palette (FR-008). */
export const scenarioPaletteSafe15: readonly string[] = [
  '#8c8c8c', '#0072b2', '#e69f00', '#009e73', '#d55e00', '#cc79a7', '#56b4e9', '#f0e442',
  '#4d4d4d', '#004b7a', '#b37700', '#00694d', '#9e4400', '#a5548a', '#99d3f5',
]

/** Theme adaptation of a DEFAULT scenario color (never a user override): in HCL, dark mode forces L >= 62 and light
 * mode forces L <= 60, so every default stays legible on its tile. */
export function adaptScenarioColor(hex: string, dark: boolean): string {
  const [l, c, h] = Color(hex).lch().array()
  const next = dark ? Math.max(l, 62) : Math.min(l, 60)
  return next === l ? hex : Color.lch(next, c, h).hex().toLowerCase()
}

/**
 * Cycles the effective palette by `index` — the scenario's stable
 * registration-order position, computed by the caller
 * (hooks/useScenarioDisplay.ts), never re-derived here. Precedence:
 * deployer-configured palette (always, if set — an explicit deployer
 * choice is never overridden by `colorblindSafe`, FR-008), else, when
 * `colorblindSafe` is true, the real Set2 colorblind-safe pool, else the
 * shipped `--chart-1..5` default.
 */
export function resolveDefaultScenarioColor(index: number, colorblindSafe = false, dark = false): string {
  if (deployerPalette) return deployerPalette[index % deployerPalette.length]
  const palette = colorblindSafe ? scenarioPaletteSafe15 : scenarioPalette15
  return adaptScenarioColor(palette[index % palette.length], dark)
}
