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

// 061-appearance-controls, restyled for the Corridor Pro redesign (project-docs/redesign/prototype `.te-row`): one row per
// role, label left, a 34x28 swatch that opens the popover picker, and the hex readout. The picker itself
// (components/ui/color-picker.tsx) is unchanged.

/** The stylesheet custom property that holds each role's current (adapted) colour when nothing is configured. */
const FALLBACK_VAR: Record<InterfaceColorRole, string> = {
  primary: '--primary',
  secondary: '--c-2',
  accent: '--c-3',
}

function toHex(value: string): string {
  try {
    return Color(value).hex().toLowerCase()
  } catch {
    return value
  }
}

export function InterfaceColorControl({ role, label }: { role: InterfaceColorRole; label: string }) {
  // Re-renders on any override change (and, via the colour-scheme hook, on a real theme flip, which changes the
  // stylesheet fallback read below with no React state involved).
  const colors = useInterfaceColors()
  useColorScheme()
  const hasOverride = getInterfaceColorOverride(role) !== undefined
  const effectiveColor =
    colors[role].color ?? (getComputedStyle(document.documentElement).getPropertyValue(FALLBACK_VAR[role]).trim() || '#000000')

  return (
    <div className="grid max-w-[340px] grid-cols-[1fr_34px_76px] items-center gap-2.5 py-[5px]">
      <span>{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={`interface-color-swatch-${role}`}
            className="h-7 w-[34px] cursor-pointer rounded-[9px] border border-[var(--glass-line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
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
      <code className="font-mono text-xs text-[var(--mute)]" data-testid={`interface-color-hex-${role}`}>
        {toHex(effectiveColor)}
      </code>
    </div>
  )
}
