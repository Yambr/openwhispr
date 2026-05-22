---
quick_id: 260523-1c3
slug: release-lockdown
date: 2026-05-23
status: complete
commit: 82774205
---

# Summary: release.yml builds the provider-lockdown binary

## What was wrong

`.github/workflows/release.yml` built a corporate-minimal binary
(`BILLING/REFERRALS/STREAMING=false`) but never set
`OPENWHISPR_PROVIDER_LOCKDOWN`. `PROVIDER_LOCKDOWN_ENABLED` defaults
`false`, so the published `v1.7.5` binary shipped with lockdown OFF —
all of Phase 10 and the lockdown-dependent R31-R37 work (Design B
realtime, cleanup routing, Cloud+Local-only pickers) never reached
users.

## Fix

Added to all 6 env blocks (3 platforms × `Generate build config` +
`Build Application` steps) in `release.yml`:
- `OPENWHISPR_PROVIDER_LOCKDOWN: "true"`
- `OPENWHISPR_BACKEND_URL: ${{ vars.VITE_OPENWHISPR_API_URL }}`

The backend URL is required because `generate-build-config.js` derives
`OPENWHISPR_REALTIME_WSS_URL` (Design B realtime) from
`OPENWHISPR_BACKEND_URL`. Without it the lockdown release would have
working lockdown UI but dead realtime streaming. Reused the existing
`VITE_OPENWHISPR_API_URL` repo var — single source of truth, no new var,
no hardcoded URL.

Commit `82774205`. YAML valid. Build-config sim with the flag:
`PROVIDER_LOCKDOWN_ENABLED=true`, `OPENWHISPR_REALTIME_WSS_URL` derives
to `wss://<host>/v1/realtime`, `STREAMING_ENABLED=true`.

## RISK — operator action required before the next release

`gh api repos/Yambr/openwhispr/actions/variables` returns
`total_count: 0` — **no repo-level Actions variables are set**, and
there are no Actions environments. `release.yml` already referenced
`vars.VITE_OPENWHISPR_API_URL` (and `VITE_AUTH_URL`,
`VITE_OPENWHISPR_OAUTH_CALLBACK_URL`) BEFORE this change — so either
those vars are defined at the **org level** (not visible via the repo
API) or prior releases built with empty URL values.

**Before triggering the next release, the operator must confirm
`VITE_OPENWHISPR_API_URL` resolves to the real backend origin** (org
var or repo var). If it is empty, the lockdown build will derive an
empty `OPENWHISPR_REALTIME_WSS_URL` → realtime streaming dead. This is
pre-existing workflow behavior, not introduced here, but lockdown makes
it load-bearing.

## Out of scope

Re-tagging / re-releasing — owner triggers manually after review and
after confirming the repo/org var above.
