import { AdaptiveSwitch } from '@/components/ui/adaptive-switch'
import { settingValue } from '@/config'
import type { SwitchMode } from '@/lib/switchForm'
import { getSiteSettings } from '@/state/siteSettings'

// The control bar's model year (`controls.years`): every year as a strip when it fits, otherwise the selected year as a pill
// that opens a menu (the same control as a tile's views, components/ui/adaptive-switch.tsx). A year's milestone name (years.list
// `label`) is the strip's tooltip and is written beside it in the menu. With one model year there is nothing to choose: that
// year is shown in the same filled pill, as plain text.

const MODE: Record<string, SwitchMode> = { auto: 'auto', strip: 'switch', menu: 'menu' }

export function YearControl({ years, year, onChange }: { years: { year: number; label?: string }[]; year: number; onChange: (year: number) => void }) {
  const mode = MODE[String(settingValue('controls.years', { site: getSiteSettings() }))] ?? 'auto'
  const list = years.length > 0 ? years : [{ year }]
  if (list.length === 1) {
    const only = list[0]
    return (
      <span
        data-testid="control-year"
        aria-label={`Model year ${only.year}${only.label ? `, ${only.label}` : ''}`}
        title={only.label ? `${only.year}, ${only.label}` : undefined}
        className="pill-track inline-flex shrink-0 rounded-full p-1"
      >
        <span className="pill-on rounded-full px-[13px] py-[5px] font-body text-sm leading-[1.45] tabular-nums">{only.year}</span>
      </span>
    )
  }
  return (
    <AdaptiveSwitch
      label="Model year"
      size="lg"
      mode={mode}
      data-testid="control-year"
      className="shrink"
      value={String(year)}
      options={list.map((y) => ({ id: String(y.year), label: String(y.year), detail: y.label }))}
      onChange={(id) => onChange(Number(id))}
    />
  )
}
