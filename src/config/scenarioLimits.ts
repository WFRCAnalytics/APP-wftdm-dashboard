// How many scenarios may be on at once (`scenarios.warn_at`, `scenarios.max_active`). Pure: the schema table, the checker and
// the app all read it. Side-by-side maps draw one WebGL view per scenario and browsers allow about 16 of them, so a larger
// maximum is accepted (it is the deployer's choice) but reported with a clear warning.
export const DEFAULT_WARN_AT = 8
export const DEFAULT_MAX_ACTIVE = 16
/** Roughly how many WebGL contexts a browser allows before it drops the oldest. */
export const WEBGL_SAFE_LIMIT = 16

export interface ScenarioLimits { warnAt: number; maxActive: number }

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1

/** The schema `clean` hook for `scenarios.max_active`: keeps a whole number of 1 or more; warns above the WebGL-safe limit. */
export function cleanMaxActive(value: unknown): { value: unknown; messages: string[] } {
  if (!whole(value)) return { value: undefined, messages: [`expected a whole number of 1 or more; the default (${DEFAULT_MAX_ACTIVE}) is used`] }
  if (value > WEBGL_SAFE_LIMIT) {
    return {
      value,
      messages: [`${value} is above ${WEBGL_SAFE_LIMIT}. Browsers allow about ${WEBGL_SAFE_LIMIT} WebGL views at once and each side-by-side map uses one, so with more than ${WEBGL_SAFE_LIMIT} scenarios on, maps can go blank or the page can slow down. The value is used as set.`],
    }
  }
  return { value, messages: [] }
}

/** The schema `clean` hook for `scenarios.warn_at`. */
export function cleanWarnAt(value: unknown): { value: unknown; messages: string[] } {
  if (!whole(value)) return { value: undefined, messages: [`expected a whole number of 1 or more; the default (${DEFAULT_WARN_AT}) is used`] }
  return { value, messages: [] }
}

/** The limits to use. A warning point above the maximum would never show, so it is pulled down to the maximum. */
export function resolveLimits(warnAt: number | undefined, maxActive: number | undefined): ScenarioLimits {
  const max = whole(maxActive) ? maxActive : DEFAULT_MAX_ACTIVE
  const warn = whole(warnAt) ? warnAt : DEFAULT_WARN_AT
  return { warnAt: Math.min(warn, max), maxActive: max }
}
