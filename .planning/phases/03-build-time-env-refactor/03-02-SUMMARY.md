---
phase: 03-build-time-env-refactor
plan: 2
subsystem: auth-cluster
tags: [build-time-env, auth, oauth, webrequest, refactor]
requires:
  - "03-01 defaults.ts + build-config.generated.{ts,cjs} (Wave 1)"
provides:
  - "src/lib/auth.ts reads OPENWHISPR_AUTH_URL / OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL / OPENWHISPR_OAUTH_RESET_PASSWORD_URL from defaults.ts"
  - "main.js reads OPENWHISPR_AUTH_URL + OPENWHISPR_BACKEND_URL_PATTERN from build-config.generated.cjs"
  - "src/helpers/ipcHandlers.js getAuthUrl/getApiUrl read from build-config.generated.cjs"
affects:
  - src/lib/auth.ts
  - main.js
  - src/helpers/ipcHandlers.js
tech-stack:
  added: []
  patterns:
    - "Renderer TS: import named build-time constants from src/config/defaults.ts"
    - "Main/CJS: require frozen build-config.generated.cjs and destructure constants"
    - "URL pattern hygiene: ensureNoTrailingSlash helper for auth pattern construction"
key-files:
  created: []
  modified:
    - src/lib/auth.ts
    - main.js
    - src/helpers/ipcHandlers.js
decisions:
  - "Removed unused OPENWHISPR_BACKEND_URL destructure from main.js (not consumed there; row 6 is ipcHandlers.js scope)"
  - "Removed runtimeEnv fallback block from ipcHandlers.js — build-time generator now covers all paths"
  - "Used relative require paths: ./src/config/build-config.generated.cjs from main.js, ../config/build-config.generated.cjs from src/helpers/"
metrics:
  duration: ~8min
  tasks: 3
  files: 3
  completed: 2026-05-08
---

# Phase 3 Plan 2: Auth Cluster Summary

Wave 2 — replaced 6 hardcoded URL literals across 3 files with build-time constants sourced from the Wave 1 single-source-of-truth modules. Default build (no env vars) remains byte-identical to upstream Yambr; setting `OPENWHISPR_AUTH_URL=https://test.example.com` at build time now redirects all three call sites to the configured host.

## What Was Built

### Task 1 — `src/lib/auth.ts` (commit `ba1c191`)

Renderer-side auth client. Added a named import from `../config/defaults`:

```ts
import {
  OPENWHISPR_AUTH_URL,
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL,
  OPENWHISPR_OAUTH_RESET_PASSWORD_URL,
} from "../config/defaults";
```

Three rewrites:
- `AUTH_URL` (was `import.meta.env.VITE_AUTH_URL || "https://auth.openwhispr.com"`) now `OPENWHISPR_AUTH_URL` — the encapsulated `pick()` in defaults.ts already handles the Vite-define + parity-default fallback.
- `DESKTOP_OAUTH_CALLBACK_URL` constant now `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`.
- `requestPasswordReset` `redirectTo` now `OPENWHISPR_OAUTH_RESET_PASSWORD_URL`.

`OPENWHISPR_API_URL` references at lines 109/114 deliberately untouched — they belong to row 6 / Plan 5 scope.

### Task 2 — `main.js` (commit `ca06c6d`)

Main process require-block added immediately after `dotenv.config()`:

```js
const {
  OPENWHISPR_AUTH_URL,
  OPENWHISPR_BACKEND_URL_PATTERN,
} = require("./src/config/build-config.generated.cjs");

const ensureNoTrailingSlash = (u) => u.replace(/\/+$/, "");
```

Two rewrites:
- `resolveAuthUrl()` collapsed from a 4-tier `process.env.AUTH_URL || process.env.VITE_AUTH_URL || runtimeEnv.VITE_AUTH_URL || "https://auth.openwhispr.com"` chain to a single-line `return OPENWHISPR_AUTH_URL`. The `runtimeEnv` JSON read for that resolution path is removed; the function no longer touches `process.env` or `fs`.
- `webRequest.onBeforeSendHeaders` `urls` array — `"https://auth.openwhispr.com/*"` becomes `` `${ensureNoTrailingSlash(OPENWHISPR_AUTH_URL)}/*` ``; `"https://api.openwhispr.com/*"` becomes `OPENWHISPR_BACKEND_URL_PATTERN` directly. **No inline `api.openwhispr.com` literal remains** — the parity URL lives only in the generator's `DEFAULTS` map (`scripts/generate-build-config.js`).

`OPENWHISPR_BACKEND_URL` was destructured initially but pruned because main.js has no other consumer (row 6's `getApiUrl()` lives in ipcHandlers.js — Task 3 scope).

### Task 3 — `src/helpers/ipcHandlers.js` (commit `2759336`)

Top-of-file require added next to existing helper requires:

```js
const {
  OPENWHISPR_AUTH_URL,
  OPENWHISPR_BACKEND_URL,
} = require("../config/build-config.generated.cjs");
```

Two rewrites inside the `register()` body:
- `getApiUrl()` collapsed from a 4-tier chain (`process.env.OPENWHISPR_API_URL || process.env.VITE_OPENWHISPR_API_URL || runtimeEnv.VITE_OPENWHISPR_API_URL || ""`) to `() => OPENWHISPR_BACKEND_URL`. The empty-default semantic from row 6 is preserved (defaults.ts `pickAllowEmpty` propagates through to the cjs export).
- `getAuthUrl()` collapsed from the same 4-tier chain to `() => OPENWHISPR_AUTH_URL`.
- The `runtimeEnv` IIFE block (lines 3318-3328 pre-refactor) became dead code after both consumers were rewritten and was removed.

Each thin function carries a JSDoc comment: `// CONFIG_INVENTORY rows 3,6 — single-source-of-truth via src/config/build-config.generated.cjs`.

## Path Resolution Choices

| File | Require/Import | Path |
|------|----------------|------|
| `src/lib/auth.ts` | `import` | `../config/defaults` (TS, renderer-side) |
| `main.js` | `require` | `./src/config/build-config.generated.cjs` (CJS, root-relative) |
| `src/helpers/ipcHandlers.js` | `require` | `../config/build-config.generated.cjs` (CJS, helpers→config) |

Rationale: keep main / helpers consuming the frozen `.cjs` module (zero `import.meta` semantics in CommonJS), while renderer code uses the TS aggregator that wraps Vite-define overrides on top of the same generated values.

## Verification Performed

```text
$ grep -cF 'auth.openwhispr.com' src/lib/auth.ts main.js src/helpers/ipcHandlers.js
src/lib/auth.ts:0
main.js:0
src/helpers/ipcHandlers.js:0

$ grep -cF 'api.openwhispr.com' main.js
0

$ grep -cF 'openwhispr.com/auth/desktop-callback' src/lib/auth.ts
0

$ grep -cF 'openwhispr.com/reset-password' src/lib/auth.ts
0

$ node --check main.js && node --check src/helpers/ipcHandlers.js
OK

$ npx tsc --noEmit -p src/tsconfig.json
(no errors)

$ grep -c 'build-config.generated.cjs' main.js src/helpers/ipcHandlers.js
main.js:1
src/helpers/ipcHandlers.js:3   # 1 require + 2 JSDoc references

$ grep -cE 'process\.env\.(AUTH_URL|VITE_AUTH_URL|OPENWHISPR_API_URL|VITE_OPENWHISPR_API_URL)' main.js src/helpers/ipcHandlers.js
main.js:0
src/helpers/ipcHandlers.js:0
```

All 7 must-haves truths observable; CFG-04 anchor (`OPENWHISPR_BACKEND_URL`) consumed at IPC `getApiUrl` site; new `OPENWHISPR_BACKEND_URL_PATTERN` consumed at the main.js webRequest site without any inline parity literal.

## Confirmation: `api.openwhispr.com` literal count in `main.js` is **0**

No documented exception, no carve-out. The parity URL is now exclusive to `scripts/generate-build-config.js` (DEFAULTS table) — the v1 source-of-truth contract.

## Deviations from Plan

**1. [Rule 3 — Blocking issue] Removed dead `runtimeEnv` IIFE in `src/helpers/ipcHandlers.js`**

- **Found during:** Task 3
- **Issue:** After both `getAuthUrl` and `getApiUrl` were rewritten to single-line returns, the `runtimeEnv` JSON-loading IIFE (10 lines) had zero remaining consumers in the surrounding scope. Leaving it would trigger `no-unused-vars` and add cognitive overhead for future readers.
- **Fix:** Removed the IIFE block.
- **Files modified:** `src/helpers/ipcHandlers.js`
- **Commit:** `2759336`

**2. [Rule 3 — Blocking issue] Pruned unused `OPENWHISPR_BACKEND_URL` destructure in `main.js`**

- **Found during:** Task 2
- **Issue:** Plan suggested destructuring `OPENWHISPR_BACKEND_URL` alongside `OPENWHISPR_AUTH_URL` and `OPENWHISPR_BACKEND_URL_PATTERN`, but main.js has no `BACKEND_URL` consumer (row 6 lives in ipcHandlers.js).
- **Fix:** Kept only the two values main.js actually uses.
- **Files modified:** `main.js`
- **Commit:** `ca06c6d`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Drop `runtimeEnv` IIFE in ipcHandlers.js | All three former consumers (`getApiUrl`, `getAuthUrl`, future row-6 reads) replaced by build-time constants — `runtime-env.json` is no longer the bootstrap fallback for these paths. |
| Keep `runtime-env.json` writer in vite.config.mjs | Not in this plan's scope; other call sites may still inspect it. Plan 6 (verify-parity) audits remaining `runtime-env` consumers. |
| `ensureNoTrailingSlash` defined inline in main.js | Single-use helper, no need to extract to a shared utility — it's local to the webRequest pattern construction. |
| One JSDoc comment per thin function | Anchors the refactor to CONFIG_INVENTORY rows for future grep-trace audits. |

## Files Modified

- `src/lib/auth.ts` (5 line delta — import block + 3 literal replacements)
- `main.js` (3 line additions for require + helper, 13 lines deleted from `resolveAuthUrl` + webRequest)
- `src/helpers/ipcHandlers.js` (4 lines added for require, 23 lines removed from `getAuthUrl`/`getApiUrl`/runtimeEnv)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `ba1c191` | Refactor src/lib/auth.ts to read auth URLs from defaults.ts |
| 2 | `ca06c6d` | Refactor main.js to read auth+backend URLs from build-config.generated.cjs |
| 3 | `2759336` | Refactor ipcHandlers.js getAuthUrl/getApiUrl to read from build-config.generated.cjs |

## Foundation Ready For

- **Wave 3 (Plan 4)** googleCalendarOAuth.js will consume the same require pattern (`../config/build-config.generated.cjs`) and the OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN boolean for channel-map vs env precedence.
- **Wave 4 (Plan 5)** model registry / inference URLs follow the renderer-side import pattern from `src/lib/auth.ts`.
- **Wave 5 (Plan 6)** parity grep gate can now assert: `auth.openwhispr.com` and `api.openwhispr.com` literals appear ONLY in `scripts/generate-build-config.js`.

## Build Requirement Note

Both `main.js` and `src/helpers/ipcHandlers.js` `require()` `src/config/build-config.generated.cjs`, which is gitignored and produced at prebuild/predev/prestart time by `scripts/generate-build-config.js`. Running `node main.js` directly without first invoking `npm run prestart` (or the predev hook) will throw `MODULE_NOT_FOUND`. Wave 1 already wired the generator into all 7 lifecycle scripts (`prestart`, `predev`, `predev:main`, `prebuild`, `prebuild:mac`, `prebuild:win`, `prebuild:linux`) so all standard developer workflows produce the file before main starts.

## Self-Check: PASSED

- `src/lib/auth.ts` modified — FOUND (commit `ba1c191`)
- `main.js` modified — FOUND (commit `ca06c6d`)
- `src/helpers/ipcHandlers.js` modified — FOUND (commit `2759336`)
- `auth.openwhispr.com` literal count in 3 target files — `0` ✓
- `api.openwhispr.com` literal count in `main.js` — `0` ✓
- `openwhispr.com/auth/desktop-callback` in `src/lib/auth.ts` — `0` ✓
- `openwhispr.com/reset-password` in `src/lib/auth.ts` — `0` ✓
- `node --check main.js` — exit 0 ✓
- `node --check src/helpers/ipcHandlers.js` — exit 0 ✓
- `npx tsc --noEmit -p src/tsconfig.json` — no errors ✓
