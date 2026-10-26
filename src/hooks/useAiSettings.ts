import { useSyncExternalStore } from 'react'

import { getAiSettings, subscribe } from '@/state/aiState'

/** 064-ai-chat-assistant: the assistant's settings. getAiSettings() returns a new object only on change, so no cache. */
export function useAiSettings(): ReturnType<typeof getAiSettings> {
  return useSyncExternalStore(subscribe, getAiSettings)
}
