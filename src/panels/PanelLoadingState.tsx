import { PanelSkeleton } from '@/panels/PanelSkeleton'
import { skeletonShape } from '@/panels/skeleton'

// 042-boot-performance-fix: Suspense fallback for a lazily-loaded panel component (panels/registry.tsx's React.lazy() entries),
// shown between a tab first rendering a panel of a given type and that type's JS chunk arriving. The config is known here, so the
// placeholder already has the silhouette of the chart (panels/skeleton.ts); the panel's own loading state (data still coming) uses
// the same PanelSkeleton, so the swap from one to the other does not move anything.
export interface PanelLoadingStateProps {
  height?: number
  /** The panel being loaded; picks the silhouette (a generic block without it). */
  config?: object
}

export function PanelLoadingState({ height, config }: PanelLoadingStateProps) {
  return <PanelSkeleton shape={skeletonShape(config)} height={height} />
}
