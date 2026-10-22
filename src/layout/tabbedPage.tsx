import { useEffect, useMemo, type KeyboardEvent } from 'react'

import { PillSelect } from '@/components/ui/pill-select'
import { FillProvider } from '@/layout/fill'
import { HeroBand } from '@/layout/heroBand'
import { IdenticalNote } from '@/layout/identicalNote'
import { PanelCard } from '@/layout/panelCard'
import { PageExportButton } from '@/layout/pageExport'
import { SharedControlsBar, SharedKindsContext, useSharedContext } from '@/layout/sharedControlsBar'
import { sharedControl, type SharedContext } from '@/layout/sharedControls'
import type { TabsPlan, TabSection } from '@/layout/dashboardLayout'
import type { PanelConfig, SharedControlKind } from '@/layout/types'
import { cn } from '@/lib/utils'
import { getActiveSection, getPickedTile, setActiveSection, setPickedTile, useLayoutVersion } from '@/state/layoutState'
import { getTileVersion, tileKey } from '@/state/tileState'

// A page shown as tabs (project-docs/redesign/10-toolbar-layout-export-proposal.md section C): the pinned rows (the KPI
// band) stay on top, one tab strip, and the active tab's tiles fill the rest of the screen. A "stack" tab shows all of
// its rows; a "pick" tab shows one tile at a time, chosen from a list. Inactive tabs are not mounted.

const tileId = (panel: PanelConfig, rowName: string, index: number) => (panel as { id?: string }).id ?? `${rowName}-${index}`

type Rows = ReadonlyMap<string, PanelConfig[]>

export function TabbedPage({ page, plan, rows }: { page: string; plan: TabsPlan; rows: Rows }) {
  useLayoutVersion()
  const stored = getActiveSection(page)
  const section = plan.sections.find((s) => s.id === stored) ?? plan.sections[0]

  // a link to #<section id> opens that tab; the tab in use is mirrored into the address
  useEffect(() => {
    const open = () => {
      const wanted = window.location.hash.slice(1)
      if (wanted && plan.sections.some((s) => s.id === wanted)) setActiveSection(page, wanted)
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const ids = useMemo(() => new Map(section.rows.flatMap((name) => (rows.get(name) ?? []).map((p, i) => [p, tileId(p, name, i)] as const))), [section, rows])
  const sharedCtx = useSharedContext(page, ids)
  const version = getTileVersion()
  const kinds = useMemo(() => activeKinds(section, rows, sharedCtx), [section, rows, sharedCtx.compare, version]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto pb-[14px] pl-[14px] pr-7 pt-1" data-testid="tabbed-page" data-section={section.id}>
      {plan.pinned.length > 0 && <IdenticalNote />}
      {plan.pinned.map((name) => (
        <HeroBand key={name} rowName={name} panels={rows.get(name) ?? []} />
      ))}
      <TabStrip page={page} plan={plan} section={section} rows={rows} kinds={kinds} />
      <SharedKindsContext.Provider value={kinds}>
        <SectionBody key={`${page}:${section.id}`} page={page} section={section} rows={rows} />
      </SharedKindsContext.Provider>
    </div>
  )
}

/** The shared controls this tab declares that its tiles really offer (two or more options in common). */
function activeKinds(section: TabSection, rows: Rows, ctx: SharedContext): ReadonlySet<SharedControlKind> {
  const panels = section.rows.flatMap((name) => rows.get(name) ?? [])
  return new Set(section.shared.filter((k) => sharedControl(k, panels, ctx) !== null))
}

function TabStrip({ page, plan, section, rows, kinds }: { page: string; plan: TabsPlan; section: TabSection; rows: Rows; kinds: ReadonlySet<SharedControlKind> }) {
  const tiles = section.mode === 'pick' ? pickables(section, rows) : []
  const picked = pickedFor(page, section, tiles)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = plan.sections.findIndex((s) => s.id === section.id)
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? plan.sections.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    const target = plan.sections[(next + plan.sections.length) % plan.sections.length]
    setActiveSection(page, target.id)
    requestAnimationFrame(() => document.getElementById(`tab-${target.id}`)?.focus())
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      {plan.sections.length > 1 && (
        <div role="tablist" aria-label="Page sections" onKeyDown={onKey} className="inline-flex max-w-full items-center gap-1 pill-track overflow-x-auto rounded-full p-[3px]">
          {plan.sections.map((s) => {
            const on = s.id === section.id
            return (
              <button
                key={s.id}
                id={`tab-${s.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setActiveSection(page, s.id)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full px-[15px] py-[6px] font-body text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
                  on ? 'pill-on font-medium' : 'pill-off',
                )}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      )}
      {tiles.length > 1 && (
        <PillSelect
          label="Chart"
          wide
          value={picked}
          options={tiles.map((t) => ({ value: t.id, label: t.title }))}
          onChange={(id) => setPickedTile(`${page}:${section.id}`, id)}
          data-testid="tab-chart-picker"
        />
      )}
      {kinds.size > 0 && (
        <div className="flex items-center gap-3" data-testid="shared-controls">
          <SharedControlsBar page={page} sectionId={section.id} kinds={[...kinds]} rows={rows} rowNames={section.rows} />
        </div>
      )}
      <div className="ml-auto">
        <PageExportButton pageTitle={page} />
      </div>
    </div>
  )
}

function pickables(section: TabSection, rows: Rows) {
  return section.rows.flatMap((name) =>
    (rows.get(name) ?? []).map((panel, index) => ({ id: tileId(panel, name, index), title: panel.title ?? tileId(panel, name, index), panel })),
  )
}

function pickedFor(page: string, section: TabSection, tiles: { id: string }[]): string {
  const stored = getPickedTile(`${page}:${section.id}`)
  return tiles.find((t) => t.id === stored)?.id ?? tiles[0]?.id ?? ''
}

function SectionBody({ page, section, rows }: { page: string; section: TabSection; rows: Rows }) {
  const tiles = useMemo(() => (section.mode === 'pick' ? pickables(section, rows) : []), [section, rows])
  if (section.mode === 'pick') {
    const chosen = tiles.find((t) => t.id === pickedFor(page, section, tiles))
    if (!chosen) return null
    return (
      <div className="flex min-h-[480px] flex-1 flex-col" data-testid="tab-body">
        <Cell key={chosen.id} page={page} panel={chosen.panel} id={chosen.id} />
      </div>
    )
  }
  return (
    <div className="flex min-h-[480px] flex-1 flex-col gap-[14px]" data-testid="tab-body">
      {section.rows.map((name) => (
        <div
          key={name}
          data-testid={name}
          className="grid min-h-[300px] flex-1 gap-[14px]"
          style={{ gridTemplateColumns: (rows.get(name) ?? []).map((p) => `${(p.width ?? 1) * 100}fr`).join(' ') }}
        >
          {(rows.get(name) ?? []).map((panel, index) => (
            <Cell key={tileId(panel, name, index)} page={page} panel={panel} id={tileId(panel, name, index)} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Cell({ page, panel, id }: { page: string; panel: PanelConfig; id: string }) {
  return (
    <FillProvider>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1">
        <PanelCard config={panel} tileKey={tileKey(page, id)} />
      </div>
    </FillProvider>
  )
}
