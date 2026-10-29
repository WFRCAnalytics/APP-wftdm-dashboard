// 061-appearance-controls — mirrors state/themeState.ts's exact shape: a
// module-level mutable value + subscribe()/notify(), no persistence
// across a page reload (constitution Principle VI). A fresh module load
// always starts with no selection for any role — the existing self-hosted
// Geist/Geist Mono default (tokens.css) applies with zero change.
import { fontsBundled } from '@/services/networkPolicy'

export type FontRole = 'body' | 'heading' | 'mono'

// 071-network-block: with `network.fonts: bundled` only the fonts that ship with the app may be chosen: the self-hosted default and the
// platform's own font, neither of which loads anything from an outside host. Any other family (a Google font) is refused.
export const DEFAULT_FONT = 'Schibsted Grotesk'
export const SYSTEM_FONT = 'System UI'
export const BUNDLED_FONTS: readonly string[] = [DEFAULT_FONT, SYSTEM_FONT]

/** Whether a family may be set: always when fonts are not bundled, else only the bundled ones. */
export const isFontOffered = (name: string): boolean => !fontsBundled() || BUNDLED_FONTS.includes(name)

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
  const name = selections[role]
  // a preference for a family that is no longer offered is ignored, not applied
  return name !== undefined && !isFontOffered(name) ? undefined : name
}

export function setFont(role: FontRole, name: string): void {
  if (!isFontOffered(name)) return
  selections[role] = name
  notify()
}

export function clearFont(role: FontRole): void {
  delete selections[role]
  notify()
}
