// Loads the site settings: `dashboard-config.yaml` of each config root (the deployment's own, then the demo's fallback), through
// the pure schema in src/config. A wrong value is reported and keeps its default; nothing here throws.
import { load } from 'js-yaml'

import { getPath, overlay, toBranding, validate, type ConfigProblem, type Tree } from '@/config'
import type { DashboardBranding } from '@/services/yamlLoader'

export const SITE_CONFIG_FILE = 'dashboard-config.yaml'

export interface SiteRoot {
  baseUrl: string
  /** False when the file is absent (the normal state of a root that is not in use). */
  found: boolean
  settings: Tree
  pages: string[]
  problems: ConfigProblem[]
}

/** Fetches and checks one root's dashboard-config.yaml. */
export async function loadSiteRoot(baseUrl: string): Promise<SiteRoot> {
  const url = `${baseUrl}${SITE_CONFIG_FILE}`
  const absent: SiteRoot = { baseUrl, found: false, settings: {}, pages: [], problems: [] }
  let text: string
  try {
    const res = await fetch(url)
    // a dev server answers an unknown path with its index page: that is "not there", not a config
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return absent
    text = await res.text()
  } catch {
    return absent
  }
  let raw: unknown
  try {
    raw = load(text)
  } catch (err) {
    const e = err as { reason?: string; mark?: { line?: number } }
    const line = typeof e.mark?.line === 'number' ? e.mark.line + 1 : undefined
    return { ...absent, found: true, problems: [{ file: SITE_CONFIG_FILE, path: '', kind: 'syntax', message: `invalid YAML: ${e.reason ?? String(err)}`, line }] }
  }
  const { settings, problems } = validate(raw, { file: `${baseUrl}${SITE_CONFIG_FILE}` })
  const pages = getPath(settings, 'pages')
  return { baseUrl, found: true, settings, pages: Array.isArray(pages) ? (pages as string[]) : [], problems }
}

export interface Site {
  /** The settings in the shape the app reads. */
  branding: DashboardBranding
  /** Page files to load, per root, in display order (the deployment's first, then the demo's). */
  pageSources: { baseUrl: string; pages: string[] }[]
  problems: ConfigProblem[]
}

/**
 * Both roots, merged: per setting the deployment's own value wins and the demo's is the fallback (the same precedence the
 * index.json branding had). The page lists are not merged but concatenated, deployment first, as before.
 */
export async function loadSite(
  deploymentUrl: string = `${import.meta.env.BASE_URL}dashboard-config/`,
  demoUrl: string = `${import.meta.env.BASE_URL}demo-dashboard-config/`,
): Promise<Site> {
  const [primary, demo] = await Promise.all([loadSiteRoot(deploymentUrl), loadSiteRoot(demoUrl)])
  const problems = [...primary.problems, ...demo.problems]
  if (!primary.found && !demo.found) {
    problems.push({ file: SITE_CONFIG_FILE, path: '', kind: 'missing_file', message: 'no site configuration was found; showing defaults' })
  }
  for (const p of problems) console.warn(`dashboard-config: ${p.file}${p.path ? ` › ${p.path}` : ''}: ${p.message}${p.line ? ` (line ${p.line})` : ''}`)
  return {
    branding: toBranding(overlay(demo.settings, primary.settings)),
    pageSources: [primary, demo].map((r) => ({ baseUrl: r.baseUrl, pages: r.pages })),
    problems,
  }
}
