// quick-260604-gpc BL-01: deriveRealtimeWssUrl was relocated from
// scripts/generate-build-config.js (NOT packaged) into the packaged
// src/helpers/realtimeWssUrl.js so the main process can require it at runtime
// (RC-2). This test pins the derive contract at its new home and guards against
// the MODULE_NOT_FOUND regression by importing the packaged path directly.

import { describe, it, expect } from "vitest";
import { deriveRealtimeWssUrl } from "../../src/helpers/realtimeWssUrl.js";

describe("deriveRealtimeWssUrl (packaged helper, BL-01 relocation)", () => {
  it("https → wss with /v1/realtime appended", () => {
    expect(deriveRealtimeWssUrl("https://corp.internal")).toBe(
      "wss://corp.internal/v1/realtime"
    );
  });

  it("http → ws, preserves host:port (the corporate 10.177.236.0 case)", () => {
    expect(deriveRealtimeWssUrl("http://10.177.236.0:8080")).toBe(
      "ws://10.177.236.0:8080/v1/realtime"
    );
  });

  it("appends after an existing path prefix (backend rooted at /v1)", () => {
    expect(deriveRealtimeWssUrl("https://corp.internal/v1")).toBe(
      "wss://corp.internal/v1/v1/realtime"
    );
  });

  it("strips a trailing slash before appending", () => {
    expect(deriveRealtimeWssUrl("https://corp.internal/")).toBe(
      "wss://corp.internal/v1/realtime"
    );
  });

  it("preserves query string (token-in-query gateways)", () => {
    expect(deriveRealtimeWssUrl("https://corp.internal/?key=abc")).toBe(
      "wss://corp.internal/v1/realtime?key=abc"
    );
  });

  it("empty / null / undefined → '' (caller falls back to build-time constant)", () => {
    expect(deriveRealtimeWssUrl("")).toBe("");
    expect(deriveRealtimeWssUrl(null)).toBe("");
    expect(deriveRealtimeWssUrl(undefined)).toBe("");
  });

  it("non-http(s) scheme → '' (STREAMING auto-disables)", () => {
    expect(deriveRealtimeWssUrl("ftp://corp.internal")).toBe("");
    expect(deriveRealtimeWssUrl("file:///etc/passwd")).toBe("");
  });

  it("malformed URL → '' (no throw)", () => {
    expect(deriveRealtimeWssUrl("not a url")).toBe("");
    expect(deriveRealtimeWssUrl("://broken")).toBe("");
  });
});
