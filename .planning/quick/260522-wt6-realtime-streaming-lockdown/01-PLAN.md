---
quick_id: 260522-wt6
plan: 01
title: Repoint realtime WSS bearer under lockdown (Design B)
files_modified:
  - src/helpers/ipcHandlers.js
  - src/helpers/audioManager.js
---

<objective>
Under PROVIDER_LOCKDOWN_ENABLED, the realtime dictation path must use the
Better Auth session bearer directly as the WSS `Authorization` and connect to
`OPENWHISPR_REALTIME_WSS_URL` (our server's `/v1/realtime` proxy). It must NOT
call `/api/openai-realtime-token` and must NOT mint an ephemeral OpenAI
client_secret. The default build (flag off) keeps the existing Design-A path.

Purpose: kill the OpenAI-direct 401 fallback for corporate builds.
Output: realtime streaming connects to our WSS proxy with the session token.
</objective>

<context>
@src/helpers/openaiRealtimeStreaming.js
@src/helpers/ipcHandlers.js
@src/helpers/audioManager.js
@src/config/build-config.generated.cjs

Key facts from source:
- `ipcHandlers.js` ~3411-3421: `getAuthHeaderFromWindow(win)` returns
  `{ Authorization: 'Bearer <token>' }` from `tokenStore.get()` — this IS the
  Better Auth session bearer (same one `cloud-api-request` uses). Falls back to
  a `Cookie` header when no token.
- `ipcHandlers.js` ~4091-4190: `fetchRealtimeToken(event, options)`. The
  non-byok openai branch POSTs `/api/openai-realtime-token` and returns
  `data.clientSecret` (Design A — ephemeral OpenAI client_secret).
- `ipcHandlers.js` ~5048-5079: `connectDictationStreaming()` calls
  `fetchRealtimeToken` then `streaming.connect({ apiKey, model, preconfigured })`.
- `openaiRealtimeStreaming.js` ~36-86: `connect()` reads
  `OPENWHISPR_REALTIME_WSS_URL` and sends `Authorization: Bearer ${apiKey}`.
  The URL is already our server; only `apiKey` is wrong under lockdown.
- `BuildConfig.PROVIDER_LOCKDOWN_ENABLED` is the gate.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bearer-passthrough realtime path under lockdown in ipcHandlers.js</name>
  <files>src/helpers/ipcHandlers.js</files>
  <action>
In `fetchRealtimeToken()` (~4091), add a lockdown short-circuit at the very top
of the function body, before the `assemblyai-realtime` / `deepgram-realtime` /
byok branches: when `BuildConfig.PROVIDER_LOCKDOWN_ENABLED === true`, do NOT
POST `/api/openai-realtime-token` and do NOT touch any BYOK key. Instead obtain
the Better Auth session bearer via the existing `getAuthHeader(event)` helper,
extract the raw token from its `Authorization: Bearer <token>` value (throw
"Not authenticated" if the header is empty or has no Bearer token — cookie-only
auth cannot be used as a WSS bearer), and return that raw token string. Honor
the `streams` count: return `[token, token]` when `streams === 2`, else the
token. This makes the lockdown realtime path Design B — the desktop's own
session token is the WSS credential; the server strips it and substitutes
LITELLM_MASTER_KEY upstream.

In `connectDictationStreaming()` (~5048), under
`BuildConfig.PROVIDER_LOCKDOWN_ENABLED` force `options.mode` to be treated as
non-byok (the `isCloud` computation and the `fetchRealtimeToken` call). There
is no byok mode under lockdown. Keep `preconfigured: true` for the lockdown
path: our proxy forwards a server-configured transcription session, so the
client must not send a `transcription_session.update` (the existing
`preconfigured` branch in `openaiRealtimeStreaming.js` handles this).

Do NOT alter the non-lockdown branches — Design A, assemblyai, deepgram, and
byok all stay intact for the default build. Reference the existing
`STREAMING_ENABLED` gate comment style for the new lockdown comment.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('src/helpers/ipcHandlers.js','utf8'); const f=s.slice(s.indexOf('fetchRealtimeToken = async')); if(!/PROVIDER_LOCKDOWN_ENABLED/.test(f.slice(0,2500))) throw new Error('no lockdown short-circuit in fetchRealtimeToken'); console.log('OK')"</automated>
  </verify>
  <done>
Under lockdown, `fetchRealtimeToken` returns the raw session bearer and never
POSTs `/api/openai-realtime-token`; `connectDictationStreaming` never enters a
byok branch. Default build unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Treat transcription mode as openwhispr under lockdown in audioManager.js</name>
  <files>src/helpers/audioManager.js</files>
  <action>
Import `PROVIDER_LOCKDOWN_ENABLED` from `../config/build-config.generated`
alongside the existing `STREAMING_ENABLED` import (find the existing import
line for `STREAMING_ENABLED` near the top and extend it).

In `shouldUseStreaming()` (~1973-2006): the branches that gate on
`s.cloudTranscriptionMode === "openwhispr"` / `=== "byok"` must, under lockdown,
treat the mode as effectively `"openwhispr"` always. Concretely: compute a
local `const effectiveMode = PROVIDER_LOCKDOWN_ENABLED ? "openwhispr" : s.cloudTranscriptionMode;`
and use `effectiveMode` in place of `s.cloudTranscriptionMode` in the
REALTIME_MODELS block (~1990-1996) and the non-realtime block (~1998). Under
lockdown the `byok` sub-branch (`return !!s.openaiApiKey`) must be unreachable.
The `provider !== "openai"` early return at ~1992 stays (the only streaming
provider under lockdown is still the openai-realtime carrier — see plan 02).

In `startStreamingRecording()` (~2108-2290) and `warmupStreamingConnection()`
(~2008+): the `mode: cloudTranscriptionMode === "byok" ? "byok" : "openwhispr"`
expressions (~2029, ~2251) must resolve to `"openwhispr"` under lockdown.
Replace each with `mode: (PROVIDER_LOCKDOWN_ENABLED || cloudTranscriptionMode !== "byok") ? "openwhispr" : "byok"`
or route through the same `effectiveMode` helper if cleaner.

Goal: under lockdown the "falling back to OpenAI default" branch and any
OpenAI-direct/byok branch are statically unreachable. The catalog-not-loaded
log line originates from the streamingProviders stub being aliased in — plan 02
fixes the catalog; this task ensures the mode logic never selects byok.
  </action>
  <verify>
    <automated>npm run typecheck 2>&1 | tail -3</automated>
  </verify>
  <done>
`shouldUseStreaming` and the streaming start/warmup paths resolve mode to
`openwhispr` whenever `PROVIDER_LOCKDOWN_ENABLED` is true; typecheck passes;
default build logic unchanged.
  </done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes.
- Read-through: under lockdown there is no code path from `startStreamingRecording`
  to `/api/openai-realtime-token` or to a byok key.
</verification>

<success_criteria>
Corporate build's realtime path uses the Better Auth session bearer against
`OPENWHISPR_REALTIME_WSS_URL`; no ephemeral-token mint, no byok branch.
</success_criteria>

<output>
Atomic commit per task. Commit messages:
- `fix(realtime): use session bearer for WSS proxy under lockdown`
- `fix(realtime): treat transcription mode as openwhispr under lockdown`
</output>
