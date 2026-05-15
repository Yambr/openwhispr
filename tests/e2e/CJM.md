# CJM Coverage Matrix — Phase 9 E2E Suite

Maps every endpoint marked `MATCH` or `MISMATCH` in Phase 8
`COMPATIBILITY-MATRIX.md` to its covering feature/scenario in
`tests/e2e/features/`. `MISSING(server)` endpoints (Stripe + Referrals)
are explicitly listed as out-of-scope. `MISSING(client)` endpoints (sync
surfaces not yet wired to UI) are covered at the server-contract level
only.

Status legend:
- ✅ PASS — scenario passes on the current stack
- 🔒 @blocked-s5 — blocked by Phase 8 finding S5 (server missing pgbouncer)
- 💳 @requires-paid-keys — needs upstream API keys configured on server
- ⏭️ @skip — blocked by named Phase 8 finding
- 🚫 OUT — out of scope for corporate-minimal build

---

## Auth (Phase 8 matrix rows 1–4, 31–32)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/auth/sign-up/email` | auth.feature → Sign-up new user | 🔒 @blocked-s5 |
| `POST /api/auth/sign-in/email` | auth.feature → Sign-in with verified user | 🔒 @blocked-s5 |
| `POST /api/auth/sign-out` | auth.feature → Sign-out | 🔒 @blocked-s5 |
| `DELETE /api/delete-account` | auth.feature → Delete account | 🔒 @blocked-s5 |
| `POST /api/check-user` | auth.feature → check-user existing/new | 🔒 @blocked-s5 |
| `GET /api/auth/verification-status` | _no scenario yet_ — covered by Phase 8 F3 fix track | — |

## Notes (rows C1–C7, all MISSING(client))

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/notes/create` | notes-sync.feature → Create a note | 🔒 @blocked-s5 @server-only |
| `GET /api/notes/list` | notes-sync.feature → List notes | 🔒 @blocked-s5 @server-only |
| `PATCH /api/notes/update` | notes-sync.feature → Update a note | 🔒 @blocked-s5 @server-only |
| `DELETE /api/notes/delete` | notes-sync.feature → Delete + Fetching deleted | 🔒 @blocked-s5 @server-only |

## Transcription (rows 7–8)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/transcribe` (multipart) | transcription.feature → happy path | 🔒 💳 |
| `POST /api/transcribe` (empty file) | transcription.feature → 400 | 🔒 |
| `POST /api/transcribe` (no auth) | transcription.feature → 401 | ✅ PASS |

## Reasoning + agent (rows 9–11)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/reason` (happy) | reasoning.feature → non-empty content | 🔒 💳 |
| `POST /api/reason` (no auth) | reasoning.feature → 401 | ✅ PASS |
| `POST /api/agent/stream` | agent-stream.feature → NDJSON finish chunk | 🔒 💳 |
| `POST /api/agent/web-search` | agent-stream.feature → results array | 🔒 💳 |

## Realtime token mint (rows 18–20)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `POST /api/streaming-token` (AssemblyAI) | realtime-token.feature → AssemblyAI | 🔒 💳 |
| `POST /api/deepgram-streaming-token` | realtime-token.feature → Deepgram | 🔒 💳 |
| `POST /api/openai-realtime-token` | realtime-token.feature → OpenAI | ⏭️ @skip (F2/S1) |

## Usage + config (rows 15–17)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `GET /api/usage` (auth) | usage-config.feature → quota shape | 🔒 |
| `GET /api/usage` (no auth) | usage-config.feature → 401 | 🔒 |
| `GET /api/streaming-usage` | usage-config.feature → 200 | 🔒 |
| `GET /api/stt-config` | usage-config.feature → providers array | 🔒 |
| `GET /api/note-recording-config` | usage-config.feature → 200 | 🔒 |

## Health (rows 21–22)

| Endpoint | Feature.scenario | Status |
|---|---|---|
| `GET /livez` | health.feature → 200 + {"status":"ok"} | ✅ PASS |
| `GET /readyz` | health.feature → 200 | 🔒 @blocked-s5 (postgres unreachable) |
| `GET /api/health` | health.feature → 200 + deprecation header | ✅ PASS (validates F1) |

## Out of scope

These endpoints have NO matching scenario and SHOULD NOT have one in
the corporate-minimal e2e suite:

| Endpoint | Reason |
|---|---|
| `POST /api/stripe/checkout` | 🚫 UI-gated (commit `c4d2ca5e`) + MISSING(server) per S2 |
| `POST /api/stripe/portal` | 🚫 same |
| `POST /api/stripe/switch-plan` | 🚫 same |
| `POST /api/stripe/preview-switch` | 🚫 same |
| `GET /api/referrals/stats` | 🚫 UI-gated + MISSING(server) per S3 |
| `POST /api/referrals/invite` | 🚫 same |
| `GET /api/referrals/invites` | 🚫 same |
| BYOK direct calls to openai.com / anthropic.com / etc. | 🚫 not part of openwhispr-server contract |

## Pending fixtures

- `tests/e2e/fixtures/audio/hello-world-3s.wav` — checked-in 3-second WAV
  with known transcript "hello world". Required by transcription happy
  path. Until on disk, the step def calls `test.skip(true, "audio fixture
  pending")`. Add when first paid-keys live run is scheduled.

## Tag conventions

- `@blocked-s5` — depends on DB; blocked by Phase 8 finding S5
- `@requires-paid-keys` — needs upstream STT/LLM keys on the server
- `@requires-assemblyai` / `@requires-deepgram` — gated on
  `OPENWHISPR_E2E_ASSEMBLYAI_AVAILABLE=1` /
  `OPENWHISPR_E2E_DEEPGRAM_AVAILABLE=1` flags
- `@skip` — permanently skipped pending a Phase 8 finding fix
- `@server-only` — scenario drives the server contract directly via
  `fetch()`, not through the Electron UI
