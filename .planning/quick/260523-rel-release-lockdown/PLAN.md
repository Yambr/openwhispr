---
quick_id: 260523-1c3
slug: release-lockdown
date: 2026-05-23
status: planned
---

# Quick Task: release.yml must build the provider-lockdown binary

## Problem

`.github/workflows/release.yml` builds a corporate-minimal binary
(`OPENWHISPR_BILLING/REFERRALS/STREAMING=false` in 6 env blocks — 3
platforms × 2 steps) but **never sets `OPENWHISPR_PROVIDER_LOCKDOWN`**.

`PROVIDER_LOCKDOWN_ENABLED` defaults `false` in
`scripts/generate-build-config.js` `BOOL_DEFAULTS`. So the published
`v1.7.5` binary has lockdown OFF — all of Phase 10 (single Cloud+Local
provider pickers, no BYOK, no alternative providers) and the
lockdown-dependent R31-R37 work (Design B realtime through our
`/v1/realtime`, cleanup routing) **never reached users**.

## Critical dependency (verified)

`scripts/generate-build-config.js`:
- `OPENWHISPR_REALTIME_WSS_URL` defaults `""`. When unset, `buildResolved()`
  derives `<wss|ws>://<host><path>/v1/realtime` **from `OPENWHISPR_BACKEND_URL`**.
- If `OPENWHISPR_BACKEND_URL` is also empty → `OPENWHISPR_REALTIME_WSS_URL`
  stays empty → realtime unavailable (the `STREAMING_ENABLED` guard
  disables it).

Therefore turning on lockdown is **not enough** — without
`OPENWHISPR_BACKEND_URL` the lockdown release would have working
lockdown UI but DEAD realtime streaming. `release.yml` currently passes
only the `VITE_*` URL vars to the renderer; the non-`VITE`
`OPENWHISPR_BACKEND_URL` (consumed by `generate-build-config.js`) must
also be set.

## Approach

In `.github/workflows/release.yml`, for **all 6 env blocks** (the
`Generate build config` step AND the `Build Application` step, for each
of macOS/Windows/Linux):

1. Add `OPENWHISPR_PROVIDER_LOCKDOWN: "true"`.
2. Add `OPENWHISPR_BACKEND_URL: ${{ vars.OPENWHISPR_BACKEND_URL }}` —
   sourced from a GitHub repo var, NOT hardcoded. (If a repo var with a
   different name already holds the backend origin — e.g. derived from
   `vars.VITE_OPENWHISPR_API_URL` — reuse it; do not invent a second
   source of truth. Inspect what `vars.*` the workflow already
   references and pick the canonical backend origin var. If none
   exists, use `${{ vars.OPENWHISPR_BACKEND_URL }}` and note in the
   SUMMARY that the repo var must be created before the next release.)
3. Optionally also set `OPENWHISPR_AUTH_URL: ${{ vars.* }}` for
   consistency if the workflow does not already cover auth — but
   `VITE_AUTH_URL` is already passed; only add the non-VITE form if
   `generate-build-config.js` needs it (it has its own `AUTH_URL`
   default — check; add only if a non-default is required).

Keep the `corporate-minimal` step names; the build posture banner
already says "corporate-minimal (default)" — optionally update it to
mention provider-lockdown.

## Tasks

1. Edit `.github/workflows/release.yml` — add
   `OPENWHISPR_PROVIDER_LOCKDOWN: "true"` and the backend-URL var to all
   6 env blocks. No hardcoded URLs — `${{ vars.* }}` only.

## Out of scope

- Re-tagging / re-releasing — the owner triggers that manually after
  review. This task only fixes the workflow.
- Server repo, Helm — separate.

## Verification

- `git grep "OPENWHISPR_PROVIDER_LOCKDOWN" .github/workflows/release.yml`
  → present in all 6 blocks.
- No literal `http(s)://` URL added to release.yml (grep) — only
  `${{ vars.* }}`.
- Local sim: run
  `OPENWHISPR_PROVIDER_LOCKDOWN=true OPENWHISPR_BACKEND_URL=https://api.example.com node scripts/generate-build-config.js`
  → `PROVIDER_LOCKDOWN_ENABLED=true` AND `OPENWHISPR_REALTIME_WSS_URL`
  non-empty (derived `wss://api.example.com/v1/realtime`) in the
  generated `build-config.generated.cjs`. Then regenerate clean
  (`node scripts/generate-build-config.js`) to leave the working tree
  at the default.
- `release.yml` still valid YAML.
