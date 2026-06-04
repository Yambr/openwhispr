// Quick task 260604-tsa (fork-only): server capability probe.
//
// GET ${backendUrl}/api/capabilities with a Bearer header (same auth builder
// as ipcHandlers.js:3455-3456 for /api/reason). Returns the server's feature
// flags ({ embeddings, rerank }). The client reads this ONCE on cold start to
// decide whether to route note/conversation embeddings to the corp backend.
//
// FAIL-CLOSED: any failure (missing token, non-ok response, network reject,
// malformed JSON) resolves to { embeddings: false } and NEVER throws. A
// closed result means "no semantic indexing" → the throw-fast stub is seeded
// and search degrades to FTS5 keyword fallback. We never fall back to onnx or
// public cloud.
//
// The wire boundary (net.fetch), the token source (tokenStore.get) and the
// runtime backend URL (backendUrlState.getBackendUrl) are resolved through a
// single _resolveDeps() seam so unit tests can inject deterministic doubles —
// vitest cannot mock these deeply-nested CJS requires otherwise (tokenStore →
// secretCrypto → electron is below vi.mock's interception depth). Production
// always uses the real modules; the injection arg is optional and undefined in
// every real call site.

"use strict";

const FAIL_CLOSED = Object.freeze({ embeddings: false, rerank: false });

function _resolveDeps(overrides) {
  if (overrides) return overrides;
  const { net } = require("electron");
  const backendUrlState = require("./backendUrlState");
  const tokenStore = require("./tokenStore");
  const debugLogger = require("./debugLogger");
  return {
    // Honors system proxy via Electron's net stack; useSessionCookies:false so
    // the jar isn't auto-attached on top of our explicit Bearer header.
    fetch: (url, init) => net.fetch(url, { ...init, useSessionCookies: false }),
    getBackendUrl: () => backendUrlState.getBackendUrl(),
    getToken: () => tokenStore.get(),
    debug: (...a) => debugLogger.debug(...a),
  };
}

async function getCapabilities(deps) {
  const { fetch, getBackendUrl, getToken, debug } = _resolveDeps(deps);
  try {
    const token = getToken();
    if (!token) {
      // Do not send an unauthenticated request — fail closed.
      debug("capabilities: no auth token; embeddings unavailable (fail-closed)");
      return { ...FAIL_CLOSED };
    }

    const apiUrl = getBackendUrl();
    if (!apiUrl) {
      debug("capabilities: no backend URL; embeddings unavailable (fail-closed)");
      return { ...FAIL_CLOSED };
    }

    const res = await fetch(`${apiUrl}/api/capabilities`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res || !res.ok) {
      debug("capabilities: embeddings unavailable on this server", {
        status: res && res.status,
      });
      return { ...FAIL_CLOSED };
    }

    const body = await res.json();
    const features = (body && body.features) || {};
    return {
      embeddings: features.embeddings === true,
      rerank: features.rerank === true,
    };
  } catch (err) {
    debug("capabilities: embeddings unavailable on this server", {
      error: err && err.message,
    });
    return { ...FAIL_CLOSED };
  }
}

module.exports = { getCapabilities };
