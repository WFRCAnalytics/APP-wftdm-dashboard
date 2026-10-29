# Contract: assistant settings keys

Additions to the `assistant:` group of `dashboard-config.yaml` (next to the existing `enabled`). The generated `project-docs/CONFIG-REFERENCE.md` and `dashboard-config.schema.json` list them with the rest; this contract fixes the shape. Keys are `snake_case`, every key is optional, all are site-only (no page or panel can set them).

```yaml
assistant:
  enabled: true                       # existing; false turns the whole feature off and wins over everything below
  providers:                          # replaces the built-in providers when it has a valid entry
    - id: agency-gateway
      label: Agency gateway
      base_url: https://llm.agency.example/v1
      models: [gpt-4.1, llama3.1]
      needs_key: true
      protocol: openai                # openai (default) | anthropic
  default: { provider: agency-gateway, model: gpt-4.1 }
  prompt_addendum: Our zones are called TAZs.
  limits: { round_trips: 6, preview_rows: 1000, model_rows: 50 }
```

## Rules

- **Providers**: see the entry table in [data-model.md](../data-model.md). The list replaces the built-ins (OpenAI, Anthropic, Deepseek, Ollama, Demo) when at least one entry is valid; with none valid (or an empty list) the built-ins stay and a problem is reported. Order is kept.
- **Address**: `http` or `https` only. With a deployer's list in force the Settings form shows a listed provider's address but does not let it be edited, and the app refuses requests to any address that is not a listed provider's.
- **Key**: there is no key, token or secret setting. The viewer enters their own token in Settings for the session; a provider with `needs_key: false` shows no token field.
- **Default**: `provider` must be a listed id (or, with no list, a built-in id); `model` may be any name. Settings opens with them selected.
- **Note**: plain text, at most 2000 characters, appended after the built-in instructions, never shown to the viewer.
- **Limits**: `round_trips` 1 to 12 (steps a question may take), `preview_rows` 100 to 5000 (rows the viewer sees), `model_rows` 1 to 200 (rows shared with the model when the viewer's privacy setting shares results). Integers; out of range is reported and the default used.
- **Unchanged**: the SQL safety rules, Read-Only and Modify modes, the privacy choice and the 8 KB cap on what is shared with the model.

## Secret-like names

Any field whose name is, or contains as a separate part, `key`, `token`, `secret`, `password`, `passwd` or `authorization` (any letter case, `_`, `-` or camelCase separated) in the assistant block, a provider entry, or anywhere else in the site file that is not a declared setting, is reported as not allowed ("secrets are not configuration; viewers enter their own token"). The value is never read, stored or printed. (The one declared exception is `basemap.protomaps.api_key`, a domain-restricted hosted-map key, CONFIGURATION.md section 7.)

## Limit of the address lock

The lock is a client-side guard in the page. It stops a viewer pointing the assistant elsewhere through the Settings form or a stale draft; it is not a defence against someone who modifies the page's code in their own browser.

## Reported problems

See the catalogue in [data-model.md](../data-model.md). Each is shown in the configuration note and the console, and by `npm run check` (exit 1), with the file and key path. A bad provider entry is skipped without affecting the others; a wrong value keeps its default; the app always loads.
