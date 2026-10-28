import { describe, expect, it } from 'vitest'

import { chainEntries, chainIndex, chainOrder, closeGap, dropZone, insertIntoChain, removeFromChain, reorderInChain } from '@/charts/builder/chainOps'
import { defaultSpec, type Channel } from '@/charts/builder/spec'

const ORDER: Channel[] = ['color', 'detail', 'ring3', 'ring4', 'ring5']
const rings = (...fields: string[]) => defaultSpec({ mark: 'sunburst', enc: Object.fromEntries(fields.map((f, i) => [ORDER[i], { f }])) })
const names = (s: ReturnType<typeof rings>) => chainEntries(s, ORDER).map((e) => e.f)

describe('chainOrder', () => {
  it('finds the chain of a level or table shelf, and nothing for an ordinary shelf', () => {
    expect(chainOrder('treemap', 'ring4')).toEqual(ORDER)
    expect(chainOrder('sunburst', 'color')).toEqual(ORDER)
    expect(chainOrder('text', 'rg3')?.[0]).toBe('y')
    expect(chainOrder('text', 'val2')?.[0]).toBe('label')
    expect(chainOrder('sunburst', 'size')).toBeUndefined()
    expect(chainOrder('bar', 'color')).toBeUndefined()
  })
})

describe('removing', () => {
  it('promotes the later rings when the middle one goes', () => {
    const s = removeFromChain(rings('a', 'b', 'c'), 'detail')
    expect(names(s)).toEqual(['a', 'c'])
    expect(s.enc.detail?.f).toBe('c')
    expect(s.enc.ring3).toBeUndefined()
  })
  it('promotes the second ring to the first when the first goes', () => {
    const s = removeFromChain(rings('a', 'b', 'c'), 'color')
    expect(s.enc.color?.f).toBe('b')
    expect(s.enc.detail?.f).toBe('c')
  })
  it('takes the last one off without touching the others, and an ordinary shelf just clears', () => {
    expect(names(removeFromChain(rings('a', 'b', 'c'), 'ring3'))).toEqual(['a', 'b'])
    const bar = defaultSpec({ mark: 'bar', enc: { x: { f: 'p' }, color: { f: 'm' } } })
    expect(removeFromChain(bar, 'color').enc).toEqual({ x: { f: 'p' } })
  })
  it('closes the gap in a spec saved with one', () => {
    const gappy = defaultSpec({ mark: 'sunburst', enc: { color: { f: 'a' }, ring3: { f: 'c' } } })
    expect(closeGap(gappy, ORDER).enc.detail?.f).toBe('c')
  })
})

describe('inserting', () => {
  it('puts a new field first and pushes the others along', () => {
    const s = insertIntoChain(rings('a', 'b'), ORDER, 0, { f: 'n' })!
    expect(names(s)).toEqual(['n', 'a', 'b'])
    expect(s.enc.ring3?.f).toBe('b')
  })
  it('puts one in the middle and at the end', () => {
    expect(names(insertIntoChain(rings('a', 'b'), ORDER, 1, { f: 'n' })!)).toEqual(['a', 'n', 'b'])
    expect(names(insertIntoChain(rings('a', 'b'), ORDER, 2, { f: 'n' })!)).toEqual(['a', 'b', 'n'])
    expect(names(insertIntoChain(rings(), ORDER, 0, { f: 'n' })!)).toEqual(['n'])
  })
  it('keeps each field its own settings', () => {
    const s = insertIntoChain(defaultSpec({ mark: 'text', enc: { label: { f: 'a', agg: 'sum', dec: 2 } } }), chainOrder('text', 'label')!, 0, { f: 'b', agg: 'mean' })!
    expect(s.enc.label).toEqual({ f: 'b', agg: 'mean' })
    expect(s.enc.val2).toEqual({ f: 'a', agg: 'sum', dec: 2 })
  })
  it('refuses when every level is used', () => {
    expect(insertIntoChain(rings('a', 'b', 'c', 'd', 'e'), ORDER, 0, { f: 'n' })).toBeNull()
  })
})

describe('reordering', () => {
  it('moves the last ring to the front, and the first to the end', () => {
    expect(names(reorderInChain(rings('a', 'b', 'c'), ORDER, 'ring3', 0))).toEqual(['c', 'a', 'b'])
    expect(names(reorderInChain(rings('a', 'b', 'c'), ORDER, 'color', 3))).toEqual(['b', 'c', 'a'])
  })
  it('leaves the order alone when dropped next to itself', () => {
    expect(names(reorderInChain(rings('a', 'b', 'c'), ORDER, 'detail', 1))).toEqual(['a', 'b', 'c'])
    expect(names(reorderInChain(rings('a', 'b', 'c'), ORDER, 'detail', 2))).toEqual(['a', 'b', 'c'])
  })
  it('knows where a ring sits', () => {
    expect(chainIndex(rings('a', 'b'), ORDER, 'detail')).toBe(1)
    expect(chainIndex(rings('a', 'b'), ORDER, 'ring3')).toBe(-1)
  })
})

describe('dropZone', () => {
  const boxes = [
    { ch: 'color' as Channel, left: 0, right: 100, top: 0, bottom: 38 },
    { ch: 'detail' as Channel, left: 108, right: 208, top: 0, bottom: 38 },
    { ch: 'ring3' as Channel, left: 216, right: 316, top: 0, bottom: 38, empty: true },
  ]
  it('splits a shelf into insert before, replace, insert after', () => {
    expect(dropZone(boxes, 10, 20)).toEqual({ ch: 'color', side: 'before' })
    expect(dropZone(boxes, 50, 20)).toEqual({ ch: 'color', side: 'on' })
    expect(dropZone(boxes, 95, 20)).toEqual({ ch: 'color', side: 'after' })
  })
  it('counts the gap between two shelves as an insert, on either side of its middle', () => {
    expect(dropZone(boxes, 103, 20)).toEqual({ ch: 'color', side: 'after' })
    expect(dropZone(boxes, 106, 20)).toEqual({ ch: 'detail', side: 'before' })
  })
  it('an empty shelf only adds, and a point outside every shelf is nothing', () => {
    expect(dropZone(boxes, 220, 20)).toEqual({ ch: 'ring3', side: 'on' })
    expect(dropZone(boxes, 500, 20)).toBeNull()
    expect(dropZone(boxes, 50, 90)).toBeNull()
  })
})
