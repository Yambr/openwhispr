# Backend Wire Spec

This document is the wire-level contract between the OpenWhispr Electron client and the **OpenWhispr cloud backend** that ships in the upstream Yambr fork. It is reverse-engineered strictly from the client source tree — no live HTTP traces were captured. Reading the source is the contract; if a deployed cloud diverges, that is a separate bug, not part of this spec.

## Scope

| Surface | Treatment |
|---|---|
| OpenWhispr cloud (`${OPENWHISPR_API_URL}/api/...`) | **Detailed.** Every endpoint the current client calls, with method, URL, auth header, request body, response body, error semantics, and source pointers. |
| `auth.openwhispr.com` (Better Auth identity provider) | **Sketched here, detailed in [`OAUTH_SPEC.md`](./OAUTH_SPEC.md).** This doc only documents the desktop OAuth shim endpoint and the protocol redirect; the rest of the flow lives in `OAUTH_SPEC.md`. |
| Third-party AI APIs (OpenAI / Anthropic / Gemini / Mistral / Groq / AssemblyAI / Deepgram) | **Inventory only.** One row per call site (file:line, base URL, vendor docs link). No payload schemas. |
| Enterprise BYOK providers (AWS Bedrock / Azure OpenAI / GCP Vertex) | **Inventory only.** Same treatment as third-party. |
| Google Calendar OAuth + API calls | **Cross-link only.** Documented in [`OAUTH_SPEC.md`](./OAUTH_SPEC.md). |

## How to read this doc

1. Start at [Conventions](#conventions) for the base URL, auth header format, and source-pointer convention.
2. Read [Global Error Envelope](#global-error-envelope) once — every cloud endpoint inherits it unless its card says otherwise.
3. Each endpoint card under [OpenWhispr Cloud Endpoints](#openwhispr-cloud-endpoints) is self-contained: method/URL/auth + request JSON + response JSON + client-side notes.
4. The [Third-Party API Inventory](#third-party-api-inventory) table tells you what is intentionally **out** of this spec — implement those by reading vendor docs, not this file.
5. For end-to-end self-hosting guidance and the auth contract narrative, see [`SELF_HOSTING.md`](./SELF_HOSTING.md).

---

## Conventions

| Item | Value |
|---|---|
| Base URL | `${OPENWHISPR_API_URL}` — resolved at build time from `VITE_OPENWHISPR_API_URL` (renderer) and at runtime from `OPENWHISPR_API_URL` / `VITE_OPENWHISPR_API_URL` env vars or `src/dist/runtime-env.json` (main process). Defined in `src/config/constants.ts:116` and resolved in `src/helpers/ipcHandlers.js:3326-3330`. Empty string disables all cloud calls (`if (!OPENWHISPR_API_URL)` guards in `src/lib/auth.ts:109`, `src/components/AuthenticationStep.tsx:154`, `src/components/EmailVerificationStep.tsx:29`). |
| Transport | HTTPS only. The client always builds URLs as `${OPENWHISPR_API_URL}/api/<path>` and never strips/replaces the scheme. |
| Content-Type | `application/json; charset=utf-8` for POST/PUT/DELETE bodies. **Exceptions** noted per-endpoint: `/api/transcribe` is `multipart/form-data`; `/api/agent/stream` returns `application/x-ndjson` (newline-delimited JSON). |
| Auth header — preferred | `Authorization: Bearer <token>` where the token is a Better Auth bearer token persisted to `userData/auth-token.bin` via `src/helpers/tokenStore.js`. |
| Auth header — fallback | `Cookie: <name>=<value>; ...` populated from the Electron `session.cookies` jar scoped to `${OPENWHISPR_API_URL}` and `${AUTH_URL}`. Used during the brief window before the startup token-migration bridge has run, and as a safety net for older sessions where cookies are not URL-scoped (`src/helpers/ipcHandlers.js:3338-3402`). The renderer's direct `fetch()` calls in `src/lib/auth.ts:114` use `credentials: "include"` to attach this same cookie. |
| Source-pointer convention | Every endpoint card cites two pointers per call site: `<path>:<line>` for the `fetch()`/`proxyFetch()` site **and** the IPC handler where applicable. Pointers are relative to repo root and reflect HEAD as of this spec's authoring. Use `git grep` against the path to detect drift. The renderer's two pre-auth calls (`/api/check-user`, `/api/auth/verification-status`) and the renderer-only `DELETE /api/auth/delete-account` mark IPC as `renderer-direct` because they do not flow through the main process. |
| `proxyFetch()` | Thin wrapper over Electron's `net.fetch()` (`src/helpers/ipcHandlers.js:3406`) with `useSessionCookies: false`. It honors the system proxy and gives main-process auth/cloud handlers a single fetch chokepoint. |

### Token persistence

| File | Behavior |
|---|---|
| `src/helpers/tokenStore.js:7-54` | The bearer token is stored at `app.getPath("userData") + "/auth-token.bin"`, encrypted with Electron `safeStorage` if available; falls back to plaintext on Linux without a keyring. The cached value is used by `getAuthHeader()` in `src/helpers/ipcHandlers.js:3392-3402`. |
| `ipcMain.handle("auth-get-token")` `src/helpers/ipcHandlers.js:3301` | Renderer reads the token via `window.electronAPI.authGetToken()`; consumed by Better Auth in `src/lib/auth.ts:11`. |
| `ipcMain.handle("auth-set-token")` `src/helpers/ipcHandlers.js:3302` | Better Auth sees a `set-auth-token` response header, writes it back through this IPC channel (`src/lib/auth.ts:14-17`). |

---

## Global Error Envelope

All OpenWhispr cloud endpoints SHOULD respond with a JSON object containing an `error` key when the HTTP status code is non-2xx. The client tolerates malformed/empty bodies and falls back to a status-derived message; servers are not required to populate every field.

**Canonical error body**

```json
{
  "error": "Human-readable error message (string). The client surfaces this verbatim when present."
}
```

The client only ever reads `data.error` (or, for `cloud-api-request`, `data.error.message` if `error` is itself an object — see `src/helpers/ipcHandlers.js:5998`). Other keys are ignored.

**Status codes the client treats specially**

| Status | Client behavior | Where |
|---|---|---|
| `200`-`299` | Treat as success. Parse JSON; if parse fails, treat as success with empty body. | All endpoints |
| `400` | On `/api/auth/verification-status`: stop polling, surface `auth.sessionExpired`. Otherwise: surface `error` from body. | `src/components/EmailVerificationStep.tsx:43` |
| `401` | Treat as auth-expired. Cloud handlers return `{ success: false, error: "Session expired", code: "AUTH_EXPIRED" }`; renderer wraps via `withSessionRefresh()` (`src/lib/auth.ts:142-169`) which retries up to 6 times with exponential backoff (500 ms → ...) **only** if the failure occurred within 60 s of last sign-in (`GRACE_PERIOD_MS`); otherwise rethrows as `AUTH_EXPIRED`. The renderer also stops polling `/api/auth/verification-status` on 401. | `src/lib/auth.ts:142-169`, `src/helpers/ipcHandlers.js:5608, 5673, 5757, 5812, 5879, 5919, 5951, 5988, 6025, 6055, 6202` |
| `403` | No special handling — surfaced as generic API error via `error` body. | — |
| `404` | No special handling — surfaced as generic API error. | — |
| `429` | No special handling on OpenWhispr cloud endpoints (server's responsibility — client adapts via existing backoff in `withSessionRefresh()`). The BYOK transcribe path does treat 429 as "Rate limit exceeded" (`src/helpers/ipcHandlers.js:6166`). | — |
| `503` | Treat as transient server error. Returns `{ success: false, error: "Request timed out" \| "Service temporarily unavailable", code: "SERVER_ERROR" }`. The renderer does not auto-retry on this code; the user re-issues the action. | `src/helpers/ipcHandlers.js:5611, 5675, 5760, 5815, 5847, 5882, 5922, 5954, 5991, 6028, 6205` |
| Other 5xx | Surfaced as `API error: <status>` if the body has no `error`. | — |
| Network failure | Classified by `src/helpers/networkErrors.ts` (`classifyAndLog`) into codes such as `NETWORK_ERROR`, `OFFLINE`, etc., and surfaced with a `messageKey` for i18n (`src/helpers/ipcHandlers.js:3515-3523`). | — |

A small number of endpoints carry **per-endpoint deviations** (e.g., `/api/transcribe` exposes the limit-reached payload at HTTP 200 with `limitReached: true` rather than via a 4xx). These are noted inline in each card's "Error deviations" line.

---

## OpenWhispr Cloud Endpoints

### `POST /api/check-user`

**Purpose:** Pre-auth probe used by the onboarding sign-in screen to decide whether to put the user on the sign-in or sign-up branch (existing email vs. new email).

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/check-user` | none (pre-auth) | `src/components/AuthenticationStep.tsx:159` | `renderer-direct` |

**Request body**

```json
{ "email": "user@example.com" }
```

**Response body (success)**

```json
{ "exists": true }
```

The client only reads `data.exists` (`src/components/AuthenticationStep.tsx:170`); any other field is ignored.

**Error deviations:** Uses global error envelope. Any non-2xx response causes the client to optimistically route the user to the sign-up branch (`src/components/AuthenticationStep.tsx:171-173`).

**Notes:** Called once per onboarding email-entry submit. Has no rate limit on the client side. If `OPENWHISPR_API_URL` is unset, the client skips the check entirely and routes to sign-up (`src/components/AuthenticationStep.tsx:154-156`).

---

### `GET /api/auth/verification-status`

**Purpose:** Polled by the email-verification onboarding step to detect when the user has clicked the verification link in their email.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `GET` | `${OPENWHISPR_API_URL}/api/auth/verification-status?email=<urlencoded>` | session cookie via `credentials: "include"` | `src/components/EmailVerificationStep.tsx:31, 35` | `renderer-direct` |

**Request body**

`GET` — no body. Email is passed as the `email` query parameter.

**Response body (success)**

```json
{ "verified": true }
```

The client only reads `data.verified`. When it flips to `true`, the client clears its polling timer and advances the onboarding flow after a 1.2 s display delay.

**Error deviations:** On HTTP 401 or 400 the client stops polling and surfaces `auth.sessionExpired` (`src/components/EmailVerificationStep.tsx:43-46`). Network errors are silently swallowed and retried on the next interval.

**Notes:** Polled every 5000 ms via `setInterval` (`src/components/EmailVerificationStep.tsx:50`) for as long as the verification step is mounted and `verified` is false. Polling stops on success, on 4xx auth failure, and on unmount.

---

### `DELETE /api/auth/delete-account`

**Purpose:** Permanently deletes the signed-in user's account from the cloud backend.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `DELETE` | `${OPENWHISPR_API_URL}/api/auth/delete-account` | session cookie via `credentials: "include"` | `src/lib/auth.ts:114` | `renderer-direct` |

**Request body**

`DELETE` — no body.

**Response body (success)**

```json
{}
```

The client ignores the success body. It only checks `res.ok`.

**Error deviations:** On non-2xx, the client tries to read `data.error` from the JSON body and surfaces it; otherwise falls back to `"Failed to delete account"` (`src/lib/auth.ts:120-122`).

**Notes:** Renderer-direct (no IPC bridge). Relies entirely on the cookie jar — does not attach the bearer token.

---

### `POST /api/transcribe`

**Purpose:** Cloud Whisper transcription. Accepts a single audio chunk as multipart and returns transcribed text plus usage metadata.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/transcribe` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:3464` (live transcribe), `src/helpers/ipcHandlers.js:3570` (retry path), `src/helpers/ipcHandlers.js:6113` (file upload), `src/helpers/ipcHandlers.js:211` (audioManager small-file path) | `ipcMain.handle("cloud-transcribe")` `src/helpers/ipcHandlers.js:3408`; `ipcMain.handle("transcribe-audio-file-cloud")` `src/helpers/ipcHandlers.js:6069` |

**Request (multipart/form-data)**

The client builds the body via `buildMultipartBody()` with these fields:

```json
{
  "file": "<binary audio>; filename=audio.webm; Content-Type=audio/webm",
  "language": "en",                 // optional, only if explicitly set
  "prompt": "custom dictionary",    // optional
  "sendLogs": false,                 // optional, boolean as string
  "clientType": "desktop",
  "appVersion": "1.x.y",
  "clientVersion": "1.x.y",
  "sessionId": "<uuid>",
  "clientTranscriptionId": "<uuid v4>",
  "source": "file_upload"            // optional, only on file-upload path
}
```

For file-upload path the file name and Content-Type reflect the source extension (`AUDIO_MIME_TYPES` map). Files larger than `CLOUD_INLINE_LIMIT` are split client-side into ordered chunks via `chunkedCloudTranscribe()` and each chunk is POSTed separately to the same URL with chunk-coordination fields.

**Response body (success)**

```json
{
  "text": "transcribed string",
  "wordsUsed": 1234,
  "wordsRemaining": 8766,
  "plan": "free",
  "limitReached": false,
  "sttProvider": "openai",
  "sttModel": "whisper-1",
  "sttProcessingMs": 412,
  "sttWordCount": 27,
  "sttLanguage": "en",
  "audioDurationMs": 6500
}
```

The client reads all of these (`src/helpers/ipcHandlers.js:3441-3454, 3473-3487`). `wordsRemaining`, `plan`, and `limitReached` drive the renderer's quota UI.

**Error deviations:** A `limitReached: true` payload at HTTP 200 means the user has exhausted their plan quota; the client surfaces a quota-exhaustion UI rather than a generic error. `interpretTranscribeResponse()` (defined in the same file) is the canonical reader. 503 → `SERVER_ERROR` per global envelope.

**Notes:** Multi-chunk uploads return per-chunk response objects; the client sums numeric fields (`sttProcessingMs`, `sttWordCount`, `audioDurationMs`) across chunks and uses the **last** chunk's `wordsUsed`/`wordsRemaining`/`plan`/`limitReached` (`src/helpers/ipcHandlers.js:3440-3454`).

---

### `GET /api/health`

**Purpose:** Liveness probe used by the streaming UI to fail fast when the cloud is unreachable.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `GET` | `${OPENWHISPR_API_URL}/api/health` | none | `src/helpers/ipcHandlers.js:3507-3511` | `ipcMain.handle("cloud-health-check")` `src/helpers/ipcHandlers.js:3498` |

**Request body**

`GET` — no body.

**Response body (success)**

The client only inspects `res.ok` and `res.status`. The body is not read.

```json
{}
```

**Error deviations:** On any network error the client returns `{ ok: false, code, messageKey }` derived from `classifyAndLog()` (`src/helpers/ipcHandlers.js:3515-3522`). 3 s timeout via `AbortSignal.timeout(3000)`.

**Notes:** Only called from streaming code paths to short-circuit before opening a WebSocket.

---

### `POST /api/reason`

**Purpose:** Cloud reasoning — the OpenWhispr-hosted equivalent of "send the transcript to an LLM for cleanup / agent processing." Used by the `openwhispr` inference provider (`src/services/ai/inferenceProviders/openwhispr.ts:16`).

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/reason` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5576` | `ipcMain.handle("cloud-reason")` (handler defined immediately above the fetch site, registered around `src/helpers/ipcHandlers.js:5556`) |

**Request body**

```json
{
  "text": "raw transcript",
  "model": "claude-sonnet-4-6",
  "agentName": "Claude",
  "customDictionary": ["Yambr", "Gizmo"],
  "customPrompt": "Optional user-provided cleanup prompt",
  "systemPrompt": "Optional system override",
  "language": "en",
  "locale": "en-US",
  "sessionId": "<uuid>",
  "clientType": "desktop",
  "appVersion": "1.x.y",
  "clientVersion": "1.x.y",
  "sttProvider": "openai",
  "sttModel": "whisper-1",
  "sttProcessingMs": 412,
  "sttWordCount": 27,
  "sttLanguage": "en",
  "audioDurationMs": 6500,
  "audioSizeBytes": 90123,
  "audioFormat": "webm",
  "clientTotalMs": 1200
}
```

All fields except `text` are conditional on the caller supplying them (`opts.*`). The server is expected to tolerate missing keys.

**Response body (success)**

```json
{
  "text": "cleaned-up transcript",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "promptMode": "cleanup",
  "matchType": "agent"
}
```

The client reads exactly these five fields (`src/helpers/ipcHandlers.js:5630-5637`).

**Error deviations:** 401 → `{ success: false, error: "Session expired", code: "AUTH_EXPIRED" }`. 503 → `{ success: false, error: "Request timed out", code: "SERVER_ERROR" }`. Other non-2xx → reads `errorData.error` if present, else `API error: <status>`.

**Notes:** Wrapped by `withSessionRefresh()` in the renderer so a 401 within the 60 s grace window auto-retries with exponential backoff (`src/lib/auth.ts:142-169`).

---

### `POST /api/agent/stream`

**Purpose:** Streaming chat for the AI agent overlay. Returns NDJSON (newline-delimited JSON) chunks that the client forwards to the renderer over IPC.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/agent/stream` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5652` | `ipcMain.on("cloud-agent-stream-start")` `src/helpers/ipcHandlers.js:5644` |

**Request body**

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "systemPrompt": "Optional system override",
  "tools": [ { "name": "search_notes", "description": "...", "parameters": { } } ],
  "sessionId": "<uuid>",
  "clientType": "desktop",
  "appVersion": "1.x.y"
}
```

`messages` and `tools` shape mirrors the Vercel AI SDK `streamText` input. Server is expected to forward to whatever LLM provider it chooses.

**Response body (success)**

`Content-Type: application/x-ndjson` — one JSON object per `\n`-terminated line. The client parses each line and forwards it verbatim to the renderer via `event.sender.send("cloud-agent-stream-chunk", parsed)` (`src/helpers/ipcHandlers.js:5697-5710`). Malformed lines are silently skipped. On stream end the client emits `cloud-agent-stream-end`.

Example chunk shapes (the client does not validate them — it forwards as-is):

```json
{ "type": "text-delta", "delta": "Hello" }
{ "type": "tool-call", "toolName": "search_notes", "args": { "query": "..." } }
{ "type": "tool-result", "toolName": "search_notes", "result": [ ] }
{ "type": "finish", "usage": { "promptTokens": 100, "completionTokens": 50 } }
```

**Error deviations:** Non-2xx is reported via `cloud-agent-stream-error` IPC with `code: "AUTH_EXPIRED"` (401) or `code: "SERVER_ERROR"` (503).

**Notes:** Connection lifetime is the lifetime of the streaming response. There is no client-driven cancellation channel beyond aborting the underlying request.

---

### `POST /api/agent/web-search`

**Purpose:** Server-side web search tool exposed to the AI agent.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/agent/web-search` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5747` | `ipcMain.handle("agent-web-search")` `src/helpers/ipcHandlers.js:5737` |

**Request body**

```json
{ "query": "search string", "numResults": 5 }
```

`numResults` defaults to 5 client-side.

**Response body (success)**

The client returns `{ success: true, ...data }` (`src/helpers/ipcHandlers.js:5770-5771`) — i.e., the server's full JSON body is spread into the response and forwarded to the agent. The client does not enforce any specific shape, but downstream consumers (the `web_search` tool implementation) expect a `results` array of `{ title, url, snippet }` objects.

```json
{
  "results": [
    { "title": "...", "url": "https://...", "snippet": "..." }
  ]
}
```

**Error deviations:** 401/503 follow global envelope.

---

### `POST /api/streaming-usage`

**Purpose:** Reports usage metrics after a streaming-transcription session completes (BYOK or cloud-routed).

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/streaming-usage` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5788` | `ipcMain.handle("cloud-streaming-usage")` `src/helpers/ipcHandlers.js:5778` |

**Request body**

```json
{
  "text": "final transcript",
  "audioDurationSeconds": 12.5,
  "sessionId": "<uuid>",
  "clientType": "desktop",
  "appVersion": "1.x.y",
  "clientVersion": "1.x.y",
  "sttProvider": "openai",
  "sttModel": "whisper-1",
  "sttProcessingMs": 412,
  "sttLanguage": "en",
  "audioSizeBytes": 90123,
  "audioFormat": "webm",
  "clientTotalMs": 1200,
  "sendLogs": false
}
```

**Response body (success)**

The client returns `{ success: true, ...data }` — server can return updated quota fields shaped like `/api/transcribe`'s response (`wordsUsed`, `wordsRemaining`, `plan`, `limitReached`); the client treats the body opaquely and forwards it.

```json
{ "wordsUsed": 1234, "wordsRemaining": 8766, "plan": "free", "limitReached": false }
```

---

### `GET /api/usage`

**Purpose:** Fetches the current user's quota / plan state for display in the settings UI.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `GET` | `${OPENWHISPR_API_URL}/api/usage` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5839` | `ipcMain.handle("cloud-usage")` `src/helpers/ipcHandlers.js:5831` |

**Request body**

`GET` — no body.

**Response body (success)**

```json
{ "wordsUsed": 1234, "wordsRemaining": 8766, "plan": "free", "limitReached": false }
```

The client returns `{ success: true, ...data }` — exact shape is server-defined; the renderer's quota UI consumes `wordsUsed`, `wordsRemaining`, `plan`.

---

### `GET /api/stt-config`

**Purpose:** Fetches server-driven STT configuration (default model / language / provider preferences) the client should use for cloud transcription.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `GET` | `${OPENWHISPR_API_URL}/api/stt-config` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:6020` | `ipcMain.handle("get-stt-config")` `src/helpers/ipcHandlers.js:6012` |

**Request body**

`GET` — no body.

**Response body (success)**

The client spreads the response into `{ success: true, ...data }` and forwards opaquely. Settings UI keys observed in source: `defaultModel`, `defaultLanguage`, `availableProviders`. The server is the source of truth for shape.

```json
{ "defaultModel": "whisper-1", "defaultLanguage": "auto", "availableProviders": ["openai"] }
```

---

### `GET /api/note-recording-config`

**Purpose:** Fetches the policy for the note-recording feature (e.g., max duration, allowed sample rate).

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `GET` | `${OPENWHISPR_API_URL}/api/note-recording-config` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:6050` | `ipcMain.handle("get-note-recording-config")` `src/helpers/ipcHandlers.js:6042` |

**Request body**

`GET` — no body.

**Response body (success)**

Spread into `{ success: true, ...data }` and forwarded opaquely.

```json
{ }
```

---

### `POST /api/streaming-token`

**Purpose:** Issues a short-lived AssemblyAI realtime token. The cloud is the trust boundary that holds the AssemblyAI master key; this endpoint mints a session token.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/streaming-token` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:4119` (helper invocation), `src/helpers/ipcHandlers.js:6459` (token-refresh path) | Used by realtime-streaming session bootstrap (no public IPC channel — internal helper `postServerToken()`) |

**Request body**

```json
{}
```

The client sends an empty JSON body. The server is expected to derive identity from the auth header.

**Response body (success)**

```json
{ "token": "<short-lived-assemblyai-token>" }
```

Only `data.token` is read.

**Error deviations:** Non-2xx is rethrown as `Token request failed: <status>` (`src/helpers/ipcHandlers.js:4090-4092`). Network errors are classified and rethrown with `code: "NETWORK_ERROR"` and `messageKey` (`src/helpers/ipcHandlers.js:4080-4086`).

---

### `POST /api/deepgram-streaming-token`

**Purpose:** Same pattern as `/api/streaming-token` but for Deepgram realtime.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/deepgram-streaming-token` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:4134, 6660, 6690` | Internal helper `postServerToken()` and meeting-streaming token-refresh path |

**Request body**

```json
{}
```

**Response body (success)**

```json
{ "token": "<short-lived-deepgram-token>" }
```

Only `data.token` is read.

---

### `POST /api/openai-realtime-token`

**Purpose:** Mints an OpenAI Realtime API client secret for the desktop client (single or dual stream).

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/openai-realtime-token` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:4146` | Internal helper `postServerToken()` invoked from realtime bootstrap |

**Request body**

```json
{
  "model": "gpt-4o-realtime-preview",
  "language": "en",
  "streams": 1
}
```

`streams` is `1` or `2`; `2` is used when the meeting feature needs both mic and system-audio streams.

**Response body (success)**

```json
{
  "clientSecret": "<short-lived-openai-realtime-secret>",
  "clientSecrets": ["<secret-1>", "<secret-2>"]
}
```

For `streams=1` the client reads `data.clientSecret`. For `streams=2` it reads `data.clientSecrets` and asserts `length >= 2` (`src/helpers/ipcHandlers.js:4151-4156`).

---

### `POST /api/stripe/checkout`

**Purpose:** Creates a Stripe checkout session for plan upgrade.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/stripe/checkout` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5876` (via `fetchStripeUrl()` helper, invoked at `5898`) | `ipcMain.handle("cloud-checkout")` `src/helpers/ipcHandlers.js:5897` |

**Request body**

```json
{ "plan": "pro", "interval": "monthly" }
```

The client passes `opts` directly as JSON (the renderer decides the shape — typically a plan id and interval).

**Response body (success)**

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_..." }
```

The client reads only `data.url` and opens it in the user's external browser.

---

### `POST /api/stripe/portal`

**Purpose:** Creates a Stripe billing-portal session.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/stripe/portal` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5876` (helper) | `ipcMain.handle("cloud-billing-portal")` `src/helpers/ipcHandlers.js:5901` |

**Request body**

No body — `fetchStripeUrl` is invoked without a `body` argument so the request is a bodyless POST with the auth header only.

**Response body (success)**

```json
{ "url": "https://billing.stripe.com/p/session/..." }
```

---

### `POST /api/stripe/switch-plan`

**Purpose:** Switches the user's existing subscription to a different plan (no Stripe-hosted page round-trip).

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/stripe/switch-plan` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5913` | `ipcMain.handle("cloud-switch-plan")` `src/helpers/ipcHandlers.js:5905` |

**Request body**

```json
{ "plan": "pro_yearly" }
```

Whatever the renderer passes as `opts` is JSON-serialized verbatim.

**Response body (success)**

The client returns the server body verbatim (`return data` at `src/helpers/ipcHandlers.js:5930`). Shape is server-defined — typically a confirmation or updated subscription summary.

```json
{ "ok": true }
```

**Error deviations:** Reads `data.error` for the user-facing message when `!response.ok`.

---

### `POST /api/stripe/preview-switch`

**Purpose:** Returns a proration preview before committing a plan switch (`/api/stripe/switch-plan`).

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/stripe/preview-switch` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5945` | `ipcMain.handle("cloud-preview-switch")` `src/helpers/ipcHandlers.js:5937` |

**Request body**

```json
{ "plan": "pro_yearly" }
```

**Response body (success)**

```json
{ "amountDue": 1200, "currency": "usd", "nextBillingDate": "2026-06-08" }
```

Spread into `{ success: true, ...data }` — exact keys are server-defined.

---

### `GET /api/referrals/stats`

**Purpose:** Fetches the user's referral stats (signups, rewards earned).

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `GET` | `${OPENWHISPR_API_URL}/api/referrals/stats` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:6195` | `ipcMain.handle("get-referral-stats")` `src/helpers/ipcHandlers.js:6183` |

**Request body**

`GET` — no body.

**Response body (success)**

```json
{ }
```

Returned to the renderer verbatim (`return data` at `src/helpers/ipcHandlers.js:6212`). Exact shape is server-defined; the renderer's referral UI consumes the returned object directly.

**Error deviations:** This handler **throws** on non-2xx instead of returning `{ success: false }` (it pre-dates the `success`-envelope pattern). 401 → `Unauthorized - please sign in`; 503 → `Service temporarily unavailable`.

---

### `POST /api/referrals/invite`

**Purpose:** Sends a referral invite email.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `POST` | `${OPENWHISPR_API_URL}/api/referrals/invite` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:6231` | `ipcMain.handle("send-referral-invite")` `src/helpers/ipcHandlers.js:6219` |

**Request body**

```json
{ "email": "friend@example.com" }
```

**Response body (success)**

```json
{ }
```

Returned verbatim. Server-defined shape.

**Error deviations:** Throws on non-2xx with `errorData.error` if available, else `Failed to send invite: <status>`.

---

### `GET /api/referrals/invites`

**Purpose:** Lists outstanding referral invites the user has sent.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| `GET` | `${OPENWHISPR_API_URL}/api/referrals/invites` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:6269` | `ipcMain.handle("get-referral-invites")` `src/helpers/ipcHandlers.js:6257` |

**Request body**

`GET` — no body.

**Response body (success)**

```json
{ "invites": [ { "email": "friend@example.com", "status": "pending" } ] }
```

Server-defined shape; the renderer iterates over `invites` (per the surrounding referral UI in `src/components`).

---

### Generic passthrough: `cloud-api-request`

**Purpose:** Generic main-process passthrough used by parts of the renderer that need to issue arbitrary authenticated requests against `${OPENWHISPR_API_URL}`. Not a single endpoint — it lets callers supply `{ method, path, body }` and surfaces the JSON response.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| any | `${OPENWHISPR_API_URL}${opts.path}` | `Authorization: Bearer <token>` (cookie fallback) | `src/helpers/ipcHandlers.js:5986` | `ipcMain.handle("cloud-api-request")` `src/helpers/ipcHandlers.js:5969` |

**Notes:** Treats 401/503 the same as the dedicated handlers. Reads `data.error.message` (object) or `data.error` (string) for the error message — the only place that handles a structured `error` object. Servers MAY return `{ "error": { "message": "...", "code": "..." } }` for endpoints accessed through this channel; clients reading the same endpoint via a dedicated handler still see the global `{ "error": "..." }` envelope.

---

### Sketch: desktop OAuth shim — `GET ${AUTH_URL}/api/desktop-signin/<provider>`

The desktop sign-in flow opens this URL in the user's external browser; the auth host handles the Better Auth round-trip and 302s back to `https://openwhispr.com/auth/desktop-callback?protocol=<openwhispr|openwhispr-dev|openwhispr-staging>`, which then redirects to the custom protocol so the OS hands the response back to the running Electron app.

| method | URL pattern | auth header | fetch() call site | IPC handler / wrapper |
|---|---|---|---|---|
| (browser navigation) | `${AUTH_URL}/api/desktop-signin/<provider>?callbackURL=<encoded>` | none (cookies set by browser jar) | `src/lib/auth.ts:183-185` | `renderer-direct` (opens via `openExternalLink`) |

This endpoint is part of `auth.openwhispr.com`, not `${OPENWHISPR_API_URL}`. Full OAuth flow, scopes, and provider list are in [`OAUTH_SPEC.md`](./OAUTH_SPEC.md). It is sketched here only because `src/lib/auth.ts` is the single source for the URL construction.

---

## Custom Protocol Redirect

After the OAuth round-trip, the auth host redirects to a custom protocol the OS routes back to the running Electron app:

| Channel | Protocol | Registered in |
|---|---|---|
| production | `openwhispr://` | `main.js:50-52` (`DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL`), registered via `app.setAsDefaultProtocolClient()` at `main.js:194-196` |
| staging | `openwhispr-staging://` | same |
| development | `openwhispr-dev://` | same |

The desktop callback URL in `src/lib/auth.ts:171` is hardcoded to `https://openwhispr.com/auth/desktop-callback`; the auth host appends `?protocol=<one-of-above>` and 302s the browser to `<protocol>://...`. The full token-handoff payload (query-string parameters, Better Auth set-auth-token header propagation) is documented in [`OAUTH_SPEC.md`](./OAUTH_SPEC.md). The desktop callback URL itself is not configurable via env vars in v1.

---

## Third-Party API Inventory

These calls are intentionally **out of scope** for the OpenWhispr-cloud spec. Each row points at the single source-of-truth file in the client; payload schemas and error semantics live in vendor docs.

| Provider | Endpoint / SDK base URL | Method / transport | Source `file:line` | Vendor docs |
|---|---|---|---|---|
| OpenAI Responses API | `https://api.openai.com/v1/responses` (built via `buildApiUrl(API_ENDPOINTS.OPENAI_BASE, "/responses")`) | POST | `src/config/constants.ts:73`, called from `src/services/ai/openaiBase.ts:8`, `src/services/ai/inferenceProviders/openai.ts:121` | https://platform.openai.com/docs/api-reference/responses |
| OpenAI Chat Completions (fallback) | `https://api.openai.com/v1/chat/completions` (via `buildApiUrl(base, "/chat/completions")`) | POST | `src/services/ai/inferenceProviders/openai.ts:78, 121` (probe + provider) | https://platform.openai.com/docs/api-reference/chat |
| OpenAI `/v1/models` (probe) | `https://api.openai.com/v1/models` | GET | `src/services/ai/inferenceProviders/openai.ts:92` | https://platform.openai.com/docs/api-reference/models |
| OpenAI Whisper (BYOK retry path) | `https://api.openai.com/v1/audio/transcriptions` | POST `multipart/form-data` | `src/helpers/ipcHandlers.js:3600, 3603` | https://platform.openai.com/docs/api-reference/audio |
| OpenAI Realtime (BYOK + cloud-token modes) | `wss://api.openai.com/v1/realtime?intent=transcription` | WebSocket | `src/helpers/openaiRealtimeStreaming.js:54` | https://platform.openai.com/docs/guides/realtime |
| Anthropic Messages | `https://api.anthropic.com/v1/messages` | POST | `src/helpers/ipcHandlers.js:2826` (IPC bridge from renderer in `src/services/ai/inferenceProviders/anthropic.ts:5`) | https://docs.anthropic.com/en/api/messages |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` (`API_ENDPOINTS.GEMINI`) — `/models/<model>:generateContent` | POST | `src/config/constants.ts:76`, called at `src/services/ai/inferenceProviders/gemini.ts:43, 52` | https://ai.google.dev/api |
| Groq (OpenAI-compatible) | `https://api.groq.com/openai/v1` (`API_ENDPOINTS.GROQ_BASE`) — `/chat/completions` | POST | `src/config/constants.ts:77`, called at `src/services/ai/inferenceProviders/groq.ts:10-11` | https://console.groq.com/docs/api-reference |
| Groq Whisper (BYOK transcription retry) | `https://api.groq.com/openai/v1/audio/transcriptions` | POST `multipart/form-data` | `src/helpers/ipcHandlers.js:3589` | https://console.groq.com/docs/speech-text |
| Mistral Voxtral transcription | `https://api.mistral.ai/v1/audio/transcriptions` (`MISTRAL_TRANSCRIPTION_URL`) | POST `multipart/form-data`, `x-api-key` header | `src/helpers/ipcHandlers.js:61, 2456, 3592` | https://docs.mistral.ai/api/ |
| AssemblyAI Realtime | `wss://streaming.assemblyai.com/v3/ws` | WebSocket | `src/helpers/assemblyAiStreaming.js:67` | https://www.assemblyai.com/docs/speech-to-text/streaming |
| AssemblyAI BYOK token | `https://streaming.assemblyai.com/v3/token?expires_in_seconds=60` | GET | `src/helpers/ipcHandlers.js:4106` | https://www.assemblyai.com/docs/speech-to-text/streaming |
| Deepgram Realtime | `wss://api.deepgram.com/v1/listen` | WebSocket | `src/helpers/deepgramStreaming.js:149` | https://developers.deepgram.com/reference/streaming |
| AWS Bedrock | SDK `@ai-sdk/amazon-bedrock` (region-derived `https://bedrock-runtime.<region>.amazonaws.com`) | SDK (HTTPS POST under the hood) | `src/services/ai/inferenceProviders/enterprise.ts:38-42` | https://docs.aws.amazon.com/bedrock/ |
| Azure OpenAI | `${azureEndpoint}` (user-supplied at `src/services/ai/inferenceProviders/enterprise.ts:43-44`) | POST via `@ai-sdk/azure` | `src/services/ai/inferenceProviders/enterprise.ts:43` | https://learn.microsoft.com/azure/ai-services/openai/ |
| GCP Vertex AI | SDK `@ai-sdk/google-vertex` (project + location supplied) | SDK | `src/services/ai/inferenceProviders/enterprise.ts:45-46` | https://cloud.google.com/vertex-ai/docs |
| LAN provider (OpenAI-compatible) | `${cleanupRemoteUrl}/chat/completions` (user-supplied base URL from settings) | POST | `src/services/ai/inferenceProviders/lan.ts:14-18` | N/A (user-supplied; expected to be OpenAI-compatible) |
| Local llama.cpp (loopback) | `http://127.0.0.1:${serverResult.port}/v1/chat/completions` and `.../v1` | POST | `src/services/ReasoningService.ts:357, 568` (used by `src/services/ai/inferenceProviders/local.ts:5` via IPC `processLocalReasoning`) | https://github.com/ggerganov/llama.cpp |
| OpenWhispr cloud reasoning (this spec) | `${OPENWHISPR_API_URL}/api/reason` | POST | `src/services/ai/inferenceProviders/openwhispr.ts:16` (renderer) → `src/helpers/ipcHandlers.js:5576` | (this document) |

> `:NN` line numbers reflect HEAD as of authoring. SDK rows that build URLs dynamically from region/project/endpoint (Bedrock, Vertex, Azure, LAN) point at the configuration site, not a literal URL — there is no static line to cite for the wire URL.

---

## Out of Scope

This spec deliberately does not cover:

- **Hidden / undocumented OpenWhispr cloud endpoints** the current client does not call (admin, webhooks, internal APIs). Per the v1 plan (Phase 1, D-11), the wire surface is whatever this client sends; v2 only needs to satisfy that.
- **Server-side semantics** beyond what the client observes — rate limits, retry budgets, async job queues, websocket reconnection contracts. Per D-10, v2 may implement these freely; the client adapts via existing logic in `src/lib/auth.ts:142-169` and `src/utils/retry.ts`.
- **Live runtime trace validation.** Per D-09, source is the contract. Capture-and-diff against a deployed cloud is a future workstream.
- **Reference backend implementation.** Per D-15, no sample server stub is included in this repo. The spec is the deliverable; reference implementations belong in v2 / a separate companion repo.
- **Third-party AI / enterprise APIs.** Inventory only — read vendor docs for payloads.
- **Google Calendar API + OAuth.** See [`OAUTH_SPEC.md`](./OAUTH_SPEC.md).
- **Build-time configuration of these endpoints.** v1 phases 3 + 4 introduce `OPENWHISPR_BACKEND_URL` and friends; see [`BUILD_CONFIG.md`](./BUILD_CONFIG.md) (forthcoming) for that surface.
