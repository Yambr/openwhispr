---
phase: 07
plan: 06
subsystem: ci+docs
tags: [ci, vitest, docs, gating, phase-07]
requires:
  - 07-01-SUMMARY (vitest harness installed)
  - 07-02-SUMMARY (deriveRealtimeWssUrl tests)
  - 07-03-SUMMARY (resolveBool/resolveValue tests)
  - 07-04-SUMMARY (B1 auto-disable matrix tests)
  - 07-05-SUMMARY (openaiRealtimeStreaming + audioManager guard tests)
provides:
  - "CI fail-fast on unit-test breakage (~30s vs ~13min bundle suite)"
  - "Maintainer-discoverable test commands in BUILD_CONFIG.md + SELF_HOSTING.md"
affects:
  - .github/workflows/verify-gating.yml
  - docs/BUILD_CONFIG.md
  - docs/SELF_HOSTING.md
tech-stack:
  added: []
  patterns:
    - "CI step ordering: Type check → unit tests → bundle gates (fail-fast)"
key-files:
  created:
    - .planning/phases/07-add-unit-integration-tests-for-phase-04-04-1-05-phase-work-v/07-06-SUMMARY.md
  modified:
    - .github/workflows/verify-gating.yml
    - docs/BUILD_CONFIG.md
    - docs/SELF_HOSTING.md
decisions:
  - "Position npm test between Type check and Verify pack regenerates build-config"
  - "Document scope: Phase 04/04.1/05 additions only — upstream legacy code intentionally NOT covered"
metrics:
  duration: ~5 min
  completed: 2026-05-09
  test-count: 48
  test-runtime: ~360ms (vitest), ~1.1s (npm test wall clock)
---

# Phase 7 Plan 6: CI Integration + Docs Summary

CI integration and documentation for the Phase 07 vitest harness — final integration step closing the unit-testing gap for Phase 04/04.1/05 build-time configuration logic. Adds an `npm test` CI step positioned BEFORE the slow bundle gates so unit failures fail fast (~30s vs ~13min), and documents the test commands in `docs/BUILD_CONFIG.md` (Testing section) and `docs/SELF_HOSTING.md` (Phase 07 unit tests pre-flight checklist).

## What Changed

### 1. `.github/workflows/verify-gating.yml`

New step inserted between `Type check` and `Verify pack regenerates build-config (CFG-08)`:

```yaml
      - name: Run unit tests (Phase 07)
        # Phase 07 hybrid testing: vitest unit tests for Phase 04/04.1/05
        # additions (deriveRealtimeWssUrl, resolveBool/Value, B1 auto-disable
        # matrix, openaiRealtimeStreaming empty-URL guard, audioManager
        # streaming gate). Runs BEFORE the bundle gates so unit failures
        # fail fast (~30s vs ~13min for the full bundle gate suite).
        run: npm test
```

Final CI step ordering:
1. checkout
2. Setup Node.js 24
3. npm ci
4. Install platform-specific native binaries
5. Generate build config
6. Type check (~30s)
7. **Run unit tests (Phase 07)** ← NEW (~30s)
8. Verify pack regenerates build-config (CFG-08) (~2 min)
9. Verify OAuth gating (CFG-07) (~3 min)
10. Verify feature gating (CFG-09) (~5 min)
11. Verify realtime routing (CFG-04 + Phase 05) (~3 min)

### 2. `docs/BUILD_CONFIG.md`

New `## Testing` section near the end (after `Verifying parity`) listing:
- `npm test` — CI mode, exits non-zero on failure
- `npm run test:watch` — interactive watch mode
- `npm run test:coverage` — v8 HTML report scoped to phase-work files
- Scope note: Phase 04/04.1/05 additions only

### 3. `docs/SELF_HOSTING.md`

New `### Phase 07 unit tests (fast pre-flight)` subsection added inside the Phase 04.1 Feature Gating Smoke Checklist's Prerequisite block. Three new checklist items:
- `npm test` exits 0
- `npm run typecheck` exits 0
- `npm run test:coverage` succeeds

Cross-links back to BUILD_CONFIG.md § Testing.

## Final Test Count Across Phase 07

| Plan | Test file | Tests | Subject |
|------|-----------|-------|---------|
| 07-01 | `test/sanity.test.js` | 1 | vitest harness wired |
| 07-01 | `test/helpers/transcriptText.test.js` | 3 | (pre-existing helper, smoke) |
| 07-01 | `test/helpers/localSpeechGate.test.js` | 3 | (pre-existing helper, smoke) |
| 07-01 | `test/helpers/meetingEchoLeakDetector.test.js` | 1 | (pre-existing helper, smoke) |
| 07-02 + 07-03 + 07-04 | `test/scripts/generate-build-config.test.js` | 35 | deriveRealtimeWssUrl + resolveBool/Value + B1 matrix |
| 07-05 | `test/helpers/openaiRealtimeStreaming.test.js` | 3 | empty-URL guard rejects before WebSocket open |
| 07-05 | `test/helpers/audioManager.shouldUseStreaming.test.js` | 2 | streaming gate honors STREAMING_ENABLED |
| **Total** | **7 files** | **48** | |

`npm test` wall-clock: 1.1s (vitest internal: ~360ms). Bundle-gate suite skipped on unit-test failure saves ~13 minutes per CI run.

## Phase 07 Success Criteria (CONTEXT.md SC-1..SC-9)

| SC | Statement | Status |
|----|-----------|--------|
| SC-1 | vitest harness installed and wired to `npm test` | met (07-01) |
| SC-2 | `deriveRealtimeWssUrl` covered (https→wss, http→ws, path-preserving, empty-default) | met (07-02) |
| SC-3 | `resolveBool` / `resolveValue` covered (default, "false", any-other-truthy) | met (07-03) |
| SC-4 | B1 auto-disable matrix covered (explicit-true respected, derived-empty forces false) | met (07-04) |
| SC-5 | `openaiRealtimeStreaming.connect()` rejects on empty URL before opening WS | met (07-05) |
| SC-6 | `audioManager.shouldUseStreaming` honors `STREAMING_ENABLED` build flag | met (07-05) |
| SC-7 | CI runs unit tests on every PR/push BEFORE the slow bundle gates | met (this plan) |
| SC-8 | All 48 tests pass on a clean clone | met (verified locally) |
| SC-9 | Self-hosting smoke checklist updated with new test commands | met (this plan) |

All 9 success criteria green. Phase 07 ready for merge / final HUMAN-UAT signoff.

## Verification

Local replay of CI step order:

```bash
node scripts/generate-build-config.js   # PASS (gitignored generator)
npm run typecheck                        # PASS
npm test                                 # PASS — 48 tests, ~1.1s
npm run verify:pack-regen                # PASS
npm run verify:oauth-gating              # PASS — 4 scenarios, 63 greps, 0 violations
npm run verify:feature-gating            # PASS — 5 scenarios, 140 greps, 0 violations
npm run verify:realtime-routing          # PASS — 5 scenarios + bundle-no-leak, 0 violations
```

All six gates green.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `fe83c8a` — ci+docs(07-06): wire vitest into verify-gating.yml + document tests

## Self-Check: PASSED

- `.github/workflows/verify-gating.yml` modified — `Run unit tests (Phase 07)` at line 51 (FOUND)
- `docs/BUILD_CONFIG.md` modified — `## Testing` section + `npm test` reference (FOUND)
- `docs/SELF_HOSTING.md` modified — Phase 07 pre-flight subsection + `npm test` checkbox (FOUND)
- Commit `fe83c8a` exists in `git log` (FOUND)
- 48/48 tests passing (FOUND)
- All 4 verify:* gates pass (FOUND)
