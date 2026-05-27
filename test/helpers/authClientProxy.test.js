// Phase 1 Plan 01-01 (TDD-RED) — Phase 1 Plan 01-05 (GREEN)
// Tests for the mutable Proxy wrapping authClient. The Proxy resolves
// baseURL from useSettingsStore.serverUrl on every property access and
// re-instantiates the inner createAuthClient when serverUrl changes.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock createAuthClient before importing the module under test.
// The mock for signIn.email + useSession is a plain object (these are leaf
// properties accessed via dotted path). signOut is wrapped in a better-auth-
// style dynamic path proxy so the outer authClient Proxy's apply-trap is
// exercised against a callable proxy — this catches the v1.7.10 regression
// where `(cur as Function).apply(parent, args)` invoked better-auth's
// get-trap for the "apply" property instead of dispatching the call. A flat
// vi.fn() does NOT have that trap and silently hid the bug.
const createdInstances = [];
const proxyCalls = [];
function makeBetterAuthLikeProxy(routePath, opts) {
  // Mirrors node_modules/better-auth/dist/client/proxy.mjs:
  //  - get trap returns a new proxy for any non-then/catch/finally string prop
  //  - apply trap dispatches the HTTP call (here just records and returns ok)
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
      // For deeper paths in real better-auth this would recurse; for signOut
      // it's a single-segment call, so we just return another sub-proxy.
      return makeBetterAuthLikeProxy(`${routePath}/${prop}`, opts);
    },
    apply(_t, _thisArg, args) {
      // Record what URL segment was actually invoked so the test can assert
      // we hit "/sign-out", not "/sign-out/apply" or any other suffix.
      proxyCalls.push({ routePath, baseURL: opts.baseURL, args });
      return Promise.resolve({ ok: true, routePath });
    },
  });
}
const createAuthClientMock = vi.fn((opts) => {
  const instance = {
    __id: createdInstances.length,
    __baseURL: opts.baseURL,
    // Every callable leaf is wrapped in the better-auth-style proxy so the
    // outer authClient Proxy's apply-trap is exercised faithfully for ALL
    // call sites, not just signOut. v1.7.10's signOut regression was latent
    // in signIn/signUp too — luck-of-call-ordering hid it. Per v1.7.11
    // REVIEW.md WR-03.
    signIn: {
      email: makeBetterAuthLikeProxy("/sign-in/email", opts),
      social: makeBetterAuthLikeProxy("/sign-in/social", opts),
    },
    signUp: { email: makeBetterAuthLikeProxy("/sign-up/email", opts) },
    sendVerificationEmail: makeBetterAuthLikeProxy("/send-verification-email", opts),
    requestPasswordReset: makeBetterAuthLikeProxy("/request-password-reset", opts),
    signOut: makeBetterAuthLikeProxy("/sign-out", opts),
    // useSession stays a flat vi.fn() — better-auth's get-trap returns the
    // raw hook function for atom-bound hooks (proxy.mjs:24), so it never
    // reaches our apply-trap. See v1.7.11 REVIEW.md IN-02 trace.
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
    proxyCalls.length = 0;
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
    // Mock now uses better-auth-style proxy; assert path routing instead of
    // the legacy `viaUrl` field that flat vi.fn() exposed.
    expect(result.routePath).toBe("/sign-in/email");
  });

  it("notifies main process when serverUrl changes (D-02)", async () => {
    await loadAuthModule();
    useSettingsStoreMock.__setServerUrl("http://localhost:4004/auth");
    expect(notifyServerUrlChanged).toHaveBeenCalledWith("http://localhost:4004/auth");
  });

  it("a stale captured method ref dispatches to the CURRENT inner after URL swap (HIGH-02)", async () => {
    const { authClient } = await loadAuthModule();
    // Capture the method ref while inner-A is current.
    const captured = authClient.signIn.email;
    expect(typeof captured).toBe("function");
    // Swap URL — inner-A should now be invalidated; next dispatch uses inner-B.
    useSettingsStoreMock.__setServerUrl("http://swap-target:5000/auth");
    const result = await captured({ email: "x@y.z", password: "p" });
    // Without the rebinding dispatch, baseURL would be DEFAULT_AUTH_URL (inner-A).
    expect(result.ok).toBe(true);
    // proxyCalls is used by the proxy mock; signIn.email pushes there too.
    const matching = proxyCalls.find((c) => c.routePath === "/sign-in/email");
    expect(matching).toBeDefined();
    expect(matching.baseURL).toBe("http://swap-target:5000/auth");
  });

  // Per v1.7.11 REVIEW.md WR-03: the bug class — `(cur as Function).apply(...)`
  // colliding with better-auth's get-trap for "apply" — covered every callable
  // leaf, not just signOut. This parameterised test pins the entire surface.
  const ALL_CALL_SITES = [
    { name: "signIn.email", invoke: (c) => c.signIn.email({ email: "a@b", password: "p" }), expectedRoute: "/sign-in/email" },
    { name: "signIn.social", invoke: (c) => c.signIn.social({ provider: "google" }), expectedRoute: "/sign-in/social" },
    { name: "signUp.email", invoke: (c) => c.signUp.email({ email: "a@b", password: "p", name: "x" }), expectedRoute: "/sign-up/email" },
    { name: "sendVerificationEmail", invoke: (c) => c.sendVerificationEmail({ email: "a@b" }), expectedRoute: "/send-verification-email" },
    { name: "requestPasswordReset", invoke: (c) => c.requestPasswordReset({ email: "a@b" }), expectedRoute: "/request-password-reset" },
    { name: "signOut", invoke: (c) => c.signOut(), expectedRoute: "/sign-out" },
  ];
  for (const callsite of ALL_CALL_SITES) {
    it(`${callsite.name}: routePath is "${callsite.expectedRoute}", NOT suffixed with "/apply" (v1.7.10 bug class)`, async () => {
      const { authClient } = await loadAuthModule();
      await callsite.invoke(authClient);
      expect(proxyCalls.length).toBe(1);
      expect(proxyCalls[0].routePath).toBe(callsite.expectedRoute);
      expect(proxyCalls[0].routePath).not.toMatch(/\/apply$/);
    });
  }

  it("dispatches authClient.signOut() through better-auth's callable proxy (v1.7.10 regression)", async () => {
    // Regression: in v1.7.10 the outer Proxy's apply-trap called
    //   `(cur as Function).apply(parent, args)`
    // which triggered better-auth's GET-trap for the property "apply",
    // returning a NEW path-proxy for "/sign-out/apply". The actual sign-out
    // never fired. v1.7.11 switched to Reflect.apply which invokes the
    // [[Call]] slot directly through the apply-trap.
    const { authClient } = await loadAuthModule();
    const result = await authClient.signOut();
    expect(result.ok).toBe(true);
    expect(proxyCalls.length).toBe(1);
    expect(proxyCalls[0].routePath).toBe("/sign-out");
    // Specifically: NOT "/sign-out/apply" (the v1.7.10 bug signature).
    expect(proxyCalls[0].routePath).not.toMatch(/\/apply$/);
  });

  it("dispatches signOut to the persisted server URL, not the default", async () => {
    storeState = { serverUrl: "http://localhost:4005/auth" };
    const { authClient } = await loadAuthModule();
    await authClient.signOut();
    expect(proxyCalls.length).toBe(1);
    expect(proxyCalls[0].baseURL).toBe("http://localhost:4005/auth");
    expect(proxyCalls[0].routePath).toBe("/sign-out");
  });

  it("dispatches signOut to the CURRENT inner after a serverUrl swap (HIGH-02 + signOut)", async () => {
    const { authClient } = await loadAuthModule();
    // Capture a ref while inner-A (default URL) is current.
    const captured = authClient.signOut;
    useSettingsStoreMock.__setServerUrl("http://swap-after-capture:5000/auth");
    await captured();
    expect(proxyCalls.length).toBe(1);
    // Must hit the NEW URL, not the URL that was current at capture time.
    expect(proxyCalls[0].baseURL).toBe("http://swap-after-capture:5000/auth");
    expect(proxyCalls[0].routePath).toBe("/sign-out");
  });

  it("preserves the authClient export symbol (upstream-parity, D-01)", async () => {
    const mod = await loadAuthModule();
    expect(mod.authClient).toBeDefined();
    // The named export must exist; consumers do `import { authClient } from "../lib/auth"`.
    expect(typeof mod.authClient).toBe("object");
  });
});
