import Color from 'color'
import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  ColorPicker,
  ColorPickerAlpha,
  ColorPickerEyeDropper,
  ColorPickerFormat,
  ColorPickerHue,
  ColorPickerOutput,
  ColorPickerSelection,
} from '@/components/ui/color-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useColorScheme } from '@/hooks/useColorScheme'
import { useInterfaceColors } from '@/hooks/useInterfaceColors'
import {
  clearInterfaceColorOverride,
  getInterfaceColorOverride,
  setInterfaceColorOverride,
} from '@/state/interfaceColorState'
import type { InterfaceColorRole } from '@/panels/interfaceColor'

// 061-appearance-controls — mirrors layout/settings/scenarioColorControl.tsx
// exactly (research.md §6): a small swatch trigger opening a Popover
// hosting the SAME adapted ColorPicker, writing a hex string on change,
// showing a conditional Reset button. components/ui/color-picker.tsx
// itself needs zero changes — it is already role-agnostic.
export function InterfaceColorControl({ role, label }: { role: InterfaceColorRole; label: string }) {
  // useInterfaceColors() already subscribes to state/interfaceColorState.ts
  // — reading getInterfaceColorOverride() directly here stays fresh
  // because this component re-renders on every override change via that
  // same subscription, without needing a second, separate one.
  const colors = useInterfaceColors()
  // A real, confirmed bug fix: this swatch's own fallback read below
  // (getComputedStyle) only happens IN RENDER, with no subscription of
  // its own to theme changes — it previously only got fresh values as an
  // incidental side effect of some UNRELATED re-render (e.g. AppearanceTab
  // re-rendering because the Theme mode tab was clicked). That meant a
  // genuine, live theme change with NO accompanying mode-state change —
  // the exact case of `mode === 'system'` reacting to a REAL OS-level
  // prefers-color-scheme flip via appearanceTab.tsx's own matchMedia
  // listener, which mutates `.dark` directly on document.documentElement
  // with no React state involved at all — left this swatch showing a
  // stale color until the viewer happened to click something else that
  // forced a re-render (e.g. switching to "Dark" explicitly), which then
  // read the now-current value and made it LOOK like clicking the tab is
  // what changed the color, when it was actually just correcting a stale
  // display. useColorScheme() (already used for the identical reason in
  // hooks/useScenarioDisplay.ts, 036-scenario-color-picker's own
  // research.md §4 finding) observes document.documentElement's `.dark`
  // class directly via a MutationObserver, independent of any mode/React
  // state — calling it here, even though its own return value is unused,
  // subscribes this component to every real theme change so the fallback
  // read below is always current, not just usually current.
  useColorScheme()
  const hasOverride = getInterfaceColorOverride(role) !== undefined
  // Falls back to tokens.css's own real, current value for this role when
  // neither an override nor a deployer default is configured — read at
  // render time via getComputedStyle, the same resolution
  // hooks/useScenarioDisplay.ts's resolveEffectiveDefault() already uses
  // for its own var()-reference case.
  const effectiveColor =
    colors[role].color ??
    getComputedStyle(document.documentElement).getPropertyValue(`--${role}`).trim() ??
    '#000000'

  return (
    // Column shape (label above, swatch below) — three of these sit side
    // by side in a 1-row/3-column grid (appearanceTab.tsx), matching the
    // font pickers' own column convention rather than each role getting
    // its own full-width row.
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={`interface-color-swatch-${role}`}
            className="h-8 w-full cursor-pointer rounded border border-input"
            style={{ backgroundColor: effectiveColor }}
            aria-label={`Color for ${label}`}
          />
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <ColorPicker
            value={effectiveColor}
            className="gap-3"
            onChange={([r, g, b]) => setInterfaceColorOverride(role, Color.rgb(r, g, b).hex())}
          >
            <ColorPickerSelection className="h-32" />
            <div className="flex items-center gap-3">
              <ColorPickerEyeDropper />
              <div className="grid w-full gap-1">
                <ColorPickerHue />
                <ColorPickerAlpha />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ColorPickerOutput />
              <ColorPickerFormat />
            </div>
          </ColorPicker>
          {hasOverride && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full justify-center text-xs text-muted-foreground"
              onClick={() => clearInterfaceColorOverride(role)}
            >
              <RotateCcw className="h-3 w-3" />
              Reset to default
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
