// 064-ai-chat-assistant: the provider clients. Plain fetch, no SDK. One OpenAI-compatible client (OpenAI, Deepseek,
// Ollama, any gateway) and one Anthropic Messages client. Non-streaming; the agent loop shows step status instead.
// Wire formats: specs/064-ai-chat-assistant/contracts/provider-wire.md.
import { demoStepFor } from './demoScript.ts'
import type { ChatTurn, Completion, ProviderConfig, ToolCall, ToolSpec } from './types.ts'

export type ProviderErrorKind = 'auth' | 'rate-limit' | 'model' | 'network' | 'server' | 'abort' | 'bad-request'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  constructor(kind: ProviderErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/** The token must never reach the screen, a log or a message, whatever the provider echoes back. */
function scrub(text: string, key: string): string {
  return key ? text.split(key).join('[token]') : text
}

function trimUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function headersFor(cfg: ProviderConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.provider === 'anthropic') {
    h['x-api-key'] = cfg.apiKey
    h['anthropic-version'] = '2023-06-01'
    // Required for a browser to call the Anthropic API directly.
    h['anthropic-dangerous-direct-browser-access'] = 'true'
  } else if (cfg.apiKey) {
    h.Authorization = `Bearer ${cfg.apiKey}`
  }
  return h
}

function anthropicBase(cfg: ProviderConfig): string {
  return trimUrl(cfg.baseUrl).replace(/\/v1$/, '')
}

async function send(cfg: ProviderConfig, url: string, init: RequestInit): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: headersFor(cfg) })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ProviderError('abort', 'Stopped.')
    throw new ProviderError(
      'network',
      cfg.provider === 'ollama'
        ? 'Could not reach Ollama. Check the address, and allow this page\'s origin with the OLLAMA_ORIGINS setting.'
        : 'Could not reach the server. Check the address, or use a gateway if the provider blocks browser requests.',
    )
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string } | string; message?: string }
      detail = typeof body.error === 'string' ? body.error : (body.error?.message ?? body.message ?? '')
    } catch {
      /* body is not JSON */
    }
    detail = scrub(detail, cfg.apiKey)
    if (res.status === 401 || res.status === 403) throw new ProviderError('auth', 'The provider rejected the token.')
    if (res.status === 429) throw new ProviderError('rate-limit', 'Rate limit reached; try again shortly.')
    if (res.status === 404) throw new ProviderError('model', detail || `Not found (404). Check the model name and address.`)
    if (res.status >= 500) throw new ProviderError('server', `The provider had an error (${res.status}).`)
    throw new ProviderError('bad-request', detail ? `The provider refused the request: ${detail}` : `The provider refused the request (${res.status}).`)
  }
  try {
    return await res.json()
  } catch {
    throw new ProviderError('server', 'The provider returned an unreadable response.')
  }
}

/** Arguments that were not valid JSON come back as { __invalid } so the loop can tell the model, not crash. */
function parseArgs(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? {}
  try {
    return raw.trim() ? JSON.parse(raw) : {}
  } catch {
    return { __invalid: raw }
  }
}

// --- OpenAI-compatible -------------------------------------------------------------------------------------------

function openAiMessages(system: string, turns: ChatTurn[]): unknown[] {
  const out: unknown[] = [{ role: 'system', content: system }]
  for (const t of turns) {
    if (t.role === 'user') out.push({ role: 'user', content: t.text })
    else if (t.role === 'tool') out.push({ role: 'tool', tool_call_id: t.toolCallId, content: t.content })
    else {
      out.push({
        role: 'assistant',
        content: t.text || null,
        ...(t.toolCalls.length
          ? {
              tool_calls: t.toolCalls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
              })),
            }
          : {}),
      })
    }
  }
  return out
}

async function completeOpenAi(
  cfg: ProviderConfig,
  system: string,
  turns: ChatTurn[],
  tools: ToolSpec[],
  signal: AbortSignal,
): Promise<Completion> {
  const body = {
    model: cfg.model,
    messages: openAiMessages(system, turns),
    tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    tool_choice: 'auto',
    stream: false,
  }
  const json = (await send(cfg, `${trimUrl(cfg.baseUrl)}/chat/completions`, { method: 'POST', body: JSON.stringify(body), signal })) as {
    choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
  }
  const message = json.choices?.[0]?.message
  if (!message) throw new ProviderError('server', 'The provider returned no answer.')
  const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((c) => ({
    id: c.id,
    name: c.function.name,
    args: parseArgs(c.function.arguments),
  }))
  return { text: message.content ?? '', toolCalls }
}

// --- Anthropic ---------------------------------------------------------------------------------------------------

function anthropicMessages(turns: ChatTurn[]): unknown[] {
  const out: { role: 'user' | 'assistant'; content: unknown }[] = []
  for (const t of turns) {
    if (t.role === 'user') out.push({ role: 'user', content: t.text })
    else if (t.role === 'assistant') {
      const blocks: unknown[] = []
      if (t.text) blocks.push({ type: 'text', text: t.text })
      for (const c of t.toolCalls) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args ?? {} })
      out.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '(no text)' }] })
    } else {
      const block = { type: 'tool_result', tool_use_id: t.toolCallId, content: t.content }
      const last = out[out.length - 1]
      // Every result for one assistant turn goes in ONE user message.
      if (last && last.role === 'user' && Array.isArray(last.content)) (last.content as unknown[]).push(block)
      else out.push({ role: 'user', content: [block] })
    }
  }
  return out
}

async function completeAnthropic(
  cfg: ProviderConfig,
  system: string,
  turns: ChatTurn[],
  tools: ToolSpec[],
  signal: AbortSignal,
): Promise<Completion> {
  const body = {
    model: cfg.model,
    max_tokens: 2048,
    system,
    messages: anthropicMessages(turns),
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
  }
  const json = (await send(cfg, `${anthropicBase(cfg)}/v1/messages`, { method: 'POST', body: JSON.stringify(body), signal })) as {
    content?: ({ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown })[]
  }
  if (!json.content) throw new ProviderError('server', 'The provider returned no answer.')
  let text = ''
  const toolCalls: ToolCall[] = []
  for (const block of json.content) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input ?? {} })
  }
  return { text, toolCalls }
}

// --- demo (development) -----------------------------------------------------------------------------------------

/** The scripted Demo provider: no network. A question from demoScript.ts plays its fixed steps (describe the tables,
 * run the SQL, give the fixed answer). Anything else falls back to querying the first view in the catalogue. */
async function completeDemo(system: string, turns: ChatTurn[], signal: AbortSignal): Promise<Completion> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 450)
    signal.addEventListener('abort', () => (clearTimeout(timer), reject(new ProviderError('abort', 'Stopped.'))), { once: true })
  })
  const asked = [...turns].reverse().find((t) => t.role === 'user')
  const step = demoStepFor(asked && asked.role === 'user' ? asked.text : '')
  const sinceQuestion = turns.slice(turns.lastIndexOf(asked as ChatTurn) + 1)
  const toolsDone = sinceQuestion.filter((t) => t.role === 'tool').length

  if (step) {
    if (toolsDone === 0) return { text: '', toolCalls: [{ id: 'demo-desc', name: 'describe_tables', args: { names: step.tables } }] }
    if (toolsDone === 1) return { text: '', toolCalls: [{ id: 'demo-sql', name: 'run_sql', args: { sql: step.sql } }] }
    return { text: step.answer, toolCalls: [] }
  }
  const first = /"([^"]+)__<metric>"; metrics: ([^,\n]+)/.exec(system)
  if (toolsDone > 0) return { text: 'Demo: the query ran; the result is shown above.', toolCalls: [] }
  return first
    ? { text: '', toolCalls: [{ id: 'demo-sql', name: 'run_sql', args: { sql: `SELECT * FROM "${first[1]}__${first[2]}" LIMIT 10` } }] }
    : { text: 'Demo: no scenarios are loaded, so there is nothing to query.', toolCalls: [] }
}

// --- public ------------------------------------------------------------------------------------------------------

/** One model round trip. Throws ProviderError; the message never contains the token. */
export async function complete(
  cfg: ProviderConfig,
  system: string,
  turns: ChatTurn[],
  tools: ToolSpec[],
  signal: AbortSignal,
): Promise<Completion> {
  try {
    if (cfg.provider === 'demo') return await completeDemo(system, turns, signal)
    return cfg.provider === 'anthropic'
      ? await completeAnthropic(cfg, system, turns, tools, signal)
      : await completeOpenAi(cfg, system, turns, tools, signal)
  } catch (e) {
    if (e instanceof ProviderError) throw new ProviderError(e.kind, scrub(e.message, cfg.apiKey))
    throw e
  }
}

/** The Check and Save probe: reaches the server, authenticates, and confirms the model exists. */
export async function checkConnection(
  cfg: ProviderConfig,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (cfg.provider === 'demo') return { ok: true }
  const base = cfg.provider === 'anthropic' ? `${anthropicBase(cfg)}/v1` : trimUrl(cfg.baseUrl)
  const exact = cfg.provider === 'openai' || cfg.provider === 'anthropic'
  try {
    if (exact) {
      await send(cfg, `${base}/models/${encodeURIComponent(cfg.model)}`, { method: 'GET', signal })
      return { ok: true }
    }
    const json = (await send(cfg, `${base}/models`, { method: 'GET', signal })) as { data?: { id: string }[] }
    const ids = (json.data ?? []).map((m) => m.id)
    // Ollama lists "llama3.1:latest" for the model "llama3.1".
    const found = ids.length === 0 || ids.some((id) => id === cfg.model || id.startsWith(`${cfg.model}:`))
    return found ? { ok: true } : { ok: false, message: `Model "${cfg.model}" was not found on this server.` }
  } catch (e) {
    if (e instanceof ProviderError) {
      if (e.kind === 'model' && exact) return { ok: false, message: `Model "${cfg.model}" was not found. Check the model name.` }
      return { ok: false, message: scrub(e.message, cfg.apiKey) }
    }
    return { ok: false, message: 'Unexpected error while checking the connection.' }
  }
}
