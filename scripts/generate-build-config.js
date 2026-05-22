#!/usr/bin/env node
// Phase 3 build-time config generator.
//
// Reads process.env.OPENWHISPR_* at build/dev time and emits TWO frozen modules:
//   - src/config/build-config.generated.ts  (renderer/TS consumers; imported by src/config/defaults.ts)
//   - src/config/build-config.generated.cjs (main-process CommonJS consumers; required directly)
//
// Both files are .gitignored. The default-build (no env vars) values match the pre-refactor
// hardcoded literals — see docs/CONFIG_INVENTORY.md for the source-of-truth mapping.

"use strict";

const fs = require("fs");
const path = require("path");

// 16 logical string env-var keys with their parity defaults.
// Empty string ("") is a valid intended default for OPENWHISPR_BACKEND_URL — DO NOT coerce.
const DEFAULTS = Object.freeze({
  OPENWHISPR_AUTH_URL: "https://auth.openwhispr.com",
  OPENWHISPR_BACKEND_URL: "",
  // webRequest Origin-rewrite filter patterns. Parity defaults match the
  // openwhispr.com hosts. When OPENWHISPR_BACKEND_URL / OPENWHISPR_AUTH_URL
  // are set and the pattern is not explicitly overridden, buildResolved()
  // derives `<scheme>//<host>/*` from them (deriveOriginPattern) so a
  // corporate build's filter tracks its real backend (e.g.
  // openwhispr.yambr.com). Consumed by main.js's onBeforeSendHeaders.
  OPENWHISPR_BACKEND_URL_PATTERN: "https://api.openwhispr.com/*",
  OPENWHISPR_AUTH_URL_PATTERN: "https://auth.openwhispr.com/*",
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL: "https://openwhispr.com/auth/desktop-callback",
  OPENWHISPR_MCP_URL: "https://mcp.openwhispr.com/mcp",
  OPENWHISPR_OAUTH_GOOGLE_AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL: "https://oauth2.googleapis.com/token",
  OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL: "https://oauth2.googleapis.com/revoke",
  OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL: "https://www.googleapis.com/calendar/v3",
  OPENWHISPR_OAUTH_RESET_PASSWORD_URL: "https://openwhispr.com/reset-password",
  OPENWHISPR_OAUTH_PROTOCOL_SCHEME: "openwhispr",
  OPENWHISPR_OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENWHISPR_ANTHROPIC_URL: "https://api.anthropic.com/v1/messages",
  OPENWHISPR_GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
  OPENWHISPR_GROQ_BASE_URL: "https://api.groq.com/openai/v1",
  OPENWHISPR_MISTRAL_BASE_URL: "https://api.mistral.ai/v1",
  // Phase 05 D-01: realtime WebSocket URL. Default empty — when
  // OPENWHISPR_BACKEND_URL is set and this var is unset, buildResolved()
  // derives `<wss|ws>://<host><path>/v1/realtime` (path-preserving). Empty
  // value keeps realtime unavailable (STREAMING_ENABLED guard handles the
  // unavailable case). Maintainers override explicitly when realtime lives on
  // a different host (e.g., a separate WSS-only ingress).
  OPENWHISPR_REALTIME_WSS_URL: "",
});

const KEYS = Object.keys(DEFAULTS);

// Phase 4 OAuth gating: per-provider boolean defaults. User-facing env var is
// OPENWHISPR_<KEY> (the trailing `_ENABLED` is dropped for the env name), but
// the emitted constant uses _ENABLED for boolean-semantic clarity at
// consumption sites.
// Parse rule: explicit "false" → false; anything else (set with any other
// value) → true. When the env var is UNSET we fall back to the BOOL_DEFAULTS
// entry, so a flag with default `true` stays `true` until explicitly set to
// "false", and a flag with default `false` stays `false` until set to anything
// other than "false" (e.g., "true", "1").
const BOOL_DEFAULTS = Object.freeze({
  OAUTH_GOOGLE_ENABLED: true,
  OAUTH_APPLE_ENABLED: true,
  OAUTH_MICROSOFT_ENABLED: true,
  // Phase 04.1 CFG-09 (PLAN-03): corporate-minimal default — Stripe billing UI
  // and IPC physically removed from the bundle when this is false. Env var:
  // OPENWHISPR_BILLING (any value other than "false" enables it; unset = false
  // here because BOOL_DEFAULTS[boolKey] is consulted only when env is unset).
  BILLING_ENABLED: false,
  // Phase 04.1 CFG-09 (PLAN-04): corporate-minimal default — referral stats /
  // invite UI and IPC physically removed from the bundle when this is false.
  // Env var: OPENWHISPR_REFERRALS (any value other than "false" enables it;
  // unset = false here because BOOL_DEFAULTS[boolKey] is consulted only when
  // env is unset).
  REFERRALS_ENABLED: false,
  // Phase 04.1 CFG-09 (PLAN-05): introduced STREAMING_ENABLED gate over the
  // AssemblyAI / Deepgram WebSocket realtime ASR IPC + token-fetch endpoints
  // and the 141 kB useChatStreaming chat hook.
  //
  // Phase 05 D-02 amendment: default flipped false → true. Realtime ASR is
  // now routed through the corporate backend (Speaches+LiteLLM, see
  // openaiRealtimeStreaming.js + OPENWHISPR_REALTIME_WSS_URL) rather than
  // direct third-party WebSockets, so the original corporate-minimal
  // privacy rationale for default-off no longer applies. Maintainers whose
  // backend has NOT yet deployed the realtime relay can still opt out via
  // OPENWHISPR_STREAMING=false.
  //
  // B1 auto-disable: see buildResolved() — when no backend AND user did not
  // explicitly opt in, STREAMING_ENABLED is forced back to false so the
  // default offline build does not crash on first record.
  STREAMING_ENABLED: true,
  // Phase 10 PLD-01: corporate-minimal provider lockdown. When true, strips
  // every alternative cloud provider (OpenAI/Groq/Mistral/Custom), every
  // enterprise provider (Bedrock/Azure/Vertex), and every BYOK ("paste your
  // API key") surface from the bundle — leaving exactly two processing paths,
  // Cloud (our server only) and Local (offline whisper.cpp / Parakeet).
  // Env var: OPENWHISPR_PROVIDER_LOCKDOWN (any value other than "false"
  // enables it; unset = false here because BOOL_DEFAULTS[boolKey] is consulted
  // only when env is unset). Default false keeps upstream parity for
  // non-corporate builds.
  PROVIDER_LOCKDOWN_ENABLED: false,
});

const BOOL_KEYS = Object.keys(BOOL_DEFAULTS);

function resolveValue(key) {
  // Use hasOwnProperty so an explicit empty string still counts as "set" — important
  // for OPENWHISPR_BACKEND_URL where empty is the documented default and any explicit
  // override (including "") must be honored.
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key];
  }
  return DEFAULTS[key];
}

function resolveBool(boolKey) {
  // Map boolKey -> env var name. OAUTH_GOOGLE_ENABLED → OPENWHISPR_OAUTH_GOOGLE
  const envKey = "OPENWHISPR_" + boolKey.replace(/_ENABLED$/, "");
  if (Object.prototype.hasOwnProperty.call(process.env, envKey)) {
    return process.env[envKey] !== "false";
  }
  return BOOL_DEFAULTS[boolKey];
}

// Phase 05 D-01: derive REALTIME_WSS_URL from BACKEND_URL when caller did not
// provide an explicit override. Empty BACKEND_URL keeps REALTIME_WSS_URL empty
// (offline-safe — STREAMING_ENABLED guard handles the unavailable case).
//
// Rules:
//   - https:// → wss://, http:// → ws:// (preserve TLS-vs-plaintext choice).
//   - Preserve any path prefix on BACKEND_URL (maintainers running a backend
//     at a sub-path, e.g., https://api.example.com/v1, get
//     wss://api.example.com/v1/v1/realtime — the second /v1 is the realtime
//     mount; the first is their existing API root).
//   - Trailing slash on the path is stripped before appending /v1/realtime.
//   - Query string (u.search) is preserved (legitimate for token-in-query
//     gateways).
//   - Fragment (u.hash) is dropped — fragments don't make sense for a
//     WebSocket endpoint, and downstream code appends `?intent=transcription`
//     (or `&intent=...`). Keeping a fragment would swallow that suffix into
//     the fragment, so `intent` would never reach the server (CR-03).
//   - Malformed URL → realtime URL stays empty (STREAMING guard kicks in).
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

// Derive an Electron webRequest URL-filter pattern (`<scheme>//<host>/*`)
// from a backend/auth URL. Consumed by main.js's
// webRequest.onBeforeSendHeaders Origin-rewrite filter — the filter must
// cover whatever host the build actually talks to (a corporate build on
// openwhispr.yambr.com, not the openwhispr.com defaults). Host includes
// any non-default port. Path/query/fragment are intentionally dropped:
// the filter matches by origin, not path. Malformed/non-http(s) URL → "".
function deriveOriginPattern(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return "";
  }
}

function buildResolved() {
  const resolved = {};
  for (const key of KEYS) {
    resolved[key] = resolveValue(key);
  }
  for (const boolKey of BOOL_KEYS) {
    resolved[boolKey] = resolveBool(boolKey);
  }
  resolved.OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN = Object.prototype.hasOwnProperty.call(
    process.env,
    "OPENWHISPR_OAUTH_PROTOCOL_SCHEME"
  );
  // Phase 10 PLD-02: provider lockdown implies no OAuth providers. A single
  // corporate build sets one env var (OPENWHISPR_PROVIDER_LOCKDOWN) instead of
  // four. An explicit OPENWHISPR_OAUTH_*=true cannot re-enable a provider under
  // lockdown — lockdown is the stronger corporate posture and always wins.
  if (resolved.PROVIDER_LOCKDOWN_ENABLED === true) {
    resolved.OAUTH_GOOGLE_ENABLED = false;
    resolved.OAUTH_APPLE_ENABLED = false;
    resolved.OAUTH_MICROSOFT_ENABLED = false;
    // Under lockdown realtime ASR is always served by our backend's WSS proxy,
    // so streaming must be enabled. An explicit OPENWHISPR_STREAMING=false under
    // lockdown is a contradiction — lockdown is the stronger corporate posture
    // and always wins (mirrors the OAuth override above).
    resolved.STREAMING_ENABLED = true;
  }
  // Phase 05 D-01: apply derivation only when caller did not explicitly set
  // OPENWHISPR_REALTIME_WSS_URL (resolveValue returns "" both when unset
  // (DEFAULT) and when explicitly set to ""; either way derivation is safe to
  // run because explicit "" + non-empty BACKEND_URL is a documented "I want
  // realtime through my backend" intent).
  if (
    !resolved.OPENWHISPR_REALTIME_WSS_URL &&
    resolved.OPENWHISPR_BACKEND_URL
  ) {
    resolved.OPENWHISPR_REALTIME_WSS_URL = deriveRealtimeWssUrl(
      resolved.OPENWHISPR_BACKEND_URL
    );
  }
  // Derive the webRequest Origin-rewrite filter patterns from the build's
  // real backend/auth URLs when the caller did not explicitly override the
  // pattern. resolveValue returns the DEFAULT literal both when unset and
  // when explicitly set to the default — to distinguish a real override we
  // check process.env directly (same intent as the WSS guard above).
  if (
    !Object.prototype.hasOwnProperty.call(process.env, "OPENWHISPR_BACKEND_URL_PATTERN") &&
    resolved.OPENWHISPR_BACKEND_URL
  ) {
    const p = deriveOriginPattern(resolved.OPENWHISPR_BACKEND_URL);
    if (p) resolved.OPENWHISPR_BACKEND_URL_PATTERN = p;
  }
  if (
    !Object.prototype.hasOwnProperty.call(process.env, "OPENWHISPR_AUTH_URL_PATTERN") &&
    resolved.OPENWHISPR_AUTH_URL
  ) {
    const p = deriveOriginPattern(resolved.OPENWHISPR_AUTH_URL);
    if (p) resolved.OPENWHISPR_AUTH_URL_PATTERN = p;
  }
  // Phase 05 B1 auto-disable: a default `npm run build` with no env vars
  // would otherwise produce a binary where STREAMING_ENABLED=true AND
  // OPENWHISPR_REALTIME_WSS_URL="" — which crashes on first record (per
  // openaiRealtimeStreaming.js's empty-URL guard). Default-build-works is
  // a release-blocking principle (see 05-CONTEXT.md SC-5), so when the
  // user did NOT explicitly opt in to streaming AND no realtime URL is
  // resolvable, force STREAMING_ENABLED back to false. Explicit
  // OPENWHISPR_STREAMING=true with no URL is the user's choice — we do
  // not override it; the runtime guard will surface the error.
  const userExplicitlyEnabledStreaming = Object.prototype.hasOwnProperty.call(
    process.env,
    "OPENWHISPR_STREAMING"
  );
  if (
    !userExplicitlyEnabledStreaming &&
    !resolved.PROVIDER_LOCKDOWN_ENABLED &&
    resolved.STREAMING_ENABLED &&
    !resolved.OPENWHISPR_REALTIME_WSS_URL
  ) {
    resolved.STREAMING_ENABLED = false;
  }
  // Lockdown wins over the B1 auto-disable even in a misconfigured edge case.
  if (resolved.PROVIDER_LOCKDOWN_ENABLED === true) {
    resolved.STREAMING_ENABLED = true;
  }
  return resolved;
}

function emitTs(resolved, outPath) {
  const lines = [
    "// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.",
    "// Renderer/TS consumers should NOT import this file directly — import src/config/defaults.ts instead.",
    "",
  ];
  for (const key of KEYS) {
    lines.push(`export const ${key} = ${JSON.stringify(resolved[key])};`);
  }
  for (const boolKey of BOOL_KEYS) {
    lines.push(`export const ${boolKey} = ${JSON.stringify(resolved[boolKey])};`);
  }
  lines.push(
    `export const OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN = ${JSON.stringify(resolved.OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN)};`
  );
  lines.push("");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

function emitCjs(resolved, outPath) {
  const entries = [];
  for (const key of KEYS) {
    entries.push(`  ${key}: ${JSON.stringify(resolved[key])}`);
  }
  for (const boolKey of BOOL_KEYS) {
    entries.push(`  ${boolKey}: ${JSON.stringify(resolved[boolKey])}`);
  }
  entries.push(
    `  OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN: ${JSON.stringify(resolved.OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN)}`
  );
  const body = [
    "// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.",
    "// Main-process / CommonJS consumers require this module directly — DO NOT require defaults.ts.",
    "",
    '"use strict";',
    "",
    "module.exports = Object.freeze({",
    entries.join(",\n"),
    "});",
    "",
  ].join("\n");
  fs.writeFileSync(outPath, body, "utf8");
}

// Phase 04.1 PLAN-02 Task 3: emit preload-gcal.generated.cjs.
//
// preload.js is shipped verbatim by electron-builder, so a runtime
// `BuildConfig.OAUTH_GOOGLE_ENABLED ? {...} : {}` conditional spread would
// leave the literal `gcalStartOAuth` / `gcalDisconnect` /
// `onGcalConnectionChanged` strings in the shipped preload source — defeating
// CFG-07 at the preload trust boundary.
//
// Instead we code-generate this preload-gcal factory: when Google is enabled
// the file contains the full IPC method block; when disabled it is a no-op
// returning {}. The literal method names physically exist in the build only
// when the provider is enabled.
//
// preload.js consumes via:
//   const buildGcalApi = require("./preload-gcal.generated.cjs");
//   ...buildGcalApi(ipcRenderer, registerListener),
function emitPreloadGcal(resolved, outPath) {
  const enabled = resolved.OAUTH_GOOGLE_ENABLED === true;
  const header = [
    "// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.",
    "// Phase 04.1 CFG-07: build-time gate over the Google Calendar preload IPC method",
    "// exposures. When OAUTH_GOOGLE_ENABLED=false the factory returns {} and the literal",
    "// method names are physically absent from this file (verified by",
    "// scripts/verify-oauth-gating.js#PRELOAD_TARGETS).",
    "",
    '"use strict";',
    "",
  ].join("\n");

  let body;
  if (enabled) {
    body = [
      "module.exports = function buildGcalApi(ipcRenderer, registerListener) {",
      "  return {",
      '    gcalStartOAuth: () => ipcRenderer.invoke("gcal-start-oauth"),',
      '    gcalDisconnect: (email) => ipcRenderer.invoke("gcal-disconnect", email),',
      '    gcalGetConnectionStatus: () => ipcRenderer.invoke("gcal-get-connection-status"),',
      '    gcalGetCalendars: () => ipcRenderer.invoke("gcal-get-calendars"),',
      "    gcalSetCalendarSelection: (calendarId, isSelected) =>",
      '      ipcRenderer.invoke("gcal-set-calendar-selection", calendarId, isSelected),',
      '    gcalSetPrimaryOnly: (value) => ipcRenderer.invoke("gcal-set-primary-only", value),',
      '    gcalSyncEvents: () => ipcRenderer.invoke("gcal-sync-events"),',
      "    gcalGetUpcomingEvents: (windowMinutes) =>",
      '      ipcRenderer.invoke("gcal-get-upcoming-events", windowMinutes),',
      '    gcalGetEvent: (eventId) => ipcRenderer.invoke("gcal-get-event", eventId),',
      "    onGcalMeetingStarting: registerListener(",
      '      "gcal-meeting-starting",',
      "      (callback) => (_event, data) => callback(data)",
      "    ),",
      "    onGcalMeetingEnded: registerListener(",
      '      "gcal-meeting-ended",',
      "      (callback) => (_event, data) => callback(data)",
      "    ),",
      "    onGcalStartRecording: registerListener(",
      '      "gcal-start-recording",',
      "      (callback) => (_event, data) => callback(data)",
      "    ),",
      "    onGcalConnectionChanged: registerListener(",
      '      "gcal-connection-changed",',
      "      (callback) => (_event, data) => callback(data)",
      "    ),",
      "    onGcalEventsSynced: registerListener(",
      '      "gcal-events-synced",',
      "      (callback) => (_event, data) => callback(data)",
      "    ),",
      "  };",
      "};",
      "",
    ].join("\n");
  } else {
    body = [
      "// OAUTH_GOOGLE_ENABLED=false at build time — no Google Calendar preload methods exposed.",
      "module.exports = function buildGcalApi() {",
      "  return {};",
      "};",
      "",
    ].join("\n");
  }

  fs.writeFileSync(outPath, header + body, "utf8");
}

// Phase 04.1 PLAN-03 Task 2: emit preload-billing.generated.cjs.
//
// Mirrors emitPreloadGcal: when BILLING_ENABLED=true the file exports a
// factory returning the four Stripe IPC method bindings; when false it
// returns {} and contains zero `cloud*` literals. preload.js does:
//   const buildBillingApi = require("./preload-billing.generated.cjs");
//   ...buildBillingApi(ipcRenderer),
function emitPreloadBilling(resolved, outPath) {
  const enabled = resolved.BILLING_ENABLED === true;
  const header = [
    "// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.",
    "// Phase 04.1 CFG-09 (PLAN-03): build-time gate over the Stripe billing preload IPC method",
    "// exposures. When BILLING_ENABLED=false the factory returns {} and the literal method",
    "// names are physically absent from this file (verified by",
    "// scripts/verify-feature-gating.js).",
    "",
    '"use strict";',
    "",
  ].join("\n");

  let body;
  if (enabled) {
    body = [
      "module.exports = function buildBillingApi(ipcRenderer) {",
      "  return {",
      '    cloudCheckout: (opts) => ipcRenderer.invoke("cloud-checkout", opts),',
      '    cloudBillingPortal: () => ipcRenderer.invoke("cloud-billing-portal"),',
      '    cloudSwitchPlan: (opts) => ipcRenderer.invoke("cloud-switch-plan", opts),',
      '    cloudPreviewSwitch: (opts) => ipcRenderer.invoke("cloud-preview-switch", opts),',
      "  };",
      "};",
      "",
    ].join("\n");
  } else {
    body = [
      "// BILLING_ENABLED=false at build time — no Stripe billing preload methods exposed.",
      "module.exports = function buildBillingApi() {",
      "  return {};",
      "};",
      "",
    ].join("\n");
  }

  fs.writeFileSync(outPath, header + body, "utf8");
}

// Phase 04.1 PLAN-04 (CFG-09 REFERRALS_ENABLED): mirrors emitPreloadBilling.
// When REFERRALS_ENABLED=true the file exports a factory returning the three
// referral IPC method bindings; when false it returns {} and contains zero
// referral literals. preload.js does:
//   const buildReferralsApi = require("./preload-referrals.generated.cjs");
//   ...buildReferralsApi(ipcRenderer),
function emitPreloadReferrals(resolved, outPath) {
  const enabled = resolved.REFERRALS_ENABLED === true;
  const header = [
    "// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.",
    "// Phase 04.1 CFG-09 (PLAN-04): build-time gate over the referral preload IPC method",
    "// exposures. When REFERRALS_ENABLED=false the factory returns {} and the literal method",
    "// names are physically absent from this file (verified by",
    "// scripts/verify-feature-gating.js).",
    "",
    '"use strict";',
    "",
  ].join("\n");

  let body;
  if (enabled) {
    body = [
      "module.exports = function buildReferralsApi(ipcRenderer) {",
      "  return {",
      '    getReferralStats: () => ipcRenderer.invoke("get-referral-stats"),',
      '    sendReferralInvite: (email) => ipcRenderer.invoke("send-referral-invite", email),',
      '    getReferralInvites: () => ipcRenderer.invoke("get-referral-invites"),',
      "  };",
      "};",
      "",
    ].join("\n");
  } else {
    body = [
      "// REFERRALS_ENABLED=false at build time — no referral preload methods exposed.",
      "module.exports = function buildReferralsApi() {",
      "  return {};",
      "};",
      "",
    ].join("\n");
  }

  fs.writeFileSync(outPath, header + body, "utf8");
}

// Phase 04.1 PLAN-05 (CFG-09 STREAMING_ENABLED): mirrors emitPreloadBilling /
// emitPreloadReferrals. When STREAMING_ENABLED=true the file exports a factory
// returning the AssemblyAI + Deepgram WebSocket streaming IPC method bindings;
// when false it returns {} and contains zero streaming literals. preload.js does:
//   const buildStreamingApi = require("./preload-streaming.generated.cjs");
//   ...buildStreamingApi(ipcRenderer, registerListener),
function emitPreloadStreaming(resolved, outPath) {
  const enabled = resolved.STREAMING_ENABLED === true;
  const header = [
    "// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.",
    "// Phase 04.1 CFG-09 (PLAN-05): build-time gate over the AssemblyAI + Deepgram WebSocket",
    "// realtime ASR preload IPC method exposures. When STREAMING_ENABLED=false the factory",
    "// returns {} and the literal method names are physically absent from this file (verified",
    "// by scripts/verify-feature-gating.js).",
    "",
    '"use strict";',
    "",
  ].join("\n");

  let body;
  if (enabled) {
    body = [
      "module.exports = function buildStreamingApi(ipcRenderer, registerListener) {",
      "  return {",
      '    assemblyAiStreamingWarmup: (options) => ipcRenderer.invoke("assemblyai-streaming-warmup", options),',
      '    assemblyAiStreamingStart: (options) => ipcRenderer.invoke("assemblyai-streaming-start", options),',
      '    assemblyAiStreamingSend: (audioBuffer) => ipcRenderer.send("assemblyai-streaming-send", audioBuffer),',
      '    assemblyAiStreamingForceEndpoint: () => ipcRenderer.send("assemblyai-streaming-force-endpoint"),',
      '    assemblyAiStreamingStop: () => ipcRenderer.invoke("assemblyai-streaming-stop"),',
      '    assemblyAiStreamingStatus: () => ipcRenderer.invoke("assemblyai-streaming-status"),',
      "    onAssemblyAiPartialTranscript: registerListener(",
      '      "assemblyai-partial-transcript",',
      "      (callback) => (_event, text) => callback(text)",
      "    ),",
      "    onAssemblyAiFinalTranscript: registerListener(",
      '      "assemblyai-final-transcript",',
      "      (callback) => (_event, text) => callback(text)",
      "    ),",
      "    onAssemblyAiError: registerListener(",
      '      "assemblyai-error",',
      "      (callback) => (_event, error) => callback(error)",
      "    ),",
      "    onAssemblyAiSessionEnd: registerListener(",
      '      "assemblyai-session-end",',
      "      (callback) => (_event, data) => callback(data)",
      "    ),",
      '    deepgramStreamingWarmup: (options) => ipcRenderer.invoke("deepgram-streaming-warmup", options),',
      '    deepgramStreamingStart: (options) => ipcRenderer.invoke("deepgram-streaming-start", options),',
      '    deepgramStreamingSend: (audioBuffer) => ipcRenderer.send("deepgram-streaming-send", audioBuffer),',
      '    deepgramStreamingFinalize: () => ipcRenderer.send("deepgram-streaming-finalize"),',
      '    deepgramStreamingStop: () => ipcRenderer.invoke("deepgram-streaming-stop"),',
      '    deepgramStreamingStatus: () => ipcRenderer.invoke("deepgram-streaming-status"),',
      "    onDeepgramPartialTranscript: registerListener(",
      '      "deepgram-partial-transcript",',
      "      (callback) => (_event, text) => callback(text)",
      "    ),",
      "    onDeepgramFinalTranscript: registerListener(",
      '      "deepgram-final-transcript",',
      "      (callback) => (_event, text) => callback(text)",
      "    ),",
      "    onDeepgramError: registerListener(",
      '      "deepgram-error",',
      "      (callback) => (_event, error) => callback(error)",
      "    ),",
      "    onDeepgramSessionEnd: registerListener(",
      '      "deepgram-session-end",',
      "      (callback) => (_event, data) => callback(data)",
      "    ),",
      "  };",
      "};",
      "",
    ].join("\n");
  } else {
    body = [
      "// STREAMING_ENABLED=false at build time — no realtime ASR preload methods exposed.",
      "module.exports = function buildStreamingApi() {",
      "  return {};",
      "};",
      "",
    ].join("\n");
  }

  fs.writeFileSync(outPath, header + body, "utf8");
}

// Phase 10 PLAN-05 (PLD-05 PROVIDER_LOCKDOWN_ENABLED): mirrors emitPreloadBilling /
// emitPreloadReferrals / emitPreloadStreaming. When PROVIDER_LOCKDOWN_ENABLED is
// NOT true the file exports a factory returning the BYOK + enterprise key IPC
// method bindings; when lockdown is on it returns {} and contains zero BYOK /
// enterprise key literals. preload.js does:
//   const buildByokApi = require("./preload-byok.generated.cjs");
//   ...buildByokApi(ipcRenderer),
function emitPreloadByok(resolved, outPath) {
  const lockdown = resolved.PROVIDER_LOCKDOWN_ENABLED === true;
  const header = [
    "// AUTO-GENERATED — do not edit. Produced by scripts/generate-build-config.js at build time.",
    "// Phase 10 PLD-05 (PLAN-05): build-time gate over the BYOK + enterprise key preload IPC",
    "// method exposures. When PROVIDER_LOCKDOWN_ENABLED=true the factory returns {} and the",
    "// literal method names are physically absent from this file (verified by",
    "// scripts/verify-feature-gating.js).",
    "",
    '"use strict";',
    "",
  ].join("\n");

  let body;
  if (!lockdown) {
    body = [
      "module.exports = function buildByokApi(ipcRenderer) {",
      "  return {",
      "    // BYOK per-provider API keys",
      '    getOpenAIKey: () => ipcRenderer.invoke("get-openai-key"),',
      '    saveOpenAIKey: (key) => ipcRenderer.invoke("save-openai-key", key),',
      '    getAnthropicKey: () => ipcRenderer.invoke("get-anthropic-key"),',
      '    saveAnthropicKey: (key) => ipcRenderer.invoke("save-anthropic-key", key),',
      '    getGeminiKey: () => ipcRenderer.invoke("get-gemini-key"),',
      '    saveGeminiKey: (key) => ipcRenderer.invoke("save-gemini-key", key),',
      '    getGroqKey: () => ipcRenderer.invoke("get-groq-key"),',
      '    saveGroqKey: (key) => ipcRenderer.invoke("save-groq-key", key),',
      '    getMistralKey: () => ipcRenderer.invoke("get-mistral-key"),',
      '    saveMistralKey: (key) => ipcRenderer.invoke("save-mistral-key", key),',
      '    proxyMistralTranscription: (data) => ipcRenderer.invoke("proxy-mistral-transcription", data),',
      '    getCustomTranscriptionKey: () => ipcRenderer.invoke("get-custom-transcription-key"),',
      '    saveCustomTranscriptionKey: (key) => ipcRenderer.invoke("save-custom-transcription-key", key),',
      '    getCleanupCustomKey: () => ipcRenderer.invoke("get-cleanup-custom-key"),',
      '    saveCleanupCustomKey: (key) => ipcRenderer.invoke("save-cleanup-custom-key", key),',
      "    // Enterprise provider key management (Bedrock / Azure / Vertex)",
      '    getBedrockRegion: () => ipcRenderer.invoke("get-bedrock-region"),',
      '    saveBedrockRegion: (value) => ipcRenderer.invoke("save-bedrock-region", value),',
      '    getBedrockProfile: () => ipcRenderer.invoke("get-bedrock-profile"),',
      '    saveBedrockProfile: (value) => ipcRenderer.invoke("save-bedrock-profile", value),',
      '    getBedrockAccessKeyId: () => ipcRenderer.invoke("get-bedrock-access-key-id"),',
      '    saveBedrockAccessKeyId: (key) => ipcRenderer.invoke("save-bedrock-access-key-id", key),',
      '    getBedrockSecretAccessKey: () => ipcRenderer.invoke("get-bedrock-secret-access-key"),',
      '    saveBedrockSecretAccessKey: (key) => ipcRenderer.invoke("save-bedrock-secret-access-key", key),',
      '    getBedrockSessionToken: () => ipcRenderer.invoke("get-bedrock-session-token"),',
      '    saveBedrockSessionToken: (key) => ipcRenderer.invoke("save-bedrock-session-token", key),',
      '    getAzureEndpoint: () => ipcRenderer.invoke("get-azure-endpoint"),',
      '    saveAzureEndpoint: (value) => ipcRenderer.invoke("save-azure-endpoint", value),',
      '    getAzureApiKey: () => ipcRenderer.invoke("get-azure-api-key"),',
      '    saveAzureApiKey: (key) => ipcRenderer.invoke("save-azure-api-key", key),',
      '    getAzureDeployment: () => ipcRenderer.invoke("get-azure-deployment"),',
      '    saveAzureDeployment: (value) => ipcRenderer.invoke("save-azure-deployment", value),',
      '    getAzureApiVersion: () => ipcRenderer.invoke("get-azure-api-version"),',
      '    saveAzureApiVersion: (value) => ipcRenderer.invoke("save-azure-api-version", value),',
      '    getVertexProject: () => ipcRenderer.invoke("get-vertex-project"),',
      '    saveVertexProject: (value) => ipcRenderer.invoke("save-vertex-project", value),',
      '    getVertexLocation: () => ipcRenderer.invoke("get-vertex-location"),',
      '    saveVertexLocation: (value) => ipcRenderer.invoke("save-vertex-location", value),',
      '    getVertexApiKey: () => ipcRenderer.invoke("get-vertex-api-key"),',
      '    saveVertexApiKey: (key) => ipcRenderer.invoke("save-vertex-api-key", key),',
      "    testEnterpriseConnection: (provider, config) =>",
      '      ipcRenderer.invoke("test-enterprise-connection", provider, config),',
      "    processEnterpriseReasoning: (text, modelId, agentName, config) =>",
      '      ipcRenderer.invoke("process-enterprise-reasoning", text, modelId, agentName, config),',
      "  };",
      "};",
      "",
    ].join("\n");
  } else {
    body = [
      "// PROVIDER_LOCKDOWN_ENABLED=true at build time — no BYOK / enterprise key preload methods exposed.",
      "module.exports = function buildByokApi() {",
      "  return {};",
      "};",
      "",
    ].join("\n");
  }

  fs.writeFileSync(outPath, header + body, "utf8");
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const tsOut = path.join(repoRoot, "src", "config", "build-config.generated.ts");
  const cjsOut = path.join(repoRoot, "src", "config", "build-config.generated.cjs");
  const preloadGcalOut = path.join(repoRoot, "preload-gcal.generated.cjs");
  const preloadBillingOut = path.join(repoRoot, "preload-billing.generated.cjs");
  const preloadReferralsOut = path.join(repoRoot, "preload-referrals.generated.cjs");
  const preloadStreamingOut = path.join(repoRoot, "preload-streaming.generated.cjs");
  const preloadByokOut = path.join(repoRoot, "preload-byok.generated.cjs");

  const outDir = path.dirname(tsOut);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const resolved = buildResolved();
  emitTs(resolved, tsOut);
  emitCjs(resolved, cjsOut);
  emitPreloadGcal(resolved, preloadGcalOut);
  emitPreloadBilling(resolved, preloadBillingOut);
  emitPreloadReferrals(resolved, preloadReferralsOut);
  emitPreloadStreaming(resolved, preloadStreamingOut);
  emitPreloadByok(resolved, preloadByokOut);

  // eslint-disable-next-line no-console
  console.log(
    "[build-config] wrote src/config/build-config.generated.{ts,cjs} + preload-{gcal,billing,referrals,streaming,byok}.generated.cjs (17 string keys + 7 booleans)"
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  deriveRealtimeWssUrl,
  resolveBool,
  resolveValue,
  buildResolved,
  DEFAULTS,
  BOOL_DEFAULTS,
  KEYS,
  BOOL_KEYS,
};
