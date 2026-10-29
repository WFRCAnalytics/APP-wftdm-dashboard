import type { ReactNode } from 'react'

import wfrcColor from '@/assets/logo/horizontal/WFRC_logo_horizontal_color_transparent.png'
import wfrcWhite from '@/assets/logo/horizontal/WFRC_logo_horizontal_white_transparent.png'
import { useColorScheme } from '@/hooks/useColorScheme'
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

const CREDITS: { name: string; href: string; role: string }[] = [
  { name: 'SimWrapper', href: 'https://simwrapper.github.io', role: 'Inspiration: viewing transport model output in the browser' },
  { name: 'Dash', href: 'https://github.com/gropaul/dash', role: 'Inspiration: a DuckDB interface, by Paul Gross (gropaul)' },
  { name: 'MapLibre GL', href: 'https://maplibre.org', role: 'Maps' },
  { name: 'Observable Plot', href: 'https://observablehq.com/plot/', role: 'Charts' },
  { name: 'DuckDB', href: 'https://duckdb.org', role: 'Every query, running in your browser through WebAssembly' },
]

// Credits sit first on the page. Outside logos are not loaded (no outside requests, works offline, no trademark use):
// each credit is a wordmark card that links out. WFRC's own logo ships with the app.
function AboutPanel() {
  const logo = useColorScheme() === 'dark' ? wfrcWhite : wfrcColor
  const card = 'flex flex-col gap-1 rounded-[14px] border border-[var(--line)] bg-[var(--tile-hi)] p-3.5 no-underline transition-colors hover:border-[var(--brand-text)] focus-visible:outline-2 focus-visible:outline-[var(--brand-text)]'
  return (
    <section aria-label="About" className="mb-6" data-testid="docs-about">
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[18px] border border-[var(--line)] bg-[var(--tile-hi)] p-4">
        <a href="https://wfrc.utah.gov" target="_blank" rel="noopener noreferrer" aria-label="Wasatch Front Regional Council">
          <img src={logo} alt="Wasatch Front Regional Council" className="h-10 w-auto" />
        </a>
        <p className="min-w-[220px] flex-1 text-[13.5px] text-[var(--mute)]">
          Open source, and owned by WFRC: it was developed in part during hours paid for by the Wasatch Front Regional Council.
        </p>
        <a href="https://github.com/WFRCAnalytics/APP-wftdm-dashboard" target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-medium text-[var(--ink)] hover:border-[var(--brand-text)]">
          <GitHub /> Source on GitHub
        </a>
      </div>
      <h3 className="mb-2 text-[12.5px] font-medium text-[var(--mute)]">Inspiration and credits</h3>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5 p-0">
        {CREDITS.map((c) => (
          <li key={c.name}>
            <a href={c.href} target="_blank" rel="noopener noreferrer" className={card}>
              <span className="text-[15px] font-semibold text-[var(--ink)]">{c.name} <span aria-hidden="true">↗</span></span>
              <span className="text-[12.5px] text-[var(--mute)]">{c.role}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function GitHub() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export function DocumentationContent() {
  return (
    <div>
      <TabHeader title="Documentation">About this dashboard, and how to read it.</TabHeader>

      <AboutPanel />

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
