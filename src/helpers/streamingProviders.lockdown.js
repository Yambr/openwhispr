// PROVIDER_LOCKDOWN variant of streamingProviders.js. The default catalog
// carries three entries; the two alternative third-party streaming providers
// are removed by corporate lockdown. Under PROVIDER_LOCKDOWN the sole streaming
// path is our server's /v1/realtime WSS proxy, reached through the sole
// `openai-realtime` entry below — which plan 01 (260522-wt6) repointed to
// authenticate with the Better Auth session bearer instead of an OpenAI key.
//
// src/vite.config.mjs aliases streamingProviders.js to THIS file when
// STREAMING_ENABLED && PROVIDER_LOCKDOWN_ENABLED, so the lockdown renderer
// bundle contains zero alternative-provider streaming literals (verified by
// scripts/verify-provider-lockdown.js) while realtime streaming stays live.

const STREAMING_PROVIDERS = {
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
