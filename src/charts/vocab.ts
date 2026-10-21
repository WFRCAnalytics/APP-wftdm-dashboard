// Category vocabularies and their display order (project-docs/redesign/04-chart-catalogue.md, top). Charts draw
// categories in this order whatever order a table returns them in; a category absent from a table still gets its slot.

export const MODES = ['Drive alone', 'Shared ride', 'Transit', 'Walk', 'Bike', 'School bus'] as const
export const PURPOSES = ['Work', 'School', 'Shopping', 'Other', 'Non-home'] as const
export const INCOMES = ['Under $35k', '$35k to $75k', '$75k to $125k', 'Over $125k'] as const
export const AUTOS = ['0 cars', '1 car', '2 cars', '3 cars', '4+ cars'] as const
export const DISTANCE_BANDS = ['Under 2 mi', '2 to 8 mi', 'Over 8 mi'] as const
export const DISTRICTS = ['Weber', 'Davis', 'Salt Lake', 'Utah', 'Tooele'] as const
export const FACILITIES = ['Freeway', 'Arterial', 'Collector', 'Local'] as const
export const COUNTIES = ['Salt Lake', 'Utah', 'Davis', 'Weber', 'Tooele', 'External'] as const

/** Index of `name` in `order`, unknown names last (stable). */
export function orderIndex(order: readonly string[], name: string): number {
  const i = order.indexOf(name)
  return i < 0 ? order.length : i
}
