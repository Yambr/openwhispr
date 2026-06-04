---
phase: 260604-gpc-v1718-corporate-host-data-plane-onnx-pack
reviewed: 2026-06-04T12:30:00Z
depth: quick
files_reviewed: 8
files_reviewed_list:
  - src/stores/settingsStore.ts
  - src/helpers/openaiRealtimeStreaming.js
  - src/helpers/ipcHandlers.js
  - src/components/OnboardingFlow.tsx
  - electron-builder.json
  - src/stores/__tests__/host-coldstart-push.test.ts
  - src/stores/__tests__/lockdown-transcription-mode.test.ts
  - test/helpers/openaiRealtimeStreaming.test.js
findings:
  blocker: 1
  critical: 1
  warning: 2
  info: 2
  total: 6
status: issues_found
---

# Phase 260604-gpc: Code Review Report

**Reviewed:** 2026-06-04T12:30:00Z
**Depth:** quick (extended with targeted cross-file + packaged-asar verification)
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This is the v1.7.19 corporate-host data-plane fix (RC-1..RC-4). The renderer-side
logic (RC-1 cold-start push, RC-2 streaming options input, RC-3 lockdown
reconciler + onboarding gating) is correct and well-tested — all the no-reload,
fail-fast, idempotency, and default-build-preservation properties hold up under
trace. The upstream-immutable files (`audioManager.js`, `onnxWorkerClient.js`,
`src/workers/**`) are untouched. No secret leakage, no i18n regressions (RC-2's
new string is a dev-only `Error`).

**However, RC-2 ships a runtime crash.** `ipcHandlers.js` now does
`require("../../scripts/generate-build-config")` from the **main process at
streaming-connect time**, but `scripts/` is NOT in the `electron-builder.json`
`files` allowlist. I verified directly against the packaged asar
(`dist/mac-arm64/.../app.asar`): `ipcHandlers.js` is present at
`/src/helpers/ipcHandlers.js`, but `/scripts/generate-build-config.js` is
**absent**. The require resolves into the asar and throws `MODULE_NOT_FOUND`
the first time any dictation/meeting streaming session starts in a packed
build. The fix meant to route realtime through the corporate host crashes
before it can derive that host. This is the headline blocker.

A second concern (CR-01) is real but lower-severity: importing the full build
generator into the main process is not "side-effect-free" in the way the inline
comment claims — it works only because `main()` is guarded, but the module still
drags `fs`/`path` and all the emit* closures into the main bundle, and couples
the runtime to a build-tool script. Even after packaging is fixed, the derive
helper should be relocated to a packaged runtime module.

## Blocker Issues

### BL-01: RC-2 main-process `require("../../scripts/generate-build-config")` is not packaged → MODULE_NOT_FOUND crash on every streaming connect in packed builds

**File:** `src/helpers/ipcHandlers.js:3397` (consumed at `:4305` and `:5143`); root cause in `electron-builder.json:14-33` (`files` array)

**Issue:**
`ipcHandlers.js` (packaged, runs in the **main process**) requires the build-time
generator script at runtime:

```js
const { deriveRealtimeWssUrl } = require("../../scripts/generate-build-config");
```

`electron-builder`'s `files` field is an **allowlist** — only listed paths are
copied into `app.asar`. The array (`main.js`, `preload.js`,
`preload-*.generated.cjs`, `package.json`, `node_modules/**`, `src/dist/**`,
`src/helpers/**`, `src/config/**`, …, and now `src/workers/**`) contains **no
`scripts/` entry**. `scripts/afterPack.js` at the top of the config is an
electron-builder build hook that runs on the build machine; it is never
packaged.

I verified this empirically against the on-disk build:

```
$ npx asar list dist/mac-arm64/OpenWhispr.app/Contents/Resources/app.asar | grep generate-build-config
   (no output)
$ npx asar list ... | grep -c ipcHandlers.js
   1            # ipcHandlers IS packaged at /src/helpers/ipcHandlers.js
$ npx asar list ... | grep scripts
   /node_modules/undici/scripts          # only a vendored node_modules scripts dir
   /node_modules/undici/scripts/strip-comments.js
```

So at runtime the require resolves to `/scripts/generate-build-config.js` inside
the asar, which does not exist → `Error: Cannot find module
'../../scripts/generate-build-config'`. Because `deriveRealtimeWssUrl` lives
**only** in that script (grep confirms no packaged copy anywhere — not in
`src/config`, not in `main.js`, not in `streamingProviders.lockdown.js`), there
is no fallback. The throw happens synchronously inside the IPC handler
registration closure / connect path the first time a streaming session starts,
which is exactly the corporate realtime path RC-2 is supposed to fix. In dev
(`npm run dev`, unpacked) it works, which is why tests and local runs are green —
this only manifests in the shipped binary. This matches the project memory
note "live verification over green tests."

**Fix (recommended — relocate the helper to a packaged runtime module, do NOT
just add `scripts/` to `files`):**

Move `deriveRealtimeWssUrl` into a small packaged helper that both the generator
and the main process import. `src/config/` and `src/helpers/` are both already
in the `files` allowlist.

```js
// src/helpers/deriveRealtimeWssUrl.js  (packaged via src/helpers/**)
"use strict";
function deriveRealtimeWssUrl(backendUrl) {
  if (!backendUrl) return "";
  try {
    const u = new URL(backendUrl);
    let protocol;
    if (u.protocol === "https:") protocol = "wss:";
    else if (u.protocol === "http:") protocol = "ws:";
    else return "";
    const pathPrefix = u.pathname.replace(/\/$/, "");
    return `${protocol}//${u.host}${pathPrefix}/v1/realtime${u.search}`;
  } catch { return ""; }
}
module.exports = { deriveRealtimeWssUrl };
```

Then in `generate-build-config.js` `require("../src/helpers/deriveRealtimeWssUrl")`
(keeps the SoT single), and in `ipcHandlers.js`:

```js
const { deriveRealtimeWssUrl } = require("./deriveRealtimeWssUrl");
```

Re-pack and re-run `npx asar list … | grep deriveRealtimeWssUrl` to confirm the
helper is now inside the asar before tagging.

(Adding `"scripts/generate-build-config.js"` to `files` would also stop the
crash, but it ships a build tool — `fs`, `path`, and every `emit*` writer —
into the production main process. Prefer the relocation. See CR-01.)

## Critical Issues

### CR-01: Importing the build-config generator into the main process is not "side-effect-free" as claimed, and couples runtime to a build tool

**File:** `src/helpers/ipcHandlers.js:3395-3397`

**Issue:**
The inline comment asserts: *"generate-build-config self-runs ONLY under
`require.main===module`, so this require is side-effect-free from main-process
code."* The `require.main === module` guard (generate-build-config.js:737) does
correctly prevent `main()` (the file-writing path) from running on import — that
part of the claim is true and I confirmed it. But "side-effect-free" oversells
it:

1. The module still evaluates its whole top level on require: `require("fs")`,
   `require("path")`, the frozen `DEFAULTS`/`BOOL_DEFAULTS` objects, and the
   `emitTs`/`emitCjs`/`emitPreload*` function definitions all load into the
   main-process module graph. That is dead weight (and a build-time tool) living
   in the shipped runtime.
2. It establishes a runtime dependency on a `scripts/` build script — exactly
   the coupling that produced BL-01. Even once BL-01 is fixed by packaging, this
   import direction (runtime → build tool) is backwards and will re-break on any
   future reorg that assumes `scripts/` is build-only (afterPack/afterSign,
   CI-only tooling, etc.).

This is classified Critical rather than Blocker because, on its own (with
`scripts/` packaged), it would not crash — but it is the architectural root
cause that made BL-01 possible and it violates the build-time-vs-runtime
boundary the rest of this codebase is careful about.

**Fix:** Same as BL-01 — extract `deriveRealtimeWssUrl` into a packaged
`src/helpers/` (or `src/config/`) runtime module and have the generator import
*that*, inverting the dependency so runtime never reaches into `scripts/`.

## Warnings

### WR-01: RC-1 cold-start push reads a `state` snapshot captured before secret hydration — correct today, fragile to reorder

**File:** `src/stores/settingsStore.ts:1699` + `:1713-1716`

**Issue:**
`initializeSettings` captures `const state = useSettingsStore.getState()` at
line 1699, then uses `state.serverUrl` for the RC-1 push at 1714. `serverUrl` is
hydrated synchronously in the store constructor (verified at :732-735), so the
snapshot is correct **now**. The RC-1 no-reload property also holds: it is a
direct `window.electronAPI.notifyServerUrlChanged?.(...)` call that never calls
`setServerUrl`/`set(...)`, so the auth.ts subscribe handler (auth.ts:70-89,
which fires `window.location.reload`) is never engaged — confirmed by the test
"does NOT mutate the store's serverUrl". Idempotency holds via the
`hasInitialized` guard (:1694) and is tested. Good.

The fragility: `state` is a frozen snapshot reused for the entire async init
body. If a future edit moves any `set(...)` for `serverUrl` *before* the push,
or starts reading `serverUrl` off the stale `state` after an `await`, the push
could send a stale value. It is also slightly inconsistent that the push uses
the snapshot while the rest of init re-reads via fresh calls.

**Fix:** Read fresh at the push site to make the invariant local and
reorder-proof:

```js
const currentServerUrl = useSettingsStore.getState().serverUrl;
if (typeof currentServerUrl === "string" && currentServerUrl.length > 0) {
  window.electronAPI.notifyServerUrlChanged?.(currentServerUrl);
}
```

### WR-02: RC-1 push timing does not guarantee it precedes the first `/api/*` data-plane request — residual cold-start race

**File:** `src/stores/settingsStore.ts:1693-1716` (push) vs. `src/hooks/useSettings.ts:92-102` (trigger)

**Issue:**
The plan's stated goal (RC-1 comment :1704-1707) is that the push lands
"BEFORE any `/api/*` handler resolves `getApiUrl()` — otherwise every cloud
request falls back to the build-time public default and times out." But
`initializeSettings()` is fired from a React `useEffect` in
`useSettings.ts:92` (mount-time, fire-and-forget — `.catch()` only), and the
push is an **async IPC** to the main process where `backendUrlState.setBackendUrl`
runs. Nothing in the data plane awaits this push. Any cloud request issued by
another component that mounts/runs in the same tick (or by a main-process timer,
auto-update check, session refresh, etc.) before the IPC round-trip completes
will still read `runtimeBackendUrl === null` and fall back to
`BuildConfig.OPENWHISPR_BACKEND_URL` (backendUrlState.js `getBackendUrl`).

This is narrower than the pre-fix bug (which had *no* push at all), and for a
corporate build `OPENWHISPR_BACKEND_URL` is baked to the corporate host at build
time anyway, so the practical blast radius is small. But the comment claims a
strict happens-before ordering the code does not actually provide. If the real
deployment relies on a *runtime* host that differs from the build-time default
(the whole point of HOST-02 custom-host), an early request can still hit the
wrong host once.

**Fix:** Either (a) push the persisted `serverUrl` to the main process before
the renderer is allowed to issue data-plane requests (e.g. gate the first
`/api/*` call on an init-complete signal), or (b) since the main process already
owns `backendUrlState`, have **main** read the persisted serverUrl at startup
(it is the authoritative side) rather than depending on a renderer round-trip.
At minimum, soften the comment to describe best-effort ordering, not a
guarantee.

## Info

### IN-01: RC-3 onboarding gating is correctly applied at both byok write sites — default build preserved

**File:** `src/components/OnboardingFlow.tsx:322` and `:546`

**Issue (informational — verified correct):** Both places that write
`cloudTranscriptionMode: "byok"` are now gated `&& !PROVIDER_LOCKDOWN_ENABLED`
(the `completeOnboarding` path at :322 and the `onModeChange` cloud-toggle at
:546). In a **non-lockdown** default build `PROVIDER_LOCKDOWN_ENABLED` is
`false`, so both conditions still fire and BYOK continues to work for
non-signed-in cloud users — the upstream-parity behavior is preserved. The
reconciler `seedLockdownTranscriptionMode` (settingsStore.ts:295-303) is
`isBrowser`-guarded, lockdown-guarded, idempotent, and only rewrites the exact
`"byok" → "openwhispr"` case (leaving `local`/`self-hosted`/`openwhispr`
untouched). No action needed; recorded for completeness.

### IN-02: RC-4 `src/workers/**/*` glob is correctly placed in the include section

**File:** `electron-builder.json:29`

**Issue (informational — verified correct):** `"src/workers/**/*"` sits at line
29, inside the positive-include block (lines 15-33), above the first negation
(`!node_modules/.cache/**` at :34). It is a standard include glob — it pulls in
everything under `src/workers/`, which is the intent (the ONNX worker that the
packaging bug previously dropped). No risk of pulling unintended files since
`src/workers/` is a dedicated directory. Correct.

---

_Reviewed: 2026-06-04T12:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
