// 011-basemap-style-system: reads whichever light/dark theme is currently
// active by observing document.documentElement's Tailwind `.dark` class
// (tailwind.config.js: darkMode: ['class']) — does NOT control theme, only
// reads it, since no real theme-toggle UI exists in the app yet
// (research.md §3; the only place `.dark` is toggled today is
// src/demo/DesignTokenDemo.tsx, a deliberately out-of-band demo page).
// Same useSyncExternalStore external-store shape as useFilterState.ts/
// useActiveScenarios.ts — no bespoke subscription plumbing.
import { useSyncExternalStore } from 'react'

export type ColorScheme = 'light' | 'dark'

function getSnapshot(): ColorScheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.attributeName === 'class')) onChange()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, getSnapshot)
}
