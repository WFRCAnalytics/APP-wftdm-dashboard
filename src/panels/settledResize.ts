// MapLibre's resize() reallocates the WebGL drawing buffer, which blanks the canvas until the next render.
// Calling it on every frame of an animated container (the sidebar's width transition) strobes the map, so
// the resize waits until the container has stopped changing size; meanwhile the old canvas is just clipped.
const SETTLE_MS = 160

export function settledResize(resize: () => void): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    schedule() {
      clearTimeout(timer)
      timer = setTimeout(resize, SETTLE_MS)
    },
    cancel() {
      clearTimeout(timer)
    },
  }
}
