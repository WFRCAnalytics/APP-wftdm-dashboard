import { describe, expect, it } from 'vitest'

import {
  alternativesOf,
  independentAlternatives,
  resolveRun,
  resolveViewContext,
  type RunInfo,
  type ViewInput,
  type ViewManifest,
} from '../../src/services/viewContext.ts'

// project-docs/redesign/03-state-and-compare.md §2 (the seven rules) and §9 (edge cases).

function run(name: string, alternative: string, year: number | undefined, kind: RunInfo['kind'] = 'scenario', ready = true): RunInfo {
  return { name, alternative, year, kind, ready }
}

const YEARS = [2023, 2036]
const RUNS: RunInfo[] = [
  run('observed', 'observed', undefined, 'observed'),
  run('base-2023', 'base', 2023),
  run('transit-2023', 'transit', 2023),
  run('density-2023', 'density', 2023),
  run('base-2036', 'base', 2036),
  run('transit-2036', 'transit', 2036),
  // density has no 2036 run
  run('round-1', 'round-1', 2023, 'round'),
  run('round-2', 'round-2', 2023, 'round'),
]
const MANIFEST: ViewManifest = { runs: RUNS, years: YEARS, baseYear: 2023, baseline: 'base' }

function input(over: Partial<ViewInput> = {}): ViewInput {
  return {
    compare: true,
    focus: 'base',
    reference: { kind: 'scenario', name: 'base' },
    display: 'abs',
    year: 2023,
    compareSet: ['observed', 'base', 'transit', 'density'],
    ...over,
  }
}

describe('resolveRun / alternatives', () => {
  it('prefers the exact year and falls back to a year-less run', () => {
    expect(resolveRun(RUNS, 'base', 2036)?.name).toBe('base-2036')
    expect(resolveRun(RUNS, 'observed', 2036)?.name).toBe('observed')
    expect(resolveRun(RUNS, 'density', 2036)).toBeUndefined()
  })

  it('ignores runs that are not ready', () => {
    expect(resolveRun([run('x', 'x', 2023, 'scenario', false)], 'x', 2023)).toBeUndefined()
  })

  it('lists alternatives in first-appearance order and splits out independent scenarios', () => {
    expect(alternativesOf(RUNS)).toEqual(['observed', 'base', 'transit', 'density', 'round-1', 'round-2'])
    expect(independentAlternatives(RUNS)).toEqual(['base', 'transit', 'density'])
  })
})

describe('resolveViewContext, rules', () => {
  it('rule 1: Compare off shows only the focus, with display forced to values', () => {
    const v = resolveViewContext(input({ compare: false, focus: 'transit' }), MANIFEST)
    expect(v.active).toEqual(['transit-2023'])
    expect(v.display).toBe('val')
    expect(v.focusRun).toBe('transit-2023')
  })

  it('rule 1: Compare off references Observed in the base year and the baseline otherwise', () => {
    const base = resolveViewContext(input({ compare: false }), MANIFEST)
    expect([base.reference, base.referenceKind, base.referenceRun]).toEqual(['Observed', 'observed', 'observed'])
    const later = resolveViewContext(input({ compare: false, year: 2036 }), MANIFEST)
    expect([later.reference, later.referenceKind, later.referenceRun]).toEqual(['base', 'scenario', 'base-2036'])
  })

  it('rule 1: no Observed run in the deployment means the baseline is the reference', () => {
    const noObs: ViewManifest = { ...MANIFEST, runs: RUNS.filter((r) => r.kind !== 'observed') }
    const v = resolveViewContext(input({ compare: false, compareSet: ['base'] }), noObs)
    expect(v.referenceKind).toBe('scenario')
    expect(v.reference).toBe('base')
  })

  it('rule 2: Compare on shows the compare set in order, with the chosen display mode', () => {
    const v = resolveViewContext(input({ compareSet: ['transit', 'base'] }), MANIFEST)
    expect(v.active).toEqual(['transit-2023', 'base-2023'])
    expect(v.display).toBe('abs')
  })

  it('rule 3: a stored Observed or round reference becomes the baseline outside the base year', () => {
    expect(resolveViewContext(input({ year: 2036, reference: { kind: 'observed' } }), MANIFEST).reference).toBe('base')
    const round = resolveViewContext(input({ year: 2036, reference: { kind: 'scenario', name: 'round-2' } }), MANIFEST)
    expect([round.reference, round.referenceKind]).toEqual(['base', 'scenario'])
  })

  it('rule 3: Observed stays the reference in the base year', () => {
    const v = resolveViewContext(input({ reference: { kind: 'observed' } }), MANIFEST)
    expect([v.reference, v.referenceKind]).toEqual(['Observed', 'observed'])
  })

  it('rule 4: rounds leave the compare set and a round focus resets to the baseline outside the base year', () => {
    const v = resolveViewContext(
      input({ year: 2036, focus: 'round-1', compareSet: ['observed', 'base', 'round-1', 'round-2', 'transit'] }),
      MANIFEST,
    )
    expect(v.focus).toBe('base')
    expect(v.active).toEqual(['base-2036', 'transit-2036'])
  })

  it('rule 4: rounds and a round focus are kept in the base year', () => {
    const v = resolveViewContext(input({ focus: 'round-1', compareSet: ['round-1', 'round-2'] }), MANIFEST)
    expect(v.focus).toBe('round-1')
    expect(v.active).toEqual(['round-1', 'round-2'])
  })

  it('rule 5: self-base-year is kept outside the base year and becomes the baseline inside it', () => {
    const later = resolveViewContext(input({ year: 2036, reference: { kind: 'self-base-year' } }), MANIFEST)
    expect([later.reference, later.referenceKind, later.referenceRun]).toEqual(['self-base-year', 'self-base-year', undefined])
    const base = resolveViewContext(input({ reference: { kind: 'self-base-year' } }), MANIFEST)
    expect([base.reference, base.referenceKind]).toEqual(['base', 'scenario'])
  })

  it('rule 6: an empty compare set falls back to the focus', () => {
    expect(resolveViewContext(input({ compareSet: [] }), MANIFEST).active).toEqual(['base-2023'])
    // everything in the set is unknown
    expect(resolveViewContext(input({ compareSet: ['ghost'] }), MANIFEST).active).toEqual(['base-2023'])
  })

  it('rule 7: the focus does not have to be in the compare set', () => {
    const v = resolveViewContext(input({ focus: 'density', compareSet: ['base', 'transit'] }), MANIFEST)
    expect(v.focus).toBe('density')
    expect(v.focusRun).toBe('density-2023')
    expect(v.active).toEqual(['base-2023', 'transit-2023'])
  })
})

describe('resolveViewContext, edge cases', () => {
  it('9.1: a single scenario resolves to itself with the baseline as reference', () => {
    const one: ViewManifest = { runs: [run('only', 'only', undefined)], years: [], baseYear: 0, baseline: 'only' }
    const v = resolveViewContext(
      { compare: false, focus: 'only', reference: { kind: 'observed' }, display: 'pct', year: 0, compareSet: ['only'] },
      one,
    )
    expect(v).toMatchObject({ active: ['only'], display: 'val', reference: 'only', year: 0, baseYear: 0, isBaseYear: true })
  })

  it('9.2 / 9.3: Compare on with only the reference selected still returns that scenario', () => {
    const v = resolveViewContext(input({ compareSet: ['base'], reference: { kind: 'scenario', name: 'base' } }), MANIFEST)
    expect(v.active).toEqual(['base-2023'])
    expect(v.reference).toBe('base')
  })

  it('9.5: a year change while a round is focused and referenced resets both', () => {
    const v = resolveViewContext(
      input({ year: 2036, focus: 'round-2', reference: { kind: 'scenario', name: 'round-2' } }),
      MANIFEST,
    )
    expect([v.focus, v.reference]).toEqual(['base', 'base'])
  })

  it('9.9: an alternative without a run in the year is reported as missing and the others continue', () => {
    const v = resolveViewContext(input({ year: 2036 }), MANIFEST)
    expect(v.active).toEqual(['base-2036', 'transit-2036'])
    expect(v.missing).toEqual(['density'])
  })

  it('an unknown focus or reference falls back to the baseline', () => {
    const v = resolveViewContext(input({ focus: 'ghost', reference: { kind: 'scenario', name: 'ghost' } }), MANIFEST)
    expect([v.focus, v.reference]).toEqual(['base', 'base'])
  })

  it('a focus without a run for the year has no focusRun', () => {
    const v = resolveViewContext(input({ year: 2036, focus: 'density' }), MANIFEST)
    expect(v.focus).toBe('density')
    expect(v.focusRun).toBeUndefined()
  })

  it('a pre-redesign deployment (no years, year-less runs) passes every active run through', () => {
    const legacy: ViewManifest = {
      runs: [run('observed', 'observed', undefined, 'observed'), run('a', 'a', undefined), run('b', 'b', undefined)],
      years: [],
      baseYear: 0,
      baseline: 'a',
    }
    const v = resolveViewContext(
      { compare: true, focus: 'a', reference: { kind: 'scenario', name: 'a' }, display: 'val', year: 0, compareSet: ['observed', 'a', 'b'] },
      legacy,
    )
    expect(v.active).toEqual(['observed', 'a', 'b'])
  })
})
