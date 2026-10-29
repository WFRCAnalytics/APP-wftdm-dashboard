// Loads the site settings: `dashboard-config.yaml` of each config root (the deployment's own, then the demo's fallback), through
// the pure schema in src/config. A wrong value is reported and keeps its default; nothing here throws.
import { load } from 'js-yaml'

import { getPath, overlay, toBranding, validate, type ConfigProblem, type Tree } from '@/config'
import { addProblems } from '@/state/configProblems'
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

/** The site-level keys the old `index.json` carried; finding one there means a deployment that has not moved. */
const LEGACY_KEYS = ['dashboards', 'title', 'logoUrl', 'logoUrlDark', 'markUrl', 'markUrlDark', 'scenarioPalette', 'primaryColor', 'protomapsPmtilesUrl', 'protomapsApiKey', 'vocab', 'metrics', 'units', 'years', 'compare', 'layout', 'export', 'assistant']

/** Looks for a leftover `index.json` of settings in a root that has no dashboard-config.yaml. Only runs on that path. */
async function probeLegacy(baseUrl: string): Promise<ConfigProblem | undefined> {
  try {
    const res = await fetch(`${baseUrl}index.json`)
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return undefined
    const json: unknown = await res.json()
    const found = json && typeof json === 'object' && !Array.isArray(json) ? LEGACY_KEYS.filter((k) => k in (json as object)) : []
    if (found.length === 0) return undefined
    return { file: `${baseUrl}index.json`, path: '', kind: 'moved', message: `site settings (${found.join(', ')}) now live in ${SITE_CONFIG_FILE}; this file is no longer read` }
  } catch {
    return undefined
  }
}

export interface Site {
  /** The settings in the shape the app reads. */
  branding: DashboardBranding
  /** The merged site-level settings tree, the broadest level of the cascade. */
  settings: Tree
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
  if (!primary.found) {
    const legacy = await probeLegacy(primary.baseUrl)
    if (legacy) problems.push(legacy)
    else if (!demo.found) problems.push({ file: SITE_CONFIG_FILE, path: '', kind: 'missing_file', message: 'no site configuration was found; showing defaults' })
  }
  addProblems(problems)
  const settings = overlay(demo.settings, primary.settings)
  return {
    branding: toBranding(settings),
    settings,
    pageSources: [primary, demo].map((r) => ({ baseUrl: r.baseUrl, pages: r.pages })),
    problems,
  }
}
