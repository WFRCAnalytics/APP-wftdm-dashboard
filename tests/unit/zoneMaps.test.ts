import { describe, expect, it } from 'vitest'

import {
  CameraGroup,
  SHARE_DOMAIN,
  clampSwipe,
  diffDomain,
  divergeT,
  quantileSorted,
  sequentialT,
  swipeKey,
  type Camera,
  type CameraMap,
} from '../../src/charts/lib/mapMath.ts'
import { buildChartTheme } from '../../src/charts/theme.ts'
import { deltaValue } from '../../src/panels/compareMath.ts'

describe('quantileSorted', () => {
  it('interpolates like d3.quantile (R-7)', () => {
    const v = [1, 2, 3, 4, 5]
    expect(quantileSorted(v, 0)).toBe(1)
    expect(quantileSorted(v, 0.5)).toBe(3)
    expect(quantileSorted(v, 1)).toBe(5)
    expect(quantileSorted(v, 0.25)).toBe(2)
    expect(quantileSorted([10, 20], 0.5)).toBe(15)
  })
  it('handles a single value and an empty list', () => {
    expect(quantileSorted([7], 0.96)).toBe(7)
    expect(quantileSorted([], 0.96)).toBeNaN()
  })
})

describe('diffDomain: the 96th percentile of absolute differences', () => {
  it('ignores the sign and clips outliers', () => {
    // 100 values 0..99 with a huge outlier: p96 of |v| sits near 96, never at the outlier
    const values = [...Array.from({ length: 99 }, (_, i) => (i % 2 ? -i : i)), 10_000]
    const abs = values.map(Math.abs).sort((a, b) => a - b)
    expect(diffDomain(values)).toBeCloseTo(quantileSorted(abs, 0.96), 10)
    expect(diffDomain(values)).toBeLessThan(200)
  })
  it('matches a hand-computed case', () => {
    // |v| sorted: 1,2,3,4,5 -> p96 = 4 + 0.84 * 1 = 4.84
    expect(diffDomain([-1, 2, -3, 4, 5])).toBeCloseTo(4.84, 10)
  })
  it('never falls below the floor and skips missing values', () => {
    expect(diffDomain([0.01, -0.02, null, undefined, NaN])).toBe(0.5)
    expect(diffDomain([])).toBe(0.5)
    expect(diffDomain([0.1, 0.2], 0.05)).toBeCloseTo(0.2 - 0.04 * 0.1, 10)
  })
})

describe('colour positions', () => {
  it('maps differences onto -1..1, clamped, zero in the middle', () => {
    expect(divergeT(0, 4)).toBe(0)
    expect(divergeT(2, 4)).toBe(0.5)
    expect(divergeT(-2, 4)).toBe(-0.5)
    expect(divergeT(9, 4)).toBe(1)
    expect(divergeT(-9, 4)).toBe(-1)
    expect(divergeT(1, 0)).toBe(0)
    expect(divergeT(NaN, 4)).toBe(0)
  })
  it('maps transit share 0..14% onto 0..1, clamped', () => {
    expect(SHARE_DOMAIN).toEqual([0, 14])
    expect(sequentialT(0)).toBe(0)
    expect(sequentialT(7)).toBe(0.5)
    expect(sequentialT(14)).toBe(1)
    expect(sequentialT(30)).toBe(1)
    expect(sequentialT(-3)).toBe(0)
  })
  it('the diverging ramp is neutral at zero and never green or red at the ends', () => {
    const theme = buildChartTheme({ surface: '#ffffff', ink: '#0e131a', c1: '#1f6feb', c2: '#c0892b', c3: '#8a4fff' }, { mute: '#586376', line: '#dbe1e9', grid: '#e8ecf1', font: 'sans-serif', fs: 11.5, r: 4 })
    const mid = theme.diverge(0)
    const hi = theme.diverge(divergeT(10, 4))
    const lo = theme.diverge(divergeT(-10, 4))
    expect(hi).toBe(theme.diverge(1))
    expect(lo).toBe(theme.diverge(-1))
    expect(new Set([mid, hi, lo]).size).toBe(3)
  })
  it('a difference in points or percent comes from deltaValue', () => {
    expect(deltaValue(7.8, 5.8, 'abs')).toBeCloseTo(2, 10)
    expect(deltaValue(7.8, 5.8, 'pct')).toBeCloseTo((7.8 / 5.8 - 1) * 100, 10)
    expect(deltaValue(3, 0, 'pct')).toBeNull()
  })
})

describe('swipe divider clamping', () => {
  it('stays 24px from each edge', () => {
    expect(clampSwipe(-50, 800)).toBe(24)
    expect(clampSwipe(5000, 800)).toBe(776)
    expect(clampSwipe(400, 800)).toBe(400)
  })
  it('centres in a map too narrow for the margins', () => {
    expect(clampSwipe(10, 40)).toBe(20)
  })
  it('arrow keys move 24px and clamp; Home and End go to the margins', () => {
    expect(swipeKey('ArrowRight', 400, 800)).toBe(424)
    expect(swipeKey('ArrowLeft', 400, 800)).toBe(376)
    expect(swipeKey('ArrowLeft', 30, 800)).toBe(24)
    expect(swipeKey('ArrowRight', 770, 800)).toBe(776)
    expect(swipeKey('Home', 400, 800)).toBe(24)
    expect(swipeKey('End', 400, 800)).toBe(776)
    expect(swipeKey('a', 400, 800)).toBeNull()
  })
})

/** A fake map that, like MapLibre's jumpTo, fires its `move` handler synchronously. */
class FakeMap implements CameraMap {
  camera: Camera = { center: [0, 0], zoom: 5, bearing: 0, pitch: 0 }
  moves = 0
  constructor(private readonly group: CameraGroup<FakeMap>) {}
  getCamera(): Camera {
    return { ...this.camera }
  }
  jumpTo(c: Camera): void {
    this.camera = { ...c }
    this.moves++
    this.group.moved(this) // the echo the guard must swallow
  }
  userMoves(c: Camera): void {
    this.camera = { ...c }
    this.moves++
    this.group.moved(this)
  }
}

describe('CameraGroup', () => {
  const setup = (n: number) => {
    const group = new CameraGroup<FakeMap>()
    const maps = Array.from({ length: n }, () => new FakeMap(group))
    maps.forEach((m) => group.add(m))
    return { group, maps }
  }

  it('moves every other map to the camera of the one that moved', () => {
    const { maps } = setup(4)
    const cam: Camera = { center: [-111.9, 40.7], zoom: 9.5, bearing: 0, pitch: 0 }
    maps[1].userMoves(cam)
    for (const m of maps) expect(m.camera).toEqual(cam)
  })

  it('does not loop: the echoed move events of the followers are ignored', () => {
    const { maps } = setup(4)
    maps[0].userMoves({ center: [1, 2], zoom: 7, bearing: 0, pitch: 0 })
    // the mover reported once; each follower was jumped exactly once and its echo swallowed
    expect(maps[0].moves).toBe(1)
    for (const m of maps.slice(1)) expect(m.moves).toBe(1)
  })

  it('remembers the last camera, for a map that joins later (paging)', () => {
    const { group, maps } = setup(2)
    const cam: Camera = { center: [3, 4], zoom: 11, bearing: 0, pitch: 0 }
    maps[0].userMoves(cam)
    expect(group.last).toEqual(cam)
    const late = new FakeMap(group)
    group.add(late)
    late.jumpTo(group.last as Camera)
    expect(late.camera).toEqual(cam)
  })

  it('a removed map is no longer moved', () => {
    const { group, maps } = setup(3)
    group.remove(maps[2])
    maps[0].userMoves({ center: [9, 9], zoom: 8, bearing: 0, pitch: 0 })
    expect(maps[2].camera.zoom).toBe(5)
    expect(group.size).toBe(2)
  })

  it('two real moves in a row both propagate (the guard resets)', () => {
    const { maps } = setup(2)
    maps[0].userMoves({ center: [1, 1], zoom: 6, bearing: 0, pitch: 0 })
    maps[1].userMoves({ center: [2, 2], zoom: 8, bearing: 0, pitch: 0 })
    expect(maps[0].camera.zoom).toBe(8)
    expect(maps[1].camera.center).toEqual([2, 2])
  })
})
