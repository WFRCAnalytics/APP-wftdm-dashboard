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
  const hasOverride = getInterfaceColorOverride(role) !== undefined
  // Falls back to tokens.css's own real, current value for this role when
  // neither an override nor a deployer default is configured — read at
  // click time via getComputedStyle, the same resolution
  // hooks/useScenarioDisplay.ts's resolveEffectiveDefault() already uses
  // for its own var()-reference case.
  const effectiveColor =
    colors[role].color ??
    getComputedStyle(document.documentElement).getPropertyValue(`--${role}`).trim() ??
    '#000000'

  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid={`interface-color-swatch-${role}`}
              className="h-6 w-6 shrink-0 cursor-pointer rounded border border-input"
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
    </div>
  )
}
