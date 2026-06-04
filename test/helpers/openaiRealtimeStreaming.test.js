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

describe("openaiRealtimeStreaming — runtime WSS host override (RC-2)", () => {
  // Inject a FakeWebSocket + a build-time constant into require.cache, then
  // connect() with/without options.wssUrl and observe the host the socket
  // was constructed with. Mirrors the proven CR-01 require.cache pattern.
  function connectAndCapture({ buildTimeUrl, connectOptions }) {
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
    require.cache[CONFIG_PATH] = {
      id: CONFIG_PATH,
      filename: CONFIG_PATH,
      loaded: true,
      exports: { OPENWHISPR_REALTIME_WSS_URL: buildTimeUrl },
      children: [],
      paths: [],
    };

    // eslint-disable-next-line global-require
    const Streaming = require(STREAMING_PATH);
    const inst = new Streaming();
    const promise = inst.connect({ apiKey: "sk-test-key", ...connectOptions });
    promise.catch(() => {});

    try { inst.cleanup(); } catch {}
    if (realWsCacheEntry) require.cache[wsResolved] = realWsCacheEntry;
    else delete require.cache[wsResolved];

    return { capturedUrl, promise, inst };
  }

  test("options.wssUrl overrides the build-time host", () => {
    const { capturedUrl } = connectAndCapture({
      buildTimeUrl: "wss://build-time.example.com/v1/realtime",
      connectOptions: { wssUrl: "wss://corp.internal/v1/realtime" },
    });
    expect(capturedUrl).toBeTruthy();
    expect(capturedUrl).toBe("wss://corp.internal/v1/realtime?intent=transcription");
    // The build-time host must NOT appear.
    expect(capturedUrl).not.toMatch(/build-time\.example\.com/);
  });

  test("no options.wssUrl falls back to the build-time host (default build)", () => {
    const { capturedUrl } = connectAndCapture({
      buildTimeUrl: "wss://build-time.example.com/v1/realtime",
      connectOptions: {},
    });
    expect(capturedUrl).toBeTruthy();
    expect(capturedUrl).toBe("wss://build-time.example.com/v1/realtime?intent=transcription");
  });

  test("empty options.wssUrl ('' from deriveRealtimeWssUrl) falls back to the build-time host", () => {
    // deriveRealtimeWssUrl returns "" when getBackendUrl() is empty — the
    // streaming class must treat that as "no override" and use the constant.
    const { capturedUrl } = connectAndCapture({
      buildTimeUrl: "wss://build-time.example.com/v1/realtime",
      connectOptions: { wssUrl: "" },
    });
    expect(capturedUrl).toBeTruthy();
    expect(capturedUrl).toBe("wss://build-time.example.com/v1/realtime?intent=transcription");
  });

  test("both options.wssUrl and build-time constant empty → fail-fast throw, no WebSocket", async () => {
    // resolved host is empty → the existing defensive Error fires; the socket
    // is never constructed (no fallback to api.openai.com).
    const Streaming = loadStreamingWithMockedUrl("");
    const inst = new Streaming();
    await expect(
      inst.connect({ apiKey: "sk-test-key", wssUrl: "" })
    ).rejects.toThrow(/OPENWHISPR_REALTIME_WSS_URL is empty/);
  });
});

describe("openaiRealtimeStreaming — language query-param suffix (260526-ix4)", () => {
  // Build a URL by invoking connect() with the given language option against a
  // FakeWebSocket that captures the URL synchronously. Reuses the same
  // require.cache injection pattern as the CR-01 test above (proven reliable
  // against CJS require() inside the SUT).
  function buildUrlWith(language) {
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

    // Use a URL with NO pre-existing query string — `sep` resolves to '?' so
    // we can write tight regexes anchored on `?intent=transcription`.
    require.cache[CONFIG_PATH] = {
      id: CONFIG_PATH,
      filename: CONFIG_PATH,
      loaded: true,
      exports: {
        OPENWHISPR_REALTIME_WSS_URL: "wss://test.example.com/v1/realtime",
      },
      children: [],
      paths: [],
    };

    // eslint-disable-next-line global-require
    const Streaming = require(STREAMING_PATH);
    const inst = new Streaming();

    // Build the options object the way the IPC layer does: only pass
    // `language` when the caller actually wants to test that key. When the
    // test asks for `undefined` we still pass the key explicitly so we cover
    // the "key present, value undefined" shape that connect() destructures.
    inst.connect({ apiKey: "sk-test-key", language }).catch(() => {});

    try { inst.cleanup(); } catch {}
    if (realWsCacheEntry) require.cache[wsResolved] = realWsCacheEntry;
    else delete require.cache[wsResolved];

    return capturedUrl;
  }

  test("language='ru' appends &language=ru to URL", () => {
    const url = buildUrlWith("ru");
    expect(url).toBeTruthy();
    expect(url).toMatch(/&language=ru(?:$|&)/);
  });

  test("language='en' appends &language=en to URL", () => {
    const url = buildUrlWith("en");
    expect(url).toBeTruthy();
    expect(url).toMatch(/&language=en(?:$|&)/);
  });

  test("language omitted (no key in options) produces URL with no language= substring", () => {
    // Same FakeWebSocket pattern but exercise the "no language key at all"
    // branch — connect() destructure must yield undefined → no suffix.
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
    require.cache[CONFIG_PATH] = {
      id: CONFIG_PATH,
      filename: CONFIG_PATH,
      loaded: true,
      exports: { OPENWHISPR_REALTIME_WSS_URL: "wss://test.example.com/v1/realtime" },
      children: [],
      paths: [],
    };
    // eslint-disable-next-line global-require
    const Streaming = require(STREAMING_PATH);
    const inst = new Streaming();
    inst.connect({ apiKey: "sk-test-key" }).catch(() => {});
    try { inst.cleanup(); } catch {}
    if (realWsCacheEntry) require.cache[wsResolved] = realWsCacheEntry;
    else delete require.cache[wsResolved];

    expect(capturedUrl).toBeTruthy();
    expect(capturedUrl).not.toMatch(/language=/);
  });

  test("language=null produces URL with no language= substring", () => {
    const url = buildUrlWith(null);
    expect(url).toBeTruthy();
    expect(url).not.toMatch(/language=/);
  });

  test("language='' produces URL with no language= substring", () => {
    const url = buildUrlWith("");
    expect(url).toBeTruthy();
    expect(url).not.toMatch(/language=/);
  });

  test("language=undefined produces URL with no language= substring", () => {
    const url = buildUrlWith(undefined);
    expect(url).toBeTruthy();
    expect(url).not.toMatch(/language=/);
  });

  test("language='ru' preserves intent=transcription before language suffix", () => {
    const url = buildUrlWith("ru");
    expect(url).toBeTruthy();
    // intent=transcription must come first (single '?' separator before it),
    // then the language suffix joined by '&'.
    expect(url).toMatch(/\?intent=transcription&language=ru/);
  });
});
