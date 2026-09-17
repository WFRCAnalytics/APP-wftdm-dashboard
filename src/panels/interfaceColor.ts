// 061-appearance-controls — resolution + auto-foreground for the three
// Primary/Secondary/Accent visual roles. Mirrors panels/scenarioDisplay.ts's
// own "module-level deployer default, set once at boot" shape
// (setDeployerScenarioPalette), generalized to a per-role map since there
// are three independent roles here, not one shared palette.
import Color from 'color'

export type InterfaceColorRole = 'primary' | 'secondary' | 'accent'

const deployerDefaults: Partial<Record<InterfaceColorRole, string>> = {}

/** Set once, at boot, from main.tsx — never a reactive store (a
 * deployer's own configuration is fixed for the session's lifetime).
 * `undefined` means "nothing configured for this role," falling through
 * to the dashboard's own current, unconfigured tokens.css value. */
export function setDeployerInterfaceColor(role: InterfaceColorRole, value: string | undefined): void {
  if (value) {
    deployerDefaults[role] = value
  } else {
    delete deployerDefaults[role]
  }
}

export function getDeployerInterfaceColor(role: InterfaceColorRole): string | undefined {
  return deployerDefaults[role]
}

/**
 * Resolves a role's effective color: a viewer's own session override,
 * else the deployer-configured default, else `undefined` (meaning "use
 * tokens.css's own current, unconfigured value for this role" — the
 * caller, hooks/useInterfaceColors.ts, is the one place with real DOM
 * access to read that fallback).
 */
export function resolveInterfaceColor(
  role: InterfaceColorRole,
  override: string | undefined,
): string | undefined {
  return override ?? deployerDefaults[role]
}

/**
 * Automatically computes a legible foreground for a given background
 * color — `#000000` or `#ffffff`, via the already-installed `color`
 * package's real `.isLight()` (research.md §4). No deployer or viewer
 * ever configures a foreground directly (FR-017).
 */
export function computeForegroundFor(hex: string): '#000000' | '#ffffff' {
  return Color(hex).isLight() ? '#000000' : '#ffffff'
}
