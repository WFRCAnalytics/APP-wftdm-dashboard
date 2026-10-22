// Lets an image export read a MapLibre map's pixels. A WebGL canvas is blank to toDataURL unless it is read in the same
// task as a render, so the capture asks for one repaint and reads inside its `render` event (no permanent
// preserveDrawingBuffer cost). Maps register themselves by their container element.
interface CapturableMap {
  getCanvas(): HTMLCanvasElement
  getContainer(): HTMLElement
  triggerRepaint(): void
  once(type: 'render', listener: () => void): unknown
  loaded(): boolean
}

const maps = new WeakMap<HTMLElement, CapturableMap>()

export function trackMap(map: CapturableMap): void {
  maps.set(map.getContainer(), map)
}

/** A PNG data URL of the map in `container`, or null when no map is tracked there or the read is blank. */
export function captureMap(container: HTMLElement): Promise<string | null> {
  const map = maps.get(container)
  if (!map) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000)
    map.once('render', () => {
      clearTimeout(timer)
      try {
        resolve(map.getCanvas().toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    })
    map.triggerRepaint()
  })
}
