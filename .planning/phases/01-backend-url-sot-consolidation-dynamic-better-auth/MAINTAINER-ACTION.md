# Maintainer Action Required — Phase 1 GH Repo Var Rename

Phase 1 Plan 01-06 simplified `.github/workflows/release.yml` to set only
`OPENWHISPR_BACKEND_URL` (was: both `OPENWHISPR_BACKEND_URL` and the now-retired
`VITE_OPENWHISPR_API_URL`). The GitHub Actions repo variable on the right-hand
side still carries its legacy name (`vars.VITE_OPENWHISPR_API_URL`) — this is
deliberate per CONTEXT D-05's two-step rename strategy.

## Action

1. Go to GitHub repo Settings → Secrets and variables → Actions → Variables tab.
2. Find `VITE_OPENWHISPR_API_URL`.
3. Note its current value (probably `https://openwhispr.yambr.com` for Yambr's
   release pipeline).
4. Rename to `VITE_OPENWHISPR_BACKEND_URL`. GitHub's UI doesn't support
   in-place rename — capture the value, delete the legacy var, recreate with
   the new name and the same value.
5. After the rename, open a one-line follow-up PR updating the 6 occurrences
   of `vars.VITE_OPENWHISPR_API_URL` in `release.yml` to
   `vars.VITE_OPENWHISPR_BACKEND_URL`.

## Why Two-Step

The Phase 1 PR may merge before a maintainer can rename the GH repo var. By
keeping the legacy GH-var-name temporarily, the next release tagging still
finds the value and produces a working signed/notarized artifact. Only after
the maintainer renames the GH var AND the follow-up PR merges does CI fully
adopt the new naming.

## Verification

After the follow-up PR merges, run a release tag (e.g., `v1.7.10`) and
confirm:

- GitHub Actions logs show `OPENWHISPR_BACKEND_URL: <value>` being set on
  each build/sign step.
- The artifact's `src/config/build-config.generated.cjs` contains the
  expected `OPENWHISPR_BACKEND_URL` value.
- The artifact signs and notarizes successfully (existing `afterSign` hooks
  in `electron-builder.config.js` are unaffected by this change).
- `npm run verify:backend-url-sot` (Phase 1 gate, authored in Plan 01-01)
  exits 0 — confirming no source file references `VITE_OPENWHISPR_API_URL`
  anywhere.

## Carry-Forward for Phase 6 (Recurring Upstream Merge)

The same script `npm run verify:backend-url-sot` is the gate that catches
future upstream merges from regressing Phase 1's work (the way the v1.7.2
upstream merge regressed Phase 03-02's work — see CONTEXT D-07). Run it
after every `git merge upstream/main` and before tagging.
