import { expect, test, type Page, type Route } from '@playwright/test'

import { patchDemoConfig } from './_siteConfig'

// 068: the assistant block of dashboard-config.yaml: a deployer's provider list (replacing the built-ins, with a fixed address),
// the default provider and model. The gateway is mocked with page.route (no network, no key); a second route records any request
// that goes to the public providers, which must be none when a list is in force.

const GATEWAY = 'https://llm.agency.example/v1'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

interface Seen {
  url: string
  headers: Record<string, string>
}

async function mockGateway(page: Page, base: string, seen: Seen[]) {
  await page.route(`${base}/**`, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    seen.push({ url: req.url(), headers: req.headers() })
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'llama3.1' }] }) })
  })
}

/** Every request to a public provider is recorded: a locked-down site must make none. */
async function watchPublic(page: Page): Promise<string[]> {
  const hits: string[] = []
  for (const host of ['https://api.openai.com', 'https://api.anthropic.com', 'https://api.deepseek.com', 'http://localhost:11434']) {
    await page.route(`${host}/**`, async (route) => {
      hits.push(route.request().url())
      await route.fulfill({ status: 500, headers: CORS, body: '{}' })
    })
  }
  return hits
}

async function boot(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
}

async function openAiSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Assistant' }).click()
  await expect(page.getByRole('group', { name: 'Provider' })).toBeVisible()
}

const providerButtons = (page: Page) => page.getByRole('group', { name: 'Provider' }).getByRole('button')
const gatewayConfig = (extra: Record<string, unknown> = {}) => ({
  providers: [
    { id: 'agency-gw', label: 'Agency gateway', base_url: GATEWAY, models: ['llama3.1', 'qwen3'] },
    { id: 'second', label: 'Second', base_url: 'https://second.agency.example/v1', needs_key: false },
  ],
  ...extra,
})

test.describe('with no provider list', () => {
  test('the assistant tab is as it always was: the built-in providers and an editable address', async ({ page }) => {
    await boot(page)
    await openAiSettings(page)
    await expect(providerButtons(page)).toHaveText(['OpenAI', 'Anthropic', 'Deepseek', 'Demo (offline)', 'Ollama'])
    const address = page.locator('#ai-base-url')
    await expect(address).toHaveValue('https://api.openai.com/v1')
    await expect(address).toBeEditable()
    await expect(page.locator('#ai-token')).toBeVisible()
    await expect(page.getByTestId('config-notice')).toHaveCount(0)
  })
})

test.describe('with a deployer provider list', () => {
  test('only the listed providers are offered, in order, and none of the built-ins', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = gatewayConfig()
    })
    await boot(page)
    await openAiSettings(page)
    await expect(providerButtons(page)).toHaveText(['Agency gateway', 'Second'])
    await expect(page.getByRole('button', { name: 'OpenAI' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Demo/ })).toHaveCount(0)
  })

  test('the address is shown but cannot be edited; the model picker suggests the listed models and accepts another name', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = gatewayConfig()
    })
    await boot(page)
    await openAiSettings(page)
    const address = page.locator('#ai-base-url')
    await expect(address).toHaveValue(GATEWAY)
    await expect(address).not.toBeEditable()
    await expect(page.getByText('Set by this dashboard’s configuration.')).toBeVisible()
    const model = page.getByRole('combobox', { name: 'Model' })
    await expect(model).toHaveValue('llama3.1')
    await model.click()
    await expect(page.getByRole('option', { name: 'qwen3' })).toBeVisible()
    await model.fill('my-own-model')
    await expect(model).toHaveValue('my-own-model')
  })

  test('a provider that needs no key shows no token field', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = gatewayConfig()
    })
    await boot(page)
    await openAiSettings(page)
    await expect(page.locator('#ai-token')).toBeVisible()
    await providerButtons(page).nth(1).click()
    await expect(page.locator('#ai-token')).toHaveCount(0)
    await expect(page.locator('#ai-base-url')).toHaveValue('https://second.agency.example/v1')
    await expect(page.locator('#ai-base-url')).not.toBeEditable()
  })

  test('the default provider and model are selected when Settings opens', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = gatewayConfig({ default: { provider: 'second', model: 'typed-default' } })
    })
    await boot(page)
    await openAiSettings(page)
    await expect(providerButtons(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('combobox', { name: 'Model' })).toHaveValue('typed-default')
    await expect(page.locator('#ai-base-url')).toHaveValue('https://second.agency.example/v1')
  })

  test('Check and Save talks to the listed gateway with the viewer token, and to nothing else', async ({ page }) => {
    const seen: Seen[] = []
    await mockGateway(page, GATEWAY, seen)
    const publicHits = await watchPublic(page)
    await patchDemoConfig(page, (c) => {
      c.assistant = gatewayConfig()
    })
    await boot(page)
    await openAiSettings(page)
    await page.locator('#ai-token').fill('viewer-token')
    await page.getByRole('button', { name: 'Check and Save' }).click()
    await expect(page.getByTestId('ai-status')).toHaveText('Connected.')
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((s) => s.url.startsWith(`${GATEWAY}/`))).toBe(true)
    expect(seen[0].headers.authorization).toBe('Bearer viewer-token')
    expect(publicHits).toEqual([])
  })

  test('a provider with the anthropic protocol is checked in that format', async ({ page }) => {
    const seen: Seen[] = []
    await mockGateway(page, 'https://claude.agency.example', seen)
    await patchDemoConfig(page, (c) => {
      c.assistant = { providers: [{ id: 'claude-gw', label: 'Claude gateway', base_url: 'https://claude.agency.example', protocol: 'anthropic', models: ['claude-x'] }] }
    })
    await boot(page)
    await openAiSettings(page)
    await page.locator('#ai-token').fill('viewer-token')
    await page.getByRole('button', { name: 'Check and Save' }).click()
    await expect(page.getByTestId('ai-status')).toHaveText('Connected.')
    expect(seen[0].url).toBe('https://claude.agency.example/v1/models/claude-x')
    expect(seen[0].headers['x-api-key']).toBe('viewer-token')
    expect(seen[0].headers.authorization).toBeUndefined()
  })

  test('the chat panel offers no demo when the built-in providers are replaced', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = gatewayConfig()
    })
    await boot(page)
    await page.getByTestId('assistant-button').click()
    await expect(page.getByTestId('ai-unconfigured')).toBeVisible()
    await expect(page.getByTestId('ai-try-demo')).toHaveCount(0)
  })
})
