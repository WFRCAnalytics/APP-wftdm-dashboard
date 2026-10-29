// The `check` core: reads a site folder (dashboard-config.yaml and the page files it lists) through a reader function and
// reports every problem the app would report, before deploying. Pure apart from the reader, so the app, the command line and
// tests share it. Recognises a file by its role (the site file, a listed page), never by a name pattern.
import { load } from 'js-yaml'

import { slugCollisions } from '../state/routeState'
import { getPath, isTree, type Tree } from './paths'
import { pageSettings } from './levels'
import { checkDefault } from './assistant'
import { checkAllowList, checkDefaultBasemap, hostOf, outsideHosts, type CatalogueEntry } from './network'
import { allHidden } from './pages'
import { resolve } from './resolve'
import { SETTINGS } from './schema'
import { validate, type ConfigProblem } from './validate'

export const SITE_FILE = 'dashboard-config.yaml'

export interface CheckOptions {
  /** Extra check of one panel (the Explore options live outside this folder); returns messages. */
  panelCheck?: (panel: Tree, site: Tree) => string[]
  /** The basemap catalogue (071), so the allow-list can be checked: the ids it knows, the app's own default, and each entry's hosts. */
  network?: { basemapIds: readonly string[]; appDefault: string; catalogue: readonly CatalogueEntry[] }
}

export interface PageReport {
  file: string
  header?: { tab: string; slug?: string }
  /** The settings the page sets (schema paths). */
  settings: Tree
}

export interface CheckReport {
  problems: ConfigProblem[]
  site: Tree
  pages: PageReport[]
  /** Hosts of basemap styles the deployer wrote out in full (a style URL or a composition), with where; listed by `explain` (071). */
  authored: { host: string; where: string }[]
}

function parse(text: string, file: string, problems: ConfigProblem[]): { ok: boolean; raw?: unknown } {
  try {
    return { ok: true, raw: load(text) }
  } catch (err) {
    const e = err as { reason?: string; mark?: { line?: number } }
    problems.push({
      file,
      path: '',
      kind: 'syntax',
      message: `invalid YAML: ${e.reason ?? String(err)}`,
      line: typeof e.mark?.line === 'number' ? e.mark.line + 1 : undefined,
    })
    return { ok: false }
  }
}

/** `read` returns a file's text, or undefined when it is not there. Names are relative to the site folder. */
export function checkSite(read: (file: string) => string | undefined, options: CheckOptions = {}): CheckReport {
  const problems: ConfigProblem[] = []
  const report: CheckReport = { problems, site: {}, pages: [], authored: [] }

  const text = read(SITE_FILE)
  if (text === undefined) {
    problems.push({ file: SITE_FILE, path: '', kind: 'missing_file', message: 'the site configuration is missing' })
    return report
  }
  const parsed = parse(text, SITE_FILE, problems)
  if (!parsed.ok) return report
  const checked = validate(parsed.raw, { file: SITE_FILE })
  problems.push(...checked.problems)
  report.site = checked.settings
  for (const message of checkDefault(checked.settings)) {
    problems.push({ file: SITE_FILE, path: 'assistant.default.provider', kind: 'invalid_value', message })
  }
  const allow = networkAllowList(checked.settings)
  noteAuthored(report, getPath(checked.settings, 'basemap.default'), `${SITE_FILE} basemap.default`)
  const net = options.network
  if (net) {
    for (const message of checkAllowList(allow, net.basemapIds)) problems.push({ file: SITE_FILE, path: 'network.basemaps.allow', kind: 'invalid_value', message })
    const siteDefault = getPath(checked.settings, 'basemap.default')
    const effective = typeof siteDefault === 'string' ? siteDefault : net.appDefault
    const message = checkDefaultBasemap(effective, allow, net.basemapIds)
    if (message) problems.push({ file: SITE_FILE, path: 'basemap.default', kind: 'invalid_value', message: typeof siteDefault === 'string' ? message : `${message} (nothing sets basemap.default, so the app default applies)` })
  }

  const pages = getPath(checked.settings, 'pages')
  const headers: { tab: string; slug?: string }[] = []
  for (const file of Array.isArray(pages) ? (pages as string[]) : []) {
    const body = read(file)
    if (body === undefined) {
      problems.push({ file, path: '', kind: 'missing_file', message: 'listed in pages but not found' })
      continue
    }
    const page = parse(body, file, problems)
    if (!page.ok) continue
    const raw = isTree(page.raw) ? page.raw : {}
    const header = isTree(raw.header) ? raw.header : {}
    for (const key of ['tab', 'title'] as const) {
      if (typeof header[key] !== 'string' || header[key] === '') {
        problems.push({ file, path: `header.${key}`, kind: 'invalid_value', message: `a page needs header.${key}` })
      }
    }
    const settings = pageSettings(raw)
    problems.push(...validate(settings, { file, level: 'page' }).problems)
    const entry: PageReport = {
      file,
      settings,
      header: typeof header.tab === 'string' ? { tab: header.tab, slug: typeof header.slug === 'string' ? header.slug : undefined } : undefined,
    }
    report.pages.push(entry)
    if (getPath(settings, 'header.docs') !== undefined && getPath(checked.settings, 'docs.url') === undefined) {
      problems.push({ file, path: 'header.docs', kind: 'invalid_value', message: 'no documentation address (docs.url) is set in the site file; this path is ignored' })
    }
    if (entry.header) headers.push(entry.header)

    noteAuthored(report, getPath(settings, 'basemap.default'), `${file} basemap.default`)
    if (isTree(raw.layout)) {
      for (const [row, panels] of Object.entries(raw.layout)) {
        for (const [i, panel] of (Array.isArray(panels) ? panels : []).entries()) noteAuthored(report, isTree(panel) ? panel.basemap : undefined, `${file} layout.${row}[${i}].basemap`)
      }
    }
    if (net) {
      const pageDefault = getPath(settings, 'basemap.default')
      const pageMessage = typeof pageDefault === 'string' ? checkDefaultBasemap(pageDefault, allow, net.basemapIds) : undefined
      if (pageMessage) problems.push({ file, path: 'basemap.default', kind: 'invalid_value', message: pageMessage })
      if (isTree(raw.layout)) {
        for (const [row, panels] of Object.entries(raw.layout)) {
          for (const [i, panel] of (Array.isArray(panels) ? panels : []).entries()) {
            const choice = isTree(panel) ? panel.basemap : undefined
            const message = typeof choice === 'string' ? checkDefaultBasemap(choice, allow, net.basemapIds) : undefined
            if (message) problems.push({ file, path: `layout.${row}[${i}].basemap`, kind: 'invalid_value', message })
          }
        }
      }
    }

    if (options.panelCheck && isTree(raw.layout)) {
      for (const [row, panels] of Object.entries(raw.layout)) {
        for (const [i, panel] of (Array.isArray(panels) ? panels : []).entries()) {
          if (!isTree(panel)) continue
          for (const message of options.panelCheck(panel, checked.settings)) {
            problems.push({ file, path: `layout.${row}[${i}]`, kind: 'invalid_value', message })
          }
        }
      }
    }
  }
  if (allHidden(report.pages.map((p) => ({ hidden: getPath(p.settings, 'header.hidden') === true })))) {
    problems.push({ file: SITE_FILE, path: 'pages', kind: 'invalid_value', message: 'every page is hidden (header.hidden); the app lists all of them instead' })
  }
  for (const c of slugCollisions(headers)) {
    problems.push({
      file: SITE_FILE,
      path: 'pages',
      kind: 'duplicate',
      message: `page "${c.tab}" has the same address "${c.slug}" as an earlier page; the app would use "${c.used}"`,
    })
  }
  return report
}

/** The `network.basemaps.allow` list of a validated site tree (text entries only), or undefined. */
function networkAllowList(settings: Tree): string[] | undefined {
  const v = getPath(settings, 'network.basemaps.allow')
  return Array.isArray(v) ? v.filter((e): e is string => typeof e === 'string') : undefined
}

/** Records the hosts of a basemap the deployer wrote out in full: a style URL, or each URL of a `layers` composition. Catalogue names have none. */
function noteAuthored(report: CheckReport, choice: unknown, where: string): void {
  const urls = typeof choice === 'string' ? [choice] : isTree(choice) && Array.isArray(choice.layers) ? choice.layers.filter((l): l is string => typeof l === 'string') : []
  for (const url of urls) {
    const host = /^https?:\/\//i.test(url.trim()) ? hostOf(url) : undefined
    if (host) report.authored.push({ host, where: `a style written in ${where}` })
  }
}

/** Each cascading setting that is set somewhere, as `path = value (level)`, per page; with a catalogue, also the outside hosts still reachable (071). */
export function explain(report: CheckReport, options: { catalogue?: readonly CatalogueEntry[] } = {}): string[] {
  const lines: string[] = []
  for (const page of report.pages) {
    const { values, source } = resolve({ site: report.site, page: page.settings })
    lines.push(page.file)
    for (const row of SETTINGS.filter((r) => r.cascade)) {
      const v = getPath(values, row.path)
      if (v === undefined) continue
      const from = source[row.path] === 'page' ? `page: ${page.file}` : source[row.path]
      lines.push(`  ${row.path} = ${JSON.stringify(v)} (${from})`)
    }
  }
  if (options.catalogue) {
    const fonts = getPath(report.site, 'network.fonts')
    const address = getPath(report.site, 'network.duckdb_extensions')
    const hosts = outsideHosts({
      fonts: fonts === 'bundled' ? 'bundled' : 'any',
      extensionAddress: typeof address === 'string' ? address : undefined,
      patterns: networkAllowList(report.site),
      catalogue: options.catalogue,
      authored: report.authored,
    })
    lines.push(...formatOutsideHosts(hosts))
  }
  return lines
}

/** The outside-hosts block of `check --explain`: information, never a problem. */
export function formatOutsideHosts(hosts: readonly { host: string; why: string }[]): string[] {
  if (hosts.length === 0) return ['no outside host is known']
  const width = Math.max(...hosts.map((h) => h.host.length))
  return ['outside hosts this configuration can still reach:', ...hosts.map((h) => `  ${h.host.padEnd(width)}  ${h.why}`)]
}

export function formatProblem(p: ConfigProblem): string {
  return `${p.file}${p.path ? ` › ${p.path}` : ''}: ${p.message}${p.line ? ` (line ${p.line})` : ''}`
}
