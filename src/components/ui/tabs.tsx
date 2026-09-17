import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

// Demonstrates: muted/muted-foreground (inactive tab), background +
// shadow-sm (active indicator — see TabsTrigger's own comment for why
// this isn't `accent`) — data-model.md's Component table. TabsTrigger
// uses font-heading (navigation-like label); panel content inherits
// font-body.
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

// 061-appearance-controls (follow-up): the active-tab treatment used to be
// `bg-accent`/`text-accent-foreground` — invisible in light mode because
// `--accent` is byte-identical to the TabsList's own `bg-muted` track
// there. Confirmed directly against shadcn's own real, current source
// (both fetched live) that this is NOT how shadcn itself solves the exact
// same collision — its own default theme has the identical --accent ==
// --muted collision in light mode (apps/v4/app/globals.css: both
// oklch(0.97 0 0)), and its own real TabsTrigger
// (apps/v4/registry/new-york-v4/ui/tabs.tsx) never uses `bg-accent` for
// the active state AT ALL, in either theme — light mode uses `bg-background`
// (a third, genuinely distinct token) + `shadow-sm` for a "raised chip"
// look; dark mode uses `bg-input`/`border-input` instead. Ported here
// (light-mode classes byte-for-byte matching the real source; dark mode
// adapted the same way) rather than the token-level workaround an earlier
// pass tried (tokens.css's own comment on --accent has the full history) —
// `--accent` itself is reverted to shadcn's real, intended value.
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm border border-transparent px-3 py-1.5 font-heading text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30',
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
