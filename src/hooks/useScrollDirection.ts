// Real scroll-direction tracking for the nav-bar auto-hide behavior
// (shell.tsx). Investigated directly before writing this (not assumed):
// shell.tsx's outer wrapper is `min-h-screen` with no `overflow`/`h-screen`
// anywhere in the ancestor chain up to it (confirmed via grep across
// src/layout, src/panels) — the WHOLE page scrolls as one unit, on
// `window`/`document`, not inside some inner container. Individual panel
// types (Dialog, Table, Markdown, the Settings modal's own TabsContent)
// each scroll their OWN small internal region, but none of those wrap the
// page's real top-level content — so this hook listens on `window`,
// correctly matching what actually scrolls here.
//
// Same useSyncExternalStore external-store shape as hooks/useColorScheme.ts
// (a read-only DOM-observing hook, not app state — mirrors its subscribe/
// getSnapshot split exactly). `direction` is intentionally module-level,
// not per-hook-instance: there is exactly one real window scroll position
// for the whole page, a genuine singleton, the same reasoning
// state/basemapState.ts's own module-level value already relies on for a
// single app-wide value.
import { useSyncExternalStore } from 'react'

export type ScrollDirection = 'up' | 'down'

// Ignores sub-threshold deltas (rubber-band bounce, sub-pixel rounding, a
// viewer's hand twitching on a trackpad) so the bar doesn't flicker on
// near-zero scroll movement.
const DIRECTION_THRESHOLD_PX = 8
// Always reports 'up' (visible) at/near the very top of the page —
// otherwise the very first pixel of scroll on page load could immediately
// hide the bar before the viewer has scrolled meaningfully at all.
const NEAR_TOP_PX = 8

let direction: ScrollDirection = 'up'

function getSnapshot(): ScrollDirection {
  return direction
}

// SSR/no-DOM safety net — this app has no server-rendering path today, but
// useSyncExternalStore requires a getServerSnapshot whenever `window` isn't
// guaranteed to exist; 'up' (visible) is the safe default.
function getServerSnapshot(): ScrollDirection {
  return 'up'
}

/**
 * Attaches a real `window` scroll listener, throttled via
 * requestAnimationFrame — the standard "coalesce to at most once per
 * animation frame" pattern, so the actual direction comparison (a handful
 * of arithmetic ops) never runs on every raw scroll event, only once per
 * frame at most, satisfying "don't run expensive work on every raw scroll
 * event" without needing a separate debounce timer/library.
 */
function subscribeEnabled(onChange: () => void): () => void {
  let lastScrollY = window.scrollY
  direction = 'up'
  let ticking = false

  function computeDirection() {
    const currentY = window.scrollY
    let next = direction
    if (currentY <= NEAR_TOP_PX) {
      next = 'up'
    } else {
      const delta = currentY - lastScrollY
      if (Math.abs(delta) >= DIRECTION_THRESHOLD_PX) {
        next = delta > 0 ? 'down' : 'up'
      }
    }
    lastScrollY = currentY
    ticking = false
    if (next !== direction) {
      direction = next
      onChange()
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true
      requestAnimationFrame(computeDirection)
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  return () => window.removeEventListener('scroll', onScroll)
}

// No-op subscription for the disabled case ('fixed' nav-bar mode, where the
// caller never needs scroll direction at all) — skips attaching any real
// listener, rather than attaching one and simply ignoring its output.
function subscribeDisabled(_onChange: () => void): () => void {
  direction = 'up'
  return () => {}
}

/**
 * `enabled: false` skips attaching a real scroll listener entirely and
 * always reports 'up' — used by shell.tsx to avoid any scroll-tracking
 * overhead while nav-bar visibility mode is 'fixed', where the result is
 * never consulted anyway.
 */
export function useScrollDirection(enabled: boolean): ScrollDirection {
  return useSyncExternalStore(
    enabled ? subscribeEnabled : subscribeDisabled,
    getSnapshot,
    getServerSnapshot,
  )
}
