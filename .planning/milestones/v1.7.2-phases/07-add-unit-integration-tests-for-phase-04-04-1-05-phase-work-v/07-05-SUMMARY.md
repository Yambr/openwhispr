---
phase: "07"
plan: "05"
subsystem: testing
tags: [tests, vitest, audioManager, streaming-gate, smoke-grep, defense-in-depth]
requires: ["07-04"]
provides:
  - test/helpers/audioManager.shouldUseStreaming.test.js
affects:
  - test suite (48 tests, +2 new)
tech-stack:
  added: []
  patterns:
    - "smoke-grep pattern: read source as string, regex-assert structural invariants for code that is too tangled for cheap unit testing"
key-files:
  created:
    - test/helpers/audioManager.shouldUseStreaming.test.js
  modified: []
decisions:
  - "Path C (smoke-grep) over Path A (extract pure helper) or Path B (mock-heavy unit). audioManager.js is ~2200 lines, ESM-imported, depends on renderer-only globals (localStorage, getSettings, REALTIME_MODELS) and instance state. Mocking cost is high; verify:feature-gating already covers the gate end-to-end against a real production bundle. Path C is defense-in-depth: catches accidental removal of the explicit STREAMING_ENABLED guard before a build is produced."
metrics:
  duration: ~5min
  completed: 2026-05-09
  tests_added: 2
  tests_total: 48
---

# Phase 07 Plan 05: audioManager.shouldUseStreaming Gate Tests Summary

Added 2 smoke-grep vitest tests covering the Phase 04.1 WR-01 STREAMING_ENABLED gate in `src/helpers/audioManager.js`. Path C chosen after weighing extraction risk vs marginal coverage gain.

## What was built

`test/helpers/audioManager.shouldUseStreaming.test.js` with two test cases:

1. **First-statement guard assertion** — reads `audioManager.js` as text, locates the `shouldUseStreaming()` function body, strips leading whitespace and comments, and asserts the very first executable statement matches `if (!STREAMING_ENABLED) return false;`. This catches accidental reordering or removal of the gate during refactors.
2. **Import-source assertion** — asserts `STREAMING_ENABLED` is imported from `../config/defaults` at the top of the file, so the gate is wired to the build-time constant (not a stray local variable shadowing it).

## Investigation findings (Task 1)

Analyzed three paths:

| Path | Approach | Effort | Decision |
|------|----------|--------|----------|
| A | Extract `shouldUseStreaming` to a pure helper `src/helpers/shouldUseStreaming.js`, refactor audioManager to delegate, write 4+ branch tests | ~50 lines refactor + 4 tests, with regression risk on the audioManager touch | Deferred — file as follow-up |
| B | Mock `STREAMING_ENABLED` ESM import, `getSettings`, `localStorage`, `REALTIME_MODELS`, instantiate AudioManager with stub `this.context`/`this.sttConfig`, drive the existing method | ~60-80 lines plumbing per test, fragile against audioManager evolution | Rejected |
| C | Smoke-grep: assert structural invariants (gate-as-first-statement + import source) directly from source text | ~40 lines, 2 tests, zero prod-code touch | **Chosen** |

Rationale: `npm run verify:feature-gating` already builds a production bundle with `OPENWHISPR_STREAMING=false` and asserts the streaming entry-points (AssemblyAI / Deepgram / OpenAI realtime) are absent — that's the real end-to-end coverage. Path C complements it cheaply by catching removal of the explicit guard before a build is even produced. Path A remains valuable but is a broader refactor that should ride on a future audioManager touchup.

## What this plan does NOT cover (deferred)

- Branch coverage of the downstream `shouldUseStreaming` logic: `useLocalWhisper`, `batch` mode, `REALTIME_MODELS` realtime path, `cloudTranscriptionMode === "openwhispr"`, `notesStreamingPreference`. Those branches remain exercised only via integration paths.
- **Follow-up: Path A extraction** — when `audioManager.js` next gets a meaningful refactor, lift the gate logic into `src/helpers/shouldUseStreaming.js` as a pure function and add 4+ branch tests. Tracked here in lieu of an issue.

## Verification

- `npx vitest run test/helpers/audioManager.shouldUseStreaming.test.js` — 2 passed
- `npm test` — 48 passed (was 46 before this plan)
- `npm run verify:feature-gating` — OK, 5 scenarios, 140 greps, 0 violations (proves the runtime gate still behaves correctly end-to-end)

## Deviations from Plan

None — Path C executed exactly as the plan's recommended fallback.

## Commits

- `caa7b07` — test(07-05): cover audioManager.shouldUseStreaming gate (Phase 04.1 WR-01)

## Self-Check: PASSED

- FOUND: test/helpers/audioManager.shouldUseStreaming.test.js
- FOUND: caa7b07
