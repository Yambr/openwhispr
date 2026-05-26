# Phase 9 — CLIENT-CUTS.md

Companion to `../08-client-server-audit/SERVER-REQUIREMENTS.md`. Where
SERVER-REQUIREMENTS records work the server must do to honor the
documented contract, CLIENT-CUTS records features that the **client**
removes entirely (UI gated off + docs scrubbed) instead of waiting on
server implementation.

This is option 2 of the two-option rule (see memory
[[client-immutable]]): server adapts, OR the feature is cut from the
client. Never "client migrates to match server".

---

## CC-1 — Stripe billing surface (4 endpoints)

**Decision date:** 2026-05-19 (advisor session, ratified during
Phase 9 re-plan)

**Endpoints removed from `docs/BACKEND_SPEC.md`:**

- `POST /api/stripe/checkout`
- `POST /api/stripe/portal`
- `POST /api/stripe/switch-plan`
- `POST /api/stripe/preview-switch`

**Client UI state:** Hidden in corporate-minimal builds since
`c4d2ca5e` (`fix(corporate): floating icon ErrorBoundary, hide
billing/support/analytics`). Renderer `BillingSettings` /
`UpgradePrompt` components gated off through build-time
`OPENWHISPR_FEATURE_BILLING` (default `false` for corporate-minimal,
which is the default build per memory [[project-pivot]]).

**Why cut instead of asking server to implement:**

- Implementing Stripe server-side reverts the corporate-minimal pivot
  — corporate self-hosters explicitly don't want a billing pipeline,
  and the upstream-Yambr SaaS billing flow doesn't apply to forks.
- Estimated server work: ~1 month (Stripe customer/subscription/
  webhook plumbing + prorations + plan migrations + tax handling).
  Cost asymmetry doesn't justify it for a UI surface that's already
  hidden in the default build.
- BACKEND_SPEC.md previously documented endpoints that have no
  server route (MISSING(server) in Phase 8 audit). Leaving them in
  the spec is perpetual docs drift; scrubbing them aligns spec with
  reality.

**Verified absent from contract tests:** R2 in
`../08-client-server-audit/SERVER-REQUIREMENTS.md` confirms
`packages/contract-tests/` has no positive assertions against these
paths. The negative matrix asserts `404` (v2-deferred).

**Reactivation criteria:** v2 fork variant that opts into the SaaS
billing surface. Until then, treat all four endpoints as
non-existent. Anyone reading BACKEND_SPEC and not finding them
should follow the corporate-minimal disclaimer at the top of that
doc.

---

## CC-2 — Referrals surface (3 endpoints)

**Decision date:** 2026-05-19 (advisor session, ratified during
Phase 9 re-plan)

**Endpoints removed from `docs/BACKEND_SPEC.md`:**

- `GET /api/referrals/stats`
- `POST /api/referrals/invite`
- `GET /api/referrals/invites`

**Client UI state:** Hidden in corporate-minimal builds since
`c4d2ca5e`. Renderer `ReferralPage` component gated off via
build-time feature flag (same mechanism as billing).

**Why cut instead of asking server to implement:**

- Referrals are a consumer-SaaS growth feature that doesn't apply
  to corporate self-hosters (the default build).
- Server work would include invite token minting, email delivery
  pipeline, reward attribution, and anti-abuse logic — significant
  surface area for a feature that's hidden.
- Same docs-drift argument as CC-1.

**Verified absent from contract tests:** Same R2 confirmation as
CC-1.

**Reactivation criteria:** v2 fork variant that opts into the SaaS
growth surface.

---

## Rules going forward

When a future client↔server gap is discovered, the resolution must
land in exactly one of two files:

- `SERVER-REQUIREMENTS.md` (in the originating phase's directory) —
  if the server should adapt
- `CLIENT-CUTS.md` (this file, or future-phase equivalent) — if the
  client should drop the feature entirely

There is no third option. "Client migrates to match server" /
"client adapter" / "client backwards-compat shim" is forbidden by
the [[client-immutable]] rule. See also memory [[upstream-parity]]
for the cost-asymmetry rationale.

A CLIENT-CUT must include:

1. The endpoints / UI surfaces being removed
2. Where the build-time gate lives (env var, commit reference)
3. Why server-adapts was rejected (cost, scope mismatch, etc.)
4. Confirmation that contract-tests don't positively assert the
   removed paths
5. Reactivation criteria (when, if ever, this cut would be undone)
