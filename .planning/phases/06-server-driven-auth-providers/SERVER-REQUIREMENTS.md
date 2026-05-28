# Server Requirements — Server-Driven Auth Providers

**For:** openwhispr-server team (peer `mq4371mt`, repo `/Users/nick/openwhispr-server` — READ-ONLY from the client side)
**From:** openwhispr client, phase 06
**Date:** 2026-05-28
**Design ref:** `docs/superpowers/specs/2026-05-28-server-driven-auth-providers-design.md`
**Severity:** BLOCKER for the client feature (client cannot ship dynamic provider buttons without this endpoint).

---

## R-PROV-01 — New pre-auth endpoint `GET /api/auth/providers`

### Why

The client must render social sign-in buttons that mirror exactly the identity providers the **server** has configured (Google, Microsoft, Apple, and any generic-OIDC/Keycloak/Okta/etc. the operator wires into better-auth). Today the client hardcodes three providers at build time; the product requirement is that enabling a provider server-side makes its button appear client-side with no client rebuild.

The client has **no way today** to discover the server's configured provider set. This endpoint is that discovery channel.

### Expected route contract

```
GET /api/auth/providers
Auth: none (pre-auth) — same posture as POST /api/check-user
```

The client calls this **before** any session exists (on the sign-in screen mount), exactly like `POST /api/check-user`. It MUST NOT require a bearer token or session cookie, and MUST NOT return 401/403 for a well-formed request (same opt-out-of-auth-gate posture already established for `GET /api/auth/verification-status` under R21).

**Response (200):**

```json
{
  "providers": [
    { "id": "google",    "label": "Google",     "iconHint": "google" },
    { "id": "microsoft", "label": "Microsoft",  "iconHint": "microsoft" },
    { "id": "keycloak",  "label": "Company SSO", "iconHint": "generic" }
  ]
}
```

Field contract:

| field | req | type / constraint | meaning |
|-------|-----|-------------------|---------|
| `providers` | yes | array (may be empty) | the server's enabled social providers; `[]` = password-only server |
| `providers[].id` | yes | string `^[a-z0-9][a-z0-9_-]{0,31}$` | **MUST equal the better-auth provider id** consumed by the existing `/api/desktop-signin/<id>` shim — they round-trip (see R-PROV-02) |
| `providers[].label` | yes | string, ≤ 40 chars | human display name; client shows it as "Continue with {label}" |
| `providers[].iconHint` | no | `"google" \| "microsoft" \| "apple" \| "generic"` | selects a **bundled** client icon; unknown/missing → `generic`. **Client never fetches a remote icon.** |

### Current behavior

No such endpoint exists. The server does configure better-auth social providers internally, but does not expose the enabled set.

### Suggested resolution

Derive `providers` from the server's live better-auth social-provider configuration (the same config that backs `/api/desktop-signin/<id>`). Map each configured provider to `{id, label, iconHint}`. For a generic OIDC / Keycloak provider, set `id` to the better-auth provider id (e.g. `keycloak`), `label` to an operator-configurable display string (e.g. "Company SSO"), and `iconHint: "generic"`.

The list MUST be **dynamic** (reflects current config), not a static literal. If the operator disables Microsoft, the next `GET /api/auth/providers` omits it and the client's button disappears on next sign-in-screen mount.

---

## R-PROV-02 — `id` round-trip invariant with `/api/desktop-signin/<id>`

The client, on button click, calls the **existing, unchanged** deep-link:

```
${AUTH_URL}/api/desktop-signin/<id>?callbackURL=...
```

where `<id>` is taken verbatim from `providers[].id`. Therefore every `id` returned by R-PROV-01 MUST be a valid provider for the `/api/desktop-signin/` shim. A provider that appears in the list but 404s / errors on the deep-link is a contract violation.

No change to `/api/desktop-signin/` itself is requested — only the guarantee that the ids agree.

---

## R-PROV-03 — Error & empty semantics

- Well-formed request, no providers configured → `200 {"providers": []}` (NOT 404, NOT 204). The client treats `[]` as "password-only server" — a normal state.
- The endpoint MUST NOT 401/403 pre-auth.
- On server-side failure (5xx), the client degrades to email+password silently — but the server SHOULD prefer `200 {"providers": []}` over 5xx when the provider config is simply empty/unreadable, to avoid masking a misconfiguration as an outage.

---

## What is NOT being asked of the server

- No change to the bearer/token-store handshake, `set-auth-token` rotation, or the `/api/desktop-signin/<id>` flow.
- No client-side OIDC parameters — the server owns all OAuth/OIDC config. The client only needs `{id,label,iconHint}`.
- No new auth model. This is purely a **discovery** endpoint.

---

## Anti-patterns explicitly rejected (per fork rules)

- ❌ Client hardcoding a Keycloak button — rejected; the client must not know about Keycloak specifically. (Would be upstream drift + couples client to one operator's IdP.)
- ❌ Client reading provider config from a build-time env var — rejected; that's still build-time, not server-driven, and can't change without rebuild.
- ❌ Server returning remote icon URLs for the client to fetch — rejected; SSRF / remote-asset surface. `iconHint` selects a bundled icon only.
- ❌ Embedding provider secrets/client-ids in the response — rejected; secret material never reaches the client (Project Constraints).
