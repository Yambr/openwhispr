---
quick_id: 260522-smj
slug: post-merge-test-fixes
date: 2026-05-22
status: planned
---

# Quick Task: Fix two post-merge test follow-ups

## Problem

After the upstream OpenWhispr 1.7.2 merge two test issues surfaced:

1. **`npx vitest run` reports 3 failures** — `No test suite found`:
   `scripts/generate-build-config.test.cjs` (fork code, `node:test`),
   `test/helpers/whisperVadConfig.test.js` and
   `test/helpers/whisperServerVadArgs.test.js` (new upstream code,
   `node:test`). Vitest's `include` globs match them but vitest cannot
   run `node:test`-style files → false failures. The two vad files have
   no runner at all today; `generate-build-config.test.cjs` is run via
   the separate `test:build-config` script.

2. **`tests/ui/corporate-lockdown.spec.ts` "Notes onboarding →
   Configure an AI model shows no provider tabs" fails** — the upstream
   merge changed `NotesOnboarding.tsx`. `llmExpanded` now starts
   `false` for a pro user (corporate `isSubscribed:true` after R34),
   and the onboarding screen the test drove no longer renders the way
   the test expects (`Page snapshot` showed a near-empty page). The
   test fails to click "Configure an AI model".

## Approach

### Task 1 — runner separation (vitest ↔ node:test)

`node:test` files must not be in vitest's `include`. Exclude them and
give them their own `node --test` invocation so they actually run.

- `vitest.config.ts` — add an `exclude` for `node:test`-style files:
  `**/*.test.cjs` and the two vad files (or a glob). Confirm vitest
  still picks up the real vitest specs.
- `package.json` — `test:build-config` currently runs only
  `generate-build-config.test.cjs`. Generalize it (rename concept to
  `test:node` or extend it) to also run the `node:test` vad files:
  `node --test scripts/generate-build-config.test.cjs test/helpers/whisperVadConfig.test.js test/helpers/whisperServerVadArgs.test.js`
  Keep `test:build-config` working (30+ scripts may reference it — if
  so, keep the name and just add files; otherwise add a `test:node`).
- Optionally wire the node-test run into `test` so one command covers
  both — but do not break the existing `test` = `vitest run` contract
  for callers that expect only vitest. Minimal: keep them separate
  scripts, both green.

### Task 2 — fix the lockdown Notes onboarding test

- Read the merged `src/components/notes/NotesOnboarding.tsx` to see the
  current structure: the LLM/AI-model section is a collapsible whose
  expand state is `llmExpanded` (starts `false` for pro users).
- Update the test in `tests/ui/corporate-lockdown.spec.ts` (~line 168)
  to navigate the new structure: expand the collapsible by whatever
  trigger text/role it now uses, then run the SAME `assertNoLeaks`
  check. The leak assertion is the point of the test — keep it. Only
  the navigation to reach the model picker changes.
- If the section is genuinely not rendered for a pro corporate user
  (model picker hidden because cloud is the only option), the test
  should assert that absence instead — a hidden picker is leak-free by
  definition. Match the test's intent (no provider tabs leak) to the
  real post-merge UI.

## Tasks

1. Separate `node:test` files from the vitest runner — `vitest.config.ts`
   exclude + `package.json` `node --test` invocation covering all three.
2. Fix `corporate-lockdown.spec.ts` Notes onboarding test for the merged
   `NotesOnboarding.tsx` structure; keep leak assertions intact.

## Verification

- `npx vitest run` — green, 0 `No test suite found`.
- `node --test` over the three `node:test` files — green.
- `npm run test:lockdown-ui` — 6/6 passing.
