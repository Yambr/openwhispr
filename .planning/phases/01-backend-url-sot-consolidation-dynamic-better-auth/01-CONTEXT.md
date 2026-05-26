# Phase 1: Backend URL SoT Consolidation + Dynamic Better Auth — CONTEXT

**SPEC:** `.planning/phases/01-backend-url-sot-consolidation-dynamic-better-auth/01-SPEC.md` (commit `fe0f9778`)
**Discuss mode:** discuss (default, auto-mode dispatch)
**Captured:** 2026-05-26
**Discuss notes:** orchestrator-driven autonomous capture; no Socratic interview rounds (initial ambiguity 0.10 ≤ 0.20 gate).

This document locks the HOW decisions that downstream agents (planner, executor, verifier) need. The WHAT and WHY are locked in SPEC.md.

---

## D-01: Mutable proxy mechanics for `authClient` (resolves HOST-02)

**Decision:** JavaScript `Proxy()` wrapping a memoized inner `createAuthClient()` instance keyed by resolved `baseURL`. The proxy's `get` trap returns properties bound to the current inner instance; instance is re-created lazily on the next access after a URL-change signal flips an internal `dirty` flag.

**Why this over a lazy factory:** `src/lib/auth.ts:12` is upstream-origin (commit `56f4efb8`, Gabriel Stein, "switch desktop to Better Auth + add Microsoft sign-in"). The exported symbol name `authClient` is consumed across the renderer (`useSession()`, `signIn.email(...)`, `signOut(...)`, etc.) AND inside upstream code paths we cannot modify. Replacing the export with a `getAuthClient()` factory would cascade rename across upstream-origin call sites → multiplies merge cost forever. Proxy keeps the symbol name and API surface byte-identical to upstream.

**Important nuance (discovered during execute prep):** `AUTH_URL = import.meta.env.VITE_AUTH_URL || "..."` on line 11 was NOT upstream-origin — it was reverted from Phase 03-02's `AUTH_URL = OPENWHISPR_AUTH_URL` by the upstream merge. Phase 1 Plan 01-05 should restore the defaults.ts read AND add the Proxy wrapper. The wrapper is the upstream-parity-sensitive part (it preserves the `authClient` symbol); the `AUTH_URL` const expression itself can re-read defaults.ts safely because it's already been changed once in Yambr-fork drift (in ba1c1917) and will be again.

**Mechanics:**

```ts
let cachedUrl: string | null = null;
let cachedClient: ReturnType<typeof createAuthClient> | null = null;
let persistedUrl: string | null = null; // updated via D-02 signal

function resolveBaseURL(): string {
  return persistedUrl ?? AUTH_URL; // AUTH_URL = build-time default
}

function getInner() {
  const url = resolveBaseURL();
  if (cachedClient === null || cachedUrl !== url) {
    cachedClient = createAuthClient({ baseURL: url, /* …existing options… */ });
    cachedUrl = url;
  }
  return cachedClient;
}

export const authClient = new Proxy({} as ReturnType<typeof createAuthClient>, {
  get(_target, prop) {
    const inner = getInner();
    const value = (inner as any)[prop];
    return typeof value === "function" ? value.bind(inner) : value;
  },
});
```

**Known risk: `authClient.useSession()` is a React hook.** Hooks track identity via reference equality of internal state. When the inner instance swaps, React state inside the previous instance is orphaned. **Mitigation:** force a renderer reload when persisted URL changes (same approach upstream already uses for the OAuth deep-link cookie set in `main.js` — see commit `56f4efb8`'s description: "reloads the renderer so authClient.useSession picks up the new session"). The reload is acceptable UX because URL change happens only at onboarding (Phase 4) or after explicit re-onboarding.

**Test:** Phase 1's HOST-02 acceptance test sets persistedUrl directly (no reload), proves the next outbound HTTP call hits the new host. The reload path is covered in Phase 4/5 e2e — out of scope here.

## D-02: Settings owner + subscription channel for URL change (resolves HOST-02 plumbing)

**Decision:** Renderer-owned. The persisted Server URL lives in `useSettingsStore` (Zustand store, `src/stores/settingsStore.ts`), persisted to `localStorage` like every other user setting. A new key `serverUrl` (string or null; null = use build-time default).

**Why renderer-owned, not main-process safeStorage:** `useSettingsStore` is the canonical settings owner. `safeStorage` (via `src/helpers/secretCrypto.js`) is for secret material only — API keys, tokens. Server URL is configuration, not a secret. Putting it in safeStorage would diverge from every other settings field's storage model and complicate Phase 4's persist step.

**Renderer subscription:** `auth.ts` subscribes to `useSettingsStore` on module load:

```ts
import { useSettingsStore } from "../stores/settingsStore";

useSettingsStore.subscribe((state, prev) => {
  if (state.serverUrl !== prev.serverUrl) {
    persistedUrl = state.serverUrl;
    cachedClient = null; // force re-create on next access
  }
});
// Also read initial value at module load:
persistedUrl = useSettingsStore.getState().serverUrl;
```

**Main-process IPC bridge:** When the renderer changes `serverUrl`, it also fires an IPC notification (`settings:server-url-changed`) so the main process (`ipcHandlers.js`'s `getApiUrl()` collapse — see D-03) can update its cached URL. Two-way sync is overkill; we use one-way push (renderer → main) since renderer always writes first.

```ts
// renderer side
useSettingsStore.subscribe((state, prev) => {
  if (state.serverUrl !== prev.serverUrl) {
    window.electronAPI?.notifyServerUrlChanged?.(state.serverUrl);
  }
});

// preload.js: expose notifyServerUrlChanged → ipcRenderer.send("settings:server-url-changed", url)
// main.js: ipcMain.on("settings:server-url-changed", (e, url) => { currentBackendUrl = url; })
```

## D-03: `getApiUrl()` collapse strategy (resolves HOST-01 + extends HOST-01 scope)

**Decision:** Replace the 3-source fallback chain (`process.env.OPENWHISPR_API_URL || process.env.VITE_OPENWHISPR_API_URL || runtimeEnv.VITE_OPENWHISPR_API_URL`) with a single function that resolves from: (1) the runtime-pushed URL via D-02 IPC channel (`currentBackendUrl`), falling back to (2) `BuildConfig.OPENWHISPR_BACKEND_URL` from `src/config/build-config.generated.cjs`.

```js
// ipcHandlers.js (main process)
const BuildConfig = require("../config/build-config.generated.cjs");
let currentBackendUrl = null; // populated by D-02 IPC channel

ipcMain.on("settings:server-url-changed", (_e, url) => {
  currentBackendUrl = url || null;
});

const getApiUrl = () => currentBackendUrl ?? BuildConfig.OPENWHISPR_BACKEND_URL ?? "";
```

**Scope expansion called out:** SPEC.md's HOST-01 acceptance criterion ("`getApiUrl()` collapsed to read from one source") was framed as a static rename. After scout, it's a 2-source resolver (runtime override + build-time default) because the main process needs to honor the runtime override too. Planner: treat this as part of HOST-01, not a new requirement.

**`getAuthUrl()` parallel collapse (NEW IN SCOPE):** Found during scout — `ipcHandlers.js:3393-3397` has an identical 3-source fallback for `AUTH_URL`. Apply the same treatment using `BuildConfig.OPENWHISPR_AUTH_URL` (already exists in defaults). For v1.8.0, AUTH_URL also needs to honor the runtime override (Better Auth host = same as API host in the typical deployment — server unifies them). Decision: collapse `getAuthUrl()` in the same wave as `getApiUrl()`; runtime override applies to both.

**26 call sites in ipcHandlers.js:** stay calling `getApiUrl()` (function name unchanged); only the function body changes. Zero touch needed on the 26 sites themselves. Same for `getAuthUrl()` call sites.

## D-04: HOST-02 acceptance test harness (resolves HOST-02 acceptance criterion)

**Decision: Playwright e2e via `_electron.launch`**, NOT vitest unit test of the proxy.

**Why:** User explicitly required "e2e tests"; project memory `[[live_verification_over_green_tests]]` documents 5 prior blockers where green unit tests passed but live broke. The acceptance gate must drive a real Electron build against a real (slim-core) mock server with network observation.

**Harness:** Extend `tests/e2e/` with a new feature `host-runtime-override.feature`:

```gherkin
Feature: Backend URL runtime override (Phase 1 HOST-02)
  Scenario: persisted Server URL is honored by Better Auth
    Given the Electron app is launched against the slim-core backend
    And no Server URL is persisted in settings
    Then signIn.email targets the build-time default host

    When the Server URL is set to "http://localhost:4001" via IPC
    Then the next signIn.email targets "http://localhost:4001"
    And no request is sent to the build-time default host
```

Implementation uses the existing `playwright.config.ts` + `bddgen` + `electron-launch.ts` fixture. The "set via IPC" step uses Playwright's `evaluate()` to call `window.electronAPI` directly, bypassing Phase 4's UI (which doesn't exist yet).

**Vitest unit test of the proxy itself** is ALSO authored (8-10 tests covering: cache key correctness, dirty-flag re-creation, hook orphan behavior under URL swap, default-build fallback) — but it is a `should` (extra confidence), not a `must` (acceptance gate). The acceptance gate is the Playwright scenario above.

## D-05: release.yml CI mass-rename strategy (resolves HOST-01 CI side)

**Decision:** Single PR removes `VITE_OPENWHISPR_API_URL` from `.github/workflows/release.yml` in 5 places (lines 117, 131, 256, 270, 412 per current grep). The GitHub Actions repo var (`vars.VITE_OPENWHISPR_API_URL`) stays under its legacy name temporarily — the env-var assignment becomes `OPENWHISPR_BACKEND_URL: ${{ vars.VITE_OPENWHISPR_API_URL }}` (already partly the case on lines 114, 128, 253, 267, 409).

**Maintainer action required AFTER the PR merges and the next release tagging:** rename `vars.VITE_OPENWHISPR_API_URL` → `vars.VITE_OPENWHISPR_BACKEND_URL` in GitHub repo Settings → Secrets and variables → Actions. THEN open a follow-up one-line PR updating the 5 `${{ vars.* }}` references in release.yml.

**Why split into two PRs:** The two-step rename keeps the legacy GH var name temporarily so that the merge of Phase 1's PR doesn't immediately break CI if the maintainer hasn't done the manual rename yet. Once both are renamed, release.yml is consistent.

**Plan should produce a clear MAINTAINER-ACTION.md note** in the phase dir listing this manual step explicitly so it's not surprise post-merge.

## D-06: e2e regression scope (mandatory — user explicitly required "не забывай e2e")

**Found references that MUST be updated in the same commit set as the env-var rename:**

- `tests/e2e/fixtures/electron-launch.ts:47-51` — fixture sets `OPENWHISPR_API_URL` AND `VITE_OPENWHISPR_API_URL` from the same `backendUrl`. Change to set only `OPENWHISPR_BACKEND_URL`.
- `tests/e2e/steps/sync-cjm.steps.ts:11` — comment references `${OPENWHISPR_API_URL}`. Update comment.
- `tests/e2e/playwright.config.ts` — verify no other references (grep was clean but planner should re-confirm).
- `../openwhispr-server/docker-compose.yml` and `docker-compose.external-litellm.yml` — **READ-ONLY per `[[server_repo_boundary]]`**. If they reference `OPENWHISPR_API_URL` on the server side, that's a server task, not ours. Surface as a finding only.

**e2e regression gate:** Phase 1 acceptance includes running `npm run test:e2e` against slim-core server and confirming 44/44 (or whatever the current baseline is) still passes. Adding the new `host-runtime-override.feature` brings the total to 45 scenarios. The new scenario MUST pass on its own merit; the existing 44 MUST not regress.

**Phase 5 (VER-01..03) extends this** with the corporate-minimal-build e2e for HOST-02 + UI-01..04. Phase 1's e2e covers HOST-02 only (no UI yet).

## D-07: HOST-03 sweep details (resolves HOST-03)

**⚠ Pre-existing regression discovered during execute prep (2026-05-26):**

Phase 03-02 (commit `ba1c1917`, "feat(03-02): refactor src/lib/auth.ts to read auth URLs from defaults.ts", authored by Nikolai Iambroskin 2026-05-08) **already did exactly this HOST-03 work**. It wired:
- `auth.ts:11` `AUTH_URL` → `OPENWHISPR_AUTH_URL` from defaults
- `auth.ts:177` `DESKTOP_OAUTH_CALLBACK_URL` → `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` from defaults
- `auth.ts:232` `redirectTo` → `OPENWHISPR_OAUTH_RESET_PASSWORD_URL` from defaults

**Upstream merge in Phase 6 (commit `7b91e76e` / `56f4efb8` Better Auth migration) REGRESSED all three back to hardcoded literals.** Current `auth.ts` HEAD has all three literals — exactly as the integration check INT-03/04 reported.

This means HOST-03 in Phase 1 is **re-doing** Phase 03-02's work, not new work. CFG-02 was technically "validated in Phase 3" per PROJECT.md but the validation didn't survive the upstream merge — the v1.7.2 audit missed this because it checked PROJECT.md markers, not live grep.

**Carry-forward implication for Phase 6 (recurring upstream-merge phase):** add a post-merge gate that runs `npm run verify:backend-url-sot` (the script being authored in Plan 01-01) so any future merge regression is caught immediately. File as a finding in Phase 1 SUMMARY for the next upstream merge to address.

**Verified during scout (post-regression state):**

- `src/config/defaults.ts:39-42` already exports `OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL` (via `pick("VITE_OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL", Generated.OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL)`). Already in `build-config.generated.{ts,cjs}`. `auth.ts:177` needs the import + replacement (re-applying ba1c1917).
- `src/config/defaults.ts:49-52` already exports `OPENWHISPR_OAUTH_RESET_PASSWORD_URL` (same pattern). `auth.ts:232` needs the import + replacement (re-applying ba1c1917).
- `src/components/notes/ShareNoteDialog.tsx:26` `SHARE_VIEWER_BASE_URL = "https://notes.openwhispr.com"` — NO matching constant. Add `OPENWHISPR_SHARE_VIEWER_URL` to:
  - `scripts/generate-build-config.js` STRING_DEFAULTS (default `"https://notes.openwhispr.com"`, override env var `OPENWHISPR_SHARE_VIEWER_URL`)
  - `src/config/defaults.ts` (via `pick(...)`)
  - `docs/CONFIG_INVENTORY.md` (new row)

**Build-config gate sanity check:** After the changes, `node scripts/generate-build-config.js` must still produce a syntactically valid `.ts` and `.cjs` — verify by running the existing `test:build-config` script (15 tests per recent quick-task SUMMARYs).

## D-08: Phase 1 wave order (input for planner)

Recommended execution waves, with dependencies:

- **Wave 0 (TDD, RED first):** Write failing tests
  - Playwright scenario `host-runtime-override.feature` (HOST-02 acceptance gate)
  - Vitest proxy unit tests (D-04 should-have)
  - Bundle-grep assertion script for HOST-01/HOST-03 (3 banned literals + 0 `OPENWHISPR_API_URL` matches)
- **Wave 1 (HOST-03):** Wire 3 hardcoded URLs to defaults.ts. Add `OPENWHISPR_SHARE_VIEWER_URL` constant. Cheapest change, no behavior shift, lands first.
- **Wave 2 (HOST-01 renderer):** Remove `OPENWHISPR_API_URL` from `constants.ts`. Rewrite 5 renderer imports to `OPENWHISPR_BACKEND_URL` from `defaults.ts`. Update e2e fixture (`electron-launch.ts:47-51`) + sync-cjm comment.
- **Wave 3 (HOST-01 main + HOST-02 plumbing):** Collapse `getApiUrl()` + `getAuthUrl()` in `ipcHandlers.js` per D-03. Add IPC channel `settings:server-url-changed`. Wire main-side `currentBackendUrl` cache.
- **Wave 4 (HOST-02 proxy):** Refactor `src/lib/auth.ts` per D-01. Add Zustand subscription per D-02. Add `serverUrl` field to `useSettingsStore` (default null).
- **Wave 5 (CI):** Update `release.yml` 5 stages per D-05. Author `MAINTAINER-ACTION.md` for the follow-up GH var rename.
- **Wave 6 (verification, GREEN):** Run `npm run test:build-config` (15/15 expected), `npm test` (full unit suite), `npm run verify:provider-lockdown`, `npm run verify:oauth-gating`, `npm run test:e2e` (45/45 expected). Live verify: drive packed app via CDP, set `serverUrl` via IPC, observe Better Auth request hits new host (per `[[cdp_renderer_debug]]` + `[[live_verification_over_green_tests]]`).

Atomic commits per wave per executor convention.

## Open Questions for Planner

None. All gray areas resolved during scout. Planner can proceed directly to PLAN.md.

## Constraints Carried from SPEC.md + Memory

- `[upstream_parity]`: D-01 proxy preserves `authClient` symbol + API surface byte-identical to upstream. `git diff upstream/main -- src/lib/auth.ts` after Phase 1 must show only internal-implementation diffs.
- `[client_immutable]`: no server changes. Server accepts whatever host the client sends.
- `[rolldown_tree_shake]`: new `OPENWHISPR_SHARE_VIEWER_URL` constant uses the direct named re-export pattern in `defaults.ts`.
- `[live_verification_over_green_tests]`: D-04 e2e + Wave 6 CDP live drive are the acceptance gates, not green vitest alone.
- `[cdp_renderer_debug]`: post-execute verification uses `--remote-debugging-port=9223` for any renderer-side assertion.
- `[server_repo_boundary]`: docker-compose findings on the server side are SURFACED-ONLY in the SUMMARY, not edited.

---

**Status:** decisions locked, ready for `/gsd-plan-phase 1`.
