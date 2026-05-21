---
quick_id: 260522-wt6
title: Realtime streaming lockdown — WSS-proxy-only under PROVIDER_LOCKDOWN
type: quick
plans: 3
---

# Realtime Streaming Lockdown

## Goal

Under `PROVIDER_LOCKDOWN_ENABLED` the realtime/streaming dictation path must
connect ONLY to our server's WSS proxy `/v1/realtime` (Design B) authenticated
with the Better Auth session bearer — never fall back to a direct
`wss://api.openai.com` connection and never mint an ephemeral OpenAI
`client_secret` via `/api/openai-realtime-token` (Design A).

Build-time gating ONLY. Default build (flag off) is byte-for-byte unchanged:
Design A, deepgram, and assemblyai all remain for non-corporate builds.

## Live-Verified Problem

Corporate build log:
```
Streaming providers catalog not loaded, falling back to OpenAI default
OpenAI Realtime connecting { model: 'gpt-4o-mini-transcribe' }
WebSocket error: Unexpected server response: 401
```

Root causes (confirmed by reading the source):

1. `fetchRealtimeToken()` (`ipcHandlers.js` ~4091-4190) ALWAYS POSTs to
   `/api/openai-realtime-token` for the non-byok openai path and uses the
   returned `clientSecret` as the WSS bearer. That is Design A — the ephemeral
   token is an OpenAI `client_secret`, intended for client→OpenAI-direct
   streaming. Under lockdown the desktop must instead pass the Better Auth
   session bearer directly to our WSS proxy.
2. `connectDictationStreaming()` (`ipcHandlers.js` ~5048-5079) passes
   `preconfigured: isCloud` — under Design B against our proxy the server's
   transcription session is already configured upstream, which is fine, but the
   bearer is wrong.
3. `OpenAIRealtimeStreaming.connect()` (`openaiRealtimeStreaming.js` ~36-86)
   already reads `OPENWHISPR_REALTIME_WSS_URL` (correct — points at our server)
   and sets `Authorization: Bearer ${apiKey}`. The URL is right; `apiKey` is
   wrong (it is the ephemeral OpenAI client_secret, not the session bearer).
4. `shouldUseStreaming()` / `getStreamingProvider()` (`audioManager.js`
   ~198-211, ~1973-2006) branch on `cloudTranscriptionMode`. When the mode is
   not `"openwhispr"` (e.g. test profile had a different / `byok` value) the
   path falls into the OpenAI-direct branch. Under lockdown there is no `byok`
   mode — the mode must be treated as effectively `openwhispr` always.

## Plans

- **01-PLAN.md** — Repoint the realtime WSS bearer under lockdown (Design B).
  `ipcHandlers.js` realtime token plumbing + `audioManager.js` mode handling.
- **02-PLAN.md** — Cull deepgram/assemblyai from the streaming catalog under
  lockdown; gate `STREAMING_ENABLED` ON under lockdown in the build-config
  generator; default realtime model `gpt-realtime` under lockdown.
- **03-PLAN.md** — Live verification: extend the Playwright Electron-UI test to
  drive a real recording and assert the WSS target is our server (not
  api.openai.com); extend `verify-provider-lockdown.js` with a no-OpenAI-direct
  reachable-target check. Includes mandatory live recording run in the app.

## Constraints

- Build-time env gating only — no runtime config drift, upstream parity for
  default build.
- i18n: any new user-facing string → all 9 locales
  (`src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json`).
- Atomic commit per task.
- Server repo is READ-ONLY: the server already implements Design B at
  `/v1/realtime` — NO server change is needed for this task. (`BACKEND_SPEC.md`
  doc update is a client-repo doc, allowed.)
- Verify gate (all must pass): `npm run typecheck`,
  `npm run verify:provider-lockdown`, `npm run verify:realtime-routing`,
  `npm run test:lockdown-ui`, AND a live recording run in the real Electron app
  (drive the app — do not bundle-grep only).
