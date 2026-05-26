# Plan 01-04: HOST-01 Main + HOST-02 Plumbing — getApiUrl/getAuthUrl Collapse + IPC Bridge (Wave 3)

**Goal:** Main process reads `OPENWHISPR_BACKEND_URL` from `BuildConfig.generated.cjs` (single SoT), honors a runtime override pushed from the renderer via IPC, and exposes the bridge through preload. After this plan the app launches end-to-end again (broken state from 01-03 resolved).

**Wave:** 3
**Requirements:** HOST-01 (main process side) + HOST-02 (IPC plumbing only — proxy itself is 01-05)
**Depends on:** 01-03
**Files modified:**
- `src/helpers/ipcHandlers.js` — collapse `getApiUrl()` + `getAuthUrl()`; add IPC channel
- `main.js` — register `settings:server-url-changed` ipcMain listener; maintain `currentBackendUrl`/`currentAuthUrl` cache
- `preload.js` — expose `notifyServerUrlChanged(url)` (or `setServerUrl(url)`)
- (potentially) `src/types/electron.d.ts` — add type for the new electronAPI method

## Tasks

1. **Add main-process URL cache** (in `main.js`, near other shared state):
   ```js
   const BuildConfig = require("./src/config/build-config.generated.cjs");
   let currentBackendUrl = null; // null = use BuildConfig default
   let currentAuthUrl = null;

   ipcMain.on("settings:server-url-changed", (_e, url) => {
     // Empty/null clears the override (revert to build-time default)
     currentBackendUrl = url && typeof url === "string" ? url : null;
     // Same host for both per CONTEXT D-03 (typical deployment has unified backend+auth)
     currentAuthUrl = currentBackendUrl;
   });

   global.__getBackendUrl = () => currentBackendUrl ?? BuildConfig.OPENWHISPR_BACKEND_URL ?? "";
   global.__getAuthUrl = () => currentAuthUrl ?? BuildConfig.OPENWHISPR_AUTH_URL ?? "https://auth.openwhispr.com";
   ```
   Choice of `global.__getBackendUrl`: avoids cross-file require cycles. `ipcHandlers.js` already runs in the same main process and can read globals. Alternative is to module-export from a new `src/helpers/backendUrlState.js` — judge during execution which is cleaner.

2. **Collapse `getApiUrl()` in `src/helpers/ipcHandlers.js:3387`:**
   ```js
   const getApiUrl = () => global.__getBackendUrl();
   ```
   Delete the 3-source fallback. Delete the `runtimeEnv` reading scoped to this function (still needed for other reads, leave the file-level cache intact).

3. **Collapse `getAuthUrl()` in `src/helpers/ipcHandlers.js:3393`:**
   ```js
   const getAuthUrl = () => global.__getAuthUrl();
   ```
   Same pattern.

4. **Verify the 26 call sites** all still work:
   ```bash
   grep -n "getApiUrl\(\)" src/helpers/ipcHandlers.js | wc -l   # expect 26 (unchanged count)
   grep -n "getAuthUrl\(\)" src/helpers/ipcHandlers.js | wc -l  # expect 2
   ```

5. **Expose `notifyServerUrlChanged` in preload.js** — add to the `contextBridge.exposeInMainWorld("electronAPI", { ... })` block:
   ```js
   notifyServerUrlChanged: (url) => ipcRenderer.send("settings:server-url-changed", url || null),
   ```
   Place near other settings-related methods if any; otherwise grouped with system/lifecycle methods.

6. **Add type declaration** in `src/types/electron.d.ts` (or whichever file declares `Window["electronAPI"]`):
   ```ts
   notifyServerUrlChanged: (url: string | null) => void;
   ```

7. **Verify `runtimeEnv` is still consumed elsewhere** in ipcHandlers.js — it should still be needed for other env-var reads not in scope here. Confirm no orphan code from the collapse.

8. **Smoke-launch the main process** in dev mode:
   ```bash
   npm run dev &
   sleep 5
   # observe stdout — no "ReferenceError: process.env.OPENWHISPR_API_URL is undefined" or similar
   kill %1
   ```
   Or for safer test: `node -e "require('./src/config/build-config.generated.cjs')"` confirms generated file loads.

## Acceptance

```bash
# main-side grep — zero matches of the old env var name:
grep -rn "OPENWHISPR_API_URL\b\|VITE_OPENWHISPR_API_URL\b" src/helpers/ main.js preload.js; echo "EXIT=$?"   # expect non-zero
# Verify SoT chain is intact:
grep -n "global.__getBackendUrl\|global.__getAuthUrl" main.js src/helpers/ipcHandlers.js | wc -l   # expect >= 4
# preload exposes the new bridge:
grep -n "notifyServerUrlChanged" preload.js   # expect 1 match
# Type declaration present:
grep -n "notifyServerUrlChanged" src/types/electron.d.ts   # expect 1 match
# Smoke: app starts without env-var crashes
npm run pack 2>&1 | tail -10   # expect successful pack
# verify-backend-url-sot now fully green for source-grep:
node scripts/verify-backend-url-sot.js 2>&1 | tail -5   # source-grep section PASS
```

Commit message: `feat(01-04): HOST-01 main + HOST-02 plumbing — getApiUrl/getAuthUrl read from BuildConfig SoT + settings:server-url-changed IPC bridge`

## Notes

- **App is launchable again after this plan.** Default-build behavior preserved: `currentBackendUrl = null` → uses `BuildConfig.OPENWHISPR_BACKEND_URL` (the value CI/release.yml seeds via env at build time). For ordinary Yambr users this is `openwhispr.yambr.com`.
- The HOST-02 e2e test from 01-01 is still RED until 01-05 ships the proxy. The IPC bridge is half the puzzle; the proxy that reads `persistedUrl` is the other half.
- No upstream-parity concern in this plan — `ipcHandlers.js`, `main.js`, `preload.js` are Yambr-fork drift files (heavily modified across phases 03/04/04.1/05/10). The `[upstream_parity]` rule does not apply.
