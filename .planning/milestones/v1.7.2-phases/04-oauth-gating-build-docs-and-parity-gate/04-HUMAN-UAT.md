# Phase 4 — Human UAT (one-shot, signed-build verification)

This UAT codifies ROADMAP Phase 4 success criterion #4: "Existing Developer ID signing flow (`afterSign.js`, electron-builder) continues working with the env-driven config — signed build passes notarization."

Per CONTEXT.md D-14, this is a one-shot manual check, NOT an automated CI gate. Run before declaring Phase 4 complete.

## Pre-flight

- macOS host with Apple Developer ID certificate installed in the login keychain.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` exported (or whichever env vars `afterSign.js` reads — verify by reading the file in repo root).
- Repo at the post-Phase-4 commit; `npm install` clean.

> **Note:** At the time Phase 4 Plan 5 executed, the repo did not contain `afterSign.js` or a separate `electron-builder.config.js` — signing config lives in `electron-builder.json` and any post-sign hook is wired through `electron-builder`'s `afterSign` field if present. The steps below reference the canonical filenames; if they don't exist in your tree, treat the related sub-step as N/A and verify signing still completes via `electron-builder` directly.
> **Note:** `npm run verify:parity` (Phase 3 Plan 6 deliverable) was NOT executed prior to Phase 4 in this branch. If the script is absent, treat that sub-step as N/A — `verify:oauth-gating` is the operative Phase 4 gate.

## Steps

1. **Verify build-config layer is at parity defaults:**

   ```bash
   unset OPENWHISPR_OAUTH_GOOGLE OPENWHISPR_OAUTH_APPLE OPENWHISPR_OAUTH_MICROSOFT
   unset OPENWHISPR_BACKEND_URL OPENWHISPR_AUTH_URL OPENWHISPR_BACKEND_URL_PATTERN
   npm run verify:parity         # Phase 3 grep gate (skip if not present)
   npm run verify:oauth-gating   # Phase 4 bundle-grep gate
   ```

   Both must exit 0 (or `verify:parity` is N/A if Phase 3 Plan 6 wasn't shipped in this branch).

2. **Run a signed build (no env vars):**

   ```bash
   # NOTE: do NOT set CSC_IDENTITY_AUTO_DISCOVERY=false — we want signing to run.
   npm run build
   ```

   Expected:

   - Build completes; `dist/mac-arm64/OpenWhispr.app` (or equivalent target) is produced.
   - `afterSign.js` runs (look for "[afterSign]" or "Notarizing" in stdout) — if `afterSign.js` is absent, electron-builder still signs via the `electron-builder.json` `mac` block.
   - Notarization completes (no error from `xcrun stapler` / `notarytool`).
   - The packaged app's signature is valid: `codesign --verify --deep --strict --verbose=2 dist/mac-arm64/OpenWhispr.app` exits 0.

3. **Confirm electron-builder protocol-scheme default landed in Info.plist:**

   Inspect the produced `Info.plist`:

   ```bash
   defaults read "$(find dist -name '*.app' | head -1)/Contents/Info.plist" CFBundleURLTypes
   ```

   Expected: contains `CFBundleURLSchemes = ("openwhispr")` (the default scheme).

4. **Smoke-launch the binary:**

   ```bash
   open "$(find dist -name '*.app' | head -1)"
   ```

   Expected: app launches without Gatekeeper warnings (notarization stapled).
   Open onboarding → confirm 3 OAuth buttons visible (Apple on macOS only).

## Pass criteria

- [ ] `npm run verify:parity` exits 0 (or N/A if Phase 3 Plan 6 not shipped).
- [ ] `npm run verify:oauth-gating` exits 0.
- [ ] `npm run build` (default, no env) completes signing + notarization with no errors.
- [ ] `codesign --verify --deep --strict` on the produced .app exits 0.
- [ ] Info.plist `CFBundleURLSchemes` contains `openwhispr`.
- [ ] Launched app shows Google + Microsoft (and Apple on macOS) sign-in buttons in onboarding.

## Failure handling

If signing fails: do NOT modify `afterSign.js` or `electron-builder.config.js`/`electron-builder.json` — those are out of Phase 4's modification scope. Either:

1. The signing-cert / notarization env vars aren't set (operator issue — re-export and retry).
2. Phase 3's electron-builder config regressed something — file a bug against Phase 3, do not patch under Phase 4.

## Sign-off

Date completed: __________
Operator: __________
Result: PASS / FAIL
Notes: __________
