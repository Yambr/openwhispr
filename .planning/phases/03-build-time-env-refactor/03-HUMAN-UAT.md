---
status: partial
phase: 03-build-time-env-refactor
source: [03-VERIFICATION.md]
started: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Default-build smoke walk
expected: Run `npm run pack` with all OPENWHISPR_* env vars unset, then exercise the 7 smoke-checklist flows (sign-in email, Google social, calendar OAuth, OpenAI transcription, Groq transcription, MCP UI, custom protocol) and observe expected URLs in the debug log. Each flow contacts the documented default URL; webRequest filter logged with https://api.openwhispr.com/* pattern; Info.plist registers openwhispr:// scheme.
result: [pending]

### 2. Custom-protocol Google Calendar smoke
expected: Build with `OPENWHISPR_OAUTH_PROTOCOL_SCHEME=examplecorp` and `OPENWHISPR_BACKEND_URL=https://api.example.com`, then attempt the Google Calendar 'Connect' flow. Calendar OAuth completes; deep-link returns to examplecorp:// scheme; user sees calendar events in the app.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
