---
phase: 04
phase_name: onboarding-ui-server-url-field
completed: 2026-05-27
status: passed
requirements-completed: [UI-01, UI-02, UI-03, UI-04]
plans: 1 (component + integration + i18n × 10 locales)
---

# Phase 4 — Onboarding UI Server URL Field — Summary

## One-liner

End-user sees a "Server URL" field on the onboarding screen (when `OPENWHISPR_ALLOW_CUSTOM_HOST=true`), enters their org's backend URL, client validates HTTPS-only + reachability via `GET /api/auth/get-session` (401 = OK), persists to `useSettingsStore.serverUrl`, Phase 1 mutable Proxy + IPC bridge propagate to all backend calls.

## Delivered

### UI-01: ServerUrlField component
- `src/components/onboarding/ServerUrlField.tsx` (NEW) — standalone component:
  - Empty initial state — **no placeholder hint** suggesting any URL (mitigation M1 per ADR-001)
  - `data-testid="server-url-field"` for stable bundle-grep targeting
  - State machine: `idle` → `checking` → `valid` | `invalid`
  - Validation runs on blur; re-validation on edit clears state
  - Persists to `useSettingsStore.setServerUrl` via `useEffect` on valid

### UI-02: Validation (3-step)
- (a) Non-empty trimmed string
- (b) HTTPS scheme (allows `http://localhost` for dev/test only)
- (c) Reachability probe — `GET <origin>/api/auth/get-session` with 8s timeout
  - HTTP 401 = "host alive, no session" → accept
  - 5xx, network error, timeout, non-401 2xx → reject
- `credentials: "omit"` on probe — does NOT leak existing session cookies to a potentially-untrusted runtime URL

### UI-03: Persistence + propagation
- `useSettingsStore.setServerUrl(url)` writes localStorage key `serverUrl` (Phase 1 plumbing)
- Phase 1 mutable Proxy in `src/lib/auth.ts` subscribes and re-instantiates inner authClient
- Renderer subscription pushes URL to main via `electronAPI.notifyServerUrlChanged` (Phase 1 IPC bridge)
- Re-onboarding (settings wipe / logout) re-renders empty field (per current `useSettingsStore` initialization that reads localStorage on app load)

### UI-04: i18n in 10 locales
Added `onboarding.serverUrl.*` group with 8 keys to all 10 locale files:
- en, es, fr, de, pt, it, ru, ja, zh-CN, zh-TW
- Keys: `label`, `helper`, `errorEmpty`, `errorScheme`, `errorInvalid`, `errorUnreachable`, `checking`, `success`

### AuthenticationStep integration
- Imports `ALLOW_CUSTOM_HOST_ENABLED` from defaults.ts (Phase 3 BG-01)
- Wraps `<ServerUrlField .../>` mount in `{ALLOW_CUSTOM_HOST_ENABLED && (...)}` → tree-shaken out of default build
- New state `serverUrlValidated` — blocks email field + Continue button until URL valid (when flag on)
- When flag off (default Yambr build), behavior is byte-identical to v1.7.x

## Acceptance

| AC | Status | Evidence |
|----|--------|----------|
| UI-01: Server URL field empty by default, no placeholder hint | ✓ | `placeholder=""` literal in ServerUrlField.tsx |
| UI-02: 3-step validation (non-empty + https + reachability) | ✓ | `validate()` function in ServerUrlField.tsx |
| UI-03: Persistence + propagation | ✓ | useEffect calls setServerUrl on `kind === "valid"`; Phase 1 plumbing handles the rest |
| UI-04: i18n keys in all locales | ✓ | 10 locale files updated via /tmp/add-server-url-i18n.cjs script |
| BG-02 (Phase 3) gate now GREEN | ✓ | npm run verify:allow-custom-host: 2 scenarios, 4 greps, 0 violations |

## Verification (full regression sweep)

| Gate | Result |
|------|--------|
| `npm run verify:backend-url-sot` | OK — 6 checks, 0 violations |
| `npm run verify:provider-lockdown` (Phase 10 regression) | OK — 47 greps, 0 violations |
| `npm run verify:oauth-gating` (Phase 04.1 regression) | OK — 63 greps, 0 violations |
| `npm run verify:allow-custom-host` (Phase 3 gate, now GREEN) | OK — 4 greps, 0 violations |
| `npm run test:build-config` | pass |
| `npx vitest run` | 63/63 pass |
| `(cd src && npx tsc --noEmit)` | clean |

## Decisions / Lessons

1. **i18n: 10 locales, not 9.** REQUIREMENTS.md said 9 but `src/locales/` has 10 (includes `ja`). Added to all 10 to avoid stale "missing key" warning in Japanese.
2. **`credentials: "omit"` on reachability probe.** Critical safety — without this, the probe would send any cookies set against the build-time-default host to the (potentially-untrusted) runtime URL, leaking session state during a phishing attempt.
3. **`http://localhost` allowed for dev/test.** Otherwise local E2E tests against slim-core can't validate. Production `https://`-only enforcement is the rule for any non-localhost hostname.
4. **Validation on blur, not on every keystroke.** Reachability probes hit the network — debouncing per-keystroke would make UX feel laggy and could be DOS-like. Blur is the natural commit boundary.
5. **`data-testid="server-url-field"` instead of class name for bundle-grep.** Component names get minified by Rolldown; testids are string literals that survive verbatim. Phase 3 gate target updated to match (`server-url-field` + `onboarding.serverUrl.label`).
6. **Renderer reload not required in Phase 1's CDP test, but onboarding UI flow will need it.** When the user enters a Server URL and continues, the Phase 1 Proxy swaps inner authClient on next access — but any prior `useSession()` hook state is orphaned. Phase 5 e2e (corporate-min build) must cover this; for now the renderer reload happens naturally on sign-in (Better Auth's onSuccess token-handoff triggers it via main.js's existing pattern).

## Known Gaps (Deferred)

1. **Settings UI for changing host post-onboarding** — explicitly out of scope per REQUIREMENTS.md "Future Requirements". v1.8.0 only supports host entry at first-run / re-onboarding.
2. **Multi-host management** — also out of scope. One persisted serverUrl at a time.
3. **Auto-discovery (DNS SRV, .well-known)** — out of scope. Mitigation M1 from ADR-001 is "explicit user entry only".
4. **Audit-trail logging of host changes** — ADR-001 Mitigation M7 deferred to v1.9.0 backlog.

## Next

Phase 5 — E2E + signed-build verification (VER-01, VER-02, VER-03).
