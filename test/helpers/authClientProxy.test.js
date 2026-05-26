// Phase 1 Plan 01-01 (TDD-RED) — Phase 1 Plan 01-05 (GREEN)
// Tests for the mutable Proxy wrapping authClient. The Proxy resolves
// baseURL from useSettingsStore.serverUrl on every property access and
// re-instantiates the inner createAuthClient when serverUrl changes.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock createAuthClient before importing the module under test.
const createdInstances = [];
const createAuthClientMock = vi.fn((opts) => {
  const instance = {
    __id: createdInstances.length,
    __baseURL: opts.baseURL,
    signIn: { email: vi.fn(async () => ({ ok: true, viaUrl: opts.baseURL })) },
    signOut: vi.fn(async () => ({ ok: true })),
    useSession: vi.fn(() => ({ data: null })),
  };
  createdInstances.push(instance);
  return instance;
});

vi.mock("better-auth/react", () => ({
  createAuthClient: (opts) => createAuthClientMock(opts),
}));

// Mock the Zustand store with a tiny in-memory replacement supporting
// getState() and subscribe().
let storeState = { serverUrl: null };
const storeSubscribers = new Set();
const useSettingsStoreMock = {
  getState: () => storeState,
  subscribe: (fn) => {
    storeSubscribers.add(fn);
    return () => storeSubscribers.delete(fn);
  },
  __setServerUrl: (url) => {
    const prev = storeState;
    storeState = { ...prev, serverUrl: url };
    for (const fn of storeSubscribers) fn(storeState, prev);
  },
};
vi.mock("../../src/stores/settingsStore", () => ({
  useSettingsStore: useSettingsStoreMock,
}));

// Stub window.electronAPI for the URL-change notification side effect.
const notifyServerUrlChanged = vi.fn();
globalThis.window = {
  electronAPI: {
    notifyServerUrlChanged,
    authGetToken: async () => "",
  },
};

// Default AUTH_URL — must mirror what src/lib/auth.ts uses.
const DEFAULT_AUTH_URL = "https://auth.openwhispr.com";

async function loadAuthModule() {
  // Reset vite/import meta env shim that auth.ts reads via import.meta.env
  // Vitest's vi.stubGlobal pattern doesn't directly work for import.meta.env;
  // src/lib/auth.ts reads import.meta.env.VITE_AUTH_URL || DEFAULT.
  // For the test we rely on the OR-fallback to DEFAULT.
  vi.resetModules();
  return await import("../../src/lib/auth.ts");
}

describe("authClient mutable Proxy (HOST-02)", () => {
  beforeEach(() => {
    createdInstances.length = 0;
    createAuthClientMock.mockClear();
    notifyServerUrlChanged.mockClear();
    storeState = { serverUrl: null };
    storeSubscribers.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses build-time AUTH_URL when no serverUrl is persisted", async () => {
    const { authClient } = await loadAuthModule();
    // Access a property — triggers lazy build of the inner instance.
    void authClient.signIn;
    expect(createAuthClientMock).toHaveBeenCalledTimes(1);
    expect(createAuthClientMock.mock.calls[0][0].baseURL).toBe(DEFAULT_AUTH_URL);
  });

  it("uses persisted serverUrl when set BEFORE first access", async () => {
    storeState = { serverUrl: "http://localhost:4001/auth" };
    const { authClient } = await loadAuthModule();
    void authClient.signIn;
    expect(createAuthClientMock.mock.calls[0][0].baseURL).toBe("http://localhost:4001/auth");
  });

  it("re-instantiates inner when serverUrl changes", async () => {
    const { authClient } = await loadAuthModule();
    void authClient.signIn; // first access — instance 0
    useSettingsStoreMock.__setServerUrl("http://localhost:4002/auth");
    void authClient.signIn; // second access — instance 1
    expect(createdInstances.length).toBe(2);
    expect(createdInstances[0].__baseURL).toBe(DEFAULT_AUTH_URL);
    expect(createdInstances[1].__baseURL).toBe("http://localhost:4002/auth");
  });

  it("does NOT re-instantiate when serverUrl is unchanged", async () => {
    const { authClient } = await loadAuthModule();
    void authClient.signIn;
    void authClient.signIn;
    void authClient.signIn;
    expect(createdInstances.length).toBe(1);
  });

  it("reverts to build-time default when serverUrl is cleared", async () => {
    storeState = { serverUrl: "http://localhost:4003/auth" };
    const { authClient } = await loadAuthModule();
    void authClient.signIn; // instance 0 — custom
    useSettingsStoreMock.__setServerUrl(null);
    void authClient.signIn; // instance 1 — default
    expect(createdInstances[1].__baseURL).toBe(DEFAULT_AUTH_URL);
  });

  it("binds method calls to the current inner instance", async () => {
    const { authClient } = await loadAuthModule();
    const result = await authClient.signIn.email({ email: "a@b.c", password: "x" });
    expect(result.ok).toBe(true);
    expect(result.viaUrl).toBe(DEFAULT_AUTH_URL);
  });

  it("notifies main process when serverUrl changes (D-02)", async () => {
    await loadAuthModule();
    useSettingsStoreMock.__setServerUrl("http://localhost:4004/auth");
    expect(notifyServerUrlChanged).toHaveBeenCalledWith("http://localhost:4004/auth");
  });

  it("preserves the authClient export symbol (upstream-parity, D-01)", async () => {
    const mod = await loadAuthModule();
    expect(mod.authClient).toBeDefined();
    // The named export must exist; consumers do `import { authClient } from "../lib/auth"`.
    expect(typeof mod.authClient).toBe("object");
  });
});
