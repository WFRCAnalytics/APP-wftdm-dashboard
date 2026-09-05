import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Reads src/styles/tokens.css's ACTUAL custom-property values — not a
// hardcoded copy — and asserts every -foreground/base semantic pairing in
// data-model.md's Design Token table meets WCAG 2.1 AA (>=4.5:1) in both
// :root and .dark. Per contracts/token-contract.md's Given/When/Then: if
// tokens.css's values drift, this test fails, it doesn't silently pass a
// stale expectation. Satisfies FR-005/SC-001.

const __dirname = dirname(fileURLToPath(import.meta.url))
const TOKENS_CSS_PATH = resolve(__dirname, '../../src/styles/tokens.css')

/** Extracts `--name: value;` declarations from one `{ ... }` block body. */
function parseDeclarations(blockBody: string): Record<string, string> {
  const declarations: Record<string, string> = {}
  const re = /--([a-zA-Z0-9-]+):\s*([\s\S]*?);/g
  let match: RegExpExecArray | null
  while ((match = re.exec(blockBody)) !== null) {
    declarations[match[1]] = match[2].trim()
  }
  return declarations
}

/** Extracts the body of the first `selector { ... }` block in the file. */
function extractBlock(css: string, selector: string): string {
  const re = new RegExp(`${selector.replace('.', '\\.')}\\s*{([^}]*)}`)
  const match = css.match(re)
  if (!match) throw new Error(`tokens.css has no ${selector} block`)
  return match[1]
}

/**
 * Resolves a custom property to a literal hex color, following `var(--x)`
 * references (this file's tokens never mix a var() reference with other
 * text for color roles — only compound values like --font-body do, and
 * those are never passed to this function).
 */
function resolveColor(
  map: Record<string, string>,
  name: string,
  seen: Set<string> = new Set(),
): string {
  if (seen.has(name)) throw new Error(`circular reference resolving --${name}`)
  seen.add(name)
  const value = map[name]
  if (value === undefined) throw new Error(`--${name} is not declared in tokens.css`)
  const varMatch = value.match(/^var\(--([a-zA-Z0-9-]+)\)$/)
  if (varMatch) return resolveColor(map, varMatch[1], seen)
  if (!/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    throw new Error(`--${name} did not resolve to a literal hex color (got "${value}")`)
  }
  return value
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const num = parseInt(h.slice(0, 6), 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** WCAG contrast ratio between two hex colors, per the relative-luminance formula. */
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA))
  const lB = relativeLuminance(hexToRgb(hexB))
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

const WCAG_AA_MIN_CONTRAST = 4.5

// Every -foreground/base pairing in data-model.md's table, excluding
// border/input/ring/radius (non-text-contrast roles). Expected ratios are
// data-model.md's own verified numbers (research.md §4) — asserted with a
// loose tolerance so this test also catches unintended drift, not just
// AA-threshold regressions.
const PAIRINGS: Array<{
  name: string
  foreground: string
  base: string
  expectedLight: number
  expectedDark: number
}> = [
  { name: 'foreground/background', foreground: 'foreground', base: 'background', expectedLight: 18.26, expectedDark: 17.57 },
  { name: 'card-foreground/card', foreground: 'card-foreground', base: 'card', expectedLight: 18.26, expectedDark: 17.57 },
  { name: 'primary-foreground/primary', foreground: 'primary-foreground', base: 'primary', expectedLight: 11.67, expectedDark: 7.54 },
  { name: 'secondary-foreground/secondary', foreground: 'secondary-foreground', base: 'secondary', expectedLight: 15.1, expectedDark: 13.5 },
  { name: 'muted-foreground/muted', foreground: 'muted-foreground', base: 'muted', expectedLight: 5.08, expectedDark: 5.12 },
  { name: 'accent-foreground/accent', foreground: 'accent-foreground', base: 'accent', expectedLight: 10.44, expectedDark: 10.44 },
  { name: 'destructive-foreground/destructive', foreground: 'destructive-foreground', base: 'destructive', expectedLight: 5.27, expectedDark: 5.27 },
  // 024-settings-modal-visual-redesign: --success/--success-foreground,
  // added for the Scenarios tab's "ready" status indicator (research.md
  // §2) — same identical-in-both-modes shape as --destructive above.
  { name: 'success-foreground/success', foreground: 'success-foreground', base: 'success', expectedLight: 5.02, expectedDark: 5.02 },
]

describe('token contrast (WCAG 2.1 AA)', () => {
  const css = readFileSync(TOKENS_CSS_PATH, 'utf-8')
  const rootMap = parseDeclarations(extractBlock(css, ':root'))
  const darkMap = { ...rootMap, ...parseDeclarations(extractBlock(css, '.dark')) }

  it.each(PAIRINGS)(
    '$name meets WCAG AA in light mode (>=4.5:1)',
    ({ foreground, base, expectedLight }) => {
      const ratio = contrastRatio(resolveColor(rootMap, foreground), resolveColor(rootMap, base))
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN_CONTRAST)
      expect(ratio).toBeCloseTo(expectedLight, 1)
    },
  )

  it.each(PAIRINGS)(
    '$name meets WCAG AA in dark mode (>=4.5:1)',
    ({ foreground, base, expectedDark }) => {
      const ratio = contrastRatio(resolveColor(darkMap, foreground), resolveColor(darkMap, base))
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN_CONTRAST)
      expect(ratio).toBeCloseTo(expectedDark, 1)
    },
  )
})
