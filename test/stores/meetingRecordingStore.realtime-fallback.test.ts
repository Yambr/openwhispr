// Quick task 260604-tsa — meeting realtime empty-catalog fallback.
//
// Under a lockdown build with an EMPTY streaming-providers catalog,
// getMeetingTranscriptionOptions must NOT yield the api.openai.com path with a
// hardcoded OpenAI model. It returns a self-hosted relay descriptor:
//   { provider: "openai-realtime", model: undefined, mode: "openwhispr", language }
//
// Confirmed-safe absent-model contract (src/helpers/openaiRealtimeStreaming.js):
//   - mode "openwhispr" → ipcHandlers maps it to preconfigured:true
//     (connectRealtimeStreaming: `preconfigured: options.mode !== "byok"`).
//   - When preconfigured:true, the realtime client takes the "session.created
//     (preconfigured)" branch and NEVER sends a session.update — so this.model
//     (which would default to "gpt-4o-mini-transcribe" even for undefined via
//     `this.model = model || "gpt-4o-mini-transcribe"`) is NEVER put on the
//     wire; only logged. The server pins input_audio_transcription.model via
//     the ephemeral token. `model || default` also means undefined does NOT
//     crash the client.
//   Net: no OpenAI model name leaks to the wire, the transport stays the
//   server WSS (wssUrl derived from backendUrlState), and the client does not
//   crash on an undefined model.
//
// Default build (lockdown false) + empty catalog: the upstream return
// { provider: "openai-realtime", model: "gpt-4o-mini-transcribe", mode, language }
// is preserved byte-for-byte.

import { describe, it, expect, beforeEach, vi } from "vitest";

const { lockdownRef, providersRef, resolvedRef, settingsRef } = vi.hoisted(() => ({
  lockdownRef: { value: false },
  providersRef: { value: [] as any[] },
  resolvedRef: {
    value: {
      useLocalWhisper: false,
      cloudTranscriptionProvider: "openai",
      cloudTranscriptionMode: "openwhispr",
      cloudTranscriptionModel: undefined as string | undefined,
    },
  },
  settingsRef: { value: { preferredLanguage: "en", openaiApiKey: "" } },
}));

vi.mock("../../src/config/defaults", () => ({
  get PROVIDER_LOCKDOWN_ENABLED() {
    return lockdownRef.value;
  },
}));

vi.mock("../../src/stores/settingsStore", () => ({
  getSettings: () => settingsRef.value,
  selectResolvedMeetingTranscription: () => resolvedRef.value,
}));

vi.mock("../../src/stores/streamingProvidersStore", () => ({
  useStreamingProvidersStore: {
    getState: () => ({ providers: providersRef.value }),
  },
}));

vi.mock("../../src/utils/languageSupport", () => ({
  getBaseLanguageCode: (l: string) => l,
}));

vi.mock("../../src/utils/logger", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let getMeetingTranscriptionOptions: () => any;

beforeEach(async () => {
  vi.resetModules();
  lockdownRef.value = false;
  providersRef.value = [];
  resolvedRef.value = {
    useLocalWhisper: false,
    cloudTranscriptionProvider: "openai",
    cloudTranscriptionMode: "openwhispr",
    cloudTranscriptionModel: undefined,
  };
  settingsRef.value = { preferredLanguage: "en", openaiApiKey: "" };
  ({ getMeetingTranscriptionOptions } = await import(
    "../../src/stores/meetingRecordingStore.ts"
  ));
});

describe("getMeetingTranscriptionOptions — empty catalog fallback", () => {
  it("lockdown + empty catalog → self-hosted relay (mode openwhispr, no OpenAI model, no crash)", () => {
    lockdownRef.value = true;
    providersRef.value = [];
    const opts = getMeetingTranscriptionOptions();
    expect(opts.provider).toBe("openai-realtime");
    expect(opts.mode).toBe("openwhispr");
    expect(opts.model).not.toBe("gpt-4o-mini-transcribe");
    // undefined or "" — either is server-pinned/stripped and crash-safe.
    expect(opts.model == null || opts.model === "").toBe(true);
    expect(opts.language).toBe("en");
  });

  it("default build + empty catalog → upstream descriptor preserved byte-identical", () => {
    lockdownRef.value = false;
    providersRef.value = [];
    const opts = getMeetingTranscriptionOptions();
    expect(opts).toEqual({
      provider: "openai-realtime",
      model: "gpt-4o-mini-transcribe",
      mode: "openwhispr",
      language: "en",
    });
  });

  it("non-empty catalog (lockdown) → provider/model resolved from the catalog (unchanged)", () => {
    lockdownRef.value = true;
    providersRef.value = [
      {
        id: "openai",
        models: [{ id: "server-pinned", default: true }],
      },
    ];
    resolvedRef.value.cloudTranscriptionModel = "server-pinned";
    const opts = getMeetingTranscriptionOptions();
    expect(opts.provider).toBe("openai-realtime");
    expect(opts.model).toBe("server-pinned");
  });
});
