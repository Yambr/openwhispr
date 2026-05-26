---
gsd_state_version: 1.0
milestone: v1.7.2
milestone_name: shipped
status: Awaiting next milestone
stopped_at: Milestone v1.7.2 archived
last_updated: "2026-05-26T15:00:00.000Z"
last_activity: 2026-05-26 — Milestone v1.7.2 completed and archived (tag v1.7.9)
progress:
  total_phases: 11
  completed_phases: 11
  total_plans: 41
  completed_plans: 41
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-26)

**Core value:** A maintainer or end-user can produce a corporate-minimal OpenWhispr binary that talks to their own backend with only the OAuth providers they want — at build time today, and at runtime via onboarding starting in v1.8.0.
**Current focus:** Awaiting `/gsd-new-milestone v1.8.0 --reset-phase-numbers` for Custom Server URL Onboarding.

## Current Position

Phase: Milestone v1.7.2 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-05-26 — Milestone v1.7.2 completed and archived

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-05-26:

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

### Pending Todos

None yet.

### Blockers/Concerns

None for v1.7.2. For v1.8.0 there is one carry-forward concern that becomes Phase 1:

**v1.8.0 prereq (per integration-check INT-01/INT-02):** Two parallel backend-URL env-vars (`OPENWHISPR_BACKEND_URL` vs `OPENWHISPR_API_URL` via `VITE_OPENWHISPR_API_URL`) carry the same semantic. Renderer reads the latter; Phase 3 declared the former as SoT. CI papers over by setting both. Plus `src/lib/auth.ts:12` is a frozen module-singleton — runtime URL reconfiguration impossible without refactor. v1.8.0 MUST address these before any onboarding UI work.

## Session Continuity

Last session: 2026-05-26
Stopped at: Milestone v1.7.2 archived
Resume file: None

## Operator Next Steps

- Start the next milestone with `/gsd-new-milestone v1.8.0 --reset-phase-numbers`
- Carry forward to v1.8.0 Phase 1: backend-URL SoT consolidation + dynamic Better Auth refactor
