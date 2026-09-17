# Contract: Font Preference

Internal UI contract (no external API/CLI surface).

## Default (unconfigured) behavior

**Given** a viewer who has made no font selection for a given role
(`body`/`heading`/`mono`)

**When** the dashboard renders

**Then** that role renders in exactly its existing self-hosted default
(`--font-body`/`--font-heading`/`--font-mono`'s current `tokens.css`
values — Geist/Geist Mono, unchanged) — no `<link>` tag is injected, no
new network request occurs (FR-021).

## Selection path

**Given** the Appearance tab's font picker for one role

**When** a viewer types or picks a family name

**Then** `state/fontPreferenceState.ts#setFont(role, name)` is called,
`panels/googleFontLoader.ts#ensureGoogleFontLoaded(role, name)` creates
or updates that role's own stable-`id`'d `<link>` tag
(`google-font-body`/`google-font-heading`/`google-font-mono`) pointing at
`https://fonts.googleapis.com/css2?family=<name>:wght@400;500;600;700&display=swap`,
and `document.documentElement.style.setProperty('--font-body', `"${name}",
sans-serif`)` (or the `heading`/`mono` equivalent) is set — only that
role's rendered text changes (FR-022, FR-025).

**Given** a family name that does not exist on Google Fonts, or the
viewer is offline when the `<link>`'s stylesheet request is made

**When** the browser attempts to apply `--font-body`'s new value

**Then** no matching `@font-face` exists, and the browser falls through
to the token value's own trailing generic family (`sans-serif`/
`monospace`) — text remains legible in the browser's own default
sans-serif/monospace face for that role until the existing self-hosted
Geist default is restored (by clearing the selection, or on reload) —
FR-024, achieved by the CSS generic-family fallback already present in
every `--font-*` value, not bespoke error-handling code (research.md §9).

## Clear path

**Given** a role with an active font selection

**When** a viewer clears it (or reloads the page)

**Then** that role's `<link>` tag is removed and its inline `--font-*`
override is removed (`style.removeProperty(...)`) — the role reverts to
`tokens.css`'s own self-hosted default immediately, with no reload needed
for an explicit clear (FR-026 covers the reload case specifically: no
persistence at all, so a reload always starts fully cleared).

## Non-goals

- No enumeration of Google's full font catalog via their Developer API —
  free-text entry plus a small bundled shortlist only (research.md §9).
- No font-weight/style selection beyond the fixed `400;500;600;700` range
  requested for every selection.
- No interaction with the colorblind-safe preference, interface colors,
  or text-size scale — fully independent.
