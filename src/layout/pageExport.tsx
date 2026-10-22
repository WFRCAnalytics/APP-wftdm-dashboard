import { useEffect, useRef, useState, type RefObject } from 'react'
import { Download } from 'lucide-react'

import { collectTables, renderTileImage, useExportContext } from '@/layout/tileExport'
import { downloadBlob, fileName, svgToPng, toCsv, type ExportTable } from '@/services/exportTile'
import { uniqueNames, zip, type ZipEntry } from '@/services/zip'

// "Export all" (project-docs/redesign/10-toolbar-layout-export-proposal.md question 7): every tile on screen, as one ZIP
// of CSV files or of PNG pictures. A tile adds itself here while it is mounted, so a tabbed page exports the open tab and a
// scrolling page exports the whole page.

interface PageTile {
  title: string
  cardRef: RefObject<HTMLElement | null>
  tables: () => ExportTable[]
}

const tiles = new Set<PageTile>()
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((fn) => fn())

export function registerPageTile(tile: PageTile): () => void {
  tiles.add(tile)
  changed()
  return () => {
    tiles.delete(tile)
    changed()
  }
}

/** Mounted tiles in reading order (top to bottom, then left to right). */
export function pageTiles(): PageTile[] {
  return [...tiles]
    .filter((t) => t.cardRef.current?.isConnected)
    .sort((a, b) => {
      const ra = a.cardRef.current!.getBoundingClientRect()
      const rb = b.cardRef.current!.getBoundingClientRect()
      return Math.abs(ra.top - rb.top) > 8 ? ra.top - rb.top : ra.left - rb.left
    })
}

const ITEM =
  'flex w-full items-center rounded-lg px-3 py-[7px] text-left font-body text-sm text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand-text)]'

async function pngBytes(card: HTMLElement, ctx: { scenarios: string; year: number | undefined }): Promise<Uint8Array> {
  const { svg, width, height } = await renderTileImage(card, ctx)
  return new Uint8Array(await (await svgToPng(svg, width, height, 2)).arrayBuffer())
}

export function PageExportButton({ pageTitle }: { pageTitle: string }) {
  const ctx = useExportContext()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [count, setCount] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => setCount(pageTiles().length)
    update()
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const base = [pageTitle, ctx.scenarios, ctx.year]
  const flash = (text: string) => {
    setNote(text)
    setTimeout(() => setNote(''), 2500)
  }
  const run = async (job: () => Promise<void>) => {
    setOpen(false)
    setBusy(true)
    try {
      await job()
    } catch (err) {
      console.error('export all failed', err)
      flash("Couldn't export these tiles")
    } finally {
      setBusy(false)
    }
  }

  const data = async () => {
    const encoder = new TextEncoder()
    const named: { name: string; rows: ExportTable['rows'] }[] = []
    for (const t of pageTiles()) {
      const found = collectTables(t.tables(), t.cardRef.current)
      for (const table of found) named.push({ name: fileName([t.title, found.length > 1 ? table.name : undefined], 'csv'), rows: table.rows })
    }
    if (named.length === 0) return flash('These tiles have no data to export')
    const names = uniqueNames(named.map((n) => n.name))
    const entries: ZipEntry[] = named.map((n, i) => ({ name: names[i], data: encoder.encode('﻿' + toCsv(n.rows)) }))
    downloadBlob(zip(entries), fileName([...base, 'data'], 'zip'))
  }

  const images = async () => {
    const found = pageTiles()
    if (found.length === 0) return flash('There are no tiles to export')
    const names = uniqueNames(found.map((t) => fileName([t.title], 'png')))
    const entries: ZipEntry[] = []
    for (const [i, t] of found.entries()) entries.push({ name: names[i], data: await pngBytes(t.cardRef.current!, ctx) })
    downloadBlob(zip(entries), fileName([...base, 'images'], 'zip'))
  }

  return (
    <div ref={wrapRef} className="relative" data-export-skip="" data-testid="page-export">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy || count === 0}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-[34px] items-center gap-2 rounded-full px-3 font-body text-sm text-[var(--mute)] hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] disabled:opacity-50"
      >
        <Download className="size-4" aria-hidden="true" />
        {busy ? 'Exporting…' : 'Export all'}
      </button>
      {note && (
        <span role="status" className="absolute right-0 top-full z-40 mt-1 whitespace-nowrap rounded-lg bg-[var(--ink)] px-3 py-1 font-body text-xs text-[var(--bg)]">
          {note}
        </span>
      )}
      {open && (
        <div role="menu" aria-label="Export all tiles" className="glass absolute right-0 top-full z-40 mt-1 w-[250px] rounded-[16px] p-1.5">
          <button role="menuitem" type="button" className={ITEM} onClick={() => run(data)}>
            All data (ZIP of CSV files)
          </button>
          <button role="menuitem" type="button" className={ITEM} onClick={() => run(images)}>
            All images (ZIP of PNG files)
          </button>
        </div>
      )}
    </div>
  )
}
