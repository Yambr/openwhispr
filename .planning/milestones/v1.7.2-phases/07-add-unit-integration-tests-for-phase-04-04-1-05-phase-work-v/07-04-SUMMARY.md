---
phase: "07"
plan: "04"
subsystem: testing
tags: [tests, vitest, openai-realtime, build-config, mocking]
requires: ["07-03"]
provides:
  - test/helpers/openaiRealtimeStreaming.test.js
affects:
  - test suite (46 tests, +3 new)
tech-stack:
  added: []
  patterns:
    - "require.cache injection for reliable CJS module mocking under vitest"
key-files:
  created:
    - test/helpers/openaiRealtimeStreaming.test.js
  modified: []
decisions:
  - "Use direct require.cache injection instead of vi.doMock — vitest's mock helpers don't reliably intercept plain require() calls inside CJS source code (only ESM imports / vitest-transformed code)."
metrics:
  duration: ~10min
  completed: 2026-05-09
  tests_added: 3
  tests_total: 46
---

# Phase 07 Plan 04: openaiRealtimeStreaming Empty-URL Guard Tests Summary

Added 3 vitest tests covering the Phase 05-02 empty-URL guard and the Phase 05 CR-01 query-string-separator regression in `src/helpers/openaiRealtimeStreaming.js`.

## What was built

`test/helpers/openaiRealtimeStreaming.test.js` with three test cases:

1. **`connect()` throws when URL is empty** — exercises the Phase 05-02 guard via `await expect(...).rejects.toThrow(/OPENWHISPR_REALTIME_WSS_URL is empty/)`.
2. **Error message contains both recovery knobs** — asserts the thrown error mentions `OPENWHISPR_BACKEND_URL`, `OPENWHISPR_REALTIME_WSS_URL`, and `OPENWHISPR_STREAMING=false` so misconfigured corporate builds get actionable guidance.
3. **Query-string separator regression (CR-01)** — when the URL already contains `?intent=transcription`, the constructed WebSocket URL must use `&` for the second query param, not `?` (no double-`?`).

## Investigation findings (Task 1)

- `module.exports = OpenAIRealtimeStreaming` — class exported directly.
- Constructor takes no arguments.
- `connect(options)` — `options.apiKey` required; the empty-URL guard fires after the apiKey check but before `new WebSocket(...)`.
- `connect` is `async` and returns `new Promise(...)`. The Promise executor (where `new WebSocket(url)` runs) executes synchronously when `connect()` is called, so the URL can be observed without awaiting.

## Mocking approach

- vitest config already has `globals: true` and `environment: "node"` → no imports needed; `vi`, `test`, `expect`, etc. are global.
- Initial attempt with `vi.doMock(CONFIG_PATH, ...)` and `vi.doMock("ws", ...)` did not intercept `require()` calls inside the SUT (CJS source). Vitest's mocking primarily applies to its own ESM transform.
- **Final approach:** inject directly into `require.cache[resolvedPath]` with a synthetic module object (`{ id, filename, loaded, exports, ... }`). This works for both `build-config.generated.cjs` and `ws`. After-test cleanup restores the real `ws` cache entry to avoid pollution of subsequent suites.
- For tests 1 and 2, the real `build-config.generated.cjs` already exports `OPENWHISPR_REALTIME_WSS_URL: ""` (default), so those tests would pass without mocking — but `vi.doMock` is left in place as a defense-in-depth measure if the default ever changes.

## Verification

- `npx vitest run test/helpers/openaiRealtimeStreaming.test.js` → 3/3 pass (13ms).
- `npm test` → 46/46 pass across 6 test files; existing 43 tests unaffected.

## Deviations from Plan

None. The plan called for `vi.doMock + require.cache reset`; in practice `require.cache` injection alone proved more reliable for CJS interop and is what's used.

## Self-Check: PASSED

- `test/helpers/openaiRealtimeStreaming.test.js` exists.
- Commit hash recorded below in metrics; `npm test` exit 0 with 46 tests passing.
