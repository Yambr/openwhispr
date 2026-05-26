# OpenWhispr Server Routes Inventory

**Date**: 2026-05-15  
**Source**: `/Users/nick/openwhispr-server/apps/api/src/routes/`  
**Total Routes**: 55 registered HTTP endpoints + 1 WebSocket upgrade path

---

## Authentication & Auth Flows

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 1 | better-auth-handler.ts | GET/POST/PATCH | /api/auth/* | false | (varies) | (varies) | Better Auth universal handler; routes: sign-up/email, sign-in/email, verify-email, sign-out, change-password, etc. |
| 2 | auth-providers.ts:74 | GET | /api/auth/providers | false | none | ProviderList | Public list of available auth providers (OIDC) |
| 3 | auth-callback.ts:102 | GET | /api/auth/desktop-callback/:provider | false | state, code (query) | 302 redirect | OAuth callback; mints bearer token; validates state; single-use semantic |
| 4 | desktop-signin.ts:76 | GET | /api/desktop-signin/:provider | false | callbackURL, protocol (query) | 302 redirect to IdP | PKCE flow init; generates oauth_state; OIDC only (oidc provider) |
| 5 | delete-account.ts:90 | DELETE | /api/auth/delete-account | requireAuth | DeleteAccountRequest | DeleteAccountResponse | Marks account for deletion; 30-day grace window; clears cookies |
| 6 | verification-status.ts:40 | GET | /api/auth/verification-status | requireAuth | none | VerificationStatusResponse | Checks email verification + account readiness |

---

## Notes CRUD

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 7 | notes/create.ts:30 | POST | /api/notes/create | requireAuth | NoteInputSchema | CloudNote | Idempotent on client_note_id; 120/min RL |
| 8 | notes/batch-create.ts:47 | POST | /api/notes/batch-create | requireAuth | NoteInputSchema[] | CloudNote[] | Batch upsert; 120/min RL |
| 9 | notes/update.ts:90 | PATCH | /api/notes/update | requireAuth | NoteUpdateSchema | CloudNote | Partial update; 120/min RL |
| 10 | notes/delete.ts:31 | DELETE | /api/notes/delete | requireAuth | { id: uuid } | DeleteResponse | Soft-delete; 120/min RL |
| 11 | notes/delete-all.ts:34 | DELETE | /api/notes/delete-all | requireAuth | none | { deleted: number } | Soft-delete all user notes; 120/min RL |
| 12 | notes/list.ts:39 | GET | /api/notes/list | requireAuth | limit, before, since (query) | { notes: CloudNote[] } | Keyset paginated; DESC by created_at; 120/min RL |
| 13 | notes/search.ts:48 | POST | /api/notes/search | requireAuth | SearchRequest | { results: CloudNote[] } | Full-text search on content_search tsvector; 120/min RL |

---

## Folders CRUD

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 14 | folders/create.ts:28 | POST | /api/folders/create | requireAuth | FolderInputSchema | CloudFolder | Idempotent on client_folder_id; 120/min RL |
| 15 | folders/batch-create.ts:40 | POST | /api/folders/batch-create | requireAuth | FolderInputSchema[] | CloudFolder[] | Batch upsert; 120/min RL |
| 16 | folders/update.ts:49 | PATCH | /api/folders/update | requireAuth | FolderUpdateSchema | CloudFolder | Partial update; 120/min RL |
| 17 | folders/delete.ts:30 | DELETE | /api/folders/delete | requireAuth | { id: uuid } | DeleteResponse | Soft-delete; 120/min RL |
| 18 | folders/list.ts:40 | GET | /api/folders/list | requireAuth | limit, before, since (query) | { folders: CloudFolder[] } | Keyset paginated; DESC by created_at; 120/min RL |

---

## Conversations CRUD & Messages

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 19 | conversations/create.ts:30 | POST | /api/conversations/create | requireAuth | ConversationInputSchema | CloudConversation | Idempotent on client_conversation_id; 120/min RL |
| 20 | conversations/update.ts:38 | PATCH | /api/conversations/update | requireAuth | ConversationUpdateSchema | CloudConversation | Partial update; 120/min RL |
| 21 | conversations/delete.ts:32 | DELETE | /api/conversations/delete | requireAuth | { id: uuid } | DeleteResponse | Soft-delete; 120/min RL |
| 22 | conversations/list.ts:53 | GET | /api/conversations/list | requireAuth | limit, before, since (query) | { conversations: CloudConversation[] } | Keyset paginated; DESC by created_at; 120/min RL |
| 23 | conversations/search.ts:43 | POST | /api/conversations/search | requireAuth | SearchRequest | { results: CloudConversation[] } | Full-text search on title; 120/min RL |
| 24 | conversations/messages.ts:73 | POST | /api/conversations/messages | requireAuth | MessageInputSchema | CloudMessage | Idempotent on client_message_id; 4 KiB metadata cap; 240/min RL |
| 25 | conversations/messages.ts:134 | GET | /api/conversations/messages | requireAuth | conversation_id, limit, before, since (query) | { messages: CloudMessage[] } | Keyset paginated; 240/min RL |

---

## Transcriptions CRUD

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 26 | transcriptions/create.ts:26 | POST | /api/transcriptions/create | requireAuth | TranscriptionInputSchema | CloudTranscription | Idempotent on client_transcription_id; 120/min RL |
| 27 | transcriptions/batch-create.ts:39 | POST | /api/transcriptions/batch-create | requireAuth | TranscriptionInputSchema[] | CloudTranscription[] | Batch upsert; 120/min RL |
| 28 | transcriptions/delete.ts:30 | DELETE | /api/transcriptions/delete | requireAuth | { id: uuid } | DeleteResponse | Soft-delete; NO update endpoint per upstream service; 120/min RL |
| 29 | transcriptions/batch-delete.ts:36 | POST | /api/transcriptions/batch-delete | requireAuth | { ids: uuid[] } | { deleted: number } | Soft-delete batch; 120/min RL |
| 30 | transcriptions/list.ts:36 | GET | /api/transcriptions/list | requireAuth | limit, before, since (query) | { transcriptions: CloudTranscription[] } | Keyset paginated; DESC by created_at; 120/min RL |

---

## Transcription & Reasoning (LiteLLM-backed)

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 31 | transcribe.ts:68 | POST | /api/transcribe | requireAuth | multipart/form-data (audio) | TranscribeResponse | Streaming audio to LiteLLM/Groq; writes usage_ledger; 20/min RL (user-tier); conditional registration on deps.litellm |
| 32 | reason.ts:83 | POST | /api/reason | requireAuth | ReasonRequest (JSON) | ReasonResponse | LLM reasoning (qwen3.6-plus default); writes usage_ledger (reason_tokens); 120/min RL; conditional registration |

---

## Realtime (WebSocket)

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 33 | realtime.ts:125 | WS upgrade | /v1/realtime | requireAuth | (WebSocket frames) | (OpenAI realtime frames) | WSS reverse-proxy to LiteLLM; master-key swap on headers; ?user appended; wsReconnect=false; handshakeTimeout=10s; conditional registration on deps.litellm && deps.litellmMasterKey |

---

## Agent & AI Endpoints

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 34 | agent/stream.ts:110 | POST | /api/agent/stream | requireAuth | (OpenAI-compatible chat body) | EventSource/NDJSON | Streaming LLM chat; writes usage_ledger (reason_tokens); 120/min RL; conditional registration on deps.litellm |
| 35 | agent/web-search.ts:75 | POST | /api/agent/web-search | requireAuth | WebSearchRequest | WebSearchResponse | Web search (provider-selected at boot); 120/min RL; UNCONDITIONAL registration (no provider configured = 503 at request time) |

---

## Streaming Tokens (Provider-specific)

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 36 | tokens/assemblyai.ts:46 | POST | /api/streaming-token | requireAuth | none | { token: string } | AssemblyAI ephemeral token mint; 30/min RL (per-user); authRequired:true; 503 on missing ASSEMBLYAI_API_KEY |
| 37 | tokens/deepgram.ts:27 | POST | /api/deepgram-streaming-token | requireAuth | none | { token: string } | Deepgram ephemeral token mint; 30/min RL (per-user); authRequired:true; 503 on missing DEEPGRAM_API_KEY |
| 38 | tokens/openai-realtime.ts:53 | POST | /api/openai-realtime-token | requireAuth | none | { token: string } | OpenAI realtime ephemeral token mint; 30/min RL (per-user); authRequired:true; 503 on missing OPENAI_API_KEY |

---

## Audio Processing

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 39 | diarization.ts:140 | POST | /v1/audio/diarization | requireAuth | multipart/form-data (file) | DiarizationResponse | Pyannote async orchestration OR Speaches sync (if SPEACHES_DIARIZATION_URL set); Stripe-style idempotency (Idempotency-Key header → Valkey); 30/min RL; 5min polling ceiling→504; conditional registration on deps.redis |

---

## Usage & Billing

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 40 | usage.ts:37 | GET | /api/usage | requireAuth | none | UsageResponse | Aggregate usage_ledger SUM(units) by user; unlimited plan hardcoded; 120/min RL |
| 41 | streaming-usage.ts:55 | POST | /api/streaming-usage | requireAuth | StreamingUsageBodySchema | UsageResponse | Log streaming-STT session; idempotent on sessionId; units=Math.round(audioDurationSeconds); 120/min RL |

---

## Configuration & System

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 42 | stt-config.ts:42 | GET | /api/stt-config | requireAuth | none | SttConfigResponse | Available STT providers; reads user_settings → tenant_settings → env defaults; 120/min RL; UNCONDITIONAL registration |
| 43 | note-recording-config.ts:31 | GET | /api/note-recording-config | requireAuth | none | NoteRecordingConfigResponse | Note recording providers; reads user_settings → tenant_settings → env defaults; 120/min RL; UNCONDITIONAL registration |
| 44 | capabilities.ts:149 | GET | /api/capabilities | false | none | CapabilitiesResponse | Public advertised capabilities (LLM models, providers); UNCONDITIONAL registration |
| 45 | check-user.ts:36 | POST | /api/check-user | false | { email: string } | CheckUserResponse | Email existence probe (anti-enumeration: synthetic on email NOT found); 120/min RL |
| 46 | locale.ts:70 | GET | /api/locale | false | Accept-Language header | LocaleResponse | Language negotiation per Accept-Language; 120/min RL |
| 47 | setup-state.ts:63 | GET | /api/setup-state | false | none | SetupStateResponse | Wizard state (setup_state table); 120/min RL |
| 48 | setup-admin.ts:147 | POST | /api/setup/admin | false | SetupAdminRequest | SetupAdminResponse | Idempotent wizard claim; writes users.role + tenants; conditional registration on deps.setupAdmin |

---

## Health & Diagnostics

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 49 | probes.ts:83 | GET | /livez | false | none | { status: "ok" } | Process-alive only; zero dep checks; 200 always; NO rate-limit; kubelet liveness |
| 50 | probes.ts:90 | GET | /readyz | false | none | { postgres, valkey, litellm } | Parallel dep-check (postgres, valkey, litellm); 200 if ALL ok else 503; 5s cached; NO rate-limit; kubelet readiness |
| 51 | probes.ts:112 | GET | /startupz | false | none | { ready: boolean } | 503 until markStartupComplete() called post-migrations; NO rate-limit |
| 52 | probes.ts:121 | GET | /api/health | false | none | { status, migrations_completed } | Back-compat alias for /livez; Deprecation header + Link successor; NO rate-limit |

---

## Test-Only Routes (OPENWHISPR_TEST_ROUTES=true or NODE_ENV=test)

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 53 | test-only.ts:143 | GET | /api/_test/litellm-baseurl | false | none | { baseUrl: string } | LiteLLM base URL introspection (PROVIDER-01 seam); NO rate-limit; conditional on deps.litellm |
| 54 | test-only.ts:156 | POST | /api/_test/force-rotate | requireAuth | none | { rotated: true }; set-auth-token header | Session token rotation shortcut; emits new bearer in header; records previous_token; NO rate-limit |
| 55 | test-only.ts:211 | GET | /api/_test/health-authed | requireAuth | none | { status: "ok", userId: string } | Minimal authenticated probe; NO rate-limit |
| 56 | test-only.ts:233 | GET | /api/_test/route-list | false | none | { tree: string } | Fastify printRoutes output; full route tree as plaintext; NO rate-limit |

---

## API Keys (v1)

| # | File:Line | Method | URL | Auth | Req Schema | Resp Schema | Notes |
|---|---|---|---|---|---|---|---|
| 57 | v1/keys/create.ts:58 | POST | /api/v1/keys/create | requireAuth | none | KeyCreateResponse | Mints bearer PAK (Argon2id); V1Response envelope { data: {} }; 120/min RL |
| 58 | v1/keys/list.ts:77 | GET | /api/v1/keys/list | requireAuth | none | KeyListResponse | List all api_keys (non-revoked); V1Response envelope; 120/min RL |
| 59 | v1/keys/revoke.ts:44 | POST | /api/v1/keys/:id/revoke | requireAuth | none | KeyRevokeResponse | Idempotent soft-revoke (revoked_at = COALESCE(revoked_at, NOW())); V1Response envelope; 120/min RL |

---

## Summary by Feature Area

### Counts
- **Authentication & Auth**: 6 routes (OAuth flow, delete account, verification)
- **Notes CRUD**: 7 routes (create, batch-create, update, delete, delete-all, list, search)
- **Folders CRUD**: 5 routes (create, batch-create, update, delete, list)
- **Conversations CRUD & Messages**: 7 routes (create, update, delete, list, search, messages POST/GET)
- **Transcriptions CRUD**: 5 routes (create, batch-create, delete, batch-delete, list)
- **Transcription & Reasoning**: 2 routes (/transcribe, /reason)
- **Realtime**: 1 route (WebSocket /v1/realtime)
- **Agent & AI**: 2 routes (/agent/stream, /agent/web-search)
- **Streaming Tokens**: 3 routes (AssemblyAI, Deepgram, OpenAI Realtime)
- **Audio Processing**: 1 route (/v1/audio/diarization)
- **Usage & Billing**: 2 routes (/usage, /streaming-usage)
- **Configuration & System**: 7 routes (/stt-config, /note-recording-config, /capabilities, /check-user, /locale, /setup-state, /api/setup/admin)
- **Health & Diagnostics**: 4 routes (/livez, /readyz, /startupz, /api/health)
- **Test-Only Routes**: 4 routes (/api/_test/*)
- **API Keys**: 3 routes (/api/v1/keys/create, /list, /:id/revoke)
- **Better Auth Catch-All**: 1 route (/api/auth/* — all routes handled by Better Auth universal handler)

**TOTAL**: 59 distinct endpoints (including catch-all + test-only)

### Conditional Registration

Routes that are **NOT registered** unless specific deps are wired at boot:

1. **POST /api/transcribe** — requires `deps.litellm`
2. **POST /api/reason** — requires `deps.litellm`
3. **WS /v1/realtime** — requires `deps.litellm && deps.litellmMasterKey`
4. **POST /api/agent/stream** — requires `deps.litellm`
5. **POST /v1/audio/diarization** — requires `deps.redis` (Valkey client)
6. **POST /api/setup/admin** — requires `deps.setupAdmin` (owner pool + signUpEmail callable)
7. **GET /api/_test/litellm-baseurl** — requires `deps.litellm && (NODE_ENV=test || OPENWHISPR_TEST_ROUTES=true)`
8. **POST /api/_test/force-rotate, GET /api/_test/health-authed, GET /api/_test/route-list** — require `NODE_ENV=test || OPENWHISPR_TEST_ROUTES=true`

When conditional routes are NOT registered, the centralized `notFoundHandler` emits a canonical 404 envelope.

---

## Auth Middleware

All routes use one of:
- **`requireAuth` (default)**: dual-auth hook enforces Bearer token or cookie session; throws 401 if absent
- **`config.auth=false`**: opted out of dual-auth; Better Auth (/api/auth/*) maintains own session logic; public endpoints bypass auth
- **`authRequired: true` (token endpoints)**: marks route as authenticated-only for rate-limit IP-tier carve-out (V2-SEC-01)

---

## Rate Limiting

Global defaults: 60 requests/min per IP (overridable per route via `config.rateLimit`)

Notable overrides:
- **Probe routes** (`/livez`, `/readyz`, `/startupz`, `/api/health`): `rateLimit: false` (kubelet period=10s across 1000 pods)
- **Test-only routes**: `rateLimit: false` (contract-test burst tolerance)
- **Transcribe**: 20/min per user (GPU-expensive)
- **Token mints** (AssemblyAI, Deepgram, OpenAI Realtime): 30/min per user
- **Diarization**: 30/min per user
- **Messages**: 240/min (double the note/folder/conversation/transcription CRUD 120/min)
- **All other CRUD**: 120/min (per route config)

---

## Notable Design Patterns

### Idempotency
- **Notes, Folders, Conversations, Transcriptions, Messages**: idempotent on `client_*_id`; retry with same ID returns existing row (200, not 409)
- **Diarization**: Stripe-style idempotency cache via Valkey; `Idempotency-Key` header or SHA-256(file); 24h TTL; same key + different body = 409
- **API key revoke**: idempotent soft-revoke; `revoked_at = COALESCE(revoked_at, NOW())`

### Schemas
- **Request**: Zod schemas from `@openwhispr/wire-schemas` (NoteInputSchema, ConversationInputSchema, etc.)
- **Response**: Shapes matched by wire-contracts tests; TypeScript types defined in routes/*/shape.ts
- **Error**: Centralized `setErrorHandler` envelopes all errors as `{error: "<message>"}` or `{code, message}` JSON

### Pagination
- **CRUD list endpoints**: keyset pagination on `(created_at DESC, id)` with `limit`, `before`, `since` query params
- **Conversations/Messages GET**: same keyset pattern; soft-deleted rows excluded

### RLS (Row-Level Security)
- **All CRUD operations**: wrapped in `withTenant(db, tenantId, …)` which sets `app.tenant_id` GUC for FORCE-RLS
- **Additional WHERE on user_id**: explicit filter in every query to keep EXPLAIN output obvious

---

## Undocumented Routes (No Explicit Schema)

The following routes do NOT reference named Zod/wire-schemas but define inline validation:

1. **POST /api/conversations/messages** — inline MessageInputSchema (Zod) for metadata validation + 4 KiB cap
2. **GET /api/conversations/messages** — inline ListQuery schema (Zod object)
3. **POST /api/auth/sign-up/email** (Better Auth) — no explicit req schema; anti-enumeration via synthetic response
4. **GET /api/desktop-signin/:provider** — callbackURL/protocol query params validated inline
5. **GET /api/auth/desktop-callback/:provider** — state/code/error query params validated inline

---

## Routes Expected by Client BACKEND_SPEC.md

### Auth & Tokens
- ✅ **POST /api/auth/sign-up/email** — Better Auth route (handled via /api/auth/*)
- ✅ **POST /api/auth/sign-in/email** — Better Auth route
- ✅ **GET /api/auth/verify-email** — Better Auth route
- ✅ **POST /api/auth/sign-out** — Better Auth route
- ✅ **GET /api/auth/verification-status** — explicitly listed (#5)
- ✅ **GET /api/auth/providers** — explicitly listed (#2)
- ✅ **GET /api/desktop-signin/:provider** — explicitly listed (#4)
- ✅ **GET /api/auth/desktop-callback/:provider** — explicitly listed (#3)
- ✅ **DELETE /api/auth/delete-account** — explicitly listed (#5)

### Streaming Tokens
- ✅ **POST /api/streaming-token** — AssemblyAI (#36)
- ✅ **POST /api/deepgram-streaming-token** — Deepgram (#37)
- ✅ **POST /api/openai-realtime-token** — OpenAI Realtime (#38)

### Transcription & AI
- ✅ **POST /api/transcribe** — explicitly listed (#31)
- ✅ **POST /api/reason** — explicitly listed (#32)
- ✅ **POST /api/agent/stream** — explicitly listed (#34)
- ✅ **POST /api/agent/web-search** — explicitly listed (#35)

### Realtime
- ✅ **WS /v1/realtime** — explicitly listed (#33)

### Usage & Config
- ✅ **GET /api/usage** — explicitly listed (#40)
- ✅ **POST /api/streaming-usage** — explicitly listed (#41)
- ✅ **GET /api/stt-config** — explicitly listed (#42)
- ✅ **GET /api/note-recording-config** — explicitly listed (#43)
- ✅ **POST /v1/audio/diarization** — explicitly listed (#39)

### Health
- ✅ **GET /api/health** — explicitly listed (#52)

### Notes/Folders/Conversations/Transcriptions CRUD
- ✅ **All 34 CRUD endpoints** — Notes (7), Folders (5), Conversations (7 incl messages), Transcriptions (5), v1/keys (3), Streaming Tokens (3)

**FOUND IN SPEC**: All expected routes are registered and functional.

---

## Routes NOT Expected by BACKEND_SPEC.md (Bonus)

- `/livez`, `/readyz`, `/startupz` — kubelet probes (infrastructure)
- `/api/locale` — Accept-Language negotiation (UI support)
- `/api/capabilities` — capability discovery (admin wizard)
- `/api/check-user` — email existence probe (anti-enumeration)
- `/api/setup-state` — wizard state tracking
- `/api/setup/admin` — admin claim (conditional on wizard enablement)
- `/api/_test/*` — token rotation, route introspection (test-only)

---

## Known Gaps / Undocumented Behaviors

1. **OAuth state lifecycle** — `/api/auth/desktop-callback/:provider` uses 10-minute TTL on oauth_state rows; expired/consumed states return 400 but distinction not clearly surfaced in BACKEND_SPEC.md

2. **Streaming token provider errors** — 503 on missing keys (ASSEMBLYAI_API_KEY, etc.) with message; desktop should treat as "provider not configured" not "session expired"

3. **Diarization async orchestration** — route wraps pyannote.ai's 4-step async flow but surfaces sync response; 504 on 5-minute polling ceiling (jobId returned for resume hint)

4. **Speaches alternative** — `SPEACHES_DIARIZATION_URL` env switches diarization to local sync POST; undocumented in BACKEND_SPEC.md but wired in routes/index.ts

5. **Message metadata cap** — 4 KiB limit on POST /api/conversations/messages metadata field; enforced via JSON.stringify byte-length check (T-MSG-INJ mitigation)

6. **Email enumeration protection** — POST /api/auth/sign-up/email returns synthetic success when email exists (Better Auth default) unless OPENWHISPR_DISABLE_EMAIL_ENUMERATION_PROTECTION=1 (then 422 + USER_ALREADY_EXISTS)

---

## Schema Cross-References

All request/response schemas live in:
- `/Users/nick/openwhispr-server/packages/wire-schemas/src/` (NoteInputSchema, ConversationInputSchema, etc.)
- `@openwhispr/contract-tests/schemas` (ReasonRequest, ReasonResponse, DiarizationResponse, etc.)
- Route-local inline schemas (MessageInputSchema in conversations/messages.ts, etc.)

Notable schema exports:
- `NoteInputSchema`, `NoteUpdateSchema` — notes CRUD
- `FolderInputSchema`, `FolderUpdateSchema` — folders CRUD
- `ConversationInputSchema`, `ConversationUpdateSchema` — conversations CRUD
- `TranscriptionInputSchema` — transcriptions CRUD
- `ReasonRequest`, `ReasonResponse` — /api/reason
- `DiarizationResponse` — /v1/audio/diarization
- `StreamingUsageBodySchema` — /api/streaming-usage
- `V1Response<T>` — API keys v1 envelope

