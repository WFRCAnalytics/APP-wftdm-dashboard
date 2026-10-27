// 065-chart-builder: the distinct values of one column of a relation (up to 200), for value pickers.
import { useEffect, useState } from 'react'
import { quoteIdent } from '@/explore/relations'
import { runUserSql } from '@/explore/sql/runUserSql'

export function useDistinct(relSql: string, field: string): string[] {
  const [v, setV] = useState<string[]>([])
  useEffect(() => {
    setV([])
    if (!relSql || !field) return
    let dead = false
    void runUserSql(`SELECT DISTINCT CAST(${quoteIdent(field)} AS VARCHAR) AS v FROM (\n${relSql.replace(/[;\s]+$/, '')}\n) AS r WHERE ${quoteIdent(field)} IS NOT NULL ORDER BY 1 LIMIT 200`, { page: 0, pageSize: 200 }).then((r) => {
      if (!dead && r.outcome === 'ok') setV(r.rows.map((x) => String(x[0])))
    })
    return () => { dead = true }
  }, [relSql, field])
  return v
}
