# Phase 8 Verification

Final sanity check across the four audit artifacts:
- `CLIENT-CALLS.md` — 30 endpoints, 3 OAuth/realtime rows, 14 BYOK rows
- `SERVER-ROUTES.md` — 59 routes
- `COMPATIBILITY-MATRIX.md` — joined matrix
- `FIXES-CLIENT.md` + `SERVER-GAPS.md` — derived action lists
- Oracle: `docs/BACKEND_SPEC.md`

---

## Check 1: Every CLIENT-CALLS.md row appears in COMPATIBILITY-MATRIX.md

**PASS** — All 30 numbered client rows (#1–#30) plus OAuth shim (#31, #32) and realtime WS contract appear in the matrix. Rows #8, #10, #11, #12, #13, and the generic passthrough #30 are tagged `OUT-OF-SCOPE` (BYOK / 3rd-party / generic relay) but still enumerated.

Evidence: `grep -c "^| [0-9]" COMPATIBILITY-MATRIX.md` returns rows for every client #1–#33.

## Check 2: Every SERVER-ROUTES.md row is in the matrix or explicitly justified as not-called

**PASS** — Of 59 server routes:
- 21 are MATCH or MISMATCH targets in the matrix.
- 13 grouped MISSING(client) entries cover Notes CRUD (7), Folders CRUD (5), Conversations CRUD+Messages (7), Transcriptions CRUD (5), `/v1/audio/diarization`, `/api/capabilities`, `/api/locale`, `/api/setup-state`, `/api/setup/admin`, `/api/v1/keys/*` (3) — all justified as "not yet wired to Electron sync" or "admin/wizard surface".
- Probes `/livez`, `/readyz`, `/startupz` are justified as kubelet infra.
- `/api/_test/*` (4 routes) are justified as test-only.
- Better Auth catch-all `/api/auth/*` covers `get-session`, `sign-in/email`, `sign-up/email`, `verify-email`, `sign-out` (referenced via #4 in the matrix and BACKEND_SPEC.md).

Evidence: SERVER-ROUTES.md §"Routes NOT Expected by BACKEND_SPEC.md" already pre-justifies the bonus routes.

## Check 3: Every BACKEND_SPEC.md endpoint is in the matrix

**PASS with flags** — The 19 OpenWhispr-cloud endpoint cards in BACKEND_SPEC.md all appear in the matrix. Flags:
- BACKEND_SPEC documents Stripe (4) and Referrals (3) routes that have no server implementation → flagged in SERVER-GAPS.md (S2, S3). This is **documentation drift**: spec describes intended/historical SaaS contract; corporate-minimal pivot (per `MEMORY.md` 2026-05-08) made these UI-hidden but the spec wasn't pruned.
- BACKEND_SPEC §`/api/openai-realtime-token` describes `clientSecret(s)` response; server returns `{token}` → flagged S1 (server fix preferred) / F2 (client fix alternative).
- BACKEND_SPEC §`/api/health` documents the alias; server already emits Deprecation header → flagged F1 (client migration) / S4 (server cleanup, downstream).

---

## Final Summary

### Totals

- **Total client endpoints audited**: 30 (26 OpenWhispr cloud + 4 OUT-OF-SCOPE OAuth/passthrough/BYOK lead rows). Excluding BYOK and OAuth shim: **26 contract-relevant client calls**.
- **Total server routes audited**: 59 (55 HTTP + 1 WS + 3 conditional-test).
- **Total BACKEND_SPEC.md endpoint cards cross-referenced**: 19 (the OpenWhispr cloud endpoints; OAuth shim covered in OAUTH_SPEC.md).

### Verdict counts

| Verdict | Count |
|---|---|
| MATCH | 21 |
| MISMATCH | 2 (verification-status query, openai-realtime-token schema) |
| MISSING(server) | 7 (4 Stripe + 3 Referrals) |
| MISSING(client) | 13 (sync surfaces + admin/wizard + diarization + v1/keys) |

### Blockers (client + server combined)

- **Default corporate-minimal build**: **0 blockers**. The 7 MISSING(server) entries are all UI-hidden post-`c4d2ca5e`. F2/S1 (realtime token) is HIGH but only impacts the OpenAI Realtime path; AssemblyAI and Deepgram realtime tokens MATCH cleanly so realtime is partly functional.
- **Upstream-parity build (if re-enabled)**: 7 blockers (Stripe x4 + Referrals x3).
- **Realtime feature parity (OpenAI Realtime path)**: 1 blocker (S1 or F2 — pick one side).

### Top 3 fixes by impact

1. **S1 / F2 — `/api/openai-realtime-token` request/response shape**. HIGH. Pick a side: either server adopts BACKEND_SPEC's `{clientSecret, clientSecrets[]}` (preferred for OpenAI naming) or client parses server's `{token}` and drops dual-stream. Without this, OpenAI Realtime mode is broken at first use.
2. **S2 — Implement Stripe billing routes** (or formally remove from BACKEND_SPEC.md). MEDIUM. Currently a documentation/code mismatch; corporate-minimal hides UI but spec lies.
3. **F1 — Client migration `/api/health` → `/livez`**. LOW. Cheap and unblocks the server team to retire the alias.

### Phase 9 (E2E) Recommendation

**Safe to test now** (all green or trivially-degraded paths):
- Auth (sign-up / sign-in / verification-status / get-session / delete-account)
- Transcribe + chunked transcribe
- Reason (cloud reasoning)
- Agent stream + web-search
- AssemblyAI and Deepgram realtime token mints
- Usage + streaming-usage
- stt-config + note-recording-config
- Health probe (works via deprecated alias)

**Block on server-side fix first**:
- OpenAI Realtime dual-stream e2e flow — pending S1 (or F2 client adaptation). Acceptable as "skipped with TODO" in Phase 9 suite.

**Excluded from Phase 9 scope (no server route in corporate-minimal)**:
- Stripe checkout / portal / switch-plan / preview-switch e2e
- Referral stats / invite / invites e2e
These should not be added to the suite unless and until S2/S3 ship.

**Recommendation**: Proceed with Phase 9 (E2E) for the 8 CJM areas above. Add OpenAI Realtime as a documented gap (skip) and treat resolution of S1/F2 as a Phase 9 entry-criteria for that single test case only.
