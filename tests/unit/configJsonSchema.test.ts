import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getPath, renderJsonSchema, renderJsonSchemaText, SETTINGS } from '../../src/config'

describe('dashboard-config.schema.json', () => {
  it('is what the schema table renders (run `npm run docs:config` after changing the table)', () => {
    expect(readFileSync('project-docs/dashboard-config.schema.json', 'utf8').replace(/\r\n/g, '\n')).toBe(renderJsonSchemaText())
  })

  it('has a node for every schema path, closed to unknown keys', () => {
    const schema = renderJsonSchema()
    expect(schema.additionalProperties).toBe(false)
    for (const row of SETTINGS.filter((r) => r.scope !== 'page')) {
      const node = getPath(schema, `properties.${row.path.split('.').join('.properties.')}`)
      expect(node, row.path).toBeDefined()
      expect((node as { description?: string }).description, row.path).toBe(row.description)
    }
  })

  it('leaves page-scoped rows out: they belong in a page header, not the site file', () => {
    expect((renderJsonSchema().properties as Record<string, unknown>).header).toBeUndefined()
  })

  it('maps types and enums', () => {
    const props = renderJsonSchema().properties as Record<string, Record<string, unknown>>
    const layout = (props.layout.properties as Record<string, Record<string, unknown>>).mode
    expect(layout.enum).toEqual(['scroll', 'tabs'])
    const footer = (props.export.properties as Record<string, Record<string, unknown>>).footer
    expect(footer.type).toEqual(['boolean', 'string'])
    expect((props.pages as { items: unknown }).items).toEqual({ type: 'string' })
  })
})
