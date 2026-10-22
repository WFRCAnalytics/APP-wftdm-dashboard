import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react'
import { Download } from 'lucide-react'

import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { useResolvedView } from '@/hooks/useViewContext'
import { resolveScenarioLabel } from '@/panels/scenarioDisplay'
import { captureMap } from '@/services/mapCapture'
import { cardToSvg, downloadBlob, downloadCsv, fileName, svgToPng, tablesFromDom, toTsv, type ExportTable } from '@/services/exportTile'
import { getDeployment } from '@/state/compareState'
import { exportFooter } from '@/state/exportState'
import { cn } from '@/lib/utils'

// The Export menu of a tile (project-docs/redesign/10-toolbar-layout-export-proposal.md section D): the data the tile
// drew as CSV, the tile as it looks on screen as PNG or SVG, and a copy of the data for a spreadsheet. Panels that
// know their rows register an exporter; any other panel falls back to the `<table>` elements on screen.

export type TileExporter = () => ExportTable[]

interface TileExportRegistry {
  register(exporter: TileExporter): () => void
}

export const TileExportContext = createContext<TileExportRegistry | null>(null)

/** Registers what a panel can export for the tile around it. `exporter` may change every render. */
export function useRegisterTileExport(exporter: TileExporter | null): void {
  const registry = useContext(TileExportContext)
  const latest = useRef(exporter)
  latest.current = exporter
  const present = exporter !== null
  useEffect(() => {
    if (!registry || !present) return
    return registry.register(() => latest.current?.() ?? [])
  }, [registry, present])
}

export function createExportRegistry(): { registry: TileExportRegistry; all: () => ExportTable[] } {
  const exporters = new Set<TileExporter>()
  return {
    registry: {
      register(fn) {
        exporters.add(fn)
        return () => {
          exporters.delete(fn)
        }
      },
    },
    // side-by-side cells each register their own run: tables with one name become one table
    all: () => {
      const byName = new Map<string, ExportTable>()
      for (const t of [...exporters].flatMap((fn) => fn())) {
        const hit = byName.get(t.name)
        if (hit) hit.rows = [...hit.rows, ...t.rows]
        else byName.set(t.name, { name: t.name, rows: [...t.rows] })
      }
      return [...byName.values()]
    },
  }
}

export interface ExportMenuProps {
  title: string
  cardRef: RefObject<HTMLElement | null>
  tables: () => ExportTable[]
}

const ITEM =
  'flex w-full items-center rounded-lg px-3 py-[7px] text-left font-body text-sm text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand-text)]'

/** Scenarios and year that name an export file and fill its footer. */
export function useExportContext(): { scenarios: string; year: number | undefined } {
  const view = useResolvedView()
  const display = useScenarioDisplay()
  const runs = view.compare ? view.active : [view.focusRun ?? view.focus]
  return {
    scenarios: runs.map((r) => resolveScenarioLabel(r, display)).join(', '),
    year: getDeployment().years.length > 1 ? view.year : undefined,
  }
}

/** The data a tile drew: what its panels registered, else the HTML tables on screen. */
export function collectTables(own: ExportTable[], card: HTMLElement | null): ExportTable[] {
  const found = own.filter((t) => t.rows.length > 0)
  if (found.length > 0) return found
  return card ? tablesFromDom(card) : []
}

/** The tile as it looks on screen, as an SVG document and the size it was drawn at. */
export async function renderTileImage(card: HTMLElement, ctx: { scenarios: string; year: number | undefined }) {
  const background = getComputedStyle(document.body).backgroundColor
  return cardToSvg(card, { footer: exportFooter(ctx), background, captureMap })
}

export function ExportMenu({ title, cardRef, tables }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const { scenarios, year } = useExportContext()
  const base = [title, scenarios, year]

  const collect = (): ExportTable[] => collectTables(tables(), cardRef.current)
  const hasMap = () => Boolean(cardRef.current?.querySelector('.maplibregl-map'))
  const flash = (text: string) => {
    setNote(text)
    setTimeout(() => setNote(''), 2500)
  }

  const run = async (job: () => Promise<void> | void) => {
    setOpen(false)
    setBusy(true)
    try {
      await job()
    } catch (err) {
      console.error('export failed', err)
      flash("Couldn't export this tile")
    } finally {
      setBusy(false)
    }
  }

  const image = async (kind: 'png' | 'svg') => {
    const card = cardRef.current
    if (!card) return
    const { svg, width, height } = await renderTileImage(card, { scenarios, year })
    if (kind === 'svg') downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), fileName(base, 'svg'))
    else downloadBlob(await svgToPng(svg, width, height, 2), fileName(base, 'png'))
  }

  const csv = () => {
    const found = collect()
    found.forEach((t) => downloadCsv(t.rows, fileName([...base, found.length > 1 ? t.name : undefined], 'csv')))
    if (found.length === 0) flash('This tile has no data to export')
  }

  const copy = async () => {
    const first = collect()[0]
    if (!first) return flash('This tile has no data to copy')
    await navigator.clipboard.writeText(toTsv(first.rows))
    flash('Data copied')
  }

  const available = open ? collect().length > 0 : true

  return (
    <div ref={wrapRef} className="relative" data-export-skip="" data-testid="tile-export">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Export ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="grid size-[30px] place-items-center rounded-full text-[var(--mute)] hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] disabled:opacity-50"
      >
        <Download className={cn('size-4', busy && 'animate-pulse')} aria-hidden="true" />
      </button>
      {note && (
        <span role="status" className="absolute right-0 top-full z-40 mt-1 whitespace-nowrap rounded-lg bg-[var(--ink)] px-3 py-1 font-body text-xs text-[var(--bg)]">
          {note}
        </span>
      )}
      {open && (
        <div role="menu" aria-label={`Export ${title}`} className="glass absolute right-0 top-full z-40 mt-1 w-[210px] rounded-[16px] p-1.5">
          <button role="menuitem" type="button" className={ITEM} disabled={!available} onClick={() => run(csv)}>
            Download data (CSV)
          </button>
          <button role="menuitem" type="button" className={ITEM} onClick={() => run(() => image('png'))}>
            Download image (PNG)
          </button>
          <button role="menuitem" type="button" className={ITEM} disabled={hasMap()} title={hasMap() ? 'Maps export as PNG' : undefined} onClick={() => run(() => image('svg'))}>
            Download image (SVG)
          </button>
          <button role="menuitem" type="button" className={ITEM} disabled={!available} onClick={() => run(copy)}>
            Copy data
          </button>
        </div>
      )}
    </div>
  )
}
