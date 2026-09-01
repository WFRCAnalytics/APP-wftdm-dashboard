import { useState } from 'react'
import { FolderOpen, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  isLocalDeployment,
  loadLocalScenario,
  removeLocalScenario,
  supportsLocalFolderLoading,
} from '@/scenario/scenarioManager'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
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

  if (isLocalDeployment()) return null

  const supported = supportsLocalFolderLoading()
  const localScenarios = appState.list().filter((s) => s.source === 'handle')

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
      {localScenarios.length > 0 && (
        <div data-testid="scenario-load-list" className="flex items-center gap-1">
          {localScenarios.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-sm"
            >
              <span>{s.name}</span>
              <span className="text-muted-foreground">({s.status})</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => removeLocalScenario(s.name)}
                aria-label={`Remove ${s.name}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
