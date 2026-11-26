// How many of a tile's header controls fit on the title row. Pure, so it is unit-tested.
//
// The row is: title, the controls in priority order, the view switch (it fills what is left and shrinks itself to icons or a
// menu), the tools. A control moves to the row below before the view switch has to give up its labels; the ones that move are
// always the last in priority, so the order of the controls never changes.

/**
 * `room` is the row's width less the title, the tools and the gaps around them; `widths` the controls' own widths in priority
 * order; `need` the width the view switch needs with its labels (0 without one); `gap` the space after each control.
 * Returns how many controls stay on the row (none when even the view switch alone does not fit).
 */
export function headerFit(room: number, widths: number[], need: number, gap: number): number {
  let used = need
  for (let i = 0; i < widths.length; i++) {
    used += widths[i] + gap
    if (used > room) return i
  }
  return widths.length
}
