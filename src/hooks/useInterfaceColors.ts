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
 * Unlike useScenarioDisplay.ts, this hook does NOT need useColorScheme()
 * — a Primary/Secondary/Accent override/deployer default is a single,
 * flat value applied identically in both themes (spec.md's own
 * Assumptions); only the tokens.css fallback (color: undefined) is
 * theme-paired, and that case needs no JS-side resolution at all — the
 * ordinary stylesheet cascade already handles it.
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
