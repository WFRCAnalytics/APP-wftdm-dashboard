// 011-basemap-style-system: the panel > tab > app-default basemap
// precedence resolver (FR-006/FR-007), and the pin-vs-default
// distinguisher FR-011's theme-switch behavior depends on. Pure and
// stateless by design — see specs/011-basemap-style-system/research.md §2
// for why the "does a theme change actually need to re-apply the style"
// decision is NOT made here (this function has no notion of "previous"
// anything), but rather derived by the caller from whether
// resolveEffectiveBasemap's returned `.selection` value differs across
// calls with a different `theme`.
import { APP_DEFAULT_LIGHT, APP_DEFAULT_DARK } from '@/panels/basemap/registry'
import type { BasemapSelection, EffectiveBasemap } from '@/panels/basemap/types'

export type ColorScheme = 'light' | 'dark'

/**
 * Truth table (identical to FR-006/FR-007, restated as the literal test
 * matrix resolveEffectiveBasemap.test.ts asserts against):
 *
 * | panelBasemap | tabDefaultBasemap | theme   | .selection          | .source        |
 * |--------------|--------------------|---------|--------------------|-----------------|
 * | set (A)      | —                  | —       | A                   | 'panel'         |
 * | unset        | set (B)            | —       | B                   | 'tab'           |
 * | unset        | unset              | 'light' | APP_DEFAULT_LIGHT   | 'app-default'   |
 * | unset        | unset              | 'dark'  | APP_DEFAULT_DARK    | 'app-default'   |
 *
 * `undefined`/`null`/empty-string are all treated as "unset" — a blank
 * string in dashboard-*.yaml (e.g. `basemap: ""`) is the same as omitting
 * the key entirely, matching this app's established fail-soft convention
 * for optional string-typed panel config fields.
 */
export function resolveEffectiveBasemap(
  panelBasemap: BasemapSelection | undefined,
  tabDefaultBasemap: BasemapSelection | undefined,
  theme: ColorScheme,
): EffectiveBasemap {
  if (isSet(panelBasemap)) {
    return { selection: panelBasemap, source: 'panel' }
  }
  if (isSet(tabDefaultBasemap)) {
    return { selection: tabDefaultBasemap, source: 'tab' }
  }
  return {
    selection: theme === 'dark' ? APP_DEFAULT_DARK : APP_DEFAULT_LIGHT,
    source: 'app-default',
  }
}

function isSet(v: BasemapSelection | undefined): v is BasemapSelection {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim().length > 0
  return true // a BasemapComposition object is always "set" if present at all
}

/**
 * A stable, content-based identity for an EffectiveBasemap's `.selection`
 * — used as a React effect dependency-array key instead of object
 * identity, so a re-render that resolves to the SAME selection value
 * (e.g. a pinned panel/tab across a theme flip) does not appear as a
 * changed dependency and does not trigger a redundant setStyle() call.
 */
export function basemapKey(selection: BasemapSelection): string {
  return JSON.stringify(selection)
}
