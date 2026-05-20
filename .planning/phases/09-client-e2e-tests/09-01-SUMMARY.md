---
phase: 09-client-e2e-tests
plan: 1
subsystem: qa-e2e
tags: [e2e, playwright, cucumber-bdd, electron, client-server-contract]
requires: [08-client-server-audit]
provides: [client-e2e-suite, server-finding-R13]
affects: [tests/e2e]
tech-stack:
  added: []
  patterns: [cloudApiRequest-IPC-wire-path, bdd-gherkin, seed-tenant-fixture]
key-files:
  created:
    - .planning/phases/09-client-e2e-tests/09-01-SUMMARY.md
  modified:
    - tests/e2e/steps/transcription.steps.ts
    - tests/e2e/steps/api-keys.steps.ts
    - tests/e2e/features/api-keys.feature
    - tests/e2e/KNOWN-FAILURES.md
    - .planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md
    - .planning/phases/09-client-e2e-tests/VERIFICATION.md
decisions:
  - "Non-green e2e run accepted as the Task 7 deliverable: all 46 failures trace to one filed server bug (R13), fully triaged, zero client patches."
  - "R1 re-opened as R13 — the shipped /api/_test/seed-tenant handler is gated behind production auth middleware and returns 401 for every request."
metrics:
  duration: ~25min
  completed: 2026-05-20
---

# Phase 9 Plan 1: Client E2E Tests — Run + Triage Summary

Ran the gap-closure e2e harness against the live slim-core
`openwhispr-server`, triaged every failure to root cause, and filed the
single blocking server bug. The harness is complete and correct; the
suite is not green only because of server contract bug R13.

## What was done (Tasks 7 + 8)

**Task 7 — run the suite + triage.** Cleared the stale `.playwright-bdd`
generated specs and re-ran `npm run test:e2e`. Two genuine harness
codegen bugs surfaced and were fixed (the harness is ours to fix):

1. **Duplicate step definition.** `the response JSON field {string} is
   non-empty` was defined in both `realtime.steps.ts` and
   `transcription.steps.ts`; `bddgen` aborts on ambiguous steps. Removed
   the `transcription.steps.ts` copy (functionally identical, shared).
2. **Cucumber-expression alternation collision.** The api-keys step text
   `the v1/keys ...` contains a literal `/`, which Cucumber expressions
   parse as alternative text. `bddgen` could not match the feature step.
   Reworded to `the v1 keys ...` in both the feature and step files.

After the harness fixes the suite ran cleanly to completion:
**6 passed / 46 failed.** Every one of the 46 failures emits the
identical error — `seed-tenant failed (status 401):
{"error":"unauthorized"}` — a single server contract bug.

**Triage outcome:** the failure is a **server contract bug**.
`/api/_test/seed-tenant` is supposed to mint the first bearer for an
unauthenticated test caller (R1 contract: "bypasses Origin check, skips
email verification, mints a bearer"). Instead the handler sits behind
the production Better Auth session middleware and rejects every request
with 401. Proof: a nonexistent `/api/_test/*` route returns 404 while
`POST /api/_test/seed-tenant` returns 401 — the route IS registered, the
handler IS reached, and it rejects on missing session. Requiring a
bearer to call the bearer-minting endpoint is circular.

Filed as **R13** in `08-client-server-audit/SERVER-REQUIREMENTS.md` with
harsh-review language: exact wire deviation, the 404/401/404 proof
triplet, required server behavior (mount the handler in front of the
auth middleware), rejected anti-patterns (no static test bearer, no
regression to `/api/auth/sign-up/email`). R13 re-opens R1.

No client `src/` patch. No mock. No header spoof. No embedded
credentials. No new CLIENT-CUT.

**Task 8 — VERIFICATION.md + SUMMARY.md.** Replaced the stale
VERIFICATION.md (old S5/F2/F3 nomenclature) with a post-closure report
using R1-R13 nomenclature, a 6-check structure, and a runtime R1-R12
verdict table. Wrote this SUMMARY.

## Run result

| Scenario group | Result | Triage disposition |
|---|---|---|
| `health.feature` (livez, readyz, /api/health) | 3 PASS | R4 + R6 verified PASS |
| `auth.feature → check-user new email` | PASS | no seed needed |
| `reasoning.feature → no-auth 401` | PASS | no seed needed |
| `transcription.feature → missing-auth 401` | PASS | no seed needed |
| `auth.feature` (6 seeded scenarios) | FAIL | server bug R13 |
| `notes-cjm.feature` (7) | FAIL | server bug R13 |
| `folders-cjm.feature` (5) | FAIL | server bug R13 |
| `conversations-cjm.feature` (6) | FAIL | server bug R13 |
| `transcriptions-cjm.feature` (5) | FAIL | server bug R13 |
| `api-keys.feature` (3) | FAIL | server bug R13 |
| `usage-config.feature` (5) | FAIL | server bug R13 |
| `realtime-token.feature` (4) | FAIL | server bug R13 (seed step) |
| `agent-stream.feature` (2), `reasoning` (1), `transcription` (2) | FAIL | server bug R13 (seed step) |

**Totals: 6 passed, 46 failed.** 100% of failures = R13.

## Server requirements filed

| R-row | File | Severity | Subject |
|---|---|---|---|
| R13 | `.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md` | BLOCKER | `/api/_test/seed-tenant` returns 401 for every request — handler behind production auth middleware. R1 re-opened. |

## Files touched

- `tests/e2e/steps/transcription.steps.ts` — removed duplicate step.
- `tests/e2e/steps/api-keys.steps.ts` — reworded `v1/keys` → `v1 keys`.
- `tests/e2e/features/api-keys.feature` — same rewording.
- `tests/e2e/KNOWN-FAILURES.md` — actual run result + R13 row + harness-fix log.
- `.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md` — R13 added.
- `.planning/phases/09-client-e2e-tests/VERIFICATION.md` — replaced.
- `.planning/phases/09-client-e2e-tests/09-01-SUMMARY.md` — this file.

## Deviations from Plan

**1. [Rule 1 — Harness bug] Removed duplicate step definition.** Found
during Task 7 (`bddgen` aborted). `transcription.steps.ts` and
`realtime.steps.ts` both defined `the response JSON field {string} is
non-empty`. Deleted the `transcription.steps.ts` copy. Committed in
`fe8846af`.

**2. [Rule 1 — Harness bug] Reworded `v1/keys` step text.** Found during
Task 7. A literal `/` in Gherkin step text is Cucumber-expression
alternation; `bddgen` could not match `the v1/keys ...`. Reworded to
`the v1 keys ...`. Committed in `fe8846af`.

These are harness bugs (the harness is ours), not client or server
changes. Both were introduced by Tasks 3/4 of this plan.

## Known Stubs

None.

## Phase status

**DONE-with-server-followups.** The e2e harness is complete and drives
the real client wire path; every failure is triaged and filed. A green
run is blocked solely by server bug R13. Once the server team mounts the
`seed-tenant` handler in front of the auth middleware, the 46
currently-blocked scenarios are expected to pass in a re-run with no
further client or harness changes.

## Self-Check: PASSED

- `tests/e2e/features/api-keys.feature` — FOUND
- `tests/e2e/KNOWN-FAILURES.md` — FOUND
- `.planning/phases/09-client-e2e-tests/VERIFICATION.md` — FOUND
- `.planning/phases/09-client-e2e-tests/09-01-SUMMARY.md` — FOUND
- `.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md` § R13 — FOUND
- commit `fe8846af` — FOUND
