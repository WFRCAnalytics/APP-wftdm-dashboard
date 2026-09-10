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
import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { resolveScenarioColor } from '@/panels/scenarioDisplay'
import * as appState from '@/state/appState'
import type { Scenario } from '@/state/appState'

// 036-scenario-color-picker (Part B) — replaces 035's own inline
// <input type="color"> swatch + conditional clear button with a small
// swatch trigger opening a Popover hosting the adapted ColorPicker
// (components/ui/color-picker.tsx). Reads its own displayed color from
// useScenarioDisplay() — the SAME hook every chart panel already reads
// from — so the Scenarios tab's own swatch is guaranteed to agree with
// what's actually rendered everywhere else (contracts/
// scenario-color-resolution.md's Read path).
export function ScenarioColorControl({ scenario }: { scenario: Scenario }) {
  const scenarioDisplay = useScenarioDisplay()
  const effectiveColor = resolveScenarioColor(scenario.name, scenarioDisplay) ?? '#000000'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`scenario-color-swatch-${scenario.name}`}
          className="h-6 w-6 shrink-0 cursor-pointer rounded border border-input"
          style={{ backgroundColor: effectiveColor }}
          aria-label={`Color for ${scenario.name}`}
        />
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <ColorPicker
          value={effectiveColor}
          className="gap-3"
          // research.md §6: the one place [r,g,b,a] -> appState's own
          // hex-string colorOverride contract is converted — the shared
          // primitive itself (color-picker.tsx) stays scenario-agnostic.
          onChange={([r, g, b]) => appState.setColorOverride(scenario.name, Color.rgb(r, g, b).hex())}
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
        {/* FR-016: replaces 035's own inline row-level clear button — the
            reset action now lives where the rest of the color-editing UI
            is, shown only once an override actually exists (same
            conditional-visibility convention 035 already used). */}
        {scenario.colorOverride && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full justify-center text-xs text-muted-foreground"
            onClick={() => appState.clearColorOverride(scenario.name)}
          >
            <RotateCcw className="h-3 w-3" />
            Reset to default
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
