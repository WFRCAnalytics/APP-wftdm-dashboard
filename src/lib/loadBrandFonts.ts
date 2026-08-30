// Loads the WFRC brand typefaces from the Google Fonts CDN (research.md §8 /
// brand.yml: `source: google` for all three families) — Poppins for body
// text, Inter for headings/navigation/labels, Fira Code for
// monospace/code-style display. No self-hosted font files are vendored; the
// CDN approach matches brand.yml's own declaration.
//
// Ported verbatim (weight/style ranges, inject-once guard, preconnect
// hints) from APP-Project-Scoresheet's src/theme/fonts.ts — constitution
// Principle VIII (reuse proven reference implementations).

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700',
    'family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700',
    'family=Fira+Code:wght@400;500;700',
  ].join('&') +
  '&display=swap'

let injected = false

/**
 * Injects the Google Fonts `<link>` tags into `<head>` once. Idempotent and
 * safe to call from anywhere (e.g. the demo page's mount effect) without
 * worrying about duplicate calls — a second call is a no-op. Uses
 * `preconnect` hints so the actual stylesheet request doesn't pay a full
 * DNS+TLS round trip on top of the font fetch.
 */
export function loadBrandFonts(): void {
  if (injected || typeof document === 'undefined') return
  injected = true

  const preconnectGoogleapis = document.createElement('link')
  preconnectGoogleapis.rel = 'preconnect'
  preconnectGoogleapis.href = 'https://fonts.googleapis.com'
  document.head.appendChild(preconnectGoogleapis)

  const preconnectGstatic = document.createElement('link')
  preconnectGstatic.rel = 'preconnect'
  preconnectGstatic.href = 'https://fonts.gstatic.com'
  preconnectGstatic.crossOrigin = 'anonymous'
  document.head.appendChild(preconnectGstatic)

  const stylesheet = document.createElement('link')
  stylesheet.rel = 'stylesheet'
  stylesheet.href = GOOGLE_FONTS_HREF
  document.head.appendChild(stylesheet)
}
