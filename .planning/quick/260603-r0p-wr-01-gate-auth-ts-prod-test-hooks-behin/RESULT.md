---
quick_id: 260603-r0p
status: complete
commit: be1cb424
---

# WR-01 Result

## npm test
13/13 files, 146/146 tests — ALL PASS. No harness changes needed.
authClientProxy.test.js (18): PASS. signInWithSocialLockdown.test.js (14): PASS.
Neither test file reads the gated hooks.

## tsc --noEmit
Exit 0 — clean.

## Export parity (git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export")
Three pre-existing fork-drift lines only (AUTH_URL, authClient, SocialProvider).
Zero new +export lines added by this change.

## Production-absence proof
Automatable: gate condition is `window.electronAPI?.isE2E === true`; preload sets
`isE2E = (process.env.NODE_ENV === "test")` — false when NODE_ENV unset (production).
Registration block is unreachable in production by code inspection.

Manual / deferred to CI:
- CDP check: `window.__zustand_setServerUrl === undefined` in non-test build
- @host e2e suite must pass under NODE_ENV=test (electron-launch.ts sets it)
Both are required gates before v1.8.0 ship.
