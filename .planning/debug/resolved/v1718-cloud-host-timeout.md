---
slug: v1718-cloud-host-timeout
status: resolved
trigger: "After auto-update, the corporate build cannot reach any cloud endpoint — every cloud request times out (net::ERR_TIMED_OUT). User: backend host is an internal corporate address entered at startup; no build-time backend should be needed."
created: 2026-06-04
updated: 2026-06-04
diagnose_only: true
---

# Debug: v1.7.18 corporate build — all cloud requests net::ERR_TIMED_OUT after update

## Symptoms

DATA_START
- **Expected:** After updating, the corporate build keeps using the internal
  corporate Server URL (entered at startup via the v1.8.0 runtime-host
  onboarding) for ALL cloud features — STT config, transcription, usage,
  agent/reason, realtime meeting transcription.
- **Actual:** Every cloud request fails with `net::ERR_TIMED_OUT`. Local
  features (hotkeys, recording, onnx embeddings, qdrant) work. Cloud
  transcription → "All chunks failed to transcribe". Agent stream, usage,
  STT config, OpenAI Realtime meeting transcription all time out.
- **Errors (from debug log):** lines 116 (STT config fetch), 275/360/502/520/605/627/681/712/737 (Cloud usage fetch), 365/379/466/491 (OpenAI Realtime WS), 376/488/499 (Meeting transcription start), 584 (onnx worker giving up — separate, local), 593 (Cloud transcription error), 596 (Pipeline failed), 632 (Cloud agent stream error), 723 (Cloud audio file transcription "All chunks failed"). All cloud ones: `net::ERR_TIMED_OUT`.
- **Timeline:** Started after auto-update. User said updated "to the latest (v1.7.18)".
- **Reproduction:** Launch the corporate build; any cloud action times out.
DATA_END

## Key facts / anomalies (orchestrator pre-investigation)

1. **VERSION MISMATCH:** The installed app at /Applications/OpenWhispr.app
   reports CFBundleShortVersionString = **1.7.16**, NOT 1.7.18. Either the
   auto-update did not actually install (cf. known bug autoupdate_install_crash
   — all of 1.7.x failed quitAndInstall via a synthetic before-quit
   TypeError, fixed in v1.7.15) OR the user is on a different machine. MUST
   confirm the ACTUAL running version via CDP / Info.plist on the affected
   machine before drawing conclusions. If the corporate user is actually on
   1.7.16 (or earlier 1.7.x), the "after update" framing may be misleading.

2. **USER-DIR MISMATCH:** The provided log path is under
   `/Users/ngyambroskin/Library/Application Support/open-whispr` but the app
   running on THIS machine uses `/Users/nick/Library/Application Support/
   open-whispr`. The log is likely from the CORPORATE machine (user
   ngyambroskin), not this dev box. So local CDP on THIS machine reproduces
   the dev environment, not necessarily the corporate one. Capture what we can
   here (does serverUrl persist? do data-plane requests honor it?) but flag
   that the definitive repro is the corporate machine.

3. **Build-config defaults:** AUTH_URL=https://auth.openwhispr.com,
   BACKEND pattern https://api.openwhispr.com/* (BACKEND_URL empty → default).
   Both upstream defaults answer 404 from public internet (reachable). The
   corporate internal host is NOT these.

## Current Focus

hypothesis: "CONFIRMED (refined). The runtime serverUrl override DOES reach
the HTTP data plane via backendUrlState.getBackendUrl() — BUT only after the
renderer pushes the value over the `settings:server-url-changed` IPC. That push
fires ONLY from auth.ts's useSettingsStore CHANGE-subscription, which never
observes the localStorage-hydrated serverUrl loaded synchronously at store
construction. On a COLD launch the push never happens → backendUrlState stays
null → getApiUrl() falls back to the build-time OPENWHISPR_BACKEND_URL default
(public api.openwhispr.com / cloud) → every /api/* request times out from
inside the corporate network. Auth WORKS because auth.ts resolveBaseURL()
reads the live store value, not the IPC-pushed main-process state."

test: "Source-trace each failing request's base-URL resolver."

expecting: "Split-brain: auth (renderer, live store read) honors corporate host;
data plane (main process, IPC-pushed override that is never pushed on cold start)
falls back to build-time public default."

next_action: "Report. DIAGNOSE-ONLY."

## Evidence

- timestamp: 2026-06-04 — Installed app Info.plist version = 1.7.16 (NOT 1.7.18 as user believed). [orchestrator]
- timestamp: 2026-06-04 — Log userDataPath = /Users/ngyambroskin/... (corporate machine), this dev box = /Users/nick/... [orchestrator]
- timestamp: 2026-06-04 — All cloud request types fail net::ERR_TIMED_OUT; local features OK. [debug log]
- timestamp: 2026-06-04 — Public defaults api/auth.openwhispr.com return 404 (reachable from public net); yambr.com 307/200. [orchestrator curl]
- timestamp: 2026-06-04 — **DATA PLANE HOST = backendUrlState.getBackendUrl().** All HTTP /api/* handlers in ipcHandlers.js read `getApiUrl() => backendUrlState.getBackendUrl()` (STT config 6144/6150, usage 5954/5962, streaming-usage 5911, transcribe 3516, reason 5697, realtime-token 4145/4229). backendUrlState.getBackendUrl() = `runtimeBackendUrl ?? BuildConfig.OPENWHISPR_BACKEND_URL ?? ""` (backendUrlState.js:53-55). So the data plane IS runtime-overridable — IF runtimeBackendUrl is set. [source-trace]
- timestamp: 2026-06-04 — **COLD-START PUSH GAP (primary root cause).** `runtimeBackendUrl` is in-memory main-process state set ONLY by the `settings:server-url-changed` IPC (backendUrlState.js:62-65). The ONLY caller of `notifyServerUrlChanged` (preload.js:820 → that IPC) is auth.ts:73, inside `useSettingsStore.subscribe((state,prev)=>{ if state.serverUrl !== prev.serverUrl ... })` (auth.ts:68-91). The store hydrates serverUrl SYNCHRONOUSLY from localStorage at construction (settingsStore.ts:714-717), so by the time the subscriber is registered the value is already present and NO change event ever fires for it. `initializeSettings()` (settingsStore.ts:1675+) hydrates secrets/hotkeys but NEVER pushes serverUrl to main. Net effect on a cold launch: main-process `runtimeBackendUrl = null` → `getApiUrl()` returns build-time `OPENWHISPR_BACKEND_URL` (public default) → all data-plane requests hit the public host the corporate network blocks → net::ERR_TIMED_OUT. [source-trace]
- timestamp: 2026-06-04 — **AUTH WORKS, DATA PLANE DOESN'T (split-brain confirmed).** auth.ts `resolveBaseURL()` (auth.ts:33-38) reads `useSettingsStore.getState().serverUrl` LIVE on every authClient access — so auth/sign-in hits the corporate host correctly even with no IPC push. The data plane lives in the MAIN process behind the IPC-pushed `backendUrlState`, which never gets the value on cold start. This is exactly why the user sees auth succeed but every cloud feature time out. [source-trace]
- timestamp: 2026-06-04 — **REALTIME WSS IS BUILD-TIME-PINNED (second, independent host defect).** src/helpers/openaiRealtimeStreaming.js:3 imports `OPENWHISPR_REALTIME_WSS_URL` from build-config.generated.cjs and uses it directly as the WSS endpoint (lines 59-69) with NO backendUrlState / serverUrl override path. That value is FROZEN at build time — derived from OPENWHISPR_BACKEND_URL by scripts/generate-build-config.js:170-179 (`deriveRealtimeWssUrl`) at prebuild, or set explicitly. The runtime corporate serverUrl the user typed at startup can NEVER repoint realtime. The realtime TOKEN mint (`/api/openai-realtime-token`, ipcHandlers.js:4229 via postServerToken→getApiUrl) honors the runtime host, but the WSS socket itself does not. So even if the cold-start push gap were fixed, realtime meeting transcription would still time out unless the corporate build was built with OPENWHISPR_BACKEND_URL/OPENWHISPR_REALTIME_WSS_URL already pointing at the corp host. [source-trace]
- timestamp: 2026-06-04 — **CLOUD TRANSCRIPTION (BYOK path) ALSO IGNORES serverUrl (third host defect, conditional).** audioManager.getTranscriptionEndpoint() (audioManager.js:1767-1818) resolves `base` from `transcriptionMode === "self-hosted" && remoteTranscriptionUrl` OR from provider→`API_ENDPOINTS.TRANSCRIPTION_BASE` (constants.ts:63-80, default https://api.openai.com/v1). It reads NEITHER serverUrl NOR backendUrlState. Under PROVIDER_LOCKDOWN (corporate-minimal default) transcription is supposed to go through the backend `/api/transcribe` (ipcHandlers.js:3516, which DOES use getApiUrl) — but if any path falls through to this renderer-side BYOK resolver it hits the public default and times out. Distinct resolver from the /api/* one; flag both. [source-trace]
- timestamp: 2026-06-04 — **ONNX WORKER PACKAGING BUG (separate, local, UPSTREAM).** onnxWorkerClient.js:11 resolves `WORKER_SCRIPT = path.join(__dirname, "..", "workers", "onnxWorker.js")` = src/workers/onnxWorker.js, loaded via utilityProcess.fork (reads file from disk by path, NOT via require graph → asar static-require tracing does not include it). electron-builder.json `files` lists src/helpers, src/config, src/hooks, etc. but NOT `src/workers/**/*` (verified: no "workers" entry). So onnxWorker.js is absent from the packaged .app → worker fork fails → "onnx worker giving up" (log 584), embeddings/vector index dead. CONFIRMED UPSTREAM: onnxWorkerClient.js authored by Gabriel Stein (upstream, commit 1d7fe1e8, PR #693); `upstream/main:electron-builder.json` also omits `src/workers`. Genuine upstream packaging bug. UNRELATED to the network issue. [source-trace + git blame + upstream diff]
- timestamp: 2026-06-04 — **VERSION ANOMALY unresolved but non-load-bearing.** Installed /Applications Info.plist = 1.7.16 on THIS dev box; affected machine is /Users/ngyambroskin (corporate, not reachable here). Could not confirm the corporate machine's actual running version. The cold-start push gap and the realtime-WSS pin exist in ALL of v1.8.0 / v1.7.16–1.7.18 (the runtime-host feature shipped in v1.8.0 line and #8 fix v1.7.17 touched only auth/OIDC desktop-signin, not the data plane), so the root causes hold regardless of which exact 1.7.x the corporate user runs. "After update" is likely incidental — the corporate deployment never had a working data-plane host because the cold-start push was never wired. [analysis]

## External diagnosis (from owner / peer Claude — TREAT AS HYPOTHESIS, verify against source)

DATA_START
Owner relayed a second Claude's diagnosis of the SAME log. Two independent
client defects (both CLIENT, not server):

1. **Local features:** `onnxWorker.js` is NOT packaged into the .app → ONNX
   worker crashes → vector index / embeddings dead. Claimed to be an UPSTREAM
   desktop packaging bug. (Matches log line 584 "onnx worker giving up" +
   "worker unavailable" upserts.) Separate from the network issue.

2. **Network:** All cloud calls → net::ERR_TIMED_OUT. The client is in CLOUD
   mode — it hits the PUBLIC OpenWhispr-cloud / OpenAI directly
   (gpt-4o-mini-transcribe realtime WSS, cloud STT/transcribe/usage), but from
   inside the corporate network there is NO egress to the public internet.
   The corporate server is on a PRIVATE address **10.177.236.0** (corp
   network / VPN only) which the client is NOT using for the data plane.
   Owner ties this to bug #8 (desktop ignores self-hosted host).
DATA_END

**Verification result (peer diagnosis vs source):**
- Peer claim #1 (onnxWorker.js not packaged, upstream): **CONFIRMED** by
  electron-builder.json `files` (no src/workers) + git blame (upstream) +
  upstream/main diff. Accurate.
- Peer claim #2 (data plane hits public, ignores corporate host): **CONFIRMED
  but more precise than stated.** It is NOT simply "the client is in cloud mode
  and hits public by design." The data plane (HTTP /api/*) is DESIGNED to honor
  the runtime corporate serverUrl via backendUrlState — the defect is that the
  renderer NEVER PUSHES the persisted serverUrl to the main process on cold
  start (auth.ts change-subscription misses the synchronously-hydrated value).
  Auth works (live store read); data plane falls back to the build-time public
  default. PLUS two narrower always-public resolvers: realtime WSS
  (build-time-pinned) and the BYOK transcription endpoint
  (getTranscriptionEndpoint, never reads serverUrl). #8's v1.7.17 fix covered
  ONLY auth/OIDC desktop-signin — it did not touch any of these data-plane
  resolvers.

## Eliminated

- **"Auth host is broken / serverUrl not persisted":** ELIMINATED. serverUrl
  persists in localStorage (settingsStore.ts:714-725) and auth.ts
  resolveBaseURL() reads it live (auth.ts:33-38). Auth correctly targets the
  corporate host. The failure is data-plane-only.
- **"Data plane has no runtime-override mechanism at all":** ELIMINATED. The
  HTTP /api/* data plane DOES route through backendUrlState (runtime-
  overridable). The mechanism exists; the cold-start PUSH that populates it is
  missing.
- **"#8 (v1.7.17) regressed the data plane":** ELIMINATED. #8 touched only
  auth/OIDC desktop-signin host (resolveBaseURL for sign-in). It neither fixed
  nor broke the data-plane cold-start push, which was never wired in the
  v1.8.0 runtime-host feature in the first place.
- **"onnx packaging and the network timeout are the same defect":** ELIMINATED.
  Distinct root causes — onnx is a local utilityProcess file-packaging bug
  (upstream), network is the host-resolution cold-start gap (fork v1.8.0).

## ROOT CAUSE FOUND

Multiple distinct root causes (this is not a single bug):

### RC-1 (PRIMARY — fork, v1.8.0 runtime-host feature): cold-start serverUrl push gap

The v1.8.0 runtime-host feature splits host resolution into two universes:
- **Renderer/auth** reads serverUrl LIVE from the zustand store
  (`auth.ts resolveBaseURL()`), so auth always hits the corporate host. ✅
- **Main-process data plane** (every `/api/*` handler in ipcHandlers.js via
  `getApiUrl() => backendUrlState.getBackendUrl()`) reads an in-memory
  `runtimeBackendUrl` that is populated ONLY by the
  `settings:server-url-changed` IPC. ❌

That IPC is fired ONLY by `auth.ts`'s `useSettingsStore.subscribe` CHANGE
handler (fires on `state.serverUrl !== prev.serverUrl`). But `serverUrl` is
hydrated SYNCHRONOUSLY from localStorage at store construction
(`settingsStore.ts:714-717`), before the subscriber exists — so no change
event ever fires for the persisted value, and `initializeSettings()` never
pushes it either. On every cold launch `runtimeBackendUrl` stays `null` and
`getBackendUrl()` falls back to the build-time `OPENWHISPR_BACKEND_URL`
default (public api.openwhispr.com / cloud). Inside the corporate network
(private 10.177.236.0, no public egress) that public host is unreachable →
ALL data-plane requests (STT config, usage, transcribe, reason/agent) time
out. Auth succeeds, every cloud feature fails — exactly the reported symptom.

Precise gap location: the missing wire is a one-shot startup push of the
hydrated serverUrl from renderer → `backendUrlState` (e.g. in
`initializeSettings()` or a post-hydration effect), OR backendUrlState must
read the persisted value itself. Owner decides between (a) server adapts (n/a
here — this is purely a client host-routing gap), (b) build the corporate
binary with OPENWHISPR_BACKEND_URL baked to the corp host (build-time gate,
sidesteps the runtime push entirely), or (c) owner-sanctioned additive client
fix to push the hydrated serverUrl on startup (mirrors the #8/requestKind
precedents — additive, fork-owned, no upstream-parity cost since
backendUrlState + the IPC are already fork-only v1.8.0 code).

### RC-2 (SECONDARY — fork, Phase 05): realtime WSS host build-time-pinned

`openaiRealtimeStreaming.js` connects to `OPENWHISPR_REALTIME_WSS_URL` — a
build-time constant derived from OPENWHISPR_BACKEND_URL at prebuild
(generate-build-config.js `deriveRealtimeWssUrl`) — with NO runtime serverUrl
override. The realtime token mint honors the runtime host, but the WSS socket
does not. Even with RC-1 fixed, OpenAI Realtime meeting transcription cannot
follow a runtime corporate serverUrl; it requires the corporate build to bake
OPENWHISPR_BACKEND_URL (or OPENWHISPR_REALTIME_WSS_URL) at build time. This is
"realtime-always-build-time-host by design" — characterize for the owner:
either the corporate build MUST set OPENWHISPR_BACKEND_URL at build time, or
realtime must be taught a runtime override (additive fork change).

### RC-3 (CONDITIONAL — upstream-shaped renderer resolver): BYOK transcription endpoint ignores serverUrl

`audioManager.getTranscriptionEndpoint()` resolves the STT endpoint from
transcriptionMode/provider → `API_ENDPOINTS.TRANSCRIPTION_BASE` (public
default) and reads NEITHER serverUrl NOR backendUrlState. Under
PROVIDER_LOCKDOWN transcription should ride the backend `/api/transcribe`
(which DOES honor getApiUrl), so this resolver may be inert in the corporate
build — but if any fallthrough reaches it, it hits the public default and
times out. Flag as a latent host-routing gap distinct from RC-1.

### RC-4 (SEPARATE, LOCAL — UPSTREAM packaging bug): onnxWorker.js missing from .app

`onnxWorkerClient.js` forks `src/workers/onnxWorker.js` via
`utilityProcess.fork` (loads by filesystem path), but `electron-builder.json`
`files` does not include `src/workers/**/*` (verified absent; upstream
electron-builder.json also omits it). The worker script is not in the packaged
app → fork fails → "onnx worker giving up" (log 584), local embeddings/vector
index dead. CONFIRMED UPSTREAM (Gabriel Stein, commit 1d7fe1e8 / PR #693).
Per CLAUDE.md this is upstream code — file as an upstream packaging finding;
the FIX (adding `src/workers/**/*` to the fork's `files`, or asarUnpack) is a
fork-owned electron-builder.json change (build config, not client source
drift) the owner can make safely. Distinct from the network issue.

specialist_hint: none (electron / host-routing / build-config — no language
specialist maps cleanly; this is an Electron main/renderer IPC + electron-builder
packaging investigation)

## RECOMMENDED FIX APPROACHES (4× gsd-advisor-researcher, 2026-06-04)

### RC-1 → Option 1: one-shot startup push (RECOMMENDED, decisive)
In `settingsStore.ts initializeSettings()` (runs once via hasInitialized guard,
inside useSettings.ts:92 useEffect), if `serverUrl` is set, explicitly call the
existing `electronAPI.notifyServerUrlChanged(serverUrl)` path once on startup.
Reuses the validated `settings:server-url-changed` IPC (sanitizeUrl guard) to
set main-process `runtimeBackendUrl` BEFORE any /api/* handler resolves
getApiUrl(). Deliberately bypasses the auth.ts subscribe/reload path → no
spurious window.location.reload (auth.ts:88). Idempotent, node-testable
(assert notifyServerUrlChanged mock called with persisted serverUrl). ALL lines
fork-only (git blame ec92c536/ce2893aa/dfd2e866) → zero upstream-parity cost.
BIGGEST RISK: ordering — initializeSettings is post-render (useEffect), but
every /api/* request is renderer-initiated over IPC (incl. the early STT-config
fetch), so none can fire before this effect runs. VERIFY no main-process-
initiated /api/* egress exists before shipping (if any, Option 2 main-side read
would be needed). Rejected alternatives: #2 (main reads localStorage — renderer-
only, needs new SoT), #3 (fire subscribe on register — entangles with reload
machinery, reload-loop risk), #4 (main queries renderer — new bidirectional IPC).

### RC-2 → Option 4: runtime-derive WSS + graceful gate + build fallback (RECOMMENDED)
`OpenAIRealtimeStreaming` is instantiated in MAIN (ipcHandlers.js:4317) next to
backendUrlState. Resolve the WSS URL at the call site: run deriveRealtimeWssUrl
against backendUrlState.getBackendUrl(), fall back to build-time
OPENWHISPR_REALTIME_WSS_URL only when no runtime override, pass via existing
connectOpts spread (line ~4323) — keep the class a dumb transport (do NOT make
it import build-config). Kills the split-brain (token+socket both → corp host).
PLUS graceful gate (mirror STREAMING_ENABLED block ipcHandlers.js:6587): when
realtime unavailable for the resolved host, fail fast + hide feature instead of
15s hang. All fork-only (Phase 05). LOAD-BEARING RISK (biggest of all 4 RCs):
repointing wss://corp.internal/v1/realtime only closes the timeout IF the corp
backend actually runs an OpenAI-Realtime-compatible WSS proxy there (Speaches+
LiteLLM per Phase 05 D-04). If not, Option 1 alone just MOVES the timeout to the
corp host — that's why the gate must ship alongside. → file SERVER-REQUIREMENTS:
expected contract `<backend>/v1/realtime` OpenAI-Realtime-compatible WSS + a
capability signal the client can feature-detect (so the gate is data-driven, not
a hardcoded flag). NOT knowable from the client; do not fake a repoint.

### RC-3 → Option 3: build-time lockdown gate (RECOMMENDED) — REACHABLE, not latent
VERDICT CORRECTED: RC-3 IS reachable in the corporate build (not inert).
OnboardingFlow.tsx:318-320 & :541-542 write `cloudTranscriptionMode: "byok"` for
ANY non-signed-in cloud-mode user with NO lockdown guard (upstream ece9a861).
Nothing reconciles it (settingsStore seeds only cloudBackupEnabled, line 277).
Persisted byok survives → router (audioManager.js:544) sets
isOpenWhisprCloudMode=false → else branch (573-575) → processWithOpenAIAPI →
getTranscriptionEndpoint() → API_ENDPOINTS.TRANSCRIPTION_BASE
(https://api.openai.com/v1); fetch fires even with no key → public-host leak/
timeout. CRITICAL: getTranscriptionEndpoint() body + router else branch are ALL
upstream-verbatim (blame 6abd436c/94cf4670/3d538b0e) → IMMUTABLE per
client_immutable. So Options 1 & 2 (edit the resolver / wire remoteTranscriptionUrl)
are OUT OF BOUNDS. Correct fix = build-time gate: under PROVIDER_LOCKDOWN never
let cloudTranscriptionMode become byok — cut the unguarded OnboardingFlow writes
under lockdown + add seedLockdownTranscriptionMode reconciler in settingsStore
(mirror seedLockdownCloudBackupDefault:277) pinning a stray byok→openwhispr on
startup so already-onboarded corp users self-heal. Keeps isOpenWhisprCloudMode
true → all transcription rides /api/transcribe (covered by RC-1). Upstream BYOK
resolver simply never reached; stays correct+latent for the default build where
BYOK is legit. Same DCE/build-gate mechanism the fork already used 3× on this
surface (FIX1/2/3).

### RC-4 → Option A: add `src/workers/**/*` to electron-builder.json `files` (RECOMMENDED)
Fork-owned config change, NOT upstream source edit → does not violate
client_immutable (do NOT edit onnxWorkerClient.js/onnxWorker.js). Script ships
at app.asar/src/workers/onnxWorker.js — the exact path onnxWorkerClient.js:11
computes. utilityProcess.fork (Electron's own primitive, asar-aware fs — UNLIKE
legacy child_process.fork) loads the entry from inside asar. The only native dep
(onnxruntime-node) is ALREADY in asarUnpack (line 91) so its .node binaries load
fine; the worker reads no sibling files from __dirname (models via runtime
modelPath → ~/.cache/extraResources) so the script needs no unpacking. Signing
unaffected (asar signed wholesale, afterPack only signs loose Mach-O). FALLBACK
Option B (also add to asarUnpack) ONLY if a packed+signed smoke test shows the
fork ENOENTs on the asar path. MANDATORY VERIFY before tagging (live-verification
rule): `npm run pack`, launch packed .app, confirm log shows "onnx worker
spawned {pid}" + "worker initialized", run semantic search end-to-end — NOT just
green tests. onnxWorker.js is the ONLY utilityProcess.fork/worker_threads target
(all other sidecars use child_process.spawn of extraResources bin/ binaries), so
no other instances of this bug. UPSTREAM: genuine upstream bug
(upstream/main:electron-builder.json also omits src/workers; onnxWorkerClient.js
= upstream PR #693) → fork-patch now, file/PR upstream so the delta isn't
re-applied every merge.

## SERVER-REQUIREMENTS implied (RC-2)
The corp backend MUST expose an OpenAI-Realtime-compatible WSS proxy at
`<backend>/v1/realtime` (or equivalent) for self-hosted meeting transcription to
work, PLUS a capability signal (e.g. in /api/stt-config or /api/auth/providers)
the client can feature-detect so the RC-2 gate is data-driven. If absent,
realtime stays gated OFF for self-hosted — not a client bug. → write to
.planning/phases/<N>/SERVER-REQUIREMENTS.md before/with the RC-2 implementation.

## OWNER DECISIONS (2026-06-04)
- **RC-2 server capability CONFIRMED by owner:** "сервер же наш, всё там есть" —
  the corp backend (10.177.236.0) DOES run the OpenAI-Realtime-compatible WSS
  proxy. So RC-2 = pure client-side runtime-derive of the WSS host from
  backendUrlState (Option 1 core). The graceful gate stays as DEFENSIVE
  degradation only (if a future host lacks it), NOT as "disable realtime for
  self-hosted." No SERVER-REQUIREMENTS blocker — the server already serves it.
- **Scope:** fix ALL FOUR RCs now → ship v1.7.19 (fork next plain patch).
- Status: moving from diagnose-only to IMPLEMENTATION.
