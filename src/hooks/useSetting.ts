import { createContext, useContext, useMemo } from 'react'

import { panelSettings, settingValue, type Tree } from '@/config'
import { getSiteSettings } from '@/state/siteSettings'

// A cascading deployer setting as a tile sees it: the site file, then the page it is on, then its own panel keys
// (src/config/setting.ts). The page level comes from PageSettingsContext, which DashboardRenderer provides.

const NONE: Tree = Object.freeze({}) as Tree

/** The settings of the page being rendered (`DashboardTabConfig.settings`). */
export const PageSettingsContext = createContext<Tree>(NONE)

/** `path` for the current page and, when given, a panel config (its `controls`, `charts` and `legend` keys). */
export function useSetting<T = unknown>(path: string, panel?: unknown): T {
  const page = useContext(PageSettingsContext)
  return useMemo(() => settingValue(path, { site: getSiteSettings(), page, panel: panelSettings(panel) }) as T, [path, page, panel])
}
