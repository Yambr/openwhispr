// Quick task 260604-tsa (fork-only): CloudEmbeddings — a full DROP-IN for
// src/helpers/localEmbeddings.js (UPSTREAM-IMMUTABLE) that routes note and
// conversation-chunk text embeddings to the self-hosted corp backend instead
// of the local onnx worker. Under a lockdown build with features.embeddings
// === true, embeddingsBootstrap seeds require.cache["./localEmbeddings"] with
// this module BEFORE vectorIndex first requires it — so vectorIndex's own
// require("./localEmbeddings") transparently returns this facade and the onnx
// worker is never spawned (it is the upstream :392 crash source we escape).
//
// Module shape MIRRORS localEmbeddings exactly so vectorIndex + main.js keep
// working unchanged:
//   module.exports                = instance (embedText/embedTexts/isAvailable/downloadModel)
//   module.exports.LocalEmbeddings = class with static noteEmbedText
//   main.js:975 isAvailable() -> true (cloud is always "available" once selected)
//   main.js:976 downloadModel() -> async no-op (cloud needs no local model file)
//
// ALL wire-shape details (path, body field names, response parse) live in the
// single _request() adapter so a server-side tweak is a one-function change.
// Confirmed contract (SERVER-REQUIREMENTS.md, server peer): POST /api/embeddings,
// Bearer, body { input: string|string[], model? } (model omitted → server env
// default), OpenAI response { data:[{ embedding:number[], index }] }, dim 1024.
// On non-2xx (esp. 502/503) we THROW — no local-onnx fallback, no public cloud.

"use strict";

// bge-m3-class dim. One source of truth; embeddingsBootstrap reads this for
// the qdrant dim migration.
const CLOUD_EMBEDDING_DIM = 1024;

// The wire boundary (net.fetch), the token source (tokenStore.get) and the
// runtime backend URL (backendUrlState.getBackendUrl) are resolved through a
// single _resolveDeps() seam so unit tests can inject deterministic doubles —
// vitest cannot mock these deeply-nested CJS requires otherwise. Production
// always uses the real modules (overrides undefined at every real call site).
function _resolveDeps(overrides) {
  if (overrides) return overrides;
  const { net } = require("electron");
  const backendUrlState = require("./backendUrlState");
  const tokenStore = require("./tokenStore");
  return {
    // useSessionCookies:false so the jar isn't auto-attached over our explicit
    // Bearer header.
    fetch: (url, init) => net.fetch(url, { ...init, useSessionCookies: false }),
    getBackendUrl: () => backendUrlState.getBackendUrl(),
    getToken: () => tokenStore.get(),
  };
}

class CloudEmbeddings {
  // deps is injected only by unit tests; undefined in production.
  constructor(deps) {
    this._depsOverride = deps;
  }
  // SYNC, mirrors localEmbeddings.isAvailable() (line 45) — cloud is always
  // available once selected (no local model file required). main.js:975 calls
  // this unconditionally on the seeded module.
  isAvailable() {
    return true;
  }

  // mirrors localEmbeddings.downloadModel() (line 88) — async no-op (cloud
  // needs no local model). main.js:976 may call it.
  async downloadModel() {
    /* no-op: cloud provider has nothing to download */
  }

  // The single wire-shape adapter. Accepts a string or string[] and returns
  // the parsed OpenAI-shape response { data, model, usage }.
  async _request(input) {
    const { fetch, getBackendUrl, getToken } = _resolveDeps(this._depsOverride);
    const token = getToken();
    if (!token) {
      throw new Error("Not authenticated for embeddings (no auth token)");
    }
    const apiUrl = getBackendUrl();
    if (!apiUrl) {
      throw new Error("Embedding backend URL is not configured");
    }

    // model omitted by default → server defaults from operator env. Kept
    // overridable here in case a future build pins a model.
    const body = { input };

    const res = await fetch(`${apiUrl}/api/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res || !res.ok) {
      const status = res && res.status;
      // 503 = model not configured on the server; 502 = gateway non-2xx.
      // Either way: explicit error, NO fallback. Caught upstream → FTS5.
      throw Object.assign(
        new Error(`Embedding service returned ${status ?? "no"} response`),
        { code: "EMBEDDINGS_UNAVAILABLE", status }
      );
    }

    const json = await res.json();
    if (!json || !Array.isArray(json.data)) {
      throw Object.assign(new Error("Malformed embedding service response"), {
        code: "EMBEDDINGS_UNAVAILABLE",
      });
    }
    return json;
  }

  async embedText(text) {
    const json = await this._request(text);
    // Single input → data[0]. Be defensive about index ordering.
    const sorted = [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const first = sorted[0];
    if (!first || !Array.isArray(first.embedding)) {
      throw Object.assign(new Error("Embedding service returned no vector"), {
        code: "EMBEDDINGS_UNAVAILABLE",
      });
    }
    return new Float32Array(first.embedding);
  }

  async embedTexts(texts) {
    const json = await this._request(texts);
    // Order by response index — do NOT assume the server preserves order.
    const sorted = [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((d) => new Float32Array(d.embedding));
  }
}

// Inlined identical to localEmbeddings.js:84-86 (UPSTREAM) — pure string
// concat, zero coupling to the onnx module. Kept verbatim so vectorIndex's
// `const { LocalEmbeddings } = require("./localEmbeddings")` + the static call
// keep producing byte-identical embedding text.
class LocalEmbeddings {
  static noteEmbedText(title, content, enhancedContent) {
    return `${title}\n${enhancedContent || content}`.slice(0, 1500);
  }
}

const instance = new CloudEmbeddings();
module.exports = instance;
module.exports.LocalEmbeddings = LocalEmbeddings;
module.exports.CLOUD_EMBEDDING_DIM = CLOUD_EMBEDDING_DIM;
// Test-only factory so unit tests can inject deterministic wire/token/url deps.
// Not used by production code (production uses the default singleton above).
module.exports.__createForTest = (deps) => {
  const inst = new CloudEmbeddings(deps);
  inst.LocalEmbeddings = LocalEmbeddings;
  inst.CLOUD_EMBEDDING_DIM = CLOUD_EMBEDDING_DIM;
  return inst;
};
