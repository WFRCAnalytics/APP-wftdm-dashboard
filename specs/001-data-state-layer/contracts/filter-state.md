# Contract: `state/filterState.js`

Satisfies: FR-018, FR-019.

## `get(id: string): any`

Returns the current value for `id`, or `undefined` if never set.

## `set(id: string, value: any): void`

Stores `value` under `id`. Synchronously notifies:
- every subscriber registered for exactly `id`
- every subscriber registered for the `'*'` wildcard

Each notified subscriber is called exactly once per `set()` call, in any
order (order is not part of the contract).

- **Given** a subscriber on `'purpose'` and a subscriber on `'*'`, **when**
  `set('purpose', 'HBW')` is called, **then** both are notified exactly once
  and a subscriber on `'income'` is not notified (SC-005).
- **Given** no subscriber yet exists for `'purpose'`, **when**
  `set('purpose', 'HBW')` is called and later `subscribe(['purpose'], fn)` is
  registered, **then** a subsequent `get('purpose')` still returns `'HBW'`
  (value survives having no subscriber at set-time — edge case in spec).

## `subscribe(ids: string[] | ['*'], fn: (id: string, value: any) => void): () => void`

Registers `fn` against every id in `ids` (or the wildcard). Returns an
unsubscribe function.

- **Given** a subscriber has called its returned unsubscribe function,
  **when** a filter it was watching changes again, **then** it receives no
  further notification (spec edge case, SC-005's "0% of unrelated
  subscribers" extended to "0% after unsubscribing").

## `getAll(): Object`

Returns a plain object snapshot of every `{id: value}` pair currently stored.

## Non-goals for this slice

- No persistence — values live only in memory for the page's lifetime (no
  `localStorage`/`sessionStorage`, per constitution Principle VI).
- No validation that a subscribed `id` corresponds to a real filter defined in
  any loaded dashboard config — that's the panel/layout layer's concern.
