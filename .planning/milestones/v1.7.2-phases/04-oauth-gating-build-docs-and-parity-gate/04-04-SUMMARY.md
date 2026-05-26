---
phase: 04-oauth-gating-build-docs-and-parity-gate
plan: 4
subsystem: oauth-gating
tags: [oauth, gating, ipc, main-process, phase-4, CFG-03]
requires:
  - Phase 4 Plan 1 (build-config plumbing — OAUTH_GOOGLE_ENABLED in build-config.generated.cjs)
provides:
  - Main-process enforcement of OAUTH_GOOGLE_ENABLED in src/helpers/ipcHandlers.js
  - Build-time gate on googleCalendarManager instantiation in main.js
affects:
  - When OPENWHISPR_OAUTH_GOOGLE=false: 0 gcal-* IPC channels registered, manager never constructed, lifecycle calls skipped
  - Apple / Microsoft main-process surface unchanged (no-op per CONTEXT.md D-02)
tech-stack:
  added: []
  patterns:
    - "Single-block if (BuildConfig.OAUTH_GOOGLE_ENABLED) wrapping all 8 gcal-* ipcMain.handle calls — DCE-friendly conditional registration"
    - "Construction-site gate in main.js (paired with existing null-checks at call sites) so disabled builds never instantiate GoogleCalendarManager"
key-files:
  created: []
  modified:
    - src/helpers/ipcHandlers.js
    - main.js
decisions:
  - "Added BuildConfig require to main.js as well — main.js unconditionally constructed GoogleCalendarManager, so per Plan 1 task 1.4 a construction gate was added (files_modified extended to include main.js)."
  - "Gated start() call site in main.js by changing `googleCalendarManager.start()` -> `if (googleCalendarManager) googleCalendarManager.start()` (matches existing optional-pattern at the stop/syncOnFocus/onWakeFromSleep call sites)."
  - "All 8 gcal-* handlers wrapped in ONE if-block (not 8 separate blocks) per CONTEXT.md."
requirements: [CFG-03]
metrics:
  duration: ~10 minutes
  completed: 2026-05-08
---

# Phase 4 Plan 4: OAuth Gating - Main-Process IPC + Lifecycle Summary

Wired Phase 4's main-process enforcement of `OAUTH_GOOGLE_ENABLED` per CONTEXT.md D-02. All 8 `gcal-*` IPC handlers and the two Google Calendar lifecycle calls in `src/helpers/ipcHandlers.js` are now wrapped in `if (BuildConfig.OAUTH_GOOGLE_ENABLED)`, and `main.js` no longer instantiates `GoogleCalendarManager` when the flag is false. Apple and Microsoft remain no-op on the main side (no IPC surface to gate) per D-02.

## What Changed

### `src/helpers/ipcHandlers.js`
- Added `const BuildConfig = require("../config/build-config.generated.cjs");` next to the other top-of-file requires.
- Wrapped all 8 `gcal-*` `ipcMain.handle(...)` registrations (lines ~7001–7077) in a single `if (BuildConfig.OAUTH_GOOGLE_ENABLED) { ... }` block, indented as one unit. Handlers covered:
  - `gcal-start-oauth`, `gcal-disconnect`, `gcal-get-connection-status`, `gcal-get-calendars`, `gcal-set-calendar-selection`, `gcal-sync-events`, `gcal-get-upcoming-events`, `gcal-get-event`.
- Wrapped the two Google Calendar lifecycle blocks in the DB-delete cleanup path (around lines ~1949–1962) — `googleCalendarManager?.stop()` and `await googleCalendarManager?.revokeAllTokens()` — each in its own `if (BuildConfig.OAUTH_GOOGLE_ENABLED)` block.
- `join-calendar-meeting` handler (line ~7155) left UNGATED per Plan task 1.5 — it is meeting-detection plumbing, not a gcal handler.
- All non-gcal handlers untouched (no `ipcMain.handle` deletions; net diff is purely additive wrappers + indentation).

### `main.js` (Plan task 1.4 escalation — added to files_modified)
- Added `const BuildConfig = require("./src/config/build-config.generated.cjs");` near the existing helper requires.
- Wrapped `googleCalendarManager = new GoogleCalendarManager(...)` (line ~358) in `if (BuildConfig.OAUTH_GOOGLE_ENABLED) { ... }`.
- Changed `googleCalendarManager.start()` (line ~456) to `if (googleCalendarManager) googleCalendarManager.start()` so the start call is null-safe when construction was gated out. Other call sites (`syncOnFocus`, `onWakeFromSleep`, the will-quit `stop()`) already had null-checks, so they did not need changes.

## Diff Snippet (key gate additions)

`src/helpers/ipcHandlers.js`:
```js
const debugLogger = require("./debugLogger");
const BuildConfig = require("../config/build-config.generated.cjs");
const tokenStore = require("./tokenStore");

// ...

      if (BuildConfig.OAUTH_GOOGLE_ENABLED) {
        try {
          this.googleCalendarManager?.stop();
        } catch (e) { errors.push(`GCal stop: ${e.message}`); }
      }

      if (BuildConfig.OAUTH_GOOGLE_ENABLED) {
        try {
          await this.googleCalendarManager?.revokeAllTokens();
        } catch (e) { errors.push(`GCal revoke: ${e.message}`); }
      }

// ...

    // Google Calendar (gated by build-time OAUTH_GOOGLE_ENABLED — see Phase 4 CFG-03)
    if (BuildConfig.OAUTH_GOOGLE_ENABLED) {
      ipcMain.handle("gcal-start-oauth", async () => { ... });
      ipcMain.handle("gcal-disconnect", async () => { ... });
      ipcMain.handle("gcal-get-connection-status", async () => { ... });
      ipcMain.handle("gcal-get-calendars", async () => { ... });
      ipcMain.handle("gcal-set-calendar-selection", async (...) => { ... });
      ipcMain.handle("gcal-sync-events", async () => { ... });
      ipcMain.handle("gcal-get-upcoming-events", async (...) => { ... });
      ipcMain.handle("gcal-get-event", async (...) => { ... });
    }
```

`main.js`:
```js
const BuildConfig = require("./src/config/build-config.generated.cjs");
// ...
  if (BuildConfig.OAUTH_GOOGLE_ENABLED) {
    googleCalendarManager = new GoogleCalendarManager(databaseManager, windowManager);
  }
// ...
  if (googleCalendarManager) googleCalendarManager.start();
```

## Verification Output

```
$ node --check src/helpers/ipcHandlers.js
syntax OK

$ node --check main.js
main.js OK

$ grep -c "BuildConfig.OAUTH_GOOGLE_ENABLED" src/helpers/ipcHandlers.js
3   # 1 wrapping the 8 handlers + 2 wrapping the two lifecycle calls

$ grep -c 'ipcMain.handle("gcal-' src/helpers/ipcHandlers.js
8   # all 8 gcal-* handlers preserved

$ grep -B5 'ipcMain.handle("join-calendar-meeting"' src/helpers/ipcHandlers.js
# No "OAUTH_GOOGLE_ENABLED" within 5 lines above — handler is ungated as required.

$ node -e "require('./src/config/build-config.generated.cjs')"
# (no error — module loads cleanly)

$ node -e "console.log(require('./src/config/build-config.generated.cjs').OAUTH_GOOGLE_ENABLED)"
true   # default-build value preserves parity (CFG-06)

$ OPENWHISPR_OAUTH_GOOGLE=false node scripts/generate-build-config.js && \
  node --check src/helpers/ipcHandlers.js && \
  node -e "console.log(require('./src/config/build-config.generated.cjs').OAUTH_GOOGLE_ENABLED)"
[build-config] wrote src/config/build-config.generated.{ts,cjs} (16 string keys + 4 booleans)
syntax OK
false
# Disabled-build still parses; flag flips to false as expected.

# Generator restored to default after smoke test.
```

## Acceptance Criteria — All Met

- [x] File requires `../config/build-config.generated.cjs` (single new require expression).
- [x] Exactly 8 `ipcMain.handle("gcal-*")` registrations exist (no additions, no deletions).
- [x] All 8 are inside ONE `if (BuildConfig.OAUTH_GOOGLE_ENABLED)` block.
- [x] File contains exactly 3 `if (BuildConfig.OAUTH_GOOGLE_ENABLED)` expressions (1 handler block + 2 lifecycle).
- [x] `join-calendar-meeting` is registered at file scope, NOT inside the gate.
- [x] `googleCalendarManager?.stop()` lifecycle gated.
- [x] `googleCalendarManager?.revokeAllTokens()` lifecycle gated.
- [x] `node --check src/helpers/ipcHandlers.js` passes.
- [x] No non-gcal IPC handlers were modified.
- [x] `main.js` instantiation gate added (per task 1.4 — main.js unconditionally constructed the manager).

## Parity Confirmation (CFG-06)

On a default build (no env vars), `OAUTH_GOOGLE_ENABLED === true`, so:
- All 8 `gcal-*` handlers register exactly as before.
- `googleCalendarManager` is constructed and started exactly as before.
- Both lifecycle blocks execute exactly as before.

The gate is invisible on default builds — pre-Phase-4 behavior is preserved bit-for-bit.

## Deviations from Plan

**[Rule 2 - Missing critical functionality] Extended modification scope to main.js per Plan task 1.4 conditional**

- **Found during:** Task 1, while reading the file structure to plan the ipcHandlers edit.
- **Issue:** Plan task 1.4 specified: "if main.js unconditionally constructs `googleCalendarManager`, add ONE additional gate change in main.js". `main.js:357` had `googleCalendarManager = new GoogleCalendarManager(databaseManager, windowManager);` with no flag check, and `main.js:453` had `googleCalendarManager.start();` (not null-safe).
- **Fix:** Added `BuildConfig` require, wrapped the construction in `if (BuildConfig.OAUTH_GOOGLE_ENABLED)`, and changed `googleCalendarManager.start();` to `if (googleCalendarManager) googleCalendarManager.start();` to match the existing optional-pattern used at the other call sites (`syncOnFocus`, `onWakeFromSleep`, `will-quit stop`).
- **Files modified:** `main.js` (added to files_modified per plan instruction).
- **Commit:** cea3b90

No other deviations. join-calendar-meeting remains ungated; non-gcal handlers untouched; constructor wiring at ipcHandlers.js:296 left as-is per task 1.4 (optional-chaining handles undefined manager).

## Self-Check: PASSED

- src/helpers/ipcHandlers.js: FOUND, modified
- main.js: FOUND, modified
- Commit cea3b90: FOUND in `git log --oneline`
- 3 `if (BuildConfig.OAUTH_GOOGLE_ENABLED)` gates in ipcHandlers.js
- 8 gcal-* handlers preserved
- join-calendar-meeting registered at file scope (not inside gate)
- node --check passes for both files
- Default build still emits OAUTH_GOOGLE_ENABLED=true (parity preserved)
- Disabled build (OPENWHISPR_OAUTH_GOOGLE=false) emits OAUTH_GOOGLE_ENABLED=false and both files still parse
