// 061-appearance-controls — mirrors state/themeState.ts's exact shape: a
// module-level mutable value + subscribe()/notify(), no persistence
// across a page reload (constitution Principle VI). A fresh module load
// always starts with no selection for any role — the existing self-hosted
// Geist/Geist Mono default (tokens.css) applies with zero change.
export type FontRole = 'body' | 'heading' | 'mono'

const selections: Partial<Record<FontRole, string>> = {}

export type Subscriber = () => void
export type Unsubscribe = () => void

const subscribers = new Set<Subscriber>()

function notify(): void {
  for (const fn of subscribers) fn()
}

export function subscribe(fn: Subscriber): Unsubscribe {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function getFont(role: FontRole): string | undefined {
  return selections[role]
}

export function setFont(role: FontRole, name: string): void {
  selections[role] = name
  notify()
}

export function clearFont(role: FontRole): void {
  delete selections[role]
  notify()
}
