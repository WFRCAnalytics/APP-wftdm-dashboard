# Contract: `panels/basemap/resolveEffectiveBasemap.ts`

Full-body code. This is the pure precedence + pin-vs-default resolver
research.md §2 designs against, in response to the explicit instruction
that this logic be "its own clearly-testable piece of logic, not folded
implicitly into the render effect."

## `src/panels/basemap/resolveEffectiveBasemap.ts` (NEW — pure, DOM-free)

```ts
// 011-basemap-style-system: the panel > tab > app-default basemap
// precedence resolver (FR-006/FR-007), and the pin-vs-default
// distinguisher FR-011's theme-switch behavior depends on. Pure and
// stateless by design — see research.md §2 for why the "does a theme
// change actually need to re-apply the style" decision is NOT made here
// (this function has no notion of "previous" anything), but rather
// derived by the caller from whether resolveEffectiveBasemap's returned
// `.selection` value differs across calls with a different `theme`.
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
 * for optional string-typed panel config fields rather than being a
 * distinct "explicitly nothing" state this resolver would need a fourth
 * table row for.
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
 * — used as a React effect dependency-array key (research.md §2) instead
 * of object identity, so a re-render that resolves to the SAME selection
 * value (e.g. a pinned panel/tab across a theme flip) does not appear as
 * a changed dependency and does not trigger a redundant setStyle() call.
 * Exported here, not left as an inline JSON.stringify() at each call
 * site, so the "what counts as 'the same basemap'" definition has exactly
 * one place to change (e.g. if BasemapComposition's layer order should
 * one day be treated as insignificant — not true today, deliberately not
 * built, YAGNI until a real case needs it).
 */
export function basemapKey(selection: BasemapSelection): string {
  return JSON.stringify(selection)
}
```

## `tests/unit/resolveEffectiveBasemap.test.ts` (NEW)

```ts
import { describe, expect, it } from 'vitest'
import { resolveEffectiveBasemap, basemapKey } from '@/panels/basemap/resolveEffectiveBasemap'
import { APP_DEFAULT_LIGHT, APP_DEFAULT_DARK } from '@/panels/basemap/registry'

describe('resolveEffectiveBasemap', () => {
  it('panel basemap wins over everything, regardless of theme', () => {
    expect(resolveEffectiveBasemap('openfreemap-bright', 'carto-voyager', 'light')).toEqual({
      selection: 'openfreemap-bright',
      source: 'panel',
    })
    expect(resolveEffectiveBasemap('openfreemap-bright', 'carto-voyager', 'dark')).toEqual({
      selection: 'openfreemap-bright',
      source: 'panel',
    })
  })

  it('tab default wins when no panel override is set, regardless of theme', () => {
    expect(resolveEffectiveBasemap(undefined, 'carto-voyager', 'light')).toEqual({
      selection: 'carto-voyager',
      source: 'tab',
    })
    expect(resolveEffectiveBasemap(undefined, 'carto-voyager', 'dark')).toEqual({
      selection: 'carto-voyager',
      source: 'tab',
    })
  })

  it('falls back to the theme-paired app default when nothing is set', () => {
    expect(resolveEffectiveBasemap(undefined, undefined, 'light')).toEqual({
      selection: APP_DEFAULT_LIGHT,
      source: 'app-default',
    })
    expect(resolveEffectiveBasemap(undefined, undefined, 'dark')).toEqual({
      selection: APP_DEFAULT_DARK,
      source: 'app-default',
    })
  })

  it('treats an empty/blank basemap string as unset, not as an explicit pin', () => {
    expect(resolveEffectiveBasemap('', 'carto-voyager', 'light').source).toBe('tab')
    expect(resolveEffectiveBasemap('   ', undefined, 'dark').source).toBe('app-default')
  })

  it('accepts a composition object at either scope', () => {
    const composition = { layers: ['https://example.test/a.json', 'https://example.test/b.json'] }
    expect(resolveEffectiveBasemap(composition, undefined, 'light')).toEqual({
      selection: composition,
      source: 'panel',
    })
    expect(resolveEffectiveBasemap(undefined, composition, 'dark')).toEqual({
      selection: composition,
      source: 'tab',
    })
  })

  // The failure mode this whole contract exists to prevent (research.md
  // §2): an explicit pin must NOT change its resolved value across a
  // theme flip (so the caller's effect never re-runs for it), while the
  // no-config app default MUST change (so the caller's effect does
  // re-run). Asserted directly via basemapKey, the exact mechanism the
  // caller (FlowMapPanel.tsx) keys its effect's dependency array on.
  it('basemapKey is stable across a theme flip for an explicit pin, but not for the app default', () => {
    const pinnedLight = resolveEffectiveBasemap('openfreemap-bright', undefined, 'light')
    const pinnedDark = resolveEffectiveBasemap('openfreemap-bright', undefined, 'dark')
    expect(basemapKey(pinnedLight.selection)).toBe(basemapKey(pinnedDark.selection))

    const defaultLight = resolveEffectiveBasemap(undefined, undefined, 'light')
    const defaultDark = resolveEffectiveBasemap(undefined, undefined, 'dark')
    expect(basemapKey(defaultLight.selection)).not.toBe(basemapKey(defaultDark.selection))
  })
})
```
