// Page layout state (project-docs/redesign/10-toolbar-layout-export-proposal.md section C), session-only module state:
//   - the viewer's choice between scrolling and tabbed pages (overrides the page and the deployment),
//   - the deployment default (`layout.mode` of index.json),
//   - the active tab (section) of each page and the tile picked in a "pick" tab.
import { useSyncExternalStore } from 'react'

import { resolve } from '@/config'
import { buildHash, getCurrentSlug, replaceAddress } from '@/state/routeState'

export type LayoutMode = 'scroll' | 'tabs'
/** What the viewer chose: follow the page and the deployment, or force one mode. */
export type ViewerLayout = 'default' | LayoutMode

let viewer: ViewerLayout = 'default'
// a shared link can ask for a mode: ?layout=tabs or ?layout=scroll
try {
  const asked = new URLSearchParams(window.location.search).get('layout')
  if (asked === 'tabs' || asked === 'scroll') viewer = asked
} catch {
  // no window (unit tests)
}
let deployment: LayoutMode | undefined
const active = new Map<string, string>()
const picked = new Map<string, string>()
const subscribers = new Set<() => void>()
let version = 0

function emit() {
  version++
  for (const fn of subscribers) fn()
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function configureLayout(opts: { mode?: unknown } | undefined): void {
  deployment = opts?.mode === 'tabs' || opts?.mode === 'scroll' ? opts.mode : undefined
  emit()
}

export function getViewerLayout(): ViewerLayout {
  return viewer
}

export function setViewerLayout(mode: ViewerLayout): void {
  if (viewer === mode) return
  viewer = mode
  emit()
}

/** viewer choice > the cascade: the page's `layout_mode` over the site's `layout.mode` > scroll. */
export function resolveLayoutMode(pageMode: unknown): LayoutMode {
  if (viewer !== 'default') return viewer
  const valid = (m: unknown) => (m === 'tabs' || m === 'scroll' ? m : undefined)
  const { values } = resolve({ site: { layout: { mode: deployment } }, page: { layout: { mode: valid(pageMode) } } })
  return valid((values.layout as { mode?: unknown } | undefined)?.mode) ?? 'scroll'
}

export function getActiveSection(page: string): string | undefined {
  return active.get(page)
}

export function setActiveSection(page: string, id: string): void {
  if (active.get(page) === id) return
  active.set(page, id)
  // the tab in use is part of the address, so a link opens it
  const slug = getCurrentSlug()
  replaceAddress(slug ? buildHash(slug, id) : `#${id}`)
  emit()
}

export function getPickedTile(sectionKey: string): string | undefined {
  return picked.get(sectionKey)
}

export function setPickedTile(sectionKey: string, id: string): void {
  if (picked.get(sectionKey) === id) return
  picked.set(sectionKey, id)
  emit()
}

/** Re-renders when anything above changes; the returned number is only a change counter. */
export function useLayoutVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}
