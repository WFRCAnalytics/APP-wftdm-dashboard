import { useRef, useState } from 'react'

import { ComboboxInput } from '@/components/ui/combobox-input'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { GroupHeading, PillButton, SettingsRow, TabHeader } from '@/layout/settings/settingsParts'
import { useAiSettings } from '@/hooks/useAiSettings'
import { checkConnection } from '@/services/ai/providers'
import { resetSessionData } from '@/services/ai/sqlRunner'
import type { Permission, PrivacyMode, ProviderId } from '@/services/ai/types'
import { getPreset, getProviderPresets, patchDraft, saveDraft, setCheckState, setDraftProvider, setPermission, setPrivacy } from '@/state/aiState'
import { cn } from '@/lib/utils'

// The Assistant tab (064-ai-chat-assistant, contracts/settings-ui.md): provider, token, model and a Check and Save that only
// replaces the working settings when the check passes; plus query permissions and what is shared with the provider.
// Everything here is session-only: the token is gone on reload, by design.

const PERMISSIONS: { id: Permission; label: string }[] = [
  { id: 'read-only', label: 'Read-Only' },
  { id: 'modify', label: 'Modify' },
]

const PRIVACY: { id: PrivacyMode; label: string }[] = [
  { id: 'schema-only', label: 'Schema only' },
  { id: 'schema-and-results', label: 'Schema + results' },
]

const PERMISSION_HELP: Record<Permission, string> = {
  'read-only': 'Read queries only (SELECT, WITH, DESCRIBE, SHOW, EXPLAIN).',
  modify: 'May create and change tables and views. Changes last for this session; dashboard views stay protected.',
}

const PRIVACY_HELP: Record<PrivacyMode, string> = {
  'schema-only': 'Sends table and column names, types, row counts and your question. Values stay in your browser.',
  'schema-and-results': 'Also sends up to 50 result rows per query so the assistant can describe values.',
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 py-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

export function AiTab() {
  const s = useAiSettings()
  const { draft } = s
  // the providers on offer (the deployer's list, or the built-ins) and the one chosen
  const providers = getProviderPresets().map((p) => ({ id: p.id, label: p.label }))
  const preset = getPreset(draft.provider)
  // a deployer's provider has a fixed address; its token field is shown only when it needs a key
  const showToken = preset.needsKey || !preset.locked
  const ollama = draft.provider === 'ollama'
  const checking = s.status === 'checking'
  const abortRef = useRef<AbortController | null>(null)
  const [resetNote, setResetNote] = useState('')
  const canCheck = !checking && draft.baseUrl.trim() !== '' && draft.model.trim() !== '' && (!preset.needsKey || draft.apiKey !== '')

  async function onCheck() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setCheckState('checking', 'Checking…')
    const result = await checkConnection({ ...draft, baseUrl: draft.baseUrl.trim(), model: draft.model.trim() }, controller.signal)
    if (controller.signal.aborted) return
    if (result.ok) saveDraft()
    else setCheckState('error', result.message)
  }

  async function onReset() {
    setResetNote('Resetting…')
    try {
      const n = await resetSessionData()
      setResetNote(n === 0 ? 'Nothing to reset: the assistant has not created anything.' : `Removed ${n} table${n === 1 ? '' : 's'}, view${n === 1 ? '' : 's'} or macro${n === 1 ? '' : 's'} created in this session.`)
    } catch {
      setResetNote('Could not reset the session data.')
    }
  }

  return (
    <div>
      <TabHeader title="Assistant">
        Ask questions about the model data in plain language. The assistant writes the SQL, runs it in your browser and
        answers from the result. You bring your own model.
      </TabHeader>

      <GroupHeading className="mt-0">Provider</GroupHeading>
      <Segmented
        label="Provider"
        options={providers}
        value={draft.provider}
        onChange={(id) => setDraftProvider(id as ProviderId)}
        size="lg"
      />
      <div className="max-w-[680px]">
        <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-x-3 max-[620px]:grid-cols-1">
          <Field label="Server address" htmlFor="ai-base-url">
            <Input
              id="ai-base-url"
              value={draft.baseUrl}
              onChange={(e) => patchDraft({ baseUrl: e.target.value })}
              readOnly={preset.locked}
              aria-describedby={preset.locked ? 'ai-base-url-note' : undefined}
              spellCheck={false}
              autoComplete="off"
            />
            {preset.locked && (
              <p id="ai-base-url-note" className="text-[12.5px] text-[var(--mute)]">
                Set by this dashboard’s configuration.
              </p>
            )}
          </Field>
          <Field label="Model" htmlFor="ai-model">
            <ComboboxInput id="ai-model" value={draft.model} options={preset.models} onChange={(model) => patchDraft({ model })} placeholder="Search or type a model" aria-label="Model" />
          </Field>
        </div>
        {showToken && (
        <Field label={preset.needsKey ? 'API token' : 'API token (optional for Ollama)'} htmlFor="ai-token">
          <Input
            id="ai-token"
            type="password"
            value={draft.apiKey}
            onChange={(e) => patchDraft({ apiKey: e.target.value })}
            autoComplete="off"
            spellCheck={false}
            placeholder={preset.needsKey ? 'Paste your key' : 'Not needed'}
          />
        </Field>
        )}
        {draft.provider === 'ollama' && (
          <p className="text-[12.5px] text-[var(--mute)]">
            Use a model that supports tool calling. Ollama must allow this page’s origin (OLLAMA_ORIGINS).
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <PillButton primary disabled={!canCheck} onClick={onCheck} className="shrink-0 whitespace-nowrap">
            {checking ? 'Checking…' : 'Check and Save'}
          </PillButton>
          <span
            role="status"
            data-testid="ai-status"
            className={cn('text-sm', s.status === 'error' ? 'text-[var(--destructive,#c0392b)]' : 'text-[var(--mute)]')}
          >
            {s.statusMessage || (s.saved ? 'Connected.' : '')}
          </span>
          <span className="text-[12.5px] text-[var(--mute)]">The token is kept only until you close or reload this page.</span>
        </div>
      </div>

      <GroupHeading>Query permissions</GroupHeading>
      <SettingsRow title="What the assistant may run" help={PERMISSION_HELP[s.permission]} align="start">
        <div className="shrink-0">
          <Segmented label="Query permissions" options={PERMISSIONS} value={s.permission} onChange={(id) => setPermission(id as Permission)} />
        </div>
      </SettingsRow>
      <SettingsRow
        title="Reset session data"
        help={resetNote || 'Removes every table, view or macro the assistant created in this session.'}
      >
        <PillButton onClick={onReset} className="shrink-0 whitespace-nowrap">
          Reset session data
        </PillButton>
      </SettingsRow>

      <GroupHeading>Privacy</GroupHeading>
      <SettingsRow
        title="What is sent to the provider"
        help={ollama ? 'Ollama runs on your machine, so nothing leaves it.' : PRIVACY_HELP[s.privacy]}
        align="start"
      >
        <div className="shrink-0">
          <Segmented
            label="Privacy"
            options={PRIVACY.map((o) => ({ ...o, disabled: ollama }))}
            value={s.privacy}
            onChange={(id) => setPrivacy(id as PrivacyMode)}
          />
        </div>
      </SettingsRow>
    </div>
  )
}
