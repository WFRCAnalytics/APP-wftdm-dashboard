// Fetch + parse dashboard-*.yaml / summarize.yaml / manifest.yaml at
// runtime — never baked in at build time (constitution Principle IV). See
// specs/001-data-state-layer/contracts/yaml-loader.md.
import { load as parseYAML } from 'js-yaml'

export interface DashboardConfig {
  raw: unknown
  sourcePath: string
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
    raw = parseYAML(text)
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
 * Discovers the dashboard set at runtime via public/dashboard-config/
 * index.json — the same pattern scenarioDiscovery.ts uses for
 * public/scenarios/index.json. No hardcoded filename list or count.
 * @param baseUrl defaults to the app's own served base path
 */
export async function loadDashboards(
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<DashboardConfig[]> {
  const indexUrl = `${baseUrl}dashboard-config/index.json`
  let filenames: string[]
  try {
    const res = await fetch(indexUrl)
    if (!res.ok) return []
    filenames = (await res.json()) as string[]
  } catch {
    return []
  }

  const configs: DashboardConfig[] = []
  for (const filename of filenames) {
    try {
      configs.push(await loadConfig(`${baseUrl}dashboard-config/${filename}`))
    } catch {
      // Fail-soft per file — mirrors scenario-discovery.md's pattern.
    }
  }
  return configs
}
