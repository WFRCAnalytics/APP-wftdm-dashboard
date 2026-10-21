import { SHARE_DOMAIN } from '@/charts/lib/mapMath'
// Display unit of trip counts in the time-of-day charts: values are shown in thousands ("812k") for a regional model and as
// plain counts for a small one. A deployment sets it in dashboard-config `units.trips`. Live, like vocab.ts.
export const TRIPS_UNIT = { divisor: 1000, suffix: 'k' }

export function configureUnits(cfg: { trips?: { divisor?: number; suffix?: string }; transit_share_max?: number } | undefined): void {
  SHARE_DOMAIN[1] = cfg?.transit_share_max && cfg.transit_share_max > 0 ? cfg.transit_share_max : 14
  TRIPS_UNIT.divisor = cfg?.trips?.divisor ?? 1000
  TRIPS_UNIT.suffix = cfg?.trips?.suffix ?? 'k'
}
