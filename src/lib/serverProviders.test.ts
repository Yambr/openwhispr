import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the settings store the same way auth.ts's resolveBaseURL reads it:
// resolveProvidersBaseUrl calls useSettingsStore.getState().serverUrl. In node
// env there's no real store wiring, so we mock the module and drive getState().
const mockState: { serverUrl: string | null } = { serverUrl: null };
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: {
    getState: () => mockState,
  },
}));

// Build-default backend used as the fallback when no custom serverUrl is set.
// Mock the defaults module so the test is independent of the generated build
// config (which is "" / a real URL depending on the bundle).
vi.mock("../config/defaults", () => ({
  OPENWHISPR_BACKEND_URL: "https://default.build.example",
}));

import {
  parseProvidersResponse,
  parseLocalLoginEnabled,
  selectAuthView,
  resolveProviderView,
  fetchServerProviders,
  resolveProvidersBaseUrl,
} from "./serverProviders";

describe("resolveProvidersBaseUrl", () => {
  beforeEach(() => {
    mockState.serverUrl = null;
  });

  it("returns the build-default backend when no custom serverUrl is set", () => {
    mockState.serverUrl = null;
    expect(resolveProvidersBaseUrl()).toBe("https://default.build.example");
  });

  it("returns the build-default backend when serverUrl is an empty string", () => {
    mockState.serverUrl = "";
    expect(resolveProvidersBaseUrl()).toBe("https://default.build.example");
  });

  it("returns the custom serverUrl when the user has typed one (self-hosting)", () => {
    mockState.serverUrl = "https://my-keycloak-host.example";
    expect(resolveProvidersBaseUrl()).toBe("https://my-keycloak-host.example");
  });

  it("custom serverUrl takes precedence over the build default", () => {
    mockState.serverUrl = "https://custom.example";
    expect(resolveProvidersBaseUrl()).not.toBe("https://default.build.example");
    expect(resolveProvidersBaseUrl()).toBe("https://custom.example");
  });

  it("does not append a path segment — the trailing-slash strip is fetchServerProviders' job", () => {
    // Mirror auth.ts: resolution returns the bare base; URL assembly (and the
    // trailing-slash strip) happens in fetchServerProviders so both layers
    // agree. A custom host with a trailing slash round-trips to the same
    // /api/auth/providers URL fetchServerProviders would build.
    mockState.serverUrl = "https://custom.example/";
    const resolved = resolveProvidersBaseUrl();
    expect(`${resolved.replace(/\/$/, "")}/api/auth/providers`).toBe(
      "https://custom.example/api/auth/providers"
    );
  });
});

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

describe("parseLocalLoginEnabled", () => {
  // Rule: return false IFF json is an object AND json.localLogin is an object
  // AND json.localLogin.enabled === false (strict). Everything else -> true.

  it("{ localLogin: { enabled: false } } -> false  (the ONLY disabling case)", () => {
    expect(parseLocalLoginEnabled({ localLogin: { enabled: false } })).toBe(false);
  });

  it("{ localLogin: { enabled: true } } -> true  (new-server default)", () => {
    expect(parseLocalLoginEnabled({ localLogin: { enabled: true } })).toBe(true);
  });

  it("{} -> true  (field absent: back-compat ON for old servers <=1.1.0)", () => {
    expect(parseLocalLoginEnabled({})).toBe(true);
  });

  it("{ localLogin: {} } -> true  (enabled absent inside object: ON)", () => {
    expect(parseLocalLoginEnabled({ localLogin: {} })).toBe(true);
  });

  it("{ localLogin: null } -> true  (null object: ON)", () => {
    expect(parseLocalLoginEnabled({ localLogin: null })).toBe(true);
  });

  it("{ localLogin: 'false' } -> true  (string 'false', not boolean: ON)", () => {
    expect(parseLocalLoginEnabled({ localLogin: "false" })).toBe(true);
  });

  it("null -> true  (non-object body: lockout-safe ON)", () => {
    expect(parseLocalLoginEnabled(null)).toBe(true);
  });

  it('"garbage" -> true  (string body: lockout-safe ON)', () => {
    expect(parseLocalLoginEnabled("garbage")).toBe(true);
  });

  it("42 -> true  (number body: lockout-safe ON)", () => {
    expect(parseLocalLoginEnabled(42)).toBe(true);
  });

  it("{ localLogin: { enabled: 0 } } -> true  (falsy non-boolean: ON, only strict false disables)", () => {
    expect(parseLocalLoginEnabled({ localLogin: { enabled: 0 } })).toBe(true);
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
    expect(out.providers.map((p) => p.id)).toEqual(["google"]);
  });

  it("returns { providers:[], localLoginEnabled:true } when baseUrl is empty (no fetch performed)", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return {} as Response;
    };
    const out = await fetchServerProviders("", fetchImpl);
    expect(out.providers).toEqual([]);
    expect(out.localLoginEnabled).toBe(true);
    expect(called).toBe(false);
  });

  it("returns { providers:[], localLoginEnabled:true } on non-2xx", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response;
    const out = await fetchServerProviders("https://srv.example", fetchImpl);
    expect(out.providers).toEqual([]);
    expect(out.localLoginEnabled).toBe(true);
  });

  it("returns { providers:[], localLoginEnabled:true } on network throw (lockout-safe)", async () => {
    const fetchImpl = async () => {
      throw new Error("network down");
    };
    const out = await fetchServerProviders("https://srv.example", fetchImpl);
    expect(out.providers).toEqual([]);
    expect(out.localLoginEnabled).toBe(true);
  });

  it("returns { providers:[], localLoginEnabled:true } when body fails validation", async () => {
    const fetchImpl = async () =>
      ({ ok: true, status: 200, json: async () => ({ garbage: true }) }) as Response;
    const out = await fetchServerProviders("https://srv.example", fetchImpl);
    expect(out.providers).toEqual([]);
    expect(out.localLoginEnabled).toBe(true);
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

  it("localLogin:{enabled:false} body yields localLoginEnabled:false", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          providers: [],
          localLogin: { enabled: false },
        }),
      }) as unknown as Response;
    const out = await fetchServerProviders("https://srv.example", fetchImpl);
    expect(out.localLoginEnabled).toBe(false);
  });

  it("localLogin:{enabled:true} body yields localLoginEnabled:true", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          providers: [{ id: "google", name: "Google", enabled: true }],
          localLogin: { enabled: true },
        }),
      }) as unknown as Response;
    const out = await fetchServerProviders("https://srv.example", fetchImpl);
    expect(out.localLoginEnabled).toBe(true);
    expect(out.providers.map((p) => p.id)).toEqual(["google"]);
  });
});

describe("selectAuthView", () => {
  // Node-testable gate decision for AuthenticationStep — keeps JSX thin and
  // policy unit-covered (vitest harness is node-only, no jsdom).
  // Truth table:
  //   { true,  0 } -> "local-and-sso"  (today's default when no SSO configured)
  //   { true,  2 } -> "local-and-sso"  (local always on when enabled, SSO also shows)
  //   { false, 2 } -> "sso-only"       (operator lockdown, SSO still available)
  //   { false, 0 } -> "no-methods"     (misconfig: locked + no SSO advertised)

  it("{ localLoginEnabled:true, providerCount:0 } -> 'local-and-sso' (today's default)", () => {
    expect(selectAuthView({ localLoginEnabled: true, providerCount: 0 })).toBe("local-and-sso");
  });

  it("{ localLoginEnabled:true, providerCount:2 } -> 'local-and-sso'", () => {
    expect(selectAuthView({ localLoginEnabled: true, providerCount: 2 })).toBe("local-and-sso");
  });

  it("{ localLoginEnabled:false, providerCount:2 } -> 'sso-only' (operator lockdown)", () => {
    expect(selectAuthView({ localLoginEnabled: false, providerCount: 2 })).toBe("sso-only");
  });

  it("{ localLoginEnabled:false, providerCount:0 } -> 'no-methods' (misconfig)", () => {
    expect(selectAuthView({ localLoginEnabled: false, providerCount: 0 })).toBe("no-methods");
  });

  it("{ localLoginEnabled:true, providerCount:1 } -> 'local-and-sso'", () => {
    expect(selectAuthView({ localLoginEnabled: true, providerCount: 1 })).toBe("local-and-sso");
  });
});
