import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { renderReference, SETTINGS } from '../../src/config'

const committed = () => readFileSync('project-docs/CONFIG-REFERENCE.md', 'utf8').replace(/\r\n/g, '\n')

describe('CONFIG-REFERENCE.md', () => {
  it('is what the schema table renders (run `npm run docs:config` after changing the table)', () => {
    expect(committed()).toBe(renderReference())
  })

  it('names every schema path', () => {
    const text = committed()
    for (const row of SETTINGS) expect(text, row.path).toContain(`\`${row.path}\``)
  })
})
