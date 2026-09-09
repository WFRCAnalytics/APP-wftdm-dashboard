import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 033-shadcn-default-theme (T021): asserts src/styles/tokens.css's real
// --font-body/--font-heading/--font-mono values resolve to shadcn's real,
// fetched Nova-preset font stack (data-model.md §2) — Geist Variable for
// both body and heading (Nova has no separate heading face, research.md
// §5), Geist Mono Variable for monospace. Same "parse the real tokens.css
// text, don't hardcode a copy" convention as tokenContrast.test.ts.
//
// "In both themes": --font-* is declared ONLY in :root, never redeclared
// in .dark (tokens.css's own comment: "--radius, --font-* not
// redeclared — not theme-dependent") — so this test both asserts the
// real :root value AND confirms .dark carries no competing override that
// would make the two themes disagree.

const __dirname = dirname(fileURLToPath(import.meta.url))
const TOKENS_CSS_PATH = resolve(__dirname, '../../src/styles/tokens.css')

function parseDeclarations(blockBody: string): Record<string, string> {
  const declarations: Record<string, string> = {}
  const re = /--([a-zA-Z0-9-]+):\s*([\s\S]*?);/g
  let match: RegExpExecArray | null
  while ((match = re.exec(blockBody)) !== null) {
    declarations[match[1]] = match[2].trim()
  }
  return declarations
}

function extractBlock(css: string, selector: string): string {
  const re = new RegExp(`${selector.replace('.', '\\.')}\\s*{([^}]*)}`)
  const match = css.match(re)
  if (!match) throw new Error(`tokens.css has no ${selector} block`)
  return match[1]
}

describe('typography tokens match shadcn Nova default font stack', () => {
  const css = readFileSync(TOKENS_CSS_PATH, 'utf-8')
  const rootMap = parseDeclarations(extractBlock(css, ':root'))
  const darkMap = parseDeclarations(extractBlock(css, '.dark'))

  it('--font-body is Geist Variable', () => {
    expect(rootMap['font-body']).toBe('"Geist Variable", sans-serif')
  })

  it('--font-heading is Geist Variable — the SAME value as --font-body (Nova has no separate heading face)', () => {
    expect(rootMap['font-heading']).toBe('"Geist Variable", sans-serif')
    expect(rootMap['font-heading']).toBe(rootMap['font-body'])
  })

  it('--font-mono is Geist Mono Variable', () => {
    expect(rootMap['font-mono']).toBe('"Geist Mono Variable", monospace')
  })

  it('none of the three font tokens are redeclared in .dark — typography is theme-invariant', () => {
    expect(darkMap['font-body']).toBeUndefined()
    expect(darkMap['font-heading']).toBeUndefined()
    expect(darkMap['font-mono']).toBeUndefined()
  })

  it('no remaining reference to the old WFRC brand typefaces anywhere in tokens.css', () => {
    expect(css).not.toMatch(/Poppins/)
    expect(css).not.toMatch(/\bInter\b/)
    expect(css).not.toMatch(/Fira Code/)
  })
})
