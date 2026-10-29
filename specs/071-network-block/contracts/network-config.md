# Contract: the `network` block

```yaml
network:
  fonts: bundled                 # bundled | any (default any)
  basemaps:
    allow: ["protomaps-*", "ugrc-vector-lite", "OpenStreetMap.*"]   # patterns on basemap ids; empty or absent: all
  duckdb_extensions: "https://mirror.example.org/duckdb"          # http or https
```

## Behaviour

- **`fonts: bundled`**: the Appearance tab offers Schibsted Grotesk and System UI only; no custom-font inputs, no shortlist; no request to a font host (previews included); a session preference for another family is ignored.
- **`basemaps.allow`**: the Basemap tab lists only matching entries (built-in styles, Protomaps flavours, raster providers); every map resolves through the list; a winner that is not allowed becomes the first allowed entry, or the blank background; the replacement is reported once. Patterns use `*` only and ignore letter case. A style written by the deployer in a page (a `layers` composition or a full style URL) is not blocked and is listed by `check --explain`.
- **`duckdb_extensions`**: set as the extension repository by the app before any extension is used. User SQL cannot change it (the SQL guard is unchanged).
- Unset keys leave every request as it is today.

## Reported (never fatal)

Unknown font mode; an allow-list that is not a list of text; a pattern that matches no known entry; a list that matches nothing; an effective default that is not allowed (site, page or panel); an extension address that is not `http`/`https`; any `network` key on a page or panel. Each appears once with its key path in the configuration note and by `npm run check`.

## `npm run check -- <folder> --explain`

Adds the list of outside hosts still reachable (fonts, the extension host, allowed catalogue entries' hosts, hosts of styles written in pages), as information; the exit code depends only on real problems.

## Not in this block

Content-security-policy, tile proxying, per-scenario data hosts, the assistant's providers (068).
