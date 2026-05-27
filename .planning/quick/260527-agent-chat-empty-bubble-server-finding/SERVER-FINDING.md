# SERVER-FINDING — `/api/agent/stream` returns `upstream_error` with no content

**Repo:** `openwhispr-server` (READ-ONLY from this repo — finding only,
no edits)
**Severity:** HIGH — agent chat is fully broken in production for the
reporting user (every assistant reply renders as an empty bubble).
**Detected:** 2026-05-27, live CDP drive against packed v1.7.13 against
production `https://openwhispr.yambr.com`.

---

## Symptom (client side)

When the user sends a message in the Agent Chat overlay
(`?agent=true` window), an empty assistant bubble appears immediately
and never fills. No error banner, no toast, no console log, no
exception. The conversation is effectively dead.

## Live evidence (CDP capture)

Drove the packed app at `/Applications/OpenWhispr.app` with
`--remote-debugging-port=9223`, attached to the agent renderer's
`window.electronAPI.onAgentStreamChunk` / `onAgentStreamError` /
`onAgentStreamEnd` listeners, then submitted a message.

Sequence of IPC events the renderer received:

```json
[
  {
    "type": "done",
    "finishReason": "upstream_error",
    "usage": { "promptTokens": 0, "completionTokens": 0 }
  }
]
```

…followed by `cloud-agent-stream-end`. Zero `content`, zero
`tool_call`, zero `cloud-agent-stream-error`.

The renderer's `streamFromIPC` (`src/services/ReasoningService.ts:644`,
upstream-authored by Gabriel Stein in commit `4a1d3e2c`) ignores
`type: "done"` finish reasons — it just exits the loop. The wrapping
`processTextStreamingCloud` also yields nothing for `done` other than
`{type:"done", finishReason:"stop"}`, and `useChatStreaming` writes
nothing into the assistant message because no `content` chunk ever
arrived. Result: empty bubble.

## Server-side responsibility

`/api/agent/stream` returned **HTTP 200** with a single NDJSON line:

```
{"type":"done","finishReason":"upstream_error","usage":{"promptTokens":0,"completionTokens":0}}
```

This is wrong on multiple axes:

1. **`upstream_error` is a failure mode, not a finish reason.** When
   the upstream LLM provider (OpenAI / Groq / Anthropic) returns an
   error, the server has three correct response shapes — *any* of
   which the upstream client already handles — and it picked a
   fourth, broken one:
   - **(a) HTTP 4xx/5xx with JSON body** — `ipcHandlers.js:5785-5797`
     converts `response.status === 503` → `code: "SERVER_ERROR"` and
     `errorData.error` → user-visible toast.
   - **(b) NDJSON `{type:"error", error:"<message>"}` chunk before
     `done`** — `streamFromIPC` would throw via the `__error` queue
     path (`ReasoningService.ts:707`).
   - **(c) NDJSON `{type:"content", text:"<error message>"}` chunk** —
     would at least render the failure as the assistant's reply.
   - **(d) ❌ What the server did: emit a `done` chunk with
     `finishReason: "upstream_error"` and zero tokens.** No error
     surface, no fallback, no diagnostics.

2. **No error metadata.** The `done` chunk doesn't include the
   upstream error code, message, or even which provider failed.
   The client has nothing to log or display.

3. **The client is fully upstream-authored here.** Per
   `[client_immutable]`, we won't patch the renderer or the IPC
   handler to swallow this. The wire contract is what `streamFromIPC`
   was designed for, and the server is violating it.

## Suggested resolution (for the server team)

Pick **one** of (a) / (b) / (c) above and use it consistently. Prefer
**(b)** because:

- It keeps the streaming connection structure intact.
- `streamFromIPC` already routes `__error` events through `throw`,
  which triggers the `catch` block in `useChatStreaming.ts:273-285`
  that writes a localized error message into the assistant bubble.
- It lets the server surface upstream rate-limit / billing /
  content-policy errors with actionable text.

Concrete contract:

```
HTTP 200
content-type: application/x-ndjson

{"type":"error","error":"OpenAI returned 429: rate limit exceeded","code":"upstream_rate_limit","provider":"openai"}\n
```

…and **no** subsequent `done` chunk. The stream ends after the error.

If the upstream error is recoverable on the server side (retry, fall
back to another provider), the server should not surface it as `done`
either — it should retry transparently and only emit `done` once a real
completion has streamed.

## What this finding does **NOT** authorize

- ❌ Editing `src/services/ReasoningService.ts` (upstream-authored).
- ❌ Editing `src/helpers/ipcHandlers.js` cloud-agent-stream handler
  (upstream-authored, commit `72b7ed39` by Gabriel Stein).
- ❌ Editing `src/components/chat/useChatStreaming.ts` (upstream-
  authored).
- ❌ Adding a "fallback" branch on the client that converts
  `finishReason: "upstream_error"` into a user-visible toast — that
  bridges a server gap from the client, which `[upstream_parity]`
  explicitly forbids. Server team fixes it server-side.

## What this finding **does** authorize on the client

Nothing. This is a server defect. Closing it out requires:

1. Server team accepts this finding.
2. Server team picks contract shape (b) and ships it.
3. Live CDP re-test against the new server response confirms the
   error path now lights up in the renderer (assistant bubble shows
   the upstream error message, no silent empty bubble).

## How to reproduce on the dev box

```bash
# 1. Open OpenWhispr (any v1.7.x packed build) with CDP enabled
pkill -f "OpenWhispr.app/Contents/MacOS/OpenWhispr"
open -a /Applications/OpenWhispr.app --args --remote-debugging-port=9223

# 2. Sign in to https://openwhispr.yambr.com via the panel.
# 3. Open Agent overlay (default hotkey or via tray menu).
# 4. List CDP targets, find the `?agent=true` one.
curl -s http://localhost:9223/json

# 5. Send a message via CDP and watch the IPC events
node scripts/cdp-ipc-listen.mjs "<ws-url-of-agent-target>"
```

The capture script (`scripts/cdp-ipc-listen.mjs`) lives in this repo
and prints every `onAgentStreamChunk` / `onAgentStreamError` /
`onAgentStreamEnd` event for 12 seconds after submitting a probe
message.

Expected output today (with the bug): one `done` chunk with
`finishReason: "upstream_error"`, then `end`.

Expected output after server fix: an `error` chunk with a human-
readable description, no `done`, then `end` (which `streamFromIPC`
absorbs into `__end` after the error throw has already cleaned up).
