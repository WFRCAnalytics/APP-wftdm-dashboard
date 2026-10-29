// `npm run check -- <site folder> [--explain] [--json]`: checks a dashboard-config.yaml and the pages it lists before deploying.
// Exit code 1 when anything is reported. The folder is the one that holds dashboard-config.yaml (public/dashboard-config/).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { checkSite, explain, formatProblem } from '../src/config'
import { resolveExploreOptions } from '../src/explore/options'

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const folder = resolve(args.find((a) => !a.startsWith('--')) ?? 'public/dashboard-config')

const report = checkSite(
  (file) => {
    const path = resolve(folder, file)
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined
  },
  { panelCheck: (panel, site) => (panel.type === 'explore-builder' ? resolveExploreOptions(panel, site).warnings : []) },
)

if (flags.has('--json')) console.log(JSON.stringify(report.problems, null, 2))
else {
  for (const p of report.problems) console.log(formatProblem(p))
  if (flags.has('--explain')) console.log(explain(report).join('\n'))
  console.log(report.problems.length === 0 ? `ok: ${report.pages.length} page(s) in ${folder}` : `${report.problems.length} problem(s) in ${folder}`)
}
process.exit(report.problems.length === 0 ? 0 : 1)
