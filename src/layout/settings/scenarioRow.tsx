import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { removeLocalScenario } from '@/scenario/scenarioManager'
import { scenarioStatusTreatment } from '@/layout/settings/scenarioStatusColor'
import { ScenarioColorControl } from '@/layout/settings/scenarioColorControl'
import * as appState from '@/state/appState'
import type { Scenario } from '@/state/appState'

// 037-scenarios-tab-redesign: one Scenarios-tab row, extracted from
// scenariosTab.tsx's own .map() body so @dnd-kit/sortable's useSortable()
// hook has a clean, unconditional per-row call site.
//
// Part B — the up/down move buttons moved from the trailing actions
// cluster to the row's LEADING edge, next to a new drag handle.
// Part C — the row is an @dnd-kit sortable node; a dedicated GripVertical
// handle (not the whole row) carries the drag listeners so the row's own
// interactive controls (name input, Switch, swatch, baseline control,
// remove button) are never swallowed by a drag. The relocated arrow
// buttons remain a complete, keyboard-accessible fallback (FR-005) and
// funnel through the SAME appState reorder path (moveScenario now
// delegates to reorderScenario — FR-004).
//
// 037 item 5 (row-layout refinement):
//   - The green/red ready/failed status DOT is removed. The row's own
//     border-colour + background-wash treatment (036 Part C,
//     scenarioStatusColor.ts) already communicates ready/failed — the dot
//     was redundant. Only the 'registering' state keeps a dedicated
//     signal: the "Loading…" text (its own indicator since an earlier
//     round), rendered where the dot used to sit.
//   - The colour swatch (ScenarioColorControl) moves from the trailing
//     actions cluster to sit at the LEFT of the whole two-line identity
//     block (name on line 1, path on line 2), vertically centred against
//     both lines together — the "leading avatar/icon beside a two-line
//     title+subtitle" pattern common in list rows (e.g. GitHub's repo
//     list). A legend-key "this colour = this scenario" association.
export interface ScenarioRowProps {
  scenario: Scenario
  index: number
  total: number
  baselineName: string | undefined
}

export function ScenarioRow({ scenario: s, index, total, baselineName }: ScenarioRowProps) {
  const isBaseline = s.name === baselineName
  const treatment = scenarioStatusTreatment(s.status)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: s.name,
  })

  return (
    <div
      ref={setNodeRef}
      data-testid={`scenario-row-${s.name}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...treatment.rowBackgroundStyle,
      }}
      className={cn(
        'flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted',
        treatment.rowBorderClassName,
        // While dragging: lift the row above its siblings and keep it
        // opaque so it reads as picked-up, not a translucent ghost.
        isDragging && 'relative z-10 bg-card opacity-90 shadow-md',
      )}
    >
      {/* Leading edge — reorder controls (Part B): a drag handle then the
          up/down arrow column. */}
      <div className="flex shrink-0 items-center gap-0.5">
        {/* Drag handle (Part C) — carries the @dnd-kit sortable
            listeners; `touch-none` so a touch drag doesn't scroll the
            list instead. Keyboard: focus this, Space to lift, arrows to
            move, Space to drop, Escape to cancel (KeyboardSensor). */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 cursor-grab touch-none active:cursor-grabbing"
          aria-label={`Reorder ${s.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </Button>
        {/* 020-settings-modal (US3, FR-007): move up/down — a purely
            display-order concern (appState.moveScenario(), now a thin
            wrapper over reorderScenario()). Disabled, not hidden, at
            either boundary — no error, no wraparound. Relocated here
            from the trailing cluster by 037's Part B; behavior and
            aria-label text unchanged. */}
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
            disabled={index === total - 1}
            onClick={() => appState.moveScenario(s.name, 'down')}
            aria-label={`Move ${s.name} down`}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* 'registering' is the ONLY status that still gets a dedicated
          leading indicator (037 item 5) — the ready/failed dot is gone,
          carried by the row border/background instead. role="status" +
          aria-label keep this announced for non-visual users. */}
      {s.status === 'registering' && (
        <span
          role="status"
          aria-label={treatment.label}
          data-testid={`scenario-status-loading-${s.name}`}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {treatment.label}…
        </span>
      )}

      {/* 036-scenario-color-picker: Popover-hosted colour picker (swatch,
          hex, RGB). 037 item 5 places it at the LEFT of the whole
          identity block — the row's own `items-center` vertically centres
          it against both the name and path lines together (leading
          avatar/icon pattern). */}
      <div className="flex shrink-0 items-center">
        <ScenarioColorControl scenario={s} />
      </div>

      {/* Identity block — name (+ baseline chip) on line 1, path on line 2. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {/* 020-settings-modal (US4): a fully store-driven controlled
              input — no local draft state. Typing calls appState.setLabel()/
              clearLabel() directly; the input's `value` reflects the store
              on the next render. Empty string clears back to the real name
              (shown via the placeholder). */}
          <input
            data-testid="scenario-name"
            className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <BaselineChip name={s.name} isBaseline={isBaseline} />
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground" title={s.path}>
          {s.path}
        </div>
      </div>

      {/* Actions cluster — trailing. */}
      <div className="flex shrink-0 items-center gap-0.5">
        {/* 036-scenario-color-picker, Part C (FR-019/FR-020): wired
            DIRECTLY to appState's existing active/setActive() — no new
            mechanism. Reactively affects every $scenario.-driven panel
            via the existing, unmodified useActiveScenarios() hook.
            037 Part E: a scoped hover/focus Tooltip. Its text is
            deliberately scoped to the Switch's REAL effect (confirmed by
            the 037 investigation): it only changes what a panel shows if
            that panel has NO `scenario:`/`scenarios:` key — a pinned
            panel names its scenario directly and is independent of
            `appState.active` by design (services/sqlExpander.ts). No
            change to the Switch's aria-label / checked / onCheckedChange
            (FR-013). TooltipProvider is scoped per row, matching this
            feature's existing convention. */}
        <TooltipProvider>
          <Tooltip>
            {/* Trigger on a wrapping <span>, not the Switch itself: Radix
                Tooltip.Trigger writes its own `data-state` onto the
                element it's applied to, which would clobber the Switch's
                own `data-[state=checked|unchecked]` styling. The span is
                the hoverable surface (FR-012); the Switch keeps its
                aria-label / checked / onCheckedChange untouched (FR-013). */}
            <TooltipTrigger asChild>
              <span className="mr-1 inline-flex">
                <Switch
                  size="sm"
                  checked={s.active}
                  onCheckedChange={(checked) => appState.setActive(s.name, checked)}
                  aria-label={
                    s.active ? `Exclude ${s.name} from queries` : `Include ${s.name} in queries`
                  }
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Include this scenario when panels aren&rsquo;t pinned to a specific scenario
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* The colour swatch sits left of the identity block (037 item 5);
            the baseline chip sits inside it (Part D). Neither is in this
            trailing cluster any more. */}
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
}

// 037-scenarios-tab-redesign, Part D: the SINGLE baseline indicator,
// beside the scenario name. Replaces the Star / Star+"Baseline"-text
// control (036) entirely — its own text always states what is true
// ("Baseline") or exactly what clicking it does ("Set as baseline"), so
// it needs no tooltip to explain either state (FR-011).
//
//   - Current baseline row: a filled Badge reading "Baseline". A pure
//     status display — NOT wrapped in a button, no onClick (FR-009).
//   - Every other row: an outline Badge reading "Set as baseline",
//     wrapped in a <button> that calls the same appState.setBaseline()
//     the Star used to (FR-010).
//
// Both states occupy an identical reserved width (an invisible sizer
// rendering the wider "Set as baseline" label, stacked in the same grid
// cell), so the identity block never shifts width between a baseline and
// a non-baseline row (FR-015 — the same "render the widest state, hide
// it" technique this session already proved for the Star control).
function BaselineChip({ name, isBaseline }: { name: string; isBaseline: boolean }) {
  return (
    <span data-testid={`baseline-chip-${name}`} className="grid shrink-0 justify-items-start">
      <span aria-hidden className="invisible col-start-1 row-start-1">
        <Badge variant="outline">Set as baseline</Badge>
      </span>
      <span className="col-start-1 row-start-1">
        {isBaseline ? (
          <Badge variant="default">Baseline</Badge>
        ) : (
          <button
            type="button"
            onClick={() => appState.setBaseline(name)}
            aria-label={`Mark ${name} as baseline scenario`}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              Set as baseline
            </Badge>
          </button>
        )}
      </span>
    </span>
  )
}
