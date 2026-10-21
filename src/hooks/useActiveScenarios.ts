import { useResolvedView } from '@/hooks/useViewContext'

/**
 * The run names every unpinned `$scenario` panel shows: the view context's `active` list, i.e. the compare set (or the
 * focus alone when Compare is off) resolved to its runs for the current model year
 * (project-docs/redesign/03-state-and-compare.md §2). Re-renders only when that list changes content.
 *
 * Hook signature is unchanged from the pre-redesign version, which returned appState's raw active set; with no
 * years and Compare on, the two are identical. No Vitest unit test for the hook (vitest's `environment: 'node'`
 * has no React renderer); the resolution itself is tested in tests/unit/viewContext.test.ts.
 */
export function useActiveScenarios(): string[] {
  return useResolvedView().active
}
