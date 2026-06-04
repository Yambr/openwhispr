// RC-1 (v1.7.19) — cold-start serverUrl push.
//
// On cold launch with a persisted corporate serverUrl, initializeSettings()
// must push that host to the main process (window.electronAPI.notifyServerUrlChanged)
// exactly once, BEFORE any /api/* handler resolves getApiUrl(). This is a
// DIRECT IPC call that bypasses the auth.ts subscribe path so it never
// triggers window.location.reload.
//
// The vitest harness is node-only (environment: "node", vitest.config.ts:6),
// so `typeof window === "undefined"` and `localStorage` is absent. The store's
// `isBrowser` guard (settingsStore.ts:31) is computed at module-load time and
// short-circuits both serverUrl hydration AND initializeSettings. We therefore
// install globalThis.window + a Map-backed localStorage shim BEFORE importing
// the store, mirroring test/helpers/authClientProxy.test.js, and re-install
// them after every vi.resetModules() so the freshly-imported module observes
// them at load time.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const notifyServerUrlChanged = vi.fn();

function makeLocalStorageShim(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

// Install the node stubs that make `isBrowser` true and localStorage usable.
// Must run BEFORE the dynamic import of the store module.
// electronAPI stub: notifyServerUrlChanged is the tracked vi.fn(); every other
// method initializeSettings touches (getOpenAIKey, setDictionary, ...) resolves
// to a harmless empty value so the full init body runs without throwing.
function makeElectronApiStub() {
  return new Proxy(
    { notifyServerUrlChanged },
    {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        return (..._args: unknown[]) => Promise.resolve(undefined);
      },
    }
  );
}

function installBrowserStubs(seed: Record<string, string> = {}) {
  const ls = makeLocalStorageShim(seed);
  // Both global `localStorage` (store reads it bare) and `window.localStorage`
  // (src/i18n.ts:86 reads it qualified) must point at the same shim.
  (globalThis as any).localStorage = ls;
  (globalThis as any).window = {
    electronAPI: makeElectronApiStub(),
    localStorage: ls,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function teardownBrowserStubs() {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
}

async function loadStoreWith(seed: Record<string, string> = {}) {
  vi.resetModules();
  // Re-establish stubs AFTER resetModules so the freshly-imported module sees
  // them when its module-level `isBrowser`/hydration code runs.
  installBrowserStubs(seed);
  return await import("../settingsStore");
}

describe("RC-1 cold-start serverUrl push (host-coldstart-push)", () => {
  beforeEach(() => {
    notifyServerUrlChanged.mockClear();
  });

  afterEach(() => {
    teardownBrowserStubs();
    vi.restoreAllMocks();
  });

  it("pushes the persisted serverUrl to main exactly once on init", async () => {
    const mod = await loadStoreWith({ serverUrl: "https://corp.internal" });
    // Sanity: synchronous hydration picked up the persisted host.
    expect(mod.useSettingsStore.getState().serverUrl).toBe("https://corp.internal");

    await mod.initializeSettings();

    expect(notifyServerUrlChanged).toHaveBeenCalledTimes(1);
    expect(notifyServerUrlChanged).toHaveBeenCalledWith("https://corp.internal");
  });

  it("does NOT push when no serverUrl is persisted", async () => {
    const mod = await loadStoreWith({});
    expect(mod.useSettingsStore.getState().serverUrl).toBeNull();

    await mod.initializeSettings();

    expect(notifyServerUrlChanged).not.toHaveBeenCalled();
  });

  it("does NOT push when persisted serverUrl is empty string", async () => {
    const mod = await loadStoreWith({ serverUrl: "" });
    // Empty string hydrates to null (treated as no override).
    expect(mod.useSettingsStore.getState().serverUrl).toBeNull();

    await mod.initializeSettings();

    expect(notifyServerUrlChanged).not.toHaveBeenCalled();
  });

  it("does NOT mutate the store's serverUrl (no reload path engaged)", async () => {
    const mod = await loadStoreWith({ serverUrl: "https://corp.internal" });
    const before = mod.useSettingsStore.getState().serverUrl;

    await mod.initializeSettings();

    // The push is a direct IPC call — the store value is unchanged, so the
    // auth.ts subscribe handler (window.location.reload) is never engaged.
    expect(mod.useSettingsStore.getState().serverUrl).toBe(before);
  });

  it("pushes only once even if initializeSettings is called twice (hasInitialized guard)", async () => {
    const mod = await loadStoreWith({ serverUrl: "https://corp.internal" });

    await mod.initializeSettings();
    await mod.initializeSettings();

    expect(notifyServerUrlChanged).toHaveBeenCalledTimes(1);
  });
});
