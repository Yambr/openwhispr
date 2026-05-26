---
phase: 05
plan: 03
subsystem: build-config
tags: [tdd, build-config, streaming-default, cfg-09-amendment, feature-gating, auto-disable]
requirements: [CFG-09]
dependency-graph:
  requires:
    - "Phase 05-01 (OPENWHISPR_REALTIME_WSS_URL build var + URL derivation in buildResolved())"
    - "Phase 05-02 (openaiRealtimeStreaming.js empty-URL guard — defense in depth this plan layers on top of)"
  provides:
    - "STREAMING_ENABLED default flipped false→true with B1 auto-disable safety net"
    - "verify-feature-gating.js scenario matrix proving new contract (5 scenarios incl. default-no-backend)"
  affects:
    - "Phase 05-04 (docs/realtime-routing.md operator guide will reference both the auto-disable behavior and the OPENWHISPR_STREAMING=false escape hatch)"
tech-stack:
  added: []
  patterns:
    - "hasOwnProperty-gated auto-disable (caller's explicit opt-in always wins; default behavior is corrected only when caller stayed silent)"
    - "Auto-disable rule placed AFTER URL derivation so the rule reads the final URL value, not an intermediate state"
key-files:
  created:
    - ".planning/phases/05-route-all-realtime-asr-diarization-streaming-through-corpora/05-03-SUMMARY.md"
  modified:
    - "scripts/generate-build-config.js"
    - "scripts/verify-feature-gating.js"
    - ".planning/PROJECT.md"
decisions:
  - "Auto-disable uses Object.prototype.hasOwnProperty.call(process.env, 'OPENWHISPR_STREAMING') rather than a truthiness check, because an explicit OPENWHISPR_STREAMING='' or OPENWHISPR_STREAMING='true' both count as user opt-in (caller's choice respected even when no URL exists; runtime guard surfaces the misconfiguration)."
  - "Auto-disable rule placed AFTER the OPENWHISPR_REALTIME_WSS_URL derivation block (introduced in 05-01) so it reads the final URL value. Placing it before would auto-disable even when the URL is about to derive from BACKEND_URL."
  - "verify-feature-gating SCENARIOS reshaped 4→5: split old `default` into `default-no-backend` (auto-disable proof) and `default-with-backend` (default-true holds when URL derives); replaced `streaming-enabled` with `streaming-disabled` to cover the explicit escape hatch since streaming is now the default."
  - "Bool key in `resolved` object is `STREAMING_ENABLED` (no OPENWHISPR_ prefix) — BOOL_DEFAULTS strips the prefix. Initial draft of the auto-disable rule used `resolved.OPENWHISPR_STREAMING_ENABLED` and silently no-op'd; caught during sanity-check, fixed inline (Rule 1)."
metrics:
  duration: "~6min"
  tasks: 3
  files: 3
  completed: "2026-05-09"
---

# Phase 05 Plan 03: STREAMING Default Flip + B1 Auto-Disable Summary

Flip the OPENWHISPR_STREAMING_ENABLED default from `false` (Phase 04.1 corporate-minimal posture) to `true` (Phase 05 streaming-through-corporate-backend), and add an auto-disable safety net so a default `npm run build` with no env vars does not produce a binary that crashes on first record.

## Outcome

The desktop client now ships realtime ASR enabled-by-default whenever a backend URL is configured. With `OPENWHISPR_BACKEND_URL=https://api.example.com`, the generator emits `STREAMING_ENABLED: true` and `OPENWHISPR_REALTIME_WSS_URL: "wss://api.example.com/v1/realtime"`, so the renderer-side STREAMING gate passes and `openaiRealtimeStreaming.js.connect()` finds a non-empty URL.

The B1 auto-disable rule prevents a footgun: a default `npm run build` (no env vars at all, no backend) used to be impossible to misconfigure because STREAMING was off-by-default; with the new true-by-default it would have shipped `STREAMING_ENABLED=true` + empty `REALTIME_WSS_URL` — i.e. the gate opens but `connect()` would throw on every record. The auto-disable detects this exact shape (caller did not set `OPENWHISPR_STREAMING` AND default kicked in AND URL is empty) and forces STREAMING back to false. Explicit `OPENWHISPR_STREAMING=true` with no URL is respected as caller intent — the empty-URL guard in `openaiRealtimeStreaming.js` (Phase 05-02) catches it at runtime with an operator-friendly error.

`OPENWHISPR_STREAMING=false` remains as an explicit escape hatch for backends that haven't deployed the realtime relay yet.

## TDD Trail

| Step | Commit | Outcome |
|------|--------|---------|
| RED | `201a1bf test(05-03): flip verify-feature-gating scenarios for new STREAMING default + auto-disable (RED)` | 4→5 scenarios; `default-with-backend` and the two `*-enabled` scenarios fail because generator still defaults STREAMING_ENABLED=false |
| GREEN | `85523ea feat(05-03): flip OPENWHISPR_STREAMING_ENABLED default false→true + B1 auto-disable rule (GREEN, CFG-09 amendment)` | BOOL_DEFAULTS flipped + auto-disable rule added; all 5 scenarios pass |
| docs | `e192b07 docs(05-03): document CFG-09 Phase 05 amendment in PROJECT.md (STREAMING default flip + B1 auto-disable)` | PROJECT.md CFG-09 line annotated, Key Decisions row added, footer date bumped |

## Verification

- `npm run verify:feature-gating` → `OK — 5 scenarios, 140 greps, 0 violations.`
- `npm run verify:oauth-gating` → `OK — 4 scenarios, 63 greps, 0 violations.` (no regression)
- `node scripts/verify-realtime-routing.js` → `OK — 5 derivation scenarios + source-no-leak + bundle-no-leak + SC-8 hardcoded-secrets, 0 violations.` (no regression)
- `cd src && npx tsc --noEmit` → clean.
- Manual sanity-check (clean env via `env -i HOME=$HOME PATH=$PATH ...`):
  - No env → `STREAMING_ENABLED: false` (auto-disable fired).
  - `OPENWHISPR_BACKEND_URL=https://api.example.com` → `STREAMING_ENABLED: true`, `REALTIME_WSS_URL: wss://api.example.com/v1/realtime`.
  - `OPENWHISPR_STREAMING=true` (no backend) → `STREAMING_ENABLED: true` (explicit opt-in respected; runtime guard handles empty URL).
  - `OPENWHISPR_STREAMING=false` → `STREAMING_ENABLED: false` (escape hatch).

## Implementation Notes

### Why hasOwnProperty instead of truthy check

The auto-disable rule must distinguish "caller did not set OPENWHISPR_STREAMING at all" from "caller set OPENWHISPR_STREAMING explicitly (to anything, including empty string)". `Object.prototype.hasOwnProperty.call(process.env, "OPENWHISPR_STREAMING")` is the only reliable signal — `process.env.OPENWHISPR_STREAMING` is `undefined` in both unset and `=` cases on some shells. A `=== "true"` test would also miss `OPENWHISPR_STREAMING=1` or any other truthy non-`"false"` value, breaking parity with `resolveBool()`'s "anything except literal 'false' enables it" rule.

### Why the rule sits after URL derivation

Rule order matters: the URL derivation block reads `BACKEND_URL` and may populate `REALTIME_WSS_URL`. The auto-disable then reads the final `REALTIME_WSS_URL`. Reversed order would auto-disable even when a backend URL is present — wrong outcome.

### Bug caught during sanity-check (Rule 1)

The first GREEN commit's auto-disable rule used `resolved.OPENWHISPR_STREAMING_ENABLED` — but BOOL_DEFAULTS strips the `OPENWHISPR_` prefix, so `resolved` exposes `STREAMING_ENABLED` (and `BILLING_ENABLED`, `REFERRALS_ENABLED`, etc.) without prefix. The rule's mutation silently no-op'd because `resolved.OPENWHISPR_STREAMING_ENABLED` was `undefined`. Caught during the four-scenario manual sanity-check (clean env still produced `STREAMING_ENABLED: true`). Fixed inline by referencing `resolved.STREAMING_ENABLED` on both the read and write sides. Re-verified all four manual scenarios + automated gates after the fix; commit `85523ea` reflects the corrected version (the bug never landed in a separately-named commit because it was caught between the edit and the commit).

## Deviations from Plan

**1. [Rule 1 - Bug] Wrong key reference in auto-disable rule**
- **Found during:** Task 2 sanity-check (clean-env scenario showed `STREAMING_ENABLED: true` instead of expected `false`)
- **Issue:** The auto-disable block used `resolved.OPENWHISPR_STREAMING_ENABLED` (with prefix) but the resolved object stores it as `resolved.STREAMING_ENABLED` (BOOL_DEFAULTS strips the OPENWHISPR_ prefix). Read returned `undefined` (falsy → guard skipped), write created a new property without affecting the emitted value.
- **Fix:** Changed both references to `resolved.STREAMING_ENABLED`.
- **Files modified:** `scripts/generate-build-config.js`
- **Commit:** `85523ea` (caught and fixed before commit landed; no separate fix-up commit)

Otherwise plan executed exactly as written.

## Self-Check: PASSED

- Found: `scripts/generate-build-config.js` (modified — STREAMING_ENABLED default flipped + auto-disable block).
- Found: `scripts/verify-feature-gating.js` (modified — 5-scenario matrix).
- Found: `.planning/PROJECT.md` (modified — CFG-09 annotation + Key Decisions row + footer date).
- Found: commit `201a1bf` (RED).
- Found: commit `85523ea` (GREEN).
- Found: commit `e192b07` (docs).
- Verified: `npm run verify:feature-gating` exits 0 with `OK — 5 scenarios`.
- Verified: `npm run verify:oauth-gating` exits 0.
- Verified: `node scripts/verify-realtime-routing.js` exits 0.
- Verified: `cd src && npx tsc --noEmit` clean.
- Verified: All four sanity-check scenarios in clean env produce documented STREAMING_ENABLED values.

## Notes for PLAN-04

The operator guide should document:
1. The new default behavior: setting `OPENWHISPR_BACKEND_URL` is sufficient to enable realtime ASR (no need to also set `OPENWHISPR_STREAMING=true`).
2. The B1 auto-disable: a no-env build still produces a working (offline) binary; no manual STREAMING toggle required for default builds.
3. The `OPENWHISPR_STREAMING=false` escape hatch for backends without realtime relay deployed.
4. The runtime error message from `openaiRealtimeStreaming.js`'s empty-URL guard, which references both knobs (`OPENWHISPR_REALTIME_WSS_URL` to override, `OPENWHISPR_STREAMING=false` to disable) — useful for operators self-recovering from misconfiguration.
