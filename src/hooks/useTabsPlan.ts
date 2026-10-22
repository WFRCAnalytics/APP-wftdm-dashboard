import { useMemo } from 'react'

import { useResolvedView } from '@/hooks/useViewContext'
import { planTabs, type TabsPlan } from '@/layout/dashboardLayout'
import type { DashboardTabConfig } from '@/layout/types'
import { resolveLayoutMode, useLayoutVersion } from '@/state/layoutState'

/** The tabbed form of `tab` when this page is shown as tabs (viewer, page and deployment settings), else null. */
export function useTabsPlan(tab: DashboardTabConfig | undefined): TabsPlan | null {
  const view = useResolvedView()
  const version = useLayoutVersion()
  return useMemo(() => {
    if (!tab || tab.header.full_page) return null
    if (resolveLayoutMode(tab.header.layout_mode) !== 'tabs') return null
    return planTabs(tab, { compare: view.compare, isBaseYear: view.isBaseYear })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, view.compare, view.isBaseYear, version])
}
