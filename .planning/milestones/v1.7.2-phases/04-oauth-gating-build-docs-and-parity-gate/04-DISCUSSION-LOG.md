# Phase 4: OAuth Gating, Build Docs, and Parity Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 04-oauth-gating-build-docs-and-parity-gate
**Areas discussed:** OAuth gating mechanism, Apple/macOS interaction, BUILD_CONFIG.md structure

---

## OAuth Gating Mechanism

### Q1: How should `OPENWHISPR_OAUTH_GOOGLE=false` make Google sign-in 'fully absent' from the binary?

| Option | Description | Selected |
|--------|-------------|----------|
| Vite define + DCE | Add `VITE_OPENWHISPR_OAUTH_GOOGLE_ENABLED` to vite.config.mjs `define`. Wrap UI buttons + IPC registration in `if (OAUTH_GOOGLE_ENABLED)`. Rolldown DCE drops dead branches + unused icon imports. Bundle-grep proves absence. | ✓ |
| Providers manifest in build-config | OAUTH_PROVIDERS array iterates UI buttons + IPC registration + webRequest filter. More elegant but requires refactoring AuthenticationStep.tsx. | |
| Virtual module strip | Vite virtual module exporting stub-or-real provider implementations. Strongest isolation but overkill for 3 providers. | |

**User's choice:** Vite define + DCE
**Notes:** Recommended option chosen. Aligns with Phase 3's existing pattern (extend `buildTimeDefaults` block in `src/vite.config.mjs:33-55`). DCE-driven absence + bundle-grep is the mechanical CFG-03 proof.

### Q2: Should the IPC handlers for `googleCalendarOAuth.js` / `googleCalendarManager.js` and the webRequest filter for Google flows also gate on `OPENWHISPR_OAUTH_GOOGLE`, or only the sign-in UI button?

| Option | Description | Selected |
|--------|-------------|----------|
| Gate IPC + UI | Skip registering google-calendar-* IPC handlers in ipcHandlers.js, skip Google OAuth url constants from Vite define block, and skip Google API allowlist in webRequest filter when flag is false. Bundle-grep `oauth2.googleapis.com` returns 0. | ✓ |
| Gate UI only | Hide button only, keep IPC handlers registered as dead code. Easier but bundle-grep still matches `oauth2.googleapis.com` — weakens CFG-03 verification. | |

**User's choice:** Gate IPC + UI
**Notes:** Strongest "fully absent" guarantee per CFG-03. Apple and Microsoft don't have IPC surface (signInWithSocial → renderer → backend), so main-process gating is Google-specific.

---

## Apple / macOS Interaction

### Q3: Apple sign-in is currently UI-gated by `isMacOS`. How should `OPENWHISPR_OAUTH_APPLE=false` interact with that?

| Option | Description | Selected |
|--------|-------------|----------|
| Build flag is authoritative | Render condition becomes `OAUTH_APPLE_ENABLED && isMacOS`. Build flag false → Apple absent everywhere. Default → still macOS-only at runtime. | ✓ |
| OS gating is authoritative | OPENWHISPR_OAUTH_APPLE has no effect on non-macOS builds. On macOS, flag controls visibility. Inconsistent with Google/Microsoft semantics. | |

**User's choice:** Build flag is authoritative
**Notes:** Self-hosters on macOS can disable Apple without touching source. Uniform semantics across all three providers.

### Q4: Does the Apple/Microsoft `signInWithSocial` code path get DCE-stripped when their flag is false, or stays as dead code?

| Option | Description | Selected |
|--------|-------------|----------|
| Strip via DCE (consistent with Google) | Same pattern as Google: gate button render and `signInWithSocial(provider)` switch arm. Bundle-grep `apple` / `microsoft` returns 0 when flag false. | ✓ |
| Keep code, gate UI only | Function still accepts 'apple'/'microsoft' but never called. Simpler but breaks bundle-grep parity proof. | |

**User's choice:** Strip via DCE (consistent with Google)
**Notes:** Uniform CFG-03 verification across all three providers. Bundle-grep is the source of truth.

---

## BUILD_CONFIG.md Structure

### Q5: Structure for `docs/BUILD_CONFIG.md`?

| Option | Description | Selected |
|--------|-------------|----------|
| Reference table + worked examples | Per-variable reference table + scenario-driven examples (default build / custom backend / OAuth subset) + forward-link to SELF_HOSTING.md smoke checklist. | ✓ |
| Reference table only | Just the variable table; smoke walkthrough lives in SELF_HOSTING.md. | |
| Scenario-driven only | Lead with build scenarios; explain variables in context. No standalone reference table. | |

**User's choice:** Reference table + worked examples
**Notes:** Most complete; matches what a self-hoster needs. Reference for lookup, examples for action.

### Q6: Where does the 'self-hosted variant' worked example actually live?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in BUILD_CONFIG.md | BUILD_CONFIG.md is the single self-contained reference for build-time configuration. SELF_HOSTING.md links back to it. | ✓ |
| In SELF_HOSTING.md, BUILD_CONFIG.md links to it | Keep BUILD_CONFIG.md as pure reference; SELF_HOSTING.md owns narrative. Tighter separation. | |

**User's choice:** Inline in BUILD_CONFIG.md
**Notes:** Reader doesn't bounce between docs. BUILD_CONFIG.md becomes the single landing page for "how do I build a self-hosted client?".

### Q7: Should BUILD_CONFIG.md cover the parity smoke checklist, or keep that strictly in SELF_HOSTING.md?

| Option | Description | Selected |
|--------|-------------|----------|
| Cross-link from BUILD_CONFIG.md to SELF_HOSTING.md | Phase 3 already added the smoke checklist to SELF_HOSTING.md. BUILD_CONFIG.md gets a "Verifying parity" subsection with cross-link. | ✓ |
| Move smoke checklist into BUILD_CONFIG.md | Smoke checklist is build-time concern, belongs with build-config doc. Means changing what Phase 3 placed. | |

**User's choice:** Cross-link from BUILD_CONFIG.md to SELF_HOSTING.md
**Notes:** Reuses Phase 3's existing infrastructure without retroactive tweaks. No duplicated checklist to maintain.

---

## Claude's Discretion

- Whether OAuth-gate verification lives in `scripts/verify-defaults-parity.js` or new sibling `scripts/verify-oauth-gating.js`.
- Exact wording / row layout of BUILD_CONFIG.md variable table.
- Whether to add OAuth-gate flags as new rows in `docs/CONFIG_INVENTORY.md`.
- `signInWithSocial` code shape — unioned type or per-provider `if` blocks.
- Whether to introduce `isProviderEnabled(provider)` helper or inline `OAUTH_<P>_ENABLED` reads.
- Test-file placement and naming.
- Smoke checklist additions inline in `docs/SELF_HOSTING.md` or in `04-HUMAN-UAT.md` only.
- Parity gate execution mechanism (not selected for discussion — defaults to "extend Phase 3's existing infrastructure" per D-13).
- Default-flag values & signing-flow continuity (not selected for discussion — defaults to "all flags default true" + "manual signed-build UAT step" per D-14).

## Deferred Ideas

- Auto-generation of BUILD_CONFIG.md from CONFIG_INVENTORY.md
- Providers manifest pattern (revisit if 4th provider added)
- `npm run verify:parity` as CI gate
- Bundle-size diff between default and gated builds
- Runtime feature flags (out of scope per project constraint)
- Per-OAuth-provider UI customization (custom labels, logos)
