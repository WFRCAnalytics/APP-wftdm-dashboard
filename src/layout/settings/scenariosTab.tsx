import { useState } from 'react'
import { ChevronDown, ChevronUp, FolderOpen, Star, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  isLocalDeployment,
  loadLocalScenario,
  removeLocalScenario,
  supportsLocalFolderLoading,
} from '@/scenario/scenarioManager'
import { useBaseline } from '@/hooks/useBaseline'
import { useScenarioList } from '@/hooks/useScenarioList'
import * as appState from '@/state/appState'

// 020-settings-modal: relocated from layout/scenarioLoader.tsx (deleted by
// this feature) — list/add/remove/baseline-mark logic and behavior are
// unchanged (FR-006). Two real differences from the original:
//
// 1. Renders appState.listByDisplayOrder() (FR-007/US3's own display-order
//    concern), not appState.list() — and each row's `label ?? name`
//    (US4) plus its real `path` (FR-005, new).
// 2. LOCAL-deployment-mode handling is corrected (FR-019, research.md §8):
//    scenarioLoader.tsx used to return `null` entirely — hiding the whole
//    list/baseline/remove controls, not just the loader — whenever
//    isLocalDeployment() was true. This component instead ALWAYS renders
//    its full content; only the "Load Local Scenario" trigger itself goes
//    disabled-with-tooltip in LOCAL mode, using the exact same
//    TooltipProvider/disabled-span pattern already proven below for the
//    no-File-System-API-support case.
export function ScenariosTab() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Re-renders whenever the RESOLVED baseline (explicit or automatic-
  // default) changes, so the star stays in sync with removals/re-marks/
  // newly-ready scenarios it didn't itself cause.
  const baseline = useBaseline()
  // hooks/useScenarioList.ts — re-renders on ANY scenario field changing
  // (order/label/path/status/pinned/active/source), not just the active
  // set. useActiveScenarios() alone (this component's original hook,
  // still exactly what every OTHER active-set consumer in this app needs)
  // is NOT enough here: its own content-filtered snapshot is unaffected
  // by a label-only or reorder-only mutation, which was a real,
  // confirmed bug found during this feature's own implementation — a
  // viewer's setLabel()/moveScenario() call silently didn't appear until
  // some unrelated change forced a re-render (hooks/useScenarioList.ts's
  // own header comment has the full account).
  const allScenarios = useScenarioList()

  const local = isLocalDeployment()
  const supported = supportsLocalFolderLoading()

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
    // 'registered' and 'cancelled' need no message (FR-003 of 009).
  }

  // FR-019: exactly one of these three states is ever true. LOCAL mode
  // takes precedence in the (today unreachable, since isLocalDeployment()
  // and browser capability are independent axes) case both would apply —
  // either disabled reason is equally valid to show, and LOCAL mode's own
  // explanation is the more specific/useful one when it's true.
  const disabledReason = local
    ? 'This deployment already loads scenarios directly'
    : !supported
      ? 'Requires Chrome or Edge'
      : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {disabledReason === null ? (
          <Button variant="outline" size="sm" onClick={handleClick} disabled={busy}>
            <FolderOpen className="h-4 w-4" />
            Load Local Scenario
          </Button>
        ) : (
          // Visibly present but disabled, with an explanation (FR-019) —
          // never hidden, never a silent no-op, never a thrown exception.
          // TooltipProvider wraps this locally, scoped to just this
          // branch — Radix's Tooltip.Root throws without an ancestor
          // Provider in the installed version.
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A disabled native <button> carries Tailwind's own
                    disabled:pointer-events-none, so the button itself
                    cannot receive the hover that drives Radix's
                    Tooltip.Trigger — this wrapping <span>, not the button
                    inside it, is the actual hoverable surface. */}
                <span data-testid="scenario-load-trigger-disabled-wrapper">
                  <Button variant="outline" size="sm" disabled>
                    <FolderOpen className="h-4 w-4" />
                    Load Local Scenario
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{disabledReason}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {error && (
          <span data-testid="scenario-load-error" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
      {allScenarios.length > 0 && (
        <div data-testid="scenario-load-list" className="flex flex-col gap-1">
          {allScenarios.map((s, index) => {
            const isBaseline = s.name === baseline
            return (
              <div
                key={s.name}
                className="flex items-center gap-2 rounded-md border border-input px-2 py-1 text-sm"
              >
                {/* 020-settings-modal (US3, FR-007): move up/down — a
                    purely display-order concern (appState.moveScenario()),
                    completely independent of getBaseline()'s own
                    registration-order rule (FR-008, research.md §3).
                    Disabled, not hidden, at either boundary — no error, no
                    wraparound. */}
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-5"
                    disabled={index === 0}
                    onClick={() => appState.moveScenario(s.name, 'up')}
                    aria-label={`Move ${s.name} up`}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-5"
                    disabled={index === allScenarios.length - 1}
                    onClick={() => appState.moveScenario(s.name, 'down')}
                    aria-label={`Move ${s.name} down`}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                {/* Marks `s` as the explicit baseline directly via
                    appState — no scenarioManager.ts indirection (no I/O
                    involved). Re-marking the current baseline is a
                    harmless no-op; there is no separate "un-mark" action —
                    the automatic default (useBaseline() above) is what a
                    viewer falls back to, via removal or by marking a
                    different scenario instead. */}
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
                {/* 020-settings-modal (US4, FR-009/FR-010): a fully
                    store-driven controlled input — no separate local
                    draft state. Typing calls appState.setLabel()/
                    clearLabel() directly on every change; the input's own
                    `value` then simply reflects whatever the store
                    currently holds on the next render, the same
                    pattern every other control in this row already uses
                    (the baseline star, move buttons) to write straight to
                    appState with no intermediate component state. Empty
                    string clears back to the real name (placeholder shows
                    it, matching every other row's own before-labeling
                    display). */}
                <input
                  data-testid="scenario-name"
                  className="w-36 truncate bg-transparent font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={s.label ?? ''}
                  placeholder={s.name}
                  aria-label={`Custom label for ${s.name}`}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      appState.clearLabel(s.name)
                    } else {
                      appState.setLabel(s.name, value)
                    }
                  }}
                />
                <span className="truncate text-muted-foreground" title={s.path}>
                  {s.path}
                </span>
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
