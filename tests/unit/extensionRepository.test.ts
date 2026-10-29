import { describe, expect, it } from 'vitest'

import { extensionRepositoryStatement } from '../../src/services/extensionRepository'
import { authorize } from '../../src/services/ai/sqlGuard'

describe('extensionRepositoryStatement', () => {
  it('sets the custom extension repository to an http or https address', () => {
    expect(extensionRepositoryStatement('https://mirror.example.org/duckdb')).toBe("SET custom_extension_repository = 'https://mirror.example.org/duckdb'")
    expect(extensionRepositoryStatement('http://127.0.0.1:9999/duckdb')).toBe("SET custom_extension_repository = 'http://127.0.0.1:9999/duckdb'")
  })

  it('trims the address', () => {
    expect(extensionRepositoryStatement('  https://m.example.org/x  ')).toBe("SET custom_extension_repository = 'https://m.example.org/x'")
  })

  it('doubles a single quote, so an address cannot end the string early', () => {
    const statement = extensionRepositoryStatement("https://m.example.org/it's")!
    expect(statement).toBe("SET custom_extension_repository = 'https://m.example.org/it''s'")
    expect(statement.match(/'/g)).toHaveLength(4)
  })

  it('does nothing for an unset address or one that is not http or https', () => {
    for (const bad of [undefined, '', 'ftp://x.example.org', 'file:///c/x', 'not an address', 'javascript:alert(1)', 's3://bucket/x']) {
      expect(extensionRepositoryStatement(bad), String(bad)).toBeUndefined()
    }
  })
})

describe('the SQL guard still refuses what the app itself does at startup', () => {
  const PROTECTED = new Set<string>()
  const refused = (sql: string, mode: 'read-only' | 'modify') => authorize(sql, mode, PROTECTED).allowed === false

  it.each(['SET custom_extension_repository = \'https://evil.example.org\'', 'SET custom_extension_repository=\'x\'', 'INSTALL spatial', 'LOAD spatial', 'PRAGMA threads=1'])(
    'refuses %s in both modes (user SQL cannot change the extension host)',
    (sql) => {
      expect(refused(sql, 'read-only')).toBe(true)
      expect(refused(sql, 'modify')).toBe(true)
    },
  )
})
