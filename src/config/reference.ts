// Renders the schema table as the Markdown reference (project-docs/CONFIG-REFERENCE.md). Pure: the same rows the loader,
// the validator and the cascade read, so the reference cannot drift from them.
import { SETTINGS, SCHEMA_VERSION, type SettingDef } from './schema'

const cell = (s: string) => s.replace(/\|/g, '\|').replace(/\r?\n/g, ' ')

function typeOf(row: SettingDef): string {
  if (row.type === 'enum') return (row.values ?? []).map((v) => `\`${v}\``).join(' \| ')
  if (row.type === 'list') return `list of ${row.of ?? 'values'}`
  return row.type
}

function cascadeOf(row: SettingDef): string {
  if (!row.cascade) return 'site only'
  if (row.cascade === true) return 'page, panel (scalars replace, maps merge per key)'
  return row.cascade.merge === 'replace' ? 'page, panel (a lower level replaces the list)' : 'page, panel (lower levels add to the list)'
}

function defaultOf(row: SettingDef): string {
  return row.default === undefined ? '—' : `\`${JSON.stringify(row.default)}\``
}

export function renderReference(schema: readonly SettingDef[] = SETTINGS): string {
  const lines = [
    '# dashboard-config.yaml reference',
    '',
    '<!-- Generated from src/config/schema.ts by `npm run docs:config`. Do not edit by hand. -->',
    '',
    `File version: ${SCHEMA_VERSION}. Every key is optional; an unset key leaves the app's own behaviour. Keys are \`snake_case\`.`,
    'A wrong value is reported (in a note on the page and in the browser console) and the key keeps its default.',
    '',
    '| Key | Type | Default | Cascade | Description |',
    '|---|---|---|---|---|',
    ...schema.map((r) => `| \`${r.path}\` | ${cell(typeOf(r))} | ${cell(defaultOf(r))} | ${cascadeOf(r)} | ${cell(r.description)} |`),
    '',
  ]
  return lines.join('\n')
}
