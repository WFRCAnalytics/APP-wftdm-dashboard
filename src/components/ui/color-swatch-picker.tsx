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

// The app's one "pick a colour" control: a small swatch that opens a popover with the ColorPicker (components/ui/color-picker.tsx),
// and a Reset button once there is something to reset. The Scenarios tab, the interface colours and the chart builder's series
// colours all use it, so a colour is chosen the same way everywhere. `value` is any colour the `color` package can read.
export function ColorSwatchPicker({
  value,
  onChange,
  onReset,
  label,
  swatchClassName,
  testId,
}: {
  value: string
  /** The chosen colour as a hex string. */
  onChange: (hex: string) => void
  /** Shows a "Reset to default" button when given. */
  onReset?: () => void
  /** The swatch's accessible name. */
  label: string
  /** The swatch's size, shape and border. */
  swatchClassName: string
  testId?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className={`cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] ${swatchClassName}`}
          style={{ backgroundColor: value }}
          aria-label={label}
        />
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <ColorPicker value={value} className="gap-3" onChange={([r, g, b]) => onChange(Color.rgb(r, g, b).hex())}>
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
        {onReset && (
          <Button variant="ghost" size="sm" className="mt-3 w-full justify-center text-xs text-muted-foreground" onClick={onReset}>
            <RotateCcw className="h-3 w-3" />
            Reset to default
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
