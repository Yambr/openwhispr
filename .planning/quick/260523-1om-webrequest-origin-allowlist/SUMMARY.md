---
quick_id: 260523-1om
slug: webrequest-origin-allowlist
date: 2026-05-23
status: complete
commits: [generator+config, main.js]
---

# Summary: webRequest Origin-allowlist follows build-time backend/auth URLs

## What was wrong

`main.js:746-763` registered `webRequest.onBeforeSendHeaders` with a
**literal** `urls` array hardcoded to `*.openwhispr.com`
(`auth.openwhispr.com/*`, `api.openwhispr.com/*`, `localhost:3000/*`,
`127.0.0.1:3000/*`). The handler rewrites `Origin: null` (Electron
`file://` renderer) → the request's own origin so Better Auth's
`trustedOrigins` check passes.

A corporate-lockdown build talks to `openwhispr.yambr.com` (build-time
`OPENWHISPR_BACKEND_URL` / `OPENWHISPR_AUTH_URL`). That host was not in
the literal array → the filter never fired for it → requests went out
with `Origin: null` → Better Auth `MISSING_OR_NULL_ORIGIN`. **Auth was
broken in any non-`openwhispr.com` build.** Masked until now because
every published release shipped with empty URL vars and fell back to
the `openwhispr.com` defaults — which *do* match the literal.

Filed as F6 in `.planning/phases/08-client-server-audit/FIXES-CLIENT.md`.

## Why this was in-bounds to fix in the client

The `main.js` handler is upstream code (`56f4efb8`, Gabriel Stein, PR
#686). But this change is **address reconfiguration for the corporate
task** — build-time configurability, the Phase 3/4 pattern — not
upstream-drift. The handler callback body is byte-identical to upstream
(verified by `diff` against `upstream/main:main.js`); only the `urls`
array *source* changed from a literal to a build-config value. Zero
upstream-merge cost.

## Fix

**Generator** (`scripts/generate-build-config.js`):
- Added `deriveOriginPattern(url)` → `<scheme>//<host>/*` for a valid
  http(s) URL, `""` otherwise.
- Added `OPENWHISPR_AUTH_URL_PATTERN` to `DEFAULTS` (parity default
  `https://auth.openwhispr.com/*`).
- `buildResolved()` now derives `OPENWHISPR_BACKEND_URL_PATTERN` from
  `OPENWHISPR_BACKEND_URL` and `OPENWHISPR_AUTH_URL_PATTERN` from
  `OPENWHISPR_AUTH_URL` when the caller did not explicitly override the
  pattern — mirroring the existing `OPENWHISPR_REALTIME_WSS_URL`
  derivation. Previously `OPENWHISPR_BACKEND_URL_PATTERN` was a fixed
  `DEFAULTS` literal that ignored `OPENWHISPR_BACKEND_URL` — a dead
  constant nothing imported.

**Config plumbing**: `defaults.ts` exports `OPENWHISPR_AUTH_URL_PATTERN`;
`vite.config.mjs` + `build-env.d.ts` get the `VITE_*` twin for renderer
consistency.

**`main.js`**: the `webRequest` `urls` array is now built from
`BuildConfig.OPENWHISPR_AUTH_URL_PATTERN` +
`OPENWHISPR_BACKEND_URL_PATTERN` + the two preserved `localhost:3000`
dev entries, deduped via `new Set` (backend and auth are the same host
in a lockdown build → one entry, not two).

## Verification

1. Lockdown sim — `OPENWHISPR_PROVIDER_LOCKDOWN=true
   OPENWHISPR_BACKEND_URL=https://openwhispr.yambr.com
   OPENWHISPR_AUTH_URL=https://openwhispr.yambr.com node
   scripts/generate-build-config.js` → both patterns derive to
   `https://openwhispr.yambr.com/*`; `main.js`'s `originRewriteUrls`
   resolves to `["https://openwhispr.yambr.com/*",
   "http://localhost:3000/*", "http://127.0.0.1:3000/*"]`.
2. Default regen → patterns fall back to `auth./api.openwhispr.com/*`;
   `originRewriteUrls` = the original 4-entry literal (upstream parity).
3. `node -c main.js` — syntax OK.
4. `diff` of the `onBeforeSendHeaders` callback body vs
   `upstream/main:main.js` — **byte-identical**.
5. `npm run test:build-config` — 15/15 green.

## Operator note

This unblocks the `openwhispr.yambr.com` lockdown release: with the
repo vars now set (`VITE_OPENWHISPR_API_URL` etc.) a tagged release
builds with `OPENWHISPR_BACKEND_URL=https://openwhispr.yambr.com`, the
generator derives the matching Origin patterns, and the webRequest
filter covers the real host. Without this fix the lockdown release
would have had working lockdown UI + realtime but a dead auth journey.

## Out of scope

Re-tagging / releasing — separate manual step.
