import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import * as icons from 'lucide-react'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import * as appState from '@/state/appState'
import { useFilterState } from '@/hooks/useFilterState'
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

/** Kebab-case ("person-walking") -> PascalCase ("PersonWalking") lucide-react export name. */
function iconComponentFor(name: string): LucideIcon | undefined {
  const pascal = name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  const icon = (icons as unknown as Record<string, LucideIcon>)[pascal]
  return icon
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
  const [value, setValue] = useState<unknown>(undefined)
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')

    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(
      config,
      appState.getActive().map((s) => s.name),
    )
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
  }, [config, filters])

  if (state === 'loading') {
    return <div className="h-16 animate-pulse rounded-md bg-muted" />
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
      {Icon && <Icon className="text-muted-foreground" size={24} aria-hidden="true" />}
      <div>
        <div className="font-heading text-3xl font-semibold">
          {formatValue(value, config.format)}
          {config.unit && <span className="ml-1 text-sm text-muted-foreground">{config.unit}</span>}
        </div>
      </div>
    </div>
  )
}
