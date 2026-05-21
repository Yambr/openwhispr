---
phase: 10-corporate-minimal-provider-lockdown-build-time-gate-cutting-
plan: 03
subsystem: transcription-ui
tags: [build-time-gating, dce, provider-lockdown, byok]
requires:
  - PROVIDER_LOCKDOWN_ENABLED constant (plan 10-01)
provides:
  - Transcription cloud-provider tabs gated behind PROVIDER_LOCKDOWN_ENABLED
  - Both transcription BYOK ApiKeyInput blocks gated behind PROVIDER_LOCKDOWN_ENABLED
affects:
  - src/components/TranscriptionModelPicker.tsx
tech-stack:
  added: []
  patterns:
    - "{!PROVIDER_LOCKDOWN_ENABLED && (...)} JSX literal gate for Rolldown DCE"
    - lockdown-aware ensureValidCloudSelection pins the our-server cloud provider
key-files:
  created:
    - .planning/phases/10-corporate-minimal-provider-lockdown-build-time-gate-cutting-/10-03-SUMMARY.md
  modified:
    - src/components/TranscriptionModelPicker.tsx
decisions:
  - "Under lockdown, ensureValidCloudSelection always pins selectedCloudProvider to cloudProviders[0] (the our-server path) and never selects \"custom\", so the ModelCardList renders and no code reads an absent tab"
  - "The whole custom-endpoint branch is gated (not just its ApiKeyInput) because the custom endpoint URL surface is itself a BYOK/alternative-provider surface that lockdown removes"
metrics:
  duration: ~12m
  completed: 2026-05-21
  tasks: 2
  files: 1
requirements: [PLD-03]
---

# Phase 10 Plan 03: Transcription Cloud-Provider Lockdown Summary

Gates the transcription picker's alternative-cloud-provider choice
(OpenAI/Groq/Mistral/Custom tabs) and both BYOK `ApiKeyInput` blocks behind
`PROVIDER_LOCKDOWN_ENABLED`, while keeping the binary Cloud/Local `ModeToggle`
and the Local provider tabs (whisper/nvidia) fully intact.

## What Was Built

- **Import** of `PROVIDER_LOCKDOWN_ENABLED` from `../config/defaults` (the
  direct named re-export established in plan 10-01, DCE-safe).
- **Cloud `ProviderTabs` strip gated** — the
  `<ProviderTabs providers={cloudProviderTabs} ... scrollable />` element at
  the top of the cloud branch is wrapped in `{!PROVIDER_LOCKDOWN_ENABLED && (...)}`.
- **Custom-endpoint branch gated** — the branch selector changed from
  `selectedCloudProvider === "custom" ? (...)` to
  `!PROVIDER_LOCKDOWN_ENABLED && selectedCloudProvider === "custom" ? (...)`.
  Under lockdown this branch never renders, so its endpoint-URL `Input`, its
  custom `ApiKeyInput` (the line-841 block), and the free-text model `Input`
  are all eliminated. The custom endpoint is itself an
  alternative-provider/BYOK surface, so gating the whole branch (not just the
  key input) is correct.
- **Per-provider `ApiKeyInput` block gated** — the `{ groq, mistral, openai }`
  key map block (the line-881 block, plus its "Get key" external-link button)
  is wrapped in `{!PROVIDER_LOCKDOWN_ENABLED && (...)}`. The sibling
  `ModelCardList` model picker stays.
- **`ensureValidCloudSelection` made lockdown-aware** — under lockdown it pins
  `selectedCloudProvider` to `cloudProviders[0]` (the our-server cloud path),
  never `"custom"`, and seeds the first model. This guarantees the cloud
  branch renders `ModelCardList` with valid `cloudModelOptions` and that
  `VALID_CLOUD_PROVIDER_IDS.includes(...)` is never consulted against an
  absent tab.
- **Unchanged:** `ModeToggle` (Cloud/Local), `LOCAL_PROVIDER_TABS`
  (whisper/nvidia), the entire Local branch, and all default-build behavior.

## Verification

### Task 1 — type check + lint
- `cd src && npx tsc --noEmit` — clean (no output, exit 0).
- `npx eslint src/components/TranscriptionModelPicker.tsx` — clean (0 errors).
- Repo-wide `npm run lint` reports 574 pre-existing errors, all in generated
  `tests/e2e/.playwright-bdd/**` spec files (`Parsing error: 'import' and
  'export' may appear only with 'sourceType: module'`). These are out of
  scope (SCOPE BOUNDARY) — not caused by this task. Logged below.

### Task 2 — bundle DCE spot check
Built the renderer twice (`cd src && vite build` → output `src/dist/assets/`).

**Lockdown build** (`OPENWHISPR_PROVIDER_LOCKDOWN=true`):
- `console.mistral.ai/api-keys` — **ABSENT** from the picker chunk.
- `console.groq.com/keys` — **ABSENT** from the picker chunk.
- `scrollable` (the gated cloud `ProviderTabs` prop) — **ABSENT** (0 matches).
- i18n keys `transcription.endpointUrl`, `transcription.apiKeyOptional`,
  `transcription.getKey` — **ABSENT** (custom branch fully eliminated).
- Decompiled cloud branch shows `{children:[!1, ... children:[!1, ...common.model...ModelCardList...]}`
  — Rolldown folded `PROVIDER_LOCKDOWN_ENABLED` to a literal and replaced both
  gated subtrees with `false` (`!1`). The `ModelCardList` for our-server
  models still renders.

**Default build** (positive control):
- `console.mistral.ai/api-keys` — **PRESENT** in
  `src/dist/assets/TranscriptionModelPicker-*.js`.
- Full cloud branch present: `ProviderTabs` cloud strip, custom-endpoint
  `ApiKeyInput`, per-provider `ApiKeyInput`, "Get key" links.

Default `build-config.generated.{ts,cjs}` restored at end
(`PROVIDER_LOCKDOWN_ENABLED: false`). These files are `.gitignored`.

## Deviations from Plan

### Plan-doc corrections (no code impact)

1. **[Rule 3 - Blocking] Verify command marker mismatch.** The plan's Task 2
   `<automated>` verify uses `grep -RFq '"Mistral"' src/dist/assets/` as the
   absence/presence marker. The minified bundle emits the tab name with
   backtick string literals (`name:`Mistral``), not double quotes, so
   `grep -F '"Mistral"'` matches nothing in **either** build and the literal
   would falsely report "absent" for the default build too. Used
   `console.mistral.ai/api-keys` and `console.groq.com/keys` (the
   per-provider help URLs — unambiguous, double-quote-free string literals)
   as the DCE markers instead. Same intent, reliable signal. No code change.

2. **[Rule 3 - Blocking] Build output path.** The plan/verify references
   `src/dist/assets/`; `build:renderer` runs `cd src && vite build`, so the
   output is indeed `src/dist/assets/` (the plan was right) — an initial grep
   against repo-root `dist/` returned empty and was corrected.

No functional deviations — Task 1 was correct on the first build, so per the
plan ("Commit only if Task 1 needed a follow-up fix") Task 2 produced no
commit.

## Deferred Issues

- `npm run lint` repo-wide: 574 pre-existing parse errors in
  `tests/e2e/.playwright-bdd/features/*.feature.spec.js` generated files.
  Pre-existing, unrelated to this plan, out of scope. Not fixed.

## Known Stubs

None. Under lockdown the cloud branch renders a real `ModelCardList` populated
from `cloudModelOptions` (the our-server provider's models) — not an empty
placeholder.

## Commits

- `d36339f1` — feat(10-03): gate transcription cloud-provider tabs + BYOK
  inputs under lockdown (PLD-03)

## Self-Check: PASSED

- `src/components/TranscriptionModelPicker.tsx` — FOUND, contains
  `PROVIDER_LOCKDOWN_ENABLED` (3 gate sites + 1 import + 1 in
  ensureValidCloudSelection).
- Commit `d36339f1` — FOUND in `git log`.
- `.planning/.../10-03-SUMMARY.md` — FOUND (this file).
