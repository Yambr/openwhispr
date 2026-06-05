// Quick task 260604-tsa — embeddingsBootstrap always-seed gate shim tests.
//
// Under PROVIDER_LOCKDOWN_ENABLED, install() ALWAYS seeds ./localEmbeddings in
// require.cache BEFORE vectorIndex first requires it:
//   - features.embeddings true  → CloudEmbeddings facade (seeded=true)
//   - features.embeddings false → throw-fast stub (seeded=false)
// In BOTH lockdown branches the real localEmbeddings.js (and therefore
// onnxWorkerClient) is never required → onnx never spawns.
// Build gate OFF → strict no-op (capabilities never fetched, cache untouched).
// Dim migration recreates stale 384 qdrant collections at 1024, only when the
// cloud facade was seeded.
//
// Deps (gate flag, getCapabilities, cloudEmbeddings, qdrant client factory,
// debug) are injected via the module's _setTestDeps seam so we never depend on
// vitest mocking the nested CJS require chain.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";

const LE_PATH = require.resolve("../../src/helpers/localEmbeddings.js");

let bootstrap;

function freshBootstrap() {
  // Re-require a fresh module instance so the module-level `seeded` flag and
  // idempotency guard reset between tests.
  delete require.cache[require.resolve("../../src/helpers/embeddingsBootstrap.js")];
  return require("../../src/helpers/embeddingsBootstrap.js");
}

function makeCloudFacade() {
  return {
    embedText: async () => new Float32Array(1024),
    embedTexts: async () => [new Float32Array(1024)],
    isAvailable: () => true,
    downloadModel: async () => {},
    LocalEmbeddings: { noteEmbedText: (t, c, e) => `${t}\n${e || c}` },
    CLOUD_EMBEDDING_DIM: 1024,
  };
}

// Records whether onnxWorkerClient was required during a test.
let onnxRequired;

beforeEach(() => {
  onnxRequired = false;
  // Seed a sentinel in the require.cache for localEmbeddings so we can detect
  // when the bootstrap replaces it. The real module is NOT loaded.
  delete require.cache[LE_PATH];
});

afterEach(() => {
  delete require.cache[LE_PATH];
  delete require.cache[require.resolve("../../src/helpers/embeddingsBootstrap.js")];
  vi.restoreAllMocks();
});

function baseDeps(overrides = {}) {
  return {
    lockdownEnabled: true,
    getCapabilities: vi.fn(async () => ({ embeddings: true })),
    cloudEmbeddings: makeCloudFacade(),
    localEmbeddingsPath: LE_PATH,
    debug: vi.fn(),
    markOnnxRequired: () => {
      onnxRequired = true;
    },
    ...overrides,
  };
}

describe("embeddingsBootstrap.install — build gate OFF (default build)", () => {
  it("is a strict no-op: capabilities never fetched, cache untouched, onnx never required", async () => {
    bootstrap = freshBootstrap();
    const deps = baseDeps({ lockdownEnabled: false });
    bootstrap._setTestDeps(deps);
    await bootstrap.install();
    expect(deps.getCapabilities).not.toHaveBeenCalled();
    expect(require.cache[LE_PATH]).toBeUndefined();
    expect(onnxRequired).toBe(false);
  });
});

describe("embeddingsBootstrap.install — gate ON + caps.embeddings TRUE", () => {
  it("seeds the cloud facade so require('./localEmbeddings') returns cloud; onnx never required; seeded=true", async () => {
    bootstrap = freshBootstrap();
    const cloud = makeCloudFacade();
    const deps = baseDeps({ cloudEmbeddings: cloud });
    bootstrap._setTestDeps(deps);
    await bootstrap.install();
    expect(deps.getCapabilities).toHaveBeenCalledTimes(1);
    expect(require.cache[LE_PATH]).toBeDefined();
    expect(require.cache[LE_PATH].exports).toBe(cloud);
    expect(require(LE_PATH)).toBe(cloud);
    expect(onnxRequired).toBe(false);
    expect(bootstrap._isSeeded()).toBe(true);
  });
});

describe("embeddingsBootstrap.install — gate ON + caps.embeddings FALSE", () => {
  it("seeds a throw-fast stub: embedText rejects EMBEDDINGS_UNAVAILABLE, isAvailable false, downloadModel no-op; onnx never required; seeded=false", async () => {
    bootstrap = freshBootstrap();
    const deps = baseDeps({ getCapabilities: vi.fn(async () => ({ embeddings: false })) });
    bootstrap._setTestDeps(deps);
    await bootstrap.install();

    const seeded = require(LE_PATH);
    expect(seeded.isAvailable()).toBe(false);
    await expect(seeded.embedText("q")).rejects.toMatchObject({ code: "EMBEDDINGS_UNAVAILABLE" });
    await expect(seeded.embedTexts(["q"])).rejects.toMatchObject({ code: "EMBEDDINGS_UNAVAILABLE" });
    await expect(seeded.downloadModel()).resolves.toBeUndefined();
    expect(seeded.LocalEmbeddings.noteEmbedText("T", "C", "E")).toBe("T\nE");
    expect(onnxRequired).toBe(false);
    expect(bootstrap._isSeeded()).toBe(false);
    expect(deps.debug).toHaveBeenCalled();
  });

  it("a simulated semantic search catches the stub rejection and falls back to FTS5 without throwing", async () => {
    bootstrap = freshBootstrap();
    const deps = baseDeps({ getCapabilities: vi.fn(async () => ({ embeddings: false })) });
    bootstrap._setTestDeps(deps);
    await bootstrap.install();
    const stub = require(LE_PATH);

    const databaseManager = { searchNotes: vi.fn(() => [{ id: 1, title: "fts" }]) };
    // Mirrors ipcHandlers.js:990 try/catch → FTS5 fallback.
    async function semanticSearch(query) {
      try {
        await stub.embedText(query);
        return [{ id: 99, title: "vector" }];
      } catch {
        return databaseManager.searchNotes(query);
      }
    }
    const out = await semanticSearch("hello");
    expect(out).toEqual([{ id: 1, title: "fts" }]);
    expect(databaseManager.searchNotes).toHaveBeenCalledWith("hello");
  });

  it("fails closed: caps.getCapabilities rejecting seeds the stub (never cloud)", async () => {
    bootstrap = freshBootstrap();
    const deps = baseDeps({
      getCapabilities: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    bootstrap._setTestDeps(deps);
    await bootstrap.install();
    const seeded = require(LE_PATH);
    expect(seeded.isAvailable()).toBe(false);
    expect(bootstrap._isSeeded()).toBe(false);
  });
});

describe("embeddingsBootstrap.install — bootstrap sequence safety + idempotency", () => {
  it("seeded module survives the main.js:974-979 sequence (isAvailable then downloadModel) without throwing", async () => {
    bootstrap = freshBootstrap();
    bootstrap._setTestDeps(baseDeps({ getCapabilities: vi.fn(async () => ({ embeddings: false })) }));
    await bootstrap.install();
    const le = require(LE_PATH);
    expect(() => le.isAvailable()).not.toThrow();
    if (!le.isAvailable()) {
      await expect(le.downloadModel()).resolves.toBeUndefined();
    }
  });

  it("install() is idempotent (second call does not re-fetch capabilities)", async () => {
    bootstrap = freshBootstrap();
    const deps = baseDeps();
    bootstrap._setTestDeps(deps);
    await bootstrap.install();
    await bootstrap.install();
    expect(deps.getCapabilities).toHaveBeenCalledTimes(1);
  });
});

describe("embeddingsBootstrap.migrateCollectionDim", () => {
  function fakeClient(existingSize) {
    return {
      getCollection: vi.fn(async (name) => {
        if (existingSize === "missing") {
          throw new Error("Not found");
        }
        return { config: { params: { vectors: { size: existingSize } } } };
      }),
      deleteCollection: vi.fn(async () => ({})),
      createCollection: vi.fn(async () => ({})),
    };
  }

  it("recreates a stale 384 collection at 1024 (delete + create)", async () => {
    bootstrap = freshBootstrap();
    const client = fakeClient(384);
    await bootstrap.migrateCollectionDim(client, "notes", 1024);
    expect(client.deleteCollection).toHaveBeenCalledWith("notes");
    expect(client.createCollection).toHaveBeenCalledTimes(1);
    const [, opts] = client.createCollection.mock.calls[0];
    expect(opts.vectors.size).toBe(1024);
  });

  it("does NOT recreate a collection already at 1024", async () => {
    bootstrap = freshBootstrap();
    const client = fakeClient(1024);
    await bootstrap.migrateCollectionDim(client, "notes", 1024);
    expect(client.deleteCollection).not.toHaveBeenCalled();
    expect(client.createCollection).not.toHaveBeenCalled();
  });

  it("does not throw when the collection is missing", async () => {
    bootstrap = freshBootstrap();
    const client = fakeClient("missing");
    await expect(bootstrap.migrateCollectionDim(client, "notes", 1024)).resolves.toBeUndefined();
    expect(client.deleteCollection).not.toHaveBeenCalled();
  });

  it("ordering: getCollection is consulted BEFORE any delete/create", async () => {
    bootstrap = freshBootstrap();
    const order = [];
    const client = {
      getCollection: vi.fn(async () => {
        order.push("get");
        return { config: { params: { vectors: { size: 384 } } } };
      }),
      deleteCollection: vi.fn(async () => {
        order.push("delete");
      }),
      createCollection: vi.fn(async () => {
        order.push("create");
      }),
    };
    await bootstrap.migrateCollectionDim(client, "notes", 1024);
    expect(order[0]).toBe("get");
    expect(order.indexOf("get")).toBeLessThan(order.indexOf("delete"));
  });
});

describe("embeddingsBootstrap.runDimMigration", () => {
  it("is a no-op when the cloud facade was NOT seeded (stub branch)", async () => {
    bootstrap = freshBootstrap();
    const deps = baseDeps({ getCapabilities: vi.fn(async () => ({ embeddings: false })) });
    const makeClient = vi.fn();
    bootstrap._setTestDeps({ ...deps, makeQdrantClient: makeClient });
    await bootstrap.install();
    await bootstrap.runDimMigration(6333);
    expect(makeClient).not.toHaveBeenCalled();
  });

  it("migrates BOTH collections to 1024 when cloud was seeded", async () => {
    bootstrap = freshBootstrap();
    const calls = [];
    const client = {
      getCollection: vi.fn(async () => ({ config: { params: { vectors: { size: 384 } } } })),
      deleteCollection: vi.fn(async (n) => calls.push(`del:${n}`)),
      createCollection: vi.fn(async (n, o) => calls.push(`create:${n}:${o.vectors.size}`)),
    };
    const makeClient = vi.fn(() => client);
    bootstrap._setTestDeps(baseDeps({ makeQdrantClient: makeClient }));
    await bootstrap.install();
    await bootstrap.runDimMigration(6333);
    expect(makeClient).toHaveBeenCalledWith(6333);
    expect(calls).toContain("create:notes:1024");
    expect(calls).toContain("create:conversation_chunks:1024");
  });

  // BL-01 REGRESSION: the main.js wiring MUST run runDimMigration only AFTER
  // qdrantManager.start() resolves AND ensureCollection() completes. The
  // original bug read qdrantManager.isReady() SYNCHRONOUSLY in a separate block
  // (start() still pending → isReady() false → && short-circuits → migration
  // ran against an unstarted qdrant → silent no-op → 384 collection never
  // migrated to 1024 → corp semantic search silently dead). This test
  // reproduces the deferred-start sequence the real entrypoint must honor and
  // asserts the ordering: migration fires AFTER ensureCollection, never before.
  it("ordering: migration runs after a DEFERRED start() resolves + ensureCollection (BL-01)", async () => {
    bootstrap = freshBootstrap();
    const order = [];
    const client = {
      getCollection: vi.fn(async () => ({ config: { params: { vectors: { size: 384 } } } })),
      deleteCollection: vi.fn(async () => {}),
      createCollection: vi.fn(async () => order.push("migrate")),
    };
    bootstrap._setTestDeps(baseDeps({ makeQdrantClient: vi.fn(() => client) }));
    await bootstrap.install();

    // Simulate the entrypoint: qdrant start() is a PENDING promise; isReady()
    // is false until it resolves. ensureCollection runs first, THEN migration.
    let ready = false;
    let resolveStart;
    const start = new Promise((r) => (resolveStart = r));
    const isReady = () => ready;
    const ensureCollection = vi.fn(async () => order.push("ensureCollection"));

    // The CORRECT wiring (mirrors main.js): chain off start()'s resolution.
    const wired = start.then(async () => {
      if (isReady()) {
        await ensureCollection();
        await bootstrap.runDimMigration(6333);
      }
    });

    // At this synchronous tick start() is unresolved → if the wiring had read
    // isReady() synchronously in a separate block, migration would run now (the
    // bug). It must NOT have run yet.
    expect(order).toEqual([]);

    // Now resolve start() the way qdrantManager.start() eventually does.
    ready = true;
    resolveStart();
    await wired;

    // ensureCollection BEFORE migrate, and migrate DID run (not short-circuited).
    // runDimMigration recreates BOTH collections (notes + conversation_chunks),
    // so "migrate" appears twice — the load-bearing assertions are: (1) it ran
    // at all (not short-circuited by a synchronous isReady() false), and (2)
    // ensureCollection came strictly first.
    expect(order[0]).toBe("ensureCollection");
    expect(order.filter((s) => s === "migrate").length).toBe(2);
    expect(order.indexOf("ensureCollection")).toBeLessThan(order.indexOf("migrate"));
  });
});
