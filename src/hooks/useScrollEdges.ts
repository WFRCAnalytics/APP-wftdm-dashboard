import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'

/**
 * Keeps `data-scroll-top` / `data-scroll-bottom` on a scrolling element: present while content is hidden beyond that
 * edge. The `.scroll-fade` rule in styles/tokens.css reads them to fade only the edge that is actually cut off, so
 * content at rest (scrolled to the start or end) is never dimmed and scrolled content never ends in a hard line.
 *
 * The element can mount after the component does (a dialog's content only exists while it is open), so the returned ref
 * records it in state and the listeners attach whenever it appears. `deps` re-measure when the content changes.
 */
export function useScrollEdges<T extends HTMLElement>(deps: readonly unknown[] = []): RefObject<T> {
  const [el, setEl] = useState<T | null>(null)
  const node = useRef<T | null>(null)
  const ref = useMemo(
    () => ({
      get current() {
        return node.current
      },
      set current(value: T | null) {
        node.current = value
        setEl(value)
      },
    }),
    [],
  )

  useEffect(() => {
    if (!el) return
    const update = () => {
      el.toggleAttribute('data-scroll-top', el.scrollTop > 1)
      el.toggleAttribute('data-scroll-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, ...deps])
  return ref as RefObject<T>
}
