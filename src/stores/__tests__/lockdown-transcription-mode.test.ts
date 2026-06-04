// RC-3 (v1.7.19) — seedLockdownTranscriptionMode reconciler.
//
// Under PROVIDER_LOCKDOWN_ENABLED, a stray persisted cloudTranscriptionMode
// "byok" must self-heal to "openwhispr" at module load so transcription stays
// on the corporate /api/transcribe path (never the public BYOK endpoint).
// In the default (non-lockdown) build, "byok" is preserved.
//
// vitest is node-only (environment: "node"), so `isBrowser` (typeof window
// !== "undefined") is false and localStorage is undefined — the reconciler's
// `if (!isBrowser) return` guard would short-circuit. We install a truthy
// window + a Map-backed localStorage shim BEFORE importing the store, and the
// PROVIDER_LOCKDOWN_ENABLED flag is mocked per case via vi.doMock on
// ../config/defaults so the module-load seed runs under the mocked flag.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
    // test helper — read back the post-seed value
    __get: (k: string) => (map.has(k) ? map.get(k)! : null),
  };
}

function installBrowserStubs(ls: ReturnType<typeof makeLocalStorageShim>) {
  (globalThis as any).localStorage = ls;
  (globalThis as any).window = {
    localStorage: ls,
    electronAPI: new Proxy(
      {},
      { get: () => (..._a: unknown[]) => Promise.resolve(undefined) }
    ),
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function teardownBrowserStubs() {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
}

// Load the store with PROVIDER_LOCKDOWN_ENABLED mocked and the given
// localStorage seed. The mock + stubs MUST be in place before the import so the
// module-load reconciler observes them.
async function loadStoreWith(opts: {
  lockdown: boolean;
  seed: Record<string, string>;
}) {
  vi.resetModules();
  const ls = makeLocalStorageShim(opts.seed);
  installBrowserStubs(ls);
  vi.doMock("../../config/defaults", async () => {
    const actual = await vi.importActual<any>("../../config/defaults");
    return { ...actual, PROVIDER_LOCKDOWN_ENABLED: opts.lockdown };
  });
  // The store imports defaults via "../config/defaults" (relative to src/stores).
  vi.doMock("../config/defaults", async () => {
    const actual = await vi.importActual<any>("../config/defaults");
    return { ...actual, PROVIDER_LOCKDOWN_ENABLED: opts.lockdown };
  });
  await import("../settingsStore");
  return ls;
}

afterEach(() => {
  vi.doUnmock("../config/defaults");
  vi.doUnmock("../../config/defaults");
  teardownBrowserStubs();
  vi.restoreAllMocks();
});

describe("RC-3 seedLockdownTranscriptionMode reconciler", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("repairs a persisted byok → openwhispr under lockdown", async () => {
    const ls = await loadStoreWith({
      lockdown: true,
      seed: { cloudTranscriptionMode: "byok" },
    });
    expect(ls.__get("cloudTranscriptionMode")).toBe("openwhispr");
  });

  it("preserves persisted byok when lockdown is DISABLED (default build)", async () => {
    const ls = await loadStoreWith({
      lockdown: false,
      seed: { cloudTranscriptionMode: "byok" },
    });
    expect(ls.__get("cloudTranscriptionMode")).toBe("byok");
  });

  it("does not write when no value is persisted (default is already openwhispr)", async () => {
    const ls = await loadStoreWith({ lockdown: true, seed: {} });
    // Reconciler only acts on an existing "byok"; absent stays absent.
    expect(ls.__get("cloudTranscriptionMode")).toBeNull();
  });

  it("leaves an already-openwhispr value untouched under lockdown", async () => {
    const ls = await loadStoreWith({
      lockdown: true,
      seed: { cloudTranscriptionMode: "openwhispr" },
    });
    expect(ls.__get("cloudTranscriptionMode")).toBe("openwhispr");
  });
});
