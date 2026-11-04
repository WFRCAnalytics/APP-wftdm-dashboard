import { describe, expect, it } from 'vitest'
import { addPngText, crc32, itxt } from '../../src/services/pngText.ts'
import { readSvgText } from '../../src/services/exportTile.ts'

// a 1 x 1 PNG
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))
const text = (b: Uint8Array) => Buffer.from(b).toString('latin1')

describe('png text', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('writes a well-formed international text chunk', () => {
    const c = itxt('Description', 'Café: 12k trips')
    const view = new DataView(c.buffer)
    expect(text(c.subarray(4, 8))).toBe('iTXt')
    expect(view.getUint32(0)).toBe(c.length - 12)
    expect(view.getUint32(c.length - 4)).toBe(crc32(c.subarray(4, c.length - 4)))
    expect(new TextDecoder().decode(c.subarray(8 + 'Description'.length + 5, c.length - 4))).toBe('Café: 12k trips')
  })

  it('adds the entries after the header and leaves the image alone', () => {
    const out = addPngText(PNG, { Title: 'Trips by mode', Description: 'A bar chart.', Empty: '  ' })
    expect([...out.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const s = text(out)
    expect(s.indexOf('IHDR')).toBeLessThan(s.indexOf('iTXt'))
    expect(s.indexOf('iTXt')).toBeLessThan(s.indexOf('IDAT'))
    expect(s).toContain('Title')
    expect(s).toContain('Description')
    expect(s).not.toContain('Empty')
    expect(text(out.subarray(out.length - 12))).toContain('IEND')
    expect(addPngText(PNG, {})).toBe(PNG)
    expect(addPngText(Uint8Array.of(1, 2, 3), { Title: 'x' })).toEqual(Uint8Array.of(1, 2, 3))
  })

  it('reads back the title and description an SVG carries', () => {
    const svg = '<svg><title id="export-title">Trips &amp; modes</title><desc id="export-desc">A &quot;bar&quot; chart &lt;of&gt; trips.</desc><g/></svg>'
    expect(readSvgText(svg)).toEqual({ title: 'Trips & modes', description: 'A "bar" chart <of> trips.' })
    expect(readSvgText('<svg><g/></svg>')).toEqual({ title: '', description: '' })
  })
})
