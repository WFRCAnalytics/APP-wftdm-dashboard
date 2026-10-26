// 064-ai-chat-assistant: a small SQL tokenizer for colouring the assistant's code blocks. No library (the app keeps its
// dependency set fixed). It only splits text into classes; the UI maps each class to a theme-aware CSS variable, and
// renders every token as plain text, never as HTML.
export type SqlTokenKind = 'keyword' | 'function' | 'string' | 'number' | 'comment' | 'ident' | 'text'
export interface SqlToken {
  kind: SqlTokenKind
  text: string
}

const KEYWORDS = new Set(
  (
    'ADD ALL ALTER AND ANY AS ASC ATTACH BETWEEN BY CASE CAST COPY CREATE CROSS CURRENT DELETE DESC DESCRIBE DISTINCT DROP ' +
    'ELSE END EXCEPT EXISTS EXPLAIN FALSE FETCH FILTER FIRST FOLLOWING FROM FULL GROUP HAVING ILIKE IN INNER INSERT ' +
    'INTERSECT INTERVAL INTO IS JOIN LAST LEFT LIKE LIMIT NATURAL NOT NULL NULLS OFFSET ON OR ORDER OUTER OVER PARTITION ' +
    'PRECEDING QUALIFY RANGE RECURSIVE REPLACE RIGHT ROWS SELECT SET SHOW SIMILAR SUMMARIZE TABLE TEMP TEMPORARY THEN TO ' +
    'TRUE UNBOUNDED UNION UNIQUE UPDATE USING VALUES VIEW WHEN WHERE WINDOW WITH'
  ).split(' '),
)

/** Splits `sql` into tokens whose texts concatenate back to exactly `sql`. Unterminated strings and comments simply run
 * to the end of the text, so partial or invalid SQL still renders. */
export function highlightSql(sql: string): SqlToken[] {
  const out: SqlToken[] = []
  const push = (kind: SqlTokenKind, text: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind && kind === 'text') last.text += text
    else out.push({ kind, text })
  }
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    if (c === '-' && sql[i + 1] === '-') {
      let j = i
      while (j < sql.length && sql[j] !== '\n') j++
      push('comment', sql.slice(i, j))
      i = j
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      const j = end < 0 ? sql.length : end + 2
      push('comment', sql.slice(i, j))
      i = j
    } else if (c === "'" || c === '"') {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) j += 2
          else {
            j++
            break
          }
        } else j++
      }
      push(c === "'" ? 'string' : 'ident', sql.slice(i, j))
      i = j
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      let j = i
      while (j < sql.length && /[0-9._eE]/.test(sql[j])) j++
      push('number', sql.slice(i, j))
      i = j
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < sql.length && /[A-Za-z0-9_$]/.test(sql[j])) j++
      const word = sql.slice(i, j)
      let k = j
      while (sql[k] === ' ') k++
      if (KEYWORDS.has(word.toUpperCase())) push('keyword', word)
      else if (sql[k] === '(') push('function', word)
      else push('text', word)
      i = j
    } else {
      push('text', c)
      i++
    }
  }
  return out
}
