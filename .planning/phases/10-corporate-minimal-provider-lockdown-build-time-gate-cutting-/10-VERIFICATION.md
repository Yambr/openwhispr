---
phase: 10-corporate-minimal-provider-lockdown-build-time-gate-cutting-
verified: 2026-05-21T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
---

# Phase 10: Corporate-Minimal Provider Lockdown Verification Report

**Phase Goal:** A single build-time flag `OPENWHISPR_PROVIDER_LOCKDOWN` → `PROVIDER_LOCKDOWN_ENABLED` that, when ON, cuts all OAuth buttons, all alternative cloud providers (OpenAI/Groq/Mistral/Custom), all enterprise providers (Bedrock/Azure/Vertex), and all BYOK surfaces — leaving strictly Cloud + Local. When OFF, zero behavioral drift.
**Verified:** 2026-05-21
**Status:** passed — GOAL ACHIEVED
**Re-verification:** No — initial verification

## Goal Achievement Verdict: ACHIEVED

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `PROVIDER_LOCKDOWN_ENABLED` exists in `BOOL_DEFAULTS` (default false) | ✓ VERIFIED | `scripts/generate-build-config.js:95` — `PROVIDER_LOCKDOWN_ENABLED: false` inside frozen `BOOL_DEFAULTS`. Unit test confirms unset→false, `=true`→true, `=1`→true. |
| 2 | `buildResolved()` forces all three OAUTH_* flags off under lockdown | ✓ VERIFIED | `scripts/generate-build-config.js:168-172` — `if (resolved.PROVIDER_LOCKDOWN_ENABLED === true)` sets `OAUTH_GOOGLE/APPLE/MICROSOFT_ENABLED = false`. Test "PROVIDER_LOCKDOWN overrides an explicit OPENWHISPR_OAUTH_GOOGLE=true" passes — lockdown wins. |
| 3 | `defaults.ts` re-exports `PROVIDER_LOCKDOWN_ENABLED` via direct named re-export (DCE-safe) | ✓ VERIFIED | `src/config/defaults.ts:111` — `PROVIDER_LOCKDOWN_ENABLED,` inside the `export { ... } from "./build-config.generated"` block. No `Generated.*` namespace alias used. |
| 4 | Provider/BYOK/enterprise surfaces gated behind the flag | ✓ VERIFIED | `TranscriptionModelPicker.tsx` (5 refs), `ReasoningModelSelector.tsx` (8), `InferenceConfigEditor.tsx` (6, modes array literal-folds to `[openwhispr, local]`), `ipcHandlers.js` (4, three `if (!BuildConfig.PROVIDER_LOCKDOWN_ENABLED)` wrappers), `preload.js` (7, `buildByokApi` spread), `auth.ts` (3, `signInWithSocial` early return), `byokDetection.ts` (2), `IntegrationsView.tsx` (4). |
| 5 | `verify-provider-lockdown.js` exists and wired as npm script | ✓ VERIFIED | `scripts/verify-provider-lockdown.js` present (9599 bytes); `package.json:77` — `"verify:provider-lockdown": "node scripts/verify-provider-lockdown.js"`. Gate run: **OK — 2 scenarios, 40 greps, 0 violations.** |
| 6 | `docs/BUILD_CONFIG.md` documents the flag | ✓ VERIFIED | `docs/BUILD_CONFIG.md:91` flag-table row, worked example (line 96), and verification-gate entry (line 193). Also documented in SELF_HOSTING.md and CONFIG_INVENTORY.md per plan 06. |

**Score:** 6/6 truths verified

## Per-Requirement Status (PLD-01 .. PLD-06)

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| PLD-01 | `OPENWHISPR_PROVIDER_LOCKDOWN` flag end-to-end at gating-infra layer | ✓ SATISFIED | `BOOL_DEFAULTS` entry + `defaults.ts` direct named re-export; `test:build-config` 8/8 pass. |
| PLD-02 | Corporate-lockdown build shows zero OAuth buttons; default keeps all three | ✓ SATISFIED | Force-off block in `buildResolved()`; `signInWithSocial` const-folds the `desktop-signin` URL away; verify gate confirms OAUTH literals absent under lockdown, present in default. |
| PLD-03 | Transcription picker under lockdown offers Cloud/Local only — no provider tabs/BYOK | ✓ SATISFIED | `TranscriptionModelPicker.tsx` gates cloud `ProviderTabs`, custom-endpoint branch, per-provider `ApiKeyInput`; `ensureValidCloudSelection` pins our-server provider. |
| PLD-04 | Inference-mode selector under lockdown offers only OpenWhispr Cloud + Local | ✓ SATISFIED | `InferenceConfigEditor.tsx` modes array literal-folds to `[openwhisprEntry, localEntry]`; providers/self-hosted/enterprise mounts gated; `ReasoningModelSelector.tsx` gates cloud selector + 4 BYOK inputs. |
| PLD-05 | BYOK + enterprise key machinery physically absent from corporate bundle | ✓ SATISFIED | `emitPreloadByok` returns `{}` under lockdown; `ipcHandlers.js` three `if (!BuildConfig.PROVIDER_LOCKDOWN_ENABLED)` wrappers; `byokDetection.hasStoredByokKey` const-folds false; `IntegrationsView` gates `ApiKeysSection`. |
| PLD-06 | Automated gate + docs + live UAT confirm lockdown works, parity preserved | ✓ SATISFIED | `verify:provider-lockdown` gate OK (2 scenarios / 40 greps / 0 violations); docs across 3 files; live UAT performed by orchestrator and PASSED. |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build-config unit tests | `node scripts/generate-build-config.test.cjs` | 8 tests, 8 pass, 0 fail | ✓ PASS |
| Bundle-grep lockdown gate | `npm run verify:provider-lockdown` | OK — 2 scenarios, 40 greps, 0 violations | ✓ PASS |
| TypeScript compile (default build) | `cd src && npx tsc --noEmit` | exit 0, clean | ✓ PASS |

## Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `preload.js` | `preload-byok.generated.cjs` | `require` + `...buildByokApi(ipcRenderer)` spread (line 33, 495) | ✓ WIRED |
| `generate-build-config.js` | `preload-byok.generated.cjs` | `emitPreloadByok(resolved, preloadByokOut)` (line 618) | ✓ WIRED |
| component files | `PROVIDER_LOCKDOWN_ENABLED` | direct named import from `config/defaults` | ✓ WIRED |
| `ipcHandlers.js` | `BuildConfig.PROVIDER_LOCKDOWN_ENABLED` | 3 `if` wrappers gating BYOK/enterprise handlers | ✓ WIRED |

## Anti-Patterns Found

None. All gating uses build-time const literals (`PROVIDER_LOCKDOWN_ENABLED` / `BuildConfig.PROVIDER_LOCKDOWN_ENABLED`) enabling Rolldown DCE. No TBD/FIXME/XXX markers, no stub data paths — `ModelCardList` renders real our-server models under lockdown, not empty placeholders. `defaults.ts` uses the DCE-safe direct named re-export, not the forbidden namespace-alias form.

## Notes on SUMMARY Cross-Check

- The 10-01 SUMMARY's `decisions` note ("OAUTH_* flags stay independent") was superseded by plan 10-02, which added the force-off block. The final codebase state matches the goal: lockdown forces all three OAUTH_* off. No contradiction in delivered code.
- `build-config.generated.{ts,cjs}` and `preload-byok.generated.cjs` are `.gitignored` (regenerated at build time) — verified present after generator run.

## Gaps Summary

No gaps. All 6 must-haves verified, all 6 PLD requirements satisfied, automated gate green, TypeScript clean, and live UAT (orchestrator) confirmed the welcome screen shows email/password only and Settings → Language Models shows exactly OpenWhispr Cloud + Local with no provider tabs, no API-key inputs. The phase goal is observably achieved in the codebase.

---

_Verified: 2026-05-21_
_Verifier: Claude (gsd-verifier)_
