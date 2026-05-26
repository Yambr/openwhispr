---
phase: 05
reviewed: 2026-05-09
reviewer: CodeRabbit AI (external)
depth: standard
files_reviewed: PR #8 diff
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 05: CodeRabbit External Review Findings

External AI code review on PR #8 after Phase 05 completion.

## CR-01 (Info / Minor) — `docs/SELF_HOSTING.md:29-31`

**Reconcile contradictory streaming-default statements**

Line 29 still states streaming is OFF by default (pre-Phase 05 framing). Line 31 says default is true after Phase 05. Adjacent lines contradict each other — operator confusion.

**Fix:** Keep one canonical statement reflecting post-Phase 05 default (`OPENWHISPR_STREAMING=true` by default, with B1 auto-disable when no realtime URL).

## CR-02 (Info / Minor) — `README.md:43-44`

**Same contradiction in README comparison table**

The "What's different from upstream" table has two adjacent rows: line 43 says "streaming removed by default; needs OPENWHISPR_STREAMING=true to enable", line 44 says "Phase 05 routes realtime by default through corp backend". Operators reading the table get conflicting advice.

**Fix:** Merge into a single row reflecting post-Phase 05 reality.

## CR-03 (Info / Minor — actual bug) — `scripts/generate-build-config.js:130-134`

**`deriveRealtimeWssUrl` produces broken URL when BACKEND_URL has fragment (`#hash`)**

`deriveRealtimeWssUrl` emits `${pathPrefix}/v1/realtime${u.search}${u.hash}`. Downstream, `openaiRealtimeStreaming.js:67` appends `?intent=transcription` (or `&intent=...` if `?` present).

If `OPENWHISPR_BACKEND_URL` carries a fragment like `https://api.example.com#bar`, the chain produces:
```
wss://api.example.com/v1/realtime#bar&intent=transcription
```

The fragment `#bar` swallows everything after it, so `intent=transcription` becomes part of the fragment — never reaches the server as a query parameter. WebSocket connect breaks silently or behaves wrong.

**Fix:** In `deriveRealtimeWssUrl`, drop `u.hash` entirely from the derived URL — fragments don't make sense for a WebSocket endpoint anyway. Forward only `u.search` (query string) which is legitimately useful for token-in-query gateways.

Marked Minor by CodeRabbit but is a real correctness bug — fix.

## Summary

| # | Severity | Type | Status |
|---|---|---|---|
| CR-01 | Minor | doc-contradiction | pending |
| CR-02 | Minor | doc-contradiction | pending |
| CR-03 | Minor | actual bug (URL fragment ordering) | pending |

All 3 in scope. CR-03 is a real bug despite Minor classification.
