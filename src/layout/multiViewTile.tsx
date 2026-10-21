import { Suspense, useMemo, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { PillSelect } from '@/components/ui/pill-select'
import { Segmented } from '@/components/ui/segmented'
import { useCompareInputs } from '@/hooks/useCompareInputs'
import { useResolvedView } from '@/hooks/useViewContext'
import { TileKeyContext, useTileState } from '@/hooks/useTileState'
import { PanelErrorBoundary } from '@/layout/panelCard'
import { Tile } from '@/layout/tile'
import type { CompareStrategy, MultiViewPanelConfig } from '@/layout/types'
import { PanelLoadingState } from '@/panels/PanelLoadingState'
import { registry } from '@/panels/registry'
import { effectiveStrategy } from '@/panels/compareStrategy'
import { isBaseYearOnly, isCalibrationFamily, resolveMultiView, validateMultiView, withRowHeight } from '@/panels/multiView'

// The tile for `type: multi-view`: the chrome (badges, group-by, compare-as, view switcher) around MultiViewPanel,
// which draws the active view. Hidden entirely when the tile only makes sense in another mode.

const STRATEGY_LABEL: Record<CompareStrategy, string> = {
  overlay: 'Overlay',
  diff: 'Difference',
  multi: 'Side by side',
  grid: 'Side by side',
  switch: 'One at a time',
  swipe: 'Swipe',
}

export function MultiViewTile({ config: rawConfig, tileKey }: { config: MultiViewPanelConfig; tileKey: string }) {
  const ctx = useResolvedView()
  const config = useMemo(() => withRowHeight(rawConfig, ctx.active.length), [rawConfig, ctx.active.length])
  const { inputs, referenceLabel } = useCompareInputs()
  const [tile, setTile] = useTileState(tileKey)
  const error = useMemo(() => validateMultiView(config), [config])
  const resolved = useMemo(() => (error ? null : resolveMultiView(config, tile, { compare: ctx.compare })), [config, error, tile, ctx.compare])

  // Tiles flagged for another mode are not rendered at all.
  if (config.needs_compare && !ctx.compare) return null
  if (resolved && isCalibrationFamily(config, resolved.view) && !ctx.isBaseYear) return null

  const Body = registry['multi-view']
  const panel = Body ? (
    <PanelErrorBoundary panelTitle={config.title}>
      <Suspense fallback={<PanelLoadingState height={config.height} />}>
        <Body config={rawConfig} />
      </Suspense>
    </PanelErrorBoundary>
  ) : null

  if (error || !resolved) {
    return <Tile title={config.title} expandable={false} panel={null} errorMessage={error ?? 'Invalid multi-view'} />
  }

  const strategy = effectiveStrategy({
    strategies: resolved.strategies,
    chosen: tile.strategy,
    scenarioIndependent: resolved.scenarioIndependent,
    compare: ctx.compare,
    display: ctx.display,
  })
  const badges: ReactNode[] = []
  if (strategy === 'diff') {
    badges.push(
      <Badge key="diff" variant="accent">
        {ctx.display === 'pct' ? '% change' : 'Change'} vs {referenceLabel}
      </Badge>,
    )
  } else if (ctx.compare && ctx.display !== 'val' && Boolean(resolved.view.diff) && strategy !== 'multi' && strategy !== 'grid') {
    // the chart draws its own differences (view flag `diff: true`)
    badges.push(
      <Badge key="diff" variant="accent">
        {ctx.display === 'pct' ? '% change' : 'Change'} vs {referenceLabel}
      </Badge>,
    )
  } else if (ctx.compare && ctx.display !== 'val' && !resolved.scenarioIndependent && resolved.strategies.length > 0) {
    badges.push(<Badge key="values" variant="neutral">Shows values</Badge>)
  }
  if (ctx.compare && Boolean(resolved.view.scenario_independent ?? config.scenario_independent)) {
    badges.push(<Badge key="same" variant="neutral">Same in every scenario</Badge>)
  }
  if (isBaseYearOnly(config, resolved.view) && !ctx.isBaseYear) {
    badges.push(<Badge key="base" variant="neutral">Measured on the base year</Badge>)
  }

  const controls: ReactNode[] = []
  if (config.group_by && config.group_by.options.length > 0) {
    controls.push(
      <PillSelect
        key="group"
        compact
        label={config.group_by.label ?? 'Group by'}
        value={resolved.groupOption?.id ?? ''}
        options={config.group_by.options.map((o) => ({ value: o.id, label: o.label }))}
        onChange={(group) => setTile({ group })}
      />,
    )
  }
  if (ctx.compare && resolved.strategies.length >= 2 && !resolved.scenarioIndependent) {
    controls.push(
      <Segmented
        key="strategy"
        variant="compare"
        label="Compare as"
        value={strategy ?? resolved.strategies[0]}
        options={resolved.strategies.map((s) => ({ id: s, label: STRATEGY_LABEL[s] }))}
        onChange={(chosen) => setTile({ strategy: chosen as CompareStrategy })}
      />,
    )
  } else if (ctx.compare && resolved.strategies.length === 1 && (strategy === 'multi' || strategy === 'grid')) {
    badges.push(<Badge key="sbs" variant="neutral">Side by side</Badge>)
  }
  if (strategy === 'switch' || strategy === 'swipe') {
    const runs = inputs.active
    const value = tile.scenario && runs.includes(tile.scenario) ? tile.scenario : (inputs.focusRun ?? runs[0] ?? '')
    controls.push(
      <PillSelect
        key="scenario"
        compact
        label="Scenario"
        value={value}
        options={runs.map((r) => ({ value: r, label: inputs.label(r) }))}
        onChange={(scenario) => setTile({ scenario })}
      />,
    )
  }
  if (resolved.visibleViews.length > 1) {
    controls.push(
      <Segmented
        key="view"
        label="View"
        className="ml-auto"
        value={resolved.view.id}
        options={resolved.visibleViews.map((v) => ({ id: v.id, label: v.label ?? v.id }))}
        onChange={(view) => setTile({ view })}
      />,
    )
  }

  return (
    <TileKeyContext.Provider value={tileKey}>
      <Tile
        title={config.title}
        subtitle={config.description}
        badges={badges.length > 0 ? badges : undefined}
        controls={controls.length > 0 ? controls : undefined}
        height={config.height}
        expandable={config.expandable ?? true}
        panel={panel}
      />
    </TileKeyContext.Provider>
  )
}
