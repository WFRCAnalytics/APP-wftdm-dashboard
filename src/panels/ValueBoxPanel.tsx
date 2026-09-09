import { useEffect, useState } from 'react'
import * as icons from 'lucide-react'

import { query } from '@/services/duckdb'
import { iconComponentFor } from '@/lib/iconComponentFor'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import {
  buildPanelQuery,
  resolveActiveScenarios,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { formatValue } from '@/panels/formatValue'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { ValueBoxPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*'] // module-level constant — stable identity,
// never an inline `?? ['*']` literal (that allocates a new array every render)

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

  return (
    <div className="flex items-center gap-3">
      {/* wftdm-design-system skill's Iconography table — Decorative tier
          (h-5 w-5, 20px), matching basemapTab.tsx's own tile icons. Was
          size={24}, a one-off between the Decorative (20px) and
          Illustrative (28px) tiers; also switched to the preferred
          h-X w-X Tailwind-class form over the legacy size prop. */}
      {Icon && <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
      <div>
        <div className="font-heading text-3xl font-semibold">
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
      </div>
    </div>
  )
}
