---
phase: 05
plan: 02
subsystem: realtime-streaming
tags: [tdd, realtime, openai-realtime, main-process, build-config-cjs, secrets-grep, sc-8]
requirements: [CFG-04]
dependency-graph:
  requires:
    - "Phase 05-01 (OPENWHISPR_REALTIME_WSS_URL build var + verify-realtime-routing.js gate)"
  provides:
    - "openaiRealtimeStreaming.js routes realtime WebSocket through build-config-derived URL with empty-URL guard"
    - "verify-realtime-routing.js source-no-leak + bundle-no-leak + SC-8 hardcoded-secrets scenarios"
  affects:
    - "PLAN-03 (auto-disable STREAMING_ENABLED when realtime WSS URL is empty in default builds)"
    - "PLAN-04 (docs/realtime-routing.md operator guide referencing the empty-URL guard error message)"
tech-stack:
  added: []
  patterns:
    - "Main-process require() of build-config.generated.cjs (no DCE concern — Electron ships main JS verbatim)"
    - "Defense-in-depth empty-URL guard preventing accidental fallback to api.openai.com"
    - "Tree-walking regression scanner with per-pattern allow-list for BYOK direct URLs"
key-files:
  created:
    - ".planning/phases/05-route-all-realtime-asr-diarization-streaming-through-corpora/05-02-SUMMARY.md"
  modified:
    - "src/helpers/openaiRealtimeStreaming.js"
    - "scripts/verify-realtime-routing.js"
decisions:
  - "Main-process file uses CommonJS require() of build-config.generated.cjs (NOT the renderer-only defaults.ts named-re-export pattern from Phase 04.1) — Vite does not bundle main process, so DCE is not applicable; the literal is read at module load time from the prebuild-frozen cjs."
  - "Empty-URL guard throws inside connect() (after isConnecting=false reset) so callers see a clear operator-friendly error message instead of an opaque WebSocket failure to api.openai.com — defense in depth on top of the PLAN-03 STREAMING_ENABLED auto-disable."
  - "?intent=transcription query string preserved (OpenAI Realtime API contract; Speaches+LiteLLM honors it per 05-CONTEXT D-04)."
  - "SC-8 wss-pattern allow-list is path-exact — the openai-realtime-wss pattern has empty allow-list (hard ban per D-04), while deepgram-wss + assemblyai-wss are pinned to their respective BYOK-direct helper files only."
  - "SC-8 scanner walks .ts/.tsx/.js/.jsx/.cjs/.mjs only, skipping dist/ and node_modules/ and the gitignored build-config.generated.{ts,cjs} files."
metrics:
  duration: "~2.5min"
  tasks: 3
  files: 2
  completed: "2026-05-09"
---

# Phase 05 Plan 02: Replace Hardcoded api.openai.com Realtime URL Summary

Replace the hardcoded `wss://api.openai.com/v1/realtime?intent=transcription` literal in `src/helpers/openaiRealtimeStreaming.js` with a build-config-driven URL read from `build-config.generated.cjs`, add an empty-URL safety guard, and lock in CONTEXT.md SC-8 with a `src/`-wide hardcoded-secrets + unauthorized-WSS regression scan in `verify-realtime-routing.js`.

## Outcome

When a maintainer sets `OPENWHISPR_BACKEND_URL=https://api.example.com` at build time, the desktop client now sends realtime WebSocket traffic to `wss://api.example.com/v1/realtime?intent=transcription` — i.e. their corporate Speaches+LiteLLM backend — instead of `api.openai.com`. The default build (no env vars) yields an empty `OPENWHISPR_REALTIME_WSS_URL`, which the empty-URL guard catches with a clear operator-friendly error before any WebSocket is opened (defense in depth on top of the PLAN-03 STREAMING_ENABLED auto-disable).

The SC-8 regression scan now walks the entire `src/` tree on every PR/push (CI gate wired in 05-01), flagging:

1. OpenAI-shape API keys (`sk-[A-Za-z0-9]{20,}`).
2. Stripe live/test keys (`sk_(live|test)_...`).
3. The legacy `wss://api.openai.com/v1/realtime` literal (hard ban — no allow-list).
4. `wss://api.deepgram.com/...` outside `src/helpers/deepgramStreaming.js` (BYOK-direct allow-listed).
5. `wss://streaming.assemblyai.com/...` outside `src/helpers/assemblyAiStreaming.js` (BYOK-direct allow-listed).

## TDD Trail

| Step | Commit | Outcome |
|------|--------|---------|
| RED | `fc3bb8c test(05-02): extend verify-realtime-routing with source + bundle no-leak scenarios (RED)` | source-no-leak fails on the literal at openaiRealtimeStreaming.js line 54 |
| GREEN | `03161d7 feat(05-02): replace hardcoded api.openai.com realtime URL with build-config import (GREEN)` | Source reads OPENWHISPR_REALTIME_WSS_URL from cjs; empty-URL guard added; all gates pass |
| SC-8 | `5dab759 test(05-02): SC-8 add hardcoded-secrets + unauthorized-WSS regression scan` | src/-wide tree walker with per-pattern allow-list; passes cleanly |

## Verification

- `grep -F 'api.openai.com/v1/realtime' src/helpers/openaiRealtimeStreaming.js` → 0 matches.
- `OPENWHISPR_BACKEND_URL=https://api.example.com node scripts/generate-build-config.js && grep -F 'wss://api.example.com/v1/realtime' src/config/build-config.generated.cjs` → 1 match.
- `node scripts/verify-realtime-routing.js` → `OK — 5 derivation scenarios + source-no-leak + bundle-no-leak + SC-8 hardcoded-secrets, 0 violations.`
- `npm run verify:feature-gating` → `OK — 4 scenarios, 112 greps, 0 violations.`
- `npm run verify:oauth-gating` → `OK — 4 scenarios, 63 greps, 0 violations.`
- `cd src && npx tsc --noEmit` → clean.
- Default cjs restored at session end (verified via re-running generator with no scenario env).

## Implementation Notes

### Why CommonJS require() instead of the 04.1 named-re-export pattern

`openaiRealtimeStreaming.js` is a main-process Node CommonJS module. Vite/Rolldown does not bundle main; Electron ships the file verbatim. The Phase 04.1 named-re-export pattern (`export { X } from "./build-config.generated"`) exists specifically to keep Rolldown DCE able to constant-fold renderer-side gates — there is no analogous concern here. A simple `const { OPENWHISPR_REALTIME_WSS_URL } = require("../config/build-config.generated.cjs")` at module top suffices and matches the existing `require("ws")` / `require("./debugLogger")` style.

### Empty-URL guard placement

The guard sits inside `connect()` after the `isConnecting = true` flag is set (line 44–53 in the new code) and resets it to `false` before throwing — so a caller that retries after the throw won't see a stuck `isConnecting` state. The error message names both the override knob (`OPENWHISPR_REALTIME_WSS_URL`) and the disable knob (`OPENWHISPR_STREAMING=false`) so an operator can self-recover without reading source.

### SC-8 allow-list mechanism

Allow-list is per-pattern and uses repository-relative POSIX paths (e.g. `"src/helpers/deepgramStreaming.js"`). The walker normalizes path separators to `/` before comparing. The hard ban on `wss://api.openai.com/v1/realtime` is enforced by an empty allow-list — any future regression in any `src/` file is caught immediately.

## Deviations from Plan

None — plan executed exactly as written. Three commits (RED → GREEN → SC-8) match the plan's success criteria.

## Self-Check: PASSED

- Found: `src/helpers/openaiRealtimeStreaming.js` (modified — require + empty-URL guard + URL templating)
- Found: `scripts/verify-realtime-routing.js` (modified — source-no-leak + bundle-no-leak + SC-8 secrets scan)
- Found: commit `fc3bb8c` (RED)
- Found: commit `03161d7` (GREEN)
- Found: commit `5dab759` (SC-8)
- Verified: `grep -F 'api.openai.com/v1/realtime' src/helpers/openaiRealtimeStreaming.js` returns 0 matches.
- Verified: `node scripts/verify-realtime-routing.js` exits 0 with full success line.

## Notes for PLAN-03

PLAN-02 leaves the empty-URL case as a runtime throw (defense in depth). PLAN-03 should auto-disable `STREAMING_ENABLED` when `OPENWHISPR_REALTIME_WSS_URL` resolves empty so the default build's renderer-side STREAMING gate prevents any code path from reaching `openaiRealtimeStreaming.js.connect()` in the first place. The empty-URL guard then becomes a belt-and-suspenders safeguard against future code paths that bypass the gate.
