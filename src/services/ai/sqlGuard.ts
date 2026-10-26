// 064-ai-chat-assistant: the statement guard. Pure (no DuckDB, no DOM). Permissions are enforced HERE, in code,
// on every statement the assistant submits — never by instructions to the model.
// Contract: specs/064-ai-chat-assistant/contracts/sql-guard.md.
import type { ClassifiedStatement, GuardResult, Permission, StatementKind } from './types.ts'

type Token =
  | { t: 'word'; v: string; start: number; end: number }
  | { t: 'ident'; v: string; start: number; end: number }
  | { t: 'string'; v: string; start: number; end: number }
  | { t: 'punct'; v: string; start: number; end: number }
  | { t: 'semi'; v: string; start: number; end: number }

const MAX_STATEMENTS = 10

const READ_VERBS = new Set(['SELECT', 'WITH', 'VALUES', 'FROM', 'TABLE', 'DESCRIBE', 'SHOW', 'SUMMARIZE'])
const READ_PRAGMAS = new Set(['TABLE_INFO', 'DATABASE_LIST', 'SHOW_TABLES'])
const DDL_VERBS = new Set(['CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'RENAME', 'COMMENT'])
const DML_VERBS = new Set(['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'COPY', 'EXPORT', 'IMPORT'])
const EXTERNAL_VERBS = new Set([
  'INSTALL', 'LOAD', 'FORCE', 'ATTACH', 'DETACH', 'CALL', 'SET', 'RESET', 'PRAGMA', 'USE', 'CHECKPOINT', 'VACUUM',
])
const MODIFYING_WORDS = new Set(['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'COPY', 'ALTER'])
const REMOTE_SCHEME = /^(https?|s3a?|gcs?|gs|hf|az|abfss?|r2|file|ftp):/i

class LexError extends Error {}

function isWordChar(c: string): boolean {
  return /[\p{L}\p{N}_$]/u.test(c)
}

/** One pass: drops comments, keeps strings/identifiers apart from words, splits nothing yet. */
function lex(sql: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    if (/\s/.test(c)) {
      i++
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
    } else if (c === '/' && sql[i + 1] === '*') {
      let depth = 1
      i += 2
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--
          i += 2
        } else i++
      }
      if (depth > 0) throw new LexError('unterminated comment')
    } else if (c === "'" || c === '"') {
      const start = i
      let v = ''
      i++
      let closed = false
      while (i < sql.length) {
        if (sql[i] !== c) {
          v += sql[i++]
        } else if (sql[i + 1] === c) {
          v += c
          i += 2
        } else {
          closed = true
          i++
          break
        }
      }
      if (!closed) throw new LexError(c === "'" ? 'unterminated string' : 'unterminated identifier')
      tokens.push({ t: c === "'" ? 'string' : 'ident', v, start, end: i })
    } else if (c === '$' && sql[i + 1] === '$') {
      const start = i
      const close = sql.indexOf('$$', i + 2)
      if (close < 0) throw new LexError('unterminated string')
      tokens.push({ t: 'string', v: sql.slice(i + 2, close), start, end: close + 2 })
      i = close + 2
    } else if (isWordChar(c)) {
      const start = i
      while (i < sql.length && isWordChar(sql[i])) i++
      tokens.push({ t: 'word', v: sql.slice(start, i), start, end: i })
    } else if (c === ';') {
      tokens.push({ t: 'semi', v: ';', start: i, end: i + 1 })
      i++
    } else {
      tokens.push({ t: 'punct', v: c, start: i, end: i + 1 })
      i++
    }
  }
  return tokens
}

function splitStatements(tokens: Token[]): Token[][] {
  const out: Token[][] = []
  let cur: Token[] = []
  for (const tok of tokens) {
    if (tok.t === 'semi') {
      if (cur.length) out.push(cur)
      cur = []
    } else cur.push(tok)
  }
  if (cur.length) out.push(cur)
  return out
}

function upperWord(tok: Token | undefined): string {
  return tok && tok.t === 'word' ? tok.v.toUpperCase() : ''
}

function classify(tokens: Token[]): { kind: StatementKind; verb: string } {
  let i = 0
  let verb = upperWord(tokens[0])
  if (verb === 'EXPLAIN') {
    i = 1
    if (upperWord(tokens[i]) === 'ANALYZE') i++
    // EXPLAIN [ANALYZE] <statement> is exactly as powerful as the statement it wraps
    if (i >= tokens.length) return { kind: 'read', verb }
  }
  const inner = upperWord(tokens[i])
  if (verb !== 'EXPLAIN') verb = inner
  if (inner === 'PRAGMA') {
    return { kind: READ_PRAGMAS.has(upperWord(tokens[i + 1])) ? 'read' : 'external', verb }
  }
  if (inner === 'WITH') {
    const modifying = tokens.some((t) => t.t === 'word' && MODIFYING_WORDS.has(t.v.toUpperCase()))
    return { kind: modifying ? 'dml' : 'read', verb }
  }
  if (READ_VERBS.has(inner)) return { kind: 'read', verb }
  if (DDL_VERBS.has(inner)) return { kind: 'ddl', verb }
  if (DML_VERBS.has(inner)) return { kind: 'dml', verb }
  if (EXTERNAL_VERBS.has(inner)) return { kind: 'external', verb }
  return { kind: 'other', verb: verb || '(unknown)' }
}

// Words that sit between the verb and the target name of CREATE / INSERT / UPDATE / DELETE / MERGE / COPY.
const BEFORE_TARGET = new Set([
  'CREATE', 'OR', 'REPLACE', 'TEMP', 'TEMPORARY', 'UNIQUE', 'IF', 'NOT', 'EXISTS', 'GLOBAL', 'LOCAL', 'PERSISTENT',
  'TABLE', 'VIEW', 'SEQUENCE', 'MACRO', 'FUNCTION', 'INSERT', 'INTO', 'IGNORE', 'UPDATE', 'DELETE', 'FROM', 'MERGE',
  'COPY', 'ONLY', 'RECURSIVE',
])

/**
 * The protected view name a modifying statement would change, if any. Verbs that can only ever damage an existing
 * object (DROP, ALTER, TRUNCATE, RENAME, COMMENT) refuse on any mention of a protected name. Verbs that also READ
 * (CREATE ... AS SELECT, INSERT ... SELECT, DELETE ... WHERE x IN (...)) refuse only when the protected name is the
 * statement's TARGET, so "save this result as a table" from a dashboard view stays possible. A TEMP table named like
 * a dashboard view would shadow it for every panel, which is why CREATE counts too.
 */
function protectedHit(verb: string, toks: Token[], protectedLower: ReadonlySet<string>): string | undefined {
  const isName = (t: Token) => t.t === 'word' || t.t === 'ident'
  if (['DROP', 'ALTER', 'TRUNCATE', 'RENAME', 'COMMENT', 'IMPORT'].includes(verb)) {
    return toks.find((t) => isName(t) && protectedLower.has(t.v.toLowerCase()))?.v
  }
  let i = 0
  // A modifier word followed by "." is a schema name (temp.x), not a modifier.
  while (
    i < toks.length &&
    toks[i].t === 'word' &&
    BEFORE_TARGET.has(toks[i].v.toUpperCase()) &&
    !(toks[i + 1]?.t === 'punct' && toks[i + 1].v === '.')
  ) {
    i++
  }
  let target: Token | undefined
  while (i < toks.length && isName(toks[i])) {
    target = toks[i]
    if (toks[i + 1]?.t === 'punct' && toks[i + 1].v === '.' && toks[i + 2] && isName(toks[i + 2])) i += 2
    else break
  }
  return target && protectedLower.has(target.v.toLowerCase()) ? target.v : undefined
}

function refuse(reason: string, statementIndex?: number): GuardResult {
  return { allowed: false, reason, statementIndex }
}

/**
 * Decides whether `sql` may run. One refused statement refuses the whole request, so nothing partial ever runs.
 * `protectedNames` are the dashboard's own scenario/metric view names (any case).
 */
export function authorize(sql: string, mode: Permission, protectedNames: ReadonlySet<string>): GuardResult {
  let tokens: Token[]
  try {
    tokens = lex(sql)
  } catch (e) {
    return refuse(`The statement could not be read (${(e as Error).message}).`)
  }
  const statements = splitStatements(tokens)
  if (statements.length === 0) return refuse('There is no statement to run.')
  if (statements.length > MAX_STATEMENTS) return refuse(`At most ${MAX_STATEMENTS} statements can run at once.`)

  const protectedLower = new Set(Array.from(protectedNames, (n) => n.toLowerCase()))
  const classified: ClassifiedStatement[] = []

  for (let idx = 0; idx < statements.length; idx++) {
    const toks = statements[idx]
    const { kind, verb } = classify(toks)
    const text = sql.slice(toks[0].start, toks[toks.length - 1].end)

    for (const tok of toks) {
      if (tok.t === 'string' && REMOTE_SCHEME.test(tok.v.trim())) {
        return refuse('The assistant cannot read from external URLs or remote files; only the dashboard data is available.', idx)
      }
    }
    if (kind === 'external') {
      return refuse(
        `${verb} is not allowed: the assistant cannot install or load extensions, attach other databases, or change engine settings.`,
        idx,
      )
    }
    if (kind === 'other') {
      return refuse(`${verb} is not a statement the assistant can run.`, idx)
    }
    if (mode === 'read-only' && kind !== 'read') {
      return refuse(
        `This statement changes data (${verb}), and the assistant is in Read-Only mode. Switch to Modify in Settings → AI to allow it.`,
        idx,
      )
    }
    if (mode === 'modify' && (kind === 'ddl' || kind === 'dml')) {
      const hit = protectedHit(verb, toks, protectedLower)
      if (hit) {
        return refuse(`This statement would change "${hit}", one of the dashboard's own views, so it is not allowed.`, idx)
      }
      if (verb === 'DROP' && (upperWord(toks[1]) === 'SCHEMA' || upperWord(toks[1]) === 'DATABASE')) {
        return refuse('Dropping a schema or database would remove the dashboard views, so it is not allowed.', idx)
      }
    }
    classified.push({ text, kind, verb })
  }
  return { allowed: true, statements: classified }
}
