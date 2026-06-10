---
phase: quick-260610-muw-c3-realtime-ws-resilience
reviewed: 2026-06-10T00:00:00Z
depth: deep
files_reviewed: 3
files_reviewed_list:
  - src/helpers/openaiRealtimeStreaming.js
  - src/helpers/ipcHandlers.js
  - test/helpers/openaiRealtimeStreaming.test.js
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Quick 260610-muw: C3 Realtime WS Resilience — Code Review Report

**Reviewed:** 2026-06-10
**Depth:** deep (cross-file: reconnect lifecycle traced across openaiRealtimeStreaming.js ↔ ipcHandlers.js)
**Files Reviewed:** 3 (excluding `.planning/` docs as instructed)
**Status:** issues_found

## Summary

The change adds (A) an app-level keepalive ping/pong watchdog to `OpenAIRealtimeStreaming` and (B) a per-source exponential-backoff auto-reconnect in the meeting path of `ipcHandlers.js`, driven by `streaming.onSessionEnd`. The timer-leak hygiene is largely good: `stopKeepalive()` is wired into both `close` and `cleanup()`, and `clearMeetingReconnectTimers()` is wired into `connectRealtimeStreaming` (pre-arm) and `resetMeetingStreamingState` (teardown).

However, there is **one CRITICAL correctness defect**: the reconnect's "explicit disconnect" guard does not actually fire on a clean `disconnect()`, because by the time the deferred `close` event runs, `disconnect()` has already reset `isDisconnecting = false`. Reconnect is currently suppressed only by the *secondary* `this[ref] === null` / instance-swap guards, which hold in the common teardown paths but **break for `connectRealtimeStreaming`'s in-place restart** and for any disconnect that is not immediately followed by a state reset — producing a spurious reconnect that races a fresh socket and can yield a double socket / zombie reconnect loop for one source. Because this ships **without live verification**, this is the highest-residual-risk item and is exactly the class of bug a fake-timer unit test will not catch (it depends on real `ws` async close-event ordering).

Secondary concerns: unbounded forever-retry reconnect on a permanently-dead backend (no max-attempts), an inaccurate scope comment (reconnect actually applies to AssemblyAI/Deepgram meeting providers too, not "OpenAI-only"), and a token-refetch-on-reconnect that re-runs the full `fetchRealtimeToken` (2-stream mint) for a single-source reconnect.

There is **no live test** behind any of this. I have explicitly tagged each finding below with whether it is unit-coverable or **live-only residual risk**.

## Critical Issues

### CR-01: `disconnect()` resets `isDisconnecting=false` before the async `close` event runs → reconnect's primary guard is dead; spurious reconnect on intentional teardown

**File:** `src/helpers/openaiRealtimeStreaming.js:363-420` + `src/helpers/ipcHandlers.js:4243, 4093`

**Issue:**
The reconnect contract's first-line guard is `if (streaming.isDisconnecting) return;` (ipcHandlers.js:4243) and the close handler's own guard is `if (wasActive && !this.isDisconnecting)` (openaiRealtimeStreaming.js:180). Trace the OPEN-path `disconnect()`:

```
363  this.isDisconnecting = true;
...
414  this.ws.close();      // schedules an ASYNC 'close' event (next tick / after frame)
418  this.cleanup();       // sets this.isConnected = false, this.ws = null
419  this.isDisconnecting = false;   // <-- runs synchronously, BEFORE the async close fires
420  return result;
```

When the `ws` library later emits the `close` event, the handler reads `this.isDisconnecting` — which is already `false`. So the close handler's `!this.isDisconnecting` guard, AND the reconnect's `if (streaming.isDisconnecting) return`, are **both ineffective for an intentional disconnect**.

Today this is masked because `cleanup()` (line 418) sets `this.isConnected = false` *before* the async close fires, so `wasActive = this.isConnected` is captured as `false` at handler entry → `onSessionEnd` is skipped. So the *only* thing preventing a spurious reconnect on a clean disconnect is the `wasActive` race, not the `isDisconnecting` guard the author believes is doing the work.

That `wasActive` cover is **not sufficient** for the most important teardown path — `connectRealtimeStreaming` (ipcHandlers.js:4405-4413):

```
4406  if (this._meetingMicStreaming?.isConnected) {
4407    await this._meetingMicStreaming.disconnect();   // old instance
4408  }
...
4412  this._meetingMicStreaming = null;
4413  this._meetingSystemStreaming = null;
...
4445  clearMeetingReconnectTimers();
4447  this[ref] = new StreamingClass();                 // NEW instance for same ref
```

`disconnect()` is `await`ed, so it completes (including its synchronous `cleanup()` → `wasActive=false`) before the new instance is assigned. In the normal case the old socket's close fires with `wasActive=false` and nothing happens. **But** if the old socket's `close` event is delayed past the point where `clearMeetingReconnectTimers()` runs and a *new* instance is assigned to `this[ref]`, the old `onSessionEnd` closure (which captured the OLD `streaming`) evaluates `this[ref] !== streaming` → true → returns. So instance-swap guard saves the restart case.

The genuinely unguarded window is: **a `disconnect()` that is NOT followed by nulling `this[ref]` and is NOT followed by a new-instance assignment.** Audit the close handler ordering again: `wasActive` is the real guard, and it works *only because* `cleanup()` runs synchronously inside `disconnect()` before returning. This is extremely fragile — any future refactor that moves `cleanup()` after the `await`, or any disconnect path that closes the socket without an immediate synchronous `cleanup()` (e.g. the CONNECTING path at lines 365-370 returns WITHOUT calling cleanup, leaving `isConnected` untouched and `isDisconnecting` reset to false), reopens a spurious-reconnect hole.

**Why it matters:** A spurious reconnect schedules a `setTimeout` that builds a *new* socket for a source the meeting layer believes is gone, re-mints a token, and (because `this[ref]` may have been repopulated by a concurrent `connectRealtimeStreaming`) can create a **second live socket for one source** or restart a reconnect loop after teardown. With no live verification, a half-dead-then-disconnected socket in production is the realistic trigger.

**Fix:** Make `isDisconnecting` survive the async close, OR gate the reconnect on a positive liveness flag rather than the racy negative. Concretely, do not reset `isDisconnecting` in `disconnect()` until the close handler has actually run, e.g.:

```js
// disconnect() — do NOT flip isDisconnecting back to false synchronously.
// Let cleanup() / a one-shot close listener clear it after the close fires,
// or simply leave it true for the lifetime of this (now-dead) instance —
// the instance is discarded after disconnect() anyway.
async disconnect() {
  ...
  if (this.ws.readyState === WebSocket.OPEN) { ...; this.ws.close(); }
  const result = { text: this.getFullTranscript() };
  this.cleanup();
  // REMOVE: this.isDisconnecting = false;   // keep it true so the deferred
  //         close handler and onSessionEnd both see the explicit-teardown intent.
  return result;
}
```

Also set `this.isDisconnecting = true` in the CONNECTING branch path BEFORE returning and do not reset it (lines 365-370). And in `cleanup()`, set `this.isConnected = false` is already present — keep it, but the reconnect should not lean on it.

**Residual risk if shipped as-is (no live test):** HIGH. This is a **live-only** defect class. The unit test (`Test 3`) drives `close` synchronously via `ws.emit("close", ...)` with `isDisconnecting` never set, so it exercises only the *unexpected*-close branch and can never reproduce the disconnect→async-close ordering. Recommend either the fix above or an explicit live run (start meeting, force a disconnect, confirm no reconnect log fires) before tagging.

## Warnings

### WR-01: Reconnect retries forever with no max-attempts cap — permanently-dead backend spins a 30s loop indefinitely

**File:** `src/helpers/ipcHandlers.js:4070-4099`

**Issue:** `scheduleMeetingReconnect` calls itself recursively in its `catch` (line 4096) with no attempt ceiling. `meetingReconnectAttempts[source]` only caps the *delay* at `MEETING_RECONNECT_MAX_DELAY_MS` (30s); it never stops. If the backend is down (auth permanently expired, corp gateway 503, network partition), this retries every 30s for the entire meeting duration — and only stops when `resetMeetingStreamingState()` / `clearMeetingReconnectTimers()` runs at meeting end. For a multi-hour meeting on a dead backend that is an unbounded reconnect loop (each iteration re-mints a token via `fetchRealtimeToken`, hitting the server).

**Why it matters:** Token-mint storm against the corp backend + log spam + battery. Not a crash, but a resource leak in the "permanently dead" case the feature is explicitly meant to survive. The PLAN claims "<5s self-heal"; it does not claim "give up after N", so this may be intentional — but it should be a conscious decision, not silent.

**Fix:** Add a max-attempts ceiling (e.g. 10–15), after which it logs and stops, leaving the meeting-detection poll as the slow-path recovery (the same 20–40 min fallback the feature was layered on top of):

```js
const MEETING_RECONNECT_MAX_ATTEMPTS = 12;
...
if ((meetingReconnectAttempts[source] || 0) >= MEETING_RECONNECT_MAX_ATTEMPTS) {
  debugLogger.error("Meeting realtime reconnect gave up", { source });
  meetingReconnectTimers[source] = null;
  return;
}
```

**Residual risk:** MEDIUM, live-only to observe in practice (requires a sustained-dead backend mid-meeting).

### WR-02: Scope comment is inaccurate — reconnect (Part B) DOES apply to AssemblyAI/Deepgram meeting providers, not "OpenAI-only"

**File:** `src/helpers/ipcHandlers.js:4057-4061` (comment) vs `4441-4459` (actual wiring)

**Issue:** The header comment asserts the reconnect is "Scoped to the meeting OpenAI-Realtime path ONLY — AssemblyAI (~6777), Deepgram (~7021) and dictation (~5128) are untouched." But `connectRealtimeStreaming` selects `StreamingClass = STREAMING_CLIENT_BY_PROVIDER[options.provider] ?? OpenAIRealtimeStreaming` (line 4441-4442), and the reconnect context carries that `StreamingClass` (line 4454). `attachMeetingStreamingHandlers` then sets `onSessionEnd` on whatever provider class is in use — including `AssemblyAiStreaming` and `DeepgramStreaming` when the meeting provider is AssemblyAI/Deepgram. So Part B's reconnect is wired for ALL meeting realtime providers, not OpenAI alone.

This is actually **contract-safe** (verified: `assemblyAiStreaming.js` and `deepgramStreaming.js` both implement `onSessionEnd`, `isDisconnecting`, `isConnected`, and fire `onSessionEnd` on unexpected close — assemblyAiStreaming.js:262/453, deepgramStreaming.js:451). And `reconnectContext.refetchSecret` correctly re-runs `fetchRealtimeToken` which branches per provider. So behavior is fine — but the comment is wrong and will mislead the next maintainer about blast radius. Only Part A (keepalive, in openaiRealtimeStreaming.js) is genuinely OpenAI-only.

**Fix:** Correct the comment to: "Scoped to the meeting realtime path (any provider in `STREAMING_CLIENT_BY_PROVIDER`); the keepalive watchdog in openaiRealtimeStreaming.js is OpenAI-Realtime-only. Dictation and one-shot streaming are untouched."

**Residual risk:** LOW (documentation accuracy; no runtime defect). Worth fixing because it directly contradicts the scope-discipline claim the review was asked to confirm.

### WR-03: Single-source reconnect re-mints BOTH streams' tokens via `fetchRealtimeToken(event, options)` (no `{streams}`), wasting a mint and possibly desyncing token-per-stream

**File:** `src/helpers/ipcHandlers.js:4457` and `4082`

**Issue:** `refetchSecret: () => fetchRealtimeToken(event, options)` is called with no `{ streams }` option, so it mints a **single** token (the `else` single-stream branch). When the original meeting used the 2-stream path (`fetchRealtimeToken(event, options, { streams: 2 })` at line 4426), each socket got a *distinct* per-stream token. On reconnect of one source, the single-stream mint may produce a token semantically intended as "mic stream 0" even when reconnecting `system`. For the PROVIDER_LOCKDOWN path (bearer == Better Auth session token, identical for both streams) this is harmless. But for the BYOK / ephemeral-2-stream OpenAI path, reconnecting `system` with a stream-0-shaped token is at best wasteful and at worst rejected by a server that pins token→stream-index.

**Why it matters:** Depends entirely on server token semantics (documented as a SERVER-REQUIREMENT in the same task dir). If the server treats the two stream tokens as interchangeable, this is benign; if not, the reconnect mints the wrong-flavored token and the reconnect attempt fails, falling into the WR-01 retry loop. **This is exactly the kind of contract assumption that only live verification against the real corp server confirms.**

**Fix:** Either (a) document that single-stream re-mint is intentional and server-side tokens are stream-agnostic (the SERVER-REQUIREMENTS file should state this explicitly), or (b) thread the stream index through `refetchSecret` so the correct per-stream token is minted on reconnect.

**Residual risk:** MEDIUM–HIGH, **live-only**. No unit test can validate server token-per-stream semantics.

### WR-04: Watchdog `terminate()` correctly fires `close` → `onSessionEnd`, but the keepalive interval keeps running for one extra tick after terminate

**File:** `src/helpers/openaiRealtimeStreaming.js:42-65`

**Issue:** When the watchdog detects a missed pong it calls `this.ws.terminate()` (or `close()`) and `return`s, but does **not** call `stopKeepalive()` inline. It relies on the `close` event handler (line 168) to call `stopKeepalive()`. For `terminate()` the `ws` library does emit a `close` event (with code 1006), so this works — `stopKeepalive` runs, then `onSessionEnd` fires the reconnect. Good. The concern: between the `terminate()` call and the async `close` event, the interval can fire once more; at that point `this.ws.readyState` is `CLOSING`/`CLOSED` so the `readyState !== OPEN` guard (line 47) returns early — safe. So this is robust, but only because of the readyState guard, and the reconnect-on-terminate path is **not unit-tested end-to-end** (Test 2 asserts `terminate` is called but does NOT assert the close handler then fires `onSessionEnd`).

**Why it matters:** The whole feature hinges on terminate → close → onSessionEnd → reconnect. The unit tests verify the two ends (terminate is called; close fires onSessionEnd) but never the *chain* through a real terminate. If a future `ws` version or a custom transport does NOT emit `close` after `terminate()`, the socket dies silently with no reconnect — and no test catches it.

**Fix:** Defensively call `this.stopKeepalive()` immediately after terminate/close in the watchdog (idempotent; `close` handler also calls it), and add a unit test that, after the watchdog terminates, emits the synthetic `close` and asserts `onSessionEnd` fired — locking the full chain.

**Residual risk:** MEDIUM. The `ws` lib does emit close on terminate (current behavior), so live risk is low, but the chain is untested.

### WR-05: `disconnect()` CONNECTING branch leaves `isDisconnecting=false` and never calls `cleanup()` — keepalive timer can't leak here (not yet started) but the socket-close path is inconsistent

**File:** `src/helpers/openaiRealtimeStreaming.js:365-370`

**Issue:** In the CONNECTING branch, `disconnect()` registers `once("open", () => this.ws?.close())`, then sets `isDisconnecting = false` (line 368) and returns WITHOUT calling `cleanup()`. The deferred open→close then fires the `close` handler with `isDisconnecting === false`. Keepalive hasn't started yet (only starts on session.created), so no timer leak. And `wasActive = this.isConnected` is false (never connected), so `onSessionEnd` is skipped. So no reconnect mis-fire here today — but the path leaves `this.ws` non-null and uncleaned after `disconnect()` returns, inconsistent with the OPEN path. Combined with CR-01, this is the second instance of `isDisconnecting` being unreliable as a guard.

**Fix:** Set `this.isDisconnecting = true` and leave it true (per CR-01 fix); rely on `wasActive` plus the meeting-layer instance-swap guard, and add a `cleanup()` (or at least null `this.ws`) so the instance is left in a consistent dead state.

**Residual risk:** LOW today; couples with CR-01.

## Info

### IN-01: `clearMeetingReconnectTimers()` reassigns `meetingReconnectAttempts` to a fresh object instead of mutating — fine, but the two bookkeeping objects are closure-scoped per `setupIPC` call (no cross-source contamination)

**File:** `src/helpers/ipcHandlers.js:4063-4076`

**Issue/note:** Per focus-area #7 (two-socket parity): `meetingReconnectAttempts` and `meetingReconnectTimers` are objects keyed `{mic, system}` and are closure-local to the IPC setup scope. Mic and system index by distinct keys throughout — no shared mutable slot is read/written for both. Confirmed **no cross-contamination** between mic and system reconnect bookkeeping. This is a clean design. No fix needed; noting for the record since it was a focus area.

### IN-02: Warm-connection reuse re-attaches handlers WITHOUT reconnectContext — relies on the prior arming to have set onSessionEnd

**File:** `src/helpers/ipcHandlers.js:5376-5378`

**Issue:** The warm-start-reuse path calls `attachMeetingStreamingHandlers(this._meetingMicStreaming, win, "mic")` with no 4th arg, so the `if (reconnectContext)` block is skipped and `onSessionEnd` is left as whatever the earlier `connectRealtimeStreaming` arming set it to. Since `connectRealtimeStreaming` always passes a reconnectContext (line 4459), the warm connection already has `onSessionEnd` armed and it is preserved. So reconnect still works after warm reuse. **However**, the reconnectContext captured at prepare-time holds a `win` from the prepare event; the reuse path computes a *fresh* `win` (line 5375) for the data-send handlers but the reconnect will rebuild with the *stale* prepare-time `win`. If the BrowserWindow changed between prepare and start, a reconnect would send to the old window. Edge case; likely fine in practice (same window), but worth a note.

**Fix (optional):** If warm reuse should refresh the reconnect target window, re-arm with a fresh reconnectContext in the reuse path.

### IN-03: i18n confirmed clean — no new user-facing strings

**File:** all 3 files

**Issue/note:** Per focus-area #9: all new strings are `debugLogger.debug/.error` calls (developer logs), not `t(...)` UI text. No translation keys required. Confirmed compliant with the i18n mandate.

### IN-04: Test `FakeWebSocket` overwrites a single shared `handlers` Map for `.on` and `.once` — a `.once("open")` from disconnect() would clobber the persistent `.on("open")` handler

**File:** `test/helpers/openaiRealtimeStreaming.test.js:412-419`

**Issue:** The fake's `on` and `once` both do `handlers.set(event, cb)` into one Map, so registering a second handler for the same event silently replaces the first, and `once` never auto-removes. This is fine for the current tests (they don't exercise `disconnect()`'s `once("open")` against a live `on("open")`), but it means the harness cannot model the real ws multi-listener semantics — so it structurally **cannot** reproduce CR-01's disconnect→close ordering even if a test were added. Noting so the next test author knows the harness needs an array-of-handlers upgrade (or real fake-timer + real event emitter) to cover the disconnect path.

**Fix:** Use an array per event and have `emit` call all of them; have `once` self-remove. Required prerequisite for any test that would catch CR-01.

---

## Residual-Risk Summary (tagging WITHOUT live verification)

| Finding | Severity | Unit-coverable? | Residual risk if tagged as-is |
|---|---|---|---|
| CR-01 (isDisconnecting reset before async close) | CRITICAL | No (harness can't model async ws close ordering) | **HIGH** — spurious reconnect / double socket on real teardown |
| WR-01 (no max-attempts) | WARNING | Partially | MEDIUM — token-mint storm on dead backend |
| WR-03 (single-stream token re-mint) | WARNING | No (server contract) | MEDIUM–HIGH — depends on server token-per-stream semantics |
| WR-04 (terminate→close→onSessionEnd chain) | WARNING | Yes (not currently tested) | MEDIUM — silent dead socket if ws stops emitting close |
| WR-02 / WR-05 / IN-* | WARNING/INFO | Mixed | LOW |

**Recommendation:** CR-01 should be fixed before tagging — it is a correctness defect in the exact lifecycle the task exists to harden, and it is structurally invisible to the unit suite. WR-01 and WR-03 should be a conscious go/no-go decision (both have real production failure modes the green tests will not surface).

---

_Reviewed: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
