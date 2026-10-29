// Viewer-facing settings, pure: the documentation link's address and label. (The Settings tab list joins this file in a later
// step.) Imported by the schema table for its checks, so this file must not import the schema.

/** A web address a link may point at: scheme `http` or `https`, no spaces. Anything else (`javascript:`, `data:`, `ftp:`) is refused. */
export function isWebAddress(value: string): boolean {
  const text = value.trim()
  if (text === '' || /\s/.test(text)) return false
  try {
    const { protocol } = new URL(text)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** A path relative to the documentation address: not empty, no scheme, not starting `//`. A `#fragment` or `?query` is fine. */
export function isRelativePath(value: string): boolean {
  const text = value.trim()
  return text !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(text) && !text.startsWith('//')
}

export const DEFAULT_DOCS_LABEL = 'Documentation'

/** The link's label: the deployer's text, else "Documentation". */
export function docsLabel(label: string | undefined): string {
  return label !== undefined && label.trim() !== '' ? label.trim() : DEFAULT_DOCS_LABEL
}

/**
 * Where the documentation link goes: the site address, with the page's path appended (one `/` between them) when the page has one
 * that is usable. `undefined` when there is no usable address, so no link is shown.
 */
export function docsHref(url: string | undefined, path?: string): string | undefined {
  if (url === undefined || !isWebAddress(url)) return undefined
  const base = url.trim()
  if (path === undefined || !isRelativePath(path)) return base
  return `${base.replace(/\/+$/, '')}/${path.trim().replace(/^\/+/, '')}`
}
