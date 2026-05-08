// Phase 04.1 PLAN-05 (CFG-09 STREAMING_ENABLED): leaf module that is the SOLE
// renderer-side carrier of the AssemblyAI / Deepgram / OpenAI realtime
// streaming preload-API method literals. When STREAMING_ENABLED=false at build
// time, src/vite.config.mjs aliases this module to ./streamingProviders.stub.js
// so the literal `assemblyAiStreamingStart` / `deepgramStreamingStart` / etc.
// names are physically absent from the renderer bundle (verified by
// scripts/verify-feature-gating.js).
//
// audioManager.js imports STREAMING_PROVIDERS from this module and looks up the
// per-provider binding by name. The stub returns an object whose lookup falls
// through to a no-op recorder, so the chat/dictation experience gracefully
// falls back to file-upload / non-streaming transcription (which is the
// corporate-minimal default per the 2026-05-08 pivot).

const STREAMING_PROVIDERS = {
  deepgram: {
    warmup: (opts) => window.electronAPI.deepgramStreamingWarmup(opts),
    start: (opts) => window.electronAPI.deepgramStreamingStart(opts),
    send: (buf) => window.electronAPI.deepgramStreamingSend(buf),
    finalize: () => window.electronAPI.deepgramStreamingFinalize(),
    stop: () => window.electronAPI.deepgramStreamingStop(),
    status: () => window.electronAPI.deepgramStreamingStatus(),
    onPartial: (cb) => window.electronAPI.onDeepgramPartialTranscript(cb),
    onFinal: (cb) => window.electronAPI.onDeepgramFinalTranscript(cb),
    onError: (cb) => window.electronAPI.onDeepgramError(cb),
    onSessionEnd: (cb) => window.electronAPI.onDeepgramSessionEnd(cb),
  },
  assemblyai: {
    warmup: (opts) => window.electronAPI.assemblyAiStreamingWarmup(opts),
    start: (opts) => window.electronAPI.assemblyAiStreamingStart(opts),
    send: (buf) => window.electronAPI.assemblyAiStreamingSend(buf),
    finalize: () => window.electronAPI.assemblyAiStreamingForceEndpoint(),
    stop: () => window.electronAPI.assemblyAiStreamingStop(),
    status: () => window.electronAPI.assemblyAiStreamingStatus(),
    onPartial: (cb) => window.electronAPI.onAssemblyAiPartialTranscript(cb),
    onFinal: (cb) => window.electronAPI.onAssemblyAiFinalTranscript(cb),
    onError: (cb) => window.electronAPI.onAssemblyAiError(cb),
    onSessionEnd: (cb) => window.electronAPI.onAssemblyAiSessionEnd(cb),
  },
  "openai-realtime": {
    warmup: (opts) => window.electronAPI.dictationRealtimeWarmup(opts),
    start: (opts) => window.electronAPI.dictationRealtimeStart(opts),
    send: (buf) => window.electronAPI.dictationRealtimeSend(buf),
    stop: () => window.electronAPI.dictationRealtimeStop(),
    onPartial: (cb) => window.electronAPI.onDictationRealtimePartial(cb),
    onFinal: (cb) => window.electronAPI.onDictationRealtimeFinal(cb),
    onError: (cb) => window.electronAPI.onDictationRealtimeError(cb),
    onSessionEnd: (cb) => window.electronAPI.onDictationRealtimeSessionEnd(cb),
  },
};

export default STREAMING_PROVIDERS;
