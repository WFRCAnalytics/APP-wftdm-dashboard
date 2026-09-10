import * as React from 'react'
import Color from 'color'
import { PipetteIcon } from 'lucide-react'
import * as SliderPrimitive from '@radix-ui/react-slider'

import { cn } from '@/lib/utils'
import { clampByte, parseHexColor } from '@/lib/colorFormat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// 036-scenario-color-picker — adapted from the real, current
// shadcnblocks/kibo `color-picker` package (packages/color-picker/
// index.tsx, fetched directly — "modeled after the color picker in
// Figma," per that package's own description). Same forwardRef/
// namespaced-@radix-ui-import/cn/single-quote conventions as this
// project's other primitives. `@radix-ui/react-slider` is used directly,
// INLINE, inside ColorPickerHue/ColorPickerAlpha below — matching the
// real source's own file structure exactly (no separate shared
// components/ui/slider.tsx; research.md §5, a deliberate choice, not an
// oversight).
//
// The ONE deliberate behavior change from the real source: every
// ColorPickerFormat Input there is `readOnly` (a viewer sets color only
// via ColorPickerSelection/the sliders/the eyedropper). This project's
// own spec (FR-009/FR-010) requires direct, editable hex and RGB entry —
// confirmed with the user directly as a real trade-off before building
// this (specs/036-scenario-color-picker/spec.md's own Research section)
// — so hex/RGB Inputs here are genuinely editable, parsed via
// lib/colorFormat.ts's clampByte()/parseHexColor() and written back into
// this same shared context, never propagating an incomplete/invalid
// value (data-model.md §4).

interface ColorPickerContextValue {
  hue: number
  saturation: number
  lightness: number
  alpha: number
  mode: string
  setHue: (hue: number) => void
  setSaturation: (saturation: number) => void
  setLightness: (lightness: number) => void
  setAlpha: (alpha: number) => void
  setMode: (mode: string) => void
}

const ColorPickerContext = React.createContext<ColorPickerContextValue | undefined>(undefined)

export function useColorPicker() {
  const context = React.useContext(ColorPickerContext)
  if (!context) {
    throw new Error('useColorPicker must be used within a ColorPicker')
  }
  return context
}

export interface ColorPickerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: Parameters<typeof Color>[0]
  defaultValue?: Parameters<typeof Color>[0]
  onChange?: (value: [number, number, number, number]) => void
}

export function ColorPicker({ value, defaultValue = '#000000', onChange, className, ...props }: ColorPickerProps) {
  const selectedColor = Color(value ?? defaultValue)
  const defaultColor = Color(defaultValue)

  const [hue, setHue] = React.useState(selectedColor.hue() || defaultColor.hue() || 0)
  const [saturation, setSaturation] = React.useState(
    selectedColor.saturationl() || defaultColor.saturationl() || 100,
  )
  const [lightness, setLightness] = React.useState(selectedColor.lightness() || defaultColor.lightness() || 50)
  const [alpha, setAlpha] = React.useState(selectedColor.alpha() * 100 || defaultColor.alpha() * 100)
  const [mode, setMode] = React.useState('hex')

  // A REAL, confirmed circular-update bug found live (not in the real
  // source, which never round-trips value/onChange through the SAME
  // external state the way this project's own fully-controlled usage
  // does — scenarioColorControl.tsx passes BOTH): committing ANY local
  // edit (hex, RGB, the 2D area, a slider, the eyedropper) fires onChange
  // -> the caller writes it to appState -> appState's own resolved color
  // flows back in as a NEW `value` prop -> the sync effect below re-syncs
  // FROM that echoed-back value. For a single, isolated edit this is
  // harmless (syncing from your own just-committed color is a no-op) —
  // but firing R, then G, then B in quick succession means R's own
  // round-tripped echo can arrive AFTER G's local edit already ran,
  // silently overwriting G's change with R-only's color before B is even
  // typed (confirmed live, reproduced exactly this way). `lastEmittedHex`
  // tracks the hex string this component itself most recently emitted via
  // onChange — the sync effect skips re-syncing whenever the incoming
  // `value` matches it (an echo of our own edit, not a genuinely external
  // change), while still re-syncing normally for a REAL external change
  // (e.g. "Reset to default," or a different scenario's row being opened).
  const lastEmittedHex = React.useRef<string | null>(null)
  // A SECOND, independent half of the same fix: even for a GENUINELY
  // external value change (e.g. "Reset to default" — not an echo, so the
  // check above doesn't suppress it), the resulting hue/sat/light/alpha
  // update must NOT re-fire onChange — doing so calls back into the
  // caller's own store with the value it JUST told us to display,
  // immediately re-creating the override the reset was trying to clear.
  // onChange must fire only for a REAL user interaction (the 2D area, a
  // slider, the eyedropper, or lib/colorFormat.ts-driven hex/RGB commits),
  // never as a reaction to `value` changing out from under us.
  const isSyncingFromValue = React.useRef(false)

  // Update color when the controlled `value` prop changes (e.g. a
  // scenario's own effective color changed elsewhere — the color picker
  // popover re-syncs to it on next open).
  React.useEffect(() => {
    if (!value) return
    const color = Color(value)
    if (color.hex() === lastEmittedHex.current) return
    const [h, s, l] = color.hsl().array()
    isSyncingFromValue.current = true
    setHue(h)
    setSaturation(s)
    setLightness(l)
    setAlpha(color.alpha() * 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only
    // re-syncs when the CONTROLLED value itself changes, matching the
    // real source's own identical effect shape
  }, [value])

  React.useEffect(() => {
    if (isSyncingFromValue.current) {
      isSyncingFromValue.current = false
      return
    }
    if (!onChange) return
    const color = Color.hsl(hue, saturation, lightness).alpha(alpha / 100)
    lastEmittedHex.current = color.hex()
    const rgba = color.rgb().array()
    onChange([rgba[0], rgba[1], rgba[2], alpha / 100])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hue, saturation, lightness, alpha])

  return (
    <ColorPickerContext.Provider
      value={{ hue, saturation, lightness, alpha, mode, setHue, setSaturation, setLightness, setAlpha, setMode }}
    >
      <div className={cn('flex size-full flex-col gap-4', className)} {...props} />
    </ColorPickerContext.Provider>
  )
}

export type ColorPickerSelectionProps = React.HTMLAttributes<HTMLDivElement>

export const ColorPickerSelection = React.memo(({ className, ...props }: ColorPickerSelectionProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [positionX, setPositionX] = React.useState(0)
  const [positionY, setPositionY] = React.useState(0)
  const { hue, setSaturation, setLightness } = useColorPicker()

  const backgroundGradient = React.useMemo(() => {
    return `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)),
      linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)),
      hsl(${hue}, 100%, 50%)`
  }, [hue])

  const handlePointerMove = React.useCallback(
    (event: PointerEvent) => {
      if (!(isDragging && containerRef.current)) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
      setPositionX(x)
      setPositionY(y)
      setSaturation(x * 100)
      const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x)
      setLightness(topLightness * (1 - y))
    },
    [isDragging, setSaturation, setLightness],
  )

  React.useEffect(() => {
    const handlePointerUp = () => setIsDragging(false)
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging, handlePointerMove])

  return (
    <div
      ref={containerRef}
      className={cn('relative size-full cursor-crosshair rounded', className)}
      style={{ background: backgroundGradient }}
      onPointerDown={(e) => {
        e.preventDefault()
        setIsDragging(true)
        handlePointerMove(e.nativeEvent)
      }}
      {...props}
    >
      <div
        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{ left: `${positionX * 100}%`, top: `${positionY * 100}%`, boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }}
      />
    </div>
  )
})
ColorPickerSelection.displayName = 'ColorPickerSelection'

export type ColorPickerHueProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>

export const ColorPickerHue = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, ColorPickerHueProps>(
  ({ className, ...props }, ref) => {
    const { hue, setHue } = useColorPicker()
    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn('relative flex h-4 w-full touch-none', className)}
        max={360}
        step={1}
        value={[hue]}
        onValueChange={([h]) => setHue(h)}
        {...props}
      >
        <SliderPrimitive.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
          <SliderPrimitive.Range className="absolute h-full" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Root>
    )
  },
)
ColorPickerHue.displayName = 'ColorPickerHue'

export type ColorPickerAlphaProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>

export const ColorPickerAlpha = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, ColorPickerAlphaProps>(
  ({ className, ...props }, ref) => {
    const { alpha, setAlpha } = useColorPicker()
    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn('relative flex h-4 w-full touch-none', className)}
        max={100}
        step={1}
        value={[alpha]}
        onValueChange={([a]) => setAlpha(a)}
        {...props}
      >
        <SliderPrimitive.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')] bg-center bg-repeat-x dark:bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR4nGP8+vWrCAMewM3N/QafPBM+SWLAqAGDwQBGQgoIpZOB98KoAVQwAADxzQcSVIRCfQAAAABJRU5ErkJggg==')]">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent to-black/50 dark:to-white/50" />
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-transparent" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Root>
    )
  },
)
ColorPickerAlpha.displayName = 'ColorPickerAlpha'

export type ColorPickerEyeDropperProps = React.ComponentPropsWithoutRef<typeof Button>

export const ColorPickerEyeDropper = ({ className, ...props }: ColorPickerEyeDropperProps) => {
  const { setHue, setSaturation, setLightness, setAlpha } = useColorPicker()

  const handleEyeDropper = async () => {
    try {
      // @ts-expect-error -- EyeDropper is an experimental browser API
      // (Chromium-family only, confirmed absent from this project's
      // bundled DOM lib types) — degrades to a caught, silent no-op on
      // an unsupported browser, matching the real source's own handling.
      const eyeDropper = new EyeDropper()
      const result = await eyeDropper.open()
      const color = Color(result.sRGBHex)
      const [h, s, l] = color.hsl().array()
      setHue(h)
      setSaturation(s)
      setLightness(l)
      setAlpha(100)
    } catch (error) {
      console.error('EyeDropper failed:', error)
    }
  }

  return (
    <Button
      className={cn('shrink-0 text-muted-foreground', className)}
      onClick={handleEyeDropper}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <PipetteIcon size={16} />
    </Button>
  )
}

export type ColorPickerOutputProps = React.ComponentPropsWithoutRef<typeof SelectTrigger>

const FORMATS = ['hex', 'rgb']

export const ColorPickerOutput = ({ className, ...props }: ColorPickerOutputProps) => {
  const { mode, setMode } = useColorPicker()
  return (
    <Select value={mode} onValueChange={setMode}>
      <SelectTrigger className="h-8 w-20 shrink-0 text-xs" {...props}>
        <SelectValue placeholder="Mode" />
      </SelectTrigger>
      <SelectContent>
        {FORMATS.map((format) => (
          <SelectItem key={format} className="text-xs" value={format}>
            {format.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export type ColorPickerFormatProps = React.HTMLAttributes<HTMLDivElement>

export const ColorPickerFormat = ({ className, ...props }: ColorPickerFormatProps) => {
  const { hue, saturation, lightness, alpha, mode, setHue, setSaturation, setLightness } = useColorPicker()
  // Color.hsl()'s own 4-arg form silently drops alpha (confirmed live,
  // not assumed — a real bug caught during this feature's own
  // implementation) — the chained .alpha() call, matching this file's
  // own onChange effect above, is the only form that actually works.
  const color = Color.hsl(hue, saturation, lightness).alpha(alpha / 100)

  // Local, uncommitted draft text for each editable field — a raw
  // keystroke isn't always a valid, complete color yet (FR-014), so the
  // field's own displayed text tracks what the viewer is mid-typing,
  // while the shared hue/saturation/lightness context only updates once
  // parseHexColor()/a valid RGB byte actually resolves. Re-synced to the
  // real, committed color whenever it changes from elsewhere (the 2D
  // selection area, a slider, the eyedropper, or a controlled `value`
  // prop change).
  //
  // A REAL, confirmed bug found live, fixed here: committing an edit
  // (commitHex/commitRgbChannel) itself changes hue/saturation/lightness,
  // which recomputes `color`/`rgb` on the very next render — which then
  // re-triggers THESE SAME sync effects, since they watch that derived
  // color. Editing R then immediately G then B reproduced this exactly:
  // R's own commit's side-effect re-sync fired using the color state
  // that only reflected R's change, STOMPING the G field's own
  // just-typed, not-yet-committed draft back to its pre-edit value
  // before G's own commit had a chance to run. `isSelfEditRef` marks "an
  // edit just came from THIS component's own commit* function" so the
  // sync effects below can skip re-syncing in that one case — they still
  // fire normally for every real EXTERNAL change (dragging the 2D area,
  // a slider, the eyedropper, or a new controlled `value`).
  const isSelfEditRef = React.useRef(false)

  const [hexDraft, setHexDraft] = React.useState(color.hex())
  React.useEffect(() => {
    if (isSelfEditRef.current) return
    setHexDraft(color.hex())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color.hex()])

  const rgb = color.rgb().array().map((v) => Math.round(v)) as [number, number, number]
  const [rgbDraft, setRgbDraft] = React.useState<[string, string, string]>(rgb.map(String) as [string, string, string])
  React.useEffect(() => {
    if (isSelfEditRef.current) {
      isSelfEditRef.current = false
      return
    }
    setRgbDraft(rgb.map(String) as [string, string, string])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rgb[0], rgb[1], rgb[2]])

  function commitHex(text: string) {
    const parsed = parseHexColor(text)
    if (!parsed) return // FR-014: incomplete/invalid — leave the last valid color in effect
    isSelfEditRef.current = true
    const [h, s, l] = Color.rgb(...parsed).hsl().array()
    setHue(h)
    setSaturation(s)
    setLightness(l)
  }

  function commitRgbChannel(index: 0 | 1 | 2, text: string) {
    const nextRgb: [number, number, number] = [...rgb]
    const parsedNumber = Number(text)
    nextRgb[index] = Number.isNaN(parsedNumber) ? rgb[index] : clampByte(parsedNumber) // FR-015: clamp, never reject
    isSelfEditRef.current = true
    const [h, s, l] = Color.rgb(...nextRgb).hsl().array()
    setHue(h)
    setSaturation(s)
    setLightness(l)
  }

  if (mode === 'rgb') {
    return (
      <div className={cn('flex items-center gap-1', className)} {...props}>
        {rgbDraft.map((channelText, index) => (
          <Input
            key={index}
            className="h-8 w-12 bg-secondary px-1 text-center text-xs shadow-none"
            inputMode="numeric"
            value={channelText}
            aria-label={['Red', 'Green', 'Blue'][index]}
            onChange={(e) => {
              const next: [string, string, string] = [...rgbDraft]
              next[index as 0 | 1 | 2] = e.target.value
              setRgbDraft(next)
              commitRgbChannel(index as 0 | 1 | 2, e.target.value)
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-1', className)} {...props}>
      <Input
        className="h-8 flex-1 bg-secondary px-2 text-xs shadow-none"
        value={hexDraft}
        aria-label="Hex color"
        onChange={(e) => {
          setHexDraft(e.target.value)
          commitHex(e.target.value)
        }}
      />
    </div>
  )
}
