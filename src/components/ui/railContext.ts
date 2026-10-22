import { createContext, useContext } from 'react'

/** True inside a tile's control rail (tabbed pages): controls stack vertically and take the rail's width. */
export const RailContext = createContext(false)
export const useInRail = () => useContext(RailContext)
