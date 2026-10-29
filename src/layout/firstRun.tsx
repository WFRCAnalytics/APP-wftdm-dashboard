import { Compass } from 'lucide-react'

import { ConfigNotice } from '@/layout/configNotice'
import type { FirstRunState } from '@/services/firstRun'

// 070-demo-build-flag: shown instead of the dashboard when there is nothing to show (no site file, no pages). A normal build carries no demo
// content to fall back on, so this says what is missing, where the app looked and what to do next.
export function FirstRun({ state }: { state: FirstRunState }) {
  return (
    <main data-testid="first-run" role="status" className="flex min-h-screen flex-col items-center bg-background text-foreground">
      <div className="w-full max-w-[640px] px-4 pt-[14vh]">
        <Compass className="mb-4 size-8 text-[var(--mute)]" aria-hidden />
        <h1 className="text-xl font-semibold">{state.title}</h1>
        <p className="mt-2 text-[14px] text-[var(--mute)]">{state.message}</p>
        {state.searched && (
          <p className="mt-4 text-[13px]">
            The dashboard looked in <span data-testid="first-run-folder" className="rounded bg-[var(--tile-hi)] px-1.5 py-0.5 font-mono text-[12px]">{state.searched}</span>
          </p>
        )}
        <h2 className="mt-6 text-[13px] font-medium">What to do next</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] text-[var(--mute)]">
          {state.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="mt-6 w-full max-w-[640px]">
        <ConfigNotice />
      </div>
    </main>
  )
}
