import { describe, expect, it } from 'vitest'

import { formatValue } from '@/panels/formatValue'

// Same cases ValueBoxPanel.tsx previously only exercised indirectly
// through its own rendering — confirms the 005-table-panel extraction
// (research.md §2) changed nothing observable.
describe('formatValue', () => {
  it('applies {:,.0f} — thousands separator, no decimals', () => {
    expect(formatValue(9200, '{:,.0f}')).toBe('9,200')
  })

  it('applies {:.1f} — one decimal, no thousands separator', () => {
    expect(formatValue(6.42, '{:.1f}')).toBe('6.4')
  })

  it('applies {:.1%} — one-decimal percentage', () => {
    expect(formatValue(0.847, '{:.1%}')).toBe('84.7%')
  })

  it('passes a non-numeric value through as a plain string, ignoring the format', () => {
    expect(formatValue('SOV', '{:.1%}')).toBe('SOV')
  })

  it('falls back to String(value) when the format string does not match the supported patterns', () => {
    expect(formatValue(42, 'not-a-format-string')).toBe('42')
  })

  // 019-baseline-diff-consumption: a real, confirmed bug fixed here —
  // formatValue(null, ...) previously fell through to String(value),
  // rendering the literal string "null" (String(null) === 'null'). A
  // diff_value column's own zero-baseline percent-diff case legitimately
  // produces SQL NULL (FR-013) and must read as a distinct "N/A" state
  // (FR-014), not a raw JS artifact.
  it('renders null/undefined as a distinct "N/A" state, not the literal string "null"/"undefined"', () => {
    expect(formatValue(null, '{:.1%}')).toBe('N/A')
    expect(formatValue(undefined, '{:.1%}')).toBe('N/A')
    expect(formatValue(null, 'not-a-format-string')).toBe('N/A')
  })
})
