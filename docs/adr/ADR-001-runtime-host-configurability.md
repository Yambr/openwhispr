# ADR-001: Runtime Backend-Host Configurability

**Status:** Accepted (2026-05-26)
**Milestone:** v1.8.0
**Phase:** 2 (Policy ADR)
**Supersedes:** N/A
**Superseded by:** N/A

## Context

Prior to v1.8.0, OpenWhispr (Yambr fork) followed a strict "Build-time only configurability" rule (documented in `PROJECT.md` Constraints). All deployment-specific configuration — backend URL, OAuth providers, model registry overrides, feature flags — lived in build-time environment variables consumed by `scripts/generate-build-config.js` and baked into `src/config/build-config.generated.{ts,cjs}` at pack/build time. Runtime had no way to change which backend the binary talked to.

This rule had three motivations:

1. **Attack-surface reduction** — a binary that can be redirected to a different host at runtime is a phishing target. An attacker who can convince the user to enter a malicious URL captures BYOK API keys and Better Auth session tokens at the point the user signs in.
2. **Auditability** — a build-time-baked binary has a single, statically-known network destination. `network-allowlist.md` documentation, security review, and corporate firewall rules can all be written against the exact URL the binary will hit.
3. **Operational simplicity** — no configuration UI to maintain, no settings-persistence edge cases, no migration logic for users switching between hosts.

For v1.7.x, the rule held cleanly. A corporate self-hoster compiled their own binary with `OPENWHISPR_BACKEND_URL=https://acme.com` set at build time. The trade-off — that this required compiling from source — was acceptable for the audience (server-side maintainers).

For v1.8.0, the trade-off no longer holds. The target audience expanded to include **end-users** at corporations who want to install a prebuilt binary and point it at their organization's backend, without compiling. The "compile from source" gate is too steep for this audience.

## Decision

The "Build-time only configurability" rule is **consciously relaxed for backend-host selection only**. All other configurability (OAuth provider gating, model registry, feature flags, OAuth client IDs, etc.) **remains build-time only**.

Concretely:

1. The renderer can read a persisted Server URL from `useSettingsStore.serverUrl` (localStorage-backed) and use it as the base URL for all Better Auth and `/api/*` calls.
2. The main process honors the same Server URL via a `settings:server-url-changed` IPC channel that updates `src/helpers/backendUrlState.js`.
3. The Server URL is settable through a single UI surface: an empty "Server URL" field on the onboarding screen (first run, post-logout, post-wipe). There is **no Settings UI for changing host post-onboarding** in v1.8.0 — host change requires re-onboarding.
4. The Server URL field is gated behind a build-time flag `OPENWHISPR_ALLOW_CUSTOM_HOST` (default `false`). The default Yambr build ships with the flag off; the field is **physically tree-shaken from the bundle** and ordinary Yambr users see no behavioral change from v1.7.x. Corporate-minimal builds that need the field set `OPENWHISPR_ALLOW_CUSTOM_HOST=true` at build time.

## Threat Model

The principal threat is **phishing via malicious host substitution**:

1. **Attacker convinces user to enter `https://evil.example/auth` on onboarding.** Better Auth client connects there. User enters email + password. Attacker captures credentials and any subsequent BYOK API keys the user provides.
2. **Attacker compromises an organization's DNS/network path.** Even with the legitimate URL `https://openwhispr.acme.com`, an MITM rewrites traffic. (TLS pinning would mitigate this; we don't pin.)
3. **Attacker tricks user into pasting an attacker-controlled URL via a deeplink.** Mitigated in v1.8.0 by **not implementing** deeplink-based host configuration (`openwhispr://configure?host=...`) — explicitly out of scope per `REQUIREMENTS.md`.
4. **Local malware writes a malicious `serverUrl` into the app's localStorage.** The renderer reads it on next launch. Mitigated weakly — localStorage isn't a secret store; any process with file-system access to the app's user-data directory can write here. Acceptable because such an attacker already has equivalent access to API keys via `safeStorage`.

## Mitigations Enumerated

The following mitigations are in scope for v1.8.0 and MUST be implemented:

| # | Mitigation | Phase |
|---|------------|-------|
| M1 | **Explicit user entry only.** No auto-discovery (DNS SRV, .well-known), no deeplinks, no MDM/Group Policy. The user types the URL themselves with full awareness. | 4 (UI-01: empty field, no placeholder hint) |
| M2 | **HTTPS-only enforcement.** Field validation requires `https://` scheme. `http://` is rejected. | 4 (UI-02) |
| M3 | **Reachability probe before persist.** Client makes a `GET <host>/api/auth/get-session` call and accepts only HTTP 401 as a "host alive" signal. 5xx / timeout / network error blocks progression with a localized error. | 4 (UI-02) |
| M4 | **No data carry-over between hosts.** Host change = full re-auth + new session. The user cannot accidentally export notes/conversations from `acme.com` to `evil.example` by switching the URL. (Implementation: onboarding flow only; re-onboarding wipes prior session state.) | 4 (UI-03 re-onboarding behavior) |
| M5 | **Default-hidden field.** Default Yambr build hides the Server URL field entirely via build-time `OPENWHISPR_ALLOW_CUSTOM_HOST=false`. Ordinary users cannot phish themselves accidentally — the field doesn't render at all. | 3 (BG-01, BG-02) |
| M6 | **Bundle-grep verification.** A tree-shake gate (`verify-allow-custom-host.js` or extension of `verify-provider-lockdown.js`) asserts the Server URL field's component name and i18n keys are absent from the default-build bundle. | 3 (BG-02) |
| M7 | **Audit trail.** Every host change is logged at debug level. (Implementation deferred — not required for v1.8.0 acceptance; flagged as v1.9.0 backlog.) | Out of scope |

## What's NOT Relaxed

The following remain **strictly build-time only** in v1.8.0:

- OAuth provider gating (`OPENWHISPR_OAUTH_GOOGLE`, `OPENWHISPR_OAUTH_APPLE`, `OPENWHISPR_OAUTH_MICROSOFT`)
- Feature flags (`OPENWHISPR_BILLING`, `OPENWHISPR_REFERRALS`, `OPENWHISPR_STREAMING`, `OPENWHISPR_PROVIDER_LOCKDOWN`)
- Model registry overrides (`OPENWHISPR_OPENAI_BASE_URL`, etc.)
- OAuth client IDs / endpoints (`OPENWHISPR_OAUTH_GOOGLE_*`, `OPENWHISPR_OAUTH_RESET_PASSWORD_URL`, `OPENWHISPR_SHARE_VIEWER_URL`, etc.)
- Custom-protocol scheme (`OPENWHISPR_OAUTH_PROTOCOL_SCHEME`)
- The realtime WSS URL (`OPENWHISPR_REALTIME_WSS_URL`) — though it derives from the backend URL automatically (Phase 5 of v1.7.2)

Maintainers who need to ship a build with a different OAuth provider mix, different feature flags, or a different model registry still compile from source with their own env vars. Only the **backend host** is now run-time mutable.

## Consequences

### Positive

- End-users can install a prebuilt binary and point it at their corporate backend without compiling.
- The onboarding flow becomes self-service for self-hosters.
- The build-time gate (M5) keeps default Yambr users on the exact same code path as v1.7.x — zero regression risk for the default audience.

### Negative

- New attack surface: phishing via malicious URL entry. Mitigated by M1-M6 above; residual risk accepted.
- One new field in `useSettingsStore` (`serverUrl`) requires defensive handling in every Better Auth call site. Centralized via the mutable Proxy in `src/lib/auth.ts` (Phase 1).
- Renderer reload required on URL change (`useSession()` hook orphan). Phase 4 onboarding flow handles this; not a recurring UX cost since host changes happen only at onboarding.
- The "single static URL" property used in `docs/network-allowlist.md` documentation is weakened — corporate-minimal builds with the flag ON have a variable URL. The default Yambr build retains the static-URL property.

### Neutral

- The build-time generator (`scripts/generate-build-config.js`) gains one new boolean (`ALLOW_CUSTOM_HOST_ENABLED`) but no other structural change. Pattern matches existing flags (`PROVIDER_LOCKDOWN_ENABLED`, `BILLING_ENABLED`).

## Implementation Phases (v1.8.0)

- Phase 1 — Backend URL SoT Consolidation + Dynamic Better Auth (HOST-01/02/03) — **complete**
- Phase 2 — This ADR + PROJECT.md amendment — **this work**
- Phase 3 — `OPENWHISPR_ALLOW_CUSTOM_HOST` build-time gate (BG-01/02)
- Phase 4 — Onboarding UI Server URL field (UI-01/02/03/04)
- Phase 5 — Playwright E2E + signed-build smoke (VER-01/02/03)

## References

- `.planning/PROJECT.md` Key Decisions, Pivot 2026-05-26
- `.planning/REQUIREMENTS.md` v1.8.0 milestone requirements
- `.planning/milestones/v1.7.2-MILESTONE-AUDIT.md` integration-check INT-01/INT-02 (the technical findings that motivated this ADR)
- `.planning/phases/01-*/01-SUMMARY.md` Phase 1 deliverables
- `CLAUDE.md` — original "Build-time only configurability" rule (now amended per this ADR)
