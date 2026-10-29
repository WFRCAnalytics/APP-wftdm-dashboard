// 064-ai-chat-assistant: the bounded tool-calling loop. Pure orchestration over injected dependencies (provider call,
// tool dispatcher, catalogue text) so it can be unit tested with fakes. Contract: contracts/assistant-tools.md.
import { getLimits, getPromptNote } from './assistantPolicy.ts'
import { TOOL_SPECS, type ToolContext, type ToolOutcome } from './toolSchema.ts'
import type { ChatTurn, Completion, Permission, PrivacyMode, ProviderConfig, QueryAttempt, ToolCall, ToolSpec } from './types.ts'

/** The steps one question may take unless the deployment sets `assistant.limits.round_trips` (assistantPolicy.ts). */
export const MAX_ROUND_TRIPS = 6

export interface AgentDeps {
  complete: (cfg: ProviderConfig, system: string, turns: ChatTurn[], tools: ToolSpec[], signal: AbortSignal) => Promise<Completion>
  dispatch: (call: ToolCall, ctx: ToolContext) => Promise<ToolOutcome>
  catalog: () => string
}

export interface AgentRun {
  question: string
  /** Earlier turns of this conversation, already reduced to plain text. */
  history: ChatTurn[]
  config: ProviderConfig
  permission: Permission
  privacy: PrivacyMode
  signal: AbortSignal
  onStep: (step: string) => void
  onAttempt: (attempt: QueryAttempt) => void
}

export interface AgentResult {
  text: string
  /** True when the loop hit its round-trip cap before the model finished. */
  capped: boolean
}

export function buildSystemPrompt(
  catalog: string,
  permission: Permission,
  privacy: PrivacyMode,
  /** The deployer's note and the rows shared with the model: the deployment's settings unless a test passes its own. */
  opts: { note?: string; modelRows?: number } = { note: getPromptNote(), modelRows: getLimits().modelRows },
): string {
  const mode =
    permission === 'read-only'
      ? 'The app is in READ-ONLY mode: only SELECT-style statements (SELECT, WITH, DESCRIBE, SHOW, EXPLAIN) run. Anything else is refused by the app.'
      : 'The app is in MODIFY mode: you may create temporary tables or views and change them for this session. Changes vanish on reload. You can never drop, replace or alter the dashboard views themselves, install extensions, attach databases or read external URLs.'
  const data =
    privacy === 'schema-only'
      ? 'PRIVACY: you only see column names/types and row counts; result values are hidden from you. The viewer sees the result table under your answer. Never state or guess values. If a filter returns 0 rows, the spelling of a category may be wrong: retry with ILIKE or a broader filter.'
      : `PRIVACY: you see up to ${opts.modelRows ?? getLimits().modelRows} result rows per query. Base every number you state on those rows.`
  return [
    "You are the data assistant inside a travel-demand-model calibration dashboard. Answer the user's questions about the model data by querying it with DuckDB SQL.",
    '',
    'DATA',
    'Each scenario exposes one view per metric, named "<scenario>__<metric>". Quote view names with double quotes. Call describe_tables for the views you plan to use BEFORE writing SQL against them, then call run_sql. A question may need one view or a join of several (for example two scenarios side by side, or a metric joined to a zone table).',
    catalog,
    '',
    mode,
    data,
    '',
    'STYLE: answer briefly in plain language; say which scenarios and views you used; if the data cannot answer the question, say so; never invent numbers. If a query fails, read the error and fix it. Do not claim to have run a query you did not run.',
    // the deployer's note comes last and only adds context: it never replaces or edits the instructions above
    ...(opts.note ? ['', "LOCAL CONTEXT (from the dashboard's deployer):", opts.note] : []),
  ].join('\n')
}

/** Runs one question to an answer. Throws ProviderError from the provider call; tool failures go back to the model. */
export async function runAgent(run: AgentRun, deps: AgentDeps): Promise<AgentResult> {
  const system = buildSystemPrompt(deps.catalog(), run.permission, run.privacy)
  const turns: ChatTurn[] = [...run.history, { role: 'user', text: run.question }]
  const ctx: ToolContext = { permission: run.permission, privacy: run.privacy, signal: run.signal }

  const maxRounds = getLimits().roundTrips
  for (let round = 1; round <= maxRounds; round++) {
    run.onStep(round === 1 ? 'Thinking' : 'Reading the result')
    const completion = await deps.complete(run.config, system, turns, TOOL_SPECS, run.signal)
    if (completion.toolCalls.length === 0) return { text: completion.text.trim(), capped: false }

    turns.push({ role: 'assistant', text: completion.text, toolCalls: completion.toolCalls })
    for (const call of completion.toolCalls) {
      if (run.signal.aborted) throw new DOMException('Stopped', 'AbortError')
      run.onStep(call.name === 'describe_tables' ? 'Looking up tables' : 'Running query')
      const outcome = await deps.dispatch(call, ctx)
      if (outcome.attempt) run.onAttempt(outcome.attempt)
      turns.push({ role: 'tool', toolCallId: call.id, name: call.name, content: outcome.content })
    }
  }
  return {
    text: 'This question needed more steps than the assistant allows in one go. The queries it ran are shown above; try a narrower question.',
    capped: true,
  }
}

/** Reduces an earlier assistant message to plain text for replay: its answer plus a one-line note of each query. */
export function assistantHistoryText(text: string, sqls: string[]): string {
  const queries = sqls.map((s) => (s.length > 300 ? `${s.slice(0, 300)}…` : s)).join(' | ')
  return queries ? `${text}\n[Queries run: ${queries}]` : text
}
