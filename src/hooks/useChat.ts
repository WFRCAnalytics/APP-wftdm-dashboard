import { useSyncExternalStore } from 'react'

import { getChat, subscribe } from '@/state/chatState'

/** 064-ai-chat-assistant: the conversation, panel visibility and run status. */
export function useChat(): ReturnType<typeof getChat> {
  return useSyncExternalStore(subscribe, getChat)
}
