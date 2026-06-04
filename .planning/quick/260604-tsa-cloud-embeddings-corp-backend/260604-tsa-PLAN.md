---
phase: quick-260604-tsa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/helpers/cloudEmbeddings.js
  - src/helpers/serverCapabilities.js
  - src/helpers/embeddingsBootstrap.js
  - src/helpers/ipcHandlers.js
  - src/stores/meetingRecordingStore.ts
  - main.js
  - test/helpers/cloudEmbeddings.test.js
  - test/helpers/serverCapabilities.test.js
  - test/helpers/embeddingsBootstrap.test.js
  - test/helpers/ipcHandlers.reindex-unavailable.test.js
  - test/stores/meetingRecordingStore.realtime-fallback.test.ts
  - src/locales/en/translation.json
  - src/locales/es/translation.json
  - src/locales/fr/translation.json
  - src/locales/de/translation.json
  - src/locales/pt/translation.json
  - src/locales/it/translation.json
  - src/locales/ru/translation.json
  - src/locales/zh-CN/translation.json
  - src/locales/zh-TW/translation.json
  - src/locales/ja/translation.json
autonomous: true
requirements: [TSA-EMBED-01, TSA-DIM-02, TSA-PARITY-03, TSA-CAP-04, TSA-RT-05]
user_setup: []

must_haves:
  truths:
    - "Under a lockdown/self-hosted build, the client reads GET /api/capabilities ONCE on cold start (main process, Bearer, runtime backendUrl) and routes embeddings to the corp backend only when features.embeddings === true."
    - "Under lockdown, the onnx worker is NEVER required or spawned: embeddingsBootstrap ALWAYS replaces ./localEmbeddings in require.cache before vectorIndex first requires it — with the CloudEmbeddings facade when caps-true, or a throw-fast/FTS5-signal stub when caps-false. onnxWorkerClient is never required in either branch."
    - "When features.embeddings === true, note + conversation embeddings are produced by the corp backend (bge-m3, 1024-dim) via POST /api/embeddings; no onnx."
    - "When features.embeddings === false (or the capability fetch fails), the seeded throw-fast stub's embedText/embedTexts REJECT immediately with code EMBEDDINGS_UNAVAILABLE. That rejection is caught by the pre-existing ipcHandlers.js:990 try/catch → FTS5 keyword search, and by the embed-on-write .catch(()=>{}); a single 'semantic indexing unavailable on this server' log is emitted. No onnx, no crash, clean FTS5 degradation."
    - "The manual reindex path (db-semantic-reindex-all) does NOT misreport success under the stub: because upstream vectorIndex.reindexAll swallows per-batch embed failures (vectorIndex.js:77-87, debug-logs only), the fork-editable IPC handler PROBES localEmbeddings.isAvailable() BEFORE looping and returns { success:false, error: <EMBEDDINGS_UNAVAILABLE i18n key> } when unavailable — honest degradation, no false success, no no-op loop. Upstream vectorIndex.reindexAll invocation stays byte-identical."
    - "The seeded facade (cloud OR stub) is a DROP-IN for localEmbeddings: it also exposes isAvailable() and async downloadModel() so the unconditional main.js:974-979 sequence (isAvailable / downloadModel) never throws. Cloud isAvailable()→true + downloadModel()→no-op; stub isAvailable()→false + downloadModel()→no-op."
    - "The selection is two-level: gated by PROVIDER_LOCKDOWN_ENABLED (build flag) AND features.embeddings (runtime). CloudEmbeddings is seeded only when BOTH are true; the capability read fails CLOSED (any network/parse error → stub seeded, never cloud)."
    - "Default build (PROVIDER_LOCKDOWN_ENABLED off) NEVER consults /api/capabilities and NEVER touches require.cache — install() is a strict no-op and the local onnx embedding path is byte-identical to upstream. No upstream file edited."
    - "On first cloud-provider init (caps-true only), runDimMigration runs STRICTLY AFTER the upstream vectorIndex.ensureCollection() resolves (chained, not raced): if an existing qdrant 'notes'/'conversation_chunks' collection dim differs from the cloud provider dim (1024), the collection is recreated at 1024."
    - "In a lockdown build with an EMPTY streaming-providers catalog, the meeting realtime resolver does NOT yield a path that connects to api.openai.com and does NOT pass a hardcoded OpenAI model — it targets the self-hosted relay (mode openwhispr, server pins the model). The client must not CRASH on the absent-model descriptor (confirmed-safe against openaiRealtimeStreaming.js)."
  artifacts:
    - path: "src/helpers/serverCapabilities.js"
      provides: "Fork-only fail-closed capability fetcher: GET ${getBackendUrl()}/api/capabilities with Bearer (mirrors the /api/reason auth builder), returns { embeddings: boolean }, fails closed to { embeddings: false } on network or parse error"
      min_lines: 30
    - path: "src/helpers/cloudEmbeddings.js"
      provides: "Fork-only CloudEmbeddings DROP-IN for localEmbeddings (embedText, embedTexts, isAvailable→true, async downloadModel→no-op, static LocalEmbeddings.noteEmbedText, CLOUD_EMBEDDING_DIM=1024), wire shape isolated in one _request adapter targeting POST /api/embeddings"
      min_lines: 70
    - path: "src/helpers/embeddingsBootstrap.js"
      provides: "Two-level gate-aware require.cache shim: under PROVIDER_LOCKDOWN_ENABLED ALWAYS seeds ./localEmbeddings — CloudEmbeddings when features.embeddings true, a throw-fast/FTS5-signal stub (embedText/embedTexts reject EMBEDDINGS_UNAVAILABLE, isAvailable→false, downloadModel→no-op) otherwise — so onnx is never required; plus qdrant dim migration chained after ensureCollection (cloud branch only); no-op when build gate off"
      min_lines: 70
    - path: "src/helpers/ipcHandlers.js"
      provides: "Fork-only PREPEND in the db-semantic-reindex-all handler (~ipcHandlers.js:995-1005): probe localEmbeddings.isAvailable() before vectorIndex.reindexAll; return { success:false, error: EMBEDDINGS_UNAVAILABLE key } when unavailable (honest reindex UX), else proceed unchanged. Upstream vectorIndex.reindexAll invocation byte-identical."
      min_lines: 1
    - path: "src/stores/meetingRecordingStore.ts"
      provides: "Lockdown-aware empty-catalog realtime fallback that targets the self-hosted relay (no api.openai.com, no hardcoded OpenAI model) instead of provider:openai-realtime + gpt-4o-mini-transcribe"
      min_lines: 1
    - path: "test/helpers/serverCapabilities.test.js"
      provides: "vitest: returns embeddings true/false; network error and malformed JSON both fail closed (false), never throw uncaught"
      min_lines: 30
    - path: "test/helpers/cloudEmbeddings.test.js"
      provides: "vitest: correct /api/embeddings URL + Bearer + confirmed OpenAI response shape parse to Float32Array(1024); batch ordered by index; non-ok throws; isAvailable()→true; downloadModel() resolves as no-op"
      min_lines: 45
    - path: "test/helpers/embeddingsBootstrap.test.js"
      provides: "vitest: gate-on+caps-true seeds cloud facade (onnxWorkerClient never required) + dim-mismatch recreate chained after ensureCollection; gate-on+caps-false seeds throw-fast stub (embedText rejects EMBEDDINGS_UNAVAILABLE, simulated semantic-search falls back to FTS5 without throwing, onnxWorkerClient never required); gate-off no-op (capabilities never fetched, cache untouched, onnxWorkerClient never required); bootstrap sequence (isAvailable/downloadModel against seeded module) never throws"
      min_lines: 70
    - path: "test/helpers/ipcHandlers.reindex-unavailable.test.js"
      provides: "vitest: db-semantic-reindex-all under the stub (localEmbeddings.isAvailable()===false) returns { success:false, error: EMBEDDINGS_UNAVAILABLE key } WITHOUT invoking vectorIndex.reindexAll; under cloud/local (isAvailable()===true) proceeds to reindexAll normally and returns { success:true, indexed }"
      min_lines: 30
    - path: "test/stores/meetingRecordingStore.realtime-fallback.test.ts"
      provides: "vitest: lockdown + empty catalog → descriptor targets self-hosted relay (mode openwhispr, no hardcoded openai model, no crash on absent model); default build + empty catalog → upstream behavior preserved"
      min_lines: 30
  key_links:
    - from: "main.js (startApp async body, ~line 953 — immediately before the QdrantManager require at 954)"
      to: "src/helpers/embeddingsBootstrap.js"
      via: "fork-only `await embeddingsBootstrap.install();` placed AFTER the fork requires (~259-260) and BEFORE the vectorIndex/localEmbeddings requires (962/974), with a code comment pinning the ordering rationale"
      pattern: "embeddingsBootstrap"
    - from: "src/helpers/embeddingsBootstrap.js"
      to: "src/helpers/serverCapabilities.js"
      via: "under PROVIDER_LOCKDOWN_ENABLED, await getCapabilities().embeddings to decide CloudEmbeddings vs throw-fast stub (fail-closed → stub)"
      pattern: "serverCapabilities|getCapabilities"
    - from: "src/helpers/serverCapabilities.js"
      to: "GET /api/capabilities"
      via: "net.fetch with Authorization Bearer (tokenStore.get) against backendUrlState.getBackendUrl(), same auth builder as /api/reason"
      pattern: "api/capabilities"
    - from: "src/helpers/embeddingsBootstrap.js"
      to: "require.cache resolved ./localEmbeddings"
      via: "ALWAYS seed under lockdown (CloudEmbeddings when caps-true, throw-fast stub otherwise) so vectorIndex's own require('./localEmbeddings') transparently returns the replacement and onnx is never required"
      pattern: "require.cache"
    - from: "src/helpers/ipcHandlers.js (db-semantic-reindex-all handler ~995-1005)"
      to: "the seeded localEmbeddings facade (cloud or stub)"
      via: "fork-only PREPEND: probe `require('./localEmbeddings').isAvailable()` BEFORE vectorIndex.reindexAll; return { success:false, error: notes.embeddings.cloudUnavailable } when false; upstream reindexAll invocation byte-identical"
      pattern: "isAvailable\\(\\)"
    - from: "src/helpers/cloudEmbeddings.js"
      to: "backendUrlState.getBackendUrl + tokenStore.get"
      via: "Electron net.fetch POST /api/embeddings with Authorization Bearer, isolated in _request"
      pattern: "net.fetch"
    - from: "src/helpers/embeddingsBootstrap.js (runDimMigration)"
      to: "main.js qdrant follow-up"
      via: "fork-only `await embeddingsBootstrap.runDimMigration(qdrantManager.getPort())` chained STRICTLY AFTER vectorIndex.ensureCollection() resolves (cloud branch self-guards via `seeded`)"
      pattern: "runDimMigration"
    - from: "src/stores/meetingRecordingStore.ts (127-139)"
      to: "self-hosted realtime relay"
      via: "lockdown-gated empty-catalog fallback returns the openai-realtime transport (already repointed to the server WSS via streamingProviders.lockdown.js) with mode openwhispr and NO hardcoded OpenAI model, instead of model gpt-4o-mini-transcribe targeting api.openai.com"
      pattern: "PROVIDER_LOCKDOWN_ENABLED"
---

<objective>
Two confirmed-contract changes batched into 1.7.20:
(1) Route note + conversation-chunk text embeddings to the corporate self-hosted backend (bge-m3, 1024-dim, LiteLLM) under lockdown builds — gated by a two-level capability check — cutting the crashing local onnx text-embedding path WITHOUT editing any upstream file, AND honoring the owner requirement literally: under a lockdown corp build the onnx worker must NEVER spawn (it is the crash source we are escaping). When the server CAN embed → use it; when it CANNOT → clean FTS5 degradation with no onnx fallback, AND an HONEST reindex error (no false success).
(2) Fix the self-hosted MEETING realtime fallback so an empty streaming-providers catalog under lockdown does NOT take the api.openai.com path with a hardcoded OpenAI model.

Purpose: In v1.7.19 the local embedding path crashes at the upstream-immutable src/workers/onnxWorker.js:392 (port.postMessage throws "Port at index 0 is not a valid port"). Because the worker, onnxWorkerClient.js, localEmbeddings.js, vectorIndex.js, and main.js's init lines are ALL upstream-immutable (verified via git blame — see Blame Resolution), the only legitimate fix is to bypass the local path via a build gate, never to patch upstream. The corp backend serves embeddings, but only when the operator configured the model — so the client must consult GET /api/capabilities and fail closed to FTS5 keyword search when embeddings are unavailable, rather than spawn onnx or silently fall back to public cloud. KEY DESIGN (revised): vectorIndex.init() sets this.client unconditionally (vectorIndex.js:14-16) and isReady() === client !== null (line 204), so a "not-ready" seam is unachievable — vectorIndex is always ready once init runs. Instead, under lockdown we ALWAYS replace ./localEmbeddings in require.cache before vectorIndex requires it: with CloudEmbeddings (caps-true) or a throw-fast stub (caps-false). The stub's embedText rejects cleanly with EMBEDDINGS_UNAVAILABLE, caught by the pre-existing ipcHandlers.js:990 try/catch (→ FTS5) and the embed-on-write .catch(()=>{}). This guarantees onnx is NEVER required under lockdown, in BOTH branches. Separately, the dictation realtime path is already repointed to the server WSS under lockdown, but the MEETING empty-catalog fallback (meetingRecordingStore.ts:127-139) was missed and still hardcodes the OpenAI model / OpenAI-realtime default.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260604-tsa-cloud-embeddings-corp-backend/260604-tsa-SERVER-REQUIREMENTS.md
@CLAUDE.md

NOTE — SERVER-REQUIREMENTS supersession (read this before trusting that doc's client-structure section): SERVER-REQUIREMENTS.md:17 still carries the stale "vectorIndex stays not-ready" client-structure wording. That idea is SUPERSEDED by this PLAN's blame_resolution: the locked design is the ALWAYS-SEED throw-fast stub (vectorIndex.init sets this.client unconditionally, so "not-ready" is unachievable and would let onnx spawn-and-crash). Do NOT re-introduce a not-ready seam. The SERVER-REQUIREMENTS doc's wire contract (the /api/embeddings + /api/capabilities sections) remains authoritative; only its client-structure "not-ready" paragraph is obsolete. No edit to SERVER-REQUIREMENTS.md is required by this plan.

<interfaces>
Extracted from the codebase. Executor uses these directly — no exploration needed.

UPSTREAM-IMMUTABLE interface the replacement facades MUST match (from src/helpers/localEmbeddings.js — READ-ONLY, do NOT edit):
  module.exports = instance                 // singleton with instance methods
  module.exports.LocalEmbeddings = LocalEmbeddings   // class for the static helper
  isAvailable() -> boolean                  // SYNC (line 45). main.js:975 calls it unconditionally — facade MUST expose it.
  async downloadModel() -> Promise<void>    // line 88. main.js:976 calls it unconditionally — facade MUST expose it (no-op for both cloud + stub).
  async embedText(text) -> Float32Array
  async embedTexts(texts) -> Float32Array[]
  static noteEmbedText(title, content, enhancedContent)
      -> `${title}\n${enhancedContent || content}`.slice(0, 1500)   // PURE string concat, no onnx — safe to inline-copy

How upstream vectorIndex.js consumes it (READ-ONLY reference):
  const localEmbeddings = require("./localEmbeddings")      // line 2 — the cache key to seed
  const { LocalEmbeddings } = localEmbeddings               // line 3 — facade needs .LocalEmbeddings
  localEmbeddings.embedText(text)                           // lines 36, 57, 149
  localEmbeddings.embedTexts(texts)                         // lines 78, 117, 185
  LocalEmbeddings.noteEmbedText(...)                        // line 75
  init(port): this.client = new QdrantClient(...)           // lines 14-16 — UNCONDITIONAL; isReady() (line 204) === this.client !== null
  ensureCollection(): createCollection("notes", { vectors: { size: 384, distance: "Cosine" } })            // lines 24-26
  ensureConversationChunksCollection(): createCollection("conversation_chunks", { size: 384 })             // lines 98-100
  collection names: this.collectionName = "notes"; this.conversationChunksCollection = "conversation_chunks"
  reindexAll(notes, onProgress) (lines 69-90): loops batches of 50, and WRAPS each batch's embedTexts in its OWN try/catch that ONLY debugLogger.debug's on failure (lines 77-87). CRITICAL CONSEQUENCE: a seeded-stub rejection is SWALLOWED per-batch and NEVER propagates — the loop completes and the handler would falsely return success. This is WHY Task 4 probes isAvailable() in the handler BEFORE looping. reindexAll itself is UPSTREAM-IMMUTABLE — do NOT add a throw to it.
  NOTE: vectorIndex hardcodes size 384 and is always-ready once init runs. Under cloud (1024) the dim migration must recreate BOTH collections, chained AFTER ensureCollection. vectorIndex itself is immutable, so migration lives in embeddingsBootstrap.

How main.js consumes localEmbeddings (UPSTREAM, lines 974-979 — the bootstrap-sequence the seeded facade must survive WITHOUT throwing):
  const localEmbeddings = require("./src/helpers/localEmbeddings");   // 974 — returns the seeded facade under lockdown
  if (!localEmbeddings.isAvailable()) {                               // 975 — facade.isAvailable() must exist (sync boolean)
    localEmbeddings.downloadModel().catch((err) => { ... });          // 976 — facade.downloadModel() must exist (async, no-op)
  }
  → cloud facade: isAvailable()→true (so downloadModel is not even called); stub: isAvailable()→false → downloadModel()→no-op resolves.

How the throw-fast stub's rejection is absorbed (EXISTING for search + embed-on-write; HANDLER PROBE added for reindex):
  ipcHandlers.js:990 — semantic search wraps vectorIndex.search in try/catch and falls back to databaseManager.searchNotes (FTS5) on ANY error.  → silent FTS5 degradation, no change needed.
  embed-on-write (ipcHandlers ~366 / ~1125) — vectorIndex upsert calls are .catch(() => {}) fire-and-forget.  → no change needed.
  db-semantic-reindex-all (ipcHandlers.js:995-1006) — calls vectorIndex.reindexAll directly and returns { success:true, indexed:done }. Because reindexAll SWALLOWS the stub rejection per-batch (see vectorIndex note above), the rejection NEVER reaches this handler — it would falsely report success with indexed:0. Task 4 fixes this with an isAvailable() PROBE before the loop (handler is fork-editable IPC wiring).

FORK modules cloudEmbeddings.js / serverCapabilities.js may require directly (module-level, like ipcHandlers):
  const backendUrlState = require("./backendUrlState")   // getBackendUrl() -> runtime backend host (RC-1 path)
  const tokenStore = require("./tokenStore")             // module.exports = { get, set, clear }; tokenStore.get() -> bearer | null

Auth + fetch pattern to MIRROR (ipcHandlers.js /api/reason path — do NOT invent a new token path):
  const token = tokenStore.get()                          // ipcHandlers.js:3455
  if (token) headers.Authorization = `Bearer ${token}`    // ipcHandlers.js:3456
  net.fetch(url, { ...init, useSessionCookies: false })   // ipcHandlers.js:3468 (proxyFetch) — honors system proxy
  const apiUrl = backendUrlState.getBackendUrl()          // ipcHandlers.js:3387 getApiUrl()
  POST `${apiUrl}/api/reason` with { "Content-Type": "application/json", ...authHeader }   // ipcHandlers.js:5711-5716
  import: const { net } = require("electron")

CONFIRMED wire contract (SERVER-REQUIREMENTS.md, peer iho3wkls / server 1.2.2 — isolate in ONE _request adapter):
  POST `${backendUrl}/api/embeddings`
  headers: { "Content-Type": "application/json", Authorization: "Bearer <token>" }
  body:    { input: string | string[], model?: <omit → server defaults from operator env> }
  resp:    { object:"list", data:[{ object:"embedding", embedding:number[], index }], model, usage }   // OpenAI shape, parse data[].embedding sorted by index
  dim:     1024
  GET  `${backendUrl}/api/capabilities` -> { features: { embeddings: boolean, rerank: boolean } }   // Bearer; client reads features.embeddings ONCE on cold start

MEETING realtime (renderer, src/stores/meetingRecordingStore.ts) — current upstream empty-catalog fallback (CONFIRMED via git show upstream/main):
  if (!provider) { logger.debug("...catalog not loaded, falling back to OpenAI default"); return { provider: "openai-realtime", model: "gpt-4o-mini-transcribe", mode, language }; }
  Under lockdown the renderer's streamingProviders.js is vite-aliased to streamingProviders.lockdown.js, whose sole "openai-realtime" entry already drives window.electronAPI.dictationRealtimeStart → the MAIN-process realtime path, which derives the server WSS from backendUrlState (RC-2, deriveRealtimeWssUrl) and authenticates with the session bearer. The transport is therefore ALREADY self-hosted under lockdown; the bug is ONLY the hardcoded OpenAI model + the assumption of an OpenAI default. Server force-pins/strips the model regardless (peer confirmed) — so even model:undefined is safe on the wire. The remaining risk is a CLIENT crash on an absent model field; Task 3 requires confirming + asserting openaiRealtimeStreaming.js's behavior on options.model === undefined.
  Renderer lockdown flag import: `import { PROVIDER_LOCKDOWN_ENABLED } from "../config/defaults";` (already used in src/stores/settingsStore.ts).
</interfaces>

<gate_and_dim_constants>
- Build gate: read PROVIDER_LOCKDOWN_ENABLED from ../config/build-config.generated.cjs in main-process code (main.js requires the .cjs build; the .ts is source). In renderer (meetingRecordingStore.ts) import from ../config/defaults. Confirm the resolved value at runtime.
- Runtime gate: features.embeddings from GET /api/capabilities (serverCapabilities.getCapabilities), fail-closed to false.
- Cloud dim constant: CLOUD_EMBEDDING_DIM = 1024. Define in cloudEmbeddings.js and re-export so the bootstrap dim-migration reads ONE source of truth.
- Embeddings model alias: OMIT `model` in the request body by default (server defaults from operator env per the confirmed contract); keep the field overridable inside the _request adapter.
- Throw-fast stub error code: EMBEDDINGS_UNAVAILABLE (set as err.code on the rejected Error) so tests can assert it precisely.
- Reindex error i18n key: notes.embeddings.cloudUnavailable (used by the Task 4 reindex-handler probe; must exist in all 10 locales).
</gate_and_dim_constants>
</context>

<blame_resolution>
RESOLVED UP FRONT (the single most important design decision — facts gathered before writing tasks).

Upstream-immutable (do NOT edit a single line):
- src/helpers/vectorIndex.js — UPSTREAM (Gabriel Stein, present in upstream/main). MUST NOT add a provider branch inside it; that is a client_immutable violation. NOTE the verified facts: init(port) sets this.client unconditionally (vectorIndex.js:14-16); isReady() === `this.client !== null` (line 204); ensureCollection() creates "notes"/"conversation_chunks" at hardcoded 384 (lines 24-26, 98-100); reindexAll (lines 69-90) wraps each batch's embedTexts in its own try/catch and ONLY debug-logs failures — so a stub rejection is SWALLOWED and never propagates (this drives the Task 4 probe-before-loop fix, NOT a throw inside reindexAll). main.js:962-963 calls init() whenever qdrantManager.isReady(). These are immutable — the design works WITH them, not against them.
- src/helpers/localEmbeddings.js — UPSTREAM. Read-only interface reference. Full shape (lines 45/88): isAvailable() → boolean (sync), async downloadModel() → resolves. The replacement facade MUST mirror these (see Drop-in note).
- src/workers/onnxWorker.js — UPSTREAM (the :392 crash). Cannot patch.
- src/helpers/onnxWorkerClient.js — UPSTREAM.
- main.js lines 954-979 (qdrant / vectorIndex.init / ensureCollection / localEmbeddings require + isAvailable + downloadModel) — UPSTREAM-verbatim. MUST NOT edit those lines. Critically: 974-976 unconditionally call localEmbeddings.isAvailable() and localEmbeddings.downloadModel() on whatever module is resolved — so any seeded facade MUST expose both methods or startup throws a TypeError (Blocker 1 fix).

Fork-mutable surfaces (in bounds):
- main.js line ~953 (inside `async function startApp()`, immediately BEFORE the QdrantManager require at 954) — the fork-only `await embeddingsBootstrap.install();` insertion anchor. CONFIRMED async body (startApp is `async function`, line 733). The require of embeddingsBootstrap itself may go in the top fork block adjacent to 259-260, but the AWAIT must be here so capabilities are fetched and the cache is seeded BEFORE main.js:962/974 first require vectorIndex/localEmbeddings. An await placed AFTER 962 silently no-ops the seam (vectorIndex would already have required the real onnx-backed localEmbeddings). The dim-migration follow-up goes AFTER the qdrant .then() block.
- main.js lines ~259-260 (BuildConfig + backendUrlState requires) — FORK additions, absent in upstream. Top fork-mutable seam; OK to add `const embeddingsBootstrap = require("./src/helpers/embeddingsBootstrap");` here.
- src/helpers/ipcHandlers.js — FORK-MUTABLE (it is the IPC wiring layer; ipcHandlers is NOT upstream-verbatim — it carries fork edits already, e.g. the /api/reason auth path and RC-* changes). The db-semantic-reindex-all handler body (~995-1006) is fork-editable. Task 4's edit is a PREPEND (isAvailable() probe + early return) above the existing `await vectorIndex.reindexAll(...)`; the reindexAll invocation itself stays byte-identical. BLAME CHECK the executor MUST run before editing: `git blame -L995,1006 src/helpers/ipcHandlers.js` and `git show upstream/main:src/helpers/ipcHandlers.js | sed -n '990,1010p'` — if ANY line in the handler is upstream-verbatim, ONLY add the fork-only pre-check guard ABOVE the upstream call; do NOT modify the upstream call line itself. The probe + early-return is purely additive.
- src/stores/meetingRecordingStore.ts:127-139 — CONFIRMED upstream-EXISTING block, with ONE fork delta. `git show upstream/main:src/stores/meetingRecordingStore.ts` shows the empty-catalog fallback `return { provider: "openai-realtime", model: "gpt-4o-mini-transcribe", mode }` is upstream-VERBATIM; fork commit 081493a2 (Nikolai, 260526-ix4) only ADDED the `language` field. Therefore the in-bounds edit is NARROW: a NEW lockdown-gated branch that runs BEFORE the upstream `return` so upstream non-lockdown behavior stays byte-identical.

Why NOT the vite stub-alias for embeddings: src/vite.config.mjs's alias mechanism is RENDERER-only. cloudEmbeddings/vectorIndex run in the MAIN process (CJS, no vite). A vite alias cannot redirect a main-process require. Ruled out. (The streamingProviders.lockdown.js alias IS renderer-side and ALREADY repoints openai-realtime to the server WSS — the meeting fix relies on that existing alias.)

THE SEAM (locked, zero upstream edits — REVISED to always-seed): a fork-only embeddingsBootstrap.js, required once from main.js's fork block and `install()`-awaited at ~line 953 (BEFORE vectorIndex/localEmbeddings are first required at 962/974). When PROVIDER_LOCKDOWN_ENABLED is true, install() ALWAYS resolves the absolute path of ./localEmbeddings and seeds require.cache[<that path>].exports with a replacement facade:
  - features.embeddings === true → CloudEmbeddings facade (real /api/embeddings, isAvailable→true, downloadModel→no-op).
  - features.embeddings === false OR capability fetch failed → a THROW-FAST / FTS5-SIGNAL stub facade (embedText/embedTexts reject EMBEDDINGS_UNAVAILABLE, isAvailable→false, downloadModel→no-op).
Then upstream vectorIndex.js's own `require("./localEmbeddings")` returns the cached replacement; onnxWorkerClient is NEVER required (it is only pulled in by the real localEmbeddings.js, which is now shadowed). When the build gate is OFF, install() is a strict no-op: the cache is untouched, real localEmbeddings + onnx path is byte-identical to upstream, and capabilities are never fetched. Zero bytes of any upstream file change.

WHY ALWAYS-SEED (the Blocker 2 resolution): the owner requirement is literal — "сервер умеет → на него; НЕ умеет → ошибка, БЕЗ onnx-фолбэка". A "let vectorIndex stay not-ready" design is impossible (init sets client unconditionally) AND would let the real onnx worker spawn-and-crash on first embed (caught downstream, but it DID spawn). Always-seeding the stub on caps-false replaces localEmbeddings before vectorIndex ever requires it, so onnx never spawns — honoring the requirement literally. The stub's clean rejection is absorbed by the EXISTING ipcHandlers.js:990 try/catch (→ FTS5) and the embed-on-write .catch(()=>{}). For the manual reindex (which routes through reindexAll's swallowing try/catch), the handler PROBES isAvailable() before looping (Task 4) so the unavailability is surfaced HONESTLY instead of as a false-success no-op loop.

GATE CHOICE (locked, with rationale): the embedding gate is TWO-LEVEL:
(a) PROVIDER_LOCKDOWN_ENABLED (build flag, src/config/build-config.generated.*) decides "are we a corp build that should consult the server at all". REUSED, not a new flag (corp builds already set it; main-process modules run from source, not the DCE bundle, so a new flag would not be bundle-greppable and would buy nothing). Off → install() never fetches caps.
(b) features.embeddings from GET /api/capabilities (runtime, cold-read once) decides "can THIS server actually embed" → CloudEmbeddings vs throw-fast stub.
The capability read fails CLOSED (network/parse error → stub seeded → FTS5, never cloud, never onnx). Cold-read only — operator enabling the model later requires a client restart (acceptable; server does not push announce invalidation). Parity is enforced by the no-op-when-build-gate-off shim (asserted in embeddingsBootstrap.test.js), not by bundle DCE — so NO new verify-*.js script is required.
</blame_resolution>

<scope_boundaries>
- IN scope: TEXT embeddings (note + conversation_chunk) under lockdown — the crash path, consumed by upstream vectorIndex.js via localEmbeddings.embedText/embedTexts. The capability gate that decides CloudEmbeddings vs throw-fast stub. The honest reindex-unavailable probe in the db-semantic-reindex-all handler. The meeting realtime empty-catalog lockdown fallback.
- OUT of scope: diarization speaker embeddings. src/helpers/speakerEmbeddings.js calls onnxWorkerClient.request("speaker.load"/"speaker.embed") DIRECTLY with its OWN speaker-diarization model — independent of vectorIndex/localEmbeddings, not the crash path, and NOT shadowed by the localEmbeddings cache seed (it requires onnxWorkerClient directly). Do NOT touch speakerEmbeddings. (The "onnxWorkerClient never required" assertions in tests are scoped to the embedding bootstrap flow, not the whole app.)
- OUT of scope: rerank (/api/rerank). Current vectorIndex.search does cosine over qdrant, no rerank step. Documented in SERVER-REQUIREMENTS.md for future.
- OUT of scope: the DICTATION realtime path — already repointed to the server WSS under lockdown. Only the MEETING empty-catalog fallback was missed.
- CONTRACT IS NOW CONFIRMED (SERVER-REQUIREMENTS.md, server peer iho3wkls, server 1.2.2): POST /api/embeddings (NOT /v1), Bearer (same dualAuthHook as /api/reason), body { input, model? }, OpenAI response shape, dim 1024 (bge-m3-class), server defaults model from operator env, and the server force-pins/strips the realtime transcription model regardless of what the client sends. Build to this confirmed shape, still isolated in ONE _request adapter so any late tweak is one-function.
</scope_boundaries>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: serverCapabilities (fail-closed) + CloudEmbeddings DROP-IN provider (fork) + tests</name>
  <files>src/helpers/serverCapabilities.js, src/helpers/cloudEmbeddings.js, test/helpers/serverCapabilities.test.js, test/helpers/cloudEmbeddings.test.js</files>
  <behavior>
    serverCapabilities.getCapabilities():
    - GETs `${backendUrlState.getBackendUrl()}/api/capabilities` with Authorization "Bearer <tokenStore.get()>", parses { features: { embeddings, rerank } } and returns the features object (at minimum { embeddings: boolean }).
    - On a non-ok response, a network/fetch rejection, or malformed/unparseable JSON, returns a fail-closed { embeddings: false } (NEVER throws an uncaught error). Emits one debug log on failure.
    - When tokenStore.get() returns null, returns fail-closed { embeddings: false } (does not send unauthenticated).

    cloudEmbeddings (DROP-IN for localEmbeddings — full shape parity):
    - embedText("hi") POSTs to `${getBackendUrl()}/api/embeddings` with Authorization "Bearer <token>" + Content-Type application/json, body { input: "hi" } (model omitted → server default), parses resp.data[0].embedding into Float32Array(1024), returns it.
    - embedTexts(["a","b"]) sends body { input: ["a","b"] } and returns Float32Array[] ordered by resp.data[].index (sort by index; do NOT assume server preserves order).
    - On a non-ok response (e.g. 500) embedText THROWS an explicit Error naming the embedding service + status. NO fallback to local onnx, NO fallback to public cloud.
    - When tokenStore.get() returns null, throws an explicit "not authenticated for embeddings" error.
    - isAvailable() → true (SYNC; cloud is always "available" once selected — no local model file needed). This is REQUIRED because main.js:975 calls it unconditionally on the seeded module.
    - async downloadModel() → resolves immediately as a no-op (cloud needs no local model). REQUIRED because main.js:976 may call it.
    - noteEmbedText is exposed and module shape mirrors localEmbeddings: module.exports = instance; module.exports.LocalEmbeddings exposes static noteEmbedText, so vectorIndex's const { LocalEmbeddings } = require(...) keeps working.
    - Bootstrap-sequence safety: simulating the main.js:974-979 calls (isAvailable() then downloadModel()) against the cloud module must NOT throw and downloadModel() must resolve.
  </behavior>
  <action>
    FIRST run `git show upstream/main:src/helpers/localEmbeddings.js` and `git log -1 -L1,118:src/helpers/localEmbeddings.js` to CONFIRM localEmbeddings is upstream-immutable; treat it as a read-only interface reference. Note its isAvailable() (line 45, sync boolean) and downloadModel() (line 88, async) signatures — the cloud facade MUST mirror both. Do NOT edit it, onnxWorker.js, onnxWorkerClient.js, or vectorIndex.js.

    Create src/helpers/serverCapabilities.js as plain CJS. Require electron (net), ./backendUrlState, ./tokenStore, ./debugLogger. Export async getCapabilities() that GETs /api/capabilities with the Bearer header built EXACTLY as ipcHandlers.js:3455-3456, using net.fetch(url, { useSessionCookies: false }). Wrap the whole fetch+parse in try/catch and return { embeddings: false } on ANY failure (fail-closed) plus a single debug log "capabilities: embeddings unavailable on this server". Optionally memoize the cold-read result (the caller reads once), but keep getCapabilities idempotent.

    Create src/helpers/cloudEmbeddings.js as plain CJS, mirroring localEmbeddings.js structure as a FULL DROP-IN. Require electron (net), ./backendUrlState, ./tokenStore, ./debugLogger. For noteEmbedText: inline the identical 1-line concat from localEmbeddings.js (with a comment citing the upstream source) rather than requiring localEmbeddings — keeps ZERO coupling to the onnx module. Isolate ALL wire-shape details (path /api/embeddings, request body field names, response parse data[].embedding/index) in ONE private _request(input) function. Export CLOUD_EMBEDDING_DIM = 1024. Export an instance with embedText/embedTexts AND isAvailable() (returns true, sync) AND async downloadModel() (no-op resolve), and module.exports.LocalEmbeddings exposing static noteEmbedText. Use net.fetch(url, { useSessionCookies: false, ... }) per the ipcHandlers proxyFetch pattern. Build the Bearer header from tokenStore.get() exactly as ipcHandlers.js:3455-3456.

    Write test/helpers/serverCapabilities.test.js (vitest, node env): vi.mock("electron") to stub net.fetch; stub backendUrlState + tokenStore. Assert: ok+{features:{embeddings:true}} → { embeddings: true }; non-ok → { embeddings: false }; net.fetch rejects → { embeddings: false } (no throw); malformed JSON → { embeddings: false }; null token → { embeddings: false }.

    Write test/helpers/cloudEmbeddings.test.js (vitest, node env). Mock ONLY the HTTP boundary. Assert: correct /api/embeddings URL, Bearer header, request body shape (input present, model omitted by default), Float32Array(1024) parse, batch ordering by index, non-ok throws (not returns), null-token throws. ALSO assert the drop-in shape: isAvailable() === true (sync) and downloadModel() resolves (no throw, no network call), simulating the main.js:974-979 bootstrap sequence.
  </action>
  <verify>
    <automated>npx vitest run test/helpers/serverCapabilities.test.js test/helpers/cloudEmbeddings.test.js</automated>
  </verify>
  <done>serverCapabilities.getCapabilities returns features.embeddings and fails CLOSED (false, never throws) on every error path; cloudEmbeddings.js is a full drop-in for localEmbeddings (embedText/embedTexts/isAvailable→true/downloadModel→no-op/LocalEmbeddings.noteEmbedText + CLOUD_EMBEDDING_DIM=1024) targeting /api/embeddings; wire shape isolated in _request; non-ok and null-token both throw explicitly; the main.js:974-979 bootstrap sequence against the cloud module never throws; tests green; no edits to any upstream file.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: embeddingsBootstrap always-seed gate shim (cloud OR throw-fast stub) + dim migration chained after ensureCollection + async-safe main.js wiring + tests</name>
  <files>src/helpers/embeddingsBootstrap.js, main.js, test/helpers/embeddingsBootstrap.test.js</files>
  <behavior>
    - Build gate FALSE (default build): install() is a strict no-op — does NOT fetch capabilities, does NOT touch require.cache, does NOT require cloudEmbeddings, does NOT require onnxWorkerClient. (Assert: capabilities never fetched, no forced localEmbeddings entry, onnxWorkerClient never required.)
    - Build gate TRUE + features.embeddings TRUE: install() resolves the absolute path of ./localEmbeddings (require.resolve) and seeds require.cache[that path].exports with the cloudEmbeddings facade BEFORE vectorIndex first requires it, so a subsequent require("./localEmbeddings") returns the cloud facade. onnxWorkerClient is NEVER required as a result of embedding (the real localEmbeddings.js is shadowed). seeded=true so runDimMigration runs.
    - Build gate TRUE + features.embeddings FALSE (or capability fetch failed): install() ALSO seeds require.cache[localEmbeddings].exports — but with a THROW-FAST stub facade, NOT cloud. The stub's embedText/embedTexts REJECT immediately with `Object.assign(new Error("semantic indexing unavailable on this server"), { code: "EMBEDDINGS_UNAVAILABLE" })`; isAvailable() → false; async downloadModel() → no-op resolve; LocalEmbeddings.noteEmbedText inlined identically. onnxWorkerClient is NEVER required (real localEmbeddings shadowed). Emits ONE "semantic indexing unavailable on this server" log. seeded=false (no dim migration — cloud not selected). A subsequent require("./localEmbeddings") returns the stub; a simulated semantic search that calls stub.embedText catches the rejection and falls back to FTS5 (databaseManager.searchNotes) without throwing.
    - migrateCollectionDim(client, name, targetDim): GET the existing collection; if it exists and its vector size !== targetDim, delete + recreate at targetDim (Cosine); if absent, do nothing. ensureCloudCollections(client) applies this to both "notes" and "conversation_chunks", ending both at 1024. Data-loss-on-migration is ACCEPTABLE — vectors are derived data (notes live in sqlite), they re-embed on next upsert/reindex. Dim migration runs ONLY when the cloud facade was actually seeded (seeded === true), and STRICTLY AFTER the upstream vectorIndex.ensureCollection() has resolved (the main.js wiring chains it, not races it).
  </behavior>
  <action>
    FIRST confirm immutability: `git show upstream/main:main.js | sed -n '950,980p'` and `git show upstream/main:src/helpers/vectorIndex.js` — both upstream, do NOT edit their lines. Confirm main.js:259-260 are FORK additions: `git show upstream/main:main.js | grep -n "backendUrlState"` should return nothing. Confirm vectorIndex.init sets client unconditionally and ensureCollection hardcodes 384 (read lines 14-26, 204) — this is WHY the design is always-seed, not not-ready.

    Create src/helpers/embeddingsBootstrap.js (CJS). Export async install(), migrateCollectionDim(client, name, targetDim), ensureCloudCollections(client), runDimMigration(port). Add a module-level flag `seeded=false` set true only when the CLOUD facade is seeded (not for the stub), so runDimMigration is a no-op unless cloud was selected. Add an idempotency guard so install() is safe to call twice.
    - Internal _makeStub(): returns a frozen object literal matching the localEmbeddings shape: async embedText(){ throw Object.assign(new Error("semantic indexing unavailable on this server"), { code: "EMBEDDINGS_UNAVAILABLE" }); }, async embedTexts(){ same reject }, isAvailable(){ return false; }, async downloadModel(){ /* no-op */ }, and a LocalEmbeddings property exposing static noteEmbedText (inline the identical 1-line concat). The stub never requires cloudEmbeddings or onnxWorkerClient.
    - _seedCache(moduleExports): const p = require.resolve("./localEmbeddings"); require.cache[p] = { id: p, filename: p, loaded: true, exports: moduleExports };
    - install() (async): read PROVIDER_LOCKDOWN_ENABLED from ../config/build-config.generated.cjs. If false, return immediately (no-op — capabilities NOT fetched, cache untouched). If true: `const caps = await require("./serverCapabilities").getCapabilities();` if `caps.embeddings === true`: `const cloud = require("./cloudEmbeddings"); _seedCache(cloud); seeded = true;` log "embeddings: routing to cloud provider (lockdown + capabilities)". Else (false OR fetch failed → caps fail-closed false): `_seedCache(_makeStub()); seeded = false;` log "embeddings: semantic indexing unavailable on this server (capabilities) — FTS5 only, onnx disabled". In BOTH lockdown branches the cache is seeded BEFORE vectorIndex requires localEmbeddings, so onnxWorkerClient is never pulled in. install() must complete (await caps) BEFORE main.js first requires vectorIndex — see wiring note (a).
    - migrateCollectionDim: try getCollection; read existing size at config.params.vectors.size; if size !== targetDim, deleteCollection then createCollection(name, { vectors: { size: targetDim, distance: "Cosine" } }) and log data-loss-on-migration; swallow not-found gracefully.
    - ensureCloudCollections(client): for "notes" and "conversation_chunks", create-if-absent at CLOUD_EMBEDDING_DIM (import from cloudEmbeddings), then migrateCollectionDim to enforce 1024 over any stale 384.
    - runDimMigration(port): if !seeded, return (cloud not selected — stub or no-op). Else build a client `new (require("@qdrant/js-client-rest").QdrantClient)({ host: "127.0.0.1", port })` and await ensureCloudCollections.

    Wire main.js with the MINIMUM fork-only edits, leaving every upstream-verbatim line byte-identical:
    (a) AWAIT INSERTION ANCHOR (PINNED): add `const embeddingsBootstrap = require("./src/helpers/embeddingsBootstrap");` in the top fork require block (adjacent to lines 259-260). Then inside `async function startApp()` (line 733), insert `await embeddingsBootstrap.install();` as a NEW fork-only statement at ~line 953 — immediately BEFORE the existing `const QdrantManager = require("./src/helpers/qdrantManager");` at line 954 (i.e. after the diarization auto-download block that ends at 952, before the qdrant/vectorIndex/localEmbeddings block at 954-979). This guarantees install() (and its capability fetch + cache seed) completes BEFORE vectorIndex is required at 962 and localEmbeddings at 974. Add a code comment immediately above it: `// FORK (260604-tsa): seed ./localEmbeddings in require.cache (cloud facade or throw-fast stub) BEFORE vectorIndex/localEmbeddings are first required below (962/974). MUST stay above line 954; an await after 962 would no-op the seam and let onnx spawn.` Do NOT move or edit lines 954-979.
    (b) DIM-MIGRATION ORDERING (PINNED, chained not raced): do NOT rewrite the upstream qdrant .then() body. The upstream block is `qdrantManager.start().then(() => { if (isReady()) { vectorIndex.init(...); vectorIndex.ensureCollection().catch(...); } }).catch(...)`. ensureCollection (which creates collections at 384) is fired-and-.catch'd at 964 — it is NOT awaited upstream, so a sibling statement could race it. To guarantee runDimMigration runs STRICTLY AFTER ensureCollection resolves, add a NEW fork-only follow-up statement AFTER the upstream qdrant block (after line 972) that chains on qdrant readiness AND on the collection setup: e.g. `qdrantManager.start?.()` is already kicked off above — instead, append a fork-only `.then()` continuation that calls `await vectorIndex.ensureCollection()` is NOT possible without touching upstream; so chain via a fresh promise: after the upstream block, add `// FORK (260604-tsa): dim migration MUST run AFTER ensureCollection (which hardcodes 384) resolves — chain it, do not race the upstream .catch.` then `if (qdrantManager.isAvailable()) { Promise.resolve(qdrantManager.isReady() && require("./src/helpers/vectorIndex").ensureCollection()).then(() => embeddingsBootstrap.runDimMigration(qdrantManager.getPort())).catch((err) => debugLogger.debug("dim migration error (non-fatal)", { error: err.message })); }`. runDimMigration self-guards via `seeded` (no-op unless cloud seeded), so it is safe to call unconditionally. The key invariant the executor MUST satisfy and assert in a comment: ensureCollection() resolves before migrateCollectionDim runs (so the 384 collection exists to be detected and recreated at 1024, never the reverse). If the executor finds a cleaner chaining that still guarantees this ordering without editing upstream lines, that is acceptable — the ordering assertion is the requirement.

    Write test/helpers/embeddingsBootstrap.test.js (vitest). Reset require.cache between tests so seeds don't leak.
    (1) Build-gate-off no-op: stub build-config false, call install(), assert serverCapabilities.getCapabilities was NOT called, no forced localEmbeddings cache entry, onnxWorkerClient not required.
    (2) Gate-on + caps embeddings:true: stub build-config true and serverCapabilities to {embeddings:true}, call install(), then require("./localEmbeddings") === the cloudEmbeddings facade; assert onnxWorkerClient was NOT required.
    (3) Gate-on + caps embeddings:false: stub {embeddings:false}, call install(), assert require("./localEmbeddings") is the THROW-FAST STUB (not cloud, not real): its embedText() rejects with err.code === "EMBEDDINGS_UNAVAILABLE", isAvailable() === false, downloadModel() resolves; assert onnxWorkerClient was NEVER required; assert the "unavailable" log fired; AND simulate the ipcHandlers:990 path — a function that `try { await stub.embedText("q") } catch { return databaseManager.searchNotes("q") }` returns the FTS5 result without throwing.
    (4) Caps-true (also): assert seeded===true so runDimMigration is active; caps-false: assert seeded===false so runDimMigration is a no-op.
    (5) migrateCollectionDim: fake QdrantClient — size 384 → assert delete+create(1024); size 1024 → no recreate; not-found → no throw.
    (6) Ordering: a test that ensureCloudCollections only recreates AFTER getCollection (the create-if-absent + migrate sequence) — assert migrateCollectionDim is not invoked before the collection lookup resolves.
    Mock only the qdrant client + build-config + serverCapabilities + (a spy on) onnxWorkerClient require boundaries.
  </action>
  <verify>
    <automated>npx vitest run test/helpers/embeddingsBootstrap.test.js</automated>
    <automated>for f in src/helpers/vectorIndex.js src/workers/onnxWorker.js src/helpers/onnxWorkerClient.js src/helpers/localEmbeddings.js; do diff <(git show upstream/main:$f) <(git show HEAD:$f) >/dev/null && echo "UNCHANGED $f" || { echo "CHANGED $f"; exit 1; }; done</automated>
  </verify>
  <done>Always-seed two-level gate: build-gate-off install() is a verified no-op (capabilities never fetched, cache untouched, onnxWorkerClient never required); gate-on+caps-true seeds the cloud facade and vectorIndex embeds via the corp backend without spawning onnx; gate-on+caps-false seeds the throw-fast stub (embedText rejects EMBEDDINGS_UNAVAILABLE → caught → FTS5, isAvailable false, onnxWorkerClient never required, no crash); onnxWorkerClient is never required under lockdown in EITHER branch; dim migration recreates 384 collections at 1024 ONLY when cloud was seeded AND STRICTLY AFTER ensureCollection resolves; the four upstream embed files are unchanged from upstream/main; the main.js await is inserted at ~line 953 (before 954) with the pinned ordering comment, and the dim-migration follow-up is chained after ensureCollection; tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Lockdown-aware meeting realtime fallback (no api.openai.com, no crash on absent model) + tests</name>
  <files>src/stores/meetingRecordingStore.ts, test/stores/meetingRecordingStore.realtime-fallback.test.ts</files>
  <behavior>
    - Lockdown build (PROVIDER_LOCKDOWN_ENABLED true) + EMPTY catalog (no provider resolved): getMeetingTranscriptionOptions returns a self-hosted realtime descriptor — provider stays "openai-realtime" (the transport already repointed to the server WSS via streamingProviders.lockdown.js), mode "openwhispr" (NOT byok), and NO hardcoded OpenAI model so the main-process realtime path lets the server pin input_audio_transcription.model. It must NOT yield model "gpt-4o-mini-transcribe" and must NOT take the api.openai.com path, and the client must NOT crash on the absent-model descriptor.
    - Default build (PROVIDER_LOCKDOWN_ENABLED false) + empty catalog: behavior is UNCHANGED — the upstream return { provider: "openai-realtime", model: "gpt-4o-mini-transcribe", mode, language } is preserved byte-for-byte.
    - Non-empty catalog (either build): unchanged — provider/model resolved from the catalog as today.
  </behavior>
  <action>
    FIRST git-blame-confirm the block: `git blame -L127,145 src/stores/meetingRecordingStore.ts` and `git show upstream/main:src/stores/meetingRecordingStore.ts | sed -n '127,146p'`. CONFIRM (already established in Blame Resolution) that the empty-catalog `return { provider: "openai-realtime", model: "gpt-4o-mini-transcribe", mode }` is upstream-VERBATIM and the only fork delta is the added `language` field. You MUST NOT alter the upstream non-lockdown return — only PREPEND a new lockdown-gated branch above it. This change is PREPEND-ONLY: do not modify or reorder any existing line in this function.

    SECOND, confirm the absent-model contract BEFORE writing the descriptor. Read src/helpers/openaiRealtimeStreaming.js (main process) and determine EXACTLY what it does when options.model is undefined: does it send `session.input_audio_transcription = { model: undefined }`, OMIT the input_audio_transcription block entirely, or default the model locally? Record the confirmed behavior in a comment in the test file. The peer-confirmed wire fact is the SERVER force-pins/strips the realtime transcription model regardless of what the client sends — so even `{ model: undefined }` is safe on the wire. The CLIENT-side requirement is that openaiRealtimeStreaming.js must not CRASH on undefined (e.g. accessing options.model.length). If the confirmation shows it would crash on undefined, pass `model: ""` (empty string) instead of undefined, or omit the key — choose whichever the confirmed code handles cleanly without leaking an OpenAI model name. The KEY assertion is: no hardcoded OpenAI model name leaks AND the path stays self-hosted AND the client does not crash.

    Add `import { PROVIDER_LOCKDOWN_ENABLED } from "../config/defaults";` (the same import src/stores/settingsStore.ts uses). Inside the `if (!provider) { ... }` empty-catalog block, BEFORE the existing upstream `return`, add a lockdown branch: when `PROVIDER_LOCKDOWN_ENABLED` is true, log a debug "lockdown: empty catalog, using self-hosted realtime relay (server pins model)" and return the self-hosted descriptor `{ provider: "openai-realtime" as const, model: <undefined-or-"" per the confirmed-safe choice above>, mode: "openwhispr" as const, language }`. Leave the existing upstream `return` as the default-build branch, byte-identical. Do NOT touch any other line in this function.

    This file is a renderer-side zustand store. A pure descriptor change needs no new user-facing string; prefer logger.debug (no i18n). If you add any "realtime unavailable" user-facing message (only if strictly necessary), it must use i18n in all 10 locales.

    Write test/stores/meetingRecordingStore.realtime-fallback.test.ts (vitest). Mock ../config/defaults so PROVIDER_LOCKDOWN_ENABLED is toggleable per test; stub useStreamingProvidersStore.getState().providers = [] (empty catalog) and the settings/resolved selectors so useLocalWhisper is false and no provider resolves. Assert: (a) lockdown true + empty catalog → descriptor has mode "openwhispr" and NO model === "gpt-4o-mini-transcribe" (model is undefined or empty per the confirmed-safe choice), and the descriptor shape matches what openaiRealtimeStreaming.js accepts without crashing (document the confirmed behavior in a comment); (b) lockdown false + empty catalog → descriptor === the upstream default { provider:"openai-realtime", model:"gpt-4o-mini-transcribe", mode, language }. If getMeetingTranscriptionOptions is not exported, export it (additive) or test via the smallest public entry that exercises it; prefer exporting the pure helper.
  </action>
  <verify>
    <automated>npx vitest run test/stores/meetingRecordingStore.realtime-fallback.test.ts</automated>
    <automated>diff <(git show upstream/main:src/stores/meetingRecordingStore.ts | sed -n '139p') <(node -e "const s=require('fs').readFileSync('src/stores/meetingRecordingStore.ts','utf8'); process.stdout.write(s.split(String.fromCharCode(10)).filter(l=>l.includes('gpt-4o-mini-transcribe')).join(String.fromCharCode(10)))") && echo "UPSTREAM_DEFAULT_RETURN_PRESERVED"</automated>
  </verify>
  <done>Lockdown + empty catalog yields a self-hosted realtime descriptor (mode openwhispr, no hardcoded OpenAI model, no api.openai.com path); the absent-model handling of openaiRealtimeStreaming.js was confirmed and the descriptor is shaped so the client does not crash; the upstream default-build return is preserved byte-identical (the gpt-4o-mini-transcribe line still exists for the non-lockdown branch); tests green; change confined to the fork-authored fallback block (lockdown branch prepended), no other line touched.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Honest reindex-unavailable probe (fork IPC handler) + explicit-error i18n (10 locales) + tsc + full-suite + parity gates</name>
  <files>src/helpers/ipcHandlers.js, test/helpers/ipcHandlers.reindex-unavailable.test.js, src/locales/en/translation.json, src/locales/es/translation.json, src/locales/fr/translation.json, src/locales/de/translation.json, src/locales/pt/translation.json, src/locales/it/translation.json, src/locales/ru/translation.json, src/locales/zh-CN/translation.json, src/locales/zh-TW/translation.json, src/locales/ja/translation.json</files>
  <behavior>
    - db-semantic-reindex-all under the throw-fast stub (localEmbeddings.isAvailable() === false): the handler returns { success: false, error: "notes.embeddings.cloudUnavailable" } WITHOUT invoking vectorIndex.reindexAll (no no-op loop, no false success). This is necessary because vectorIndex.reindexAll (vectorIndex.js:77-87, UPSTREAM-IMMUTABLE) swallows per-batch embed failures and only debug-logs them — so the stub rejection never propagates and the handler would otherwise return { success:true, indexed:0 } (false success). The probe BEFORE the loop makes the EMBEDDINGS_UNAVAILABLE state honest and reachable.
    - db-semantic-reindex-all under CloudEmbeddings OR the real local module (localEmbeddings.isAvailable() === true): proceeds to vectorIndex.reindexAll exactly as today and returns { success: true, indexed: done }. No behavior change for the available path.
    - The error string returned is the stable i18n key notes.embeddings.cloudUnavailable; the renderer resolves it via t() at the call site (or, if the renderer already maps an error code, follow that existing pattern). No new IPC, no new build flag.
  </behavior>
  <action>
    PART A — Honest reindex probe (the reachability fix).

    BLAME CHECK FIRST (mandatory before editing ipcHandlers.js): run `git blame -L995,1006 src/helpers/ipcHandlers.js` and `git show upstream/main:src/helpers/ipcHandlers.js | sed -n '990,1010p'`. The db-semantic-reindex-all handler (currently ~ipcHandlers.js:995-1006) is fork-editable IPC wiring (ipcHandlers carries fork edits already — /api/reason auth, RC-* host changes). CONFIRM the handler is fork-authored or at least that the lines you add are a pure PREPEND above the existing `await vectorIndex.reindexAll(...)` call. If ANY line of the handler is upstream-verbatim, ONLY add the fork-only pre-check guard ABOVE the upstream reindexAll invocation — do NOT modify the reindexAll call line itself. The reindexAll invocation must stay byte-identical.

    WHY this probe (do not skip): vectorIndex.reindexAll (vectorIndex.js:69-90) wraps each batch's embedTexts in its OWN try/catch and only debugLogger.debug's failures (lines 77-87) — UPSTREAM-IMMUTABLE, do NOT add a throw there. Consequently the seeded-stub's EMBEDDINGS_UNAVAILABLE rejection is swallowed per-batch and NEVER propagates; the loop completes and the handler returns { success:true, indexed:0 } — false success, unreachable error string, misreported UX. The fix is to PROBE availability before looping.

    EDIT the db-semantic-reindex-all handler: BEFORE the `await vectorIndex.reindexAll(...)` call (and after the existing `if (!vectorIndex.isReady()) return { success:false, error:"Vector index not ready" };` guard), add a fork-only probe. Access the SAME localEmbeddings module the handler/vectorIndex use — `const localEmbeddings = require("./localEmbeddings");` (this resolves to the seeded facade under lockdown: cloud → isAvailable()===true, stub → isAvailable()===false; default build → real local module → true when the model exists). If `typeof localEmbeddings.isAvailable === "function" && localEmbeddings.isAvailable() === false`, immediately `return { success: false, error: "notes.embeddings.cloudUnavailable" };` (do NOT run reindexAll). Otherwise fall through to the existing `await vectorIndex.reindexAll(...)` path unchanged. Add a code comment: `// FORK (260604-tsa): probe embedding availability BEFORE reindexAll — upstream reindexAll swallows per-batch embed failures (vectorIndex.js:77-87), so under the throw-fast stub it would falsely return success. Honest early-return instead. Does NOT edit upstream vectorIndex.reindexAll.` Keep the probe defensive (guard `typeof ... === "function"`) so the real local module without isAvailable surprises is handled — though localEmbeddings DOES expose isAvailable (upstream line 45), so the function always exists; the guard is belt-and-suspenders.

    PART B — i18n string (the renderer-facing surface).

    Add one i18n key notes.embeddings.cloudUnavailable = "Embedding service unavailable — could not reach the self-hosted embedding backend. Re-indexing was not completed." to ALL 10 locale files: en, es, fr, de, pt, it, ru, zh-CN, zh-TW, ja. Translate properly per locale (do NOT translate brand/technical terms). Place the key in a feature-appropriate group consistent with existing structure (inspect en/translation.json for the notes/semantic grouping). The other failure surfaces need NO i18n: embed-on-write paths (upsertNote, upsertConversationChunks) are fire-and-forget .catch(()=>{}) in the main process; semantic search already silently falls back to FTS5 at ipcHandlers.js:990-992. The ONLY user-visible failure surface is this manual reindex.

    Wire the string minimally: the reindex result is shown by the renderer caller of db-semantic-reindex-all. Inspect that renderer component; it receives { success, error } — have it resolve the returned stable key (notes.embeddings.cloudUnavailable) via t() at the call site. If the renderer already maps an error code/string, follow that existing pattern. Do NOT add a new IPC just for i18n, and do NOT add a new build flag.

    PART C — Tests.

    Write test/helpers/ipcHandlers.reindex-unavailable.test.js (vitest). Stub the localEmbeddings module (or the require boundary the handler uses) and vectorIndex (isReady()→true, a spy reindexAll). Register/invoke the db-semantic-reindex-all handler (use the same handler-registration harness other ipcHandlers tests use; if none, invoke the handler function directly by capturing the ipcMain.handle callback). Assert:
    (1) localEmbeddings.isAvailable() === false → handler resolves { success:false, error:"notes.embeddings.cloudUnavailable" } AND the reindexAll spy was NEVER called.
    (2) localEmbeddings.isAvailable() === true → handler proceeds: reindexAll spy IS called, and the handler resolves { success:true, indexed:<n> }.
    (3) (optional) isReady()===false short-circuits with the pre-existing "Vector index not ready" before the availability probe (ordering: readiness guard first, then availability probe) — preserve existing behavior.

    PART D — Full suite + typecheck + parity proof:
    - `npx vitest run` (whole suite green, including all new test files from Tasks 1-4).
    - `npx tsc --noEmit` (clean — cloudEmbeddings.js/serverCapabilities.js/embeddingsBootstrap.js are CJS; the ipcHandlers.js + meetingRecordingStore.ts edits must not introduce TS errors; ensure no new TS errors leak from any .ts touched).
    - All 10 locale files parse and contain the new key.
  </action>
  <verify>
    <automated>npx vitest run test/helpers/ipcHandlers.reindex-unavailable.test.js</automated>
    <automated>npx vitest run</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>for l in en es fr de pt it ru zh-CN zh-TW ja; do node -e "const j=JSON.parse(require('fs').readFileSync('src/locales/$l/translation.json','utf8')); if(!JSON.stringify(j).includes('cloudUnavailable')){console.error('MISSING KEY '+'$l');process.exit(1);}" || { echo "BAD/MISSING $l"; exit 1; }; done && echo ALL_LOCALES_VALID_WITH_KEY</automated>
  </verify>
  <done>db-semantic-reindex-all PROBES localEmbeddings.isAvailable() before vectorIndex.reindexAll: under the stub (isAvailable false) it returns { success:false, error:"notes.embeddings.cloudUnavailable" } WITHOUT invoking reindexAll (no false success, error string now REACHABLE); under cloud/local (isAvailable true) it proceeds to reindexAll and returns { success:true, indexed }; the upstream vectorIndex.reindexAll invocation is byte-identical (probe is a pure prepend, BLAME-checked); the i18n key exists + is translated in all 10 locales (each valid JSON, key present); the renderer resolves it via t(); full vitest suite green; tsc --noEmit clean; the four upstream embed files + meetingRecordingStore upstream default-return remain unchanged.</done>
</task>

</tasks>

<verification>
- vitest: serverCapabilities returns features.embeddings and fails CLOSED (false) on non-ok / network / parse / null-token — never throws.
- vitest: cloudEmbeddings posts to /api/embeddings with Bearer, parses the confirmed response shape into Float32Array(1024), batches ordered by index, THROWS on non-ok (no silent fallback), AND is a drop-in (isAvailable()→true, downloadModel()→no-op) so the main.js:974-979 bootstrap sequence never throws.
- vitest: always-seed two-level gate — build-gate-off → capabilities never fetched, cache untouched, onnxWorkerClient never required; gate-on + caps-true → require("./localEmbeddings") returns the cloud facade, onnx never required, seeded=true; gate-on + caps-false → require("./localEmbeddings") returns the throw-fast stub (embedText rejects EMBEDDINGS_UNAVAILABLE → simulated search falls back to FTS5 without throwing), onnxWorkerClient never required, seeded=false, "unavailable" log fired.
- vitest: dim-mismatch (384 != 1024) recreates the qdrant collection at 1024 (only when cloud seeded); matching dim does not recreate; missing collection does not throw; recreation happens after the collection lookup (ordering).
- vitest: db-semantic-reindex-all PROBE — under the stub (localEmbeddings.isAvailable()===false) the handler returns { success:false, error:"notes.embeddings.cloudUnavailable" } WITHOUT calling reindexAll; under available (true) it calls reindexAll and returns { success:true, indexed }. (Closes the dead-wired-error-surfacing warning: reindexAll swallows per-batch failures, so the probe is what makes the error reachable + the UX honest.)
- main.js: `await embeddingsBootstrap.install()` is inserted at ~line 953 (before the QdrantManager require at 954, after the diarization block ending 952) with the pinned ordering comment; the dim-migration follow-up is chained STRICTLY AFTER ensureCollection resolves.
- vitest: meeting fallback — lockdown + empty catalog → self-hosted relay descriptor (mode openwhispr, no hardcoded OpenAI model, client does not crash on absent model — openaiRealtimeStreaming.js behavior confirmed); default build + empty catalog → upstream descriptor byte-identical.
- parity: the four upstream embed files (vectorIndex.js, onnxWorker.js, onnxWorkerClient.js, localEmbeddings.js) diff-clean against upstream/main; the ipcHandlers.js reindex edit is a pure prepend with the upstream reindexAll invocation byte-identical (BLAME-checked); the meetingRecordingStore.ts upstream default-return (gpt-4o-mini-transcribe line) preserved; gate-off install() is a proven no-op.
- tsc --noEmit clean; full vitest suite green; all 10 locale JSON files valid with the new notes.embeddings.cloudUnavailable key.
</verification>

<success_criteria>
- Under PROVIDER_LOCKDOWN_ENABLED AND features.embeddings=true, note + conversation embeddings come from the corp backend (bge-m3, 1024-dim) via /api/embeddings and onnx is never spawned — the upstream :392 crash is bypassed by cutting the local path, not by patching upstream.
- Under PROVIDER_LOCKDOWN_ENABLED AND features.embeddings=false (or capability fetch failure), the throw-fast stub shadows localEmbeddings so onnx is NEVER required/spawned; embedText rejects cleanly → caught by ipcHandlers:990 → FTS5 keyword search: no onnx, no cloud, no silent OpenAI fallback, no crash, one honest log. (Honors the owner requirement literally: server can't → error, no onnx fallback.)
- The manual reindex path is HONEST under unavailability: db-semantic-reindex-all probes isAvailable() before looping and returns { success:false, error:"notes.embeddings.cloudUnavailable" } instead of a false-success no-op loop (reindexAll's per-batch swallowing made the naive path misreport success). Error is surfaced via the i18n key for the one user-facing reindex surface; never a silent local or public-cloud fallback.
- Stale 384-dim qdrant collections are migrated to 1024 on cloud init (only when cloud seeded, strictly after ensureCollection resolves).
- In a lockdown build with an empty streaming-providers catalog, the meeting realtime resolver targets the self-hosted relay (mode openwhispr, server-pinned model), never api.openai.com, and does not crash on the absent-model descriptor.
- Default build (build gate off) is byte-identical to upstream on both the embedding path and the meeting non-lockdown realtime default; no upstream file edited; main.js changes are fork-only lines adjacent to existing fork code; the ipcHandlers.js reindex change is a pure fork-only prepend (upstream reindexAll call byte-identical); the meetingRecordingStore.ts change is a prepended lockdown branch only.
- Wire shape isolated in one _request adapter; the confirmed contract (/api/embeddings, /api/capabilities) is one-function to retune if the server tweaks anything.
</success_criteria>

<output>
After completion, create .planning/quick/260604-tsa-cloud-embeddings-corp-backend/260604-tsa-SUMMARY.md recording: the always-seed seam (require.cache shim from main.js fork block — cloud facade when caps-true, throw-fast stub when caps-false, so onnx never spawns under lockdown), the drop-in shape (isAvailable/downloadModel parity that keeps main.js:974-979 safe), the two-level gate (PROVIDER_LOCKDOWN_ENABLED build flag + features.embeddings runtime, fail-closed), the confirmed wire shape (/api/embeddings, /api/capabilities, dim 1024), the dim-migration data-loss note + the after-ensureCollection ordering, the pinned main.js await anchor (~line 953), the honest reindex probe (isAvailable() before reindexAll, since upstream reindexAll swallows per-batch failures — the dead-wired-error fix), the meeting realtime lockdown-fallback fix (no api.openai.com / no hardcoded OpenAI model / confirmed no-crash on absent model), the SERVER-REQUIREMENTS supersession note (always-seed stub replaces the obsolete not-ready idea), and confirmation that the four upstream embed files plus the meetingRecordingStore upstream default-return are unchanged.
</output>
