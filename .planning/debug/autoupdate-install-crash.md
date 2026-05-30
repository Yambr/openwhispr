---
status: resolved
trigger: "auto-update install crash — download succeeds but install fails with 'Something went wrong. Please try again.'"
created: 2026-05-30
updated: 2026-05-30
---

# Debug Session: autoupdate-install-crash

## Symptoms

- **Expected:** User clicks "Install update", app quits and relaunches on the new version.
- **Actual:** Update downloads fine, but clicking install shows "Something went wrong. Please try again." (the `installFailed` toast in SettingsPage). App never restarts on the new version.
- **Error:** `TypeError: Cannot read properties of undefined (reading 'preventDefault')` — captured LIVE via CDP on installed prod 1.7.13.
- **Timeline:** Present in all 1.7.x. Auto-update has never successfully installed.
- **Reproduction:** Install 1.7.13, let it detect a newer release, download, click install → fail.

## Current Focus

- hypothesis: CONFIRMED. `app.emit("before-quit")` in `src/updater.js:254` fires the main.js before-quit listener (`main.js:1603`) with NO event argument, so `event.preventDefault()` at `main.js:1606` throws `TypeError`. The throw propagates up through the `install-update` IPC handler → renderer catch → `installFailed` toast. `autoUpdater.quitAndInstall()` (updater.js:261, after the emit) never executes, so the update never installs.
- next_action: DONE — guarded fix applied + regression test added + full suite green.

## Evidence

- timestamp: 2026-05-30 — CDP on installed 1.7.13: download OK; install throws `TypeError: Cannot read properties of undefined (reading 'preventDefault')`.
- `src/updater.js:254` `app.emit("before-quit");` — synthetic emit, NO event arg. Upstream verbatim (upstream updater.js:260, authored by Gabriel Stein "Fix auto-update bugs", commit 50346296).
- `main.js:1603-1609` before-quit listener called `event.preventDefault()` unconditionally. Upstream verbatim (upstream main.js:1576-1579, authored by Gabriel Stein PR #683/#694, commit c18139e9).
- `src/helpers/windowManager.js:51` before-quit listener: `() => { this.isQuitting = true; ... }` — does NOT touch event, safe. Upstream.
- timestamp: 2026-05-30 — full throw path traced end-to-end:
  - `installUpdate()` (updater.js:225) try-block → `app.emit("before-quit")` (254) → main.js listener `event.preventDefault()` throws → out of `emit` → out of `installUpdate` try → re-thrown at `updater.js:267`.
  - IPC: `ipcMain.handle("install-update", async () => this.updateManager.installUpdate())` (ipcHandlers.js:6546) → rejected promise.
  - Renderer: `await installUpdateAction()` in `SettingsPage.tsx:3723` inside `onConfirm` try/catch → catch shows `installFailed` dialog (3725-3732).
  - `autoUpdater.quitAndInstall(isSilent, true)` (updater.js:261) on the line AFTER the emit — never reached.
- timestamp: 2026-05-30 — RACE INVESTIGATION (teardown vs quitAndInstall): NO new race introduced by the fix.
  - main.js listener schedules `sidecarRegistry.shutdownAll().finally(() => app.exit(0))`. `shutdownAll()` (sidecarRegistry.js:11) always awaits at least one microtask (and up to an 8s `SHUTDOWN_DEADLINE_MS`), so `app.exit(0)` ALWAYS fires on a later tick — never synchronously.
  - `installUpdate()` calls `quitAndInstall(isSilent, true)` SYNCHRONOUSLY on the same stack right after `emit` returns, i.e. before the async `app.exit(0)` can resolve. This is the exact upstream-intended ordering and runs on every install.
  - `autoUpdater.autoInstallOnAppQuit = true` (updater.js:66) is the safety net: even if `app.exit(0)` were to win, electron-updater applies the pending staged update on next launch.
  - Conclusion: the guarded fix is sufficient for a REAL install+restart; no deeper teardown reorder is required, and adding one would gratuitously increase upstream divergence.

## Eliminated

- hypothesis: code-signing / notarization mismatch → ELIMINATED. v1.7.14 build perfectly signed+notarized, installed 1.7.13 has same Team ID 54Q38243Z3. Not a signature problem.
- hypothesis: download/manifest flake → ELIMINATED. Download completes; the failure is strictly at install time.
- hypothesis: a NEW race where `app.exit(0)` kills the process before `quitAndInstall` stages the update → ELIMINATED. `app.exit(0)` is scheduled via an awaited async `shutdownAll()` (always a later tick); `quitAndInstall` is the synchronous next call. Plus `autoInstallOnAppQuit=true` safety net.

## Resolution

- **root_cause:** `src/updater.js` flips `windowManager.isQuitting` via a synthetic, argument-less `app.emit("before-quit")`. The upstream-verbatim before-quit listener in `main.js` called `event.preventDefault()` unconditionally; with no event object it threw `TypeError`, which rejected the `install-update` IPC call and aborted `installUpdate()` before `autoUpdater.quitAndInstall()` could run — so auto-update never installed across all of 1.7.x.
- **fix:** `main.js:1611` — changed `event.preventDefault()` → `event?.preventDefault?.()` (optional chaining) in the before-quit listener. Keeps the real quit path (Electron passes an event) intact while tolerating the synthetic argument-less emit. One-token divergence from upstream-verbatim main.js; justified as a fix to a crashed core quit path. Documented inline with a comment explaining the synthetic-emit trigger so a future upstream merge understands the divergence.
- **regression_test:** `test/helpers/updaterBeforeQuit.test.js` — 6 tests. (1) UNGUARDED listener reproduces the crash (install throws, quitAndInstall never runs); (2) GUARDED listener succeeds and reaches quitAndInstall(_, true); (3) synthetic argument-less emit does not throw; (4) real quit path still calls preventDefault; (5) source-pin asserts main.js uses `event?.preventDefault?.()` (and NOT the unguarded form) — verified to FAIL when the fix is reverted; (6) source-pin asserts updater.js still emits the synthetic argument-less before-quit (the trigger). Full unit suite green: 121/121.
- **verification:** Unit suite green (121/121). LIVE-verified on packed signed v1.7.15 build via CDP main-process inspector (2026-05-30): (a) packed app.asar confirmed to carry the guarded `event?.preventDefault?.()`; (b) in the REAL running main process the synthetic `app.emit("before-quit")` (the exact crash trigger) returned cleanly and drove a full teardown — qdrant/mic-listener/globe-listener all exited code 0, app quit gracefully → quitAndInstall is reachable; (c) NEGATIVE CONTROL in the same live process: an unguarded `event.preventDefault()` listener threw the exact prod error "Cannot read properties of undefined (reading 'preventDefault')", proving the test is load-bearing not vacuous. Final post-publish check (installed 1.7.14 → auto-update → relaunch on 1.7.15) only possible once 1.7.15 is published.
- **specialist_review:** none (electron/node main-process JS; no matching specialist skill — see summary).
- **code_review:** GO (gsd-code-reviewer, 2026-05-30) — no blockers; guard correct on both paths, no race, test load-bearing, version/lock consistent.
- **ships_as:** v1.7.15.
