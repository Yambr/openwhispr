---
phase: 07
phase_name: tests-for-phase-work-hybrid-vitest-smoke
captured: 2026-05-09
mode: discuss-skipped (scope already understood)
---

# Phase 07 Context — Hybrid Testing for Phase Work

## Goal

Cover **only the code we added/modified in Phases 04, 04.1, 05** (and any config/scripts we own) with a hybrid testing strategy:

- **vitest unit tests** for pure functions and isolated logic
- **Existing verify-* smoke scripts** (extended) for bundle/integration checks against real artifacts

We do NOT cover upstream legacy code. That stays untested at this layer (it's covered indirectly by the smoke scripts that grep the bundle and by manual UAT).

## Why hybrid (not pure vitest, not pure smoke)

After surveying the codebase: 334 source files, 3 unit tests inherited from upstream, 4 verify-* smoke scripts we wrote. Pure functions (URL derivation, env-var parsing, boolean resolution) are perfect for vitest — fast, deterministic, edge-case-rich. Bundle-grep checks (already in verify-*) are integration tests — slower, but verify the **shipped artifact** which is what actually matters for tree-shake gating.

Pure unit tests of the renderer side of gating logic would require mocking `import.meta.env`, the build-config module, and Vite — high mock overhead, low signal. Smoke verify-* scripts already cover that path empirically.

## Decisions (locked)

### D-01: Test framework = vitest (matches sibling repo)

`~/openwhispr-server/` uses vitest. Use the same. Avoid jest/mocha/tap proliferation.

Add `vitest` to devDependencies. Test file pattern: `*.test.{js,ts}` colocated with source OR in `test/` directory (existing 3 tests are in `test/helpers/`).

### D-02: Coverage target = 100% of *our* phase work

Not "85% line / 80% branch globally" — that's the backend constitution. Our target is narrower: **every public function we wrote in Phases 04/04.1/05 has at least one happy-path + one edge-case test**.

Files in scope:
- `scripts/generate-build-config.js` — `deriveRealtimeWssUrl()`, `resolveBool()`, `resolveValue()`, `buildResolved()` (B1 auto-disable rule)
- `src/helpers/openaiRealtimeStreaming.js` — only the empty-URL guard added in Phase 05-02. Not the entire file.
- `src/helpers/audioManager.js` — only `shouldUseStreaming()` (Phase 04.1 WR-01 fix). Not the rest.
- `scripts/verify-realtime-routing.js` — its helpers are themselves "tests"; don't double-test.

Files out of scope:
- All renderer React components — mocking electron preload is high-cost, low-value
- `audioManager.js` other 1000 lines (upstream legacy)
- `streamingProviders.js` — already well-covered by integration via verify-feature-gating
- Upstream services like `ReasoningService.ts`, `NotesService.ts`

### D-03: Hybrid split

| Test class | Tool | Examples |
|---|---|---|
| Pure functions | vitest | `deriveRealtimeWssUrl(url)` 12 cases (http/https/ws/wss/path/query/hash/port/IPv6/empty/malformed/file-protocol) |
| Pure functions | vitest | `resolveBool("OAUTH_GOOGLE_ENABLED")` 6 cases (unset, "false", "true", "", "0", garbage) |
| Pure functions | vitest | `buildResolved()` B1 auto-disable matrix (4 combos: streaming-set/unset × url-empty/set) |
| Empty-URL guard | vitest | `openaiRealtimeStreaming.connect()` with mocked require returning empty URL → throws expected error message |
| Bundle gate | smoke (existing) | verify-* scripts unchanged |
| URL leak | smoke (existing) | verify-realtime-routing.js source-no-leak unchanged |

### D-04: Don't add Stryker / mutation testing

Backend constitution requires Stryker. Our client doesn't. Skip — overkill for ~50-100 tests.

### D-05: CI integration

Add `npm test` script that runs vitest. Wire into `.github/workflows/verify-gating.yml` as a new step before the bundle gates (fail-fast on unit-test break).

### D-06: TDD optional but encouraged

Phase 07 is filling test gaps for ALREADY SHIPPED code. So strict RED-before-GREEN doesn't apply (the implementation already exists). However, when writing each test:

1. First run it expecting it to PASS (since impl exists)
2. If it passes, good — commit
3. If it fails, that's a real bug discovered by the test — fix the impl, document the bug

This is "characterization testing" pattern.

## Out of scope

- E2E browser tests (Playwright) — Electron e2e is another phase
- Component tests (react-testing-library) — different effort
- Coverage of upstream code we didn't touch
- Refactoring source code "for testability" — keep tests around the existing API
- Integration with backend repo's contract tests (they're a different project)

## Success criteria

1. **vitest installed** as devDep + `vitest.config.ts` (or .mjs) created
2. **`npm test` script** in package.json — runs vitest in headless mode
3. **`npm run test:watch`** — interactive dev mode
4. **`npm run coverage`** — coverage report (--coverage flag)
5. **At least 30 unit tests** covering Phase 04/04.1/05 pure-function additions
6. **All tests pass** in CI
7. **CI workflow updated** — `verify-gating.yml` runs `npm test` before bundle gates
8. **No false positives** — running tests on a fresh clone (no env vars, no .env) works
9. **Smoke checklist updated** in `docs/SELF_HOSTING.md` with new test commands

## Plan breakdown (suggested)

1. **07-01** — vitest setup + scaffold + first test
2. **07-02** — `deriveRealtimeWssUrl()` test suite (~12 cases)
3. **07-03** — `resolveBool()` + `resolveValue()` + `buildResolved()` auto-disable matrix
4. **07-04** — `openaiRealtimeStreaming` empty-URL guard test
5. **07-05** — `audioManager.shouldUseStreaming()` gate test
6. **07-06** — CI integration + docs (BUILD_CONFIG, SELF_HOSTING smoke checklist)

Linear deps: 01 → 02 → 03 → 04 → 05 → 06.

## Risks

- **`audioManager.js` is huge and tangled** — `shouldUseStreaming()` test may need partial mocking of `this.context`, `this.sttConfig`. If too painful, downgrade scope to just smoke-grep that the gate is present.
- **`openaiRealtimeStreaming.js` is main-process Node CommonJS** — can vitest test it directly? Might need `vitest --environment=node`.
- **`generate-build-config.js` reads `process.env`** — tests must reset env between cases. Use `beforeEach`/`afterEach` to snapshot+restore.
- **Existing 3 tests in `test/helpers/`** use a different pattern (they look like Node `assert`-based?) — check before mass-adding tests; don't break them.

## Definition of Done

- [ ] All 8 success criteria pass
- [ ] CI green
- [ ] No regression in existing 3 upstream-inherited tests (or migrated to vitest cleanly)
- [ ] PR opened, CodeRabbit review passed
