// Filter pub/sub store. In-memory only — no localStorage/sessionStorage
// (constitution Principle VI). See
// specs/001-data-state-layer/contracts/filter-state.md.

/** @type {Map<string, any>} */
const values = new Map()

/** @type {Map<string, Set<(id: string, value: any) => void>>} */
const subscribersById = new Map()

/** @type {Set<(id: string, value: any) => void>} */
const wildcardSubscribers = new Set()

/**
 * @param {string} id
 * @returns {any} the current value, or undefined if never set
 */
export function get(id) {
  return values.get(id)
}

/**
 * Stores `value` under `id` and synchronously notifies every subscriber
 * registered for exactly `id`, plus every '*' wildcard subscriber — each
 * exactly once per call.
 * @param {string} id
 * @param {any} value
 */
export function set(id, value) {
  values.set(id, value)
  const idSubs = subscribersById.get(id)
  if (idSubs) {
    for (const fn of idSubs) fn(id, value)
  }
  for (const fn of wildcardSubscribers) fn(id, value)
}

/**
 * Registers `fn` against every id in `ids` (or the '*' wildcard).
 * @param {string[] | ['*']} ids
 * @param {(id: string, value: any) => void} fn
 * @returns {() => void} unsubscribe function
 */
export function subscribe(ids, fn) {
  const targets = []

  for (const id of ids) {
    if (id === '*') {
      wildcardSubscribers.add(fn)
      targets.push({ wildcard: true })
      continue
    }
    let set_ = subscribersById.get(id)
    if (!set_) {
      set_ = new Set()
      subscribersById.set(id, set_)
    }
    set_.add(fn)
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

/** @returns {Object} a plain-object snapshot of every {id: value} pair */
export function getAll() {
  return Object.fromEntries(values)
}
