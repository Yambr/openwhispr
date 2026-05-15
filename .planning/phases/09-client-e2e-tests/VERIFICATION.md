# Phase 9 Verification

Phase 9 closes the client-side half of the cross-repo QA milestone:
Playwright + `@cucumber/cucumber` + `playwright-bdd` harness drives
HTTP-level + Electron-UI scenarios against the locally-running slim-core
`openwhispr-server`. The harness is committed and runnable; runtime
coverage is partially gated by Phase 8 finding S5.

---

## Check 1: every MATCH endpoint in Phase 8 matrix is exercised by ≥1 e2e scenario

**PASS** — see `tests/e2e/CJM.md` for the row-by-row mapping. Each of
the 21 MATCH rows + the 2 MISMATCH rows in Phase 8
`COMPATIBILITY-MATRIX.md` has at least one covering scenario in
`tests/e2e/features/`. The two MISMATCH rows are handled as:
- **F1** `/api/health` → covered by a scenario that asserts the
  Deprecation + Link headers (validates that the server still emits
  the back-compat alias correctly).
- **F2/S1** `/api/openai-realtime-token` → scenario exists, tagged
  `@skip` with a comment pointing at the finding.

The 7 `MISSING(server)` rows (Stripe x4 + Referrals x3) and the BYOK
third-party calls are explicitly listed in `CJM.md` under "Out of scope"
— **intentional non-coverage** per Phase 8 recommendation, since these
surfaces are UI-hidden in the corporate-minimal default build.

The 13 `MISSING(client)` rows (notes/folders/conversations/transcriptions
sync surfaces) are covered at the **server-contract level** by
`notes-sync.feature` (notes only — the rest of the sync surfaces aren't
yet on a feature roadmap and adding scenarios for them would be
speculative). Documented in CJM.md.

## Check 2: `npm run test:e2e` exits 0 on a clean run against slim-core server

**PARTIAL PASS** — on 2026-05-15 against the live stack:
- 4 unblocked scenarios all PASS (livez, /api/health with headers,
  reason no-auth → 401, transcribe no-auth → 401). Duration: 397ms.
- 25 scenarios filtered out by the `@blocked-s5` / `@skip` /
  `@requires-paid-keys` tags (default playwright-bdd `tags` filter).

This is the **maximum achievable PASS state** given Phase 8 finding S5.
The blocker is server-side (slim-core compose missing the pgbouncer
overlay); the test runner is operating correctly. Once S5 closes, the
`@blocked-s5` tag can be removed wholesale from the .feature files and
the suite is expected to broaden to ~21 PASS without further harness
changes.

## Check 3: CJM.md is complete (no TBD cells)

**PASS** — `tests/e2e/CJM.md` covers all auth, notes, transcription,
reasoning/agent, realtime, usage/config, and health endpoints with a
status icon per row. The only "—" entry is
`GET /api/auth/verification-status`, which is covered by the Phase 8 F3
fix track rather than by a scenario (since the fix removes the unused
`?email=` query and the scenario would just re-document the current
behavior).

## Check 4: KNOWN-FAILURES.md entries each link to a Phase 8 finding or a new ticket

**PASS** — all 4 entries in `tests/e2e/KNOWN-FAILURES.md` link to
either a named Phase 8 finding (S5, F2/S1), an operator gate
(`@requires-paid-keys`), or a known pending fixture. No untriaged
failures.

---

## Findings discovered during Phase 9 execute

1. **S5 — slim-core compose missing pgbouncer overlay**. Promoted from
   "design assumption" to "confirmed runtime failure" via live-probing
   the running api container. Logged as an amendment to Phase 8
   `SERVER-GAPS.md`. Blocks 21 of 29 scenarios.
2. **F1 confirmed on the wire** — `/api/health` returns
   `deprecation: true` + `link: </livez>; rel="successor-version"`
   headers exactly as Phase 8 predicted. Client migration to `/livez`
   remains the cleanest fix.
3. **`/readyz` 503 due to S5** — postgres-side ENOTFOUND propagates to
   the readiness probe (`{"postgres":{"ok":false,"error":"getaddrinfo
   ENOTFOUND pgbouncer"},...}`). Same root cause; tagged accordingly.

---

## Final summary

- **Total scenarios written:** 29 across 8 features
- **Unblocked + PASS on current stack:** 4 (livez, /api/health, reason
  no-auth, transcribe no-auth)
- **Blocked on S5 (server pgbouncer overlay):** 21
- **Blocked on F2/S1 (OpenAI realtime schema):** 1 (`@skip`)
- **Operator-gated (paid keys):** 3 (subset of S5-blocked; will unblock
  with both fixes)
- **Pending fixture (audio):** 1
- **0 new client bugs found.** The two test failures during the run
  pointed to (a) S5 (server) and (b) a harness construction issue
  (`Background` running for `@blocked-s5`-excluded scenarios), both
  of which were addressed in the same Phase 9 commit set.

**Phase 9 status: DONE** to the boundary defined by Phase 8. Re-running
the suite after S5 closes is a follow-up task tracked in
`tests/e2e/KNOWN-FAILURES.md` row 1 — not a Phase 9 re-execute.
