import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { Segmented, type SegmentedOption } from '@/components/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { switchForm, type SwitchForm, type SwitchMode } from '@/lib/switchForm'
import { cn } from '@/lib/utils'

// A Segmented that fits the room it is given (lib/switchForm.ts): every option with its label, then icons only, then the
// selected option alone, drawn as the same filled pill on the same track, opening a menu of all the options. Both switch
// forms are measured in a hidden copy, so the choice follows the real text width (fonts, text size) and not a guess.

export interface AdaptiveOption {
  id: string
  label: string
  /** Needed for the icons-only form; without an icon on every option that form is skipped. */
  icon?: ReactNode
  /** A longer description (a year's milestone): muted beside the label in the menu, and the switch's tooltip. */
  detail?: string
}

export interface AdaptiveSwitchProps {
  label: string
  options: AdaptiveOption[]
  value: string
  onChange: (id: string) => void
  mode?: SwitchMode
  /** `lg` for the control bar, `md` (default) for a tile. */
  size?: 'md' | 'lg'
  className?: string
  'data-testid'?: string
}

const fullOptions = (options: AdaptiveOption[]): SegmentedOption[] =>
  options.map((o) => ({ id: o.id, label: o.label, title: o.detail ? `${o.label}, ${o.detail}` : undefined, icon: o.icon ? <span className="inline-flex items-center gap-1.5">{o.icon}{o.label}</span> : undefined }))

export function AdaptiveSwitch({ label, options, value, onChange, mode = 'auto', size = 'md', className, 'data-testid': testId }: AdaptiveSwitchProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const fullRef = useRef<HTMLDivElement>(null)
  const iconsRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<SwitchForm>(mode === 'menu' ? 'menu' : 'full')
  const allIcons = options.every((o) => o.icon)

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => setForm(switchForm(mode, box.clientWidth, fullRef.current?.offsetWidth ?? 0, allIcons ? (iconsRef.current?.offsetWidth ?? 0) : null))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    if (fullRef.current) ro.observe(fullRef.current)
    return () => ro.disconnect()
  }, [mode, allIcons, options])

  const current = options.find((o) => o.id === value) ?? options[0]
  const withLabels = fullOptions(options)
  return (
    <div ref={boxRef} className={cn('relative flex min-w-0 flex-1 justify-end', className)} data-switch-form={form} data-testid={testId}>
      {form === 'full' && <Segmented label={label} size={size} value={value} options={withLabels} onChange={onChange} />}
      {form === 'icons' && <Segmented label={label} size={size} value={value} options={options.map((o) => ({ id: o.id, label: o.label, icon: o.icon }))} onChange={onChange} />}
      {form === 'menu' && current && (
        <span className={cn('pill-track inline-flex rounded-full', size === 'lg' ? 'p-1' : 'p-[3px]')}>
          <Select value={current.id} onValueChange={onChange}>
            <SelectTrigger
              hideChevron
              aria-label={label}
              title={`${label}: ${current.label}`}
              className={cn(
                'pill-on h-auto gap-1.5 rounded-full border-0 font-body leading-[1.45] shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)] [&_svg]:text-current',
                size === 'lg' ? 'px-[13px] py-[5px] text-sm' : 'px-[11px] py-1 text-[12.5px]',
              )}
            >
              {/* every option in one grid cell, only the selected one visible, so the pill is as wide as the longest option and
                  does not change width with the choice */}
              <span className="inline-grid">
                {options.map((o) => (
                  <span
                    key={o.id}
                    aria-hidden={o.id === current.id ? undefined : true}
                    className={cn('col-start-1 row-start-1 inline-flex items-center gap-1.5', o.id !== current.id && 'invisible')}
                  >
                    {o.icon}
                    <span>{o.label}</span>
                  </span>
                ))}
              </span>
              <ChevronDown className="size-3.5 text-current" aria-hidden="true" />
            </SelectTrigger>
            <SelectContent position="popper" align="end" sideOffset={8} className="min-w-[11rem]">
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <span className="flex items-center gap-2">
                    {o.icon}
                    {o.label}
                    {o.detail && <span className="text-[var(--mute)]">{o.detail}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      )}
      {/* the two switch forms at their natural width, out of sight and out of the tab order and accessibility tree */}
      <div aria-hidden="true" ref={(el) => { if (el) el.inert = true }} className="pointer-events-none invisible absolute right-0 top-0 flex flex-col items-end">
        <div ref={fullRef} className="w-max"><Segmented label={label} size={size} value={value} options={withLabels} onChange={() => {}} /></div>
        {allIcons && <div ref={iconsRef} className="w-max"><Segmented label={label} size={size} value={value} options={options.map((o) => ({ id: o.id, label: o.label, icon: o.icon }))} onChange={() => {}} /></div>}
      </div>
    </div>
  )
}
