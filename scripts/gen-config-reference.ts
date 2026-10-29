// Writes the generated config docs from the schema table (`npm run docs:config`): project-docs/CONFIG-REFERENCE.md and the
// JSON Schema project-docs/dashboard-config.schema.json. The Python library's `init` reads a copy of the schema (072), so the
// same text is written into the package's templates folder; a unit test fails when the two differ.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { renderJsonSchemaText, renderReference } from '../src/config'

const out = (name: string) => resolve(import.meta.dirname, '../project-docs', name)
const packaged = resolve(import.meta.dirname, '../python/wftdm_dashboard/templates/dashboard-config.schema.json')
const schemaText = renderJsonSchemaText()
writeFileSync(out('CONFIG-REFERENCE.md'), renderReference())
writeFileSync(out('dashboard-config.schema.json'), schemaText)
mkdirSync(dirname(packaged), { recursive: true })
writeFileSync(packaged, schemaText)
console.log('wrote project-docs/CONFIG-REFERENCE.md, project-docs/dashboard-config.schema.json and python/wftdm_dashboard/templates/dashboard-config.schema.json')
