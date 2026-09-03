# Specification Quality Checklist: ZoneMapPanel

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- This feature required two live corrections to the request that
  triggered it, both stated plainly in the spec's own "Grammar &
  documentation findings" section rather than left as open questions:
  1. `008-sankey-panel`'s `color_scheme` (categorical named-palette)
     was cited as the color-convention precedent to follow, but direct
     inspection found `005-table-panel`'s `tableLogic.ts` `cellColor()`
     (continuous `sequential`/`diverging` + `domain`, token-derived,
     capped `color-mix()`) is the actual matching precedent for this
     panel type's own `color_scale`/`domain` grammar.
  2. Principle VIII's reference-implementation table was assumed to
     need a new entry for this feature; direct inspection of
     `.specify/memory/constitution.md` found both `ar-puuk/
     spatial-sql-explorer` and `ar-puuk/parquet-viewer` already present
     since v1.0.0 — no constitution amendment is needed.
- `maplibregl.Map`/`MapboxOverlay`/`ST_Read`/GeoJSON/`color-mix()`-style
  technology names appear in Requirements/Key Entities because they are
  the literal, already-fixed API surface this feature's requirements
  bind to (`docs/SPEC.md`'s own documented "ZoneMapPanel wiring"
  snippet, `docs/GRAMMAR.md`'s own `type: zonemap` grammar,
  `tableLogic.ts`'s already-shipped color convention) — not a new
  implementation choice introduced by this spec, matching every prior
  panel-type spec's own precedent (`010-flowmap-panel`'s checklist notes
  the same reasoning) for citing already-pinned technology by name.
- Several implementation-shaped questions were deliberately deferred to
  planning rather than raised as [NEEDS CLARIFICATION], each with the
  *requirement* fixed here and only the *mechanism* left open, mirroring
  `010-flowmap-panel`'s own precedent for the same kind of decision:
  1. Whether a real, specific capability gap forces deck.gl despite
     existing project docs already pointing to pure MapLibre (Grammar
     findings #4, FR-004) — the requirement (one WebGL context per
     panel unless proven otherwise) is fixed; the confirming check is a
     planning-phase task.
  2. DuckDB-WASM's real spatial-extension API surface and its possible
     shared CDN-fetch behavior with the `parquet` extension (Grammar
     findings #10, FR-014) — the requirement (confirm and honestly
     document) is fixed; the specific finding is a planning-phase task.
  3. The GeoParquet zone-boundary fixture source, named-`color_ramp`
     resolution mechanics, `comparison: diff`'s `expr` computation
     mechanism, and the `steps` key's exact role — each has its
     constraint fixed in Requirements (no `eval()`, must match the
     established color convention, must produce the shared error/empty
     states) with the specific mechanism resolved during planning.
  4. The zone geometry cache's eviction policy (FR-003a) — unlike the
     other three, this one is called out with an explicit MUST-record
     requirement rather than a default-and-move-on: `research.md` MUST
     state either a deliberate accepted tradeoff (with its reasoning)
     or a basic cap/LRU mechanism, so the cache's unbounded-by-default
     lifetime doesn't sit as an undocumented gap the way the
     `extensions.duckdb.org` network dependency did until
     `010-flowmap-panel` happened to surface it.
