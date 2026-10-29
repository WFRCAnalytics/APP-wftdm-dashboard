// 064-ai-chat-assistant: the tool definitions and the privacy shaping of tool results. Pure, so the agent loop and
// its tests need none of DuckDB. The dispatcher that runs the tools is in tools.ts.
import { getLimits } from './assistantPolicy.ts'
import type { Permission, PrivacyMode, QueryAttempt, ToolSpec } from './types.ts'

/** Rows of a result shared with the model unless the deployment sets `assistant.limits.model_rows` (assistantPolicy.ts). */
export const MODEL_ROW_LIMIT = 50
export const MODEL_BYTE_LIMIT = 8 * 1024

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'describe_tables',
    description:
      'Get the column names and types of dashboard views before querying them. Also makes their data available. Use view names exactly as listed in the catalogue.',
    parameters: {
      type: 'object',
      required: ['names'],
      properties: {
        names: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 12,
          description: 'View names, e.g. baseline__trip_mode_share',
        },
      },
    },
  },
  {
    name: 'run_sql',
    description: 'Run DuckDB SQL against the dashboard data and return the result. Quote view names with double quotes.',
    parameters: {
      type: 'object',
      required: ['sql'],
      properties: { sql: { type: 'string', description: 'One or more DuckDB statements.' } },
    },
  },
]

export interface ToolContext {
  permission: Permission
  privacy: PrivacyMode
  signal: AbortSignal
}

export interface ToolOutcome {
  /** JSON text handed back to the model. */
  content: string
  /** Set for run_sql: shown to the viewer in full. */
  attempt?: QueryAttempt
}

/** What the model is told about a query result, under the active privacy mode. */
export function shapeForModel(attempt: QueryAttempt, privacy: PrivacyMode): Record<string, unknown> {
  if (attempt.outcome === 'refused') return { ok: false, refused: true, reason: attempt.reason }
  if (attempt.outcome === 'cancelled') return { ok: false, error: 'The viewer stopped the query.' }
  if (attempt.outcome === 'error') return { ok: false, error: attempt.reason }
  const base = {
    ok: true,
    columns: attempt.columns,
    rowCount: attempt.truncated ? `${attempt.rows.length}+` : attempt.rows.length,
    truncated: attempt.truncated,
  }
  if (privacy === 'schema-only') {
    return { ...base, note: 'Row values are hidden from you by the privacy setting; the viewer sees the result table. Do not state or guess values.' }
  }
  let rows = attempt.rows.slice(0, getLimits().modelRows)
  while (rows.length > 0 && JSON.stringify(rows).length > MODEL_BYTE_LIMIT) rows = rows.slice(0, Math.floor(rows.length / 2))
  const cut = rows.length < attempt.rows.length
  return { ...base, rows, ...(cut ? { note: `Only the first ${rows.length} rows are shown to you; the viewer sees more.` } : {}) }
}

