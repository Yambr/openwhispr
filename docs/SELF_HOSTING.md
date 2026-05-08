# Self-Hosting OpenWhispr Cloud

This document is a top-to-bottom walkthrough for an external implementer (third party / OSS contributor) who wants to stand up a drop-in compatible **OpenWhispr cloud backend**. It explains the client architecture, the authentication contract, the OAuth round-trip, and the wire format of every cloud endpoint the desktop client calls — sufficient to build a minimum viable backend without reading source code.

This file is the **human walkthrough**. Two sibling documents are the **machine-readable wire references** and are linked extensively from here:

- [`./BACKEND_SPEC.md`](./BACKEND_SPEC.md) — per-endpoint contract with method, URL, auth header, request JSON, response JSON, error semantics, and source-pointer (file:line) annotations for every cloud endpoint the client calls.
- [`./OAUTH_SPEC.md`](./OAUTH_SPEC.md) — catalogue of every OAuth integration (OpenWhispr cloud sign-in + Google Calendar) including custom-protocol channel variants and per-provider token storage.

This file is **not**:

- A reference backend implementation. No sample server code is included; the deliverable is the contract, not an implementation. A reference backend belongs in v2 or a companion repository.
- A pluggable-auth design document. The auth contract here is **prescriptive** — it describes the single contract the current desktop client expects. Alternative identity strategies (LDAP, magic-link, etc.) are explicitly out of scope; v2 work in a downstream backend project will document those.
- A specification of third-party AI APIs (OpenAI, Anthropic, Gemini, Mistral, Groq, AssemblyAI, Deepgram) or enterprise providers (AWS Bedrock, Azure OpenAI, GCP Vertex). Those are vendor-documented; the desktop client talks to them directly with user-supplied API keys (BYOK) and the self-hosted cloud has no role in the wire contract for them. See `BACKEND_SPEC.md` § Third-Party API Inventory for the call-site index.

---

## Audience and Scope

**Audience.** Self-hosters and OSS contributors building a backend that is wire-compatible with the OpenWhispr Electron desktop client. No prior familiarity with the OpenWhispr internals is assumed. Terms are defined before they are used.

**In scope.** Everything the desktop client sends to or expects from `${OPENWHISPR_API_URL}/api/...` — the OpenWhispr cloud surface — plus the OAuth sign-in round-trip whose final hop is the `openwhispr://` custom-protocol redirect into the desktop app.

**Out of scope.**

- Third-party AI APIs. The client talks to OpenAI / Anthropic / Gemini / Mistral / Groq / AssemblyAI / Deepgram directly with the user's BYOK keys. Vendor docs are authoritative.
- Enterprise BYOK providers. AWS Bedrock, Azure OpenAI, and GCP Vertex are also direct from the client.
- Hidden cloud endpoints (admin, webhooks, internal APIs) the client does not call. The wire surface is **client-driven**: whatever the current desktop binary sends.
- Live runtime trace validation. The contract is reverse-engineered from the client source tree. If a deployed cloud differs from this spec, that is a server bug, not a spec gap.
- A reference backend implementation. The spec is the deliverable; reference implementations belong in v2 / a separate companion repo.

---

## How the Client Talks to the Cloud

The OpenWhispr desktop client is an Electron app with three execution contexts:

1. **Main process** (Node.js — `main.js`, `src/helpers/*.js`). Owns the database, the OS integrations (clipboard, hotkeys, custom-protocol handler), and most cloud calls. Holds the bearer token in encrypted on-disk storage.
2. **Renderer process** (React — `src/components/*`, `src/services/*`). The UI. Talks to the cloud either directly via `fetch()` or through the main process via IPC.
3. **Preload bridge** (`preload.js`). The narrow, context-isolated surface the renderer uses to invoke main-process IPC handlers.

From the **server's** perspective, both call paths look identical: HTTPS JSON requests to `${OPENWHISPR_API_URL}/api/<path>`. The split exists for security (CORS, secret keys never leave main) and resilience (system proxy support via Electron's `net.fetch`), not because the server has to behave differently.

### Base URL

`${OPENWHISPR_API_URL}` is the cloud's base URL. It is **baked into the binary at build time** from `VITE_OPENWHISPR_API_URL` and resolved at runtime from `OPENWHISPR_API_URL` / `VITE_OPENWHISPR_API_URL` env vars or `src/dist/runtime-env.json`. An empty string disables all cloud calls — useful for fully-offline builds.

> Forward link: in Phase 3 (CFG-04 of this fork's roadmap) the renderer-time and runtime resolution will be unified under a single env variable named `OPENWHISPR_BACKEND_URL`. For v1, the current `OPENWHISPR_API_URL` resolution chain is the contract.

### Transport

- **HTTPS only.** The client never strips or rewrites the URL scheme. Plaintext HTTP is unsupported.
- **Content-Type:** `application/json; charset=utf-8` for POST / PUT / DELETE bodies, with two exceptions:
  - `POST /api/transcribe` — `multipart/form-data` (audio upload).
  - `POST /api/agent/stream` — streams `application/x-ndjson` from the server to the client.

### Custom protocol

`openwhispr://` is registered with the OS as a default protocol client. The cloud uses it to send the user's browser back into the desktop app after sign-in completes. There are three channel variants — `openwhispr` (production), `openwhispr-dev` (development), `openwhispr-staging` (staging) — and the cloud must build the redirect URL using the matching channel scheme. See [OAuth Flow Walkthrough](#oauth-flow-walkthrough) below and [`OAUTH_SPEC.md` § Conventions](./OAUTH_SPEC.md#conventions).

> See `BACKEND_SPEC.md` § Conventions and § Custom Protocol Redirect for full per-endpoint detail.

---

## Required Endpoints

The current desktop client calls 19 distinct OpenWhispr cloud endpoints plus a generic passthrough channel. A minimum-viable backend must implement at least the three pre-auth / auth-lifecycle endpoints (`/api/check-user`, `/api/auth/verification-status`, `/api/auth/delete-account`) for sign-in to work end-to-end; everything else is optional and gracefully degrades client-side when missing or 5xx.

For full per-endpoint detail (request/response examples, error semantics, source-pointers), each subsection below cross-links to the corresponding card in [`./BACKEND_SPEC.md`](./BACKEND_SPEC.md). The walkthrough here restates the contract in narrative form.

> The complete error-code table the client honors is documented once in [`BACKEND_SPEC.md` § Global Error Envelope](./BACKEND_SPEC.md#global-error-envelope). Every endpoint inherits it unless its card calls out a deviation. Key codes: `200`/`401`/`503`/network — see § Authentication Contract and § Edge Cases below.

### Auth lifecycle endpoints (must implement)

#### `POST /api/check-user`

**When and why.** Called once per onboarding email-entry submit. The desktop pre-checks whether the email already exists so it can route the user to the sign-in vs. sign-up branch. If the cloud is unreachable, the client falls through to the sign-up branch.

**Method + URL.** `POST ${OPENWHISPR_API_URL}/api/check-user` — pre-auth, no bearer token.

**Request body.**
```json
{ "email": "user@example.com" }
```

**Response body (success).**
```json
{ "exists": true }
```

**Status codes.**
- `200` — client reads `data.exists` (boolean). Anything else is ignored.
- non-2xx — client treats as "user does not exist" and routes to sign-up. The body is ignored.

#### `GET /api/auth/verification-status`

**When and why.** Polled every 5 seconds by the email-verification onboarding step until the user clicks the verification link. Stops on success, on a 4xx auth failure, or on unmount.

**Method + URL.** `GET ${OPENWHISPR_API_URL}/api/auth/verification-status?email=<urlencoded>` — uses the session cookie via `credentials: "include"`; the renderer-direct path does not attach the bearer token here.

**Request body.** None (`GET`); email is a query parameter.

**Response body (success).**
```json
{ "verified": true }
```

**Status codes.**
- `200` with `verified: true` — client clears its 5 s polling timer, displays a brief success message, and advances onboarding after ~1.2 s.
- `200` with `verified: false` — client keeps polling.
- `400` or `401` — client stops polling and surfaces a localized "session expired" error to the user.
- Network error — silently swallowed and retried on the next 5 s tick.

#### `DELETE /api/auth/delete-account`

**When and why.** Called from the settings panel "Delete Account" action. Permanently deletes the signed-in user from the cloud. Renderer-direct (no IPC bridge); attaches only the session cookie via `credentials: "include"` — does **not** send the bearer header.

**Method + URL.** `DELETE ${OPENWHISPR_API_URL}/api/auth/delete-account`.

**Request body.** None.

**Response body (success).**
```json
{}
```

The client only checks `res.ok`. The body is ignored.

**Status codes.**
- `2xx` — success. Client clears local token + cookie state and signs the user out.
- non-2xx — client reads `data.error` from the body if present, else surfaces `"Failed to delete account"`.

> Pointer: see [`BACKEND_SPEC.md` § `DELETE /api/auth/delete-account`](./BACKEND_SPEC.md#delete-apiauthdelete-account).

### Operational / quota endpoints (recommended)

These are called by the active client at runtime. A minimum-viable backend can stub them as no-ops (returning empty 200 bodies or 503) for first-launch testing, but full functionality requires them. Wire detail and response shapes live in [`BACKEND_SPEC.md`](./BACKEND_SPEC.md).

| Endpoint | Purpose | Auth | Cross-link |
|---|---|---|---|
| `GET /api/health` | Liveness probe with 3 s timeout. Used by streaming code paths to fail fast before opening a WebSocket. Body unread; client only inspects `res.ok` and `res.status`. | none | [card](./BACKEND_SPEC.md#get-apihealth) |
| `POST /api/transcribe` | Cloud Whisper transcription. `multipart/form-data` upload of one audio chunk; returns `{ text, wordsUsed, wordsRemaining, plan, limitReached, sttProvider, sttModel, ... }`. **Quota deviation:** the server signals quota exhaustion at HTTP 200 with `limitReached: true` rather than a 4xx. | Bearer (cookie fallback) | [card](./BACKEND_SPEC.md#post-apitranscribe) |
| `POST /api/reason` | Cloud LLM reasoning ("cleanup / agent processing" of a transcript). Returns `{ text, model, provider, promptMode, matchType }`. | Bearer (cookie fallback) | [card](./BACKEND_SPEC.md#post-apireason) |
| `POST /api/agent/stream` | Streaming agent response. Server returns `application/x-ndjson` (newline-delimited JSON events). | Bearer | [card](./BACKEND_SPEC.md#post-apiagentstream) |
| `POST /api/agent/web-search` | Server-side web-search tool used by the agent. | Bearer | [card](./BACKEND_SPEC.md#post-apiagentweb-search) |
| `POST /api/streaming-usage` | Reports streaming-session usage to the server. | Bearer | [card](./BACKEND_SPEC.md#post-apistreaming-usage) |
| `GET /api/usage` | Reads the user's quota / plan info. | Bearer | [card](./BACKEND_SPEC.md#get-apiusage) |
| `GET /api/stt-config` | Server-side STT configuration (provider/model selection, etc.). | Bearer | [card](./BACKEND_SPEC.md#get-apistt-config) |
| `GET /api/note-recording-config` | Server-side note-recording configuration. | Bearer | [card](./BACKEND_SPEC.md#get-apinote-recording-config) |
| `POST /api/streaming-token` | Mints a short-lived AssemblyAI streaming token (server-side proxy of the AssemblyAI key). | Bearer | [card](./BACKEND_SPEC.md#post-apistreaming-token) |
| `POST /api/deepgram-streaming-token` | Mints a Deepgram streaming token. | Bearer | [card](./BACKEND_SPEC.md#post-apideepgram-streaming-token) |
| `POST /api/openai-realtime-token` | Mints an OpenAI Realtime token. | Bearer | [card](./BACKEND_SPEC.md#post-apiopenai-realtime-token) |
| `POST /api/stripe/checkout` | Creates a Stripe Checkout session for upgrade. | Bearer | [card](./BACKEND_SPEC.md#post-apistripecheckout) |
| `POST /api/stripe/portal` | Creates a Stripe Customer Portal session. | Bearer | [card](./BACKEND_SPEC.md#post-apistripeportal) |
| `POST /api/stripe/switch-plan` | Switches the user's active plan. | Bearer | [card](./BACKEND_SPEC.md#post-apistripeswitch-plan) |
| `POST /api/stripe/preview-switch` | Previews proration for a plan switch. | Bearer | [card](./BACKEND_SPEC.md#post-apistripepreview-switch) |
| `GET /api/referrals/stats` | Reads the user's referral stats. | Bearer | [card](./BACKEND_SPEC.md#get-apireferralsstats) |
| `POST /api/referrals/invite` | Sends a referral invite. | Bearer | [card](./BACKEND_SPEC.md#post-apireferralsinvite) |
| `GET /api/referrals/invites` | Lists outstanding referral invites. | Bearer | [card](./BACKEND_SPEC.md#get-apireferralsinvites) |

### Generic passthrough: `cloud-api-request`

The renderer can ask the main process to proxy any `${OPENWHISPR_API_URL}/api/<path>` request through `proxyFetch()`. New endpoints added to the cloud can be exercised this way without adding a dedicated IPC handler. The error envelope is read as `data.error` (or, for nested errors, `data.error.message`). See [`BACKEND_SPEC.md` § Generic passthrough](./BACKEND_SPEC.md#generic-passthrough-cloud-api-request).

---

## Authentication Contract

This section describes the **exact** authentication contract the desktop client expects. It is **prescriptive**, not pluggable. Treat every requirement here as a hard MUST for a wire-compatible backend.

### Token format

The client expects a single **opaque bearer token string**. Format and signing are server-defined; the client never inspects the token contents. Persistence and lifecycle are described below.

After the OAuth round-trip completes, every authenticated cloud request from the **main process** attaches the token as:

```
Authorization: Bearer <token>
```

In addition, on every authenticated call, the main process attaches a `Cookie:` header populated from Electron's `session.cookies` jar (scoped to `${OPENWHISPR_API_URL}` and the auth host). This cookie attachment is a **fallback** for two cases: (a) the brief window during boot before the one-time cookie→bearer migration has run, and (b) older sessions where cookies were not URL-scoped.

The renderer's renderer-direct calls (`/api/check-user`, `/api/auth/verification-status`, `DELETE /api/auth/delete-account`) use `credentials: "include"` — they rely on the cookie jar, not the bearer header.

A custom header `x-openwhispr-source: desktop` is sent on Better Auth client calls so the server can distinguish desktop traffic from web traffic. Servers may key feature flags on this but should not require it for basic auth correctness.

> See [`BACKEND_SPEC.md` § Conventions](./BACKEND_SPEC.md#conventions) for the canonical row.

### Sign-in response payload (custom-protocol redirect)

The desktop client does **not** poll for the token after opening the browser. Instead, the cloud signals completion by **redirecting the user's browser to a custom-protocol URL** that carries the token as a query parameter:

```
${PROTOCOL}://?bearer_token=<opaque-token>
```

`${PROTOCOL}` is the channel-scoped scheme — `openwhispr`, `openwhispr-dev`, or `openwhispr-staging` (see [Custom Protocol Channel Variants](#custom-protocol-channel-variants) below). The cloud receives the active channel from the desktop in the OAuth-initiation request's `callbackURL` query parameter; the redirect MUST echo the same scheme back.

For backwards compatibility with builds that stored the session as a signed cookie, the cloud MAY redirect with `?token=<signed-cookie>` instead. When the desktop receives `?token=...` (no `bearer_token`), it POSTs `${AUTH_URL}/api/auth/get-session` to swap the signed cookie for a raw bearer; new self-hosted backends should only emit `?bearer_token=...`.

The actual two-leg redirect chain typically looks like:

```
${AUTH_URL}/api/desktop-signin/{provider}
   → 302 → upstream IdP (Google / Microsoft / Apple / your own)
   → 302 → ${AUTH_URL}/api/auth/callback/{provider}
   → 302 → https://openwhispr.com/auth/desktop-callback?protocol=<scheme>&bearer_token=<token>
   → 302 → <scheme>://?bearer_token=<token>
```

A self-hosted backend can collapse the public callback page (`https://openwhispr.com/auth/desktop-callback`) into its own domain, as long as the **final redirect** is to `<scheme>://?bearer_token=<token>`. The desktop only cares about the last hop.

> See [`OAUTH_SPEC.md` § OpenWhispr Cloud Sign-In](./OAUTH_SPEC.md#openwhispr-cloud-sign-in) for the full per-step trace.

### Token storage

The desktop client persists the bearer token via `tokenStore.js` to `${userData}/auth-token.bin`, encrypted with Electron `safeStorage` when the OS keyring is available (Keychain on macOS, DPAPI on Windows, libsecret on Linux). On Linux without a keyring, storage falls back to plaintext. The file is mode `0o600`.

**Server-side implication.** Bearer tokens are written to disk and reused across app launches. The token must therefore be **long-lived enough to survive between launches**, OR the server must support implicit refresh (see below). There is no client-initiated `POST /token` refresh endpoint.

### Token refresh / 401 handling

Two refresh mechanisms exist, both server-driven:

1. **Implicit refresh on every Better Auth call.** The Better Auth client invokes a small set of internal endpoints (e.g., `${AUTH_URL}/api/auth/get-session`). If any response carries a `set-auth-token` response header, the desktop persists that header value as the new bearer token. The server can therefore rotate tokens transparently at any time by setting this header on any auth-client response.

2. **`withSessionRefresh()` retry-once-with-backoff on 401.** When an authenticated call returns 401, the renderer's `withSessionRefresh()` wrapper tries the call again up to 6 times with exponential backoff (starting ~500 ms) — but **only** if the failure occurred within 60 seconds of last sign-in (the "grace period"). Outside that window, a 401 is final and surfaces as `AUTH_EXPIRED`.

**Server requirement.** Return HTTP `401` whenever the token is invalid or expired. Do **not** return 200 with an error body for auth failures — the renderer relies on the `401` status code to trigger refresh / re-sign-in.

A 503 is treated as a transient server error: the call returns `{ success: false, error, code: "SERVER_ERROR" }`. The renderer does **not** auto-retry on 503; the user re-issues the action.

### Account deletion

After a successful `DELETE /api/auth/delete-account` (any 2xx status), the client clears its local bearer (`tokenStore.clear()`), wipes the cookie jar entries scoped to the auth and API hosts, and signs the user out of Better Auth locally. The body of the response is ignored. On non-2xx, the client surfaces `data.error` if present, else `"Failed to delete account"`.

---

> **A note on alternative identity providers.** v2 LDAP / alternative identity providers should issue a token in the **same shape** (opaque bearer string delivered via the `${PROTOCOL}://?bearer_token=...` custom-protocol redirect) so the client's auth surface stays unchanged. This document does not enumerate alternative auth strategies; it prescribes the single contract the current client requires.

---

## OAuth Flow Walkthrough

This section restates the OpenWhispr cloud sign-in OAuth flow from [`OAUTH_SPEC.md`](./OAUTH_SPEC.md) in narrative form, step by step. The desktop client never embeds an upstream-provider client ID (Google / Apple / Microsoft / your own IdP) — those live server-side at the auth shim. The desktop's only "client identity" on the wire is the `x-openwhispr-source: desktop` header and the bearer token after sign-in.

1. **User clicks "Sign In" in the desktop app.** Either through one of the social-provider buttons (Google / Microsoft / Apple) on the onboarding `AuthenticationStep` screen, or through the email/password form. Social-button flow is described here; email/password flow uses Better Auth's standard sign-in over the same backend.

2. **Renderer asks main for the active custom-protocol scheme** via the `get-oauth-protocol` IPC channel. It receives `openwhispr` / `openwhispr-dev` / `openwhispr-staging` depending on the build channel.

3. **Renderer builds the sign-in URL** of the form:
   ```
   ${AUTH_URL}/api/desktop-signin/{provider}?callbackURL=${DESKTOP_OAUTH_CALLBACK_URL}?protocol={scheme}
   ```
   where `${AUTH_URL}` defaults to `https://auth.openwhispr.com` (overridable at build time via `VITE_AUTH_URL` / runtime via `AUTH_URL`) and `${DESKTOP_OAUTH_CALLBACK_URL}` is the public callback page (`https://openwhispr.com/auth/desktop-callback`). For a self-hosted backend, both can point at your own domain.

4. **App opens that URL in the OS default browser** via `shell.openExternal()` / `openExternalLink()`. No embedded webview is used — Better Auth's `state` cookie has to land in the user's real browser jar.

5. **Cloud handles the upstream OAuth round-trip.** This step is entirely server-side. Whatever IdP the implementer chooses (Google, Microsoft, Apple, GitHub, an in-house identity provider, email/password, magic link — anything) lives behind `/api/desktop-signin/{provider}` on the auth host. The desktop neither knows nor cares which IdPs exist.

6. **Cloud redirects the browser to the custom-protocol URL.** The final hop in the redirect chain is:
   ```
   ${PROTOCOL}://?bearer_token=<token>
   ```
   The cloud must use the protocol scheme it received in step 3's `callbackURL` query param. Using the wrong scheme means the redirect never reaches the app.

7. **OS hands the URL to the desktop app** via the registered protocol handler:
   - macOS: `app.on("open-url")` fires.
   - Windows / Linux: a second app instance is spawned with the URL on `process.argv`; the running instance intercepts via `app.on("second-instance")`.

8. **Main process parses the URL** with `handleOAuthDeepLink(url)`, extracts `bearer_token` (or `token=...` for legacy signed-cookie builds — main exchanges that via `${AUTH_URL}/api/auth/get-session` for a raw bearer), and calls `applySessionTokenAndRefresh(...)`.

9. **Renderer persists the token via `tokenStore.js`** (encrypted on-disk via `safeStorage` when the OS keyring is available). The control panel reloads with the bearer attached to subsequent cloud requests.

10. **For sign-up flows, the email-verification step polls `GET /api/auth/verification-status?email=...`** every 5 seconds until the cloud returns `{ verified: true }` (the user clicked the verification link in their email).

### Custom Protocol Channel Variants

The desktop client's protocol scheme is **channel-scoped** so dev / staging / production builds can coexist on the same machine without their custom-protocol registrations colliding.

| Build channel | Protocol scheme | Selected by |
|---|---|---|
| Production | `openwhispr://` | Default channel |
| Development | `openwhispr-dev://` | `OPENWHISPR_CHANNEL=development` / `VITE_OPENWHISPR_CHANNEL=development` |
| Staging | `openwhispr-staging://` | `OPENWHISPR_CHANNEL=staging` / `VITE_OPENWHISPR_CHANNEL=staging` |
| Override | any string | `VITE_OPENWHISPR_PROTOCOL` / `OPENWHISPR_PROTOCOL` (highest priority) |

The cloud receives the channel scheme in the OAuth-initiation request's `callbackURL` query parameter (step 3 above). **Self-hosted backends MUST echo the received scheme back** in the final redirect (step 6). Hard-coding `openwhispr://` will break dev and staging builds.

> See [`OAUTH_SPEC.md` § Custom Protocol Reference](./OAUTH_SPEC.md#custom-protocol-reference) for the full table of `<scheme>://` URLs the client knows how to receive (`?bearer_token=`, `?token=`, `?gcal_connected=`, `?gcal_error=`, `upgrade-success`).

### Google Calendar

A self-hosted OpenWhispr cloud has **no role** in the Google Calendar OAuth flow — that flow is between the desktop client and Google directly, using a Google OAuth Desktop client ID embedded in the desktop binary. The client uses PKCE + `client_secret` (defense in depth, matching Google's Desktop client requirements), with token storage in a local SQLite table (`google_calendar_tokens`). Refresh-on-expiry uses Google's standard OAuth token endpoint. Revocation calls Google directly.

For full detail (authorization endpoint, scopes, token endpoint, redirect URI, refresh trigger, token storage DDL), see [`OAUTH_SPEC.md` § Google Calendar](./OAUTH_SPEC.md#google-calendar).

The only thing a self-hosted backend has to do for Google Calendar is **not** interfere with it: the client opens `accounts.google.com` directly in the OS browser and listens on a loopback port for the redirect. No traffic flows through `${OPENWHISPR_API_URL}` for this flow.

---

## Minimum Viable Backend Checklist

A first-pass implementation that lets the desktop client sign in, transcribe, and reason against your backend:

- [ ] HTTPS endpoint serving `${OPENWHISPR_API_URL}/api/...` (your backend's base URL becomes the value of the `VITE_OPENWHISPR_API_URL` build env var when packaging the desktop client).
- [ ] Implements `POST /api/check-user` per [BACKEND_SPEC](./BACKEND_SPEC.md#post-apicheck-user).
- [ ] Implements `GET /api/auth/verification-status` per [BACKEND_SPEC](./BACKEND_SPEC.md#get-apiauthverification-status).
- [ ] Implements `DELETE /api/auth/delete-account` per [BACKEND_SPEC](./BACKEND_SPEC.md#delete-apiauthdelete-account).
- [ ] Hosts `${AUTH_URL}/api/desktop-signin/{provider}` as the OAuth shim that initiates the upstream IdP round-trip.
- [ ] Final redirect at the end of the OAuth round-trip is to `${PROTOCOL}://?bearer_token=<token>` using the protocol scheme received in `callbackURL`'s query param. Honors all three channel variants (`openwhispr` / `openwhispr-dev` / `openwhispr-staging`) plus any override.
- [ ] Returns HTTP `401` (not 200 with an error body) on invalid or expired tokens, so the client's `withSessionRefresh()` retry-once-with-backoff path triggers correctly.
- [ ] Honors the global error envelope `{ "error": "<human-readable string>" }` for non-2xx responses (see [BACKEND_SPEC § Global Error Envelope](./BACKEND_SPEC.md#global-error-envelope)).
- [ ] Accepts `Authorization: Bearer <opaque-token>` for authenticated calls. May also accept session cookies as a fallback (the client's main-process call path attaches both).
- [ ] Tokens issued at the end of OAuth are long-lived enough to survive desktop relaunches, OR a `set-auth-token` response header is emitted on any Better Auth call to rotate the bearer transparently.
- [ ] Implements `POST /api/transcribe` (multipart/form-data, returns `{ text, wordsUsed, wordsRemaining, plan, limitReached, ... }`) for transcription functionality. Quota exhaustion is signalled at HTTP 200 with `limitReached: true`, **not** via a 4xx.
- [ ] Implements `POST /api/reason` for cloud LLM reasoning (returns `{ text, model, provider, promptMode, matchType }`).
- [ ] Implements `GET /api/health` (3-second timeout — return any 2xx; body is unread).
- [ ] Implements remaining endpoints from [`BACKEND_SPEC.md` § OpenWhispr Cloud Endpoints](./BACKEND_SPEC.md#openwhispr-cloud-endpoints) as needed: `/api/agent/stream` (NDJSON), `/api/agent/web-search`, `/api/streaming-usage`, `/api/usage`, `/api/stt-config`, `/api/note-recording-config`, `/api/streaming-token`, `/api/deepgram-streaming-token`, `/api/openai-realtime-token`, `/api/stripe/{checkout,portal,switch-plan,preview-switch}`, `/api/referrals/{stats,invite,invites}`. Stub-as-503 is acceptable for first-launch testing; missing endpoints surface as user-visible errors but do not crash the app.

---

## Edge Cases and Quirks

These are the client-observable behaviors a backend implementer needs to be aware of. Most are documented in detail in [`BACKEND_SPEC.md`](./BACKEND_SPEC.md); this is a checklist of "things that bit early integrators."

- **Email-verification polling cadence.** `GET /api/auth/verification-status` is hit every 5 seconds while the verification screen is mounted. Do not rate-limit it under that cadence per-user. See [BACKEND_SPEC § `/api/auth/verification-status`](./BACKEND_SPEC.md#get-apiauthverification-status) and the EmailVerificationStep notes.
- **`withSessionRefresh()` retry-once-with-backoff on 401.** The client retries a 401-failing call up to 6 times with exponential backoff if the failure is within 60 seconds of last sign-in. Outside that window, 401 is final. Non-401 errors are not retried.
- **Channel-specific protocol scheme.** Building the redirect URL with the wrong scheme (e.g., emitting `openwhispr://` to a `-dev` build) means the OS dispatches the URL to the wrong app — or to nothing at all if the production app is not installed. Always echo the scheme from the incoming `callbackURL`.
- **`/api/transcribe` quota exhaustion at HTTP 200.** When the user has exhausted their plan, the server returns `200` with `limitReached: true`. The client surfaces a quota-exhaustion UI. **Do not** return a 4xx in this case.
- **Server-streamed NDJSON for `/api/agent/stream`.** Response Content-Type is `application/x-ndjson`. Each line is one JSON event. Do not buffer the response — flush after every line.
- **Cloud unreachable behavior.** If `OPENWHISPR_API_URL` is unset or the cloud is unreachable, the client gracefully degrades:
  - `/api/check-user` failure → routes to the sign-up branch.
  - `/api/health` failure → streaming code paths surface a localized "offline" message.
  - All other calls → surface a generic "API error" message; the user re-issues the action.
- **HTTPS required.** The client never strips or rewrites the URL scheme. Plaintext HTTP backends are unsupported.
- **Cookie jar is auth-host scoped.** Electron's `session.cookies` jar is queried for both `${OPENWHISPR_API_URL}` and `${AUTH_URL}`. If your auth shim is on a different host than your API base URL, both must be reachable and both can set cookies.
- **Renderer-direct vs. main-proxied calls have slightly different auth attachment.** The three pre-auth / lifecycle endpoints (`/api/check-user`, `/api/auth/verification-status`, `DELETE /api/auth/delete-account`) call from the renderer with `credentials: "include"` — only the cookie jar is attached, not the bearer header. Every other endpoint goes through the main process via `proxyFetch()` and attaches `Authorization: Bearer ...` plus the cookie fallback. Servers should accept either auth path.

---

## Cross-References

- [`./BACKEND_SPEC.md`](./BACKEND_SPEC.md) — Full per-endpoint contract with method, URL, auth header, request JSON, response JSON, error semantics, and source-pointer (file:line) annotations for every cloud endpoint the client calls. The drift-detection authority: `git grep` against the cited paths to detect contract drift.
- [`./OAUTH_SPEC.md`](./OAUTH_SPEC.md) — Per-provider OAuth catalogue. Includes the full OpenWhispr cloud sign-in flow trace, the Google Calendar PKCE flow, the Token Storage Summary, and the Custom Protocol Reference enumerating every `${PROTOCOL}://` URL the client knows how to receive.
- [`../.planning/REQUIREMENTS.md`](../.planning/REQUIREMENTS.md) — Yambr fork v1 requirements; this document satisfies **DOC-03**.
- [`../.planning/ROADMAP.md`](../.planning/ROADMAP.md) — Phase 1 success criteria; this document jointly satisfies criteria 1 / 2 / 3 with `BACKEND_SPEC.md` and `OAUTH_SPEC.md`.

---

## Future Work (out of scope for v1)

- **Reference backend implementation.** A working sample server stub is explicitly not part of this repo. It belongs in v2 / a separate companion repository, where it can be tested, versioned, and updated independently of the desktop client.
- **Pluggable auth strategies (LDAP, magic links, SAML, custom IdP integration docs).** Out of scope. v1 prescribes the single bearer-token-via-protocol-redirect contract the current client requires. Pluggability docs belong in the downstream backend project's v2 milestones — provided that project's identity provider issues a token in the same shape, the desktop client's auth surface stays unchanged.
- **Live runtime trace validation.** This spec is reverse-engineered from source, not from runtime traces. If drift between client expectations and a deployed cloud is suspected later, capture-and-diff tooling could be added as a v1.x patch or v2 prereq. Not a Phase 1 deliverable.
- **OpenAPI / JSON Schema machine-readable spec.** Not adopted for v1. The deliverables are markdown tables + JSON examples. A future enhancement could generate machine-readable artifacts from the existing endpoint cards if v2 wants typed client / server stubs.
- **Hidden / undocumented OpenWhispr cloud endpoints** (admin, webhooks, internal APIs the current desktop client does not call). Out of scope. The wire surface this spec describes is **client-driven**: a v2 backend only needs to satisfy what the current desktop binary sends.

---

## Phase 3 Smoke Checklist

This checklist verifies that a default `npm run build` (no `OPENWHISPR_*` env vars set) produces a binary whose network behavior is byte-for-byte identical to the pre-Phase-3 Yambr fork. Use it as the manual second tier of the parity proof — `npm run verify:parity` is the mechanical first tier (source-level grep gate); this checklist is the runtime-level confirmation that the resolved values reach the wire.

A maintainer publishing a build with custom env values should also run the checklist with the customised expected URLs (see [Custom-build smoke (optional)](#custom-build-smoke-optional) below) to confirm their overrides are being honoured.

### Default-build flows

| Flow | Action | Expected outcome | CONFIG_INVENTORY rows |
|------|--------|------------------|-----------------------|
| Sign-in (email) | Build with no env vars; launch; click "Sign in" → "Continue with Email" | Browser navigates to `https://auth.openwhispr.com/api/auth/...` | rows 1, 2, 3 (`OPENWHISPR_AUTH_URL` × 3 sites) |
| Sign-in (Google social) | From the sign-in screen, click "Continue with Google" | Browser opens `https://accounts.google.com/o/oauth2/v2/auth?...` and (after consent) lands on `https://openwhispr.com/auth/desktop-callback?protocol=openwhispr&...` | rows 7, 8, 10, 16 (desktop callback + Google auth URL + protocol scheme) |
| Calendar OAuth | Settings → Integrations → "Connect Google Calendar" → grant scopes | Token exchange POSTs to `https://oauth2.googleapis.com/token`; calendar list GET is `https://www.googleapis.com/calendar/v3/users/me/calendarList` | rows 11, 13 (Google token URL + Calendar API base) |
| Transcription (cloud OpenAI) | Set OpenAI key in Settings; record a 2-second clip; observe debug log | Outbound POST to `https://api.openai.com/v1/audio/transcriptions` | rows 17, 21 (OpenAI base × registry + constants) |
| Transcription (Groq) | Switch transcription provider to Groq; record a 2-second clip | Outbound POST to `https://api.groq.com/openai/v1/audio/transcriptions` | rows 18, 23 (Groq base × registry + constants) |
| MCP UI | Open Settings → Integrations → MCP card | Card displays `https://mcp.openwhispr.com/mcp`; "Copy" places the same URL on the clipboard | row 9 (`OPENWHISPR_MCP_URL`) |
| Custom protocol | After build, inspect the packaged Info.plist (macOS) or registry (Windows) | `CFBundleURLSchemes` (macOS) / Registered URL handlers (Windows) include `openwhispr://` | row 16 (`OPENWHISPR_OAUTH_PROTOCOL_SCHEME`) |

In addition to the seven flows, confirm the **webRequest pattern check**: with `OPENWHISPR_LOG_LEVEL=debug`, the main-process startup log should record the `session.defaultSession.webRequest.onBeforeSendHeaders` filter being registered with `https://api.openwhispr.com/*` (the default value of `OPENWHISPR_BACKEND_URL_PATTERN`). This is the byte-identical proof of the Plan 2 split between `OPENWHISPR_BACKEND_URL` (default `""`) and `OPENWHISPR_BACKEND_URL_PATTERN` (default `https://api.openwhispr.com/*`).

### How to inspect URLs without instrumenting

You should not need to add `console.log` calls or attach a debugger to verify any of the rows above. Use the existing surfaces:

- **Debug logger.** Set `OPENWHISPR_LOG_LEVEL=debug` in the project root `.env` (or the launched user-data `.env`) before starting the binary. The main-process logger already records auth URL resolution, transcription endpoint construction, OAuth redirect targets, and webRequest filter registration. Logs land in the platform's app data directory (see `docs/ARCHITECTURE.md` for paths).
- **macOS protocol registration.** Inspect the packaged `Info.plist` directly:
  ```bash
  defaults read "$(find dist -name '*.app' -maxdepth 3 | head -1)/Contents/Info.plist" CFBundleURLTypes
  ```
  Look for a dictionary entry whose `CFBundleURLSchemes` array contains `openwhispr` (default) or your override.
- **Network-level inspection.** When the debug log isn't sufficient (rare), run the binary behind Charles Proxy / mitmproxy / mitmweb. Trust the proxy's CA in the system keychain so TLS interception works for the OpenWhispr cloud endpoints.

### Custom-build smoke (optional)

To prove a custom-env build also routes to the configured endpoints, repeat the seven flows above with overrides applied at build time. Example:

```bash
OPENWHISPR_AUTH_URL=https://auth.example.com \
OPENWHISPR_BACKEND_URL=https://api.example.com \
OPENWHISPR_BACKEND_URL_PATTERN="https://api.example.com/*" \
OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL=https://example.com/auth/desktop-callback \
OPENWHISPR_MCP_URL=https://mcp.example.com/mcp \
OPENWHISPR_OAUTH_RESET_PASSWORD_URL=https://example.com/reset-password \
OPENWHISPR_OAUTH_PROTOCOL_SCHEME=examplecorp \
OPENWHISPR_LOG_LEVEL=debug \
CSC_IDENTITY_AUTO_DISCOVERY=false \
npm run pack
```

Expected behaviour, flow by flow:

- Email and Google sign-in → traffic goes to `auth.example.com` (no `auth.openwhispr.com` in the debug log).
- Desktop callback → `https://example.com/auth/desktop-callback?protocol=examplecorp&...`.
- Reset password → `https://example.com/reset-password`.
- MCP UI → card displays `https://mcp.example.com/mcp`.
- webRequest filter → main-process startup log records the filter registered with `https://api.example.com/*` (proves `OPENWHISPR_BACKEND_URL_PATTERN` flowed through; CONFIG_INVENTORY row 5).
- Custom protocol → `CFBundleURLSchemes` contains `examplecorp`, NOT `openwhispr`.

If any of these fail, run `npm run verify:parity` first — a leaked literal will both fail the gate and corrupt the runtime override path.

