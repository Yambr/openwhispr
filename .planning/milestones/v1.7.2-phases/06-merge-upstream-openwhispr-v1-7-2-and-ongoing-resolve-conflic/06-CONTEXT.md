---
phase: 06
phase_name: merge-upstream-openwhispr-v1-7-2-and-ongoing-resolve-conflic
captured: 2026-05-09
mode: discuss-skipped (recurring maintenance phase, scope is well-understood)
---

# Phase 06 Context — Merge Upstream OpenWhispr Releases

## Goal

Establish a **repeatable process** for merging upstream OpenWhispr releases (starting with v1.7.2) into our Yambr fork without breaking any of the build-time gating, signing, or branding work from Phases 01-05.

This is **not a one-shot phase** — it's a maintenance template we'll re-execute every time upstream cuts a release.

## Why this is a phase, not just a checklist

Upstream OpenWhispr is a **moving target**. They add features, refactor internals, and occasionally do structural changes (model registry shape, IPC contract changes, dependency bumps). Each merge has the potential to:

1. **Break our build-time gating** — if upstream renames `gcalStartOAuth` or moves Stripe code into a new file, our verify-* scripts will pass even if the gating semantically broke.
2. **Reintroduce hardcoded URLs/keys** — upstream has had this problem before (OAuth client IDs, possibly streaming API keys). A merge may bring back values our Phase 03 refactor extracted.
3. **Conflict with our corporate-minimal flags** — upstream may add new UI that touches Stripe/Referrals/Streaming code paths. Our gating mechanism needs to extend to cover them.
4. **Bump Electron / Node / Vite** — Phase 04.1 found that Vite/Rolldown DCE has subtle gotchas; a Vite major-version bump could change tree-shake behavior and silently leak gated code.

So each merge needs **discipline**: re-run verify-* gates, code-review the diff, retest the corporate-build CI, audit for new hardcoded values.

## Inputs

- **Upstream remote**: `git@github.com:OpenWhispr/openwhispr.git` (add as `upstream` if not already)
- **Target version**: v1.7.2 (this iteration); future iterations bump per upstream release cadence
- **Our fork**: `git@github.com:Yambr/openwhispr.git` (`origin`)
- **Branch protection**: `main` is protected; merge via PR only

## Decisions (locked)

### D-01: Merge strategy — `git merge`, not rebase

Use `git merge upstream/main` (non-fast-forward) so our fork's commit graph clearly shows "this is upstream", and conflicts are resolved at well-defined merge commits. Rebasing rewrites our 50+ atomic commits and would destroy useful blame information for our CI / docs / planning work.

### D-02: Mandatory CI gates before merging

Before pushing the merge commit:
- `npm run verify:oauth-gating` — must pass for all 4 scenarios
- `npm run verify:feature-gating` — must pass for all 4 scenarios
- `npm run verify:pack-regen` — must pass
- `npm run typecheck` — must pass
- Manual: build for at least one platform (`npm run pack` on macOS) and verify it launches

If any gate fails, the merge is **incomplete** — fix forward in the merge branch before pushing.

### D-03: Gating regression review

After every merge, re-run the regression checklist:
- [ ] `grep -RF "wss://api.openai.com/v1/realtime" src/` returns nothing (Phase 05 baseline)
- [ ] `grep -RFE "(stripeCheckout|stripePortal|switchPlan|previewSwitchPlan)" src/dist/` returns nothing on default build
- [ ] `grep -RF "gcalStartOAuth" src/dist/` returns nothing when `OPENWHISPR_OAUTH_GOOGLE=false`
- [ ] No new `sk_*`, `dg_*`, `ak_*` patterns introduced anywhere

### D-04: Documentation maintenance

After every merge:
- Update `CHANGELOG.md` with "Merged upstream v1.X.Y on YYYY-MM-DD; conflicts resolved in [commit]"
- If upstream introduces a new build-time-relevant config, add to `docs/BUILD_CONFIG.md`
- If upstream's `BACKEND_SPEC` (their docs) gain new endpoints, sync our `docs/BACKEND_SPEC.md` if they're relevant for corporate backend

### D-05: Upstream's Yambr-specific mods

Our fork-specific changes that must NOT be lost during merges:
- `electron-builder.json` `appId: com.yambr.openwhispr`
- `electron-builder.json` `publish.repo: Yambr/openwhispr` (auto-update feed)
- All files matching `*.generated.cjs` are gitignored — re-generate after merge
- `README.md` Yambr branding section
- All `.planning/` and CI workflow files
- `package.json` script overrides (the `pack`/`dist`/`build:*` invocations of `generate-build-config.js`)

### D-06: Conflict handling priority

When upstream and our fork conflict:
1. **Wire-API contract** (anything client-server protocol related) — prefer upstream's version if it represents a new agreed-upon contract; otherwise prefer ours.
2. **Build pipeline** (`package.json` scripts, `electron-builder.json`) — prefer ours; we have explicit invariants (verify-* scripts, generator step before electron-builder).
3. **Source code** — case-by-case; if upstream refactors a file we gated, redo the gate on the new structure.
4. **Docs** — prefer ours (we have BUILD_CONFIG / SELF_HOSTING / fork-specific README).

## Out of scope

- **Reverse-syncing our changes upstream** — separate effort, may happen for non-fork-specific fixes (e.g., the Phase 04.1 Vite/Rolldown DCE findings could be a useful upstream PR). Not part of phase 06.
- **Auto-merging via Dependabot/Renovate** — too risky for an upstream of this size; manual disciplined merges only.

## Success criteria (per merge iteration)

1. Latest upstream release (v1.7.2 for first iteration) merged into our `main` via PR
2. All 4 verify-* gates green on the merge commit in CI
3. At least one platform build (macOS) succeeds with default flags
4. Smoke test: launch built app, perform basic dictation, confirm corporate backend URL is honored
5. CHANGELOG entry documenting the merge + any notable upstream additions
6. If upstream introduced new gateable consumer features (Stripe-adjacent, referral-adjacent, streaming-adjacent), they're added to verify-feature-gating.js and gated by appropriate flag

## Process template (for each upstream release merge)

1. `git remote add upstream git@github.com:OpenWhispr/openwhispr.git` (one-time)
2. `git fetch upstream && git checkout -b merge/upstream-vX.Y.Z origin/main`
3. `git merge upstream/vX.Y.Z` (or upstream/main pinned to tag)
4. Resolve conflicts per D-06 priority order
5. `node scripts/generate-build-config.js && npm run typecheck && npm run verify:oauth-gating && npm run verify:feature-gating && npm run verify:pack-regen`
6. `npm run pack` — confirm builds
7. Review diff against the gating regression checklist (D-03)
8. Commit, push, open PR `merge/upstream-vX.Y.Z` → `main`
9. Wait for CI green, CodeRabbit review
10. Squash-merge or merge-commit to main per repo policy
11. Tag if appropriate (`v1.7.2-yambr` or similar)
12. Update CHANGELOG

## Definition of Done (Phase 06 first iteration = v1.7.2)

- [ ] Upstream v1.7.2 merged into `main`
- [ ] All verify-* gates green
- [ ] CHANGELOG.md updated
- [ ] Process template documented in `docs/MAINTENANCE.md` (new file) so future iterations follow the same script without re-deciding
- [ ] Tag `v1.7.2-yambr` pushed (or whatever version scheme we land on)
