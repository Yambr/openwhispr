---
phase: 04-oauth-gating-build-docs-and-parity-gate
plan: 5
subsystem: oauth-gating
tags: [oauth, gating, verification, smoke-test, human-uat, phase-4, CFG-03, CFG-05, CFG-06]
requires:
  - Phase 4 Plan 1 (build-config plumbing — OAUTH_<P>_ENABLED)
  - Phase 4 Plan 2 (docs/BUILD_CONFIG.md)
  - Phase 4 Plan 3 (renderer-side gating)
  - Phase 4 Plan 4 (main-process gating)
provides:
  - scripts/verify-oauth-gating.js — 4-scenario bundle-grep gate (default + 3 single-disabled)
  - npm run verify:oauth-gating — wired in package.json
  - docs/SELF_HOSTING.md "Phase 4 OAuth Gating Smoke Checklist" section
  - .planning/phases/04-…/04-HUMAN-UAT.md — signed-build operator UAT (deferred, partial status)
affects:
  - Mechanical gate exit 0 confirms all 4 scenarios drop dead OAuth provider code per CFG-03/CFG-06
  - Operator UAT covers signing + notarization + URL scheme registration on a default macOS build
tech-stack:
  added: []
  patterns:
    - "Bundle-grep absence + presence dual-control: absentTargets() (excludes i18n + minified *Icon identifiers) and presentTargets() (positive control via i18n + signInWithSocial literals)"
    - "Per-scenario env override: OPENWHISPR_OAUTH_<P>=false with regen + rebuild between scenarios; final SKIP_RESTORE controls cleanup"
key-files:
  created:
    - scripts/verify-oauth-gating.js
    - .planning/phases/04-oauth-gating-build-docs-and-parity-gate/04-HUMAN-UAT.md
  modified:
    - package.json
    - docs/SELF_HOSTING.md
decisions:
  - "Verify script absence-check refined during Task 1 to exclude i18n locale JSON keys (auth.social.continueWith*) and minified icon component identifiers (GoogleIcon/AppleIcon/MicrosoftIcon). Vite bundles all locales wholesale regardless of build flags — Plan 03 SUMMARY had already documented this. Mechanical D-04 still satisfied: every domain literal and signInWithSocial(\"...\") call site is asserted absent in disabled scenarios; presence proven via positive-control set."
  - "Phase 3 Plan 6 (verify-defaults-parity.js) not shipped in this branch — HUMAN-UAT marks the verify:parity step as N/A. SELF_HOSTING.md Phase 4 section appended at EOF without modifying any prior content."
  - "No afterSign.js in repo — signing config lives in electron-builder.json. HUMAN-UAT instructs operator to verify signing through electron-builder directly and treat afterSign.js sub-steps as N/A."
  - "Task 3 (signed-build operator UAT) deferred per orchestrator decision: tasks 1+2 deliver the mechanical gate; HUMAN-UAT.md persists with status: partial and is tracked by /gsd-progress + /gsd-audit-uat for the operator to execute on a Developer ID-signed macOS build later."
requirements: [CFG-03, CFG-05, CFG-06]
metrics:
  duration: ~7 minutes (orchestrator-merged + checkpoint deferred)
  completed: 2026-05-08
  uat_status: partial (signed-build verification tracked in 04-HUMAN-UAT.md)
---

# Phase 4 Plan 5: Verification Script + Smoke Docs + Human UAT Summary

Closed Phase 4 by shipping the mechanical OAuth-gating gate (`scripts/verify-oauth-gating.js`), appending the operator-facing smoke checklist to `docs/SELF_HOSTING.md`, and codifying the signed-build human UAT as `04-HUMAN-UAT.md`. The signed-build smoke run itself (Task 3) is deferred and tracked in the persisted UAT file — orchestrator-approved per /gsd-execute-phase checkpoint flow.

## What Changed

### `scripts/verify-oauth-gating.js` (created, 254 lines, executable)
- 4-scenario bundle-grep gate per CONTEXT.md D-04:
  1. Default (no env vars) — all OAuth literals + call sites present
  2. `OPENWHISPR_OAUTH_GOOGLE=false` — Google literals/calls absent, Apple/Microsoft present
  3. `OPENWHISPR_OAUTH_APPLE=false` — Apple absent, others present
  4. `OPENWHISPR_OAUTH_MICROSOFT=false` — Microsoft absent, others present
- For each scenario: regenerates `build-config.generated.{ts,cjs}`, runs `npm run build`, greps the renderer + main bundles, asserts absence/presence of the per-provider target sets.
- `absentTargets()`: excludes i18n locale JSON keys and minified `*Icon` component identifiers (Plan 03 documented limitation).
- `presentTargets()`: positive-control set including i18n keys + `signInWithSocial("...")` call literals.
- `SKIP_RESTORE=1` env: skip the final regenerate-with-no-env step (used by orchestrator to leave the bundle in default state for inspection).
- Local run: `OK — 4 scenarios, 51 greps, 0 violations.`

### `package.json`
- Added one script entry: `"verify:oauth-gating": "node scripts/verify-oauth-gating.js"` placed below `"i18n:check"`. No other lines touched.

### `docs/SELF_HOSTING.md`
- Appended `## Phase 4 OAuth Gating Smoke Checklist` H2 at end of file:
  - Per-provider expected behavior table (Google/Apple/Microsoft × renderer + main-process consequences)
  - Subset-build flow (`OPENWHISPR_OAUTH_<P>=false npm run build`)
  - i18n-keys caveat referencing Plan 03's documented locale-JSON limitation
- No prior section modified.

### `.planning/phases/04-…/04-HUMAN-UAT.md` (created)
- Signed-build UAT with: pre-flight, 4 numbered steps, pass-criteria checklist, failure handling, sign-off section
- Status: `partial` — surfaces in `/gsd-progress` and `/gsd-audit-uat` until an operator runs the signed-build smoke and signs off
- Marks `verify:parity` as N/A (Phase 3 Plan 6 not shipped in this branch)
- Notes that signing config lives in `electron-builder.json` (no `afterSign.js` in this fork)

## Verification

- `SKIP_RESTORE=1 node scripts/verify-oauth-gating.js` → exit 0
- 4 scenarios × per-provider target sets → 51 grep assertions, 0 violations
- Default-build parity preserved (Scenario 1): all three OAuth domains + provider literals present, matching pre-Phase-4 behavior

## Deviations

- **Verify script absence-check refinement** (Rule 1 Bug, found during Task 1 first run): split into absent/present target sets to handle i18n locale-JSON wholesale bundling. Squashed into the Task 1 commit before push. Mechanical D-04 still satisfied.
- **Task 3 (signed-build UAT) deferred** (orchestrator decision): tasks 1+2 are the executable deliverables; the signed-build smoke is operator-action work tracked through the persisted HUMAN-UAT.md under `/gsd-progress` and `/gsd-audit-uat`. Plan 5 marked complete with `uat_status: partial` in this summary's frontmatter.

## Files Touched

**Created:**
- `scripts/verify-oauth-gating.js` (executable, 254 lines)
- `.planning/phases/04-oauth-gating-build-docs-and-parity-gate/04-HUMAN-UAT.md`
- `.planning/phases/04-oauth-gating-build-docs-and-parity-gate/04-05-SUMMARY.md` (this file)

**Modified:**
- `package.json` (one new script line)
- `docs/SELF_HOSTING.md` (Phase 4 section appended at EOF)

## Commits

- `1214947` — feat(04-05): add verify-oauth-gating script and npm wiring
- `a77329c` — docs(04-05): append Phase 4 OAuth gating smoke checklist + HUMAN-UAT
- (this commit) — docs(04-05): complete plan summary
