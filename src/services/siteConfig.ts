// Loads the site settings: `dashboard-config.yaml` of each config root (the deployment's own, then, only when the demo is on, the demo's fallback), through
// the pure schema in src/config. A wrong value is reported and keeps its default; nothing here throws.
import { load } from 'js-yaml'

import { checkDefault, getPath, overlay, toBranding, validate, type ConfigProblem, type Tree } from '@/config'
import { DEMO_CONTENT } from '@/services/demoContent'
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
  /** Page files to load, per root, in display order (the deployment's first, then the demo's when the demo is on). */
  pageSources: { baseUrl: string; pages: string[] }[]
  /** 070: whether the deployment's own site file was found, and the folder that was searched (for the first-run screen). */
  siteFound: boolean
  searched: string
  problems: ConfigProblem[]
}

/**
 * The deployment's root and, only when the demo is on (070: the dev server and `--mode demo` builds), the demo's, merged: per setting the
 * deployment's own value wins and the demo's is the fallback. The page lists are not merged but concatenated, deployment first.
 * Without a demo URL there is no fallback at all: a deployment is neutral by default.
 */
export async function loadSite(
  deploymentUrl: string = `${import.meta.env.BASE_URL}dashboard-config/`,
  demoUrl: string | undefined = DEMO_CONTENT ? `${import.meta.env.BASE_URL}demo-dashboard-config/` : undefined,
): Promise<Site> {
  const noDemo: SiteRoot = { baseUrl: '', found: false, settings: {}, pages: [], problems: [] }
  const [primary, demo] = await Promise.all([loadSiteRoot(deploymentUrl), demoUrl ? loadSiteRoot(demoUrl) : Promise.resolve(noDemo)])
  const problems = [...primary.problems, ...demo.problems]
  if (!primary.found) {
    const legacy = await probeLegacy(primary.baseUrl)
    if (legacy) problems.push(legacy)
    else if (!demo.found) problems.push({ file: SITE_CONFIG_FILE, path: '', kind: 'missing_file', message: 'no site configuration was found' })
  }
  const settings = overlay(demo.settings, primary.settings)
  // the default provider must be one that is offered (a check across two settings, so after the roots are merged)
  for (const message of checkDefault(settings)) {
    problems.push({ file: SITE_CONFIG_FILE, path: 'assistant.default.provider', kind: 'invalid_value', message })
  }
  addProblems(problems)
  return {
    branding: toBranding(settings),
    settings,
    pageSources: [primary, demo].filter((r) => r.baseUrl !== '').map((r) => ({ baseUrl: r.baseUrl, pages: r.pages })),
    siteFound: primary.found || demo.found,
    searched: primary.baseUrl,
    problems,
  }
}
