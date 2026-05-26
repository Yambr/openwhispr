# Quick 260526-ix4: Client realtime WSS — pass settings.preferredLanguage as `?language=`

**Researched:** 2026-05-26
**Confidence:** HIGH (codebase grep + upstream blame verified)
**Scope:** lean — quick task, two-file diff plus a verify hook

## Summary

The renderer **already** plumbs `language` through every realtime entry point — `connectRealtimeStreaming` (line 4302) and the dictation `connectInner` path receives options carrying `language` from `audioManager.js` (lines 2065, 2290) and `meetingRecordingStore.ts` (line 113). The **only** missing wire is inside `src/helpers/openaiRealtimeStreaming.js`: `connect(options)` destructures `{ apiKey, model, preconfigured }` and silently drops `options.language`. The fix is a 4-line change to (a) destructure `language` and (b) append `&language=<base>` to the URL when set.

The dictation handler (`connectDictationStreaming` → `connectInner`, line 5125) currently does not forward `language` from `options` — but its caller (`audioManager.startStreamingRecording` line 2288 and `audioManager.warmupStreamingConnection` line 2063) already provides it in the options object. The handler only needs to add `language: options.language` to the `streaming.connect({...})` call (one extra line).

**Primary recommendation:** Two-file diff (`openaiRealtimeStreaming.js` + the single `connectInner` line in `ipcHandlers.js`). Upstream-PR-ready: signature change is universal, URL construction already handles `?` vs `&` separator.

## Architectural Responsibility Map

| Capability | Primary tier | Notes |
|-----------|--------------|-------|
| Language preference resolution | Renderer (settingsStore + getBaseLanguageCode) | `getBaseLanguageCode("en-US") → "en"`, `"auto" → undefined` (already canonical) |
| Language → query-string serialization | Main process (openaiRealtimeStreaming.connect) | Single point of URL construction |
| Language → `session.update.transcription.language` injection | Server (`apps/api/src/routes/realtime.ts`, xgohagty's parallel work) | Out of client scope |
| Whitelist enforcement (`['en','ru']`) | Server (authoritative) — client may also pre-filter to avoid wasted query param | See "Whitelist strategy" below |

## Call sites (exhaustive grep)

**`OpenAIRealtimeStreaming.connect()` is called in 4 places (`src/helpers/ipcHandlers.js`):**

| Line | Path | Callers send `language`? |
|------|------|-------------------------|
| 4332 | `connectRealtimeStreaming` (meeting Promise.all loop, both mic + system streams) | **YES** — `connectOpts` line 4300-4304 includes `language: options.language` (already provided by `meetingRecordingStore.getMeetingTranscriptionOptions()` line 113) |
| 5133 | `connectDictationStreaming` → `connectInner` (dictation panel realtime) | **NO** (currently) — but caller IPC payload from `audioManager.startStreamingRecording` line 2288 and `audioManager.warmupStreamingConnection` line 2063 **already** contains `language: preferredLang && preferredLang !== "auto" ? preferredLang : undefined`. Just unwired in `connectInner`. |
| 6739 | `assemblyAiStreaming.connect({ ...options, token })` | Spread-passes options through; AssemblyAI handles language separately, **NOT in scope** (different class, different transport) |
| 6984 | `deepgramStreaming.connect({ ...options, token })` | Same — Deepgram handles language separately, **NOT in scope** |

**Conclusion:** Two `OpenAIRealtimeStreaming` call sites touched by this change: the dictation `connectInner` (add `language:` line) and `connectRealtimeStreaming` (already passes it via `connectOpts`, no edit needed).

## `getBaseLanguageCode` — exact semantics

**File:** `src/utils/languageSupport.ts:27-30`

```ts
export function getBaseLanguageCode(language: string | null | undefined): string | undefined {
  if (!language || language === "auto") return undefined;
  return language.split("-")[0];
}
```

- `undefined`/`null`/`""`/`"auto"` → `undefined` (server will omit `language` field → auto-detect)
- `"en-US"`, `"en-GB"`, `"en"` → `"en"`
- `"ru"` → `"ru"`
- `"zh-CN"`, `"zh-TW"` → `"zh"` (server-side: gpt-realtime accepts `zh`; outside whitelist anyway)

Note: registry codes (`src/config/languageRegistry.json`) use locale forms like `en-US`, `zh-CN`. The `.split("-")[0]` step is necessary — without it, the server would receive `en-US` and reject it (ISO-639-1 expects 2 chars).

## Settings flow into main-process options

**`preferredLanguage` is renderer-only** (`localStorage` + Zustand store, `src/stores/settingsStore.ts:715`). Main process never reads it directly. The renderer resolves it via `getBaseLanguageCode()` and **must** put the resolved base code in every IPC `options` payload.

| Path | Renderer code | Already passes language? |
|------|--------------|--------------------------|
| Dictation warmup | `audioManager.js:2063` | YES (`language: warmupLang && warmupLang !== "auto" ? warmupLang : undefined` — note: NOT `.split("-")[0]`!) |
| Dictation start | `audioManager.js:2288` | YES (same as above, also NOT split) |
| Meeting prepare | `meetingRecordingStore.ts:113` | YES — via `getBaseLanguageCode(state.preferredLanguage)` (this one DOES split) |
| Meeting start | `meetingRecordingStore.ts:139` (the fallback path's `{ provider, model, mode }` lacks `language`) | **PARTIAL** — top-level path includes `language`, OpenAI default-fallback branch drops it |

### ⚠️ Inconsistency to fix

`audioManager.js` paths pass `preferredLang` **without** `.split("-")[0]` — so when a user selects `en-US` the value `"en-US"` gets sent across IPC. The server-side whitelist (xgohagty's `['en','ru']`) would reject `en-US`. Either:
- (A) Normalize **renderer-side** in `audioManager.js` lines 2063 + 2288 to use `getBaseLanguageCode(...)` (consistent with meeting + batch paths — RECOMMENDED).
- (B) Normalize **main-process-side** in `openaiRealtimeStreaming.js:connect()` by splitting on `-`.

Option A is cleaner: one place in the renderer settles "what's the STT language code we send to the server". Touching `audioManager.js` to use the already-imported `getBaseLanguageCode` (line 7) is upstream-parity-safe — `audioManager.js` is a Yambr/upstream-shared file and is allowed to import that util (it does so already at lines 428, 654, 1266, 1381, 2512).

## Whitelist strategy

**Server's whitelist is authoritative.** The xgohagty server will validate `?language=` against `['en','ru']` and ignore/reject mismatches. The client should:

1. **Not** maintain its own whitelist constant for v1 (avoids future skew — when server adds `de`, client wouldn't need a release).
2. **Always send** the resolved `getBaseLanguageCode(preferredLanguage)` if it's defined.
3. Server falls back to `REALTIME_DEFAULT_LANGUAGE` env if the value isn't in its whitelist (xgohagty confirmed); for the corporate build this gracefully handles users who set `de` etc. before server whitelist expands.

This is also the right choice for the upstream PR: upstream OpenWhispr doesn't know about Yambr's whitelist; the upstream-clean patch is "if user has a preferredLanguage, pass it through, let the realtime endpoint decide".

## Proposed diff (lean reference, not the plan)

### File 1: `src/helpers/openaiRealtimeStreaming.js`

```js
// line 37
const { apiKey, model, preconfigured, language } = options;
// ...
// line 67-68 — append &language= when set; URL already has ?intent=
const sep = OPENWHISPR_REALTIME_WSS_URL.includes("?") ? "&" : "?";
const langSuffix = language ? `&language=${encodeURIComponent(language)}` : "";
const url = `${OPENWHISPR_REALTIME_WSS_URL}${sep}intent=transcription${langSuffix}`;
```

(`encodeURIComponent` on a 2-char ISO is overkill but harmless and defensive against accidental non-2-char inputs.)

### File 2a: `src/helpers/ipcHandlers.js:5133`

```js
await streaming.connect({
  apiKey,
  model: options.model || (BuildConfig.PROVIDER_LOCKDOWN_ENABLED ? "gpt-realtime" : "gpt-4o-mini-transcribe"),
  preconfigured: isCloud,
  language: options.language,  // NEW
});
```

### File 2b: `src/helpers/audioManager.js:2063, 2288` (whitespace-minimal, optional but RECOMMENDED for whitelist parity)

```js
// import already present at line 7: import { getBaseLanguageCode } from "../utils/languageSupport";
// line 2065:
language: getBaseLanguageCode(warmupLang),
// line 2290:
language: getBaseLanguageCode(preferredLang),
```

`getBaseLanguageCode` already normalizes `"auto"` → `undefined`, so the `&& !== "auto"` guard becomes redundant — drop it.

### File 2c: `src/stores/meetingRecordingStore.ts:139` (consistency fix — currently the OpenAI-fallback returns no `language`)

```ts
return { provider: "openai-realtime" as const, model: "gpt-4o-mini-transcribe", mode, language };
```

(Top-level `language` const at line 113 is in scope.)

## Upstream-parity check (mandatory per CLAUDE.md)

| File | Status | Action |
|------|--------|--------|
| `src/helpers/openaiRealtimeStreaming.js` | Upstream + 6 lines of Yambr drift (BuildConfig import + URL construction). The `connect(options)` signature and entire promise/event flow is byte-identical to upstream. | **Adding `language` to options is upstream-PR-ready.** File a parallel PR to `openwhispr/main`. |
| `src/helpers/ipcHandlers.js:5133` | Yambr-drift block — `BuildConfig.PROVIDER_LOCKDOWN_ENABLED` ternary for model default is Yambr-only. Upstream's `connectInner` at line 5094 is similar but without lockdown branch. | Both upstream and Yambr can take the `language: options.language` line — it's additive, doesn't touch the lockdown ternary. Upstream PR can include this. |
| `src/helpers/audioManager.js:2063, 2288` | Shared with upstream — these lines exist in upstream verbatim (post-1.7.2 merge). | `getBaseLanguageCode` normalisation is upstream-PR-ready (refactor with no behavior change for `auto`/`en`/`ru`; for `en-US`/`zh-CN` it's a behavior FIX that benefits upstream too). |
| `src/stores/meetingRecordingStore.ts:139` | Shared with upstream. | Trivial upstream-PR-ready fix. |

**Net:** zero new Yambr drift. The upstream PR is the full diff above. The Yambr branch carries the same diff and ships immediately.

## Pitfalls

1. **Don't `encodeURIComponent` on `?intent=transcription` when adding `language`** — only encode the language value. The current line 68 hard-codes `?intent=transcription` without encoding, so just continue that pattern.
2. **`language=undefined` is not the same as omitting it.** Use a truthy check, not template-literal interpolation that would emit the string `"undefined"`. The proposed `langSuffix` variable handles this.
3. **`audioManager.js:2065` currently emits `en-US` not `en`.** If you only touch `openaiRealtimeStreaming.js` without fixing `audioManager.js`, the server will reject `en-US` (per xgohagty's whitelist). This means the dictation path stays broken for `en-US` users even after the connect() fix. **Both fixes must ship together.**
4. **Preconfigured-session note.** When `preconfigured=true` (cloud mode), the client skips its own `session.update` (line 134-147). The query-string `?language=` therefore reaches the server BEFORE the session is created, and the server injects `transcription.language` into the proxied session.update. The query-string is the only place to land this signal — there's no client-side fallback path.
5. **Meeting two-stream case.** `connectRealtimeStreaming` calls `streaming.connect()` for both `_meetingMicStreaming` and `_meetingSystemStreaming` with the same `connectOpts` (line 4330-4334). The language flows to BOTH streams, which is correct (both transcribe the same session's primary language).
6. **`encodeURIComponent("ru")` returns `"ru"`** — verified, no surprise allocations.

## Testing strategy

### Unit (recommended — lightweight)
- New: `src/helpers/openaiRealtimeStreaming.test.cjs` or extend an existing file
- Mock `ws` module's `WebSocket` constructor; assert the URL passed to `new WebSocket(url, ...)` includes `&language=ru` when `connect({apiKey, language: "ru"})` is called.
- Assert NO `language=` when `language` is `undefined`, `null`, `""`, or `"auto"` (the last only matters if upstream-callers were to pass `"auto"` raw, but `getBaseLanguageCode` already filters; defensive coverage).
- Run with `node --test` (CommonJS, consistent with `src/helpers/generate-build-config.test.cjs`) — NOT vitest, since this file is `.js` CJS and node:test is already separated in vitest.config exclusions per quick `260522-smj`.

### Integration (deferred / manual)
- Real verification is end-to-end: dictation in Russian with `preferredLanguage: ru-RU`, observe (a) server logs that received `?language=ru`, (b) `session.update` frame contained `transcription.language: "ru"`, (c) transcript stays Russian over 5+ short utterances. Requires xgohagty's server change to be live.
- Per global memory `live_verification_over_green_tests` — unit tests passing is necessary-but-not-sufficient. The real proof is live Russian dictation.

### Test infrastructure available
- node:test (CommonJS) — for `.js` helper files. Pattern: `src/helpers/generate-build-config.test.cjs`.
- vitest — for `.ts` renderer files. `openaiRealtimeStreaming` is CommonJS, so node:test.

## Files to touch (final list)

1. `src/helpers/openaiRealtimeStreaming.js` — destructure `language`, append to URL (4 lines changed)
2. `src/helpers/ipcHandlers.js` — line 5133 `connectInner`, add `language: options.language` (1 line added)
3. `src/helpers/audioManager.js` — lines 2065, 2290, use `getBaseLanguageCode()` instead of inline guard (refactor, semantic fix for `en-US`/`zh-CN`)
4. `src/stores/meetingRecordingStore.ts` — line 139, include `language` in fallback return (1 line)
5. **New:** `src/helpers/openaiRealtimeStreaming.test.cjs` — URL-build assertions
6. Optional: extend `scripts/verify-feature-gating.js` or `verify-provider-lockdown.js` to assert `language` token doesn't leak inappropriate paths (probably overkill for this scope)

## Upstream PR (parallel work)

Submit to `openwhispr/main` with the diff above except File 2 (Yambr-specific lockdown ternary line). Title suggestion: *"feat(realtime): forward user-preferred STT language to /v1/realtime"*. Cite OpenAI Realtime API GA's `session.update.session.audio.input.transcription.language` field as the upstream sink (server-side they already inject when the relay handler sees the query-string, but for upstream's direct OpenAI connection it would need a corresponding client-side `session.update` patch — which line 153-172 already builds. Adding `language: this.language` to that `transcription` object solves upstream's BYOK case too).

For the **upstream PR you'd also extend** the line 161 `transcription: { model: this.model }` to `transcription: { model: this.model, ...(this.language ? { language: this.language } : {}) }` so non-preconfigured (direct OpenAI BYOK) connections get the same benefit. This is **outside Yambr's scope** (lockdown always uses preconfigured=true and the server owns session.update injection) but the upstream PR should include it for completeness.

## Open questions

1. **Should we always lowercase the language code?** `getBaseLanguageCode` does `.split("-")[0]` but doesn't lowercase. ISO-639-1 is canonically lowercase; if a user store contains `"RU"` (unlikely but possible), the server might 400. Recommendation: add `.toLowerCase()` defensively in `getBaseLanguageCode` itself (and unit-test the path). Out-of-scope for THIS quick task; flag for follow-up if it bites.
2. **Should `preview` path (`startDictationPreview` line 5597) also get language?** It already receives `language` in its options (`audioManager.js:428`), but the preview path uses local Whisper/Parakeet, not realtime WSS — different code path, no change needed.

## Sources

- HIGH: codebase grep + `git show upstream/main:<file>` blame checks
- HIGH: `src/utils/languageSupport.ts:27-30` for `getBaseLanguageCode` semantics
- HIGH: `src/config/languageRegistry.json` for canonical code list (`en-US`, `en-GB`, `ru`, `zh-CN`, etc.)
- HIGH: `src/helpers/ipcHandlers.js` lines 4302, 5133, 6739, 6984 for all `.connect()` call sites
- MEDIUM (context-only, not code-changing): xgohagty's parallel server work on `apps/api/src/routes/realtime.ts` — confirmed via the research_context briefing; no code access verified
