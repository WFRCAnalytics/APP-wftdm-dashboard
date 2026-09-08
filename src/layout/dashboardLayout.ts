// Pure, DOM-free layout-resolution logic for 030-sidebar-navigation — split
// out of dashboardRenderer.tsx/sidebarNav.tsx for direct unit testability,
// matching this project's own established convention for non-trivial-but-
// pure layout/data logic (tableLogic.ts, sankeyGraph.ts, zonemapColor.ts).
import type { DashboardTabConfig, PanelConfig, SectionConfig } from '@/layout/types'

/**
 * FR-018/data-model.md §5: a "Metric Strip" row — every panel in it is
 * `type: valuebox`. Not a stored/authored concept (no new YAML field) —
 * purely a rendering-time classification dashboardRenderer.tsx applies to
 * each already-existing `layout` row.
 */
export function isMetricStripRow(panels: PanelConfig[]): boolean {
  return panels.length > 0 && panels.every((p) => p.type === 'valuebox')
}

/**
 * FR-008/data-model.md §3: resolves whether `tab` qualifies for the
 * chromeless full-page rendering mode. Flattens every row in `tab.layout`
 * and returns the single panel only when the flattened list has EXACTLY
 * one entry — `null` for zero or 2+ panels, which
 * dashboardRenderer.tsx's own full-page branch treats as "fall back to
 * ordinary multi-row rendering," logging a console.warn naming the
 * problem (spec.md's Edge Cases). Does not itself consult
 * `tab.header.full_page` — the caller checks that flag before calling
 * this at all, keeping "is full_page requested" and "does the tab
 * actually qualify" as two separate, individually-testable questions.
 */
export function findFullPagePanel(tab: DashboardTabConfig): PanelConfig | null {
  const allPanels = Object.values(tab.layout).flat()
  return allPanels.length === 1 ? allPanels[0] : null
}

export interface ResolvedSection {
  id: string
  label: string
  /** This section's own valid row names, in `tab.layout`'s own object-key
   * order — never `section.rows`' own authored order, since rendering
   * order is `layout`'s alone (data-model.md §2: "sections never reorders
   * rows"). */
  rows: string[]
}

/**
 * FR-013–FR-015/data-model.md §2's Validation rules: resolves `tab.sections`
 * against `tab.layout`'s real row names. A `sections[].rows[]` entry naming
 * a row absent from `tab.layout` is dropped with a console.warn naming the
 * missing row and section — the section still renders with its remaining
 * valid rows, or is omitted entirely if left with zero. A `layout` row
 * referenced by no section is unaffected elsewhere (it still renders in its
 * normal position; this function's own return value simply has no entry
 * pointing at it — that's dashboardRenderer.tsx's concern, not this one's).
 */
export function resolveSections(tab: DashboardTabConfig): ResolvedSection[] {
  const realRowNames = new Set(Object.keys(tab.layout))
  const resolved: ResolvedSection[] = []

  for (const section of tab.sections ?? []) {
    if (
      !section ||
      typeof section.id !== 'string' ||
      typeof section.label !== 'string' ||
      !Array.isArray(section.rows)
    ) {
      console.warn(
        `dashboardLayout.resolveSections: malformed section entry on tab "${tab.header.tab}" — skipped`,
        section,
      )
      continue
    }
    const validRows = section.rows.filter((rowName) => {
      if (realRowNames.has(rowName)) return true
      console.warn(
        `dashboardLayout.resolveSections: tab "${tab.header.tab}" section "${section.id}" references unknown row "${rowName}" — dropped`,
      )
      return false
    })
    // Re-order to layout's own object-key order, not the section's own
    // authored rows[] order — matching data-model.md §2's own "sections
    // never reorders rows" guarantee.
    const orderedRows = Object.keys(tab.layout).filter((rowName) => validRows.includes(rowName))
    if (orderedRows.length === 0) continue
    resolved.push({ id: section.id, label: section.label, rows: orderedRows })
  }

  return resolved
}

// Re-exported so callers (sidebarNav.tsx) don't need a second import from
// layout/types.ts just for this one type.
export type { SectionConfig }
