import { useState } from 'react'
import { ChevronDown, ChevronUp, FolderOpen, Star, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  isLocalDeployment,
  loadLocalScenario,
  removeLocalScenario,
  supportsLocalFolderLoading,
} from '@/scenario/scenarioManager'
import { useBaseline } from '@/hooks/useBaseline'
import { useScenarioList } from '@/hooks/useScenarioList'
import { scenarioStatusTreatment } from '@/layout/settings/scenarioStatusColor'
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
//
// 024-settings-modal-visual-redesign (US1) — REAL redesign, not incremental
// polish on the prior round (a status dot + border accent, correctly
// assessed as insufficient). Grounded in two concrete sources rather than
// abstract preference:
//
// 1. The `artifact-design` skill's "When it's a UI, not a document"
//    guidance — surface the summary before the detail; encode state in
//    FORM as well as color (a dot AND colored trailing text, not color
//    alone); semantic color is separate from the accent hue.
// 2. `gropaul/dash` (docs/PIPELINE.md's own on-record design-inspiration
//    note) — its real, installed `connections-view.tsx` solves the exact
//    same problem (a list of named things, each with attached/error
//    status) and was fetched and read directly, not guessed at:
//      - the whole list lives in ONE card surface (`rounded-2xl border
//        bg-card overflow-hidden`), rows separated by hairline `border-b`
//        INSIDE it — not N individually-bordered boxes stacked with gaps.
//      - a summary line ("N declared · N need attention") sits above the
//        list, before any row is read.
//      - each row is a real two-tier stack: a small leading status DOT
//        (state is the FIRST thing scanned) + a two-line identity block
//        (primary name on top, secondary path below in smaller, MUTED,
//        MONOSPACE type — technical identifiers get `font-mono`,
//        distinguishing "data" from UI chrome) + a trailing, separately-
//        colored status word at the far right.
//    Reused directly: the card/hairline-row structure, the leading-dot +
//    two-line-identity + trailing-status-word row anatomy, and font-mono
//    for the path. NOT copied: Dash has no per-row reorder/pin — this
//    tab's own move/baseline/remove actions are new here, grouped as a
//    single trailing cluster following the same "actions live at the far
//    end, content reads left-to-right" convention Dash's own row already
//    establishes.
//
// One project-specific constraint this redesign deliberately avoids:
// confirmed via a local `npx tailwindcss` build (mapControls.css's own
// prior finding, re-verified here) that an opacity-modifier utility
// (`bg-muted/40`, `bg-background/80`, ...) generates NO CSS AT ALL against
// this project's plain-hex tokens.css — every background/hover treatment
// below uses a full-opacity token utility instead (`bg-muted`, not
// `bg-muted/40`).
//
// No behavior change to any existing action (reorder/baseline/relabel/
// remove) — every existing `data-testid`/`aria-label`/role is unchanged.
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
        // The card surface (Dash's connections-view.tsx: `bg-card border
        // rounded-2xl overflow-hidden`) — rounded-xl here, one step down
        // from Dash's own rounded-2xl, since this card sits inside an
        // already-rounded Dialog rather than as a full-page panel.
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          {/* Summary band — "surface the summary before the detail."
              Counts are derived directly from allScenarios/status, no new
              state. */}
          <div className="border-b border-border bg-muted px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {allScenarios.length} scenario{allScenarios.length === 1 ? '' : 's'} loaded
              {(() => {
                const failedCount = allScenarios.filter((s) => s.status === 'failed').length
                return (
                  failedCount > 0 && (
                    <>
                      {' · '}
                      <span className="font-semibold text-destructive">{failedCount} need attention</span>
                    </>
                  )
                )
              })()}
            </span>
          </div>
          <div data-testid="scenario-load-list" className="flex flex-col">
            {allScenarios.map((s, index) => {
              const isBaseline = s.name === baseline
              // 024-settings-modal-visual-redesign: status color is
              // derived directly from the existing s.status — no new
              // stored field (data-model.md, research.md §2).
              const treatment = scenarioStatusTreatment(s.status)
              return (
                <div
                  key={s.name}
                  className="flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted"
                >
                  {/* Leading status dot — state is the first thing
                      scanned, per Dash's own row anatomy and the
                      artifact-design skill's "encode state in form... so
                      what needs attention reads at a glance." role="status"
                      + aria-label carry the same information for anyone
                      not relying on color alone. */}
                  <span
                    role="status"
                    aria-label={treatment.label}
                    title={treatment.label}
                    data-testid={`scenario-status-dot-${s.name}`}
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      treatment.dotClassName,
                      treatment.pulse && 'animate-pulse',
                    )}
                  />

                  {/* Identity block — two-tier, matching Dash's own
                      alias-on-top/path-below stack: primary identity reads
                      first, the technical path is secondary (smaller,
                      muted, monospace — a real font distinguishing "data"
                      from UI chrome, not a font swap for its own sake). */}
                  <div className="min-w-0 flex-1">
                    {/* 020-settings-modal (US4, FR-009/FR-010): a fully
                        store-driven controlled input — no separate local
                        draft state. Typing calls appState.setLabel()/
                        clearLabel() directly on every change; the input's
                        own `value` then simply reflects whatever the store
                        currently holds on the next render, the same
                        pattern every other control in this row already
                        uses (the baseline star, move buttons) to write
                        straight to appState with no intermediate
                        component state. Empty string clears back to the
                        real name (placeholder shows it, matching every
                        other row's own before-labeling display). */}
                    <input
                      data-testid="scenario-name"
                      className="w-full truncate bg-transparent text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <div className="truncate font-mono text-xs text-muted-foreground" title={s.path}>
                      {s.path}
                    </div>
                  </div>

                  {/* Trailing status word — a SECOND, independently-colored
                      channel alongside the dot (spec.md FR-001: color AND
                      text, never color alone). The existing "(ready)"
                      text assertion in this suite's own FR-005 test keeps
                      passing unchanged — same literal string, new
                      position/color. */}
                  <span
                    className={cn(
                      'shrink-0 text-xs',
                      s.status === 'failed' ? 'font-medium text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    ({s.status})
                  </span>

                  {/* Actions cluster — grouped at the far trailing edge,
                      the same "content reads left-to-right, actions live
                      at the end" convention Dash's own row already
                      establishes (it has no per-row reorder/pin of its
                      own; this cluster is this tab's own addition, not
                      copied). Behavior of every control below is
                      UNCHANGED from the prior round. */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    {/* 020-settings-modal (US3, FR-007): move up/down — a
                        purely display-order concern
                        (appState.moveScenario()), completely independent
                        of getBaseline()'s own registration-order rule
                        (FR-008, research.md §3). Disabled, not hidden, at
                        either boundary — no error, no wraparound. */}
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
                        appState — no scenarioManager.ts indirection (no
                        I/O involved). Re-marking the current baseline is a
                        harmless no-op; there is no separate "un-mark"
                        action — the automatic default (useBaseline()
                        above) is what a viewer falls back to, via removal
                        or by marking a different scenario instead. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => appState.setBaseline(s.name)}
                      aria-label={
                        isBaseline
                          ? `${s.name} is the baseline scenario`
                          : `Mark ${s.name} as baseline scenario`
                      }
                      aria-pressed={isBaseline}
                    >
                      <Star className={cn('h-3.5 w-3.5', isBaseline && 'fill-current text-primary')} />
                    </Button>
                    {s.source === 'handle' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeLocalScenario(s.name)}
                        aria-label={`Remove ${s.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
