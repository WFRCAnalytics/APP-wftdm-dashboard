// 064-ai-chat-assistant: whether this deployment offers the assistant at all. Set exactly once at boot from main.tsx
// (dashboard-config.yaml `assistant: { enabled: false }`), before anything that reads it has mounted, so it is a
// plain module value with no subscribe plumbing (same shape as state/protomapsSourceState.ts). Enabled by default.
let enabled = true

export function setAssistantEnabled(value: boolean): void {
  enabled = value
}

export function isAssistantEnabled(): boolean {
  return enabled
}
