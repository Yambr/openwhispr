---
task: 260604-tsa cloud embeddings to corp backend
reviewed: 2026-06-05T10:26:40Z
depth: thorough (release gate)
diff_base: v1.7.19..HEAD
files_reviewed: 16
files_reviewed_list:
  - main.js
  - src/helpers/cloudEmbeddings.js
  - src/helpers/embeddingsBootstrap.js
  - src/helpers/serverCapabilities.js
  - src/helpers/ipcHandlers.js
  - src/stores/meetingRecordingStore.ts
  - src/locales/en/translation.json
  - src/locales/es/translation.json
  - src/locales/fr/translation.json
  - src/locales/de/translation.json
  - src/locales/it/translation.json
  - src/locales/ja/translation.json
  - src/locales/pt/translation.json
  - src/locales/ru/translation.json
  - src/locales/zh-CN/translation.json
  - src/locales/zh-TW/translation.json
findings:
  blocker: 1
  high: 0
  medium: 2
  low: 2
  total: 5
verdict: BLOCKERS-FOUND
status: issues_found
---

# Pre-Tag Review: v1.7.20 cloud embeddings to corp backend

**Verdict:** BLOCKERS-FOUND (1 BLOCKER, 0 HIGH, 2 MEDIUM, 2 LOW)
**Depth:** thorough — full read of every changed source file + cross-file trace of the
seed seam, the dim-migration chain, the realtime-fallback transport, and the reindex probe.

## Summary

The security posture of the new cloud-embeddings feature is **clean**: the Bearer token
is never logged (header-only), `useSessionCookies:false` correctly prevents cookie-jar
leakage over the explicit Bearer, the backend URL is the already-sanitized
origin-only `backendUrlState` (no SSRF/path-injection beyond operator config),
`serverCapabilities` fails closed on **every** error path, and `cloudEmbeddings`
**throws** on every non-2xx with no silent local/OpenAI fallback. The always-seed seam
correctly shadows `./localEmbeddings` in `require.cache` before `vectorIndex` first
requires it, the gate-off path is a strict no-op (default-build parity preserved),
the realtime-fallback prepend is byte-identical-preserving, and all 10 locales carry
real (non-placeholder) translations. 37/37 new unit tests pass.

**However, there is one BLOCKER in the main.js dim-migration wiring** that is invisible
to the green unit tests (they call `runDimMigration` directly with a ready fake client)
but breaks the feature live. Under lockdown + caps-true, the migration that recreates the
Qdrant `notes`/`conversation_chunks` collections from 384-dim to the cloud 1024-dim
**never runs**, because its `isReady()` gate is evaluated synchronously before
`qdrantManager.start()` resolves. The collections stay at 384, every 1024-dim cloud
upsert/search silently throws a dimension mismatch (errors swallowed in `vectorIndex`),
and **semantic indexing is silently dead** for exactly the corporate build this release
ships for. This is the same "green tests, fails live" class as R19–R23.

---

## BLOCKER

### BL-01: Dim-migration chain no-ops at startup — `isReady()` evaluated synchronously before qdrant starts

**File:** `main.js:990-1001`

The migration block:

```js
if (qdrantManager.isAvailable()) {
  Promise.resolve(
    qdrantManager.isReady() &&
      require("./src/helpers/vectorIndex").ensureCollection()
  )
    .then(() => embeddingsBootstrap.runDimMigration(qdrantManager.getPort()))
    .catch((err) => { debugLogger.debug("Embedding dim migration error (non-fatal)", { error: err.message }); });
}
```

`qdrantManager.start()` was kicked off at line 968 and returns a **pending** promise;
`isReady()` returns `this.ready`, which `qdrantManager` sets to `true` only **after**
`_doStart()` awaits (process spawn + health check). At line 992 — the same synchronous
tick as the `start()` call — `this.ready` is still `false`. Therefore:

1. `qdrantManager.isReady() && ensureCollection()` short-circuits to `false`.
   `ensureCollection()` is **never called here**, and `Promise.resolve(false)` resolves
   on the next microtask.
2. `.then(() => runDimMigration(...))` fires **immediately**, long before qdrant is up.
3. Inside `runDimMigration` (lockdown + caps-true → `seeded === true`, so it proceeds),
   `ensureCloudCollections` calls `client.getCollection("notes")` against an
   **unstarted** qdrant → rejects → the `catch` tries `createCollection` → also rejects
   → throws → swallowed by the line-996 `.catch()` as "non-fatal".

Net effect: the documented invariant ("ensureCollection() resolves BEFORE
migrateCollectionDim runs, so the 384 collection exists to be detected and recreated at
1024") is **violated**. The 384-dim collection created by block A (lines 967-982, which
runs `ensureCollection()` later, after start resolves) is **never migrated to 1024**.

**Downstream blast radius (why this is BLOCKER, not MEDIUM):**
`vectorIndex.upsertNote` (vectorIndex.js:40) and `search` (line 63) **swallow** errors
with debug-log only. With the `notes` collection stuck at 384 and `cloudEmbeddings`
emitting 1024-dim Float32Arrays, **every upsert and every search silently throws a
dimension-mismatch and is discarded.** Semantic indexing — the entire feature this
release adds — is dead on the corporate build, with zero user-visible signal.

**Why the tests miss it:** `test/helpers/embeddingsBootstrap.test.js:248-263` calls
`bootstrap.runDimMigration(6333)` directly with a fully-ready fake client. It never
models the main.js `Promise.resolve(qdrantManager.isReady() && …)` ordering, so it is
green while the live wiring no-ops.

**Fix:** Chain the migration off the **resolution** of qdrant start + ensureCollection,
not a synchronously-evaluated `isReady()`. Fold it into block A's existing `.then`, e.g.:

```js
if (qdrantManager.isAvailable()) {
  qdrantManager
    .start()
    .then(async () => {
      if (!qdrantManager.isReady()) return;
      const vectorIndex = require("./src/helpers/vectorIndex");
      vectorIndex.init(qdrantManager.getPort());
      await vectorIndex.ensureCollection();          // 384 collection now exists
      await embeddingsBootstrap.runDimMigration(qdrantManager.getPort()); // → 1024
    })
    .catch((err) => debugLogger.debug("Qdrant/embedding setup error (non-fatal)", { error: err.message }));
}
```

Then delete the separate 990-1001 block. Add a test that drives the real ordering
(start() pending → resolves → ensureCollection resolves → runDimMigration sees the 384
collection and recreates at 1024). A unit test that injects a deferred `start()` and
asserts `getCollection` is called only after `start()` resolves would have caught this.

---

## MEDIUM

### MED-01: Reindex probe returns a self-hosted-backend error on default builds where the cause is a not-yet-downloaded local model

**File:** `src/helpers/ipcHandlers.js:1003-1011`

The new probe is **unconditional** (not gated by `PROVIDER_LOCKDOWN_ENABLED`):

```js
const localEmbeddings = require("./localEmbeddings");
if (typeof localEmbeddings.isAvailable === "function" &&
    localEmbeddings.isAvailable() === false) {
  return { success: false, error: "notes.embeddings.cloudUnavailable" };
}
```

On a **default (upstream-parity) build**, `localEmbeddings` is the real ONNX module and
`isAvailable()` returns `false` whenever the MiniLM model files simply haven't finished
downloading yet (first launch). In that case the probe returns the i18n key
`notes.embeddings.cloudUnavailable`, whose text is *"could not reach the self-hosted
embedding backend"* — **factually wrong**: there is no self-hosted backend on a default
build; the model is just still downloading. Upstream behavior was to proceed and index 0.

Currently not user-visible (see LOW-01 — no renderer caller), so MEDIUM not HIGH. But the
wiring is latent-wrong: the day a "Re-index" button is added, default-build users with a
still-downloading model get a misleading corp-flavored error.

**Fix:** Either (a) gate the probe behind `PROVIDER_LOCKDOWN_ENABLED`, or (b) branch the
returned key — local-model-missing → a "model still downloading" key, lockdown-stub →
`cloudUnavailable`. The cloud-vs-local distinction is available (under lockdown the seeded
facade reports `isAvailable()`; default build reports the real local module).

### MED-02: Dim-migration startup race also affects the cloud-success path's first writes even if BL-01 is fixed naively

**File:** `main.js:984-1001`, `src/helpers/embeddingsBootstrap.js:178-205`

Note for the BL-01 fix: `ensureCloudCollections` is the only place the 1024 dim is
enforced, and it runs exactly once at startup. If the BL-01 fix still allows any
note-write IPC (`_asyncVectorUpsert`, ipcHandlers.js:365, `setImmediate`) to fire between
`install()` (962) and the migration completing, that early upsert races a 384 collection
and is silently dropped. Ensure the fix sequences migration **before** the first user
write is possible, or accept that the very first write post-cold-start may be dropped
(re-embedded on next reindex). Document the chosen guarantee. This is a correctness note
to verify alongside the BL-01 fix, not an independent defect.

---

## LOW

### LOW-01: `semanticReindexAll` has a preload binding + type decl but no renderer caller — the new i18n key and probe are currently dead from the UI

**Files:** `preload.js:131`, `src/types/electron.ts:614`, all 10 `src/locales/*/translation.json`

`db-semantic-reindex-all` is registered in main and bound in preload, but no
`*.tsx`/`*.ts` renderer code invokes `electronAPI.semanticReindexAll()`. So the probe's
returned `error: "notes.embeddings.cloudUnavailable"` is never surfaced through `t()`,
and the new key added to all 10 locales is currently unused at runtime. Not a bug —
pre-wiring for a UI that doesn't exist yet — but worth a tracking note so the key isn't
flagged as orphaned by an i18n linter and so the missing "Re-index" UI is remembered.

### LOW-02: Preconfigured-branch debug log prints `gpt-4o-mini-transcribe` even under lockdown

**File:** `src/helpers/openaiRealtimeStreaming.js:145-147` (existing code, exercised by the
new `model: undefined` lockdown path)

Under lockdown, `meetingRecordingStore` passes `model: undefined`, which `connect()`
normalizes to `this.model = "gpt-4o-mini-transcribe"` (the `model || "…"` default). The
preconfigured branch never sends this on the wire (verified — no `session.update`), so
there is **no functional leak**. But the debug log `"…session created (preconfigured)",
{ model: this.model }` will print `gpt-4o-mini-transcribe` for a corp build that is
actually using a server-pinned model. Cosmetic/log-hygiene only; could confuse a corp
operator reading debug logs. Optionally log `model: this.model ?? "(server-pinned)"` or
omit model in the preconfigured branch.

---

## Verified clean (explicit — no nits invented)

- **Security / Bearer:** token never logged anywhere (cloudEmbeddings has no logging;
  serverCapabilities logs only `status` and `err.message`). Header-only usage.
- **`useSessionCookies:false`:** correctly spread last over `init` in both modules — no
  cookie-jar attachment over the explicit Bearer.
- **SSRF / URL:** `getBackendUrl()` returns `backendUrlState`'s sanitized `parsed.origin`
  (https/http only, 2048-cap, userinfo/path/query stripped). `${apiUrl}/api/embeddings`
  cannot inject a path. No bypass.
- **Fail-closed:** `serverCapabilities.getCapabilities` returns `{...FAIL_CLOSED}` on
  null token, no backend URL, `!res.ok`, network reject, and malformed JSON (the
  `await res.json()` lives inside the outer try). Never throws, never enables cloud on
  error.
- **No silent fallback:** `cloudEmbeddings._request` throws `EMBEDDINGS_UNAVAILABLE` on
  `!res.ok` (incl. 502/503), on non-array `data`, and on a missing vector — never returns
  empty, never reaches local onnx or public OpenAI.
- **Always-seed seam:** `require.resolve("./localEmbeddings")` from `embeddingsBootstrap`
  (same dir) matches the cache key that `vectorIndex.js:2` `require("./localEmbeddings")`
  resolves to. `install()` runs at main.js:962, strictly before vectorIndex (972) /
  localEmbeddings (1003) are first required, and before any lazy ipcHandlers require
  fires. Facade and stub both expose `LocalEmbeddings` for the `{ LocalEmbeddings }`
  destructure. Gate-off path returns early — cache untouched, caps never fetched
  (default-build byte-parity).
- **Throw-fast stub:** under lockdown + caps-false, the frozen stub shadows
  localEmbeddings so `onnxWorkerClient` is never required → the onnx worker never spawns;
  `embedText`/`embedTexts` reject `EMBEDDINGS_UNAVAILABLE` (absorbed by the search
  try/catch → FTS5); `isAvailable()` → false.
- **Realtime fallback prepend:** prepend-only; the non-lockdown
  `{ model: "gpt-4o-mini-transcribe", mode, language }` return is byte-identical.
  `model: undefined` is crash-safe (`model || "gpt-4o-mini-transcribe"`) and never hits
  the wire in the preconfigured branch (`options.mode !== "byok"` → true under lockdown's
  `mode:"openwhispr"`). No api.openai.com path — WSS host is the runtime-derived corp
  relay (`deriveRealtimeWssUrl`).
- **i18n:** `notes.embeddings.cloudUnavailable` present in all 10 locales (en/es/fr/de/it/
  ja/pt/ru/zh-CN/zh-TW) with genuine translations, no English placeholders.
- **DI test-seams:** `_resolveDeps`/`__createForTest`/`_setTestDeps`/`_isSeeded` are
  invoked only by tests or internally with no override (→ real production deps). No
  production call site passes an override; they do not alter production behavior.
- **Debug artifacts:** no `console.log`/`debugger`/`TODO`/`FIXME`/`HACK` in any new file.
  The earlier model-name literal was already scrubbed from the comment (commit c34c6279).

---

_Reviewed: 2026-06-05T10:26:40Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: thorough (release gate)_

---

## DISPOSITION (orchestrator, 2026-06-05, pre-tag)

- **BL-01 — FIXED** (commit 700cc576). Migration folded into the resolved
  `qdrantManager.start().then()` after `await ensureCollection()`; separate
  synchronous-`isReady()` block deleted. + regression test driving a DEFERRED
  `start()` asserting migration runs after ensureCollection, never short-circuited
  (`test/helpers/embeddingsBootstrap.test.js` "ordering ... (BL-01)").
- **MED-01 — FIXED** (commit 707df8a8). Reindex probe gated behind
  `PROVIDER_LOCKDOWN_ENABLED`; default build keeps upstream behavior. + test for
  the default-build-skip path + parity-guard for the gate ordering.
- **MED-02 — ACCEPTED / DOCUMENTED.** With BL-01 fixed, migration runs reliably
  after start+ensureCollection. The first `_asyncVectorUpsert` (setImmediate on
  note-create) *can* still fire before migration completes on a cold start where a
  stale 384 collection exists; that single early write hits the 384 collection and
  is dropped (caught by `.catch(()=>{})`), then re-embedded on the next upsert/
  reindex. ACCEPTED: vectors are derived data (notes live in sqlite), and the
  window is one cold-start write. Not worth a startup barrier on every note-write.
- **LOW-01 — TRACKING (intentional pre-wiring).** `semanticReindexAll` + the
  `cloudUnavailable` i18n key have no renderer caller yet; this is deliberate
  pre-wiring for a future "Re-index" UI. Key is real in all 10 locales; not orphaned
  by design. No action this release.
- **LOW-02 — WON'T FIX (upstream-immutable).** The cosmetic
  `model: gpt-4o-mini-transcribe` debug log is in `openaiRealtimeStreaming.js`
  (UPSTREAM, Gabriel Stein) — immutable per client_immutable. No wire leak (verified:
  preconfigured branch sends no session.update). Log-hygiene only; left as-is.

**Post-fix gate:** 212/212 vitest, tsc clean, 4 upstream embed files still
diff-clean. Verdict upgraded to TAG-SAFE pending the corp live-verify (run by Nick).
