---
phase: quick-260604-tsa
verified: 2026-06-04T22:46:00Z
status: passed
score: 11/11 truths verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
---

# Quick Task 260604-tsa: Cloud Embeddings (corp backend) + Meeting Realtime Fallback — Verification Report

**Goal:** Route note/conversation embeddings to the corp self-hosted backend (CloudEmbeddings via POST /api/embeddings) under PROVIDER_LOCKDOWN_ENABLED + runtime features.embeddings; always-seed require.cache so onnx NEVER spawns under lockdown; fail-closed to FTS5; qdrant dim-migrate 384→1024; lockdown-aware meeting realtime empty-catalog fallback (no api.openai.com); default build byte-identical to upstream; 4 upstream-immutable files untouched.
**Verified:** 2026-06-04
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1 | Lockdown build reads GET /api/capabilities ONCE on cold start (Bearer, runtime backendUrl) and routes embeddings to corp backend only when features.embeddings===true | ✓ VERIFIED | serverCapabilities.js:42-85 GETs `${getBackendUrl()}/api/capabilities` with `Authorization: Bearer`, returns `embeddings: features.embeddings === true`. embeddingsBootstrap.js:112-146 awaits it once in `install()` (idempotency guard line 113), seeds cloud only on `caps.embeddings===true` (135-138). main.js:962 awaits `install()` before vectorIndex (972) + localEmbeddings (1003) requires. |
| 2 | Under lockdown, onnx worker is NEVER required/spawned: bootstrap ALWAYS replaces ./localEmbeddings in require.cache before vectorIndex requires it (cloud caps-true / throw-fast stub caps-false); onnxWorkerClient never required either branch | ✓ VERIFIED | embeddingsBootstrap.js:100-110 `_seedCache` overwrites `require.cache[require.resolve("./localEmbeddings")]` in BOTH branches (136 cloud, 140 stub) BEFORE main.js:972 requires vectorIndex. vectorIndex.js (diff 0) requires `./localEmbeddings` → returns the seeded replacement. Real localEmbeddings.js (which pulls onnxWorkerClient) is shadowed. Test embeddingsBootstrap.test.js:85,101 assert onnx-never-required + correct facade. |
| 3 | When features.embeddings===true, note+conversation embeddings produced by corp backend (1024-dim) via POST /api/embeddings; no onnx | ✓ VERIFIED | cloudEmbeddings.js:85 POST `${apiUrl}/api/embeddings`, parses `data[].embedding` → `Float32Array` (123,130), index-sorted (116,129), CLOUD_EMBEDDING_DIM=1024 (29). Seeded as the localEmbeddings facade → vectorIndex.embedText/embedTexts route here. Test cloudEmbeddings.test.js (9 tests pass). |
| 4 | features.embeddings===false (or fetch fails) → throw-fast stub embedText/embedTexts REJECT EMBEDDINGS_UNAVAILABLE → caught by ipcHandlers:990 try/catch → FTS5; embed-on-write .catch(()=>{}); one log; no onnx, no crash | ✓ VERIFIED | embeddingsBootstrap.js:70-98 `_makeStub` rejects `EMBEDDINGS_UNAVAILABLE` (72-76), isAvailable→false (84), downloadModel no-op (87), one debug log (142). Fail-closed on caps reject (127-133). Test:118 simulates ipcHandlers:990 try/catch → `databaseManager.searchNotes` FTS5 without throwing. |
| 5 | Manual reindex (db-semantic-reindex-all) does NOT misreport success: handler PROBES isAvailable() BEFORE reindexAll; returns {success:false,error:cloudUnavailable key} when unavailable; upstream reindexAll invocation byte-identical | ✓ VERIFIED | ipcHandlers.js:1006-1012 probes `localEmbeddings.isAvailable()===false` → returns `{success:false, error:"notes.embeddings.cloudUnavailable"}` BEFORE the loop. reindexAll call (1016) byte-identical vs upstream (`await vectorIndex.reindexAll(notes, (completed, total) => {`). Test ipcHandlers.reindex-unavailable.test.js (4 tests pass). |
| 6 | Seeded facade (cloud OR stub) is drop-in: exposes isAvailable() + async downloadModel() so main.js:974-979 (now 1003-1008) never throws | ✓ VERIFIED | cloudEmbeddings.js:58-66 isAvailable()→true (sync), downloadModel()→no-op; stub embeddingsBootstrap.js:84-89 isAvailable()→false, downloadModel()→no-op. main.js:1003-1008 calls both unconditionally on seeded module. Test embeddingsBootstrap.test.js:156 asserts the sequence never throws. |
| 7 | Selection is two-level: PROVIDER_LOCKDOWN_ENABLED (build) AND features.embeddings (runtime); cloud only when BOTH true; capability read fails CLOSED | ✓ VERIFIED | embeddingsBootstrap.js:117-121 gate-off → no-op; 124-133 caps fetch wrapped in try/catch, any error → `embeddingsEnabled=false` (stub). serverCapabilities returns FAIL_CLOSED on every error path (24, 49, 55, 70, 83). Test:140 caps-reject → stub. |
| 8 | Default build (gate off) NEVER consults /api/capabilities, NEVER touches require.cache; install() strict no-op; local onnx path byte-identical to upstream; no upstream file edited | ✓ VERIFIED | embeddingsBootstrap.js:117-121 early-return before any caps fetch / cache touch. Generated build-config PROVIDER_LOCKDOWN_ENABLED=false (default). Test embeddingsBootstrap.test.js:78 asserts getCapabilities NOT called. 4 upstream files diff 0 (see Parity). |
| 9 | Dim migration runs STRICTLY AFTER vectorIndex.ensureCollection() resolves (chained, not raced); 384→1024 recreate; only when cloud seeded | ✓ VERIFIED | main.js:990-1001 chains `Promise.resolve(...ensureCollection()).then(() => runDimMigration(...))`. embeddingsBootstrap.js:200-205 runDimMigration self-guards via `if (!seeded) return` (201); migrateCollectionDim 151-176 deletes+recreates at 1024 only when `size !== targetDim`. Test:191 asserts 384→delete+create(1024). |
| 10 | Lockdown + EMPTY catalog: meeting realtime resolver does NOT connect to api.openai.com, does NOT pass hardcoded OpenAI model; targets self-hosted relay (mode openwhispr); no crash on absent model | ✓ VERIFIED | meetingRecordingStore.ts:147-159 lockdown branch returns `{provider:"openai-realtime", model:undefined, mode:"openwhispr", language}`. Transport repointed to server WSS (openaiRealtimeStreaming.js:62-73, no api.openai.com fallback). undefined crash-safe: openaiRealtimeStreaming.js:46 `this.model = model || "gpt-4o-mini-transcribe"`; preconfigured branch (142) sends no session.update → model never on wire (line 75 is debug log only). Test meetingRecordingStore.realtime-fallback.test.ts (3 tests pass). |
| 11 | Default (non-lockdown) build byte-identical to upstream; upstream-immutable files untouched; i18n in 10 locales; no corp namespace token | ✓ VERIFIED | onnxWorker.js / onnxWorkerClient.js / localEmbeddings.js / vectorIndex.js all diff 0 vs upstream/main. Meeting non-lockdown return (line 165) preserves `gpt-4o-mini-transcribe`. notes.embeddings.cloudUnavailable present + genuinely translated in all 10 locales. Namespace scan: 0 bge-m3/litellm tokens (2 EMBEDDING_MODEL hits are in diarization.js, out-of-scope pre-existing). |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| src/helpers/serverCapabilities.js | fail-closed capability fetcher | ✓ VERIFIED | 88 lines, Bearer GET /api/capabilities, FAIL_CLOSED on all paths |
| src/helpers/cloudEmbeddings.js | drop-in for localEmbeddings | ✓ VERIFIED | 156 lines, POST /api/embeddings, 502/503→EMBEDDINGS_UNAVAILABLE no-fallback, index-sorted, isAvailable/downloadModel facade, noteEmbedText verbatim (140 = `${title}\n${enhancedContent\|\|content}`.slice(0,1500)) |
| src/helpers/embeddingsBootstrap.js | two-level always-seed shim + dim migration | ✓ VERIFIED | 216 lines, gate-off no-op (117-121), always-seed (136/140), seeded-guarded dim migration (201) |
| main.js | await install() BEFORE vectorIndex/localEmbeddings require | ✓ VERIFIED | install() line 962 < vectorIndex require 972 < localEmbeddings require 1003. Ordering correct. |
| src/helpers/ipcHandlers.js | reindex probe prepend | ✓ VERIFIED | 1006-1012 probe; 1016 reindexAll byte-identical |
| src/stores/meetingRecordingStore.ts | lockdown prepend-only branch | ✓ VERIFIED | 147-159 lockdown branch; 165 upstream return preserved |
| 10 locale files | notes.embeddings.cloudUnavailable | ✓ VERIFIED | All present, genuinely localized (en/ru/ja/zh-CN spot-checked) |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| main.js:962 | embeddingsBootstrap.install() | await before vectorIndex/localEmbeddings require | ✓ WIRED |
| embeddingsBootstrap | serverCapabilities | deps.getCapabilities() (51,125) | ✓ WIRED |
| serverCapabilities | GET /api/capabilities | net.fetch + Bearer (58-64) | ✓ WIRED |
| embeddingsBootstrap | require.cache ./localEmbeddings | _seedCache (104) both branches | ✓ WIRED |
| ipcHandlers reindex | seeded localEmbeddings | isAvailable() probe (1008) | ✓ WIRED |
| cloudEmbeddings | backendUrl + tokenStore | net.fetch POST (85) Bearer | ✓ WIRED |
| embeddingsBootstrap.runDimMigration | main.js qdrant follow-up | chained after ensureCollection (990-1001) | ✓ WIRED |
| meetingRecordingStore:147 | self-hosted relay | PROVIDER_LOCKDOWN_ENABLED gate | ✓ WIRED |

### DI Test-Seam Production-Safety Audit (executor-stated DEVIATION)

The `_resolveDeps`/`__createForTest`/`_setTestDeps` DI seam is **genuinely production-safe**:

- `_setTestDeps` / `__createForTest` are NOT invoked anywhere in main.js or ipcHandlers.js (production code) — confirmed by grep (0 hits).
- embeddingsBootstrap `_resolveDeps()` returns `_testDeps` only if `_setTestDeps` was called; production never calls it → falls through to real BuildConfig/serverCapabilities/cloudEmbeddings/qdrant (45-64).
- serverCapabilities production caller passes NO arg (`getCapabilities()` at bootstrap:51) → `_resolveDeps(undefined)` → real net/backendUrlState/tokenStore (28-39).
- cloudEmbeddings production exports the default `new CloudEmbeddings()` singleton (`_depsOverride===undefined`) → `_resolveDeps(undefined)` → real modules (38-47).

This is standard dependency injection, NOT a test-hook-in-prod hatch. With no override (production), every seam resolves to the real Electron net / backendUrlState / tokenStore — production behavior is unchanged. Distinct from the WR-01 test-hook-in-prod anti-pattern (ungated test branches in prod), which this is NOT.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full test suite | npx vitest run | 210/210 passed (22 files) | ✓ PASS |
| Typecheck | cd src && tsc --noEmit | exit 0, clean | ✓ PASS |
| Upstream parity (4 files) | git diff upstream/main HEAD | 0 lines each | ✓ PASS |
| reindexAll invocation parity | grep vs upstream | byte-identical | ✓ PASS |
| Meeting non-lockdown return | grep gpt-4o-mini-transcribe | line 165 preserved | ✓ PASS |
| 10 locale keys | grep cloudUnavailable | 10/10 present + translated | ✓ PASS |
| Corp namespace token scan | grep bge-m3/litellm | 0 (diarization EMBEDDING_MODEL out-of-scope) | ✓ PASS |
| Build gate (default) | node require build-config | PROVIDER_LOCKDOWN_ENABLED=false → install() no-op | ✓ PASS |

### Anti-Patterns Found

None. No TBD/FIXME/XXX debt markers introduced. The throw-fast stub seeded under caps-false is the INTENTIONAL fail-closed FTS5 path (documented), not an incomplete stub. No renderer consumer of `semanticReindexAll` yet (key returned ready for future UI per PLAN allowance) — not a gap.

### Human Verification Required

None. All truths verified programmatically against the merged codebase. Live verification (real lockdown corp build hitting a real /api/capabilities + /api/embeddings server) is recommended before release per the repo's "live verification over green tests" rule, but is not a gap blocking task goal achievement — the wire contract is server-peer-confirmed and the parity/ordering invariants are all met in code.

### Gaps Summary

No gaps. All 11 observable truths verified against the actual merged HEAD. The 4 upstream-immutable files are diff-clean; the reindexAll invocation and meeting non-lockdown return are byte-identical to upstream; the await ordering (install at 962 before requires at 972/1003) and dim-migration chaining (after ensureCollection) are correct; 210/210 tests pass; typecheck clean; 10 locales present and genuinely translated; no corp namespace leak; the DI test-seam is production-safe with no test-hook-in-prod behavior.

---

_Verified: 2026-06-04T22:46:00Z_
_Verifier: Claude (gsd-verifier)_
