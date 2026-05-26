# OpenWhispr Electron Client: HTTP Call Inventory

Generated from source audit of `/Users/nick/openwhispr/src/`, `main.js`, and `preload.js`.

**Legend:** Auth column shows `Bearer` (token from `auth-token.bin`), `Cookie` (session jar), or `None` (pre-auth). URL patterns use `${OPENWHISPR_API_URL}` (legacy renderer constant from `VITE_OPENWHISPR_API_URL`) or `${apiUrl}` (main-process resolver via `getApiUrl()`). Both resolve to `OPENWHISPR_BACKEND_URL` at build time or runtime env override.

---

## OpenWhispr Cloud Endpoints (OPENWHISPR_API_URL / OPENWHISPR_BACKEND_URL)

### Authentication & Identity

| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller | Feature |
|---|-----------|--------|-------------|------|---------------|-------------------|--------|---------|
| 1 | src/components/AuthenticationStep.tsx:164 | POST | `${OPENWHISPR_API_URL}/api/check-user` | None | `{ email }` | `{ exists: bool }` | `AuthenticationStep` (renderer-direct) | auth |
| 2 | src/components/EmailVerificationStep.tsx:31,35 | GET | `${OPENWHISPR_API_URL}/api/auth/verification-status?email=<urlencoded>` | Cookie (credentials: "include") | Query param only | `{ verified: bool }` | `EmailVerificationStep` (renderer-direct, polled 5s) | auth |
| 3 | src/lib/auth.ts:119 | DELETE | `${OPENWHISPR_API_URL}/api/auth/delete-account` | Cookie (credentials: "include") | (empty) | `{}` | `deleteAccount()` (renderer-direct) | auth |
| 4 | main.js:502 | GET | `${resolveAuthUrl()}/api/auth/get-session` | Cookie | Query only | `{ session: { token } }` | `exchangeSignedTokenForRawBearer()` (main) | auth |

### Transcription & STT

| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller | Feature |
|---|-----------|--------|-------------|------|---------------|-------------------|--------|---------|
| 5 | src/helpers/ipcHandlers.js:3413 | POST | `${apiUrl}/api/transcribe` | Bearer or Cookie | multipart/form-data (audio file + metadata) | `{ text, wordsUsed, wordsRemaining, plan, limitReached, sttProvider, sttModel, sttProcessingMs, sttWordCount, sttLanguage, audioDurationMs }` | `cloud-transcribe` IPC handler | transcription |
| 6 | src/helpers/ipcHandlers.js:6101 | POST | `${apiUrl}/api/transcribe` (chunked) | Bearer or Cookie | multipart/form-data (file chunks) | Per-chunk responses, summed metadata | `transcribe-audio-file-cloud` IPC handler (file upload retry path) | transcription |
| 7 | src/helpers/ipcHandlers.js:6044 | GET | `${apiUrl}/api/stt-config` | Bearer or Cookie | (empty) | `{ defaultModel, defaultLanguage, availableProviders, ... }` | `get-stt-config` IPC handler (settings UI) | transcription |
| 8 | src/helpers/audioManager.js:1527 | POST | `${endpoint}` (3rd-party, user-configured) | Bearer (user's BYOK API key) | multipart/form-data (audio + language) | `{ text, ... }` (vendor-specific) | `transcribeAudio()` method (BYOK Whisper/Groq/Mistral) | transcription |

### Reasoning & LLM Cleanup

| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller | Feature |
|---|-----------|--------|-------------|------|---------------|-------------------|--------|---------|
| 9 | src/helpers/ipcHandlers.js:5601 | POST | `${apiUrl}/api/reason` | Bearer or Cookie | JSON: `{ text, model, agentName, customDictionary, customPrompt, systemPrompt, language, locale, sessionId, clientType, appVersion, sttProvider, sttModel, sttProcessingMs, sttWordCount, sttLanguage, audioDurationMs, audioSizeBytes, audioFormat, clientTotalMs }` | `{ text, model, provider, promptMode, matchType }` | `cloud-reason` IPC handler → wrapped by `withSessionRefresh()` | reasoning |
| 10 | src/services/ai/inferenceProviders/openai.ts:92 | GET | `${base}/models` (OpenAI or compatible) | Bearer (user's API key) | (empty) | `{ data: [ { id, owned_by, ... } ] }` | `detectServerType()` → OpenAI provider (probing llama.cpp) | reasoning |
| 11 | src/services/ai/inferenceProviders/openai.ts:205 | POST | `${endpoint}` (OpenAI `/v1/chat/completions` or `/v1/responses`) | Bearer (user's API key) | JSON (messages, temperature, max_tokens, model) | `{ choices: [ { message: { content } } ], usage }` or Responses API format | OpenAI provider inference call | reasoning |
| 12 | src/services/ai/inferenceProviders/gemini.ts:52 | POST | `${API_ENDPOINTS.GEMINI}/models/${model}:generateContent` (https://generativelanguage.googleapis.com/v1beta) | `x-goog-api-key` header (user's API key) | JSON: `{ contents, generationConfig }` | `{ candidates: [ { content: { parts: [ { text } ] } } ], usageMetadata }` | Gemini provider inference call | reasoning |
| 13 | src/services/ReasoningService.ts:190 | POST | `${endpoint}` (Anthropic, custom, or LAN) | Bearer (user's API key) or custom header | JSON (messages, temperature, max_tokens, model) | `{ choices: [ { message: { content } } ], usage }` | ReasoningService (OpenAI-compatible or enterprise) | reasoning |

### Agent & Streaming

| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller | Feature |
|---|-----------|--------|-------------|------|---------------|-------------------|--------|---------|
| 14 | src/helpers/ipcHandlers.js:5677 | POST | `${apiUrl}/api/agent/stream` | Bearer or Cookie | JSON: `{ messages, systemPrompt, tools, sessionId, clientType, appVersion }` | NDJSON: `{ type: "text-delta" \| "tool-call" \| "tool-result" \| "finish", ... }` (streamed) | `cloud-agent-stream-start` IPC (on, not handle) → NDJSON reader | agent |
| 15 | src/helpers/ipcHandlers.js:5772 | POST | `${apiUrl}/api/agent/web-search` | Bearer or Cookie | JSON: `{ query, numResults }` | `{ results: [ { title, url, snippet } ] }` (spread + success: true) | `agent-web-search` IPC handler (tool from agent) | agent |

### Usage & Quota

| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller | Feature |
|---|-----------|--------|-------------|------|---------------|-------------------|--------|---------|
| 16 | src/helpers/ipcHandlers.js:5813 | POST | `${apiUrl}/api/streaming-usage` | Bearer or Cookie | JSON: `{ text, audioDurationSeconds, sessionId, clientType, appVersion, sttProvider, sttModel, sttProcessingMs, sttLanguage, audioSizeBytes, audioFormat, clientTotalMs, sendLogs }` | `{ wordsUsed, wordsRemaining, plan, limitReached, ... }` (spread + success: true) | `cloud-streaming-usage` IPC handler (after realtime session end) | usage |
| 17 | src/helpers/ipcHandlers.js:5864 | GET | `${apiUrl}/api/usage` | Bearer or Cookie | (empty) | `{ wordsUsed, wordsRemaining, plan, limitReached, ... }` (spread + success: true) | `cloud-usage` IPC handler (settings quota UI) | usage |
| 18 | src/helpers/ipcHandlers.js:6044 | GET | `${apiUrl}/api/note-recording-config` | Bearer or Cookie | (empty) | `{ ... }` (server-defined shape) | `get-note-recording-config` IPC handler | health |

### Billing & Stripe

| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller | Feature |
|---|-----------|--------|-------------|------|---------------|-------------------|--------|---------|
| 19 | src/helpers/ipcHandlers.js:5929 | POST | `${apiUrl}/api/stripe/checkout` | Bearer or Cookie | JSON: `{ plan, interval }` (opts) | `{ url: "https://checkout.stripe.com/..." }` | `cloud-checkout` IPC handler | billing |
| 20 | src/helpers/ipcHandlers.js:5933 | POST | `${apiUrl}/api/stripe/portal` | Bearer or Cookie | (empty body, POST with auth only) | `{ url: "https://billing.stripe.com/..." }` | `cloud-billing-portal` IPC handler | billing |
| 21 | src/helpers/ipcHandlers.js:5944 | POST | `${apiUrl}/api/stripe/switch-plan` | Bearer or Cookie | JSON: `{ plan }` (opts) | `{ success?, error?, ... }` (server-defined) | `cloud-switch-plan` IPC handler | billing |
| 22 | src/helpers/ipcHandlers.js:5976 | POST | `${apiUrl}/api/stripe/preview-switch` | Bearer or Cookie | JSON: `{ plan }` (opts) | `{ success: true, amountDue, currency, nextBillingDate, ... }` (spread + success: true) | `cloud-preview-switch` IPC handler | billing |

### Referrals

| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller | Feature |
|---|-----------|--------|-------------|------|---------------|-------------------|--------|---------|
| 23 | src/helpers/ipcHandlers.js:6228 | GET | `${apiUrl}/api/referrals/stats` | Bearer or Cookie | (empty) | `{ ... }` (server-defined, returned verbatim) | `get-referral-stats` IPC handler | billing |
| 24 | src/helpers/ipcHandlers.js:6264 | POST | `${apiUrl}/api/referrals/invite` | Bearer or Cookie | JSON: `{ email }` | `{ ... }` (server-defined, returned verbatim) | `send-referral-invite` IPC handler | billing |
| 25 | src/helpers/ipcHandlers.js:6302 | GET | `${apiUrl}/api/referrals/invites` | Bearer or Cookie | (empty) | `{ invites: [ { email, status } ] }` (server-defined shape) | `get-referral-invites` IPC handler | billing |

### Health & Streaming Token

| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller | Feature |
|---|-----------|--------|-------------|------|---------------|-------------------|--------|---------|
| 26 | src/helpers/ipcHandlers.js:3514 | GET | `${apiUrl}/api/health` | None | (empty) | `{}` (body not read, only `res.ok` inspected) | `cloud-health-check` IPC handler (3s timeout, pre-streaming check) | health |
| 27 | src/helpers/ipcHandlers.js:4090 (line ~4122) | POST | `${apiUrl}/api/streaming-token` | Bearer or Cookie | JSON: `{}` (empty body) | `{ token: "<assemblyai-token>" }` | `getStreamingToken()` helper → realtime bootstrap (AssemblyAI BYOK mode) | transcription/realtime |
| 28 | src/helpers/ipcHandlers.js:4134 (line ~4151) | POST | `${apiUrl}/api/deepgram-streaming-token` | Bearer or Cookie | JSON: `{}` | `{ token: "<deepgram-token>" }` | `getStreamingToken()` helper → realtime bootstrap (Deepgram cloud mode) | transcription/realtime |
| 29 | src/helpers/ipcHandlers.js:4163 | POST | `${apiUrl}/api/openai-realtime-token` | Bearer or Cookie | JSON: `{ model, language, streams }` | `{ clientSecret: "<secret>" }` (single stream) or `{ clientSecrets: ["<s1>", "<s2>"] }` (dual) | `getStreamingToken()` helper → realtime bootstrap (OpenAI Realtime) | transcription/realtime |

### Generic Passthrough

| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller | Feature |
|---|-----------|--------|-------------|------|---------------|-------------------|--------|---------|
| 30 | src/helpers/ipcHandlers.js:6018 | any | `${apiUrl}${opts.path}` | Bearer or Cookie | JSON: `opts.body` (optional, method: GET/POST/etc) | `{ success: true, data: <json> }` or `{ success: false, error }` (wrapped) | `cloud-api-request` IPC handler (generic renderer passthrough) | misc |

---

## Third-Party AI Provider Calls (Out of Spec)

These are intentionally excluded from the OpenWhispr cloud contract. Vendor docs are authoritative.

| Provider | Endpoint / Base URL | Method | Source (file:line) | Vendor Docs |
|---|---|---|---|---|
| OpenAI Chat Completions | `https://api.openai.com/v1/chat/completions` | POST | `src/services/ai/inferenceProviders/openai.ts:205` | https://platform.openai.com/docs/api-reference/chat |
| OpenAI Models | `https://api.openai.com/v1/models` | GET | `src/services/ai/inferenceProviders/openai.ts:92` | https://platform.openai.com/docs/api-reference/models |
| OpenAI Audio (Whisper) BYOK | `https://api.openai.com/v1/audio/transcriptions` | POST (multipart) | `src/helpers/ipcHandlers.js:3600` (retry path) | https://platform.openai.com/docs/api-reference/audio |
| OpenAI Realtime (BYOK) | `wss://api.openai.com/v1/realtime?intent=transcription` | WebSocket | `src/helpers/openaiRealtimeStreaming.js:` | https://platform.openai.com/docs/guides/realtime |
| Anthropic Messages | `https://api.anthropic.com/v1/messages` | POST | `src/helpers/ipcHandlers.js:2831` (IPC bridge) | https://docs.anthropic.com/api/messages |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` | POST | `src/services/ai/inferenceProviders/gemini.ts:52` | https://ai.google.dev/api |
| Groq Chat | `https://api.groq.com/openai/v1/chat/completions` | POST | `src/services/ai/inferenceProviders/groq.ts:10` | https://console.groq.com/docs/api-reference |
| Groq Whisper BYOK | `https://api.groq.com/openai/v1/audio/transcriptions` | POST (multipart) | `src/helpers/ipcHandlers.js:3589` | https://console.groq.com/docs/speech-text |
| Mistral Voxtral | `https://api.mistral.ai/v1/audio/transcriptions` | POST (multipart) | `src/helpers/ipcHandlers.js:61, 3592` | https://docs.mistral.ai/api/ |
| AssemblyAI Realtime BYOK | `wss://streaming.assemblyai.com/v3/ws` | WebSocket | `src/helpers/assemblyAiStreaming.js:67` | https://www.assemblyai.com/docs/speech-to-text/streaming |
| AssemblyAI Token BYOK | `https://streaming.assemblyai.com/v3/token?expires_in_seconds=60` | GET | `src/helpers/ipcHandlers.js:4106` | https://www.assemblyai.com/docs |
| Deepgram Realtime BYOK | `wss://api.deepgram.com/v1/listen` | WebSocket | `src/helpers/deepgramStreaming.js:149` | https://developers.deepgram.com/reference/streaming |
| AWS Bedrock | SDK endpoint (region-derived) | SDK | `src/services/ai/inferenceProviders/enterprise.ts:38` | https://docs.aws.amazon.com/bedrock/ |
| Azure OpenAI | User-supplied `${azureEndpoint}` | SDK | `src/services/ai/inferenceProviders/enterprise.ts:43` | https://learn.microsoft.com/azure/ai-services/openai/ |
| GCP Vertex AI | SDK (project + location) | SDK | `src/services/ai/inferenceProviders/enterprise.ts:45` | https://cloud.google.com/vertex-ai/docs |
| LAN Provider (OpenAI-compatible) | `${cleanupRemoteUrl}/chat/completions` (user-supplied) | POST | `src/services/ai/inferenceProviders/lan.ts:14` | N/A (user-supplied) |
| Local llama.cpp | `http://127.0.0.1:${port}/v1/chat/completions`, `.../v1/models` | POST, GET | `src/services/ReasoningService.ts:357, 568` | https://github.com/ggerganov/llama.cpp |

---

## OAuth & Desktop Auth Shim

| # | URL Pattern | Method | Auth | Purpose | Source |
|---|---|---|---|---|---|
| 31 | `${AUTH_URL}/api/desktop-signin/<provider>?callbackURL=<encoded>` | Browser navigation (GET) | Cookies (better-auth session) | OAuth sign-in shim (opens in user's default browser; auth host handles round-trip) | `src/lib/auth.ts:183-185` |
| 32 | `https://openwhispr.com/auth/desktop-callback?protocol=<channel>` | Browser navigation (302) | (oauth token in query) | OAuth callback; auth host redirects to custom protocol (openwhispr:// / openwhispr-dev:// / openwhispr-staging://) | `src/lib/auth.ts:171, 176` |

---

## Realtime WebSocket Contract

**Endpoint:** `WSS ${OPENWHISPR_REALTIME_WSS_URL}?intent=transcription` (defaults to `wss://${host(OPENWHISPR_BACKEND_URL)}/v1/realtime` when `OPENWHISPR_BACKEND_URL` is set at build time).

**Wire protocol:** OpenAI Realtime API (byte-for-byte compatible). Client sends PCM16 audio chunks; server returns transcription deltas + VAD signals.

**Auth:** `Authorization: Bearer <openai-api-key-or-realtime-token>` HTTP header at WebSocket upgrade. Custom header: `OpenAI-Beta: realtime=v1`.

**Source:** `src/helpers/openaiRealtimeStreaming.js` (Phase 05-02: URL now read from build-config).

---

## Summary

- **Total unique OpenWhispr cloud endpoints:** 30
- **Total call sites (including BYOK + 3rd-party retries):** ~40+ (some endpoints called from multiple paths)
- **Feature-area breakdown:**
  - **Auth:** 4 endpoints (check-user, verification-status, delete-account, get-session)
  - **Transcription & STT:** 4 endpoints (transcribe, transcribe-file, stt-config, note-recording-config)
  - **Reasoning & LLM:** 5 endpoints (reason, agent/stream, agent/web-search, OpenAI models, provider inference)
  - **Usage & Quota:** 2 endpoints (usage, streaming-usage)
  - **Billing & Stripe:** 4 endpoints (checkout, portal, switch-plan, preview-switch)
  - **Referrals:** 3 endpoints (stats, invite, invites)
  - **Health & Realtime Tokens:** 4 endpoints (health, streaming-token, deepgram-token, openai-realtime-token)
  - **Generic Passthrough:** 1 handler (cloud-api-request, accepts arbitrary paths)
  - **Third-party (inventory only):** 14 vendors (OpenAI, Anthropic, Gemini, Groq, Mistral, AssemblyAI, Deepgram, Bedrock, Azure, Vertex, LAN, llama.cpp)

- **Anomalies:**
  - `main.js:502`: Pre-auth call to `${AUTH_URL}/api/auth/get-session` (not `OPENWHISPR_API_URL`) — this is the Better Auth identity provider, documented separately in `OAUTH_SPEC.md`.
  - `src/helpers/ipcHandlers.js:4122` (AssemblyAI BYOK): Direct call to `https://streaming.assemblyai.com/v3/token?expires_in_seconds=60` bypasses OPENWHISPR_API_URL indirection; this is intentional for BYOK key holders.
  - All OPENWHISPR_API_URL calls are guarded by `if (!apiUrl) throw ...` or `if (!OPENWHISPR_API_URL) return ...`, so empty URL disables cloud features gracefully.

---

## Build-Time URL Resolution

| Env Var | Used By | Default | Canonical Export |
|---|---|---|---|
| `OPENWHISPR_BACKEND_URL` | Build script (`scripts/generate-build-config.js`) | (empty, clouds disabled) | `src/config/build-config.generated.{ts,cjs}` |
| `VITE_OPENWHISPR_API_URL` | Vite config (legacy fallback) | (empty) | `src/config/constants.ts:116` (`OPENWHISPR_API_URL`) |
| `VITE_OPENWHISPR_BACKEND_URL` | Vite config | (empty, fallback to `VITE_OPENWHISPR_API_URL`) | `src/config/defaults.ts:27` |
| `OPENWHISPR_REALTIME_WSS_URL` | Build config | (derived from `OPENWHISPR_BACKEND_URL`: `https` → `wss`) | `src/config/build-config.generated.ts` |
| `AUTH_URL` | Vite config (Better Auth) | `https://auth.openwhispr.com` | `src/lib/auth.ts:10` |

All cloud feature guards check the resolved constant (e.g., `if (!OPENWHISPR_API_URL)`) before issuing calls.
