---
phase: quick-260521-wt4
plan: 02
subsystem: transcription / provider-lockdown
tags: [provider-lockdown, transcription, DCE, corporate-minimal]
requirements: [WT4-FIX4]
key-files:
  modified:
    - src/components/TranscriptionModelPicker.tsx
    - src/components/SettingsPage.tsx
    - src/components/settings/MeetingSettings.tsx
    - scripts/verify-provider-lockdown.js
metrics:
  tasks: 2
  files: 4
  commits: 2
  completed: 2026-05-21
---

# Phase quick-260521-wt4 Plan 02: Corporate-Minimal Transcription Provider Lockdown Summary

One-liner: Under PROVIDER_LOCKDOWN the transcription picker exposes exactly one cloud provider (no Custom/groq/mistral), the self-hosted transcription mode is physically DCE'd, and the lockdown verify gate asserts it.

## What Was Done

### Task 1 — Lockdown-filter the transcription provider list (commit `bffd60b6`)

`src/components/TranscriptionModelPicker.tsx`:
- `cloudProviders` memo: under `PROVIDER_LOCKDOWN_ENABLED`, the provider list is sliced to a single entry (`base.slice(0, 1)`). This drops groq/mistral from every cloud model dropdown and makes the existing `ensureValidCloudSelection` `cloudProviders[0]` pin authoritative.
- `cloudProviderTabs` memo: the hardcoded `"custom"` id is added to `visibleIds` only inside a `!PROVIDER_LOCKDOWN_ENABLED` build-time literal branch, so Rolldown DCEs the Custom tab under lockdown.
- ModelRegistry.ts left unchanged per plan — the filter lives in the picker (single consumer, smaller upstream delta); the same `slice(0,1)` covers the `streamingOnly` / `getStreamingTranscriptionProviders` path because both feed the one `cloudProviders` memo.

### Task 2 — Audit self-hosted DCE + extend verify gate (commit `cfaf30a1`)

Audit finding (real leak, not just audit): `InferenceConfigEditor.tsx` already excludes `selfHosted`/`enterprise` from its `modes` array under lockdown, but the **transcription** `transcriptionModes` arrays in `SettingsPage.tsx` (`TranscriptionSection`) and `settings/MeetingSettings.tsx` were **not** lockdown-gated. Under lockdown the corporate build still surfaced "providers" (BYOK) and "self-hosted" transcription tabs, and the statically-imported `SelfHostedPanel` render branch survived.

Fix (gated the same build-time-literal way):
- Both files: `providers` and `self-hosted` mode entries spread in only when `!PROVIDER_LOCKDOWN_ENABLED`.
- Both files: the `SelfHostedPanel` JSX render branch wrapped with `!PROVIDER_LOCKDOWN_ENABLED && ...` so the import + JSX physically DCE.
- `PROVIDER_LOCKDOWN_ENABLED` imported into both files via the named re-export from `@/config/defaults` / `../../config/defaults`.

`scripts/verify-provider-lockdown.js`:
- Added a `TRANSCRIPTION` target group asserting the custom-endpoint Input placeholder literal `https://your-api.example.com/v1` is absent under lockdown and present in the default build. This literal lives only inside the `selectedCloudProvider === "custom"` JSX branch — a genuinely DCE-able code literal (not an i18n key). Positive control confirmed: the literal was found in the default `src/dist/` build before committing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Self-hosted transcription mode was a real leak, gated it**
- **Found during:** Task 2 audit (`grep` of `self-hosted` render sites).
- **Issue:** The plan's Task 2 expected "no code change" for the self-hosted audit, but `SettingsPage.tsx` and `MeetingSettings.tsx` `transcriptionModes` arrays were unconditionally including `providers` + `self-hosted` entries — a real DCE leak in the corporate-minimal build.
- **Fix:** Gated both mode entries and the `SelfHostedPanel` render branch with `PROVIDER_LOCKDOWN_ENABLED` build-time literals, identical pattern to `InferenceConfigEditor.tsx`.
- **Files modified:** `src/components/SettingsPage.tsx`, `src/components/settings/MeetingSettings.tsx`
- **Commit:** `cfaf30a1`

**2. [Rule 1 - Bug] Spread-array widened InferenceMode `id` to `string`**
- **Found during:** Task 2 typecheck.
- **Issue:** Moving mode-option object literals into a separate conditional spread array dropped the contextual `InferenceModeOption[]` typing, so `id` widened to `string` and failed `TS2322`.
- **Fix:** Added `satisfies InferenceModeOption[]` to each conditional spread array.
- **Commit:** `cfaf30a1`

## Verification

- `npm run typecheck` (project's `cd src && tsc --noEmit`) — passes, 0 errors. Note: the plan's literal `npx tsc --noEmit -p .` does not work from the repo root because `tsconfig.json` lives in `src/`; the project's `typecheck` script is the correct invocation.
- `npm run verify:provider-lockdown` — **2 scenarios, 42 greps, 0 violations.** Default build: all 5 target groups present (incl. new TRANSCRIPTION). Lockdown build: all 5 groups absent.
- Default build keeps openai/groq/mistral + Custom transcription tab + self-hosted mode intact (positive control green).

## Self-Check: PASSED

- `src/components/TranscriptionModelPicker.tsx` — FOUND
- `src/components/SettingsPage.tsx` — FOUND
- `src/components/settings/MeetingSettings.tsx` — FOUND
- `scripts/verify-provider-lockdown.js` — FOUND
- Commit `bffd60b6` — FOUND
- Commit `cfaf30a1` — FOUND
