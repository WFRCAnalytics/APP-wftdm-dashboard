import { describe, expect, it } from 'vitest'

import { crosshairX } from '../../src/panels/plotInteraction.ts'
import { escapeHtml, placeTip, tipHtml } from '../../src/services/tooltip.ts'

describe('tipHtml', () => {
  it('escapes markup in every string', () => {
    const html = tipHtml({ title: '<script>x</script>', sub: 'a&b', rows: [{ k: '"q"', v: '<b>', d: '<i>' }], foot: '<foot>' })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<foot>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a&amp;b')
    expect(html).toContain('&quot;q&quot;')
  })
  it('renders rows with and without swatch, delta and footer', () => {
    const html = tipHtml({ title: 'Walk', rows: [{ k: 'A', v: '1', c: '#fff', d: '+1', b: true }, { k: 'B', v: '2' }] })
    expect(html).toContain('class="tt-r b"')
    expect(html).toContain('<i class="n"></i>')
    expect(html).toContain('class="tt-d"')
    expect(html).not.toContain('tt-f')
    expect(tipHtml({ rows: [], foot: 'src' })).toContain('<div class="tt-f">src</div>')
  })
  it('escapeHtml leaves plain text alone', () => expect(escapeHtml('Drive alone')).toBe('Drive alone'))
})

describe('placeTip', () => {
  const vp = { width: 1000, height: 800 }
  const size = { width: 200, height: 100 }
  it('sits 16px from the pointer', () => expect(placeTip({ clientX: 100, clientY: 100 }, size, vp)).toEqual({ x: 116, y: 116 }))
  it('flips left and up at the right and bottom edges', () => {
    expect(placeTip({ clientX: 900, clientY: 100 }, size, vp).x).toBe(900 - 200 - 16)
    expect(placeTip({ clientX: 100, clientY: 760 }, size, vp).y).toBe(760 - 100 - 16)
  })
  it('never leaves the viewport on the near edges', () =>
    expect(placeTip({ clientX: 2, clientY: 2 }, { width: 2000, height: 2000 }, vp).x).toBeGreaterThanOrEqual(8))
})

describe('crosshairX', () => {
  const o = { ml: 40, mr: 10, w: 440, x0: 0, x1: 23 }
  it('snaps to the nearest integer', () => expect(crosshairX(40 + (390 * 5.4) / 23, o)).toBe(5))
  it('is null outside the plot area', () => {
    expect(crosshairX(10, o)).toBeNull()
    expect(crosshairX(470, o)).toBeNull()
  })
  it('clamps to the domain and uses a custom snap', () => {
    expect(crosshairX(40 - 3, o)).toBe(0)
    expect(crosshairX(200, { ...o, snap: () => 12 })).toBe(12)
  })
})

import { syncRows } from '../../src/panels/gridSync.ts'

describe('syncRows', () => {
  const cells = [
    { run: 'base', color: '#111', val: '40.0%', num: 40 },
    { run: 'a', color: '#222', val: '42.0%', num: 42 },
    { run: 'b', color: '#333' },
  ]
  it('lists the reference first, bold, with deltas for the others and skips cells without the item', () => {
    const { rows, more } = syncRows(cells, (r) => r.toUpperCase(), { rel: false, unit: ' pts' })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ k: 'BASE · reference', b: true, d: '' })
    expect(rows[1].d).toBe('+2.0 pts')
    expect(more).toBe(0)
  })
  it('uses percent change when relative, and a true minus', () => {
    const { rows } = syncRows([cells[0], { run: 'a', color: '#222', val: '30', num: 30 }], (r) => r, { rel: true, unit: '' })
    expect(rows[1].d).toBe('−25.0%')
  })
  it('caps at 8 rows and counts the rest', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ run: `r${i}`, color: '#000', val: '1', num: 1 }))
    const { rows, more } = syncRows(many, (r) => r, { rel: false, unit: '' })
    expect(rows).toHaveLength(8)
    expect(more).toBe(3)
  })
})
