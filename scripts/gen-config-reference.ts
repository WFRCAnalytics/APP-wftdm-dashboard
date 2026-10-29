// Writes project-docs/CONFIG-REFERENCE.md from the schema table (`npm run docs:config`).
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { renderReference } from '../src/config'

const target = resolve(import.meta.dirname, '../project-docs/CONFIG-REFERENCE.md')
writeFileSync(target, renderReference())
console.log(`wrote ${target}`)
