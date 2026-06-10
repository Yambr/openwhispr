# SERVER-REQUIREMENTS — Meeting/Протокол PLAN №1 (C1, C4)

Findings from triage of the meeting/протокол code plan (2026-06-10). C2 and C3
are client-side (C3 fixed on branch `quick/260610-muw-c3-realtime-ws-resilience`).
C1 and C4 are **server-side** — filed here per the server-repo boundary rule
(never patch the client to bridge a server gap). Both accepted by the server
peer (`bopty19m`) on 2026-06-10 with code-cited verdicts.

---

## C1 — `POST /api/reason` 30s undici headersTimeout → 500 (HIGH)

**Severity:** HIGH (every long-transcript протокол generation 500s)

**Evidence:** All 500s on `POST /api/reason` fail at ~30485ms with
`UND_ERR_HEADERS_TIMEOUT` (undici `client-h1.js:749`). The reasoning model
(qwen36) generates the протокол from a long transcript in >30s before the first
token; non-streaming `chatCompletions()` waits for the full JSON → undici's
default 30s `headersTimeout` fires → 500.

**Server peer verdict (code-cited):**
- `/api/reason` uses non-streaming `chatCompletions()` (`reason.ts:158`) — waits
  for the complete JSON response.
- undici `headersTimeout` default = 30_000ms (`config.ts:195`).
- `reason.ts:158` passes no per-call override → always the 30s default.
- `enable_thinking:false` is applied ONLY for cleanup-shape
  (`QWEN_THINKING_OFF_EXTRAS`); reasoning-shape intentionally keeps thinking ON
  → the timeout hits the reason path specifically.

**Correction to original plan:** the plan said "Env-ручки таймаута нет" — this is
**stale**. An operator knob already exists (added in R32):
`LITELLM_HEADERS_TIMEOUT_MS` + `LITELLM_BODY_TIMEOUT_MS` (`config.ts:376-380`).

**⚡ Immediate operator workaround (no release):**
Set `LITELLM_HEADERS_TIMEOUT_MS=120000` in the server env. Should clear the 500s
on long transcripts right now.

**Proper fix (owned by server peer, TDD):** stream the reason path
(`stream:true` — headers arrive with the first token, `headersTimeout` never
fires; best option) OR at minimum raise the default `headersTimeout` for the
reason route.

**Acceptance:** transcript >20K chars → протокол without `Internal server error`,
3+ times consecutively.

**Status:** ACCEPTED by server peer, in progress.

---

## C4 — Realtime transcript only after disconnect (`segments:0` mid-session)

**Severity:** MEDIUM (degraded live UX; partial transcript loss on tail/short
sessions)

**Symptom:** Some realtime sessions show `segments:0 / textLength:0` for the
active session; text arrives only on `disconnect()` via the client's
"commit timeout, using accumulated text" path (close 1005/1011).

**Server peer verdict (code-cited): SERVER-side, and possibly ALREADY FIXED.**
- Our realtime is NOT a transparent passthrough — it's a frame-aware relay
  (Design B reverse-proxy, no ephemeral token).
- The preconfigured cloud client intentionally never sends `session.update`
  (client `openaiRealtimeStreaming.js:135` — would strip language/noise-reduction)
  → nobody configures the session from the client.
- Fix R31 DEFECT 6 (commit `0f49fbe2`, 2026-05-22): the relay itself injects
  `session.update` on upstream open (`realtime.ts:428-436`) BEFORE any buffered
  audio. The injected frame (`realtime-frame-translate.ts:266-294`) contains
  `turn_detection: { type: "server_vad", ... }` + `transcription: { model, language? }`.
- `transcription.delta` / `.completed` from upstream pass through to the client
  unbuffered (`realtime.ts:443-468`). The server does NOT accumulate text or
  commit-on-timeout.
- A code comment (`realtime-frame-translate.ts:245-250`) describes THIS EXACT
  symptom: unconfigured session → transcribes nothing → `segments:0, textLength:0,
  commit timeout`. That is the bug DEFECT 6 closed → present in every release
  since v0.9.0 / v1.0.3; prod is v1.2.x so it should be deployed.

**Client-side observations (this triage, logs 2026-06-09, client v1.7.22):**
- `session created` logged 17×, `session updated`/`configured` logged **0×** —
  the client handles both (`openaiRealtimeStreaming.js` case:192 + case:237) but
  never logged receiving `session.updated`. → upstream/relay is NOT delivering
  `session.updated` back down to the client.
- `turn completed` logged 744× (~762 transcript events total) — transcript MOSTLY
  flowed. So `segments:0` is NOT whole-session; it reproduces on specific
  disconnects (short/tail sessions, or sessions right after a C3 reconnect gap
  that only survive long enough to hit commit-timeout). C3 reconnect fix likely
  removes much of this tail.

**Open question (server peer to resolve in server realtime logs of a bad session):**
1. Does our `session.update` actually go out on upstream open?
2. Does Speaches (litellm-mode upstream) return `session.updated`?
3. Does the relay forward `session.updated` DOWN to the client? (client logs 0 →
   suspect not forwarded, or not produced.)
4. If Speaches does not honor `server_vad` auto-commit → relay must do
   manual-commit-by-VAD, OR switch backend. Either way **server-side**.

**Facts needed from operator (Nick):** server version; `REALTIME_BACKEND`
(default `direct` = OpenAI GA upstream; if Speaches then `litellm`). Client logs
strongly suggest `litellm`/Speaches (token "litellm" present, client realtime
URL empty so runtime-derived corp host). Server realtime logs of one bad session.

**Status:** ACCEPTED by server peer as server/Speaches-side. NOT a client upstream
edit. Awaiting operator facts + server-log analysis.

---

## C3 reconnect token-per-stream assumption (WR-03 — server contract dependency)

The C3 client reconnect (branch `quick/260610-muw-c3-realtime-ws-resilience`)
re-mints a SINGLE-stream token on per-source reconnect
(`ipcHandlers.js` `refetchSecret: () => fetchRealtimeToken(event, options)` with
no `{streams}`), even when the original meeting opened 2 streams (mic+system) and
when reconnecting the `system` source specifically.

**Under PROVIDER_LOCKDOWN (the corporate path that ships): benign.** The realtime
credential IS the user's Better Auth session bearer — identical for both streams,
stream-index-agnostic (the server validates the bearer, strips the Authorization
header, substitutes `LITELLM_MASTER_KEY` upstream). So a single-stream re-mint on
system reconnect produces the same valid bearer. No server change required for the
corp build.

**Server contract requirement (only if the 2-stream ephemeral OpenAI/BYOK path is
ever used for meetings):** the two per-stream realtime tokens MUST be
interchangeable / stream-index-agnostic, OR the client reconnect must thread the
stream index. Today the corp build never hits this (BYOK realtime tokens are not
minted under lockdown). Filed so the assumption is explicit if BYOK realtime
meetings are ever enabled server-side.

## Client-side companions (for cross-reference)

- **C2** — `missing_start` mic-segment suppression. Client-side. Symptom confirmed
  in logs (`missing_start` while ~20MB audio sent) but root cause not yet
  localized (why `startedAtMs` is empty / whether the segment is actually lost
  downstream). NOT YET FIXED — needs further client-side trace before touching
  upstream `meetingEchoLeakDetector.js`. Per owner rule: no proof of the root
  cause yet → do not edit.
- **C3** — keepalive + reconnect. Client-side, FIXED (branch
  `quick/260610-muw-c3-realtime-ws-resilience`, units green, live CDP gate
  pending). Closing the 20-40 min reconnect gaps likely also reduces the C4
  tail-loss symptom.
