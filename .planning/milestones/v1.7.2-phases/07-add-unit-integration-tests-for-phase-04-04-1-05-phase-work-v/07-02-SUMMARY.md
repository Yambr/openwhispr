---
phase: 07
plan: 02
subsystem: testing
tags: [vitest, characterization, url-derivation, realtime, phase-05-d-01]
requires:
  - 07-01 (vitest harness)
provides:
  - 17 unit tests for deriveRealtimeWssUrl()
  - CommonJS exports from scripts/generate-build-config.js (deriveRealtimeWssUrl, resolveBool, resolveValue, buildResolved, DEFAULTS, BOOL_DEFAULTS, KEYS, BOOL_KEYS)
  - Characterization baseline for Phase 05 D-01 URL derivation rules
affects:
  - All future tests that need to import scripts/generate-build-config.js
  - Phase 05 D-01 invariants are now regression-locked at the unit level
tech-stack:
  added: []
  patterns:
    - "require.main === module guard for dual CLI/library modules"
    - "characterization testing (assert known-good output, expose latent bugs)"
key-files:
  created:
    - test/scripts/generate-build-config.test.js
  modified:
    - scripts/generate-build-config.js
decisions:
  - "Use require.main === module guard rather than splitting into a separate library module — keeps the single source of truth in one file and minimizes diff to existing CLI behavior."
metrics:
  duration: "~1m"
  completed: "2026-05-09"
  tasks: 2
  files: 2
  tests_added: 17
  total_tests_passing: 25
---

# Phase 07 Plan 02: Unit Tests for deriveRealtimeWssUrl() Summary

Add 17 unit tests covering every documented edge case of `deriveRealtimeWssUrl()` (Phase 05 D-01). Export the function (and 7 sibling helpers/constants) from `scripts/generate-build-config.js` via a `require.main === module` guard so the existing CLI behavior is byte-identical while tests can `require()` the module.

## What Was Built

### CommonJS exports (`scripts/generate-build-config.js`)

Wrapped the bare `main();` invocation at end-of-file in:

```js
if (require.main === module) {
  main();
}

module.exports = {
  deriveRealtimeWssUrl,
  resolveBool,
  resolveValue,
  buildResolved,
  DEFAULTS,
  BOOL_DEFAULTS,
  KEYS,
  BOOL_KEYS,
};
```

CLI invocation (`node scripts/generate-build-config.js`, used by 30+ npm scripts and `verify-realtime-routing.js`'s `spawnSync`) keeps `require.main === module` true → `main()` runs → 6 `.generated` files emitted as before. `require("../../scripts/generate-build-config")` from a test file does NOT run `main()`.

### Test file (`test/scripts/generate-build-config.test.js`)

17 tests in a single `describe("deriveRealtimeWssUrl()")` block:

| # | Case | Expected |
|---|------|----------|
| 1 | empty string | `""` |
| 2 | undefined | `""` |
| 3 | null | `""` |
| 4 | https://host | wss://host/v1/realtime |
| 5 | http://host | ws://host/v1/realtime |
| 6 | https://host/v1 (sub-path) | wss://host/v1/v1/realtime |
| 7 | https://host/ (trailing slash) | wss://host/v1/realtime |
| 8 | https://host/v1/ (sub-path + trailing slash) | wss://host/v1/v1/realtime |
| 9 | https://host:8443 (explicit port) | wss://host:8443/v1/realtime |
| 10 | https://host?token=foo (query) | wss://host/v1/realtime?token=foo |
| 11 | https://host#frag (fragment — CR-03 drop) | wss://host/v1/realtime |
| 12 | https://[::1]:8443 (IPv6) | wss://[::1]:8443/v1/realtime |
| 13 | ftp://example.com | `""` |
| 14 | file:///etc/passwd | `""` |
| 15 | ws://api.example.com | `""` |
| 16 | "not a url" (malformed) | `""` |
| 17 | https://host/api?key=abc (query + sub-path) | wss://host/api/v1/realtime?key=abc |

All 17 pass on the first run. **No latent impl bugs surfaced** — Phase 05 D-01's implementation matches the documented invariants exactly.

## Sample `npm test` Output

```
 RUN  v3.2.4 /Users/nick/openwhispr

 ✓ test/sanity.test.js (1 test) 1ms
 ✓ test/helpers/meetingEchoLeakDetector.test.js (1 test) 1ms
 ✓ test/helpers/transcriptText.test.js (3 tests) 2ms
 ✓ test/helpers/localSpeechGate.test.js (3 tests) 17ms
 ✓ test/scripts/generate-build-config.test.js (17 tests) 2ms

 Test Files  5 passed (5)
      Tests  25 passed (25)
   Duration  391ms
```

The 17-test file alone runs in **2ms** (test execution) — negligible overhead.

## Deviations from Plan

None — the plan executed exactly as written. The plan author called out 12+ test cases as the floor; we shipped 17 (the explicitly enumerated set). No characterization mismatches surfaced, so no impl fixes were needed.

## Verification Results

- [x] `npx vitest run test/scripts/generate-build-config.test.js` → 17 passed
- [x] `npm test` → 25 passed (5 files), zero failures
- [x] `node scripts/generate-build-config.js` still emits the 6 `.generated` files
- [x] `node -e "require('./scripts/generate-build-config')"` returns 8-key object
- [x] `npm run verify:realtime-routing` exits 0 (5 derivation scenarios + source-no-leak + bundle-no-leak + SC-8)
- [x] No filesystem, no env vars, no subprocess in the new tests — pure-function only
- [x] CLI behavior identical (same console output, same files written, same byte content)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `67fb3dd` | chore(07-02): export deriveRealtimeWssUrl from generate-build-config |
| 2 | `6ddd5d8` | test(07-02): add 17 unit tests for deriveRealtimeWssUrl() |

## Self-Check: PASSED

- test/scripts/generate-build-config.test.js: FOUND
- scripts/generate-build-config.js (modified — exports added): FOUND
- Commit 67fb3dd: FOUND
- Commit 6ddd5d8: FOUND
- All 17 new tests + 8 pre-existing tests pass under vitest
- verify:realtime-routing still passes
