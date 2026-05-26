# Milestones

## v1.7.2 — Documentation + Build-time Configurability + Corporate-Minimal Default (Shipped: 2026-05-26)

**Phases:** 11 (1, 2, 3, 4, 04.1, 5, 6, 7, 8, 9, 10)
**Plans:** 41 plans across 11 phases
**Audit:** `tech_debt` verdict, 14/16 requirements satisfied (1 partial, 1 superseded), 0 unsatisfied
**Tag:** `v1.7.9` (package.json on `1.7.9`; v1.7.8 was the prior in-milestone release)

### Delivered

- **Reverse-engineered wire contract** — `docs/BACKEND_SPEC.md` (19 cloud endpoints), `docs/OAUTH_SPEC.md` (OpenWhispr cloud + Google Calendar), `docs/SELF_HOSTING.md` walkthrough.
- **Architecture + hardcode inventory** — `docs/ARCHITECTURE.md` (531 lines, process model + IPC + sidecars), `docs/CONFIG_INVENTORY.md` (5-column hardcode table with proposed env-var names).
- **Build-time configurability** — All inventoried hardcodes refactored to `OPENWHISPR_*` env vars via Vite `define` (renderer) + `process.env` (main). Generator emits `src/config/build-config.generated.{ts,cjs}`, consumed via SoT `src/config/defaults.ts`.
- **Per-provider OAuth gating** — `OPENWHISPR_OAUTH_GOOGLE/APPLE/MICROSOFT` flags tree-shake disabled providers out of the renderer bundle. `verify:oauth-gating` gate: 4 scenarios, 51 greps, 0 violations.
- **Corporate-minimal pivot (2026-05-08)** — `BILLING_ENABLED`, `REFERRALS_ENABLED`, `STREAMING_ENABLED` flags default `false`. Stripe/Referrals UI physically removed from default build via Rolldown DCE.
- **Realtime through corporate backend (Phase 5)** — `OPENWHISPR_REALTIME_WSS_URL` derives from `OPENWHISPR_BACKEND_URL`. STREAMING default flipped `true` with B1 auto-disable (no realtime URL → STREAMING off).
- **Upstream OpenWhispr v1.7.2 merged (Phase 6)** — 7 upstream bugfixes integrated; recurring maintenance template established. Fork remains one patch ahead per CLAUDE.md versioning rule.
- **Client↔Server compatibility audit (Phase 8)** — `COMPATIBILITY-MATRIX.md`: 21 MATCH / 2 MISMATCH / 7 MISSING-server / 13 MISSING-client. 0 blockers for corporate-minimal.
- **Client E2E suite (Phase 9)** — Playwright + `@cucumber/cucumber` + `playwright-bdd`. 12 feature files, 44 passed / 0 failed against local slim-core `openwhispr-server`. Server R1-R18 requirements filed and closed.
- **Provider lockdown (Phase 10)** — Single flag `OPENWHISPR_PROVIDER_LOCKDOWN=true` produces corporate-minimal client: zero OAuth buttons, Cloud + Local only, BYOK + enterprise providers physically DCE'd. 62 renderer refs + 7 main refs, 0 orphans. Live UAT passed on `openwhispr.yambr.com`.

### Known Gaps (accepted as tech debt)

- **CFG-03 partial** — `src/components/IntegrationsView.tsx` Google Calendar card not gated by standalone `OAUTH_GOOGLE_ENABLED`. Superseded in the corporate-minimal default by Phase 10 `PROVIDER_LOCKDOWN_ENABLED`, which gates the entire `ApiKeysSection`. Standalone single-provider disable (without lockdown) remains unsupported.
- **CFG-06 superseded** — Original "default-build parity with upstream Yambr fork" requirement superseded by CFG-09 per 2026-05-08 corporate-minimal pivot. PROJECT.md ratified.
- **Phase 03 HUMAN-UAT** — 2 pending manual scenarios (default-build smoke walk, custom-protocol Google Calendar smoke). Build mechanically verified; manual smoke deferred.
- **Phase 04 HUMAN-UAT** — Signed-build SC #4 not formally signed off. De-facto verified by shipped notarized releases v1.7.6, v1.7.7, v1.7.8 on GitHub.
- **Quick-tasks missing SUMMARY sentinel** — `260523-byok-preload-hotfix` (work shipped in commit `16543048`), `260526-lang-realtime-preferred-language` (work shipped in `081493a2`, `146868cc`, `6909d5fc`). Both functionally complete on main.

**Known deferred items at close: 9** (see STATE.md `## Deferred Items`)

### v1.8.0 Carry-Forward (per integration-check INT-01/INT-02)

The next milestone (Custom Server URL onboarding) must address these BEFORE adding UI:

1. **Backend URL SoT consolidation** — Two parallel env-var channels (`OPENWHISPR_BACKEND_URL` vs `OPENWHISPR_API_URL` via `VITE_OPENWHISPR_API_URL`) for the same semantic. Renderer reads `OPENWHISPR_API_URL` (26 call sites in `ipcHandlers.js` via `getApiUrl()`); Phase 3 declared `OPENWHISPR_BACKEND_URL` as SoT but renderer never imports it. CI papers over by setting both to the same value. Convention, not architecture.
2. **Better Auth dynamic URL** — `src/lib/auth.ts:12` `createAuthClient({ baseURL: AUTH_URL })` is a frozen module-singleton with build-time-only `AUTH_URL`. Runtime URL reconfiguration impossible without refactor to lazy factory or mutable proxy.
3. **3 hardcoded URLs missing from CONFIG_INVENTORY** — `src/lib/auth.ts:177` (`DESKTOP_OAUTH_CALLBACK_URL`), `src/lib/auth.ts:227` (reset-password redirect), `src/components/notes/ShareNoteDialog.tsx:26` (`SHARE_VIEWER_BASE_URL`). Sweep into `defaults.ts` during consolidation.

See `.planning/milestones/v1.7.2-MILESTONE-AUDIT.md` and `.planning/v1.7.2-INTEGRATION-CHECK.md` for full evidence.

---
