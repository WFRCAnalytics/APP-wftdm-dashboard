import type { CSSProperties } from 'react'
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
//
// 036-scenario-color-picker, Part C: the small dot alone was found to
// read as plain default styling, not genuinely prominent — extended with
// a row-level border/background treatment, still using ONLY the same
// three tokens above (data-model.md §6). rowBorderClassName is a plain
// Tailwind utility (border-l-4 border-l-{token}) — confirmed via the
// wftdm-design-system skill that a slash-opacity form against this app's
// plain-hex custom properties generates no CSS at all, but a solid
// border needs no transparency, so a plain utility class costs nothing
// here. rowBackgroundStyle DOES need partial transparency (a "wash," not
// a solid fill) and therefore uses a real color-mix() value as an inline
// style, never a slash-opacity utility class. 'registering' gets no
// background wash — its pulsing dot already carries the state's own
// visual signal, and a wash on a fast-changing/transient row would be
// motion-y noise rather than clarity.

export interface ScenarioStatusTreatment {
  /** Tailwind classes for a small indicator dot/badge. */
  dotClassName: string
  /** Whether the indicator should pulse to signal an in-progress state. */
  pulse: boolean
  /** Human-readable label, for an aria-label/title — not the raw status string. */
  label: string
  /** 036-scenario-color-picker (Part C): a border-left utility for the
   * row's own outer container, using the same token as dotClassName. */
  rowBorderClassName: string
  /** 036-scenario-color-picker (Part C): a color-mix() background wash
   * for the row's own outer container, as an inline style object —
   * undefined for 'registering' (see file header comment). */
  rowBackgroundStyle: CSSProperties | undefined
}

const TREATMENTS: Record<ScenarioStatus, ScenarioStatusTreatment> = {
  ready: {
    dotClassName: 'bg-success',
    pulse: false,
    label: 'Ready',
    rowBorderClassName: 'border-l-4 border-l-success',
    rowBackgroundStyle: { backgroundColor: 'color-mix(in srgb, var(--success) 6%, transparent)' },
  },
  failed: {
    dotClassName: 'bg-destructive',
    pulse: false,
    label: 'Failed',
    rowBorderClassName: 'border-l-4 border-l-destructive',
    rowBackgroundStyle: { backgroundColor: 'color-mix(in srgb, var(--destructive) 6%, transparent)' },
  },
  registering: {
    dotClassName: 'bg-muted-foreground',
    pulse: true,
    label: 'Loading',
    rowBorderClassName: 'border-l-4 border-l-muted-foreground',
    rowBackgroundStyle: undefined,
  },
}

export function scenarioStatusTreatment(status: ScenarioStatus): ScenarioStatusTreatment {
  return TREATMENTS[status]
}
