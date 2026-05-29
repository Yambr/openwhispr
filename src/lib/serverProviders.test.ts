import { describe, it, expect } from "vitest";
import { parseProvidersResponse, resolveProviderView, fetchServerProviders } from "./serverProviders";

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

  it("trims surrounding whitespace before storing/truncating the name", () => {
    const out = parseProvidersResponse({
      providers: [{ id: "a", name: "  Company SSO  ", enabled: true }],
    });
    expect(out[0].name).toBe("Company SSO");
  });

  it("a disabled first duplicate does not poison the seen set (later enabled dup survives)", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "google", name: "Disabled First", enabled: false },
        { id: "google", name: "Enabled Second", enabled: true },
      ],
    });
    expect(out.map((p) => p.id)).toEqual(["google"]);
    expect(out[0].name).toBe("Enabled Second");
  });
});

describe("resolveProviderView", () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    key === "auth.social.continueWith" ? `Continue with ${opts?.provider}` : key;

  it("known brand google -> brand i18n label + google icon hint", () => {
    const v = resolveProviderView({ id: "google", name: "Google", iconHint: "google" }, t);
    expect(v.iconHint).toBe("google");
    expect(v.displayLabel).toBe("auth.social.continueWithGoogle");
  });

  it("github -> continueWith template with server name (no upstream brand key)", () => {
    const v = resolveProviderView({ id: "github", name: "GitHub", iconHint: "github" }, t);
    expect(v.iconHint).toBe("github");
    expect(v.displayLabel).toBe("Continue with GitHub");
  });

  it("oidc/generic -> continueWith template with the server name", () => {
    const v = resolveProviderView(
      { id: "oidc", name: "Company SSO", iconHint: "generic" },
      t
    );
    expect(v.iconHint).toBe("generic");
    expect(v.displayLabel).toBe("Continue with Company SSO");
  });

  it("carries id through unchanged for the click handler", () => {
    expect(
      resolveProviderView({ id: "oidc", name: "X", iconHint: "generic" }, t).id
    ).toBe("oidc");
  });
});

describe("fetchServerProviders", () => {
  it("returns parsed providers on 200 (real shape)", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          providers: [{ id: "google", name: "Google", enabled: true }],
          emailVerification: { required: true, configured: true },
        }),
      }) as unknown as Response;
    const out = await fetchServerProviders("https://srv.example", fetchImpl);
    expect(out.map((p) => p.id)).toEqual(["google"]);
  });

  it("returns [] when baseUrl is empty (no fetch performed)", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return {} as Response;
    };
    const out = await fetchServerProviders("", fetchImpl);
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns [] on non-2xx", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response;
    expect(await fetchServerProviders("https://srv.example", fetchImpl)).toEqual([]);
  });

  it("returns [] on network throw", async () => {
    const fetchImpl = async () => {
      throw new Error("network down");
    };
    expect(await fetchServerProviders("https://srv.example", fetchImpl)).toEqual([]);
  });

  it("returns [] when body fails validation", async () => {
    const fetchImpl = async () =>
      ({ ok: true, status: 200, json: async () => ({ garbage: true }) }) as Response;
    expect(await fetchServerProviders("https://srv.example", fetchImpl)).toEqual([]);
  });

  it("strips a trailing slash on baseUrl", async () => {
    let calledUrl = "";
    const fetchImpl = async (url: string) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => ({ providers: [] }) } as Response;
    };
    await fetchServerProviders("https://srv.example/", fetchImpl);
    expect(calledUrl).toBe("https://srv.example/api/auth/providers");
  });
});
