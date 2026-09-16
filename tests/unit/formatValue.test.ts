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

  // TABLE-PANEL-PROPOSAL.md §2 — a real, confirmed bug: project-docs/GRAMMAR.md's
  // own worked type: table example, and 29 real live table columns across
  // public/demo-dashboard-config/*.yaml, use this BARE (unbraced) form —
  // it silently failed to match the original braces-only regex.
  it('applies the bare (unbraced) form GRAMMAR.md documents and real table columns use — ",.0f"', () => {
    expect(formatValue(9200, ',.0f')).toBe('9,200')
  })

  it('applies a bare "+.1%" — sign-forcing on a positive value, no double-sign on a negative one', () => {
    expect(formatValue(0.032, '+.1%')).toBe('+3.2%')
    expect(formatValue(-0.032, '+.1%')).toBe('-3.2%')
    expect(formatValue(0, '+.1%')).toBe('+0.0%')
  })

  // A real, live valuebox format string, "{:,.0f} mi" — the original
  // implementation discarded everything outside the matched {...} span,
  // silently dropping the " mi" suffix entirely.
  it('preserves literal prefix/suffix text around the matched format spec', () => {
    expect(formatValue(1500.4, '{:,.0f} mi')).toBe('1,500 mi')
  })

  it('supports a braced sign-forcing form too, not just the bare one', () => {
    expect(formatValue(0.032, '{:+.1%}')).toBe('+3.2%')
  })
})
