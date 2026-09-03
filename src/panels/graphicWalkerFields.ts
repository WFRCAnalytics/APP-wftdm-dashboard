// 014-graphic-walker-panel — pure, DOM-free Arrow-schema-to-IMutField[]
// inference (research.md §5, contracts/graphic-walker-panel.md). Split out
// of GraphicWalkerPanel.tsx same reason plotlyTraces.ts/sankeyGraph.ts/
// zonemapColor.ts were each split out of their own panel component: pure
// logic is directly Vitest-testable without a DOM/React render.
//
// @kanaries/graphic-walker's own `fields` input is required, not
// auto-inferred from an empty array — no package documentation describes
// auto-inference, and this project's own design deliberately keeps
// inference in application code rather than depending on the library's
// internal (non-public-API) lib/inferMeta module, confirmed present in the
// installed 0.4.82 package but not re-exported from its own public entry
// point (research.md §5's "residual verification item," resolved during
// implementation: relying on an unexported internal module would be more
// fragile than this file's own small, explicit mapping).
import { DataType, type Field } from 'apache-arrow'

import type { GraphicWalkerFieldOverride } from '@/layout/types'

// Mirrors @kanaries/graphic-walker's own real IMutField shape (confirmed
// against the installed package's dist/interfaces.d.ts) — not re-imported
// from the library directly, since this app only ever needs this one
// narrow slice of that interface, matching how this project's other pure
// modules (e.g. sankeyColor.ts) shape their own return types locally
// rather than importing a third-party interface wholesale.
export interface InferredField {
  fid: string
  name: string
  semanticType: 'quantitative' | 'nominal' | 'ordinal' | 'temporal'
  analyticType: 'dimension' | 'measure'
}

/**
 * Derives one InferredField per Arrow schema field, using apache-arrow's
 * own DataType predicates (research.md §5's mapping table), confirmed
 * directly against the installed apache-arrow version before this file was
 * written (not assumed from memory of the API shape). Then applies any
 * config.fields override (matched by fid) wholesale — no partial merge,
 * same convention TableColumnConfig's own override list already uses. An
 * override naming a fid absent from schemaFields is simply never applied —
 * the query result, not the override list, defines which fields exist at
 * all.
 */
export function inferFields(
  schemaFields: Field[],
  overrides: GraphicWalkerFieldOverride[] = [],
): InferredField[] {
  const overrideByFid = new Map(overrides.map((o) => [o.fid, o]))
  return schemaFields.map((f) => {
    const override = overrideByFid.get(f.name)
    if (override) {
      return {
        fid: override.fid,
        name: override.name ?? f.name,
        semanticType: override.semanticType,
        analyticType: override.analyticType,
      }
    }
    return { fid: f.name, name: f.name, ...inferTypesFromArrow(f.type) }
  })
}

// research.md §5's mapping table, applied to one Arrow DataType. isBool/
// isUtf8/isDictionary, and any other type not explicitly handled above,
// all fall through to the nominal/dimension default — there is no
// separate isBool branch, since nominal/dimension is already its correct
// mapping too (docs/GRAMMAR.md's own field-schema grammar draws no
// distinction between a boolean flag and any other low-cardinality
// categorical column).
function inferTypesFromArrow(type: unknown): Pick<InferredField, 'semanticType' | 'analyticType'> {
  if (DataType.isInt(type) || DataType.isFloat(type)) {
    return { semanticType: 'quantitative', analyticType: 'measure' }
  }
  if (DataType.isDate(type) || DataType.isTimestamp(type)) {
    return { semanticType: 'temporal', analyticType: 'dimension' }
  }
  return { semanticType: 'nominal', analyticType: 'dimension' }
}
