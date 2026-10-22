import { Suspense } from 'react'

import { PanelErrorBoundary } from '@/layout/panelCard'
import type { PanelConfig, ValueBoxPanelConfig } from '@/layout/types'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { HeroCalibration } from '@/panels/HeroCalibration'
import { HeroKpi } from '@/panels/HeroKpi'
import { PanelLoadingState } from '@/panels/PanelLoadingState'
import { registry } from '@/panels/registry'

// One cell of the hero KPI band (project-docs/redesign/02-layout-and-components.md section 1.4): a muted label over the
// value panel, cells divided by a hairline. The value panel draws itself in its `_hero` presentation.
/** A value with no gauge, sparkline or baseline trend of its own: the hero draws it from the view context instead. */
function isPlainKpi(c: ValueBoxPanelConfig): boolean {
  return !c.gauge && !c.sparkline && !c.baseline_trend
}

export function HeroCell({ config }: { config: PanelConfig }) {
  const PanelComponent = registry[config.type]
  return (
    <div className="@container min-w-0 border-l border-[var(--line)] px-5 pb-[14px] pt-4 first:border-l-0 max-[1100px]:[&:nth-child(n+3)]:border-t max-[1100px]:[&:nth-child(3)]:border-l-0 max-[1100px]:[&:last-child:nth-child(odd)]:col-span-2">
      <div>
        <small className="font-body text-[13px] font-semibold text-[var(--mute)]">{config.title}</small>
        {/* a plain value (no gauge) follows the focus scenario and shows its delta and sparkline */}
        {config.type === 'valuebox' && (config as ValueBoxPanelConfig).kpi === 'calibration' ? (
          <PanelErrorBoundary panelTitle={config.title}>
            <HeroCalibration config={config as ValueBoxPanelConfig} />
          </PanelErrorBoundary>
        ) : config.type === 'valuebox' && isPlainKpi(config as ValueBoxPanelConfig) ? (
          <PanelErrorBoundary panelTitle={config.title}>
            <HeroKpi config={config as ValueBoxPanelConfig} />
          </PanelErrorBoundary>
        ) : PanelComponent ? (
          <PanelErrorBoundary panelTitle={config.title}>
            <Suspense fallback={<PanelLoadingState height={config.height} />}>
              <PanelComponent config={{ ...(config as object), _hero: true } as unknown as PanelConfig} />
            </Suspense>
          </PanelErrorBoundary>
        ) : (
          <PanelErrorState message={`Unknown panel type: "${config.type}"`} />
        )}
      </div>
    </div>
  )
}
