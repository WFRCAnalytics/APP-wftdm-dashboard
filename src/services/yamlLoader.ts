// Fetch + parse dashboard-*.yaml / summarize.yaml / manifest.yaml at
// runtime — never baked in at build time (constitution Principle IV). See
// specs/001-data-state-layer/contracts/yaml-loader.md.
import { load as parseYAML } from 'js-yaml'

export interface DashboardConfig {
  raw: unknown
  sourcePath: string
}

/**
 * Parses `text` as YAML, throwing an error naming `sourceLabel` on
 * failure. Factored out of loadConfig (009-scenario-manager research.md
 * §4) so scenario/manifestReader.ts's handle-based reading path can share
 * the same parse-with-context behavior instead of duplicating it.
 */
export function parseYAMLText(text: string, sourceLabel: string): unknown {
  try {
    return parseYAML(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`parseYAMLText: malformed YAML at ${sourceLabel}: ${message}`)
  }
}

/**
 * Fetches `url` at call time and parses it with js-yaml.
 */
export async function loadConfig(url: string): Promise<DashboardConfig> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`loadConfig: ${url} -> ${res.status}`)
  }
  const text = await res.text()
  let raw: unknown
  try {
    raw = parseYAMLText(text, url)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`loadConfig: malformed YAML at ${url}: ${message}`)
  }
  return { raw, sourcePath: url }
}

/**
 * Same mechanics as loadConfig — distinct export only for call-site clarity
 * (manifest.yaml vs. dashboard-*.yaml/summarize.yaml).
 */
export async function loadManifest(url: string): Promise<DashboardConfig> {
  return loadConfig(url)
}

// dashboard-config/index.json's real shape on disk, either form: a bare
// array of filenames (every real deployment/fixture that predates
// deployer-configurable branding — confirmed via direct read of every
// current index.json under public/ and tests/fixtures/, all bare arrays
// today), or an object naming the SAME filename list under `dashboards`
// plus optional app-wide branding fields. `loadDashboards()` below and
// `loadDashboardBranding()` each read their own half of this from the
// SAME parsed JSON shape independently — this is deliberately NOT a new
// config FILE (constitution Principle VII's "exactly three config file
// types" is about authored dashboard-CONTENT config; index.json is
// already documented, in both CLAUDE.md and scenarioDiscovery.ts's own
// public/scenarios/index.json precedent, as discovery metadata, not one
// of those three types) — just a richer shape for a discovery file that
// already existed, matching the same file this app already fetches at
// boot regardless.
type DashboardIndexJson = string[] | { dashboards: string[]; title?: unknown; logoUrl?: unknown; logoUrlDark?: unknown }

/**
 * Deployer-configurable app-wide branding — a real, minimal mechanism for
 * setting a dashboard title and logo without touching this app's own
 * source or rebuilding anything (matching this app's own "everything real
 * is discovered/fetched at runtime" discipline — a deployer's own
 * `public/dashboard-config/index.json`, not a TypeScript constant baked
 * into this repo's source, since the actual DEPLOYER of a fresh
 * `wftdm-dashboard init` scaffold is a planner running a CLI, not a JS
 * developer editing `src/`). All three fields are optional — an absent
 * `logoUrl` renders no image at all (never a broken-image icon); an
 * absent `title` sets neither the header's fallback text nor the browser
 * tab title. `logoUrlDark` is a SEPARATE, optional field, not a boolean
 * flag paired with one URL — confirmed directly against the real WFRC
 * logo assets this app wires in by default (see
 * public/demo-dashboard-config/index.json) that a single logo image does
 * NOT work across both themes: the real horizontal-color PNG is dark
 * navy text on a transparent background (illegible against this app's
 * own dark-mode header), and the real horizontal-white PNG is the
 * inverse (illegible in light mode) — the same light/dark-pair
 * convention this codebase already uses elsewhere for exactly this class
 * of problem (e.g. PlotlyPanel.tsx's own FALLBACK_FOREGROUND/
 * FALLBACK_BORDER).
 */
export interface DashboardBranding {
  title?: string
  logoUrl?: string
  logoUrlDark?: string
}

function isDashboardIndexObject(
  parsed: DashboardIndexJson,
): parsed is Exclude<DashboardIndexJson, string[]> {
  return !Array.isArray(parsed)
}

/**
 * Discovers the dashboard set at runtime via a `dashboard-config/`-style
 * directory's own index.json — the same pattern scenarioDiscovery.ts uses
 * for public/scenarios/index.json. No hardcoded filename list or count.
 *
 * `baseUrl` is the full directory URL to read FROM (trailing slash),
 * defaulting to the app's own `public/dashboard-config/`. This is a real,
 * confirmed bug fix, found while wiring 028-dashboard-branding's own demo
 * root through this same function: an earlier version of this function
 * hardcoded a literal `dashboard-config/` path SEGMENT onto whatever
 * `baseUrl` it was given, correct only for the app's own base path itself
 * (`import.meta.env.BASE_URL`) — main.tsx's second, 026-activitysim-demo-
 * content-added call already passed the FULL directory
 * (`${BASE_URL}demo-dashboard-config/`) as `baseUrl`, so that hardcoded
 * segment doubled it into a nonexistent
 * `demo-dashboard-config/dashboard-config/index.json` path, silently
 * 404ing (this function's own existing fail-soft `if (!res.ok) return []`)
 * and rendering zero demo dashboard tabs in every real, non-test run since
 * 026 shipped — invisible to this project's own Playwright suite only
 * because tests/global-setup.js deliberately blanks
 * public/demo-dashboard-config/index.json to `[]` for every test run,
 * which produces the identical empty result whether or not the path
 * itself is even correct. Confirmed via direct, live reproduction against
 * a plain `vite` dev server (not the fixture-populated Playwright harness)
 * before fixing.
 * @param baseUrl defaults to the app's own served dashboard-config/ path
 */
export async function loadDashboards(
  baseUrl: string = `${import.meta.env.BASE_URL}dashboard-config/`,
): Promise<DashboardConfig[]> {
  const indexUrl = `${baseUrl}index.json`
  let filenames: string[]
  try {
    const res = await fetch(indexUrl)
    if (!res.ok) return []
    const parsed = (await res.json()) as DashboardIndexJson
    filenames = (isDashboardIndexObject(parsed) ? parsed.dashboards : parsed) ?? []
  } catch {
    return []
  }

  const configs: DashboardConfig[] = []
  for (const filename of filenames) {
    try {
      configs.push(await loadConfig(`${baseUrl}${filename}`))
    } catch {
      // Fail-soft per file — mirrors scenario-discovery.md's pattern.
    }
  }
  return configs
}

/**
 * Reads the SAME index.json file loadDashboards() reads, independently —
 * a second, cheap fetch to a tiny, browser-HTTP-cached JSON file, not a
 * shared parse: keeping this fully separate from loadDashboards() means
 * that function's own existing return type/contract/callers need zero
 * changes (no test or call site locks its shape today, confirmed via
 * grep, but there's no reason to couple two genuinely independent
 * concerns — "which tabs exist" vs. "what does the app's own chrome look
 * like" — through one shared return value regardless). A bare-array
 * index.json (every real file that predates this feature) has no
 * branding fields at all — every field below resolves to undefined,
 * which the header renders as cleanly as no branding being configured at
 * all (never a broken image, never an empty gap).
 *
 * `baseUrl` follows loadDashboards()'s own corrected contract — a full
 * directory URL, not the bare app base path (see that function's own doc
 * comment for the real, confirmed doubled-path bug this mirrors and was
 * fixed alongside).
 */
export async function loadDashboardBranding(
  baseUrl: string = `${import.meta.env.BASE_URL}dashboard-config/`,
): Promise<DashboardBranding> {
  const indexUrl = `${baseUrl}index.json`
  try {
    const res = await fetch(indexUrl)
    if (!res.ok) return {}
    const parsed = (await res.json()) as DashboardIndexJson
    if (!isDashboardIndexObject(parsed)) return {}
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl : undefined,
      logoUrlDark: typeof parsed.logoUrlDark === 'string' ? parsed.logoUrlDark : undefined,
    }
  } catch {
    return {}
  }
}
