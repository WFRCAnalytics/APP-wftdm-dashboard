// What a chart tile exports as CSV: the source rows of every table the kind drew, for every compared run and the
// reference, each row tagged with the scenario and year. A kind with a derived drawing may provide `exportRows` instead.
import type { ChartData, ChartKind, ChartPlan, Row } from '@/charts/types'

export function exportTables(kind: ChartKind, plan: ChartPlan, data: ChartData): { name: string; rows: Row[] }[] {
  if (kind.exportRows) return kind.exportRows(plan, data)
  const runs = plan.scenarios.map((s) => ({ run: s.run, label: s.label }))
  if (plan.reference.run && !runs.some((r) => r.run === plan.reference.run)) runs.push({ run: plan.reference.run, label: plan.reference.label })
  const years = plan.years.length > 1
  return kind
    .tables(plan)
    .map((table) => ({
      name: table,
      rows: runs.flatMap(({ run, label }) =>
        data.rows(run, table).map((row) => ({ scenario: label, ...(years ? { year: plan.year } : {}), ...row })),
      ),
    }))
    .filter((t) => t.rows.length > 0)
}
