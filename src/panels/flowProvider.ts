import { LocalFlowmapDataProvider, isAggregateFlow, type FlowmapDataAccessors, type LayersData } from '@flowmap.gl/data'

import { inBounds, isOpen, type FlowBounds } from '@/panels/flowFilter'

// The flow map's data provider: flowmap.gl's own LocalFlowmapDataProvider (clustering, scales, colours all unchanged),
// which also reports the lines it draws (clustered at the current zoom, so a line is often a sum of zone pairs) and hides
// the lines outside the volume filter's bounds. Hiding happens after the scale is made, so filtering never recolours or
// re-clusters the lines left: a hidden line gets zero thickness and no colour, so it is neither drawn nor picked.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- flowmap.gl's own constraint
export class FilteredFlowProvider<L extends Record<string, any>, F extends Record<string, any>> extends LocalFlowmapDataProvider<L, F> {
  private bounds: FlowBounds = {}

  constructor(
    accessors: FlowmapDataAccessors<L, F>,
    private readonly magnitudeOf: (flow: F) => number,
    /** The magnitudes of the lines drawn, every time the layer recomputes them (zoom, pan, data). */
    private readonly onDrawn: (magnitudes: number[]) => void,
  ) {
    super(accessors)
  }

  setBounds(bounds: FlowBounds): void {
    this.bounds = bounds
  }

  async getLayersData(): Promise<LayersData | undefined> {
    const layers = await super.getLayersData()
    const flows = this.getFlowsForFlowmapLayer()
    if (!layers || !flows) return layers
    const magnitudes = flows.map((f) => (isAggregateFlow(f) ? f.count : this.magnitudeOf(f as F)))
    this.onDrawn(magnitudes)
    if (isOpen(this.bounds)) return layers

    // copies: flowmap.gl memoises these arrays, so they must not be changed in place
    const { getColor, getThickness } = layers.lineAttributes.attributes
    const color = new Uint8Array(getColor.value)
    const thickness = new Float32Array(getThickness.value)
    magnitudes.forEach((m, i) => {
      if (inBounds(this.bounds, m)) return
      thickness[i * getThickness.size] = 0
      color[i * getColor.size + 3] = 0
    })
    return {
      ...layers,
      lineAttributes: {
        ...layers.lineAttributes,
        attributes: {
          ...layers.lineAttributes.attributes,
          getColor: { ...getColor, value: color },
          getThickness: { ...getThickness, value: thickness },
        },
      },
    }
  }
}
