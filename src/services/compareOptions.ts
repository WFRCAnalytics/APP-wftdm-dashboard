// What the control bar offers for Reference, and the encoding of a ReferenceSpec as a <select> value. Pure.
// project-docs/redesign/02-layout-and-components.md section 1.2 (item 5).
import type { ReferenceSpec } from '../state/compareState.ts'
import { scenarioGroupsOf, type RunInfo } from './viewContext.ts'

export interface ReferenceOption {
  value: string
  label: string
  /** Optgroup label, when the option belongs to one. */
  group?: string
}

export function encodeReference(spec: ReferenceSpec): string {
  return spec.kind === 'observed' ? 'observed' : spec.kind === 'self-base-year' ? 'self-base-year' : `scenario:${spec.name}`
}

export function decodeReference(value: string): ReferenceSpec {
  if (value === 'observed') return { kind: 'observed' }
  if (value === 'self-base-year') return { kind: 'self-base-year' }
  return { kind: 'scenario', name: value.replace(/^scenario:/, '') }
}

/**
 * Observed (base year, when the deployment has an Observed run), each independent scenario (the baseline marked),
 * calibration rounds (base year only), and the same scenario in the base year (other years only).
 */
export function referenceOptions(opts: {
  runs: readonly RunInfo[]
  isBaseYear: boolean
  baseline?: string
  label: (scenarioGroup: string) => string
}): ReferenceOption[] {
  const { runs, isBaseYear, baseline, label } = opts
  const out: ReferenceOption[] = []
  if (isBaseYear && runs.some((r) => r.kind === 'observed' && r.ready)) out.push({ value: 'observed', label: 'Observed' })

  const kindOf = (alt: string) => runs.find((r) => r.scenarioGroup === alt)?.kind
  const alts = scenarioGroupsOf(runs)
  for (const alt of alts.filter((a) => kindOf(a) === 'scenario')) {
    out.push({ value: `scenario:${alt}`, label: alt === baseline ? `${label(alt)} (baseline)` : label(alt) })
  }
  if (isBaseYear) {
    for (const alt of alts.filter((a) => kindOf(a) === 'round')) {
      out.push({ value: `scenario:${alt}`, label: label(alt), group: 'Calibration rounds' })
    }
  } else {
    out.push({ value: 'self-base-year', label: 'Same scenario in the base year' })
  }
  return out
}
