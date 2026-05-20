# Known Failures

Post-R1–R12-closure status, **as actually observed on the 2026-05-20
full run**. The run surfaced a BLOCKER: `/api/_test/seed-tenant` does
not honor the R1 contract (returns 401, not `{token, user}`). Until the
server fixes that, 46 of 52 scenarios are blocked by a single server
bug, filed as **R13**.

| Tag | Scenario(s) | Root cause | Owner | Linked finding | Last verified |
|---|---|---|---|---|---|
| `@blocked-r13` | All 46 scenarios that require a seeded authenticated tenant (auth, notes-cjm, folders-cjm, conversations-cjm, transcriptions-cjm, api-keys, usage-config, plus the paid-key scenarios which also seed first) | Server `/api/_test/seed-tenant` returns `401 {"error":"unauthorized"}` for every request — the handler sits behind the production Better Auth session middleware instead of in front of it. R1 contract violated; R1 re-opened. | server | `../../.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md` § R13 | 2026-05-20 |
| `@requires-paid-keys` | 8 scenarios in transcription / reasoning / agent-stream / realtime-token (incl. OpenAI realtime) | LiteLLM proxy on the server needs upstream API keys configured (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `DEEPGRAM_API_KEY`). Operator gate, not a server bug. **Currently masked by R13** — these scenarios seed a tenant first, so they fail on R13 before reaching the paid-key path. | operator | n/a (env) | 2026-05-20 |
| pending fixture | `transcription.feature → Multipart upload with a real WAV returns transcribed text` | Audio fixture file not yet checked in: `tests/e2e/fixtures/audio/hello-world-3s.wav`. Step def short-circuits via `test.skip()`. Advisor decision (2026-05-19): "Audio fixture pending stays pending — once R1 lands, the @requires-paid-keys transcription scenario can run; the fixture is its own follow-up." | client | n/a | 2026-05-20 |

> **`@blocked-r13` is documentary, not an active suite tag.** No `@blocked-r13`
> tag is written into the `.feature` files — the failures are a runtime
> server bug, not a statically-skipped scenario. The tag exists here so the
> triage table has a stable identifier. Once R13 closes, this row is deleted
> and the run is re-executed; nothing in the `.feature` files needs editing.

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

## Harness bugs fixed during the 2026-05-20 run (Task 7)

Two genuine harness bugs were found and fixed while bringing the suite
to a runnable state (these are ours to fix, per the triage protocol):

1. **Duplicate step definition.** `the response JSON field {string} is
   non-empty` was defined in *both* `steps/realtime.steps.ts:76` and
   `steps/transcription.steps.ts:75`. `bddgen` aborts on ambiguous
   steps. Removed the `transcription.steps.ts` copy; the
   `realtime.steps.ts` definition is functionally identical and shared.
2. **Cucumber-expression alternation collision.** The api-keys step
   text `the v1/keys ...` contains a `/`, which Cucumber expressions
   treat as *alternative text* (`bird/birds`). `bddgen` could not match
   the literal feature step. Reworded to `the v1 keys ...` in both
   `features/api-keys.feature` and `steps/api-keys.steps.ts`.

Neither fix masks a real failure — they are pure harness/codegen bugs.

## Last full run

- **2026-05-20 — 6 passed / 46 failed.** Single root cause for all 46
  failures: `seed-tenant failed (status 401): {"error":"unauthorized"}`
  → server bug R13. The 6 passing scenarios are exactly those that need
  no seeded tenant: `health.feature` (livez, readyz, /api/health),
  `auth.feature → check-user new email`, `reasoning.feature → no-auth
  401`, `transcription.feature → missing-auth 401`.
- The run is NOT green. Per the Phase 9 plan stop condition, a non-green
  run whose every failure is triaged and filed is an acceptable Task 7
  deliverable: 46/46 failures trace to one filed server bug (R13). No
  client-side workaround was applied; no harness bug masks a real
  failure. Phase 9 status: **DONE-with-server-followups** (R13 blocking).
