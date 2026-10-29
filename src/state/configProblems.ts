// Problems found while reading the site configuration and the page files (src/config/validate.ts), kept for the visible
// note in the shell. Plain in-memory module state, never Web Storage.
import type { ConfigProblem } from '@/config'

let problems: ConfigProblem[] = []
let dismissed = false
let version = 0
const subscribers = new Set<() => void>()

function emit() {
  version++
  for (const fn of subscribers) fn()
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function getVersion(): number {
  return version
}

/** Records problems and writes each to the console as `file › path: message`. */
export function addProblems(list: readonly ConfigProblem[]): void {
  if (list.length === 0) return
  for (const p of list) console.warn(`dashboard-config: ${p.file}${p.path ? ` › ${p.path}` : ''}: ${p.message}${p.line ? ` (line ${p.line})` : ''}`)
  problems = [...problems, ...list]
  dismissed = false
  emit()
}

export function getProblems(): readonly ConfigProblem[] {
  return dismissed ? [] : problems
}

export function dismissProblems(): void {
  dismissed = true
  emit()
}

/** Test seam. */
export function resetProblems(): void {
  problems = []
  dismissed = false
  emit()
}
