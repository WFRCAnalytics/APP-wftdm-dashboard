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
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, 'aria-label': ariaLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    data-slot="slider"
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    {/* Radix's own accessible-name resolution reads `aria-label` off the
        Thumb itself, not the Root (confirmed directly against the
        installed @radix-ui/react-slider source's SliderThumbTrigger) —
        Root merely spreads unrecognized props onto its own wrapping
        <span>, which never reaches the nested Thumb. Pulled out of
        `...props` above and applied here explicitly instead. */}
    <SliderPrimitive.Thumb
      aria-label={ariaLabel}
      className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
