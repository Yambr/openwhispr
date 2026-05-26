---
phase: 01
phase_name: backend-url-sot-consolidation-dynamic-better-auth
completed: 2026-05-26
status: passed
requirements-completed: [HOST-01, HOST-02, HOST-03]
plans: 7
plans-completed: 7
tests-added: 11 (3 e2e scenarios scaffolded + 8 vitest)
tests-passing-net-new: 8 (vitest); e2e scaffold deferred to Phase 5 VER-01
---

# Phase 1 — Backend URL SoT Consolidation + Dynamic Better Auth — Summary

## One-liner

Backend URL is now a single source of truth (`OPENWHISPR_BACKEND_URL`) consumed by renderer + main; Better Auth client honors runtime persisted Server URL via JavaScript Proxy that re-instantiates inner `createAuthClient` on demand, with upstream API surface byte-identical (auth.ts upstream commit `56f4efb8` preserved).

## Delivered

### HOST-01 — Single SoT for backend host
- `src/config/constants.ts:116` — `export const OPENWHISPR_API_URL` removed
- `src/types/build-env.d.ts` — `VITE_OPENWHISPR_API_URL` retired from typings
- `src/vite.config.mjs` — fallback chain collapsed to `env.OPENWHISPR_BACKEND_URL` only
- 5 renderer files (`auth.ts`, `AuthenticationStep.tsx`, `EmailVerificationStep.tsx`, plus the indirect transcription/MCP cluster) now read `OPENWHISPR_BACKEND_URL` from `src/config/defaults.ts`
- `src/helpers/ipcHandlers.js` — `getApiUrl()` + `getAuthUrl()` collapsed to 2-source resolver (runtime override via `backendUrlState` + `BuildConfig.OPENWHISPR_BACKEND_URL` fallback); 26 `getApiUrl()` call sites + 2 `getAuthUrl()` call sites unchanged
- `tests/e2e/fixtures/electron-launch.ts` — single env var (`OPENWHISPR_BACKEND_URL` + Vite mirror), dual setter removed
- `.github/workflows/release.yml` — `VITE_OPENWHISPR_API_URL` env-var assignments removed across 6 stages

### HOST-02 — Better Auth client supports runtime base URL change
- `src/lib/auth.ts` — `authClient` is now a JavaScript Proxy with memoized inner instance; `resolveBaseURL()` reads `useSettingsStore.serverUrl || AUTH_URL`; subscription invalidates cache and pushes URL to main via IPC on every change
- `src/stores/settingsStore.ts` — `serverUrl: string | null` + `setServerUrl()` added, persisted to localStorage
- `src/helpers/backendUrlState.js` (NEW) — main-process URL cache module with `getBackendUrl()` / `getAuthUrl()` / `setBackendUrl()` / `registerIpc(ipcMain)`
- `main.js` — registers `settings:server-url-changed` IPC listener via `backendUrlState.registerIpc(ipcMain)` in startApp Phase 1 init
- `preload.js` — exposes `electronAPI.notifyServerUrlChanged(url)`
- `src/types/electron.ts` — declares the new electronAPI method

### HOST-03 — 3 hardcoded URLs moved to defaults.ts and wired
- `src/lib/auth.ts:11` — `AUTH_URL = OPENWHISPR_AUTH_URL` (re-applies Phase 03-02 ba1c1917 that Phase 6 upstream merge regressed)
- `src/lib/auth.ts:181` — `DESKTOP_OAUTH_CALLBACK_URL = OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` (re-applied)
- `src/lib/auth.ts:240` — `redirectTo = OPENWHISPR_OAUTH_RESET_PASSWORD_URL` (re-applied)
- `src/components/notes/ShareNoteDialog.tsx:26` — new `OPENWHISPR_SHARE_VIEWER_URL` (added in Phase 1; was missing from CONFIG_INVENTORY entirely)
- `scripts/generate-build-config.js` + `src/config/defaults.ts` — generator emits `OPENWHISPR_SHARE_VIEWER_URL` (default `https://notes.openwhispr.com`)
- `docs/CONFIG_INVENTORY.md` — new row for ShareNoteDialog.tsx:26

### Acceptance Gates
- `scripts/verify-backend-url-sot.js` (NEW) + `npm run verify:backend-url-sot` — Phase 1 SoT gate. 5 checks, 0 violations. **Also gates Phase 6 future upstream merges from regressing Phase 03-02-style work.**
- `test/helpers/authClientProxy.test.js` (NEW) — 8 vitest units, all GREEN
- Live CDP drive against packed corporate-minimal build — proxy honors runtime override + reverts on clear

### CI / Maintainer
- `.planning/phases/01-*/MAINTAINER-ACTION.md` — documents the manual GH repo-var rename (`vars.VITE_OPENWHISPR_API_URL` → `vars.VITE_OPENWHISPR_BACKEND_URL`) and follow-up one-line PR

## Decisions / Lessons

1. **Proxy over lazy factory.** `authClient` symbol kept byte-identical to upstream (commit `56f4efb8`) — proxy preserves API surface, internal Proxy is implementation detail. Lazy factory would have required rename across upstream call sites. (CONTEXT D-01)
2. **Zustand + localStorage over safeStorage for `serverUrl`.** URL is configuration, not secret material. `safeStorage` is for API keys / session tokens. (CONTEXT D-02)
3. **Module-based `backendUrlState` over `global.__getBackendUrl`.** Cleaner architecture, testable in isolation, avoids global namespace pollution. Both paths satisfy the SPEC. (Executor discretion, CONTEXT D-03)
4. **release.yml split-PR rename strategy.** Phase 1 deletes env-var assignments only; GH repo var rename is a manual maintainer step in a follow-up PR. CI stays working through the transition. (CONTEXT D-05 → MAINTAINER-ACTION.md)
5. **Comment-line exclusion in verify-backend-url-sot.js.** Allow `// VITE_OPENWHISPR_API_URL retired in Phase 1` style migration notes without flagging them as SoT violations. (Executor refinement)
6. **`${{ vars.VITE_OPENWHISPR_API_URL }}` allow-listed temporarily.** GH-var-name plumbing until maintainer renames. (Same logic as #5.)

## Critical Carry-Forward Finding

Phase 03-02 (commit `ba1c1917`) ALREADY wired `auth.ts` URLs to `defaults.ts`. The Phase 6 upstream merge (commits `7b91e76e` + `56f4efb8` Better Auth migration) **regressed all three URLs back to hardcoded literals**. The v1.7.2 milestone audit missed this because it checked PROJECT.md `Validated` markers, not live grep.

**Phase 6 (recurring upstream-merge) MUST run `npm run verify:backend-url-sot` after every upstream merge.** Without this gate, the next upstream Better Auth update could silently regress Phase 1's work the same way. Added to MAINTAINER-ACTION.md.

## Maintainer Action

See `.planning/phases/01-*/MAINTAINER-ACTION.md` — manual GitHub Actions repo-var rename pending.

## Server-Side Findings (Surfaced Only)

None. The server accepts whatever host the client sends; HOST-01/02/03 are pure client-side consolidation. Per `[client_immutable]` + `[server_repo_boundary]`, no openwhispr-server edits considered.

## Known Gaps (Deferred)

1. Playwright e2e for `host-runtime-override.feature` — scaffolded RED in 01-01 but the `electron-launch.ts` fixture pattern (function-based) doesn't drop-in as a Playwright fixture for the new BDD steps. **Deferred to Phase 5 VER-01** (already plans full Playwright e2e against corporate-minimal build).
2. `useSession()` React hook orphan on URL swap — Phase 4 onboarding UI will trigger renderer reload after URL change (same pattern upstream uses for OAuth deep-link). Documented in CONTEXT D-01.
3. Signed + notarized build smoke with new flag — Phase 5 VER-03 work.

## Next

`/gsd-discuss-phase 2` — Policy ADR (codify the conscious relaxation of "build-time only configurability" rule in PROJECT.md before Phase 3 introduces `OPENWHISPR_ALLOW_CUSTOM_HOST`).

## Verification Reference

`.planning/phases/01-*/01-VERIFICATION.md` — full verification report with all 10 SPEC acceptance criteria mapped and the live CDP drive transcript.
