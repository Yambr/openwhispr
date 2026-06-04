---
phase: quick-260604-tsa
plan: 01
subsystem: embeddings / meeting-realtime
tags: [embeddings, lockdown, capabilities, qdrant, realtime, i18n, upstream-parity]
requires:
  - PROVIDER_LOCKDOWN_ENABLED build flag
  - GET /api/capabilities (features.embeddings)
  - POST /api/embeddings (OpenAI shape, dim 1024)
  - backendUrlState.getBackendUrl + tokenStore.get (Bearer)
provides:
  - cloud-routed note/conversation embeddings under lockdown (onnx never spawns)
  - fail-closed FTS5 degradation when the server can't embed
  - honest reindex error surfacing (no false success)
  - self-hosted meeting realtime empty-catalog fallback (no api.openai.com)
affects:
  - main.js startApp embedding bootstrap
  - src/helpers/ipcHandlers.js db-semantic-reindex-all
  - src/stores/meetingRecordingStore.ts meeting realtime fallback
tech-stack:
  added: [src/helpers/serverCapabilities.js, src/helpers/cloudEmbeddings.js, src/helpers/embeddingsBootstrap.js]
  patterns: [require.cache always-seed shim, two-level build+runtime gate, fail-closed capability read, DI seam for unit tests]
key-files:
  created:
    - src/helpers/serverCapabilities.js
    - src/helpers/cloudEmbeddings.js
    - src/helpers/embeddingsBootstrap.js
    - test/helpers/serverCapabilities.test.js
    - test/helpers/cloudEmbeddings.test.js
    - test/helpers/embeddingsBootstrap.test.js
    - test/helpers/ipcHandlers.reindex-unavailable.test.js
    - test/stores/meetingRecordingStore.realtime-fallback.test.ts
  modified:
    - main.js
    - src/helpers/ipcHandlers.js
    - src/stores/meetingRecordingStore.ts
    - src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW,ja}/translation.json
decisions:
  - "Always-seed require.cache shim (cloud facade OR throw-fast stub) instead of a not-ready seam — vectorIndex.init sets client unconditionally, so not-ready is unachievable and would let onnx spawn-crash."
  - "Two-level gate: PROVIDER_LOCKDOWN_ENABLED (build) AND features.embeddings (runtime, fail-closed). Capability read fails CLOSED → stub, never cloud."
  - "Honest reindex probe: isAvailable() before reindexAll, because upstream reindexAll swallows per-batch failures and would falsely report success."
  - "Dependency-injection seam (_resolveDeps / __createForTest / _setTestDeps) added to the fork modules because vitest cannot mock nested source-relative CJS requires (tokenStore → secretCrypto → electron is below vi.mock depth)."
metrics:
  tasks_completed: 4
  vitest: "210/210 passed (22 files)"
  typecheck: "clean (npm run typecheck)"
  completed: 2026-06-04
---

# Quick Task 260604-tsa: Cloud Embeddings (corp backend) + Meeting Realtime Fallback Summary

One-liner: Under a lockdown corp build, note/conversation embeddings route to the self-hosted backend via POST /api/embeddings (dim 1024) when GET /api/capabilities says `features.embeddings === true`; otherwise a throw-fast stub shadows `./localEmbeddings` so the crashing onnx worker NEVER spawns and search degrades cleanly to FTS5 — all without editing a single upstream file. Plus a self-hosted meeting realtime empty-catalog fallback that no longer leaks api.openai.com or a hardcoded OpenAI model.

## What shipped (4 tasks)

1. **serverCapabilities + CloudEmbeddings drop-in** (`048096b5`, naming fixup `c34c6279`)
   - `serverCapabilities.getCapabilities()` GETs `/api/capabilities` with Bearer, returns `features.embeddings`, fails CLOSED to `{ embeddings:false }` on every error path (non-ok, network reject, malformed JSON, missing token, empty URL) — never throws.
   - `cloudEmbeddings.js` is a full DROP-IN for `localEmbeddings`: `embedText`/`embedTexts` POST to `/api/embeddings`, parse the OpenAI response into `Float32Array(1024)`, batch-order by `index`, throw on non-ok (502/503) and null-token with NO fallback; `isAvailable()→true` (sync) + async `downloadModel()→no-op` so the unconditional `main.js:974-979` bootstrap sequence never throws; `LocalEmbeddings.noteEmbedText` inlined verbatim. Wire shape isolated in one `_request` adapter; `CLOUD_EMBEDDING_DIM=1024` is the single dim source of truth.

2. **embeddingsBootstrap always-seed shim + dim migration + main.js wiring** (`d2eba344`)
   - THE SEAM: under `PROVIDER_LOCKDOWN_ENABLED`, `install()` ALWAYS replaces `require.cache[<localEmbeddings>].exports` BEFORE vectorIndex first requires it — cloud facade when caps-true (`seeded=true`), throw-fast stub otherwise (`seeded=false`). The real `localEmbeddings.js` is shadowed in BOTH branches, so `onnxWorkerClient` is never required → onnx never spawns. Build gate off → strict no-op (caps never fetched, cache untouched, upstream path byte-identical).
   - Throw-fast stub: `embedText`/`embedTexts` reject `EMBEDDINGS_UNAVAILABLE`, `isAvailable()→false`, `downloadModel()→no-op`. The rejection is absorbed by the existing `ipcHandlers.js:990` try/catch (→ FTS5) and the embed-on-write `.catch(()=>{})`.
   - `migrateCollectionDim` recreates stale 384 qdrant collections at 1024 (data-loss acceptable — vectors are derived; notes live in sqlite), ONLY when the cloud facade was seeded, chained STRICTLY AFTER `vectorIndex.ensureCollection()` resolves.
   - `main.js`: fork-only `require` adjacent to the existing fork block (line ~261) + `await embeddingsBootstrap.install()` at line 962 (immediately before the `QdrantManager` require at 964, before vectorIndex/localEmbeddings requires) + a dim-migration follow-up that chains on `ensureCollection()`. Upstream lines 954-979 are byte-identical.

3. **Meeting realtime empty-catalog lockdown fallback** (`3d1ff4b4`)
   - Under `PROVIDER_LOCKDOWN_ENABLED` + empty catalog, `getMeetingTranscriptionOptions` returns a self-hosted relay descriptor: `provider "openai-realtime"` (transport already repointed to the server WSS via `streamingProviders.lockdown.js` + RC-2 `deriveRealtimeWssUrl`), `mode "openwhispr"`, and NO hardcoded OpenAI model.
   - Confirmed-safe absent-model handling: `mode "openwhispr"` → ipcHandlers `connectRealtimeStreaming` sets `preconfigured: options.mode !== "byok"` = true → the realtime client (`openaiRealtimeStreaming.js`) takes the `session.created (preconfigured)` branch and NEVER sends a `session.update`, so `this.model` never reaches the wire (server pins it). `this.model = model || "gpt-4o-mini-transcribe"` makes `undefined` crash-safe.
   - PREPEND-ONLY: the upstream non-lockdown return (`model: "gpt-4o-mini-transcribe"`) is preserved byte-identical; only the `export` keyword, the import, and the lockdown branch were added.

4. **Honest reindex probe + i18n** (`4a206d2e`)
   - `db-semantic-reindex-all` PREPENDS a fork-only `localEmbeddings.isAvailable()` probe before `vectorIndex.reindexAll`: under the stub (false) returns `{ success:false, error:"notes.embeddings.cloudUnavailable" }` WITHOUT looping; under cloud/local (true) proceeds unchanged. The upstream `await vectorIndex.reindexAll(...)` invocation is byte-identical (verified). This is necessary because upstream `reindexAll` swallows per-batch embed failures (`vectorIndex.js:77-87`), so the naive path would falsely report success.
   - `notes.embeddings.cloudUnavailable` added and translated in all 10 locales (en, es, fr, de, pt, it, ru, zh-CN, zh-TW, ja). No renderer call site currently consumes `semanticReindexAll` (exposed in preload + types only), so the stable key is returned ready for any future UI to resolve via `t()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Generated build-config was missing**
- **Found during:** Task 1 setup. `src/config/build-config.generated.cjs` is gitignored and absent; main.js and tests require it.
- **Fix:** Ran `node scripts/generate-build-config.js` (default build = `PROVIDER_LOCKDOWN_ENABLED: false`) so the suite + typecheck resolve. Not committed (gitignored, regenerated at build time).

**2. [Rule 3 - Blocking] vitest cannot mock nested source-relative CJS requires**
- **Found during:** Task 1 RED→GREEN. `vi.mock("../../src/helpers/tokenStore")` does NOT intercept a nested `require("./tokenStore")` from inside `serverCapabilities.js`/`cloudEmbeddings.js` (the real `tokenStore → secretCrypto → electron` chain runs and throws on `app.getPath`). Verified with isolated probes: vi.mock only reliably intercepts direct ESM imports and `node_modules`, not deep CJS require chains.
- **Fix:** Added a minimal, production-safe dependency-injection seam to the fork modules: `_resolveDeps(overrides)` (serverCapabilities), `__createForTest(deps)` / constructor `deps` (cloudEmbeddings), `_setTestDeps`/`_resolveDeps` (embeddingsBootstrap). Production passes NO override (real modules). Tests inject deterministic doubles and mock ONLY the HTTP boundary (the injected `fetch`). This is standard DI, not a test-only hatch.
- **Files:** serverCapabilities.js, cloudEmbeddings.js, embeddingsBootstrap.js.

**3. [Rule 3 - Blocking] Full IPCHandlers class is not instantiable under vitest**
- **Found during:** Task 4 reindex test. Instantiating `IPCHandlers` (or capturing the registered handler) hits the same nested-require wall — the constructor + transitive requires touch the real electron `app` (`getPath` undefined).
- **Fix:** The reindex test reproduces the EXACT handler body (probe + upstream reindex flow, kept verbatim) and drives it with fakes, PLUS a parity-guard test that greps the shipped `ipcHandlers.js` to assert the probe + `notes.embeddings.cloudUnavailable` key + byte-identical `await vectorIndex.reindexAll(...)` call are all present — so the reproduction cannot silently drift from production. The plan explicitly permitted invoking the handler logic directly when no harness exists.

**4. [Rule 1 - Naming] Removed an embedding model-name literal from a comment**
- **Found during:** final namespace scan. A code comment in `cloudEmbeddings.js` named the embedding model class. Per the corp-namespace naming ban (constraint 5), replaced with generic phrasing (`c34c6279`). No behavior change.

## Verification

- `npx vitest run` → **210/210 passed** (22 files), including all 5 new test files (serverCapabilities 8, cloudEmbeddings 9, embeddingsBootstrap 13, reindex 4, meeting fallback 3).
- `npm run typecheck` (`cd src && tsc --noEmit`) → **clean**.
- Upstream parity: `vectorIndex.js`, `onnxWorker.js`, `onnxWorkerClient.js`, `localEmbeddings.js` all `UNCHANGED` vs `upstream/main`. `ipcHandlers.js` reindex edit is a pure prepend (reindexAll invocation byte-identical, confirmed by diff). `meetingRecordingStore.ts` upstream `gpt-4o-mini-transcribe` non-lockdown return preserved.
- All 10 locale JSON files valid with the new key.
- `main.js` `await embeddingsBootstrap.install()` at line 962 (before QdrantManager require at 964); dim migration chained after `ensureCollection`.
- Namespace scan: no corp org/model literal in any committed code, comment, test, or commit message.

## SERVER-REQUIREMENTS supersession note

`SERVER-REQUIREMENTS.md:29-31` still carries the stale "vectorIndex stays not-ready" client-structure wording. That idea is SUPERSEDED by the always-seed throw-fast stub (vectorIndex.init sets `client` unconditionally → not-ready is unachievable and would let onnx spawn-crash). The doc's WIRE contract (`/api/embeddings`, `/api/capabilities`, 502/503-never-401) remains authoritative and was implemented to. No edit to SERVER-REQUIREMENTS.md was required.

## Known Stubs

The throw-fast stub seeded under `caps-false` is INTENTIONAL and documented above — it is the fail-closed FTS5-degradation path, not an incomplete feature. It is selected only at runtime when the operator has not configured a server embedding model; the client correctly surfaces this honestly (search → FTS5, reindex → `cloudUnavailable` error). No unintended stubs.

## Commits

- `048096b5` feat(260604-tsa): serverCapabilities fail-closed probe + CloudEmbeddings drop-in
- `d2eba344` feat(260604-tsa): always-seed embeddings bootstrap + dim migration + main.js wiring
- `3d1ff4b4` feat(260604-tsa): lockdown-aware meeting realtime empty-catalog fallback
- `4a206d2e` feat(260604-tsa): honest reindex-unavailable probe + cloudUnavailable i18n (10 locales)
- `c34c6279` chore(260604-tsa): drop model-name literal from cloudEmbeddings comment

## Self-Check: PASSED

All 8 created source/test files exist on disk; all 5 task commits exist in git history.
