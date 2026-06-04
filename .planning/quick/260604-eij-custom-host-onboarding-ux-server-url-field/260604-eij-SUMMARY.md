---
phase: quick-260604-eij
plan: 01
subsystem: auth-onboarding-settings
tags: [custom-host, self-hosting, onboarding, settings, i18n, dce]
requires: [ALLOW_CUSTOM_HOST_ENABLED, ServerUrlField, useServerProviders, selectAuthView]
provides: [shouldShowServerUrlField, settings-server-url-section]
affects: [src/components/AuthenticationStep.tsx, src/components/SettingsPage.tsx, src/lib/serverProviders.ts]
tech-stack:
  added: []
  patterns: [bare-literal-DCE-gate, pure-node-testable-predicate, shared-component-reuse]
key-files:
  created: []
  modified:
    - src/components/AuthenticationStep.tsx
    - src/lib/serverProviders.ts
    - src/lib/serverProviders.test.ts
    - src/components/SettingsPage.tsx
    - src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW,ja}/translation.json
decisions:
  - "shouldShowServerUrlField takes NO authView argument by construction — the type signature itself prevents re-coupling field visibility to the default host's gate (BUG 1 regression contract)"
  - "Settings host change surfaces an honest auto-reload notice (matches auth.ts subscribe -> window.location.reload); no fake save/success state (INT-01)"
  - "Settings section gated by a bare ALLOW_CUSTOM_HOST_ENABLED && literal so Rolldown DCE folds it out of the default build"
metrics:
  duration: ~7m
  completed: 2026-06-04
  tasks: 3
  files: 14
---

# Phase quick-260604-eij Plan 01: Custom-Host Onboarding UX + Server URL Field Summary

Fixed two live-hit bugs in the v1.8.0 runtime-host feature: hoisted the onboarding Server URL field out of the default host's `authView` gate (BUG 1), and added a Settings > General Server URL section for post-onboarding host changes (BUG 2). Both gated by `ALLOW_CUSTOM_HOST_ENABLED` so the default build DCE-folds them out.

## What Was Built

### Task 2 (committed first — predicate before importer): `shouldShowServerUrlField` + regression test
- Added pure total function `shouldShowServerUrlField(allowCustomHost: boolean): boolean` in `src/lib/serverProviders.ts`, right after `selectAuthView`. It takes **no** `authView` argument — by construction the type system prevents anyone re-coupling field visibility to the default host's gate, which is the exact BUG 1 trap.
- Added a `describe("shouldShowServerUrlField (BUG 1 regression)")` block to the node-only harness: asserts `true`/`false` passthrough and loops over all three `selectAuthView` outcomes (`local-and-sso`, `sso-only`, `no-methods`), asserting the field stays visible for each. No React render (harness is node-only, no jsdom — per plan context).
- Commit: `184eacdd`

### Task 1: Hoist onboarding Server URL field (BUG 1)
- In `AuthenticationStep.tsx` welcome view, the `ServerUrlField` is now rendered **above** `ServerProviderButtons`, gated only by `{shouldShowServerUrlField(ALLOW_CUSTOM_HOST_ENABLED) && (...)}`, fully independent of `authView`.
- Removed the duplicate mount that lived inside the `authView === "local-and-sso"` form block.
- Email `Input` and Continue `Button` keep their existing `(ALLOW_CUSTOM_HOST_ENABLED && !serverUrlValidated)` gating UNCHANGED — fix #9's authView gating of the email form stays intact for the resolved host. The race-guard `useEffect` was not touched.
- Confirmed by reading (no code change): `useServerProviders` re-fetches on `serverUrl` change (`deps [baseUrl]`, `baseUrl = serverUrl || OPENWHISPR_BACKEND_URL`), so validating a custom host re-derives `authView` from THAT host.
- Commit: `18ba9e1b`

### Task 3: Server URL Settings section + i18n (BUG 2)
- Added `ALLOW_CUSTOM_HOST_ENABLED` to the existing `@/config/defaults` import and imported `ServerUrlField` from `./onboarding/ServerUrlField` in `SettingsPage.tsx`.
- New section at the end of the `"general"` case, gated by a **bare** `{ALLOW_CUSTOM_HOST_ENABLED && (...)}` literal (Rolldown DCE folds it out of the default build). It uses the shared `<ServerUrlField />` (which persists `serverUrl` to the store itself) plus a muted-text honest auto-reload notice — **no** fake Save/success toast (INT-01).
- Added `settingsPage.general.serverUrl.{title,description,reloadNotice}` to all 10 locales with real translations (en, es, fr, de, pt, it, ru, zh-CN, zh-TW, ja). Reused existing `onboarding.serverUrl.*` keys for the field's own label/helper/errors (not duplicated).
- Commit: `211f3890`

## Verification

- `npm run typecheck` (`cd src && tsc --noEmit`): clean (exit 0). NOTE: a fresh worktree lacks the gitignored `src/config/build-config.generated.{ts,cjs}`; running `node scripts/generate-build-config.js` (normally a predev/prebuild step) was required before typecheck reported clean. The three `Cannot find module './build-config.generated'` errors were entirely pre-existing artifact-absence, not from this plan.
- `npm test` (vitest run): **152 passed (152)**, 14 test files, including `src/lib/serverProviders.test.ts` 45/45 (the new BUG 1 regression block).
- i18n: all 10 locale files parse as valid JSON and contain `settingsPage.general.serverUrl.{title,reloadNotice}` (verified via the plan's two automated checks).
- Structural grep: exactly ONE `<ServerUrlField` mount in `AuthenticationStep.tsx`, at line 483 (welcome view), BEFORE the `authView === "local-and-sso"` block at line 506.
- Diff vs base: exactly the 14 planned files, no stray artifacts.

## Upstream-Parity / client_immutable

All touched lines in `AuthenticationStep.tsx`, `serverProviders.ts`, and `SettingsPage.tsx` are Yambr-fork drift (per the plan's pre-verified git-show clearance: `ServerUrlField`, `authView`, `serverUrlValidated`, `selectAuthView`, `ALLOW_CUSTOM_HOST`, `"local-and-sso"` do not exist in `upstream/main`). No upstream-verbatim line was edited. Nothing to flag.

## INT-01 Honesty

The Settings host change does NOT fake an authClient reconfig. `auth.ts` already subscribes to `useSettingsStore` and on `serverUrl` change invalidates the cached inner authClient, notifies main, and triggers `window.location.reload()`. The Settings UI surfaces an honest "Changing the server URL will reload the app to apply the new host" notice matching that real behavior — no fabricated success state.

## Deviations from Plan

None — plan executed as written. (Generating the gitignored build-config artifact before typecheck is a standard predev step, not a deviation.)

## Known Stubs

None. The Settings section wires the real shared `ServerUrlField` to the real store/auth.ts reload path; no placeholder data.

## Threat Flags

None. The Settings section reuses the SAME `ServerUrlField` component (existing HTTPS-only + RFC1918/loopback/link-local SSRF screening unchanged); no new network entry point. Both new mount points use bare build-time `&&` gates (T-eij-03 accept). The host-change reload path (T-eij-02 mitigate) is surfaced honestly.

## Self-Check: PASSED

- src/lib/serverProviders.ts (shouldShowServerUrlField): FOUND
- src/lib/serverProviders.test.ts (regression block): FOUND
- src/components/AuthenticationStep.tsx (single hoisted mount): FOUND
- src/components/SettingsPage.tsx (Server URL section): FOUND
- All 10 locale serverUrl keys: FOUND
- Commit 184eacdd: FOUND
- Commit 18ba9e1b: FOUND
- Commit 211f3890: FOUND
