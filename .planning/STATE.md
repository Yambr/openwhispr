---
gsd_state_version: 1.0
milestone: v1.7.2
milestone_name: milestone
status: executing
stopped_at: Completed 07-05-PLAN.md
last_updated: "2026-05-09T09:01:56.978Z"
last_activity: 2026-05-08 -- Phase 03 planning complete
progress:
  total_phases: 8
  completed_phases: 5
  total_plans: 33
  completed_plans: 29
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-08)

**Core value:** A maintainer can run `npm run build` with a set of env vars and get a fully-working OpenWhispr binary that talks to their own backend and shows only the OAuth providers they want — without touching source code. Default build (no env vars) must be behaviorally identical to the current Yambr fork.
**Current focus:** Phase 01 — wire-contract-documentation

## Current Position

Phase: 2
Plan: Not started
Status: Ready to execute
Last activity: 2026-05-08 -- Phase 03 planning complete

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 6min | 1 tasks | 1 files |
| Phase 01 P02 | 5min | 1 tasks | 1 files |
| Phase 01 P03 | 4min | 1 tasks | 1 files |
| Phase 04.1 P05 | 6m | 3 tasks | 11 files |
| Phase 04.1 P06 | 5m | 2 tasks | 2 files |
| Phase 07 P01 | 2m | 2 tasks | 7 files |
| Phase 07 P02 | 1m | 2 tasks | 2 files |
| Phase 07 P03 | 2m | 2 tasks | 1 files |
| Phase 07 P05 | 5min | 2 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- Phase 04.1 inserted after Phase 04: Tree-shaking fix for OAUTH_*_ENABLED gating + ensure prepack regenerates build-config (URGENT)
  - Discovered during Phase 04 smoke test: `npm run pack` skips `generate-build-config.js` (only `prebuild` runs it, `prepack` doesn't), and `gcalStartOAuth` symbol still appears in the bundle when `OAUTH_GOOGLE_ENABLED=false` — gating is not actually tree-shaking the disabled code paths.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: v1 = docs + build-time config only; v2 = own backend separately (avoids coupling client refactor to backend invention)
- Init: Build-time configuration via Vite `define` + electron-builder env (not runtime config files) — smaller attack surface
- Init: Default build behavior unchanged when no env vars set — zero risk to existing Yambr fork users
- [Phase 01]: BACKEND_SPEC.md uses endpoint-card template (method/URL/auth/fetch-site/IPC-site + JSON request + JSON response + error deviations) — pattern for OAUTH_SPEC.md to mirror
- [Phase 01]: Source-only reverse engineering with file:line drift detection — no live HTTP traces, source is the contract
- [Phase 01]: OAUTH_SPEC.md uses provider-card template (Authorization/Token/Refresh/Revoke/Scopes/Redirect/ClientID/Secret/Storage/RefreshTrigger/IPC/SourceFiles) — same shape per provider, mechanical Phase 4 CFG-03 gating
- [Phase 01]: Apple/Microsoft sign-in buttons are NOT independent OAuth flows in the desktop client — they tunnel through the OpenWhispr cloud-sign-in shim; CFG-03 only needs flags for cloud-sign-in + Google Calendar
- [Phase 01]: SELF_HOSTING.md uses two-tier endpoint pattern (3 must-implement inline + 16 operational cross-linked to BACKEND_SPEC) for readability + single-source-of-truth
- [Phase 04.1]: Used two-stub Vite-alias gating for STREAMING_ENABLED: streamingProviders.stub.js + useChatStreaming.stub.ts, since literals span two always-imported leaf modules
- [Phase 04.1]: Phase 04.1 closed: 6 build flags documented + tree-shake mechanism canonicalized in BUILD_CONFIG.md; SELF_HOSTING.md reflects corporate-minimal default posture per 2026-05-08 pivot
- [Phase 07]: Drop require("vitest") in CJS tests; rely on globals: true (vitest 3.x rejects CJS require)
- [Phase 07]: Use require.main === module guard to make generate-build-config.js dual-purpose CLI+library without breaking 30+ npm scripts that spawn it
- [Phase 07]: Plan 07-05: chose Path C (smoke-grep) over Path A (extract pure helper) for audioManager.shouldUseStreaming — verify:feature-gating already covers end-to-end; extraction filed as follow-up

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-05-09T09:01:53.382Z
Stopped at: Completed 07-05-PLAN.md
Resume file: None
