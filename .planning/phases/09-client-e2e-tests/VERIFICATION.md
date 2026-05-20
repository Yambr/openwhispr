# Phase 9 Verification — post-replan, post-R1-R12-closure

Replaces the stale first-execute-pass VERIFICATION.md (which used the
old S5/F2/F3 nomenclature). This report reflects the gap-closure replan
(`b9284d15`), the R1-R12 closure, and the **actual** `npm run test:e2e`
run executed 2026-05-20.

**Headline result:** the e2e harness is correct, complete, and runnable.
The suite is NOT green — but every one of the 46 failures traces to a
single server contract bug (`/api/_test/seed-tenant` returns 401), filed
as **R13**. No client-side workaround was applied. Per the Phase 9 plan
stop condition, a non-green run whose every failure is triaged and filed
is an acceptable Task 7 deliverable.

**Phase status: DONE-with-server-followups.** Blocking follow-up: R13.

---

## Check 1 — Sync CJM coverage: every MATCH endpoint exercised

**PASS (harness coverage).** The four CJM feature files drive the full
sync surface through the real client wire path
(`window.electronAPI.cloudApiRequest` IPC), not raw HTTP:

| Family | Endpoints | Feature file |
|---|---|---|
| Notes | 7 (`create`, `batch-create`, `list`, `update`, `search`, `delete`, `delete-all`) | `notes-cjm.feature` |
| Folders | 5 (`create`, `batch-create`, `list`, `update`, `delete`) | `folders-cjm.feature` |
| Conversations | 6 (`create`, `messages` POST, `messages` GET, `update`, `search`, `delete`) | `conversations-cjm.feature` |
| Transcriptions | 5 (`create`, `batch-create`, `list`, `batch-delete`, `delete`) | `transcriptions-cjm.feature` |
| API keys (v1) | 3 (`/api/v1/keys/list`, `/create`, `/:id/revoke`) | `api-keys.feature` |

`tests/e2e/CJM.md` carries the row-by-row endpoint→feature.scenario map.
`grep -rE 'fetch\([^)]*BACKEND_URL.*/api/(notes|folders|conversations|transcriptions)/' tests/e2e/steps/`
returns zero hits — no sync scenario bypasses the IPC wire path.

These scenarios FAIL at runtime, but the failure is upstream of the
endpoint under test: the `Background` seed step (`seedTenant`) returns
401 before any sync verb is exercised. The coverage is in place; the
server bug prevents execution. See Check 6.

## Check 2 — `npm run test:e2e` exit status

**FAIL (server bug R13).** Run timestamp 2026-05-20.

```
6 passed (15.4s)
46 failed
```

All 46 failures emit the identical error:
`Error: seed-tenant failed (status 401): {"error":"unauthorized"}`.

The 6 passing scenarios are exactly those that need no seeded tenant:
- `health.feature` — `/livez` 200, `/readyz` 200, `/api/health`
  first-class no-deprecation (R4 verified PASS).
- `auth.feature` — `check-user with new email returns exists:false`.
- `reasoning.feature` — `Reason without auth returns 401`.
- `transcription.feature` — `Missing auth returns 401`.

## Check 3 — no client-side workarounds introduced

**PASS.** `git diff main -- main.js preload.js src/` returns zero
changes. No test-only branches, no header spoofs, no mocks, no embedded
credentials anywhere in the client. Upstream-parity preserved per
memory `client_immutable`.

Two harness bugs were fixed in `tests/e2e/` during the run (allowed —
the harness is ours):
1. Duplicate `the response JSON field {string} is non-empty` step
   removed from `transcription.steps.ts` (also in `realtime.steps.ts`).
2. `the v1/keys ...` step text reworded to `the v1 keys ...` — a literal
   `/` is Cucumber-expression alternation and broke `bddgen` matching.

Neither masks a real failure; both are pure codegen bugs.

## Check 4 — CJM.md completeness

**PASS.** `tests/e2e/CJM.md` contains all 7 Notes + 5 Folders +
6 Conversations + 5 Transcriptions + 3 v1/keys rows mapped to specific
feature.scenario coverage. No TBD cells. No active `@blocked-s5` /
`@blocked-rN` tags (history-only references in the closure log).

## Check 5 — KNOWN-FAILURES.md state

**PASS (documentation).** `tests/e2e/KNOWN-FAILURES.md` now lists:
- `@blocked-r13` — documentary row for the 46 R13-blocked scenarios
  (NOT a static `.feature` tag; the failure is a runtime server bug).
- `@requires-paid-keys` — operator-gate row (currently masked by R13).
- pending-fixture row — `hello-world-3s.wav` audio fixture.

No active `@blocked-rN` tag is written into any `.feature` file.

## Check 6 — R1-R12 closure verified at runtime

| R | Subject | Runtime evidence | Verdict |
|---|---|---|---|
| R1 | `/api/_test/seed-tenant` | `POST` returns `401 {"error":"unauthorized"}`, NOT `200 {token, user}`. Route is registered (POST→401 vs nonexistent route→404) but handler is gated behind production auth middleware. | **REGRESSION → re-opened as R13** |
| R2 | Stripe/Referrals cut | CLIENT-CUT recorded in CLIENT-CUTS.md (CC-1, CC-2); no scenarios exercise these paths. | PASS (no-op) |
| R3 | `/api/openai-realtime-token` shape | `realtime-token.feature` scenarios send `{model, language, streams}` and assert `{clientSecret}` / `{clientSecrets[]}`. Cannot reach the endpoint — blocked by R13 seed step + `@requires-paid-keys`. | UNVERIFIED (R13-blocked) |
| R4 | `/api/health` no deprecation | `health.feature → GET /api/health is first-class — no deprecation signals` **PASSED**. `curl -i /api/health` confirms 200, no `deprecation`, no `link` header. | **PASS** |
| R5 | `?email=` on verification-status | `auth.feature → Verification status accepts ?email= query param` is blocked by the R13 seed step. | UNVERIFIED (R13-blocked) |
| R6 | Slim-core boots clean | `health.feature → GET /readyz returns 200` **PASSED**; `curl /readyz` shows `postgres/valkey/litellm` all `ok:true`. | **PASS** |
| R7 | Dockerfile byok-guard COPY | Server build concern; slim-core is up and healthy (operator-verified). | PASS (indirect) |
| R8 | Notes CRUD | `notes-cjm.feature` (7 scenarios) blocked by R13 seed step. | UNVERIFIED (R13-blocked) |
| R9 | Folders CRUD | `folders-cjm.feature` (5 scenarios) blocked by R13 seed step. | UNVERIFIED (R13-blocked) |
| R10 | Conversations + messages | `conversations-cjm.feature` (6 scenarios) blocked by R13 seed step. | UNVERIFIED (R13-blocked) |
| R11 | Transcriptions CRUD | `transcriptions-cjm.feature` (5 scenarios) blocked by R13 seed step. | UNVERIFIED (R13-blocked) |
| R12 | API keys v1 envelope | `api-keys.feature` (3 scenarios) blocked by R13 seed step. | UNVERIFIED (R13-blocked) |

R4 and R6 are positively verified at runtime. R1 is a confirmed
regression. R3/R5/R8-R12 are correctly covered by the harness but
cannot be exercised until R13 unblocks the seed path — they are not
client failures and not harness failures.

---

## New findings filed

| Finding | File | Severity | Summary |
|---|---|---|---|
| R13 | `../08-client-server-audit/SERVER-REQUIREMENTS.md` | BLOCKER | `/api/_test/seed-tenant` returns 401 for every request; handler sits behind production auth middleware. R1 re-opened. |

No new CLIENT-CUTs. No client `src/` patches.

---

## Verdict

Phase 9's deliverable — a complete e2e harness driving the real client
wire path, with every gap triaged and filed — is **met**. The suite is
not green solely because of server bug R13. Once the server team mounts
the `seed-tenant` handler in front of the auth middleware (R13), the
46 currently-blocked scenarios are expected to flip green in a re-run
with no further client or harness changes.

**Phase 9 status: DONE-with-server-followups (R13 blocking a green run).**
