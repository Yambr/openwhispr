---
task: C3 — Realtime meeting WebSocket resilience (keepalive + reconnect)
slug: 260610-muw-c3-realtime-meeting-ws-resilience-app-le
type: quick
mode: tdd
status: complete
reason_incomplete: >
  Tasks 1-3 (RED test, Part A keepalive, Part B reconnect) DONE and green.
  gsd-code-reviewer run on the diff (review_before_tag rule) found 1 CRITICAL
  (CR-01: disconnect() reset isDisconnecting before async close → reconnect guard
  inert) + warnings; all fixed (commits 2673ca1e / 0c481235 / ef810180) and
  locked with 2 new regression tests (20/20 green). Task 4 (live CDP acceptance
  gate — real meeting, forced socket death) was DELIBERATELY SKIPPED by owner
  decision (2026-06-10): release on review + units, no live run. Residual risk
  accepted by owner — the live-only items (CR-01 async ordering end-to-end,
  WR-03 token-per-stream) are documented in REVIEW.md and
  SERVER-REQUIREMENTS-meeting-protocol.md. Tagged v1.7.23.
files_modified:
  - src/helpers/openaiRealtimeStreaming.js
  - src/helpers/ipcHandlers.js
  - test/helpers/openaiRealtimeStreaming.test.js
acceptance_gate: live-cdp
acceptance_gate_status: PENDING
branch: quick/260610-muw-c3-realtime-ws-resilience
commits:
  - 3a48e3d3  test(quick-260610-muw): failing regression for realtime WS keepalive (C3)
  - bb6478a2  fix(quick-260610-muw): app-level keepalive in realtime client (C3 Part A)
  - 94b226dc  fix(quick-260610-muw): per-source auto-reconnect in meeting path (C3 Part B)
---

# C3 — Realtime meeting WebSocket resilience (keepalive + reconnect) Summary

App-level WebSocket keepalive (ws.ping() + "pong" watchdog) plus per-source
exponential-backoff auto-reconnect in the meeting OpenAI-Realtime path, so a
realtime socket death (1011 keepalive ping timeout) self-heals in <5s instead of
waiting 20-40 min for the meeting-detection poll. Owner-authorized upstream edit;
minimal/surgical/additive. Tasks 1-3 done and green; Task 4 (live CDP gate)
PENDING — it is the acceptance gate.

## What changed (file:line)

### src/helpers/openaiRealtimeStreaming.js (Part A — keepalive, additive)
- L11-15 — new constants KEEPALIVE_INTERVAL_MS=15000, MISSED_PONG_LIMIT=2 (C3 comment).
- Constructor — added this.keepaliveTimer=null; this.lastPongAt=0;.
- L44-75 — startKeepalive()/stopKeepalive(). Interval: ws missing/not OPEN -> return;
  no pong within KEEPALIVE_INTERVAL_MS*MISSED_PONG_LIMIT (30s) -> debug-log +
  terminate() (fallback close()); else guarded ws.ping().
- L145 — this.ws.on("pong", () => { this.lastPongAt = Date.now(); }).
- L202 — startKeepalive() in session.created preconfigured ready branch.
- L242 — startKeepalive() in session.updated ready branch.
- L168 — stopKeepalive() in the close handler.
- L424 — stopKeepalive() in cleanup().
No restructure of connect/disconnect/cleanup. PR-offerable upstream.

### src/helpers/ipcHandlers.js (Part B — reconnect, additive, meeting path only)
- L4055-4117 — C3 comment + MEETING_RECONNECT_DELAYS_MS=[0,1000,2000,4000,8000],
  cap 30000, per-source meetingReconnectAttempts/Timers, clearMeetingReconnectTimers(),
  scheduleMeetingReconnect(ctx) (re-mints just that source's token via
  fetchRealtimeToken(event, options), rebuilds + re-arms socket, resets backoff on
  success, retries on failure; does NOT wait for poll).
- L4119 — attachMeetingStreamingHandlers(streaming, win, source, reconnectContext)
  (optional 4th arg).
- L4240-4248 — streaming.onSessionEnd set for the meeting socket (previously NEVER
  set — the bug). Guards: isDisconnecting, this[ref] null, stale instance. onError
  left as-is.
- connectRealtimeStreaming — builds reconnectContext per source, clears bookkeeping
  before arming, passes context into attachMeetingStreamingHandlers.
- L4445 / resetMeetingStreamingState — clearMeetingReconnectTimers() on meeting end.
AssemblyAI (~6777), Deepgram (~7021), dictation (~5128) untouched. Debug logs only.

### test/helpers/openaiRealtimeStreaming.test.js (RED -> GREEN)
New describe "openaiRealtimeStreaming — keepalive (C3 260610-muw)" reusing the
require.cache ws-injection pattern with an event-driven FakeWebSocket (stores
.on() handlers, emit(), records ping/terminate/close). Tests: ping on interval;
missed-pong terminate; unexpected close fires onSessionEnd (contract lock); pong
within window keeps alive.

## Test results

### Task 1 — RED proof (UNMODIFIED production code)
  x Test 1 (ping): expected 0 to be >= 1
  x Test 2 (pong watchdog): expected 0 to be >= 1
  v Test 3 (reconnect hook): unexpected close fires onSessionEnd
  x pong keeps alive: expected 0 to be >= 1
  Tests  3 failed | 15 passed (18)
Test 1+2 fail because no app-level keepalive exists — proves root-cause bug.
Test 3 passes (existing close handler fires onSessionEnd) — contract lock.

### Task 2 — GREEN (after Part A)
  v test/helpers/openaiRealtimeStreaming.test.js (18 tests)
  Tests  18 passed (18)

### Task 3 — full helpers suite + load check (after Part B)
  Test Files  15 passed (15)
       Tests  137 passed (137)
  $ node -e "require('./src/helpers/ipcHandlers.js'); console.log('ipcHandlers loads')"
  ipcHandlers loads

### Final full relevant suite (helpers + meeting realtime store + sanity)
  Test Files  16 passed (16)
       Tests  140 passed (140)

## Deviations from Plan
None. Tasks 1-3 executed exactly as written. No REFACTOR commit needed (Part A
was already minimal). No deviation rules triggered; no auth gates; no
architectural changes.

## Diff summary
  src/helpers/openaiRealtimeStreaming.js | +~45 / -0  (constants, 2 methods, 6 wired calls)
  src/helpers/ipcHandlers.js             | +96 / -2   (reconnect machinery, meeting path only)
  test/helpers/openaiRealtimeStreaming.test.js | + new keepalive describe block

## Task 4 — Live CDP acceptance gate: PENDING (the acceptance gate)
Green unit tests are necessary but NOT sufficient. Must be proven on the real app:
1. Corporate (PROVIDER_LOCKDOWN) build, OPENWHISPR_LOG_LEVEL=debug, --remote-debugging-port=9223.
2. Start a real meeting (both mic+system sockets open); confirm session created/configured
   for both + recurring keepalive ping in MAIN-process realtime debug lines (renderer CDP
   cannot see outbound WS frames; memory: cleanup_routing_live_closed).
3. Force a socket death; measure close -> "Meeting realtime reconnect" + "session configured" gap.
4. PASS: reconnect <5s (not minutes), driven by onSessionEnd/backoff NOT poll (:02/:32);
   no 1011 staying dead for minutes; sent:true resumes for BOTH mic+system; backoff resets
   on each success over >1h / several deaths.
5. Capture close->reconnect->resumed debug excerpt into this dir; resume with "approved" + gap.

## Self-Check: PASSED
- Files exist: openaiRealtimeStreaming.js, ipcHandlers.js, openaiRealtimeStreaming.test.js — all FOUND.
- Commits exist: 3a48e3d3, bb6478a2, 94b226dc — all FOUND.
