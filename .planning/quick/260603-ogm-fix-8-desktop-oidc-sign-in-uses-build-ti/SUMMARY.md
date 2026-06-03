---
status: complete
quick_id: 260603-ogm
date: 2026-06-03
commit: eb9716d4
---

# Summary — Fix #8: desktop OIDC sign-in honors runtime serverUrl

## What

Server peer (openwhispr-server) reported a HIGH-severity auth-leak: on a
self-hosted build, desktop OIDC sign-in deep-linked to the build-time
`AUTH_URL` (default `yambr.com`) instead of the user-configured runtime server,
so the OAuth flow left the org's server and timed out.

## Root cause (verified against source, not memory)

`src/lib/auth.ts:364` (the Electron branch of `signInWithSocial`) built the
`/api/desktop-signin/<provider>` deep-link against the bare build-time constant
`AUTH_URL`. The email/password path goes through `authClient` →
`resolveBaseURL()` (`auth.ts:33-38`), which returns
`useSettingsStore.getState().serverUrl || AUTH_URL` and therefore honors the
runtime server. The OIDC path bypassed that resolver.

This is the fork's **own** v1.8.0 runtime-host feature (HOST-01/02/03) being
incompletely applied — the HOST-03 sweep
(`01-02-host-03-sweep-PLAN.md`) wired the callback + reset-password literals but
missed the desktop-signin host. Fixing it completes our own fork drift; it is
NOT an upstream patch and NOT migrating the client to match the server
(`client_immutable` honored). The touched line is upstream-verbatim, but the
runtime-host resolver it now calls is fork-only — so this is "finish the fork
feature," the legitimate in-bounds case.

## Change

- `src/lib/auth.ts` — Electron branch: `const baseURL = resolveBaseURL();`
  then `new URL(`${baseURL}/api/desktop-signin/${provider}`)`. `resolveBaseURL`
  stays unexported (export surface byte-identical to upstream). Updated the
  stale SSRF comment (the host is now the runtime serverUrl, still SSRF-safe
  because serverUrl is HTTPS-only + RFC1918/loopback/link-local screened at
  entry in `ServerUrlField.tsx` M2/WARN-02).
- `test/helpers/signInWithSocialLockdown.test.js` — red→green regression: with
  `serverUrl = https://org.example`, the opened URL origin must be
  `org.example`; with `serverUrl` null it falls back to `AUTH_URL`.

Untouched (correct as-is): browser branch (uses authClient, already resolves),
`DESKTOP_OAUTH_CALLBACK_URL` (protocol redirect, correctly build-time), i18n.

## Verification

- RED confirmed: pre-fix the origin was `AUTH_URL`, test failed.
- GREEN after fix. Full suite **129/129**.
- `git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export"` — no new
  export (only the 3 pre-existing fork-drift export lines).
- Code review (REVIEW.md): **VERDICT GO**. SSRF/trailing-slash/parity/test-
  quality/scope all clean.

## Commit

`eb9716d4` — `fix(auth): desktop OIDC sign-in honors runtime serverUrl (#8, 260603-ogm)`

## Follow-up filed (NOT part of this commit)

Code review surfaced **WR-01** (pre-existing, fork-only): the HOST-02 test
hooks at `auth.ts:152-166` (`window.__zustand_setServerUrl`,
`authClientBaseUrlForTest`, `__authClientForTest`) are registered
UNCONDITIONALLY in the production renderer. `__zustand_setServerUrl` writes the
store bypassing the `ServerUrlField` SSRF validation that this fix's safety
argument relies on. Mitigated in practice by `contextIsolation: true` (web
content can't reach `window`), so the precondition is renderer code-execution.
Should be gated before the v1.8.0 release. See WR-01.md. The correct gate is
the e2e launch signal `NODE_ENV === "test"` (set in
`tests/e2e/fixtures/electron-launch.ts`) — NOT a naive `import.meta.env.DEV`
(would need bundler-aware verification that the e2e renderer build sees it).
Deferred from this task to avoid scope-creep + a rushed bundler-gating mistake.
