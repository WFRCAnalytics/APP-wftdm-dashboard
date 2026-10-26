// 064-ai-chat-assistant: the statement guard, per specs/064-ai-chat-assistant/contracts/sql-guard.md.
import { describe, expect, it } from 'vitest'
import { authorize } from '@/services/ai/sqlGuard'

const PROTECTED = new Set(['baseline__trip_mode_share', 'observed-2023__zones'])
const ok = (sql: string, mode: 'read-only' | 'modify' = 'read-only') => authorize(sql, mode, PROTECTED).allowed
const why = (sql: string, mode: 'read-only' | 'modify' = 'read-only') => {
  const r = authorize(sql, mode, PROTECTED)
  return r.allowed ? '' : r.reason
}

describe('Read-Only', () => {
  it.each([
    'select 1',
    'WITH a AS (SELECT 1) SELECT * FROM a',
    'FROM t SELECT x',
    'DESCRIBE "baseline__trip_mode_share"',
    'SHOW TABLES',
    "PRAGMA table_info('t')",
    "SELECT 'drop table x'",
    'SELECT 1 -- ; DROP TABLE x',
    "SELECT ';'",
    "SELECT split_part(a, '/', 1) FROM t",
    'SELECT 1;',
    'EXPLAIN SELECT 1',
    'SELECT "update" FROM t',
  ])('allows %s', (sql) => expect(ok(sql)).toBe(true))

  it.each([
    'DROP VIEW a',
    'SELECT 1; DELETE FROM t',
    '/* hi */ create table x as select 1',
    'WITH a AS (DELETE FROM t RETURNING *) SELECT * FROM a',
    "COPY t TO 'x'",
    'INSTALL spatial',
    'LOAD spatial',
    'PRAGMA threads=1',
    'EXPLAIN ANALYZE INSERT INTO t VALUES (1)',
    "SELECT * FROM read_csv('https://x/y.csv')",
    "SELECT * FROM read_parquet('s3://b/k.parquet')",
    "SELECT 'unterminated",
    'SELECT /* unterminated',
    'BEGIN',
    '',
    '  ;  ',
  ])('refuses %s', (sql) => expect(ok(sql)).toBe(false))

  it('explains the refusal in plain language and names the fix', () => {
    expect(why('DELETE FROM t')).toMatch(/Read-Only/)
    expect(why('DELETE FROM t')).toMatch(/Modify/)
  })

  it('refuses the whole request when any statement is not allowed', () => {
    const r = authorize('SELECT 1; DROP TABLE t', 'read-only', PROTECTED)
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.statementIndex).toBe(1)
  })

  it('caps the number of statements', () => {
    expect(ok(Array(11).fill('SELECT 1').join(';'))).toBe(false)
    expect(ok(Array(10).fill('SELECT 1').join(';'))).toBe(true)
  })
})

describe('Modify', () => {
  it.each([
    'CREATE TEMP TABLE x AS SELECT 1',
    'INSERT INTO x VALUES (1)',
    'DROP TABLE x',
    "COPY x TO 'out.csv'",
    'CREATE VIEW v AS SELECT * FROM "baseline__trip_mode_share"',
    'SELECT * FROM "baseline__trip_mode_share"',
    'UPDATE x SET a = 1',
  ])('allows %s', (sql) => expect(ok(sql, 'modify')).toBe(true))

  it.each([
    'INSTALL httpfs',
    'LOAD spatial',
    "ATTACH 'a.db'",
    'DETACH a',
    'SET threads = 1',
    'PRAGMA memory_limit=1',
    'CALL pragma_version()',
    'DROP VIEW "baseline__trip_mode_share"',
    'drop view if exists main.Baseline__Trip_Mode_Share',
    'CREATE OR REPLACE TEMP TABLE baseline__trip_mode_share AS SELECT 1',
    'DELETE FROM baseline__trip_mode_share',
    'ALTER TABLE x RENAME TO "observed-2023__zones"',
    'DROP SCHEMA main CASCADE',
    "SELECT * FROM read_parquet('https://x/y.parquet')",
  ])('refuses %s', (sql) => expect(ok(sql, 'modify')).toBe(false))

  it('names the protected view in the reason', () => {
    expect(why('DROP VIEW "baseline__trip_mode_share"', 'modify')).toMatch(/baseline__trip_mode_share/)
  })

  it('allows reading a protected view into a new object, but not targeting it', () => {
    expect(ok('INSERT INTO x SELECT * FROM baseline__trip_mode_share', 'modify')).toBe(true)
    expect(ok('DELETE FROM x WHERE id IN (SELECT id FROM baseline__trip_mode_share)', 'modify')).toBe(true)
    expect(ok('CREATE TEMP TABLE temp.baseline__trip_mode_share AS SELECT 1', 'modify')).toBe(false)
    expect(ok('INSERT INTO baseline__trip_mode_share SELECT 1', 'modify')).toBe(false)
  })

  it('does not trip on a protected name inside a string literal', () => {
    expect(ok("INSERT INTO log VALUES ('baseline__trip_mode_share')", 'modify')).toBe(true)
  })
})
