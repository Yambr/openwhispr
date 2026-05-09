// Phase 07 PLAN-02: characterization tests for deriveRealtimeWssUrl().
// The function lives in scripts/generate-build-config.js (Phase 05 D-01).
// Rules under test (from impl comments):
//   - https:// → wss://, http:// → ws://
//   - any other protocol (ftp, file, ws, wss, data, etc.) → "" (fail-closed)
//   - empty / null / undefined input → ""
//   - malformed URL (URL constructor throws) → ""
//   - path prefix is preserved; trailing slash is stripped before /v1/realtime
//   - port is preserved
//   - query string (u.search) is preserved (token-in-query gateways)
//   - fragment (u.hash) is dropped (CR-03 — fragments would swallow downstream
//     `?intent=transcription` suffix)
//   - IPv6 host literal is preserved (u.host includes the brackets)
//
// vitest globals are enabled in vitest.config.ts (see Phase 07 PLAN-01 SUMMARY).

const { deriveRealtimeWssUrl } = require("../../scripts/generate-build-config");

describe("deriveRealtimeWssUrl()", () => {
  test("empty string → empty string", () => {
    expect(deriveRealtimeWssUrl("")).toBe("");
  });

  test("undefined → empty string", () => {
    expect(deriveRealtimeWssUrl(undefined)).toBe("");
  });

  test("null → empty string", () => {
    expect(deriveRealtimeWssUrl(null)).toBe("");
  });

  test("https://host → wss://host/v1/realtime", () => {
    expect(deriveRealtimeWssUrl("https://api.example.com")).toBe(
      "wss://api.example.com/v1/realtime"
    );
  });

  test("http://host → ws://host/v1/realtime", () => {
    expect(deriveRealtimeWssUrl("http://api.example.com")).toBe(
      "ws://api.example.com/v1/realtime"
    );
  });

  test("https://host/v1 → wss://host/v1/v1/realtime (sub-path preserved)", () => {
    expect(deriveRealtimeWssUrl("https://api.example.com/v1")).toBe(
      "wss://api.example.com/v1/v1/realtime"
    );
  });

  test("trailing slash on host → no double-slash before /v1/realtime", () => {
    expect(deriveRealtimeWssUrl("https://api.example.com/")).toBe(
      "wss://api.example.com/v1/realtime"
    );
  });

  test("trailing slash on sub-path → stripped before /v1/realtime", () => {
    expect(deriveRealtimeWssUrl("https://api.example.com/v1/")).toBe(
      "wss://api.example.com/v1/v1/realtime"
    );
  });

  test("explicit port preserved", () => {
    expect(deriveRealtimeWssUrl("https://api.example.com:8443")).toBe(
      "wss://api.example.com:8443/v1/realtime"
    );
  });

  test("query string preserved (token-in-query gateways)", () => {
    expect(deriveRealtimeWssUrl("https://api.example.com?token=foo")).toBe(
      "wss://api.example.com/v1/realtime?token=foo"
    );
  });

  test("fragment dropped (CR-03 — would swallow downstream intent=...)", () => {
    expect(deriveRealtimeWssUrl("https://api.example.com#frag")).toBe(
      "wss://api.example.com/v1/realtime"
    );
  });

  test("IPv6 literal host preserved (brackets retained)", () => {
    // url.host on URL("https://[::1]:8443") returns "[::1]:8443"
    expect(deriveRealtimeWssUrl("https://[::1]:8443")).toBe(
      "wss://[::1]:8443/v1/realtime"
    );
  });

  test("ftp:// → empty (non-http(s) protocol fail-closed)", () => {
    expect(deriveRealtimeWssUrl("ftp://example.com")).toBe("");
  });

  test("file:// → empty (non-http(s) protocol fail-closed)", () => {
    expect(deriveRealtimeWssUrl("file:///etc/passwd")).toBe("");
  });

  test("ws://... input → empty (only http/https are accepted on input side)", () => {
    // The function's job is to TRANSLATE http(s) → ws(s). A ws:// input is
    // either misuse (already a realtime URL — caller should bypass derivation)
    // or attack. Either way: empty.
    expect(deriveRealtimeWssUrl("ws://api.example.com")).toBe("");
  });

  test("malformed URL → empty (URL constructor throws → caught)", () => {
    expect(deriveRealtimeWssUrl("not a url")).toBe("");
  });

  test("https with both query AND sub-path", () => {
    expect(deriveRealtimeWssUrl("https://api.example.com/api?key=abc")).toBe(
      "wss://api.example.com/api/v1/realtime?key=abc"
    );
  });
});

// Phase 07 PLAN-03: tests for resolveBool(), resolveValue(), and the B1
// auto-disable matrix in buildResolved(). These read process.env, so each
// test snapshots+restores the environment to prevent cross-test leakage.

const {
  resolveBool,
  resolveValue,
  buildResolved,
  DEFAULTS,
  BOOL_DEFAULTS,
} = require("../../scripts/generate-build-config");

// Shared env isolation — each test starts with all OPENWHISPR_* unset.
let envSnapshot;
beforeEach(() => {
  envSnapshot = { ...process.env };
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("OPENWHISPR_")) delete process.env[k];
  }
});
afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, envSnapshot);
});

describe("resolveBool()", () => {
  test("env unset → returns BOOL_DEFAULTS value (true case: OAUTH_GOOGLE_ENABLED)", () => {
    expect(BOOL_DEFAULTS.OAUTH_GOOGLE_ENABLED).toBe(true);
    expect(resolveBool("OAUTH_GOOGLE_ENABLED")).toBe(true);
  });

  test("env unset → returns BOOL_DEFAULTS value (false case: BILLING_ENABLED)", () => {
    expect(BOOL_DEFAULTS.BILLING_ENABLED).toBe(false);
    expect(resolveBool("BILLING_ENABLED")).toBe(false);
  });

  test("env explicit \"false\" → false (regardless of default)", () => {
    process.env.OPENWHISPR_OAUTH_GOOGLE = "false";
    expect(resolveBool("OAUTH_GOOGLE_ENABLED")).toBe(false);
  });

  test("env explicit \"true\" → true", () => {
    process.env.OPENWHISPR_BILLING = "true";
    expect(resolveBool("BILLING_ENABLED")).toBe(true);
  });

  test("env empty string → true (anything-not-\"false\" → true)", () => {
    // This documents current behavior: empty string is "set" but != "false",
    // so it parses as true. If this seems wrong, that's a real-bug discovery.
    process.env.OPENWHISPR_BILLING = "";
    expect(resolveBool("BILLING_ENABLED")).toBe(true);
  });

  test("env \"0\" → true (only literal \"false\" disables)", () => {
    process.env.OPENWHISPR_BILLING = "0";
    expect(resolveBool("BILLING_ENABLED")).toBe(true);
  });

  test("env arbitrary garbage → true (only \"false\" disables)", () => {
    process.env.OPENWHISPR_OAUTH_GOOGLE = "yes-please";
    expect(resolveBool("OAUTH_GOOGLE_ENABLED")).toBe(true);
  });
});

describe("resolveValue()", () => {
  test("env unset → returns DEFAULTS[key]", () => {
    expect(resolveValue("OPENWHISPR_AUTH_URL")).toBe(DEFAULTS.OPENWHISPR_AUTH_URL);
  });

  test("env unset → BACKEND_URL default is empty string", () => {
    expect(resolveValue("OPENWHISPR_BACKEND_URL")).toBe("");
  });

  test("env explicit empty string → returns empty (overrides default — though default is also empty)", () => {
    process.env.OPENWHISPR_BACKEND_URL = "";
    expect(resolveValue("OPENWHISPR_BACKEND_URL")).toBe("");
  });

  test("env explicit empty string overrides non-empty default (AUTH_URL)", () => {
    process.env.OPENWHISPR_AUTH_URL = "";
    // hasOwnProperty check makes "" a valid override
    expect(resolveValue("OPENWHISPR_AUTH_URL")).toBe("");
  });

  test("env explicit value → returns that value", () => {
    process.env.OPENWHISPR_BACKEND_URL = "https://corp.example.com";
    expect(resolveValue("OPENWHISPR_BACKEND_URL")).toBe("https://corp.example.com");
  });
});

describe("buildResolved() — B1 auto-disable matrix (Phase 05 release-blocker)", () => {
  test("STREAMING unset + BACKEND_URL empty → STREAMING_ENABLED auto-disabled to false", () => {
    // Default offline build: no backend, no explicit streaming opt-in. Must
    // auto-disable so the binary doesn't crash on first record (the runtime
    // empty-URL guard in openaiRealtimeStreaming.js would otherwise throw).
    const r = buildResolved();
    expect(r.STREAMING_ENABLED).toBe(false);
    expect(r.OPENWHISPR_REALTIME_WSS_URL).toBe("");
  });

  test("STREAMING unset + BACKEND_URL set → STREAMING_ENABLED stays true (default), URL derives", () => {
    process.env.OPENWHISPR_BACKEND_URL = "https://api.example.com";
    const r = buildResolved();
    expect(r.STREAMING_ENABLED).toBe(true);
    expect(r.OPENWHISPR_REALTIME_WSS_URL).toBe("wss://api.example.com/v1/realtime");
  });

  test("STREAMING=true explicit + BACKEND_URL empty → STREAMING_ENABLED stays true (user choice)", () => {
    // User explicitly opted in — don't override. The runtime empty-URL guard
    // will surface the misconfiguration to them. This preserves the user's
    // intent and avoids silent disablement.
    process.env.OPENWHISPR_STREAMING = "true";
    const r = buildResolved();
    expect(r.STREAMING_ENABLED).toBe(true);
    expect(r.OPENWHISPR_REALTIME_WSS_URL).toBe("");
  });

  test("STREAMING=false explicit + BACKEND_URL set → STREAMING_ENABLED stays false (user opt-out)", () => {
    process.env.OPENWHISPR_STREAMING = "false";
    process.env.OPENWHISPR_BACKEND_URL = "https://api.example.com";
    const r = buildResolved();
    expect(r.STREAMING_ENABLED).toBe(false);
    // URL still derives — only STREAMING_ENABLED is gated by the user's opt-out.
    expect(r.OPENWHISPR_REALTIME_WSS_URL).toBe("wss://api.example.com/v1/realtime");
  });

  test("explicit OPENWHISPR_REALTIME_WSS_URL wins over derivation", () => {
    process.env.OPENWHISPR_BACKEND_URL = "https://api.example.com";
    process.env.OPENWHISPR_REALTIME_WSS_URL = "wss://realtime.other.example/ws";
    const r = buildResolved();
    expect(r.OPENWHISPR_REALTIME_WSS_URL).toBe("wss://realtime.other.example/ws");
    expect(r.STREAMING_ENABLED).toBe(true);
  });

  test("OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN reflects whether env was set", () => {
    // Unset case
    let r = buildResolved();
    expect(r.OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN).toBe(false);
    expect(r.OPENWHISPR_OAUTH_PROTOCOL_SCHEME).toBe("openwhispr");

    // Set case
    process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME = "corpwhispr";
    r = buildResolved();
    expect(r.OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN).toBe(true);
    expect(r.OPENWHISPR_OAUTH_PROTOCOL_SCHEME).toBe("corpwhispr");
  });
});
