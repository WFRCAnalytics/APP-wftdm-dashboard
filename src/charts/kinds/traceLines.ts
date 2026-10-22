import { drawTraceLines, loadRollup } from '@/charts/lib/traceDraw'
import type { ChartKind } from '@/charts/types'

// Calibration progress, Difference view (04 entry 26): the gap to observed per series across the rounds.
const kind: ChartKind = {
  tables: () => [],
  loadExtra: loadRollup,
  draw: (el, env) => drawTraceLines(el, env, false),
}

export default kind
