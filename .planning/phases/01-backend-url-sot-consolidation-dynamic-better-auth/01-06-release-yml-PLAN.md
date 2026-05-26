# Plan 01-06: release.yml CI Simplification + MAINTAINER-ACTION (Wave 5)

**Goal:** Remove the dual-env-var convention from `.github/workflows/release.yml`. After this plan, CI sets only `OPENWHISPR_BACKEND_URL` (sourced from legacy GH var `vars.VITE_OPENWHISPR_API_URL` temporarily). The follow-up GH var rename is documented for a maintainer to do manually.

**Wave:** 5
**Requirements:** HOST-01 (CI side) — finalizes AC-2 and AC-10
**Depends on:** 01-04 (main reads only OPENWHISPR_BACKEND_URL — safe to drop the dual setter)
**Files modified:**
- `.github/workflows/release.yml` — 5 stages updated
- `.planning/phases/01-backend-url-sot-consolidation-dynamic-better-auth/MAINTAINER-ACTION.md` (NEW)

## Tasks

1. **Identify all 5 stages** in `release.yml` that currently set both env vars. Per grep:
   - Line 114-117 (and surrounding context)
   - Line 128-131
   - Line 253-256
   - Line 267-270
   - Line 409-412

   Each stage currently has two env lines:
   ```yaml
   env:
     OPENWHISPR_BACKEND_URL: ${{ vars.VITE_OPENWHISPR_API_URL }}
     # ...
     VITE_OPENWHISPR_API_URL: ${{ vars.VITE_OPENWHISPR_API_URL }}
   ```

2. **Delete the `VITE_OPENWHISPR_API_URL: …` line in each of the 5 stages.** Keep the `OPENWHISPR_BACKEND_URL` line; that's the survivor. The GH var name (`vars.VITE_OPENWHISPR_API_URL`) stays for now per CONTEXT D-05's two-step rename strategy.

3. **Update any other env keys in the same blocks** that may have referenced the old name. Verify with:
   ```bash
   grep -n "OPENWHISPR_API_URL\|VITE_OPENWHISPR_API_URL" .github/workflows/release.yml
   ```
   Expected post-edit: only `vars.VITE_OPENWHISPR_API_URL` references remain (the legacy GH-var-name on the right-hand side of `${{ }}`).

4. **Author `MAINTAINER-ACTION.md`** in the phase directory:

   ```markdown
   # Maintainer Action Required — Phase 1 GH Repo Var Rename

   Phase 1 (Plan 01-06) simplified `.github/workflows/release.yml` to set only
   `OPENWHISPR_BACKEND_URL` (was: both `OPENWHISPR_BACKEND_URL` and
   `VITE_OPENWHISPR_API_URL`). The GitHub Actions repo variable on the
   right-hand side still carries its legacy name.

   ## Action

   1. Go to GitHub repo Settings → Secrets and variables → Actions → Variables tab.
   2. Find `VITE_OPENWHISPR_API_URL`.
   3. Note its current value (probably `https://openwhispr.yambr.com`).
   4. Rename to `VITE_OPENWHISPR_BACKEND_URL`. (Or delete + recreate with the new name preserving the value — GitHub UI doesn't support in-place rename; need to capture-delete-recreate.)
   5. After the rename, open a one-line follow-up PR updating the 5 occurrences of `vars.VITE_OPENWHISPR_API_URL` in `release.yml` to `vars.VITE_OPENWHISPR_BACKEND_URL`.

   ## Why Two-Step

   The Phase 1 PR may merge before the maintainer can rename the GH var. By
   keeping the legacy GH-var-name temporarily, the next release tagging will
   still find the value and produce a working signed/notarized artifact. Only
   after the maintainer renames AND the follow-up PR merges does CI fully
   adopt the new naming.

   ## Verification

   After the follow-up PR merges, run a release tag (e.g., `v1.7.10`) and
   confirm:
   - GitHub Actions logs show `OPENWHISPR_BACKEND_URL: <value>` being set.
   - The artifact's `build-config.generated.cjs` contains the expected
     backend URL.
   - The artifact signs and notarizes successfully (existing afterSign hooks
     are unaffected).
   ```

5. **Update `docs/BUILD_CONFIG.md`** if it references `VITE_OPENWHISPR_API_URL` or `OPENWHISPR_API_URL`:
   ```bash
   grep -n "OPENWHISPR_API_URL\|VITE_OPENWHISPR_API_URL" docs/BUILD_CONFIG.md
   ```
   Replace with `OPENWHISPR_BACKEND_URL` references. Update the worked example.

## Acceptance

```bash
# release.yml has zero VITE_OPENWHISPR_API_URL env-var assignments (left side):
awk '/^\s*VITE_OPENWHISPR_API_URL:/' .github/workflows/release.yml | wc -l   # expect 0
# release.yml still references the legacy GH var name on the right-hand side (intentional, per CONTEXT D-05):
grep -c "vars.VITE_OPENWHISPR_API_URL" .github/workflows/release.yml          # expect 5 (one per stage)
# OPENWHISPR_BACKEND_URL is set in all 5 stages:
awk '/^\s*OPENWHISPR_BACKEND_URL:/' .github/workflows/release.yml | wc -l    # expect 5
# Documentation updated:
grep -c "OPENWHISPR_API_URL\b" docs/BUILD_CONFIG.md                          # expect 0
# MAINTAINER-ACTION.md exists:
test -f .planning/phases/01-backend-url-sot-consolidation-dynamic-better-auth/MAINTAINER-ACTION.md && echo "OK"
```

Commit message: `ci(01-06): release.yml drops dual-env-var convention (OPENWHISPR_API_URL retired); MAINTAINER-ACTION.md for GH var rename`

## Notes

- This plan does NOT touch the GitHub Actions repo variable. That's manual by design (no API call from a workflow can rename a repo var safely without elevated permissions).
- The follow-up PR (renaming `vars.VITE_OPENWHISPR_API_URL` → `vars.VITE_OPENWHISPR_BACKEND_URL` in release.yml) is **out of scope for Phase 1**. It's bookkeeping that happens after a maintainer does the manual rename. Surface it in Phase 1 SUMMARY.
- Until the maintainer-action is done, `OPENWHISPR_API_URL` as an env-var name is gone from the codebase but the GH var still uses the old name — that's the transitional state CONTEXT D-05 anticipates.
