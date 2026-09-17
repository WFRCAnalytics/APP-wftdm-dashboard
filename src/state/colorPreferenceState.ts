// 061-appearance-controls — mirrors state/themeState.ts's exact shape: a
// module-level mutable value + subscribe()/notify(), no persistence
// across a page reload (constitution Principle VI — no localStorage/
// sessionStorage). A fresh module load always starts at `false`.
let colorblindSafe = false

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

export function getColorblindSafe(): boolean {
  return colorblindSafe
}

export function setColorblindSafe(next: boolean): void {
  colorblindSafe = next
  notify()
}
