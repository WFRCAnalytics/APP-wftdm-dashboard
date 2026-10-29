// Fetch + parse dashboard-*.yaml / summarize.yaml / manifest.yaml at
// runtime — never baked in at build time (constitution Principle IV). See
// specs/001-data-state-layer/contracts/yaml-loader.md.
import { load as parseYAML } from 'js-yaml'

import { pageSettings, validate } from '@/config'
import { addProblems } from '@/state/configProblems'

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

/**
 * Deployer-configurable app-wide branding — a real, minimal mechanism for
 * setting a dashboard title and logo without touching this app's own
 * source or rebuilding anything (matching this app's own "everything real
 * is discovered/fetched at runtime" discipline — a deployer's own
 * `public/dashboard-config/dashboard-config.yaml`, not a TypeScript constant baked
 * into this repo's source, since the actual DEPLOYER of a fresh
 * `wftdm-dashboard init` scaffold is a planner running a CLI, not a JS
 * developer editing `src/`). All three fields are optional — an absent
 * `logoUrl` renders no image at all (never a broken-image icon); an
 * absent `title` sets neither the header's fallback text nor the browser
 * tab title. `logoUrlDark` is a SEPARATE, optional field, not a boolean
 * flag paired with one URL — confirmed directly against the real WFRC
 * logo assets this app wires in by default (see
 * public/demo-dashboard-config/dashboard-config.yaml) that a single logo image does
 * NOT work across both themes: the real horizontal-color PNG is dark
 * navy text on a transparent background (illegible against this app's
 * own dark-mode header), and the real horizontal-white PNG is the
 * inverse (illegible in light mode) — the same light/dark-pair
 * convention this codebase already uses elsewhere for exactly this class
 * of problem (e.g. the retired chart panel's own FALLBACK_FOREGROUND/
 * FALLBACK_BORDER).
 */
export interface DashboardBranding {
  title?: string
  /** The full logo, shown when the navigation is expanded (a wide, horizontal logo suits it). */
  logoUrl?: string
  logoUrlDark?: string
  /** The abbreviated logo, shown when the navigation is collapsed to its icon rail. Same light/dark-pair convention as
   * `logoUrl`/`logoUrlDark`. Absent -> the app's generic mark. Both are plain URLs the deployer supplies in
   * `dashboard-config.yaml`; nothing about any one organisation is built into the app. */
  markUrl?: string
  markUrlDark?: string
  /** 036-scenario-color-picker: an optional deployer-configured default
   * categorical palette for scenario colors — a list of CSS color
   * strings, cycled by each scenario's registration-order position when
   * no viewer colorOverride is set. Same discovery/precedence rules as
   * the three fields above (the real deployment root wins over the
   * git-tracked demo root, per-field). NOT validated here — this stays a
   * thin, format-only parse matching this interface's own existing
   * convention; semantic validation (is each entry a real CSS color)
   * happens once, in main.tsx, where the resolved value is actually
   * consumed (specs/036-scenario-color-picker/research.md §3). */
  scenarioPalette?: string[]
  /** 041-protomaps-pmtiles-basemap: the deployer-level default PMTiles
   * source shared by all 5 Protomaps basemap flavors (contracts/
   * deployer-config.md). Either a path relative to this app's own
   * deployed assets or a full https:// URL — both forms behave
   * identically (FR-004), since this stays a thin, format-only parse
   * (matching every other field on this interface) and both are just
   * strings to state/protomapsSourceState.ts's getEffectiveProtomapsSource()
   * and panels/basemap/protomapsStyle.ts's buildProtomapsStyle().
   * Absent -> no deployer default; the Basemap tab's Protomaps section is
   * "not configured" unless `protomapsApiKey` below is set instead. There
   * is no viewer-facing override for either field — only a deployer can
   * configure a Protomaps source (a later, deliberate revision of this
   * feature's own original FR-006/FR-007, which offered a viewer-entered
   * override; removed because a client-supplied URL had no way to be
   * vetted, whereas a deployer's own config is already trusted). MUST
   * NEVER default to a Protomaps-hosted daily-build URL used WITHOUT a
   * key (that specific free bucket forbids hotlinking) — this field is
   * simply left undefined when a deployer hasn't prepared their own
   * extract; there is no fallback URL here to omit. */
  protomapsPmtilesUrl?: string
  /** The deployer's own Protomaps hosted-API key (protomaps.com/api-keys)
   * — an alternative to `protomapsPmtilesUrl` above that needs no
   * self-hosted extract at all: every Protomaps flavor resolves against
   * `api.protomaps.com`'s live tile service directly, so it works
   * automatically for any zone geometry a viewer loads, anywhere, with no
   * region/bbox to prepare. Checked FIRST, ahead of `protomapsPmtilesUrl`,
   * in main.tsx's precedence (a deployer would set one or the other, not
   * both). This key is NOT a secret once configured here — it ships in
   * this app's own public, served config, visible to any viewer who
   * inspects it — the real protection is Protomaps' own server-side
   * Origin/Referer allowlist (set per-key in their Account portal), the
   * same public-but-origin-restricted-token pattern every browser map SDK
   * (Mapbox GL JS, Google Maps JS) already uses for its own client key.
   * Never commit a key here that isn't already restricted to this
   * deployment's real origin(s). */
  protomapsApiKey?: string
  /** 064-ai-chat-assistant: `assistant: { enabled: false }` in dashboard-config.yaml turns the AI assistant off for
   * this deployment (no header button, no Settings tab). Absent or anything else -> enabled. */
  assistantEnabled?: boolean
  /** `docs.url` / `docs.label`: the documentation site and the text of the sidebar link to it (none when no address). */
  docsUrl?: string
  docsLabel?: string
  /** `settings.tabs`: the Settings window tabs to show, in order, by config name (unset: all five). */
  settingsTabs?: string[]
  /** `assistant:` beyond `enabled` (068): the deployer's providers and defaults (the note and limits join in a later step). */
  assistant?: import('./ai/assistantPolicy.ts').AssistantInput
  /** `network:` (071): which outside calls the app may make (font mode, the basemap allow-list, the extension mirror). Unset keys keep today's behaviour. */
  network?: { fonts?: 'bundled' | 'any'; basemapsAllow?: string[]; duckdbExtensions?: string }
  /** 061-appearance-controls: an optional deployer-configured default for
   * each of the three Primary/Secondary/Accent visual roles — same
   * discovery/precedence rules as every other field above (the real
   * deployment root wins over the git-tracked demo root, per-field). Not
   * validated here — this stays a thin, format-only parse matching this
   * interface's own existing convention; semantic validation (is each
   * entry a real CSS color) happens once, in main.tsx, where the
   * resolved value is actually consumed (mirrors scenarioPalette's own
   * established CSS.supports() check, specs/036-scenario-color-picker/
   * research.md §3). No separate "brand" field exists — these three named
   * roles are the complete set (spec.md's own Assumptions). */
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  /** The interface colour (selected pills, titles, tags, focus rings), separate from the three data colours above. */
  brandColor?: string
  /** 063 redesign (project-docs/redesign/06-data-and-config.md §2): model years, in display order. Absent or empty
   * means a single-year deployment (the Year control is hidden). */
  years?: ModelYear[]
  baseYear?: number
  defaultYear?: number
  /** `compare.default`: 'auto' (on when there are two or more independent scenarios), 'on' or 'off'. */
  compareDefault?: 'auto' | 'on' | 'off'
  /** `compare.scenarios`: the scenario groups compared at first load (default: every loaded one). */
  compareScenarios?: string[]
  /** `compare.focus` / `compare.reference`: the focus scenario group and the reference (a scenario group id or `observed`). */
  compareFocus?: string
  compareReference?: string
  /** `vocab`: this deployment's category labels and the raw data values that map onto them (charts/vocab.ts). */
  vocab?: import('../charts/vocab.ts').VocabConfig
  /** `metrics`: per-metric label/unit/decimals/scale overrides for the scorecard, ranking and trend charts. */
  metrics?: Record<string, import('../charts/lib/metrics.ts').MetricOverride>
  /** `units.trips`: divisor and suffix for trip counts in the time-of-day charts (default thousands, "k"). */
  units?: { trips?: { divisor?: number; suffix?: string }; transit_share_max?: number }
  /** `export.footer`: the line under exported images. `true` (default) = source, scenarios, year and date; a string replaces
   * it; `false` leaves it out. */
  exportFooter?: boolean | string
  /** `layout.mode`: how pages are shown unless the page or the viewer says otherwise (default `scroll`). */
  layout?: { mode?: 'scroll' | 'tabs' }
}

export interface ModelYear {
  year: number
  label?: string
}

/**
 * Loads the page files named by the site configuration (dashboard-config.yaml `pages`), in order, from `baseUrl`. A page
 * that is missing or does not parse is skipped, so the others still load.
 */
export async function loadDashboards(baseUrl: string, pages: readonly string[]): Promise<DashboardConfig[]> {
  const configs: DashboardConfig[] = []
  for (const filename of pages) {
    const file = `${baseUrl}${filename}`
    try {
      const config = await loadConfig(file)
      // a site-only setting written on a page is reported and ignored (the page itself still loads)
      addProblems(validate(pageSettings(config.raw), { file, level: 'page' }).problems)
      configs.push(config)
    } catch (err) {
      addProblems([{ file, path: '', kind: 'missing_file', message: `page not loaded: ${err instanceof Error ? err.message : String(err)}` }])
    }
  }
  return configs
}
