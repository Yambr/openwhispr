---
quick_id: 260523-1om
slug: webrequest-origin-allowlist
date: 2026-05-23
status: planned
---

# Quick Task: webRequest Origin-allowlist must follow build-time backend/auth URLs

## Problem

`main.js:746-763` registers `webRequest.onBeforeSendHeaders` with a
**literal** `urls` array `[auth.openwhispr.com/*, api.openwhispr.com/*,
localhost:3000/*, 127.0.0.1:3000/*]`. The handler rewrites `Origin:
null` (Electron `file://` renderer) → request's own origin so Better
Auth's `trustedOrigins` check passes.

A corporate-lockdown build talks to `openwhispr.yambr.com` (build-time
`OPENWHISPR_BACKEND_URL` / `OPENWHISPR_AUTH_URL`). That host is not in
the literal array → the filter never fires → requests go out with
`Origin: null` → Better Auth `MISSING_OR_NULL_ORIGIN`. Auth breaks in
any non-`openwhispr.com` build.

This is **address reconfiguration for the corporate task** — explicitly
in-bounds per the fork rules (build-time configurability, Phase 3/4
pattern). Not upstream-drift: the handler callback body stays
byte-identical; only the `urls` array *source* changes from a literal
to a build-config value.

## What already exists (verified)

- `main.js:259` already does `require("./src/config/build-config.generated.cjs")`
  as `BuildConfig`. The generated config already carries
  `OPENWHISPR_BACKEND_URL`, `OPENWHISPR_AUTH_URL`,
  `OPENWHISPR_BACKEND_URL_PATTERN`.
- `OPENWHISPR_BACKEND_URL_PATTERN` is currently a **fixed `DEFAULTS`
  literal** `https://api.openwhispr.com/*` — it ignores
  `OPENWHISPR_BACKEND_URL`. Dead: nothing consumes it.
- `scripts/generate-build-config.js` `buildResolved()` already derives
  `OPENWHISPR_REALTIME_WSS_URL` from `OPENWHISPR_BACKEND_URL` via
  `deriveRealtimeWssUrl()` — the exact pattern to mirror.

## Approach

### Task 1 — generator: derive the origin patterns

`scripts/generate-build-config.js`:

1. Add `deriveOriginPattern(url)` next to `deriveRealtimeWssUrl()` —
   returns `<protocol>//<host>/*` for a valid http(s) URL, `""` for
   empty/malformed.
2. Add `OPENWHISPR_AUTH_URL_PATTERN` to `DEFAULTS` (parity default
   `https://auth.openwhispr.com/*`).
3. In `buildResolved()`: when `OPENWHISPR_BACKEND_URL` is set and the
   caller did not explicitly set `OPENWHISPR_BACKEND_URL_PATTERN`,
   derive it via `deriveOriginPattern(OPENWHISPR_BACKEND_URL)`. Same
   for `OPENWHISPR_AUTH_URL_PATTERN` from `OPENWHISPR_AUTH_URL` (which
   always has a value — derive whenever caller didn't override).
   Mirror the `deriveRealtimeWssUrl` "explicit override wins" guard.

`src/config/defaults.ts` — add the `OPENWHISPR_AUTH_URL_PATTERN`
export alongside the existing `OPENWHISPR_BACKEND_URL_PATTERN` (so the
renderer/types stay consistent — even though `main.js` reads the
generated `.cjs` directly).

### Task 2 — main.js: source the urls array from BuildConfig

`main.js` — replace the literal `urls:` array (lines 748-753) with an
expression built from `BuildConfig.OPENWHISPR_BACKEND_URL_PATTERN` +
`BuildConfig.OPENWHISPR_AUTH_URL_PATTERN`, concatenated with the two
preserved dev entries `http://localhost:3000/*` +
`http://127.0.0.1:3000/*`. Filter out empty patterns. The handler
callback body (the `(details, callback) => {...}` block) stays
byte-identical to upstream.

Keep the diff to `main.js` minimal — one `const` for the array just
above the `onBeforeSendHeaders` call, then `urls: <that const>`.

## Tasks

1. `scripts/generate-build-config.js` + `src/config/defaults.ts` —
   derive `OPENWHISPR_BACKEND_URL_PATTERN` and add+derive
   `OPENWHISPR_AUTH_URL_PATTERN`.
2. `main.js` — source the `webRequest` `urls` array from `BuildConfig`,
   preserving the two localhost dev entries; handler body unchanged.

## Out of scope

- Re-tagging / releasing — separate manual step.
- Editing the upstream handler callback logic.
- Server repo.

## Verification

1. `OPENWHISPR_PROVIDER_LOCKDOWN=true OPENWHISPR_BACKEND_URL=https://openwhispr.yambr.com node scripts/generate-build-config.js`
   → `src/config/build-config.generated.cjs` has
   `OPENWHISPR_BACKEND_URL_PATTERN: "https://openwhispr.yambr.com/*"`.
2. Default regen `node scripts/generate-build-config.js` →
   `OPENWHISPR_BACKEND_URL_PATTERN` falls back to
   `https://api.openwhispr.com/*` (upstream parity when no env).
3. `main.js`'s `webRequest` `urls` array references the config values
   and still includes `localhost:3000` + `127.0.0.1:3000`.
4. `git show upstream/main:main.js` — the `onBeforeSendHeaders`
   callback body is byte-identical to upstream; only the `urls:`
   expression changed.
5. `npm run test:build-config` green.
6. `node -c main.js` syntax check passes.
