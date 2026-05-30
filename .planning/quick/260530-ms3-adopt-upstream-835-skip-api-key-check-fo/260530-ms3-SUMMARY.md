---
phase: quick-260530-ms3
plan: 01
subsystem: transcription-auth
tags: [upstream-parity, self-hosted, api-key, vitest]
requires: []
provides:
  - "shouldSkipTranscriptionApiKey predicate (src/helpers/transcriptionAuth.js)"
  - "getAPIKey() self-hosted skip guard (src/helpers/audioManager.js)"
affects:
  - src/helpers/audioManager.js
tech-stack:
  added: []
  patterns: ["upstream verbatim adoption + vitest test port"]
key-files:
  created:
    - src/helpers/transcriptionAuth.js
    - test/helpers/transcriptionAuth.test.js
  modified:
    - src/helpers/audioManager.js
decisions:
  - "Helper body + getAPIKey() guard adopted byte-for-byte from upstream #835 (69cb74be) to keep merge cost at zero; only the test harness adapted node:test → vitest."
metrics:
  tasks: 2
  files: 3
  tests_before: 121
  tests_after: 127
  completed: "2026-05-30"
requirements: [MS3-835]
---

# Quick Task 260530-ms3: Adopt Upstream #835 (Skip API Key Check for Self-Hosted Transcription) Summary

Adopted upstream OpenWhispr PR #835 verbatim: self-hosted transcription (mode `self-hosted` + non-empty `remoteTranscriptionUrl`) now skips the cloud API key lookup, so self-hosted users without a cloud key are no longer blocked.

## What Was Done

### Task 1 — Helper + guard (commit `fdc9527c`)
- Created `src/helpers/transcriptionAuth.js` exporting `shouldSkipTranscriptionApiKey(settings)` — verbatim copy of upstream `69cb74be`: trims `transcriptionMode` and `remoteTranscriptionUrl`, returns `transcriptionMode === "self-hosted" && remoteUrl.length > 0`.
- Added `import { shouldSkipTranscriptionApiKey } from "./transcriptionAuth";` immediately after the `settingsStore` import in `src/helpers/audioManager.js`.
- Inserted the early-return guard at the top of `getAPIKey()` (after `const s = getSettings();`): returns `null` when the predicate is true, with a trailing blank line — matching the upstream diff exactly. No other `getAPIKey()` logic touched.

### Task 2 — Vitest test port (commit `75da2849`)
- Created `test/helpers/transcriptionAuth.test.js` as a vitest file using project globals (no `vitest`/`node:test` import), static helper import, wrapped in `describe("shouldSkipTranscriptionApiKey", ...)`.
- Ported all 6 upstream cases (`assert.equal` → `expect().toBe`): self-hosted+URL→true; self-hosted+empty→false; self-hosted+whitespace→false; default cloud(openai)→false; missing mode `{}`→false; cloud mode + URL→false.

## Test Results

Full suite green (`npm test` / vitest run):

```
Test Files  13 passed (13)
     Tests  127 passed (127)
```

121 → 127 tests (+6 new, the entire new file). No regressions.

## Deviations from Plan

None — plan executed exactly as written. Helper and guard are upstream-verbatim; only the test harness was adapted to vitest per the plan.

## Upstream Parity Notes

- `src/helpers/transcriptionAuth.js` and the `getAPIKey()` guard are byte-for-byte identical to upstream `69cb74be` → zero future merge cost.
- The test file intentionally diverges (vitest vs upstream's node:test), which is our harness convention and does not affect merge cost on the production-source files.

## Constraints Honored

- No version bump, no tag.
- ROADMAP.md not touched.
- Per-task atomic commits; code-only (PLAN/SUMMARY/STATE left for orchestrator).
- No i18n (internal auth logic, no user-facing strings).

## Self-Check: PASSED

- FOUND: src/helpers/transcriptionAuth.js
- FOUND: test/helpers/transcriptionAuth.test.js
- FOUND: src/helpers/audioManager.js (modified)
- FOUND commit: fdc9527c
- FOUND commit: 75da2849
