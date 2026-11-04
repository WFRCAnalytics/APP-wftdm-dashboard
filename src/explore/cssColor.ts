// 065-chart-builder: any CSS colour as the #rrggbb an <input type="color"> takes. The canvas does the parsing, so a theme colour of
// any notation (hex, rgb(), hsl(), color-mix()) works; a colour the canvas cannot read comes back as a neutral grey.
let ctx: CanvasRenderingContext2D | null | undefined

export function cssToHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase()
  if (ctx === undefined) {
    try { ctx = document.createElement('canvas').getContext('2d') } catch { ctx = null }
  }
  if (!ctx) return '#888888'
  ctx.fillStyle = '#888888'
  ctx.fillStyle = color
  const v = ctx.fillStyle
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v)
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '#888888'
}
