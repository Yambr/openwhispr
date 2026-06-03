// Phase 06 (final-review CRITICAL catch) — regression test.
//
// Bug: signInWithSocial() used to begin with
//   if (PROVIDER_LOCKDOWN_ENABLED) return { error: "Provider not enabled in this build" };
// After Phase 06 D3 decoupled lockdown from social sign-in (social is now
// server-driven via GET /api/auth/providers, and Task 8 removed the cascade
// that forced OAUTH_*_ENABLED=false under lockdown), a lockdown build has
// PROVIDER_LOCKDOWN_ENABLED=true AND OAUTH_*_ENABLED=true. The server-driven
// buttons rendered, but every click hit that early-return and died.
//
// This test pins the fix: under a lockdown build-config, signInWithSocial("oidc")
// must NOT short-circuit — it must reach the desktop-signin deep-link.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const AUTH_URL = "https://auth.example.com";

// Mock the build-time config the bug used to read. Lockdown ON, OAUTH ON —
// exactly the post-Task-8 lockdown build that exposed the bug.
vi.mock("../../src/config/defaults", () => ({
  OAUTH_GOOGLE_ENABLED: true,
  OAUTH_APPLE_ENABLED: true,
  OAUTH_MICROSOFT_ENABLED: true,
  PROVIDER_LOCKDOWN_ENABLED: true,
  OPENWHISPR_AUTH_URL: AUTH_URL,
  OPENWHISPR_BACKEND_URL: "https://api.example.com",
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL: "https://auth.example.com/desktop-callback",
  OPENWHISPR_OAUTH_RESET_PASSWORD_URL: "https://auth.example.com/reset",
}));

// better-auth's createAuthClient — not exercised on the Electron path, but
// auth.ts imports it at module load.
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    useSession: vi.fn(() => ({ data: null })),
  }),
}));

// settingsStore — auth.ts subscribes/getState at module load.
let storeState = { serverUrl: null };
vi.mock("../../src/stores/settingsStore", () => ({
  useSettingsStore: {
    getState: () => storeState,
    subscribe: () => () => {},
  },
}));

// Capture the deep-link URL that openExternalLink is asked to open.
const openedUrls = [];
vi.mock("../../src/utils/externalLinks", () => ({
  openExternalLink: (url) => openedUrls.push(url),
  createExternalLinkHandler: () => () => {},
}));

// Electron path: window.electronAPI present, getOAuthProtocol returns a scheme.
globalThis.window = {
  electronAPI: {
    notifyServerUrlChanged: vi.fn(),
    authGetToken: async () => "",
    getOAuthProtocol: async () => "openwhispr",
  },
};

async function loadAuthModule() {
  vi.resetModules();
  return await import("../../src/lib/auth.ts");
}

describe("signInWithSocial under PROVIDER_LOCKDOWN_ENABLED (Phase 06 D3 regression)", () => {
  beforeEach(() => {
    openedUrls.length = 0;
    storeState = { serverUrl: null };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT early-return the lockdown error for a server-driven 'oidc' provider", async () => {
    const { signInWithSocial } = await loadAuthModule();
    const result = await signInWithSocial("oidc");
    expect(result.error).toBeUndefined();
  });

  it("reaches the /api/desktop-signin/oidc deep-link under lockdown", async () => {
    const { signInWithSocial } = await loadAuthModule();
    await signInWithSocial("oidc");
    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toContain(`${AUTH_URL}/api/desktop-signin/oidc`);
    // callbackURL (URL-encoded) carries the resolved protocol scheme.
    expect(openedUrls[0]).toContain("protocol%3Dopenwhispr");
  });

  it("still works for a server-driven 'github' provider under lockdown", async () => {
    const { signInWithSocial } = await loadAuthModule();
    const result = await signInWithSocial("github");
    expect(result.error).toBeUndefined();
    expect(openedUrls[0]).toContain(`${AUTH_URL}/api/desktop-signin/github`);
  });
});

// MEDIUM-01 — id-format validation before URL construction.
//
// SocialProvider was widened to (string & {}) in Phase 06, so signInWithSocial
// now accepts arbitrary strings. The in-app UI passes a parser-validated id and
// the host is anchored to the build-time AUTH_URL (no cross-host SSRF), but the
// function's own comment admits stale localStorage / remote commands could call
// it with an arbitrary id that would otherwise land in the
// /api/desktop-signin/<id> URL path. The closed-union used to guarantee
// validation; this test pins the defense-in-depth ID_RE guard that restores it.
describe("signInWithSocial id-format validation (MEDIUM-01)", () => {
  beforeEach(() => {
    openedUrls.length = 0;
    storeState = { serverUrl: null };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Path-traversal, whitespace, and empty-string ids must be rejected up front:
  // an error is returned and NO desktop-signin URL is ever built/opened.
  it.each([
    ["../../../etc/passwd"],
    ["evil id"],
    [""],
    ["UPPER"], // canonical ids are lowercase
    ["a/b"],
    ["https://attacker.example"],
    ["x".repeat(33)], // exceeds the 32-char id cap
  ])("rejects %j without constructing a desktop-signin URL", async (badId) => {
    const { signInWithSocial } = await loadAuthModule();
    const result = await signInWithSocial(badId);
    expect(result.error).toBeInstanceOf(Error);
    expect(openedUrls).toHaveLength(0);
  });

  // A valid canonical id still reaches the deep-link — the guard is not
  // over-broad.
  it("still reaches /api/desktop-signin/oidc for a valid 'oidc' id", async () => {
    const { signInWithSocial } = await loadAuthModule();
    const result = await signInWithSocial("oidc");
    expect(result.error).toBeUndefined();
    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toContain(`${AUTH_URL}/api/desktop-signin/oidc`);
  });

  it("accepts a hyphenated/underscored custom id like 'my_sso-1'", async () => {
    const { signInWithSocial } = await loadAuthModule();
    const result = await signInWithSocial("my_sso-1");
    expect(result.error).toBeUndefined();
    expect(openedUrls[0]).toContain(`${AUTH_URL}/api/desktop-signin/my_sso-1`);
  });
});

// finding #8 / HOST-03 — desktop OIDC sign-in must use runtime serverUrl, not
// build-time AUTH_URL, so a self-hosted deployment's OIDC flow stays on-prem.
describe("signInWithSocial honors runtime serverUrl (finding #8 / HOST-03)", () => {
  beforeEach(() => {
    openedUrls.length = 0;
    storeState = { serverUrl: null };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses runtime serverUrl as origin when serverUrl is set", async () => {
    storeState = { serverUrl: "https://org.example" };
    const { signInWithSocial } = await loadAuthModule();
    await signInWithSocial("oidc");
    expect(openedUrls).toHaveLength(1);
    expect(new URL(openedUrls[0]).origin).toBe("https://org.example");
    expect(openedUrls[0]).toContain("/api/desktop-signin/oidc");
  });

  it("falls back to build-time AUTH_URL origin when serverUrl is null", async () => {
    storeState = { serverUrl: null };
    const { signInWithSocial } = await loadAuthModule();
    await signInWithSocial("oidc");
    expect(openedUrls).toHaveLength(1);
    expect(new URL(openedUrls[0]).origin).toBe(AUTH_URL);
  });
});
