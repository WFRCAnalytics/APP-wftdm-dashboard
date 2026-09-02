// 011-basemap-style-system: one-time/refresh extraction of leaflet-providers'
// real provider-definitions data (research.md §4). Uses the REAL `leaflet`
// + `leaflet-providers` packages — devDependencies only (package.json's
// devDependencies, never dependencies) — executed here, in this one
// Node-only script, and nowhere else. No src/ file imports either
// package, so Vite's production build never bundles them; the shipped
// app stays MapLibre-only (constitution Principle VI unaffected). Chosen
// over a regex/Function()-based text extraction of the object literal
// specifically to avoid any "equivalent dynamic code execution" ambiguity
// against constitution Principle III — this reuses the real, already-
// correct upstream UMD module via ordinary `require()`, not a hand-rolled
// evaluator. Run manually (`node scripts/extractLeafletProviders.mjs`)
// when refreshing against a newer upstream release — never at app
// runtime, never in CI on every build.
//
// A jsdom shim (also a devDependency-only addition, found necessary
// empirically — not part of the original plan) is required before
// importing `leaflet` at all: `leaflet-src.js` references `window`
// directly at MODULE-LOAD time (`var requestFn = window
// .requestAnimationFrame || ...`, evaluated the moment the module is
// first executed, not deferred until a map is constructed), so a plain
// Node `import`/`require` throws `ReferenceError: window is not defined`
// immediately — confirmed by actually running this script during
// implementation, not assumed safe from the plan alone. `leaflet`/
// `leaflet-providers` are imported dynamically, after the shim globals
// are in place, since static `import` specifiers are hoisted ahead of
// any other top-level code and would run before the shim exists.
import { writeFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
// Node (since ~v21) defines its OWN read-only `navigator` global —
// confirmed empirically (`TypeError: Cannot set property navigator of
// #<Object> which has only a getter` on a plain assignment) — so it must
// be overridden via defineProperty, not a plain `=` assignment.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })

const { default: L } = await import('leaflet') // devDependency only
// leaflet-providers.js's own UMD wrapper checks `typeof modules ===
// 'object'` (plural — confirmed by actually running this script: an
// apparent upstream typo, since the very same condition also checks
// `module.exports`, singular; `modules` is never a real global, so
// `typeof modules` is always 'undefined' and that CommonJS branch never
// fires) — it always falls through to `factory(L)`, expecting a bare
// global `L` to already exist, not a `require('leaflet')` return value.
// Setting it explicitly here is what that fallback branch actually
// needs, not a workaround for something this app does differently.
globalThis.L = L
await import('leaflet-providers') // devDependency only — attaches to the real `L` above

const OUT_PATH = new URL('../public/basemap/leaflet-providers.json', import.meta.url)

const providers = L.TileLayer.Provider.providers
await writeFile(OUT_PATH, JSON.stringify(providers, null, 2))
console.log(`Wrote ${Object.keys(providers).length} providers to ${OUT_PATH}`)
