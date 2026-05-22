---
quick_id: 260522-smj
slug: post-merge-test-fixes
date: 2026-05-22
status: complete
commits: 629e1956, 38436f33
---

# Summary: post-merge test follow-ups

Two test issues left by the upstream OpenWhispr 1.7.2 merge, both fixed.

## Task 1 — runner separation

`npx vitest run` reported 3 false "No test suite found" failures for
`node:test`-style files (`generate-build-config.test.cjs` + two new
upstream VAD specs). vitest cannot run `node:test` files.

- `vitest.config.ts` — added `exclude` for `**/*.test.cjs` and the two
  VAD `.js` specs, so vitest only runs real vitest files.
- `package.json` — `test:build-config` extended to run all three
  `node:test` files via `node --test`.

Result: `vitest run` 48/48 green, 0 "No test suite found";
`test:build-config` 15/15 green.

## Task 2 — lockdown Notes onboarding test

The merge gated NotesOnboarding's LLM/model-picker collapsible behind
`!isProUser` (`NotesOnboarding.tsx:119`). The corporate lockdown build
authenticates as a Pro user (`isSubscribed:true` after R34), so the
"Configure an AI model" section never mounts. The test
(`corporate-lockdown.spec.ts`) now expands the picker if present
(non-Pro path) or asserts its absence (Pro corporate path) — both
branches keep the `assertNoLeaks` assertion. A non-rendered picker is
leak-free by construction.

Result: `test:lockdown-ui` 6/6 passing.

Commits `629e1956`, `38436f33`.
