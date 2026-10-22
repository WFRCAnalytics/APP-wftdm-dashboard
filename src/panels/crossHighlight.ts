// Cross-highlight and legend isolation (project-docs/redesign/05-tooltips-and-interaction.md section 3).
// Marks coloured by mode carry data-m="<Mode>"; hovering one dims every other mode's marks across the document.

/** Dim every mark whose data-m differs from `mode` (null restores all). */
export function highlightMode(mode: string | null): void {
  document.querySelectorAll<HTMLElement | SVGElement>('[data-m]').forEach((el) => {
    el.style.opacity = !mode || el.getAttribute('data-m') === mode ? '' : '.2'
    el.style.transition = 'opacity .15s'
  })
}

/** Wire hover on every [data-m] mark under `root` (idempotent per element). */
export function wireModeHover(root: Element): void {
  root.querySelectorAll<HTMLElement | SVGElement>('[data-m]').forEach((el) => {
    const flagged = el as unknown as { __wfm?: boolean }
    if (flagged.__wfm) return
    flagged.__wfm = true
    const on = () => highlightMode(el.getAttribute('data-m'))
    el.addEventListener('mouseenter', on)
    el.addEventListener('mousemove', on)
    el.addEventListener('mouseleave', () => highlightMode(null))
  })
}

/**
 * Scenario legend isolation: dim every SVG descendant whose fill or stroke equals another scenario's colour.
 * `colors` maps a lowercase hex to the scenario name; it works for Plot output because Plot writes fill/stroke as
 * attributes.
 */
export function isolateScenario(root: Element, colors: ReadonlyMap<string, string>, name: string | null): void {
  root.querySelectorAll<SVGElement>('svg *').forEach((el) => {
    const owner =
      colors.get((el.getAttribute('fill') ?? '').toLowerCase()) ?? colors.get((el.getAttribute('stroke') ?? '').toLowerCase())
    if (!owner) return
    el.style.opacity = !name || owner === name ? '' : '.14'
    el.style.transition = 'opacity .12s'
  })
}
