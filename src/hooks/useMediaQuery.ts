import { useSyncExternalStore } from 'react'

/** True while the CSS media query matches; re-renders on change. Same external-store shape as useColorScheme. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}
