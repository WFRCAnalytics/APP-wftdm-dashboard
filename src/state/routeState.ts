// Page addresses: `#/<page slug>` opens a page and `#/<page slug>/<section id>` opens a tab on it. Only pages and their
// sections are in the address; Settings, the assistant and expanded tiles are not. A bare `#<section id>` (the older
// form) still opens that section on the page in view. The address is rewritten with replaceState, so Back is not flooded.

export interface Route {
  page?: string
  section?: string
}

/** Lower-case, dash-separated, URL-safe; '' when nothing usable is left. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** One unique slug per page: `header.slug`, else the tab name, else `page-<n>`; a repeat gets `-2`, `-3`, ... */
export function assignSlugs(headers: ReadonlyArray<{ tab: string; slug?: string }>): string[] {
  const used = new Set<string>()
  return headers.map((h, i) => {
    const base = slugify(h.slug ?? '') || slugify(h.tab) || `page-${i + 1}`
    let slug = base
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
    used.add(slug)
    return slug
  })
}

/** Pages whose address had to be changed because an earlier page already has it. */
export function slugCollisions(headers: ReadonlyArray<{ tab: string; slug?: string }>): { tab: string; slug: string; used: string }[] {
  const used = assignSlugs(headers)
  return headers.flatMap((h, i) => {
    const base = slugify(h.slug ?? '') || slugify(h.tab) || `page-${i + 1}`
    return used[i] === base ? [] : [{ tab: h.tab, slug: base, used: used[i] }]
  })
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  if (!raw) return {}
  if (!raw.startsWith('/')) return { section: decodeURIComponent(raw) }
  const [page, section] = raw.slice(1).split('/').map((s) => decodeURIComponent(s))
  return { page: page || undefined, section: section || undefined }
}

export function buildHash(page: string, section?: string): string {
  return `#/${encodeURIComponent(page)}${section ? `/${encodeURIComponent(section)}` : ''}`
}

// The slug of the page on screen, set by the shell, so a section change can write the whole address.
let currentSlug: string | undefined
export function setCurrentSlug(slug: string | undefined): void {
  currentSlug = slug
}
export function getCurrentSlug(): string | undefined {
  return currentSlug
}

export function replaceAddress(hash: string): void {
  try {
    window.history.replaceState(null, '', hash)
  } catch {
    // no window (unit tests)
  }
}
