import { useSyncExternalStore } from 'react'
import { TriangleAlert, X } from 'lucide-react'

import { dismissProblems, getProblems, getVersion, subscribe } from '@/state/configProblems'

// One dismissible note for a deployer: every problem found in dashboard-config.yaml and the page files, with the file and
// the key path. Nothing when the configuration is clean. The same lines are in the console.
export function ConfigNotice() {
  useSyncExternalStore(subscribe, getVersion)
  const problems = getProblems()
  if (problems.length === 0) return null
  return (
    <div role="status" data-testid="config-notice" className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-[var(--glass-line)] bg-[var(--tile-hi)] px-3.5 py-2.5 text-[13px] text-[var(--ink)]">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Some settings were not applied ({problems.length})</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--mute)]">
          {problems.map((p, i) => (
            <li key={i} data-problem-path={p.path}>
              <span className="font-mono text-[12px]">{p.file}{p.path ? ` › ${p.path}` : ''}</span>: {p.message}
              {p.line ? ` (line ${p.line})` : ''}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" aria-label="Dismiss" onClick={dismissProblems} className="rounded p-1 text-[var(--mute)] hover:text-[var(--ink)]">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
