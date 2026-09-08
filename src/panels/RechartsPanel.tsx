import { useEffect, useId, useState } from 'react'
import { ChartNoAxesColumn } from 'lucide-react'
import { Bar, BarChart, Line, LineChart, Area, AreaChart, CartesianGrid, XAxis } from 'recharts'

import '@/panels/rechartsPanel.css'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useBaseline } from '@/hooks/useBaseline'
import {
  buildComparisonDiffQuery,
  buildPanelQuery,
  isComparisonDiff,
  resolveActiveScenarios,
  resolveComparisonScenarioName,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { encodeRechartsData } from '@/panels/rechartsEncoding'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { RechartsPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// 029-shadcn-chart-panel — the tenth panel type. See contracts/
// recharts-panel.md and specs/029-shadcn-chart-panel/research.md. Unlike
// PlotlyPanel.tsx, this is a fully declarative React component — Recharts
// (via shadcn's own ChartContainer/ResponsiveContainer) re-renders on
// ordinary prop changes, no imperative Plotly.react()/ResizeObserver
// dance needed, and no separate "theme-only re-render" effect: every
// color below resolves from a CSS custom property (--chart-N via
// ChartConfig, --muted-foreground/--border via ChartContainer's own
// default className), so a theme flip repaints for free through the
// ordinary CSS cascade with zero re-render of this component at all.
// Typed as a plain Record<string, any> — a dynamically-selected union of
// component types (BarChart|LineChart|AreaChart, Bar|Line|Area) isn't
// directly usable as a JSX tag under TS's own type system: each
// component's real prop signature differs (Bar/Area's own generic
// `getDerivedStateFromProps` static even makes React's own `ElementType`
// too narrow here — it demands a concrete `dataKey` prop that a shared
// Record value type can't supply). This is the same class of deliberate,
// narrowly-scoped `any` escape hatch panels/registry.tsx's own value type
// already uses for the identical "type resolved dynamically at render
// time from a config value" reason.
const CHART_COMPONENTS: Record<string, any> = { bar: BarChart, line: LineChart, area: AreaChart }
const MARK_COMPONENTS: Record<string, any> = { bar: Bar, line: Line, area: Area }

// Runtime validation, deliberately independent of the TypeScript
// `'bar' | 'line' | 'area'` union on RechartsPanelConfig — that union
// only constrains an AUTHOR typing a new dashboard-*.yaml in an editor
// with type-checking; YAML is parsed at runtime with no schema
// validation (CLAUDE.md's "YAML parsed at runtime" non-negotiable), so a
// real config with an unsupported chart_type (e.g. "pie", a real
// shadcn/Recharts chart kind this feature deliberately doesn't support —
// spec.md's own Assumptions) reaches this component as a plain string.
// Checked BEFORE the query even fires (spec.md Edge Cases: this must be
// a real, surfaced configuration error, never a silent blank panel or an
// unintended fallback chart type) — same "resolve first, never query on
// an unresolvable config" convention the $baseline-resolution branch
// below already established.
const VALID_CHART_TYPES = ['bar', 'line', 'area']

// Builds a stable, collision-safe <linearGradient> id for one area
// series in one panel instance — sanitized because a series value (a
// real, author/data-controlled string, e.g. a `series:` column's
// distinct value) isn't guaranteed to already be a valid bare id/url()
// fragment token (spaces, quotes, etc.).
function gradientId(prefix: string, seriesKey: string): string {
  return `${prefix}-fill-${seriesKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

export function RechartsPanel({ config }: { config: RechartsPanelConfig }) {
  // Unique per-instance prefix for this panel's own <linearGradient> ids
  // (area fills, below) — this fixture's tab alone renders 3 real
  // recharts panels at once, so a literal id like "fillSOV" would
  // collide across panels, silently making one panel's gradient resolve
  // to a DIFFERENT panel's own gradient definition (SVG `url(#id)`
  // references resolve against the whole document, not scoped to the
  // nearest panel). Colons stripped to match chart.tsx's own `chartId`
  // sanitization (`useId()`'s real output, e.g. ":r1:", is a valid DOM
  // id but needlessly odd inside a url() fragment).
  const gradientIdPrefix = useId().replace(/:/g, '')
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  const activeScenarioNames = useActiveScenarios()
  const baseline = useBaseline()
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState("Couldn't load this chart")
  const [rows, setRows] = useState<Record<string, unknown>[]>([])

  // Data fetch — identical shape to every other data-bound panel type's
  // own fetch effect (PlotlyPanel.tsx/TablePanel.tsx/ObservablePlotPanel.tsx).
  // buildPanelQuery()/buildComparisonDiffQuery() are called completely
  // UNMODIFIED — this panel type needed zero changes to shared query code.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    if (!VALID_CHART_TYPES.includes(config.chart_type)) {
      setErrorMessage(`Unsupported chart_type "${config.chart_type}" (expected bar, line, or area)`)
      setStatus('error')
      return
    }

    let sql: string
    if (isComparisonDiff(config.comparison)) {
      const diff = config.comparison
      const resolvedA = resolveComparisonScenarioName(diff.a, baseline)
      const resolvedB = resolveComparisonScenarioName(diff.b, baseline)
      if (resolvedA === undefined || resolvedB === undefined) {
        setStatus('error')
        return
      }
      sql = buildComparisonDiffQuery(config.metric, resolvedA, resolvedB, config.compare_on ?? [], diff.expr)
    } else {
      const template = buildPanelQuery(config, filters)
      const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
      sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)
    }

    query(sql)
      .then((result) => {
        if (cancelled) return
        if (result.length === 0) {
          setStatus('empty')
          return
        }
        setRows(result)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setErrorMessage("Couldn't load this chart")
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [config, filters, activeScenarioNames, baseline])

  if (status === 'loading') {
    return <div className="animate-pulse rounded-md bg-muted" style={{ height: config.height ?? 350 }} />
  }
  if (status === 'empty') {
    return <PanelEmptyState icon={ChartNoAxesColumn} message="No data for this selection" />
  }
  if (status === 'error') {
    return <PanelErrorState message={errorMessage} />
  }

  const { data, chartConfig, seriesKeys } = encodeRechartsData(rows, config)
  const ChartComponent = CHART_COMPONENTS[config.chart_type]
  const MarkComponent = MARK_COMPONENTS[config.chart_type]
  const isMultiSeries = seriesKeys.length > 1

  // Fidelity pass (see specs/029-shadcn-chart-panel/research.md §7) against
  // shadcn's own real, current registry examples — fetched and read
  // directly (chart-bar-multiple.json/chart-bar-stacked.json/
  // chart-line-linear.json/chart-area-linear.json), not approximated from
  // general chart-library convention. Confirmed choices, applied below:
  // - No <YAxis> in ANY real example — ChartTooltip is the sole source of
  //   exact values (already true here; nothing to remove).
  // - `accessibilityLayer` on every chart root (keyboard nav/ARIA — a real
  //   Recharts feature every single example enables).
  // - CartesianGrid: `vertical={false}` only — no strokeDasharray, no
  //   `horizontal` override, in any example.
  // - XAxis: `tickLine={false}` `axisLine={false}` `tickMargin={8}` (their
  //   month-name `tickFormatter` is data-specific to their own fixture
  //   data — this grammar's `x` field is a generic, author-named column,
  //   so no formatter is guessed here).
  // - ChartTooltip: `cursor={false}` in 3 of 4 real examples (the
  //   exception, chart-bar-stacked.json, left it at Recharts' own
  //   default) — adopted universally here; a real, secondary benefit
  //   confirmed during this pass: with `cursor={false}`, Recharts never
  //   renders its own shared-cursor highlight rect
  //   (`.recharts-tooltip-cursor`) at all, which is what made
  //   rechartsPanel.spec.ts's own sequential-hover test fragile before.
  //   `hideLabel` is synthesized from the two closest real analogs (this
  //   grammar has no true single-vs-multi-series "example" of its own to
  //   copy verbatim): chart-line-linear.json/chart-area-linear.json
  //   (single-series) use `hideLabel` (the one series' own name already
  //   says everything the label would); chart-bar-multiple.json
  //   (multi-series) shows the shared label. `indicator` is left at
  //   `ChartTooltipContent`'s own real default ("dot") UNCONDITIONALLY —
  //   round 5's own real, confirmed correction: `chart-bar-multiple.json`
  //   itself uses `indicator="dashed"`, initially copied verbatim here
  //   too, but never actually LOOKED at rendered rather than just read
  //   from source — `indicator="dashed"` renders a ZERO-WIDTH box with
  //   only a dashed OUTLINE (`w-0 border-dashed bg-transparent`, chart.tsx's
  //   own real classes), i.e. no fill at all, which at this component's
  //   small size reads as a few disconnected dots/dashes, not a color
  //   swatch — real, confirmed, live user feedback. `indicator="dot"`
  //   (`h-2.5 w-2.5 bg-[--color-bg]`, chart.tsx's own real classes) is a
  //   genuine SOLID filled square — the actual "color block" look wanted,
  //   and also this component's own real, unconditional default when the
  //   prop is omitted (used here for every series count, not just
  //   single-series, correcting the earlier per-count branch).
  // - Bar `radius`: `4` on every bar in the real non-stacked examples;
  //   chart-bar-stacked.json instead only rounds the OUTER corners of the
  //   stack (`[0,0,4,4]` bottom series, `[4,4,0,0]` top series) — this
  //   grammar's own `stacked: true` is the same case, so the same
  //   directional-corner rule is applied here (any middle series in a
  //   3+-series stack gets no rounding, the correct sandwiched case).
  // - Line: `strokeWidth={2}` `dot={false}`, no `fill`.
  // - Area: `fillOpacity={0.4}`, no `strokeWidth` override (Recharts' own
  //   default), no unused `fill` on Line.
  //
  // Round 4 (research.md §10) — dug further into shadcn's own real
  // registry beyond the 4 basic "-linear" examples already read above:
  // `chart-area-gradient.json` (their real, current gradient-fill area
  // example) uses `type="natural"` on `<Area>`, not `"linear"` — a
  // smooth cubic-spline curve through the data points, not straight
  // angular segments between them. Round 5 corrected an over-
  // generalization from that same finding: `type="natural"` was
  // initially applied to BOTH `<Area>` AND `<Line>` on the assumption
  // the same choice applies to both mark types — `chart-line-
  // multiple.json` (their own real, current multi-series LINE example,
  // fetched and read directly, not assumed) uses `type="monotone"` for
  // `<Line>` specifically, a real, different curve algorithm (monotone
  // cubic interpolation, which never overshoots past a local min/max —
  // appropriate for a line meant to be read precisely; natural cubic
  // splines can overshoot slightly). `<Line>` uses `"monotone"`,
  // `<Area>` keeps `"natural"` — a genuine, confirmed per-mark-type
  // distinction in shadcn's own real examples, not one type applied
  // uniformly everywhere. Also adopted from the gradient example: a
  // real SVG gradient fill (`<defs><linearGradient>`, two
  // stops — 5% at 0.8 opacity, 95% at 0.1 opacity, fading toward the
  // baseline) referenced via `fill="url(#...)"`, instead of this app's
  // own previous flat single-opacity fill — `fillOpacity={0.4}` is kept
  // ADDITIONALLY on top, exactly matching their own real example (the
  // gradient's own internal stops and the mark's own fillOpacity both
  // apply together, confirmed from their real source, not simplified
  // away). Each gradient's `id` is namespaced per panel INSTANCE
  // (`gradientIdPrefix`, above) — their own real example never needs
  // this since it renders exactly one chart per page; this app's own
  // fixture tab alone renders 3 real recharts panels on one page at
  // once, so a bare `id="fillDesktop"` would collide across panels.
  const marginProp = config.chart_type === 'bar' ? undefined : { left: 12, right: 12 }

  return (
    // aspect-auto w-full — a real, confirmed bug found post-fidelity-pass
    // (not present before shadcn's own default classes were relied on
    // this closely): ChartContainer's own default className includes
    // `aspect-video` (aspect-ratio: 16/9). With an explicit `height` set
    // via inline style but no explicit width, the browser computes width
    // FROM that ratio (height * 16/9) instead of from this panel's own
    // grid column — 350px tall became 622px wide regardless of how
    // narrow its actual PanelCard column was, visibly overflowing into
    // neighboring panels (confirmed directly via a live DOM measurement:
    // the chart's own rendered width was ~4.5x its containing card's
    // width, and 350 * 16/9 === the exact measured overflow width).
    // `aspect-auto` cancels the ratio calculation entirely and `w-full`
    // makes width explicit — `cn()`'s tailwind-merge (chart.tsx) resolves
    // both conflicts against the default classes correctly.
    <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height: config.height ?? 350 }}>
      <ChartComponent accessibilityLayer data={data} margin={marginProp}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={config.x} tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip
          cursor={false}
          // isAnimationActive={false} — round 6 (research.md §12): a
          // real, confirmed source of "feels laggy vs shadcn's own live
          // site" user feedback, traced to a specific line in this
          // project's own installed Recharts source
          // (`TooltipBoundingBox.js`: `transition: isAnimationActive &&
          // active ? "transform ${animationDuration}ms
          // ${animationEasing}" : undefined` — a real CSS transition
          // Recharts applies to the tooltip wrapper's own position by
          // default, `animationDuration: 400`/`animationEasing: 'ease'`
          // by Tooltip's own real default props). With it left at
          // Recharts' own default (`true`), the tooltip GLIDES to each
          // new bar/point over 400ms instead of snapping there instantly
          // — confirmed live: the tooltip wrapper's own computed
          // `transitionDuration` was `0.4s` before this change, `0s`
          // after. Only the position-TRACKING animation is affected —
          // confirmed no separate fade-in/out is tied to the same flag
          // (`TooltipBoundingBox.js`'s own visibility toggle is a plain,
          // instant `visible`/`hidden`, not animated either way).
          isAnimationActive={false}
          content={<ChartTooltipContent hideLabel={!isMultiSeries} />}
        />
        {isMultiSeries && (
          // flex-wrap — a second real, confirmed layout gap found in the
          // same investigation as the aspect-ratio fix above: shadcn's
          // own real, current ChartLegendContent className
          // ("flex items-center justify-center gap-4...", confirmed via
          // direct read of their v3 registry source) never sets
          // flex-wrap, and Recharts positions the legend wrapper via
          // `position: absolute` — in every one of shadcn's OWN real
          // reference examples this is safe because they never show more
          // than 2 short legend entries in one card. This grammar's own
          // `series:` field has no such limit (this fixture's own bar
          // panel has 4, with a genuinely long label), so a narrow
          // column's legend can need more horizontal room than it has.
          // `flex-wrap` degrades that gracefully to a second line INSIDE
          // the card instead of visibly overflowing past it.
          <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        )}
        {config.chart_type === 'area' && (
          <defs>
            {seriesKeys.map((key) => (
              <linearGradient key={key} id={gradientId(gradientIdPrefix, key)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.8} />
                <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
        )}
        {seriesKeys.map((key, index) => {
          const color = `var(--color-${key})`
          if (config.chart_type === 'line') {
            return <MarkComponent key={key} dataKey={key} type="monotone" stroke={color} strokeWidth={2} dot={false} />
          }
          if (config.chart_type === 'area') {
            return (
              <MarkComponent
                key={key}
                dataKey={key}
                type="natural"
                fill={`url(#${gradientId(gradientIdPrefix, key)})`}
                fillOpacity={0.4}
                stroke={color}
                stackId={config.stacked ? 'stack' : undefined}
              />
            )
          }
          // bar
          const radius = !config.stacked
            ? 4
            : index === 0
              ? [0, 0, 4, 4]
              : index === seriesKeys.length - 1
                ? [4, 4, 0, 0]
                : 0
          return (
            <MarkComponent
              key={key}
              dataKey={key}
              fill={color}
              radius={radius}
              stackId={config.stacked ? 'stack' : undefined}
            />
          )
        })}
      </ChartComponent>
    </ChartContainer>
  )
}
