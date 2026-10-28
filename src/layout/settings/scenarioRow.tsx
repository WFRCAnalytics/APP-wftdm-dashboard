import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react'

import { MiniButton } from '@/components/ui/mini-button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { removeLocalScenario } from '@/scenario/scenarioManager'
import { scenarioStatusTreatment } from '@/layout/settings/scenarioStatusColor'
import { ScenarioColorControl } from '@/layout/settings/scenarioColorControl'
import * as appState from '@/state/appState'
import { getState, setReference, setScenarioGroupActive } from '@/state/compareState'
import { scenarioGroupOf } from '@/services/runResolution'
import type { Scenario } from '@/state/appState'

// One Scenarios-tab card (project-docs/redesign/02-layout-and-components.md section 4.2):
//   [grip] [swatch] [name input + "tag - caption"] [Include switch] [Baseline chip | Set as baseline] [up] [down]
// The grip is the @dnd-kit sortable handle; the up/down buttons are the keyboard-accessible fallback. Both end in
// appState.reorderScenario (the buttons through ScenariosTab's moveBy, the drag through its onDragEnd).
export interface ScenarioRowProps {
  scenario: Scenario
  index: number
  total: number
  baselineName: string | undefined
  onMove: (name: string, delta: -1 | 1) => void
}

export function ScenarioRow({ scenario: s, index, total, baselineName, onMove }: ScenarioRowProps) {
  const isBaseline = s.name === baselineName
  const treatment = scenarioStatusTreatment(s.status)
  const failed = s.status === 'failed'

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.name })

  // The caption: the manifest tag, then where the run was loaded from.
  const caption = [s.tag, s.path].filter(Boolean).join(' · ')

  return (
    <div
      ref={setNodeRef}
      data-testid={`scenario-row-${s.name}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(failed ? treatment.rowBackgroundStyle : undefined),
      }}
      className={cn(
        'mb-2 grid grid-cols-[22px_34px_minmax(140px,1fr)_auto_auto_auto] items-center gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--tile-hi)] px-2.5 py-2',
        'max-[900px]:grid-cols-[22px_34px_minmax(0,1fr)_auto]',
        // Only a failed run is flagged on its card; a healthy one looks like any other.
        // The accent border is 4px against the normal 1px, so the row gives back 3px of left padding: its content
        // (swatch, name, controls) stays on the same x as every other row.
        failed && cn(treatment.rowBorderClassName, 'pl-[7px]'),
        isDragging && 'relative z-10 bg-[var(--surface)] opacity-90 shadow-[var(--sh1)]',
      )}
    >
      {/* Drag handle. Carries the sortable listeners; touch-none so a touch drag doesn't scroll the list. Keyboard: focus
          it, Space to lift, arrows to move, Space to drop, Escape to cancel. */}
      <button
        type="button"
        aria-label={`Reorder ${s.name}`}
        title="Drag to reorder"
        className="grid h-6 w-[22px] cursor-grab touch-none place-items-center rounded text-[var(--mute)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex items-center justify-center">
        <ScenarioColorControl scenario={s} />
      </div>

      <div className="min-w-0">
        {/* Store-driven controlled input: typing sets the viewer's label override, an empty value clears it (the real name
            shows as the placeholder). */}
        <input
          data-testid="scenario-name"
          className="h-[34px] w-full min-w-0 truncate rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--brand-text)]"
          value={s.label ?? ''}
          placeholder={s.name}
          aria-label={`Custom label for ${s.name}`}
          onChange={(e) => {
            const value = e.target.value
            if (value === '') appState.clearLabel(s.name)
            else appState.setLabel(s.name, value)
          }}
        />
        <div className="mt-[3px] flex items-center gap-2 text-xs text-[var(--mute)]">
          {s.status === 'registering' && (
            <span role="status" aria-label={treatment.label} data-testid={`scenario-status-loading-${s.name}`} className="shrink-0">
              {treatment.label}&hellip;
            </span>
          )}
          <span className="truncate" title={s.path}>
            {caption}
          </span>
        </div>
      </div>

      {/* Include in the compare set (every model year of the scenario follows). The tooltip is scoped to the switch's real
          effect: it only matters to panels that are not pinned to one scenario. */}
      <TooltipProvider>
        <Tooltip>
          {/* The trigger is a wrapping span: Radix writes its own data-state onto its trigger, which would clobber the
              switch's checked styling. */}
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Switch
                size="lg"
                checked={s.active}
                onCheckedChange={(checked) => setScenarioGroupActive(scenarioGroupOf(s), checked)}
                aria-label={s.active ? `Exclude ${s.name} from queries` : `Include ${s.name} in queries`}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>Include this scenario when panels aren&rsquo;t pinned to a specific scenario</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <BaselineChip name={s.name} isBaseline={isBaseline} currentBaseline={baselineName} />

      <div className="flex items-center gap-1.5">
        <MiniButton
          className="w-8 justify-center px-0"
          disabled={index === 0}
          onClick={() => onMove(s.name, -1)}
          aria-label={`Move ${s.name} up`}
        >
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
        </MiniButton>
        <MiniButton
          className="w-8 justify-center px-0"
          disabled={index === total - 1}
          onClick={() => onMove(s.name, 1)}
          aria-label={`Move ${s.name} down`}
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        </MiniButton>
        {s.source === 'handle' && (
          <MiniButton className="w-8 justify-center px-0" onClick={() => removeLocalScenario(s.name)} aria-label={`Remove ${s.name}`}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </MiniButton>
        )}
      </div>
    </div>
  )
}

// The single baseline indicator. The current baseline row shows a non-interactive "Baseline" chip; every other row shows a
// "Set as baseline" button that calls appState.setBaseline. Both occupy the same reserved width (an invisible sizer renders
// the wider label in the same grid cell), so the identity column never shifts between a baseline and a non-baseline row.
// Moving the baseline also moves the reference with it when the reference was the old baseline.
function BaselineChip({ name, isBaseline, currentBaseline }: { name: string; isBaseline: boolean; currentBaseline: string | undefined }) {
  function setAsBaseline() {
    const reference = getState().reference
    appState.setBaseline(name)
    if (reference.kind === 'scenario' && currentBaseline && reference.name === currentBaseline) {
      setReference({ kind: 'scenario', name })
    }
  }

  return (
    <span data-testid={`baseline-chip-${name}`} className="grid shrink-0 justify-items-start max-[900px]:col-start-3">
      <span aria-hidden className="invisible col-start-1 row-start-1">
        <MiniButton tabIndex={-1}>Set as baseline</MiniButton>
      </span>
      <span className="col-start-1 row-start-1">
        {isBaseline ? (
          <span className="inline-flex h-7 items-center rounded-full border border-[var(--brand-text)] bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] px-3 text-[12.5px] font-medium text-[var(--brand-text)]">
            Baseline
          </span>
        ) : (
          <MiniButton onClick={setAsBaseline} aria-label={`Mark ${name} as baseline scenario`}>
            Set as baseline
          </MiniButton>
        )}
      </span>
    </span>
  )
}
