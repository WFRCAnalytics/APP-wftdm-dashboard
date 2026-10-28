import { Suspense, useMemo, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { PillSelect } from '@/components/ui/pill-select'
import { Segmented } from '@/components/ui/segmented'
import { useCompareInputs } from '@/hooks/useCompareInputs'
import { useResolvedView } from '@/hooks/useViewContext'
import { TileKeyContext, useTileState } from '@/hooks/useTileState'
import { useSharedKinds } from '@/layout/sharedControlsBar'
import { PanelErrorBoundary } from '@/layout/panelCard'
import { Tile } from '@/layout/tile'
import { useFill, withFillHeight } from '@/layout/fill'
import type { CompareStrategy, MultiViewPanelConfig } from '@/layout/types'
import { PanelLoadingState } from '@/panels/PanelLoadingState'
import { registry } from '@/panels/registry'
import { effectiveStrategy, offersScenarioPick } from '@/panels/compareStrategy'
import { STRATEGY_LABEL, isBaseYearOnly, isCalibrationFamily, resolveMultiView, validateMultiView, withRowHeight } from '@/panels/multiView'

// The tile for `type: multi-view`: the chrome (badges, group-by, compare-as, view switcher) around MultiViewPanel,
// which draws the active view. Hidden entirely when the tile only makes sense in another mode.

export function MultiViewTile({ config: rawConfig, tileKey }: { config: MultiViewPanelConfig; tileKey: string }) {
  const ctx = useResolvedView()
  const fill = useFill()
  const config = useMemo(() => withRowHeight(rawConfig, ctx.active.length), [rawConfig, ctx.active.length])
  const bodyConfig = useMemo(() => withFillHeight(rawConfig, fill), [rawConfig, fill.active, fill.height]) // eslint-disable-line react-hooks/exhaustive-deps
  const { inputs, referenceLabel, referenceColor } = useCompareInputs()
  const [tile, setTile] = useTileState(tileKey)
  const lifted = useSharedKinds()
  const error = useMemo(() => validateMultiView(config), [config])
  const resolved = useMemo(() => (error ? null : resolveMultiView(config, tile, { compare: ctx.compare })), [config, error, tile, ctx.compare])

  // Tiles flagged for another mode are not rendered at all.
  if (config.needs_compare && !ctx.compare) return null
  if (resolved && isCalibrationFamily(config, resolved.view) && !ctx.isBaseYear) return null

  const Body = registry['multi-view']
  const panel = Body ? (
    <PanelErrorBoundary panelTitle={config.title}>
      <Suspense fallback={<PanelLoadingState height={config.height} />}>
        <Body config={bodyConfig} />
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
      <Badge key="diff" variant="accent" tint={referenceColor}>
        {ctx.display === 'pct' ? '% change' : 'Change'} vs {referenceLabel}
      </Badge>,
    )
  } else if (ctx.compare && ctx.display !== 'val' && Boolean(resolved.view.diff) && strategy !== 'multi' && strategy !== 'grid') {
    // the chart draws its own differences (view flag `diff: true`)
    badges.push(
      <Badge key="diff" variant="accent" tint={referenceColor}>
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
  if (config.group_by && config.group_by.options.length > 0 && !lifted.has('group')) {
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
  if (ctx.compare && resolved.strategies.length >= 2 && !resolved.scenarioIndependent && !lifted.has('strategy')) {
    controls.push(
      <Segmented
        key="strategy"
        label="Compare as"
        value={strategy ?? resolved.strategies[0]}
        options={resolved.strategies.map((s) => ({ id: s, label: STRATEGY_LABEL[s] }))}
        onChange={(chosen) => setTile({ strategy: chosen as CompareStrategy })}
      />,
    )
  } else if (ctx.compare && resolved.strategies.length === 1 && (strategy === 'multi' || strategy === 'grid')) {
    badges.push(<Badge key="sbs" variant="neutral">Side by side</Badge>)
  }
  if (ctx.compare && (strategy === 'multi' || strategy === 'grid') && inputs.active.length >= 3) {
    controls.push(
      <Segmented
        key="layout"
        label="Layout"
        value={tile.layout ?? 'auto'}
        options={[{ id: 'auto', label: 'Auto' }, { id: 'row', label: 'Row' }, { id: 'grid', label: 'Grid' }]}
        onChange={(layout) => setTile({ layout: layout as 'auto' | 'row' | 'grid' })}
      />,
    )
  }
  if (ctx.compare && offersScenarioPick(resolved.panel, strategy, ctx.display)) {
    // a difference is drawn against the reference, so the reference is not offered as the scenario shown
    const runs = strategy === 'diff' ? inputs.active.filter((r) => r !== inputs.referenceRun) : inputs.active
    const value = tile.scenario && runs.includes(tile.scenario) ? tile.scenario : runs.includes(inputs.focusRun ?? '') ? (inputs.focusRun ?? '') : (runs[0] ?? '')
    if (runs.length > 1) controls.push(
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
  if (resolved.visibleViews.length > 1 && !lifted.has('view')) {
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
