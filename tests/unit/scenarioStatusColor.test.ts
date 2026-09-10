import { describe, expect, it } from 'vitest'

import { scenarioStatusTreatment } from '@/layout/settings/scenarioStatusColor'
import type { ScenarioStatus } from '@/state/appState'

describe('scenarioStatusTreatment', () => {
  it('maps "ready" to the success token, no pulse', () => {
    const t = scenarioStatusTreatment('ready')
    expect(t.dotClassName).toBe('bg-success')
    expect(t.pulse).toBe(false)
    expect(t.label).toBe('Ready')
  })

  it('maps "failed" to the SAME destructive token scenariosTab.tsx already uses for its load-error text, no pulse', () => {
    const t = scenarioStatusTreatment('failed')
    expect(t.dotClassName).toBe('bg-destructive')
    expect(t.pulse).toBe(false)
    expect(t.label).toBe('Failed')
  })

  it('maps "registering" to a neutral treatment with pulse, not a new/fabricated color', () => {
    const t = scenarioStatusTreatment('registering')
    expect(t.dotClassName).toBe('bg-muted-foreground')
    expect(t.pulse).toBe(true)
    expect(t.label).toBe('Loading')
  })

  it('covers every real ScenarioStatus value with no fallthrough', () => {
    const statuses: ScenarioStatus[] = ['registering', 'ready', 'failed']
    for (const status of statuses) {
      expect(() => scenarioStatusTreatment(status)).not.toThrow()
    }
  })

  // 036-scenario-color-picker, Part C (data-model.md §6): the row-level
  // border/background treatment, still resolved from the SAME three
  // tokens the dotClassName cases above already assert — no new color.
  describe('row-level status treatment (Part C)', () => {
    it('"ready" gets a success-token border and a real color-mix() background wash', () => {
      const t = scenarioStatusTreatment('ready')
      expect(t.rowBorderClassName).toBe('border-l-4 border-l-success')
      expect(t.rowBackgroundStyle).toEqual({
        backgroundColor: 'color-mix(in srgb, var(--success) 6%, transparent)',
      })
    })

    it('"failed" gets a destructive-token border and a real color-mix() background wash', () => {
      const t = scenarioStatusTreatment('failed')
      expect(t.rowBorderClassName).toBe('border-l-4 border-l-destructive')
      expect(t.rowBackgroundStyle).toEqual({
        backgroundColor: 'color-mix(in srgb, var(--destructive) 6%, transparent)',
      })
    })

    it('"registering" gets a muted-foreground-token border but NO background wash (the pulsing dot already signals it)', () => {
      const t = scenarioStatusTreatment('registering')
      expect(t.rowBorderClassName).toBe('border-l-4 border-l-muted-foreground')
      expect(t.rowBackgroundStyle).toBeUndefined()
    })

    it('never uses a Tailwind slash-opacity modifier, which generates no CSS against this app\'s plain-hex tokens', () => {
      const statuses: ScenarioStatus[] = ['registering', 'ready', 'failed']
      for (const status of statuses) {
        expect(scenarioStatusTreatment(status).rowBorderClassName).not.toMatch(/\//)
      }
    })
  })
})
