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
// Backend + auth URL fallback to "" rather than a hardcoded literal — the
// SoT for the historical auth-host default lives in the build-config
// generator (defaults.ts / build-config.generated). Re-introducing a literal
// here would be drift from that SoT (WARN-07).
//
// Consumers in main.js + src/helpers/ipcHandlers.js read via getBackendUrl()
// and getAuthUrl(). They MUST NOT cache the result — call the function each
// time so a runtime URL change takes effect on the next call.

"use strict";

const BuildConfig = require("../config/build-config.generated.cjs");

let runtimeBackendUrl = null;
let runtimeAuthUrl = null;

// Pre-v1.7.10 review (WARN-05): the IPC channel from the renderer is
// trusted-but-not-blind. A compromised renderer (XSS via i18n, malicious
// extension, etc.) could push file://, javascript:, a 10MB string, or an
// object that throws in toString(). Validate strictly.
const MAX_URL_LENGTH = 2048;
function sanitizeUrl(input) {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string") return null;
  if (input.length > MAX_URL_LENGTH) return null;
  let parsed;
  try { parsed = new URL(input); } catch { return null; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  // origin drops userinfo/path/query/fragment — defangs https://x@evil/
  return parsed.origin;
}

function setBackendUrl(url) {
  const canonical = sanitizeUrl(url);
  runtimeBackendUrl = canonical;
  // Phase 1 HOST-02: typical deployment unifies backend+auth on one host.
  // Phase 2 (or later) may split them again; until then, the renderer pushes
  // one URL and we treat it as both backend and auth host.
  runtimeAuthUrl = canonical;
}

function getBackendUrl() {
  return runtimeBackendUrl ?? BuildConfig.OPENWHISPR_BACKEND_URL ?? "";
}

function getAuthUrl() {
  // No hardcoded fallback — BuildConfig.OPENWHISPR_AUTH_URL is the SoT.
  return runtimeAuthUrl ?? BuildConfig.OPENWHISPR_AUTH_URL ?? "";
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
