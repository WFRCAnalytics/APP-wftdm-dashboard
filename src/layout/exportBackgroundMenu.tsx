import { Check } from 'lucide-react'

import { EXPORT_BACKGROUNDS, useExportBackground } from '@/services/exportBackground'
import { cn } from '@/lib/utils'

const ITEM =
  'flex w-full items-center gap-2 rounded-lg px-3 py-[6px] text-left font-body text-sm text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand-text)]'

/** The "Image background" choice at the bottom of an export menu, shared by every export in the app. */
export function ExportBackgroundChoice({ disabledReason }: { disabledReason?: string }) {
  const [mode, setMode] = useExportBackground()
  return (
    <div role="group" aria-label="Image background" className="mt-1 border-t border-[var(--line)] pt-1">
      <p className="px-3 pb-0.5 pt-1 font-body text-xs text-[var(--mute)]">{disabledReason ?? 'Image background'}</p>
      {EXPORT_BACKGROUNDS.map((o) => (
        <button key={o.v} role="menuitemradio" aria-checked={mode === o.v} type="button" disabled={!!disabledReason} className={ITEM} onClick={() => setMode(o.v)}>
          {/* the same filled chip as a Select item's check (select.tsx), kept in front of the label; unchosen rows keep its room */}
          <span className={cn('grid size-4 shrink-0 place-items-center rounded-full', mode === o.v ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'invisible')} aria-hidden="true">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className={cn(mode === o.v && 'font-medium')}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
