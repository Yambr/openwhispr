---
gsd_state_version: 1.0
milestone: v1.7.2
milestone_name: milestone
status: executing
stopped_at: Completed 07-06-PLAN.md
last_updated: "2026-05-21T19:29:15.917Z"
last_activity: 2026-05-21
progress:
  total_phases: 11
  completed_phases: 6
  total_plans: 39
  completed_plans: 36
  percent: 55
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-08)

**Core value:** A maintainer can run `npm run build` with a set of env vars and get a fully-working OpenWhispr binary that talks to their own backend and shows only the OAuth providers they want — without touching source code. Default build (no env vars) must be behaviorally identical to the current Yambr fork.
**Current focus:** Phase 01 — wire-contract-documentation

## Current Position

Phase: 10 — COMPLETE
Plan: 06 of 06 complete
Status: Phase verified — goal ACHIEVED
Last activity: 2026-05-21 -- Phase 10 complete: corporate-minimal provider lockdown, 6/6 plans, live UAT passed (welcome email/password-only; Settings → Language Models shows only OpenWhispr Cloud + Local)

Progress: [██████████] 100%

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
| Phase 07 P06 | 5m | 2 tasks | 3 files |
| Phase 10 P02 | ~5m | 2 tasks | 2 files |
| Phase 10 P03 | 12m | 2 tasks | 1 files |
| Phase 10 P05 | 35min | 2 tasks | 7 files |

## Accumulated Context

### Roadmap Evolution

- Phase 04.1 inserted after Phase 04: Tree-shaking fix for OAUTH_*_ENABLED gating + ensure prepack regenerates build-config (URGENT)
  - Discovered during Phase 04 smoke test: `npm run pack` skips `generate-build-config.js` (only `prebuild` runs it, `prepack` doesn't), and `gcalStartOAuth` symbol still appears in the bundle when `OAUTH_GOOGLE_ENABLED=false` — gating is not actually tree-shaking the disabled code paths.
- Phase 10 added: Corporate-minimal provider lockdown — build-time gate cutting all OAuth buttons, all alternative transcription/reasoning/agent providers, and all BYOK surfaces; client offers strictly Cloud (our server) or Local.
  - Discovered during live UI verification against the slim-core openwhispr-server: the client's welcome screen shows Apple/Google/Microsoft OAuth buttons the server supports none of (server does google/github/oidc only, none configured on slim → 404), and the Transcription/Reasoning pickers expose OpenAI/Groq/Mistral/Custom + BYOK API-key input — upstream provider choices the corporate-minimal product must not surface (server routes all Cloud-mode calls internally via LiteLLM).

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

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260509-x1a | Restore release.yml with macOS signing+notarization, merge corporate-build features, delete corporate-build.yml + build-and-notarize.yml | 2026-05-09 | 4adb576e | [260509-x1a-restore-release-yml-with-macos-signing-n](./quick/260509-x1a-restore-release-yml-with-macos-signing-n/) |
| 260521-wt4-FIX1 | Gate Pro/upgrade/limit UI behind BILLING_ENABLED — usage limits neutralized, sidebar banners + UpgradePrompt DCE'd, integration cards unlocked in corporate build | 2026-05-21 | 8f9f63f3, 5d59e421 | [260521-wt4-corporate-minimal-ui-fixes](./quick/260521-wt4-corporate-minimal-ui-fixes/) |
| 260521-wt4-FIX2 | cloudBackupEnabled first-run default now follows PROVIDER_LOCKDOWN_ENABLED (on in corporate build) | 2026-05-21 | 76bdb747 | [260521-wt4-corporate-minimal-ui-fixes](./quick/260521-wt4-corporate-minimal-ui-fixes/) |
| 260521-wt4-FIX3 | dictationAgentMode fallback resolves to openwhispr under lockdown instead of cut `providers` mode | 2026-05-21 | 76bdb747 | [260521-wt4-corporate-minimal-ui-fixes](./quick/260521-wt4-corporate-minimal-ui-fixes/) |

## Session Continuity

Last session: 2026-05-21T19:29:15.913Z
Stopped at: Completed 07-06-PLAN.md
Resume file: None
