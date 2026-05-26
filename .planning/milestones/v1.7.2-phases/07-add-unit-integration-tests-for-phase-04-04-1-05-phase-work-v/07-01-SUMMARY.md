---
phase: 07
plan: 01
subsystem: testing-infrastructure
tags: [vitest, testing, infrastructure, characterization]
requires: []
provides:
  - vitest harness wired to package.json
  - vitest.config.ts with node env, globals, scoped v8 coverage
  - npm test / test:watch / test:coverage scripts
  - 3 migrated CJS-compatible tests under test/helpers/
  - test/sanity.test.js smoke check
affects:
  - All future Phase 07 plans (02-06) depend on this harness
tech-stack:
  added: [vitest@3.2.4, "@vitest/coverage-v8@3.2.x"]
  patterns: [vitest globals, CJS-compatible test files, characterization testing]
key-files:
  created:
    - vitest.config.ts
    - test/sanity.test.js
  modified:
    - package.json
    - package-lock.json
    - test/helpers/transcriptText.test.js
    - test/helpers/localSpeechGate.test.js
    - test/helpers/meetingEchoLeakDetector.test.js
decisions:
  - "Drop explicit require(\"vitest\") in test files — use globals: true instead. Vitest cannot be required from CJS modules; only ESM import or globals work."
metrics:
  duration: "~2m"
  completed: "2026-05-09"
  tasks: 2
  files: 7
  tests_passing: 8
---

# Phase 07 Plan 01: Vitest Setup + Migrate Existing Tests Summary

Stand up vitest 3.2.4 as the test harness for Phase 07; migrate 3 existing `node:test`/`node:assert/strict`-based tests in `test/helpers/` to vitest's `expect()` API; add a sanity smoke test. `npm test` is now wired.

## What Was Built

### vitest config (`vitest.config.ts`)

- Environment: `node` (matches main-process / CJS helper code)
- `globals: true` — `test`, `expect`, `describe` available without imports
- Include patterns: `test/**/*.test.{js,ts,mjs,cjs}`, `scripts/**`, `src/**`
- Coverage: v8 provider, scoped to ONLY phase-04/04.1/05 files per CONTEXT.md D-02:
  - `scripts/generate-build-config.js`
  - `src/helpers/openaiRealtimeStreaming.js`
- `testTimeout: 10_000`

### npm scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

### Migrated tests

All 3 migrated mechanically (no body/data changes):

| File | Tests | node:test API → vitest API |
|------|-------|-----------------------------|
| `test/helpers/transcriptText.test.js` | 3 | `assert.equal(a,b)` → `expect(a).toBe(b)` |
| `test/helpers/localSpeechGate.test.js` | 3 | `assert.equal` → `expect().toBe`; `assert.deepEqual` → `expect().toEqual` |
| `test/helpers/meetingEchoLeakDetector.test.js` | 1 | `assert.equal(a,b)` → `expect(a).toBe(b)` |

All passed unchanged (no body fixes required) — confirms upstream behavior is intact.

### Sanity test

`test/sanity.test.js` — single `1+1=2` test that fails fast if the harness is broken.

## Sample `npm test` Output

```
> open-whispr@1.7.2 test
> vitest run

 RUN  v3.2.4 /Users/nick/openwhispr

 ✓ test/helpers/meetingEchoLeakDetector.test.js (1 test) 1ms
 ✓ test/sanity.test.js (1 test) 1ms
 ✓ test/helpers/transcriptText.test.js (3 tests) 2ms
 ✓ test/helpers/localSpeechGate.test.js (3 tests) 7ms

 Test Files  4 passed (4)
      Tests  8 passed (8)
   Duration  189ms
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `require("vitest")` from migrated tests**

- **Found during:** Task 2 (first `npm test` run)
- **Issue:** Plan instructed to use `const { test, expect } = require("vitest");` at the top of each migrated test. Vitest 3.x explicitly rejects this with: *"Vitest cannot be imported in a CommonJS module using require(). Please use 'import' instead."* All 4 test files failed to collect.
- **Fix:** Since `vitest.config.ts` already enables `globals: true`, the `require("vitest")` line is unnecessary. Replaced with a comment noting that globals are enabled. `test()` and `expect()` are now resolved from the global scope at runtime.
- **Files modified:** `test/sanity.test.js`, `test/helpers/transcriptText.test.js`, `test/helpers/localSpeechGate.test.js`, `test/helpers/meetingEchoLeakDetector.test.js`
- **Commit:** `95e46ec`
- **Note for future plans:** New CJS test files in this repo should NOT `require("vitest")`. Either rely on globals or convert to ESM and use `import { test, expect } from "vitest"`.

## Verification Results

- [x] `npm test` exits 0
- [x] 4 test files passing (sanity + 3 migrated)
- [x] 8 tests passing (1 sanity + 3 transcriptText + 3 localSpeechGate + 1 meetingEchoLeakDetector)
- [x] Zero failures, zero skipped
- [x] `npx vitest --version` → `vitest/3.2.4 darwin-arm64 node-v24.15.0`
- [x] `vitest.config.ts` exists at project root
- [x] All 3 npm scripts present in `package.json`
- [x] `vitest` + `@vitest/coverage-v8` in `devDependencies`
- [x] `npm install` completes cleanly under Node 24.15.0 (matches `.nvmrc`)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `5c7759c` | chore(07-01): add vitest harness + npm scripts |
| 2 | `95e46ec` | test(07-01): migrate 3 existing tests to vitest + add sanity test |

## Self-Check: PASSED

- vitest.config.ts: FOUND
- test/sanity.test.js: FOUND
- test/helpers/transcriptText.test.js: FOUND (modified)
- test/helpers/localSpeechGate.test.js: FOUND (modified)
- test/helpers/meetingEchoLeakDetector.test.js: FOUND (modified)
- package.json scripts (test/test:watch/test:coverage): FOUND
- package.json devDependencies (vitest/@vitest/coverage-v8): FOUND
- Commit 5c7759c: FOUND
- Commit 95e46ec: FOUND
- All 8 tests pass under vitest
