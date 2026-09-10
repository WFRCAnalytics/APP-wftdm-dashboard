import { useMemo } from 'react'
import { PanelCard, PanelErrorBoundary } from '@/layout/panelCard'
import { registry } from '@/panels/registry'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { findFullPagePanel, isMetricStripRow, resolveSections } from '@/layout/dashboardLayout'
import { isMapRenderingPanel, type DashboardTabConfig, type PanelConfig } from '@/layout/types'

// Renders one active tab's layout (project-docs/GRAMMAR.md: named rows, each a
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
//
// 030-sidebar-navigation: gains the chromeless full-page branch (US2),
// section-id DOM scroll anchors (US3), and the Metric Strip auto-fill
// layout for all-valuebox rows (US4) — all three additive to the
// pre-existing ordinary multi-row path below, per FR-020's own explicit
// "an existing, unmodified dashboard-*.yaml renders unchanged" guarantee.
export function DashboardRenderer({ tab }: { tab: DashboardTabConfig }) {
  // FR-008: checked BEFORE the normal row-rendering path. Only a genuine
  // exactly-one-panel tab renders full-page — findFullPagePanel() itself
  // never consults header.full_page (that's this component's own job, so
  // "was full-page requested" and "does the tab actually qualify" stay
  // two separately-testable questions, dashboardLayout.ts's own doc
  // comment).
  const fullPagePanel = tab.header.full_page ? findFullPagePanel(tab) : null

  if (tab.header.full_page && !fullPagePanel) {
    console.warn(
      `dashboardRenderer: tab "${tab.header.tab}" has full_page: true but its layout resolves to ` +
        `${Object.values(tab.layout).flat().length} panels, not exactly 1 — falling back to ordinary rendering.`,
    )
  }

  if (fullPagePanel) {
    return <FullPagePanel config={fullPagePanel} />
  }

  return <OrdinaryDashboardRenderer tab={tab} />
}

// Chromeless full-page render path (contracts/sidebar-shell.md's own
// Chromeless full-page mode section): the SAME registry[config.type]
// lookup + PanelErrorBoundary every ordinary panel uses, but WITHOUT
// Card/CardHeader/CardTitle/CardContent (no border/shadow/rounded
// corners/title bar) and WITHOUT usePanelExpandHost's expand trigger
// (FR-011 — already maximally sized, an expand control would be
// redundant; this also means panelExpandHost.tsx's own portal-host
// mechanism is never invoked at all for a full-page panel). No page
// title/description is rendered anywhere on this path — header.title/
// .description are simply never read here (not blanked, never
// consulted), matching FR-008/Edge Cases exactly.
//
// height: '100%' on the outer wrapper — this IS the real, definite CSS
// height research.md §7/FR-009 require: SidebarInset (components/ui/
// sidebar.tsx) is a flex column filling min-h-screen, so a `flex-1
// min-h-0` wrapper here genuinely resolves against real, current
// viewport space (not a fixed pixel value, not an indeterminate
// percentage), letting GraphicWalkerPanel.tsx's own pre-existing
// `.graphic-walker-panel-host { height: 100% }` rule (graphicWalkerPanel.css)
// resolve correctly with ZERO change to that file itself — confirmed
// empirically, not merely assumed (see this feature's own completion
// report for the live measurement).
function FullPagePanel({ config }: { config: PanelConfig }) {
  const PanelComponent = registry[config.type]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {PanelComponent ? (
        <PanelErrorBoundary panelTitle={config.title}>
          <PanelComponent config={config} />
        </PanelErrorBoundary>
      ) : (
        <PanelErrorState message={`Unknown panel type: "${config.type}"`} />
      )}
    </div>
  )
}

function OrdinaryDashboardRenderer({ tab }: { tab: DashboardTabConfig }) {
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

  // FR-013–FR-016: for each resolved section, the FIRST row (in layout's
  // own real key order, never the section's own authored rows[] order) is
  // where this section's DOM scroll-to anchor lands — a section can group
  // multiple rows, but sections never reorder rows (data-model.md §2), so
  // there is no single "section block" to wrap; anchoring at its first row
  // is the correct, order-preserving landing point for
  // Element.scrollIntoView() (research.md §8).
  const sectionAnchorByRow = useMemo(() => {
    const map = new Map<string, string>()
    for (const section of resolveSections(tab)) {
      const firstRow = section.rows[0]
      if (firstRow && !map.has(firstRow)) map.set(firstRow, section.id)
    }
    return map
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
      {rows.map(([rowName, panels]) => {
        const sectionId = sectionAnchorByRow.get(rowName)
        // FR-018: a row composed entirely of valuebox panels lays out as
        // an auto-filling minimum-card-width grid ("Metric Strip"),
        // distinct from the plain equal-fraction column division every
        // other row composition uses — a rendering-time classification
        // (dashboardLayout.ts's isMetricStripRow()), not an authored
        // concept; FR-020 requires every other row's existing fraction
        // layout to stay completely unchanged.
        const metricStrip = isMetricStripRow(panels)
        return (
          <div
            key={rowName}
            id={sectionId ? `section-${sectionId}` : undefined}
            data-testid={rowName}
            className={metricStrip ? 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6' : 'grid gap-6'}
            style={
              metricStrip
                ? undefined
                : { gridTemplateColumns: panels.map((p) => `${(p.width ?? 1) * 100}fr`).join(' ') }
            }
          >
            {panels.map((panel, index) => (
              <div key={`${rowName}-${index}`} className="min-w-0">
                <PanelCard config={panel} />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
