---
phase: 03-build-time-env-refactor
plan: 4
type: execute
wave: 2
depends_on: [1]
files_modified:
  - src/helpers/googleCalendarOAuth.js
  - src/helpers/googleCalendarManager.js
autonomous: true
requirements: [CFG-02]

must_haves:
  truths:
    - "googleCalendarOAuth.js has zero hardcoded Google OAuth URL literals"
    - "googleCalendarManager.js has zero hardcoded Google Calendar API URL literals"
    - "googleCalendarOAuth.js has zero hardcoded openwhispr.com/auth/desktop-callback literals"
    - "Default build resolves all Google OAuth URLs to documented Google endpoints"
    - "Setting OPENWHISPR_OAUTH_GOOGLE_AUTH_URL=https://test.example.com/oauth at build time changes the value used at the call site"
    - "Both helpers require values from src/config/build-config.generated.cjs (CommonJS frozen module emitted by Plan 1)"
  artifacts:
    - path: "src/helpers/googleCalendarOAuth.js"
      provides: "Google OAuth helper using OPENWHISPR_OAUTH_GOOGLE_* + OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL from build-config.generated.cjs"
      contains: "build-config.generated"
    - path: "src/helpers/googleCalendarManager.js"
      provides: "Calendar API client using OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL from build-config.generated.cjs"
      contains: "build-config.generated"
  key_links:
    - from: "src/helpers/googleCalendarOAuth.js"
      to: "src/config/build-config.generated.cjs"
      via: "require()"
      pattern: "build-config.generated"
    - from: "src/helpers/googleCalendarManager.js"
      to: "src/config/build-config.generated.cjs"
      via: "require()"
      pattern: "build-config.generated"
---

<objective>
Wave 2 (parallel with Plan 2) — Google OAuth cluster. Replace the four Google-specific URL literals (CONFIG_INVENTORY rows 8, 10, 11, 12, 13) and the second occurrence of the desktop-callback URL (row 8) with requires from `src/config/build-config.generated.cjs`.

**Revision note (iteration 1):** Per Blocker 2, these CommonJS helpers `require()` the `.cjs` artifact directly (no compiled-TS path needed — that path doesn't exist; this repo has no tsc emit step).

Per D-13: each OAuth provider gets its own env var so Phase 4's CFG-03 gating can selectively disable Google OAuth.

Per D-05: completes the desktop-callback URL consolidation started in Plan 2 — both call sites now read the same logical value.

Plan touches only two files (no overlap with Plan 2), runs in parallel with Plan 2 in wave 2.

CONFIG_INVENTORY rows handled: 8, 10, 11, 12, 13.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-build-time-env-refactor/03-CONTEXT.md
@.planning/phases/03-build-time-env-refactor/03-RESEARCH.md
@docs/CONFIG_INVENTORY.md
@.planning/phases/03-build-time-env-refactor/03-01-defaults-source-of-truth-PLAN.md

<interfaces>
After Plan 1, src/config/build-config.generated.cjs (frozen CJS) exports:
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL: string
  OPENWHISPR_OAUTH_GOOGLE_AUTH_URL: string
  OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL: string
  OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL: string
  OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL: string

Relative path from src/helpers/*.js to .cjs: `../config/build-config.generated.cjs`

CONFIG_INVENTORY rows handled by this plan:
  Row 8: src/helpers/googleCalendarOAuth.js:11   "https://openwhispr.com/auth/desktop-callback" → OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL
  Row 10: src/helpers/googleCalendarOAuth.js:6   "https://accounts.google.com/o/oauth2/v2/auth" → OPENWHISPR_OAUTH_GOOGLE_AUTH_URL
  Row 11: src/helpers/googleCalendarOAuth.js:7   "https://oauth2.googleapis.com/token"          → OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL
  Row 12: src/helpers/googleCalendarOAuth.js:223 "https://oauth2.googleapis.com/revoke"         → OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL  (currently inline literal)
  Row 13: src/helpers/googleCalendarManager.js:6 "https://www.googleapis.com/calendar/v3"       → OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL

These are CommonJS files (.js), use `require(...)` not `import`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Refactor src/helpers/googleCalendarOAuth.js (rows 8, 10, 11, 12)</name>
  <files>src/helpers/googleCalendarOAuth.js</files>
  <read_first>
    - src/helpers/googleCalendarOAuth.js (full file — confirm lines 6, 7, 11, 33, 223)
    - src/config/build-config.generated.cjs (must exist after Plan 1 ran)
    - docs/CONFIG_INVENTORY.md (rows 8, 10, 11, 12)
  </read_first>
  <action>
    1. At top of `src/helpers/googleCalendarOAuth.js`, after existing requires, add:
       ```js
       const {
         OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL,
         OPENWHISPR_OAUTH_GOOGLE_AUTH_URL,
         OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL,
         OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL,
       } = require("../config/build-config.generated.cjs");
       ```
       Path is relative from `src/helpers/` up one level into `src/config/`.
    2. Line 6 (`AUTH_URL`/`GOOGLE_AUTH_URL` const): replace `"https://accounts.google.com/o/oauth2/v2/auth"` with `OPENWHISPR_OAUTH_GOOGLE_AUTH_URL`.
    3. Line 7 (`TOKEN_URL`/`GOOGLE_TOKEN_URL` const): replace `"https://oauth2.googleapis.com/token"` with `OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL`.
    4. Line 11 (`DEFAULT_DESKTOP_CALLBACK_URL`): replace `"https://openwhispr.com/auth/desktop-callback"` with `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL`. Replace any usage of `DEFAULT_DESKTOP_CALLBACK_URL` and the env-fallback chain (`process.env.VITE_OPENWHISPR_OAUTH_CALLBACK_URL || ...`) with `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` directly.
    5. Line 223 (revoke URL): replace inline literal `"https://oauth2.googleapis.com/revoke"` with `OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL`.
    6. Run `grep -cE "https://(accounts\\.google\\.com|oauth2\\.googleapis\\.com)" src/helpers/googleCalendarOAuth.js` — must return 0. Run `grep -cF "openwhispr.com/auth/desktop-callback" src/helpers/googleCalendarOAuth.js` — must return 0.
    7. Remove the partial-guard fallback chain (`process.env.VITE_OPENWHISPR_OAUTH_CALLBACK_URL` reads) at line ~33.
  </action>
  <verify>
    <automated>test "$(grep -cE 'https://(accounts\.google\.com|oauth2\.googleapis\.com)' src/helpers/googleCalendarOAuth.js)" = "0" && test "$(grep -cF 'openwhispr.com/auth/desktop-callback' src/helpers/googleCalendarOAuth.js)" = "0" && test "$(grep -cE 'process\.env\.(VITE_)?OPENWHISPR_OAUTH_CALLBACK_URL' src/helpers/googleCalendarOAuth.js)" = "0" && grep -q "build-config.generated.cjs" src/helpers/googleCalendarOAuth.js && node --check src/helpers/googleCalendarOAuth.js</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cE "https://(accounts\.google\.com|oauth2\.googleapis\.com)" src/helpers/googleCalendarOAuth.js` outputs `0`.
    - `grep -cF "openwhispr.com/auth/desktop-callback" src/helpers/googleCalendarOAuth.js` outputs `0`.
    - `grep -cE "process\.env\.(VITE_)?OPENWHISPR_OAUTH_CALLBACK_URL" src/helpers/googleCalendarOAuth.js` outputs `0`.
    - File requires from `../config/build-config.generated.cjs`.
    - `node --check src/helpers/googleCalendarOAuth.js` exits 0.
  </acceptance_criteria>
  <done>googleCalendarOAuth.js uses four named requires from build-config.generated.cjs; zero Google OAuth literals remain.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Refactor src/helpers/googleCalendarManager.js (row 13)</name>
  <files>src/helpers/googleCalendarManager.js</files>
  <read_first>
    - src/helpers/googleCalendarManager.js (line 6 — calendar API base URL)
    - src/config/build-config.generated.cjs (exports list)
    - docs/CONFIG_INVENTORY.md (row 13)
  </read_first>
  <action>
    1. At top of `src/helpers/googleCalendarManager.js`, add:
       ```js
       const { OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL } = require("../config/build-config.generated.cjs");
       ```
    2. Line 6: replace `"https://www.googleapis.com/calendar/v3"` with `OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL`.
    3. Run `grep -cF "googleapis.com/calendar" src/helpers/googleCalendarManager.js` — must return 0.
  </action>
  <verify>
    <automated>test "$(grep -cF 'googleapis.com/calendar' src/helpers/googleCalendarManager.js)" = "0" && grep -q "build-config.generated.cjs" src/helpers/googleCalendarManager.js && node --check src/helpers/googleCalendarManager.js</automated>
  </verify>
  <acceptance_criteria>
    - `grep -cF "googleapis.com/calendar" src/helpers/googleCalendarManager.js` outputs `0`.
    - File requires from `../config/build-config.generated.cjs`.
    - `node --check src/helpers/googleCalendarManager.js` exits 0.
  </acceptance_criteria>
  <done>googleCalendarManager.js requires calendar API URL from build-config.generated.cjs; zero literals remain.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| App → Google OAuth endpoints | OAuth authorization, token exchange, and revocation URLs control where the user's Google credentials are sent. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-11 | Spoofing | Google OAuth endpoint configurability | accept | Maintainer override is documented (identity proxy / self-host). Defaults preserved when env unset. |
| T-03-12 | Tampering | Build-time-only override | mitigate | Values resolved through frozen CJS module — no runtime `process.env` read in helper files post-refactor (verified by Plan 6 grep gate). |
| T-03-13 | Information Disclosure | Desktop callback URL exposure | accept | Same value as Plan 2 row 7; consolidation reduces drift risk. |
</threat_model>

<verification>
- googleCalendarOAuth.js: zero Google OAuth URL literals; zero desktop-callback literal; zero `OPENWHISPR_OAUTH_CALLBACK_URL` env reads.
- googleCalendarManager.js: zero `googleapis.com/calendar` literal.
- Both files `require` from `../config/build-config.generated.cjs`.
- `node --check` passes on both files.
</verification>

<success_criteria>
All `must_haves.truths` observable; per-provider env-var pattern (D-13) is in place for Phase 4 CFG-03 gating.
</success_criteria>

<output>
After completion, create `.planning/phases/03-build-time-env-refactor/03-04-SUMMARY.md`.
</output>
