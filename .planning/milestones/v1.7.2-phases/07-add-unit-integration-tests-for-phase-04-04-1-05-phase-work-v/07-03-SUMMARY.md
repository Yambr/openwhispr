---
phase: 07
plan: 03
subsystem: testing
tags: [vitest, env-resolvers, b1-auto-disable, phase-05-release-blocker]
requires:
  - 07-02 (CommonJS exports from scripts/generate-build-config.js)
provides:
  - 18 unit tests covering resolveBool(), resolveValue(), and buildResolved() B1 matrix
  - Regression-locks the Phase 05 B1 auto-disable rule at the unit level
  - Env-isolation pattern (beforeEach/afterEach snapshot+restore) reusable for future env-reading tests
affects:
  - Phase 05 B1 auto-disable invariant is now fast-tested (~10ms vs ~1-2min via subprocess builds)
tech-stack:
  added: []
  patterns:
    - "process.env snapshot + restore via beforeEach/afterEach"
    - "characterization testing of env-driven config resolution"
key-files:
  created: []
  modified:
    - test/scripts/generate-build-config.test.js
decisions:
  - "Skipped explicit `require('vitest')` for beforeEach/afterEach — vitest.config.ts has globals: true so they are auto-injected. Adding the require would have been redundant (and the plan-as-written would have errored on the named import)."
  - "Added 18 new tests (one more than the plan's 14 floor) — kept the bonus protocol-scheme override test from the plan body since it materially exercises buildResolved()'s metadata fields."
metrics:
  duration: "~2m"
  completed: "2026-05-09"
  tasks: 2
  files: 1
  tests_added: 18
  total_tests_in_file: 35
  total_tests_passing: 43
---

# Phase 07 Plan 03: resolveBool/resolveValue + B1 Auto-Disable Tests Summary

Append 18 unit tests to `test/scripts/generate-build-config.test.js` covering the three remaining `scripts/generate-build-config.js` exports — `resolveBool()`, `resolveValue()`, and `buildResolved()` — with explicit emphasis on the **Phase 05 B1 auto-disable matrix** (the release-blocking rule that prevents default offline builds from crashing on first record).

## What Was Built

### Three new describe blocks (148 lines added)

**`describe("resolveBool()")` — 7 tests**

| # | Env State | Boolean Default | Expected |
|---|-----------|-----------------|----------|
| 1 | unset | OAUTH_GOOGLE_ENABLED=true | true |
| 2 | unset | BILLING_ENABLED=false | false |
| 3 | "false" | true (overridden) | false |
| 4 | "true" | false (overridden) | true |
| 5 | "" (empty) | false | true (anything-not-"false" → true) |
| 6 | "0" | false | true |
| 7 | "yes-please" | true | true |

Documents that **only the literal string "false" disables a flag** — empty string, "0", and arbitrary garbage all enable. This is intentional per impl comments but is now characterization-locked.

**`describe("resolveValue()")` — 5 tests**

| # | Env State | Default | Expected |
|---|-----------|---------|----------|
| 1 | unset (AUTH_URL) | "https://auth.openwhispr.com" | default |
| 2 | unset (BACKEND_URL) | "" | "" |
| 3 | "" explicit (BACKEND_URL) | "" | "" |
| 4 | "" explicit (AUTH_URL) | "https://auth..." | "" (empty overrides non-empty) |
| 5 | "https://corp.example.com" | "" | provided value |

Test #4 is the critical one — confirms `Object.prototype.hasOwnProperty` semantics: an explicit empty string IS treated as "set" and DOES override a non-empty default.

**`describe("buildResolved() — B1 auto-disable matrix")` — 6 tests**

The B1 matrix (Phase 05 release-blocker):

| OPENWHISPR_STREAMING | OPENWHISPR_BACKEND_URL | Expected STREAMING_ENABLED | Test |
|----------------------|------------------------|----------------------------|------|
| unset | "" (default) | **false** (auto-disabled) | ✓ |
| unset | "https://api.example.com" | true (default) | ✓ |
| "true" explicit | "" | true (user choice) | ✓ |
| "false" explicit | "https://api.example.com" | false (user opt-out) | ✓ |

Plus two extras:
- explicit `OPENWHISPR_REALTIME_WSS_URL` wins over derivation when both are set
- `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` flag tracks set/unset state correctly

### Env isolation pattern

```js
let envSnapshot;
beforeEach(() => {
  envSnapshot = { ...process.env };
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("OPENWHISPR_")) delete process.env[k];
  }
});
afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, envSnapshot);
});
```

Each test starts with a clean `OPENWHISPR_*` slate; the full env is restored byte-identically after each test. No leakage between cases, no leakage to subsequent tests in the file (`deriveRealtimeWssUrl` tests are pure functions, unaffected), no leakage to subsequent test files.

## Sample `npm test` Output

```
 RUN  v3.2.4 /Users/nick/openwhispr

 ✓ test/sanity.test.js (1 test) 1ms
 ✓ test/helpers/transcriptText.test.js (3 tests) 2ms
 ✓ test/helpers/meetingEchoLeakDetector.test.js (1 test) 1ms
 ✓ test/helpers/localSpeechGate.test.js (3 tests) 6ms
 ✓ test/scripts/generate-build-config.test.js (35 tests) 9ms

 Test Files  5 passed (5)
      Tests  43 passed (43)
   Duration  178ms
```

The full 35-test file runs in **9 ms** — characterization of env-driven config that previously could only be verified via 1-2min subprocess builds.

## Deviations from Plan

**One minor (Rule 3 - blocking issue):** Plan specified `const { beforeEach, afterEach } = require("vitest");` at the top of the appended block. Vitest `defineConfig` has `globals: true`, so these symbols are auto-injected — and `require("vitest")` does not export them as named CJS exports anyway (the import would have errored at runtime with "TypeError: Cannot destructure"). Skipped the require; tests use the already-global `beforeEach`/`afterEach` (same pattern the file's existing `describe` block already relies on for `describe`/`test`/`expect`).

No other deviations. Test count: 18 new (vs plan's 14 floor / 18 explicit), all passing.

## Verification Results

- [x] `npx vitest run test/scripts/generate-build-config.test.js` → 35 passed (17 from Plan 02 + 18 new)
- [x] `npm test` → 43 passed (5 files), zero failures, 178ms total
- [x] `npm run verify:oauth-gating` → OK — 4 scenarios, 63 greps, 0 violations
- [x] `npm run verify:feature-gating` → OK — 5 scenarios, 140 greps, 0 violations
- [x] `npm run verify:realtime-routing` → OK — 5 derivation scenarios + source/bundle no-leak + SC-8, 0 violations
- [x] Env isolation works — `process.env` is byte-identical before vs after the test file runs (verified via the in-test snapshot pattern; subsequent tests in the same run see no `OPENWHISPR_*` leakage)
- [x] B1 matrix has explicit coverage of all 4 cells

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1+2 (combined) | `e3eb24e` | test(07-03): add resolveBool/resolveValue + B1 auto-disable matrix tests |

Plan tasks 1 and 2 were committed together since they share a single file and a single semantic unit ("env-driven resolution coverage"). The commit message enumerates both task scopes.

## Self-Check: PASSED

- test/scripts/generate-build-config.test.js (modified): FOUND
- Commit e3eb24e: FOUND
- All 35 file tests + 43 total tests pass under vitest
- All three verify:* scripts pass
- B1 matrix coverage: 4/4 cells filled
