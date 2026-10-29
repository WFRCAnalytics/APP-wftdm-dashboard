// 070-demo-build-flag: Vite copies all of public/ into the output, demo content included. A build that is not in demo mode removes the
// demo folders (those named `demo-*`) from its OUTPUT afterwards; the tracked source folders are never touched.
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/** The names to remove: a folder or file starting with `demo-` (not `demonstration`, not `demo.html`). */
export function demoFolders(entries: string[]): string[] {
  return entries.filter((name) => name.startsWith('demo-'))
}

/** Removes the demo folders from `outDir` and returns what it removed. */
export function removeDemoContent(outDir: string): string[] {
  if (!existsSync(outDir)) return []
  const removed = demoFolders(readdirSync(outDir))
  for (const name of removed) rmSync(resolve(outDir, name), { recursive: true, force: true })
  return removed
}

export function demoContentPlugin({ demo }: { demo: boolean }): Plugin {
  let outDir = ''
  return {
    name: 'wftdm-demo-content-removal',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      if (!demo) removeDemoContent(outDir)
    },
  }
}
