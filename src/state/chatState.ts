// 064-ai-chat-assistant: the conversation. Lives outside React so it survives tab switches (DashboardRenderer
// remounts per tab) and the panel closing. Session-only: a reload clears it (constitution VI).
import type { ChatMessage, QueryAttempt } from '@/services/ai/types'

export interface ChatState {
  open: boolean
  messages: ChatMessage[]
  run: { state: 'idle' | 'running'; step: string }
}

let state: ChatState = { open: false, messages: [], run: { state: 'idle', step: '' } }
let controller: AbortController | undefined
let nextId = 1
const subscribers = new Set<() => void>()

function commit(next: ChatState): void {
  state = next
  for (const fn of subscribers) fn()
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function getChat(): ChatState {
  return state
}

export function setChatOpen(open: boolean): void {
  commit({ ...state, open })
}

export function newMessageId(): string {
  return `m${nextId++}`
}

export function appendMessage(message: ChatMessage): void {
  commit({ ...state, messages: [...state.messages, message] })
}

export function updateMessage(id: string, patch: (m: ChatMessage) => ChatMessage): void {
  commit({ ...state, messages: state.messages.map((m) => (m.id === id ? patch(m) : m)) })
}

export function addAttempt(id: string, attempt: QueryAttempt): void {
  updateMessage(id, (m) => ({ ...m, attempts: [...m.attempts, attempt] }))
}

export function removeMessage(id: string): void {
  commit({ ...state, messages: state.messages.filter((m) => m.id !== id) })
}

export function setRun(run: ChatState['run']): void {
  commit({ ...state, run })
}

export function beginRun(): AbortController {
  controller = new AbortController()
  return controller
}

export function stopRun(): void {
  controller?.abort()
}

export function clearChat(): void {
  controller?.abort()
  commit({ ...state, messages: [], run: { state: 'idle', step: '' } })
}
