---
phase: 03
phase_name: build-time-gate-allow-custom-host
completed: 2026-05-27
status: passed
requirements-completed: [BG-01, BG-02]
plans: 1 (small phase, no SPEC/CONTEXT/PLAN ceremony — established gate pattern)
---

# Phase 3 — Build-time Gate `OPENWHISPR_ALLOW_CUSTOM_HOST` — Summary

## One-liner

Added `OPENWHISPR_ALLOW_CUSTOM_HOST` build-time flag (default `false`) emitting `ALLOW_CUSTOM_HOST_ENABLED` in the generated config; defaults.ts re-exports it via the established DCE-safe direct named re-export pattern; `verify-allow-custom-host.js` bundle-grep gate authored (will be GREEN after Phase 4 lands the `ServerUrlField` component + i18n keys it asserts).

## Delivered

### BG-01: Flag in BOOL_DEFAULTS
- `scripts/generate-build-config.js` BOOL_DEFAULTS gains `ALLOW_CUSTOM_HOST_ENABLED: false` with full Phase 3 BG-01 comment
- Generator emits 8 booleans now (was 7) — verified in `src/config/build-config.generated.{ts,cjs}` after `node scripts/generate-build-config.js`

### BG-01: Re-export from defaults.ts
- `src/config/defaults.ts` imports `ALLOW_CUSTOM_HOST_ENABLED` alongside other boolean flags via direct named re-export (Rolldown-DCE-safe per `[[rolldown_tree_shake]]`)

### BG-02: Bundle-grep gate
- `scripts/verify-allow-custom-host.js` NEW — structurally identical to `verify-provider-lockdown.js` / `verify-oauth-gating.js`
- 2 scenarios (default flag off + enabled flag on)
- 2 grep targets: `ServerUrlField` component identifier + `onboarding.serverUrl.label` i18n key
- `package.json` script `verify:allow-custom-host` added

### BUILD_CONFIG.md
- New section "Runtime Backend Host Flag (Phase 1.8.0)" documents `OPENWHISPR_ALLOW_CUSTOM_HOST` with full purpose/default/allowed-values table and worked example
- Cross-links to `docs/adr/ADR-001-runtime-host-configurability.md`

## Acceptance

| AC | Status |
|----|--------|
| Generator emits `ALLOW_CUSTOM_HOST_ENABLED = false` unset / `true` when explicitly set | ✓ (manual check + 8 booleans visible in generated files) |
| `src/config/defaults.ts` re-exports via direct named re-export | ✓ |
| `docs/BUILD_CONFIG.md` documents flag with worked example | ✓ |
| Bundle-grep gate runs 2+ scenarios and asserts presence/absence of field literals | ✓ scripted; will be GREEN after Phase 4 lands ServerUrlField + i18n keys (TDD-RED state expected now) |
| `npm run pack` without the flag produces a binary with no Server URL field component identifier | ⏳ verified by gate once Phase 4 lands |

## Decisions / Lessons

1. **Reused established pattern.** `verify-allow-custom-host.js` is a near-clone of `verify-provider-lockdown.js`. No novel gate mechanism needed; Rolldown DCE pattern is well-understood per `[[rolldown_tree_shake]]`.
2. **Bundle-grep targets reference Phase 4 deliverables.** The gate fails RED today (component doesn't exist) — that's TDD discipline: Phase 4 implementation turns it green. This is the same RED→GREEN flow as Plan 01-01 → Plan 01-05.
3. **No backwards-compat concerns.** New flag adds new behavior; default unchanged. Pure additive.

## Regression Check

- `npm run verify:provider-lockdown` — OK, 2 scenarios, 47 greps, 0 violations
- `npm run verify:oauth-gating` — OK, 4 scenarios, 63 greps, 0 violations
- `npm run verify:backend-url-sot` — OK, 5 checks, 0 violations
- `npm run test:build-config` — pass
- `(cd src && npx tsc --noEmit)` — clean

## Next

Phase 4 — Onboarding UI Server URL field (UI-01..04). Phase 4 implementation will turn `verify:allow-custom-host` GREEN.
