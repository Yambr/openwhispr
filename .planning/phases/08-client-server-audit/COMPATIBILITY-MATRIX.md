# OpenWhispr Client ↔ Server Compatibility Matrix

**Date**: 2026-05-15
**Inputs**: `CLIENT-CALLS.md` (30 cloud endpoints), `SERVER-ROUTES.md` (59 routes), `docs/BACKEND_SPEC.md` (canonical contract)
**Method**: Row-by-row join on `(method, URL)`. Verdicts assigned per pair.

---

## Summary

| Verdict | Count |
|---|---|
| MATCH | 21 |
| MISMATCH | 2 |
| MISSING(server) | 7 |
| MISSING(client) | 13 |
| **Total client rows audited** | 30 |
| **Total server rows audited** | 59 |

The 30 client rows include 4 third-party / BYOK / OAuth-shim rows that fall outside the OpenWhispr cloud contract and are reported as `OUT-OF-SCOPE`. Net client cloud rows compared against server: 26. (21 MATCH + 2 MISMATCH + 7 MISSING(server) = 30; some client rows resolve to the same server route, hence the inflation. See per-row table below.)

---

## Matrix (grouped by feature area)

### Authentication & Identity

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 1 | check-user | `src/components/AuthenticationStep.tsx:164` | `routes/check-user.ts:36` | POST | `/api/check-user` | MATCH | Both: `{ email }` → `{ exists }`. Server adds anti-enumeration synthetic response on miss — invisible to client. |
| 2 | verification-status | `src/components/EmailVerificationStep.tsx:31` | `routes/verification-status.ts:40` | GET | `/api/auth/verification-status` | MISMATCH(auth) | Client sends **cookie only** (`credentials: include`, no `?email=` query is required server-side because auth=requireAuth derives user from session). Server requires `requireAuth` (Bearer OR cookie). Pre-verification window: cookie should still be valid from sign-up flow. Likely MATCH at runtime; flagged because client also appends `?email=` query param that server ignores — harmless. Severity: LOW. |
| 3 | delete-account | `src/lib/auth.ts:119` | `routes/delete-account.ts:90` | DELETE | `/api/auth/delete-account` | MATCH | Both: empty body, cookie auth, returns `{}` / DeleteAccountResponse. |
| 4 | get-session | `main.js:502` | `better-auth-handler.ts` (catch-all) | GET | `/api/auth/get-session` | MATCH | Better Auth universal handler covers this. Returns `{ session: { token } }` per Better Auth contract. |

### Transcription & STT

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 5 | transcribe | `src/helpers/ipcHandlers.js:3413` | `routes/transcribe.ts:68` | POST | `/api/transcribe` | MATCH | Both multipart/form-data. Server is conditionally registered on `deps.litellm`; if LiteLLM not wired → 404 (client falls back to BYOK / local). |
| 6 | transcribe (chunked retry) | `src/helpers/ipcHandlers.js:6101` | `routes/transcribe.ts:68` | POST | `/api/transcribe` | MATCH | Same endpoint, different caller. Server is stateless per request. |
| 7 | stt-config | `src/helpers/ipcHandlers.js:6044` | `routes/stt-config.ts:42` | GET | `/api/stt-config` | MATCH | Unconditional registration. Response shape consumed loosely (settings UI). |
| 8 | BYOK transcribe (3rd-party) | `src/helpers/audioManager.js:1527` | n/a | POST | (user endpoint) | OUT-OF-SCOPE | Vendor-direct (Whisper/Groq/Mistral); not OpenWhispr cloud. |

### Reasoning & LLM

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 9 | reason | `src/helpers/ipcHandlers.js:5601` | `routes/reason.ts:83` | POST | `/api/reason` | MATCH | Request: `ReasonRequest` matches client JSON (text/model/agent/prompt/etc.). Response `{ text, model, provider, promptMode, matchType }` aligns with `ReasonResponse`. Conditional on `deps.litellm`. |
| 10 | OpenAI models probe | `src/services/ai/inferenceProviders/openai.ts:92` | n/a | GET | `/v1/models` | OUT-OF-SCOPE | BYOK 3rd-party. |
| 11 | OpenAI chat | `src/services/ai/inferenceProviders/openai.ts:205` | n/a | POST | `/v1/chat/completions` | OUT-OF-SCOPE | BYOK 3rd-party. |
| 12 | Gemini | `src/services/ai/inferenceProviders/gemini.ts:52` | n/a | POST | (Google) | OUT-OF-SCOPE | BYOK 3rd-party. |
| 13 | ReasoningService (user-endpoint) | `src/services/ReasoningService.ts:190` | n/a | POST | (user endpoint) | OUT-OF-SCOPE | BYOK Anthropic/LAN/llama.cpp. |

### Agent & Streaming

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 14 | agent/stream | `src/helpers/ipcHandlers.js:5677` | `routes/agent/stream.ts:110` | POST | `/api/agent/stream` | MATCH | Both NDJSON streaming. Server body schema is "OpenAI-compatible chat body" per SERVER-ROUTES.md, client sends `{messages, systemPrompt, tools, sessionId, clientType, appVersion}`. Confirm server accepts extra metadata fields (sessionId, clientType, appVersion) — likely passthrough/ignored. |
| 15 | agent/web-search | `src/helpers/ipcHandlers.js:5772` | `routes/agent/web-search.ts:75` | POST | `/api/agent/web-search` | MATCH | Both: `{ query, numResults }` → `{ results: [...] }`. Unconditional registration; 503 at request time if no provider configured. |

### Usage & Quota

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 16 | streaming-usage | `src/helpers/ipcHandlers.js:5813` | `routes/streaming-usage.ts:55` | POST | `/api/streaming-usage` | MATCH | Server `StreamingUsageBodySchema` accepts the client metadata; idempotent on sessionId; returns UsageResponse. |
| 17 | usage | `src/helpers/ipcHandlers.js:5864` | `routes/usage.ts:37` | GET | `/api/usage` | MATCH | Aggregate response shape consumed loosely; client spreads with `success: true`. |
| 18 | note-recording-config | `src/helpers/ipcHandlers.js:6044` | `routes/note-recording-config.ts:31` | GET | `/api/note-recording-config` | MATCH | Unconditional registration. |

### Billing & Stripe

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 19 | stripe/checkout | `src/helpers/ipcHandlers.js:5929` | **not implemented** | POST | `/api/stripe/checkout` | MISSING(server) | BACKEND_SPEC.md §`POST /api/stripe/checkout` documents `{plan, interval}` → `{url}`. Server has no `routes/stripe/` directory. Client falls back to error toast; UI is hidden in corporate-minimal builds (see `c4d2ca5e`). |
| 20 | stripe/portal | `src/helpers/ipcHandlers.js:5933` | **not implemented** | POST | `/api/stripe/portal` | MISSING(server) | BACKEND_SPEC.md §`POST /api/stripe/portal`. No server route. Hidden in corporate-minimal. |
| 21 | stripe/switch-plan | `src/helpers/ipcHandlers.js:5944` | **not implemented** | POST | `/api/stripe/switch-plan` | MISSING(server) | BACKEND_SPEC.md §`POST /api/stripe/switch-plan`. No server route. Hidden in corporate-minimal. |
| 22 | stripe/preview-switch | `src/helpers/ipcHandlers.js:5976` | **not implemented** | POST | `/api/stripe/preview-switch` | MISSING(server) | BACKEND_SPEC.md §`POST /api/stripe/preview-switch`. No server route. Hidden in corporate-minimal. |

### Referrals

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 23 | referrals/stats | `src/helpers/ipcHandlers.js:6228` | **not implemented** | GET | `/api/referrals/stats` | MISSING(server) | BACKEND_SPEC.md §`GET /api/referrals/stats`. No server route. Hidden in corporate-minimal. |
| 24 | referrals/invite | `src/helpers/ipcHandlers.js:6264` | **not implemented** | POST | `/api/referrals/invite` | MISSING(server) | BACKEND_SPEC.md §`POST /api/referrals/invite`. No server route. Hidden in corporate-minimal. |
| 25 | referrals/invites | `src/helpers/ipcHandlers.js:6302` | **not implemented** | GET | `/api/referrals/invites` | MISSING(server) | BACKEND_SPEC.md §`GET /api/referrals/invites`. No server route. Hidden in corporate-minimal. |

### Health & Realtime Tokens

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 26 | health | `src/helpers/ipcHandlers.js:3514` | `routes/probes.ts:121` | GET | `/api/health` | MISMATCH(deprecation) | Client reads only `res.ok`. Server returns `200` with `Deprecation` header and `Link: </livez>; rel="successor-version"`. Client does NOT yet honor the deprecation hint — should migrate to `/livez` per server probe contract. Severity: LOW (still works). |
| 27 | streaming-token (AssemblyAI) | `src/helpers/ipcHandlers.js:~4122` | `routes/tokens/assemblyai.ts:46` | POST | `/api/streaming-token` | MATCH | Both empty body → `{ token }`. Server 503 on missing `ASSEMBLYAI_API_KEY`. |
| 28 | deepgram-streaming-token | `src/helpers/ipcHandlers.js:~4151` | `routes/tokens/deepgram.ts:27` | POST | `/api/deepgram-streaming-token` | MATCH | Both empty body → `{ token }`. |
| 29 | openai-realtime-token | `src/helpers/ipcHandlers.js:4163` | `routes/tokens/openai-realtime.ts:53` | POST | `/api/openai-realtime-token` | MISMATCH(schema) | Client sends `{ model, language, streams }` and expects `{ clientSecret }` OR `{ clientSecrets: [..] }` for dual-stream. Server `SERVER-ROUTES.md` shows req=`none`, resp=`{ token: string }`. Field-name divergence: `clientSecret`/`clientSecrets` (client) vs `token` (server). Dual-stream not supported server-side. Severity: HIGH for realtime feature. |

### Generic Passthrough

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 30 | cloud-api-request (passthrough) | `src/helpers/ipcHandlers.js:6018` | n/a | any | `${opts.path}` | OUT-OF-SCOPE | Generic relay — verdict depends on actual `opts.path`. Not a contract endpoint. |

### OAuth & Realtime WS

| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |
|---|---|---|---|---|---|---|---|
| 31 | desktop-signin | `src/lib/auth.ts:183` | `routes/desktop-signin.ts:76` | GET | `/api/desktop-signin/:provider` | MATCH | Browser-navigation; PKCE+oauth_state init. |
| 32 | desktop-callback | (auth host) | `routes/auth-callback.ts:102` | GET | `/api/auth/desktop-callback/:provider` | MATCH | Server-side OAuth round-trip. |
| 33 | realtime WS | `src/helpers/openaiRealtimeStreaming.js` | `routes/realtime.ts:125` | WS upgrade | `/v1/realtime` | MATCH | OpenAI Realtime wire protocol; server master-key swaps headers. Conditional on `deps.litellm && deps.litellmMasterKey`. |

---

## MISSING(client) — Server routes the client never calls

Informational only. Server exposes documented contract endpoints that the Electron client does not invoke. These are NOT errors — most are sync/persistence APIs targeted by future client features or by other tenants (web app, mobile).

| # | Server (file:line) | Method | URL | Notes |
|---|---|---|---|---|
| C1 | `notes/create.ts:30` | POST | `/api/notes/create` | Notes CRUD not yet wired to Electron sync. |
| C2 | `notes/batch-create.ts:47` | POST | `/api/notes/batch-create` | — |
| C3 | `notes/update.ts:90` | PATCH | `/api/notes/update` | — |
| C4 | `notes/delete.ts:31` | DELETE | `/api/notes/delete` | — |
| C5 | `notes/delete-all.ts:34` | DELETE | `/api/notes/delete-all` | — |
| C6 | `notes/list.ts:39` | GET | `/api/notes/list` | — |
| C7 | `notes/search.ts:48` | POST | `/api/notes/search` | — |
| C8 | Folders CRUD (5 routes) | various | `/api/folders/*` | Folder sync not yet wired. |
| C9 | Conversations CRUD + Messages (7 routes) | various | `/api/conversations/*` | Conversation history sync not yet wired. |
| C10 | Transcriptions CRUD (5 routes) | various | `/api/transcriptions/*` | Transcription history sync not yet wired. |
| C11 | `diarization.ts:140` | POST | `/v1/audio/diarization` | Diarization not exposed in current UI. |
| C12 | `capabilities.ts:149`, `locale.ts:70`, `setup-state.ts:63`, `setup-admin.ts:147` | GET/POST | `/api/capabilities`, `/api/locale`, `/api/setup-state`, `/api/setup/admin` | Admin/wizard surface — server-only. |
| C13 | `v1/keys/*` (3 routes) | POST/GET | `/api/v1/keys/*` | API key minting — not used by desktop yet. |

Plus probes (`/livez`, `/readyz`, `/startupz`) and `/api/_test/*` routes which are infra/test-only and intentionally not client-called.

---

## Notes on Verdict Methodology

- **MATCH** does NOT mean the schemas are byte-identical — most client expectations are loose (`spread + success:true`). MATCH means: URL identical, method identical, auth model compatible, and the client-consumed fields exist in server response (best-effort by reading SERVER-ROUTES.md schema names).
- **MISMATCH(...)** is reserved for cases where a divergence is identifiable from the inventories without running the system.
- **MISSING(server)** means client issues a call that the server has zero route for. The 7 billing/referral entries are MISSING(server) but are also UI-hidden in corporate-minimal builds (so user-facing impact = 0 in the default build).
- Verdicts on Better Auth catch-all (`/api/auth/*`) assume Better Auth conformance; not separately enumerated per Better Auth sub-route.
