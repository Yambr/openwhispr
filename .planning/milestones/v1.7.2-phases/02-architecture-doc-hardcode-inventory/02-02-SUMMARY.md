---
phase: 02-architecture-doc-hardcode-inventory
plan: "02"
subsystem: docs
tags: [config, env-vars, hardcodes, inventory, build-time]

# Dependency graph
requires:
  - phase: 01-wire-contract-documentation
    provides: docs/BACKEND_SPEC.md and docs/OAUTH_SPEC.md as cross-link targets for notes column
provides:
  - "docs/CONFIG_INVENTORY.md — 5-column hardcode inventory (23 rows) mapping every CFG-01 hardcode to a proposed OPENWHISPR_* env-var"
affects:
  - "03-build-time-env-refactor (Phase 3 consumes this inventory directly — each row is a refactor target)"
  - "04-per-provider-oauth-gating (Phase 4 CFG-03 uses oauth rows for per-provider gating targets)"
  - "05-build-config-docs (Phase 4 BUILD_CONFIG.md sources its variable list from this inventory)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OPENWHISPR_* env-var naming convention established (logical names; VITE_ prefix applied at consumption site for renderer-side vars)"
    - "5-column inventory format: file:line | current value | proposed env-var | category | notes"

key-files:
  created:
    - "docs/CONFIG_INVENTORY.md"
  modified: []

key-decisions:
  - "enterprise category has zero entries — all AWS Bedrock / Azure / Vertex endpoint config is already fully runtime-resolved via user-supplied safeStorage secrets, no hardcoded defaults exist"
  - "OPENWHISPR_AUTH_URL appears in 3 separate source locations (src/lib/auth.ts:5, main.js:485, src/helpers/ipcHandlers.js:3336) — Phase 3 should consolidate to a single shared helper"
  - "DESKTOP_OAUTH_CALLBACK_URL is duplicated independently in src/lib/auth.ts:171 and src/helpers/googleCalendarOAuth.js:11 — consolidate to single export in Phase 3"
  - "electron-builder.json protocol scheme is a build-time hardcode not covered by the existing runtime OPENWHISPR_PROTOCOL env-var — Phase 3 needs to template it via electron-builder extraMetadata or env injection"
  - "model-registry baseUrl entries in modelRegistryData.json are separate hardcodes from the constants.ts entries — Phase 3 must update both when env vars are introduced"

patterns-established:
  - "Notes column flags renderer-side entries with explicit VITE_ prefix requirement"
  - "Cross-links use BACKEND_SPEC.md and OAUTH_SPEC.md anchor notation for backend/oauth/litellm rows"

requirements-completed:
  - CFG-01

# Metrics
duration: 2min
completed: "2026-05-08"
---

# Phase 02 Plan 02: Config Inventory Summary

**5-column CONFIG_INVENTORY.md published with 23 rows across 5 categories, mapping every CFG-01 hardcode to a proposed OPENWHISPR_* env-var with file:line citations and cross-links to Phase 1 docs**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-08T09:34:43Z
- **Completed:** 2026-05-08T09:36:22Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Discovered and catalogued 23 in-scope hardcodes across 5 CFG-01 categories via systematic grep sweep
- Confirmed enterprise category is empty (zero hardcoded defaults — all runtime-resolved via user secrets)
- Identified 3-location duplication of `https://auth.openwhispr.com` fallback and 2-location duplication of desktop OAuth callback URL — flagged for Phase 3 consolidation
- Every row has a final `OPENWHISPR_*` env-var name, no placeholder names used

## Task Commits

1. **Task 1: Discover and catalogue every in-scope hardcode via systematic source grep, then write docs/CONFIG_INVENTORY.md** - `c9f6061` (feat)

## Files Created/Modified

- `docs/CONFIG_INVENTORY.md` — 5-column inventory with 23 rows; front matter, summary table, full inventory table, and verification notes

## Decisions Made

- Enterprise category is explicitly documented as empty with explanation (runtime-resolved via safeStorage), rather than omitting the category
- `https://openwhispr.com/terms`, `/privacy`, `/contact-sales`, `docs.openwhispr.com` URLs scoped out per D-09 swap test (marketing/navigation links, not API endpoints a self-hoster would replace)
- `https://mcp.openwhispr.com/mcp` included as backend category (MCP server endpoint a self-hoster would replace with their own)
- `GOOGLE_CALENDAR_CLIENT_ID` and `CLIENT_SECRET` not included — confirmed as runtime env vars with no hardcoded values in source
- Row ordering: category first (backend → oauth → enterprise → model-registry → litellm), then by file path within category

## Deviations from Plan

None — plan executed exactly as written. Discovery sweep confirmed INTEGRATIONS.md draft list was accurate; all entries verified against current source per D-15.

## Issues Encountered

None.

## User Setup Required

None — documentation-only phase, no external service configuration required.

## Next Phase Readiness

- `docs/CONFIG_INVENTORY.md` is Phase 3's refactor checklist — all 23 rows are actionable targets
- `OPENWHISPR_*` env-var names are final; Phase 3 should lock to these names without renaming
- Phase 3 should address the auth URL triplication (3 locations) and callback URL duplication (2 locations) as its first consolidation tasks
- `electron-builder.json` protocol scheme requires special handling — not a simple string replacement; needs `electron-builder` env injection or templating

## Known Stubs

None — all inventory rows reference real current source locations, no stubs.

## Threat Flags

None — this plan adds documentation of existing values (backend URLs and OAuth endpoints already observable in network traffic and partially documented in BACKEND_SPEC.md and OAUTH_SPEC.md). No new attack surface introduced. T-02-08 (accidental secret material) reviewed: no API keys, passwords, OAuth client secrets, or other sensitive values appear in the `current value` column — only endpoint URLs, public callback URLs, and protocol scheme strings.

## Self-Check: PASSED

- `docs/CONFIG_INVENTORY.md` exists: FOUND
- Commit `c9f6061` exists: verified above
- All 9 cited file paths exist in repo: confirmed by automated check

---
*Phase: 02-architecture-doc-hardcode-inventory*
*Completed: 2026-05-08*
