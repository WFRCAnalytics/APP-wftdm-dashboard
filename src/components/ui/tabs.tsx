import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

// Demonstrates: muted/muted-foreground (inactive tab), accent (active
// indicator) — data-model.md's Component table. TabsTrigger uses
// font-heading (navigation-like label); panel content inherits font-body.
const Tabs = TabsPrimitive.Root

// 021-basemap-catalog-redesign (T025): data-[orientation=vertical]:
// variants added alongside the existing horizontal-row classes — Radix
// sets data-orientation on List/Trigger automatically from the Root's own
// orientation prop, so no new prop threading is needed here. navBar.tsx's
// existing horizontal usage passes no orientation prop at all and is
// therefore unaffected: Radix's own default ("horizontal") continues to
// apply, and none of the new vertical variants match.
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
      'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-40 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:justify-start',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 font-heading text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground',
      'data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-[orientation=vertical]:text-left',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      // UI polish pass (post-merge correction): data-[state=inactive]:!hidden
      // is load-bearing, not decorative. Radix already sets the native
      // `hidden` HTML attribute on inactive content, but the browser's own
      // `[hidden] { display: none }` rule is a user-agent-origin default —
      // ANY author-defined display utility a caller passes via `className`
      // (e.g. basemapTab.tsx's own `flex`) wins the cascade over it
      // regardless of selector specificity, since author styles beat
      // user-agent styles unless the UA rule is !important (it isn't).
      // Confirmed directly, via a live Playwright reproduction: with a
      // `flex` TabsContent inactive, its computed `display` was `flex`, not
      // `none` — it stayed a real flex item in the shared Tabs Root's row,
      // silently splitting that row's width with whichever tab WAS active
      // and shifting that tab's own position. The `!` (important) modifier
      // here forces `display: none !important` whenever `data-state`
      // reports inactive, unconditionally overriding any display utility a
      // caller applies on top — a fix at the shared primitive, not a
      // one-off workaround in basemapTab.tsx alone, since any future
      // TabsContent usage with a non-block display utility would hit the
      // exact same bug.
      'mt-2 font-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=inactive]:!hidden',
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
