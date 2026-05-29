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

## 🔴 Critical bug caught in final whole-feature review (FIXED)

The final whole-implementation review (not any per-task review) caught a runtime break that green tests missed — a textbook [live_verification_over_green_tests] case:

- **Bug:** `signInWithSocial` (`src/lib/auth.ts`) still had a fork-drift guard `if (PROVIDER_LOCKDOWN_ENABLED) return {error: "Provider not enabled in this build"}` (Phase 10 PLD-06, commit d08e3d8d). After Task 8 decoupled lockdown from social (so a lockdown build now has `PROVIDER_LOCKDOWN_ENABLED=true` AND `OAUTH_*=true`), a lockdown build would **render** the server-driven buttons but **every click died** with that error. Broken in exactly the corporate/self-host build server-driven OIDC targets. Invisible to the suite (no lockdown-build click was ever exercised; prod returns `[]`).
- **Blame:** the guard is fork drift — absent from `upstream/main:src/lib/auth.ts`. Removing it **reduces** drift toward upstream parity (allowed; the neutralization design §3.5 explicitly required).
- **Fix (commit 57a59f6d):** removed the lockdown early-return + its now-unused `PROVIDER_LOCKDOWN_ENABLED` import; left the per-provider `OAUTH_*_ENABLED` defense-in-depth guards (harmless — never match a server id like `oidc`). Added `test/helpers/signInWithSocialLockdown.test.js`: a regression test mocking the exact post-D3 lockdown state (`PROVIDER_LOCKDOWN_ENABLED=true` + `OAUTH_*=true`) that proves `signInWithSocial("oidc")` reaches `/api/desktop-signin/oidc` and returns no error. Verified the test genuinely FAILS against the old guard-present code (not vacuous). 40/40 tests pass; verifier exit=0; build-config clean.

This closes a meaningful slice of the lockdown-build click path **at the unit level** (the guard is provably gone, the deep-link is provably reached).

## Server-side e2e closing the populated-list gap

The server peer (`mq4371mt`) is adding an `@sso` e2e assertion against a LIVE local Keycloak 26 stack: `GET /api/auth/providers` → `{providers:[{id:"oidc",name:"OIDC",enabled:true}], emailVerification:{...}}` (non-empty, real Keycloak). That confirms the populated wire contract against a real IdP from the server side; the client parser on those exact bytes is already transitively proven here. The full client rendered-DOM with a populated list still awaits an operator enabling an OIDC triplet on a network-reachable host (staging) — flagged to Nick; the peer's `realm-openwhispr-test.json` is a ready config reference.

## Summary

The **client contract** (consume real `{providers:[{id,name,enabled}]}`, fail-soft to password-only, derive icon from id, render via a logic-free map, AND reach the deep-link on click in EVERY build incl. lockdown) is verified: live against the real prod endpoint + payload, and at the unit level for the lockdown click path (the Critical fix). The only unobserved step is the full rendered-DOM with a populated list in a packed GUI, blocked solely by the absence of a provider-enabled network-reachable server — not by client uncertainty. No client code change is pending; the feature is complete and correct against the live contract.
