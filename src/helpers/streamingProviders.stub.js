// Phase 04.1 PLAN-05 (CFG-09 STREAMING_ENABLED): stub used when
// STREAMING_ENABLED=false at build time. Vite aliases ./streamingProviders to
// this file so the AssemblyAI / Deepgram / OpenAI-realtime preload method
// literals (`assemblyAiStreamingStart`, `deepgramStreamingStart`, etc.) are
// physically absent from the renderer bundle.
//
// All entries return safe no-op shapes so audioManager.shouldUseStreaming() can
// still return false / fall back to file-upload transcription without runtime
// errors. The stub deliberately contains zero `assembly` / `deepgram` /
// `dictationRealtime` literals so the bundle-grep gate (verify-feature-gating)
// passes.

const STUB_PROVIDER = {
  warmup: () => Promise.resolve({ success: false, error: "Streaming disabled in this build" }),
  start: () => Promise.resolve({ success: false, error: "Streaming disabled in this build" }),
  send: () => {},
  finalize: () => {},
  stop: () => Promise.resolve({ success: false, error: "Streaming disabled in this build" }),
  status: () => Promise.resolve({ isConnected: false }),
  onPartial: () => () => {},
  onFinal: () => () => {},
  onError: () => () => {},
  onSessionEnd: () => () => {},
};

const STREAMING_PROVIDERS = new Proxy(
  {},
  {
    get() {
      return STUB_PROVIDER;
    },
  }
);

export default STREAMING_PROVIDERS;
