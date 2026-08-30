// Fetch + parse dashboard-*.yaml / summarize.yaml / manifest.yaml at
// runtime — never baked in at build time (constitution Principle IV). See
// specs/001-data-state-layer/contracts/yaml-loader.md.
import { load as parseYAML } from 'js-yaml'

/**
 * @typedef {{ raw: any, sourcePath: string }} DashboardConfig
 */

/**
 * Fetches `url` at call time and parses it with js-yaml.
 * @param {string} url
 * @returns {Promise<DashboardConfig>}
 */
export async function loadConfig(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`loadConfig: ${url} -> ${res.status}`)
  }
  const text = await res.text()
  let raw
  try {
    raw = parseYAML(text)
  } catch (err) {
    throw new Error(`loadConfig: malformed YAML at ${url}: ${err.message}`)
  }
  return { raw, sourcePath: url }
}

/**
 * Same mechanics as loadConfig — distinct export only for call-site clarity
 * (manifest.yaml vs. dashboard-*.yaml/summarize.yaml).
 * @param {string} url
 * @returns {Promise<DashboardConfig>}
 */
export async function loadManifest(url) {
  return loadConfig(url)
}

/**
 * Discovers the dashboard set at runtime via public/dashboard-config/
 * index.json — the same pattern scenarioDiscovery.js uses for
 * public/scenarios/index.json. No hardcoded filename list or count.
 * @param {string} [baseUrl] defaults to the app's own served base path
 * @returns {Promise<DashboardConfig[]>}
 */
export async function loadDashboards(baseUrl = import.meta.env.BASE_URL) {
  const indexUrl = `${baseUrl}dashboard-config/index.json`
  let filenames
  try {
    const res = await fetch(indexUrl)
    if (!res.ok) return []
    filenames = await res.json()
  } catch {
    return []
  }

  const configs = []
  for (const filename of filenames) {
    try {
      configs.push(await loadConfig(`${baseUrl}dashboard-config/${filename}`))
    } catch {
      // Fail-soft per file — mirrors scenario-discovery.md's pattern.
    }
  }
  return configs
}
