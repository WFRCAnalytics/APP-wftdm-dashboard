import { describe, expect, it } from 'vitest'
import { parseTip, tileSegment } from '../../src/charts/builder/tipTile.ts'
import { tileSvg, tipHtml, type TipTile } from '../../src/services/tooltip.ts'

const PAIR = '⁣'

describe('parseTip', () => {
  it('reads a title, its rows and a tile', () => {
    const tile: TipTile = { kind: 'line', fill: '#123456', stroke: '#123456', dash: '7 4' }
    const spec = parseTip(`Bus~trips${PAIR}12~share${PAIR}3%${tileSegment(tile)}`)
    expect(spec.title).toBe('Bus')
    expect(spec.rows).toEqual([{ k: 'trips', v: '12' }, { k: 'share', v: '3%' }])
    expect(spec.tile).toEqual(tile)
  })
  it('round-trips a hatch and a glyph', () => {
    const hatch: TipTile = { kind: 'sq', fill: '#abc', hatch: { d: 'M0 0l8 8', sw: 1.6, fill: false } }
    const glyph: TipTile = { kind: 'glyph', fill: 'none', stroke: '#abc', d: 'M2 7h10M7 2v10' }
    expect(parseTip(`A${tileSegment(hatch)}`).tile).toEqual(hatch)
    expect(parseTip(`A${tileSegment(glyph)}`).tile).toEqual(glyph)
  })
  it('has no tile when the tip carries none, and keeps a label that contains = or ~-free operators', () => {
    const spec = parseTip(`Autos >= Workers~trips${PAIR}5`)
    expect(spec.tile).toBeUndefined()
    expect(spec.rows).toEqual([{ k: 'trips', v: '5' }])
  })
  it('ignores a tile of an unknown kind', () => {
    expect(parseTip('A~⁤blob⁥red').tile).toBeUndefined()
  })
})

describe('tile in the tooltip', () => {
  it('draws a tile in place of the dot, with every value escaped', () => {
    const html = tipHtml({ title: 'Bus', swatch: '#f00', tile: { kind: 'sq', fill: '"><script>x</script>' }, rows: [{ k: 'trips', v: '1' }] })
    expect(html).toContain('<svg class="tt-tile"')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('background:#f00')
  })
  it('draws a hatch with its own pattern, a dashed line and a glyph', () => {
    expect(tileSvg({ kind: 'sq', fill: '#abc', hatch: { d: 'M0 0l8 8', sw: 1.6, fill: false } })).toContain('<pattern id="wf-tt-hatch"')
    expect(tileSvg({ kind: 'line', fill: '#abc', stroke: '#abc', dash: '7 4' })).toContain('stroke-dasharray="7 4"')
    expect(tileSvg({ kind: 'glyph', fill: '#abc', d: 'M1 1h4v4z' })).toContain('<path d="M1 1h4v4z"')
  })
  it('drops the blank colour slot when no row has a colour', () => {
    const none = tipHtml({ title: 'Walk', rows: [{ k: 'A', v: '1' }, { k: 'B', v: '2' }] })
    expect(none).not.toContain('<i')
    expect(none).toContain('tt-r nc')
    const some = tipHtml({ title: 'Walk', rows: [{ k: 'A', v: '1', c: '#fff' }, { k: 'B', v: '2' }] })
    expect(some).toContain('<i class="n"></i>')
    expect(some).not.toContain('nc')
  })
})
