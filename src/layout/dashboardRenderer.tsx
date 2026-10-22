import { Suspense, useEffect, useMemo } from 'react'
import { PanelCard, PanelErrorBoundary } from '@/layout/panelCard'
import { HeroCell } from '@/layout/heroCell'
import { IdenticalNote } from '@/layout/identicalNote'
import { registry } from '@/panels/registry'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { PanelLoadingState } from '@/panels/PanelLoadingState'
import { useResolvedView } from '@/hooks/useViewContext'
import { equalizeRowHeights, findFullPagePanel, isHeroRow, isMetricStripRow, isPanelVisible, resolveSections } from '@/layout/dashboardLayout'
import { isMapRenderingPanel, type DashboardTabConfig, type PanelConfig } from '@/layout/types'
import { computeTabDataRequirement, ensureRegistered } from '@/services/tabDataLoader'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { tileKey } from '@/state/tileState'

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
  // 056-lazy-tab-scoped-loading: proactively kick off THIS tab's whole
  // real data requirement (data-model.md entity 1) as soon as it becomes
  // active, or as soon as the active-scenario set changes while it's
  // already active — a single combined ensureRegistered() call across
  // every panel's own pairs, deduplicated. This is a performance
  // optimization only, not the source of correctness: each individual
  // panel type's own fetch effect (panels/*.tsx) calls ensureRegistered()
  // again for its own narrower need before querying, and that narrower
  // call is what actually gates a panel's query — ensureRegistered()'s
  // own in-flight-promise memoization means this tab-wide call and every
  // panel's own call for an overlapping pair share the same underlying
  // work, never registering anything twice. Errors are deliberately not
  // handled here — a failed pair surfaces through whichever panel's own
  // ensureRegistered() call actually needed it, via that panel's existing
  // error-state branch (spec.md FR-011), not a tab-level error UI.
  const activeScenarios = useActiveScenarios()
  useEffect(() => {
    const pairs = computeTabDataRequirement(tab, activeScenarios)
    ensureRegistered(pairs).catch(() => {
      // Intentionally swallowed here — see comment above.
    })
  }, [tab, activeScenarios])

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
          {/* 042-boot-performance-fix: same Suspense requirement as
              panelCard.tsx's own — registry[config.type] is a
              React.lazy() component now, see that file's own comment. */}
          <Suspense fallback={<PanelLoadingState height={config.height} />}>
            <PanelComponent config={config} />
          </Suspense>
        </PanelErrorBoundary>
      ) : (
        <PanelErrorState message={`Unknown panel type: "${config.type}"`} />
      )}
    </div>
  )
}

function OrdinaryDashboardRenderer({ tab }: { tab: DashboardTabConfig }) {
  const view = useResolvedView()
  const scenarioCount = view.active.length
  const visibility = useMemo(() => ({ compare: view.compare, isBaseYear: view.isBaseYear }), [view.compare, view.isBaseYear])
  const rows = useMemo(() => {
    function withTabDefaultBasemap(panel: PanelConfig): PanelConfig {
      // a multi-view hands the tab default on to a map view
      if (panel.type === 'multi-view') return { ...panel, _tabDefaultBasemap: tab.default_basemap } as PanelConfig
      if (!isMapRenderingPanel(panel)) return panel
      // isMapRenderingPanel already runtime-confirms `panel` is one of
      // the map-rendering PanelConfig union members — the cast below is
      // TS's own structural-typing limitation on spreading within a
      // union return position (it can't re-collapse the spread's
      // inferred type back into the union without help), not a real
      // type-safety gap.
      return { ...panel, _tabDefaultBasemap: tab.default_basemap } as PanelConfig
    }
    return Object.entries(tab.layout)
      .map(([rowName, panels]) => [rowName, equalizeRowHeights(panels.filter((p) => isPanelVisible(p, visibility)).map(withTabDefaultBasemap), scenarioCount)] as const)
      .filter(([, panels]) => panels.length > 0)
  }, [tab, visibility, scenarioCount])

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
      // a section that names a tile anchors on that tile instead (see tileAnchors)
      if (firstRow && !section.tile && !map.has(firstRow)) map.set(firstRow, section.id)
    }
    return map
  }, [tab])

  const tileAnchors = useMemo(() => {
    const map = new Map<string, string>()
    for (const section of tab.sections ?? []) if (section.tile) map.set(section.tile, section.id)
    return map
  }, [tab])

  return (
    <div className="flex flex-col gap-[14px] pb-[60px] pl-[14px] pr-7 pt-2">
      {/* The page title and description now live in the sticky PageHeader (layout/pageHeader.tsx). */}
      {rows.some(([, panels]) => isHeroRow(panels)) && <IdenticalNote />}
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
        const hero = isHeroRow(panels)
        return (
          <div
            key={rowName}
            id={sectionId ? `section-${sectionId}` : undefined}
            data-testid={rowName}
            className={
              hero
                ? // the hero KPI band (project-docs/redesign/02-layout-and-components.md section 1.4): one raised container,
                  // equal columns split by hairlines, two columns below 1100px with the last cell spanning both
                  'grid scroll-mt-24 grid-cols-[repeat(var(--n),minmax(0,1fr))] rounded-[26px] border border-[var(--glass-line)] bg-[var(--tile-hi)] p-[6px] shadow-[var(--sh1)] max-[1100px]:grid-cols-2'
                : metricStrip
                  ? 'grid scroll-mt-24 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-[14px]'
                  : 'grid scroll-mt-24 gap-[14px]'
            }
            style={
              hero
                ? ({ '--n': panels.length } as React.CSSProperties)
                : metricStrip
                  ? undefined
                  : { gridTemplateColumns: panels.map((p) => `${(p.width ?? 1) * 100}fr`).join(' ') }
            }
          >
            {panels.map((panel, index) =>
              hero ? (
                <HeroCell key={`${rowName}-${index}`} config={panel} />
              ) : (
                <div
                  key={`${rowName}-${index}`}
                  id={tileAnchors.has((panel as { id?: string }).id ?? '') ? `section-${tileAnchors.get((panel as { id?: string }).id ?? '')}` : undefined}
                  className="flex min-w-0 scroll-mt-24 flex-col [&>*]:flex-1"
                >
                  <PanelCard config={panel} tileKey={tileKey(tab.header.tab, (panel as { id?: string }).id ?? `${rowName}-${index}`)} />
                </div>
              ),
            )}
          </div>
        )
      })}
    </div>
  )
}
