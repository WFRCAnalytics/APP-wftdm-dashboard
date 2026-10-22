import { drawTraceHeat, loadRollup } from '@/charts/lib/traceDraw'
import type { ChartKind } from '@/charts/types'

// Calibration progress, Heatmap view: rows = series, columns = rounds, diverging fill (green-amber-red for submodel error).
const kind: ChartKind = {
  tables: () => [],
  loadExtra: loadRollup,
  draw: (el, env) => drawTraceHeat(el, env),
}

export default kind
