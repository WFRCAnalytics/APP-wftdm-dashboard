// 035-scenario-label-color — pure, dependency-free (no React, no
// state/appState.ts import) resolver over an already-built
// ScenarioDisplayMap, matching panels/expandablePanelTypes.ts's own
// precedent for Vitest-importability: several of this feature's own
// consumers (plotlyTraces.ts in particular) must stay safe to import from
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
