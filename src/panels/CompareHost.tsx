import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useCompareInputs } from '@/hooks/useCompareInputs'
import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { useTileState } from '@/hooks/useTileState'
import { useFill } from '@/layout/fill'
import { PanelErrorBoundary } from '@/layout/panelCard'
import { useExpandedHeight } from '@/layout/panelExpandHost'
import type { CompareStrategy, PanelConfig } from '@/layout/types'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { PanelLoadingState } from '@/panels/PanelLoadingState'
import { registry } from '@/panels/registry'
import { GRID_GAP, minCellWidth, pickColumns, planCompare, type Cell } from '@/panels/compareStrategy'
import { resolveScenarioColor } from '@/panels/scenarioDisplay'
import { Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { syncGrid } from '@/panels/gridSync'

// Renders one view of a tile according to its compare strategy
// (project-docs/redesign/03-state-and-compare.md section 4.3). It hands the real panel component a plain config
// with the pins and `comparison: diff` already applied, so panel components need no compare logic.

function PanelInstance({ config, title }: { config: PanelConfig; title: string }) {
  const Inner = registry[config.type]
  if (!Inner) return <PanelErrorState message={`Unknown panel type: "${config.type}"`} />
  return (
    <PanelErrorBoundary panelTitle={title}>
      <Suspense fallback={<PanelLoadingState height={config.height} />}>
        <Inner config={config} />
      </Suspense>
    </PanelErrorBoundary>
  )
}

export interface CompareHostProps {
  panel: PanelConfig
  strategy: CompareStrategy | undefined
  tileKey: string
  title: string
}

/** Fixed chrome inside a side-by-side body: the pager row. */
const PAGER_HEIGHT = 30
const CAPTION_HEIGHT = 26
export function CompareHost({ panel, strategy, tileKey, title }: CompareHostProps) {
  const { inputs } = useCompareInputs()
  const display = useScenarioDisplay()
  const [tile, setTile] = useTileState(tileKey)
  const gridRef = useRef<HTMLDivElement>(null)
  const fill = useFill()
  const expandedHeight = useExpandedHeight()

  const plan = useMemo(
    () => planCompare(panel, strategy, inputs, { scenario: tile.scenario, page: tile.page }),
    [panel, strategy, inputs, tile.scenario, tile.page],
  )

  // The grid's own width drives the column count; measured before paint so the first frame is already right.
  const [gridWidth, setGridWidth] = useState(0)
  const hasCells = plan.kind === 'cells'
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const measure = () => setGridWidth((prev) => (Math.abs(prev - grid.clientWidth) < 4 ? prev : grid.clientWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(grid)
    return () => ro.disconnect()
  }, [hasCells])

  const cellKey = plan.kind === 'cells' ? plan.cells.map((c) => c.run).join('|') : ''
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    return syncGrid(grid, (run) => inputs.label(run))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellKey])

  if (plan.kind === 'empty') {
    return <PanelEmptyState icon={Layers} message={plan.message} />
  }
  if (plan.kind === 'single') {
    return <PanelInstance config={plan.config} title={title} />
  }

  // Side by side: the reference first, then the compared scenarios, paged.
  const total = plan.cells.length
  const bodyHeight = (panel.height ?? 400) - (plan.pages > 1 ? PAGER_HEIGHT : 0)
  // each cell: 1px borders, 8px padding, the caption row and its 4px margin
  const cellChrome = 2 + 16 + CAPTION_HEIGHT
  const cols = pickColumns({ total, width: gridWidth, minCell: minCellWidth(panel), tabbed: fill.active && !expandedHeight, layout: tile.layout, height: bodyHeight, chrome: cellChrome })
  const rows = Math.ceil(total / cols)
  // an odd last cell takes the whole row instead of leaving a gap
  const odd = cols === 2 && total % 2 === 1
  const cellHeight = Math.max(100, Math.floor((bodyHeight - (rows - 1) * GRID_GAP) / rows) - cellChrome)

  return (
    <div className="flex flex-col gap-2" data-testid="compare-cells">
      <div
        ref={gridRef}
        className="wf-multi grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: GRID_GAP }}
      >
        {plan.cells.map((cell: Cell) => (
          <div
            key={cell.run}
            data-testid={`compare-cell-${cell.run}`}
            data-s={cell.run}
            data-c={resolveScenarioColor(cell.run, display) ?? 'var(--mute)'}
            className={cn('min-w-0 rounded-[14px] border border-[var(--glass-line)] p-2', odd && cell === plan.cells[total - 1] && 'col-span-2')}
          >
            <div className="mb-1 flex items-center gap-2 font-body text-[12.5px] text-[var(--ink)]" style={{ height: CAPTION_HEIGHT - 4 }}>
              <span
                aria-hidden="true"
                className="inline-block size-[10px] shrink-0 rounded-full"
                style={{ background: resolveScenarioColor(cell.run, display) ?? 'var(--mute)' }}
              />
              <span className="truncate font-medium">{cell.label}</span>
              {cell.isReference && <span className="text-[var(--mute)]">reference</span>}
            </div>
            <PanelInstance config={{ ...(cell.config as object), height: cellHeight } as PanelConfig} title={title} />
          </div>
        ))}
      </div>
      {plan.pages > 1 && (
        <div className="flex items-center justify-end gap-2 font-body text-[12.5px] text-[var(--mute)]" style={{ height: PAGER_HEIGHT - 8 }}>
          <span>
            Scenarios {plan.firstShown}–{plan.lastShown} of {plan.total}
          </span>
          <button
            type="button"
            aria-label="Previous scenarios"
            disabled={plan.page === 0}
            onClick={() => setTile({ page: plan.page - 1 })}
            className="rounded-full border border-[var(--glass-line)] p-1 disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next scenarios"
            disabled={plan.page >= plan.pages - 1}
            onClick={() => setTile({ page: plan.page + 1 })}
            className="rounded-full border border-[var(--glass-line)] p-1 disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
