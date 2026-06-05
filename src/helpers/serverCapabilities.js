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
      // Do not send an unauthenticated request — fail closed. TRANSIENT: the
      // token may land later via auth-set-token, so reason "no-token" arms the
      // post-login re-probe (embeddingsBootstrap.reinstall).
      debug("capabilities: no auth token; embeddings unavailable (fail-closed)");
      return { ...FAIL_CLOSED, reason: "no-token" };
    }

    const apiUrl = getBackendUrl();
    if (!apiUrl) {
      // TRANSIENT under runtime onboarding — the backend URL can land at the
      // same time as the token. Classify "no-token" (not "error") so the
      // post-login re-probe still fires once both are present.
      debug("capabilities: no backend URL; embeddings unavailable (fail-closed)");
      return { ...FAIL_CLOSED, reason: "no-token" };
    }

    const res = await fetch(`${apiUrl}/api/capabilities`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res || !res.ok) {
      // AUTHORITATIVE (a token-bearing probe was answered): 401 → "unauthorized",
      // any other non-ok → "server-false". Both make the bootstrap stop
      // re-probing (no retry storm).
      const status = res && res.status;
      debug("capabilities: embeddings unavailable on this server", { status });
      return {
        ...FAIL_CLOSED,
        reason: status === 401 ? "unauthorized" : "server-false",
      };
    }

    const body = await res.json();
    const features = (body && body.features) || {};
    const embeddings = features.embeddings === true;
    return {
      embeddings,
      rerank: features.rerank === true,
      // AUTHORITATIVE: "ok" on a clean true probe; "server-false" when the
      // server explicitly reports embeddings off.
      reason: embeddings ? "ok" : "server-false",
    };
  } catch (err) {
    // AUTHORITATIVE error (network/bad-json after a token-bearing attempt).
    debug("capabilities: embeddings unavailable on this server", {
      error: err && err.message,
    });
    return { ...FAIL_CLOSED, reason: "error" };
  }
}

module.exports = { getCapabilities };
