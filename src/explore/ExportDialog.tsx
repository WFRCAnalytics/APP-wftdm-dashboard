// 065-chart-builder: export and import of a chart. Export offers the portable configuration (JSON, importable, includes the data
// source), the chart as PNG or SVG (through the same renderer the dashboard tiles use) and its data as CSV. Import takes a
// configuration, lists every problem by path, and opens the chart as a new tab: nothing existing is changed.
import { useState } from 'react'
import { Btn } from '@/explore/parts'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { fromConfig, defaultSpec, toConfig } from '@/charts/builder/spec'
import { describeTable } from '@/explore/relations'
import { relationColumns } from '@/explore/sql/queryModel'
import type { ChartData } from '@/explore/useChartData'
import { cardToSvg, downloadBlob, downloadCsv, fileName, svgToPng } from '@/services/exportTile'
import { getExplore, setExplore, type ChartTab } from '@/state/exploreState'

export function Modal({ title, onClose, children, wide, bare }: { title: string; onClose(): void; children: React.ReactNode; wide?: boolean; bare?: boolean }) {
  return createPortal(
    <div className="xb xb-portal">
      <div className="scrim" onClick={onClose}>
        <div className={`dlg ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
          {!bare && <div className="dh"><h2 className="tt">{title}</h2><button type="button" className="x2" aria-label="Close" onClick={onClose}><X size={14} /></button></div>}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * A table scrolls inside its card, so the card on screen shows only part of a big one and the image export, which draws what is laid
 * out, would cut it off. A card holding a table is exported from an off-screen copy that is allowed to grow to the table's full width
 * and height (the .xb-export rules in explore.css); everything else is exported as it is. `done()` removes the copy.
 */
function exportTarget(card: HTMLElement): { el: HTMLElement; done(): void } {
  if (!card.querySelector('.pvt-host')) return { el: card, done: () => undefined }
  const holder = document.createElement('div')
  holder.className = 'xb-export-holder'
  const copy = card.cloneNode(true) as HTMLElement
  copy.removeAttribute('data-testid')
  copy.classList.add('xb-export')
  copy.style.minWidth = `${card.offsetWidth}px`
  holder.appendChild(copy)
  // inside the same parent, so the builder's styles and theme variables still apply
  card.parentElement!.appendChild(holder)
  return { el: copy, done: () => holder.remove() }
}

export function ExportDialog({ tab, data, cardEl, onClose }: { tab: ChartTab; data: ChartData; cardEl(): HTMLElement | null; onClose(): void }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const s = getExplore()
  const config = toConfig(tab.spec, { relation: tab.source, scenarios: s.scenarios, sql: data.relSql, typeOf: (f) => data.cols.find((c) => c.name === f)?.type })
  const json = JSON.stringify(config, null, 2)
  const base = [tab.spec.text.title.t || tab.name]

  const image = async (kind: 'png' | 'svg') => {
    const el = cardEl()
    if (!el) return
    setBusy(true)
    try {
      const background = getComputedStyle(el).getPropertyValue('--tile').trim() || '#ffffff'
      const target = exportTarget(el)
      let out: Awaited<ReturnType<typeof cardToSvg>>
      try { out = await cardToSvg(target.el, { background }) } finally { target.done() }
      const { svg, width, height } = out
      if (kind === 'svg') downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), fileName(base, 'svg'))
      else downloadBlob(await svgToPng(svg, width, height), fileName(base, 'png'))
      setMsg(kind === 'svg' ? 'SVG saved.' : 'PNG saved.')
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(json); setMsg('Copied.') } catch { setMsg('Select the text and copy it with your keyboard.') } }

  return (
    <Modal title="Export this chart" onClose={onClose}>
      <div className="rrow">
        <Btn disabled={busy} onClick={() => void image('png')}>PNG</Btn>
        <Btn disabled={busy} onClick={() => void image('svg')}>SVG</Btn>
        <Btn onClick={() => { downloadCsv(data.rows, fileName(base, 'csv')); setMsg('CSV saved.') }}>Data (CSV)</Btn>
        <Btn onClick={() => { downloadBlob(new Blob([json], { type: 'application/json' }), fileName([...base, 'chart'], 'json')); setMsg('Configuration saved.') }}>Configuration (JSON)</Btn>
      </div>
      <textarea readOnly aria-label="Chart configuration" value={json} />
      <div className="rrow"><Btn variant="primary" onClick={() => void copy()}>Copy configuration</Btn><span className="runmsg" role="status">{msg}</span></div>
    </Modal>
  )
}

/** Opens a chart configuration (the Export JSON) as a new tab. Resolves to the problems found, or an empty list when it opened.
 * Used by the Import dialog and by a deployer's `presets`. */
export async function importConfig(text: string, name?: string): Promise<string[]> {
  const s = getExplore()
  let relation = '', scenarios = s.scenarios
  try {
    const c = JSON.parse(text) as { data?: { relation?: string; source?: { scenarios?: string[] } } }
    relation = c.data?.relation ?? ''
    if (Array.isArray(c.data?.source?.scenarios)) scenarios = c.data!.source!.scenarios!
  } catch { /* fromConfig reports it */ }
  const cache: Record<string, { name: string }[] | undefined> = {}
  if (relation.startsWith('t:') && s.scenarios[0]) {
    try { cache[relation] = relationColumns(await describeTable(s.scenarios[0], relation.slice(2)), scenarios) } catch { /* reported as not a table */ }
  } else if (relation.startsWith('m:')) cache[relation] = s.mine.find((m) => `m:${m.id}` === relation)?.columns
  const r = fromConfig(text, { scenarios: s.scenarios.length ? Array.from(new Set([...s.scenarios, ...scenarios])) : scenarios, columnsOf: (rel) => cache[rel] })
  if (!r.ok) return r.errors
  const id = `c${s.nextId}`
  setExplore((st) => ({ charts: [...st.charts, { id, name: name || `Imported ${st.nextId}`, source: r.relation, spec: r.spec }], activeTab: id, nextId: st.nextId + 1, scenarios: r.scenarios }))
  return []
}

export function ImportDialog({ onClose }: { onClose(): void }) {
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const run = async () => {
    const found = await importConfig(text)
    if (found.length) setErrors(found)
    else onClose()
  }
  return (
    <Modal title="Import a chart" onClose={onClose}>
      <p className="hint">Paste a chart configuration. It opens as a new tab, and nothing existing is changed.</p>
      <textarea aria-label="Chart configuration" value={text} placeholder="Paste exported JSON here" onChange={(e) => setText(e.target.value)} />
      {errors.length > 0 && <ul className="errs">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="rrow"><Btn variant="primary" onClick={() => void run()}>Import chart</Btn></div>
    </Modal>
  )
}

export { defaultSpec }
