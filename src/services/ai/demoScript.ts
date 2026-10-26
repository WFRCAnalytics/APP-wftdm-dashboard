// 064-ai-chat-assistant: the scripted conversation of the Demo provider (trying the chat out, and demos). In demo mode the
// chat box is pre-filled with the next question here and read-only, so all the viewer does is press Send. The model's
// steps (look up tables, write this SQL) and its closing answer are fixed, but the SQL RUNS FOR REAL in DuckDB on the
// ActivitySim demo data the dashboard ships (public/demo-scenarios/*), so the table in each reply is live. The numbers in
// the answers, and `result` (the expected first rows), were calculated once from that same data; the Playwright spec
// checks the live tables against `result`. If the demo data changes, recompute both. (The last step is refused by the
// SQL guard, so it has no result.) On a deployment without the demo scenarios the queries fail and show their errors.
import type { ColumnInfo } from './types.ts'

export interface DemoStep {
  question: string
  /** Views the "model" looks up first (describe_tables). */
  tables: string[]
  /** The query the "model" writes, shown in the chat. */
  sql: string
  /** The model's fixed closing answer. */
  answer: string
  /** Expected result of `sql` on the shipped demo data (checked by tests); absent for the step that is refused. */
  result?: { columns: ColumnInfo[]; rows: unknown[][] }
}

const BASE = 'activitysim-baseline__trip_mode_share'
const DENSITY = 'activitysim-density-variant__trip_mode_share'
const TRANSIT = 'activitysim-transit-variant__trip_mode_share'
const B = 'activitysim-baseline__'
const D = 'activitysim-density-variant__'
const T = 'activitysim-transit-variant__'

export const DEMO_SCRIPT: DemoStep[] = [
  {
    question: 'Which scenario has the highest transit share?',
    tables: [BASE, DENSITY, TRANSIT],
    sql: `SELECT scenario, share AS transit_share
FROM (
  SELECT 'Baseline' AS scenario, share FROM "${BASE}" WHERE major_trip_mode = 'Transit'
  UNION ALL SELECT 'Density +40%', share FROM "${DENSITY}" WHERE major_trip_mode = 'Transit'
  UNION ALL SELECT 'Transit service increase', share FROM "${TRANSIT}" WHERE major_trip_mode = 'Transit'
)
ORDER BY transit_share DESC`,
    answer:
      "I compared the Transit row of the trip mode share table in all three scenarios. The transit service increase has the highest transit share, 26.92%, just ahead of the density scenario at 26.86% and the baseline at 26.59%. The differences are small.",
    result: { columns: [{"name": "scenario", "type": "VARCHAR"}, {"name": "transit_share", "type": "DOUBLE"}], rows: [["Transit service increase", 0.2692063223017924], ["Density +40%", 0.26862570495696053], ["Baseline", 0.2658694822541661]] },
  },
  {
    question: 'How do the baseline and the transit service increase differ, mode by mode?',
    tables: [BASE, TRANSIT],
    sql: `SELECT b.major_trip_mode AS mode,
       b.trips AS baseline_trips,
       t.trips AS transit_variant_trips,
       t.trips - b.trips AS change
FROM "${BASE}" b
JOIN "${TRANSIT}" t USING (major_trip_mode)
ORDER BY change DESC`,
    answer:
      "I joined the two scenarios' trip mode share tables on the trip mode and subtracted baseline trips from the transit variant's. Transit gains 83 trips in the transit service scenario; Non-Motorized loses the most, 48 trips, with small losses in the other modes.",
    result: { columns: [{"name": "mode", "type": "VARCHAR"}, {"name": "baseline_trips", "type": "BIGINT"}, {"name": "transit_variant_trips", "type": "BIGINT"}, {"name": "change", "type": "BIGINT"}], rows: [["Transit", 6270, 6353, 83], ["SOV", 246, 245, -1], ["HOV", 243, 234, -9], ["Ride Hail", 344, 335, -9], ["Non-Motorized", 16480, 16432, -48]] },
  },
  {
    question: 'What does the baseline look like by trip purpose?',
    tables: [`${B}trip_purpose_share`],
    sql: `SELECT primary_purpose AS purpose, trips, round(share * 100, 1) AS pct_of_trips
FROM "${B}trip_purpose_share"
ORDER BY trips DESC`,
    answer:
      "I listed the baseline's trips by purpose. Work is by far the largest at 8,626 trips, 36.6% of all trips, followed by shopping at 3,391 (14.4%) and other discretionary at 2,584 (11.0%).",
    result: { columns: [{"name": "purpose", "type": "VARCHAR"}, {"name": "trips", "type": "BIGINT"}, {"name": "pct_of_trips", "type": "DOUBLE"}], rows: [["work", 8626, 36.6], ["shopping", 3391, 14.4], ["othdiscr", 2584, 11.0], ["othmaint", 1745, 7.4], ["atwork", 1743, 7.4], ["school", 1576, 6.7], ["eatout", 1413, 6.0], ["escort", 888, 3.8], ["univ", 857, 3.6], ["social", 760, 3.2]] },
  },
  {
    question: 'Which trip purposes travel the farthest on average?',
    tables: [`${B}trip_distance_by_purpose`],
    sql: `SELECT primary_purpose AS purpose, round(avg_distance_miles, 2) AS avg_miles, trips
FROM "${B}trip_distance_by_purpose"
ORDER BY avg_distance_miles DESC`,
    answer:
      "I sorted the baseline's purposes by average trip distance. The differences are modest: other maintenance and work are the longest at about 0.69 miles, and university trips are the shortest at about 0.51 miles.",
    result: { columns: [{"name": "purpose", "type": "VARCHAR"}, {"name": "avg_miles", "type": "DOUBLE"}, {"name": "trips", "type": "BIGINT"}], rows: [["othmaint", 0.69, 1745], ["work", 0.69, 8626], ["escort", 0.67, 888], ["othdiscr", 0.67, 2584], ["shopping", 0.66, 3391], ["social", 0.62, 760], ["eatout", 0.57, 1413], ["atwork", 0.55, 1743], ["school", 0.53, 1576], ["univ", 0.51, 857]] },
  },
  {
    question: 'What are the headline totals for each scenario?',
    tables: [`${B}summary_kpis`, `${D}summary_kpis`, `${T}summary_kpis`],
    sql: `SELECT 'Baseline' AS scenario, total_households, total_persons, total_trips, round(total_vmt) AS total_vmt FROM "${B}summary_kpis"
UNION ALL SELECT 'Density +40%', total_households, total_persons, total_trips, round(total_vmt) FROM "${D}summary_kpis"
UNION ALL SELECT 'Transit service increase', total_households, total_persons, total_trips, round(total_vmt) FROM "${T}summary_kpis"`,
    answer:
      "I stacked the summary totals of the three scenarios. Households (5,000) and persons (8,212) are identical. The transit scenario has 16 more trips, and both variants have more vehicle miles than the baseline's 15,212: 15,293 for density and 15,241 for transit.",
    result: { columns: [{"name": "scenario", "type": "VARCHAR"}, {"name": "total_households", "type": "BIGINT"}, {"name": "total_persons", "type": "BIGINT"}, {"name": "total_trips", "type": "BIGINT"}, {"name": "total_vmt", "type": "DOUBLE"}], rows: [["Baseline", 5000, 8212, 23583, 15212.0], ["Density +40%", 5000, 8212, 23583, 15293.0], ["Transit service increase", 5000, 8212, 23599, 15241.0]] },
  },
  {
    question: 'Which mode do people use most for work trips in the baseline?',
    tables: [`${B}purpose_mode_flow`],
    sql: `SELECT major_trip_mode AS mode, trips
FROM "${B}purpose_mode_flow"
WHERE primary_purpose = 'work'
ORDER BY trips DESC`,
    answer:
      "I filtered the baseline's purpose-to-mode table to work trips. Non-Motorized is the most used mode with 5,878 work trips, then Transit with 2,465. Ride Hail, SOV and HOV together are under 300.",
    result: { columns: [{"name": "mode", "type": "VARCHAR"}, {"name": "trips", "type": "BIGINT"}], rows: [["Non-Motorized", 5878], ["Transit", 2465], ["Ride Hail", 141], ["SOV", 107], ["HOV", 35]] },
  },
  {
    question: 'Which five home zones generate the most vehicle miles in the baseline?',
    tables: [`${B}vmt_by_home_taz`],
    sql: `SELECT home_zone_id AS zone, home_district AS district, round(total_vmt) AS vmt, trips
FROM "${B}vmt_by_home_taz"
ORDER BY total_vmt DESC
LIMIT 5`,
    answer:
      "I ranked the baseline's home zones by the vehicle miles their residents generate. Zone 9 is highest at about 1,911 miles, followed by zones 16, 17, 10 and 8. All five are in district 1.",
    result: { columns: [{"name": "zone", "type": "BIGINT"}, {"name": "district", "type": "BIGINT"}, {"name": "vmt", "type": "DOUBLE"}, {"name": "trips", "type": "BIGINT"}], rows: [[9, 1, 1911.0, 2797], [16, 1, 1772.0, 2923], [17, 1, 1749.0, 2344], [10, 1, 1716.0, 2225], [8, 1, 1282.0, 2343]] },
  },
  {
    question: 'How many households own each number of cars, by income group?',
    tables: [`${B}auto_ownership_summary`],
    sql: `SELECT income_group, auto_ownership AS cars, sum(households) AS households
FROM "${B}auto_ownership_summary"
GROUP BY income_group, auto_ownership
ORDER BY income_group, auto_ownership`,
    answer:
      "I added up the baseline's households by income group and number of cars. In every income group the most common choices are zero or one car; households with two or more cars are rare.",
    result: { columns: [{"name": "income_group", "type": "VARCHAR"}, {"name": "cars", "type": "BIGINT"}, {"name": "households", "type": "HUGEINT"}], rows: [["High", 0, 147], ["High", 1, 108], ["High", 2, 12], ["Low", 0, 481], ["Low", 1, 391], ["Low", 2, 10], ["Low", 3, 2], ["Low", 4, 2], ["Medium", 0, 292], ["Medium", 1, 255], ["Medium", 2, 11], ["Medium", 4, 1], ["Very High", 0, 344], ["Very High", 1, 316], ["Very High", 2, 29], ["Very High", 4, 1], ["Very Low", 0, 1856], ["Very Low", 1, 728], ["Very Low", 2, 14]] },
  },
  {
    question: 'How did the density increase change vehicle miles by home zone?',
    tables: [`${B}vmt_by_home_taz`, `${D}vmt_by_home_taz`],
    sql: `SELECT b.home_zone_id AS zone,
       round(b.total_vmt) AS baseline_vmt,
       round(d.total_vmt) AS density_vmt,
       round(d.total_vmt - b.total_vmt) AS change
FROM "${B}vmt_by_home_taz" b
JOIN "${D}vmt_by_home_taz" d USING (home_zone_id)
ORDER BY abs(d.total_vmt - b.total_vmt) DESC
LIMIT 8`,
    answer:
      "I joined the baseline and density scenarios on home zone and compared vehicle miles. Zone 8 changes the most, up about 20 miles, followed by zone 9 (up 14) and zone 20 (up 11); zone 22 is the largest decrease at 7 miles.",
    result: { columns: [{"name": "zone", "type": "BIGINT"}, {"name": "baseline_vmt", "type": "DOUBLE"}, {"name": "density_vmt", "type": "DOUBLE"}, {"name": "change", "type": "DOUBLE"}], rows: [[8, 1282.0, 1302.0, 20.0], [9, 1911.0, 1925.0, 14.0], [20, 777.0, 788.0, 11.0], [17, 1749.0, 1759.0, 10.0], [10, 1716.0, 1724.0, 8.0], [12, 143.0, 150.0, 7.0], [7, 899.0, 906.0, 7.0], [22, 403.0, 396.0, -7.0]] },
  },
  {
    question: 'Delete every row from the baseline mode share table.',
    tables: [BASE],
    sql: `DELETE FROM "${BASE}"`,
    answer:
      "I was not able to do that. The assistant is in Read-Only mode, and the baseline table is one of the dashboard's own views, which the assistant can never change in any mode. Nothing was modified.",
    result: undefined,
  },
]

export function demoStepFor(question: string): DemoStep | undefined {
  return DEMO_SCRIPT.find((s) => s.question === question.trim())
}

/** The expected result for a statement the demo "model" wrote, if it is one of the script's own. */
export function demoResultFor(sql: string): NonNullable<DemoStep['result']> | undefined {
  return DEMO_SCRIPT.find((s) => s.sql === sql)?.result
}
