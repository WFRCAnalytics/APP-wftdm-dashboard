import { describe, expect, it } from 'vitest'

import { aggregateRadarSeries, layoutRadarAxisLabels, layoutRadarPolygons } from '@/panels/radarData'

describe('aggregateRadarSeries', () => {
  it('collapses to one implicit series when `series` is not configured', () => {
    const result = aggregateRadarSeries(
      { axis: 'major_trip_mode', value: 'share' },
      [
        { major_trip_mode: 'SOV', share: 0.5 },
        { major_trip_mode: 'HOV', share: 0.3 },
      ],
    )
    expect(result.series).toHaveLength(1)
    expect(result.axes).toEqual(['SOV', 'HOV'])
    expect(result.series[0].valuesByAxis.get('SOV')).toBe(0.5)
    expect(result.series[0].valuesByAxis.get('HOV')).toBe(0.3)
  })

  it('captures distinct axis/series values in first-seen order', () => {
    const result = aggregateRadarSeries(
      { axis: 'major_trip_mode', value: 'share', series: 'scenario' },
      [
        { scenario: 'baseline', major_trip_mode: 'SOV', share: 0.5 },
        { scenario: 'variant', major_trip_mode: 'SOV', share: 0.4 },
        { scenario: 'baseline', major_trip_mode: 'HOV', share: 0.2 },
      ],
    )
    expect(result.axes).toEqual(['SOV', 'HOV'])
    expect(result.series.map((s) => s.name)).toEqual(['baseline', 'variant'])
  })

  it('sums duplicate (series, axis) rows', () => {
    const result = aggregateRadarSeries(
      { axis: 'major_trip_mode', value: 'trips', series: 'scenario' },
      [
        { scenario: 'baseline', major_trip_mode: 'SOV', trips: 10 },
        { scenario: 'baseline', major_trip_mode: 'SOV', trips: 5 },
      ],
    )
    expect(result.series[0].valuesByAxis.get('SOV')).toBe(15)
  })

  it('clamps a negative value to 0', () => {
    const result = aggregateRadarSeries(
      { axis: 'major_trip_mode', value: 'share' },
      [{ major_trip_mode: 'SOV', share: -0.2 }],
    )
    expect(result.series[0].valuesByAxis.get('SOV')).toBe(0)
  })

  it('treats a non-finite value as 0', () => {
    const result = aggregateRadarSeries(
      { axis: 'major_trip_mode', value: 'share' },
      [{ major_trip_mode: 'SOV', share: Number.NaN }],
    )
    expect(result.series[0].valuesByAxis.get('SOV')).toBe(0)
  })

  it('gives a series missing a value for one axis an explicit 0 — never omits the key, so every series shares the identical axis order', () => {
    const result = aggregateRadarSeries(
      { axis: 'major_trip_mode', value: 'share', series: 'scenario' },
      [
        { scenario: 'baseline', major_trip_mode: 'SOV', share: 0.5 },
        { scenario: 'baseline', major_trip_mode: 'HOV', share: 0.2 },
        { scenario: 'variant', major_trip_mode: 'SOV', share: 0.4 },
        // 'variant' has no HOV row at all
      ],
    )
    const variant = result.series.find((s) => s.name === 'variant')!
    expect(variant.valuesByAxis.has('HOV')).toBe(true)
    expect(variant.valuesByAxis.get('HOV')).toBe(0)
    expect([...variant.valuesByAxis.keys()]).toEqual(result.axes)
  })
})

describe('layoutRadarPolygons', () => {
  it('N axes produce N evenly-spaced angles starting at -π/2, one point per axis per series', () => {
    const data = aggregateRadarSeries(
      { axis: 'axis', value: 'value' },
      [
        { axis: 'a', value: 10 },
        { axis: 'b', value: 10 },
        { axis: 'c', value: 10 },
      ],
    )
    const polygons = layoutRadarPolygons(data, { cx: 100, cy: 100 }, 50, 10)
    expect(polygons).toHaveLength(1)
    expect(polygons[0].points).toHaveLength(3)
    // The first axis sits at angle -π/2 (straight up) — x === cx, y === cy - radius.
    expect(polygons[0].points[0].x).toBeCloseTo(100)
    expect(polygons[0].points[0].y).toBeCloseTo(50)
  })

  it('a maxValue of 0 degenerates every point to the exact center without throwing', () => {
    const data = aggregateRadarSeries(
      { axis: 'axis', value: 'value' },
      [
        { axis: 'a', value: 0 },
        { axis: 'b', value: 0 },
      ],
    )
    const polygons = layoutRadarPolygons(data, { cx: 50, cy: 50 }, 40, 0)
    for (const point of polygons[0].points) {
      expect(point.x).toBeCloseTo(50)
      expect(point.y).toBeCloseTo(50)
    }
  })

  it('fewer than 3 axes still produces a valid, non-crashing degenerate polygon (FR-014)', () => {
    const oneAxis = aggregateRadarSeries({ axis: 'axis', value: 'value' }, [{ axis: 'only', value: 5 }])
    const onePolygon = layoutRadarPolygons(oneAxis, { cx: 0, cy: 0 }, 10, 5)
    expect(onePolygon[0].points).toHaveLength(1)

    const twoAxes = aggregateRadarSeries(
      { axis: 'axis', value: 'value' },
      [
        { axis: 'a', value: 5 },
        { axis: 'b', value: 5 },
      ],
    )
    const twoPolygon = layoutRadarPolygons(twoAxes, { cx: 0, cy: 0 }, 10, 5)
    expect(twoPolygon[0].points).toHaveLength(2)
  })
})

describe('layoutRadarAxisLabels', () => {
  it('produces one label position per axis, at the outer radius', () => {
    const labels = layoutRadarAxisLabels(['a', 'b', 'c', 'd'], { cx: 0, cy: 0 }, 100)
    expect(labels).toHaveLength(4)
    for (const label of labels) {
      const distance = Math.sqrt(label.x ** 2 + label.y ** 2)
      expect(distance).toBeCloseTo(100)
    }
  })
})
