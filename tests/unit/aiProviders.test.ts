// 064-ai-chat-assistant: provider wire formats, error mapping and token scrubbing (fetch mocked).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkConnection, complete, ProviderError } from '@/services/ai/providers'
import { DEMO_SCRIPT, demoResultFor } from '@/services/ai/demoScript'
import type { ChatTurn, ProviderConfig, ToolSpec } from '@/services/ai/types'

const TOOLS: ToolSpec[] = [{ name: 'run_sql', description: 'run', parameters: { type: 'object', properties: {} } }]
const OPENAI: ProviderConfig = { provider: 'openai', baseUrl: 'https://api.openai.com/v1/', apiKey: 'sk-secret', model: 'gpt-4.1' }
const ANTHROPIC: ProviderConfig = { provider: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'ant-secret', model: 'claude-x' }
const OLLAMA: ProviderConfig = { provider: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'llama3.1' }
const signal = new AbortController().signal

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), ...response }) as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}
const lastCall = (fn: ReturnType<typeof mockFetch>) => {
  const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
  return { url, init, body: init.body ? JSON.parse(init.body as string) : undefined, headers: init.headers as Record<string, string> }
}

afterEach(() => vi.unstubAllGlobals())

const TURNS: ChatTurn[] = [
  { role: 'user', text: 'hi' },
  { role: 'assistant', text: '', toolCalls: [{ id: 'c1', name: 'run_sql', args: { sql: 'select 1' } }, { id: 'c2', name: 'run_sql', args: { sql: 'select 2' } }] },
  { role: 'tool', toolCallId: 'c1', name: 'run_sql', content: '{"ok":true}' },
  { role: 'tool', toolCallId: 'c2', name: 'run_sql', content: '{"ok":true}' },
]

describe('OpenAI-compatible', () => {
  it('posts chat/completions with bearer auth, tools and replayed tool calls', async () => {
    const fn = mockFetch({ json: async () => ({ choices: [{ message: { content: 'done' } }] }) })
    const out = await complete(OPENAI, 'SYS', TURNS, TOOLS, signal)
    const { url, body, headers } = lastCall(fn)
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(headers.Authorization).toBe('Bearer sk-secret')
    expect(body.model).toBe('gpt-4.1')
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' })
    expect(body.messages[2].tool_calls[0]).toEqual({ id: 'c1', type: 'function', function: { name: 'run_sql', arguments: '{"sql":"select 1"}' } })
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' })
    expect(body.tools[0].function.name).toBe('run_sql')
    expect(out).toEqual({ text: 'done', toolCalls: [] })
  })

  it('parses tool calls and tolerates invalid argument JSON', async () => {
    mockFetch({
      json: async () => ({
        choices: [{ message: { content: null, tool_calls: [
          { id: 'a', function: { name: 'run_sql', arguments: '{"sql":"select 1"}' } },
          { id: 'b', function: { name: 'run_sql', arguments: '{oops' } },
        ] } }],
      }),
    })
    const out = await complete(OPENAI, 's', [{ role: 'user', text: 'x' }], TOOLS, signal)
    expect(out.toolCalls[0].args).toEqual({ sql: 'select 1' })
    expect(out.toolCalls[1].args).toEqual({ __invalid: '{oops' })
  })

  it('sends no Authorization header without a key (Ollama)', async () => {
    const fn = mockFetch({ json: async () => ({ choices: [{ message: { content: 'ok' } }] }) })
    await complete(OLLAMA, 's', [{ role: 'user', text: 'x' }], TOOLS, signal)
    expect(lastCall(fn).headers.Authorization).toBeUndefined()
  })
})

describe('Anthropic', () => {
  it('posts /v1/messages with the browser-access headers and merges tool results into one user message', async () => {
    const fn = mockFetch({ json: async () => ({ content: [{ type: 'text', text: 'hello' }, { type: 'tool_use', id: 't1', name: 'run_sql', input: { sql: 'select 1' } }] }) })
    const out = await complete(ANTHROPIC, 'SYS', TURNS, TOOLS, signal)
    const { url, body, headers } = lastCall(fn)
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(headers['x-api-key']).toBe('ant-secret')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(body.system).toBe('SYS')
    expect(body.messages).toHaveLength(3)
    expect(body.messages[2].content.map((b: { tool_use_id: string }) => b.tool_use_id)).toEqual(['c1', 'c2'])
    expect(body.tools[0].input_schema).toBeDefined()
    expect(out).toEqual({ text: 'hello', toolCalls: [{ id: 't1', name: 'run_sql', args: { sql: 'select 1' } }] })
  })

  it('accepts a base URL that already ends in /v1', async () => {
    const fn = mockFetch({ json: async () => ({ content: [] }) })
    await complete({ ...ANTHROPIC, baseUrl: 'https://gw.example/v1' }, 's', [{ role: 'user', text: 'x' }], TOOLS, signal)
    expect(lastCall(fn).url).toBe('https://gw.example/v1/messages')
  })
})

describe('errors', () => {
  const kind = async (cfg: ProviderConfig) => {
    try {
      await complete(cfg, 's', [{ role: 'user', text: 'x' }], TOOLS, signal)
    } catch (e) {
      return e as ProviderError
    }
    throw new Error('did not throw')
  }

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [404, 'model'],
    [500, 'server'],
    [400, 'bad-request'],
  ])('maps HTTP %i to %s', async (status, expected) => {
    mockFetch({ ok: false, status, json: async () => ({ error: { message: 'nope' } }) })
    expect((await kind(OPENAI)).kind).toBe(expected)
  })

  it('maps a fetch TypeError to a network error that mentions OLLAMA_ORIGINS for Ollama', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect((await kind(OLLAMA)).message).toMatch(/OLLAMA_ORIGINS/)
    expect((await kind(OPENAI)).kind).toBe('network')
  })

  it('maps AbortError to abort', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) }))
    expect((await kind(OPENAI)).kind).toBe('abort')
  })

  it('never lets the token through in a message', async () => {
    mockFetch({ ok: false, status: 400, json: async () => ({ error: { message: 'bad key sk-secret here' } }) })
    const e = await kind(OPENAI)
    expect(e.message).not.toContain('sk-secret')
    expect(e.message).toContain('[token]')
  })
})

describe('checkConnection', () => {
  it('OpenAI/Anthropic: looks the model up directly', async () => {
    const fn = mockFetch({})
    expect(await checkConnection(OPENAI)).toEqual({ ok: true })
    expect(lastCall(fn).url).toBe('https://api.openai.com/v1/models/gpt-4.1')
    const fn2 = mockFetch({})
    await checkConnection(ANTHROPIC)
    expect(lastCall(fn2).url).toBe('https://api.anthropic.com/v1/models/claude-x')
  })

  it('reports a rejected token, an unknown model and an unreachable server', async () => {
    mockFetch({ ok: false, status: 401, json: async () => ({}) })
    expect(await checkConnection(OPENAI)).toEqual({ ok: false, message: 'The provider rejected the token.' })
    mockFetch({ ok: false, status: 404, json: async () => ({}) })
    expect(await checkConnection(OPENAI)).toMatchObject({ ok: false, message: expect.stringContaining('gpt-4.1') })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('x') }))
    expect(await checkConnection(OPENAI)).toMatchObject({ ok: false })
  })

  it('Ollama/Deepseek: lists models and matches name or name:tag', async () => {
    mockFetch({ json: async () => ({ data: [{ id: 'llama3.1:latest' }] }) })
    expect(await checkConnection(OLLAMA)).toEqual({ ok: true })
    mockFetch({ json: async () => ({ data: [{ id: 'other' }] }) })
    expect(await checkConnection(OLLAMA)).toMatchObject({ ok: false, message: expect.stringContaining('llama3.1') })
  })
})

describe('demo provider (development)', () => {
  const DEMO: ProviderConfig = { provider: 'demo', baseUrl: 'demo://local', apiKey: '', model: 'scripted' }
  const SYSTEM = '- scenario "base" (x)\n  views are named "base__<metric>"; metrics: trip_mode_share, zones'
  const step = DEMO_SCRIPT[0]

  it('needs no network and always checks out', async () => {
    const fn = vi.fn()
    vi.stubGlobal('fetch', fn)
    expect(await checkConnection(DEMO)).toEqual({ ok: true })
    await complete(DEMO, SYSTEM, [{ role: 'user', text: step.question }], TOOLS, signal)
    expect(fn).not.toHaveBeenCalled()
  })

  it('plays a scripted question as describe_tables, then run_sql, then the fixed answer', async () => {
    const q: ChatTurn = { role: 'user', text: step.question }
    const tool = (name: string): ChatTurn => ({ role: 'tool', toolCallId: 'x', name, content: '{"ok":true}' })
    const first = await complete(DEMO, SYSTEM, [q], TOOLS, signal)
    expect(first.toolCalls[0]).toMatchObject({ name: 'describe_tables', args: { names: step.tables } })
    const second = await complete(DEMO, SYSTEM, [q, tool('describe_tables')], TOOLS, signal)
    expect(second.toolCalls[0]).toMatchObject({ name: 'run_sql', args: { sql: step.sql } })
    const last = await complete(DEMO, SYSTEM, [q, tool('describe_tables'), tool('run_sql')], TOOLS, signal)
    expect(last).toEqual({ text: step.answer, toolCalls: [] })
  })

  it('a later question replays its own steps, not the earlier ones', async () => {
    const turns: ChatTurn[] = [
      { role: 'user', text: DEMO_SCRIPT[0].question },
      { role: 'tool', toolCallId: 'x', name: 'run_sql', content: '{}' },
      { role: 'user', text: DEMO_SCRIPT[1].question },
    ]
    const out = await complete(DEMO, SYSTEM, turns, TOOLS, signal)
    expect(out.toolCalls[0]).toMatchObject({ name: 'describe_tables', args: { names: DEMO_SCRIPT[1].tables } })
  })

  it('every step but the refused one carries its expected result', () => {
    expect(DEMO_SCRIPT).toHaveLength(10)
    for (const s of DEMO_SCRIPT.slice(0, -1)) {
      expect(s.result?.columns.length).toBeGreaterThan(0)
      expect(s.result?.rows.length).toBeGreaterThan(0)
      expect(s.result?.rows.every((r) => r.length === s.result!.columns.length)).toBe(true)
      expect(demoResultFor(s.sql)).toBe(s.result)
    }
    expect(DEMO_SCRIPT[DEMO_SCRIPT.length - 1].result).toBeUndefined()
    expect(demoResultFor('SELECT 1')).toBeUndefined()
  })
})
