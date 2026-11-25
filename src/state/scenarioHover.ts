// The run under the pointer in the page's scenario list (layout/scenarioList.tsx): every chart isolates it while it is
// hovered, the way a tile's own legend chip isolates a run in its tile. Plain in-memory module state.
let hovered: string | null = null
const subscribers = new Set<() => void>()

export function getHoveredRun(): string | null {
  return hovered
}

export function setHoveredRun(run: string | null): void {
  if (run === hovered) return
  hovered = run
  for (const fn of subscribers) fn()
}

export function subscribeHoveredRun(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}
