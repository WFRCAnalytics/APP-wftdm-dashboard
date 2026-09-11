import { describe, expect, it } from 'vitest'

import { parseDashboardConfig } from '@/layout/types'

// 040-test-suite-migration, FR-019–FR-021: `header.aria_label` is a new
// optional string, parsed fail-soft like `header.icon`. Read only by
// layout/sidebarNav.tsx, which sets it as the sidebar button's
// `aria-label`. Only public/demo-dashboard-config/dashboard-8-test.yaml
// uses it (that tab's visible `header.tab` is a single space " ").
// Supersedes the retired `header.blank_nav` boolean.
describe('parseDashboardConfig — header.aria_label', () => {
  const base = { header: { tab: ' ', title: 'Test / Broken Panels' } }

  it('reads a non-empty aria_label string', () => {
    const parsed = parseDashboardConfig({ header: { ...base.header, aria_label: 'Test' } })
    expect(parsed.header.aria_label).toBe('Test')
  })

  it('is undefined when the key is absent (every real content tab)', () => {
    expect(parseDashboardConfig(base).header.aria_label).toBeUndefined()
  })

  it('coerces an empty string to undefined (fail-soft — no empty aria-label)', () => {
    expect(
      parseDashboardConfig({ header: { ...base.header, aria_label: '' } }).header.aria_label,
    ).toBeUndefined()
  })

  it('coerces a non-string value to undefined', () => {
    for (const bad of [42, true, null, {}, []]) {
      const parsed = parseDashboardConfig({ header: { ...base.header, aria_label: bad } })
      expect(parsed.header.aria_label).toBeUndefined()
    }
  })

  it('accepts a single space as a valid header.tab (dashboard-8-test.yaml shape)', () => {
    const parsed = parseDashboardConfig({
      header: { tab: ' ', title: 'Test / Broken Panels', aria_label: 'Test' },
    })
    expect(parsed.header.tab).toBe(' ')
    expect(parsed.header.aria_label).toBe('Test')
  })

  it('still throws on a genuinely empty header.tab', () => {
    expect(() =>
      parseDashboardConfig({ header: { tab: '', title: 'x', aria_label: 'Test' } }, 'x.yaml'),
    ).toThrow(/header\.tab/)
  })

  it('no longer recognizes the retired header.blank_nav key', () => {
    const parsed = parseDashboardConfig({ header: { ...base.header, blank_nav: true } })
    expect((parsed.header as Record<string, unknown>).blank_nav).toBeUndefined()
  })
})
