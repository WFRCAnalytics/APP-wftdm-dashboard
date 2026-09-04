import { useState } from 'react'
import { FolderOpen, Star, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  isLocalDeployment,
  loadLocalScenario,
  removeLocalScenario,
  supportsLocalFolderLoading,
} from '@/scenario/scenarioManager'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useBaseline } from '@/hooks/useBaseline'
import * as appState from '@/state/appState'

// 009-scenario-manager: mounted in shell.tsx's header, alongside NavBar
// (FR-001) — dashboard-wide, not panel-specific. Hidden entirely (not
// disabled) in LOCAL deployment mode (spec.md's Documented behavior
// findings #1): that mode has its own file-serving path already.
export function ScenarioLoader() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Re-renders when the active set changes (any scenario, not just local
  // ones) so a locally loaded entry's status reflects promptly in the
  // list below — cheap, since this component itself holds no per-panel
  // query state to lose (FR-008's constraint is about panel-local state,
  // not this component's own render-on-store-change behavior).
  useActiveScenarios()
  // 018-baseline-scenario-designation: re-renders this component whenever
  // the RESOLVED baseline (explicit or automatic-default) changes, so the
  // star below stays in sync with removals/re-marks/newly-ready scenarios
  // it didn't itself cause.
  const baseline = useBaseline()

  if (isLocalDeployment()) return null

  const supported = supportsLocalFolderLoading()
  // 018-baseline-scenario-designation (research.md §6): widened from
  // local-only to EVERY registered scenario — the baseline control below
  // must be reachable for a published/observed scenario too, and this was
  // the only scenario-list rendering path anywhere in the app to hang it
  // on. The existing remove (X) button below stays gated to source ===
  // 'handle' exactly as before; this widening only affects what's shown,
  // not what's removable.
  const allScenarios = appState.list()

  async function handleClick() {
    setBusy(true)
    setError(null)
    const result = await loadLocalScenario()
    setBusy(false)
    if (result.outcome === 'collision') {
      setError(`"${result.name}" is already a published scenario name`)
    } else if (result.outcome === 'failed') {
      setError(`Couldn't load "${result.name}"`)
    }
    // 'registered' and 'cancelled' need no message (FR-003).
  }

  return (
    <div className="flex items-center gap-2">
      {supported ? (
        <Button variant="outline" size="sm" onClick={handleClick} disabled={busy}>
          <FolderOpen className="h-4 w-4" />
          Load Local Scenario
        </Button>
      ) : (
        // Visibly present but disabled, with an explanation (US2, FR-002)
        // — not hidden, not a silent no-op, not a thrown exception.
        // TooltipProvider wraps this locally, scoped to just this
        // branch — Radix's Tooltip.Root throws ("must be used within
        // TooltipProvider") without an ancestor Provider in the installed
        // version (confirmed empirically, not assumed from general Radix
        // docs — no other production code in this app uses Tooltip yet,
        // so this requirement had never been exercised before, and an
        // uncaught version of it crashes the whole React tree with no
        // error boundary around Shell to contain it).
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled native <button> carries Tailwind's own
                  disabled:pointer-events-none (components/ui/button.tsx),
                  so the button itself cannot receive the hover that
                  drives Radix's Tooltip.Trigger — this wrapping <span>,
                  not the button inside it, is the actual hoverable
                  surface (confirmed empirically: Playwright's own hover()
                  reported the span "intercepting" pointer events aimed at
                  the button, which is Tailwind's utility doing exactly
                  what it's for). data-testid gives tests a stable way to
                  target this element specifically, not the inert button. */}
              <span data-testid="scenario-load-trigger-disabled-wrapper">
                <Button variant="outline" size="sm" disabled>
                  <FolderOpen className="h-4 w-4" />
                  Load Local Scenario
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Requires Chrome or Edge</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {error && (
        <span data-testid="scenario-load-error" className="text-sm text-destructive">
          {error}
        </span>
      )}
      {allScenarios.length > 0 && (
        <div data-testid="scenario-load-list" className="flex items-center gap-1">
          {allScenarios.map((s) => {
            const isBaseline = s.name === baseline
            return (
              <div
                key={s.name}
                className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-sm"
              >
                {/* 018-baseline-scenario-designation: marks `s` as the
                    explicit baseline directly via appState — no
                    scenarioManager.ts indirection (no I/O involved,
                    research.md §6). Re-marking the current baseline is a
                    harmless no-op (FR-001 Acceptance Scenario 3); there is
                    no separate "un-mark" action in this control (research.md
                    §6) — the automatic default (useBaseline() above) is
                    what a viewer falls back to, via removal or by marking
                    a different scenario instead. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => appState.setBaseline(s.name)}
                  aria-label={
                    isBaseline ? `${s.name} is the baseline scenario` : `Mark ${s.name} as baseline scenario`
                  }
                  aria-pressed={isBaseline}
                >
                  <Star className={`h-3 w-3 ${isBaseline ? 'fill-current text-primary' : ''}`} />
                </Button>
                <span>{s.name}</span>
                <span className="text-muted-foreground">({s.status})</span>
                {s.source === 'handle' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => removeLocalScenario(s.name)}
                    aria-label={`Remove ${s.name}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
