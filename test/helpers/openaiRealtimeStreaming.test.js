// Phase 07 PLAN-04: tests for openaiRealtimeStreaming empty-URL guard
// (Phase 05-02) and the URL-separator regression fix from Phase 05 CR-01.
//
// Mocking strategy: vi.doMock the generated build-config.cjs per test so we
// can swap empty / non-empty / pre-queried URLs between cases. require.cache
// reset is needed because openaiRealtimeStreaming.js destructures the URL at
// module load time (frozen on first require).
//
// Investigation findings (Task 1):
//   - Module exports the class directly: `module.exports = OpenAIRealtimeStreaming`.
//   - Constructor takes no args (state inits to nulls/empties).
//   - connect(options) — options.apiKey required. Empty-URL guard fires AFTER
//     the apiKey check but BEFORE the WebSocket constructor is called, so for
//     the empty-URL case we never need to mock `ws`.
//   - For non-empty URL tests we mock `ws` to capture the URL passed to
//     `new WebSocket(...)` and to avoid real network connect.

// vitest globals (vi, describe, test, expect, afterEach) enabled via
// `globals: true` in vitest.config.ts — no import needed.
const path = require("path");

const STREAMING_PATH = path.resolve(
  __dirname,
  "../../src/helpers/openaiRealtimeStreaming.js"
);
const CONFIG_PATH = path.resolve(
  __dirname,
  "../../src/config/build-config.generated.cjs"
);

function resetCaches() {
  vi.resetModules();
  delete require.cache[STREAMING_PATH];
  delete require.cache[CONFIG_PATH];
}

function loadStreamingWithMockedUrl(url) {
  resetCaches();
  vi.doMock(CONFIG_PATH, () => ({
    __esModule: false,
    default: { OPENWHISPR_REALTIME_WSS_URL: url },
    OPENWHISPR_REALTIME_WSS_URL: url,
  }));
  // eslint-disable-next-line global-require
  return require(STREAMING_PATH);
}

afterEach(() => {
  vi.doUnmock(CONFIG_PATH);
  vi.doUnmock("ws");
  resetCaches();
});

describe("openaiRealtimeStreaming — empty-URL guard (Phase 05-02)", () => {
  test("connect() throws when OPENWHISPR_REALTIME_WSS_URL is empty", async () => {
    const Streaming = loadStreamingWithMockedUrl("");
    const inst = new Streaming();
    await expect(inst.connect({ apiKey: "sk-test-key" })).rejects.toThrow(
      /OPENWHISPR_REALTIME_WSS_URL is empty/
    );
  });

  test("error message mentions both recovery knobs (URL var AND streaming-disable var)", async () => {
    const Streaming = loadStreamingWithMockedUrl("");
    const inst = new Streaming();

    let err;
    try {
      await inst.connect({ apiKey: "sk-test-key" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    // Recovery knob 1: how to provide a URL (mentions BOTH env vars users can set)
    expect(err.message).toMatch(/OPENWHISPR_BACKEND_URL/);
    expect(err.message).toMatch(/OPENWHISPR_REALTIME_WSS_URL/);
    // Recovery knob 2: how to disable streaming entirely
    expect(err.message).toMatch(/OPENWHISPR_STREAMING=false/);
  });

  test("URL with existing query string uses '&' separator (Phase 05 CR-01 regression)", async () => {
    // Mock `ws` to capture the URL passed to the WebSocket constructor without
    // performing a real network connect. We construct a fake instance that
    // never fires events — connect() will time out / hang on its Promise, but
    // we don't await it. We only need to observe the URL.
    let capturedUrl = null;
    function FakeWebSocket(url) {
      capturedUrl = url;
      this.readyState = 0;
      this.on = () => {};
      this.once = () => {};
      this.close = () => {};
      this.send = () => {};
    }
    FakeWebSocket.OPEN = 1;
    FakeWebSocket.CONNECTING = 0;
    FakeWebSocket.CLOSING = 2;
    FakeWebSocket.CLOSED = 3;

    resetCaches();

    // Inject FakeWebSocket directly into require.cache for the `ws` module —
    // vi.doMock doesn't reliably intercept plain `require()` calls in CJS
    // source code (only ESM imports / vitest-transformed code).
    const wsResolved = require.resolve("ws");
    const realWsCacheEntry = require.cache[wsResolved];
    require.cache[wsResolved] = {
      id: wsResolved,
      filename: wsResolved,
      loaded: true,
      exports: FakeWebSocket,
      children: [],
      paths: [],
    };

    // Same trick for build-config.generated.cjs (more reliable than vi.doMock
    // for CJS require() inside the SUT).
    require.cache[CONFIG_PATH] = {
      id: CONFIG_PATH,
      filename: CONFIG_PATH,
      loaded: true,
      exports: {
        OPENWHISPR_REALTIME_WSS_URL: "wss://corp.example.com/v1/realtime?intent=transcription",
      },
      children: [],
      paths: [],
    };

    // eslint-disable-next-line global-require
    const Streaming = require(STREAMING_PATH);
    const inst = new Streaming();

    // Fire-and-forget: connect() returns a Promise that won't resolve since
    // our fake WS never emits 'open' / session events. Don't await.
    inst.connect({ apiKey: "sk-test-key" }).catch(() => {});

    // The URL is computed synchronously before `new WebSocket(...)`.
    expect(capturedUrl).toBeTruthy();
    // Regression: must NOT contain double '?' — second separator should be '&'.
    expect(capturedUrl).not.toMatch(/\?[^?]*\?/);
    expect(capturedUrl).toBe(
      "wss://corp.example.com/v1/realtime?intent=transcription&intent=transcription"
    );

    // Cleanup
    try { inst.cleanup(); } catch {}
    if (realWsCacheEntry) require.cache[wsResolved] = realWsCacheEntry;
    else delete require.cache[wsResolved];
  });
});
