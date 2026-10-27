// 065-chart-builder: splits SQL into coloured tokens for the editor overlay. Pure. Classes map to the app's `--sql-*`
// tokens: k keyword, f function, s string or quoted name, n number, c comment, '' plain.
export interface SqlToken { t: string; c: '' | 'k' | 'f' | 's' | 'n' | 'c' }

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'OFFSET', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'ON',
  'AND', 'OR', 'NOT', 'AS', 'UNION', 'ALL', 'DESC', 'ASC', 'IN', 'IS', 'NULL', 'LIKE', 'ILIKE', 'BETWEEN', 'DISTINCT', 'USING',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'HAVING',
])

const RE = /(--[^\n]*)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\sA-Za-z0-9_'"-]+|-)/g

export function highlightSql(sql: string): SqlToken[] {
  const out: SqlToken[] = []
  RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE.exec(sql)) !== null) {
    if (m[0] === '') { RE.lastIndex++; continue }
    let c: SqlToken['c'] = ''
    if (m[1]) c = 'c'
    else if (m[2] || m[3]) c = 's'
    else if (m[4]) c = 'n'
    else if (m[5]) {
      if (KEYWORDS.has(m[5].toUpperCase())) c = 'k'
      else if (/^\s*\(/.test(sql.slice(RE.lastIndex))) c = 'f'
    }
    out.push({ t: m[0], c })
  }
  // A trailing newline would collapse inside <pre>; a zero-width space keeps the last empty line's height.
  out.push({ t: '​', c: '' })
  return out
}
