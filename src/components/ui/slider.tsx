import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

import { cn } from '@/lib/utils'

// 061-appearance-controls — this app's first standalone Slider primitive.
// @radix-ui/react-slider is already installed (used inline inside
// components/ui/color-picker.tsx's own ColorPickerHue/ColorPickerAlpha,
// which stay untouched — that file is kept pristine per its own
// established convention, research.md §6). Follows this project's own
// established shadcn-pattern adaptation (forwardRef + ElementRef/
// ComponentPropsWithoutRef + cn, matching checkbox.tsx/label.tsx above)
// rather than color-picker.tsx's own hue-gradient-specific track styling,
// since this is a generic, neutral-track slider for an ordinary numeric
// preference, not a color channel.
// One thumb per value: `value={[lo, hi]}` is a range slider (the flow map's volume filter). `thumbLabels` names each
// thumb; without it every thumb takes `aria-label`. `parts` restyles the track, range and thumbs and `track` draws inside
// the track, under the thumbs (the volume filter's colour ramp with its washed-out ends).
export interface SliderParts {
  track?: string
  trackStyle?: React.CSSProperties
  range?: string
  thumb?: string
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { thumbLabels?: string[]; parts?: SliderParts; track?: React.ReactNode }
>(({ className, 'aria-label': ariaLabel, thumbLabels, parts, track, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    data-slot="slider"
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className={cn('relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary', parts?.track)} style={parts?.trackStyle}>
      {track}
      <SliderPrimitive.Range className={cn('absolute h-full bg-primary', parts?.range)} />
    </SliderPrimitive.Track>
    {/* Radix's own accessible-name resolution reads `aria-label` off the
        Thumb itself, not the Root (confirmed directly against the
        installed @radix-ui/react-slider source's SliderThumbTrigger) —
        Root merely spreads unrecognized props onto its own wrapping
        <span>, which never reaches the nested Thumb. Pulled out of
        `...props` above and applied here explicitly instead. */}
    {Array.from({ length: (props.value ?? props.defaultValue ?? [0]).length }, (_, i) => (
      <SliderPrimitive.Thumb
        key={i}
        aria-label={thumbLabels?.[i] ?? ariaLabel}
        className={cn(
          'block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          parts?.thumb,
        )}
      />
    ))}
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
