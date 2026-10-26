import { MAX_PREVIEW_ROWS } from '@/services/ai/sqlRunner'
import type { QueryAttempt } from '@/services/ai/types'

// 064-ai-chat-assistant: the capped result of one query. Cells are rendered as text (never HTML).
function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function ResultTable({ attempt }: { attempt: QueryAttempt }) {
  const { columns, rows, truncated } = attempt
  if (columns.length === 0) return <p className="px-3 py-2 text-[12.5px] text-[var(--mute)]">Done. The statement returned no table.</p>
  return (
    <div>
      <div className="scrollbar-thin max-h-64 overflow-auto rounded-lg border border-[var(--line)]">
        <table className="w-full border-collapse text-[12.5px]" data-testid="ai-result-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.name}
                  scope="col"
                  className="sticky top-0 whitespace-nowrap border-b border-[var(--line)] bg-[var(--tile-hi)] px-2.5 py-1.5 text-left font-medium"
                  title={c.type}
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="odd:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]">
                {row.map((cell, j) => (
                  <td key={j} className={`whitespace-nowrap px-2.5 py-1 ${typeof cell === 'number' ? 'text-right tabular-nums' : ''}`}>
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-2.5 py-2 text-[var(--mute)]">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11.5px] text-[var(--mute)]">
        {truncated ? `Showing the first ${MAX_PREVIEW_ROWS.toLocaleString()} rows; more exist.` : `${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}`}
      </p>
    </div>
  )
}
