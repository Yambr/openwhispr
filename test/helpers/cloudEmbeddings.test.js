// Quick task 260604-tsa — CloudEmbeddings DROP-IN tests.
//
// cloudEmbeddings is a full drop-in for localEmbeddings: embedText/embedTexts
// POST to ${backendUrl}/api/embeddings with Bearer, parse the OpenAI-shape
// response into Float32Array(1024), batch-order by index, throw on non-ok and
// null-token (NO local/cloud fallback), and expose isAvailable()->true (sync)
// + async downloadModel()->no-op so the main.js:974-979 bootstrap sequence
// never throws. Wire shape isolated in one _request adapter.
//
// We inject the wire boundary (fetch), token and backend URL via the module's
// __createForTest(deps) seam so the HTTP boundary is the ONLY mocked surface
// (vitest cannot mock the nested tokenStore → secretCrypto → electron chain).

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as cloudMod from "../../src/helpers/cloudEmbeddings.js";

const vec = (fill, dim = 1024) => Array.from({ length: dim }, () => fill);
const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

let fetchMock;
let make;

beforeEach(() => {
  fetchMock = vi.fn();
  make = (overrides = {}) =>
    cloudMod.__createForTest({
      fetch: fetchMock,
      getBackendUrl: () => "https://corp.example.test",
      getToken: () => "token-abc",
      ...overrides,
    });
});

describe("cloudEmbeddings.embedText", () => {
  it("POSTs to /api/embeddings with Bearer + JSON body { input } (model omitted)", async () => {
    fetchMock.mockResolvedValue(
      okJson({ object: "list", data: [{ object: "embedding", embedding: vec(0.5), index: 0 }] })
    );
    const out = await make().embedText("hi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://corp.example.test/api/embeddings");
    expect(init.method.toUpperCase()).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-abc");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.input).toBe("hi");
    expect("model" in body).toBe(false);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(1024);
    expect(out[0]).toBeCloseTo(0.5);
  });

  it("throws an explicit error on a non-ok response (no fallback)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    await expect(make().embedText("hi")).rejects.toThrow(/502|embedding/i);
  });

  it("throws when no token is available", async () => {
    await expect(make({ getToken: () => null }).embedText("hi")).rejects.toThrow(/auth/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("cloudEmbeddings.embedTexts", () => {
  it("sends body { input: array } and orders results by response index", async () => {
    // Return out of order to prove the client sorts by index.
    fetchMock.mockResolvedValue(
      okJson({
        object: "list",
        data: [
          { object: "embedding", embedding: vec(0.2), index: 1 },
          { object: "embedding", embedding: vec(0.1), index: 0 },
        ],
      })
    );
    const out = await make().embedTexts(["a", "b"]);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).input).toEqual(["a", "b"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeInstanceOf(Float32Array);
    expect(out[0][0]).toBeCloseTo(0.1); // index 0
    expect(out[1][0]).toBeCloseTo(0.2); // index 1
  });
});

describe("cloudEmbeddings drop-in shape (localEmbeddings parity)", () => {
  it("CLOUD_EMBEDDING_DIM is 1024", () => {
    expect(cloudMod.CLOUD_EMBEDDING_DIM ?? cloudMod.default?.CLOUD_EMBEDDING_DIM).toBe(1024);
  });

  it("isAvailable() returns true synchronously", () => {
    expect(make().isAvailable()).toBe(true);
  });

  it("downloadModel() resolves as a no-op without a network call", async () => {
    await expect(make().downloadModel()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes LocalEmbeddings.noteEmbedText matching the upstream concat", () => {
    const LE = cloudMod.LocalEmbeddings ?? cloudMod.default?.LocalEmbeddings;
    expect(typeof LE.noteEmbedText).toBe("function");
    expect(LE.noteEmbedText("T", "C", "E")).toBe("T\nE");
    expect(LE.noteEmbedText("T", "C", "")).toBe("T\nC");
  });

  it("survives the main.js:974-979 bootstrap sequence without throwing", async () => {
    // if (!isAvailable()) downloadModel().catch(...)
    const inst = make();
    expect(() => inst.isAvailable()).not.toThrow();
    if (!inst.isAvailable()) {
      await inst.downloadModel();
    }
    expect(true).toBe(true);
  });
});
