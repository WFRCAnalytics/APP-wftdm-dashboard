// Extracted from ValueBoxPanel.tsx's original local function
// (005-table-panel, research.md §2) — TablePanel.tsx's `columns[].format`
// uses the exact same Python-style format-string convention
// ValueBoxPanelConfig.format already used, so both panel types share this
// one parser rather than each maintaining their own copy of the same
// regex. Behavior is unchanged from the original: minimal support for
// {:,.0f} / {:.1f} / {:.1%}; non-numeric values are stringified as-is.
export function formatValue(value: unknown, format: string): string {
  if (typeof value !== 'number') return String(value)
  const match = format.match(/\{:(,)?\.(\d+)(f|%)\}/)
  if (!match) return String(value)
  const [, comma, digitsStr, kind] = match
  const digits = Number(digitsStr)
  const num = kind === '%' ? value * 100 : value
  let out = num.toFixed(digits)
  if (comma) {
    const [intPart, decPart] = out.split('.')
    out = Number(intPart).toLocaleString('en-US') + (decPart ? `.${decPart}` : '')
  }
  return kind === '%' ? `${out}%` : out
}
