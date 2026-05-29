import { describe, it, expect } from "vitest";
import { parseProvidersResponse } from "./serverProviders";

describe("parseProvidersResponse", () => {
  it("accepts the real server body (google/github/oidc + extra emailVerification key)", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "google", name: "Google", enabled: true },
        { id: "github", name: "GitHub", enabled: true },
        { id: "oidc", name: "Company SSO", enabled: true },
      ],
      emailVerification: { required: true, configured: true }, // ignored extra key
    });
    expect(out.map((p) => p.id)).toEqual(["google", "github", "oidc"]);
    expect(out.map((p) => p.name)).toEqual(["Google", "GitHub", "Company SSO"]);
  });

  it("derives iconHint from id (google/github known, oidc->generic)", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "google", name: "Google", enabled: true },
        { id: "github", name: "GitHub", enabled: true },
        { id: "oidc", name: "SSO", enabled: true },
      ],
    });
    expect(out.map((p) => p.iconHint)).toEqual(["google", "github", "generic"]);
  });

  it("returns [] for a non-object / missing providers", () => {
    expect(parseProvidersResponse(null)).toEqual([]);
    expect(parseProvidersResponse({})).toEqual([]);
    expect(parseProvidersResponse({ providers: "nope" })).toEqual([]);
  });

  it("filters out entries that are not enabled:true", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "google", name: "Google", enabled: true },
        { id: "github", name: "GitHub", enabled: false },
        { id: "oidc", name: "SSO" }, // missing enabled
      ],
    });
    expect(out.map((p) => p.id)).toEqual(["google"]);
  });

  it("drops entries with an invalid id but keeps the rest", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "Google!", name: "x", enabled: true },
        { id: "ok-provider", name: "OK", enabled: true },
        { id: "", name: "empty", enabled: true },
      ],
    });
    expect(out.map((p) => p.id)).toEqual(["ok-provider"]);
  });

  it("dedupes by id, first wins", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "google", name: "First", enabled: true },
        { id: "google", name: "Second", enabled: true },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("First");
  });

  it("requires a non-empty string name, drops entries without one", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "a", name: "", enabled: true },
        { id: "b", enabled: true },
        { id: "c", name: "Good", enabled: true },
      ],
    });
    expect(out.map((p) => p.id)).toEqual(["c"]);
  });

  it("truncates names longer than 40 chars", () => {
    const long = "x".repeat(60);
    const out = parseProvidersResponse({ providers: [{ id: "a", name: long, enabled: true }] });
    expect(out[0].name).toHaveLength(40);
  });
});
