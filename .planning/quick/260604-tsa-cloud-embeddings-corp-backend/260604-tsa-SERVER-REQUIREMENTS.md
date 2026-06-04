# SERVER-REQUIREMENTS — Cloud Embeddings + Rerank (corp self-hosted)

**Quick task:** 260604-tsa
**Status:** ✅ CONTRACT CONFIRMED with server peer iho3wkls 2026-06-04 (server takes impl RED-first, generic-naming). Wire shape below is FINAL.
**Owner of server impl:** server repo (READ-ONLY to this client repo). Do NOT edit server here.

## CONFIRMED CONTRACT (server peer agreed, server-side impl in flight)

- **POST `/api/embeddings`** (NOT `/v1` — server uses `/api/*` convention). Auth: Bearer
  (same dualAuthHook as `/api/reason`). Body `{ input: string|string[], model? }`. Response:
  OpenAI-shape forwarded as-is `{ object:"list", data:[{ object:"embedding", embedding:number[], index }], model, usage }`. `model?` defaults server-side to operator env `LITELLM_EMBEDDING_MODEL`. Vector dim **1024** (the in-perimeter embedding model is bge-m3-class).
- **POST `/api/rerank`** — server adds it (Cohere-shape `{results:[{index, relevance_score}]}`)
  but CLIENT DOES NOT INTEGRATE rerank in this task (search is cosine-only). Documented for future.
- **Capability gate (KEY):** `GET /api/capabilities` → `features.embeddings: boolean` (+ `features.rerank`).
  True iff server has LiteLLM AND the embedding-model env is set. Client reads this ONCE on cold start.
  - `features.embeddings === true` → vectorIndex uses CloudEmbeddings (`/api/embeddings`).
  - `features.embeddings === false` (operator didn't configure it) → vectorIndex stays `not-ready` →
    existing FTS5 keyword fallback (ipcHandlers.js:990) handles search. NO onnx, NO cloud, NO crash,
    NO silent OpenAI fallback. Honest degradation + a "semantic indexing unavailable on this server" log.
  - Cold-read only — operator enabling the model later requires a client restart (acceptable, like all announce features). Server does NOT push announce invalidation.
- **NAMING BAN:** never write the corp org/model namespace anywhere (code, commits, docs, planning,
  memory, peer msgs). Client never hardcodes a model name anyway (server picks via env) — generic is correct. See the corp-namespace-ban memory note.

## Why

In v1.7.19 the local embedding path crashes: `onnxWorker.js:392`
`port.postMessage(reply, transferList)` throws `"Port at index 0 is not a valid
port"` (Electron MessagePortMain). `onnxWorker.js` is **upstream-immutable**
(Gabriel Stein, upstream commit #693) — we cannot patch it. The corp backend
already serves embedding (**bge-m3**, dim **1024**) and rerank (**bge-m3-rerank**)
via LiteLLM. Owner decision: route embeddings to the server; **NO local-onnx
fallback** (explicit error if the server can't, never silent cloud/local
fallback). Cutting the local onnx path via a build-time gate legitimately
sidesteps the upstream crash.

## Proposed wire contract (OpenAI-compatible — drop-in if peer confirms)

The client keeps the wire shape in ONE adapter file so the real path/shape from
the peer is a one-file change.

### Embeddings — `POST {backendUrl}/v1/embeddings`  (PROPOSED; peer may say `/api/embeddings`)
- Auth: `Authorization: Bearer <token>` (same token builder as `/api/reason`).
- Request: `{ "input": string | string[], "model": "<EMBEDDING_MODEL alias>" }`
- Response (OpenAI): `{ "data": [ { "embedding": number[], "index": number } ], "model": string }`
- Vector dim: **1024** (bge-m3). Local MiniLM was 384 → qdrant collection must be
  recreated at 1024 on provider switch (client handles dim-mismatch → recreate).

### Rerank — `POST {backendUrl}/v1/rerank`  (PROPOSED; only if used — see note)
- Auth: Bearer.
- Request: `{ "query": string, "documents": string[], "model": "<RERANK_MODEL alias>", "top_n"?: number }`
- Response: `{ "results": [ { "index": number, "relevance_score": number } ] }`
- NOTE: current client semantic search (`vectorIndex.search`) does NOT rerank —
  it does cosine over qdrant. Rerank is a possible future enhancement; this task
  wires EMBEDDINGS (the crash path). Rerank contract is documented here for the
  server peer but client rerank integration is OUT OF SCOPE for 260604-tsa unless
  trivially additive.

## Open questions to peer (blocking the FINAL wire shape, not the client structure)
1. Path: `/v1/embeddings` (LiteLLM-passthrough) vs `/api/embeddings` (app route)?
2. Auth: Bearer same as `/api/reason`? Any extra header (end-user id)?
3. Model alias for bge-m3 / bge-m3-rerank — operator env (EMBEDDING_MODEL /
   RERANK_MODEL) or fixed? Does the client send `model` or does the server pick?
4. Confirm bge-m3 dim = 1024.
5. Already on prod 1.2.x, or server work needed?

## Client structure (this task — independent of final shape)
- `src/helpers/cloudEmbeddings.js` (fork-only): `embedText`/`embedTexts` via
  `net.fetch` to `backendUrlState.getBackendUrl()` + Bearer. Wire shape isolated
  in a single `_request`/adapter section.
- Provider selector in `vectorIndex.js`: under the build gate use CloudEmbeddings,
  never spawn onnx; else upstream local path unchanged (default = upstream parity).
- Dim-aware qdrant collection: detect existing dim ≠ provider dim → recreate.
- NO edits to `onnxWorker.js` / `onnxWorkerClient.js` / `localEmbeddings.js`.
