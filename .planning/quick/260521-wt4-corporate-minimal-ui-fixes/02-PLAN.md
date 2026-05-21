---
phase: quick-260521-wt4
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/TranscriptionModelPicker.tsx
  - src/models/ModelRegistry.ts
  - scripts/verify-provider-lockdown.js
autonomous: true
requirements: [WT4-FIX4]
must_haves:
  truths:
    - "Corporate build transcription Cloud mode exposes exactly ONE cloud provider (OpenWhispr Cloud), no 'Custom'/'Другой'"
    - "Corporate build never selects or routes to openai/groq/mistral as a cloud transcription provider"
    - "Self-hosted inference mode + OpenAICompatiblePanel are physically DCE'd under lockdown"
    - "verify:provider-lockdown asserts the custom transcription provider literal absent"
    - "Default build keeps all cloud providers + custom tab"
  artifacts:
    - path: "src/components/TranscriptionModelPicker.tsx"
      provides: "lockdown-filtered cloudProviderTabs with no hardcoded custom id"
    - path: "scripts/verify-provider-lockdown.js"
      provides: "extended absence assertions for transcription custom-provider symbols"
  key_links:
    - from: "TranscriptionModelPicker.tsx cloudProviderTabs"
      to: "PROVIDER_LOCKDOWN_ENABLED"
      via: "build-time literal gate excluding custom from visibleIds"
      pattern: "PROVIDER_LOCKDOWN_ENABLED"
---

<objective>
Remove the "Custom" / "Другой" transcription provider and any non-OpenWhispr
cloud provider from the corporate-minimal build's transcription picker, and
extend the lockdown verify gate to assert it.

Purpose: Live testing found the transcription picker still surfaces a "Custom"
provider and a 3-way Cloud/Custom/Local list under lockdown. The tab strip is
gated, but `cloudProviderTabs` hardcodes `"custom"` into its visible set and
`getTranscriptionProviders()` is never lockdown-filtered, so the provider list
and selection logic still know about openai/groq/mistral/custom.

Output: Single-cloud-provider transcription picker under lockdown + verify-gate
coverage. Default build unchanged.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md

<interfaces>
From src/config/defaults.ts:
```typescript
export { PROVIDER_LOCKDOWN_ENABLED } from "./build-config.generated";
```
Direct named re-export of a build-time boolean literal — DCE-traceable. The
`Generated.*` alias form is forbidden (breaks Rolldown literal propagation).

TranscriptionModelPicker.tsx (verified):
- Line 28: `import { PROVIDER_LOCKDOWN_ENABLED } from "../config/defaults";`
- Lines 202-207: `CLOUD_PROVIDER_TABS` array including `{ id: "custom", name: "Custom" }`.
- Line 209: `VALID_CLOUD_PROVIDER_IDS = CLOUD_PROVIDER_TABS.map(p => p.id)`.
- Lines 311-316: `cloudProviders` from `getTranscriptionProviders()` /
  `getStreamingTranscriptionProviders()`; `cloudProviderTabs` builds
  `visibleIds = new Set([...cloudProviders.map(p=>p.id), "custom"])` — the
  hardcoded `"custom"` is the leak.
- Lines 378-393: `ensureValidCloudSelection` already has a `PROVIDER_LOCKDOWN_ENABLED`
  branch pinning to `cloudProviders[0]`.
- Lines 834, 845, 881: tab strip + custom panel already gated by `!PROVIDER_LOCKDOWN_ENABLED`.
- Line 221: `ModeToggle` renders Cloud/Local only — already a 2-way toggle, OK.

ModelRegistry.ts (verified):
- Line 178: `getTranscriptionProviders()` returns raw `modelData.transcriptionProviders`.
- Line 330-332: module export `getTranscriptionProviders()` -> `modelRegistry.getTranscriptionProviders()`.
- modelRegistryData.json `transcriptionProviders` ids: `["openai","groq","mistral"]`
  — NO OpenWhispr-Cloud entry exists; under lockdown Cloud mode talks to our
  server via `cloudTranscriptionMode="openwhispr"`, and the picker pins to
  `cloudProviders[0]` which is currently `openai`.

InferenceConfigEditor.tsx (src/components/settings/) — verified: `providersEntry`,
`selfHostedEntry`, `enterpriseEntry` already excluded under
`PROVIDER_LOCKDOWN_ENABLED ? [] : [...]` at the `modes` array. This is correct;
audit only — do not duplicate the gate.

verify-provider-lockdown.js — `ALT_CLOUD_TARGETS` covers provider key-console
URLs; no target asserts the transcription "custom" provider id/symbol absent.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Lockdown-filter the transcription provider list to one cloud provider, no custom</name>
  <files>src/components/TranscriptionModelPicker.tsx, src/models/ModelRegistry.ts</files>
  <action>
  Goal: under PROVIDER_LOCKDOWN_ENABLED the transcription Cloud mode exposes
  exactly one cloud provider and the `custom` provider is fully gone from the
  provider list, the tab set, and selection logic.

  TranscriptionModelPicker.tsx:
  - `cloudProviderTabs` (lines 311-316): remove the hardcoded `"custom"` from
    `visibleIds` when locked down. Change to
    `visibleIds = new Set(cloudProviders.map(p => p.id))` and only add `"custom"`
    when `!PROVIDER_LOCKDOWN_ENABLED`. Write the gate as a build-time literal so
    Rolldown DCEs the custom branch. The `.map` that renames the custom tab can
    stay (it becomes unreachable under lockdown).
  - `cloudProviders` (lines 311-313): under lockdown the picker must offer only
    ONE provider. Filter the memo result so that when `PROVIDER_LOCKDOWN_ENABLED`
    is true, `cloudProviders` is sliced to a single entry — the OpenWhispr-Cloud
    provider. Since `modelData.transcriptionProviders` has no dedicated
    OpenWhispr-Cloud id, the single retained provider is the one our server
    serves (`openai` id is the historical default that `cloudTranscriptionMode="openwhispr"`
    routes through our backend). Keep `cloudProviders[0]` only:
    `PROVIDER_LOCKDOWN_ENABLED ? base.slice(0, 1) : base`. This makes
    `ensureValidCloudSelection`'s existing `cloudProviders[0]` pin authoritative
    and removes groq/mistral from any model dropdown.
  - Confirm no remaining `selectedCloudProvider === "custom"` branch is reachable
    under lockdown — lines 845/881 are already gated; line 406
    `onCloudProviderSelect("custom")` is inside the `!PROVIDER_LOCKDOWN_ENABLED`
    path of `ensureValidCloudSelection` (verify the early-return at 392 covers it;
    it does).

  ModelRegistry.ts: do NOT mutate the shared `modelData` JSON. If a registry-level
  helper is cleaner, add a `getTranscriptionProviders()` that is lockdown-aware
  ONLY if the picker filter above is insufficient — prefer keeping the filter in
  the picker (single consumer, smaller upstream delta). Leave ModelRegistry.ts
  unchanged unless the streamingOnly path (`getStreamingTranscriptionProviders`)
  also needs the slice — if so, apply the same `slice(0,1)` filter at the picker
  memo, not in the registry. Decide and document in the commit message.

  No new i18n keys — `transcription.customProvider` stays for the default build.
  Do not hardcode strings.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p . 2>&1 | grep -iE "TranscriptionModelPicker|ModelRegistry" || echo "no type errors"</automated>
  </verify>
  <done>Under PROVIDER_LOCKDOWN_ENABLED the transcription picker Cloud mode lists exactly one provider, no "Custom"/"Другой" tab or provider entry, and selection pins to it. Default build keeps openai/groq/mistral + custom.</done>
</task>

<task type="auto">
  <name>Task 2: Audit self-hosted DCE and extend verify-provider-lockdown gate</name>
  <files>scripts/verify-provider-lockdown.js</files>
  <action>
  Audit (no code change expected): confirm `self-hosted` mode + OpenAICompatiblePanel
  are DCE'd under lockdown. InferenceConfigEditor.tsx already excludes
  `selfHostedEntry`/`enterpriseEntry` from `modes` under lockdown — verify via
  `grep -rn "OpenAICompatiblePanel\|self-hosted\|selfHosted" src/components/` that
  every render site is downstream of a `PROVIDER_LOCKDOWN_ENABLED` gate or the
  `modes` exclusion. If any unreachable-but-not-DCE'd site is found (e.g. a
  static import that survives), note it; if a real leak exists, gate it the same
  way (build-time literal). Report findings in the commit message.

  Extend scripts/verify-provider-lockdown.js: add a new target group (e.g.
  `TRANSCRIPTION_TARGETS`) asserting the transcription custom-provider code-path
  literals are absent under lockdown and present in the default build. Pick
  literals that genuinely DCE — candidates: the `transcription.customProvider`
  usage is an i18n key (excluded per the script's own rules, do NOT use it).
  Use a code literal that lives only in the `!PROVIDER_LOCKDOWN_ENABLED` branch,
  e.g. the OpenAICompatiblePanel custom-endpoint placeholder/prop string, or a
  symbol unique to the custom transcription panel. Verify by grepping the default
  `src/dist/` build that the chosen literal is actually present (positive control)
  before committing it. Add the group to `GROUPS`, `ALL_GROUPS` resolves
  automatically. Keep the script's exclusion comments accurate.
  </action>
  <verify>
    <automated>node -c scripts/verify-provider-lockdown.js && echo "script syntax OK"</automated>
  </verify>
  <done>Self-hosted DCE confirmed (or real leak gated). verify-provider-lockdown.js has a transcription target group; running the full script (`node scripts/verify-provider-lockdown.js`) passes both scenarios with 0 violations.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p .` passes.
- `node scripts/verify-provider-lockdown.js` — 0 violations across default + lockdown scenarios (this runs the 2 builds + restore).
- Manual: corporate build transcription settings show only OpenWhispr Cloud + Local; no "Другой".
</verification>

<success_criteria>
- Corporate build transcription picker: one cloud provider, no Custom, no self-hosted.
- verify:provider-lockdown extended and green.
- Default build: all providers + custom tab intact.
- Two atomic commits. No hardcoded strings.
</success_criteria>

<output>
After completion, append a row to STATE.md "Quick Tasks Completed" table for FIX 4.
</output>
