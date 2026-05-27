# OAuth Provider Spec

This document is the catalogue of every OAuth integration in the OpenWhispr Electron client. It is reverse-engineered strictly from the client source tree — no live OAuth traces were captured. Reading the source is the contract.

## Scope

| Provider | Treatment | Why |
|---|---|---|
| OpenWhispr cloud sign-in (`auth.openwhispr.com` / Better Auth) | **Detailed.** Full flow, every endpoint, every IPC channel, every redirect-URL variant. | This is the auth surface a self-hosted v2 backend must reimplement. |
| Google Calendar (sign-in + Calendar API access tokens) | **Detailed.** PKCE flow, token storage in SQLite, refresh-on-expiry, revoke. | OAuth is part of the auth surface a self-hosted backend has to know about; payload bodies of the Google Calendar REST API itself link to Google's docs. |
| Apple / Microsoft / GitHub / etc. | Not present as an independent OAuth flow in the client. Apple and Microsoft are exposed as social-sign-in **buttons** that funnel through the OpenWhispr cloud sign-in flow above (Better Auth handles the upstream OAuth round-trip server-side). See [§ Other Providers Found](#other-providers-found). | — |

## How to read this doc

1. [Conventions](#conventions) — base assumptions about transport, browser vs. webview, and the custom-protocol redirect mechanism.
2. [Provider Template](#provider-template) — every provider section uses the same shape.
3. Per-provider sections: [OpenWhispr Cloud Sign-In](#openwhispr-cloud-sign-in), [Google Calendar](#google-calendar), [Other Providers Found](#other-providers-found).
4. [Token Storage Summary](#token-storage-summary) — one-table cross-provider view.
5. [Custom Protocol Reference](#custom-protocol-reference) — every `openwhispr://` URL the client knows how to receive.
6. [Out of Scope](#out-of-scope).

For HTTP wire details of OpenWhispr cloud endpoints called once a token has been minted, see [`BACKEND_SPEC.md`](./BACKEND_SPEC.md).

---

## Conventions

| Item | Value |
|---|---|
| Browser vs. webview | All OAuth flows are launched through the **OS default browser** via `shell.openExternal(...)` (Google Calendar) or `openExternalLink(...)` (cloud sign-in). No embedded `BrowserView` / webview is used. This is required for Better Auth — its `state` cookie has to land in the user's real browser jar. |
| Custom protocol | `openwhispr://` is registered as a default protocol client via `app.setAsDefaultProtocolClient()` in `main.js:194,196` (called from `registerOpenWhisprProtocol()` at `main.js:187`). Registration result is exposed to the renderer via the `get-oauth-protocol-registered` IPC channel. |
| Channel variants | Per-channel protocol scheme: `openwhispr` (production), `openwhispr-dev` (development), `openwhispr-staging` (staging). Selected by `getOAuthProtocol()` at `main.js:135-147`, with the channel itself resolved by `resolveAppChannel()` at `main.js:73-83` from `OPENWHISPR_CHANNEL` / `VITE_OPENWHISPR_CHANNEL`. The selected scheme is also overridable directly via `VITE_OPENWHISPR_PROTOCOL` / `OPENWHISPR_PROTOCOL` (`main.js:136-141`). |
| Deep-link reception | macOS: `app.on("open-url", ...)` at `main.js:457-472`. Windows / Linux: `app.on("second-instance", ...)` scans `commandLine` at `main.js:1339-1373`. Both paths funnel into `handleOAuthDeepLink()` (`main.js:575-590`). |
| Source pointer convention | Each provider section cites a `path:line` for the **client-ID source** (where the client ID is read) and a `path:line` for the **token-storage write site** (where the token is persisted after exchange). When a row reads "build-time env var", the value is supplied via Vite's `define` step or `process.env` at runtime — there is no embedded literal client ID for cloud sign-in. |
| Token attachment | After any OAuth flow completes, the OpenWhispr cloud bearer token is attached to subsequent cloud requests via `Authorization: Bearer ${token}` (see `src/helpers/ipcHandlers.js:3393-3394` and `src/lib/auth.ts:8-12`). Google Calendar API requests use a separate access token from the `google_calendar_tokens` SQLite table. |

---

## Provider Template

Every provider section below populates the following template. Empty / inapplicable rows say `n/a` explicitly.

```
### {Provider Name}

| Field | Value |
|---|---|
| Authorization endpoint | `https://...` |
| Token endpoint | `https://...` |
| Token refresh endpoint | `https://...` (or "same as token endpoint") |
| Token revoke endpoint | `https://...` (or "n/a") |
| Scopes requested | `scope1`, `scope2` |
| Redirect URI scheme | `openwhispr://...` or `https://...` or `http://127.0.0.1:PORT` |
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

**Notes / quirks**
```

---

## OpenWhispr Cloud Sign-In

The desktop client never embeds a Better Auth client ID. It hands off the OAuth round-trip to a **server-side shim endpoint** (`/api/desktop-signin/{provider}`) on the auth server, which handles the upstream provider exchange and 302s back through a public callback page (`https://openwhispr.com/auth/desktop-callback`) that in turn redirects into the registered `openwhispr://` custom protocol. This sidesteps cookie-jar mismatches between Electron's session and the user's browser.

| Field | Value |
|---|---|
| Authorization endpoint | `${AUTH_URL}/api/desktop-signin/{provider}` where `provider ∈ {google, microsoft, apple}`. `AUTH_URL` defaults to `https://auth.openwhispr.com` (`src/lib/auth.ts:5`, `main.js:481-486`, `src/helpers/ipcHandlers.js:3332-3336`). Build-time / runtime override via `VITE_AUTH_URL` / `AUTH_URL`. |
| Token endpoint | n/a — the bearer token is delivered by the protocol redirect (`bearer_token` query param) rather than by a client-initiated POST. The Better Auth session-token endpoint `${AUTH_URL}/api/auth/get-session` is only used as a one-time **migration bridge** to swap a legacy signed cookie for a raw bearer token (`main.js:497-514`). |
| Token refresh endpoint | n/a explicitly — Better Auth tokens are long-lived bearers; rotation happens implicitly via the `set-auth-token` response header on any auth-client call (`src/lib/auth.ts:14-17`), which the renderer persists via the `auth-set-token` IPC. There is no client-initiated refresh request. |
| Token revoke endpoint | `authClient.signOut()` (Better Auth) followed by local `tokenStore.clear()` + cookie wipe (`src/lib/auth.ts:131-139`, `src/helpers/ipcHandlers.js:3287-3299`). No standalone HTTPS revoke call. |
| Scopes requested | Determined server-side by the `/api/desktop-signin/{provider}` shim. The desktop client supplies only `provider` and `callbackURL`. |
| Redirect URI scheme | Two-leg redirect: <br>1. `${AUTH_URL}/api/desktop-signin/{provider}` →  302 → upstream provider → 302 back → `${AUTH_URL}/api/auth/callback/{provider}` (handled server-side).<br>2. Server emits 302 to `https://openwhispr.com/auth/desktop-callback?protocol=${OAUTH_PROTOCOL}&...` which then redirects to `${OAUTH_PROTOCOL}://?bearer_token=...` (or `?token=...` for legacy signed cookie). The `callbackURL` param sent in step 1 is built at `src/lib/auth.ts:182-184`. The desktop callback URL is hard-coded at `src/lib/auth.ts:171`. |
| Client ID source | n/a (no embedded Better Auth provider client ID — the auth server holds the client IDs for Google / Microsoft / Apple). The desktop's only "client identity" is the `x-openwhispr-source: desktop` header (`src/lib/auth.ts:13`) and the bearer token after sign-in. |
| Client secret source | n/a — bearer flow only; no secret is held client-side. |
| Token storage location | `${app.getPath("userData")}/auth-token.bin` — see `src/helpers/tokenStore.js:7` (`tokenFile()`). The write site is `tokenStore.set()` at `src/helpers/tokenStore.js:32-43`, called from the `auth-set-token` IPC handler at `src/helpers/ipcHandlers.js:3302-3312`. |
| Token storage mechanism | Encrypted via Electron `safeStorage` when available (`secretCrypto.encrypt(token)` at `src/helpers/tokenStore.js:36`); plaintext UTF-8 fallback when the OS keyring is unavailable (`src/helpers/tokenStore.js:37`). File mode `0o600`. In-memory cache `cached` lives at `src/helpers/tokenStore.js:9`. |
| Refresh trigger | Any Better Auth call — `authClient.fetchOptions.onSuccess` reads the `set-auth-token` response header and writes it back via `auth-set-token` (`src/lib/auth.ts:14-17`). Stale-session retry (with grace-period exponential backoff up to 6 attempts) lives in `withSessionRefresh()` at `src/lib/auth.ts:142-169`. |
| IPC channels involved | `auth-get-token` (`src/helpers/ipcHandlers.js:3301`), `auth-set-token` (`src/helpers/ipcHandlers.js:3302`), `auth-clear-session` (`src/helpers/ipcHandlers.js:3287`), `get-oauth-protocol-registered` (`src/helpers/ipcHandlers.js:6428`), `get-oauth-protocol` (`src/helpers/ipcHandlers.js:6430`). Renderer-side wrappers in `preload.js:308-311,468-470`. |
| Source files | `src/lib/auth.ts`, `src/components/AuthenticationStep.tsx`, `src/components/EmailVerificationStep.tsx`, `src/helpers/tokenStore.js`, `src/helpers/secretCrypto.js`, `src/helpers/ipcHandlers.js`, `main.js`, `preload.js`, `src/config/constants.ts`. |

**Flow (step-by-step)**

1. `AuthenticationStep` calls `signInWithSocial(provider)` (`src/components/AuthenticationStep.tsx:121-139`, `src/lib/auth.ts:173-195`).
2. Renderer asks main for the active protocol scheme via `getOAuthProtocol()` IPC → `openwhispr` / `openwhispr-dev` / `openwhispr-staging` (`src/lib/auth.ts:182`, `src/helpers/ipcHandlers.js:6430`).
3. Renderer builds `${AUTH_URL}/api/desktop-signin/{provider}?callbackURL=${DESKTOP_OAUTH_CALLBACK_URL}?protocol={protocol}` and opens it in the OS browser via `openExternalLink(...)` (`src/lib/auth.ts:183-185`). `DESKTOP_OAUTH_CALLBACK_URL = "https://openwhispr.com/auth/desktop-callback"` (`src/lib/auth.ts:171`).
4. Auth server handles the upstream OAuth round-trip with the chosen IdP and lands at `https://openwhispr.com/auth/desktop-callback?protocol=...&bearer_token=...` (or `?token=...` for legacy signed-cookie builds).
5. The callback page redirects to `${protocol}://?bearer_token=...`.
6. OS dispatches the deep link to OpenWhispr:
   - macOS: `app.on("open-url")` at `main.js:457-472`.
   - Windows / Linux: relaunch is intercepted by `app.on("second-instance")` at `main.js:1339-1373`, which scans `commandLine` for the protocol URL.
7. `handleOAuthDeepLink(url)` at `main.js:575-590` parses `bearer_token` and calls `applySessionTokenAndRefresh(...)`. If only `token=` (signed cookie) is present, `exchangeSignedTokenForRawBearer()` (`main.js:497-514`) POSTs `${AUTH_URL}/api/auth/get-session` to swap it for a raw bearer.
8. Bearer token is persisted via `tokenStore.set()` to `userData/auth-token.bin` (encrypted via `safeStorage` when available) and the control panel is reloaded with the token attached to subsequent requests.
9. `EmailVerificationStep` (when sign-up flow) polls `${OPENWHISPR_BACKEND_URL}/api/auth/verification-status?email=...` every 5s (`src/components/EmailVerificationStep.tsx:28-50`) until `verified: true`.

**Notes / quirks**

- **Pre-protocol-registration UX gate.** `getOAuthProtocolRegistered` IPC (`src/helpers/ipcHandlers.js:6428`) drives the `oauthProtocolRegistered` state that disables social sign-in buttons (`src/components/AuthenticationStep.tsx:90-95,486,510,533`). If `setAsDefaultProtocolClient()` fails (`main.js:206-209`), the user only sees the email/password form.
- **One-time cookie→bearer migration.** `migrateCookieToBearerToken()` at `main.js:520+` runs once on boot to upgrade users from a legacy build that stored the session as a cookie in Electron's session store.
- **Authentication endpoint scope.** Per-provider scopes (Google email/profile, Microsoft openid, Apple name/email) are configured server-side in Better Auth, not by this client.
- **Channel-aware `userData` isolation.** Non-production channels use `OpenWhispr-${APP_CHANNEL}` as the userData path (`main.js:88-95`) — auth tokens never leak between channels.
- **Bearer auth header injection.** Cloud requests use `Authorization: Bearer ${tokenStore.get()}` with a Cookie fallback for the brief window before migration completes — see `getAuthHeaderFromWindow()` at `src/helpers/ipcHandlers.js:3392-3397`.

---

## Google Calendar

Google Calendar uses a **standalone OAuth 2.0 + PKCE flow** that runs entirely in the main process. The client opens the system browser, listens on a loopback HTTP server (`http://127.0.0.1:<random-port>`), exchanges the authorization code for tokens against Google's token endpoint, and persists them in SQLite. Tokens are refreshed automatically on a 5-minute pre-expiry window. Calendar sync runs on a 2-minute timer with exponential backoff (up to 30 minutes) on consecutive failures.

| Field | Value |
|---|---|
| Authorization endpoint | `https://accounts.google.com/o/oauth2/v2/auth` (`src/helpers/googleCalendarOAuth.js:6`). Built into a full URL by `startOAuthFlow()` at `src/helpers/googleCalendarOAuth.js:140-152`. |
| Token endpoint | `https://oauth2.googleapis.com/token` (`src/helpers/googleCalendarOAuth.js:7`). Used by `exchangeCodeForTokens()` at `src/helpers/googleCalendarOAuth.js:167-178`. |
| Token refresh endpoint | Same as token endpoint — `refreshAccessToken()` POSTs `grant_type=refresh_token` to `https://oauth2.googleapis.com/token` (`src/helpers/googleCalendarOAuth.js:180-189`). |
| Token revoke endpoint | `https://oauth2.googleapis.com/revoke` (`src/helpers/googleCalendarOAuth.js:223`). Called best-effort from `revokeToken()` at `src/helpers/googleCalendarOAuth.js:220-227`; failures are swallowed. |
| Scopes requested | `openid`, `email`, `https://www.googleapis.com/auth/calendar.events.readonly`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly` — joined with single spaces in `CALENDAR_SCOPE` at `src/helpers/googleCalendarOAuth.js:8-9`. These are the granular `calendar.*.readonly` family scopes, not the broader `calendar.readonly` scope used by some Google integrations. |
| Redirect URI scheme | **Loopback HTTP**: `http://127.0.0.1:${server.address().port}` (`src/helpers/googleCalendarOAuth.js:81,138`). The port is OS-assigned (`server.listen(0, "127.0.0.1", ...)`). After token exchange, the loopback handler 302s the user's browser to a public bridge URL (`https://openwhispr.com/auth/desktop-callback?protocol=${OAUTH_PROTOCOL}&gcal_connected=true|gcal_error=...`) so the user lands back inside the OpenWhispr window via the custom protocol — see `_buildCallbackRedirect()` and `_redirect()` at `src/helpers/googleCalendarOAuth.js:41-53`. |
| Client ID source | `process.env.GOOGLE_CALENDAR_CLIENT_ID` — read by `getClientId()` at `src/helpers/googleCalendarOAuth.js:24-26`. Build-time env (no embedded literal). |
| Client secret source | `process.env.GOOGLE_CALENDAR_CLIENT_SECRET` — read by `getClientSecret()` at `src/helpers/googleCalendarOAuth.js:28-30`. Required for Google's "installed app" client type even in PKCE mode. PKCE (S256) is also used as defense in depth (`src/helpers/googleCalendarOAuth.js:57-58,148-149`). |
| Token storage location | SQLite table `google_calendar_tokens` (also referred to as the `google_tokens` table in helper method names — `saveGoogleTokens`, `getGoogleTokens`, `getGoogleTokensByEmail`, `getAllGoogleTokens`). Schema defined at `src/helpers/database.js:292-303` (DDL). Uniqueness on `google_email` enforced via either `UNIQUE` constraint on the column or a backfill index `idx_google_calendar_tokens_email` (`src/helpers/database.js:306-324`). Upsert site: `saveGoogleTokens()` at `src/helpers/database.js:1194-1219`, called from `src/helpers/googleCalendarOAuth.js:111-117` after exchange and `:206-212` after refresh. |
| Token storage mechanism | **SQLite plaintext** — `access_token` / `refresh_token` are stored as `TEXT NOT NULL` columns. The SQLite database file itself lives in the per-channel `userData` dir but is not separately encrypted at rest. Distinct from the cloud bearer token (which uses `safeStorage`). |
| Refresh trigger | Pre-expiry refresh: `getValidAccessToken()` at `src/helpers/googleCalendarOAuth.js:191-218` checks `tokens.expires_at - 5 * 60 * 1000 < Date.now()` (5-minute slack window) and calls `refreshAccessToken()` if so. The refreshed access token is written back into the same row (the refresh token is preserved). Sync cadence affecting refresh frequency: 2-minute base interval (`src/helpers/googleCalendarManager.js:19`), exponential backoff `2^N * 2min` capped at 30 min on consecutive failures (`src/helpers/googleCalendarManager.js:442-445`). 10-second per-request socket timeout for Calendar API calls (`src/helpers/googleCalendarManager.js:492-494`). |
| IPC channels involved | `gcal-start-oauth` (`src/helpers/ipcHandlers.js:7002`), `gcal-disconnect` (`:7011`), `gcal-get-connection-status` (`:7025`), `gcal-get-calendars` (`:7033`), `gcal-set-calendar-selection` (`:7041`), `gcal-sync-events` (`:7050`), `gcal-get-upcoming-events` (`:7059`), `gcal-get-event` (`:7070`). Renderer wrappers at `preload.js:800-809`. |
| Source files | `src/helpers/googleCalendarOAuth.js`, `src/helpers/googleCalendarManager.js`, `src/helpers/database.js` (schema + token CRUD at lines 292-324, 1194-1242, 1268-1316), `src/helpers/ipcHandlers.js` (lines 7002-7080), `preload.js` (lines 800-809). |

**Flow (step-by-step)**

1. Renderer triggers `gcalStartOAuth()` → IPC `gcal-start-oauth` → `googleCalendarManager.startOAuth()` (`src/helpers/googleCalendarManager.js:75-87`) → `googleCalendarOAuth.startOAuthFlow()` (`src/helpers/googleCalendarOAuth.js:55-165`).
2. Main process generates a random PKCE `code_verifier` (43-byte URL-safe), derives `code_challenge` via SHA-256, and a random `state` (`src/helpers/googleCalendarOAuth.js:57-59`).
3. Main process spins up a one-shot loopback HTTP server on a random `127.0.0.1` port (`src/helpers/googleCalendarOAuth.js:61-127`).
4. Main process builds `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=http://127.0.0.1:PORT&response_type=code&scope=...&access_type=offline&prompt=consent&state=...&code_challenge=...&code_challenge_method=S256` and opens it via `shell.openExternal(...)` (`src/helpers/googleCalendarOAuth.js:140-152`).
5. User authorizes in browser; Google redirects to `http://127.0.0.1:PORT/?code=...&state=...`.
6. Loopback handler validates `state`, then POSTs to `https://oauth2.googleapis.com/token` with `code`, `client_id`, `client_secret`, `redirect_uri`, `grant_type=authorization_code`, `code_verifier` (`src/helpers/googleCalendarOAuth.js:167-178`).
7. Loopback handler decodes the `id_token` JWT payload (base64url-decoded second segment) to extract `email` (`src/helpers/googleCalendarOAuth.js:93-101`).
8. Loopback handler calls `databaseManager.saveGoogleTokens({ google_email, access_token, refresh_token, expires_at, scope })` to upsert into `google_calendar_tokens` (`src/helpers/googleCalendarOAuth.js:111-117`).
9. Loopback handler 302s the browser to `https://openwhispr.com/auth/desktop-callback?protocol=${OAUTH_PROTOCOL}&gcal_connected=true` (or `gcal_error=...`) — that page redirects into `${OAUTH_PROTOCOL}://?gcal_connected=true` to refocus the OpenWhispr window. Loopback server closes (`src/helpers/googleCalendarOAuth.js:118-120,131-134`).
10. 120-second outer timeout cleans up the server if the user never completes the flow (`src/helpers/googleCalendarOAuth.js:155-158`).
11. From this point on, every Calendar API request fetches a valid token via `getValidAccessToken(email)` (`src/helpers/googleCalendarOAuth.js:191-218`) which auto-refreshes when within 5 minutes of expiry.
12. Sign-out / disconnect triggers `revokeAllTokens()` (`src/helpers/googleCalendarManager.js:89-97`), which best-effort POSTs each access token to `https://oauth2.googleapis.com/revoke` and then deletes the row from `google_calendar_tokens`.

**Notes / quirks**

- **PKCE + client secret together.** Even though Google issues a "Desktop" client type which requires `client_secret`, the client also uses PKCE S256 — defense in depth.
- **Multi-account.** `google_calendar_tokens` is keyed by `google_email`; multiple accounts can be connected. `getValidAccessToken(email)` accepts an optional account filter (`src/helpers/googleCalendarOAuth.js:191-218`).
- **Refresh token preservation.** When refreshing, the original `refresh_token` is preserved (Google doesn't always return a new one). See `src/helpers/googleCalendarOAuth.js:206-212`.
- **Best-effort revoke.** `revokeToken()` swallows all errors (`src/helpers/googleCalendarOAuth.js:222-226`) — token may already be revoked or network may be unavailable. The local DB row is still deleted (`src/helpers/database.js:1302,1315`).
- **Custom-protocol channel coupling.** The bridge URL passed back to the browser embeds the active OAuth protocol scheme via `_getProtocol()` (`src/helpers/googleCalendarOAuth.js:36-39`), so a `staging` build redirects through `openwhispr-staging://` and never collides with a parallel `production` install.
- **Override for the bridge URL.** `VITE_OPENWHISPR_OAUTH_CALLBACK_URL` overrides the public bridge URL (`src/helpers/googleCalendarOAuth.js:32-34`) — useful for self-hosted installs that don't want to depend on `openwhispr.com`.

---

## Other Providers Found

A discovery sweep across `src/`, `main.js`, and `preload.js` for `oauth`, `accounts.google.com`, `appleid.apple.com`, `github.com/login/oauth`, `microsoftonline.com`, `client_id`, and `redirect_uri` returned **no other independent OAuth flows** in the desktop client.

The Apple and Microsoft sign-in buttons in `AuthenticationStep.tsx` (`src/components/AuthenticationStep.tsx:481-550`) are **not** independent OAuth flows — they invoke `signInWithSocial("apple"|"microsoft")` (`src/lib/auth.ts:173-195`), which delegates the entire OAuth round-trip to the **OpenWhispr cloud sign-in** flow documented above. The auth server (Better Auth) holds the upstream Apple / Microsoft client IDs and secrets server-side; the desktop client never sees them.

> Future additions must be documented here before Phase 4 CFG-03 (per-provider build flags) can include them. See [§ Out of Scope](#out-of-scope) for what is explicitly excluded.

---

## Token Storage Summary

| Provider | Storage backend | Path / table | Encryption at rest |
|---|---|---|---|
| OpenWhispr cloud sign-in | File on disk | `${userData}/auth-token.bin` (`src/helpers/tokenStore.js:7`) | Electron `safeStorage` (OS keychain) when available; plaintext UTF-8 fallback when no keyring (`src/helpers/tokenStore.js:32-43`). File mode `0o600`. |
| Google Calendar (per-account access + refresh tokens) | SQLite | `google_calendar_tokens` table (`src/helpers/database.js:292-303`) — columns `access_token TEXT`, `refresh_token TEXT`, `expires_at INTEGER`, `scope TEXT`, keyed by `google_email TEXT UNIQUE` | None — plaintext columns. SQLite file lives under per-channel `userData` directory. |

---

## Custom Protocol Reference

Every `${OAUTH_PROTOCOL}://` URL the desktop client knows how to receive. `${OAUTH_PROTOCOL}` resolves to `openwhispr` (production), `openwhispr-dev` (development), `openwhispr-staging` (staging), or whatever `VITE_OPENWHISPR_PROTOCOL` / `OPENWHISPR_PROTOCOL` overrides it to (`main.js:135-147`).

| URL shape | Sent by | Handler | Purpose |
|---|---|---|---|
| `${OAUTH_PROTOCOL}://?bearer_token=...` | OpenWhispr auth server (via `https://openwhispr.com/auth/desktop-callback`) | `handleOAuthDeepLink()` at `main.js:575-590` → `applySessionTokenAndRefresh()` → `tokenStore.set()` | Cloud sign-in completion. Bearer is persisted and the control panel reloads. |
| `${OAUTH_PROTOCOL}://?token=...` | Legacy auth-server builds | `handleOAuthDeepLink()` at `main.js:575-590` → `exchangeSignedTokenForRawBearer()` (`main.js:497-514`) → `tokenStore.set()` | Backward-compatible signed-cookie path; swapped for a raw bearer via `${AUTH_URL}/api/auth/get-session`. |
| `${OAUTH_PROTOCOL}://?gcal_connected=true` | Google Calendar OAuth bridge page (`https://openwhispr.com/auth/desktop-callback?protocol=...&gcal_connected=true`) | `handleOAuthDeepLink()` at `main.js:575-590` (no-op for the token; just refocuses the window). Tokens are already persisted in `google_calendar_tokens` by the loopback handler. | Refocus + UX signal that GCal connection succeeded. |
| `${OAUTH_PROTOCOL}://?gcal_error=...` | Google Calendar OAuth bridge page on error (`server_error`, `token_exchange_failed`, `no_email`, etc.) | `handleOAuthDeepLink()` at `main.js:575-590` (refocus only) | Refocus + UX signal that GCal connection failed; renderer surfaces the error via `gcal-get-connection-status` polling. |
| `${OAUTH_PROTOCOL}://upgrade-success` (substring match — full path is `${OAUTH_PROTOCOL}://...upgrade-success...`) | Marketing / upgrade flow on `openwhispr.com` after a paid-plan purchase | `handleUpgradeDeepLink()` at `main.js:592-600` — dispatches a `window` event `upgrade-success` to the control panel | Wakes the control panel and triggers an entitlements refetch. Not OAuth, but uses the same protocol scheme. |

Reception sites (both routes funnel into the handlers above):

- **macOS**: `app.on("open-url", ...)` at `main.js:457-472`.
- **Windows / Linux**: `app.on("second-instance", ...)` scans `commandLine` at `main.js:1339-1373`.

Renderer-visible IPC for protocol state:

- `getOAuthProtocolRegistered()` → `main.js:206` registration result. `preload.js:308`, `src/helpers/ipcHandlers.js:6428`.
- `getOAuthProtocol()` → currently active scheme. `preload.js:309`, `src/helpers/ipcHandlers.js:6430`.

---

## Out of Scope

- **Pluggable auth strategies** (LDAP, magic links, custom IdP plugins) — deferred to v2 per CONTEXT.md D-14. This document is **prescriptive**: it describes the contract the *current* client expects. A self-hosted v2 backend that wants to use LDAP issues a token in the same shape; the desktop client's auth surface stays unchanged.
- **Hidden / undocumented OAuth endpoints** the client does not call (admin flows, server-to-server token exchanges, webhook auth, etc.) — out of scope per CONTEXT.md D-11. The wire surface is whatever the *current* binary sends.
- **Vendor payload schemas** for Google Calendar REST API responses (events, calendar list) beyond what affects token-refresh logic — link to Google's documentation; the wire-level event payload is not part of the auth contract.
- **Live OAuth trace validation** — source-only per CONTEXT.md D-09. If a deployed auth server diverges from this spec, that is a separate bug.
- **Sample auth-server implementation** — out of scope for v1 per CONTEXT.md D-15. The spec is the deliverable; reference implementations belong in v2.
