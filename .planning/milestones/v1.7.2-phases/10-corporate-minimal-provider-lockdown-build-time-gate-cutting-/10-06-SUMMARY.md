---
phase: 10-corporate-minimal-provider-lockdown-build-time-gate-cutting-
plan: 06
subsystem: build-config / verification
tags: [provider-lockdown, bundle-grep, dce, docs, uat]
requires: ["10-02", "10-03", "10-04", "10-05"]
provides:
  - "scripts/verify-provider-lockdown.js (verify:provider-lockdown gate)"
  - "OPENWHISPR_PROVIDER_LOCKDOWN documented in BUILD_CONFIG.md / SELF_HOSTING.md / CONFIG_INVENTORY.md"
  - "corporate-minimal packaged build for live UAT"
affects:
  - "release verification pipeline"
tech-stack:
  added: []
  patterns: ["2-scenario bundle-grep gate modeled on verify-oauth-gating.js"]
key-files:
  created:
    - scripts/verify-provider-lockdown.js
  modified:
    - package.json
    - src/lib/auth.ts
    - docs/BUILD_CONFIG.md
    - docs/SELF_HOSTING.md
    - docs/CONFIG_INVENTORY.md
decisions:
  - "Bundle-grep absence targets restricted to literals that genuinely DCE under lockdown — provider domain literals in main-process build-config and JSON data blobs (modelRegistryData.json) were excluded as non-DCE signals, consistent with the verify-oauth-gating i18n exclusion."
  - "signInWithSocial gated behind PROVIDER_LOCKDOWN_ENABLED so the /api/desktop-signin/ URL const-folds out (Rule 1 fix — the gate caught a real un-DCE'd literal)."
metrics:
  duration: ~25m
  completed: 2026-05-21
---

# Phase 10 Plan 06: Provider Lockdown Verification, Docs & Live UAT Summary

Shipped the automated bundle-grep verification gate for `OPENWHISPR_PROVIDER_LOCKDOWN`,
documented the flag across three docs, and produced a packaged corporate-minimal
build for live UAT. The gate proves both directions: the default build retains
every provider literal (upstream parity), and the lockdown build has the OAuth,
alternative-cloud, BYOK, and enterprise literals physically dead-code-eliminated.

## What Was Built

### Task 1 — `scripts/verify-provider-lockdown.js` (commit `3c483470`)

A 2-scenario bundle-grep gate modeled on `scripts/verify-oauth-gating.js`,
registered as `npm run verify:provider-lockdown`. Four target groups:

- **OAUTH** — `desktop-signin`, `handleSocialSignIn("apple"|"google"|"microsoft")`.
- **ALT_CLOUD** — `console.groq.com/keys`, `console.anthropic.com`, `aistudio.google.com`, `console.mistral.ai/api-keys`.
- **BYOK** — `get-openai-key`, `save-anthropic-key`, `get-gemini-key`, `save-groq-key`, `get-mistral-key`, `save-custom-transcription-key`.
- **ENTERPRISE** — `test-enterprise-connection`, `get-azure-api-key`, `save-azure-api-key`, `get-vertex-api-key`, `save-vertex-api-key`, `save-bedrock-access-key-id`.

`default` scenario asserts all groups PRESENT (parity); `lockdown` scenario
(`OPENWHISPR_PROVIDER_LOCKDOWN=true`) asserts all ABSENT. PRELOAD_TARGETS includes
`preload-byok.generated.cjs` (plan 10-05). Result: **OK — 2 scenarios, 40 greps,
0 violations.**

### Task 2 — Documentation (commit `a071fd4c`)

- `docs/BUILD_CONFIG.md` — new "Provider Lockdown Flag (Phase 10)" section: flag
  table, the OAuth-implication note (`PROVIDER_LOCKDOWN` force-resolves the three
  `OAUTH_*_ENABLED` to false; an explicit `=true` cannot override), a worked
  example, and the new gate added to the Verification gates list.
- `docs/SELF_HOSTING.md` — new "Phase 10 Provider Lockdown Smoke Checklist": when
  a self-hoster routes all AI through their own backend, build with
  `OPENWHISPR_PROVIDER_LOCKDOWN=true` to remove the BYOK/provider-choice surface.
- `docs/CONFIG_INVENTORY.md` — confirmed the plan-05 note (kept-but-unwritten
  store fields; `CustomModelInput` DCEs transitively) is present and accurate;
  added a cross-reference to the new verification gate.

### Task 3 — Parity check + corporate build

- `default` scenario of `verify:provider-lockdown` confirmed full parity — every
  provider/BYOK/OAuth/enterprise literal present with the flag off.
- `OPENWHISPR_PROVIDER_LOCKDOWN=true npm run pack` produced the corporate build at
  **`/Users/nick/openwhispr/.claude/worktrees/agent-aad50f64b73ec195a/dist/mac-arm64/OpenWhispr.app`**.
- Default build-config restored at end (`PROVIDER_LOCKDOWN_ENABLED = false`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `desktop-signin` deep-link URL survived in the lockdown bundle**
- **Found during:** Task 1, first `verify:provider-lockdown` run.
- **Issue:** The gate caught `desktop-signin` present in the `lockdown` bundle.
  Plan 10-02 forces the three `OAUTH_*` flags off, but `signInWithSocial` in
  `src/lib/auth.ts` short-circuits per-provider via *runtime* guards
  (`provider === "google" && !OAUTH_GOOGLE_ENABLED`), not a const-folded
  `PROVIDER_LOCKDOWN_ENABLED` branch. The `new URL(`${AUTH_URL}/api/desktop-signin/...`)`
  statement therefore stayed reachable and the literal survived minification.
- **Fix:** Added `if (PROVIDER_LOCKDOWN_ENABLED) { return { error: ... }; }` as
  the first statement of `signInWithSocial`. Against the build-time literal
  `true`, Rolldown/terser proves the rest of the function dead and eliminates the
  `desktop-signin` URL. Verified absent in the lockdown bundle; still present in
  the default build (parity).
- **Files modified:** `src/lib/auth.ts`.
- **Commit:** `3c483470` (folded into the Task 1 commit, as the fix is what makes
  the gate exit 0).

### Build-environment note (not a plan deviation)

`npm run pack`'s `electron-builder` step initially failed with "Cannot compute
electron version" because the GSD worktree has no project-local `node_modules`
(Node resolves modules by walking up to the main repo's `node_modules`, but
electron-builder's electron-version probe does not traverse up). Resolved by
running `electron-builder --dir --config.electronVersion=41.2.0` explicitly
(41.2.0 is the pinned version in the main repo). This is a worktree-tooling
quirk, not a code change — no source impact.

## Verification

- `npm run verify:provider-lockdown` — **OK, 2 scenarios, 40 greps, 0 violations.**
- `cd src && npx tsc --noEmit` — clean (with the `auth.ts` change).
- Lockdown renderer build: every target group absent (40 greps confirmed empty);
  default build: all present.
- Corporate `--dir` build produced and signed; app path recorded above.
- Default build-config restored.
- Docs-consistency: `OPENWHISPR_PROVIDER_LOCKDOWN` appears in BUILD_CONFIG.md (3x),
  SELF_HOSTING.md (5x), CONFIG_INVENTORY.md (3x).

## Threat Coverage

| Threat ID | Disposition | How addressed |
|-----------|-------------|---------------|
| T-10-12 | mitigated | `verify-provider-lockdown.js` fails the build if any provider/BYOK/OAuth/enterprise literal survives the lockdown bundle. |
| T-10-13 | mitigated | The `default` scenario asserts every literal present — parity gate against upstream drift. |

## Live UAT Checkpoint

Task 4 is a `checkpoint:human-verify` gate. Tasks 1-3 are complete and committed;
the corporate build is ready. Execution stops here for the orchestrator to run
the live UAT against the slim-core `openwhispr-server` per the plan's
`<how-to-verify>` steps.

## Known Stubs

None. All gating uses build-time const literals; no placeholder/empty-data paths
introduced.

## Self-Check: PASSED

- `scripts/verify-provider-lockdown.js` — FOUND
- `package.json` `verify:provider-lockdown` script — FOUND
- `docs/BUILD_CONFIG.md` `OPENWHISPR_PROVIDER_LOCKDOWN` — FOUND
- `docs/SELF_HOSTING.md` `OPENWHISPR_PROVIDER_LOCKDOWN` — FOUND
- `src/lib/auth.ts` `PROVIDER_LOCKDOWN_ENABLED` guard — FOUND
- `dist/mac-arm64/OpenWhispr.app` — FOUND
- Commit `3c483470` (Task 1) — FOUND
- Commit `a071fd4c` (Task 2) — FOUND
