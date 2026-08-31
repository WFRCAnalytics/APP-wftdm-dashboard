import { describe, expect, it } from 'vitest'

import { parseDashboardConfig } from '@/layout/types'

describe('parseDashboardConfig', () => {
  it('parses a well-formed config into a typed DashboardTabConfig', () => {
    const raw = {
      header: { tab: 'Summary', title: 'Model Run Summary', description: 'x' },
      filters: [
        { id: 'purpose', label: 'Purpose', type: 'select', source: 'trip_mode_share', column: 'purpose', default: 'all' },
      ],
      layout: {
        row_kpis: [{ type: 'valuebox', title: 'Total Trips', metric: 'summary_kpis', column: 'total_trips', format: '{:,.0f}' }],
      },
    }
    const parsed = parseDashboardConfig(raw)
    expect(parsed.header.tab).toBe('Summary')
    expect(parsed.header.title).toBe('Model Run Summary')
    expect(parsed.filters).toHaveLength(1)
    expect(parsed.layout.row_kpis).toHaveLength(1)
  })

  it('throws a descriptive error when header.tab is missing', () => {
    const raw = { header: { title: 'Model Run Summary' } }
    expect(() => parseDashboardConfig(raw, 'dashboard-1-summary.yaml')).toThrow(
      /header\.tab/,
    )
  })

  it('throws a descriptive error when header.title is missing', () => {
    const raw = { header: { tab: 'Summary' } }
    expect(() => parseDashboardConfig(raw, 'dashboard-1-summary.yaml')).toThrow(
      /header\.title/,
    )
  })

  it('includes the source path in the thrown error message', () => {
    const raw = { header: {} }
    expect(() => parseDashboardConfig(raw, 'dashboard-9-broken.yaml')).toThrow(
      /dashboard-9-broken\.yaml/,
    )
  })

  it('defaults filters to [] when absent', () => {
    const raw = { header: { tab: 'Summary', title: 'Model Run Summary' } }
    expect(parseDashboardConfig(raw).filters).toEqual([])
  })

  it('defaults layout to {} when absent', () => {
    const raw = { header: { tab: 'Summary', title: 'Model Run Summary' } }
    expect(parseDashboardConfig(raw).layout).toEqual({})
  })
})
