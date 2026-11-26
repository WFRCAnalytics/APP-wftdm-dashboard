import { describe, expect, it } from 'vitest'
import {
  FLOW_STEPS,
  boundsToRange,
  flowScale,
  histogram,
  inBounds,
  isOpen,
  rampGradient,
  rangeToBounds,
  toStep,
  toValue,
} from '@/panels/flowFilter'

describe('flowFilter', () => {
  it('has no scale when there is nothing to filter', () => {
    expect(flowScale([])).toBeNull()
    expect(flowScale([5, 5, 5])).toBeNull()
    expect(flowScale([0, -1, Number.NaN])).toBeNull()
  })

  it('uses a log scale when sizes span a wide range, linear otherwise', () => {
    expect(flowScale([1, 10000])?.log).toBe(true)
    expect(flowScale([10, 50])?.log).toBe(false)
  })

  it('maps steps and sizes both ways, ends exact', () => {
    for (const s of [flowScale([1, 10000])!, flowScale([10, 50])!]) {
      expect(toValue(s, 0)).toBeCloseTo(s.min)
      expect(toValue(s, FLOW_STEPS)).toBeCloseTo(s.max)
      expect(toStep(s, toValue(s, 370))).toBeCloseTo(370)
    }
    expect(toValue(flowScale([1, 10000])!, FLOW_STEPS / 2)).toBeCloseTo(100)
  })

  it('keeps lines inside the bounds; an open end keeps everything beyond it', () => {
    expect(isOpen({})).toBe(true)
    expect([1, 50, 1e9].every((v) => inBounds({}, v))).toBe(true)
    const b = { lo: 10, hi: 1000 }
    expect(isOpen(b)).toBe(false)
    expect([9, 10, 1000, 1001].map((v) => inBounds(b, v))).toEqual([false, true, true, false])
    expect(inBounds({ lo: 10 }, 1e9)).toBe(true)
  })

  it('turns slider positions into bounds and back; a handle at its end leaves that end open', () => {
    const s = flowScale([1, 10000])!
    expect(rangeToBounds(s, [0, FLOW_STEPS])).toEqual({ lo: undefined, hi: undefined })
    const b = rangeToBounds(s, [250, 750])
    expect(b.lo).toBeCloseTo(10)
    expect(b.hi).toBeCloseTo(1000)
    const r = boundsToRange(s, b)
    expect(r[0]).toBeCloseTo(250)
    expect(r[1]).toBeCloseTo(750)
    // on a new scale (another zoom) the same bounds sit elsewhere, clamped to the ends
    expect(boundsToRange(flowScale([100, 10000])!, b)[0]).toBe(0)
  })

  it('draws a gradient of a colour function along the slider', () => {
    const g = rampGradient(flowScale([1, 100])!, (v) => `c${Math.round(v)}`, 2)
    expect(g).toBe('linear-gradient(90deg, c1 0.0%, c10 50.0%, c100 100.0%)')
  })

  it('counts lines per slice of the slider, the largest in the last bin', () => {
    const s = flowScale([1, 10, 100, 1000])!
    const h = histogram(s, [1, 10, 100, 1000, 0, Number.NaN], 3)
    expect(h).toEqual([1, 1, 2])
    expect(h.reduce((a, b) => a + b)).toBe(4)
  })
})
