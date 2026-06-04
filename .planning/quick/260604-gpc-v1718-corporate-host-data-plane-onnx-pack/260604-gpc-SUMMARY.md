---
phase: quick-260604-gpc
plan: 01
subsystem: corporate-host-data-plane
tags: [self-hosted, backend-url, realtime-wss, lockdown, byok, electron-builder, onnx]
requires: [backendUrlState IPC channel (v1.8.0 HOST-02), generate-build-config.deriveRealtimeWssUrl (Phase 05)]
provides: [cold-start serverUrl push, runtime realtime WSS host, lockdown byok self-heal, onnxWorker packaging]
affects: [src/stores/settingsStore.ts, src/helpers/openaiRealtimeStreaming.js, src/helpers/ipcHandlers.js, src/components/OnboardingFlow.tsx, electron-builder.json]
tech-stack:
  added: []
  patterns: [direct-IPC push bypassing store subscribe, options-injected transport host, module-load localStorage reconciler, asar files-glob]
key-files:
  created:
    - src/stores/__tests__/host-coldstart-push.test.ts
    - src/stores/__tests__/lockdown-transcription-mode.test.ts
  modified:
    - src/stores/settingsStore.ts
    - src/helpers/openaiRealtimeStreaming.js
    - src/helpers/ipcHandlers.js
    - src/components/OnboardingFlow.tsx
    - electron-builder.json
    - test/helpers/openaiRealtimeStreaming.test.js
decisions:
  - "RC-1 push is a direct electronAPI.notifyServerUrlChanged IPC call, NOT a store mutation, so the auth.ts subscribe reload path never fires."
  - "RC-2 keeps OpenAIRealtimeStreaming a dumb transport: runtime host arrives via options.wssUrl; class imports no build-config beyond the existing constant."
  - "RC-3 fixed by NOT reaching the BYOK resolver (build-gate + self-heal), audioManager untouched."
  - "RC-4 real npm run pack is infeasible in this sandbox (uncached sidecars + full electron-builder build); recorded as a REQUIRED pre-tag gate instead of faking it."
metrics:
  duration: ~25m
  completed: 2026-06-04
---

# Phase quick-260604-gpc Plan 01: v1.7.19 Corporate Host Data Plane + ONNX Pack Summary

Restored the corporate self-hosted data plane after update: the main process now learns the persisted corporate `serverUrl` on cold start before any `/api/*` request fires (RC-1), the OpenAI-Realtime WSS socket follows the runtime backend host instead of the build-time-frozen URL at both connect sites (RC-2), `cloudTranscriptionMode:"byok"` can never route corporate transcription to the public BYOK endpoint (RC-3), and `onnxWorker.js` now ships in `app.asar` so local semantic-search embeddings work in packaged builds (RC-4). All four ship together; 165/165 vitest green, typecheck clean, no upstream-immutable file touched, `package.json` version untouched.

## Tasks Completed

| Task | RC | Commit | Key files |
|------|----|--------|-----------|
| 1 | RC-1 cold-start serverUrl push | `d5a243e9` | settingsStore.ts, host-coldstart-push.test.ts |
| 2 | RC-2 runtime realtime WSS host | `34f45eb1` | openaiRealtimeStreaming.js, ipcHandlers.js, openaiRealtimeStreaming.test.js |
| 3 | RC-3 kill byok under lockdown | `2d6237cc` | settingsStore.ts, OnboardingFlow.tsx, lockdown-transcription-mode.test.ts |
| 4 | RC-4 package onnxWorker.js | `73db9ff3` | electron-builder.json |

## What was built

### RC-1 — cold-start serverUrl push (PRIMARY)
`initializeSettings()` now, inside the existing `if (window.electronAPI)` block and after `const state = useSettingsStore.getState()`, calls `window.electronAPI.notifyServerUrlChanged?.(state.serverUrl)` exactly once when a non-empty persisted `serverUrl` is present. `serverUrl` is hydrated synchronously at store construction, so it is already populated when this one-shot init (guarded by `hasInitialized`) runs. This sets main-process `backendUrlState.runtimeBackendUrl` BEFORE any `/api/*` handler resolves `getApiUrl()`. It is a **direct IPC call**: it does not mutate the store, so the `auth.ts` subscribe handler (`window.location.reload`, auth.ts:88) is never engaged. Wrapped in try/catch + `logger.warn`. `auth.ts` was NOT edited.

### RC-2 — runtime realtime WSS host
`openaiRealtimeStreaming.connect()` destructures `wssUrl` from options and computes `resolvedWssUrl = wssUrl || OPENWHISPR_REALTIME_WSS_URL`, used everywhere the build-time constant was previously used (empty-guard, separator, URL template). The existing fail-fast `Error` is preserved when the resolved host is empty (no fallback to api.openai.com). The class stays a dumb transport — no build-config import beyond the pre-existing constant. `ipcHandlers.js` requires `deriveRealtimeWssUrl` once next to the `backendUrlState` require and passes `wssUrl: deriveRealtimeWssUrl(backendUrlState.getBackendUrl())` at **both** connect sites: MEETING (`connectRealtimeStreaming` connectOpts, spread into `connect`) and DICTATION (`connectInner` direct `connect`). `deriveRealtimeWssUrl` returns `""` for an empty backend URL → the class falls back to the build-time constant, preserving default-build behavior.

### RC-3 — kill byok under lockdown
Added `seedLockdownTranscriptionMode()` mirroring `seedLockdownCloudBackupDefault` (guards `isBrowser` + `PROVIDER_LOCKDOWN_ENABLED`), invoked at module load before the store constructor reads `cloudTranscriptionMode`: a persisted `"byok"` self-heals to `"openwhispr"`. `OnboardingFlow.tsx` imports `PROVIDER_LOCKDOWN_ENABLED` and gates both byok writes (lines 319 + 542) behind `!PROVIDER_LOCKDOWN_ENABLED`, so fresh corporate onboarding never writes byok. `audioManager.js` (the upstream-immutable BYOK resolver) was NOT touched — the resolver is simply never reached under lockdown.

### RC-4 — package onnxWorker.js
Added `"src/workers/**/*"` to the `electron-builder.json` `files` array (after `src/types/**/*`). This ships `app.asar/src/workers/onnxWorker.js` — the exact path `onnxWorkerClient.js:11` computes via `utilityProcess.fork`. `onnxruntime-node` is already in `asarUnpack`, so no asarUnpack change is needed for the worker script.

## Verification (real output)

- **typecheck**: `npm run typecheck` → exit 0 (clean).
- **full suite**: `npx vitest run` → exit 0, **16 files / 165 tests passed** (13 new: 5 RC-1 + 4 RC-2 + 4 RC-3; existing 152 unchanged).
- New RC-1/RC-3 tests use node stubs (truthy `globalThis.window` + `window.localStorage` + bare `localStorage` Map-backed shim) installed BEFORE the dynamic store import and re-installed after each `vi.resetModules()`, mirroring `test/helpers/authClientProxy.test.js`, so the store's module-load `isBrowser` guard and hydration observe them.
- No upstream-immutable file touched (verified `git diff --name-only` excludes audioManager.js / onnxWorkerClient.js / onnxWorker.js); `package.json` untouched.

## RC-1 pre-flight egress grep (REQUIRED record)

`grep -nE "getApiUrl|getBackendUrl|net\.fetch|fetch\(.*api/" main.js` →
- `main.js:539` — `net.fetch(\`${resolveAuthUrl()}/api/auth/get-session\`)` inside `exchangeSignedTokenForRawBearer`.
- `main.js:771` — `backendUrlState.getBackendUrl()` inside the `onBeforeSendHeaders` Origin-rewrite (per-request, not egress).

**Finding (FLAG — scoped, does NOT block RC-1's primary fix):** `migrateCookieToBearerToken()` is called **unconditionally at app-ready** (`main.js:754`, before the renderer mounts) and can fire `exchangeSignedTokenForRawBearer` → `net.fetch(/api/auth/get-session)`. Two reasons this does not undermine RC-1 or the corporate data-plane fix:
1. **It is gated behind a legacy-cookie existence check** (`main.js:570`, `if (!cookies.length) return;`). It only fires the fetch for users upgrading from a build that injected the session cookie into Electron's jar. Fresh corporate (bearer-token) installs have no such cookie → no startup egress.
2. **It resolves the host via `resolveAuthUrl()` (build-time `AUTH_URL` / `runtime-env.json`), NOT via `backendUrlState`.** So RC-1's renderer push (Option 1) does **not** cover this path — but it also does not need to: this is a one-time legacy-cookie→bearer migration against the build-time auth host, independent of the `/api/transcribe` `/api/reason` `/api/*` data plane that times out on corporate hosts. All those handlers resolve via `backendUrlState.getBackendUrl()` / `getAuthUrl()`, which RC-1 now seeds before the renderer's first request.

**Recommendation (future, out of scope for this fix):** if a corporate self-hosted user ever upgrades FROM a cookie-injecting build, `migrateCookieToBearerToken` will probe the wrong (public) auth host at startup. Consider routing `resolveAuthUrl()` through a persisted runtime override at app-ready (a main-side read of the stored serverUrl) in a follow-up. Filed here as awareness; no client change made now (it would be main-process work touching the migration path, and the cookie-gated early-return makes it a no-op for the common corporate case).

No other unconditional app-ready `/api/*` fetch was found that runs before the renderer mounts.

## RC-4 packed-build verification outcome (REQUIRED record)

A real `npm run pack` is **infeasible in this executor environment**: `prepack` downloads uncached sidecars (whisper-cpp, llama-server, sherpa-onnx, qdrant, diarization models — hundreds of MB) and `resources/bin/` is empty here, plus a full `electron-builder --dir` build. Per the no-fake rule, the asar was NOT faked. Instead:

1. **Glob present** — `grep -n "src/workers" electron-builder.json` → `29: "src/workers/**/*",` ✓
2. **Source + fork-path confirmed** — `src/workers/onnxWorker.js` exists (11987 bytes); `onnxWorkerClient.js:11` forks `path.join(__dirname, "..", "workers", "onnxWorker.js")` → resolves to `app.asar/src/workers/onnxWorker.js` once packed. The new glob matches it.

**REQUIRED PRE-TAG PACK-SMOKE GATE (must run before tagging v1.7.19):**
- `npm run pack` (unsigned, `CSC_IDENTITY_AUTO_DISCOVERY=false`).
- Confirm in the asar: `npx asar list dist/mac*/OpenWhispr.app/Contents/Resources/app.asar | grep src/workers/onnxWorker.js` → expect a match (adjust dist path per platform).
- Launch the packed `.app` with debug logging and confirm the log shows **`onnx worker spawned {pid}`** followed by **`worker initialized`**.
- Run semantic search end-to-end: create a note about "quarterly revenue projections", then via the AI agent search "financial forecast" — it must match (proves embeddings via the packaged ONNX worker, not just FTS5 fallback).

This mirrors the live-verification-over-green-tests rule: the green files-glob is necessary but not sufficient proof the worker actually spawns from inside the packed asar.

## Upstream awareness (REQUIRED record — file/PR upstream so deltas aren't re-applied each merge)

- **RC-4 (`src/workers/**/*` in electron-builder.json `files`)** — `onnxWorker.js` is upstream OpenWhispr (PR #693) but the upstream `files` glob never shipped it; this is a genuine upstream packaging bug. **Recommend filing upstream** (issue/PR adding the `src/workers` glob) so the fork does not re-apply this delta on every merge.
- **RC-2 awareness** — `openaiRealtimeStreaming.connect()` now accepts an `options.wssUrl` override. This is fork-only drift (Phase 05 realtime is fork code), additive and backward-compatible (absent → build-time constant). Documented here so a future upstream merge that touches `connect()` is reviewed against the `wssUrl` injection point.

## Deviations from Plan

None — plan executed exactly as written. The RC-1 pre-flight surfaced `migrateCookieToBearerToken` as predicted by the plan; it is flagged above as scoped/non-blocking per the plan's instruction (it is cookie-gated and uses a separate build-time auth resolver, so Option 1's renderer push correctly does not need to cover it; no main-side read was added).

## Known Stubs

None. No placeholder/empty-data stubs introduced. RC-4's packed proof is a documented pre-tag gate, not a stub.

## Threat Flags

None. RC-1 reuses the existing `settings:server-url-changed` channel (value already sanitized by `backendUrlState.sanitizeUrl`: http/https-only, origin-only, 2048 cap); RC-2 derives the WSS host from the same validated origin; RC-3 narrows surface (removes a public-host route); RC-4 adds an existing upstream script to the wholesale-signed asar. No new trust-boundary surface beyond the plan's threat_model.

## Self-Check: PASSED

- src/stores/__tests__/host-coldstart-push.test.ts — FOUND
- src/stores/__tests__/lockdown-transcription-mode.test.ts — FOUND
- Commits d5a243e9, 34f45eb1, 2d6237cc, 73db9ff3 — all present in git log
- electron-builder.json contains `src/workers/**/*` — FOUND
- typecheck exit 0; vitest 165/165 green
