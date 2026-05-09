---
phase: 05
phase_name: route-all-realtime-asr-diarization-streaming-through-corpora
captured: 2026-05-09
mode: discuss-skipped (deep-context gathered from sibling backend repo)
---

# Phase 05 Context — Route Streaming Through Corporate Backend

## Reframed goal (after backend repo investigation)

The original phase title sounded big — "remove three streaming providers, replace with one Yambr provider, redesign". After reading `~/openwhispr-server/.planning/ROADMAP.md` and `~/openwhispr-server/speaches-audio.md`, the actual scope is **much smaller**: the backend already implements the upstream wire-API contract byte-for-byte (CLAUDE.md line 12), and the corporate Speaches/LiteLLM stack already exposes the OpenAI-Realtime-compatible `WSS /v1/realtime` endpoint. The client just needs to **point at the backend's domain instead of hardcoded third-party domains**.

**Real goal:** When the maintainer sets `OPENWHISPR_BACKEND_URL=https://api.your-domain.com` at build time, the client should automatically route ALL realtime/streaming traffic through that domain — no more direct `wss://api.openai.com/v1/realtime`, `wss://api.deepgram.com/...`, or `wss://streaming.assemblyai.com/...` from the desktop client. The backend (Speaches via LiteLLM) handles the upstream relay.

## What the backend already promises

From `~/openwhispr-server/.planning/ROADMAP.md` Phase 4 ("Streaming + Realtime") + `~/openwhispr-server/speaches-audio.md`:

| Endpoint | Purpose | Status in backend roadmap |
|---|---|---|
| `WSS /v1/realtime` | OpenAI-Realtime-compatible WebSocket via Speaches+LiteLLM. 3600s read/send timeouts. | Backend Phase 4 (planned) |
| `POST /api/streaming-token` (WIRE-13) | Mints AssemblyAI streaming token from server-held key. 503 if AssemblyAI not configured. | Backend Phase 4 (planned) |
| `POST /api/deepgram-streaming-token` (WIRE-14) | Same for Deepgram. | Backend Phase 4 (planned) |
| `POST /api/openai-realtime-token` (WIRE-15) | OpenAI Realtime token with `streams=2`, returns `clientSecrets[]`. | Backend Phase 4 (planned) |
| `POST /api/agent/stream` (WIRE-07) | NDJSON line-flush, < 500ms first-line latency. | Backend Phase 4 (planned) |
| `POST /v1/audio/transcriptions` | Batch Whisper (already works in batch mode of our existing /api/transcribe) | Speaches direct |
| `POST /v1/audio/diarization` | pyannote-based speaker diarization. | Speaches direct |

From `speaches-audio.md`:

> Speaches master deployed on `aimodels.inner.alfaleasing.ru`, container `llm-speaches`, image `speaches-local:master-cuda-12.6.3`, port 8014. nginx proxies three audio routes, all reachable through LiteLLM proxy with key check. **`WSS /v1/realtime?model=alfaleasing/speaches-realtime`** — streaming transcription / conversational mode via OpenAI Realtime API spec. Speaches claims compatibility with that spec. LiteLLM v1.82.0+ supports `mode: realtime` — it raises the upstream WS itself and forwards events bidirectionally. Ingress allows WebSocket Upgrade with 3600s read/send timeouts.

**Translation:** the corporate backend already terminates the WebSocket and proxies to Speaches. Our client just needs to connect to `wss://${OPENWHISPR_BACKEND_URL}/v1/realtime?model=...` instead of `wss://api.openai.com/v1/realtime`.

## What the client does today

Current state of streaming providers in our desktop client:

### 1. `src/helpers/openaiRealtimeStreaming.js:54`

```js
const url = "wss://api.openai.com/v1/realtime?intent=transcription";
```

Hardcoded. **This is the main one to fix** — Speaches is OpenAI-Realtime-compatible, so a one-line URL swap (plus build-time config) is the entire fix.

### 2. `src/helpers/deepgramStreaming.js:149`

```js
const url = "wss://api.deepgram.com/v1/listen?model=...";
```

Hardcoded direct connection to api.deepgram.com. Token endpoint `/api/deepgram-streaming-token` is already routed through `${OPENWHISPR_BACKEND_URL}` (our backend mints the upstream token). But the WSS itself bypasses the backend.

### 3. `src/helpers/assemblyAiStreaming.js:67`

```js
const url = `wss://streaming.assemblyai.com/v3/ws?token=${token}&...`;
```

Same pattern as Deepgram — token via our backend, WSS direct to AssemblyAI.

## Decisions (locked)

### D-01: Default streaming target = corporate backend's `/v1/realtime`

When `OPENWHISPR_BACKEND_URL` is set at build time, the new env var `OPENWHISPR_REALTIME_WSS_URL` defaults to `wss://${derived from OPENWHISPR_BACKEND_URL}/v1/realtime`. Maintainers can override explicitly if their backend exposes realtime on a different host (e.g., separate WSS-only ingress). When `OPENWHISPR_BACKEND_URL` is empty (offline build), realtime is unavailable — the existing `STREAMING_ENABLED=false` guard already covers this.

### D-02: Re-enable `STREAMING_ENABLED=true` by default

Phase 04.1 default was `false` because corporate-minimal didn't want third-party realtime. With Phase 05's pivot, realtime now goes through the corporate backend (no third-party leak), so the corporate-minimal default has no reason to keep it off. Notes recording defaults to streaming again, per upstream behavior.

**This is a CFG-09 amendment** — `STREAMING_ENABLED` flips default from `false` to `true`. The old default-false behavior is still available via `OPENWHISPR_STREAMING=false` for backends that haven't implemented the realtime relay yet.

### D-03: AssemblyAI / Deepgram = BYOK opt-in only

The two non-OpenAI-compat streaming providers (Deepgram, AssemblyAI) are kept in the codebase but become **BYOK direct only** — when a user enters their own Deepgram/AssemblyAI key, the client connects directly to api.deepgram.com / streaming.assemblyai.com (current behavior). The corporate cloud path through `/api/{deepgram,}streaming-token` is **deprecated** for these two providers; the backend may continue to mint tokens (per WIRE-13/WIRE-14) but the client's UI no longer surfaces "use cloud Deepgram via OpenWhispr Cloud" — that mode collapses into "use the corporate `wss://.../v1/realtime`" via Speaches.

Why: Deepgram/AssemblyAI are commercial third parties; their value is their proprietary models. If the corporate backend has Speaches + faster-whisper, there's no reason to also route Deepgram/AssemblyAI through it. Power users with strong vendor preference can BYOK directly.

### D-04: OpenAI Realtime = the canonical "cloud realtime" path

`openaiRealtimeStreaming.js` becomes the canonical streaming code path for the corporate backend. The wire protocol is OpenAI Realtime API (which Speaches implements). No new helper file needed.

### D-05: Diarization stays local (sherpa-onnx)

Per `~/openwhispr/src/helpers/diarization.js` + `liveSpeakerIdentifier.js` + `speakerEmbeddings.js`, diarization runs locally in the main process via sherpa-onnx. This is independent of streaming and stays as-is. Backend's `/v1/audio/diarization` (Speaches+pyannote) is a future option but **not part of this phase** — local diarization works for the common case.

### D-06: Token endpoints stay routed through backend

`POST /api/streaming-token`, `POST /api/deepgram-streaming-token`, `POST /api/openai-realtime-token` — all three already route through `${OPENWHISPR_BACKEND_URL}` (Phase 3 work). No changes needed. Backend Phase 4 implements the server side.

### D-07: No hardcoded API keys in client (verified)

The earlier user concern about a "hardcoded Deepgram key" was investigated — no hardcoded keys exist in the current client codebase. All keys come from env vars (BYOK) or via the token endpoint (cloud mode). This phase verifies via code-review/grep that no future regression introduces hardcoded keys.

## Out of scope for Phase 05

- **Removing Deepgram/AssemblyAI helpers entirely** — kept for BYOK direct. If we ever decide to fully drop them, that's a separate cleanup phase.
- **Building the corporate backend's realtime endpoint** — that's Backend Phase 4 work in `~/openwhispr-server/`. Our client phase assumes the backend implements the contract.
- **Diarization service migration** — local sherpa-onnx works fine; backend `/v1/audio/diarization` deferred.
- **Speaches model selection UI** — server-side concern (per `WIRE-11` `/api/stt-config`); Phase 5 just connects to whatever the backend says is available.
- **Telegram-build-on-demand workflow integration** — that's @yambrcom's manual process, not a code change.

## Success criteria (what must be TRUE after Phase 05)

1. **`openaiRealtimeStreaming.js` reads URL from build-config**, not hardcoded `wss://api.openai.com/v1/realtime`. New env var `OPENWHISPR_REALTIME_WSS_URL` documented in `docs/BUILD_CONFIG.md`.
2. **Default URL derives from `OPENWHISPR_BACKEND_URL`** when set — no manual config needed for the common case.
3. **`STREAMING_ENABLED` default flips back to `true`** in `scripts/generate-build-config.js`. CFG-09 in PROJECT.md updated to reflect this.
4. **Build-time verification**: `OPENWHISPR_BACKEND_URL=https://api.example.com npm run pack` produces a bundle where the renderer's hardcoded `api.openai.com` realtime URL is replaced with `api.example.com`. Add a grep target to `scripts/verify-feature-gating.js` (or a new `verify-realtime-routing.js`).
5. **Default build (no env)** continues to work — `OPENWHISPR_BACKEND_URL=""` means realtime falls back gracefully (currently: streaming disabled). Document this fallback explicitly.
6. **`docs/BACKEND_SPEC.md` updated** with the realtime endpoint contract — `WSS /v1/realtime?model=<provider/model>`, OpenAI-Realtime-compatible event protocol, 3600s timeout. Reference the upstream Speaches docs.
7. **`docs/SELF_HOSTING.md` updated** with realtime requirements: backends MUST implement `WSS /v1/realtime` (or 503-gracefully if not provisioned). The Yambr corporate backend reference points at `~/openwhispr-server/`.
8. **No hardcoded API keys** confirmed by grep across renderer + main + preload — regression test added.

## Files likely to change

| File | Change |
|---|---|
| `scripts/generate-build-config.js` | Add `OPENWHISPR_REALTIME_WSS_URL` to DEFAULTS (derive from `OPENWHISPR_BACKEND_URL` if not set). Flip `OPENWHISPR_STREAMING_ENABLED` default false→true. |
| `src/config/defaults.ts` | Re-export `OPENWHISPR_REALTIME_WSS_URL` named, plus updated `STREAMING_ENABLED`. |
| `src/helpers/openaiRealtimeStreaming.js:54` | Read URL from import, not hardcoded literal. |
| `scripts/verify-feature-gating.js` | New scenario: `realtime-routing` — assert `api.openai.com/v1/realtime` is NOT in dist bundle when `OPENWHISPR_BACKEND_URL` is set. |
| `docs/BUILD_CONFIG.md` | Document `OPENWHISPR_REALTIME_WSS_URL` + flipped `OPENWHISPR_STREAMING` default. |
| `docs/BACKEND_SPEC.md` | New section: realtime WebSocket contract (mirror upstream Speaches docs). |
| `docs/SELF_HOSTING.md` | Update streaming-implementation requirements. |
| `.planning/PROJECT.md` | CFG-09 amendment: STREAMING default true (with backend); document the rationale. |
| `README.md` | Update "What's different" table to note that realtime now goes through corporate backend by default. |

## Risks

- **Backend Phase 4 not yet implemented** — when our Phase 5 ships, the corporate backend's `WSS /v1/realtime` may not exist yet. Mitigation: graceful degradation. If WSS connect fails, fall back to batch transcription with a console warning. Power users who haven't deployed backend Phase 4 set `OPENWHISPR_STREAMING=false` explicitly.
- **Speaches OpenAI-Realtime compat is "claimed", not byte-verified** — Speaches docs say they implement OpenAI Realtime. Reality may have edge cases. Phase 5 should include a smoke-test plan: connect to a test instance, verify partial+final transcripts arrive correctly. If issues, file them upstream at Speaches; do not fork the protocol.
- **Existing Deepgram/AssemblyAI users** — by deprecating the cloud-mode token-mint path for these two, we may surprise users who set `OPENWHISPR_BACKEND_URL` and expect Deepgram-via-OpenWhispr-Cloud to work. Mitigation: keep the token endpoint working server-side per WIRE-13/14 (backend serves it); just stop the client's UI from advertising "Cloud Deepgram" as a distinct option.

## Definition of Done

- [ ] All success criteria above verified
- [ ] verify-* gates green (no regression)
- [ ] Code review (REVIEW.md → REVIEW-FIX.md if any warnings)
- [ ] Smoke test: build with `OPENWHISPR_BACKEND_URL=https://api.staging.example.com`, connect to a real Speaches+LiteLLM instance, dictate into Notes, see partials appearing in real-time
- [ ] Smoke test: build with empty `OPENWHISPR_BACKEND_URL`, confirm `STREAMING_ENABLED` falls back gracefully
- [ ] PR created against `main`, CodeRabbit review passed
