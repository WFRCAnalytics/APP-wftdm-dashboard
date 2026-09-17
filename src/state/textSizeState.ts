// 061-appearance-controls — mirrors state/themeState.ts's exact shape: a
// module-level mutable value + subscribe()/notify(), no persistence
// across a page reload (constitution Principle VI). A fresh module load
// always starts at the default, 100 (percent).
export const MIN_SCALE = 80
export const MAX_SCALE = 150
export const DEFAULT_SCALE = 100

let scale = DEFAULT_SCALE

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

export function getScale(): number {
  return scale
}

export function setScale(next: number): void {
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
  notify()
}
