// Tiny helpers for the nested settings trees (a dotted path into plain objects). Pure.
export type Tree = Record<string, unknown>

export const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v)

export function getPath(tree: Tree, path: string): unknown {
  let cur: unknown = tree
  for (const k of path.split('.')) {
    if (!isTree(cur)) return undefined
    cur = cur[k]
  }
  return cur
}

export function setPath(tree: Tree, path: string, value: unknown): void {
  const parts = path.split('.')
  let cur = tree
  for (const k of parts.slice(0, -1)) {
    const next = cur[k]
    if (isTree(next)) cur = next
    else {
      const made: Tree = {}
      cur[k] = made
      cur = made
    }
  }
  cur[parts[parts.length - 1]] = value
}
