// Regression test — auto-update install crash
// (debug session: autoupdate-install-crash; ships v1.7.15).
//
// BUG (present in ALL of 1.7.x; confirmed LIVE via CDP on installed prod 1.7.13):
//   UpdateManager.installUpdate() (src/updater.js) flips windowManager.isQuitting
//   by firing a SYNTHETIC, argument-less quit event:
//
//       app.emit("before-quit");          // <-- NO event argument
//       app.removeAllListeners("window-all-closed");
//       BrowserWindow.getAllWindows().forEach((win) => win.removeAllListeners("close"));
//       const isSilent = process.platform === "win32";
//       autoUpdater.quitAndInstall(isSilent, true);
//
//   main.js registered a before-quit listener that called event.preventDefault()
//   UNCONDITIONALLY. With the synthetic emit there is no event object, so
//       <event>.preventDefault()  ->  TypeError: Cannot read properties of undefined
//   The throw propagated out of app.emit() -> out of installUpdate()'s try/catch
//   (re-thrown) -> rejected the "install-update" IPC promise -> the renderer's
//   onConfirm catch showed the `installFailed` dialog. Critically, quitAndInstall()
//   on the line right after the emit NEVER ran — the update was never installed and
//   the app never restarted onto the new version.
//
// FIX (main.js): the before-quit listener now optional-chains the call:
//       event?.preventDefault?.();
//   This keeps the real quit path (Electron passes an event) intact while tolerating
//   the synthetic, argument-less emit from installUpdate(). One-token divergence from
//   upstream-verbatim main.js — a justified fix to a crashed core quit path.
//
// WHY A REPLICA OF installUpdate'S SEQUENCE (not the real module):
//   src/updater.js does `const { autoUpdater } = require("electron-updater")` (CJS).
//   vitest's vi.mock cannot intercept a require() of an externalized node_module, and
//   the real electron-updater eagerly instantiates a Squirrel MacUpdater at load that
//   needs a live Electron app — unloadable under vitest without inlining the whole dep.
//   So the integration test below replays installUpdate()'s EXACT emit -> quitAndInstall
//   control flow against a real EventEmitter `app`, and the final `describe` pins the
//   actual main.js source line so a future upstream merge cannot silently regress it.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_JS = join(__dirname, "..", "..", "main.js");
const UPDATER_JS = join(__dirname, "..", "..", "src", "updater.js");

// Register a before-quit listener that mirrors main.js's teardown contract.
// `guarded` toggles the exact line under test: optional chaining (the fix) vs
// the original unconditional call (the bug).
function registerBeforeQuitListener(app, { guarded }) {
  let isShuttingDown = false;
  app.on("before-quit", (event) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    if (guarded) {
      event?.preventDefault?.();
    } else {
      event.preventDefault();
    }
    // (main.js also runs performSyncTeardown() + sidecarRegistry.shutdownAll()
    //  here; those are async/Electron-coupled and not part of the throw path.)
  });
}

// Faithful replica of UpdateManager.installUpdate()'s shutdown sequence: the exact
// emit -> remove-listeners -> quitAndInstall ordering, wrapped in the same try/catch
// that re-throws on failure (so the IPC promise rejects exactly like production).
function runInstallSequence(app, autoUpdater, BrowserWindow) {
  try {
    app.emit("before-quit");
    app.removeAllListeners("window-all-closed");
    BrowserWindow.getAllWindows().forEach((win) => win.removeAllListeners("close"));
    const isSilent = process.platform === "win32";
    autoUpdater.quitAndInstall(isSilent, true);
    return { success: true, message: "Update installation started" };
  } catch (error) {
    throw error;
  }
}

describe("auto-update install — synthetic before-quit emit (regression)", () => {
  let app;
  let quitAndInstallCalls;
  let autoUpdater;
  const BrowserWindow = { getAllWindows: () => [] };

  beforeEach(() => {
    app = new EventEmitter();
    app.exit = vi.fn();
    quitAndInstallCalls = [];
    autoUpdater = {
      quitAndInstall: (...args) => quitAndInstallCalls.push(args),
    };
  });

  it("UNGUARDED listener reproduces the crash: install throws, quitAndInstall never runs", () => {
    registerBeforeQuitListener(app, { guarded: false });

    expect(() => runInstallSequence(app, autoUpdater, BrowserWindow)).toThrow(
      /Cannot read properties of undefined \(reading 'preventDefault'\)/
    );
    expect(quitAndInstallCalls).toHaveLength(0); // never reached — this is the bug
  });

  it("GUARDED listener (the fix): install succeeds and quitAndInstall runs", () => {
    registerBeforeQuitListener(app, { guarded: true });

    const result = runInstallSequence(app, autoUpdater, BrowserWindow);

    expect(result).toEqual({ success: true, message: "Update installation started" });
    expect(quitAndInstallCalls).toHaveLength(1); // real install path reached
    // installUpdate calls quitAndInstall(isSilent, true); the 2nd arg is always true.
    expect(quitAndInstallCalls[0][1]).toBe(true);
  });

  it("synthetic emit (no event arg) does not throw against the guarded listener", () => {
    registerBeforeQuitListener(app, { guarded: true });
    // This is exactly what src/updater.js does: app.emit("before-quit") with no arg.
    expect(() => app.emit("before-quit")).not.toThrow();
  });

  it("real quit path still calls preventDefault on a present event object", () => {
    registerBeforeQuitListener(app, { guarded: true });
    const event = { preventDefault: vi.fn() };
    app.emit("before-quit", event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe("source pins — fix is present in the real files", () => {
  it("main.js before-quit listener guards the preventDefault call", () => {
    const src = readFileSync(MAIN_JS, "utf8");
    const m = src.match(/app\.on\("before-quit",\s*\(event\)\s*=>\s*\{[\s\S]*?\n\s*\}\);/);
    expect(m, "before-quit listener not found in main.js").toBeTruthy();

    // Strip // comments so the assertion checks executable code only.
    const code = m[0]
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    // Must optional-chain the call...
    expect(code).toContain("event?.preventDefault?.()");
    // ...and must NOT contain the original unguarded `event.preventDefault()`.
    expect(code).not.toMatch(/(?<!\?)\bevent\.preventDefault\(\)/);
  });

  it("src/updater.js still emits a synthetic, argument-less before-quit (the trigger)", () => {
    const src = readFileSync(UPDATER_JS, "utf8");
    // If upstream ever changes this to pass an event, the guard becomes belt-and-braces
    // rather than load-bearing — but this pin documents the exact line that needs it.
    expect(src).toMatch(/app\.emit\("before-quit"\);/);
  });
});
