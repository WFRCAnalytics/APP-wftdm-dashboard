// Which form a switch takes in the room it has (the tile header's view control, the control bar's year): every option
// with its label, icons only, or the selected option alone as a pill that opens a menu. Pure, so it is unit-tested.

export type SwitchMode = 'auto' | 'switch' | 'menu'
export type SwitchForm = 'full' | 'icons' | 'menu'

/**
 * `room` is the width available; `full` and `icons` the widths the two switch forms need (`icons` is null when some option
 * has no icon). `switch` and `menu` force a form; `auto` takes the widest form that fits.
 */
export function switchForm(mode: SwitchMode, room: number, full: number, icons: number | null): SwitchForm {
  if (mode === 'switch') return 'full'
  if (mode === 'menu') return 'menu'
  // before the first measurement nothing is known: show the full switch rather than flash a menu
  if (room <= 0 || full <= 0) return 'full'
  if (full <= room) return 'full'
  if (icons !== null && icons > 0 && icons <= room) return 'icons'
  return 'menu'
}
