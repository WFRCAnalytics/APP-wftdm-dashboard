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
})
