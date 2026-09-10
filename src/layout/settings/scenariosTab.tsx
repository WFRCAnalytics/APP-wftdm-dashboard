import { useState } from 'react'
import { ChevronDown, ChevronUp, FolderOpen, Star, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
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
import { ScenarioColorControl } from '@/layout/settings/scenarioColorControl'
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
//
// 036-scenario-color-picker, Part C (additive, folded in after Parts A/B
// had already shipped on this branch — does not touch the palette
// resolution chain or the color picker at all):
//
// 1. The row's own outer container now also carries
//    treatment.rowBorderClassName/rowBackgroundStyle (scenarioStatusColor.ts,
//    extended) — a genuinely prominent per-row status treatment, still
//    grounded in the same three existing --success/--destructive/
//    --muted-foreground tokens the dot already used (FR-017/FR-018).
// 2. A Switch, wired DIRECTLY to appState's existing `active`/
//    `setActive()` — no new mechanism (FR-019). Toggling it off/on
//    reactively changes every $scenario.-driven panel's query via the
//    existing, unmodified useActiveScenarios() hook (FR-020). Applies to
//    every scenario regardless of source (url or handle) — the user's
//    own explicit scope decision that this replaces the need for a new
//    removal capability for published scenarios.
// 3. A "Baseline" text Badge replaces the filled Star as the PRIMARY
//    baseline indicator (FR-021) — the Star button itself, its
//    aria-label/aria-pressed/onClick, is completely unchanged (FR-022).
//
// Part C, refinement (same feature/branch, folded in after the Badge
// version above had already shipped — real, direct research this time,
// not invented): the separate Badge (floating in the identity block,
// away from the Star it duplicates) and the plain outline Star elsewhere
// in the row created a real ambiguity — two different controls in two
// different places both claiming to indicate/set the SAME thing. Studied
// two real, well-established cross-industry examples of exactly this
// "one designated item among many, clearly marked, user-changeable"
// problem before redesigning:
//   - GitHub's own default-branch indication (github.com/{owner}/{repo}/
//     branches, fetched directly) — the default branch is grouped under
//     its own "Default" heading with a label immediately beside its name,
//     never an icon standing alone.
//   - Stripe's own `invoice_settings.default_payment_method` /
//     `default_source` concept (docs.stripe.com/api/customers/object,
//     fetched directly) — the real, documented convention for marking one
//     saved item "default" among several, surfaced in the Dashboard/
//     customer portal as a text label directly beside the item, with an
//     explicit "set as default" action on the others.
// The common thread in both: text label + icon TOGETHER, immediately
// ADJACENT, as one unit — never an icon alone, never a label floating
// elsewhere. Fixed by removing the separate Badge entirely and pairing
// the Star with its own label directly, in the Star's own existing
// location (not moved into the identity block):
//   - Baseline row: one Button containing a filled/colored Star followed
//     immediately by the text "Baseline" — one compact unit.
//   - Every other row: the existing outline Star alone (no persistent
//     text — an empty state doesn't need explaining the way an active one
//     does), with a hover Tooltip reading "Set as baseline", matching
//     both real references' own "clarify the action on hover" convention.
// The click-to-mark interaction itself — onClick/aria-label/aria-pressed
// text — is BYTE-FOR-BYTE unchanged from the original Star button.
//
// Same pass also drops the redundant trailing "(ready)"/"(failed)" text
// entirely — FR-017/FR-018's own row-level border+background treatment
// already communicates those two states without it. "registering" keeps
// a visible text cue (not just the pulsing dot alone, which research
// judged not loud enough on its own for an in-progress state) — reusing
// scenarioStatusColor.ts's own existing `treatment.label` ("Loading")
// rather than a new hardcoded string, shown inline next to the dot.
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
                  className={cn(
                    'flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted',
                    treatment.rowBorderClassName,
                  )}
                  style={treatment.rowBackgroundStyle}
                >
                  {/* Leading status indicator — state is the first thing
                      scanned, per Dash's own row anatomy and the
                      artifact-design skill's "encode state in form... so
                      what needs attention reads at a glance." role="status"
                      + aria-label carry the same information for anyone
                      not relying on color alone. The row's own border/
                      background treatment (below) now carries ready/
                      failed — this dot alone is enough for those two,
                      confirmed by the row treatment already being a
                      second, independent channel. "registering" is the
                      one status that still needs a visible text cue (a
                      pulsing dot alone isn't loud enough for an
                      in-progress state) — reusing treatment.label
                      ("Loading") rather than a new hardcoded string. */}
                  <span className="flex shrink-0 items-center gap-1.5">
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
                    {s.status === 'registering' && (
                      <span className="text-xs text-muted-foreground">{treatment.label}…</span>
                    )}
                  </span>

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

                  {/* Actions cluster — grouped at the far trailing edge,
                      the same "content reads left-to-right, actions live
                      at the end" convention Dash's own row already
                      establishes (it has no per-row reorder/pin of its
                      own; this cluster is this tab's own addition, not
                      copied). Behavior of every control below is
                      UNCHANGED from the prior round. */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    {/* 036-scenario-color-picker, Part C (FR-019/FR-020):
                        wired DIRECTLY to appState's existing active/
                        setActive() — no new mechanism. Reactively affects
                        every $scenario.-driven panel via the existing,
                        unmodified useActiveScenarios() hook, exactly like
                        removing a scenario does today. Applies regardless
                        of source (url or handle). Placed first in the
                        cluster — "whether this scenario is included in
                        queries at all" is more fundamental than color/
                        reorder/baseline. */}
                    <Switch
                      size="sm"
                      checked={s.active}
                      onCheckedChange={(checked) => appState.setActive(s.name, checked)}
                      aria-label={s.active ? `Exclude ${s.name} from queries` : `Include ${s.name} in queries`}
                      className="mr-1"
                    />
                    {/* 036-scenario-color-picker (FR-011/FR-012):
                        replaces 035's own native <input type="color">
                        swatch + inline clear button with a Popover-hosted
                        color picker (swatch, hex, RGB, all editable) —
                        see that component's own doc comment for the full
                        story, including where the "reset to default"
                        action moved to (FR-016). */}
                    <ScenarioColorControl scenario={s} />
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
                        or by marking a different scenario instead.
                        A real, confirmed layout bug fixed here: the
                        baseline row's Star+"Baseline" text is wider than
                        every other row's Star-alone control — with a
                        right-aligned actions cluster, that width
                        difference shrinks the identity block by a
                        different amount on the baseline row specifically,
                        visibly shifting the switch/swatch/reorder-arrows
                        LEFT relative to every other row. Fixed by
                        rendering the SAME markup (icon + text span) on
                        EVERY row regardless of baseline state — the text
                        span is `invisible`, not conditionally absent, on
                        a non-baseline row, so it still reserves the exact
                        same layout width without being visually shown.
                        This makes the control's width — and therefore
                        every other action's x-position to its left —
                        identical across all rows, baseline or not. */}
                    {(() => {
                      const baselineControl = (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn('h-6 gap-1 px-1.5', isBaseline && 'text-primary hover:text-primary')}
                          onClick={() => appState.setBaseline(s.name)}
                          aria-label={
                            isBaseline
                              ? `${s.name} is the baseline scenario`
                              : `Mark ${s.name} as baseline scenario`
                          }
                          aria-pressed={isBaseline}
                        >
                          <Star className={cn('h-3.5 w-3.5 shrink-0', isBaseline && 'fill-current')} />
                          <span className={cn('text-xs font-medium', !isBaseline && 'invisible')}>
                            Baseline
                          </span>
                        </Button>
                      )
                      // No persistent VISIBLE text for a non-baseline row
                      // — an empty state doesn't need explaining the way
                      // an active one does. A hover Tooltip clarifies the
                      // action instead, matching both real references'
                      // own "clarify on hover" convention. TooltipProvider
                      // is scoped locally per row, same reason as the
                      // disabled Load-Local-Scenario branch above.
                      return isBaseline ? (
                        baselineControl
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>{baselineControl}</TooltipTrigger>
                            <TooltipContent>Set as baseline</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )
                    })()}
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
