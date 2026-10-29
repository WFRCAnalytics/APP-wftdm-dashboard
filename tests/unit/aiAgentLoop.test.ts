// 064-ai-chat-assistant: the agent loop (fake provider and dispatcher) and what the model is told about results.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assistantHistoryText, buildSystemPrompt, MAX_ROUND_TRIPS, runAgent, type AgentDeps, type AgentRun } from '@/services/ai/agentLoop'
import { configureAssistant, resetAssistantPolicy } from '@/services/ai/assistantPolicy'
import { MODEL_ROW_LIMIT, shapeForModel } from '@/services/ai/toolSchema'
import type { ChatTurn, Completion, ProviderConfig, QueryAttempt } from '@/services/ai/types'

const CFG: ProviderConfig = { provider: 'openai', baseUrl: 'x', apiKey: 'k', model: 'm' }

function attempt(patch: Partial<QueryAttempt> = {}): QueryAttempt {
  return {
    sql: 'select 1',
    outcome: 'ok',
    columns: [{ name: 'a', type: 'INTEGER' }],
    rows: [[1], [2], [3]],
    truncated: false,
    mode: 'read-only',
    ...patch,
  }
}

function setup(script: Completion[], dispatch?: AgentDeps['dispatch']) {
  const seen: ChatTurn[][] = []
  const complete = vi.fn(async (_c: ProviderConfig, _s: string, turns: ChatTurn[]) => {
    seen.push([...turns])
    const next = script.shift()
    if (!next) throw new Error('script exhausted')
    return next
  })
  const deps: AgentDeps = {
    complete,
    dispatch: dispatch ?? (async (call) => ({ content: JSON.stringify({ ok: true, echoed: call.name }) })),
    catalog: () => 'CATALOG',
  }
  const steps: string[] = []
  const attempts: QueryAttempt[] = []
  const run: AgentRun = {
    question: 'q',
    history: [],
    config: CFG,
    permission: 'read-only',
    privacy: 'schema-only',
    signal: new AbortController().signal,
    onStep: (s) => steps.push(s),
    onAttempt: (a) => attempts.push(a),
  }
  return { deps, run, steps, attempts, complete, seen }
}

const call = (id: string, name: string, args: unknown = {}) => ({ id, name, args })

describe('runAgent', () => {
  it('returns the model text when it calls no tools', async () => {
    const s = setup([{ text: ' Hello ', toolCalls: [] }])
    expect(await runAgent(s.run, s.deps)).toEqual({ text: 'Hello', capped: false })
    expect(s.complete).toHaveBeenCalledTimes(1)
  })

  it('describe_tables then run_sql, feeding each result back, and reports each query attempt', async () => {
    const att = attempt()
    const s = setup(
      [
        { text: '', toolCalls: [call('1', 'describe_tables', { names: ['a__b'] })] },
        { text: '', toolCalls: [call('2', 'run_sql', { sql: 'select 1' })] },
        { text: 'The answer.', toolCalls: [] },
      ],
      async (c) => (c.name === 'run_sql' ? { content: '{"ok":true}', attempt: att } : { content: '{"tables":[]}' }),
    )
    const out = await runAgent(s.run, s.deps)
    expect(out.text).toBe('The answer.')
    expect(s.attempts).toEqual([att])
    const last = s.seen[2]
    expect(last.map((t) => t.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool'])
    expect(s.steps).toEqual(expect.arrayContaining(['Looking up tables', 'Running query']))
  })

  it('lets the model see a SQL error and try again', async () => {
    let n = 0
    const s = setup(
      [
        { text: '', toolCalls: [call('1', 'run_sql', { sql: 'bad' })] },
        { text: '', toolCalls: [call('2', 'run_sql', { sql: 'good' })] },
        { text: 'ok', toolCalls: [] },
      ],
      async () => {
        n++
        return n === 1
          ? { content: '{"ok":false,"error":"Parser Error"}', attempt: attempt({ outcome: 'error', reason: 'Parser Error' }) }
          : { content: '{"ok":true}', attempt: attempt() }
      },
    )
    await runAgent(s.run, s.deps)
    expect(s.attempts.map((a) => a.outcome)).toEqual(['error', 'ok'])
    const toolTurn = s.seen[1].find((t) => t.role === 'tool')
    expect(toolTurn && toolTurn.role === 'tool' && toolTurn.content).toContain('Parser Error')
  })

  it(`stops after ${MAX_ROUND_TRIPS} round trips`, async () => {
    const s = setup(Array.from({ length: 20 }, () => ({ text: '', toolCalls: [call('x', 'run_sql', { sql: 's' })] })))
    const out = await runAgent(s.run, s.deps)
    expect(out.capped).toBe(true)
    expect(s.complete).toHaveBeenCalledTimes(MAX_ROUND_TRIPS)
  })

  it('stops when the signal aborts between tool calls', async () => {
    const ctl = new AbortController()
    const s = setup([{ text: '', toolCalls: [call('1', 'run_sql'), call('2', 'run_sql')] }], async () => {
      ctl.abort()
      return { content: '{}' }
    })
    s.run.signal = ctl.signal
    await expect(runAgent(s.run, s.deps)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('replays earlier turns before the new question', async () => {
    const s = setup([{ text: 'x', toolCalls: [] }])
    s.run.history = [{ role: 'user', text: 'before' }, { role: 'assistant', text: 'earlier answer', toolCalls: [] }]
    await runAgent(s.run, s.deps)
    expect(s.seen[0].map((t) => (t.role === 'tool' ? '' : t.text))).toEqual(['before', 'earlier answer', 'q'])
  })
})

describe('buildSystemPrompt', () => {
  it('carries the catalogue and the mode in plain words', () => {
    const ro = buildSystemPrompt('CATALOG', 'read-only', 'schema-only')
    expect(ro).toContain('CATALOG')
    expect(ro).toMatch(/READ-ONLY/)
    expect(ro).toMatch(/hidden from you/)
    const mod = buildSystemPrompt('CATALOG', 'modify', 'schema-and-results')
    expect(mod).toMatch(/MODIFY/)
    expect(mod).toMatch(/up to 50/)
  })
})

describe('assistantHistoryText', () => {
  it('appends a compact note of the queries run', () => {
    expect(assistantHistoryText('ans', [])).toBe('ans')
    expect(assistantHistoryText('ans', ['select 1'])).toContain('[Queries run: select 1]')
  })
})

describe('shapeForModel (privacy)', () => {
  const big = attempt({ rows: Array.from({ length: 500 }, (_, i) => [`value-${i}`]) })

  it('schema-only: no row values anywhere in what the model gets', () => {
    const json = JSON.stringify(shapeForModel(attempt({ rows: [['secret-1'], ['secret-2']] }), 'schema-only'))
    expect(json).not.toContain('secret')
    expect(json).toContain('"rowCount":2')
    expect(json).toContain('"columns"')
  })

  it('schema-and-results: at most 50 rows', () => {
    const shaped = shapeForModel(big, 'schema-and-results') as { rows: unknown[][]; note?: string }
    expect(shaped.rows.length).toBeLessThanOrEqual(MODEL_ROW_LIMIT)
    expect(shaped.note).toMatch(/Only the first/)
  })

  it('schema-and-results: caps the serialized size', () => {
    const wide = attempt({ rows: Array.from({ length: 50 }, () => ['x'.repeat(2000)]) })
    const shaped = shapeForModel(wide, 'schema-and-results') as { rows: unknown[][] }
    expect(JSON.stringify(shaped.rows).length).toBeLessThanOrEqual(8 * 1024)
  })

  it('reports refusals, errors and cancellations without rows in either mode', () => {
    expect(shapeForModel(attempt({ outcome: 'refused', reason: 'no' }), 'schema-and-results')).toEqual({ ok: false, refused: true, reason: 'no' })
    expect(shapeForModel(attempt({ outcome: 'error', reason: 'boom' }), 'schema-only')).toEqual({ ok: false, error: 'boom' })
    expect(shapeForModel(attempt({ outcome: 'cancelled' }), 'schema-only')).toMatchObject({ ok: false })
  })

  it('says how many rows when the preview was truncated', () => {
    const t = shapeForModel(attempt({ truncated: true, rows: [[1], [2]] }), 'schema-only') as { rowCount: string }
    expect(t.rowCount).toBe('2+')
  })
})

describe('the deployment\'s limits and note (assistant settings)', () => {
  afterEach(() => resetAssistantPolicy())

  it('stops after the configured number of steps and says so', async () => {
    configureAssistant({ limits: { roundTrips: 3 } })
    const s = setup(Array.from({ length: 20 }, () => ({ text: '', toolCalls: [call('x', 'run_sql', { sql: 's' })] })))
    const out = await runAgent(s.run, s.deps)
    expect(out.capped).toBe(true)
    expect(out.text).toContain('more steps than the assistant allows')
    expect(s.complete).toHaveBeenCalledTimes(3)
  })

  it('a higher step limit lets a longer question finish', async () => {
    configureAssistant({ limits: { roundTrips: 9 } })
    const script: Completion[] = [...Array.from({ length: 8 }, () => ({ text: '', toolCalls: [call('x', 'run_sql', { sql: 's' })] })), { text: 'done', toolCalls: [] }]
    const s = setup(script)
    expect(await runAgent(s.run, s.deps)).toEqual({ text: 'done', capped: false })
    expect(s.complete).toHaveBeenCalledTimes(9)
  })

  it('shares at most the configured number of rows with the model and says how many it was told', () => {
    configureAssistant({ limits: { modelRows: 20 } })
    const big = attempt({ rows: Array.from({ length: 500 }, (_, i) => [i]) })
    const shaped = shapeForModel(big, 'schema-and-results') as { rows: unknown[][]; note?: string }
    expect(shaped.rows).toHaveLength(20)
    expect(shaped.note).toContain('first 20 rows')
    expect(buildSystemPrompt('C', 'read-only', 'schema-and-results')).toContain('up to 20 result rows')
  })

  it('does not change what schema-only sends: no values, whatever the row limit', () => {
    configureAssistant({ limits: { modelRows: 200 } })
    expect(JSON.stringify(shapeForModel(attempt({ rows: [['secret-1']] }), 'schema-only'))).not.toContain('secret')
  })

  it('adds the note last, after the built-in instructions, without changing them', () => {
    const plain = buildSystemPrompt('CATALOG', 'read-only', 'schema-only', {})
    configureAssistant({ promptAddendum: 'Our zones are called TAZs.' })
    const withNote = buildSystemPrompt('CATALOG', 'read-only', 'schema-only')
    expect(withNote.startsWith(plain)).toBe(true)
    expect(withNote.endsWith('LOCAL CONTEXT (from the dashboard\'s deployer):\nOur zones are called TAZs.')).toBe(true)
    expect(withNote.slice(plain.length)).toBe('\n\nLOCAL CONTEXT (from the dashboard\'s deployer):\nOur zones are called TAZs.')
  })

  it('adds nothing when no note is set, and the defaults are today\'s values', () => {
    expect(buildSystemPrompt('CATALOG', 'read-only', 'schema-and-results')).not.toContain('LOCAL CONTEXT')
    expect(buildSystemPrompt('CATALOG', 'read-only', 'schema-and-results')).toContain('up to 50 result rows')
    expect(MAX_ROUND_TRIPS).toBe(6)
  })

  it('sends the note to the model but nowhere the viewer sees', async () => {
    configureAssistant({ promptAddendum: 'NOTE-FOR-MODEL' })
    const systems: string[] = []
    const deps: AgentDeps = {
      complete: async (_c, system) => {
        systems.push(system)
        return { text: 'answer', toolCalls: [] }
      },
      dispatch: async () => ({ content: '{}' }),
      catalog: () => 'CATALOG',
    }
    const s = setup([])
    const out = await runAgent(s.run, deps)
    expect(systems[0]).toContain('NOTE-FOR-MODEL')
    expect(out.text).toBe('answer')
    expect(s.steps.join(' ')).not.toContain('NOTE-FOR-MODEL')
  })
})
