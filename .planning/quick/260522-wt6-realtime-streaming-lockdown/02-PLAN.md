---
quick_id: 260522-wt6
plan: 02
title: Cull deepgram/assemblyai from catalog under lockdown; gate streaming ON
files_modified:
  - scripts/generate-build-config.js
  - src/helpers/streamingProviders.js
  - src/helpers/streamingProviders.lockdown.js
  - src/vite.config.mjs
  - src/helpers/audioManager.js
  - scripts/generate-build-config.test.cjs
---

<objective>
Under PROVIDER_LOCKDOWN_ENABLED: (a) ensure `STREAMING_ENABLED` resolves true so
the realtime-via-our-proxy path is live, (b) cut deepgram and assemblyai —
alternative third-party providers — from the renderer streaming catalog,
leaving exactly one entry (`openai-realtime`, which under lockdown is repointed
through our server by plan 01), (c) make `gpt-realtime` the default realtime
model under lockdown.

Default build (flag off) keeps deepgram + assemblyai + Design A.

Purpose: lockdown's streaming catalog has exactly one path — our server.
Output: lockdown renderer bundle contains zero deepgram/assemblyai streaming
literals; streaming is enabled.
</objective>

<context>
@scripts/generate-build-config.js
@src/helpers/streamingProviders.js
@src/helpers/streamingProviders.stub.js
@src/vite.config.mjs
@src/helpers/audioManager.js

Key facts from source:
- `streamingProviders.js` carries three catalog entries: `deepgram`,
  `assemblyai`, `openai-realtime`. `vite.config.mjs` ~134-147 aliases this
  module to `streamingProviders.stub.js` when `STREAMING_ENABLED === false`.
- `generate-build-config.js` ~152-207 `buildResolved()`: the Phase-05 B1
  auto-disable forces `STREAMING_ENABLED=false` when no realtime URL resolves;
  the Phase-10 lockdown block (~168-172) only touches OAuth flags today.
- `generate-build-config.js` ~85: `STREAMING_ENABLED` default is `true`.
- `audioManager.js` ~19: `REALTIME_MODELS = new Set(["gpt-4o-mini-transcribe",
  "gpt-4o-transcribe"])`; ~1731/1733 default model is `gpt-4o-mini-transcribe`;
  `connectDictationStreaming` (ipcHandlers ~5067) defaults
  `gpt-4o-mini-transcribe`.
- The server's Design-B default realtime model is `gpt-realtime`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Lockdown implies streaming enabled, in build-config generator</name>
  <files>scripts/generate-build-config.js, scripts/generate-build-config.test.cjs</files>
  <action>
In `buildResolved()`, inside the existing `PROVIDER_LOCKDOWN_ENABLED === true`
block (~168-172, the one that disables OAuth), add: under lockdown, realtime ASR
is always served by our backend WSS proxy, so streaming must be enabled. Set
`resolved.STREAMING_ENABLED = true`. This must be applied AFTER the Phase-05 B1
auto-disable block (~199-205) so lockdown wins over the no-URL auto-disable —
or, simpler, guard the B1 auto-disable with `&& !resolved.PROVIDER_LOCKDOWN_ENABLED`.
Choose the guard approach: add `!resolved.PROVIDER_LOCKDOWN_ENABLED` to the B1
`if` condition, AND set `resolved.STREAMING_ENABLED = true` in the lockdown
block. Rationale: a corporate build always has a backend URL (lockdown is
meaningless without one), so the realtime WSS URL derives fine; the B1
auto-disable must not fire for lockdown builds even in a misconfigured edge case.
An explicit `OPENWHISPR_STREAMING=false` under lockdown is a contradiction —
lockdown wins (mirror the OAuth "lockdown is the stronger posture" comment).

Add a test case to `generate-build-config.test.cjs`: with
`OPENWHISPR_PROVIDER_LOCKDOWN=true` and a backend URL set, assert
`STREAMING_ENABLED === true`; and with lockdown true + `OPENWHISPR_STREAMING=false`,
assert `STREAMING_ENABLED === true` (lockdown overrides).
  </action>
  <verify>
    <automated>npm run test:build-config 2>&1 | tail -5</automated>
  </verify>
  <done>
`buildResolved()` returns `STREAMING_ENABLED: true` for any lockdown build;
B1 auto-disable cannot fire under lockdown; tests cover both cases.
  </done>
</task>

<task type="auto">
  <name>Task 2: Lockdown streaming catalog with only the our-server realtime entry</name>
  <files>src/helpers/streamingProviders.lockdown.js, src/vite.config.mjs</files>
  <action>
Create `src/helpers/streamingProviders.lockdown.js`: a catalog with exactly ONE
entry, `"openai-realtime"`, identical in shape to the `openai-realtime` entry in
`streamingProviders.js` (the `dictationRealtime*` bindings — these route through
the main-process `OpenAIRealtimeStreaming` which plan 01 repointed to our WSS
proxy). It must contain ZERO `deepgram` / `assemblyai` / `assemblyAi` literals
so the lockdown bundle-grep gate stays clean. Add a header comment explaining it
is the PROVIDER_LOCKDOWN variant: deepgram/assemblyai are alternative
third-party providers cut by lockdown; the sole streaming path is our server's
`/v1/realtime` proxy. `export default STREAMING_PROVIDERS;`.

In `src/vite.config.mjs`, in the streaming-alias block (~123-147): when
`STREAMING_ENABLED` is true AND `buildConfig.PROVIDER_LOCKDOWN_ENABLED === true`,
alias `streamingProviders` to `streamingProviders.lockdown.js` (not the stub —
the stub disables streaming entirely; lockdown keeps realtime). Structure: read
`providerLockdown = buildConfig.PROVIDER_LOCKDOWN_ENABLED === true` next to the
existing `streamingEnabled` read. Then: if `!streamingEnabled` → existing stub
aliasing (unchanged). Else if `providerLockdown` → push the two
`streamingProviders` find/replace alias entries pointing at the lockdown file
(mirror the regex pair at ~141-147). Else → no alias (full catalog, default
build). The `useChatStreaming` stub aliasing stays gated on `!streamingEnabled`
only — do not change it.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('src/helpers/streamingProviders.lockdown.js','utf8'); if(/deepgram|assembly/i.test(s)) throw new Error('lockdown catalog leaks alt-provider literal'); if(!/openai-realtime/.test(s)) throw new Error('missing openai-realtime entry'); console.log('OK')"</automated>
  </verify>
  <done>
A lockdown renderer build aliases the catalog to the single-entry lockdown file;
no deepgram/assemblyai streaming literals in that module.
  </done>
</task>

<task type="auto">
  <name>Task 3: Default realtime model gpt-realtime under lockdown</name>
  <files>src/helpers/audioManager.js</files>
  <action>
Under lockdown the server's realtime default is `gpt-realtime`. Add
`"gpt-realtime"` to the `REALTIME_MODELS` set (`audioManager.js` ~19) so the
streaming selection logic recognizes it as a realtime-capable model in EVERY
build (adding to the set is parity-safe — it only widens recognition). Then gate
the default model: where audioManager resolves the realtime model default
(~1731/1733, the `gpt-4o-mini-transcribe` literals) and any other client-side
realtime default, use `gpt-realtime` when `PROVIDER_LOCKDOWN_ENABLED` is true,
else the existing `gpt-4o-mini-transcribe`. Import `PROVIDER_LOCKDOWN_ENABLED`
if not already imported by plan 01's Task 2 (it is — reuse that import).

Also confirm `connectDictationStreaming` in `ipcHandlers.js` (~5067) receives
the lockdown model: it falls back to `gpt-4o-mini-transcribe` only when
`options.model` is absent. Since audioManager now passes `gpt-realtime` under
lockdown, the renderer-supplied `options.model` carries it through — no
ipcHandlers change required, but verify the renderer→IPC `model` field is
populated from the gated default (trace `cloudTranscriptionModel` → IPC
`options.model`). If the IPC fallback literal could still be hit under lockdown,
gate that fallback too with `BuildConfig.PROVIDER_LOCKDOWN_ENABLED ? "gpt-realtime" : "gpt-4o-mini-transcribe"`.
  </action>
  <verify>
    <automated>npm run typecheck 2>&1 | tail -3 && node -e "const s=require('fs').readFileSync('src/helpers/audioManager.js','utf8'); if(!/gpt-realtime/.test(s)) throw new Error('gpt-realtime not referenced'); console.log('OK')"</automated>
  </verify>
  <done>
`REALTIME_MODELS` includes `gpt-realtime`; lockdown builds default the realtime
model to `gpt-realtime`; default build keeps `gpt-4o-mini-transcribe`.
  </done>
</task>

</tasks>

<verification>
- `npm run test:build-config` passes (new lockdown streaming cases).
- `npm run typecheck` passes.
- `npm run verify:provider-lockdown` passes — deepgram/assemblyai streaming
  literals absent from the lockdown bundle, present in the default bundle.
- `npm run verify:realtime-routing` passes — derivation + no-leak gates intact.
</verification>

<success_criteria>
Lockdown build: streaming enabled, catalog has one entry (our-server realtime),
realtime model defaults to `gpt-realtime`. Default build byte-identical for
streaming.
</success_criteria>

<output>
Atomic commit per task. Commit messages:
- `feat(build-config): lockdown implies streaming enabled`
- `feat(streaming): lockdown catalog with only our-server realtime`
- `feat(realtime): default to gpt-realtime under lockdown`
</output>
