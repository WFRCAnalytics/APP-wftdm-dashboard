import { describe, expect, it } from 'vitest'

import { crc32, uniqueNames, zip } from '../../src/services/zip.ts'

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('writes local headers, a central directory and an end record for stored entries', async () => {
    const data = new TextEncoder().encode('a,b\r\n1,2\r\n')
    const blob = zip([{ name: 'one.csv', data }, { name: 'two.csv', data }], new Date(2026, 9, 22, 10, 30, 0))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    const end = bytes.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    const dirOffset = view.getUint32(end + 16, true)
    expect(view.getUint32(dirOffset, true)).toBe(0x02014b50)
    expect(view.getUint32(14, true)).toBe(crc32(data))
    expect(new TextDecoder().decode(bytes.slice(30, 37))).toBe('one.csv')
  })

  it('keeps names unique', () => {
    expect(uniqueNames(['a.csv', 'a.csv', 'b.csv', 'a.csv'])).toEqual(['a.csv', 'a-2.csv', 'b.csv', 'a-3.csv'])
  })
})
