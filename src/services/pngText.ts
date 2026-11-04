// Text carried inside a PNG file (iTXt chunks, UTF-8), so an exported chart keeps its title and description after it leaves the app.
// Viewers that show image properties and tools that read PNG metadata can read them. Pure bytes; no DOM.

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** The CRC-32 PNG chunks are checked with. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const ascii = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff)

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(ascii(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** One international text chunk: a keyword (1 to 79 Latin-1 characters) and its UTF-8 text. */
export function itxt(keyword: string, text: string): Uint8Array {
  const key = ascii(keyword.slice(0, 79))
  const body = new TextEncoder().encode(text)
  // keyword, 0, compression flag 0, method 0, empty language tag, 0, empty translated keyword, 0, text
  const data = new Uint8Array(key.length + 5 + body.length)
  data.set(key, 0)
  data.set(body, key.length + 5)
  return chunk('iTXt', data)
}

/** The PNG with each non-empty entry added as a text chunk straight after the header; the image itself is untouched. */
export function addPngText(png: Uint8Array, entries: Record<string, string>): Uint8Array {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  if (png.length < 33 || sig.some((b, i) => png[i] !== b)) return png
  const at = 8 + 12 + new DataView(png.buffer, png.byteOffset, png.byteLength).getUint32(8)
  const add = Object.entries(entries).filter(([, v]) => v.trim()).map(([k, v]) => itxt(k, v))
  if (!add.length) return png
  const out = new Uint8Array(png.length + add.reduce((n, c) => n + c.length, 0))
  out.set(png.subarray(0, at), 0)
  let pos = at
  for (const c of add) { out.set(c, pos); pos += c.length }
  out.set(png.subarray(at), pos)
  return out
}
