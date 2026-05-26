---
gsd_state_version: 1.0
milestone: v1.8.0
milestone_name: Custom Server URL Onboarding
status: executing
last_updated: "2026-05-26T23:35:00.000Z"
last_activity: 2026-05-26 — Phase 1 COMPLETE (HOST-01/02/03 verified, live CDP drive PASS)
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 7
  completed_plans: 7
  percent: 20
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
Last activity: 2026-05-26 — v1.8.0 roadmap created (5 phases, 12 requirements mapped)

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

## Session Continuity

Last session: 2026-05-26
Stopped at: v1.8.0 roadmap created (5 phases, 12 requirements mapped to 4 phases; Phase 2 is unmapped policy work)
Resume file: None

## Operator Next Steps

- Plan Phase 1 with `/gsd-plan-phase 1`
- Phase 1 MUST land before Phase 3 (build-time gate) and Phase 4 (UI) — see INT-01/INT-02 in v1.7.2-INTEGRATION-CHECK.md
