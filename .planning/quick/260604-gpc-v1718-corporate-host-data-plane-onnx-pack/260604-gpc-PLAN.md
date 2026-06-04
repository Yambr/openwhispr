---
phase: quick-260604-gpc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/stores/settingsStore.ts
  - src/helpers/openaiRealtimeStreaming.js
  - src/helpers/ipcHandlers.js
  - src/components/OnboardingFlow.tsx
  - electron-builder.json
  - src/stores/__tests__/host-coldstart-push.test.ts
  - src/stores/__tests__/lockdown-transcription-mode.test.ts
  - test/helpers/openaiRealtimeStreaming.test.js
autonomous: true
requirements: [RC-1, RC-2, RC-3, RC-4]

must_haves:
  truths:
    - "On cold launch with a persisted corporate serverUrl, the main-process data plane (every /api/* handler) resolves that corporate host BEFORE the first request fires — no fallback to the build-time public default."
    - "The RC-1 startup push uses a direct IPC call (notifyServerUrlChanged) and does NOT trigger the auth.ts subscribe path's window.location.reload."
    - "OpenAI Realtime (meeting + dictation) WSS socket connects to a host derived at runtime from backendUrlState.getBackendUrl(), not the build-time-frozen OPENWHISPR_REALTIME_WSS_URL, when a runtime override is present."
    - "Under PROVIDER_LOCKDOWN_ENABLED, cloudTranscriptionMode can never become 'byok': OnboardingFlow never writes it, and a stray persisted 'byok' self-heals to 'openwhispr' on startup."
    - "In the non-lockdown default build, BYOK behavior is fully preserved (cloudTranscriptionMode:'byok' still written + honored)."
    - "onnxWorker.js ships inside the packaged app at app.asar/src/workers/onnxWorker.js so the utilityProcess.fork in onnxWorkerClient.js resolves it."
  artifacts:
    - path: "src/stores/settingsStore.ts"
      provides: "RC-1 one-shot serverUrl push in initializeSettings + RC-3 seedLockdownTranscriptionMode reconciler"
      contains: "notifyServerUrlChanged"
    - path: "src/helpers/openaiRealtimeStreaming.js"
      provides: "RC-2 runtime WSS host via options.wssUrl, build-time fallback, empty-host fail-fast"
      contains: "wssUrl"
    - path: "src/helpers/ipcHandlers.js"
      provides: "RC-2 deriveRealtimeWssUrl(backendUrlState.getBackendUrl()) resolution at both realtime connect sites"
      contains: "deriveRealtimeWssUrl"
    - path: "src/components/OnboardingFlow.tsx"
      provides: "RC-3 lockdown-gated byok writes"
      contains: "PROVIDER_LOCKDOWN_ENABLED"
    - path: "electron-builder.json"
      provides: "RC-4 src/workers glob in files array"
      contains: "src/workers/**/*"
  key_links:
    - from: "src/stores/settingsStore.ts:initializeSettings"
      to: "preload.js notifyServerUrlChanged -> settings:server-url-changed IPC -> backendUrlState.setBackendUrl"
      via: "window.electronAPI.notifyServerUrlChanged(state.serverUrl)"
      pattern: "notifyServerUrlChanged\\("
    - from: "src/helpers/ipcHandlers.js realtime connect sites"
      to: "openaiRealtimeStreaming.connect options.wssUrl"
      via: "deriveRealtimeWssUrl(backendUrlState.getBackendUrl())"
      pattern: "deriveRealtimeWssUrl\\("
    - from: "src/components/OnboardingFlow.tsx + settingsStore.seedLockdownTranscriptionMode"
      to: "cloudTranscriptionMode stays 'openwhispr' under lockdown -> /api/transcribe (RC-1 covered)"
      via: "PROVIDER_LOCKDOWN_ENABLED gate"
      pattern: "PROVIDER_LOCKDOWN_ENABLED"
---

<objective>
Fix the four root causes from `.planning/debug/v1718-cloud-host-timeout.md` so a corporate self-hosted build reaches its internal backend after update, and so the ONNX worker is packaged. All four ship together in v1.7.19 on the current branch.

- **RC-1 (PRIMARY, fork-only):** cold-start serverUrl push gap — the main-process data plane never learns the persisted corporate host on startup, so all /api/* requests fall back to the public default and time out.
- **RC-2 (fork-only, Phase 05):** realtime WSS host is build-time-pinned — repoint it to the runtime backend host.
- **RC-3 (fork build-gate):** under lockdown a stray `cloudTranscriptionMode:"byok"` routes transcription to the public BYOK endpoint — prevent it ever being set and self-heal stragglers.
- **RC-4 (fork config):** `onnxWorker.js` is missing from the packaged app — add the glob.

Purpose: Restore the entire cloud data plane for corporate self-hosted builds and restore local embeddings.
Output: Patched settingsStore, auth (none), realtime transport + call sites, OnboardingFlow, electron-builder.json, plus regression tests.

The four advisor-recommended approaches are LOCKED. Do NOT re-explore or substitute approaches.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/debug/v1718-cloud-host-timeout.md
@./CLAUDE.md
@.planning/STATE.md

<do_not_touch>
These are UPSTREAM-IMMUTABLE per CLAUDE.md client_immutable. Do NOT plan or make any edit here — not even a one-line rename:
- src/helpers/audioManager.js — getTranscriptionEndpoint() (~1767) and the router else-branch (~544/573-575). RC-3 is fixed by NOT reaching this code, never by editing it.
- src/workers/onnxWorker.js — upstream worker entry (PR #693). RC-4 is a packaging-config fix only.
- src/helpers/onnxWorkerClient.js — upstream fork harness. Do not touch.
Do NOT edit package.json version (release tagging handles v1.7.19).
</do_not_touch>

<interfaces>
<!-- Contracts the executor needs. Extracted from codebase. Use directly — no exploration. -->

RC-1 — settingsStore.ts:
  - `serverUrl` is hydrated SYNCHRONOUSLY from localStorage at store construction (settingsStore.ts:714-717), so it is already present on `useSettingsStore.getState()` when `initializeSettings()` runs (line 1681: `const state = useSettingsStore.getState();`).
  - `initializeSettings()` (1675) is guarded by `hasInitialized` (1673/1676-1677) → runs exactly once, post-hydration, inside `window.electronAPI` block (1683).
  - preload.js:820 exposes: `notifyServerUrlChanged: (url) => ipcRenderer.send("settings:server-url-changed", url || null)`.
  - backendUrlState.js:62-65 handles that IPC → `setBackendUrl(url)` → sanitizeUrl → sets `runtimeBackendUrl` + `runtimeAuthUrl`. Validated (https/http only, origin-only, 2048 cap).
  - auth.ts:68-91 subscribe handler is the path to AVOID — it calls `window.location.reload()` (auth.ts:88) on serverUrl CHANGE. A direct `electronAPI.notifyServerUrlChanged(...)` from initializeSettings bypasses this subscription entirely (no store mutation → no change event → no reload).

RC-2 — realtime host:
  - generate-build-config.js exports `deriveRealtimeWssUrl(backendUrl)` (lines 170-183, module.exports at 741-742). It self-runs ONLY under `require.main === module` (754-756), so `require("../../scripts/generate-build-config")` from main-process code is side-effect-free.
    deriveRealtimeWssUrl: https→wss, http→ws, strips trailing slash, appends `/v1/realtime`, preserves search, "" on malformed/empty.
  - openaiRealtimeStreaming.js:3 imports `OPENWHISPR_REALTIME_WSS_URL` (build-time). connect(options) builds the URL at lines 59-69 (empty-guard 59-66, separator + intent suffix 67-69). Class is a dumb transport — must NOT import build-config beyond the existing constant; the runtime host comes IN via options.
  - ipcHandlers.js has TWO realtime connect sites that BOTH need the runtime host:
      * MEETING: `connectRealtimeStreaming` — connectOpts built at 4291-4295, spread into connect at 4323 (`this[ref].connect({ apiKey, token, ...connectOpts })`).
      * DICTATION: `connectInner` — direct connect at 5124-5131.
  - ipcHandlers.js already requires backendUrlState at 3386 (inside the same setup scope) and `BuildConfig` at module top (line 7). `OpenAIRealtimeStreaming = require("./openaiRealtimeStreaming")` at line 15.

RC-3 — lockdown byok:
  - settingsStore.ts:746 default is already "openwhispr" (`cloudTranscriptionMode: readString("cloudTranscriptionMode", "openwhispr")`). The leak is OnboardingFlow WRITING "byok" + nothing reconciling a persisted stray.
  - Mirror target: `seedLockdownCloudBackupDefault()` (settingsStore.ts:277-285) — guards `isBrowser` + `PROVIDER_LOCKDOWN_ENABLED`, reads/writes localStorage, invoked immediately after definition (285). `PROVIDER_LOCKDOWN_ENABLED` imported at settingsStore.ts:3 from "../config/defaults".
  - OnboardingFlow.tsx byok writes: line 319 (`if (!isSignedIn && !useLocalWhisper) updateTranscriptionSettings({ cloudTranscriptionMode: "byok" })`) and line 542 (`...(!isLocal && !isSignedIn ? { cloudTranscriptionMode: "byok" } : {})`). OnboardingFlow does NOT yet import PROVIDER_LOCKDOWN_ENABLED.

RC-4 — packaging:
  - electron-builder.json `files` array (lines 14-87) lists src/helpers, src/config, src/constants, src/locales, src/hooks, src/models, src/types — but NOT src/workers. onnxWorkerClient.js:11 forks `path.join(__dirname, "..", "workers", "onnxWorker.js")`. onnxruntime-node already in asarUnpack (line 91).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RC-1 — push persisted serverUrl to main process on cold start (+ pre-flight egress grep)</name>
  <files>src/stores/settingsStore.ts, src/stores/__tests__/host-coldstart-push.test.ts</files>
  <behavior>
    - initializeSettings with a persisted serverUrl ("https://corp.internal") → window.electronAPI.notifyServerUrlChanged called exactly ONCE with that value.
    - initializeSettings with serverUrl null/empty → notifyServerUrlChanged NOT called.
    - The push is a direct electronAPI call; it does NOT mutate the store's serverUrl, so the auth.ts subscribe handler (reload path) is never engaged.
  </behavior>
  <action>
    PRE-FLIGHT (do FIRST, record result in SUMMARY): run `grep -nE "getApiUrl|getBackendUrl|net\.fetch|fetch\(.*api/" main.js` and inspect every hit for any main-process-initiated /api/* egress that fires at app-ready BEFORE the renderer's initializeSettings push. Diagnosis already identified main.js:539 `exchangeSignedTokenForRawBearer` — confirm it fires only on the OAuth deep-link sign-in callback (user-initiated, post-startup) and reads resolveAuthUrl()→backendUrlState, so Option 1 covers it. If you find ANY unconditional app-ready /api/* fetch that runs before the renderer mounts, STOP and FLAG it in the SUMMARY (Option 1 alone would not cover it — would need a main-side read).

    Then, in src/stores/settingsStore.ts initializeSettings() (inside the `if (window.electronAPI)` block, ~line 1683, after `const state = useSettingsStore.getState();` at 1681), add a one-shot push: if `state.serverUrl` is a non-empty string, call `window.electronAPI.notifyServerUrlChanged?.(state.serverUrl)` once. This sets main-process runtimeBackendUrl BEFORE any /api/* handler resolves getApiUrl(). Use optional chaining (some test/preload contexts lack the method). Wrap in try/catch + logger.warn on failure (mirror the surrounding sync blocks). Add a short comment referencing RC-1: this is a DIRECT IPC call that deliberately bypasses the auth.ts subscribe path (auth.ts:68-91) so it does NOT trigger window.location.reload.

    Confirm the touched lines are fork-only via `git blame` (the v1.8.0 runtime-host feature) before editing — they are (initializeSettings host wiring is fork code). Do NOT edit auth.ts.

    Write src/stores/__tests__/host-coldstart-push.test.ts (vitest, TS). The vitest harness is node-only, so `typeof window === "undefined"` and `localStorage` is absent — the store's `isBrowser` guard would short-circuit serverUrl hydration and `initializeSettings` (`if (!isBrowser) return`), making the test a no-op or throwing `localStorage is not defined`. FIRST, BEFORE importing the store module, set up node stubs mirroring test/helpers/authClientProxy.test.js: assign `globalThis.window = { electronAPI: { notifyServerUrlChanged } }` (notifyServerUrlChanged = vi.fn()) and a Map-backed `localStorage` shim (getItem/setItem/removeItem over a `Map`) on `globalThis`. Set the localStorage.serverUrl entry BEFORE constructing the store so synchronous hydration picks it up. Reset the `hasInitialized` guard between cases (re-import module with vi.resetModules — prefer resetModules to avoid touching prod code; re-establish the window + localStorage stubs after each resetModules so the freshly-imported module sees them). Assert: persisted serverUrl → called once with that value; absent → not called.
  </action>
  <verify>
    <automated>npx vitest run src/stores/__tests__/host-coldstart-push.test.ts</automated>
  </verify>
  <done>vitest green; notifyServerUrlChanged called once with persisted serverUrl on init, never when absent; no auth.ts edit; pre-flight egress grep result recorded in SUMMARY.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RC-2 — runtime-derive realtime WSS host at both connect sites</name>
  <files>src/helpers/openaiRealtimeStreaming.js, src/helpers/ipcHandlers.js, test/helpers/openaiRealtimeStreaming.test.js</files>
  <behavior>
    - openaiRealtimeStreaming.connect({ ...opts, wssUrl: "wss://corp.internal/v1/realtime" }) connects to options.wssUrl (overrides the build-time OPENWHISPR_REALTIME_WSS_URL).
    - connect with no wssUrl falls back to the build-time OPENWHISPR_REALTIME_WSS_URL (existing behavior preserved for default build).
    - When the RESOLVED host is empty (no runtime override AND empty build-time constant) connect fails fast with the existing thrown Error — it does NOT hang or fall back to api.openai.com.
  </behavior>
  <action>
    In src/helpers/openaiRealtimeStreaming.js connect(): destructure `wssUrl` from options (add to the line-37 destructure). Compute `const resolvedWssUrl = wssUrl || OPENWHISPR_REALTIME_WSS_URL;` and use `resolvedWssUrl` everywhere the function currently uses OPENWHISPR_REALTIME_WSS_URL (the empty-guard at 59, the separator at 67, the url template at 69). Keep the existing fail-fast Error when `resolvedWssUrl` is empty (do NOT disable realtime for self-hosted; this is defensive only). The class stays a dumb transport — do NOT import generate-build-config or backendUrlState here; the host arrives via options. (The fail-fast Error message is a thrown/logged developer Error, not rendered UI — no i18n needed. If you decide any NEW user-facing string is required, add the key to ALL 10 locales under src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW,...}/translation.json.)

    In src/helpers/ipcHandlers.js: require deriveRealtimeWssUrl once near the existing backendUrlState require (line 3386 scope) — `const { deriveRealtimeWssUrl } = require("../../scripts/generate-build-config");` (safe: self-runs only under require.main===module). Resolve the runtime host at BOTH connect sites:
      (a) MEETING connectRealtimeStreaming (~4291): add `wssUrl: deriveRealtimeWssUrl(backendUrlState.getBackendUrl())` to the connectOpts object (4291-4295) so it spreads into connect at 4323.
      (b) DICTATION connectInner (~5124): pass `wssUrl: deriveRealtimeWssUrl(backendUrlState.getBackendUrl())` in the connect({...}) call.
    deriveRealtimeWssUrl returns "" when getBackendUrl() is empty → openaiRealtimeStreaming falls back to the build-time constant, preserving default-build behavior. Owner confirmed the corp backend serves /v1/realtime → this is a pure repoint (token + socket now both hit the corp host).

    Extend test/helpers/openaiRealtimeStreaming.test.js (existing vitest CJS, already mocks build-config + ws): add cases — (1) connect with options.wssUrl uses that exact host in `new WebSocket(...)`; (2) connect without wssUrl uses the build-time constant; (3) both wssUrl and build-time empty → throws (fail-fast, no WebSocket constructed). For case (3), re-mock OPENWHISPR_REALTIME_WSS_URL to "" by reusing the existing empty-constant mock pattern from test/helpers/openaiRealtimeStreaming.test.js:55 (`loadStreamingWithMockedUrl("")` via the doMock helper at lines 37-46), then connect with no wssUrl so the resolved host is empty.
  </action>
  <verify>
    <automated>npx vitest run test/helpers/openaiRealtimeStreaming.test.js</automated>
  </verify>
  <done>vitest green; options.wssUrl overrides build-time host; absent → build-time fallback; empty resolved host → fail-fast throw; both ipcHandlers connect sites pass deriveRealtimeWssUrl(getBackendUrl()); class still imports no build-config beyond the existing constant.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: RC-3 — kill byok under lockdown (gate OnboardingFlow + self-heal reconciler)</name>
  <files>src/components/OnboardingFlow.tsx, src/stores/settingsStore.ts, src/stores/__tests__/lockdown-transcription-mode.test.ts</files>
  <behavior>
    - seedLockdownTranscriptionMode: persisted cloudTranscriptionMode "byok" + PROVIDER_LOCKDOWN_ENABLED=true → repaired to "openwhispr" on startup.
    - persisted "byok" + lockdown DISABLED → "byok" preserved (default build unaffected).
    - no persisted value → no write (default already "openwhispr").
    - OnboardingFlow: under lockdown the two byok writes (lines 319, 542) are suppressed; non-lockdown they still fire.
  </behavior>
  <action>
    In src/stores/settingsStore.ts, add `seedLockdownTranscriptionMode()` mirroring seedLockdownCloudBackupDefault (277-285): guard `if (!isBrowser) return; if (!PROVIDER_LOCKDOWN_ENABLED) return;` then if `localStorage.getItem("cloudTranscriptionMode") === "byok"` set it to "openwhispr". This repairs already-onboarded corp users who persisted a stray byok. Invoke it immediately after definition (like the existing seed at 285) so it runs at module load, before the store constructor reads cloudTranscriptionMode (746). Add a comment referencing RC-3 and that it keeps isOpenWhisprCloudMode true so transcription rides /api/transcribe (RC-1-covered). PROVIDER_LOCKDOWN_ENABLED is already imported (line 3). Do NOT touch audioManager.

    In src/components/OnboardingFlow.tsx, import `PROVIDER_LOCKDOWN_ENABLED` from "../config/defaults". Gate both byok writes:
      - line 319: `if (!isSignedIn && !useLocalWhisper && !PROVIDER_LOCKDOWN_ENABLED) { updateTranscriptionSettings({ cloudTranscriptionMode: "byok" }); }`
      - line 542: change the spread guard to `...(!isLocal && !isSignedIn && !PROVIDER_LOCKDOWN_ENABLED ? { cloudTranscriptionMode: "byok" } : {})`.
    This prevents a fresh corp onboarding from ever writing byok; the reconciler covers existing installs.

    Write src/stores/__tests__/lockdown-transcription-mode.test.ts (vitest TS). The vitest harness is node-only, so the store's `isBrowser` guard (`typeof window === "undefined"`) short-circuits `seedLockdownTranscriptionMode` (`if (!isBrowser) return`) and `localStorage` is undefined. FIRST, BEFORE importing the store module, set up node stubs mirroring test/helpers/authClientProxy.test.js: assign `globalThis.window = {}` (truthy, so isBrowser passes) and a Map-backed `localStorage` shim (getItem/setItem/removeItem over a `Map`) on `globalThis`, and seed the cloudTranscriptionMode entry per case. Mock PROVIDER_LOCKDOWN_ENABLED true/false via vi.mock("../config/defaults", ...) per case (use vi.resetModules + dynamic import so the module-load seed runs under the mocked flag; re-establish the window + localStorage stubs after each resetModules so the freshly-imported module sees them). Cases: byok+lockdown→openwhispr; byok+no-lockdown→byok preserved; absent+lockdown→no write.
  </action>
  <verify>
    <automated>npx vitest run src/stores/__tests__/lockdown-transcription-mode.test.ts</automated>
  </verify>
  <done>vitest green; lockdown self-heals byok→openwhispr; non-lockdown preserves byok; OnboardingFlow byok writes lockdown-gated; audioManager untouched.</done>
</task>

<task type="auto">
  <name>Task 4: RC-4 — package onnxWorker.js + repo-wide tsc/vitest gate + pack-smoke documentation</name>
  <files>electron-builder.json, src/stores/__tests__/host-coldstart-push.test.ts, src/stores/__tests__/lockdown-transcription-mode.test.ts</files>
  <action>
    In electron-builder.json, add `"src/workers/**/*"` to the `files` array (lines 14-87), alongside the other src/* globs (e.g. after the src/types entry, before the `!` negations). This ships app.asar/src/workers/onnxWorker.js — the exact path onnxWorkerClient.js:11 computes via utilityProcess.fork (asar-aware). onnxruntime-node is already in asarUnpack (line 91), so no asarUnpack change is needed for the worker script itself. Do NOT edit onnxWorker.js or onnxWorkerClient.js.

    Then run the full repo gates so the whole change set is green together:
      - `npx tsc --noEmit` (TS clean — covers settingsStore + OnboardingFlow edits).
      - `npx vitest run` (full suite — confirms no regressions across the 3 new tests + existing 152).

    PACKAGED-BUNDLE VERIFICATION (RC-4 live proof). Attempt a real packed build:
      - `npm run pack` (unsigned: CSC_IDENTITY_AUTO_DISCOVERY=false). Run `npm run download:whisper-cpp` first if the script requires sidecars.
      - Confirm onnxWorker.js is inside the packaged asar: `npx asar list dist/mac*/OpenWhispr.app/Contents/Resources/app.asar | grep src/workers/onnxWorker.js` (adjust dist path per platform). Expect a match.
    If `npm run pack` is INFEASIBLE in this executor environment (no signing tools, sidecar download blocked, timeout): do NOT fake it. Instead (1) assert via `grep -n "src/workers" electron-builder.json` that the glob is present, and (2) record in the SUMMARY that a pack-smoke-test is a REQUIRED PRE-TAG GATE — launch the packed .app, confirm the debug log shows "onnx worker spawned {pid}" + "worker initialized", and run semantic search end-to-end (create a note, search a paraphrase via the agent) BEFORE tagging v1.7.19. This mirrors the live-verification-over-green-tests rule.
  </action>
  <verify>
    <automated>grep -n "src/workers" electron-builder.json && npx tsc --noEmit && npx vitest run</automated>
  </verify>
  <done>"src/workers/**/*" present in electron-builder.json files; tsc clean; full vitest green; either asar list confirms src/workers/onnxWorker.js in the packed build, OR the pre-tag pack-smoke gate is recorded in SUMMARY with the exact log strings + semantic-search check to run.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer → main (settings:server-url-changed IPC) | RC-1 reuses an existing channel; the renderer pushes a persisted serverUrl string to main. |
| main → corporate backend (/api/* + /v1/realtime WSS) | RC-1/RC-2 repoint egress to a runtime-supplied host. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gpc-01 | Tampering / SSRF | RC-1 startup push of serverUrl over settings:server-url-changed | mitigate | backendUrlState.sanitizeUrl already enforces http/https-only, origin-only, 2048-char cap (backendUrlState.js:33-42). RC-1 reuses this validated channel — no new attack surface; the value originates from the user's own onboarding-entered, already-persisted serverUrl. |
| T-gpc-02 | Information disclosure | RC-2 realtime WSS repoint | accept | Owner confirmed the corp backend serves the OpenAI-Realtime-compatible /v1/realtime proxy; deriveRealtimeWssUrl derives the WSS host from the same validated backendUrlState origin. Bearer token already scoped to that host. No cross-host leak introduced. |
| T-gpc-03 | Elevation / public-host leak | RC-3 stray byok routing transcription to api.openai.com | mitigate | Lockdown gate + self-heal reconciler pin cloudTranscriptionMode to "openwhispr", keeping transcription on the corp /api/transcribe path. Upstream BYOK resolver is simply never reached under lockdown. |
| T-gpc-04 | Tampering (supply/packaging) | RC-4 src/workers glob | accept | Adds an existing upstream worker script to the asar; asar is signed wholesale; no new loose Mach-O. No signing or integrity change. |
</threat_model>

<verification>
- `npx tsc --noEmit` clean (settingsStore + OnboardingFlow type-check).
- `npx vitest run` full suite green (3 new tests + existing ~152, no regressions).
- RC-1: notifyServerUrlChanged called once on init with persisted serverUrl; never when absent; no auth.ts edit (no reload path engaged).
- RC-1 pre-flight: main.js app-ready /api/* egress grep run and result recorded in SUMMARY (Option 1 coverage confirmed or FLAG raised).
- RC-2: options.wssUrl overrides build-time host at both connect sites; empty resolved host → fail-fast throw; class imports no build-config beyond the existing constant.
- RC-3: byok+lockdown→openwhispr; byok+no-lockdown→byok preserved; OnboardingFlow writes gated.
- RC-4: "src/workers/**/*" in electron-builder.json; asar list confirms onnxWorker.js in packed build OR pre-tag pack-smoke gate recorded in SUMMARY.
- i18n: no new user-facing string added (the realtime fail-fast is a thrown developer Error). If any was added, all 10 locales updated.
</verification>

<success_criteria>
- Cold launch with persisted corporate serverUrl: every /api/* request resolves the corporate host before firing (RC-1).
- OpenAI Realtime meeting + dictation connect to the runtime-derived corporate WSS host (RC-2).
- Under lockdown, cloudTranscriptionMode can never be byok; existing stray byok self-heals (RC-3).
- onnxWorker.js present in the packaged app at src/workers/onnxWorker.js (RC-4) — verified by asar list or recorded as a pre-tag gate.
- tsc + full vitest green; no upstream-immutable file touched; package.json version untouched.
</success_criteria>

<output>
After completion, create `.planning/quick/260604-gpc-v1718-corporate-host-data-plane-onnx-pack/260604-gpc-SUMMARY.md`.
In the SUMMARY, record:
1. The RC-1 main.js app-ready egress grep result (Option 1 coverage confirmed, or any FLAG).
2. The RC-4 packed-build verification outcome (asar list pass, OR the pre-tag pack-smoke gate text with the exact log strings "onnx worker spawned {pid}" + "worker initialized" and the semantic-search check).
3. A note to file/PR RC-4 (src/workers glob) and RC-2 awareness upstream so the deltas aren't re-applied every merge.
</output>
