// Quick task 260604-tsa (fork-only): always-seed embedding bootstrap.
//
// THE SEAM (zero upstream edits). main.js's fork block requires this module and
// `await install()`s it at ~line 953 — BEFORE vectorIndex (962) and
// localEmbeddings (974) are first required. Under PROVIDER_LOCKDOWN_ENABLED,
// install() ALWAYS replaces require.cache[<localEmbeddings>].exports with a
// replacement facade BEFORE upstream vectorIndex.js does its own
// `require("./localEmbeddings")`:
//
//   - features.embeddings === true  → CloudEmbeddings facade (real /api/embeddings)
//   - features.embeddings === false OR caps fetch failed → throw-fast stub
//
// In BOTH lockdown branches the real localEmbeddings.js is shadowed, so
// onnxWorkerClient is NEVER required → the onnx worker never spawns (it is the
// upstream onnxWorker.js:392 crash we escape). When the build gate is OFF,
// install() is a STRICT no-op: cache untouched, capabilities never fetched, the
// real onnx path is byte-identical to upstream. Zero bytes of any upstream file
// change.
//
// WHY always-seed and not "leave vectorIndex not-ready": vectorIndex.init()
// sets this.client unconditionally (vectorIndex.js:14-16) and isReady() ===
// (client !== null) (line 204), so a not-ready seam is unachievable and would
// let the real onnx worker spawn-and-crash on first embed. Seeding the stub
// shadows localEmbeddings BEFORE vectorIndex requires it — onnx never loads.
//
// The throw-fast stub's clean rejection is absorbed by the EXISTING
// ipcHandlers.js:990 try/catch (→ FTS5) and the embed-on-write .catch(()=>{}).
// The manual reindex path is fixed separately (Task 4 probe).
//
// All external deps (build gate flag, getCapabilities, cloudEmbeddings, qdrant
// client factory, debug, onnx-required marker) resolve through _resolveDeps()
// so unit tests can inject deterministic doubles without relying on vitest
// mocking the nested CJS require chain. Production passes no override.

"use strict";

let _testDeps = null;
let seeded = false; // true ONLY when the CLOUD delegate is live behind the facade
let installed = false; // idempotency guard
// THE CRUX (capability-probe-before-auth fix): vectorIndex.js:2 captures
// `require("./localEmbeddings")` ONCE at module-load and calls .embedText on
// THAT object per-call. So we seed ONE STABLE delegating facade whose internal
// `_delegate` starts as the throw-fast stub and is SWAPPED in place to the
// cloud delegate by reinstall() after a post-login re-probe. Because vectorIndex
// holds the exact facade object, flipping `_delegate` makes it transparently
// start hitting the cloud — no re-require, no edit to any upstream file.
let _facade = null; // the stable seeded object (mutate-in-place via _delegate)
let lastReason = null; // last getCapabilities() reason ("no-token" arms reinstall)
let reinstalling = false; // in-flight guard so concurrent reinstall() coalesces
let _qdrantPort = null; // stashed by main.js so reinstall() can re-derive it

function _setTestDeps(deps) {
  _testDeps = deps;
}

function _resolveDeps() {
  if (_testDeps) return _testDeps;
  const BuildConfig = require("../config/build-config.generated.cjs");
  const debugLogger = require("./debugLogger");
  return {
    lockdownEnabled: BuildConfig.PROVIDER_LOCKDOWN_ENABLED === true,
    getCapabilities: () => require("./serverCapabilities").getCapabilities(),
    cloudEmbeddings: require("./cloudEmbeddings"),
    localEmbeddingsPath: require.resolve("./localEmbeddings"),
    debug: (...a) => debugLogger.debug(...a),
    // Marker is a no-op in production; tests use it to assert onnx is not pulled
    // in. The real onnxWorkerClient is only required by the real
    // localEmbeddings.js, which is shadowed — so this is never invoked.
    markOnnxRequired: () => {},
    makeQdrantClient: (port) => {
      const { QdrantClient } = require("@qdrant/js-client-rest");
      return new QdrantClient({ host: "127.0.0.1", port });
    },
  };
}

// Frozen throw-fast / FTS5-signal stub matching the localEmbeddings shape.
// embedText/embedTexts reject immediately with EMBEDDINGS_UNAVAILABLE so the
// existing search try/catch degrades to FTS5; isAvailable()→false (so the
// reindex probe can surface honest unavailability); downloadModel()→no-op.
function _makeStub() {
  const reject = () =>
    Promise.reject(
      Object.assign(new Error("semantic indexing unavailable on this server"), {
        code: "EMBEDDINGS_UNAVAILABLE",
      })
    );
  const stub = {
    async embedText() {
      return reject();
    },
    async embedTexts() {
      return reject();
    },
    isAvailable() {
      return false;
    },
    async downloadModel() {
      /* no-op */
    },
    // Inlined identical to localEmbeddings.js:84-86 (UPSTREAM) — pure concat.
    LocalEmbeddings: {
      noteEmbedText(title, content, enhancedContent) {
        return `${title}\n${enhancedContent || content}`.slice(0, 1500);
      },
    },
  };
  return Object.freeze(stub);
}

// The STABLE delegating facade. vectorIndex.js:2 captures this exact object at
// module-load; per-call it invokes facade.embedText/embedTexts on it. The
// facade is NOT frozen (its `_delegate` must be swappable stub→cloud); the stub
// or cloud module it points at can be frozen. `LocalEmbeddings.noteEmbedText`
// lives ON the facade itself (pure concat, identical in stub and cloud) so
// vectorIndex.js:3's `const { LocalEmbeddings } = localEmbeddings` destructure
// works regardless of which delegate is active.
function _makeFacade(initialDelegate) {
  const facade = {
    _delegate: initialDelegate,
    embedText(...args) {
      return facade._delegate.embedText(...args);
    },
    embedTexts(...args) {
      return facade._delegate.embedTexts(...args);
    },
    isAvailable() {
      return facade._delegate.isAvailable();
    },
    downloadModel(...args) {
      return facade._delegate.downloadModel(...args);
    },
    // Inlined identical to localEmbeddings.js:84-86 (UPSTREAM) — pure concat,
    // identical in stub and cloud. Stable so the destructure at vectorIndex.js:3
    // never breaks across a delegate swap.
    LocalEmbeddings: {
      noteEmbedText(title, content, enhancedContent) {
        return `${title}\n${enhancedContent || content}`.slice(0, 1500);
      },
    },
  };
  return facade;
}

function _seedCache(moduleExports, lerPath) {
  // Replace (or create) the require.cache entry for ./localEmbeddings so
  // vectorIndex's own require returns the replacement. The real module is never
  // loaded → onnxWorkerClient never required.
  require.cache[lerPath] = {
    id: lerPath,
    filename: lerPath,
    loaded: true,
    exports: moduleExports,
  };
}

async function install() {
  if (installed) return;
  installed = true;

  const deps = _resolveDeps();
  if (!deps.lockdownEnabled) {
    // Default build: strict no-op. Capabilities NOT fetched, cache untouched,
    // real onnx path byte-identical to upstream.
    return;
  }

  // Seed the STABLE facade FIRST (delegate=stub) so vectorIndex's require always
  // returns the same object — even if the probe is slow, the cache is populated
  // before vectorIndex first requires it (and reinstall() can later swap the
  // delegate in place on this exact object).
  _facade = _makeFacade(_makeStub());
  _seedCache(_facade, deps.localEmbeddingsPath);

  let embeddingsEnabled = false;
  let reason = null;
  try {
    const caps = await deps.getCapabilities();
    embeddingsEnabled = !!(caps && caps.embeddings === true);
    reason = (caps && caps.reason) || null;
  } catch (err) {
    // Fail CLOSED — any capability error → stub, never cloud. Treat a throwing
    // probe as authoritative "error" (no retry) since getCapabilities itself
    // is documented never to throw; a throw here is unexpected.
    embeddingsEnabled = false;
    reason = "error";
    deps.debug("embeddings: capability probe failed (fail-closed)", {
      error: err && err.message,
    });
  }

  if (embeddingsEnabled) {
    _facade._delegate = deps.cloudEmbeddings;
    seeded = true;
    lastReason = reason || "ok";
    deps.debug("embeddings: routing to cloud provider (lockdown + capabilities)");
  } else {
    // Delegate stays the stub seeded above.
    seeded = false;
    lastReason = reason;
    deps.debug(
      "embeddings: semantic indexing unavailable on this server (capabilities) — FTS5 only, onnx disabled",
      { reason }
    );
  }
}

// Post-login capability re-probe. Fired fire-and-forget from the auth-set-token
// IPC after a real token is stored. Upgrades the stub delegate to cloud IN PLACE
// on the SAME seeded facade (so vectorIndex's captured ref flips transparently)
// when, and only when, the prior probe failed transiently (lastReason ===
// "no-token"). Idempotent, concurrency-guarded, and NEVER throws.
async function reinstall() {
  const deps = _resolveDeps();
  // Default build: strict no-op (parity).
  if (!deps.lockdownEnabled) return;
  // install() never ran (nothing seeded to upgrade) OR already on cloud.
  if (!installed || seeded) return;
  // Authoritative prior reason (server-false / unauthorized / error from a
  // token-bearing probe) → no retry storm. Only "no-token" arms a re-probe.
  if (lastReason !== "no-token") return;
  // Concurrency guard: coalesce overlapping auth-set-token bursts.
  if (reinstalling) return;
  reinstalling = true;
  try {
    let embeddingsEnabled = false;
    let reason = null;
    try {
      const caps = await deps.getCapabilities();
      embeddingsEnabled = !!(caps && caps.embeddings === true);
      reason = (caps && caps.reason) || null;
    } catch (err) {
      embeddingsEnabled = false;
      reason = "error";
      deps.debug("embeddings: re-probe failed (fail-closed)", {
        error: err && err.message,
      });
    }

    if (embeddingsEnabled && _facade) {
      // Swap the delegate IN PLACE on the SAME object vectorIndex captured.
      _facade._delegate = deps.cloudEmbeddings;
      seeded = true;
      lastReason = reason || "ok";
      deps.debug("embeddings: upgraded to cloud after auth (re-probe) — semantic indexing ON");
      if (_qdrantPort != null) {
        // qdrant is already started (login is post-startup) — migrate the dim now.
        await runDimMigration(_qdrantPort);
      } else {
        deps.debug("embeddings: skipping dim migration after re-probe — qdrant port unknown");
      }
    } else {
      // Still closed. A now-authoritative reason makes a future reinstall a
      // no-op; staying "no-token" keeps it armed for the next token event.
      seeded = false;
      lastReason = reason;
      deps.debug("embeddings: still unavailable after auth re-probe", { reason });
    }
  } catch (err) {
    // reinstall() must NEVER throw (it is fire-and-forget from the IPC).
    deps.debug("embeddings: reinstall encountered an error (swallowed)", {
      error: err && err.message,
    });
  } finally {
    reinstalling = false;
  }
}

// Stashed by main.js once qdrant is started so reinstall()'s post-login dim
// migration can re-derive the port (reinstall fires AFTER startup).
function setQdrantPort(port) {
  _qdrantPort = port;
}

// Recreate a qdrant collection at targetDim if it exists at a different dim.
// Data-loss on migration is ACCEPTABLE — vectors are derived data (notes live
// in sqlite), they re-embed on next upsert/reindex.
async function migrateCollectionDim(client, name, targetDim) {
  const deps = _resolveDeps();
  let existing;
  try {
    existing = await client.getCollection(name);
  } catch {
    // Collection absent → nothing to migrate (ensureCloudCollections creates it).
    return;
  }
  const size =
    existing &&
    existing.config &&
    existing.config.params &&
    existing.config.params.vectors &&
    existing.config.params.vectors.size;
  if (size === targetDim) return;
  deps.debug("embeddings: recreating qdrant collection at new dim (data-loss, re-embeds)", {
    name,
    from: size,
    to: targetDim,
  });
  await client.deleteCollection(name);
  await client.createCollection(name, {
    vectors: { size: targetDim, distance: "Cosine" },
  });
}

async function ensureCloudCollections(client) {
  const deps = _resolveDeps();
  const dim =
    (deps.cloudEmbeddings && deps.cloudEmbeddings.CLOUD_EMBEDDING_DIM) || 1024;
  for (const name of ["notes", "conversation_chunks"]) {
    // Create-if-absent at the cloud dim, then enforce the dim over any stale
    // 384 (recreate). ensureCollection (upstream) may have already created it
    // at 384 — migrateCollectionDim recreates it at `dim`.
    try {
      await client.getCollection(name);
    } catch {
      await client.createCollection(name, {
        vectors: { size: dim, distance: "Cosine" },
      });
    }
    await migrateCollectionDim(client, name, dim);
  }
}

// Chained STRICTLY AFTER vectorIndex.ensureCollection() resolves (main.js
// wiring). Self-guards via `seeded` — a no-op unless the cloud facade was
// actually seeded.
async function runDimMigration(port) {
  if (!seeded) return;
  const deps = _resolveDeps();
  const client = deps.makeQdrantClient(port);
  await ensureCloudCollections(client);
}

module.exports = {
  install,
  reinstall,
  setQdrantPort,
  migrateCollectionDim,
  ensureCloudCollections,
  runDimMigration,
  // test-only seams
  _setTestDeps,
  _isSeeded: () => seeded,
  _lastReason: () => lastReason,
};
