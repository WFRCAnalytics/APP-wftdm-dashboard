import { chartRole, type DataType, type Role } from '@/charts/builder/columnTypes'

/** The chart role of a data type; kept in its own tiny module so UI files do not import the whole builder core. */
export const roleOfType = (t: DataType): Role => chartRole(t)
