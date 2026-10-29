// 065-chart-builder: the distinct values of one column of a relation (up to `distinct_values`, 200 unless the deployer sets it), for value pickers.
import { useEffect, useState } from 'react'
import { getExploreOptions } from '@/explore/options'
import { quoteIdent } from '@/explore/relations'
import { runUserSql } from '@/explore/sql/runUserSql'

export const distinctSql = (relSql: string, field: string, limit: number): string =>
  `SELECT DISTINCT CAST(${quoteIdent(field)} AS VARCHAR) AS v FROM (\n${relSql.replace(/[;\s]+$/, '')}\n) AS r WHERE ${quoteIdent(field)} IS NOT NULL ORDER BY 1 LIMIT ${limit}`

export function useDistinct(relSql: string, field: string): string[] {
  const [v, setV] = useState<string[]>([])
  const limit = getExploreOptions().limits.distinctValues
  useEffect(() => {
    setV([])
    if (!relSql || !field) return
    let dead = false
    void runUserSql(distinctSql(relSql, field, limit), { page: 0, pageSize: limit }).then((r) => {
      if (!dead && r.outcome === 'ok') setV(r.rows.map((x) => String(x[0])))
    })
    return () => { dead = true }
  }, [relSql, field, limit])
  return v
}
