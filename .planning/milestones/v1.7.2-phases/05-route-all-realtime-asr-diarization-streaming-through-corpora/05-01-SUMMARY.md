---
phase: 05
plan: 01
subsystem: build-config
tags: [tdd, build-config, realtime, streaming, derived-default, corporate-backend]
requirements: [CFG-04]
dependency-graph:
  requires:
    - "Phase 04.1 build-config generator (DEFAULTS map, buildResolved, emitTs/emitCjs, named-re-export DCE pattern in defaults.ts)"
  provides:
    - "OPENWHISPR_REALTIME_WSS_URL build-time variable with path-preserving https→wss / http→ws derivation from OPENWHISPR_BACKEND_URL"
    - "scripts/verify-realtime-routing.js + npm run verify:realtime-routing CI gate"
    - "Direct named re-export of OPENWHISPR_REALTIME_WSS_URL from src/config/defaults.ts (Rolldown-DCE-friendly)"
  affects:
    - "PLAN-02 (consumer rewrite of openaiRealtimeStreaming.js to read this var instead of the hardcoded api.openai.com literal)"
tech-stack:
  added: []
  patterns:
    - "Build-time derived defaults (URL transformation in buildResolved)"
    - "Multi-scenario regression test via spawnSync of generator + cache-busted require()"
key-files:
  created:
    - "scripts/verify-realtime-routing.js"
    - ".planning/phases/05-route-all-realtime-asr-diarization-streaming-through-corpora/05-01-SUMMARY.md"
  modified:
    - "scripts/generate-build-config.js"
    - "src/config/defaults.ts"
    - "package.json"
    - ".github/workflows/verify-gating.yml"
decisions:
  - "Derivation runs only when resolved.OPENWHISPR_REALTIME_WSS_URL is empty (covers both unset and explicit \"\"). An explicit non-empty value always wins."
  - "Path prefix on BACKEND_URL is preserved verbatim (sub-path-mounted backend at https://api.example.com/v1 yields wss://api.example.com/v1/v1/realtime — second /v1 is the realtime mount under the existing API root). Documented for PLAN-04."
  - "Used direct named re-export (export { OPENWHISPR_REALTIME_WSS_URL } from \"./build-config.generated\";) — NOT namespace member access — so Rolldown propagates the literal across the module boundary (canonical pattern from 04.1-02)."
  - "Trailing slash on backend pathname stripped before /v1/realtime is appended (idempotent for both https://api.example.com and https://api.example.com/)."
  - "Malformed URL falls back to empty string; existing STREAMING_ENABLED guard handles the realtime-unavailable case gracefully."
metrics:
  duration: "~2min"
  tasks: 3
  files: 5
  completed: "2026-05-09"
---

# Phase 05 Plan 01: OPENWHISPR_REALTIME_WSS_URL Build Variable Summary

Introduce the `OPENWHISPR_REALTIME_WSS_URL` build-time variable with smart `OPENWHISPR_BACKEND_URL` → `wss://…/v1/realtime` derivation (path-preserving, https↔wss / http↔ws), guarded by a multi-scenario regression test wired into the existing CI gating workflow.

## Outcome

A maintainer can now point ALL realtime ASR traffic at their own backend purely via build-time env vars. Setting `OPENWHISPR_BACKEND_URL=https://api.example.com` automatically yields `OPENWHISPR_REALTIME_WSS_URL=wss://api.example.com/v1/realtime` in the generated build-config. The default build (no env vars) keeps the var empty, which the existing `STREAMING_ENABLED=false` guard already handles gracefully. PLAN-02 will replace the hardcoded `wss://api.openai.com/v1/realtime` literal in `src/helpers/openaiRealtimeStreaming.js` with a build-config import — this plan is the foundation that change rests on.

## TDD Trail

| Step | Commit | Outcome |
|------|--------|---------|
| RED | `30a6ab3 test(05-01): add verify-realtime-routing.js with derivation scenarios (RED)` | 5/5 scenarios fail — `OPENWHISPR_REALTIME_WSS_URL` is `undefined` from generator |
| GREEN | `48a44c6 feat(05-01): add OPENWHISPR_REALTIME_WSS_URL build var with backend-derived default (GREEN)` | 5/5 scenarios pass; verify:feature-gating + verify:oauth-gating still green; tsc clean |
| CI | `2487f5d ci(05-01): run verify:realtime-routing on PR/push to main` | New step in `.github/workflows/verify-gating.yml` after the feature-gating step; YAML validates |

## Derivation Rules (Locked)

| Input `OPENWHISPR_BACKEND_URL` | Input `OPENWHISPR_REALTIME_WSS_URL` | Resolved `OPENWHISPR_REALTIME_WSS_URL` |
|---|---|---|
| (unset) | (unset) | `""` |
| `https://api.example.com` | (unset) | `wss://api.example.com/v1/realtime` |
| `https://api.example.com/` | (unset) | `wss://api.example.com/v1/realtime` |
| `https://api.example.com/v1` | (unset) | `wss://api.example.com/v1/v1/realtime` |
| `http://localhost:8080` | (unset) | `ws://localhost:8080/v1/realtime` |
| `https://api.example.com` | `wss://realtime.other.example/ws` | `wss://realtime.other.example/ws` (explicit wins) |
| (malformed) | (unset) | `""` (falls back, STREAMING guard kicks in) |

## Verification

- `node scripts/verify-realtime-routing.js` → `OK — 5 scenarios, 0 violations.`
- `cd src && npx tsc --noEmit` → clean.
- `npm run verify:feature-gating` → `OK — 4 scenarios, 112 greps, 0 violations.` (no regression).
- `npm run verify:oauth-gating` → `OK — 4 scenarios, 63 greps, 0 violations.` (no regression).
- Generator log reads `(17 string keys + 6 booleans)`.
- Generated `.cjs` (default build) contains `OPENWHISPR_REALTIME_WSS_URL: ""`.
- `.github/workflows/verify-gating.yml` contains the new `Verify realtime routing (CFG-04 + Phase 05)` step.

## Deviations from Plan

None — plan executed exactly as written. The TDD discipline produced three commits (RED → GREEN → CI) matching the plan's success criteria.

## Self-Check: PASSED

- Found: `scripts/verify-realtime-routing.js`
- Found: `scripts/generate-build-config.js` (modified)
- Found: `src/config/defaults.ts` (modified)
- Found: `package.json` (modified — `verify:realtime-routing` script)
- Found: `.github/workflows/verify-gating.yml` (modified — new step)
- Found: commit `30a6ab3` (RED)
- Found: commit `48a44c6` (GREEN)
- Found: commit `2487f5d` (CI)

## Notes for PLAN-02

`src/helpers/openaiRealtimeStreaming.js:54` currently reads:

```js
const url = "wss://api.openai.com/v1/realtime?intent=transcription";
```

PLAN-02 should:

1. `require("../config/build-config.generated.cjs")` and read `OPENWHISPR_REALTIME_WSS_URL`.
2. If empty, treat realtime as unavailable (consistent with `STREAMING_ENABLED=false`) and surface the same fallback path the existing code uses when the WSS connect fails.
3. If non-empty, use that URL as the base and append the existing `?intent=transcription` query (preserve protocol-level compat with Speaches per 05-CONTEXT D-04).
4. Add a grep target in `scripts/verify-feature-gating.js` (or extend `verify-realtime-routing.js`) that asserts `wss://api.openai.com/v1/realtime` is ABSENT from the renderer + main bundle when `OPENWHISPR_BACKEND_URL` is set.
