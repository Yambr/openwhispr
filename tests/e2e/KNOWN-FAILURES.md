# Known Failures

Scenarios currently expected to fail or be skipped. Post-R1–R12 closure
(2026-05-19), the list is minimal: operator-gated paid-keys scenarios
and one pending audio fixture. No active `@blocked-rN` tags remain.

| Tag | Scenario | Root cause | Owner | Linked finding | Last verified |
|---|---|---|---|---|---|
| `@requires-paid-keys` | 8 scenarios in transcription / reasoning / agent-stream / realtime-token (incl. OpenAI realtime) | LiteLLM proxy on the server needs upstream API keys configured (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `DEEPGRAM_API_KEY`). Operator gate, not a server bug. | operator | n/a (env) | 2026-05-20 |
| pending fixture | `transcription.feature → Multipart upload with a real WAV returns transcribed text` | Audio fixture file not yet checked in: `tests/e2e/fixtures/audio/hello-world-3s.wav`. Step def short-circuits via `test.skip()`. Advisor decision (2026-05-19): "Audio fixture pending stays pending — once R1 lands, the @requires-paid-keys transcription scenario can run; the fixture is its own follow-up." | client | n/a | 2026-05-20 |

### `@requires-paid-keys` scenarios (operator concern, NOT server bugs)

The following scenarios call upstream paid providers via the LiteLLM
proxy and only run when the operator has wired the corresponding keys
into the server `.env`:

- `transcription.feature → Multipart upload with a real WAV returns transcribed text` (also gated on audio fixture, see above)
- `reasoning.feature → non-empty content` (LLM keys)
- `agent-stream.feature → NDJSON finish chunk` (LLM keys)
- `agent-stream.feature → results array` (LLM keys + web-search)
- `realtime-token.feature → AssemblyAI streaming token mint` (ASSEMBLYAI_API_KEY + `OPENWHISPR_E2E_ASSEMBLYAI_AVAILABLE=1`)
- `realtime-token.feature → Deepgram streaming token mint` (DEEPGRAM_API_KEY + `OPENWHISPR_E2E_DEEPGRAM_AVAILABLE=1`)
- `realtime-token.feature → OpenAI realtime token mint (single stream)` (OPENAI_API_KEY)
- `realtime-token.feature → OpenAI realtime token mint (two streams)` (OPENAI_API_KEY)

## Triage protocol

When a new failure appears:

1. **Is it already on this list?** No-op.
2. **Is the root cause a NEW server bug?** Per `client_immutable` and
   `server_harsh_review`, file in
   `../../.planning/phases/09-client-e2e-tests/SERVER-REQUIREMENTS.md`
   as a new R-row (harsh language; server is < 24h old, every spec
   deviation is a bug to file, not a migration to plan). Tag the
   scenario `@blocked-<new-R-id>` and append a row here.
3. **Is the root cause a client-side gap that requires touching
   `main.js` / `preload.js` / `src/`?** Two options ONLY (per
   `client_immutable`): (a) server adapts → SERVER-REQUIREMENTS.md, or
   (b) feature cut from client → CLIENT-CUTS.md. Never patch the client
   to bridge a server gap.
4. **Is it harness flakiness?** Fix the test, atomic commit. Do not
   tag, do not mask a real failure.

## Server requirement closure log

All twelve requirements filed in Phase 8
`SERVER-REQUIREMENTS.md` are closed by the server team as of
2026-05-19. None of the historical tags remain active in the suite:

| ID | Closure date | What landed | Tag retired |
|---|---|---|---|
| R1 | 2026-05-19 | `POST /api/_test/seed-tenant` endpoint (double-gated by `NODE_ENV !== "production"` + `OPENWHISPR_TEST_ROUTES === "true"`). Returns Better-Auth-compatible bearer + pre-verified user. | `blocked-r1` tag (retired) never shipped to `.feature` files — R1 closed before this plan executed. Old `blocked-s5` tag (retired) removed wholesale via R6. |
| R2 | 2026-05-19 | Confirmed Stripe + Referrals not asserted by `packages/contract-tests/`. CLIENT-CUT recorded in `../../.planning/phases/09-client-e2e-tests/CLIENT-CUTS.md` (CC-1, CC-2). | n/a — never had an active tag. |
| R3 | 2026-05-19 | `/api/openai-realtime-token` now matches `docs/BACKEND_SPEC.md`: accepts `{model, language, streams}`, returns `{clientSecret}` (single) or `{clientSecrets[]}` (multi). | `@skip` retired from `realtime-token.feature` → OpenAI realtime scenario. |
| R4 | 2026-05-19 | `/api/health` is first-class: 200 + `{status:"ok"}`, NO `deprecation` header, NO `link` to `/livez`. Both `/api/health` (client) and `/livez` (k8s probe) are first-class. | Header-present assertion flipped to header-absent in `health.feature`. |
| R5 | 2026-05-19 | `/api/auth/verification-status` accepts `?email=` query param without warning; identity continues to be derived from session/Bearer. | `auth.feature` scenario added asserting 200 with `?email=`. |
| R6 | 2026-05-19 | Slim-core compose boots clean; `/readyz` returns 200; postgres reachable. | `blocked-s5` tag (retired) removed wholesale across auth / notes / transcription / reasoning / agent-stream / realtime-token / usage-config + `health::readyz`. |
| R7 | 2026-05-19 | Dockerfile `byok-guard` COPY landed. | n/a — server build concern, never tagged in client e2e. |
| R8 | 2026-05-19 | `/api/notes/batch-create` preserves snake_case `client_note_id` ↔ `id` mapping in `{created:[…]}`. | n/a — covered by new `notes-cjm.feature`. |
| R9 | 2026-05-19 | Folders surface (5 endpoints) implemented per BACKEND_SPEC; referential-integrity choice on DELETE documented in scenario. | n/a — covered by new `folders-cjm.feature`. |
| R10 | 2026-05-19 | Conversations + messages surface (6 endpoints) implemented; cascade-on-delete choice asserted in scenario. | n/a — covered by new `conversations-cjm.feature`. |
| R11 | 2026-05-19 | Transcriptions RECORD CRUD (5 endpoints, distinct from `/api/transcribe` audio inference) implemented. | n/a — covered by new `transcriptions-cjm.feature`. |
| R12 | 2026-05-19 | v1 envelope `{success, data?, error?, code?}` on the 3 `/api/v1/keys/*` endpoints. | n/a — covered by new `api-keys.feature`. |

## Last full run

- 2026-05-20 — pending. The first post-closure run is gated on Task 6
  (operator boots slim-core with `OPENWHISPR_TEST_ROUTES=true`) followed
  by Task 7 (`npm run test:e2e`).
