// Writes the generated config docs from the schema table (`npm run docs:config`): project-docs/CONFIG-REFERENCE.md and the
// JSON Schema project-docs/dashboard-config.schema.json.
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { renderJsonSchemaText, renderReference } from '../src/config'

const out = (name: string) => resolve(import.meta.dirname, '../project-docs', name)
writeFileSync(out('CONFIG-REFERENCE.md'), renderReference())
writeFileSync(out('dashboard-config.schema.json'), renderJsonSchemaText())
console.log('wrote project-docs/CONFIG-REFERENCE.md and project-docs/dashboard-config.schema.json')
