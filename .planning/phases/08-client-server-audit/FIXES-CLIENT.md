# Client-Side Fixes

Issues from `COMPATIBILITY-MATRIX.md` where the cheapest correction is on the Electron client.

---

## F1. Migrate `/api/health` → `/livez`

- **Client file:line**: `src/helpers/ipcHandlers.js:3514`
- **What it does now**: `GET ${apiUrl}/api/health` for the pre-streaming probe; reads only `res.ok`.
- **What it should do**: `GET ${apiUrl}/livez` per server probe contract. Server returns `200 { status: "ok" }` with no rate-limit and no auth. The current `/api/health` route emits a `Deprecation` header and `Link: </livez>; rel="successor-version"` (see SERVER-ROUTES.md #52).
- **Severity**: LOW (back-compat alias still works; will fail only when server team eventually deletes `/api/health`).
- **Effort**: TRIVIAL (single string change).

## F2. `openai-realtime-token` request/response mismatch

- **Client file:line**: `src/helpers/ipcHandlers.js:4163`
- **What it does now**: Sends `POST /api/openai-realtime-token` with body `{ model, language, streams }` and reads response as `{ clientSecret }` (single) or `{ clientSecrets: [...] }` (dual-stream).
- **What it should do**: According to `SERVER-ROUTES.md` #38, the server accepts **no request body** and returns `{ token: string }`. Client must either:
  - (a) Adapt to read `data.token` (rename mapping at parse site), and drop the dual-stream code path entirely until server supports it; OR
  - (b) Push server to extend the contract (see `SERVER-GAPS.md` S1) — preferred if dual-stream is a desktop feature requirement.
- **Severity**: HIGH (realtime streaming completely broken if server returns `{token}` and client looks for `clientSecret`).
- **Effort**: SMALL (parse-site adjustment) if accepting server shape; MEDIUM if dual-stream needs to be preserved.

**Note**: This is the only confirmed wire-level break in default user flows. Realtime is a documented feature exposed in UI.

## F3. Drop unused `?email=` query on `/api/auth/verification-status`

- **Client file:line**: `src/components/EmailVerificationStep.tsx:31,35`
- **What it does now**: Polls `GET /api/auth/verification-status?email=<urlencoded>`; passes `credentials: "include"`.
- **What it should do**: Server (`verification-status.ts:40`) derives the user from session/Bearer; the `?email=` is ignored. Harmless but misleading — drop the query param to align with BACKEND_SPEC.md §`GET /api/auth/verification-status`.
- **Severity**: LOW.
- **Effort**: TRIVIAL.

## F4. Billing UI client workaround (already shipped)

- **Client file:line**: `src/helpers/ipcHandlers.js:5929, 5933, 5944, 5976` (Stripe IPC handlers)
- **What it does now**: Calls `/api/stripe/{checkout,portal,switch-plan,preview-switch}` — server returns 404, IPC handler bubbles `success: false`.
- **What it should do**: Already addressed in commit `c4d2ca5e` ("fix(corporate): floating icon ErrorBoundary, hide billing/support/analytics") — the UI entry points are hidden in corporate-minimal builds. **No client code change required.** Listed here for traceability with the matrix MISSING(server) rows.
- **Severity**: NONE (in corporate-minimal). MEDIUM if upstream-parity build is restored.
- **Effort**: NONE (already gated).

## F5. Referrals UI client workaround (already shipped)

- **Client file:line**: `src/helpers/ipcHandlers.js:6228, 6264, 6302`
- **What it does now**: Calls `/api/referrals/{stats,invite,invites}` — server returns 404.
- **What it should do**: UI is hidden in corporate-minimal builds (`c4d2ca5e`). No client change needed.
- **Severity**: NONE (in corporate-minimal).
- **Effort**: NONE.

## F6. `webRequest.onBeforeSendHeaders` Origin-allowlist is hardcoded to `*.openwhispr.com`

- **Client file:line**: `main.js:746-763` — the `urls:` filter array (lines 748-753).
- **What it does now**: `session.defaultSession.webRequest.onBeforeSendHeaders` is registered with a **literal** `urls` array:
  `["https://auth.openwhispr.com/*", "https://api.openwhispr.com/*", "http://localhost:3000/*", "http://127.0.0.1:3000/*"]`.
  The handler rewrites `Origin: null` (Electron `file://` renderer) to the request's own origin so Better Auth's `trustedOrigins` check passes.
- **The defect**: a corporate-lockdown build talks to `openwhispr.yambr.com` (build-time `OPENWHISPR_BACKEND_URL` / `VITE_AUTH_URL`). That host is **not in the literal array** → the `webRequest` filter never fires for it → auth/API requests still go out with `Origin: null` → Better Auth returns `MISSING_OR_NULL_ORIGIN`. **Auth journey breaks in any non-`openwhispr.com` build.**
- **Blame check (mandatory)**: `git blame -L748,753 main.js` → `56f4efb8` (Gabriel Stein, upstream PR #686); present verbatim in `upstream/main:main.js`. **This is upstream code → the literal array must NOT be hand-edited** (upstream-drift, multiplies merge cost). Per `client_immutable`: the array must be *populated from build-time config*, the same env-driven pattern Phase 3/4 applied — exactly as the sibling fallback chains `main.js:518` and `ipcHandlers.js:3397` already resolve `AUTH_URL` from env.
- **Why this is NOT a server finding**: the server cannot fix a missing `Origin` header — the browser/Electron simply never sends it. And it is NOT a "client migrates to match server" change: it is **closing a hole in the fork's own build-config contract**. `OPENWHISPR_BACKEND_URL_PATTERN` is already generated by `scripts/generate-build-config.js` and already exported by `src/config/defaults.ts:31` — but **nothing imports it**. It is a dead constant. The fix wires that already-generated, env-driven pattern (plus the auth-host pattern) into the `webRequest` filter so the allowlist tracks the build's real backend.
- **Expected fix shape**: derive the `urls` array from build-config — `OPENWHISPR_BACKEND_URL` + `VITE_AUTH_URL` (→ `<origin>/*`), keep the `localhost:3000` dev entries. Source from the generated config consumed in `main.js`, not a literal. No upstream-drift to the handler body.
- **Severity**: HIGH — auth completely broken in the lockdown release shipping to `openwhispr.yambr.com`. Masked until now because every published build had empty URL vars and fell back to `openwhispr.com` defaults (which *do* match the literal array).
- **Effort**: SMALL — wire the existing generated `OPENWHISPR_BACKEND_URL_PATTERN` (and an auth pattern) into the `urls` array.

---

## Summary

| Fix | Severity | Effort |
|---|---|---|
| F1 `/api/health` → `/livez` | LOW | TRIVIAL |
| F2 openai-realtime-token shape | HIGH | SMALL–MEDIUM |
| F3 drop `?email=` query | LOW | TRIVIAL |
| F4 Stripe IPC (UI-gated, no-op) | NONE/MEDIUM | NONE |
| F5 Referrals IPC (UI-gated, no-op) | NONE | NONE |
| F6 `webRequest` Origin-allowlist hardcoded to `*.openwhispr.com` | HIGH | SMALL |

**Blockers from client side**: 2 — F2 (only if we keep dual-stream realtime) and **F6 (hard blocker for the `openwhispr.yambr.com` lockdown release)**.
