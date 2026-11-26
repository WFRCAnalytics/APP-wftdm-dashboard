import { Suspense, useMemo, type ReactNode } from 'react'

import { AdaptiveSwitch } from '@/components/ui/adaptive-switch'
import { Badge } from '@/components/ui/badge'
import { LayoutMenu } from '@/components/ui/layout-menu'
import { PillSelect } from '@/components/ui/pill-select'
import { Segmented } from '@/components/ui/segmented'
import { useCompareInputs } from '@/hooks/useCompareInputs'
import { useResolvedView } from '@/hooks/useViewContext'
import { TileKeyContext, useTileState } from '@/hooks/useTileState'
import { useSetting } from '@/hooks/useSetting'
import { useSharedKinds } from '@/layout/sharedControlsBar'
import { PanelErrorBoundary } from '@/layout/panelCard'
import { Tile } from '@/layout/tile'
import { useFill, withFillHeight } from '@/layout/fill'
import type { CompareStrategy, MultiViewPanelConfig } from '@/layout/types'
import { PanelLoadingState } from '@/panels/PanelLoadingState'
import { viewIcon } from '@/panels/viewIcon'
import type { SwitchMode } from '@/lib/switchForm'
import { registry } from '@/panels/registry'
import { diffFacets, drawsAllScenarios, effectiveStrategy, offersScenarioPick } from '@/panels/compareStrategy'
import { STRATEGY_LABEL, defaultStrategies, isBaseYearOnly, isCalibrationFamily, offersScaleChoice, resolveMultiView, validateMultiView, withRowHeight } from '@/panels/multiView'

// The tile for `type: multi-view`: the chrome (badges, group-by, compare-as, view switcher) around MultiViewPanel,
// which draws the active view. Hidden entirely when the tile only makes sense in another mode.

const ALL_SCENARIOS = '__all__'

export function MultiViewTile({ config: rawConfig, tileKey }: { config: MultiViewPanelConfig; tileKey: string }) {
  const ctx = useResolvedView()
  const fill = useFill()
  const config = useMemo(() => withRowHeight(rawConfig, ctx.active.length), [rawConfig, ctx.active.length])
  const bodyConfig = useMemo(() => withFillHeight(rawConfig, fill), [rawConfig, fill.active, fill.height]) // eslint-disable-line react-hooks/exhaustive-deps
  const { inputs, referenceLabel, referenceColor } = useCompareInputs()
  const [tile, setTile] = useTileState(tileKey)
  const lifted = useSharedKinds()
  // the view control's form: site -> page -> this tile (`controls: { views: ... }`)
  const viewMode = useSetting<SwitchMode>('controls.views', rawConfig)
  const scaleSetting = useSetting<'own' | 'shared'>('charts.scale', rawConfig)
  const keepScenarioLegend = useSetting('legend.scenarios', rawConfig) === 'tile'
  const error = useMemo(() => validateMultiView(config), [config])
  const resolved = useMemo(() => (error ? null : resolveMultiView(config, tile, { compare: ctx.compare })), [config, error, tile, ctx.compare])

  // Tiles flagged for another mode are not rendered at all.
  if (config.needs_compare && !ctx.compare) return null
  if (resolved && isCalibrationFamily(config, resolved.view) && !ctx.isBaseYear) return null

  const Body = registry['multi-view']
  const panel = Body ? (
    <PanelErrorBoundary panelTitle={config.title}>
      <Suspense fallback={<PanelLoadingState height={bodyConfig.height} config={bodyConfig} />}>
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
  const actions: ReactNode[] = []
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
  // A difference is the Show control's job (Change / % change draw it on any view that offers one, see effectiveStrategy), so the
  // tile only offers arrangements. With Show on Change the choice would do nothing either, so the control waits for Values.
  const offered = resolved.strategies.filter((s) => s !== 'diff')
  const showForcesDiff = ctx.display !== 'val' && resolved.strategies.includes('diff')
  if (ctx.compare && offered.length >= 2 && !resolved.scenarioIndependent && !lifted.has('strategy') && !showForcesDiff) {
    controls.push(
      <Segmented
        key="strategy"
        label="Compare as"
        value={strategy && strategy !== 'diff' ? strategy : offered[0]}
        options={offered.map((s) => ({ id: s, label: STRATEGY_LABEL[s] }))}
        onChange={(chosen) => setTile({ strategy: chosen as CompareStrategy })}
      />,
    )
  } else if (ctx.compare && offered.length === 1 && (strategy === 'multi' || strategy === 'grid')) {
    badges.push(<Badge key="sbs" variant="neutral">Side by side</Badge>)
  }
  // a difference with two or more compared scenarios is drawn one facet each, so there is no single scenario to pick
  const facets = strategy === 'diff' ? diffFacets(resolved.panel, inputs) : null
  // The Layout button is for side-by-side cells. A tile with any view that can lay its cells side by side keeps the button for
  // every view, disabled when the current one has no cells to arrange, so switching views never moves the header controls.
  const layoutApplies = ctx.compare && ((strategy === 'multi' || strategy === 'grid') ? inputs.active.length >= 3 : (facets?.length ?? 0) >= 3)
  const tileHasSideBySide =
    ctx.compare &&
    inputs.active.length >= 3 &&
    resolved.visibleViews.some((v) => (v.compare ?? defaultStrategies(v.type)).some((s) => s === 'multi' || s === 'grid' || s === 'diff'))
  if (layoutApplies || tileHasSideBySide) {
    actions.push(<LayoutMenu key="layout" value={tile.layout ?? 'auto'} disabled={!layoutApplies} onChange={(layout) => setTile({ layout })} />)
  }
  // The scenario shown is chosen in the tile's header, left of the views and the tools, never on a row (or rail) of its own.
  // A tile with any view that offers the choice keeps it on every view, showing "All scenarios" and off where it does not
  // apply, so switching views never moves the header's controls (nor squeezes the view switch into a menu).
  const viewOffers = (viewId: string) => {
    const r = viewId === resolved.view.id ? resolved : resolveMultiView(config, { ...tile, view: viewId }, { compare: ctx.compare })
    const s = effectiveStrategy({ strategies: r.strategies, chosen: tile.strategy, scenarioIndependent: r.scenarioIndependent, compare: ctx.compare, display: ctx.display })
    return offersScenarioPick(r.panel, s, ctx.display)
  }
  const tileOffersScenario = ctx.compare && inputs.active.length > 1 && resolved.visibleViews.some((v) => viewOffers(v.id))
  let scenarioControl: ReactNode
  if (tileOffersScenario && (facets || !offersScenarioPick(resolved.panel, strategy, ctx.display))) {
    scenarioControl = (
      <PillSelect
        key="scenario"
        compact
        className="min-w-0 shrink"
        label="Scenario"
        value={ALL_SCENARIOS}
        disabled
        options={[{ value: ALL_SCENARIOS, label: 'All scenarios' }]}
        onChange={() => {}}
      />
    )
  } else if (ctx.compare && !facets && offersScenarioPick(resolved.panel, strategy, ctx.display)) {
    // a difference is drawn against the reference, so the reference is not offered as the scenario shown
    const runs = strategy === 'diff' ? inputs.active.filter((r) => r !== inputs.referenceRun) : inputs.active
    const value = tile.scenario && runs.includes(tile.scenario) ? tile.scenario : runs.includes(inputs.focusRun ?? '') ? (inputs.focusRun ?? '') : (runs[0] ?? '')
    // grouped by Scenario the chart already draws every scenario, so the choice is shown but off
    const all = strategy === 'overlay' && drawsAllScenarios(resolved.panel)
    if (runs.length > 1) scenarioControl = (
      <PillSelect
        key="scenario"
        compact
        className="min-w-0 shrink"
        label="Scenario"
        value={all ? ALL_SCENARIOS : value}
        disabled={all}
        options={all ? [{ value: ALL_SCENARIOS, label: 'All scenarios' }] : runs.map((r) => ({ value: r, label: inputs.label(r) }))}
        onChange={(scenario) => setTile({ scenario })}
      />
    )
  }
  // a faceted view (one panel per mode): each panel on its own axis, or all on one
  if (offersScaleChoice(resolved.view as { type?: string; kind?: unknown })) {
    controls.push(
      <Segmented
        key="scale"
        label="Scale"
        value={tile.scale ?? scaleSetting}
        options={[
          { id: 'own', label: 'Own scale' },
          { id: 'shared', label: 'Shared scale' },
        ]}
        onChange={(scale) => setTile({ scale: scale as 'own' | 'shared' })}
      />,
    )
  }
  // The views are the tile's main choice, so they sit in its header: a switch when it fits, otherwise a menu.
  const viewControl =
    resolved.visibleViews.length > 1 && !lifted.has('view') ? (
      <AdaptiveSwitch
        label="View"
        mode={viewMode}
        value={resolved.view.id}
        options={resolved.visibleViews.map((v) => {
          const Icon = viewIcon(v)
          return { id: v.id, label: v.label ?? v.id, icon: <Icon className="size-[15px]" aria-hidden="true" /> }
        })}
        onChange={(view) => setTile({ view })}
      />
    ) : undefined

  return (
    <TileKeyContext.Provider value={tileKey}>
      <Tile
        title={config.title}
        subtitle={config.description}
        badges={badges.length > 0 ? badges : undefined}
        controls={controls.length > 0 ? controls : undefined}
        actions={actions.length > 0 ? actions : undefined}
        headerControls={scenarioControl || viewControl ? <>{scenarioControl}{viewControl}</> : undefined}
        keepScenarioLegend={keepScenarioLegend}
        height={config.height}
        expandable={config.expandable ?? true}
        panel={panel}
      />
    </TileKeyContext.Provider>
  )
}
