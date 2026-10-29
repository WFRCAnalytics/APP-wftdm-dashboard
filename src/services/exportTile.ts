// Export of a tile: its data as CSV and its picture as SVG or PNG
// (project-docs/redesign/10-toolbar-layout-export-proposal.md section D). Everything here reads what is already on
// screen or in memory; nothing queries DuckDB or parses a file.

export type ExportRow = Record<string, unknown>

/** One table of a tile's data: `name` becomes part of the file name. */
export interface ExportTable {
  name: string
  rows: ExportRow[]
}

// ---------------------------------------------------------------------------------------------------------------- CSV

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Comma separated, header first, columns in first-seen order; no comment lines and no thousands separators. */
export function toCsv(rows: readonly ExportRow[]): string {
  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    }
  }
  const lines = [columns.map(cell).join(',')]
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','))
  return lines.join('\r\n') + '\r\n'
}

/** The data of every `<table>` inside `root`, read from the DOM (the table panels and HTML tables). */
export function tablesFromDom(root: HTMLElement): ExportTable[] {
  const out: ExportTable[] = []
  root.querySelectorAll('table').forEach((table, index) => {
    const headers = [...table.querySelectorAll('thead th')].map((th) => (th.textContent ?? '').replace(/\s+/g, ' ').trim())
    const rows: ExportRow[] = []
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const row: ExportRow = {}
      ;[...tr.children].forEach((td, i) => {
        row[headers[i] || `column ${i + 1}`] = (td.textContent ?? '').replace(/\s+/g, ' ').trim()
      })
      rows.push(row)
    })
    if (rows.length > 0) out.push({ name: index === 0 ? 'table' : `table-${index + 1}`, rows })
  })
  return out
}

/** Tab separated, for pasting into a spreadsheet. */
export function toTsv(rows: readonly ExportRow[]): string {
  return toCsv(rows)
    .split('\r\n')
    .map((line) => {
      // re-split on the CSV commas outside quotes
      const parts: string[] = []
      let current = ''
      let quoted = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') {
            current += '"'
            i++
          } else quoted = !quoted
        } else if (ch === ',' && !quoted) {
          parts.push(current)
          current = ''
        } else current += ch
      }
      parts.push(current)
      return parts.join('\t')
    })
    .join('\n')
}

// ------------------------------------------------------------------------------------------------------------ files

/** A safe, readable file name: no path separators or trailing dots, lower case words joined by dashes. */
export function fileName(parts: readonly (string | number | undefined)[], extension: string): string {
  const base = parts
    .filter((p) => p !== undefined && p !== '')
    .map((p) =>
      String(p)
        .normalize('NFKD')
        .replace(/[^\w\s.-]+/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase(),
    )
    .filter(Boolean)
    .join('-')
    .replace(/[.]+$/g, '')
    .slice(0, 120)
  return `${base || 'export'}.${extension}`
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** CSV with a byte order mark, so Excel reads non-ASCII text correctly. */
export function downloadCsv(rows: readonly ExportRow[], name: string): void {
  downloadBlob(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }), name)
}

// ------------------------------------------------------------------------------------------------------------ image

const XMLNS = 'http://www.w3.org/2000/svg'

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const num = (n: number) => Math.round(n * 100) / 100

/** Presentation properties copied from the computed style onto an exported SVG element (theme variables resolved). */
const SVG_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline',
  'paint-order', 'shape-rendering',
]

function isTransparent(color: string): boolean {
  return !color || color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color) || color === 'rgba(0, 0, 0, 0)'
}

function inlineSvgStyles(source: Element, copy: Element): void {
  const cs = getComputedStyle(source)
  let style = ''
  for (const prop of SVG_PROPS) {
    const value = cs.getPropertyValue(prop)
    if (value) style += `${prop}:${value};`
  }
  if (cs.display === 'none') style += 'display:none;'
  copy.setAttribute('style', style)
  copy.removeAttribute('class')
  for (let i = 0; i < source.children.length; i++) {
    if (copy.children[i]) inlineSvgStyles(source.children[i], copy.children[i])
  }
}

interface Walk {
  /** The element being exported, and whether the image has no background (then its own box is left out too). */
  root: Element
  transparent: boolean
  gradients: number
  out: string[]
  origin: DOMRect
  pending: Promise<void>[]
  captureMap: (container: HTMLElement) => Promise<string | null>
}

// Explore's legend entries are buttons (hover isolates a series) but are part of the picture, so `.lgi` is kept.
const SKIP = 'button:not(.lgi), select, input, textarea, [data-export-skip], .wf-tip, .maplibregl-ctrl, .sr-only, .wfz-ctl, .wfz-linked'

function visible(cs: CSSStyleDeclaration): boolean {
  return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0
}

function textRuns(node: Text): { text: string; rect: DOMRect }[] {
  const full = node.textContent ?? ''
  if (!full.trim()) return []
  const range = document.createRange()
  range.selectNodeContents(node)
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
  if (rects.length <= 1) return rects.length === 1 ? [{ text: full.replace(/\s+/g, ' ').trim(), rect: rects[0] }] : []
  // wrapped text: group words into lines by their top edge
  const lines: { text: string; rect: DOMRect }[] = []
  const wordRe = /\S+/g
  let match: RegExpExecArray | null
  let current: { words: string[]; left: number; top: number; right: number; bottom: number } | null = null
  while ((match = wordRe.exec(full))) {
    range.setStart(node, match.index)
    range.setEnd(node, match.index + match[0].length)
    const r = range.getBoundingClientRect()
    if (r.width === 0) continue
    if (current && Math.abs(r.top - current.top) < r.height / 2) {
      current.words.push(match[0])
      current.right = Math.max(current.right, r.right)
    } else {
      if (current) lines.push({ text: current.words.join(' '), rect: new DOMRect(current.left, current.top, current.right - current.left, current.bottom - current.top) })
      current = { words: [match[0]], left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
  }
  if (current) lines.push({ text: current.words.join(' '), rect: new DOMRect(current.left, current.top, current.right - current.left, current.bottom - current.top) })
  return lines
}

/** A simple `linear-gradient(<direction>, color [stop%], ...)` as an SVG gradient; returns its id, or null. */
function linearGradient(image: string, w: Walk): string | null {
  const m = /^linear-gradient\((.*)\)$/.exec(image.trim())
  if (!m) return null
  const args: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of m[1]) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      args.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  args.push(cur.trim())
  let x2 = 0
  let y2 = 1
  if (/^to /.test(args[0]) || /deg$/.test(args[0])) {
    const dir = args.shift()!
    if (dir === 'to right' || dir === '90deg') [x2, y2] = [1, 0]
    else if (dir === 'to left' || dir === '270deg') [x2, y2] = [-1, 0]
    else if (dir === 'to top' || dir === '0deg') [x2, y2] = [0, -1]
  }
  const stops = args.map((a, i) => {
    const part = /^(.*?)(?:\s+(-?[\d.]+)%)?$/.exec(a)
    const offset = part?.[2] !== undefined ? Number(part[2]) / 100 : args.length === 1 ? 0 : i / (args.length - 1)
    return `<stop offset="${num(offset)}" stop-color="${esc(part?.[1] ?? a)}"/>`
  })
  const id = `wfg${w.gradients++}`
  w.out.push(
    `<linearGradient id="${id}" x1="${x2 < 0 ? 1 : 0}" y1="${y2 < 0 ? 1 : 0}" x2="${x2 > 0 ? 1 : x2 < 0 ? 0 : 0}" y2="${y2 > 0 ? 1 : y2 < 0 ? 0 : 0}">${stops.join('')}</linearGradient>`,
  )
  return id
}

function walk(el: Element, w: Walk): void {
  if (el.matches(SKIP)) return
  const cs = getComputedStyle(el)
  if (!visible(cs)) return
  const rect = el.getBoundingClientRect()
  const x = rect.left - w.origin.left
  const y = rect.top - w.origin.top

  if (el instanceof SVGSVGElement) {
    if (rect.width < 1 || rect.height < 1) return
    const copy = el.cloneNode(true) as SVGSVGElement
    inlineSvgStyles(el, copy)
    copy.querySelectorAll('title, [data-export-skip]').forEach((n) => n.remove())
    const viewBox = el.getAttribute('viewBox') ?? `0 0 ${num(rect.width)} ${num(rect.height)}`
    copy.setAttribute('xmlns', XMLNS)
    copy.setAttribute('x', String(num(x)))
    copy.setAttribute('y', String(num(y)))
    copy.setAttribute('width', String(num(rect.width)))
    copy.setAttribute('height', String(num(rect.height)))
    copy.setAttribute('viewBox', viewBox)
    copy.removeAttribute('style')
    w.out.push(new XMLSerializer().serializeToString(copy))
    return
  }

  if (el instanceof HTMLElement && el.classList.contains('maplibregl-map')) {
    const index = w.out.length
    w.out.push('')
    w.pending.push(
      w.captureMap(el).then((url) => {
        if (url) w.out[index] = `<image x="${num(x)}" y="${num(y)}" width="${num(rect.width)}" height="${num(rect.height)}" href="${url}" preserveAspectRatio="none"/>`
      }),
    )
    return
  }
  if (el instanceof HTMLCanvasElement) {
    try {
      w.out.push(`<image x="${num(x)}" y="${num(y)}" width="${num(rect.width)}" height="${num(rect.height)}" href="${el.toDataURL('image/png')}" preserveAspectRatio="none"/>`)
    } catch {
      // a tainted canvas is simply left out
    }
    return
  }

  // box: background and border
  const bg = cs.backgroundColor
  const gradient = linearGradient(cs.backgroundImage, w)
  const borderW = parseFloat(cs.borderTopWidth) || 0
  const hasBorder = borderW > 0 && cs.borderTopStyle !== 'none' && !isTransparent(cs.borderTopColor)
  if (!(el === w.root && w.transparent) && rect.width > 0 && rect.height > 0 && (!isTransparent(bg) || hasBorder || gradient)) {
    const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, rect.height / 2, rect.width / 2)
    w.out.push(
      `<rect x="${num(x + borderW / 2)}" y="${num(y + borderW / 2)}" width="${num(Math.max(0, rect.width - borderW))}" height="${num(Math.max(0, rect.height - borderW))}" rx="${num(r)}" ` +
        `fill="${gradient ? `url(#${gradient})` : isTransparent(bg) ? 'none' : esc(bg)}"${hasBorder ? ` stroke="${esc(cs.borderTopColor)}" stroke-width="${borderW}"` : ''}/>`,
    )
  }

  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const ccs = cs
      for (const run of textRuns(child as Text)) {
        const size = parseFloat(ccs.fontSize) || 12
        const family = `${ccs.fontFamily}, system-ui, sans-serif`
        const text = ccs.textTransform === 'uppercase' ? run.text.toUpperCase() : run.text
        w.out.push(
          `<text x="${num(run.rect.left - w.origin.left)}" y="${num(run.rect.top - w.origin.top + run.rect.height / 2)}" dominant-baseline="central" ` +
            `fill="${esc(ccs.color)}" font-family="${esc(family)}" font-size="${size}" font-weight="${esc(ccs.fontWeight)}" ` +
            `${ccs.letterSpacing !== 'normal' ? `letter-spacing="${esc(ccs.letterSpacing)}" ` : ''}xml:space="preserve">${esc(text)}</text>`,
        )
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      walk(child as Element, w)
    }
  }
}

/** Greedy word wrap at about `max` characters per line. */
function wrapText(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}

export interface ImageOptions {
  /** Drawn under the card when set. */
  footer?: string
  /** Page background behind the card; null for none (a transparent image). */
  background: string | null
  /** Resolves a MapLibre container to a PNG data URL (see services/mapCapture.ts). */
  captureMap?: (container: HTMLElement) => Promise<string | null>
}

/** The tile card as it looks on screen, as one standalone SVG document (controls and buttons left out). */
export async function cardToSvg(card: HTMLElement, options: ImageOptions): Promise<{ svg: string; width: number; height: number }> {
  const origin = card.getBoundingClientRect()
  const pad = 12
  const maxChars = Math.max(30, Math.floor((origin.width - 12) / 6.4))
  const footerLines = options.footer ? wrapText(options.footer, maxChars) : []
  const footerH = footerLines.length > 0 ? 12 + footerLines.length * 16 : 0
  const w: Walk = { root: card, transparent: options.background === null, gradients: 0, out: [], origin, pending: [], captureMap: options.captureMap ?? (async () => null) }
  walk(card, w)
  await Promise.all(w.pending)
  const width = Math.ceil(origin.width) + pad * 2
  const height = Math.ceil(origin.height) + pad * 2 + footerH
  const footer = footerLines
    .map(
      (line, i) =>
        `<text x="${pad + 6}" y="${Math.ceil(origin.height) + pad + 20 + i * 16}" font-family="system-ui, sans-serif" font-size="11.5" fill="${esc(getComputedStyle(card).color)}" fill-opacity="0.65">${esc(line)}</text>`,
    )
    .join('')
  const svg =
    `<svg xmlns="${XMLNS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    (options.background === null ? '' : `<rect width="${width}" height="${height}" fill="${esc(options.background)}"/>`) +
    `<g transform="translate(${pad} ${pad})">${w.out.join('')}</g>${footer}</svg>`
  return { svg, width, height }
}

/** Renders an SVG document to a PNG at `scale` times its size. */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('The image could not be rendered'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No canvas available')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The PNG could not be created'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}
