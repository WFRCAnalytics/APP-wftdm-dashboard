import { useCallback, useRef, useSyncExternalStore } from 'react'

import { subscribe as subscribeToOverrides, getInterfaceColorOverride } from '@/state/interfaceColorState'
import {
  computeForegroundFor,
  resolveInterfaceColor,
  type InterfaceColorRole,
} from '@/panels/interfaceColor'

export interface ResolvedInterfaceColor {
  /** The resolved color, or `undefined` meaning "use tokens.css's own
   * current, unconfigured value for this role" — this hook never invents
   * a color when neither a viewer override nor a deployer default is
   * set. */
  color: string | undefined
  /** Only present alongside a resolved `color` — tokens.css's own
   * `-foreground` value already applies via the ordinary cascade when
   * `color` is undefined, so no computation is needed in that case. */
  foreground: string | undefined
}

export type InterfaceColorMap = Record<InterfaceColorRole, ResolvedInterfaceColor>

const ROLES: InterfaceColorRole[] = ['primary', 'secondary', 'accent']

function resolveRole(role: InterfaceColorRole): ResolvedInterfaceColor {
  const color = resolveInterfaceColor(role, getInterfaceColorOverride(role))
  return { color, foreground: color ? computeForegroundFor(color) : undefined }
}

/**
 * 061-appearance-controls — mirrors hooks/useScenarioDisplay.ts's own
 * useSyncExternalStore + memoized-cache shape: resolveRole() builds a new
 * object every call, so an unmemoized snapshot would fail
 * useSyncExternalStore's Object.is comparison on every render (or loop).
 * The cache is only replaced when a role's own resolved color/foreground
 * actually differs.
 *
 * Unlike useScenarioDisplay.ts, this hook itself does NOT need
 * useColorScheme() — an override/deployer default is a single, flat
 * value applied identically in both themes, and the `color: undefined`
 * ("unconfigured, defer to the cascade") case is exactly what lets
 * appearanceTab.tsx's own inline-style effect removeProperty() instead
 * of pinning a stale resolved value, so the app's REAL rendered UI
 * (buttons etc., which reference `var(--primary)` via ordinary Tailwind
 * classes) keeps tracking live theme changes with no JS involved.
 *
 * A real, confirmed correction: this reasoning does NOT extend to a
 * PREVIEW SWATCH that needs a concrete color to paint (layout/settings/
 * interfaceColorControl.tsx) — that component reads tokens.css's current
 * value itself via a raw getComputedStyle() call when `color` here is
 * undefined, and that read has no reactivity of its own. A live theme
 * change with no accompanying `mode` state change (an OS-level
 * prefers-color-scheme flip while Theme mode is "System" — the app's
 * matchMedia listener mutates `.dark` directly on document.documentElement,
 * no React state involved) left that swatch showing a stale color until
 * some unrelated re-render happened to refresh it. Fixed at the
 * component itself (not here) by having it call useColorScheme() too —
 * see that file's own comment for the full finding.
 */
export function useInterfaceColors(): InterfaceColorMap {
  const cache = useRef<InterfaceColorMap | null>(null)

  const getSnapshot = useCallback(() => {
    const prev = cache.current
    let changed = !prev
    if (prev) {
      for (const role of ROLES) {
        const next = resolveRole(role)
        if (next.color !== prev[role].color) {
          changed = true
          break
        }
      }
    }
    if (changed) {
      const next = {} as InterfaceColorMap
      for (const role of ROLES) next[role] = resolveRole(role)
      cache.current = next
    }
    return cache.current!
  }, [])

  return useSyncExternalStore(subscribeToOverrides, getSnapshot)
}
