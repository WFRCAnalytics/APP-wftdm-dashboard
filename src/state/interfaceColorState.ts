// 061-appearance-controls — mirrors state/themeState.ts's exact shape: a
// module-level mutable value + subscribe()/notify(), no persistence
// across a page reload (constitution Principle VI). A fresh module load
// always starts with no overrides set.
import type { InterfaceColorRole } from '@/panels/interfaceColor'

const overrides: Partial<Record<InterfaceColorRole, string>> = {}

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

export function getInterfaceColorOverride(role: InterfaceColorRole): string | undefined {
  return overrides[role]
}

export function setInterfaceColorOverride(role: InterfaceColorRole, hex: string): void {
  overrides[role] = hex
  notify()
}

export function clearInterfaceColorOverride(role: InterfaceColorRole): void {
  delete overrides[role]
  notify()
}
