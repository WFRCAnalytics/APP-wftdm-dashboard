// Which pages the sidebar lists and which one opens first, given each page's `header.hidden`. Pure, so the shell, the nav and the
// `check` command agree. Indices always refer to the full, ordered page list: hiding a page never renumbers the others.

export interface HiddenFlag {
  hidden?: boolean
}

/** True when there are several pages and every one is hidden: reported, and then all are listed (see `listedPages`). */
export function allHidden(headers: readonly HiddenFlag[]): boolean {
  return headers.length > 1 && headers.every((h) => h.hidden === true)
}

/**
 * The indices of the pages to list, in order: every page that is not hidden. When that would leave none (one hidden page, or every
 * page hidden) all pages are listed, so a viewer always has somewhere to navigate.
 */
export function listedPages(headers: readonly HiddenFlag[]): number[] {
  const all = headers.map((_, i) => i)
  const shown = all.filter((i) => headers[i].hidden !== true)
  return shown.length > 0 ? shown : all
}

/** The landing page: the first listed page (0 when there are no pages). */
export function landingIndex(headers: readonly HiddenFlag[]): number {
  return listedPages(headers)[0] ?? 0
}
