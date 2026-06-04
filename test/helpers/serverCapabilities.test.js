// Quick task 260604-tsa — serverCapabilities (fail-closed) tests.
//
// getCapabilities() GETs ${backendUrl}/api/capabilities with Bearer and
// returns the server's features object ({ embeddings, rerank }). It MUST fail
// CLOSED to { embeddings: false } on ANY error (non-ok, network reject, bad
// JSON, missing token) and NEVER throw an uncaught error.
//
// We inject the wire boundary (fetch), token and backend URL through the
// module's _resolveDeps seam (deps arg) so the HTTP boundary is the ONLY
// mocked surface — vitest cannot mock the deeply-nested CJS tokenStore →
// secretCrypto → electron chain otherwise.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getCapabilities } from "../../src/helpers/serverCapabilities.js";

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

let fetchMock;
let deps;

beforeEach(() => {
  fetchMock = vi.fn();
  deps = {
    fetch: fetchMock,
    getBackendUrl: () => "https://corp.example.test",
    getToken: () => "token-abc",
    debug: () => {},
  };
});

describe("serverCapabilities.getCapabilities", () => {
  it("returns { embeddings: true } when server reports features.embeddings true", async () => {
    fetchMock.mockResolvedValue(okJson({ features: { embeddings: true, rerank: false } }));
    const caps = await getCapabilities(deps);
    expect(caps.embeddings).toBe(true);
  });

  it("returns { embeddings: false } when server reports features.embeddings false", async () => {
    fetchMock.mockResolvedValue(okJson({ features: { embeddings: false, rerank: false } }));
    const caps = await getCapabilities(deps);
    expect(caps.embeddings).toBe(false);
  });

  it("GETs /api/capabilities with a Bearer header against the runtime backend URL", async () => {
    fetchMock.mockResolvedValue(okJson({ features: { embeddings: true } }));
    await getCapabilities(deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://corp.example.test/api/capabilities");
    expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer token-abc");
  });

  it("fails closed (embeddings:false) on a non-ok response, no throw", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(getCapabilities(deps)).resolves.toEqual(
      expect.objectContaining({ embeddings: false })
    );
  });

  it("fails closed on a network rejection, no throw", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(getCapabilities(deps)).resolves.toEqual(
      expect.objectContaining({ embeddings: false })
    );
  });

  it("fails closed on malformed JSON, no throw", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });
    await expect(getCapabilities(deps)).resolves.toEqual(
      expect.objectContaining({ embeddings: false })
    );
  });

  it("fails closed when no token is available (does not send unauthenticated)", async () => {
    deps.getToken = () => null;
    const caps = await getCapabilities(deps);
    expect(caps.embeddings).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the backend URL is empty (does not fetch)", async () => {
    deps.getBackendUrl = () => "";
    const caps = await getCapabilities(deps);
    expect(caps.embeddings).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
