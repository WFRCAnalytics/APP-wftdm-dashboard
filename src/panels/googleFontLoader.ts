// 061-appearance-controls — dynamically loads a viewer-selected Google
// Font and applies it via the corresponding --font-* custom property.
// Confirmed safe under this app's dev-only Cross-Origin-Embedder-Policy:
// require-corp (research.md §8: both fonts.googleapis.com and
// fonts.gstatic.com already send Cross-Origin-Resource-Policy:
// cross-origin) — no special crossorigin handling needed. Fails soft by
// construction (research.md §9): an invalid/unreachable family name
// leaves the token's own trailing generic family (sans-serif/monospace)
// as the effective font, never a broken/blank render.
import type { FontRole } from '@/state/fontPreferenceState'

const GENERIC_FALLBACK: Record<FontRole, string> = {
  body: 'sans-serif',
  heading: 'sans-serif',
  mono: 'monospace',
}

const LINK_ID: Record<FontRole, string> = {
  body: 'google-font-body',
  heading: 'google-font-heading',
  mono: 'google-font-mono',
}

const CSS_VAR: Record<FontRole, string> = {
  body: '--font-body',
  heading: '--font-heading',
  mono: '--font-mono',
}

function buildCss2Url(name: string): string {
  const family = encodeURIComponent(name).replace(/%20/g, '+')
  return `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`
}

/**
 * Creates or updates the one stable-`id`'d `<link>` for this role, then
 * sets that role's `--font-*` custom property to `"<name>", <generic>` —
 * re-selecting simply updates the same tag's `href` rather than
 * accumulating stale ones.
 */
export function ensureGoogleFontLoaded(role: FontRole, name: string): void {
  const id = LINK_ID[role]
  let link = document.getElementById(id) as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  link.href = buildCss2Url(name)
  document.documentElement.style.setProperty(CSS_VAR[role], `"${name}", ${GENERIC_FALLBACK[role]}`)
}

/** Removes the role's `<link>` tag and its inline property override,
 * reverting to tokens.css's own self-hosted default. */
export function clearGoogleFont(role: FontRole): void {
  document.getElementById(LINK_ID[role])?.remove()
  document.documentElement.style.removeProperty(CSS_VAR[role])
}
