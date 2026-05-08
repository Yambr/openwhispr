# Phase 3: Build-time Env Refactor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 03-build-time-env-refactor
**Areas discussed:** Fallback strategy, electron-builder config, parity validation, deduplication

---

## Fallback Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Centralized defaults module | Single `src/config/defaults.ts`; all call sites import from it. Grep for hardcoded URLs outside defaults returns 0. | ✓ |
| Inline `env.X \|\| "..."` everywhere | Keep fallbacks at every call site. Fails ROADMAP success criterion #1 grep gate. | |
| Strict env vars (build fails without them) | `.env.production` checked into repo with defaults. Breaks dev workflow. | |

**User's choice:** Centralized defaults module
**Notes:** Aligns with ROADMAP success criterion #1 (zero hardcoded literals after refactor) and #4 (default-build behavioral parity).

---

## electron-builder Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| `electron-builder.config.js` | Convert JSON → JS module that reads `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME`. electron-builder supports JS configs natively. | ✓ |
| `extraMetadata` CLI injection | Pass `--config.protocols.schemes=$VAR` in npm scripts. Less refactor, harder to read. | |
| Pre-build script generates JSON | `scripts/prepare-builder-config.js` writes JSON from template + env. Generated file ambiguity. | |

**User's choice:** electron-builder.config.js
**Notes:** Native, clean, single source of resolution.

---

## Parity Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Grep + manual smoke checklist | Automated grep gate confirms defaults appear once; manual checklist in `SELF_HOSTING.md` verifies sign-in / transcription / OAuth flows. | ✓ |
| Build both variants and diff bundle | Diff `app.asar` before/after. Absolute guarantee but Vite minify produces different identifier names — high friction. | |
| Integration tests with mock backend | Mock auth.openwhispr.com / api.openwhispr.com servers. Reusable in Phase 4 but expands Phase 3 scope. | |

**User's choice:** Grep + manual smoke checklist
**Notes:** Smoke checklist lives in `docs/SELF_HOSTING.md`. Integration tests deferred to Phase 4 if needed.

---

## Deduplication

| Option | Description | Selected |
|--------|-------------|----------|
| Consolidate during Phase 3 | Shared helpers (`getAuthUrl()`, `getApiUrl()`); each logical URL has exactly one resolution site. | ✓ |
| Replace literals only | Each CONFIG_INVENTORY row replaced separately, multiple `process.env` lookups remain. | |

**User's choice:** Consolidate during Phase 3
**Notes:** Existing partial guards collapse into helpers; CONFIG_INVENTORY notes already flag this consolidation target.

---

## Claude's Discretion

- Exact filename for the centralized defaults module (`defaults.ts` vs `endpoints.ts` vs split)
- Whether to expose a `getEndpoint(name)` helper or rely on direct named imports
- Test/script placement and naming for the parity grep
- `package.json` script naming (e.g., `verify:parity`)
- Smoke-checklist markdown structure inside `SELF_HOSTING.md`

## Deferred Ideas

- Bundle diffing as automated parity check
- `npm run verify:parity` as a CI gate (Phase 4)
- Per-provider OAuth disable flags `OPENWHISPR_OAUTH_GOOGLE=false` etc. (Phase 4 / CFG-03)
- `docs/BUILD_CONFIG.md` documenting all env vars (Phase 4)
- Integration tests with mock backend (Phase 4 if needed)
