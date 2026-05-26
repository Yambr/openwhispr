// Phase 1 HOST-01 + HOST-02 (v1.8.0): main-process backend URL state.
//
// Single source of truth for the backend host the main process should use.
// Resolution order:
//   1. Runtime override pushed from renderer via the
//      "settings:server-url-changed" IPC channel (Phase 4 onboarding UI
//      writes here when the user enters a custom Server URL).
//   2. Build-time default from src/config/build-config.generated.cjs
//      (OPENWHISPR_BACKEND_URL / OPENWHISPR_AUTH_URL), which itself was
//      seeded by the OPENWHISPR_BACKEND_URL env var at generator-run time.
//
// AUTH_URL falls back to "https://auth.openwhispr.com" to preserve
// default-build behavior for ordinary Yambr users (the historical pre-v1.8.0
// hardcoded fallback).
//
// Consumers in main.js + src/helpers/ipcHandlers.js read via getBackendUrl()
// and getAuthUrl(). They MUST NOT cache the result — call the function each
// time so a runtime URL change takes effect on the next call.

"use strict";

const BuildConfig = require("../config/build-config.generated.cjs");

let runtimeBackendUrl = null;
let runtimeAuthUrl = null;

function setBackendUrl(url) {
  // Empty/null clears the override (revert to build-time default).
  runtimeBackendUrl = url && typeof url === "string" ? url : null;
  // Phase 1 HOST-02: typical deployment unifies backend+auth on one host.
  // Phase 2 (or later) may split them again; until then, the renderer pushes
  // one URL and we treat it as both backend and auth host.
  runtimeAuthUrl = runtimeBackendUrl;
}

function getBackendUrl() {
  return runtimeBackendUrl ?? BuildConfig.OPENWHISPR_BACKEND_URL ?? "";
}

function getAuthUrl() {
  return runtimeAuthUrl ?? BuildConfig.OPENWHISPR_AUTH_URL ?? "https://auth.openwhispr.com";
}

function registerIpc(ipcMain) {
  ipcMain.on("settings:server-url-changed", (_event, url) => {
    setBackendUrl(url);
  });
}

module.exports = {
  setBackendUrl,
  getBackendUrl,
  getAuthUrl,
  registerIpc,
};
