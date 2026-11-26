import { describe, expect, it } from 'vitest'
import { flowColorAt } from '@/panels/flowColors'

const lum = (css: string) => {
  const [r, g, b] = css.match(/[\d.]+/g)!.map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('flowColors', () => {
  it("uses the layer's default scheme (small lines dark, large pale), and the other when asked", () => {
    const byDefault = flowColorAt(1000)
    expect(lum(byDefault(10))).toBeLessThan(lum(byDefault(1000)))
    const light = flowColorAt(1000, false)
    expect(lum(light(10))).toBeGreaterThan(lum(light(1000)))
  })
})
