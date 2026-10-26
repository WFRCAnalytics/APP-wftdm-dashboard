// 064-ai-chat-assistant: glue between the stores and the agent loop. sendQuestion() is the one entry point the panel
// calls; it owns the message bookkeeping so the UI only renders state/chatState.ts.
import { getAiSettings } from '@/state/aiState'
import {
  addAttempt,
  appendMessage,
  beginRun,
  getChat,
  newMessageId,
  removeMessage,
  setRun,
  updateMessage,
} from '@/state/chatState'
import { assistantHistoryText } from './agentLoop.ts'
import { askAssistant } from './assistant.ts'
import { ProviderError } from './providers.ts'
import type { ChatMessage, ChatTurn } from './types.ts'

/** Earlier messages as plain turns: the user's words, and the assistant's answer plus a note of the queries it ran. */
export function historyOf(messages: readonly ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const m of messages) {
    if (m.role === 'user') turns.push({ role: 'user', text: m.text })
    else if (m.text) turns.push({ role: 'assistant', text: assistantHistoryText(m.text, m.attempts.map((a) => a.sql)), toolCalls: [] })
  }
  return turns
}

function errorText(e: unknown): string {
  if (e instanceof ProviderError) return e.message
  return 'Something went wrong while asking the assistant. Try again.'
}

export async function sendQuestion(question: string): Promise<void> {
  const text = question.trim()
  const settings = getAiSettings()
  const config = settings.saved
  if (!text || !config || getChat().run.state === 'running') return

  const history = historyOf(getChat().messages)
  appendMessage({ id: newMessageId(), role: 'user', text, attempts: [] })
  const answerId = newMessageId()
  appendMessage({ id: answerId, role: 'assistant', text: '', attempts: [] })

  const controller = beginRun()
  setRun({ state: 'running', step: 'Thinking' })
  try {
    const result = await askAssistant({
      question: text,
      history,
      config,
      permission: settings.permission,
      privacy: settings.privacy,
      signal: controller.signal,
      onStep: (step) => setRun({ state: 'running', step }),
      onAttempt: (attempt) => addAttempt(answerId, attempt),
    })
    updateMessage(answerId, (m) => ({ ...m, text: result.text }))
  } catch (e) {
    if (controller.signal.aborted || (e instanceof ProviderError && e.kind === 'abort') || (e as Error).name === 'AbortError') {
      updateMessage(answerId, (m) => ({ ...m, stopped: true }))
    } else {
      updateMessage(answerId, (m) => ({ ...m, error: errorText(e) }))
    }
  } finally {
    setRun({ state: 'idle', step: '' })
  }
}

/** Re-asks the last question after a provider failure: drops the failed answer (and its question) and sends again. */
export async function retryLast(): Promise<void> {
  const messages = getChat().messages
  const last = messages[messages.length - 1]
  const asked = messages[messages.length - 2]
  if (!last || last.role !== 'assistant' || !asked || asked.role !== 'user') return
  removeMessage(last.id)
  removeMessage(asked.id)
  await sendQuestion(asked.text)
}
