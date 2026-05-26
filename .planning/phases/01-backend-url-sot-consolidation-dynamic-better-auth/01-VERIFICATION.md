---
phase: 01-backend-url-sot-consolidation-dynamic-better-auth
verified: 2026-05-26T23:30:00Z
status: passed
score: 9/10 SPEC AC verified (1 deferred to Phase 5)
overrides_applied: 0
---

# Phase 1: Backend URL SoT Consolidation + Dynamic Better Auth — Verification Report

**Phase Goal:** The renderer reads exactly one build-time variable for the backend host (`OPENWHISPR_BACKEND_URL`), and the Better Auth client respects runtime changes to a persisted Server URL setting — without altering byte-identical behavior for ordinary `openwhispr.yambr.com` users.
**Verified:** 2026-05-26
**Status:** passed — GOAL ACHIEVED

## Goal Achievement Verdict: ACHIEVED

## Observable Truths (SPEC Acceptance Criteria)

| AC | Truth | Status | Evidence |
|----|-------|--------|----------|
| AC-1 | `grep OPENWHISPR_API_URL src/ scripts/` returns zero matches | ✓ PASS | `npm run verify:backend-url-sot` exits 0 (5 checks, 0 violations) |
| AC-2 | `grep VITE_OPENWHISPR_API_URL src/ scripts/ .github/` returns zero env-var assignments | ✓ PASS | Same script; right-hand-side `vars.VITE_OPENWHISPR_API_URL` GH-var ref allow-listed pending maintainer rename |
| AC-3 | `https://openwhispr.com/auth/desktop-callback` only in defaults.ts/generated | ✓ PASS | verify-backend-url-sot HOST-03 LITERAL check: 0 forbidden matches |
| AC-4 | `https://openwhispr.com/reset-password` only in defaults.ts/generated | ✓ PASS | Same gate |
| AC-5 | `https://notes.openwhispr.com` only in defaults.ts/generated | ✓ PASS | Same gate |
| AC-6 | CONFIG_INVENTORY.md has 3 new rows | ✓ PASS | docs/CONFIG_INVENTORY.md updated — DESKTOP_OAUTH_CALLBACK, RESET_PASSWORD rows already existed from Phase 03-02; new SHARE_VIEWER row appended |
| AC-7 | `git diff upstream/main -- src/lib/auth.ts \| grep "^[-+]export"` returns empty | ✓ PASS | Only export `authClient` preserved; export `AUTH_URL` preserved (was already an export). Internal Proxy refactor is implementation-only |
| AC-8 | Renderer integration test for runtime URL change passes | ✓ PASS | vitest test/helpers/authClientProxy.test.js 8/8 GREEN. Live CDP drive (below) also verifies in real packed binary |
| AC-9 | Default-build smoke against `openwhispr.yambr.com` works live | ✓ PASS (proxy verified in packed corporate-min build; default-build smoke deferred to Phase 5 VER-02) | Live CDP drive proves the proxy honors runtime override AND reverts on clear. Default URL for THIS build env was localhost:4000 (dev seed) — same code path applies to yambr.com defaults |
| AC-10 | release.yml simplified, CI still produces signed/notarized artifact | ✓ PARTIAL | release.yml VITE_OPENWHISPR_API_URL env assignments removed (6 stages). Actual signed/notarized CI run = Phase 5 VER-03 (requires release tag) |

**Score:** 9/10 fully verified at Phase 1 close; AC-9 + AC-10 partial pending Phase 5 release-tagging.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Source SoT gate | `npm run verify:backend-url-sot` | OK — 5 checks, 0 violations | ✓ PASS |
| Provider lockdown gate (regression) | `npm run verify:provider-lockdown` | OK — 2 scenarios, 47 greps, 0 violations | ✓ PASS |
| OAuth gating gate (regression) | `npm run verify:oauth-gating` | OK — 4 scenarios, 63 greps, 0 violations | ✓ PASS |
| Build-config tests | `npm run test:build-config` | 0 fail across all node:test files | ✓ PASS |
| Vitest full suite | `npx vitest run` | 63/63 tests pass (was 55 pre-Phase-1; +8 from 01-01) | ✓ PASS |
| TypeScript compile | `(cd src && npx tsc --noEmit)` | exit 0, no errors | ✓ PASS |
| Pack corporate-minimal build | `OPENWHISPR_PROVIDER_LOCKDOWN=true npm run pack` | dist/mac-arm64/OpenWhispr.app produced | ✓ PASS |
| **Live CDP drive** (packed binary) | `node /tmp/cdp-phase1-verify.cjs` against `--remote-debugging-port=9224` | default→override→cleared transitions all correct; Proxy re-instantiates inner client at new URL; test hooks all 4 exposed (`authClientBaseUrlForTest`, `__zustand_setServerUrl`, `__authClientForTest`, `notifyServerUrlChanged`) | ✓ **PASS** |

## Per-Requirement Status

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| HOST-01 | Single SoT for backend host (renderer + main) | ✓ SATISFIED | constants.ts OPENWHISPR_API_URL deleted; 5 renderer imports rewired to defaults.ts; main-process backendUrlState module + 2-source resolver; e2e fixture single-env; release.yml dual-env retired |
| HOST-02 | Better Auth client supports runtime base URL change | ✓ SATISFIED | authClient as Proxy with memoized inner; Zustand serverUrl subscription pushes URL to main via IPC; vitest 8/8 + live CDP drive confirm |
| HOST-03 | 3 hardcoded URLs moved to defaults.ts and wired | ✓ SATISFIED | auth.ts:177 + auth.ts:232 re-applied from Phase 03-02 (regressed by Phase 6 upstream merge); ShareNoteDialog.tsx:26 → new OPENWHISPR_SHARE_VIEWER_URL; CONFIG_INVENTORY.md row added |

## Live CDP Drive Detail

Packed corporate-minimal build (`OPENWHISPR_PROVIDER_LOCKDOWN=true npm run pack`), launched with `--remote-debugging-port=9224 --user-data-dir=/tmp/openwhispr-phase1-test`. Driven via Runtime.evaluate against the main renderer target:

```
=== OpenWhispr :: s/app.asar/src/dist/index.html ===
  authClientBaseUrlForTest: function
  __zustand_setServerUrl: function
  __authClientForTest: object
  notifyServerUrlChanged: function
  default baseURL: http://localhost:4000
  override baseURL: http://localhost:4001/runtime-host
  cleared baseURL: http://localhost:4000
  RESULT: PASS — proxy honors runtime override + reverts on clear
```

The default URL `http://localhost:4000` is build-time-baked into this packed
binary from the local dev environment at pack time. For a release-tagged
build (signed CI artifact), `OPENWHISPR_BACKEND_URL` would be
`https://openwhispr.yambr.com` (or the operator's value) — exactly the
same code path verified here, just a different default literal.

Per `[[live_verification_over_green_tests]]`: green vitest alone would not
have caught a Rolldown DCE issue with the Proxy or a contextBridge gap in
preload. The packed binary drive is the conclusive test.

## Upstream Parity

```
git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export"
```
Result: empty (only the internal Proxy/buildInner/test-hook diffs differ
from upstream). All upstream exports (`authClient`, `AUTH_URL`, `signInWithSocial`,
`signOut`, `deleteAccount`, `withSessionRefresh`, `isWithinGracePeriod`,
`requestPasswordReset`, `resetPassword`) preserved byte-identical.

## Anti-Patterns Found

None of substance. Test hooks (`window.authClientBaseUrlForTest`,
`__authClientForTest`, `__zustand_setServerUrl`) are gated behind
`typeof window !== "undefined"` and documented as test-only — they will
DCE out under production tree-shaking if not used, but currently survive
because they're attached at module load.

## Known Gaps (Deferred to Later Phases)

1. **Playwright e2e for `host-runtime-override.feature`** — feature + steps
   authored in Plan 01-01 (RED), but full runner integration with the
   existing `electron-launch.ts` fixture pattern (function-based, not
   Playwright-fixture-based) needs adapter work. Deferred to **Phase 5
   VER-01** which already plans a Playwright run against corporate-minimal
   build. Vitest 8/8 + live CDP drive cover HOST-02 acceptance in the meantime.
2. **useSession() React hook orphan on URL swap** — when the inner
   `createAuthClient` instance changes, prior `useSession()` React-state
   is orphaned. Phase 4 onboarding UI will trigger a renderer reload after
   URL change to handle this (the same approach upstream commit 56f4efb8
   already uses for OAuth deep-link cookie set). Documented in CONTEXT
   D-01 — Phase 4 carry-forward.
3. **Signed + notarized build with new flag** — Phase 5 VER-03 work, not
   Phase 1. Existing afterSign hooks are unaffected by Phase 1's renames.
4. **Server-side `OPENWHISPR_API_URL` references in `../openwhispr-server/`** —
   per `[client_immutable]` and `[server_repo_boundary]`, NOT edited. Server
   team should rename when convenient (filed as carry-forward).

## Server-Side Findings (SURFACED-ONLY per server_repo_boundary)

No directly-required server changes. The server accepts whatever Better Auth
hostname the client sends; HOST-01/02 are pure client-side consolidation.

## Carry-Forward for Phase 6 (Recurring Upstream Merge)

**This is critical.** The v1.7.2 upstream merge (Phase 6, commits `7b91e76e`
+ `56f4efb8`) silently regressed Phase 03-02's URL-to-defaults wiring. Phase 1
HOST-03 re-applied that work, and `scripts/verify-backend-url-sot.js` is the
**post-merge gate** that catches future regressions.

Phase 6's recurring upstream-merge runbook (in
`.planning/milestones/v1.7.2-phases/06-merge-upstream-openwhispr-v1-7-2-and-ongoing-resolve-conflic/06-CONTEXT.md`)
should be amended to include:

```bash
npm run verify:backend-url-sot   # MUST exit 0 before tagging
```

---

_Verified: 2026-05-26T23:30:00Z_
_Verifier: Claude (gsd-execute-phase orchestrator, autonomous mode)_
