# Known Failures

Post-R1–R13-closure status, **as actually observed on the 2026-05-20
third full run (Task 7)**.

The core suite is **GREEN**: `npm run test:e2e` exits 0 — **40 passed
/ 0 failed / 0 skipped** in ~7.5s against the live slim-core server
(`OPENWHISPR_TEST_ROUTES=true`).

The triage of the earlier 20-passed/30-failed run resolved every
failure into one of two buckets: **harness bug we fixed**, or **server
bug filed as a new R-row (R14–R18)** and tagged out. Nothing is masked.

## Active suite gates

| Tag | Scenario(s) | Root cause | Owner | Linked finding | Last verified |
|---|---|---|---|---|---|
| `@blocked-r15` | `auth.feature → Delete account returns 200`; `auth.feature → Verification status accepts ?email= query param` | `/api/auth/delete-account` and `/api/auth/verification-status` return 401 for **every** valid auth form — seed-tenant bearer, a genuine `set-auth-token` bearer, AND a genuine fresh Better Auth session cookie. `verification-status` additionally now *requires* `?email=` (400 without it — the inverse of R5). Re-opens R5. | server | `../../.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md` § R15 | 2026-05-20 |
| `@blocked-r16` | `transcription.feature → Empty file returns 400` | An empty-file `POST /api/transcribe` returns `502 {"error":"Upstream blocked by SSRF policy"}` instead of `400`. Server forwards the zero-byte file to the STT upstream (no empty-file validation) and its own SSRF allowlist then blocks the internal upstream host. | server | SERVER-REQUIREMENTS.md § R16 | 2026-05-20 |
| `@blocked-r18` | `auth.feature → Sign-in with verified user returns a session bearer` | `POST /api/auth/sign-in/email` returns `403 MISSING_OR_NULL_ORIGIN` for any caller sending `Origin: null` — which Node's undici `fetch` always does from a non-browser client. The harness is forbidden from spoofing an Origin header (CONTEXT rule 3). Server must accept a null Origin on sign-in under `OPENWHISPR_TEST_ROUTES`. | server | SERVER-REQUIREMENTS.md § R18 | 2026-05-20 |
| `@requires-paid-keys` | 8 scenarios across `transcription` / `reasoning` / `agent-stream` / `realtime-token` | Call upstream paid providers (OpenAI / AssemblyAI / Deepgram / LiteLLM). Require the operator to provision real upstream keys on the server. **Operator concern, not a server bug.** Excluded by default; `E2E_INCLUDE_PAID=1` to run them. | operator | n/a (env) | 2026-05-20 |
| pending fixture | `transcription.feature → Multipart upload with a real WAV returns transcribed text` | Audio fixture not yet checked in: `tests/e2e/fixtures/audio/hello-world-3s.wav`. Also `@requires-paid-keys`. Advisor decision: the fixture is its own follow-up. | client | n/a | 2026-05-20 |

All `@blocked-rN` tags ARE written into the `.feature` files and
excluded by the `playwright.config.ts` tag filter by default. Run with
`E2E_INCLUDE_BLOCKED=1` to re-probe them once the server team reports a
fix.

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

R1–R13 are closed by the server team. R14–R18 were filed by the
2026-05-20 Phase 9 e2e third run (Task 7).

| ID | Status | Subject |
|---|---|---|
| R1 | ✅ closed (via R13) | `POST /api/_test/seed-tenant` endpoint. |
| R2 | ✅ closed | Stripe + Referrals confirmed not in contract-tests. |
| R3 | ✅ closed | `/api/openai-realtime-token` shape per BACKEND_SPEC. |
| R4 | ✅ closed | `/api/health` deprecation header removed. |
| R5 | ❌ RE-OPENED (folded into R15) | `?email=` on `/api/auth/verification-status` — server now *requires* the param and 401s every auth form. |
| R6 | ✅ closed | Slim-core compose boots; postgres reachable. |
| R7 | ✅ closed | Dockerfile `byok-guard` COPY. |
| R8–R12 | ✅ closed | Notes / Folders / Conversations / Transcriptions / v1-keys CRUD surfaces — all verified GREEN by the CJM feature files. |
| R13 | ✅ closed | seed-tenant reachable without a bearer (`auth:false`). |
| R14 | 🔴 OPEN | seed-tenant 500s on a duplicate-email POST (should be 409 or idempotent). MEDIUM. Harness no longer triggers it (unique emails per call). |
| R15 | 🔴 OPEN | `/api/auth/verification-status` + `/api/auth/delete-account` 401 every valid auth form; `verification-status` requires `?email=`. Re-opens R5. HIGH. |
| R16 | 🔴 OPEN | `/readyz` LiteLLM subsystem self-blocked by the server's own SSRF allowlist (aggregate probe stuck at 503). Empty-file `/api/transcribe` 502s instead of 400. MEDIUM. |
| R17 | 🔴 OPEN | `/api/v1/keys/create` enforces API-key name uniqueness GLOBALLY instead of per-tenant — tenant-isolation defect. HIGH. Harness no longer triggers it (unique names). |
| R18 | 🔴 OPEN | `/api/auth/sign-in/email` 403s `MISSING_OR_NULL_ORIGIN` for any non-browser caller (undici sends `Origin: null`). MEDIUM. |

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

- **2026-05-20 (Task 7, third run) — 40 passed / 0 failed / 0 skipped,
  ~7.5s.** `npm run test:e2e` exits 0 against the live slim-core
  server with `OPENWHISPR_TEST_ROUTES=true`.
- Every scenario that is NOT in the green run is either an
  operator-gated `@requires-paid-keys` scenario or a `@blocked-rN`
  scenario backed by a filed server requirement (R15 / R16 / R18). No
  client-side workaround was applied; no harness bug masks a real
  failure.
- Phase 9 status: **DONE-with-server-followups** — the core suite is
  green; R14–R18 are open server follow-ups that do not block the
  green run.
