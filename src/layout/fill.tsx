import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// A tile that fills the space its page gives it (tabbed pages, project-docs/redesign/10-toolbar-layout-export-proposal.md
// section C.4). The tile measures its body and reports the height here; panels draw at that height instead of the
// authored `height`.
interface FillValue {
  active: boolean
  /** Measured body height in px, once known. */
  height?: number
  report(height: number): void
}

const FillContext = createContext<FillValue>({ active: false, report: () => {} })
export const useFill = () => useContext(FillContext)

export function FillProvider({ children }: { children: ReactNode }) {
  const [height, setHeight] = useState<number | undefined>()
  // quantised: a one-pixel wobble must not redraw every chart
  const report = useCallback((h: number) => setHeight((prev) => (prev !== undefined && Math.abs(prev - h) < 3 ? prev : Math.round(h))), [])
  const value = useMemo(() => ({ active: true, height, report }), [height, report])
  return <FillContext.Provider value={value}>{children}</FillContext.Provider>
}

/** `config` drawn at the measured height; unchanged when the tile does not fill or has not been measured yet. */
export function withFillHeight<T extends object>(config: T, fill: FillValue): T {
  if (!fill.active || !fill.height) return config
  const { height_rows: _rule, ...rest } = config as T & { height_rows?: unknown }
  return { ...rest, height: fill.height } as T
}
