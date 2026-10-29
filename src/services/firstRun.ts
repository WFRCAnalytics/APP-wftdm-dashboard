// 070-demo-build-flag: what the app says when there is nothing to show. A normal build has no demo content to fall back on, so a copy with no
// site file, or a site file that lists no pages, shows this instead of an empty shell. Pure.
export type FirstRunKind = 'no_site' | 'no_pages' | 'pages_unreadable'

export interface FirstRunInput {
  /** The deployment's site file (or, with the demo on, the demo's) was found. */
  siteFound: boolean
  /** Page files the site lists, in all roots. */
  listed: number
  /** Pages that loaded and parsed. */
  loaded: number
  /** The folder that was searched. */
  searched: string
}

export interface FirstRunState {
  kind: FirstRunKind
  title: string
  message: string
  searched: string
  steps: string[]
}

export function firstRunState({ siteFound, listed, loaded, searched }: FirstRunInput): FirstRunState | null {
  if (loaded > 0) return null
  if (!siteFound) {
    return {
      kind: 'no_site',
      title: 'No site configuration was found',
      message: 'This dashboard has no dashboard-config.yaml to read, so there is nothing to show yet.',
      searched,
      steps: [
        'Add a dashboard-config.yaml to that folder, with a pages list naming your page files.',
        'Add the page files it lists (dashboard-*.yaml), and your scenario runs.',
        'To see an example first, build or run the dashboard with the demo: npm run dev, or npm run build:demo.',
      ],
    }
  }
  if (listed === 0) {
    return {
      kind: 'no_pages',
      title: 'The site lists no pages',
      message: 'dashboard-config.yaml was found, but its pages list is empty or missing.',
      searched,
      steps: ['Add the page files to the pages list in dashboard-config.yaml; the first one is the landing page.'],
    }
  }
  return {
    kind: 'pages_unreadable',
    title: 'None of the listed pages could be loaded',
    message: `dashboard-config.yaml lists ${listed} page${listed === 1 ? '' : 's'}, but none could be read.`,
    searched,
    steps: ['Check that each listed file exists in that folder and is valid YAML (the browser console names each problem).'],
  }
}
