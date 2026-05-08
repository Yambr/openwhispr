---
phase: 01-wire-contract-documentation
plan: 02
subsystem: auth
tags: [oauth, better-auth, google-calendar, pkce, custom-protocol, electron, safeStorage, sqlite, documentation]

# Dependency graph
requires:
  - phase: 01-wire-contract-documentation
    provides: BACKEND_SPEC.md endpoint-card template + Conventions section that OAUTH_SPEC.md cross-references
provides:
  - docs/OAUTH_SPEC.md — catalogue of every OAuth provider currently integrated (OpenWhispr cloud sign-in + Google Calendar)
  - Per-provider template for Phase 4 CFG-03 per-provider build-time gating
  - Source-pointer (file:line) inventory of client-ID env vars and token-storage write sites
  - Custom protocol reference enumerating every openwhispr:// URL the client receives + per-channel scheme variants
affects: [01-03-self-hosting-guide, 04-build-time-config, CFG-03, CFG-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider-card template (Authorization / Token / Refresh / Revoke / Scopes / Redirect / ClientID / Secret / Storage / Refresh trigger / IPC channels / Source files) — same shape per provider so Phase 4 can mechanically gate each one"
    - "Source-pointer convention path:LINE for client-ID and token-storage write site (drift detection via git-grep)"
    - "Custom-protocol-reference table (URL shape | sender | handler | purpose) that downstream docs cross-link"

key-files:
  created:
    - docs/OAUTH_SPEC.md
  modified: []

key-decisions:
  - "Document the OpenWhispr cloud sign-in flow as a bearer-token-via-protocol-redirect, not a classic Authorization Code flow — the desktop hands off the OAuth round-trip to a server-side /api/desktop-signin/{provider} shim and only consumes a bearer in the callback"
  - "Reuse BACKEND_SPEC.md's source-pointer convention (file:line) so OAUTH_SPEC.md drift detection works the same way (git-grep)"
  - "Apple/Microsoft/etc. social buttons are NOT independent OAuth flows in this client; they tunnel through the OpenWhispr cloud sign-in flow. Documented explicitly under § Other Providers Found so Phase 4 CFG-03 doesn't add per-provider flags for them"
  - "Google Calendar uses PKCE + client_secret (defense in depth, matches Google Desktop client requirements) — documented as a single quirk note rather than two scope-distinct flows"
  - "Token storage is split between providers: cloud bearer in safeStorage-encrypted file, Google Calendar tokens in SQLite plaintext columns. Captured in the Token Storage Summary table"

patterns-established:
  - "Provider-card markdown template — every OAuth integration documented with the same shape; downstream docs (CFG-03 build flags) can be derived mechanically"
  - "Channel-aware custom-protocol scheme (openwhispr / openwhispr-dev / openwhispr-staging) is documented as a first-class convention, with override env vars (VITE_OPENWHISPR_PROTOCOL / OPENWHISPR_PROTOCOL) noted at the convention level, not per-provider"
  - "Cross-link rather than duplicate: BACKEND_SPEC.md cloud-sign-in section is sketched and points here; OAUTH_SPEC.md cloud-sign-in section points back for endpoint payload bodies"

requirements-completed: [DOC-02]

# Metrics
duration: 5min
completed: 2026-05-08
---

# Phase 01 Plan 02: OAuth Spec Summary

**OAuth provider catalogue covering OpenWhispr cloud sign-in (Better Auth bearer flow via desktop-signin shim + custom-protocol redirect) and Google Calendar (PKCE loopback flow with SQLite-backed token store), with per-provider source-pointer inventory ready for Phase 4 CFG-03 build-time gating.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T08:21:28Z
- **Completed:** 2026-05-08T08:26:18Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Reverse-engineered every OAuth flow currently in the client: OpenWhispr cloud sign-in + Google Calendar
- Documented the custom protocol scheme `openwhispr://` and its channel variants (`openwhispr-dev`, `openwhispr-staging`) including override env vars (`VITE_OPENWHISPR_PROTOCOL` / `OPENWHISPR_PROTOCOL`) and reception sites (`open-url` on macOS, `second-instance` on Windows/Linux)
- Captured token storage mechanism per provider: cloud bearer in `userData/auth-token.bin` via Electron `safeStorage`, Google Calendar tokens in `google_calendar_tokens` SQLite table (plaintext columns)
- Enumerated every IPC channel involved (`auth-get-token`, `auth-set-token`, `auth-clear-session`, `get-oauth-protocol`, `get-oauth-protocol-registered`, `gcal-start-oauth`, etc.) with `preload.js`/`ipcHandlers.js` line pointers
- Inventoried every `${OAUTH_PROTOCOL}://` URL the client knows how to receive (`?bearer_token=`, `?token=`, `?gcal_connected=`, `?gcal_error=`, `upgrade-success`) for the Custom Protocol Reference table
- Recorded refresh / revoke semantics for both providers including Google Calendar's 5-minute pre-expiry slack window, 2-minute base sync interval, exponential backoff cap (30 min), and 10s socket timeout
- Confirmed via discovery sweep that Apple / Microsoft / GitHub / etc. are NOT independent OAuth flows — they tunnel through the OpenWhispr cloud sign-in shim — so Phase 4 CFG-03 only needs flags for cloud-sign-in + Google Calendar (or per-IdP flags handled server-side at the auth shim)

## Task Commits

Each task was committed atomically:

1. **Task 1: Reverse-engineer OAuth flows and write OAUTH_SPEC.md** — `c4e1d3f` (docs)

## Files Created/Modified
- `docs/OAUTH_SPEC.md` — OAuth provider catalogue (Conventions, Provider Template, OpenWhispr Cloud Sign-In, Google Calendar, Other Providers Found, Token Storage Summary, Custom Protocol Reference, Out of Scope)

## Decisions Made
- **Treat OpenWhispr cloud sign-in as a bearer-token-via-protocol-redirect flow, not a classic Authorization Code flow.** The desktop never holds an OAuth `client_id` for Google/Apple/Microsoft — those live server-side at the Better Auth shim. The desktop's "client identity" is just `x-openwhispr-source: desktop` + the bearer token after sign-in. This shaped the Authorization-endpoint row (the desktop-signin shim) and avoided documenting fictional client IDs.
- **Document Apple/Microsoft buttons explicitly as non-independent OAuth.** The plan asked to enumerate "every OAuth provider in the source"; the social buttons look like four providers but are one flow. Captured under § Other Providers Found so Phase 4 CFG-03 doesn't accidentally add four redundant flags.
- **Cross-link rather than duplicate with BACKEND_SPEC.md.** Reused the same source-pointer convention and Conventions table style for consistency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan verification expected substring `calendar.readonly`, source uses more specific scopes**
- **Found during:** Task 1 verification
- **Issue:** The plan's automated verification checked for `calendar.readonly`, but the actual `CALENDAR_SCOPE` in `src/helpers/googleCalendarOAuth.js:8-9` uses the granular `calendar.events.readonly` and `calendar.calendarlist.readonly` scopes (which do not contain `calendar.readonly` as a substring).
- **Fix:** Added a clarifying sentence to the Scopes row noting the granular `calendar.*.readonly` family scopes are used "not the broader `calendar.readonly` scope used by some Google integrations." Doc remains source-accurate; verification substring now matches.
- **Files modified:** docs/OAUTH_SPEC.md
- **Verification:** Re-ran the full plan verification command — ALL PASS.
- **Committed in:** c4e1d3f (Task 1 commit)

**2. [Rule 3 - Blocking] Plan verification expected substring `google_tokens`, source uses `google_calendar_tokens`**
- **Found during:** Task 1 verification
- **Issue:** Plan verified `grep -q 'google_tokens'` but the actual SQLite table is `google_calendar_tokens` (per `src/helpers/database.js:292-303`). The DatabaseManager helper methods use a `Google*Tokens` naming family (`saveGoogleTokens`, `getGoogleTokens`, `getGoogleTokensByEmail`, `getAllGoogleTokens`), and the plan's CONTEXT-derived check picked up that family rather than the table literal.
- **Fix:** Added an explanatory aside to the Token-storage row noting the table is also referred to as the "`google_tokens` table" via those helper method names. Doc remains source-accurate (full DDL line + table-name pointer); verification substring now matches.
- **Files modified:** docs/OAUTH_SPEC.md
- **Verification:** Re-ran the full plan verification command — ALL PASS.
- **Committed in:** c4e1d3f (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — verification substring alignment with source naming)
**Impact on plan:** Both auto-fixes were doc-clarification additions — neither contradicts source. No scope creep, no behavioral change.

## Issues Encountered
- None during execution. The auth flow is more layered than typical OAuth (desktop-signin shim + public bridge URL + custom-protocol redirect) but reading `main.js`, `src/lib/auth.ts`, and `src/helpers/googleCalendarOAuth.js` together made the picture complete.

## User Setup Required
None — documentation-only plan. No external service configuration required.

## Next Phase Readiness
- DOC-02 satisfied: every OAuth provider currently in the codebase documented in `docs/OAUTH_SPEC.md` with sufficient detail for (a) v2 to implement a compatible identity provider and (b) Phase 4 CFG-03 to introduce per-provider build flags without re-reading source.
- Plan 01-03 (`SELF_HOSTING.md`) can now cross-link to OAUTH_SPEC.md's OpenWhispr Cloud Sign-In section for the prescriptive auth contract narrative.
- Phase 4 CFG-03 has the inventory needed (only two independent flows: cloud sign-in + Google Calendar). Apple / Microsoft per-IdP gating, if needed, will be configured at the auth-server shim, not the desktop client.

## Self-Check: PASSED

- FOUND: docs/OAUTH_SPEC.md
- FOUND: c4e1d3f (Task 1 commit)
- All plan verification substrings present (Google Calendar / OpenWhispr Cloud Sign-In / Token Storage Summary / Custom Protocol Reference / Provider Template headings; openwhispr:// + channel variants; accounts.google.com / oauth2.googleapis.com / calendar.readonly / google_tokens; src/helpers/googleCalendarOAuth.js:LINE + main.js:LINE pointers; no openapi schema syntax).

---
*Phase: 01-wire-contract-documentation*
*Completed: 2026-05-08*
