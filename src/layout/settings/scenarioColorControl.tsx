import { ColorSwatchPicker } from '@/components/ui/color-swatch-picker'
import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { resolveScenarioColor } from '@/panels/scenarioDisplay'
import * as appState from '@/state/appState'
import type { Scenario } from '@/state/appState'

// 036-scenario-color-picker (Part B) — a small swatch opening a Popover with the adapted ColorPicker, now through the app's one
// ColorSwatchPicker (components/ui/color-swatch-picker.tsx). Reads its own displayed color from useScenarioDisplay() — the SAME hook
// every chart panel already reads from — so the Scenarios tab's own swatch is guaranteed to agree with what's actually rendered
// everywhere else (contracts/scenario-color-resolution.md's Read path). The reset action (FR-016) is shown only once an override
// exists. appState's own colorOverride contract is a hex string, which is what the picker hands back.
export function ScenarioColorControl({ scenario }: { scenario: Scenario }) {
  const scenarioDisplay = useScenarioDisplay()
  const effectiveColor = resolveScenarioColor(scenario.name, scenarioDisplay) ?? '#000000'

  return (
    <ColorSwatchPicker
      value={effectiveColor}
      onChange={(hex) => appState.setColorOverride(scenario.name, hex)}
      onReset={scenario.colorOverride ? () => appState.clearColorOverride(scenario.name) : undefined}
      label={`Color for ${scenario.name}`}
      testId={`scenario-color-swatch-${scenario.name}`}
      swatchClassName="h-[30px] w-[30px] shrink-0 rounded-full border-2 border-[var(--surface)] shadow-[0_0_0_1px_var(--line)]"
    />
  )
}
