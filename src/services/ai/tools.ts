// 064-ai-chat-assistant: the two tools the model can call, and what each result looks like to the MODEL. What the
// viewer sees is always the full capped result (QueryAttempt); what the model sees depends on the privacy setting.
// Contract: specs/064-ai-chat-assistant/contracts/assistant-tools.md.
import { ensureRegistered } from '@/services/tabDataLoader'
import { buildCatalog, resolveViews } from './catalog.ts'
import { describeView, runSql } from './sqlRunner.ts'
import { shapeForModel, type ToolContext, type ToolOutcome } from './toolSchema.ts'
import type { ToolCall } from './types.ts'

function fail(message: string): ToolOutcome {
  return { content: JSON.stringify({ ok: false, error: message }) }
}

export async function dispatchTool(call: ToolCall, ctx: ToolContext): Promise<ToolOutcome> {
  const args = call.args as { __invalid?: string; sql?: unknown; names?: unknown }
  if (args && typeof args === 'object' && '__invalid' in args) {
    return fail('The tool arguments were not valid JSON. Send them again as a JSON object.')
  }

  if (call.name === 'describe_tables') {
    if (!Array.isArray(args.names) || !args.names.every((n) => typeof n === 'string')) {
      return fail('describe_tables needs {"names": ["view_name", ...]}.')
    }
    const { pairs, notFound } = resolveViews(args.names as string[], buildCatalog())
    const tables: { name: string; columns?: unknown; error?: string }[] = []
    try {
      await ensureRegistered(pairs.map(({ scenario, metric }) => ({ scenario, metric })))
    } catch {
      /* per-view failures surface through DESCRIBE below */
    }
    for (const p of pairs) {
      try {
        tables.push({ name: p.view, columns: await describeView(p.view) })
      } catch (e) {
        tables.push({ name: p.view, error: (e as Error).message })
      }
    }
    return { content: JSON.stringify({ tables, notFound }) }
  }

  if (call.name === 'run_sql') {
    if (typeof args.sql !== 'string' || !args.sql.trim()) return fail('run_sql needs {"sql": "..."}.')
    const attempt = await runSql(args.sql, ctx.permission, ctx.signal)
    return { content: JSON.stringify(shapeForModel(attempt, ctx.privacy)), attempt }
  }

  return fail(`Unknown tool "${call.name}".`)
}
