// The background of an exported image (PNG and SVG), one choice shared by every export in the app: the Explore builder's dialog, each
// tile's Export menu and the page's Export all. Session state only (never Web Storage).
//
//   theme        the page background of the theme you are viewing (what you see is what you get)
//   white        a white image
//   transparent  no background at all, so the image sits on a slide or page of its own
//
// White and transparent are for pasting somewhere else, where the page is usually light. Dark-theme text is light, so exporting in
// dark mode would leave it unreadable there; instead the app is switched to its light theme for the moment of the capture (behind a
// cover, so nothing flashes) and switched back, and the image is drawn with dark text.
import { useSyncExternalStore } from 'react'

export type ExportBackground = 'theme' | 'white' | 'transparent'
export const EXPORT_BACKGROUNDS: { v: ExportBackground; label: string }[] = [
  { v: 'theme', label: 'Match theme' },
  { v: 'white', label: 'White' },
  { v: 'transparent', label: 'Transparent' },
]

let current: ExportBackground = 'theme'
const listeners = new Set<() => void>()

export const getExportBackground = (): ExportBackground => current
export function setExportBackground(mode: ExportBackground): void {
  if (mode === current) return
  current = mode
  listeners.forEach((fn) => fn())
}
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export function useExportBackground(): [ExportBackground, (mode: ExportBackground) => void] {
  return [useSyncExternalStore(subscribe, getExportBackground), setExportBackground]
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
/** Time for charts to notice a theme change and redraw. */
async function settle(): Promise<void> {
  await frame()
  await frame()
  await wait(250)
  await frame()
}

/**
 * Runs `job` with the fill to draw behind the image (null: none). For white and transparent in the dark theme the app is shown in its
 * light theme while `job` runs. `themeFill` is the background to use when the choice is Match theme.
 */
export async function withExportBackground<T>(mode: ExportBackground, themeFill: string, job: (fill: string | null) => Promise<T>): Promise<T> {
  if (mode === 'theme') return job(themeFill)
  const fill = mode === 'white' ? '#ffffff' : null
  const root = document.documentElement
  if (!root.classList.contains('dark')) return job(fill)

  const style = getComputedStyle(document.body)
  const cover = document.createElement('div')
  cover.setAttribute('data-export-skip', '')
  cover.setAttribute('role', 'status')
  cover.textContent = 'Preparing image…'
  cover.style.cssText = `position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;font:14px system-ui,sans-serif;background:${style.backgroundColor};color:${style.color}`
  document.body.appendChild(cover)
  root.classList.remove('dark')
  try {
    await settle()
    return await job(fill)
  } finally {
    root.classList.add('dark')
    await frame()
    await frame()
    cover.remove()
  }
}
