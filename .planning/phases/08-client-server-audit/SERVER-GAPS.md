# Server-Side Gaps

Issues from `COMPATIBILITY-MATRIX.md` where the server team must add, amend, or align a route to match the BACKEND_SPEC.md contract.

The default Yambr build is **corporate-minimal**, which hides billing/referral UI. None of the MISSING(server) gaps below block default-build users **today**. They become BLOCKER-grade if the upstream-parity build is reactivated or a non-corporate distribution is published.

---

## S1. `POST /api/openai-realtime-token` — schema mismatch

- **BACKEND_SPEC.md section**: §`POST /api/openai-realtime-token`
- **Expected route signature** (per spec / client expectation):
  - Method: `POST /api/openai-realtime-token`
  - Auth: `Authorization: Bearer <token>` or cookie
  - Request: `{ model: string, language: string, streams: number }` (1 or 2)
  - Response: `{ clientSecret: "<secret>" }` (single stream) OR `{ clientSecrets: ["<s1>","<s2>"] }` (dual stream)
- **Currently in apps/api**: `routes/tokens/openai-realtime.ts:53` — accepts **empty body**, returns `{ token: string }` (per SERVER-ROUTES.md #38).
- **Suggested resolution**:
  - Accept the request body `{ model, language, streams }` (optional with defaults).
  - Rename response field `token` → `clientSecret` (and add `clientSecrets[]` when `streams===2`) to align with OpenAI Realtime API conventions and BACKEND_SPEC.md.
  - Alternatively, the contract could move to `token` and the client adapts (see `FIXES-CLIENT.md` F2) — but the OpenAI Realtime native naming favours `clientSecret`.
- **Severity**: HIGH (default realtime feature; only one of client/server needs to move).

## S2. Stripe billing routes — not implemented

- **BACKEND_SPEC.md sections**: §`POST /api/stripe/checkout`, §`POST /api/stripe/portal`, §`POST /api/stripe/switch-plan`, §`POST /api/stripe/preview-switch`
- **Expected route signatures**:
  - `POST /api/stripe/checkout` — auth required; body `{ plan, interval }`; resp `{ url: string }`
  - `POST /api/stripe/portal` — auth required; empty body; resp `{ url: string }`
  - `POST /api/stripe/switch-plan` — auth required; body `{ plan }`; resp `{ success: bool, ... }`
  - `POST /api/stripe/preview-switch` — auth required; body `{ plan }`; resp `{ amountDue, currency, nextBillingDate, ... }`
- **Currently in apps/api**: not implemented (no `routes/stripe/` directory in `/Users/nick/openwhispr-server/apps/api/src/routes/`).
- **Suggested resolution**: New `routes/stripe/{checkout,portal,switch-plan,preview-switch}.ts` files, dependency-injected with Stripe SDK; conditional registration on `deps.stripe` so corporate-minimal can omit.
- **Severity**: MEDIUM (no impact on default corporate-minimal build; BLOCKER for any plan upgrade flow if SaaS distribution resumed).

## S3. Referrals routes — not implemented

- **BACKEND_SPEC.md sections**: §`GET /api/referrals/stats`, §`POST /api/referrals/invite`, §`GET /api/referrals/invites`
- **Expected route signatures**:
  - `GET /api/referrals/stats` — auth; resp server-defined shape (signup count, rewards)
  - `POST /api/referrals/invite` — auth; body `{ email }`; resp server-defined
  - `GET /api/referrals/invites` — auth; resp `{ invites: [{ email, status }] }`
- **Currently in apps/api**: not implemented.
- **Suggested resolution**: New `routes/referrals/{stats,invite,invites}.ts` with conditional registration on `deps.referralsEnabled`. Low-priority while corporate-minimal is default.
- **Severity**: LOW (no impact on default build).

## S4. `/api/health` deprecation cycle

- **BACKEND_SPEC.md section**: §`GET /api/health`
- **Expected**: Server documents the alias as deprecated and clients should migrate to `/livez`.
- **Currently in apps/api**: `routes/probes.ts:121` already returns `Deprecation` header + `Link` rel="successor-version" (per SERVER-ROUTES.md #52). **This row exists for visibility**: server is doing the right thing; client (FIXES-CLIENT.md F1) needs to move first, then server can delete the alias.
- **Suggested resolution**: Keep deprecation alias until client F1 ships and is rolled out to ≥99% of installs. Then remove.
- **Severity**: LOW (informational).

---

## Summary

| Gap | Severity | Notes |
|---|---|---|
| S1 openai-realtime-token shape | HIGH | Pick a side with client F2 |
| S2 Stripe billing (4 routes) | MEDIUM | UI-hidden in corporate-minimal; required for SaaS |
| S3 Referrals (3 routes) | LOW | UI-hidden in corporate-minimal |
| S4 /api/health deprecation | LOW | Server already doing right thing |

**Blockers from server side**: 0 for default corporate-minimal build. 1 (S1) for realtime feature if the client doesn't adapt instead. 7 routes (S2 + S3) outstanding for the upstream-parity / SaaS build.
