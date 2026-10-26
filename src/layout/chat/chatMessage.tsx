import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { ResultTable } from '@/layout/chat/resultTable'
import { cn } from '@/lib/utils'
import { highlightSql, type SqlTokenKind } from '@/services/ai/sqlHighlight'
import type { ChatMessage, QueryAttempt } from '@/services/ai/types'

// 064-ai-chat-assistant: one message. Assistant answers are plain escaped text (never markdown or HTML); each query the
// assistant ran is shown with its SQL, an outcome badge and the result table or the refusal/error reason.

const OUTCOME: Record<QueryAttempt['outcome'], { label: string; cls: string }> = {
  ok: { label: 'Ran', cls: 'text-[var(--brand-text)]' },
  refused: { label: 'Refused', cls: 'text-[var(--mute)]' },
  error: { label: 'Error', cls: 'text-[var(--mute)]' },
  cancelled: { label: 'Stopped', cls: 'text-[var(--mute)]' },
}

// Theme-aware colours (--sql-* in styles/tokens.css, redefined for dark mode).
const SQL_COLOR: Partial<Record<SqlTokenKind, string>> = {
  keyword: 'text-[var(--sql-keyword)] font-medium',
  function: 'text-[var(--sql-function)]',
  string: 'text-[var(--sql-string)]',
  number: 'text-[var(--sql-number)]',
  ident: 'text-[var(--ink)]',
  comment: 'text-[var(--sql-comment)] italic',
}

function SqlCode({ sql }: { sql: string }) {
  return (
    <>
      {highlightSql(sql).map((tok, i) => (
        <span key={i} className={SQL_COLOR[tok.kind]}>
          {tok.text}
        </span>
      ))}
    </>
  )
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label="Copy SQL"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
      className="rounded-md p-1 text-[var(--mute)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
    >
      {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  )
}

function Attempt({ attempt, index }: { attempt: QueryAttempt; index: number }) {
  const o = OUTCOME[attempt.outcome]
  return (
    <details open={attempt.outcome !== 'ok' || index === 0} className="rounded-xl border border-[var(--line)] bg-[var(--tile-hi)]" data-testid="ai-attempt">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px]">
        <span className="font-medium">Query {index + 1}</span>
        <span className={cn('text-[11.5px]', o.cls)} data-testid="ai-attempt-outcome">{o.label}</span>
      </summary>
      <div className="px-3 pb-3">
        <div className="relative">
          <pre className="scrollbar-thin overflow-auto rounded-lg bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-2.5 pr-8 font-mono text-[12px] leading-[1.5]" data-testid="ai-sql">
            <code>
              <SqlCode sql={attempt.sql} />
            </code>
          </pre>
          <span className="absolute right-1 top-1">
            <CopyButton text={attempt.sql} />
          </span>
        </div>
        {attempt.outcome === 'ok' && (
          <div className="mt-2">
            <ResultTable attempt={attempt} />
          </div>
        )}
        {(attempt.outcome === 'refused' || attempt.outcome === 'error') && (
          <p className="mt-2 text-[12.5px] text-[var(--mute)]" data-testid="ai-attempt-reason">
            {attempt.reason}
          </p>
        )}
      </div>
    </details>
  )
}

export function ChatMessageView({
  message,
  running,
  step,
  onRetry,
}: {
  message: ChatMessage
  running: boolean
  step: string
  onRetry?: () => void
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--primary)] px-3 py-2 text-sm text-[var(--primary-foreground)]">
          {message.text}
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2" data-testid="ai-answer">
      {message.attempts.map((a, i) => (
        <Attempt key={i} attempt={a} index={i} />
      ))}
      {running && (
        <p className="text-[12.5px] text-[var(--mute)]" role="status">
          {step}…
        </p>
      )}
      {message.text && <p className="whitespace-pre-wrap text-sm leading-[1.55]">{message.text}</p>}
      {message.stopped && <p className="text-[12.5px] text-[var(--mute)]">Stopped.</p>}
      {message.error && (
        <p className="text-[12.5px] text-[var(--mute)]" data-testid="ai-error">
          {message.error}{' '}
          {onRetry && (
            <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-[var(--ink)]">
              Retry
            </button>
          )}
        </p>
      )}
    </div>
  )
}
