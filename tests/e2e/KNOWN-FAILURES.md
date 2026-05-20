# Known Failures

Post-R1–R18-closure status, **as observed on the 2026-05-20 fourth
full run** (after the server team verified R14–R18 closed in Phase 59).

The core suite is **GREEN**: `npm run test:e2e` exits 0 — **44 passed
/ 0 failed / 0 skipped** in ~8.3s against the live slim-core server
(`OPENWHISPR_TEST_ROUTES=true`).

All R-rows R1–R18 are closed. The three formerly `@blocked-rN`
scenarios (R15 delete-account, R15 verification-status, R18 sign-in)
plus the R16 empty-file scenario were un-tagged and now run green —
that is the +4 over the previous 40-passed run.

## Active suite gates

The only standing gate is the operator-controlled `@requires-paid-keys`
group. There are **no `@blocked-rN` gates** — every server requirement
is closed.

| Tag | Scenario(s) | Root cause | Owner | Linked finding | Last verified |
|---|---|---|---|---|---|
| `@requires-paid-keys` | 8 scenarios across `transcription` / `reasoning` / `agent-stream` / `realtime-token` | Call upstream paid providers (OpenAI / AssemblyAI / Deepgram / LiteLLM). Require the operator to provision real upstream keys on the server. **Operator concern, not a server bug.** Excluded by default; `E2E_INCLUDE_PAID=1` to run them. | operator | n/a (env) | 2026-05-20 |
| pending fixture | `transcription.feature → Multipart upload with a real WAV returns transcribed text` | Audio fixture not yet checked in: `tests/e2e/fixtures/audio/hello-world-3s.wav`. Also `@requires-paid-keys`. Advisor decision: the fixture is its own follow-up. | client | n/a | 2026-05-20 |

### How the R15/R16/R18 scenarios were un-blocked

- **R15** (server commit `85a67858`) — `verification-status` `?email=`
  is now optional; both it and `delete-account` resolve a genuine
  Better Auth session **cookie** (they are cookie-only by design — the
  seed-tenant bearer is not honored there). The harness gained a
  `signIn()` fixture helper + a `Given a signed-in tenant` step that
  completes a real `sign-in/email` and carries the session cookie.
  This is the documented client credential path, not a workaround.
- **R16** (server commits `f512dea5` + `d416f231`) — empty-file
  `POST /api/transcribe` now returns `400` before any upstream call;
  `/readyz` LiteLLM probe passes (internal host allowlisted).
- **R18** (server commits `22d29d7c` + `cd4c4f9e`) — `sign-in/email`
  accepts a null Origin under `OPENWHISPR_TEST_ROUTES`, so Node's
  undici `fetch` drives it directly. No Origin spoof.

## `@requires-paid-keys` scenarios (operator concern, NOT server bugs)

Excluded by default (`not @requires-paid-keys` in the config tag
filter). They only pass when the operator has wired the corresponding
upstream keys into the server `.env`:

- `transcription.feature → Multipart upload with a real WAV` (also gated on audio fixture)
- `reasoning.feature → non-empty content` (LLM keys)
- `agent-stream.feature → NDJSON finish chunk` (LLM keys)
- `agent-stream.feature → results array` (LLM keys + web-search)
- `realtime-token.feature → AssemblyAI streaming token mint`
- `realtime-token.feature → Deepgram streaming token mint`
- `realtime-token.feature → OpenAI realtime token mint (single stream)`
- `realtime-token.feature → OpenAI realtime token mint (two streams)`

## Triage protocol

When a new failure appears:

1. **Is it already on this list?** No-op.
2. **Is the root cause a NEW server bug?** Per `client_immutable` and
   `server_harsh_review`, file in
   `../../.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md`
   as a new R-row (harsh language; server is < 24h old, every spec
   deviation is a bug to file, not a migration to plan). Tag the
   scenario `@blocked-<new-R-id>`, exclude it in `playwright.config.ts`,
   and append a row here.
3. **Is the root cause a client-side gap that requires touching
   `main.js` / `preload.js` / `src/`?** Two options ONLY (per
   `client_immutable`): (a) server adapts → SERVER-REQUIREMENTS.md, or
   (b) feature cut from client → CLIENT-CUTS.md. Never patch the client
   to bridge a server gap.
4. **Is it harness flakiness or a harness contract bug?** Fix the test
   code in `tests/e2e/`, atomic commit. Do not tag, do not mask a real
   failure.

## Server requirement closure log

**All of R1–R18 are closed.** R14–R18 were filed by the 2026-05-20
Phase 9 third run and closed the same day by the server team's
Phase 59. Closure was independently re-verified live against the
slim-core stack (2026-05-20 fourth run).

| ID | Status | Subject |
|---|---|---|
| R1 | ✅ closed (via R13) | `POST /api/_test/seed-tenant` endpoint. |
| R2 | ✅ closed | Stripe + Referrals confirmed not in contract-tests. |
| R3 | ✅ closed | `/api/openai-realtime-token` shape per BACKEND_SPEC. |
| R4 | ✅ closed | `/api/health` deprecation header removed. |
| R5 | ✅ closed (via R15) | `?email=` on `/api/auth/verification-status` is now OPTIONAL. |
| R6 | ✅ closed | Slim-core compose boots; postgres reachable. |
| R7 | ✅ closed | Dockerfile `byok-guard` COPY. |
| R8–R12 | ✅ closed | Notes / Folders / Conversations / Transcriptions / v1-keys CRUD surfaces — all verified GREEN by the CJM feature files. |
| R13 | ✅ closed | seed-tenant reachable without a bearer (`auth:false`). |
| R14 | ✅ closed | seed-tenant idempotent on duplicate email (commits `c96ed3e9` + `d391961e`). |
| R15 | ✅ closed | `verification-status` `?email=` optional; cookie-only `/api/auth/*` routes resolve a genuine session (commit `85a67858`). Re-closes R5. |
| R16 | ✅ closed | `/readyz` LiteLLM allowlisted; empty-file `/api/transcribe` → 400 (commits `f512dea5` + `d416f231`). |
| R17 | ✅ closed | API-key name uniqueness re-scoped to `(user_id, name)` (commit `3a7098af`, migration 0028). |
| R18 | ✅ closed | `sign-in/email` accepts a null Origin under `OPENWHISPR_TEST_ROUTES` (commits `22d29d7c` + `cd4c4f9e`). |

## Harness bugs fixed during the 2026-05-20 run (Task 7)

Genuine harness bugs found and fixed while bringing the suite to a
clean green run. Each is ours to fix per the triage protocol; none
masks a real failure.

1. **Per-scenario Electron relaunch → `Process failed to launch! /
   kill EPERM` + 60s worker teardown timeouts.** The CJM auth step
   launched a fresh Electron app per scenario; only the *last* one was
   closed by `AfterAll`, leaking processes and causing intermittent
   launch/kill failures (a 22.8-minute run, "Failed worker ran 2
   tests" casualties). Fixed: a worker-scoped shared Electron app
   launched once and reused; per-scenario token re-seeding keeps
   scenarios isolated. `closeClient` now awaits the OS process exit
   and SIGKILLs a stuck process. Run time dropped 22.8m → ~7.5s.
2. **seed-tenant email reuse → server 500.** `makeTenant(label)` built
   the email from `label + RUN_ID` only; scenarios reusing a `label`
   (e.g. every notes-cjm scenario calls `makeTenant("notes")`) seeded
   the same email twice → server 500 (the underlying server bug is
   R14). Fixed: a process-local monotonic counter makes every
   `makeTenant()` call yield a globally unique email. The false
   "idempotent on email" claim was removed from the fixture docstring.
3. **Transcriptions payload sent a non-existent `source` field.** The
   transcriptions CJM steps posted `{ text, source: "e2e-test" }`; the
   real client `TranscriptionInput` has no `source` field and the
   server rejects unrecognized keys with 400. Fixed: payload trimmed
   to match `src/services/TranscriptionsService.ts`.
4. **Conversations message list used the wrong query param.** The step
   sent `?conversationId=` (camelCase); the real client wire path
   (`ConversationsService.listMessages`) sends `?conversation_id=`
   (snake_case), which is what the server expects. Fixed.
5. **`/api/streaming-usage` driven as a bodyless GET.** An earlier
   draft invented `GET /api/streaming-usage`; the real endpoint is
   POST-only and requires the BACKEND_SPEC usage-report body. Fixed.
6. **`@requires-paid-keys` not excluded by default.** The config
   comment claimed paid scenarios were "already implicit"-ly excluded;
   they were not, so they ran and failed for lack of operator keys.
   Fixed: `not @requires-paid-keys` added to the default tag filter.
7. **`stt-config` over-asserted a non-empty provider list.** The step
   required `availableProviders` to be non-empty; that array is empty
   when the operator has configured no STT keys — a valid response.
   Fixed: assert a well-formed array, not a populated one.
8. **api-keys revoke over-asserted list removal.** The step asserted a
   revoked key vanishes from `/api/v1/keys/list`; the server keeps it
   with a `revoked_at` timestamp (standard API-key management). Fixed:
   assert `revoked_at` is set, not row absence.
9. **api-keys name reuse across scenarios → 409.** Fixed-name keys
   (`e2e-key-1/2/3`) collided because the server enforces key-name
   uniqueness globally (server bug R17). Fixed: unique key names per
   call.
10. **`npm run test:e2e` did not run `bddgen`.** The script was bare
    `playwright test`; with a cleared `.playwright-bdd` cache it found
    0 tests. Fixed: the script now runs `bddgen` first.

## Last full run

- **2026-05-20 (fourth run) — 44 passed / 0 failed / 0 skipped,
  ~8.3s.** `npm run test:e2e` exits 0 against the live slim-core
  server with `OPENWHISPR_TEST_ROUTES=true`, after the server team
  closed R14–R18 in Phase 59.
- Every scenario that is NOT in the green run is operator-gated
  (`@requires-paid-keys`). There are no `@blocked-rN` gates left — all
  server requirements are closed. No client-side workaround was
  applied; no harness bug masks a real failure.
- Phase 9 status: **DONE** — the core suite is fully green and all
  server follow-ups (R14–R18) are closed and re-verified.
