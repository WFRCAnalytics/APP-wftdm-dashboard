import { describe, expect, it } from 'vitest'

import { boxInSector, placeArcLabel, spreadLabels } from '@/charts/lib/arcLabel'

describe('arc labels', () => {
  const ring = (a0: number, a1: number) => ({ a0, a1, ir: 60, or: 120 })

  it('lays a short name flat in a wide arc', () => {
    expect(placeArcLabel(ring(-1, 1), 40, 14)?.mode).toBe('horizontal')
  })

  it('runs a long name along the arc or the radius when flat text would spill out', () => {
    const p = placeArcLabel(ring(1.1, 1.9), 55, 14)
    expect(p?.mode).not.toBe('horizontal')
    expect(p).not.toBeNull()
  })

  it('never turns text upside down', () => {
    for (let a = 0; a < 6.2; a += 0.4) {
      const p = placeArcLabel(ring(a, a + 0.5), 50, 12)
      if (p) expect(Math.abs(((p.rot + 540) % 360) - 180)).toBeGreaterThanOrEqual(0)
      if (p && p.mode !== 'horizontal') expect(Math.cos((p.rot * Math.PI) / 180)).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('leaves a name off when it fits no way', () => {
    expect(placeArcLabel(ring(0, 0.05), 80, 14)).toBeNull()
  })

  it('keeps a box inside the sector only when every corner is', () => {
    expect(boxInSector(ring(-1, 1), 0, -90, 30, 12, 0)).toBe(true)
    expect(boxInSector(ring(-1, 1), 0, -90, 400, 12, 0)).toBe(false)
  })

  it('spreads labels apart and keeps them in bounds', () => {
    const out = spreadLabels([{ item: 'a', y: 50 }, { item: 'b', y: 52 }, { item: 'c', y: 99 }], 20, 10, 100)
    const ys = out.map((o) => o.y)
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(20)
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(20)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
  })
})
