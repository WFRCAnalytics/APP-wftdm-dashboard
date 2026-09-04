# Specification Quality Checklist: $baseline consumption across panel types (diff/percent-diff rendering)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-04
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

- The user's own request text was cut off mid-sentence ("...do not leave this to silently produce"). Rather than guess a completion or block on a [NEEDS CLARIFICATION] marker, the spec's own "Grammar & architecture findings" §6 resolves it using an already-shipped precedent found in this exact codebase (`summarize.yaml`'s `screenlines` metric's `NULLIF(...,0)` idiom) — a single, well-grounded, defensible answer, matching the same rigor the user's own two cited precedents (005-table-panel, 013-zonemap-panel) already established, not a genuine multi-way fork needing the user's input.
- All three of the user's own explicit "REQUIRED RESEARCH" questions are answered directly in the "Grammar & architecture findings" section, each grounded in a real, current file read before any design decision was made.
- A fourth research question (§7) was added afterward, at the user's own explicit request: confirmed directly against all four panel types' real, current data-fetch effect structure that each already follows one identical, established pattern (a reactive hook's return value in the effect's dependency array) — adding `useBaseline()` the same way presents no structural obstacle in any of the four. Formalized as FR-016, since FR-002 alone stated the required outcome without explicitly mandating the reactive-dependency mechanism that makes it actually true in the running app.
- Exact shapes deferred to planning (Assumptions): whether `compare_on` is a bare string or always a list; the shared query-builder's exact function signature/module location.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
