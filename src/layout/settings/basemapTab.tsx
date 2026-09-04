import { Button } from '@/components/ui/button'
import { listBuiltInPresetNames } from '@/panels/basemap/registry'
import { useGlobalBasemap } from '@/hooks/useGlobalBasemap'
import { setGlobalBasemap } from '@/state/basemapState'

// 020-settings-modal (US2): the real preset picker, replacing US1's stub.
// FR-011 — same catalog dashboard authors use (registry.ts's own
// BUILT_IN_PRESETS, via the new listBuiltInPresetNames() export). FR-012/
// FR-013 are entirely resolveEffectiveBasemap()'s/the panel call sites'
// own responsibility (research.md §6) — this component only ever writes
// the viewer's choice to state/basemapState.ts; it does not know or care
// which panels currently have an author-configured basemap of their own.
export function BasemapTab() {
  const current = useGlobalBasemap()
  const presets = listBuiltInPresetNames()

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Applies to every flowmap/zonemap panel that has no basemap configured by its own
        dashboard author.
      </p>
      <div className="flex flex-col gap-1" role="radiogroup" aria-label="Basemap">
        {presets.map((name) => {
          const selected = current === name
          return (
            <Button
              key={name}
              type="button"
              variant={selected ? 'secondary' : 'outline'}
              size="sm"
              className="justify-start"
              role="radio"
              aria-checked={selected}
              onClick={() => setGlobalBasemap(name)}
            >
              {name}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
