// Shared, PACKAGED home for deriveRealtimeWssUrl (quick-260604-gpc BL-01).
//
// This logic is needed in TWO places:
//   1. BUILD time — scripts/generate-build-config.js derives
//      OPENWHISPR_REALTIME_WSS_URL from OPENWHISPR_BACKEND_URL and bakes it.
//   2. RUN time (main process) — src/helpers/ipcHandlers.js (RC-2) re-derives
//      the WSS host from the runtime backendUrlState.getBackendUrl() so a
//      corporate self-hosted build's realtime socket follows the runtime
//      serverUrl instead of the build-time-frozen constant.
//
// It MUST live under src/helpers/ (which IS in electron-builder.json `files`),
// NOT in scripts/ (which is NOT packaged). The original RC-2 implementation
// required scripts/generate-build-config from the main process; that script is
// absent from the packaged app.asar, so the require threw MODULE_NOT_FOUND on
// the first streaming-connect in the shipped binary (worked only in unpacked
// `npm run dev`). Hosting the pure function here gives both consumers a single
// source of truth that is present at runtime. generate-build-config.js
// re-exports from this module so the two can never diverge.
//
// Plain CommonJS (no build-config / electron imports) so it is safe to require
// from both the Node build script and the Electron main process.

// Derive the realtime WebSocket endpoint from a backend/API base URL.
//   - https: → wss:, http: → ws:, anything else → "" (STREAMING auto-disables).
//   - Appends `/v1/realtime` after the backend's existing path prefix (trailing
//     slash stripped) so a backend already rooted at /v1 yields …/v1/v1/realtime
//     (the second /v1 is the realtime mount).
//   - Query string preserved (token-in-query gateways); fragment dropped so the
//     downstream `?intent=transcription` / `&intent=…` suffix reaches the server.
//   - Empty/malformed/non-http(s) input → "" (caller falls back to the
//     build-time constant, or the STREAMING guard disables the feature).
function deriveRealtimeWssUrl(backendUrl) {
  if (!backendUrl) return "";
  try {
    const u = new URL(backendUrl);
    let protocol;
    if (u.protocol === "https:") protocol = "wss:";
    else if (u.protocol === "http:") protocol = "ws:";
    else return ""; // non-http(s) — let STREAMING auto-disable handle it
    const pathPrefix = u.pathname.replace(/\/$/, "");
    return `${protocol}//${u.host}${pathPrefix}/v1/realtime${u.search}`;
  } catch {
    return "";
  }
}

module.exports = { deriveRealtimeWssUrl };
