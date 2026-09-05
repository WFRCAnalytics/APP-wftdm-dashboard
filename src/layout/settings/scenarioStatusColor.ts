import type { ScenarioStatus } from '@/state/appState'

// 024-settings-modal-visual-redesign: pure status -> visual-treatment
// resolution, split out of scenariosTab.tsx same reason panels/
// zonemapColor.ts and panels/sankeyColor.ts were split out of their own
// consumers — a DOM-free mapping this project's own convention already
// keeps separately testable from the component that renders it.
//
// Confirmed directly (state/appState.ts) that ScenarioStatus has exactly
// three values — 'registering' | 'ready' | 'failed' — with no "warning"
// tier (research.md §2, spec.md's own Assumptions section). 'ready' maps
// to the new --success token; 'failed' reuses the SAME --destructive
// treatment scenariosTab.tsx's own load-error text already uses, rather
// than inventing a second red; 'registering' gets a neutral/pending
// treatment (existing --muted-foreground, no new color), not a
// fabricated third semantic color for a status this app doesn't have.

export interface ScenarioStatusTreatment {
  /** Tailwind classes for a small indicator dot/badge. */
  dotClassName: string
  /** Whether the indicator should pulse to signal an in-progress state. */
  pulse: boolean
  /** Human-readable label, for an aria-label/title — not the raw status string. */
  label: string
}

const TREATMENTS: Record<ScenarioStatus, ScenarioStatusTreatment> = {
  ready: { dotClassName: 'bg-success', pulse: false, label: 'Ready' },
  failed: { dotClassName: 'bg-destructive', pulse: false, label: 'Failed' },
  registering: { dotClassName: 'bg-muted-foreground', pulse: true, label: 'Loading' },
}

export function scenarioStatusTreatment(status: ScenarioStatus): ScenarioStatusTreatment {
  return TREATMENTS[status]
}
