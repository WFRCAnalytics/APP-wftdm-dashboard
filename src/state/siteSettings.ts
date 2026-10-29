// The merged site-level settings tree (dashboard-config.yaml), the broadest level of the cascade (src/config/resolve.ts).
// Set once at boot; read where a page or panel resolves a setting that cascades. Plain in-memory module state.
import { getPath, type Tree } from '@/config'

let site: Tree = {}

export function setSiteSettings(tree: Tree): void {
  site = tree
}

export function getSiteSettings(): Tree {
  return site
}

/** `basemap.default` of the site, when set. */
export function getSiteBasemapDefault(): string | undefined {
  const v = getPath(site, 'basemap.default')
  return typeof v === 'string' && v.trim() ? v : undefined
}
