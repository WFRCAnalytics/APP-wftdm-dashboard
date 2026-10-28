import { test, expect, type Page, type Route } from '@playwright/test'
import { patchDemoConfig } from './_siteConfig'
import { DEMO_SCRIPT } from '../../src/services/ai/demoScript'

// 064-ai-chat-assistant: Settings -> Assistant, the chat panel, query permissions and privacy, against the real demo data. The
// provider is mocked with page.route (no network, no key): a scripted queue of model replies, and a record of every
// request body so the privacy tests can inspect what would have left the browser. Runs on the `real` project.

const V1 = 'https://api.openai.com/v1'
const MODE_SHARE = 'activitysim-baseline__trip_mode_share'
const OTHER = 'activitysim-density-variant__trip_mode_share'

type Reply = { text?: string; tool?: { name: string; args: unknown } }

interface Provider {
  requests: { messages: { role: string; content: string | null }[] }[]
  queue: Reply[]
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

async function mockProvider(page: Page, opts: { goodToken?: string } = {}): Promise<Provider> {
  const provider: Provider = { requests: [], queue: [] }
  let callId = 0
  await page.route(`${V1}/**`, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const auth = req.headers().authorization ?? ''
    if (opts.goodToken && auth !== `Bearer ${opts.goodToken}`) {
      return route.fulfill({ status: 401, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { message: 'bad key' } }) })
    }
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{}' })
    provider.requests.push(req.postDataJSON())
    const next = provider.queue.shift() ?? { text: '(script exhausted)' }
    const message = next.tool
      ? {
          content: null,
          tool_calls: [{ id: `call${++callId}`, type: 'function', function: { name: next.tool.name, arguments: JSON.stringify(next.tool.args) } }],
        }
      : { content: next.text }
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ choices: [{ message }] }) })
  })
  return provider
}

const sql = (s: string): Reply => ({ tool: { name: 'run_sql', args: { sql: s } } })
const describe = (...names: string[]): Reply => ({ tool: { name: 'describe_tables', args: { names } } })
const say = (text: string): Reply => ({ text })

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Connecting to DuckDB'), null, { timeout: 60_000 })
  await page.waitForFunction(
    () => (window as unknown as { __wftdm?: { appState: { get(n: string): { status: string; availableMetrics?: string[] } | undefined } } }).__wftdm?.appState.get('activitysim-baseline')?.availableMetrics?.length,
    null,
    { timeout: 30_000 },
  )
}

async function openAiSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Assistant' }).click()
}

async function connect(page: Page, token = 'sk-test') {
  await openAiSettings(page)
  await page.locator('#ai-token').fill(token)
  await page.getByRole('button', { name: 'Check and Save' }).click()
  await expect(page.getByTestId('ai-status')).toHaveText('Connected.')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tab', { name: 'Assistant' })).toHaveCount(0)
}

const group = (page: Page, label: string) => page.getByRole('group', { name: label })

async function setPermission(page: Page, mode: 'Read-Only' | 'Modify') {
  await openAiSettings(page)
  await group(page, 'Query permissions').getByRole('button', { name: mode, exact: true }).click()
  await page.keyboard.press('Escape')
}

async function openChat(page: Page) {
  const panel = page.getByRole('dialog', { name: 'AI assistant' })
  if (!(await panel.isVisible())) await page.getByRole('button', { name: 'Open AI assistant' }).click()
  await expect(panel).toBeVisible()
  return panel
}

async function ask(page: Page, question: string) {
  const panel = await openChat(page)
  await panel.getByLabel('Ask a question').fill(question)
  await panel.getByRole('button', { name: 'Send' }).click()
  return panel
}

test.describe('AI assistant', () => {
  test('a launcher is on the page; with no provider the panel offers set-up and opens Settings -> Assistant', async ({ page }) => {
    await boot(page)
    const panel = await openChat(page)
    await expect(panel.getByTestId('ai-unconfigured')).toBeVisible()
    await panel.getByRole('button', { name: 'Set up the AI assistant' }).click()
    await expect(page.getByRole('tab', { name: 'Assistant', selected: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check and Save' })).toBeVisible()
    // defaults: Read-Only, Schema only
    await expect(group(page, 'Query permissions').getByRole('button', { name: 'Read-Only', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(group(page, 'Privacy').getByRole('button', { name: 'Schema only', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('Check and Save rejects a wrong token, accepts a good one, and nothing is stored in the browser', async ({ page }) => {
    await mockProvider(page, { goodToken: 'sk-good' })
    await boot(page)
    await openAiSettings(page)
    await page.locator('#ai-token').fill('sk-wrong')
    await page.getByRole('button', { name: 'Check and Save' }).click()
    await expect(page.getByTestId('ai-status')).toHaveText('The provider rejected the token.')
    await page.locator('#ai-token').fill('sk-good')
    await page.getByRole('button', { name: 'Check and Save' }).click()
    await expect(page.getByTestId('ai-status')).toHaveText('Connected.')
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])

    // a reload forgets the token and the connection
    await page.reload()
    await boot(page)
    const panel = await openChat(page)
    await expect(panel.getByTestId('ai-unconfigured')).toBeVisible()
  })

  test('answers from one table: shows the SQL, the result table and the answer; survives a tab switch and close/reopen', async ({ page }) => {
    const provider = await mockProvider(page)
    await boot(page)
    await connect(page)
    provider.queue.push(describe(MODE_SHARE), sql(`SELECT count(*) AS n FROM "${MODE_SHARE}"`), say('There is one table row count shown above.'))
    const panel = await ask(page, 'How many rows does the mode share table have?')

    await expect(panel.getByTestId('ai-answer').getByText('There is one table row count shown above.')).toBeVisible({ timeout: 30_000 })
    await expect(panel.getByTestId('ai-sql')).toContainText(`SELECT count(*) AS n FROM "${MODE_SHARE}"`)
    await expect(panel.getByTestId('ai-result-table')).toBeVisible()
    await expect(panel.getByTestId('ai-attempt-outcome')).toHaveText('Ran')

    // the catalogue (names only) was in the system prompt of the first request
    const system = provider.requests[0].messages[0].content ?? ''
    expect(system).toContain(MODE_SHARE.split('__')[0])
    expect(system).toContain('trip_mode_share')

    // switch page section, close and reopen: the conversation is still there
    await page.getByRole('tablist', { name: 'Page sections' }).getByRole('tab').nth(1).click()
    await expect(panel.getByText('There is one table row count shown above.')).toBeVisible()
    await panel.getByRole('button', { name: 'Close AI assistant' }).click()
    await expect(page.getByRole('dialog', { name: 'AI assistant' })).toHaveCount(0)
    const reopened = await openChat(page)
    await expect(reopened.getByText('There is one table row count shown above.')).toBeVisible()
    await expect(reopened.getByText('How many rows does the mode share table have?')).toBeVisible()

    await reopened.getByRole('button', { name: 'Clear conversation' }).click()
    await expect(reopened.getByTestId('ai-answer')).toHaveCount(0)
  })

  test('answers by joining two scenarios\' tables', async ({ page }) => {
    const provider = await mockProvider(page)
    await boot(page)
    await connect(page)
    provider.queue.push(
      sql(`SELECT a.n AS baseline_rows, b.n AS density_rows FROM (SELECT count(*) AS n FROM "${MODE_SHARE}") a CROSS JOIN (SELECT count(*) AS n FROM "${OTHER}") b`),
      say('Both scenarios were read.'),
    )
    const panel = await ask(page, 'Compare the row counts of baseline and density variant')
    await expect(panel.getByText('Both scenarios were read.')).toBeVisible({ timeout: 30_000 })
    await expect(panel.getByTestId('ai-attempt-outcome')).toHaveText('Ran')
    const table = panel.getByTestId('ai-result-table')
    await expect(table.getByRole('columnheader', { name: 'baseline_rows' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'density_rows' })).toBeVisible()
  })

  test('a failing query is shown, fed back to the model and retried', async ({ page }) => {
    const provider = await mockProvider(page)
    await boot(page)
    await connect(page)
    provider.queue.push(sql('SELECT nope FROM "does_not_exist"'), sql(`SELECT count(*) AS n FROM "${MODE_SHARE}"`), say('Fixed it.'))
    const panel = await ask(page, 'count rows')
    await expect(panel.getByText('Fixed it.')).toBeVisible({ timeout: 30_000 })
    await expect(panel.getByTestId('ai-attempt-outcome')).toHaveText(['Error', 'Ran'])
    // the second request carried the first query's error back to the model
    const toolMsg = provider.requests[1].messages.find((m) => m.role === 'tool')
    expect(toolMsg?.content).toContain('"ok":false')
  })

  test('Read-Only refuses writes and extensions, and nothing runs', async ({ page }) => {
    const provider = await mockProvider(page)
    await boot(page)
    await connect(page)
    provider.queue.push(sql(`DROP VIEW "${MODE_SHARE}"`), sql('INSTALL spatial'), say('I was not allowed to.'))
    const panel = await ask(page, 'drop the mode share view')
    await expect(panel.getByText('I was not allowed to.')).toBeVisible({ timeout: 30_000 })
    await expect(panel.getByTestId('ai-attempt-outcome')).toHaveText(['Refused', 'Refused'])
    await expect(panel.getByTestId('ai-attempt-reason').first()).toContainText('Read-Only')
    // the view still exists
    provider.queue.push(sql(`SELECT count(*) AS n FROM "${MODE_SHARE}"`), say('Still there.'))
    await panel.getByLabel('Ask a question').fill('is it still there?')
    await panel.getByRole('button', { name: 'Send' }).click()
    await expect(panel.getByText('Still there.')).toBeVisible({ timeout: 30_000 })
  })

  test('Modify: creates a session table, protects dashboard views, and Reset session data removes the table', async ({ page }) => {
    const provider = await mockProvider(page)
    await boot(page)
    await connect(page)
    await setPermission(page, 'Modify')
    provider.queue.push(
      sql(`CREATE TEMP TABLE ai_helper AS SELECT count(*) AS n FROM "${MODE_SHARE}"`),
      sql('SELECT * FROM ai_helper'),
      sql(`DROP VIEW "${MODE_SHARE}"`),
      sql('INSTALL httpfs'),
      say('Done.'),
    )
    const panel = await ask(page, 'save a helper table')
    await expect(panel.getByText('Done.')).toBeVisible({ timeout: 30_000 })
    await expect(panel.getByTestId('ai-permission-badge')).toHaveText('Modify')
    await expect(panel.getByTestId('ai-attempt-outcome')).toHaveText(['Ran', 'Ran', 'Refused', 'Refused'])
    await expect(panel.getByTestId('ai-attempt-reason').first()).toContainText('dashboard')

    // Reset removes the helper but leaves the dashboard views
    await openAiSettings(page)
    await page.getByRole('button', { name: 'Reset session data' }).click()
    await expect(page.getByText(/Removed 1 table/)).toBeVisible()
    await page.keyboard.press('Escape')
    provider.queue.push(sql('SELECT * FROM ai_helper'), sql(`SELECT count(*) AS n FROM "${MODE_SHARE}"`), say('Checked.'))
    await panel.getByLabel('Ask a question').fill('is the helper gone?')
    await panel.getByRole('button', { name: 'Send' }).click()
    await expect(panel.getByText('Checked.')).toBeVisible({ timeout: 30_000 })
    // earlier attempts (Ran, Ran, Refused, Refused), then the helper is gone (Error) while the dashboard view is intact (Ran)
    await expect(panel.getByTestId('ai-attempt-outcome')).toHaveText(['Ran', 'Ran', 'Refused', 'Refused', 'Error', 'Ran'])
  })

  test('Schema only sends no result values; Schema and results sends rows (at most 50)', async ({ page }) => {
    const provider = await mockProvider(page)
    await boot(page)
    await connect(page)
    const q = `SELECT 'SECRET-VALUE-' || i AS v FROM range(200) t(i)`

    provider.queue.push(sql(q), say('Schema only answer.'))
    const panel = await ask(page, 'give me values')
    await expect(panel.getByText('Schema only answer.')).toBeVisible({ timeout: 30_000 })
    // the viewer sees the values...
    await expect(panel.getByTestId('ai-result-table')).toContainText('SECRET-VALUE-0')
    // ...but no tool result sent to the provider contained one (the model's own SQL text is its own, not result data)
    const toolResults = provider.requests.flatMap((r) => r.messages.filter((m) => m.role === 'tool').map((m) => m.content))
    expect(toolResults.length).toBeGreaterThan(0)
    expect(JSON.stringify(toolResults)).not.toContain('SECRET-VALUE')

    await openAiSettings(page)
    await group(page, 'Privacy').getByRole('button', { name: 'Schema + results', exact: true }).click()
    await page.keyboard.press('Escape')
    provider.requests.length = 0
    provider.queue.push(sql(q), say('With results answer.'))
    await panel.getByLabel('Ask a question').fill('again, with values')
    await panel.getByRole('button', { name: 'Send' }).click()
    await expect(panel.getByText('With results answer.')).toBeVisible({ timeout: 30_000 })
    const toolMsg = provider.requests[1].messages.filter((m) => m.role === 'tool').pop()
    const body = JSON.parse(toolMsg?.content ?? '{}') as { rows: unknown[][] }
    expect(body.rows.length).toBe(50)
    expect(JSON.stringify(body.rows)).toContain('SECRET-VALUE-0')
  })

  test('Stop ends a run and the page keeps working', async ({ page }) => {
    await mockProvider(page)
    // hold the model reply so the run is still going when Stop is pressed
    await page.route(`${V1}/chat/completions`, async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 60_000))
      await route.fallback()
    })
    await boot(page)
    await connect(page)
    const panel = await ask(page, 'this will hang')
    await panel.getByRole('button', { name: 'Stop' }).click()
    await expect(panel.getByText('Stopped.')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible()
  })

  test('the Assistant button is a brand-filled circle beside the control bar, the size of the Compare button', async ({ page }) => {
    await boot(page)
    const bar = page.getByTestId('control-bar')
    const button = page.getByTestId('assistant-button')
    await expect(button).toBeVisible()
    await page.waitForTimeout(600) // the control bar eases in (scale), so measure after it settles
    const [b, c, cmp] = [await bar.boundingBox(), await button.boundingBox(), await page.getByTestId('control-compare').boundingBox()]
    expect(c!.x).toBeGreaterThan(b!.x + b!.width - 1)
    // a circle as tall as the Compare button, centred on the bar
    expect(Math.abs(c!.width - c!.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(c!.height - cmp!.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(c!.y + c!.height / 2 - (b!.y + b!.height / 2))).toBeLessThanOrEqual(1.5)
    // no border or outline offsetting the fill from the edge
    await expect(button).toHaveCSS('border-top-width', '0px')
  })

  test('the model field suggests presets, filters as you type, and accepts a custom model', async ({ page }) => {
    await boot(page)
    await openAiSettings(page)
    const model = page.locator('#ai-model')
    await model.click()
    const list = page.getByRole('listbox', { name: /model suggestions/i })
    await expect(list.getByRole('option')).toHaveCount(7)
    await model.fill('mini')
    await expect(list.getByRole('option')).toHaveText(['gpt-4.1-mini', 'gpt-4o-mini', 'o4-mini'])
    await list.getByRole('option', { name: 'gpt-4o-mini' }).click()
    await expect(model).toHaveValue('gpt-4o-mini')
    // keyboard: arrows and Enter
    await model.fill('4.1-n')
    await model.press('ArrowDown')
    await model.press('Enter')
    await expect(model).toHaveValue('gpt-4.1-nano')
    // a model that is not a preset is kept as typed
    await model.fill('my-gateway/custom-model')
    await expect(list).toHaveCount(0)
    await expect(model).toHaveValue('my-gateway/custom-model')
    // each provider has its own list
    await page.getByRole('group', { name: 'Provider' }).getByRole('button', { name: 'Anthropic' }).click()
    await model.click()
    await expect(page.getByRole('listbox', { name: /model suggestions/i }).getByRole('option').first()).toHaveText('claude-sonnet-5-5')
  })

  test('a deployment can switch the assistant off: no button, no panel, no Settings tab', async ({ page }) => {
    await patchDemoConfig(page, (config) => {
      config.assistant = { enabled: false }
    })
    await boot(page)
    await expect(page.getByTestId('assistant-button')).toHaveCount(0)
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('tab', { name: 'Appearance' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Assistant' })).toHaveCount(0)
  })

  test('the offline Demo provider (Try the demo button): the question is pre-filled, replies are scripted, the user only presses Send', async ({ page }) => {
    await boot(page)
    let panel = await openChat(page)
    await panel.getByTestId('ai-try-demo').click()
    const box = panel.getByLabel('Ask a question')
    await expect(panel.getByTestId('ai-demo-note')).toBeVisible()
    await expect(box).toHaveValue('Which scenario has the highest transit share?')
    await expect(box).toHaveJSProperty('readOnly', true)

    // every scripted question runs for real: nine succeed with a result table, the last is refused by the guard
    const questions = DEMO_SCRIPT.map((s) => s.question)
    expect(questions).toHaveLength(10)
    for (let i = 0; i < questions.length; i++) {
      await expect(box).toHaveValue(questions[i])
      await panel.getByRole('button', { name: 'Send' }).click()
      await expect(panel.getByText(DEMO_SCRIPT[i].answer.slice(0, 40))).toBeVisible({ timeout: 30_000 })
      const outcome = panel.getByTestId('ai-attempt-outcome').last()
      if (i < questions.length - 1) {
        await expect(outcome).toHaveText('Ran')
        const table = panel.getByTestId('ai-result-table').last()
        await expect(table).toBeVisible()
        // the live query returns the expected first row (and the expected row count)
        const expected = DEMO_SCRIPT[i].result!
        await expect(table.getByRole('row').nth(1).getByRole('cell').first()).toHaveText(String(expected.rows[0][0]))
        await expect(table.getByRole('row')).toHaveCount(expected.rows.length + 1)
      } else {
        await expect(outcome).toHaveText('Refused')
      }
    }
    // the first answer's table is the three-scenario comparison
    await expect(panel.getByTestId('ai-result-table').first().getByRole('columnheader', { name: 'transit_share' })).toBeVisible()
    await expect(panel.getByTestId('ai-result-table').first().getByRole('row')).toHaveCount(4)

    // the script cycles
    await expect(box).toHaveValue(questions[0])

    // leaving the demo returns to the not-set-up state
    await panel.getByRole('button', { name: 'Exit demo' }).click()
    await expect(panel.getByTestId('ai-unconfigured')).toBeVisible()
    panel = await openChat(page)
  })
})
