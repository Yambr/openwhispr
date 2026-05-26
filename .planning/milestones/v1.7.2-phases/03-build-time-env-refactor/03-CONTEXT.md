# Phase 3: Build-time Env Refactor - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace every hardcoded value catalogued in `docs/CONFIG_INVENTORY.md` (23 entries across 5 buckets: backend, oauth, model-registry, litellm, plus the `electron-builder.json` protocol scheme) with a build-time environment variable. Renderer-side variables flow through Vite `define` (consumed as `import.meta.env.VITE_*`); main-process variables flow through `process.env`. The default build (no env vars) must produce a binary whose network behavior is byte-for-byte identical to the pre-refactor Yambr fork. No production code path may read the new variables at runtime — they are baked at build time.

</domain>

<decisions>
## Implementation Decisions

### Carrying Forward From Phases 1–2 (locked, do not re-litigate)

- **Phase 1 D-09:** Five hardcode buckets only — backend, oauth, enterprise, model-registry, litellm. HuggingFace/GitHub/docs/legal-page URLs out of scope.
- **Phase 1 D-12:** Logical env-var prefix is `OPENWHISPR_*`. Renderer-side consumption requires `VITE_` prefix at the consumption site.
- **Phase 1 D-13:** Each OAuth provider gets its own row/env-var (per-provider granularity for CFG-03 gating in Phase 4).
- **Phase 2 / CONFIG_INVENTORY:** Enterprise bucket is empty in source — Bedrock/Azure/Vertex are runtime user-supplied via `safeStorage`, not Phase 3 targets.

### Fallback Strategy

- **D-01 (Centralized defaults file):** Create `src/config/defaults.ts` (renderer-readable + main-process-importable) holding every default URL literal as a named export. Every call site imports from this module and reads `import.meta.env.VITE_X ?? DEFAULT_X` (renderer) or `process.env.X ?? DEFAULT_X` (main). After refactor, `grep` for any hardcoded URL literal in `src/` outside `src/config/defaults.ts` must return 0 matches — this satisfies ROADMAP success criterion #1.
- **D-02:** `electron-builder.json` protocol scheme literal is the single allowed exception, replaced by the JS-config approach in D-04.
- **D-03 (No fail-closed):** Default build with no env vars set MUST succeed and behave identically to pre-refactor. The defaults file is the source of behavioral parity (success criterion #4). Strict-required env vars rejected — they would break dev workflow.

### electron-builder Configuration

- **D-04 (JS config file):** Convert `electron-builder.json` → `electron-builder.config.js` (CommonJS module). The module reads `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME` with fallback to `"openwhispr"`. electron-builder natively supports `.js` configs, so no scripted JSON generation is needed. Keep the runtime mirror in `main.js:50-52` (`DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL`) reading the same env var with the same fallback.

### Deduplication Scope

- **D-05 (Consolidate during Phase 3):** Per CONFIG_INVENTORY notes, `auth.openwhispr.com` (3 sites), `groq` (3 sites), `mistral` (3 sites), and `desktop-callback` URL (2 sites) are duplicated literals. Phase 3 introduces shared helpers (e.g., `getAuthUrl()`, `getApiUrl()` exported from `src/config/defaults.ts` or a paired `src/config/endpoints.ts`) so each logical URL has exactly one resolution site. Existing partial guards (`process.env.AUTH_URL || process.env.VITE_AUTH_URL || ...`) collapse into the shared helper, removing the chained lookups from call sites.

### Parity Validation

- **D-06 (Grep + smoke checklist):** Two-tier validation in Phase 3:
  1. **Automated grep gate**: a script (e.g., `scripts/verify-defaults-parity.js` or a Phase 3 verification step) greps every `current value` in CONFIG_INVENTORY and asserts it appears exactly once in the source tree, inside `src/config/defaults.ts` (or `electron-builder.config.js` for the protocol scheme).
  2. **Manual smoke checklist** in `docs/SELF_HOSTING.md` (or a new `docs/BUILD_CONFIG.md` to be written in Phase 4): default `npm run build` with no env vars → run the binary → verify sign-in hits `auth.openwhispr.com`, transcription hits the same provider URLs, MCP/calendar OAuth flows reach the same endpoints. No bundle-diff or integration-test infra in Phase 3 — those would expand scope; Phase 4 may layer integration tests if needed.

### Vite/process.env Split (mechanical, derived from CONFIG_INVENTORY)

- Renderer call sites listed in CONFIG_INVENTORY `notes` column with "Renderer; needs `VITE_` prefix" → consumed via `import.meta.env.VITE_OPENWHISPR_*`. Vite `define` block in `src/vite.config.mjs` already partially handles `VITE_AUTH_URL` and `VITE_OPENWHISPR_API_URL` (lines 38-39); extend to cover every renderer-side row.
- Main-process call sites → consumed via `process.env.OPENWHISPR_*`. No Vite involvement; values are baked at electron-builder time via `extraMetadata` or by reading at the start of the build process.
- Dual-process call sites (e.g., `src/config/constants.ts` is imported by both) → `defaults.ts` reads `import.meta.env` when available, falls back to `process.env`, falls back to literal. Verified via existing pattern at `src/config/constants.ts:59-61`.

### Claude's Discretion

- Exact name of the centralized defaults module (`defaults.ts` vs `endpoints.ts` vs split into both)
- Whether to introduce a thin runtime helper (`getEndpoint(name)`) vs direct named imports
- Test-file placement / naming for the parity grep script
- Whether to keep `package.json` script names unchanged or add `npm run verify:parity`
- How to structure the smoke-checklist markdown table in `SELF_HOSTING.md`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 3 Inputs (mandatory)
- `.planning/ROADMAP.md` — Phase 3 success criteria #1–4, requirement IDs CFG-02 + CFG-04
- `.planning/REQUIREMENTS.md` — CFG-02 (build-time env replacement), CFG-04 (`OPENWHISPR_BACKEND_URL` anchor variable)
- `docs/CONFIG_INVENTORY.md` — 23-row inventory (file:line, current value, proposed env-var, category, notes) — this is the literal task list
- `docs/ARCHITECTURE.md` §Process model and §Secret storage — defines the renderer/main/preload boundary that constrains the Vite vs process.env split
- `docs/BACKEND_SPEC.md` — endpoint cards referenced from CONFIG_INVENTORY rows; downstream agents must match each refactor row to its endpoint card
- `docs/OAUTH_SPEC.md` — provider-card template; D-13 per-provider env vars must align with these cards
- `docs/SELF_HOSTING.md` — destination for the manual smoke checklist (D-06)

### Phase 3 Code Anchors (mandatory reads before refactor)
- `src/vite.config.mjs:38-39` — existing `VITE_AUTH_URL` / `VITE_OPENWHISPR_API_URL` `define` block (extend, do not replace)
- `src/config/constants.ts:59-61` — existing `env.OPENWHISPR_OPENAI_BASE_URL || env.OPENAI_BASE_URL || literal` pattern (reuse style)
- `src/lib/auth.ts:5, :171, :201` — three renderer-side fallbacks
- `main.js:50-52, :485, :715-716` — main-process protocol scheme + auth/API URL patterns
- `src/helpers/ipcHandlers.js:3327-3336, :3589, :61, :2826` — IPC-side URL resolution sites
- `src/helpers/googleCalendarOAuth.js:6-7, :11, :223, :33` — Google OAuth endpoints + existing partial guard
- `src/helpers/googleCalendarManager.js:6` — Calendar API base URL
- `src/components/McpIntegrationCard.tsx:13` — MCP server URL displayed in UI
- `src/models/modelRegistryData.json:139, :166, :185` — three transcription provider base URLs
- `electron-builder.json:7` — protocol scheme literal (target of D-04 conversion)

### Phase Predecessors (for cross-phase consistency)
- `.planning/phases/01-wire-contract-documentation/` — wire-level contract that the refactor must not change
- `.planning/phases/02-architecture-doc-hardcode-inventory/` — produced ARCHITECTURE.md + CONFIG_INVENTORY.md; Phase 3 is the mechanical execution of CONFIG_INVENTORY

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config/constants.ts` — already centralizes API endpoint constants (`API_ENDPOINTS`, `DEFAULT_OPENAI_BASE`); the env-fallback pattern at lines 59-78 is the canonical style to extend
- `src/vite.config.mjs` `define` block — already wires two `VITE_*` vars; expansion is mechanical
- Existing partial guards on `auth.openwhispr.com` (3 sites) and `desktop-callback` URL (2 sites) — already env-aware, just need consolidation
- `safeStorage`-backed enterprise vars (`BEDROCK_REGION`, `AZURE_OPENAI_ENDPOINT`, etc.) — pattern for runtime-resolved vars (out of scope for Phase 3 but informs Phase 4)

### Established Patterns
- Renderer reads URLs via `import.meta.env.VITE_*` with fallback (Vite `define` substitutes at build time)
- Main process reads via `process.env.*` with chained fallbacks (e.g., `process.env.AUTH_URL || process.env.VITE_AUTH_URL || literal`)
- IPC-side modules (`ipcHandlers.js`, `googleCalendarOAuth.js`) use small local `getX()` helper functions — the consolidation target

### Integration Points
- `src/vite.config.mjs` `define` block is the only renderer-side build-time inject point (extended by Phase 3)
- `electron-builder.config.js` becomes the new main-process build-time inject point (created by Phase 3 D-04)
- `npm run build` / `npm run pack` scripts in `package.json` are the entry points exercised by the parity smoke check (D-06)

</code_context>

<specifics>
## Specific Ideas

- The centralized defaults module is the single grep-able source of truth — every URL literal lives there, nothing in call sites. This is what makes ROADMAP success criterion #1 (zero hardcoded literals outside the defaults module) mechanically verifiable.
- The Vite `define` block, the new `electron-builder.config.js`, and `defaults.ts` all reference the SAME logical env-var names listed in CONFIG_INVENTORY's `proposed env-var` column — no aliasing across processes.

</specifics>

<deferred>
## Deferred Ideas

- **Bundle diffing / integration tests with mock backend** — considered for parity validation but out of scope for Phase 3. Phase 4 may layer integration tests if the manual smoke checklist proves insufficient.
- **`npm run verify:parity` as a CI gate** — recommended for Phase 4's BUILD_CONFIG documentation; Phase 3 ships the script but does not yet wire it into CI.
- **Per-provider OAuth disable flags (`OPENWHISPR_OAUTH_GOOGLE=false` etc.)** — explicitly Phase 4 scope (CFG-03), not Phase 3. Phase 3 only makes URLs configurable, not provider visibility.
- **`BUILD_CONFIG.md` documenting every env var** — Phase 4 deliverable. Phase 3 only adds the manual smoke checklist to `SELF_HOSTING.md`.

</deferred>

---

*Phase: 03-build-time-env-refactor*
*Context gathered: 2026-05-08*
