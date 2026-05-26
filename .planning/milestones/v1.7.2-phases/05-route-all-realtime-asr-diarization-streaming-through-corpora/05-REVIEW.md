---
phase: 05-route-all-realtime-asr-diarization-streaming-through-corpora
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - .github/workflows/verify-gating.yml
  - package.json
  - scripts/generate-build-config.js
  - scripts/verify-feature-gating.js
  - scripts/verify-realtime-routing.js
  - src/config/defaults.ts
  - src/helpers/openaiRealtimeStreaming.js
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 05 implements build-time routing of the OpenAI Realtime WebSocket through the
corporate backend (Speaches+LiteLLM) via a new `OPENWHISPR_REALTIME_WSS_URL` build var,
flips `STREAMING_ENABLED` default from `false` to `true` with a B1 auto-disable safety
net, replaces the hardcoded `wss://api.openai.com/v1/realtime` literal with a
build-config import, and locks the change behind a multi-scenario verification gate
(`verify-realtime-routing.js`) wired into CI.

Overall the implementation is well-scoped, defense-in-depth-shaped (build-time gate +
auto-disable + runtime guard), and the verification gate is thorough (5 derivation
scenarios + source-no-leak + bundle-no-leak + SC-8 secrets scan). The B1 auto-disable
rule correctly uses `hasOwnProperty` to distinguish explicit user opt-in from inherited
default. The empty-URL guard surfaces an operator-friendly error naming both recovery
knobs.

Two correctness Warnings worth fixing before this lands in a release build, and four
Info items (mostly comment/log staleness and minor edge cases).

## Warnings

### WR-01: Query-string concatenation on explicit override produces malformed URL

**File:** `src/helpers/openaiRealtimeStreaming.js:67`
**Issue:** The connect URL is built as
`${OPENWHISPR_REALTIME_WSS_URL}?intent=transcription`. If a maintainer sets the
explicit override to a URL that already contains a query string (e.g.,
`OPENWHISPR_REALTIME_WSS_URL=wss://realtime.other.example/ws?model=foo`), the
concatenation produces `wss://realtime.other.example/ws?model=foo?intent=transcription`
— a malformed URL with two `?` separators. The `explicit-realtime-wins` scenario in
`verify-realtime-routing.js` only asserts the resolved env var, not the final connect
URL, so this would not be caught by the gate. Speaches/LiteLLM may silently ignore the
mangled query or fail to parse intent.
**Fix:**
```js
const sep = OPENWHISPR_REALTIME_WSS_URL.includes("?") ? "&" : "?";
const url = `${OPENWHISPR_REALTIME_WSS_URL}${sep}intent=transcription`;
```
Alternatively, parse via `URL` and use `searchParams.set("intent", "transcription")`
to handle every shape (incl. duplicate `intent` if the operator already encoded one).

### WR-02: `deriveRealtimeWssUrl` silently drops query string and any non-`http:` becomes `wss:`

**File:** `scripts/generate-build-config.js:121-131`
**Issue:** Two related edge cases:
1. **Query string dropped.** `new URL("https://api.example.com/?token=abc").search` is
   `?token=abc`, but the derivation only reads `u.host` and `u.pathname` — any
   query/hash on `OPENWHISPR_BACKEND_URL` is silently lost. If a maintainer's backend
   sits behind a query-token gateway, the derivation produces a URL that 401s.
2. **Non-`http:` protocols default to `wss:`** via the ternary's else-branch. For
   example, an accidental `OPENWHISPR_BACKEND_URL=ftp://api.example.com` parses
   successfully and yields `wss://api.example.com/v1/realtime` — silently coerced
   instead of falling back to empty (which would let the auto-disable kick in).
**Fix:** Tighten the protocol check and forward query/hash:
```js
function deriveRealtimeWssUrl(backendUrl) {
  if (!backendUrl) return "";
  try {
    const u = new URL(backendUrl);
    let protocol;
    if (u.protocol === "https:") protocol = "wss:";
    else if (u.protocol === "http:") protocol = "ws:";
    else return ""; // non-http(s) — let STREAMING auto-disable handle it
    const pathPrefix = u.pathname.replace(/\/$/, "");
    return `${protocol}//${u.host}${pathPrefix}/v1/realtime${u.search}${u.hash}`;
  } catch {
    return "";
  }
}
```
If query-forwarding is intentionally out of scope, document the contract explicitly in
`docs/BUILD_CONFIG.md` ("query/hash on `OPENWHISPR_BACKEND_URL` are NOT preserved on
the derived realtime URL").

## Info

### IN-01: Stale comment — "16 logical string env-var keys"

**File:** `scripts/generate-build-config.js:16`
**Issue:** Comment reads `// 16 logical string env-var keys with their parity
defaults.` but `DEFAULTS` now contains 17 entries (Phase 05 added
`OPENWHISPR_REALTIME_WSS_URL`). The console.log on line 505 already says "17 string
keys + 6 booleans" — the in-line comment is stale.
**Fix:** Update comment to `// 17 logical string env-var keys with their parity defaults.`

### IN-02: Hard `require()` of generated cjs at module load time has no graceful fallback

**File:** `src/helpers/openaiRealtimeStreaming.js:3`
**Issue:** `require("../config/build-config.generated.cjs")` at module top-level
throws synchronously at module load if the file is missing (e.g., a developer who
manually clones and runs `node main.js` without first running `predev`/`prestart`).
This crashes the main process, not just realtime. The `predev`/`prestart`/`prebuild`
hooks in `package.json` cover the supported workflows, but a fresh-clone-and-poke
scenario surfaces a confusing `Cannot find module` rather than a clear "build config
not generated; run npm run predev" message.
**Fix:** Optional — wrap the require in a try/catch and either default
`OPENWHISPR_REALTIME_WSS_URL` to `""` (letting the existing empty-URL guard surface
the user-friendly message) or throw with a clear message naming the generation
script. Same hardening applies to other `require("..../build-config.generated.cjs")`
sites if they exist.

### IN-03: `verify-feature-gating.js` `default-no-backend` scenario does not assert `STREAMING_ENABLED=false` directly

**File:** `scripts/verify-feature-gating.js:108-112`
**Issue:** The `default-no-backend` scenario relies on absence of `STREAMING_TARGETS`
literals in the dist+preload as a proxy for "auto-disable fired". This is correct for
the renderer/preload bundle but doesn't directly verify the resolved cjs has
`STREAMING_ENABLED: false`. A future regression where the auto-disable rule breaks
but the preload-streaming.generated.cjs still emits `module.exports = function() {
return {}; }` (e.g., because the gate inverted) could pass this check while still
shipping a broken binary. `verify-realtime-routing.js` could co-assert
`cfg.STREAMING_ENABLED === false` for the no-backend scenario.
**Fix:** Add a STREAMING_ENABLED expectation to the `no-backend` scenario in
`verify-realtime-routing.js`:
```js
{ name: "no-backend", env: {}, expect: "", expectStreamingEnabled: false }
```
and check it after the cache-bust require.

### IN-04: `walkSrc` skips top-level `dist`/`node_modules` but not nested ones

**File:** `scripts/verify-realtime-routing.js:94-110`
**Issue:** `SKIP_DIR = new Set(["dist", "node_modules"])` is matched by directory
basename, so `src/dist/` and `src/some-pkg/node_modules/` are skipped correctly. This
is fine in practice — just noting that the recursion is unbounded and a deeply nested
checkout (e.g., a sub-package's `node_modules`) would still be skipped because the
basename check catches it. No action required; including this for awareness.
**Fix:** None — current behavior is correct. If you ever rename a real source
directory to `dist`, the scan would silently skip it; a comment on the SKIP_DIR set
clarifying the basename-match semantics would help future maintainers.

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
