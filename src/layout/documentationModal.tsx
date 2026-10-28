import type { ReactNode } from 'react'

import { GroupHeading, TabHeader } from '@/layout/settings/settingsParts'

// The Documentation content (project-docs/redesign/02-layout-and-components.md section 4.4). Documentation is the fourth tab
// of the Settings modal (layout/settingsModal.tsx), not a modal of its own; this file is the content source it renders.
// Static text: how Focus / Compare / Reference work, how each chart compares (the strategy matrix of
// project-docs/redesign/03-state-and-compare.md section 4), model years, calibration rounds, observed data, reading many
// scenarios, shortcuts and the data itself.

const COMPARE_ROWS: [string, string][] = [
  [
    'Bars, lines, dumbbells, tables',
    'Every compared scenario on the same axes, with the reference as a dashed line. Change mode centres the chart on zero.',
  ],
  ['Treemap', "Side by side with shared scales, or one treemap coloured by each cell's change from the reference."],
  ['Sunburst, waffle, ridgeline', 'Side by side, up to four at a time, paged.'],
  [
    'Donut, flow, chord, slope',
    'One scenario at a time with a selector. In Change mode the donut turns into a difference chart.',
  ],
  ['Maps', 'Values side by side (up to four), Difference fill, or Swipe between the reference and the focus.'],
  ['Radar and population', 'Do not vary by scenario, so they stay the same.'],
]

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-[var(--line)] bg-[var(--tile-hi)] px-1.5 py-px font-mono text-xs">{children}</kbd>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="mb-2.5 max-w-[72ch]">{children}</p>
}

export function DocumentationContent() {
  return (
    <div>
      <TabHeader title="Documentation">How to read this dashboard.</TabHeader>

      <GroupHeading className="mt-0">Focus and compare</GroupHeading>
      <P>
        The control bar always holds a <b>focus</b> scenario. Every chart shows that scenario on its own. Turn on{' '}
        <b>Compare</b> to bring in more scenarios and a <b>reference</b> to measure against. Values shows each scenario as
        is, Change shows the difference in the same units, and % change shows the relative difference.
      </P>

      <GroupHeading>How each chart compares</GroupHeading>
      <table className="mb-3.5 mt-1.5 w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-[var(--line)] px-2.5 py-[7px] text-left text-[12.5px] font-medium text-[var(--mute)]">Chart</th>
            <th className="border-b border-[var(--line)] px-2.5 py-[7px] text-left text-[12.5px] font-medium text-[var(--mute)]">In compare mode</th>
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map(([chart, how]) => (
            <tr key={chart}>
              <td className="border-b border-[var(--grid)] px-2.5 py-[9px] align-top">{chart}</td>
              <td className="border-b border-[var(--grid)] px-2.5 py-[9px] align-top">{how}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <GroupHeading>Model years</GroupHeading>
      <P>
        Every scenario group has a run for each model year the deployment publishes. The Year control switches every chart at
        once. In the base year all scenario groups equal the baseline, because nothing has been built yet. Observed data and
        calibration rounds belong to the base year, so they appear only there. The Across model years chart shows the whole
        path, and clicking a year switches to it.
      </P>

      <GroupHeading>Calibration rounds</GroupHeading>
      <P>
        A calibration run can have fifty rounds or more. Rounds are an ordered series, so they are drawn on a colour ramp
        from early to late and chosen from a strip in the scenario picker. The Calibration progress chart plots the metrics
        you tune, such as mode share, volumes and boardings, for every round at once, with the target band shaded. Click a
        round to focus it, or shift-click to add it to the comparison.
      </P>

      <GroupHeading>Observed data</GroupHeading>
      <P>
        Observed values are published as aggregates only, each with its source and sample size. Where a margin of error is
        known, bars show it as a shaded band and tooltips say when a gap is within it.
      </P>

      <GroupHeading>Reading many scenarios</GroupHeading>
      <P>
        The scorecard shades every cell by its distance from the reference, so all compared scenarios fit in one view. Hover
        a name in any legend to isolate that scenario in the chart. In side-by-side views, hovering a shape highlights the
        same shape in every panel and one tooltip lists each scenario with its change from the reference.
      </P>

      <GroupHeading>Shortcuts</GroupHeading>
      <P>
        <Kbd>Esc</Kbd> closes any open panel. Arrow keys move the swipe handle. Click a column header in the scorecard to
        sort.
      </P>

      <GroupHeading>About the data</GroupHeading>
      <P>
        The charts read post-processed Parquet summaries published with each scenario. Observed values come from the survey
        data the deployment publishes alongside them.
      </P>
    </div>
  )
}
