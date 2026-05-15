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

---

## Summary

| Fix | Severity | Effort |
|---|---|---|
| F1 `/api/health` → `/livez` | LOW | TRIVIAL |
| F2 openai-realtime-token shape | HIGH | SMALL–MEDIUM |
| F3 drop `?email=` query | LOW | TRIVIAL |
| F4 Stripe IPC (UI-gated, no-op) | NONE/MEDIUM | NONE |
| F5 Referrals IPC (UI-gated, no-op) | NONE | NONE |

**Blockers from client side**: 1 (F2, only if we keep dual-stream realtime).
