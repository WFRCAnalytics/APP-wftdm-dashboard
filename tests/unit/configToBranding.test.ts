import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

import { toBranding, validate } from '../../src/config'

function branding(file: string) {
  const { settings, problems } = validate(load(readFileSync(file, 'utf8')), { file })
  return { b: toBranding(settings), problems }
}

describe('toBranding', () => {
  it('reads the real demo file with no problems and reproduces its former branding', () => {
    const { b, problems } = branding('public/demo-dashboard-config/dashboard-config.yaml')
    expect(problems).toEqual([])
    expect(b.title).toBe('WFRC TDM Calibration Dashboard')
    expect(b.logoUrl).toContain('WFRC_logo_horizontal_color_transparent.png')
    expect(b.logoUrlDark).toContain('WFRC_logo_horizontal_white_transparent.png')
    expect(b.markUrl).toContain('WFRC_logo_abbreviated_color_transparent.png')
    expect(b.markUrlDark).toContain('WFRC_logo_abbreviated_white_transparent.png')
    expect(b.protomapsApiKey).toBe('2c497b58fdc8c210')
    expect(b.layout).toEqual({ mode: 'tabs' })
    expect(b.compareDefault).toBe('auto')
    expect(b.units).toEqual({ trips: { divisor: 1, suffix: '' }, transit_share_max: 60 })
    expect(b.metrics?.boards).toEqual({ hidden: true })
    expect(b.vocab?.districts?.map((d) => d.label)).toEqual(['Weber', 'Davis', 'Salt Lake', 'Utah', 'Tooele'])
    expect(b.vocab?.modes?.[0]).toEqual({ label: 'Drive alone', ids: ['SOV'], color: 'car-1' })
    expect(b.years).toBeUndefined()
  })

  it('reads the synthetic set: years, base and default year, and the compare start', () => {
    const { b, problems } = branding('public/demo-synthetic/dashboard-config/dashboard-config.yaml')
    expect(problems).toEqual([])
    expect(b.years?.[0]).toEqual({ year: 2023, label: 'Base year' })
    expect(b.years).toHaveLength(6)
    expect(b.baseYear).toBe(2023)
    expect(b.defaultYear).toBe(2036)
    expect(b.compareFocus).toBe('frequent-transit')
    expect(b.compareReference).toBe('baseline')
    expect(b.compareScenarios).toEqual(['baseline', 'frequent-transit', 'infill-density'])
  })

  it('reads the legacy fixture set', () => {
    const { b, problems } = branding('tests/fixtures/legacy-demo/dashboard-config/dashboard-config.yaml')
    expect(problems).toEqual([])
    expect(b.years?.map((y) => y.year)).toEqual([2023, 2036])
    expect(b.defaultYear).toBe(2023)
  })

  it('maps a bare year to { year } and drops unset groups', () => {
    const { settings } = validate({ years: { list: [2023, { year: 2050, label: 'H' }] } }, { file: 'x' })
    const b = toBranding(settings)
    expect(b.years).toEqual([{ year: 2023 }, { year: 2050, label: 'H' }])
    expect(b.units).toBeUndefined()
    expect(b.layout).toBeUndefined()
    expect(b.title).toBeUndefined()
  })
})
