// Quick task 260606-p6k — Diarization MessagePortMain transferList regression.
//
// Bug: Electron `MessagePortMain.postMessage(message, transfer)` accepts ONLY
// MessagePort objects in `transfer` — unlike the web `MessageChannel`, it
// REJECTS ArrayBuffers with "Port at index 0 is not a valid port". The onnx
// utility worker pushed the embedding ArrayBuffer into the reply transferList,
// and speakerEmbeddings.js pushed the samples ArrayBuffer into the request
// transferList. Both hops throw, the speaker-embedding step crashes, and the
// crash is swallowed at ipcHandlers.js:8004 ("Speaker embedding extraction
// skipped"), so cross-meeting speaker labeling produces nothing.
//
// Test strategy (decided, see Task 1 of the plan):
//   - Test A models the real MessagePortMain transfer constraint at the port
//     seam: the OLD pattern (transfer=[arrayBuffer]) throws, the NEW path
//     (empty / no transfer arg) does not.
//   - Test B asserts speakerEmbeddings requests "speaker.extract" WITHOUT a 3rd
//     transferList arg and still round-trips embeddingBuffer -> Float32Array.
//   - Test C is a STRUCTURAL source assertion: onnxWorker.js is a CJS worker
//     guarded by process.parentPort, does not export dispatch(), and cannot run
//     under vitest (no utility-process / onnxruntime). So we read its source and
//     assert dispatch() no longer transfers embeddingBuffer.
//
// No mocks beyond the port/worker seam (per the no-mocks rule).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const speakerEmbeddings = require("../helpers/speakerEmbeddings");
const onnxWorkerClient = require("../helpers/onnxWorkerClient");

// MessagePortMain transfer accepts only MessagePort, not ArrayBuffer.
// This fake port reproduces Electron's MessagePortMain.postMessage(message,
// transfer) constraint: it throws if `transfer` is a non-empty array that
// contains any element which is not a MessagePort. A { __isMessagePort: true }
// sentinel is treated as a valid port for completeness.
function makeFakeMessagePortMain() {
  const isMessagePort = (x) => !!x && typeof x === "object" && x.__isMessagePort === true;
  return {
    sent: [],
    postMessage(message, transfer) {
      if (Array.isArray(transfer) && transfer.length > 0) {
        for (let i = 0; i < transfer.length; i++) {
          if (!isMessagePort(transfer[i])) {
            throw new Error(`Port at index ${i} is not a valid port`);
          }
        }
      }
      this.sent.push({ message, transfer });
    },
  };
}

describe("Test A — MessagePortMain transfer constraint (the seam)", () => {
  it("OLD pattern: postMessage(reply, [arrayBuffer]) THROWS on a MessagePortMain-style port", () => {
    const port = makeFakeMessagePortMain();
    const reply = { id: 1, result: {} };
    const arrayBuffer = new Float32Array([1, 2, 3]).buffer;
    expect(() => port.postMessage(reply, [arrayBuffer])).toThrow(
      /Port at index 0 is not a valid port/
    );
  });

  it("NEW path: postMessage(reply, []) and postMessage(reply) do NOT throw", () => {
    const port = makeFakeMessagePortMain();
    const reply = { id: 1, result: {} };
    expect(() => port.postMessage(reply, [])).not.toThrow();
    expect(() => port.postMessage(reply)).not.toThrow();
    expect(port.sent).toHaveLength(2);
  });

  it("a real MessagePort sentinel in transfer is accepted", () => {
    const port = makeFakeMessagePortMain();
    expect(() =>
      port.postMessage({ id: 2 }, [{ __isMessagePort: true }])
    ).not.toThrow();
  });
});

describe("Test B — speakerEmbeddings requests speaker.extract without a transferList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls request('speaker.extract', { samplesBuffer }) with NO 3rd arg and returns a Float32Array", async () => {
    // Stub model-load so no real worker spawns (the only worker-seam stub).
    vi.spyOn(speakerEmbeddings, "_ensureLoaded").mockResolvedValue(undefined);

    const requestSpy = vi
      .spyOn(onnxWorkerClient, "request")
      .mockResolvedValue({ embeddingBuffer: new Float32Array([1, 2, 3]).buffer });

    // >= MIN_SEGMENT_SAMPLES (16000 * 1.5 = 24000) so extraction proceeds.
    const samples = new Float32Array(24000).fill(0.1);
    const out = await speakerEmbeddings.extractEmbeddingFromSamples(samples);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.mock.calls[0];
    expect(callArgs[0]).toBe("speaker.extract");
    expect(callArgs[1]).toHaveProperty("samplesBuffer");
    // No transferList 3rd arg — symmetric with localEmbeddings text.embed.
    expect(callArgs[2]).toBeUndefined();

    expect(out).toBeInstanceOf(Float32Array);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
});

describe("Test C — onnxWorker.js source no longer transfers embeddingBuffer", () => {
  const source = fs.readFileSync(require.resolve("./onnxWorker.js"), "utf8");

  it("dispatch() does NOT push embeddingBuffer into a transferList", () => {
    expect(source).not.toContain("transferList.push(result.embeddingBuffer)");
  });

  it("the success-branch return uses an empty transferList", () => {
    expect(source).toContain("transferList: []");
  });
});
