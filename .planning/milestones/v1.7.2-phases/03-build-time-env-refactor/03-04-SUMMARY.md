---
phase: 03-build-time-env-refactor
plan: 4
subsystem: oauth
tags: [build-time-env, google-oauth, calendar-api]
requires:
  - "src/config/build-config.generated.cjs (Plan 1)"
provides:
  - "Google OAuth helpers consuming build-config.generated.cjs (zero hardcoded Google URLs)"
affects:
  - src/helpers/googleCalendarOAuth.js
  - src/helpers/googleCalendarManager.js
tech-stack:
  added: []
  patterns:
    - "CommonJS require() of frozen build-config.generated.cjs from helpers"
    - "Per-provider OAuth env var pattern (D-13) — separate Google* keys enable Phase 4 CFG-03 selective gating"
key-files:
  created: []
  modified:
    - src/helpers/googleCalendarOAuth.js
    - src/helpers/googleCalendarManager.js
decisions:
  - "Kept module-local aliases (GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, CALENDAR_API_BASE) reading from required values, instead of inlining the imported names at every call site — preserves call-site readability and minimizes diff churn while still satisfying the truths (literals removed, value flows from build-config)"
  - "Removed the process.env.VITE_OPENWHISPR_OAUTH_CALLBACK_URL fallback inside _getDesktopCallbackUrl — Plan 1's generator already resolves overrides via hasOwnProperty; runtime env reads in helpers would re-introduce the drift surface Plan 6 is meant to forbid"
metrics:
  duration: ~5min
  tasks: 2
  files: 2
  completed: 2026-05-08
---

# Phase 3 Plan 4: Google OAuth Cluster Summary

Replaced all five Google OAuth / Calendar URL literals in the two CommonJS helper files with named requires from `src/config/build-config.generated.cjs`, completing the desktop-callback consolidation started in Plan 2 and giving Phase 4 CFG-03 per-provider toggles to gate against (D-13).

## What Was Built

### Task 1 — googleCalendarOAuth.js (commit `a513611`)

Added a destructured `require("../config/build-config.generated.cjs")` for four keys at the top of the file: `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`, `OPENWHISPR_OAUTH_GOOGLE_AUTH_URL`, `OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL`, `OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL`. Module-local `GOOGLE_AUTH_URL` / `GOOGLE_TOKEN_URL` consts now read from the required values; `DEFAULT_DESKTOP_CALLBACK_URL` was deleted entirely (it had no remaining consumers after `_getDesktopCallbackUrl()` was simplified to return `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` directly). The inline revoke literal in `revokeToken()` was replaced with `OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL`. The fragile `process.env.VITE_OPENWHISPR_OAUTH_CALLBACK_URL` fallback was dropped — Plan 1's generator already owns override resolution via `hasOwnProperty`.

CONFIG_INVENTORY rows handled: 8 (callback URL), 10 (auth URL), 11 (token URL), 12 (revoke URL).

### Task 2 — googleCalendarManager.js (commit `d62d473`)

Added `require("../config/build-config.generated.cjs")` for `OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL`; module-local `CALENDAR_API_BASE` const now reads from it. CONFIG_INVENTORY row 13.

## Verification Performed

- `grep -cE "https://(accounts\.google\.com|oauth2\.googleapis\.com)" src/helpers/googleCalendarOAuth.js` → `0`
- `grep -cF "openwhispr.com/auth/desktop-callback" src/helpers/googleCalendarOAuth.js` → `0`
- `grep -cE "process\.env\.(VITE_)?OPENWHISPR_OAUTH_CALLBACK_URL" src/helpers/googleCalendarOAuth.js` → `0`
- `grep -cF "googleapis.com/calendar" src/helpers/googleCalendarManager.js` → `0`
- Both files contain `require("../config/build-config.generated.cjs")`.
- `node --check` passes on both files.

## Deviations from Plan

None — plan executed exactly as written. Module-local const aliases (`GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `CALENDAR_API_BASE`) were retained as thin readability wrappers over the required values; this is consistent with the plan's intent (the plan specifies "replace `<literal>` with `<imported name>`" — re-binding through a same-named const preserves all internal call sites unchanged while the literal is gone).

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Keep `GOOGLE_AUTH_URL` / `GOOGLE_TOKEN_URL` / `CALENDAR_API_BASE` as module-local aliases | Preserves call-site readability, no diff churn at the 4+ usage sites; truths still hold (no string literals, value flows from build-config). |
| Drop `_getDesktopCallbackUrl`'s `process.env` fallback entirely | Plan 1's generator owns env override resolution via `hasOwnProperty`; a runtime `process.env` read here would re-introduce exactly the drift surface Plan 6's grep gate is designed to forbid. Single-source-of-truth is the whole point of the refactor. |
| Delete `DEFAULT_DESKTOP_CALLBACK_URL` const | After collapsing the fallback chain it had zero consumers — leaving an unused literal would have failed the row-8 truth grep. |

## Files Modified

- `src/helpers/googleCalendarOAuth.js` (4 literals removed, 1 destructured require added, 1 unused const deleted, 1 fallback chain collapsed)
- `src/helpers/googleCalendarManager.js` (1 literal removed, 1 destructured require added)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `a513611` | googleCalendarOAuth.js → build-config.generated.cjs (rows 8, 10, 11, 12) |
| 2 | `d62d473` | googleCalendarManager.js → build-config.generated.cjs (row 13) |

## Self-Check: PASSED

- `src/helpers/googleCalendarOAuth.js` — FOUND, contains `build-config.generated.cjs`, zero Google literals, zero callback-URL literals, zero `OPENWHISPR_OAUTH_CALLBACK_URL` env reads
- `src/helpers/googleCalendarManager.js` — FOUND, contains `build-config.generated.cjs`, zero `googleapis.com/calendar` literal
- Commit `a513611` — FOUND
- Commit `d62d473` — FOUND
- `node --check` — passes both files
