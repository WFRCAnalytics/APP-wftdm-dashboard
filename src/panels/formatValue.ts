// Extracted from ValueBoxPanel.tsx's original local function
// (005-table-panel, research.md §2) — TablePanel.tsx's `columns[].format`
// uses the exact same Python-style format-string convention
// ValueBoxPanelConfig.format already used, so both panel types share this
// one parser rather than each maintaining their own copy of the same
// regex. Behavior is unchanged from the original: minimal support for
// {:,.0f} / {:.1f} / {:.1%}; non-numeric values are stringified as-is.
export function formatValue(value: unknown, format: string): string {
  // 019-baseline-diff-consumption: a real, confirmed bug fixed here —
  // without this branch, null/undefined fell through to the generic
  // `String(value)` fallback below, rendering the literal three-character
  // string "null"/"undefined" (String(null) === 'null'). A diff_value
  // column's own zero-baseline degenerate case (a NULLIF-guarded percent-
  // diff formula, FR-013) legitimately produces SQL NULL for some rows —
  // this must read as a distinct, defined "not computable" state (FR-014),
  // never a raw JS-artifact string. Checked before the typeof guard below
  // so it takes precedence over the generic stringify fallback.
  if (value === null || value === undefined) return 'N/A'
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
