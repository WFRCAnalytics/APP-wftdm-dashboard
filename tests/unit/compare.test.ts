import { describe, expect, it, vi } from 'vitest'

import type { PanelConfig } from '../../src/layout/types.ts'
import { deltaValue, diffExpression, formatDelta, isShareColumn } from '../../src/panels/compareMath.ts'
import {
  buildDiffConfig,
  effectiveStrategy,
  planCompare,
  type CompareInputs,
} from '../../src/panels/compareStrategy.ts'
import { decodeReference, encodeReference, referenceOptions } from '../../src/services/compareOptions.ts'
import type { RunInfo } from '../../src/services/viewContext.ts'

describe('deltaValue', () => {
  it('values mode returns the value', () => expect(deltaValue(12, 10, 'val')).toBe(12))
  it('change is a minus b', () => expect(deltaValue(12, 10, 'abs')).toBe(2))
  it('% change is relative to the reference', () => expect(deltaValue(11, 10, 'pct')).toBeCloseTo(10))
  it('% change against a zero reference is null, never infinite', () => expect(deltaValue(5, 0, 'pct')).toBeNull())
  it('a missing reference gives null in Change modes but not Values', () => {
    expect(deltaValue(5, null, 'abs')).toBeNull()
    expect(deltaValue(5, undefined, 'val')).toBe(5)
  })
  it('a missing value is null', () => expect(deltaValue(null, 3, 'val')).toBeNull())
})

describe('formatDelta', () => {
  it('signs positives with + and negatives with a true minus', () => {
    expect(formatDelta(1.234, 'abs')).toBe('+1.2')
    expect(formatDelta(-1.234, 'abs')).toBe('−1.2')
  })
  it('has no sign at zero', () => expect(formatDelta(0.001, 'abs')).toBe('0.0'))
  it('suffixes % for % change and pts for share changes', () => {
    expect(formatDelta(3.456, 'pct')).toBe('+3.5%')
    expect(formatDelta(1.2, 'abs', { share: true })).toBe('+1.2 pts')
  })
  it('honours decimals and prints n/a for null', () => {
    expect(formatDelta(1234, 'abs', { decimals: 0 })).toBe('+1234')
    expect(formatDelta(null, 'pct')).toBe('n/a')
  })
})

describe('diffExpression', () => {
  it('scales share columns to percentage points', () => {
    expect(isShareColumn('mode_share')).toBe(true)
    expect(isShareColumn('trips')).toBe(false)
    expect(diffExpression('share', 'abs')).toBe('(b."share" - a."share") * 100')
    expect(diffExpression('trips', 'abs')).toBe('b."trips" - a."trips"')
  })
  it('guards % change against a zero reference', () => {
    expect(diffExpression('trips', 'pct')).toContain('NULLIF(a."trips", 0)')
  })
  it('quotes identifiers', () => expect(diffExpression('a"b', 'abs')).toContain('"a""b"'))
})

const inputs = (over: Partial<CompareInputs> = {}): CompareInputs => ({
  compare: true,
  display: 'val',
  focusRun: 'base',
  referenceKind: 'scenario',
  referenceRun: 'base',
  active: ['base', 'dens', 'transit', 'x4', 'x5'],
  label: (r) => r.toUpperCase(),
  ...over,
})

const bar = { type: 'observable-plot', metric: 'm', mark: 'barY', x: 'mode', y: 'trips', fill: 'scenario' } as unknown as PanelConfig
const pie = { type: 'pie', metric: 'm', category: 'mode', value: 'trips' } as unknown as PanelConfig
const tree = { type: 'treemap', metric: 'm', value: 'trips' } as unknown as PanelConfig

describe('effectiveStrategy', () => {
  const strategies = ['overlay', 'diff'] as const
  const base = { strategies: [...strategies], scenarioIndependent: false, compare: true, display: 'val' as const }
  it('is none with compare off or scenario-independent views', () => {
    expect(effectiveStrategy({ ...base, compare: false })).toBeUndefined()
    expect(effectiveStrategy({ ...base, scenarioIndependent: true })).toBeUndefined()
  })
  it('forces diff in Change modes when the view offers it', () => {
    expect(effectiveStrategy({ ...base, display: 'abs', chosen: 'overlay' })).toBe('diff')
    expect(effectiveStrategy({ ...base, strategies: ['overlay'], display: 'abs' })).toBe('overlay')
  })
  it('honours the chosen strategy, else the first arrangement', () => {
    expect(effectiveStrategy({ ...base, strategies: ['multi', 'overlay', 'diff'], chosen: 'overlay' })).toBe('overlay')
    expect(effectiveStrategy({ ...base })).toBe('overlay')
  })
  it('never draws a difference under Values from a stored choice (the tile no longer offers it)', () => {
    expect(effectiveStrategy({ ...base, strategies: ['diff', 'multi'], chosen: 'diff' })).toBe('multi')
  })
})

describe('buildDiffConfig', () => {
  it('rebinds the value channel to diff_value and drops the scenario encoding', () => {
    const c = buildDiffConfig(bar, 'a', 'b', 'abs') as unknown as Record<string, unknown>
    expect(c.y).toBe('diff_value')
    expect(c.fill).toBeUndefined()
    expect(c.compare_on).toEqual(['mode'])
    expect((c.comparison as { expr: string }).expr).toBe('b."trips" - a."trips"')
  })
  it('turns a pie into a bar chart of differences', () => {
    const c = buildDiffConfig(pie, 'a', 'b', 'pct') as unknown as Record<string, unknown>
    expect(c.type).toBe('observable-plot')
    expect(c.mark).toBe('barY')
    expect(c.y).toBe('diff_value')
  })
  it('colours a treemap by % change with the shown scenario geometry', () => {
    const c = buildDiffConfig(tree, 'a', 'b', 'abs') as unknown as Record<string, unknown>
    expect(c.scenario).toBe('b')
    expect((c.color_diff as { expr: string }).expr).toContain('NULLIF')
  })
  it('returns null for a type that cannot show differences', () => {
    expect(buildDiffConfig({ type: 'sankey' } as unknown as PanelConfig, 'a', 'b', 'abs')).toBeNull()
  })
})

describe('planCompare', () => {
  it('compare off shows the focus run for union-hazard types only', () => {
    const p = planCompare(tree, undefined, inputs())
    expect(p).toMatchObject({ kind: 'single', config: { scenario: 'base' } })
    const q = planCompare(bar, undefined, inputs())
    expect((q as { config: unknown }).config).toBe(bar)
  })
  it('overlay never hands a union-hazard type an unpinned union', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = planCompare(tree, 'overlay', inputs())
    expect(p).toMatchObject({ kind: 'single', config: { scenario: 'base' } })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
  it('overlay in Change mode keeps values and says so', () => {
    const p = planCompare(bar, 'overlay', inputs({ display: 'abs' }))
    expect(p).toMatchObject({ kind: 'single', note: expect.stringContaining('values') })
  })
  it('switch pins the chosen active scenario, else the focus', () => {
    expect(planCompare(bar, 'switch', inputs(), { scenario: 'dens' })).toMatchObject({ config: { scenario: 'dens' } })
    expect(planCompare(bar, 'switch', inputs(), { scenario: 'gone' })).toMatchObject({ config: { scenario: 'base' } })
  })
  it('multi shows the reference first, then three per page', () => {
    const p = planCompare(bar, 'multi', inputs())
    expect(p.kind).toBe('cells')
    if (p.kind !== 'cells') return
    expect(p.cells.map((c) => c.run)).toEqual(['base', 'dens', 'transit', 'x4'])
    expect(p.cells[0].isReference).toBe(true)
    expect(p.pages).toBe(2)
    expect(p.total).toBe(4)
    const second = planCompare(bar, 'multi', inputs(), { page: 1 })
    if (second.kind === 'cells') expect(second.cells.map((c) => c.run)).toEqual(['base', 'x5'])
  })
  it('multi clamps the page and fills four cells without a scenario reference', () => {
    const p = planCompare(bar, 'multi', inputs({ referenceKind: 'observed', referenceRun: 'obs', active: ['a', 'b', 'c', 'd', 'e'] }), { page: 99 })
    if (p.kind !== 'cells') throw new Error('expected cells')
    expect(p.page).toBe(p.pages - 1)
  })
  it('diff compares the reference with the focus', () => {
    const p = planCompare(bar, 'diff', inputs({ focusRun: 'dens' }))
    expect(p).toMatchObject({ kind: 'single', config: { y: 'diff_value' } })
  })
  it('diff asks for another reference when it equals the focus', () => {
    expect(planCompare(bar, 'diff', inputs())).toMatchObject({ kind: 'empty' })
  })
  it('diff against the same scenario in the base year uses the base run', () => {
    const p = planCompare(bar, 'diff', inputs({ focusRun: 'dens-2036', referenceKind: 'self-base-year', referenceRun: undefined, selfBaseRun: 'dens' }))
    expect(p).toMatchObject({ kind: 'single', config: { comparison: { a: 'dens', b: 'dens-2036' } } })
  })
  it('an author-pinned tile ignores overlay and switch', () => {
    const pinned = { ...(bar as object), scenario: 'x' } as PanelConfig
    expect(planCompare(pinned, 'overlay', inputs()).kind).toBe('single')
    expect((planCompare(pinned, 'switch', inputs()) as { config: unknown }).config).toBe(pinned)
  })
})

describe('reference options', () => {
  const run = (scenarioGroup: string, kind: RunInfo['kind'], ready = true): RunInfo =>
    ({ name: scenarioGroup, scenarioGroup, kind, ready, year: undefined }) as unknown as RunInfo
  const runs = [run('obs', 'observed'), run('a', 'scenario'), run('b', 'scenario'), run('r1', 'round')]
  const label = (a: string) => a.toUpperCase()

  it('base year lists Observed, scenarios (baseline marked) and rounds', () => {
    const o = referenceOptions({ runs, isBaseYear: true, baseline: 'a', label })
    expect(o.map((x) => x.value)).toEqual(['observed', 'scenario:a', 'scenario:b', 'scenario:r1'])
    expect(o[1].label).toBe('A (baseline)')
    expect(o[3].group).toBe('Calibration rounds')
  })
  it('other years drop Observed and rounds and offer the base-year run', () => {
    const o = referenceOptions({ runs, isBaseYear: false, baseline: 'a', label })
    expect(o.map((x) => x.value)).toEqual(['scenario:a', 'scenario:b', 'self-base-year'])
  })
  it('round-trips the select value encoding', () => {
    for (const spec of [{ kind: 'observed' }, { kind: 'self-base-year' }, { kind: 'scenario', name: 'a' }] as const) {
      expect(decodeReference(encodeReference(spec))).toEqual(spec)
    }
  })
})

import { allIdentical, resultSignature } from '../../src/layout/identicalNote.tsx'

describe('identical results detection', () => {
  const a = [[{ total_trips: 100, share: 0.5 }], [{ major_trip_mode: 'Walk', share: 0.1 }, { major_trip_mode: 'Bike', share: 0.2 }]]
  it('ignores row order and float noise', () => {
    const b = [[{ share: 0.5000000001, total_trips: 100 }], [{ major_trip_mode: 'Bike', share: 0.2 }, { major_trip_mode: 'Walk', share: 0.1 }]]
    expect(resultSignature(a)).toBe(resultSignature(b))
  })
  it('differs when a value differs', () => {
    expect(resultSignature(a)).not.toBe(resultSignature([[{ total_trips: 101, share: 0.5 }], a[1]]))
  })
  it('needs two or more non-empty equal signatures', () => {
    expect(allIdentical(['x'])).toBe(false)
    expect(allIdentical(['x', 'x'])).toBe(true)
    expect(allIdentical(['x', 'y'])).toBe(false)
    expect(allIdentical(['', ''])).toBe(false)
  })
})
