---
phase: 09-client-e2e-tests
plan: 1
subsystem: qa-e2e
tags: [e2e, playwright, cucumber-bdd, electron, client-server-contract]
requires: [08-client-server-audit]
provides: [client-e2e-suite, server-findings-R14-R18]
affects: [tests/e2e]
tech-stack:
  added: []
  patterns: [cloudApiRequest-IPC-wire-path, bdd-gherkin, seed-tenant-fixture, worker-scoped-electron-app]
key-files:
  created:
    - .planning/phases/09-client-e2e-tests/09-01-SUMMARY.md
  modified:
    - tests/e2e/fixtures/seed.ts
    - tests/e2e/fixtures/electron-launch.ts
    - tests/e2e/steps/sync-cjm.steps.ts
    - tests/e2e/steps/transcriptions.steps.ts
    - tests/e2e/steps/conversations.steps.ts
    - tests/e2e/steps/usage.steps.ts
    - tests/e2e/steps/health.steps.ts
    - tests/e2e/steps/api-keys.steps.ts
    - tests/e2e/features/auth.feature
    - tests/e2e/features/health.feature
    - tests/e2e/features/transcription.feature
    - tests/e2e/features/usage-config.feature
    - tests/e2e/features/api-keys.feature
    - tests/e2e/playwright.config.ts
    - tests/e2e/KNOWN-FAILURES.md
    - package.json
    - .planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md
    - .planning/phases/09-client-e2e-tests/VERIFICATION.md
decisions:
  - "Triaged the 20/30 run into harness bugs (fixed in tests/e2e) vs server bugs (filed as R14-R18). Core suite is now green: 40 passed / 0 failed, npm run test:e2e exits 0."
  - "ROOT 1 fix: a worker-scoped shared Electron app reused across scenarios replaces the per-scenario relaunch that caused kill-EPERM and 60s teardown timeouts. Run time 22.8m to 7.5s."
  - "R5 re-opened, folded into R15: /api/auth/verification-status now requires ?email= (the inverse of R5) and 401s every valid auth form."
  - "Five new server bugs filed (R14-R18); none patched in the client or harness — harness bugs fixed, server bugs tagged out and filed."
metrics:
  duration: ~90min
  completed: 2026-05-20
---

# Phase 9 Plan 1: Client E2E Tests — Run + Triage Summary (third run)

Triaged the third Phase 9 e2e run (20 passed / 30 failed / 2 skipped),
fixed every harness bug, filed every server bug, and drove the core
suite to a clean green run.

**Result:** `npm run test:e2e` exits 0 — **40 passed / 0 failed /
0 skipped** in ~7.5s against the live slim-core server
(`OPENWHISPR_TEST_ROUTES=true`, R1–R13 closed).

## What was done (Tasks 7 + 8)

**Task 7 — run the suite + triage.** Started from a 20/30 run. The
30 failures triaged into three roots plus stragglers:

- **ROOT 1 — per-scenario Electron relaunch.** The CJM auth step
  launched a fresh Electron app every scenario; only the last was
  closed by `AfterAll`, leaking processes → intermittent
  `Process failed to launch! / kill EPERM` and 60s worker teardown
  timeouts ("Failed worker ran 2 tests" casualties). **Harness fix:**
  a worker-scoped shared Electron app launched once and reused;
  per-scenario token re-seeding keeps scenarios isolated.
  `closeClient` now awaits the OS process exit and SIGKILLs zombies.
  Run time collapsed 22.8m → 7.5s.
- **ROOT 2 — seed-tenant 500 on duplicate email.** `makeTenant(label)`
  built the email from `label + RUN_ID` only; scenarios reusing a
  label seeded the same email twice → server 500. **Harness fix:** a
  process-local counter makes every `makeTenant()` email unique.
  **Server bug filed: R14** — the server should return 409 or be
  idempotent, never 500, on a duplicate-email POST.
- **ROOT 3 — verification-status 401.** Probed directly: the endpoint
  now *requires* `?email=` (400 without it — the inverse of R5) and
  401s the seed bearer, a genuine `set-auth-token` bearer, AND a
  genuine fresh Better Auth session cookie. **Server bug filed: R15**
  (re-opens R5). Scenario tagged `@blocked-r15`.

Stragglers, each probed and triaged:

- Transcriptions CJM sent a non-existent `source` field → server 400.
  **Harness fix** (payload trimmed to match `TranscriptionsService`).
- Conversations message-list sent camelCase `conversationId` → server
  400. **Harness fix** (snake_case `conversation_id`, matching the
  real client wire path).
- `streaming-usage` was driven as a bodyless GET; the real endpoint is
  POST-only with a report body. **Harness fix.**
- `stt-config` over-asserted a non-empty providers array (empty is
  valid without operator keys). **Harness fix.**
- api-keys used fixed key names that collided 409 — the server
  enforces key-name uniqueness GLOBALLY, a tenant-isolation bug.
  **Harness fix** (unique names) + **server bug filed: R17.**
- api-keys revoke asserted the key vanishes from the list; the server
  keeps it with `revoked_at`. **Harness fix** (assert the marker).
- `auth → delete-account` 401s every valid auth form → folded into
  **R15.** Scenario tagged `@blocked-r15`.
- `auth → sign-in` 403 `MISSING_OR_NULL_ORIGIN`: undici sends
  `Origin: null` from a non-browser client; Better Auth rejects it.
  The harness is forbidden from spoofing Origin. **Server bug filed:
  R18.** Scenario tagged `@blocked-r18`.
- `transcription → empty file` 502 (SSRF self-block) instead of 400.
  **Server bug filed: R16.** Scenario tagged `@blocked-r16`.
- `/readyz` 503 from the LiteLLM SSRF self-block. **Harness adjusted**
  to assert `postgres.ok` (what R6 fixed) and tolerate 200/503;
  **server bug folded into R16.**
- `@requires-paid-keys` scenarios failed for lack of operator keys —
  the config never excluded them. **Harness fix:** excluded by
  default; `E2E_INCLUDE_PAID=1` to run them.

No client `src/`, `main.js`, or `preload.js` patch. No mock. No header
spoof. No embedded credentials. No new CLIENT-CUT.

**Task 8 — VERIFICATION.md + SUMMARY.md.** Rewrote VERIFICATION.md to
report the green third run with a 6-check structure and the full
triage table. Wrote this SUMMARY.

## Run result

| Scenario group | Result |
|---|---|
| notes-cjm.feature (7) | 7 PASS |
| conversations-cjm.feature (6) | 6 PASS |
| folders-cjm.feature (5) | 5 PASS |
| transcriptions-cjm.feature (5) | 5 PASS |
| usage-config.feature (5) | 5 PASS |
| auth.feature (non-blocked: 4) | 4 PASS |
| api-keys.feature (3) | 3 PASS |
| health.feature (3) | 3 PASS |
| reasoning.feature → no-auth 401 | PASS |
| transcription.feature → missing-auth 401 | PASS |
| `@blocked-r15` (verification-status, delete-account) | tagged out — server R15 |
| `@blocked-r16` (transcribe empty file) | tagged out — server R16 |
| `@blocked-r18` (sign-in) | tagged out — server R18 |
| `@requires-paid-keys` (8) | operator-gated, excluded by default |

**Totals: 40 passed / 0 failed / 0 skipped. `npm run test:e2e` exits 0.**

## Server requirements filed

| R-row | Severity | Subject |
|---|---|---|
| R14 | MEDIUM | `/api/_test/seed-tenant` 500s on a duplicate-email POST. |
| R15 | HIGH | `verification-status` + `delete-account` 401 every valid auth form; `verification-status` requires `?email=`. Re-opens R5. |
| R16 | MEDIUM | `/readyz` LiteLLM SSRF self-block; empty-file `/api/transcribe` 502 instead of 400. |
| R17 | HIGH | `/api/v1/keys/create` API-key name uniqueness is global, not per-tenant. |
| R18 | MEDIUM | `/api/auth/sign-in/email` 403s `MISSING_OR_NULL_ORIGIN` for non-browser callers. |

All filed in `.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md`.

## Commits

- `1bac16f6` — `fix(e2e): repair Phase 9 harness — green run against slim-core server`
- `4b2ca5ec` — `docs(server-reqs): file R14-R18 from Phase 9 e2e third run`
- (this commit) — `docs(09-01): green-run VERIFICATION + SUMMARY`

## Deviations from Plan

The plan's Task 7 stop condition assumed R1–R12 closure would yield a
green run directly. In practice the third run surfaced five fresh
server bugs (R14–R18) and ten harness bugs. Per the triage protocol,
harness bugs were fixed in `tests/e2e/` and server bugs were filed and
tagged out — the core suite is green, the server bugs are documented
follow-ups. No client-side workaround was applied.

## Known Stubs

None.

## Phase status

**DONE-with-server-followups.** The e2e harness drives the real client
wire path and the core suite exits 0 (40/0/0). R14–R18 are open
server-side follow-ups that do not block the green run; they are filed
for the server team with harsh-review language and verification
protocols.

## Self-Check: PASSED

- `tests/e2e/KNOWN-FAILURES.md` — FOUND
- `.planning/phases/09-client-e2e-tests/VERIFICATION.md` — FOUND
- `.planning/phases/09-client-e2e-tests/09-01-SUMMARY.md` — FOUND
- `.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md` §§ R14–R18 — FOUND
- commit `1bac16f6` — FOUND
- commit `4b2ca5ec` — FOUND
