import { lazy, Suspense, useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'

import { useChat } from '@/hooks/useChat'
import { cn } from '@/lib/utils'
import { isAssistantEnabled } from '@/state/assistantAvailability'
import { setChatOpen } from '@/state/chatState'

// The panel is its own lazy chunk (042-boot-performance-fix): only this small button is in the entry graph.
const ChatPanel = lazy(() => import('@/layout/chat/chatPanel'))

// 064-ai-chat-assistant: the Assistant button. It sits in the page header, to the right of the control bar, in its own
// circle filled with the brand colour and an icon in --primary-foreground (white in light mode, dark on the light-blue brand in dark mode), the diameter of the Compare button (38px), centred on the bar's height. `floating` is for chromeless pages (Explore), which have no header: the same circle, fixed top right.
// A deployment can switch the assistant off, in which case nothing renders.
export function AssistantButton({ floating }: { floating?: boolean }) {
  const chat = useChat()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (wasOpen.current && !chat.open) buttonRef.current?.focus()
    wasOpen.current = chat.open
  }, [chat.open])

  if (!isAssistantEnabled()) return null
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="Open AI assistant"
      aria-expanded={chat.open}
      aria-controls="ai-chat-panel"
      data-testid="assistant-button"
      onClick={() => setChatOpen(!chat.open)}
      className={cn(
        'relative grid size-[38px] shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[var(--primary-foreground)] shadow-[var(--sh1)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] motion-reduce:transition-none',
        chat.open && 'brightness-90',
        floating && 'fixed right-5 top-4 z-40',
      )}
    >
      <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
      {chat.run.state === 'running' && (
        <span data-testid="ai-activity" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[var(--primary-foreground)] ring-2 ring-[var(--brand)]" />
      )}
    </button>
  )
}

/** The side panel, mounted once by the shell while the chat is open. */
export function ChatHost() {
  const chat = useChat()
  if (!isAssistantEnabled() || !chat.open) return null
  return (
    <Suspense fallback={null}>
      <ChatPanel />
    </Suspense>
  )
}
