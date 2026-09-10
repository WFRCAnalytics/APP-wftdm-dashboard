import { useMemo, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  isLocalDeployment,
  loadLocalScenario,
  supportsLocalFolderLoading,
} from '@/scenario/scenarioManager'
import { useBaseline } from '@/hooks/useBaseline'
import { useScenarioList } from '@/hooks/useScenarioList'
import { ScenarioRow } from '@/layout/settings/scenarioRow'
import * as appState from '@/state/appState'

// 020-settings-modal: relocated from layout/scenarioLoader.tsx (deleted by
// that feature) — list/add/remove/baseline-mark logic and behavior are
// unchanged (FR-006). Renders appState.listByDisplayOrder() and each row's
// `label ?? name` plus its real `path`; LOCAL-deployment mode disables
// only the "Load Local Scenario" trigger (with a tooltip), never the list.
//
// 024-settings-modal-visual-redesign / 036-scenario-color-picker built the
// row's current visual language (one card surface, hairline-separated
// rows, a summary band, a leading status dot, a two-line identity block,
// a trailing actions cluster, per-row status border/background treatment).
//
// 037-scenarios-tab-redesign:
//   - Each row is now its own component (layout/settings/scenarioRow.tsx),
//     so @dnd-kit/sortable's useSortable() has a clean per-row call site.
//   - The list is a drag-and-drop sortable (Part C): DndContext +
//     SortableContext here, a GripVertical drag handle + the (relocated,
//     Part B) up/down arrows at each row's leading edge. onDragEnd funnels
//     through appState.reorderScenario() — the SAME reorder path the arrow
//     buttons use (moveScenario now delegates to reorderScenario), so the
//     two can never disagree (FR-004). PointerSensor + KeyboardSensor give
//     mouse/touch AND keyboard reordering; `announcements` below drive
//     position-based screen-reader output (FR-006).
export function ScenariosTab() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Re-renders whenever the RESOLVED baseline changes.
  const baseline = useBaseline()
  // hooks/useScenarioList.ts — re-renders on ANY scenario field changing
  // (order/label/path/status/pinned/active/source/colorOverride).
  const allScenarios = useScenarioList()

  const local = isLocalDeployment()
  const supported = supportsLocalFolderLoading()

  const orderedNames = useMemo(() => allScenarios.map((s) => s.name), [allScenarios])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Position-based (not index-based) phrasing, per @dnd-kit's own
  // accessibility guidance — "position N of M" reads more naturally than
  // a raw array index to a screen-reader user.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${active.id}. It is at position ${orderedNames.indexOf(String(active.id)) + 1} of ${orderedNames.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${active.id} moved to position ${orderedNames.indexOf(String(over.id)) + 1} of ${orderedNames.length}.`
        : `${active.id} is no longer over a reorder target.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${active.id} dropped at position ${orderedNames.indexOf(String(over.id)) + 1} of ${orderedNames.length}.`
        : `${active.id} returned to its original position.`,
    onDragCancel: ({ active }) => `Reordering ${active.id} was cancelled.`,
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const targetIndex = orderedNames.indexOf(String(over.id))
    if (targetIndex >= 0) appState.reorderScenario(String(active.id), targetIndex)
  }

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
  // takes precedence in the (today unreachable) case both would apply.
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
          // Visibly present but disabled, with an explanation (FR-019).
          // TooltipProvider wraps this locally, scoped to just this branch.
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A disabled native <button> carries Tailwind's own
                    disabled:pointer-events-none, so this wrapping <span>,
                    not the button inside it, is the hoverable surface. */}
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
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          {/* Summary band — "surface the summary before the detail." */}
          <div className="border-b border-border bg-muted px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {allScenarios.length} scenario{allScenarios.length === 1 ? '' : 's'} loaded
              {(() => {
                const failedCount = allScenarios.filter((s) => s.status === 'failed').length
                return (
                  failedCount > 0 && (
                    <>
                      {' · '}
                      <span className="font-semibold text-destructive">
                        {failedCount} need attention
                      </span>
                    </>
                  )
                )
              })()}
            </span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            accessibility={{ announcements }}
          >
            <SortableContext items={orderedNames} strategy={verticalListSortingStrategy}>
              <div data-testid="scenario-load-list" className="flex flex-col">
                {allScenarios.map((s, index) => (
                  <ScenarioRow
                    key={s.name}
                    scenario={s}
                    index={index}
                    total={allScenarios.length}
                    baselineName={baseline}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  )
}
