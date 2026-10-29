# Quickstart: validating assistant settings

Prerequisites: `npm install`; the demo roots under `public/` are tracked.

## 1. Unit layer (no browser)

```
npx vitest run tests/unit/configAssistant.test.ts tests/unit/assistantPolicy.test.ts tests/unit/configValidate.test.ts tests/unit/configToBranding.test.ts tests/unit/configCheck.test.ts tests/unit/aiAgentLoop.test.ts tests/unit/configReference.test.ts tests/unit/configJsonSchema.test.ts
```

Expected: provider entries are cleaned (bad ones skipped and reported, ids unique, protocol known); secret-like names are refused without echoing a value; the default is checked against the list; limits and the note enforce their bounds; the policy defaults equal today's constants; the loop, runner and shaper honour the limits; the prompt carries the note last; the generated reference and JSON Schema match the table (`npm run docs:config`).

## 2. Nothing changes without the keys

```
npm run dev
```

Open Settings, Assistant. Expected: the same providers, editable address, token field, model picker and "up to 50 result rows" text as before; no config note.

## 3. A deployer's provider list

In the demo's `dashboard-config.yaml` add an `assistant.providers` list with one provider and a `default`. Reload, open Settings, Assistant. Expected: only that provider is offered (no Demo, no built-ins), its address is shown read-only, its suggested models are in the picker (another name can be typed), the token field shows when `needs_key` is true; the default is selected.

## 4. Note and limits

Add `prompt_addendum` and `limits`. With the scripted Demo provider unavailable (the list replaced it), use the Playwright mock (step 6) or the unit tests to see the note in the system prompt and the limits taking effect; the privacy help text shows the configured row count.

## 5. Mistakes and secrets

Add `api_key: abc`, a provider with `protocol: soap`, a duplicate id, a default naming an unlisted provider, `limits: { round_trips: 99 }` and a 3000-character note. Reload: the app loads, each problem is listed with its path in the note, the secret's value appears nowhere, and `npm run check -- public/demo-dashboard-config` lists the same and exits 1.

## 6. Browser spec

```
npx playwright test --project=chromium tests/integration/assistantConfig.spec.ts
```

Then the full run; compare with the known flakes in CLAUDE.md (re-run a failure with `--workers=1` first).

## Walked (2026-10-28)

- Step 1: the eight listed unit files pass (111 tests).
- Steps 2, 3 and 5 through `tests/integration/assistantConfig.spec.ts` (17 cases: no keys, a deployer list, the locked address, the default, the Anthropic protocol, the note, each limit, every mistake, a sentinel secret that appears in neither the page nor the console) and by hand with `npm run check`: a site with a secret-like `api_key`, a provider with an unknown protocol, a secret-like `token` inside a provider, a limit of 99 and a default naming a provider that is not offered gives five problems with their key paths, the secret values appear nowhere in the output, and the demo folder checks clean.
- Note: a provider skipped for a bad field does not take its id, so a later provider with the same id is kept (the repeat is reported only when the first was valid).
