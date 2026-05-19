# CJM Coverage Matrix — Phase 9 E2E Suite

Maps every endpoint marked `MATCH` in Phase 8 `COMPATIBILITY-MATRIX.md`
(post-2026-05-19 amendment) to its covering feature/scenario in
`tests/e2e/features/`. Coverage now includes the 23 sync endpoints +
3 v1/keys endpoints that the Phase 8 audit initially misclassified as
`MISSING(client)` — see `../../.planning/phases/09-client-e2e-tests/CONTEXT.md`
GA-6.

> **Server requirements closed (2026-05-19):** all twelve R-rows filed
> in Phase 8 `SERVER-REQUIREMENTS.md` are CLOSED. No active
> `@blocked-rN` tags remain in the suite.

Status legend:
- ✅ PASS — scenario passes on the closed-R1–R12 server stack
- 💳 @requires-paid-keys — operator gate (LiteLLM upstream keys configured)
- 🚧 fixture-pending — `tests/e2e/fixtures/audio/hello-world-3s.wav` not yet checked in
- 🚫 OUT — out of scope (CLIENT-CUT; see `CLIENT-CUTS.md`)

---

## Auth (Phase 8 matrix rows 1–4, 31–32)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/_test/seed-tenant` (R1 test-only) | (fixture seed.ts; gates every authenticated scenario) | ✅ PASS |
| `POST /api/auth/sign-up/email` | (retired in favor of seed-tenant; not exercised directly) | n/a |
| `POST /api/auth/sign-in/email` | auth.feature → Sign-in with verified user returns a session bearer | ✅ PASS |
| `POST /api/auth/sign-out` | auth.feature → Sign-out invalidates the session | ✅ PASS |
| `DELETE /api/auth/delete-account` | auth.feature → Delete account returns 200 | ✅ PASS |
| `POST /api/check-user` | auth.feature → check-user new/existing | ✅ PASS |
| `GET /api/auth/verification-status?email=…` | auth.feature → Verification status accepts ?email= query param (R5) | ✅ PASS |

## Sync surface — Notes (MATCH rows 34–40, R8 closed)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/notes/create` | notes-cjm.feature → POST /api/notes/create returns a note with an id | ✅ PASS |
| `POST /api/notes/batch-create` | notes-cjm.feature → POST /api/notes/batch-create preserves client_note_id mapping (R8) | ✅ PASS |
| `GET /api/notes/list` | notes-cjm.feature → GET /api/notes/list returns the created note | ✅ PASS |
| `PATCH /api/notes/update` | notes-cjm.feature → PATCH /api/notes/update renames a note | ✅ PASS |
| `POST /api/notes/search` | notes-cjm.feature → POST /api/notes/search returns matching notes | ✅ PASS |
| `DELETE /api/notes/delete` | notes-cjm.feature → DELETE /api/notes/delete removes the note | ✅ PASS |
| `DELETE /api/notes/delete-all` | notes-cjm.feature → DELETE /api/notes/delete-all clears the tenant's notes | ✅ PASS |

## Sync surface — Folders (MATCH rows 41–45, R9 closed)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/folders/create` | folders-cjm.feature → POST /api/folders/create returns a folder with an id | ✅ PASS |
| `POST /api/folders/batch-create` | folders-cjm.feature → POST /api/folders/batch-create returns created folders | ✅ PASS |
| `GET /api/folders/list` | folders-cjm.feature → GET /api/folders/list returns the created folder | ✅ PASS |
| `PATCH /api/folders/update` | folders-cjm.feature → PATCH /api/folders/update renames a folder | ✅ PASS |
| `DELETE /api/folders/delete` | folders-cjm.feature → DELETE /api/folders/delete removes an empty folder | ✅ PASS |

## Sync surface — Conversations + messages (MATCH rows 46–51, R10 closed)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/conversations/create` | conversations-cjm.feature → POST /api/conversations/create returns a conversation with an id | ✅ PASS |
| `POST /api/conversations/messages` | conversations-cjm.feature → POST /api/conversations/messages appends a message | ✅ PASS |
| `GET /api/conversations/messages?conversationId=…` | conversations-cjm.feature → GET /api/conversations/messages returns messages in creation order | ✅ PASS |
| `PATCH /api/conversations/update` | conversations-cjm.feature → PATCH /api/conversations/update renames a conversation | ✅ PASS |
| `POST /api/conversations/search` | conversations-cjm.feature → POST /api/conversations/search returns matching conversations | ✅ PASS |
| `DELETE /api/conversations/delete` | conversations-cjm.feature → DELETE /api/conversations/delete cascades to messages | ✅ PASS |

## Sync surface — Transcriptions RECORD CRUD (MATCH rows 52–56, R11 closed)

> Distinct from `/api/transcribe` audio inference — these endpoints
> persist transcription RECORDS only.

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/transcriptions/create` | transcriptions-cjm.feature → POST /api/transcriptions/create stores a transcription record | ✅ PASS |
| `POST /api/transcriptions/batch-create` | transcriptions-cjm.feature → POST /api/transcriptions/batch-create stores multiple records | ✅ PASS |
| `GET /api/transcriptions/list` | transcriptions-cjm.feature → GET /api/transcriptions/list returns the created record | ✅ PASS |
| `POST /api/transcriptions/batch-delete` | transcriptions-cjm.feature → POST /api/transcriptions/batch-delete removes records by ids | ✅ PASS |
| `DELETE /api/transcriptions/delete` | transcriptions-cjm.feature → DELETE /api/transcriptions/delete removes a single record | ✅ PASS |

## API keys — v1 envelope (MATCH rows 57–59, R12 closed)

> Disposition: `@server-contract-only` via cloudApiRequest IPC. The UI
> exists (`src/components/ApiKeysSection.tsx`) but is hidden behind a
> feature gate in the corporate-minimal default build; contract-level
> coverage is the stable choice. See `features/api-keys.feature` top
> comment for the full disposition rationale.

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `GET /api/v1/keys/list` | api-keys.feature → GET /api/v1/keys/list returns V1 envelope wrapping keys array | ✅ PASS |
| `POST /api/v1/keys/create` | api-keys.feature → POST /api/v1/keys/create returns plaintext key with V1 envelope (success:true) | ✅ PASS |
| `POST /api/v1/keys/{id}/revoke` | api-keys.feature → POST /api/v1/keys/{id}/revoke removes the key from list | ✅ PASS |

## Transcription (audio inference, rows 7–8)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/transcribe` (multipart) | transcription.feature → Multipart upload with a real WAV returns transcribed text | 💳 + 🚧 fixture-pending |
| `POST /api/transcribe` (empty file) | transcription.feature → 400 | ✅ PASS (R6 closure) |
| `POST /api/transcribe` (no auth) | transcription.feature → 401 | ✅ PASS |

## Reasoning + agent (rows 9–11)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/reason` (happy) | reasoning.feature → non-empty content | 💳 |
| `POST /api/reason` (no auth) | reasoning.feature → 401 | ✅ PASS |
| `POST /api/agent/stream` | agent-stream.feature → NDJSON finish chunk | 💳 |
| `POST /api/agent/web-search` | agent-stream.feature → results array | 💳 |

## Realtime token mint (rows 18–20, R3 closed)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/streaming-token` (AssemblyAI) | realtime-token.feature → AssemblyAI streaming token mint | 💳 (@requires-assemblyai) |
| `POST /api/deepgram-streaming-token` | realtime-token.feature → Deepgram streaming token mint | 💳 (@requires-deepgram) |
| `POST /api/openai-realtime-token` (single) | realtime-token.feature → OpenAI realtime token mint (single stream) — R3 closure | 💳 |
| `POST /api/openai-realtime-token` (multi) | realtime-token.feature → OpenAI realtime token mint (two streams) — R3 closure | 💳 |

## Usage + config (rows 15–17)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `GET /api/usage` (auth) | usage-config.feature → quota shape | ✅ PASS (R6 closure) |
| `GET /api/usage` (no auth) | usage-config.feature → 401 | ✅ PASS (R6 closure) |
| `GET /api/streaming-usage` | usage-config.feature → 200 | ✅ PASS (R6 closure) |
| `GET /api/stt-config` | usage-config.feature → providers array | ✅ PASS (R6 closure) |
| `GET /api/note-recording-config` | usage-config.feature → 200 | ✅ PASS (R6 closure) |

## Health (rows 21–22, R4 + R6 closed)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `GET /livez` | health.feature → GET /livez returns 200 with {"status":"ok"} | ✅ PASS |
| `GET /readyz` | health.feature → GET /readyz returns 200 | ✅ PASS (R6 closure) |
| `GET /api/health` | health.feature → GET /api/health is first-class — no deprecation signals (R4) | ✅ PASS — Deprecation header REMOVED per R4 |

## Out of scope

These endpoints have NO matching scenario by design — see
`../../.planning/phases/09-client-e2e-tests/CLIENT-CUTS.md`:

| Endpoint | Reason | Linked cut |
|---|---|---|
| `POST /api/stripe/checkout` | 🚫 UI-gated (commit `c4d2ca5e`); server endpoint scrubbed from BACKEND_SPEC | CC-1 |
| `POST /api/stripe/portal` | 🚫 same | CC-1 |
| `POST /api/stripe/switch-plan` | 🚫 same | CC-1 |
| `POST /api/stripe/preview-switch` | 🚫 same | CC-1 |
| `GET /api/referrals/stats` | 🚫 UI-gated; server endpoint scrubbed | CC-2 |
| `POST /api/referrals/invite` | 🚫 same | CC-2 |
| `GET /api/referrals/invites` | 🚫 same | CC-2 |
| BYOK direct calls to openai.com / anthropic.com / etc. | 🚫 not part of openwhispr-server contract — third-party providers | n/a |

## Pending fixtures

- `tests/e2e/fixtures/audio/hello-world-3s.wav` — checked-in 3-second
  WAV with known transcript "hello world". Required by transcription
  happy path. Until on disk, the step def calls `test.skip(true,
  "audio fixture pending")`. Per advisor decision 2026-05-19:
  "Audio fixture pending stays pending — once R1 lands, the
  @requires-paid-keys transcription scenario can run; the fixture is
  its own follow-up."

## Tag conventions (post R1–R12 closure)

- `@requires-paid-keys` — needs upstream STT/LLM keys on the server
- `@requires-assemblyai` / `@requires-deepgram` — gated on
  `OPENWHISPR_E2E_ASSEMBLYAI_AVAILABLE=1` /
  `OPENWHISPR_E2E_DEEPGRAM_AVAILABLE=1` flags
- `@server-contract-only` — scenario exercises the cloud-api passthrough
  wire path via `cloudCall` (NOT raw HTTP, NOT UI navigation); used for
  the api-keys feature where the UI is feature-gated out of the default
  corporate-minimal build

Retired tags (do not reintroduce; see KNOWN-FAILURES.md § Server
requirement closure log): blocked-s5, blocked-rN, skip (for OpenAI
realtime), server-only.
