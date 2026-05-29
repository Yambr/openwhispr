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
