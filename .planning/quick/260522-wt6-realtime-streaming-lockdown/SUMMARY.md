# Quick Task 260522-wt6: Realtime Streaming Lockdown Summary

**One-liner:** Corporate (PROVIDER_LOCKDOWN) realtime dictation now connects to
our server's `/v1/realtime` WSS proxy with the Better Auth session bearer
(Design B) — no OpenAI-direct connection, no ephemeral `client_secret`, no
deepgram/assemblyai catalog entries.

## What changed

### Plan 01 — Repoint realtime WSS bearer under lockdown (Design B)

- **`src/helpers/ipcHandlers.js`** — `fetchRealtimeToken()` gains a lockdown
  short-circuit: under `PROVIDER_LOCKDOWN_ENABLED` it returns the raw Better
  Auth session bearer (from the `Authorization: Bearer <token>` header), never
  POSTs `/api/openai-realtime-token`, never touches a BYOK key. Throws
  "Not authenticated" if no Bearer token. `connectDictationStreaming()` forces
  `effectiveMode` to non-byok under lockdown.
- **`src/helpers/audioManager.js`** — imports `PROVIDER_LOCKDOWN_ENABLED`;
  `shouldUseStreaming()` / `warmupStreamingConnection()` /
  `startStreamingRecording()` resolve transcription mode to `"openwhispr"`
  under lockdown, making the byok sub-branch statically unreachable.

Commits: `5d6d8a3a`, `74c8c996`

### Plan 02 — Cull deepgram/assemblyai from catalog; gate streaming ON

- **`scripts/generate-build-config.js`** — lockdown block sets
  `STREAMING_ENABLED = true`; B1 auto-disable guarded with
  `!PROVIDER_LOCKDOWN_ENABLED`. Two new test cases in
  `generate-build-config.test.cjs`.
- **`src/helpers/streamingProviders.lockdown.js`** (new) — single-entry
  catalog (`openai-realtime` only); zero deepgram/assemblyai literals.
- **`src/vite.config.mjs`** — aliases `streamingProviders` to the lockdown
  catalog when `STREAMING_ENABLED && PROVIDER_LOCKDOWN_ENABLED`.
- **`src/helpers/audioManager.js`** — `REALTIME_MODELS` gains `"gpt-realtime"`;
  realtime default model resolves to `gpt-realtime` under lockdown.

Commits: `3e1c92f0`, `6bff47ac` (Task 3's audioManager/ipcHandlers edits
landed in the Plan 01 commits — see Deviations).

### Plan 03 — Live verification

- **`tests/ui/realtime-lockdown.spec.ts`** (new) — Playwright Electron-UI spec:
  launches the real lockdown app, drives `dictationRealtimeWarmup`, asserts the
  connect targets our WSS host, no `api.openai.com`, no OpenAI-direct fallback,
  no 401.
- **`scripts/verify-provider-lockdown.js`** — new `REALTIME` target group
  (`wss://api.openai.com`, `api.openai.com/v1/realtime`,
  `/api/openai-realtime-token`); dist-only absence check.
- **`docs/BACKEND_SPEC.md`** — realtime WSS card rewritten for Design B vs A.

Commits: `8dba0ae7`, `0ba50651`, `4bb2cf08`

## Verification

| Gate | Result |
|------|--------|
| `npm run typecheck` | clean |
| `npm run test:build-config` | 10/10 pass |
| `npm run verify:realtime-routing` | 0 violations |
| `npm run verify:provider-lockdown` | 2 scenarios, 47 greps, 0 violations |
| `npm run test:lockdown-ui` | 6/6 pass (4 corporate-lockdown + 2 realtime-lockdown) |

`verify:provider-lockdown` must run with a clean ambient env — it spawns its
own per-scenario builds.

## MANDATORY LIVE RUN

Drove the real lockdown Electron app against the live `localhost:4000` server
(`live-run.mjs`):

```
[DEBUG] OpenAI Realtime connecting { model: 'gpt-realtime' }
[DEBUG] OpenAI Realtime WebSocket opened
[DEBUG] OpenAI Realtime WebSocket closed { code: 1011, reason: 'unexpected response', wasActive: false }
```

**Client side — verified correct:** connects to
`ws://localhost:4000/v1/realtime?intent=transcription` with the Better Auth
session bearer, server accepts the upgrade (no 401), WebSocket reaches `OPEN`.
No `api.openai.com`, no OpenAI-direct fallback, model `gpt-realtime`. The
Design B client fix is complete and working.

**Server side — finding filed:** the WebSocket then closes with code **1011**
("unexpected response") before any `transcription_session.created` event — the
server's upstream realtime leg fails after the client-facing upgrade succeeds.
Filed as **R31** in
`.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md`. End-to-end
transcription cannot complete until the server upstream is fixed; the failure
is now isolated to the server.

## Deviations from Plan

**1. [Process] Plan 02 Task 3 changes committed under Plan 01 commits.**
Plan 02 Task 3 modifies the same files as Plan 01 (`audioManager.js`,
`ipcHandlers.js`); the edits were staged per-file in `74c8c996` / `5d6d8a3a`.
All Plan 02 Task 3 work is present and verified.

**2. [Rule 3] `verify-provider-lockdown` run with a clean ambient env.**
The verifier builds its own "default" scenario; a pre-set
`OPENWHISPR_PROVIDER_LOCKDOWN` would poison it. Run with `env -u` clearing the
lockdown vars.

## Known Stubs

None. `streamingProviders.lockdown.js` is a real single-entry catalog.

## Build-config state left for the user

Dev client build-config left in corporate-minimal lockdown:
`PROVIDER_LOCKDOWN_ENABLED=true`, `STREAMING_ENABLED=true`,
`OPENWHISPR_BACKEND_URL=http://localhost:4000`,
`OPENWHISPR_REALTIME_WSS_URL=ws://localhost:4000/v1/realtime`.

## Self-Check: PASSED

- `src/helpers/streamingProviders.lockdown.js` — FOUND
- `tests/ui/realtime-lockdown.spec.ts` — FOUND
- Commits `5d6d8a3a` `74c8c996` `3e1c92f0` `6bff47ac` `8dba0ae7` `0ba50651` `4bb2cf08` — all FOUND
