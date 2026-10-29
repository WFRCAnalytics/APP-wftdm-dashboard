# Contract: viewer-facing settings keys

Additions to `dashboard-config.yaml` (and a page's `header:`). The generated `project-docs/CONFIG-REFERENCE.md` and `dashboard-config.schema.json` list them with the rest; this contract fixes the shape. Keys are `snake_case`; every key is optional; an unset key leaves today's behaviour.

## Site file

```yaml
docs:
  url: https://example.org/dashboard-docs/    # http or https only; unset = no icon
  label: Documentation                         # default "Documentation"; text only

settings:
  tabs: [scenarios, appearance, basemap]       # order and visibility; names: appearance, scenarios, basemap, assistant, documentation
```

- `docs.url`: must be a web address with scheme `http` or `https` and no spaces. Anything else is reported and treated as unset (no icon).
- `settings.tabs`: shown exactly as listed, in order; the first listed tab opens first. Unknown names, repeats and an all-invalid list are reported; an empty result shows today's tabs. `assistant` is dropped when `assistant.enabled` is false.
- Relative documentation addresses are not accepted in this version.

## Page file (`header:`)

```yaml
header:
  tab: Mode choice
  title: Mode choice
  docs: pages/mode-choice/#shares      # appended to docs.url with one "/" between
  hidden: true                         # not in the sidebar; reachable at #/<slug>
```

- `header.docs`: a relative path, optionally with `#fragment` or `?query`. A full address (with a scheme, or starting `//`) is reported and ignored. Without a site `docs.url` it is reported and ignored.
- `header.hidden`: `true` or `false` (default `false`). Never cascades. A page that is the only page is listed and is the landing page whatever its flag. If every one of several pages is hidden it is reported and all are listed.
- `header.draft` is **not part of this contract**: it is neither read nor reserved.

## Behaviour

| Condition | Result |
|---|---|
| `docs.url` set | a link with the label at the foot of the left sidebar (all forms: expanded, collapsed rail, mobile sheet), opens in a new tab, `rel="noopener noreferrer"` |
| page has `header.docs` and is open | the link opens `docs.url` + `/` + path |
| any other page, Settings open, or a chromeless page | the link opens `docs.url` |
| `docs.url` unset | no link; the Settings Documentation tab unchanged |
| `settings.tabs` unset | five tabs, today's order |
| landing page | the first page that is not hidden |

## Reported problems

See the catalogue in [data-model.md](../data-model.md). Each is shown in the configuration note and the console, and by `npm run check` (exit 1), with the file and key path.
