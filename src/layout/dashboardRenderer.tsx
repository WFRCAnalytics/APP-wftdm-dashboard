import { useMemo } from 'react'
import { PanelCard } from '@/layout/panelCard'
import { isMapRenderingPanel, type DashboardTabConfig, type PanelConfig } from '@/layout/types'

// Renders one active tab's layout (docs/GRAMMAR.md: named rows, each a
// flat list of panels) as ordered rows of PanelCards, each sized by its
// width fraction (0.0-1.0) within its own row.
//
// 011-basemap-style-system: also the one place that injects each
// map-rendering panel's tab-level default_basemap (FR-005) onto its own
// config object as _tabDefaultBasemap, BEFORE that panel ever renders —
// see data-model.md's MapRenderingPanelConfig note for why this keeps the
// panel pattern's "single config prop" contract intact instead of adding
// a second prop to PanelCard/every panel component.
//
// Deliberately does NOT subscribe to useColorScheme() here. A first
// version did, specifically to force a re-render on every theme change —
// but re-computing withTabDefaultBasemap's object on every render
// (including unrelated ones) broke FlowMapPanel's existing config-
// referential-stability assumption: its data-update effect keys off
// `config` BY REFERENCE (CLAUDE.md's own Panel pattern documents exactly
// this class of bug for ALL_FILTERS — "never an inline literal, that
// allocates a new array every render"). Confirmed as a real regression
// empirically during implementation, not caught by typechecking or unit
// tests: a live theme toggle caused data-render-count to jump from 1 to
// 3 — the FlowmapLayer was spuriously re-applied with unchanged data.
// FlowMapPanel already has its own useColorScheme() subscription
// (contracts/flowmap-panel-basemap-integration.md); DashboardRenderer
// only needs `rows` to stay referentially stable across renders that
// have nothing to do with this tab, which useMemo keyed on `tab` alone
// provides — no theme subscription of its own required.
//
// CSS Grid, not flexbox, for the row track sizing: two panels at
// width: 0.5 each (a common case — see the fixture) produced flex-basis:
// 50%/50%, but flexbox's percentage flex-basis does NOT account for
// `gap` — 50% + 50% + the row's own gap exceeds 100% of the container,
// so flex-wrap silently wrapped the second panel onto its own line
// (looked like every panel was full-width, regardless of its configured
// width). Grid's `fr` units are gap-aware by design — gridTemplateColumns
// built from each panel's width fraction distributes exactly the
// remaining space after gaps are subtracted, no overflow/wrap surprise.
export function DashboardRenderer({ tab }: { tab: DashboardTabConfig }) {
  const rows = useMemo(() => {
    function withTabDefaultBasemap(panel: PanelConfig): PanelConfig {
      if (!isMapRenderingPanel(panel)) return panel
      // isMapRenderingPanel already runtime-confirms `panel` is one of
      // the map-rendering PanelConfig union members — the cast below is
      // TS's own structural-typing limitation on spreading within a
      // union return position (it can't re-collapse the spread's
      // inferred type back into the union without help), not a real
      // type-safety gap.
      return { ...panel, _tabDefaultBasemap: tab.default_basemap } as PanelConfig
    }
    return Object.entries(tab.layout).map(
      ([rowName, panels]) => [rowName, panels.map(withTabDefaultBasemap)] as const,
    )
  }, [tab])

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* wftdm-design-system, Phase 2: header.title/description are real,
          validated fields (layout/types.ts's parseDashboardConfig — title
          is even REQUIRED) that had no rendering consumer anywhere in the
          app before this — confirmed via a full src/ search finding zero
          references to header.title/header.description outside types.ts
          itself. This is the Page Title role's first real application
          (previously "reserved for Phase 2, if needed" — it was needed).
          Participates in the same gap-6 rhythm as the row grid below, not
          a separately-spaced block. */}
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">{tab.header.title}</h1>
        {tab.header.description && (
          <p className="mt-1 font-body text-sm text-muted-foreground">{tab.header.description}</p>
        )}
      </div>
      {rows.map(([rowName, panels]) => (
        <div
          key={rowName}
          className="grid gap-6"
          style={{
            gridTemplateColumns: panels.map((p) => `${(p.width ?? 1) * 100}fr`).join(' '),
          }}
        >
          {panels.map((panel, index) => (
            <div key={`${rowName}-${index}`} className="min-w-0">
              <PanelCard config={panel} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
