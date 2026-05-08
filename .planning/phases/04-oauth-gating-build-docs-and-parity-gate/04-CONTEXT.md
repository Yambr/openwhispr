# Phase 4: OAuth Gating, Build Docs, and Parity Gate - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Three deliverables on top of Phase 3's build-time-env infrastructure:

1. **Per-provider OAuth gating (CFG-03):** Add build flags `OPENWHISPR_OAUTH_GOOGLE`, `OPENWHISPR_OAUTH_APPLE`, `OPENWHISPR_OAUTH_MICROSOFT` (defaulting to `true`) that, when set to `false` at build time, make the named provider **fully absent** from the produced binary — not in renderer UI, not in main-process IPC handlers, not in bundled assets. Verified by bundle-grep returning 0 matches for the disabled provider's identifying strings.

2. **Build-time docs (CFG-05):** Author `docs/BUILD_CONFIG.md` documenting every build-time variable (every `OPENWHISPR_*` and `VITE_OPENWHISPR_*` introduced in Phase 3 plus the three new OAuth flags) with name, purpose, default value, allowed values, and reading site. Includes a worked example of building a self-hosted variant (custom backend + a subset of OAuth providers).

3. **Parity gate (CFG-06):** Verify the default build (no env vars set) is behaviorally identical to the pre-Phase-3 Yambr fork. Reuses Phase 3's existing smoke checklist in `docs/SELF_HOSTING.md` (added in Plan 6 of Phase 3) and the existing `scripts/verify-defaults-parity.js` grep gate. Confirms the existing Developer ID signing flow (`afterSign.js`, `electron-builder.config.js`) still functions on a default build.

Phase 4 does NOT introduce new endpoint variables, new wire-protocol changes, or new secret-storage paths — those are settled by Phases 1–3.

</domain>

<decisions>
## Implementation Decisions

### Carrying Forward From Phases 1–3 (locked, do not re-litigate)

- **Phase 1 D-09:** Five hardcode buckets only — backend, oauth, enterprise, model-registry, litellm.
- **Phase 1 D-12:** Logical env-var prefix is `OPENWHISPR_*`; renderer-side requires `VITE_` prefix at consumption.
- **Phase 1 D-13:** Each OAuth provider gets its own row/env-var (per-provider granularity — this is the Phase 4 enabler).
- **Phase 3 D-01:** All build-time defaults live in `src/config/defaults.ts` (renderer) and `src/config/build-config.generated.cjs` (main, generated at prebuild). Renderer reads `import.meta.env.VITE_OPENWHISPR_*`; main reads the `.cjs` module via `require()`.
- **Phase 3 D-04:** `electron-builder.config.js` (CommonJS) reads `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME`; runtime mirror is `main.js:50-52` — Phase 4 must not regress this dual-read.
- **Phase 3 D-06:** Manual smoke checklist in `docs/SELF_HOSTING.md` + automated `scripts/verify-defaults-parity.js`. Phase 4 reuses both — no duplicate parity infrastructure.
- **Default behavior is parity:** Default build (no env) MUST equal the pre-Phase-3 Yambr fork. All three new OAuth flags default to `true`.

### OAuth Gating Mechanism (Area 1)

- **D-01 (Vite define + DCE):** Add three boolean entries to `src/vite.config.mjs` `buildTimeDefaults`: `VITE_OPENWHISPR_OAUTH_GOOGLE_ENABLED`, `VITE_OPENWHISPR_OAUTH_APPLE_ENABLED`, `VITE_OPENWHISPR_OAUTH_MICROSOFT_ENABLED`. Each reads `env.OPENWHISPR_OAUTH_<P>` and parses `"false"` → `false`, anything else (including unset) → `true`. Vite `define` substitutes these as JS literals in the bundle. Renderer code wraps each provider button + each `signInWithSocial(provider)` switch arm in `if (OAUTH_<P>_ENABLED)` so rolldown's DCE drops the dead branch and unused icon imports.
- **D-02 (Main-process gating via build-config.generated.cjs):** Extend `scripts/generate-build-config.js` (or wherever `build-config.generated.cjs` is produced — see Phase 3 Plan 1) to emit `OAUTH_GOOGLE_ENABLED` / `OAUTH_APPLE_ENABLED` / `OAUTH_MICROSOFT_ENABLED` booleans. `src/helpers/ipcHandlers.js` reads these via the existing `require("./config/build-config.generated.cjs")` and conditionally registers the Google-Calendar IPC family (`google-calendar-*` handlers in `googleCalendarOAuth.js` / `googleCalendarManager.js`) only when `OAUTH_GOOGLE_ENABLED` is true. Apple and Microsoft have no main-process IPC surface today (they go through `signInWithSocial` → renderer → backend redirect), so for those two providers main-process gating is a no-op — the renderer-side DCE alone removes them from the binary.
- **D-03 (webRequest filter narrowing):** `main.js` `webRequest.onBeforeRequest` filter for `https://api.openwhispr.com/*` is unchanged (that's the backend, not the OAuth provider). However, the Google-OAuth-specific filters and the Google API URL constants (`OPENWHISPR_OAUTH_GOOGLE_AUTH_URL`, `_TOKEN_URL`, `_REVOKE_URL`, `_CALENDAR_API_URL` — currently in `defaults.ts`) must be conditionally exported / used. When `OAUTH_GOOGLE_ENABLED=false`, these constants must not appear in the renderer or main bundle. Bundle-grep for `oauth2.googleapis.com` and `accounts.google.com` returns 0 matches in both bundles.
- **D-04 (Bundle-grep is the source of truth for "fully absent"):** Phase 4 success criterion #1 is verified mechanically by greps against `dist/` (renderer bundle) and the packed app's main bundle. The grep targets per provider:
  - Google: `oauth2.googleapis.com`, `accounts.google.com`, `googleapis.com/calendar`, `signInWithSocial("google")`, `GoogleIcon`
  - Apple: `signInWithSocial("apple")`, `AppleIcon`, `auth.social.continueWithApple`
  - Microsoft: `signInWithSocial("microsoft")`, `MicrosoftIcon`, `auth.social.continueWithMicrosoft`
  Each provider's grep set must return 0 matches in a build with that provider disabled. This grep set is added to `scripts/verify-defaults-parity.js` (or a sibling `scripts/verify-oauth-gating.js`) as a Phase 4 verification step.
- **D-05 (Rejected: providers manifest):** Considered a single `OAUTH_PROVIDERS` array in `build-config.generated.cjs` driving UI iteration and IPC registration. Rejected for v1 — would require rewriting `AuthenticationStep.tsx` away from per-provider hardcoded buttons (different `<Button>` props per provider, different `t()` keys, conditional macOS render for Apple). Three providers is small enough that explicit `if (OAUTH_X_ENABLED)` blocks are clearer than a manifest. Manifest pattern can be revisited if a fourth provider lands.

### Apple / macOS Interaction (Area 2)

- **D-06 (Build flag is authoritative):** The render condition in `AuthenticationStep.tsx` becomes `OAUTH_APPLE_ENABLED && isMacOS` (not just `isMacOS`). When `OPENWHISPR_OAUTH_APPLE=false`, the Apple button is absent on every platform. When the flag is unset/`true` (default), the existing `isMacOS` runtime gate still applies — Apple is visible only on macOS. Self-hosters can disable Apple on a macOS build without touching source.
- **D-07 (DCE consistent across all three providers):** The `signInWithSocial` function in `src/lib/auth.ts` either keeps the unioned `SocialProvider = "google" | "microsoft" | "apple"` type and the body branches on `OAUTH_<P>_ENABLED` (each unreachable branch DCE'd), OR the function is restructured so each provider arm is in its own `if` block that DCE eliminates. Either way, bundle-grep for `apple` / `microsoft` in the renderer dist must return 0 matches when their flag is false. Planner picks the cleaner code shape.
- **D-08 (No runtime fallback when flag is false):** If a user somehow triggers `signInWithSocial("apple")` with `OPENWHISPR_OAUTH_APPLE=false` (e.g., via a stale localStorage state or a remote command), the function returns `{ error: new Error("Provider not enabled in this build") }` rather than crashing. This is a defensive guard, not a feature — UI never reaches it because the button is absent.

### BUILD_CONFIG.md Structure (Area 3)

- **D-09 (Reference table + worked examples):** `docs/BUILD_CONFIG.md` has three sections in this order:
  1. **Overview** — what build-time configuration is, the renderer/main split, why it's build-time not runtime, link to `defaults.ts` and `electron-builder.config.js`.
  2. **Variable Reference** — single table covering every `OPENWHISPR_*` / `VITE_OPENWHISPR_*` variable. Columns: `Name` | `Purpose` | `Default` | `Allowed values` | `Read at` (renderer/main/build) | `Source of truth file`. Sourced directly from `docs/CONFIG_INVENTORY.md` (every Phase 3 row) plus the three new OAuth flags.
  3. **Worked Examples** — three concrete build invocations:
     - **Default build** (no env vars) — produces parity binary.
     - **Custom backend only** — `OPENWHISPR_BACKEND_URL=https://api.example.com OPENWHISPR_AUTH_URL=https://auth.example.com npm run build`.
     - **Self-hosted variant with subset of OAuth** — `OPENWHISPR_BACKEND_URL=... OPENWHISPR_AUTH_URL=... OPENWHISPR_OAUTH_GOOGLE=true OPENWHISPR_OAUTH_APPLE=false OPENWHISPR_OAUTH_MICROSOFT=false npm run build`. Includes expected behavior (only Google button visible) and verification command (bundle-grep snippet).
- **D-10 (Worked example lives inline in BUILD_CONFIG.md):** Self-hosted variant example is a code block + prose section inside BUILD_CONFIG.md. SELF_HOSTING.md gets a forward-link "For build-time configuration of the OpenWhispr client itself, see `docs/BUILD_CONFIG.md`" — matches the Phase 3 cross-link style. Reader looking for "how do I build a self-hosted client?" finds everything in one doc.
- **D-11 (Smoke checklist stays in SELF_HOSTING.md, BUILD_CONFIG.md cross-links):** Phase 3 already added the parity smoke checklist to `docs/SELF_HOSTING.md`. Phase 4 does NOT move or duplicate it. BUILD_CONFIG.md gets a final section "Verifying parity" that says: "After building, (a) run `node scripts/verify-defaults-parity.js` and confirm exit 0, (b) walk the smoke checklist in `docs/SELF_HOSTING.md#parity-smoke-check` (or wherever Phase 3 anchored it)." Phase 4's parity-gate verification is a reuse, not a rewrite.
- **D-12 (Anchor existing CONFIG_INVENTORY.md):** BUILD_CONFIG.md's variable reference is generated/written by reading CONFIG_INVENTORY.md — every row in CONFIG_INVENTORY's table maps to a row in BUILD_CONFIG's variable reference. The three OAuth gate variables are net-new rows (not in CONFIG_INVENTORY because they're Phase 4 additions, not Phase 3 hardcode-replacements). Planner should consider whether to also append the three OAuth-gate flags to `docs/CONFIG_INVENTORY.md` for completeness, or document them only in BUILD_CONFIG.md. Either is fine — pick whichever keeps the docs cleanest.

### Parity Gate Execution (Claude's Discretion)

- **D-13 (Reuse Phase 3 infrastructure):** Two existing artifacts:
  - `scripts/verify-defaults-parity.js` (Phase 3 Plan 6) — grep-asserts every CONFIG_INVENTORY default appears exactly once, in `defaults.ts` / `build-config.generated.cjs` / `electron-builder.config.js`.
  - `docs/SELF_HOSTING.md` smoke checklist (Phase 3 Plan 6) — manual walkthrough: default `npm run pack` with no env vars, then exercise sign-in/calendar/transcription/MCP/protocol flows and observe expected URLs.
  Phase 4 ADDS to these (not replaces):
  - Extend the parity script (or add `scripts/verify-oauth-gating.js`) with the bundle-grep targets from D-04 — runs against a default build (all three OAuth flags true) and three negative builds (each provider individually disabled). Asserts the documented absence/presence for each.
  - Extend the SELF_HOSTING.md smoke checklist with one new flow per OAuth flag: "Build with `OPENWHISPR_OAUTH_GOOGLE=false`, run binary, verify Google button absent and `oauth2.googleapis.com` not in renderer bundle."
- **D-14 (Signing flow continuity — success criterion #4):** Phase 4 must run a *signed* default build (`npm run build` without `CSC_IDENTITY_AUTO_DISCOVERY=false`) at least once, manually, and confirm `afterSign.js` notarization succeeds with no env vars set. This is a one-shot human-UAT step, not an automated check — codified in `04-HUMAN-UAT.md`. Plans should not regress `electron-builder.config.js` or `afterSign.js` structure.

### Claude's Discretion

- Whether to put OAuth-gate verification in the existing `scripts/verify-defaults-parity.js` or a new sibling `scripts/verify-oauth-gating.js`.
- Exact wording / row layout of the BUILD_CONFIG.md variable table (one variable per row vs. grouped by bucket).
- Whether to add the three OAuth-gate flags as new rows in `docs/CONFIG_INVENTORY.md` for completeness.
- Whether `signInWithSocial` keeps the unioned type or restructures into per-provider `if` blocks for cleaner DCE.
- Whether to introduce a small TS helper like `isProviderEnabled(provider)` to centralize the gating reads, or inline `OAUTH_<P>_ENABLED` constants at each call site.
- Test-file placement and naming.
- Whether the smoke checklist additions go inline in `docs/SELF_HOSTING.md` or in `04-HUMAN-UAT.md` only.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 4 Inputs (mandatory)
- `.planning/ROADMAP.md` — Phase 4 success criteria #1–4, requirement IDs CFG-03 + CFG-05 + CFG-06
- `.planning/REQUIREMENTS.md` — CFG-03 (per-provider OAuth gating), CFG-05 (BUILD_CONFIG.md), CFG-06 (default-build parity)
- `docs/CONFIG_INVENTORY.md` — Phase 3's 23-row hardcode inventory; source for BUILD_CONFIG.md variable reference table (D-12)
- `docs/SELF_HOSTING.md` §parity-smoke-check (or whichever anchor Phase 3 used) — existing smoke checklist that Phase 4 extends, not replaces
- `docs/BACKEND_SPEC.md` and `docs/OAUTH_SPEC.md` — referenced from CONFIG_INVENTORY rows; downstream agents must understand which endpoints belong to which provider before writing the OAuth gate
- `.planning/phases/03-build-time-env-refactor/03-CONTEXT.md` — Phase 3 D-01 / D-04 / D-06 / D-13 are foundation that Phase 4 builds on

### Phase 4 Code Anchors (mandatory reads before refactor)
- `src/lib/auth.ts:21` — `SocialProvider = "google" | "microsoft" | "apple"` type definition
- `src/lib/auth.ts:173-200` — `signInWithSocial(provider)` implementation, target of D-07
- `src/components/AuthenticationStep.tsx:481-560` — three provider buttons (Apple gated by `isMacOS`, Google, Microsoft), target of D-01 + D-06
- `src/config/defaults.ts` — Phase 3 renderer-side defaults module; Phase 4 adds three `OAUTH_<P>_ENABLED` boolean exports here
- `src/config/build-config.generated.cjs` (or its generator script `scripts/generate-build-config.js`) — main-process defaults; Phase 4 adds three boolean fields
- `src/vite.config.mjs:33-55` — Phase 3 `buildTimeDefaults` block; Phase 4 extends with three `VITE_OPENWHISPR_OAUTH_<P>_ENABLED` entries
- `src/helpers/ipcHandlers.js` — registers `google-calendar-*` IPC handlers; target of D-02 conditional registration
- `src/helpers/googleCalendarOAuth.js` and `src/helpers/googleCalendarManager.js` — Google-specific main-process surface gated by `OAUTH_GOOGLE_ENABLED`
- `electron-builder.config.js` — Phase 3's protocol-scheme env-driven config; Phase 4 must not regress
- `afterSign.js` — Developer ID signing/notarization flow (success criterion #4); Phase 4 must not break
- `scripts/verify-defaults-parity.js` — Phase 3 grep gate; Phase 4 extends or adds sibling script with OAuth bundle-greps

### Phase Predecessors (for cross-phase consistency)
- `.planning/phases/01-wire-contract-documentation/` — wire-level contract; OAuth gating cannot change wire behavior
- `.planning/phases/02-architecture-doc-hardcode-inventory/` — produced ARCHITECTURE.md + CONFIG_INVENTORY.md
- `.planning/phases/03-build-time-env-refactor/` — produced `defaults.ts`, `build-config.generated.cjs`, `electron-builder.config.js`, smoke checklist, and parity script — all reused by Phase 4

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config/defaults.ts` (Phase 3) — renderer-side build-config module; extend with three `OAUTH_<P>_ENABLED` exports following the existing `pick()` pattern (with boolean parse: `"false"` → `false`, else `true`).
- `src/config/build-config.generated.cjs` (Phase 3) — main-process build-config; extend its generator script to emit three boolean fields.
- `src/vite.config.mjs:33-55` `buildTimeDefaults` block — extend with three new `VITE_OPENWHISPR_OAUTH_<P>_ENABLED` entries; Vite `define` substitution is the existing DCE-friendly pattern.
- `src/helpers/ipcHandlers.js` — main-process registration site; gate the Google-Calendar IPC family with `if (BuildConfig.OAUTH_GOOGLE_ENABLED)`.
- `scripts/verify-defaults-parity.js` (Phase 3) — bundle-grep parity script; extend with OAuth provider grep targets per D-04, or add a sibling `scripts/verify-oauth-gating.js`.
- `docs/SELF_HOSTING.md` parity-smoke-check section (Phase 3) — append OAuth-gating smoke flows; do not duplicate to BUILD_CONFIG.md.
- `docs/CONFIG_INVENTORY.md` — source of truth for every variable row in BUILD_CONFIG.md's reference table.
- `04-HUMAN-UAT.md` (will be created during planning) — codifies the signed-build smoke for success criterion #4.

### Established Patterns
- Phase 3 set the renderer/main split: renderer reads `import.meta.env.VITE_*` (Vite `define` substitutes literals at build time, enabling DCE); main reads `build-config.generated.cjs` via `require()` (frozen at prebuild). Phase 4 follows this exact split for the three new flags — no new pattern.
- Booleans are parsed at the build-config layer (`"false"` → `false`, else `true`), not at call sites — call sites see real booleans, which is what Vite `define` + DCE need.
- DCE-friendly conditional registration: `if (BuildConfig.OAUTH_GOOGLE_ENABLED) { /* register handlers */ }`. Bundle-grep proves the unreachable branch is dropped.

### Integration Points
- `src/vite.config.mjs` `define` block — only renderer-side build-time inject point.
- `scripts/generate-build-config.js` (or whatever Phase 3 named it) — only main-process build-time inject point.
- `npm run build` / `npm run pack` are the entry points exercised by both the parity script and the smoke checklist; Phase 4 must not change their semantics.
- `afterSign.js` — invoked by electron-builder; out of Phase 4's modification scope but must keep working on default builds.

</code_context>

<specifics>
## Specific Ideas

- The three new flags follow the exact same naming convention as Phase 1 D-13 anticipated: `OPENWHISPR_OAUTH_GOOGLE`, `OPENWHISPR_OAUTH_APPLE`, `OPENWHISPR_OAUTH_MICROSOFT`. The renderer-side mirrors are `VITE_OPENWHISPR_OAUTH_GOOGLE_ENABLED` etc. — the `_ENABLED` suffix is on the renderer-side variable to make the boolean semantics explicit at the consumption site, but the user-facing build-time variable is the unsuffixed `OPENWHISPR_OAUTH_GOOGLE` (per the original ROADMAP wording).
- Default build behavior (success criterion #3, CFG-06): all three flags unset → all three providers visible → identical to pre-Phase-3 Yambr fork. The parity script must verify this every run.
- Bundle-grep is the mechanical proof of "fully absent" (success criterion #1). Without it, "fully absent" is unverifiable and CFG-03 fails.
- BUILD_CONFIG.md is generated/written **once**, then maintained alongside CONFIG_INVENTORY.md. It is not auto-generated from CONFIG_INVENTORY at build time — it's a human-readable companion doc that the planner authors during this phase.

</specifics>

<deferred>
## Deferred Ideas

- **Auto-generation of BUILD_CONFIG.md from CONFIG_INVENTORY.md** — considered but rejected for v1. Manual authorship keeps the doc human-readable and lets the writer add narrative ("why this variable matters") that auto-generation would lose. Could revisit if the variable list grows large enough that drift becomes a maintenance burden.
- **Providers manifest in build-config.generated.cjs** — see D-05. Pattern revisit if a fourth OAuth provider is added.
- **`npm run verify:parity` / `npm run verify:oauth-gating` as a CI gate** — Phase 3 deferred this; Phase 4 ships the scripts but does not necessarily wire them into CI. Future infra phase can add the GitHub Actions step.
- **Bundle-size diff between default and gated builds** — interesting metric (how many bytes does disabling Microsoft save?) but not a Phase 4 deliverable.
- **Runtime feature flags** — explicitly out of scope. The whole project constraint is "v1 configurability is build-time, not runtime." Runtime gating could be a future phase if user-installable feature switches become a goal.
- **Per-OAuth-provider UI customization** (custom button labels, custom logos for self-hosted Apple-substitute providers) — out of scope. Phase 4 only gates existing providers on/off.

</deferred>

---

*Phase: 04-oauth-gating-build-docs-and-parity-gate*
*Context gathered: 2026-05-08*
