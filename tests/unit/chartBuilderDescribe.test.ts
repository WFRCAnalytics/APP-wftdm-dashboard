import { describe, expect, it } from 'vitest'
import { describeChart } from '../../src/charts/builder/describe.ts'
import { defaultSpec } from '../../src/charts/builder/spec.ts'

const rows = [
  { mode: 'Car', trips: 12000 }, { mode: 'Bus', trips: 3000 }, { mode: 'Walk', trips: 800 },
]

describe('describeChart', () => {
  it('names a bar chart and what stands out', () => {
    const text = describeChart(defaultSpec({ enc: { x: { f: 'mode' }, y: { f: 'trips', agg: 'sum' } } }), rows)
    expect(text).toContain('chart of trips by mode')
    expect(text).toContain('Car is highest at 12k')
    expect(text).toContain('Walk is lowest at 800')
  })

  it('reads a lying bar the same way and mentions the split', () => {
    const spec = defaultSpec({ enc: { x: { f: 'trips', agg: 'sum' }, y: { f: 'mode' }, color: { f: 'scenario' } } })
    expect(describeChart(spec, rows.map((r) => ({ ...r, scenario: 'a' })))).toContain('of trips by mode, split by scenario')
  })

  it('leads with the title and says the largest slice of a pie', () => {
    const spec = defaultSpec({ mark: 'pie', enc: { color: { f: 'mode' }, size: { f: 'trips', agg: 'sum' } } })
    spec.text.title.t = 'Trips by mode.'
    const text = describeChart(spec, rows)
    expect(text.startsWith('Trips by mode. ')).toBe(true)
    expect(text).toContain('Car is the largest share at 76%')
  })

  it('says nothing when there is nothing on the shelves', () => {
    expect(describeChart(defaultSpec(), [])).toBe('')
  })
})
