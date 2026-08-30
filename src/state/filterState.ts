// Filter pub/sub store. In-memory only — no localStorage/sessionStorage
// (constitution Principle VI). See
// specs/001-data-state-layer/contracts/filter-state.md.

export type FilterId = string
export type FilterValue = unknown
export type FilterSubscriber = (id: FilterId, value: FilterValue) => void
export type Unsubscribe = () => void

const values = new Map<FilterId, FilterValue>()
const subscribersById = new Map<FilterId, Set<FilterSubscriber>>()
const wildcardSubscribers = new Set<FilterSubscriber>()

/** @returns the current value, or undefined if never set */
export function get(id: FilterId): FilterValue {
  return values.get(id)
}

/**
 * Stores `value` under `id` and synchronously notifies every subscriber
 * registered for exactly `id`, plus every '*' wildcard subscriber — each
 * exactly once per call.
 */
export function set(id: FilterId, value: FilterValue): void {
  values.set(id, value)
  const idSubs = subscribersById.get(id)
  if (idSubs) {
    for (const fn of idSubs) fn(id, value)
  }
  for (const fn of wildcardSubscribers) fn(id, value)
}

type SubscriptionTarget = { wildcard: true } | { wildcard: false; id: FilterId }

/**
 * Registers `fn` against every id in `ids` (or the '*' wildcard).
 * @returns unsubscribe function
 */
export function subscribe(ids: FilterId[] | ['*'], fn: FilterSubscriber): Unsubscribe {
  const targets: SubscriptionTarget[] = []

  for (const id of ids) {
    if (id === '*') {
      wildcardSubscribers.add(fn)
      targets.push({ wildcard: true })
      continue
    }
    let idSet = subscribersById.get(id)
    if (!idSet) {
      idSet = new Set()
      subscribersById.set(id, idSet)
    }
    idSet.add(fn)
    targets.push({ wildcard: false, id })
  }

  return function unsubscribe() {
    for (const target of targets) {
      if (target.wildcard) {
        wildcardSubscribers.delete(fn)
      } else {
        subscribersById.get(target.id)?.delete(fn)
      }
    }
  }
}

/** @returns a plain-object snapshot of every {id: value} pair */
export function getAll(): Record<FilterId, FilterValue> {
  return Object.fromEntries(values)
}
