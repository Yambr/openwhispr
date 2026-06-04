---
phase: 260604-gpc-v1718-corporate-host-data-plane-onnx-pack
verified: 2026-06-04T12:30:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: issues_found  # from REVIEW.md (BL-01 blocker)
  previous_score: BL-01 blocker
  gaps_closed:
    - "BL-01: deriveRealtimeWssUrl relocated to packaged src/helpers/realtimeWssUrl.js; no runtime require of scripts/ remains in src/"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "RC-4 packed-build smoke: npm run pack (unsigned), then npx asar list dist/mac*/OpenWhispr.app/Contents/Resources/app.asar | grep src/workers/onnxWorker.js + grep src/helpers/realtimeWssUrl.js"
    expected: "Both files present in app.asar. Launching the packed .app shows debug log 'onnx worker spawned {pid}' then 'worker initialized'; semantic search (note about 'quarterly revenue projections', agent search 'financial forecast') matches."
    why_human: "Requires a full electron-builder --dir build with uncached sidecars (hundreds of MB) infeasible in this executor; a green files-glob is necessary but not sufficient proof the worker spawns from inside the packed asar. Documented as a REQUIRED pre-tag gate in SUMMARY."
  - test: "Corporate live-verification: install/update a corporate self-hosted build pointing at an internal backend; cold-launch and confirm all /api/* (transcribe, reason, session) resolve the corporate host, and OpenAI Realtime meeting + dictation connect to the corporate WSS host (no net::ERR_TIMED_OUT, no api.openai.com)."
    expected: "Every cloud request and the realtime socket hit the corporate host on cold start; no fallback to the build-time public default."
    why_human: "Requires a real corporate backend + packed update flow; WR-02 (async-push happens-before is best-effort, not a hard guarantee) can only be confirmed against a live deployment."
---

# Phase 260604-gpc: v1.7.19 Corporate Host Data Plane + ONNX Pack Verification Report

**Phase Goal:** Fix RC-1..RC-4 (corporate self-hosted build can't reach backend after update → all cloud net::ERR_TIMED_OUT; + onnx worker missing from package), shipping in v1.7.19. Plus BL-01 code-review blocker fix (deriveRealtimeWssUrl relocated to a packaged helper).
**Verified:** 2026-06-04T12:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after BL-01 gap closure (commit 7fcb7047)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cold launch with persisted corporate serverUrl pushes it to main-process data plane before first request, no auth.ts reload | ✓ VERIFIED | settingsStore.ts:1701-1723 — inside `if (window.electronAPI)`, non-empty-string guard, `notifyServerUrlChanged?.(state.serverUrl)`, no `set`/`setServerUrl` mutation → subscribe/reload path never engaged. host-coldstart-push.test.ts: 5/5 pass. |
| 2 | Realtime WSS (meeting + dictation) connects to runtime-derived host, fail-fast if empty, no api.openai.com fallback | ✓ VERIFIED | openaiRealtimeStreaming.js:37,62-67 — destructures `wssUrl`, `resolvedWssUrl = wssUrl \|\| OPENWHISPR_REALTIME_WSS_URL`, throws when empty (no api.openai.com). ipcHandlers.js:4306 (meeting) + 5144 (dictation) both pass `wssUrl: deriveRealtimeWssUrl(backendUrlState.getBackendUrl())`. |
| 3 | BL-01: deriveRealtimeWssUrl in PACKAGED src/helpers/realtimeWssUrl.js; ipcHandlers requires "./realtimeWssUrl"; no runtime require of scripts/ in src/ | ✓ VERIFIED | src/helpers/realtimeWssUrl.js exists (plain CJS, no electron/build-config imports). ipcHandlers.js:3398 `require("./realtimeWssUrl")`. generate-build-config.js:175 re-exports from helper (single SoT). grep for `require(...scripts/)` in src/ → empty. src/helpers/**/* is in electron-builder.json files (line 21). |
| 4 | Under lockdown cloudTranscriptionMode can never be byok; stray byok self-heals; non-lockdown BYOK preserved | ✓ VERIFIED | settingsStore.ts:295-303 seedLockdownTranscriptionMode (isBrowser + PROVIDER_LOCKDOWN_ENABLED guarded, byok→openwhispr only, invoked at module load). OnboardingFlow.tsx:322 + 546 both byok writes gated `&& !PROVIDER_LOCKDOWN_ENABLED`. lockdown-transcription-mode.test.ts: 4/4 pass. |
| 5 | electron-builder.json files includes src/workers/**/* (onnxWorker packaging) | ✓ VERIFIED | electron-builder.json:29 `"src/workers/**/*"` present in positive-include block. Packed-asar smoke is a documented pre-tag gate (SUMMARY) — routed to human_verification. |
| 6 | Upstream-immutable untouched; package.json version unchanged | ✓ VERIFIED | git diff merge-base..HEAD excludes audioManager.js / onnxWorkerClient.js / onnxWorker.js / package.json. package.json version still 1.7.18 (release tagging handles v1.7.19). audioManager getTranscriptionEndpoint still present (2 refs). |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/stores/settingsStore.ts` | RC-1 push + RC-3 reconciler | ✓ VERIFIED | notifyServerUrlChanged at :1715; seedLockdownTranscriptionMode at :295-303 |
| `src/helpers/openaiRealtimeStreaming.js` | RC-2 options.wssUrl, fallback, fail-fast | ✓ VERIFIED | wssUrl destructure + resolvedWssUrl + throw |
| `src/helpers/ipcHandlers.js` | RC-2 derive at both sites + BL-01 require path | ✓ VERIFIED | `require("./realtimeWssUrl")`; :4306 meeting, :5144 dictation |
| `src/helpers/realtimeWssUrl.js` | BL-01 packaged helper | ✓ VERIFIED | New file, plain CJS, deriveRealtimeWssUrl exported |
| `src/components/OnboardingFlow.tsx` | RC-3 lockdown-gated byok writes | ✓ VERIFIED | import :39, gates :322 + :546 |
| `electron-builder.json` | RC-4 src/workers glob | ✓ VERIFIED | :29 src/workers/**/* |
| `src/stores/__tests__/host-coldstart-push.test.ts` | RC-1 regression | ✓ VERIFIED | 5 tests pass |
| `src/stores/__tests__/lockdown-transcription-mode.test.ts` | RC-3 regression | ✓ VERIFIED | 4 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| settingsStore.initializeSettings | main backendUrlState.setBackendUrl | notifyServerUrlChanged(state.serverUrl) | ✓ WIRED | preload.js exposes channel; direct IPC, no store mutation |
| ipcHandlers realtime sites | openaiRealtimeStreaming.connect options.wssUrl | deriveRealtimeWssUrl(getBackendUrl()) | ✓ WIRED | both connect sites pass wssUrl |
| generate-build-config | realtimeWssUrl helper | require("../src/helpers/realtimeWssUrl") | ✓ WIRED | single SoT, no divergence |
| OnboardingFlow + reconciler | cloudTranscriptionMode stays openwhispr under lockdown | PROVIDER_LOCKDOWN_ENABLED gate | ✓ WIRED | both write sites gated + self-heal |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck clean | `npm run typecheck` | exit 0 | ✓ PASS |
| Full suite green | `npx vitest run` | 17 files / 173 tests passed | ✓ PASS |
| No runtime require of scripts/ in src/ | grep | empty | ✓ PASS |
| Generated-file churn after vitest | git status build-config.generated.* | no churn | ✓ PASS |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX in modified files | — | None |

### Human Verification Required

1. **RC-4 packed-build smoke (pre-tag gate)** — `npm run pack` (unsigned), assert `src/workers/onnxWorker.js` AND `src/helpers/realtimeWssUrl.js` inside app.asar; launch packed .app, confirm "onnx worker spawned {pid}" + "worker initialized" + semantic-search match. Infeasible in this executor (sidecar download + full build); documented as REQUIRED pre-tag gate in SUMMARY. This is the live proof for BL-01 (helper present in asar) and RC-4 (worker spawns).
2. **Corporate live-verification** — real corporate self-hosted update flow: cold-launch hits internal backend for all /api/* + realtime WSS, no ERR_TIMED_OUT. Confirms WR-02 (best-effort async push ordering) holds in practice.

### Gaps Summary

No gaps. All 6 must-haves are VERIFIED in the codebase at HEAD (quick/260604-eij-custom-host-onboarding). The headline code-review blocker BL-01 is closed (commit 7fcb7047): the build-tool require from the main process is gone — `deriveRealtimeWssUrl` now lives in the packaged `src/helpers/realtimeWssUrl.js`, `ipcHandlers.js` requires `./realtimeWssUrl`, and `generate-build-config.js` re-exports it so the two never diverge. No runtime `require(.../scripts/)` remains anywhere in `src/`, which is the exact MODULE_NOT_FOUND crash the review caught.

Status is **human_needed** (not passed, not gaps_found) because two checks are legitimately un-automatable in this executor and are pre-tag-gated, not missing work: (a) the RC-4 packed-asar smoke that proves the worker + helper actually ship and the worker spawns, and (b) the end-to-end corporate live run that proves the data plane reaches the internal host on a real update. WR-01/WR-02 from the review are accepted best-effort (per task brief) and do not block. typecheck clean, 173/173 vitest green, upstream-immutable files and package.json version untouched.

---

_Verified: 2026-06-04T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
