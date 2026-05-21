---
phase: 10-corporate-minimal-provider-lockdown-build-time-gate-cutting-
plan: 01
subsystem: build-config
tags: [build-time-gating, dce, provider-lockdown, tdd]
requires: []
provides:
  - PROVIDER_LOCKDOWN_ENABLED constant (build-config generator + defaults.ts re-export)
  - OPENWHISPR_PROVIDER_LOCKDOWN build-time env var
affects:
  - scripts/generate-build-config.js
  - src/config/defaults.ts
tech-stack:
  added: []
  patterns:
    - BOOL_DEFAULTS gating (mirrors BILLING_ENABLED / OAUTH_*_ENABLED / STREAMING_ENABLED)
    - direct named re-export for Rolldown DCE (no namespace-alias form)
    - node:test unit tests for the build-config generator
key-files:
  created:
    - scripts/generate-build-config.test.cjs
  modified:
    - scripts/generate-build-config.js
    - src/config/defaults.ts
    - package.json
decisions:
  - "OPENWHISPR_PROVIDER_LOCKDOWN is a standalone flag; OAUTH_* flags stay independent (corporate build profile sets all four env vars)"
metrics:
  duration: ~6m
  completed: 2026-05-21
  tasks: 3
  files: 4
---

# Phase 10 Plan 01: Provider-Lockdown Build Flag Summary

Adds the `OPENWHISPR_PROVIDER_LOCKDOWN` build-time env var, emitted as the
`PROVIDER_LOCKDOWN_ENABLED` boolean constant (default `false`), establishing the
gating-infra foundation that Phase 10 consumer plans 02-05 import.

## What Was Built

- **`PROVIDER_LOCKDOWN_ENABLED: false`** added to `BOOL_DEFAULTS` in
  `scripts/generate-build-config.js`. The existing `BOOL_KEYS` emit loop carries
  it into both `build-config.generated.ts` and `.cjs` with no emit-function
  change. `resolveBool` maps it to env var `OPENWHISPR_PROVIDER_LOCKDOWN`
  automatically (strips `_ENABLED`): explicit `"false"` → false, any other set
  value → true, unset → `false` default.
- **Direct named re-export** added to `src/config/defaults.ts` in the existing
  `export { ... } from "./build-config.generated"` block — the Rolldown-DCE-safe
  form. The forbidden `Generated.*` namespace-alias form was not used.
- **`scripts/generate-build-config.test.cjs`** — 5 `node:test` cases asserting
  `resolveBool` semantics (unset/true/false/`1`) and `BOOL_KEYS` membership.
  Self-contained, Node built-ins only.
- **`package.json`** — new `test:build-config` npm script; generator
  `console.log` count bumped `6 booleans` → `7 booleans`.

## TDD Cycle

- **RED** (commit `75dc0780`): test added, ran, failed — `PROVIDER_LOCKDOWN_ENABLED`
  absent from `BOOL_DEFAULTS` so resolution returned `undefined`.
- **GREEN** (commit `71ebb489`): constant added to generator + `defaults.ts`;
  `npm run test:build-config` exits 0 (5/5 pass); `tsc --noEmit` clean.
- **REFACTOR**: not needed — implementation was minimal.

## Task 3 — verify:pack-regen Gate

`npm run verify:pack-regen` (the authoritative Phase 04.1 gate,
`scripts/verify-pack-regenerates-build-config.js`) ran and exited 0:
`PASS: pack pipeline regenerated build-config (OAUTH_GOOGLE_ENABLED=false)`.
The gate handled the new 7th boolean transparently — no snapshot drift, no
package.json regression. `pack`/`dist` confirmed to front-load
`node scripts/generate-build-config.js` before electron-builder. No code change
required.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run test:build-config` — 5/5 pass.
- Both generated modules contain `PROVIDER_LOCKDOWN_ENABLED` (1 occurrence each).
- `cd src && npx tsc --noEmit` — clean.
- `npm run verify:pack-regen` — exits 0.

## Notes

`build-config.generated.{ts,cjs}` are `.gitignored` (regenerated at build time),
so only the four source files were committed. Default `false` preserves upstream
parity — a plain `npm run pack` with no env var keeps every provider.

## Self-Check: PASSED

- `scripts/generate-build-config.test.cjs` — FOUND
- `scripts/generate-build-config.js` BOOL_DEFAULTS entry — FOUND
- `src/config/defaults.ts` re-export — FOUND
- Commit `75dc0780` (RED) — FOUND
- Commit `71ebb489` (GREEN) — FOUND
