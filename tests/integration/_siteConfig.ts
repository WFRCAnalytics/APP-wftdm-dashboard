// Route helpers for the site configuration (dashboard-config.yaml). The app reads one such file from the deployment's own root
// (`dashboard-config/`, gitignored and normally absent here) and one from the demo root (`demo-dashboard-config/`, the tracked
// demo). A spec that needs different site settings serves its own; the values use the file's real (snake_case) keys.
import { dump, load } from 'js-yaml'
import type { Page, Route } from '@playwright/test'

const FILE = 'dashboard-config.yaml'
export type SiteConfig = Record<string, unknown>

const yamlBody = (config: SiteConfig) => ({ contentType: 'text/yaml', body: dump(config, { lineWidth: 200 }) })

/** Serves `config` as the deployment root's file; `null` makes the root absent (404), as it normally is. */
export async function routeDeploymentConfig(page: Page, config: SiteConfig | null): Promise<void> {
  await page.route(`**/dashboard-config/${FILE}`, (route) => (config === null ? route.fulfill({ status: 404, body: '' }) : route.fulfill(yamlBody(config))))
}

/** Replaces the demo root's file. */
export async function routeDemoConfig(page: Page, config: SiteConfig): Promise<void> {
  await page.route(`**/demo-dashboard-config/${FILE}`, (route) => route.fulfill(yamlBody(config)))
}

/** Fetches the real demo-root file and lets `edit` change it (in place, or by returning a new object). */
export async function patchDemoConfig(page: Page, edit: (config: SiteConfig) => SiteConfig | void): Promise<void> {
  await page.route(`**/demo-dashboard-config/${FILE}`, async (route: Route) => {
    const response = await route.fetch()
    const config = (load(await response.text()) ?? {}) as SiteConfig
    const edited = edit(config) ?? config
    await route.fulfill({ response, ...yamlBody(edited) })
  })
}
