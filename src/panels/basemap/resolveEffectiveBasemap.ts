// 011-basemap-style-system: the panel > tab > app-default basemap
// precedence resolver (FR-006/FR-007). Pure and stateless by design.
//
// 021-basemap-catalog-redesign (T020): the bottom fallback tier is no
// longer theme-paired — APP_DEFAULT_LIGHT/APP_DEFAULT_DARK collapsed into
// one static APP_DEFAULT constant (registry.ts), so this function no
// longer takes a `theme` parameter at all (research.md §6, FR-018).
// Confirmed directly, not assumed: `theme` was consumed by exactly one
// ternary in the bottom branch, which this change removes entirely — no
// other branch in this function ever depended on it. The `ColorScheme`
// type this file used to export is deleted along with it; its only
// consumers were this function's own removed parameter and
// resolveEffectiveBasemap.test.ts's call sites.
import { resolveLevels } from '@/config'
import { APP_DEFAULT } from '@/panels/basemap/registry'
import { getSiteBasemapDefault } from '@/state/siteSettings'
import type { BasemapPresetName, BasemapSelection, EffectiveBasemap } from '@/panels/basemap/types'

/**
 * Truth table (identical to FR-006/FR-007/FR-017, restated as the literal
 * test matrix resolveEffectiveBasemap.test.ts asserts against).
 *
 * | panelBasemap | tabDefaultBasemap | globalBasemap | .selection    | .source        |
 * |--------------|--------------------|-----------------|----------------|-----------------|
 * | set (A)      | —                  | —               | A              | 'panel'         |
 * | unset        | set (B)            | —               | B              | 'tab'           |
 * | unset        | unset              | set (C)         | C              | 'global'        |
 * | unset        | unset              | unset           | APP_DEFAULT    | 'app-default'   |
 *
 * `undefined`/`null`/empty-string are all treated as "unset" — a blank
 * string in dashboard-*.yaml (e.g. `basemap: ""`) is the same as omitting
 * the key entirely, matching this app's established fail-soft convention
 * for optional string-typed panel config fields.
 */
export function resolveEffectiveBasemap(
  panelBasemap: BasemapSelection | undefined,
  tabDefaultBasemap: BasemapSelection | undefined,
  globalBasemap?: BasemapPresetName,
  siteDefault: BasemapSelection | undefined = getSiteBasemapDefault(),
): EffectiveBasemap {
  // The cascade (src/config/resolve.ts) picks the most specific level that is set. Each level carries its own name, and the
  // original selection is read back from it, because a composition object must never be merged key by key.
  const levels: { name: EffectiveBasemap['source']; value: BasemapSelection | undefined }[] = [
    { name: 'global', value: globalBasemap },
    { name: 'tab', value: tabDefaultBasemap },
    { name: 'panel', value: panelBasemap },
  ]
  const site = isSet(siteDefault) ? siteDefault : undefined
  const winner = resolveLevels([
    { name: 'app-default', values: { basemap: { default: 'app-default' } } },
    ...(site ? [{ name: 'site', values: { basemap: { default: 'site' } } }] : []),
    ...levels.filter((l) => isSet(l.value)).map((l) => ({ name: l.name, values: { basemap: { default: l.name } } })),
  ]).values as { basemap: { default: string } }
  const name = winner.basemap.default
  if (name === 'app-default') return { selection: APP_DEFAULT, source: 'app-default' }
  if (name === 'site') return { selection: site as BasemapSelection, source: 'global' }
  return { selection: levels.find((l) => l.name === name)!.value as BasemapSelection, source: name as EffectiveBasemap['source'] }
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
 * (e.g. a pinned panel/tab) does not appear as a changed dependency and
 * does not trigger a redundant setStyle() call.
 */
export function basemapKey(selection: BasemapSelection): string {
  return JSON.stringify(selection)
}
