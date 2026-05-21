---
phase: 10-corporate-minimal-provider-lockdown-build-time-gate-cutting-
plan: 02
subsystem: build-config
tags: [build-time-gating, dce, provider-lockdown, oauth]
requires:
  - PROVIDER_LOCKDOWN_ENABLED constant (from plan 10-01)
provides:
  - PROVIDER_LOCKDOWN_ENABLED forces OAUTH_GOOGLE/APPLE/MICROSOFT_ENABLED off in buildResolved()
  - corporate-lockdown build = zero OAuth buttons (email/password only)
affects:
  - scripts/generate-build-config.js
tech-stack:
  added: []
  patterns:
    - post-BOOL_KEYS force-off block in buildResolved (lockdown-implies-off)
    - node:test unit tests for the build-config generator
key-files:
  created: []
  modified:
    - scripts/generate-build-config.js
    - scripts/generate-build-config.test.cjs
decisions:
  - "PROVIDER_LOCKDOWN implies the three OAUTH_* flags off at build-config generation; an explicit OPENWHISPR_OAUTH_*=true cannot override lockdown"
metrics:
  duration: ~5m
  completed: 2026-05-21
  tasks: 2
  files: 2
---

# Phase 10 Plan 02: Provider-Lockdown OAuth Force-Off Summary

When `OPENWHISPR_PROVIDER_LOCKDOWN` is set, the build-config generator now forces
all three `OAUTH_GOOGLE/APPLE/MICROSOFT_ENABLED` flags to `false`, so the
corporate-minimal build ships a welcome screen with zero OAuth buttons
(email/password only) from a single env var — and no source change was needed in
`auth.ts` or `AuthenticationStep.tsx` (no dangling references).

## What Was Built

- **`buildResolved()` force-off block** in `scripts/generate-build-config.js`,
  added after the `BOOL_KEYS` loop (so `resolved.PROVIDER_LOCKDOWN_ENABLED` is
  populated): when lockdown is `true`, assigns `false` to `OAUTH_GOOGLE_ENABLED`,
  `OAUTH_APPLE_ENABLED`, `OAUTH_MICROSOFT_ENABLED`. Lockdown wins over an explicit
  `OPENWHISPR_OAUTH_*=true` — the corporate posture is the stronger guarantee.
- **3 new `node:test` cases** in `scripts/generate-build-config.test.cjs`:
  lockdown-forces-all-off, lockdown-overrides-explicit-true, lockdown-unset-keeps-
  defaults-true. Added a `withEnvMap` helper for multi-var env setup.

## TDD Cycle (Task 1)

- **RED** (commit `4065c8bb`): 3 lockdown-OAuth test cases added, ran, failed —
  `OAUTH_GOOGLE_ENABLED` resolved `true` under lockdown (force-off block absent).
- **GREEN** (commit `702d1250`): force-off block added; `npm run test:build-config`
  exits 0 (8/8 pass).
- **REFACTOR**: not needed — implementation was a 5-line block.

## Task 2 — Dangling-Reference Verification (no fix required)

Built the renderer with `OPENWHISPR_PROVIDER_LOCKDOWN=true`:

- `cd src && npx tsc --noEmit` — exit 0, clean.
- `npm run build:renderer` — exit 0, clean.
- Bundle-grep: `desktop-signin` (the `signInWithSocial` Electron OAuth branch) is
  fully absent from `dist/assets/` under lockdown — Rolldown DCE'd it via the
  literal-false `OAUTH_*_ENABLED` guards.
- `src/lib/auth.ts`: the `SocialProvider` type and `signInWithSocial`'s D-08
  defensive guards (`if (provider === "google" && !OAUTH_GOOGLE_ENABLED)`) all
  type-check and short-circuit with the three flags `false`. The `SocialProvider`
  type is intentionally retained per the D-08 design (CONTEXT.md "must not leave
  dangling references" = no compile/lint breakage, not "delete the type").
- `AuthenticationStep.tsx` lines 486-559: all three buttons gated
  `{OAUTH_*_ENABLED && (...)}`; imports remain referenced by the gated JSX in
  source, so no unused-import lint error.

No source change was required — the Phase 04 OAuth gating machinery and the D-08
guards already handle all-providers-off cleanly. No commit for Task 2.

## Deviations from Plan

None - plan executed exactly as written.

## Out-of-Scope Findings

`npm run lint` reports 590 pre-existing problems, all in unrelated files
(generated `tests/e2e/.playwright-bdd/*.feature.spec.js` artifacts and other
non-plan source). Zero lint errors in `src/lib/auth.ts` or
`src/components/AuthenticationStep.tsx` (this plan's files). Pre-existing,
not caused by this plan — left untouched per executor scope boundary.

## Verification

- `npm run test:build-config` — 8/8 pass (5 from plan 01 + 3 new).
- Lockdown-generated renderer: `tsc --noEmit` exit 0, `build:renderer` exit 0.
- `desktop-signin` absent from lockdown bundle (DCE confirmed).
- No lint errors in plan files.
- Default build-config restored at end.

## Self-Check: PASSED

- `scripts/generate-build-config.js` force-off block — FOUND
- `scripts/generate-build-config.test.cjs` 3 new cases — FOUND
- Commit `4065c8bb` (RED) — FOUND
- Commit `702d1250` (GREEN) — FOUND
