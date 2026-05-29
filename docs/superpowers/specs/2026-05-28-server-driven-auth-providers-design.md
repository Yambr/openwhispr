# Server-Driven Auth Providers — Design

**Date:** 2026-05-28
**Status:** Approved (design), pending implementation plan
**Author:** Claude (autonomous, on Nick's delegation)
**Milestone target:** v1.8.0+ (HOST series successor)

---

## 1. Problem

Today the OpenWhispr client decides which social sign-in buttons to show **at build time**, from three hardcoded providers:

```ts
// src/lib/auth.ts:168 (upstream-authored)
export type SocialProvider = "google" | "microsoft" | "apple";
```

and three literal JSX blocks in `AuthenticationStep.tsx` gated by `OAUTH_GOOGLE_ENABLED` / `OAUTH_APPLE_ENABLED` / `OAUTH_MICROSOFT_ENABLED` (Yambr-fork build-time literals, Rolldown-DCE'd).

The product requirement is the inverse: **the client's sign-in screen must mirror whatever the server has enabled.** If an operator turns on a Keycloak (or Okta, Authentik, GitLab, generic OIDC) provider on the server, a corresponding button must appear in the client **without rebuilding the binary**. The login surface must be identical between server and client because the server is the source of truth for which identity providers exist.

### Why this is non-trivial

`src/lib/auth.ts` and `src/components/AuthenticationStep.tsx` are **upstream-authored** (verified: both exist in `upstream/main` verbatim, including the 3-provider union, `signInWithSocial`, and the `/api/desktop-signin/<provider>` deep-link). Under the fork's `client_immutable` / `upstream_parity` rules, new logic in upstream files multiplies every future merge conflict. So the design must:

1. Put **all** new logic in **new fork-only modules**.
2. Touch upstream files with **minimal, surgical hooks** only (1–2 lines each).
3. Keep the upstream `SocialProvider` contract and deep-link flow intact as the substrate.

---

## 2. Decisions (locked with Nick before design)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Server-driven provider buttons**, each rendered dynamically from the server list, with label from server `name` + client-derived icon | Product: login surface mirrors server. *(Revised post-verification: the server models generic OIDC as a single `id:"oidc"` provider, so Keycloak appears as one "Company SSO"-style button, not a literal per-IdP `keycloak` button. This meets the goal — corporate SSO appears when enabled server-side — with zero server change.)* |
| D2 | **Single source of truth = server pre-auth endpoint.** No response / unreachable → render **email+password only**, no social buttons. **No stale cache.** | Simplicity + correctness: never show a provider the current server doesn't actually support. Offline = degraded to password auth, which always works. |
| D3 | **Lockdown (`PROVIDER_LOCKDOWN_ENABLED`) is fully decoupled from social.** Server alone decides social visibility, even in corporate-minimal builds. | Explicit product choice. **Accepted cost:** corporate-minimal bundle is no longer guaranteed free of OAuth deep-link literals; `verify-provider-lockdown.js` must be rewritten to the new invariant; Project Constraints doc must be updated. |
| D4 | **Isolation strategy:** new logic in fork-only modules; upstream files get 1–2-line integration hooks only. | Minimize upstream merge conflict surface. |

---

## 3. Architecture

### 3.1 Component boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│  UPSTREAM (immutable substrate — touched only by minimal hooks)        │
│                                                                         │
│  src/lib/auth.ts                                                        │
│    • SocialProvider  ───── widened via fork-only type, see §3.4         │
│    • signInWithSocial(provider) ── reused AS-IS for the deep-link       │
│                                                                         │
│  src/components/AuthenticationStep.tsx                                  │
│    • 3 hardcoded provider <Button> blocks  ──► REPLACED by one line:    │
│        <ServerProviderButtons onSelect={handleSocialSignIn} .../>       │
└─────────────────────────────────────────────────────────────────────┘
              │ imports                         │ renders
              ▼                                 ▼
┌──────────────────────────────┐   ┌────────────────────────────────────┐
│  FORK-ONLY: data layer        │   │  FORK-ONLY: presentation layer       │
│  src/lib/serverProviders.ts   │   │  src/components/ServerProviderButtons │
│    • useServerProviders() hook│   │    .tsx                               │
│    • fetch GET /api/auth/      │   │    • maps provider list → <Button>s   │
│      providers (pre-auth)     │   │    • generic icon + label resolver    │
│    • zod-validate, dedupe     │   │    • loading / disabled states        │
│    • returns {providers,      │   │    • known-brand icon map (google/    │
│      status: loading|ready|   │   │      microsoft/apple) + generic       │
│      error}                   │   │      fallback (KeyRound) for the rest │
└──────────────────────────────┘   └────────────────────────────────────┘
```

**Why two fork-only files (not one):** the data fetch/validation and the rendering are independently testable and have one purpose each. `serverProviders.ts` answers "what does the server allow?" with no React. `ServerProviderButtons.tsx` answers "how do we draw provider X?" with no fetch. Either can change without touching the other or the upstream files.

### 3.2 Data flow

```
AuthenticationStep mounts
   │
   ├─ useServerProviders() fires (fork-only hook)
   │     │
   │     ├─ OPENWHISPR_BACKEND_URL unset? ─► status=ready, providers=[]  (no fetch)
   │     │
   │     └─ GET ${serverUrl}/api/auth/providers   (pre-auth, no token, like /api/check-user)
   │           │
   │           ├─ 2xx + valid body ─► status=ready, providers=[{id,label,iconHint}...]
   │           ├─ non-2xx / network error / invalid body ─► status=error, providers=[]
   │           └─ (in flight) ─► status=loading
   │
   └─ render:
        email + password fields           ← ALWAYS (upstream, unchanged)
        <ServerProviderButtons>:
            status=loading ─► nothing (or a single subtle skeleton row)
            status=ready & providers.length ─► one <Button> per provider
            status=ready & empty ─► nothing
            status=error ─► nothing  (D2: degrade to password-only)
```

User clicks a provider button → `ServerProviderButtons` calls `onSelect(provider.id)` → which is the upstream `handleSocialSignIn` → upstream `signInWithSocial(id)` → existing `${AUTH_URL}/api/desktop-signin/${id}` deep-link in the browser. **The entire OAuth round-trip is unchanged** — we only changed *which ids* can reach it and *how the button is drawn*.

### 3.3 Server contract (VERIFIED against live server code 2026-05-28 — server owns this, no change requested)

`GET /api/auth/providers` — pre-auth, no token. Verified at `apps/api/src/routes/auth-providers.ts:86` (`auth:false`, rate-limited 60/min, public). Already in prod since server Phase 12; Phase 35 made it genuinely public.

**Real response shape** (`oidc-providers.ts:27-30`, `auth-providers.ts:10-11`):

```json
{
  "providers": [
    { "id": "google", "name": "Google", "enabled": true },
    { "id": "github", "name": "GitHub", "enabled": true },
    { "id": "oidc",   "name": "OIDC",   "enabled": true }
  ],
  "emailVerification": { "required": true, "configured": true }
}
```

- `id` (required): canonical provider id, **`"google" | "github" | "oidc"`** — used verbatim in `/api/desktop-signin/<id>`. Generic OIDC (Keycloak, Okta, any IdP) rides as the **single `id:"oidc"`** provider (`oidc-providers.ts:79,105`); the server models all generic OIDC as one genericOAuth registration, not per-IdP.
- `name` (required): server's display name (`"Google"`, `"GitHub"`, `"OIDC"` — or whatever the operator configures). The client uses this as the button label.
- `enabled` (always `true` in current server): the server only emits enabled providers. Client defensively filters `enabled !== true`.
- `emailVerification` (extra top-level key): consumed by the server's own onboarding wizard. **The client ignores it** (reads only `.providers`) — extra keys are harmless.
- ETag + `Cache-Control: public, max-age=60` + 304 on `If-None-Match` — the server already provides HTTP caching; the client need not add its own (and per D2 keeps no stale cache of its own).

**Client adapts to this contract** (per fork rules — server unchanged):

- **Display label** = the server's `name` (operator-configurable; for `oidc` the operator can set it to "Company SSO" via the server's env). Rendered through `auth.social.continueWith` → `"Continue with {{name}}"`, except the two legacy brands keep their exact upstream i18n labels for parity.
- **Icon** is derived **client-side from `id`** (`google`→Google icon, `github`→GitHub icon, anything else incl. `oidc`→generic `KeyRound`). The server does NOT send an icon hint — icon assets are a purely client concern, and asking the server to own them would be needless coupling (and a remote-icon path would be an SSRF surface). **The client never loads a remote icon.**

**The client requires no knowledge of Keycloak specifically** — Keycloak appears as `id:"oidc"`, a generic SSO button. The user's goal ("corporate SSO appears when enabled server-side") is met: the operator enables the OIDC triplet on the server, and the `oidc` button appears with the operator's chosen name. The earlier design assumption of a literal `id:"keycloak"` per-IdP button is dropped — it would require a server-side canonical-id change to the desktop-signin round-trip for no product gain.

### 3.4 Type strategy (keeping upstream intact)

Upstream: `export type SocialProvider = "google" | "microsoft" | "apple";`

We do **not** edit that line. Instead, fork-only `serverProviders.ts` defines:

```ts
// fork-only
export type ServerProviderId = string;            // server-driven, open set
export interface ServerProvider {
  id: ServerProviderId;
  label: string;
  iconHint: "google" | "microsoft" | "apple" | "generic";
}
```

`signInWithSocial(provider: SocialProvider)` takes a literal union upstream. To call it with an arbitrary id without editing the signature, the **minimal upstream hook** is the single safe widening of that union to `SocialProvider = "google" | "microsoft" | "apple" | (string & {})`. This is a **one-token additive change** on one upstream line — it widens, never narrows, so upstream call sites keep compiling and a future upstream merge that re-narrows it is a trivial re-apply. This union-widening is the **only guaranteed source edit to `auth.ts`**; the lockdown question (§3.5) is preferentially resolved in fork-only build-config with *zero* further `auth.ts` edits. `signInWithSocial`'s body already just interpolates `provider` into the URL — it has no per-provider branching that would break on a new id, except the `OAUTH_*_ENABLED` defensive guards covered in §3.5.

### 3.5 The defensive guards in `signInWithSocial`

`auth.ts:333-341` has per-provider guards:
```ts
if (provider === "google" && !OAUTH_GOOGLE_ENABLED) return {error:...};
if (provider === "apple"  && !OAUTH_APPLE_ENABLED)  return {error:...};
if (provider === "microsoft" && !OAUTH_MICROSOFT_ENABLED) return {error:...};
```
and the `PROVIDER_LOCKDOWN_ENABLED` early-return at the top.

Per D2/D3, server is now the gate. A server-driven id like `keycloak` hits **none** of these guards (it's not one of the three) and the lockdown guard must no longer fire. Rather than edit upstream guard logic (drift), the **fork-only data layer simply never surfaces a button the server didn't return** — so the only ids that reach `signInWithSocial` are server-approved. The upstream guards remain as a harmless defense-in-depth for the three legacy ids. The single required upstream change is removing/neutralizing the **lockdown early-return** for the social path (D3); this is documented drift, justified by the explicit product decision, and is gated behind the design's Project-Constraints update.

> **Open implementation note for the plan:** confirm whether the lockdown early-return can be neutralized via a fork-only build-config value (e.g. compile `PROVIDER_LOCKDOWN_ENABLED` to still strip BYOK/enterprise but no longer the social branch) instead of editing `auth.ts` line. Prefer the build-config route — it keeps `auth.ts` byte-identical to upstream except the type widening. This is the cleanest path and should be the plan's first task.

---

## 4. Error handling

| Condition | Behavior |
|-----------|----------|
| `OPENWHISPR_BACKEND_URL` unset | No fetch. `providers=[]`. Password-only. (Matches existing `/api/check-user` skip behavior.) |
| Network error / timeout (3 s) | `status=error`, `providers=[]`. Password-only. No toast — sign-in still works via email. |
| Non-2xx | Same as network error. |
| 2xx but body fails zod validation | `status=error`, `providers=[]`. Log a `debug`-level warning. Never render a malformed provider. |
| Duplicate ids in list | Dedupe by `id`, first wins. |
| `id` fails regex | Drop that entry, keep the rest. |
| Unknown `iconHint` | Coerce to `generic`. |
| Server URL changes at runtime (existing HOST-02 Proxy) | Hook re-fetches on `serverUrl` change (the app already reloads the renderer on serverUrl change per `auth.ts:68-91`, so a fresh mount re-runs the hook — no extra subscription needed). |

**Principle:** any failure degrades to email+password, which is always available. Social is strictly additive; its absence never blocks login.

---

## 5. Internationalization

New/changed keys in **all 10 locale dirs** (`en, es, fr, de, pt, it, ja, ru, zh-CN, zh-TW`):

- Keep existing `auth.social.completeInBrowser`, `auth.social.protocolUnavailable` (unchanged).
- Keep `continueWithGoogle/Apple/Microsoft` (still used as exact labels when `iconHint` matches a known brand, for visual parity with upstream).
- **Add** `auth.social.continueWith` = `"Continue with {{provider}}"` (interpolation) — used for any server provider whose `id` isn't a known legacy brand (e.g. `oidc` with server `name` "Company SSO" → "Continue with Company SSO").

Known-brand ids keep their exact upstream i18n labels for visual parity: `google` → `auth.social.continueWithGoogle`. The fork adds `github` handling, but since `github` isn't an upstream brand key, it renders via the `continueWith` template with the server `name` ("Continue with GitHub"). Brand names (`Google`, `GitHub`) and the operator-supplied `name` are **not** translated (per i18n rules: brand/proper names excluded). Only the surrounding template ("Continue with …", "Complete sign-in in your browser") is localized.

> Note: `microsoft`/`apple` legacy brand keys (`continueWithMicrosoft`/`continueWithApple`) remain in the locale files (still upstream) but are currently unreachable, because the real server emits only `google|github|oidc`. They stay for upstream parity and in case the server later adds those ids.

---

## 6. Server requirements — ALREADY SATISFIED (verified 2026-05-28)

**No server change is required.** `GET /api/auth/providers` already exists in prod (server Phase 12, made public in Phase 35), verified read-only against `/Users/nick/openwhispr-server`:

- `apps/api/src/routes/auth-providers.ts:86` — `auth:false`, rate-limited 60/min → genuinely public, never 401/403 for a well-formed request.
- `auth-providers.ts:61` — `listConfiguredOidcProviders(env)` → dynamic, reflects live config.
- `oidc-providers.ts:27-30,73-79,105` — shape `{id,name,enabled:true}`, id ∈ `google|github|oidc`; `oidc` round-trips with `/api/desktop-signin/oidc`.
- Empty `{"providers":[]}` is a valid 200 (password-only server).
- ETag + `Cache-Control: public, max-age=60` + 304.

The client adapts to this contract (§3.3). All other pieces (the `/api/desktop-signin/<id>` deep-link, the bearer/token-store handshake, `set-auth-token` rotation) already exist and are unchanged. See `.planning/phases/06-server-driven-auth-providers/SERVER-REQUIREMENTS.md` for the verification record (BLOCKER → satisfied).

---

## 7. Testing

- **Unit (vitest), fork-only `serverProviders.ts`:** unset backend → `[]`; happy 3-provider body → ready; malformed body → error+empty; duplicate ids → deduped; bad id regex → filtered; unknown iconHint → generic; non-2xx → error; timeout → error.
- **Unit, `ServerProviderButtons.tsx`:** renders N buttons for N providers; known brand → brand icon + brand label; unknown → generic icon + "Continue with {label}"; click → `onSelect(id)` once with the right id; loading state disables siblings.
- **Integration (existing e2e harness):** stub `GET /api/auth/providers` returning `[google, keycloak]` → assert two buttons, assert clicking Keycloak opens `…/api/desktop-signin/keycloak`. Stub a 500 → assert no social buttons, password form usable.
- **Regression:** default build with the three legacy providers returned by the server renders identically to today (visual parity).
- **Verifier rewrite:** replace `scripts/verify-provider-lockdown.js`'s social assertion with the new invariant (D3): social code MAY be present in any build; lockdown still strips BYOK/enterprise/billing/referrals. Add `scripts/verify-server-driven-providers.js` asserting the renderer contains no hardcoded provider-list literal (the list comes only from the endpoint).

---

## 8. Out of scope (YAGNI)

- No stale/offline cache of the provider list (D2).
- No per-provider client config beyond `{id,label,iconHint}` (no client-side OIDC params — better-auth on the server owns all OAuth config).
- No remote icons (bundled icons only; security).
- No reordering/grouping UI; server list order is render order.
- No change to the email/password or verification flows.

---

## 9. Upstream-merge cost summary

| File | Edit | Merge risk |
|------|------|-----------|
| `src/lib/auth.ts` | 1 line: widen `SocialProvider` union with `\| (string & {})` | trivial re-apply |
| `src/lib/auth.ts` | neutralize lockdown early-return for social — **prefer build-config route, zero source edit** (§3.5 open note) | none if build-config route taken |
| `src/components/AuthenticationStep.tsx` | replace 3 `<Button>` blocks + 3 icon defs with `<ServerProviderButtons onSelect={handleSocialSignIn} disabled=… />` | localized to one region; conflict is a clean re-replace |
| `src/config/*` (build-config gen) | decouple `OAUTH_*_ENABLED`/lockdown from social per D3 | fork-only files, no upstream overlap |
| **new** `src/lib/serverProviders.ts` | new fork-only | none |
| **new** `src/components/ServerProviderButtons.tsx` | new fork-only | none |
| `src/locales/*/translation.json` (×10) | add `auth.social.continueWith` | fork-managed, no upstream overlap historically |

Net upstream-file footprint: **one type-widening token + one button-region swap.** Everything else is fork-only or build-config.
