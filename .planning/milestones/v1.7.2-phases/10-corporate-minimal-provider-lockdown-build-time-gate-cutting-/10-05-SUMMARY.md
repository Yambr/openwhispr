---
phase: 10-corporate-minimal-provider-lockdown-build-time-gate-cutting-
plan: 05
subsystem: build-time-gating
tags: [provider-lockdown, byok, enterprise, preload, ipc, dce]
requires: ["10-01", "10-03", "10-04"]
provides:
  - "preload-byok.generated.cjs emitter (emitPreloadByok)"
  - "BYOK + enterprise key IPC gated under PROVIDER_LOCKDOWN_ENABLED"
  - "ApiKeysService/byokDetection lockdown gating"
affects:
  - scripts/generate-build-config.js
  - preload.js
  - src/helpers/ipcHandlers.js
  - src/utils/byokDetection.ts
  - src/components/IntegrationsView.tsx
tech-stack:
  added: []
  patterns:
    - "preload-submodule code-gen (analogue of emitPreloadBilling/Referrals/Streaming)"
    - "if (!BuildConfig.PROVIDER_LOCKDOWN_ENABLED) IPC-handler wrapper"
    - "literal-const-foldable early return for DCE"
key-files:
  created:
    - preload-byok.generated.cjs (git-ignored, build-time generated)
  modified:
    - scripts/generate-build-config.js
    - .gitignore
    - preload.js
    - src/helpers/ipcHandlers.js
    - src/utils/byokDetection.ts
    - src/components/IntegrationsView.tsx
    - docs/CONFIG_INVENTORY.md
decisions:
  - "settingsStore BYOK key fields kept (typed) but never written under lockdown — typing-honesty over deletion churn (CONTEXT discretion)"
  - "CustomModelInput carries no standalone gate — DCEs transitively via the EnterpriseSection subtree gated in plan 04"
  - "ApiKeysSection/ApiKeysService (v1/keys) gated at its IntegrationsView consumer — was NOT inside a plan-03/04-gated subtree"
metrics:
  duration: ~35min
  completed: 2026-05-21
  tasks: 2
  files: 7
---

# Phase 10 Plan 05: BYOK / Enterprise Key Machinery Lockdown Summary

Under `PROVIDER_LOCKDOWN_ENABLED`, the BYOK and enterprise key-management surface
below the UI layer is physically removed: a new `preload-byok.generated.cjs`
emitter gates the BYOK/enterprise key preload methods, the API-key + enterprise
credential IPC channels are wrapped in `if (!BuildConfig.PROVIDER_LOCKDOWN_ENABLED)`,
`hasStoredByokKey` const-folds to `false`, and the `v1/keys` ApiKeysSection UI is
gated at its consumer.

## What Was Built

### Task 1 — emitPreloadByok generator + IPC/preload gating (commit 0d06681b)

- **`scripts/generate-build-config.js`**: added `emitPreloadByok(resolved, outPath)`
  modeled on `emitPreloadBilling`. Returns the BYOK per-provider key methods
  (openai/anthropic/gemini/groq/mistral/custom-transcription/cleanup-custom +
  `proxyMistralTranscription`) plus the enterprise key methods
  (bedrock/azure/vertex get+save, `testEnterpriseConnection`,
  `processEnterpriseReasoning`) when `PROVIDER_LOCKDOWN_ENABLED !== true`; returns
  `{}` under lockdown. Wired into `main()`: `preloadByokOut` path constant +
  `emitPreloadByok(resolved, preloadByokOut)` call + `console.log` file list
  updated to `preload-{gcal,billing,referrals,streaming,byok}.generated.cjs`.
- **`.gitignore`**: added `preload-byok.generated.cjs` to the generated-preload block.
- **`preload.js`**: `const buildByokApi = require("./preload-byok.generated.cjs")`,
  `...buildByokApi(ipcRenderer)` spread into `contextBridge.exposeInMainWorld`.
  Removed the now-superseded unconditional BYOK/enterprise key method entries
  (getOpenAIKey/saveOpenAIKey, anthropic/gemini/groq/mistral keys,
  proxyMistralTranscription, custom keys, the full bedrock/azure/vertex block,
  testEnterpriseConnection, processEnterpriseReasoning) — they now live only in
  the generated factory.
- **`src/helpers/ipcHandlers.js`**: wrapped the BYOK + enterprise key handler
  blocks in `if (!BuildConfig.PROVIDER_LOCKDOWN_ENABLED)`. Three wrappers were
  needed because the handlers are not all contiguous: (1) `get/save-openai-key`
  (~line 710), (2) the main contiguous block `get-anthropic-key` →
  `process-enterprise-reasoning` (~lines 2416-2661), (3) the separated
  `save-anthropic-key` (~line 2687). `BuildConfig` was already required at file top.

### Task 2 — ApiKeysService / byokDetection gating (commit 577a0d2b)

- **`src/utils/byokDetection.ts`**: imported `PROVIDER_LOCKDOWN_ENABLED` from
  `../config/defaults`; added `if (PROVIDER_LOCKDOWN_ENABLED) return false;` at
  the top of `hasStoredByokKey` — a literal-const-foldable early return so the
  Zustand key-store reads DCE under lockdown.
- **`src/components/IntegrationsView.tsx`**: `ApiKeysSection`/`ApiKeysService`
  (`v1/keys` programmatic key management) was NOT inside a plan-03/04-gated
  subtree, so per the plan its consumer was gated: the "API" section block and
  the API-keys dialog are both wrapped in `{!PROVIDER_LOCKDOWN_ENABLED && (...)}`.
  With both uses gated by the const literal, Rolldown DCEs the `ApiKeysSection`
  import (and `ApiKeysService` transitively) from the corporate bundle.
- **`docs/CONFIG_INVENTORY.md`**: added a Phase 10 section documenting (a) the
  kept-but-unwritten `settingsStore.ts` BYOK key fields, and (b) the
  `CustomModelInput` transitive-DCE rationale.

## CustomModelInput — confirmed transitive DCE

Per the plan, `CustomModelInput` carries NO standalone gate. Grep re-confirmed
exactly two importers — `src/components/EnterpriseProviderConfig.tsx` and the
file itself. `EnterpriseProviderConfig` is inside the `EnterpriseSection` subtree
that Phase 10 Plan 04 already DCEs by gating the `EnterpriseSection` mount, so
`CustomModelInput` dead-code-eliminates transitively. No edit to the file.
Absence in the lockdown bundle is to be confirmed by plan 06's bundle-grep.

## Deviations from Plan

### Process note (not a code deviation)

After the initial round of edits to Task 1 files, the working tree was found
clean on the next git inspection — the edits had not persisted to disk (a
worktree/file-state desync). All Task 1 edits were re-applied from a fresh Read
and verified persisted (`grep` confirmed `emitPreloadByok`, `buildByokApi`,
`.gitignore` entry, and 4 `PROVIDER_LOCKDOWN_ENABLED` occurrences in
`ipcHandlers.js`) before running the generator and committing. No functional
deviation — the committed result matches the plan exactly.

### [Rule 2 - Missing functionality] save-anthropic-key gated separately

The plan's interfaces section described "the enterprise + BYOK key handler block"
as if mostly contiguous. In practice `save-anthropic-key` is registered ~22 lines
below the contiguous block, separate from `get-anthropic-key`. A second
`if (!BuildConfig.PROVIDER_LOCKDOWN_ENABLED)` wrapper was added for it (the plan
explicitly anticipated this: "If the BYOK key channels are not contiguous ...
add a second `if` wrapper"). Likewise `get/save-openai-key` at line ~710 got its
own wrapper. Three wrappers total.

### Scope clarification — ApiKeysService (v1/keys)

`ApiKeysService` / `ApiKeysSection` is the OpenWhispr-Cloud programmatic
API-key management surface (account access tokens via `v1/keys`), distinct from
BYOK provider keys. The plan's `<interfaces>` block explicitly placed it in
scope and directed gating its consumer if unguarded. It was unguarded (mounted
unconditionally in `IntegrationsView.tsx`), so it was gated there. The Cloud
processing path itself (transcribe/reason via our server) is untouched.

## Verification

- `node scripts/generate-build-config.js` — emits `preload-byok.generated.cjs`
  at repo root; default build contains all BYOK methods.
- `cd src && npx tsc --noEmit` — clean.
- `npm run lint` — 145 problems, identical to the pre-change baseline
  (confirmed via `git stash` + lint + `git stash pop`). All 141 errors are
  pre-existing `expect`/`test` no-undef issues in `test/` files merged from
  main — out of scope (see Deferred Issues). Zero new lint errors in the
  seven plan-touched files.
- `npm run verify:feature-gating` — OK, 5 scenarios, 140 greps, 0 violations.
- `npm run verify:oauth-gating` — OK, 4 scenarios, 63 greps, 0 violations.

## Deferred Issues

- **Pre-existing lint baseline (out of scope):** `npm run lint` reports 141
  errors (`'expect' is not defined`, `'test' is not defined` — `no-undef`)
  across `test/**` and `tests/e2e/**` files merged from `main`. Confirmed
  pre-existing via baseline `git stash` check (145 problems on the clean tree
  too). Not caused by this plan; not fixed here. Should be addressed by an
  ESLint config update (test-environment globals) in a dedicated task.

## Known Stubs

None. All gating uses build-time const literals; no placeholder/empty-data
paths introduced.

## Self-Check: PASSED

- `preload-byok.generated.cjs` — FOUND (emitted by generator at repo root, git-ignored).
- `scripts/generate-build-config.js` contains `emitPreloadByok` — FOUND.
- `preload.js` contains `buildByokApi` — FOUND.
- `.gitignore` contains `preload-byok.generated.cjs` — FOUND.
- `src/helpers/ipcHandlers.js` contains `PROVIDER_LOCKDOWN_ENABLED` (4x) — FOUND.
- `src/utils/byokDetection.ts` const-foldable early return — FOUND.
- `src/components/IntegrationsView.tsx` `!PROVIDER_LOCKDOWN_ENABLED` gate — FOUND.
- Commit `0d06681b` (Task 1) — FOUND.
- Commit `577a0d2b` (Task 2) — FOUND.
