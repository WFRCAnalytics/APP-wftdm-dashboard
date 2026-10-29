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

// US2: the note and the limits, with the gateway mocked as a scripted model.
interface ChatRequest {
  messages: { role: string; content: string | null }[]
}

async function mockModel(page: Page, queue: ({ sql: string } | { text: string })[]): Promise<ChatRequest[]> {
  const requests: ChatRequest[] = []
  let id = 0
  await page.route(`${GATEWAY}/**`, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'llama3.1' }] }) })
    requests.push(req.postDataJSON())
    const next = queue.shift() ?? { text: '(script exhausted)' }
    const message =
      'sql' in next
        ? { content: null, tool_calls: [{ id: `call${++id}`, type: 'function', function: { name: 'run_sql', arguments: JSON.stringify({ sql: next.sql }) } }] }
        : { content: next.text }
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ choices: [{ message }] }) })
  })
  return requests
}

async function connectAndAsk(page: Page, question: string, opts: { shareResults?: boolean } = {}) {
  await openAiSettings(page)
  await page.locator('#ai-token').fill('viewer-token')
  await page.getByRole('button', { name: 'Check and Save' }).click()
  await expect(page.getByTestId('ai-status')).toHaveText('Connected.')
  if (opts.shareResults) await page.getByRole('group', { name: 'Privacy' }).getByRole('button', { name: 'Schema + results', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open AI assistant' }).click()
  const panel = page.getByRole('dialog', { name: 'AI assistant' })
  await expect(panel).toBeVisible()
  await panel.getByLabel('Ask a question').fill(question)
  await panel.getByRole('button', { name: 'Send' }).click()
  return panel
}

const withGateway = (extra: Record<string, unknown>) => ({ providers: [{ id: 'agency-gw', label: 'Agency gateway', base_url: GATEWAY, models: ['llama3.1'] }], ...extra })

test.describe('the assistant note and limits', () => {
  test('the privacy help shows the configured number of shared rows', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = withGateway({ limits: { model_rows: 20 } })
    })
    await boot(page)
    await openAiSettings(page)
    await page.getByRole('group', { name: 'Privacy' }).getByRole('button', { name: 'Schema + results', exact: true }).click()
    await expect(page.getByText('up to 20 result rows per query')).toBeVisible()
  })

  test('the model gets the note and 20 rows, the viewer sees 100 rows, and the note is never shown', async ({ page }) => {
    const requests = await mockModel(page, [{ sql: 'SELECT * FROM range(500)' }, { text: 'Counted them.' }])
    await patchDemoConfig(page, (c) => {
      c.assistant = withGateway({ prompt_addendum: 'NOTE-FOR-THE-MODEL: our zones are called TAZs.', limits: { preview_rows: 100, model_rows: 20 } })
    })
    await boot(page)
    const panel = await connectAndAsk(page, 'How many numbers are there?', { shareResults: true })
    await expect(panel.getByText('Counted them.')).toBeVisible({ timeout: 30_000 })
    await expect(panel.getByText('Showing the first 100 rows; more exist.')).toBeVisible()
    expect(requests).toHaveLength(2)
    const system = requests[0].messages[0].content ?? ''
    expect(system.endsWith('LOCAL CONTEXT (from the dashboard\'s deployer):\nNOTE-FOR-THE-MODEL: our zones are called TAZs.')).toBe(true)
    const tool = requests[1].messages.find((m) => m.role === 'tool')
    const shared = JSON.parse(tool?.content ?? '{}') as { rows?: unknown[] }
    expect(shared.rows).toHaveLength(20)
    expect(await page.locator('body').innerText()).not.toContain('NOTE-FOR-THE-MODEL')
  })

  test('a question stops after the configured number of steps', async ({ page }) => {
    const requests = await mockModel(page, Array.from({ length: 10 }, () => ({ sql: 'SELECT 1' })))
    await patchDemoConfig(page, (c) => {
      c.assistant = withGateway({ limits: { round_trips: 2 } })
    })
    await boot(page)
    const panel = await connectAndAsk(page, 'Keep going.')
    await expect(panel.getByText(/more steps than the assistant allows/)).toBeVisible({ timeout: 30_000 })
    expect(requests).toHaveLength(2)
  })

  test('with no note and no limits the behaviour is today\'s: 50 shared rows and no local context', async ({ page }) => {
    const requests = await mockModel(page, [{ sql: 'SELECT * FROM range(500)' }, { text: 'Done.' }])
    await patchDemoConfig(page, (c) => {
      c.assistant = withGateway({})
    })
    await boot(page)
    const panel = await connectAndAsk(page, 'Count.', { shareResults: true })
    await expect(panel.getByText('Done.')).toBeVisible({ timeout: 30_000 })
    expect(requests[0].messages[0].content).not.toContain('LOCAL CONTEXT')
    const shared = JSON.parse(requests[1].messages.find((m) => m.role === 'tool')?.content ?? '{}') as { rows?: unknown[] }
    expect(shared.rows).toHaveLength(50)
    await expect(panel.getByText('Showing the first 1,000 rows; more exist.')).toHaveCount(0)
  })
})

// US3: mistakes are reported, never fatal; a secret-like field is refused and its value shown nowhere.
test.describe('mistakes in the assistant block', () => {
  const SENTINEL = 'SECRET-SENTINEL-98765'
  const paths = (page: Page) => page.getByTestId('config-notice').locator('[data-problem-path]').evaluateAll((els) => els.map((e) => e.getAttribute('data-problem-path')))

  test('each mistake is listed with its path, the app loads, the good provider works and the defaults hold', async ({ page }) => {
    const logs: string[] = []
    page.on('console', (m) => logs.push(m.text()))
    await patchDemoConfig(page, (c) => {
      c.assistant = {
        api_key: SENTINEL,
        providers: [
          { id: 'good', label: 'Good gateway', base_url: GATEWAY, models: ['llama3.1'], token: SENTINEL },
          { id: 'good', base_url: 'https://other.example.org' },
          { id: 'odd', base_url: 'https://odd.example.org', protocol: 'soap' },
        ],
        default: { provider: 'not-offered' },
        limits: { round_trips: 99 },
        prompt_addendum: 'x'.repeat(2001),
      }
    })
    await boot(page)
    await expect(page.getByTestId('config-notice')).toBeVisible()
    const listed = await paths(page)
    for (const expected of ['assistant.api_key', 'assistant.providers', 'assistant.default.provider', 'assistant.limits.round_trips', 'assistant.prompt_addendum']) {
      expect(listed, expected).toContain(expected)
    }
    expect(await page.getByTestId('config-notice').innerText()).toContain('secrets are not configuration')
    // the value of a secret-like field is in neither the page nor the console
    expect(await page.locator('body').innerText()).not.toContain(SENTINEL)
    expect(logs.join('\n')).not.toContain(SENTINEL)
    // the good provider is the only one offered, and the bad settings fell back to their defaults
    await openAiSettings(page)
    await expect(providerButtons(page)).toHaveText(['Good gateway'])
    await page.getByRole('group', { name: 'Privacy' }).getByRole('button', { name: 'Schema + results', exact: true }).click()
    await expect(page.getByText('up to 50 result rows per query')).toBeVisible()
  })

  test('with no usable provider the built-ins stay and the problem is reported', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = { providers: [{ id: 'x' }, { base_url: 'https://x.example.org' }] }
    })
    await boot(page)
    await expect(page.getByTestId('config-notice')).toContainText('built-in providers are used')
    await openAiSettings(page)
    await expect(providerButtons(page)).toHaveText(['OpenAI', 'Anthropic', 'Deepseek', 'Demo (offline)', 'Ollama'])
    await expect(page.locator('#ai-base-url')).toBeEditable()
  })

  test('an empty provider list is reported, and assistant.enabled false is still the way to turn it off', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = { providers: [] }
    })
    await boot(page)
    await expect(page.getByTestId('config-notice')).toContainText('provider list is empty')
    await expect(page.getByTestId('assistant-button')).toBeVisible()
  })

  test('with the assistant off the other keys are still checked but nothing is shown', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = { enabled: false, limits: { model_rows: 9999 } }
    })
    await boot(page)
    await expect(page.getByTestId('config-notice')).toContainText('assistant.limits.model_rows')
    await expect(page.getByTestId('assistant-button')).toHaveCount(0)
  })

  test('a clean block shows no note', async ({ page }) => {
    await patchDemoConfig(page, (c) => {
      c.assistant = withGateway({ default: { provider: 'agency-gw', model: 'llama3.1' }, limits: { round_trips: 4 }, prompt_addendum: 'Short and plain.' })
    })
    await boot(page)
    await expect(page.getByTestId('assistant-button')).toBeVisible()
    await expect(page.getByTestId('config-notice')).toHaveCount(0)
  })
})
