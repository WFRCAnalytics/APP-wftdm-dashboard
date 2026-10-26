// 064-ai-chat-assistant: the SQL tokenizer behind the chat's code blocks.
import { describe, expect, it } from 'vitest'
import { highlightSql } from '@/services/ai/sqlHighlight'

const kinds = (sql: string) => highlightSql(sql).filter((t) => t.kind !== 'text').map((t) => `${t.kind}:${t.text}`)

describe('highlightSql', () => {
  it('always reassembles to exactly the input', () => {
    for (const sql of [
      "SELECT a, count(*) AS n FROM \"x__y\" WHERE b = 'it''s' -- note\nGROUP BY 1 /* c */",
      "SELECT 'unterminated",
      'SELECT /* open',
      '',
      'DELETE FROM t;\n\n  ',
    ]) {
      expect(highlightSql(sql).map((t) => t.text).join('')).toBe(sql)
    }
  })

  it('classifies keywords, functions, strings, numbers, quoted identifiers and comments', () => {
    expect(kinds(`SELECT count(*), round(x, 1.5) FROM "a__b" WHERE m = 'Transit' -- hi`)).toEqual([
      'keyword:SELECT',
      'function:count',
      'function:round',
      'number:1.5',
      'keyword:FROM',
      'ident:"a__b"',
      'keyword:WHERE',
      'string:\'Transit\'',
      'comment:-- hi',
    ])
  })

  it('does not colour words inside strings or comments, and handles escaped quotes', () => {
    expect(kinds("SELECT 'drop table x', 'it''s' /* select */")).toEqual(['keyword:SELECT', "string:'drop table x'", "string:'it''s'", 'comment:/* select */'])
  })

  it('is case-insensitive for keywords and leaves plain identifiers alone', () => {
    expect(kinds('select a from t')).toEqual(['keyword:select', 'keyword:from'])
  })
})
