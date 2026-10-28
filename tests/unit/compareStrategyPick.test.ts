import { describe, expect, it } from 'vitest'

import type { PanelConfig } from '@/layout/types'
import { drawsAllScenarios, offersScenarioPick, planCompare, type CompareInputs } from '@/panels/compareStrategy'

const inputs: CompareInputs = {
  compare: true,
  display: 'val',
  focusRun: 'b',
  referenceKind: 'scenario',
  referenceRun: 'a',
  active: ['a', 'b', 'c'],
  label: (r) => r,
}
const heat = { type: 'chart', kind: 'time-heat', group: 'purpose' } as unknown as PanelConfig
const heatByScenario = { type: 'chart', kind: 'time-heat', group: 'scn' } as unknown as PanelConfig
const donut = { type: 'pie', category: 'm', value: 'v', metric: 'x' } as unknown as PanelConfig

describe('scenario pick', () => {
  it('is offered for a switch, a plain-panel difference and a one-scenario chart in Values mode', () => {
    expect(offersScenarioPick(donut, 'switch', 'val')).toBe(true)
    expect(offersScenarioPick(donut, 'diff', 'abs')).toBe(true)
    expect(offersScenarioPick(heat, 'overlay', 'val')).toBe(true)
    expect(offersScenarioPick(heat, 'overlay', 'abs')).toBe(false)
    expect(offersScenarioPick({ type: 'chart', kind: 'mode-bars' } as unknown as PanelConfig, 'overlay', 'val')).toBe(false)
  })
  it('pins the chosen scenario, and never the reference as the one a difference shows', () => {
    const plan = planCompare(heat, 'overlay', inputs, { scenario: 'c' })
    expect(plan.kind === 'single' && (plan.config as { scenario?: string }).scenario).toBe('c')
    const diff = planCompare(donut, 'diff', { ...inputs, display: 'abs' }, { scenario: 'c' })
    expect(diff.kind === 'single' && JSON.stringify(diff.config)).toContain('"b":"c"')
    const same = planCompare(donut, 'diff', { ...inputs, display: 'abs' }, { scenario: 'a' })
    expect(same.kind === 'single' && JSON.stringify(same.config)).toContain('"b":"b"')
  })

  it('does not pin a heatmap grouped by Scenario: it draws every scenario, and the dropdown is shown but off', () => {
    expect(drawsAllScenarios(heatByScenario)).toBe(true)
    expect(drawsAllScenarios({ type: 'chart', kind: 'time-heat' } as unknown as PanelConfig)).toBe(true) // no group means Scenario
    expect(drawsAllScenarios(heat)).toBe(false)
    expect(drawsAllScenarios({ type: 'chart', kind: 'ridgeline' } as unknown as PanelConfig)).toBe(false)
    expect(offersScenarioPick(heatByScenario, 'overlay', 'val')).toBe(true)
    const plan = planCompare(heatByScenario, 'overlay', inputs, { scenario: 'c' })
    expect(plan.kind === 'single' && (plan.config as { scenario?: string }).scenario).toBeUndefined()
  })
})
