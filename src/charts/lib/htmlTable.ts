// Tiny DOM helpers for the HTML-table chart bodies (scorecard, calibration table). Text always goes in as text nodes,
// never as markup, so a scenario label cannot inject anything.
type Attrs = Record<string, string | number | undefined>

export function h(tag: string, attrs: Attrs = {}, ...children: (Node | string | null | undefined)[]): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue
    if (k === 'style') el.setAttribute('style', String(v))
    else el.setAttribute(k, String(v))
  }
  for (const c of children) if (c !== null && c !== undefined) el.append(c)
  return el
}

/** A coloured dot (a scenario swatch). */
export const dot = (color: string, opacity?: number): HTMLElement =>
  h('i', {
    style: `display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:9px;flex:none${opacity ? `;opacity:${opacity}` : ''}`,
  })

/** The dashed ink sample used for Observed (the reference line). */
export const dashSample = (): HTMLElement =>
  h('i', { style: 'display:inline-block;width:14px;border-top:2px dashed var(--ink);margin-right:7px;vertical-align:middle;flex:none' })

export const TBL = 'width:100%;border-collapse:collapse;font-size:13px'
export const TH = 'font-weight:500;color:var(--mute);text-align:left;font-size:12.5px;padding:6px 8px;border-bottom:1px solid var(--line)'
export const TD = 'padding:8px;border-bottom:1px solid var(--grid)'
export const NUM = 'text-align:right;font-family:var(--font-mono);font-size:13px;font-variant-numeric:tabular-nums'
