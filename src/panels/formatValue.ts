// Extracted from ValueBoxPanel.tsx's original local function
// (005-table-panel, research.md §2) — TablePanel.tsx's `columns[].format`
// uses the exact same Python-style format-string convention
// ValueBoxPanelConfig.format already used, so both panel types share this
// one parser rather than each maintaining their own copy of the same
// regex.
//
// TABLE-PANEL-PROPOSAL.md §2 — two real, confirmed, currently-shipping
// bugs fixed here, found by that research and reproduced live before
// this fix: (1) the original regex required the LITERAL braced form
// (`{:,.0f}`) — project-docs/GRAMMAR.md's own worked `type: table` example,
// and every one of 29 real `format:` strings on real table columns
// across public/demo-dashboard-config/*.yaml, use the BARE, unbraced
// form instead (`,.0f`, `+.1%`), which silently failed to match and
// fell through to a raw, unformatted `String(value)`. The brace
// delimiters are now optional on both sides. (2) The original
// implementation discarded everything in `format` OUTSIDE the matched
// `{...}` span — `format: "{:,.0f} mi"` (a real, live valuebox format
// string) silently dropped its own " mi" suffix entirely
// (`formatValue(1500.4, '{:,.0f} mi')` returned `"1,500"`, not
// `"1,500 mi"`). Fixed by splicing the formatted number back into the
// original string at the matched span, preserving any literal prefix/
// suffix text verbatim.
//
// Also new: a leading `+`/`-` sign-forcing flag (GRAMMAR.md's own
// `format: "+.1%"` example, for a diverging percent-error column where
// showing "+3.2%" vs "-3.2%" carries real meaning) — previously
// unsupported in any form, braced or not. Matches Python's own format-
// spec-mini-language semantics: `+` forces a leading sign on a
// zero-or-positive value; a genuinely negative value already carries
// its own "-" from `toFixed()`/`toLocaleString()`, so it's never
// double-signed.
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
  const match = format.match(/(\{:)?([+-])?(,)?\.(\d+)(f|%)(\})?/)
  if (!match) return String(value)
  const [full, , sign, comma, digitsStr, kind] = match
  const digits = Number(digitsStr)
  const num = kind === '%' ? value * 100 : value
  let out = num.toFixed(digits)
  if (comma) {
    const [intPart, decPart] = out.split('.')
    out = Number(intPart).toLocaleString('en-US') + (decPart ? `.${decPart}` : '')
  }
  if (sign === '+' && value >= 0) out = `+${out}`
  const formatted = kind === '%' ? `${out}%` : out
  return format.slice(0, match.index) + formatted + format.slice((match.index ?? 0) + full.length)
}
