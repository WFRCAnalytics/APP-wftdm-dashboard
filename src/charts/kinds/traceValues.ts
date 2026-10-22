import { drawTraceLines, loadRollup } from '@/charts/lib/traceDraw'
import type { ChartKind } from '@/charts/types'

// Calibration progress, Values view: raw values per series, with a dashed observed line in each series colour.
const kind: ChartKind = {
  tables: () => [],
  loadExtra: loadRollup,
  draw: (el, env) => drawTraceLines(el, env, true),
}

export default kind
