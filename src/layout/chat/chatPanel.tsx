import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, Sparkles, Square, Trash2, X } from 'lucide-react'

import { ChatMessageView } from '@/layout/chat/chatMessage'
import { PillButton } from '@/layout/settings/settingsParts'
import { useAiSettings } from '@/hooks/useAiSettings'
import { useChat } from '@/hooks/useChat'
import { useScrollEdges } from '@/hooks/useScrollEdges'
import { retryLast, sendQuestion } from '@/services/ai/chatSession'
import { DEMO_SCRIPT } from '@/services/ai/demoScript'
import { clearChat, setChatOpen, stopRun } from '@/state/chatState'
import { getProviderPresets } from '@/state/aiState'
import { endDemo, startDemo } from '@/state/aiState'
import { openSettings } from '@/state/settingsState'

// 064-ai-chat-assistant (contracts/settings-ui.md): the chat side panel. An overlay sheet, so tile layouts do not
// reflow. Non-modal: the dashboard behind stays usable. The conversation lives in state/chatState.ts, so closing the
// panel or switching tabs never loses it.
export default function ChatPanel() {
  const chat = useChat()
  const ai = useAiSettings()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const running = chat.run.state === 'running'
  const configured = Boolean(ai.saved)
  const logRef = useScrollEdges<HTMLDivElement>([configured, chat.messages, chat.run.step])
  // Demo provider: the box is pre-filled with the next scripted question and read-only; the viewer only presses Send.
  const demo = ai.saved?.provider === 'demo'
  const demoQuestion = DEMO_SCRIPT[chat.messages.filter((m) => m.role === 'user').length % DEMO_SCRIPT.length].question
  const text = demo ? demoQuestion : draft

  useEffect(() => {
    inputRef.current?.focus()
  }, [configured])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages, chat.run.step])

  function submit() {
    if (!text.trim() || running || !configured) return
    const q = text
    if (!demo) setDraft('')
    void sendQuestion(q)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const last = chat.messages[chat.messages.length - 1]

  return (
    <div
      id="ai-chat-panel"
      role="dialog"
      aria-label="AI assistant"
      aria-modal="false"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setChatOpen(false)
      }}
      className="fixed inset-y-0 right-0 z-50 flex w-[min(440px,100vw)] flex-col border-l border-[var(--glass-line)] bg-[var(--surface)] font-body text-[var(--ink)] shadow-[var(--sh2)] max-[759px]:w-screen"
    >
      <header className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <Sparkles className="h-[18px] w-[18px] text-[var(--brand-text)]" aria-hidden="true" />
        <h2 className="mr-auto font-heading text-[15px] font-semibold">AI assistant</h2>
        {configured && (
          <>
            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--mute)]" data-testid="ai-permission-badge">
              {ai.permission === 'read-only' ? 'Read-Only' : 'Modify'}
            </span>
            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--mute)]">
              {ai.privacy === 'schema-only' ? 'Schema only' : 'Schema + results'}
            </span>
          </>
        )}
        <button
          type="button"
          aria-label="Clear conversation"
          disabled={chat.messages.length === 0}
          onClick={clearChat}
          className="rounded-md p-1.5 text-[var(--mute)] hover:text-[var(--ink)] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Close AI assistant"
          onClick={() => setChatOpen(false)}
          className="rounded-md p-1.5 text-[var(--mute)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {!configured ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center" data-testid="ai-unconfigured">
          <Sparkles className="h-8 w-8 text-[var(--mute)]" aria-hidden="true" />
          <p className="font-medium">The assistant is not set up</p>
          <p className="text-sm text-[var(--mute)]">Choose a provider and add your token in Settings to ask questions about the data.</p>
          <PillButton primary onClick={() => openSettings('ai')}>
            Set up the AI assistant
          </PillButton>
          {getProviderPresets().some((p) => p.id === 'demo') && (
            <>
              <PillButton onClick={startDemo} data-testid="ai-try-demo">
                Try the demo
              </PillButton>
              <p className="max-w-[30ch] text-[11.5px] text-[var(--mute)]">The demo plays scripted questions on the sample data. No key needed.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div ref={logRef} role="log" aria-live="polite" aria-label="Conversation" className="scrollbar-thin scroll-fade flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4">
            {chat.messages.length === 0 && (
              <p className="m-auto max-w-[32ch] text-center text-sm text-[var(--mute)]">
                Ask about the data, for example “Which scenario has the highest transit share?”
              </p>
            )}
            {chat.messages.map((m) => (
              <ChatMessageView
                key={m.id}
                message={m}
                running={running && m === last}
                step={chat.run.step}
                onRetry={m === last && !running ? () => void retryLast() : undefined}
              />
            ))}
          </div>
          <div className="border-t border-[var(--line)] p-3">
            {demo && (
              <p className="mb-2 text-[11.5px] text-[var(--mute)]" data-testid="ai-demo-note">
                Demo mode: the question is pre-filled and the replies are scripted. Press Send.{' '}
                <button type="button" onClick={endDemo} className="underline underline-offset-2 hover:text-[var(--ink)]">
                  Exit demo
                </button>
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={text}
                readOnly={demo}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                aria-label="Ask a question"
                placeholder="Ask a question about the data"
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              {running ? (
                <button
                  type="button"
                  aria-label="Stop"
                  onClick={stopRun}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--line)] hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Send"
                  disabled={!text.trim()}
                  onClick={submit}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
