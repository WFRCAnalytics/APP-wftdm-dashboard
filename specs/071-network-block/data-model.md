# Data model: Control the outside calls

## The settings (`dashboard-config.yaml`, site-only)

| Key | Type | Values | Unset means |
|---|---|---|---|
| `network.fonts` | enum | `bundled`, `any` | `any` (today) |
| `network.basemaps.allow` | list of text | patterns using `*` | every catalogue entry allowed |
| `network.duckdb_extensions` | text | an `http` or `https` address | DuckDB's own host |

None carries a schema default (the defaults are today's behaviour).

## The catalogue

| Group | Ids | Hosts (for `--explain`) |
|---|---|---|
| Built-in styles | `carto-positron`, `carto-dark-matter`, `carto-voyager`, `openfreemap-*`, `ugrc-vector-*` | the preset URL or each composition layer's host |
| Protomaps | `protomaps-light`, `-dark`, `-white`, `-grayscale`, `-black` | the deployer's own tile file, or the hosted-map service when an API key is set |
| Raster providers | `Provider` (no variants) or `Provider.Variant` from the curated list in `public/basemap/leaflet-providers.json` | the tile host of each provider |

A selection that is a composition object or a full style URL is deployer-authored: never blocked, listed by `--explain`.

## Rules

- **Matching**: `*` matches any run of characters, everything else is literal, case-insensitive, the whole id must match. An empty or absent list allows everything.
- **Fallback** when the winning selection is a catalogue name that is not allowed: the first allowed entry (catalogue order); the blank background when none; reported once per distinct selection.
- **Fonts bundled**: offered families are the default (Schibsted Grotesk) and System UI; nothing is loaded from an outside host; a viewer preference for another family is ignored.
- **Extension address**: applied once, by the app, before any extension is used.

## Problem catalogue

| Situation | Reported at | Result |
|---|---|---|
| `network.fonts` is not `bundled` or `any` | load, `check` | `any` |
| `network.basemaps.allow` is not a list of text | load, `check` | no list (everything allowed) |
| a pattern matches no known catalogue id | `check`, the Basemap tab once the catalogue loads | the pattern is kept; other patterns still apply |
| the whole list matches nothing | `check`, boot note | blank background on every map |
| the effective default (app, site, page or panel) is not allowed | `check`; the note once at first use | the first allowed entry |
| `network.duckdb_extensions` is not an `http`/`https` address | load, `check` | ignored (DuckDB's own host) |
| a `network` key at page or panel level | `validate` ("site setting") | ignored |

## `--explain` output (information only)

```
outside hosts this configuration can still reach:
  fonts.googleapis.com            fonts are not bundled
  extensions.duckdb.org           no network.duckdb_extensions
  tiles.openfreemap.org           allowed basemap openfreemap-liberty
  <host>                          page "Network", panel basemap (a style written in the page)
```

or `no outside host is known` when the list is empty.
