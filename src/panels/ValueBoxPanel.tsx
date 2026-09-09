import { useEffect, useState, type ReactNode } from 'react'
import * as icons from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

import { query } from '@/services/duckdb'
import { iconComponentFor } from '@/lib/iconComponentFor'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useBaseline } from '@/hooks/useBaseline'
import {
  buildPanelQuery,
  buildSparklineQuery,
  buildValueBoxBaselineTrendQuery,
  resolveActiveScenarios,
  resolveComparisonScenarioName,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { formatValue } from '@/panels/formatValue'
import { ValueBoxSparkline } from '@/panels/valueBoxSparkline'
import { Badge } from '@/components/ui/badge'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { ValueBoxPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*'] // module-level constant — stable identity,
// never an inline `?? ['*']` literal (that allocates a new array every render)

// 034-metric-panel-redesign (data-model.md §6) — sparkline mode's own,
// fully independent status. 'idle' is the real default when
// config.sparkline is unset (FR-014: no effect on a panel that doesn't
// opt in) — deliberately distinct from 'loading', which only applies once
// a real fetch is actually in flight.
type SparklineStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

// 034-metric-panel-redesign (data-model.md §6) — baseline-trend mode's
// own, fully independent status. 'idle': config.baseline_trend unset
// (FR-020). 'config-error': baseline_trend IS set but config.scenario
// isn't — research.md §3's own real, documented constraint (a value box's
// "current" side is always its pinned scenario; there's no unambiguous
// comparison without one). 'no-baseline': the established "no baseline
// resolved" state every other comparison-capable panel type already
// shows (FR-017) — not an error.
type BaselineTrendStatus = 'idle' | 'loading' | 'ready' | 'config-error' | 'no-baseline' | 'error'
interface BaselineTrendResult {
  current: number
  baseline: number
  diff: number
}

// Proves config -> query -> rendered scalar (spec.md User Story 2).
// See contracts/valuebox-panel.md.
export function ValueBoxPanel({ config }: { config: ValueBoxPanelConfig }) {
  // extractGlobalFilterIds (panelQuery.ts), not an inline
  // config.filter.replace(...) — 007-observable-plot-panel's widening of
  // DataBoundPanelConfigBase.filter to string | Record<string,string>
  // means a plain .replace() call no longer typechecks against every
  // possible shape, even though this panel type only ever authors the
  // bare-string form in practice.
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  // 009-scenario-manager (FR-008): reactive active-scenario set — a
  // locally loaded scenario activating re-runs this panel's data-fetch
  // effect (below) without discarding this component's own local state,
  // unlike a remount (research.md §1 of that feature).
  const activeScenarioNames = useActiveScenarios()
  // 034-metric-panel-redesign (FR-019) — the SAME reactive baseline
  // subscription RechartsPanel.tsx/TablePanel.tsx already use; a baseline
  // change elsewhere in the app recomputes the trend effect below
  // automatically, with no new reactivity mechanism.
  const baseline = useBaseline()
  const [value, setValue] = useState<unknown>(undefined)
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')

    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
    // Intentionally empty, not a stub — panel queries only ever use
    // $scenario/$filters, never $mappings/$bins/$sql (research.md §2).
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)

    query(sql)
      .then((rows) => {
        if (cancelled) return
        if (rows.length === 0) {
          setState('empty')
          return
        }
        setValue(rows[0][config.column])
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [config, filters, activeScenarioNames])

  // 034-metric-panel-redesign (FR-010–FR-014, data-model.md §6) — a
  // SECOND, fully independent fetch effect for the optional sparkline
  // zone. Never touches `value`/`state` above — a sparkline failure must
  // never affect the primary scalar value (FR-013). Keyed on the SAME
  // filters/activeScenarioNames the primary effect already depends on
  // (FR-011's own "shares the panel's own filter/scenario resolution"),
  // plus config.sparkline itself.
  const [sparklineRows, setSparklineRows] = useState<Record<string, unknown>[]>([])
  const [sparklineStatus, setSparklineStatus] = useState<SparklineStatus>('idle')

  useEffect(() => {
    if (!config.sparkline) {
      setSparklineStatus('idle')
      return undefined
    }
    let cancelled = false
    setSparklineStatus('loading')

    const sparkline = config.sparkline
    const template = buildSparklineQuery(config, sparkline, filters)
    const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)

    query(sql)
      .then((rows) => {
        if (cancelled) return
        if (rows.length === 0) {
          setSparklineStatus('empty')
          return
        }
        setSparklineRows(rows)
        setSparklineStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setSparklineStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [config, filters, activeScenarioNames])

  // 034-metric-panel-redesign (FR-015–FR-020, data-model.md §6) — a
  // THIRD, fully independent fetch effect for the optional baseline-trend
  // zone. Reuses resolveComparisonScenarioName() (unmodified) to resolve
  // the '$baseline' sentinel against the SAME useBaseline() value every
  // other comparison-capable panel type already reacts to — no new
  // resolution/reactivity mechanism (FR-018/FR-019). "current" is always
  // config.scenario (research.md §3's own real, documented constraint —
  // a value box's own pinned scenario is the only unambiguous "current"
  // side; baseline_trend requires it).
  const [trendResult, setTrendResult] = useState<BaselineTrendResult | undefined>(undefined)
  const [trendStatus, setTrendStatus] = useState<BaselineTrendStatus>('idle')

  useEffect(() => {
    if (!config.baseline_trend) {
      setTrendStatus('idle')
      return undefined
    }
    if (!config.scenario) {
      setTrendStatus('config-error')
      return undefined
    }
    const resolvedBaseline = resolveComparisonScenarioName('$baseline', baseline)
    if (resolvedBaseline === undefined) {
      setTrendStatus('no-baseline')
      return undefined
    }

    let cancelled = false
    setTrendStatus('loading')
    const sql = buildValueBoxBaselineTrendQuery(
      config.metric,
      config.column,
      config.scenario,
      resolvedBaseline,
      config.baseline_trend.expr,
    )

    query(sql)
      .then((rows) => {
        if (cancelled) return
        if (rows.length === 0) {
          setTrendStatus('error')
          return
        }
        const row = rows[0]
        if (row.diff_value === null || row.diff_value === undefined) {
          setTrendStatus('error')
          return
        }
        setTrendResult({
          current: Number(row.current_value),
          baseline: Number(row.baseline_value),
          diff: Number(row.diff_value),
        })
        setTrendStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setTrendStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [config, baseline])

  if (state === 'loading') {
    // wftdm-design-system skill's Skeleton section, Phase 3 requirement —
    // a shaped skeleton (icon-circle + number-bar), not one plain
    // rectangle. config.icon is already known at loading time (it's a
    // static config field, not fetched), so the icon placeholder only
    // renders when this panel will actually have one — matching the real
    // ready-state's own `{Icon && ...}` conditional exactly.
    return (
      <div className="flex items-center gap-3" aria-hidden="true">
        {config.icon && <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-muted" />}
        <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
      </div>
    )
  }
  if (state === 'empty') {
    const Icon = (config.icon ? iconComponentFor(config.icon) : undefined) ?? icons.Ban
    return <PanelEmptyState icon={Icon} message="No data for this selection" />
  }
  if (state === 'error') {
    return <PanelErrorState message="Couldn't load this value" />
  }

  const Icon = config.icon ? iconComponentFor(config.icon) : undefined

  // 034-metric-panel-redesign (FR-016/FR-017, data-model.md §4 zone 3) —
  // the baseline-trend badge, rendered only once its own effect actually
  // has something to show (never for 'idle'/'loading'/'config-error' —
  // those either mean the mode isn't configured at all, or aren't yet
  // resolved enough to render anything meaningful next to the value).
  // Deliberately NEUTRAL styling (`outline`, no green/red semantic
  // coloring) — this app has no per-metric "which direction is good"
  // metadata, and a metric like VMT can have a decrease as its own
  // desired outcome; asserting a color would misrepresent that (research.md
  // §4, data-model.md §4 zone 3).
  let trendBadge: ReactNode = null
  if (trendStatus === 'ready' && trendResult) {
    const TrendIcon = trendResult.diff > 0 ? TrendingUp : trendResult.diff < 0 ? TrendingDown : Minus
    trendBadge = (
      <Badge variant="outline" className="gap-1">
        <TrendIcon className="h-3 w-3" aria-hidden="true" />
        {formatValue(trendResult.diff, config.baseline_trend?.format ?? config.format)}
      </Badge>
    )
  } else if (trendStatus === 'no-baseline') {
    // FR-017: the same established "no baseline resolved" treatment
    // other comparison-capable panels already show — a plain, muted
    // badge rather than an error state (this is an expected, recoverable
    // condition, not a failure).
    trendBadge = (
      <Badge variant="secondary" className="text-muted-foreground">
        No baseline
      </Badge>
    )
  } else if (trendStatus === 'config-error' || trendStatus === 'error') {
    trendBadge = <Badge variant="destructive">Trend unavailable</Badge>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {/* wftdm-design-system skill's Iconography table — Decorative tier
            (h-5 w-5, 20px), matching basemapTab.tsx's own tile icons. Was
            size={24}, a one-off between the Decorative (20px) and
            Illustrative (28px) tiers; also switched to the preferred
            h-X w-X Tailwind-class form over the legacy size prop. */}
        {Icon && <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
        <div className="flex items-center gap-2">
          {/* 034-metric-panel-redesign (FR-005/FR-006, research.md §4):
              tabular-nums — the one real, confirmed change this redesign
              needed here. The "label above value" layout itself is already
              provided by layout/panelCard.tsx's shared CardHeader/CardTitle
              (config.title), which every panel type already renders above
              this component's own CardContent — nothing to duplicate here. */}
          <div className="font-heading text-3xl font-semibold tabular-nums">
            {formatValue(value, config.format)}
            {/* wftdm-design-system skill's Typography scale — Caption/meta
                role (font-body text-xs text-muted-foreground, 400 weight).
                Explicit font-body/font-normal are required, not redundant:
                this span sits inside the number's own font-heading
                text-3xl font-semibold div, and font-family/font-weight both
                inherit through a text-size override — without these, the
                unit would render in the heading role's own font at 600
                weight, not the body role's font at 400 (033-shadcn-default-
                theme: heading and body now resolve to the SAME font family,
                so weight is the only thing distinguishing them — making
                this override even more load-bearing, not less). */}
            {config.unit && (
              <span className="ml-1 font-body text-xs font-normal text-muted-foreground">
                {config.unit}
              </span>
            )}
          </div>
          {trendBadge}
        </div>
      </div>
      {/* 034-metric-panel-redesign (FR-012/FR-013, data-model.md §4 zone
          4) — the sparkline zone. Rendered for 'loading'/'ready' only;
          'idle' means the mode isn't configured at all (renders nothing,
          FR-014); 'empty'/'error' render a small, CONTAINED indicator of
          their own, never the shared PanelEmptyState/PanelErrorState —
          those would replace this whole card's content, which a
          secondary, optional zone's own failure must never do (FR-013). */}
      {sparklineStatus === 'loading' && <div className="h-10 w-full animate-pulse rounded-md bg-muted" />}
      {sparklineStatus === 'ready' && config.sparkline && (
        <ValueBoxSparkline rows={sparklineRows} config={config.sparkline} />
      )}
      {(sparklineStatus === 'empty' || sparklineStatus === 'error') && (
        <div className="text-xs text-muted-foreground">
          {sparklineStatus === 'empty' ? 'No breakdown available' : "Couldn't load breakdown"}
        </div>
      )}
    </div>
  )
}
