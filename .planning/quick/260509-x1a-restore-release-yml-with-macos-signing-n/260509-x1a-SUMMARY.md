---
quick_id: 260509-x1a
date: 2026-05-09
status: complete
---

# Quick 260509-x1a: Restore release.yml with macOS signing+notarization

## Problem

Commit `755ce7c9` (3 days prior) deleted `release.yml` and replaced it with `corporate-build.yml`, which had `CSC_IDENTITY_AUTO_DISCOVERY: "false"` — disabling Apple Developer ID signing and notarization entirely. Result: any macOS build produced from a tagged release (`v1.7.0` was the last surviving signed build) would trigger Gatekeeper's "Apple could not verify…is free of malware" warning.

## Resolution

Restored `release.yml` from the pre-deletion state (`755ce7c9^`, 316 lines) and merged in the corporate-build additions:

- macOS signing: APPLE_CERTIFICATE_BASE64 import to runner keychain, hardenedRuntime, entitlements
- Apple notarization: APPLE_API_KEY_ID + APPLE_API_ISSUER + APPLE_TEAM_ID via `@electron/notarize`
- Version-from-tag: workflow resolves version from `${{ github.ref_name }}` (preserves Yambr 4-segment scheme without bumping `package.json`) and passes via `--config.extraMetadata.version`
- Auto-publish: dedicated `publish-release` job aggregates artifacts from all 3 platforms and runs `gh release create --verify-tag`
- `verify-gates` precondition: build jobs `needs: [verify-gates]` (workflow_call into `verify-gating.yml`)

Deleted `corporate-build.yml` (320 lines) and `build-and-notarize.yml` (273 lines). Result: single `release.yml` is the only release workflow; `verify-gating.yml` remains as reusable workflow.

## Files changed

- Created: `.github/workflows/release.yml` (498 lines, restored + extended)
- Deleted: `.github/workflows/corporate-build.yml`
- Deleted: `.github/workflows/build-and-notarize.yml`

## Commits

- `95856a33` feat(260509-x1a-01): restore release.yml with macOS signing + corporate-build features
- `4adb576e` chore(260509-x1a-02): remove corporate-build.yml and build-and-notarize.yml

## Verification

- 23-token grep safety net (signing keychain commands, Apple env vars, Swift compile steps, version-from-tag, generate-build-config, gh release create, --verify-tag, verify-gating reference) — all present in restored release.yml
- `release.yml` parses as 5 jobs: verify-gates → build-linux + build-windows + build-macos → publish-release
- Trigger glob `tags: ["v*"]` covers Yambr 4-segment versions (v1.7.2.1)

## Next steps

User must verify the secrets exist in repo settings:
- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_API_KEY_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_TEAM_ID`

Cut a new tag (e.g. `v1.7.2.2`) to validate end-to-end signed+notarized release.
