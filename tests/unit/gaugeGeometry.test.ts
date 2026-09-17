import { describe, expect, it } from 'vitest'
import { layoutGauge, resolveGaugeStatus } from '@/panels/gaugeGeometry'

describe('resolveGaugeStatus', () => {
  it('is always "normal" when no observed target is configured — a plain progress gauge', () => {
    expect(resolveGaugeStatus(999, undefined, 1, 2)).toBe('normal')
  })

  it('is "normal" when within both thresholds', () => {
    expect(resolveGaugeStatus(10, 10.5, 1, 2)).toBe('normal')
  })

  it('is "warn" when past thresholdWarn but not thresholdFail', () => {
    expect(resolveGaugeStatus(10, 12, 1, 5)).toBe('warn')
  })

  it('is "fail" when past thresholdFail', () => {
    expect(resolveGaugeStatus(10, 20, 1, 5)).toBe('fail')
  })

  it('fail-only tolerance (no thresholdWarn) — normal until thresholdFail is crossed', () => {
    expect(resolveGaugeStatus(10, 12, undefined, 5)).toBe('normal')
    expect(resolveGaugeStatus(10, 20, undefined, 5)).toBe('fail')
  })

  it('warn-only tolerance (no thresholdFail) — never escalates to fail', () => {
    expect(resolveGaugeStatus(10, 100, 1, undefined)).toBe('warn')
  })

  it('uses the absolute difference, regardless of direction (over or under)', () => {
    expect(resolveGaugeStatus(5, 10, 1, 3)).toBe('fail') // value below observed
    expect(resolveGaugeStatus(15, 10, 1, 3)).toBe('fail') // value above observed
  })
})

describe('layoutGauge', () => {
  it('clamps a value below min to min (ratio 0), never a negative ratio', () => {
    const result = layoutGauge(-5, 0, 100, 64, 44)
    expect(result.clampedValue).toBe(0)
    expect(result.ratio).toBe(0)
  })

  it('clamps a value above max to max (ratio 1), never exceeding 1', () => {
    const result = layoutGauge(150, 0, 100, 64, 44)
    expect(result.clampedValue).toBe(100)
    expect(result.ratio).toBe(1)
  })

  it('computes a real, non-empty SVG path for both the track and the value arc', () => {
    const result = layoutGauge(50, 0, 100, 64, 44)
    expect(result.trackPath.length).toBeGreaterThan(0)
    expect(result.valuePath.length).toBeGreaterThan(0)
  })

  it('a midpoint value lands at ratio 0.5', () => {
    const result = layoutGauge(50, 0, 100, 64, 44)
    expect(result.ratio).toBeCloseTo(0.5)
  })

  it('produces no targetTick when observed is not configured', () => {
    const result = layoutGauge(50, 0, 100, 64, 44)
    expect(result.targetTick).toBeUndefined()
  })

  it('produces a real targetTick when observed is configured, clamped to the gauge range', () => {
    const result = layoutGauge(50, 0, 100, 64, 44, 200) // observed way past max
    expect(result.targetTick).toBeDefined()
    expect(Number.isFinite(result.targetTick!.x1)).toBe(true)
    expect(Number.isFinite(result.targetTick!.y1)).toBe(true)
  })

  it('never divides by zero for a degenerate (max <= min) range — treats it as [min, min+1]', () => {
    const result = layoutGauge(5, 10, 10, 64, 44) // max === min
    expect(Number.isFinite(result.ratio)).toBe(true)
    expect(Number.isNaN(result.ratio)).toBe(false)
  })

  it('carries the real resolved status through into the returned geometry', () => {
    const result = layoutGauge(10, 0, 100, 64, 44, 20, 1, 5)
    expect(result.status).toBe('fail')
  })
})
