---
phase: 1
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/OAUTH_SPEC.md
autonomous: true
requirements: [DOC-02]
must_haves:
  truths:
    - "docs/OAUTH_SPEC.md exists in repo"
    - "Every OAuth provider currently in the source is documented (OpenWhispr cloud sign-in + Google Calendar + any others discovered)"
    - "Each provider entry contains: authorization endpoint, token endpoint, scopes, redirect URI scheme, client-ID source location (file:line), token storage location"
    - "OpenWhispr custom protocol scheme `openwhispr://` and its channel variants (openwhispr-dev, openwhispr-staging) are documented"
    - "Google Calendar OAuth flow is documented in detail (per D-03): authorization endpoint, token endpoint, revoke endpoint, scopes, refresh behavior, token storage in SQLite"
  artifacts:
    - path: "docs/OAUTH_SPEC.md"
      provides: "OAuth provider catalogue and per-provider auth contract"
      contains: "## Google Calendar"
  key_links:
    - from: "docs/OAUTH_SPEC.md"
      to: "src/helpers/googleCalendarOAuth.js, src/helpers/googleCalendarManager.js, src/components/AuthenticationStep.tsx, main.js"
      via: "file:line client-ID and token-storage pointers per provider"
      pattern: "src/.*:[0-9]+|main\\.js:[0-9]+"
---

<objective>
Produce `docs/OAUTH_SPEC.md` — a catalogue of every OAuth provider integrated in the OpenWhispr client, with the depth needed to (a) implement a compatible cloud sign-in identity provider and (b) gate providers individually at build time in Phase 4 (CFG-03) without re-auditing the source.

Purpose: The auth surface contract for v2 + the inventory that drives per-provider build flags.
Output: One markdown file at `docs/OAUTH_SPEC.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/01-wire-contract-documentation/01-CONTEXT.md
@.planning/codebase/INTEGRATIONS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reverse-engineer OAuth flows and write OAUTH_SPEC.md</name>
  <files>docs/OAUTH_SPEC.md</files>
  <read_first>
    Read these source files in full:

    For OpenWhispr cloud sign-in OAuth:
    - src/components/AuthenticationStep.tsx (sign-in entry point: how the cloud auth window is opened, what URL is launched)
    - src/components/EmailVerificationStep.tsx (post-redirect verification polling)
    - main.js (search for `setAsDefaultProtocolClient`, `openwhispr://`, `openwhispr-dev`, `openwhispr-staging` — capture the protocol handler registration and the deep-link parsing of the redirect)
    - preload.js (auth-* IPC methods exposed to renderer)
    - src/helpers/ipcHandlers.js (search for "auth-request", "openwhispr://", protocol redirect handling)
    - src/helpers/tokenStore.js (token persistence: format, storage location, lifecycle)
    - src/lib/auth.ts (where the stored token is read and attached to subsequent requests)
    - src/config/constants.ts (VITE_AUTH_URL constant if present; channel detection)

    For Google Calendar OAuth:
    - src/helpers/googleCalendarOAuth.js (authorization URL builder, token exchange, refresh token logic — note the auth, token, revoke endpoints in full)
    - src/helpers/googleCalendarManager.js (search for `google_tokens` SQLite table, refresh-on-expiry logic, scopes)
    - src/helpers/database.js (find the `google_tokens` schema definition / migration to document where tokens are stored on disk)

    Discovery sweep (other OAuth providers):
    - Grep for `oauth`, `accounts.google.com`, `appleid.apple.com`, `github.com/login/oauth`, `microsoftonline.com`, `client_id`, `redirect_uri` across `src/` and `main.js` to confirm whether any other OAuth providers exist. If none beyond OpenWhispr cloud + Google, state that explicitly in the doc per D-04.
  </read_first>
  <action>
    Create `docs/OAUTH_SPEC.md` with the structure below. Use the same per-provider template across providers (Claude's discretion per CONTEXT.md) so Phase 4 can mechanically gate each one. Per D-04, EVERY OAuth provider in the source must be enumerated.

    Required sections:

    1. `# OAuth Provider Spec`
       Brief intro: scope (every OAuth integration in the client), how the doc is used downstream (Phase 4 CFG-03 per-provider gating, v2 auth contract), cross-link to BACKEND_SPEC.md.

    2. `## Conventions`
       - All OAuth flows go through the OS default browser unless noted (vs. embedded webview).
       - Custom protocol redirect: `openwhispr://...` registered via Electron `app.setAsDefaultProtocolClient()` in main.js (cite file:line).
       - Channel variants: `openwhispr-dev`, `openwhispr-staging`, `openwhispr` — selected by build channel; cite source.
       - Per-provider source pointer convention: client-ID location is `file:line`; token-storage pointer is the file responsible for persisting the token after exchange.

    3. `## Provider Template`
       Show the template once at the top so each provider section uses the same shape:

       ```
       ### {Provider Name}

       | Field | Value |
       |---|---|
       | Authorization endpoint | `https://...` |
       | Token endpoint | `https://...` |
       | Token refresh endpoint | `https://...` (or "same as token endpoint") |
       | Token revoke endpoint | `https://...` (or "n/a") |
       | Scopes requested | `scope1`, `scope2` |
       | Redirect URI scheme | `openwhispr://...` or `https://...` |
       | Client ID source | `path/to/file.ts:LINE` (build-time env var name if applicable) |
       | Client secret source | `path/to/file.ts:LINE` (or "PKCE — no secret") |
       | Token storage location | `~/.openwhispr/...` or SQLite table name + file:line of schema |
       | Token storage mechanism | `safeStorage` / SQLite plaintext / SQLite encrypted / etc. |
       | Refresh trigger | When the client refreshes (e.g., 401 response, expiry timer) |
       | IPC channels involved | `auth-request`, `auth-revoke`, etc. |
       | Source files | List of all relevant `src/...` files |

       **Flow (step-by-step)**
       1. ...
       2. ...

       **Notes / quirks** (e.g., webview vs browser, channel-specific protocol scheme)
       ```

    4. `## OpenWhispr Cloud Sign-In`
       Use the template above. Document:
       - Authorization endpoint: derived from `VITE_AUTH_URL` or `VITE_OPENWHISPR_API_URL` (cite exact line in src/config/constants.ts)
       - Token endpoint: cloud `/api/auth/...` path (whichever the client polls; cross-link to BACKEND_SPEC.md `## OpenWhispr Cloud Endpoints`)
       - Redirect URI scheme: `openwhispr://` (and channel variants)
       - Client ID source: VITE_AUTH_URL / build-time env (no embedded client ID since the cloud generates the auth URL)
       - Token storage: `src/helpers/tokenStore.js` — list exact storage path / mechanism observed
       - Flow: open browser → cloud sign-in → redirect to `openwhispr://...?token=...` → main.js protocol handler → IPC to renderer → tokenStore persists → EmailVerificationStep polls /api/auth/verification-status until success
       - Channel-specific protocol schemes: openwhispr / openwhispr-dev / openwhispr-staging (cite main.js:LINE)
       - IPC channels: enumerate every `auth-*` channel from preload.js and ipcHandlers.js

    5. `## Google Calendar` (DETAILED — per D-03)
       Use the template above. Populate every row from observation of source:
       - Authorization endpoint: `https://accounts.google.com/o/oauth2/auth` (verify in source)
       - Token endpoint: `https://oauth2.googleapis.com/token`
       - Revoke endpoint: `https://oauth2.googleapis.com/revoke`
       - Scopes: read from googleCalendarOAuth.js (typically `https://www.googleapis.com/auth/calendar.readonly`)
       - Redirect URI scheme: cite the exact value passed to the auth URL builder (custom protocol or http://localhost:PORT)
       - Client ID source: file:line where the client ID literal or env var is read in googleCalendarOAuth.js
       - Token storage: SQLite `google_tokens` table — cite the schema definition file:line in database.js + the manager file:line that performs upsert
       - Refresh trigger: cite the file:line in googleCalendarManager.js where token expiry is checked and refresh is attempted; mention the 2-minute polling cadence and exponential backoff (2min → 4min → 8min → cap 30min) since they affect token-refresh behavior
       - Note: 10s socket timeout (cite source line)

    6. `## Other Providers Found`
       If the discovery sweep finds Apple Sign-In, GitHub OAuth, etc. — add a section per provider using the template. If none are found, write a single line: "No other OAuth providers are integrated as of {commit-sha or doc date}. Future additions must be documented here before Phase 4 gating can include them."

    7. `## Token Storage Summary`
       One-table summary across all providers:

       `| Provider | Storage backend | Path / table | Encryption at rest |`

       Rows reflect what was found in the per-provider sections.

    8. `## Custom Protocol Reference`
       Single section listing every `openwhispr://` URL the client knows how to receive. For each: which channel variant, what query params, what handler dispatches it. Cross-link from OpenWhispr Cloud Sign-In flow.

    9. `## Out of Scope`
       Per CONTEXT.md decisions: pluggable auth strategies are deferred to v2 (D-14 — auth section is prescriptive, not pluggable). Hidden / undocumented cloud OAuth endpoints not exercised by the current client are out of scope (D-11).

    Format constraint per D-05: markdown tables + fenced code blocks only. No OpenAPI / JSON Schema. Per D-07 every Client ID source row and Token storage row must include a real `path:LINE` pointer; replace placeholders with actual line numbers while reading the source.
  </action>
  <verify>
    <automated>test -f docs/OAUTH_SPEC.md && grep -q '^## Google Calendar' docs/OAUTH_SPEC.md && grep -q '^## OpenWhispr Cloud Sign-In' docs/OAUTH_SPEC.md && grep -q '^## Token Storage Summary' docs/OAUTH_SPEC.md && grep -q '^## Custom Protocol Reference' docs/OAUTH_SPEC.md && grep -q '^## Provider Template' docs/OAUTH_SPEC.md && grep -q 'openwhispr://' docs/OAUTH_SPEC.md && grep -q 'openwhispr-dev' docs/OAUTH_SPEC.md && grep -q 'openwhispr-staging' docs/OAUTH_SPEC.md && grep -q 'accounts.google.com' docs/OAUTH_SPEC.md && grep -q 'oauth2.googleapis.com' docs/OAUTH_SPEC.md && grep -q 'calendar.readonly' docs/OAUTH_SPEC.md && grep -q 'google_tokens' docs/OAUTH_SPEC.md && grep -qE 'src/helpers/googleCalendarOAuth\.js:[0-9]+' docs/OAUTH_SPEC.md && grep -qE 'main\.js:[0-9]+' docs/OAUTH_SPEC.md && ! grep -qE '^openapi:|"openapi"' docs/OAUTH_SPEC.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f docs/OAUTH_SPEC.md`
    - Contains `## Google Calendar` section (D-03)
    - Contains `## OpenWhispr Cloud Sign-In` section
    - Contains `## Token Storage Summary`, `## Custom Protocol Reference`, `## Provider Template` sections
    - Mentions `openwhispr://`, `openwhispr-dev`, `openwhispr-staging` (channel variants)
    - Mentions `accounts.google.com`, `oauth2.googleapis.com`, `calendar.readonly`, `google_tokens`
    - Source pointers with line numbers present: `src/helpers/googleCalendarOAuth.js:NNN`, `main.js:NNN` (D-07)
    - NO OpenAPI tooling in file (D-05)
  </acceptance_criteria>
  <done>
    `docs/OAUTH_SPEC.md` exists; OpenWhispr cloud sign-in + Google Calendar both documented using the shared provider template; every template row populated with real values from source (or explicit "n/a"); custom protocol scheme + channel variants enumerated; token storage summary table cross-references the per-provider sections.
  </done>
</task>

</tasks>

<verification>
- `docs/OAUTH_SPEC.md` exists with the required section headings.
- Both currently-shipped OAuth providers (OpenWhispr cloud, Google Calendar) use the shared per-provider template with every field populated.
- Custom protocol scheme `openwhispr://` and its channel variants are documented with file:line pointers into main.js.
- Google Calendar entry includes auth + token + revoke endpoints, scopes, and SQLite token-storage pointer.
- No OpenAPI / JSON Schema syntax (per D-05).
</verification>

<success_criteria>
DOC-02 satisfied: every OAuth provider currently in the codebase is documented in `docs/OAUTH_SPEC.md` with sufficient detail that (a) v2 can implement a compatible identity provider and (b) Phase 4 CFG-03 can introduce a per-provider build flag without re-reading source.
</success_criteria>

<output>
After completion, create `.planning/phases/01-wire-contract-documentation/01-02-SUMMARY.md` per the summary template.
</output>
