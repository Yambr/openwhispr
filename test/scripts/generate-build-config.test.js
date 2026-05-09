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
