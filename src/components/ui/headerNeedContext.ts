import { createContext, useContext } from 'react'

// In a tile header (layout/tileHeader.tsx) the view switch reports the width it needs to show every option with its label,
// so the header moves its other controls to the row below before the switch has to shrink. Elsewhere there is no receiver.
export const HeaderNeedContext = createContext<((width: number) => void) | null>(null)

export function useReportHeaderNeed(): ((width: number) => void) | null {
  return useContext(HeaderNeedContext)
}
