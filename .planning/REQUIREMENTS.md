# Requirements

Scope: **Milestone v1.8.0 — Custom Server URL Onboarding** for the Yambr OpenWhispr fork.

Acceptance for v1.8.0 (whole milestone): An end-user installing a corporate-minimal build sees an editable "Server URL" field on the onboarding screen (empty by default, no placeholder hint). They type their organization's backend URL, the client validates it (syntax + reachability), persists it, and uses it for every subsequent Better Auth and `/api/*` call. The default Yambr build hides the field entirely and continues using the compiled-in backend default — behaviorally indistinguishable from v1.7.x for ordinary Yambr users.

This milestone consciously relaxes the "Build-time only configurability" rule for backend host selection only. All other configurability (OAuth providers, model registry, feature gates) remains build-time. Documented as Pivot 2026-05-26 in `PROJECT.md`.

---

## v1.8.0 Requirements

### Backend URL Single Source of Truth (HOST)

- [ ] **HOST-01**: Single SoT for backend host. Collapse `OPENWHISPR_API_URL` (via `VITE_OPENWHISPR_API_URL`) and `OPENWHISPR_BACKEND_URL` into one variable. Renderer (26 call sites in `src/helpers/ipcHandlers.js` via `getApiUrl()`, plus `AuthenticationStep.tsx`, `EmailVerificationStep.tsx`, `src/lib/auth.ts`) and main process consume the same source via `src/config/defaults.ts`. CI `release.yml:114-117,128-131` simplified to set only one env var. Acceptance: `grep -r "OPENWHISPR_API_URL\b" src/` returns zero matches outside the deprecated-alias shim (if any), or zero matches entirely if no shim is kept.

- [ ] **HOST-02**: Better Auth client supports runtime base URL change. Refactor `src/lib/auth.ts:12` from frozen module-singleton `authClient = createAuthClient({ baseURL: AUTH_URL })` to either (a) lazy factory function `getAuthClient()` that re-resolves baseURL from persisted settings on each call, OR (b) mutable proxy that re-creates the inner client when settings change. Acceptance: a renderer-level integration test changes the persisted Server URL, calls `signInWithEmail`, and observes the request hit the new host (not the build-time default).

- [ ] **HOST-03**: Inventory sweep — three hardcoded URLs surfaced by Phase 8 integration check (`src/lib/auth.ts:177` DESKTOP_OAUTH_CALLBACK_URL, `src/lib/auth.ts:227` reset-password redirectTo, `src/components/notes/ShareNoteDialog.tsx:26` SHARE_VIEWER_BASE_URL) moved to `src/config/defaults.ts` and read from build-time SoT. `docs/CONFIG_INVENTORY.md` updated with the three new rows. Acceptance: `grep` for the three literal URLs in `src/` returns matches only inside `defaults.ts`.

### Build-time Gate (BG)

- [ ] **BG-01**: New build flag `OPENWHISPR_ALLOW_CUSTOM_HOST` added to `BOOL_DEFAULTS` in `scripts/generate-build-config.js`, default `false`. Re-exported via `src/config/defaults.ts` direct named re-export (DCE-safe pattern from Phase 04.1 / Phase 10). Documented in `docs/BUILD_CONFIG.md` with worked example. Acceptance: `node scripts/generate-build-config.js` unset → `ALLOW_CUSTOM_HOST_ENABLED = false`; `OPENWHISPR_ALLOW_CUSTOM_HOST=true` → `ALLOW_CUSTOM_HOST_ENABLED = true`.

- [ ] **BG-02**: Server URL field is physically tree-shaken from the renderer bundle when `OPENWHISPR_ALLOW_CUSTOM_HOST=false`. `verify-provider-lockdown.js` (or sibling gate) extended with `ALLOW_CUSTOM_HOST` target group asserting field literals (component name, i18n keys) absent from default-build bundle and present from corporate-minimal-build bundle. Acceptance: bundle-grep gate runs 2+ scenarios, 0 violations.

### Onboarding UI (UI)

- [ ] **UI-01**: Onboarding screen adds a third field "Server URL" alongside email and password, rendered ONLY when `ALLOW_CUSTOM_HOST_ENABLED === true`. Field is initially empty — no value, no placeholder text suggesting `openwhispr.yambr.com` or any other URL. User must type the host explicitly.

- [ ] **UI-02**: Server URL validation runs on submit (or on field blur). Three checks in order: (a) non-empty trimmed string; (b) valid `https://` URL syntax (URL constructor parses without throwing, protocol === "https:"); (c) reachability probe — `GET <host>/api/auth/get-session` — accepts HTTP 401 as OK (Better Auth signal "host alive, no session"), rejects 5xx, network error, timeout (8 seconds). On failure: localized error message, field highlights, user cannot proceed.

- [ ] **UI-03**: Successful validation persists the URL in settings (via existing `safeStorage` / `electron-store` pattern). All subsequent Better Auth calls and `/api/*` IPC handlers use the persisted URL via HOST-02's dynamic resolution. Logout or first-run after settings wipe re-shows the empty Server URL field.

- [ ] **UI-04**: All user-facing strings (field label, placeholder if any, validation messages, error toasts) routed through `react-i18next` with keys added to all 9 locale files (`src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json`). Acceptance: `grep -L "<new-i18n-key>" src/locales/*/translation.json` returns empty (all locales have the key).

### Verification (VER)

- [ ] **VER-01**: Playwright E2E scenario added to `tests/e2e/` for the corporate-minimal-build path: launch app → see Server URL field → type valid corp URL → reachability probe succeeds → email/password sign-in completes → first `/api/*` call hits the typed host (verified via mock server log or network trace). Negative scenario: invalid URL → error shown → user blocked.

- [ ] **VER-02**: Default Yambr build smoke check (manual or automated): launch with `OPENWHISPR_ALLOW_CUSTOM_HOST` unset (the default) → onboarding shows only email/password, no Server URL field → sign-in goes to compiled-in `OPENWHISPR_BACKEND_URL` exactly as in v1.7.x.

- [ ] **VER-03**: Signed + notarized build still completes successfully with new flag set (`OPENWHISPR_ALLOW_CUSTOM_HOST=true npm run build`). `codesign --verify --deep --strict` exits 0. UAT walkthrough captured in `XX-HUMAN-UAT.md` for the final phase.

---

## Future Requirements (Deferred Beyond v1.8.0)

Tracked here for traceability; not built in this milestone.

- Auto-discovery of corporate backend: DNS SRV `_openwhispr._tcp.<email-domain>` lookup or `https://openwhispr.<email-domain>/.well-known/openwhispr-config` probe. Considered and explicitly rejected for v1.8.0 to keep manual-entry-only as the simplest model. Requires server-side `.well-known` endpoint (filed against `openwhispr-server` if revived).
- Deeplink handler `openwhispr://configure?host=...` for admin-distributed onboarding links. Same fishing surface as manual entry; deferred until clear use case emerges.
- MDM / config profile / Group Policy distribution (macOS `.mobileconfig`, Windows GPO, Linux `/etc/openwhispr/config.json`). Cleanest path for IT-managed deployments; deferred until corporate customer asks for it.
- Runtime host switching after sign-in — Settings UI for changing host post-onboarding. v1.8.0 only supports host entry at first-run / re-onboarding (after logout or wipe).
- Migration / sync of already-signed-in user data from old host to new (notes, conversations, etc.). v1.8.0 treats host change as a full re-auth + new session; no data carry-over.

---

## Out of Scope

- **Server-side `.well-known/openwhispr-config` endpoint** — auto-discovery is deferred; nothing to ask of the server in v1.8.0.
- **Runtime configurability beyond backend host** — OAuth provider gating, model registry, feature flags (BILLING/REFERRALS/STREAMING/PROVIDER_LOCKDOWN) all remain build-time only. The v1.8.0 pivot is scoped narrowly to host selection.
- **Replacing build-time gate `OPENWHISPR_ALLOW_CUSTOM_HOST`** — corporate-minimal builds opt-in; default Yambr build stays unchanged.
- **Multi-host management UI** — user can have exactly one persisted Server URL at a time. Switching = re-onboard.
- **Backend host migration tooling** — no automated data move from old host to new.

---

## Traceability

Each requirement maps to exactly one phase. Phase 2 (Policy ADR) has no mapped requirement — it is pure policy/docs work that produces no acceptance artifact; the policy is enacted by BG-01/BG-02 in Phase 3.

| REQ-ID  | Phase   |
|---------|---------|
| HOST-01 | Phase 1 |
| HOST-02 | Phase 1 |
| HOST-03 | Phase 1 |
| BG-01   | Phase 3 |
| BG-02   | Phase 3 |
| UI-01   | Phase 4 |
| UI-02   | Phase 4 |
| UI-03   | Phase 4 |
| UI-04   | Phase 4 |
| VER-01  | Phase 5 |
| VER-02  | Phase 5 |
| VER-03  | Phase 5 |

**Coverage:** 12/12 v1.8.0 requirements mapped. No orphans, no duplicates. Phase 2 is unmapped policy work (intentional — see note above).
