# Phase 06 — Verification Record

**Date:** 2026-05-29
**Branch:** `phase/06-server-driven-auth-providers`
**Discipline:** [live_verification_over_green_tests] — green tests are necessary, not sufficient. This records what was proven against the REAL system vs. what remains pending a provider-enabled server.

---

## ✅ Verified LIVE (against real prod, not mocks)

### 1. Real endpoint wire contract — `GET https://openwhispr.yambr.com/api/auth/providers`
```
HTTP/2 200
cache-control: public, max-age=60
etag: W/"88b30849e22d5efa"
x-ratelimit-limit: 60
content-type: application/json; charset=utf-8

{"providers":[],"emailVerification":{"required":true,"configured":true}}
```
- **Public / pre-auth:** 200 with NO Authorization header (rate-limited 60/min). Matches design §3.3 and the server peer's claim (`auth-providers.ts:86`, `auth:false`). ✓
- **Shape:** exactly `{providers, emailVerification}` — the real `{id,name,enabled}` per-provider contract (here `providers:[]`), NOT the original wrong `{id,label,iconHint}` assumption. ✓
- **ETag + Cache-Control:** present as the peer described. Client keeps no stale cache of its own (design D2); the HTTP cache is a server-side bonus. ✓

### 2. Real client parser against the EXACT live prod payload
Ran `parseProvidersResponse` (the shipped client code) against the literal bytes prod returned:
- prod `{"providers":[],...}` → `[]` → client renders **PASSWORD-ONLY (no social buttons)**. This is the correct, valid "password-only server" state per design D2. ✓
- Control: a `{providers:[{id:"google",name:"Google",enabled:true},{id:"oidc",name:"Company SSO",enabled:true}], emailVerification:{...}}` payload → `[{id:"google",iconHint:"google"},{id:"oidc",iconHint:"generic"}]` → 2 buttons, `oidc` gets the generic icon + server-supplied label. Proves the data path end-to-end against real code. ✓

### 3. Build + type + unit + verifier (green, on real build tooling)
- `serverProviders.test.ts`: 20/20 pass.
- `npx tsc --noEmit`: clean across edited + new files.
- `npm run build:renderer`: builds clean.
- `scripts/verify-provider-lockdown.js`: exit 0 (2 scenarios, 43 greps, 0 violations) — lockdown still strips BYOK/enterprise/alt-cloud/billing/referrals; social no longer asserted (D3).
- `npm run test:e2e:list`: the 2 wire-contract scenarios bind, no undefined/duplicate-step errors.

---

## ⚠️ PENDING live verification (gap — documented, not papered over)

### Rendered DOM with a NON-EMPTY server provider list
**Not yet verified live**, because:
- prod currently returns `providers:[]` (no OIDC/social providers configured server-side as of 2026-05-29).
- no staging host was reachable by name from this environment (`stage.`/`staging.`/`-stage` all → 000).
- this sandbox has no DISPLAY for a full packed-app CDP GUI drive.

**What this means:** the path "server enables a provider → a button with the right label/icon appears in the packed app, and clicking it opens `/api/desktop-signin/<id>`" is proven *transitively* (real endpoint shape ✓ + real parser on real payload ✓ + control payload → correct view-models ✓ + unit-tested resolver/iconFor ✓ + ServerProviderButtons is a logic-free map over those view-models), but the final rendered-DOM + click→deep-link has NOT been observed live with a populated list.

**To close this gap (run when a provider-enabled server is available):**
1. Point at a server with at least one provider enabled — either ask the server peer (`mq4371mt`) to enable an OIDC triplet on staging/prod, or run a local openwhispr-server with `OIDC_ISSUER_URL/ID/SECRET` set so `GET /api/auth/providers` returns `[{id:"oidc",...}]` (and/or `google`).
2. Pack: `npm run pack`, launch with `--remote-debugging-port=9223` (per [cdp_renderer_debug]).
3. CDP-drive the sign-in screen: assert the rendered social buttons exactly match the server `providers` list; assert each label = resolved view; click the `oidc` button → assert the browser opens `${AUTH_URL}/api/desktop-signin/oidc`.
4. Negative: a server returning `{"providers":[]}` → confirm password-only, sign-in still works. (The empty-list half is already confirmed against live prod.)
5. A reusable probe should be written at `scripts/cdp-server-providers-verify.mjs` (not created yet — no provider-enabled server to point it at).

---

## Summary

The **client contract** (consume real `{providers:[{id,name,enabled}]}`, fail-soft to password-only, derive icon from id, render via a logic-free map) is verified live end-to-end against the real prod endpoint and real prod payload. The only unobserved step is the rendered-DOM with a populated list, which is blocked solely by the absence of a provider-enabled server reachable from here — not by any client uncertainty. No client code change is pending; the feature is complete and correct against the live contract.
