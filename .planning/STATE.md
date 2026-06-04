---
gsd_state_version: 1.0
milestone: v1.8.0
milestone_name: Custom Server URL Onboarding
status: ready-to-ship
last_updated: "2026-05-27T10:40:00.000Z"
last_activity: 2026-06-03 — v1.7.18: explicit requestKind discriminator on /api/reason body (cleanup|agent|summary|title), replacing server-side systemPrompt heuristic. Contract agreed byte-for-byte with server peer. 149/149 vitest, tsc clean, review GO. Prior: v1.7.17 (#8/#9/WR-01) released, 18 assets.
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 10
  completed_plans: 10
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-26)

**Core value:** A maintainer or end-user can produce a corporate-minimal OpenWhispr binary that talks to their own backend with only the OAuth providers they want — at build time today, and at runtime via onboarding starting in v1.8.0.
**Current focus:** v1.8.0 Phase 1 — Backend URL SoT Consolidation + Dynamic Better Auth.

## Current Position

Phase: 1 of 5 (Backend URL SoT Consolidation + Dynamic Better Auth)
Plan: — (not yet planned)
Status: Not started — roadmap created, ready to plan Phase 1
Last activity: 2026-06-04 — Completed quick task 260604-gpc: corporate self-hosted data-plane host fixes (RC-1..RC-4) + BL-01 review fix. 173/173 tests, tsc clean, DCE gate still 0 violations, all 6 must-haves verified. PRE-TAG GATES before v1.7.19: (1) RC-4 packed-asar smoke (onnxWorker.js ships + "onnx worker spawned" in packed log + semantic search works); (2) corporate live-verification (real update flow vs internal 10.177.236.0 backend — cloud requests now reach corp host, realtime meeting transcription works).

Progress: [░░░░░░░░░░] 0%

## Deferred Items

Items acknowledged and deferred at v1.7.2 milestone close on 2026-05-26:

| Category | Item | Status | Notes |
|----------|------|--------|-------|
| uat | phase-03 03-HUMAN-UAT.md | partial | 2 pending scenarios (default-build smoke walk, custom-protocol Google Calendar smoke) |
| uat | phase-04 04-HUMAN-UAT.md | unsigned | SC #4 signed-build sign-off blank; de-facto verified by shipped v1.7.6/7/8 releases |
| verification | phase-04 04-VERIFICATION.md | gaps_found | CFG-03 partial (IntegrationsView.tsx Google Calendar card not gated standalone — superseded in default by Phase 10 PROVIDER_LOCKDOWN_ENABLED) |
| quick_task | 260521-wt4-corporate-minimal-ui-fixes | done | sentinel present, audit-open false-positive |
| quick_task | 260522-wt5-lockdown-leaks-notes-mcp | done | findings committed (39fe0576); SUMMARY pending bookkeeping |
| quick_task | 260522-wt6-realtime-streaming-lockdown | done | sentinel + live-run.mjs present |
| quick_task | 260523-byok-preload-hotfix | done | work shipped in commit 16543048; REVIEW.md filed, SUMMARY pending bookkeeping |
| quick_task | 260526-ix4-client-realtime-wss-pass-settings-prefer | done | SUMMARY present |
| quick_task | 260526-lang-realtime-preferred-language | done | work shipped in commits 081493a2, 146868cc, 6909d5fc (under ix4 follow-up) |

All 9 items are documented as known tech debt in MILESTONES.md and accepted at close.
See `.planning/milestones/v1.7.2-MILESTONE-AUDIT.md` and `.planning/v1.7.2-INTEGRATION-CHECK.md` for the full audit.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:

- 2026-05-26 (v1.8.0 milestone): Backend host selection moves to runtime via onboarding screen, gated by build-time `OPENWHISPR_ALLOW_CUSTOM_HOST`. All other configurability stays build-time. Threat model + mitigations to be formalized in v1.8.0 Phase 2 ADR.

### Pending Todos

None yet.

### Blockers/Concerns

None blocking. Phase 1 carries forward two v1.7.2 integration-check findings as scope-included work (not blockers):

- **INT-01** (HIGH): `src/lib/auth.ts:12` `authClient` is a frozen module-singleton — runtime URL reconfig requires refactor → HOST-02.
- **INT-02** (MED): Two parallel env-var systems for backend host (`OPENWHISPR_BACKEND_URL` vs `OPENWHISPR_API_URL`) need collapsing → HOST-01.
- **INT-03/04/05** (MED): 3 hardcoded URLs in `src/lib/auth.ts:177`, `auth.ts:227`, `ShareNoteDialog.tsx:26` → HOST-03.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260530-ms3 | Adopt upstream #835 — skip API key check for self-hosted transcription servers | 2026-05-30 | fdc9527c |  | [260530-ms3-adopt-upstream-835-skip-api-key-check-fo](./quick/260530-ms3-adopt-upstream-835-skip-api-key-check-fo/) |
| 260603-ogm | Fix #8 (HIGH auth-leak) — desktop OIDC sign-in honors runtime serverUrl instead of build-time AUTH_URL | 2026-06-03 | eb9716d4 |  | [260603-ogm-fix-8-desktop-oidc-sign-in-uses-build-ti](./quick/260603-ogm-fix-8-desktop-oidc-sign-in-uses-build-ti/) |
| 260603-qhw | #9 client half — server-driven local-login gating (hide email/password form when localLogin.enabled:false) + review fixes | 2026-06-03 | 9bbc7ed3, 2fe15b58 |  | [260603-qhw-implement-client-half-of-9-server-driven](./quick/260603-qhw-implement-client-half-of-9-server-driven/) |
| 260603-r0p | WR-01 security — gate prod renderer test-hooks (`__zustand_setServerUrl` SSRF-bypass) behind e2e runtime signal; live-proven via CDP | 2026-06-03 | be1cb424 |  | [260603-r0p-wr-01-gate-auth-ts-prod-test-hooks-behin](./quick/260603-r0p-wr-01-gate-auth-ts-prod-test-hooks-behin/) |
| 260604-eij | Custom-host onboarding UX — hoist Server URL field out of localLogin gate (BUG 1, self-hoster could never reach own server) + add Settings host-change section (BUG 2) + WR-01 DCE stub-alias so field is absent from default bundle | 2026-06-04 | a51bfdee | Verified | [260604-eij-custom-host-onboarding-ux-server-url-field](./quick/260604-eij-custom-host-onboarding-ux-server-url-field/) |
| 260604-gpc | Corporate self-hosted data-plane + onnx pack (v1.7.19): RC-1 cold-start serverUrl push to main (all /api/* timed out), RC-2 runtime-derive realtime WSS host (both connect sites), RC-3 kill byok under lockdown (gate + self-heal reconciler), RC-4 package onnxWorker.js. + BL-01 review fix (relocate deriveRealtimeWssUrl to packaged helper — scripts/ require crashed packed binary). 173/173 tests | 2026-06-04 | f3a2da91, a51bfdee→HEAD | Verified (pre-tag gates: pack-smoke + corp live) | [260604-gpc-v1718-corporate-host-data-plane-onnx-pack](./quick/260604-gpc-v1718-corporate-host-data-plane-onnx-pack/) |

## Session Continuity

Last session: 2026-05-26
Stopped at: v1.8.0 roadmap created (5 phases, 12 requirements mapped to 4 phases; Phase 2 is unmapped policy work)
Resume file: None

## Operator Next Steps

- Plan Phase 1 with `/gsd-plan-phase 1`
- Phase 1 MUST land before Phase 3 (build-time gate) and Phase 4 (UI) — see INT-01/INT-02 in v1.7.2-INTEGRATION-CHECK.md
