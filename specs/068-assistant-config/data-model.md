# Data model: Assistant settings

## Settings (schema rows, all site-only)

| Path | Type | Default | Notes |
|---|---|---|---|
| `assistant.providers` | list (of maps) | unset (built-ins) | cleaned by `cleanProviders`; replaces the built-ins when it has at least one valid entry |
| `assistant.default.provider` | string | first listed (or `openai`) | checked against the catalogue by `checkDefault` |
| `assistant.default.model` | string | the provider's first suggested model | any name allowed |
| `assistant.prompt_addendum` | string | unset | at most 2000 characters; longer is reported and dropped |
| `assistant.limits.round_trips` | integer | 6 | 1 to 12 |
| `assistant.limits.preview_rows` | integer | 1000 | 100 to 5000 |
| `assistant.limits.model_rows` | integer | 50 | 1 to 200 |

`assistant.enabled` (existing) stays as is and wins: with it false none of this has any effect (the keys are still checked).

## Provider entry (input, per list element)

```yaml
- id: agency-gateway          # required; lowercase letters, digits, - and _; 1 to 40; unique
  label: Agency gateway       # optional; defaults to the id
  base_url: https://llm.agency.example/v1   # required; http or https only
  models: [gpt-4.1, llama3.1] # optional suggestions; any name can still be typed
  needs_key: true             # optional; default true
  protocol: openai            # optional; openai (default) | anthropic
```

## Resolved policy (runtime, `assistantPolicy.ts`)

```ts
interface ProviderPreset {            // existing shape, extended
  id: string; label: string; baseUrl: string; model: string
  needsKey: boolean; models: string[]
  protocol: 'openai' | 'anthropic'
  locked: boolean                     // true for a deployer's provider: the address cannot be edited
}
interface AssistantPolicy {
  catalogue: ProviderPreset[]         // the deployer's list, or the built-ins (openai, anthropic, deepseek, demo, ollama)
  locked: boolean                     // true when the deployer's list is in force
  defaultProvider: string             // an id in the catalogue
  defaultModel?: string
  promptNote?: string
  limits: { roundTrips: number; previewRows: number; modelRows: number }
}
```

- `locked` is true only when a valid deployer list is in force; then `isAddressAllowed(url)` is true only for a request that starts with one of the catalogue's addresses.
- A deployer provider's model default is `assistant.default.model` when it names that provider, else its first suggested model, else empty.
- `DashboardBranding.assistant` carries the validated values from `toBranding` (`providers`, `default`, `promptAddendum`, `limits`); `configureAssistant()` turns them into the policy.

## Changed existing types

- `ProviderId`: closed union to `string` (built-in ids stay the same strings).
- `ProviderConfig`: gains `protocol: 'openai' | 'anthropic'`; the draft and the saved config carry it from the chosen preset.

## Problem catalogue

| Kind | Path | Message (gist) |
|---|---|---|
| invalid_value | `assistant.providers[n].id` | missing, badly formed or too long; entry skipped |
| duplicate | `assistant.providers[n].id` | id already used; entry skipped |
| invalid_value | `assistant.providers[n].base_url` | missing or not an http or https address; entry skipped |
| invalid_value | `assistant.providers[n].protocol` | unknown (known: openai, anthropic); entry skipped |
| wrong_type | `assistant.providers[n].models` / `.needs_key` / `.label` | wrong type; the field keeps its default |
| invalid_value | `assistant.providers` | empty, or no valid entry: the built-in providers are used |
| not_allowed_here | `assistant.providers[n].<field>` or `assistant.<field>` | secrets are not configuration; the value is never read or shown |
| unknown_key | other unknown fields | as for any setting |
| invalid_value | `assistant.default.provider` | not a listed provider; the first listed is used |
| invalid_value | `assistant.prompt_addendum` | longer than 2000 characters; no note added |
| invalid_value | `assistant.limits.<name>` | outside its bounds; the default is used |
