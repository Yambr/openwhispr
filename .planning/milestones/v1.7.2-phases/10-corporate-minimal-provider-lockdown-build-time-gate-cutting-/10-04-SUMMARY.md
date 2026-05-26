---
phase: 10-corporate-minimal-provider-lockdown-build-time-gate-cutting-
plan: 04
subsystem: reasoning-ui
tags: [build-time-gating, dce, provider-lockdown, reasoning-ui]
requires:
  - PROVIDER_LOCKDOWN_ENABLED constant (plan 10-01)
provides:
  - InferenceConfigEditor modes array reduced to [openwhispr, local] under lockdown
  - providers/self-hosted/enterprise mount branches DCE-gated
  - ReasoningModelSelector cloud-provider selector + BYOK inputs DCE-gated
affects:
  - src/components/settings/InferenceConfigEditor.tsx
  - src/components/ReasoningModelSelector.tsx
tech-stack:
  added: []
  patterns:
    - literal-foldable array spread for Rolldown DCE
    - "{!PROVIDER_LOCKDOWN_ENABLED && (...)} JSX gate (literal-false short-circuit)"
    - direct named import of PROVIDER_LOCKDOWN_ENABLED from src/config/defaults.ts
key-files:
  created: []
  modified:
    - src/components/settings/InferenceConfigEditor.tsx
    - src/components/ReasoningModelSelector.tsx
decisions:
  - "ModelRegistry.buildReasoningProviders left untouched — static-data only, no enterprise-config dependency, cannot throw under lockdown"
  - "EnterpriseSection.tsx left untouched — removed wholesale by the gated mount in InferenceConfigEditor; no internal edit needed"
  - "Under lockdown the cloud reasoning path keeps selectedCloudProvider at its default 'openai', always a valid REASONING_PROVIDERS key — no forced override needed, model card list still renders"
metrics:
  duration: ~14m
  completed: 2026-05-21
  tasks: 2
  files: 2
---

# Phase 10 Plan 04: Reasoning-UI Provider Lockdown Summary

Under `PROVIDER_LOCKDOWN_ENABLED` the inference-mode selector folds from 5 modes to
exactly two — `openwhispr` (Cloud) and `local` — and the reasoning UI drops the
alternative cloud-provider choice, all per-provider API-key inputs, the self-hosted
BYOK panel, and the enterprise-credential section, all via Rolldown DCE.

## What Was Built

### Task 1 — `InferenceConfigEditor.tsx` (commit `75b4e46b`)

- Imported `PROVIDER_LOCKDOWN_ENABLED` from `../../config/defaults`.
- The 5-entry inline `modes` array was extracted into five named locals
  (`openwhisprEntry`, `providersEntry`, `localEntry`, `selfHostedEntry`,
  `enterpriseEntry`) and rebuilt as a literal-foldable spread:
  `[openwhisprEntry, ...(PROVIDER_LOCKDOWN_ENABLED ? [] : [providersEntry,
  selfHostedEntry, enterpriseEntry]), localEntry]`. Under lockdown the ternary
  literal-folds to `[]`, leaving the three removed entries (and their
  `Key`/`Network`/`Building2` icon usages) unreferenced for Rolldown to DCE.
  Default build keeps all 5 modes; `openwhispr` first, `local` last preserves UX.
- The three lockdown-removed mount branches gated with literal-false
  short-circuits: `{!PROVIDER_LOCKDOWN_ENABLED && config.mode === "providers" &&
  renderModelSelector("cloud")}`, the `self-hosted` `OpenAICompatiblePanel`
  mount, and the `enterprise` `EnterpriseSection` mount. The `local` branch is
  untouched.
- `showThinkingToggle` left as-is per plan Step C — its `self-hosted`/`providers`
  terms are unreachable under lockdown but harmless; type-checks clean.

### Task 2 — `ReasoningModelSelector.tsx` (commit `90162482`)

- Imported `PROVIDER_LOCKDOWN_ENABLED` from `../config/defaults`.
- The cloud-provider `ProviderTabs` selector (the openai/anthropic/gemini/groq/
  custom tab strip) gated by `{!PROVIDER_LOCKDOWN_ENABLED && (...)}`.
- The `custom`-provider `OpenAICompatiblePanel` BYOK mount gated — combined with
  the `InferenceConfigEditor` mount gated in Task 1, both consumers of
  `OpenAICompatiblePanel` are now behind literal-false branches, so the
  component file DCEs under lockdown.
- All four per-provider `ApiKeyInput` blocks (`openai`, `anthropic`, `gemini`,
  `groq`) gated with `!PROVIDER_LOCKDOWN_ENABLED &&` prepended to their
  `selectedCloudProvider === "..."` conditions.
- The `ModelCardList` still renders under lockdown (our-server models);
  `effectiveMode === "local"` path untouched.
- `ModelRegistry.buildReasoningProviders` reviewed — it iterates static registry
  data (`getCloudProviders`/`getEnterpriseProviders`/`getAllModels`) with no
  env/config dependency and cannot throw with no enterprise config; left as-is.
- `EnterpriseSection.tsx` needs no internal edit — it is removed wholesale by the
  gated mount in Task 1.

## Dependency Resolution

`depends_on: ["10-01"]`. The 10-01 commits (`PROVIDER_LOCKDOWN_ENABLED` build
flag + `defaults.ts` re-export) were present in repo history but not in this
worktree's HEAD. Cherry-picked the two 10-01 code commits (`75dc0780` RED,
`71ebb489` GREEN) into the worktree as `bf3a5b6b` + `57ee14e0` to satisfy the
dependency — see Deviations. The 10-01 docs-only commit (`e3d9daab`) was skipped
(planning-doc churn, not a build dependency, conflicted on ROADMAP/STATE).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing 10-01 dependency in worktree HEAD**
- **Found during:** Pre-Task-1 setup.
- **Issue:** Plan 10-04 declares `depends_on: ["10-01"]` and imports
  `PROVIDER_LOCKDOWN_ENABLED` from `src/config/defaults.ts`. The 10-01 commits
  exist in repo history but were not ancestors of this worktree's HEAD, so
  `defaults.ts` lacked the `PROVIDER_LOCKDOWN_ENABLED` re-export — every import
  in this plan would have failed `tsc`.
- **Fix:** Cherry-picked the two 10-01 code commits (`75dc0780`, `71ebb489`)
  into the worktree (`-x`-tracked as `bf3a5b6b`, `57ee14e0`); skipped the
  docs-only commit which conflicted on planning files and is not a build dep.
- **Files modified:** `scripts/generate-build-config.js`, `src/config/defaults.ts`,
  `scripts/generate-build-config.test.cjs`, `package.json` (all from 10-01).
- **Commits:** `bf3a5b6b`, `57ee14e0`.

## Verification

- `cd src && npx tsc --noEmit` — clean (default build, flag false).
- `npx eslint` on both modified files — clean (no errors, no warnings).
- Lockdown build-config generated with `OPENWHISPR_PROVIDER_LOCKDOWN=true` →
  `export const PROVIDER_LOCKDOWN_ENABLED = true;` (literal `true` — DCE-eligible).
- Default build-config restored → `PROVIDER_LOCKDOWN_ENABLED = false`; tsc still
  clean — default build keeps all 5 modes + every reasoning provider.
- Live UI / bundle-grep verification is deferred to plan 06 UAT per the plan's
  `<verification>` block.

## Threat Coverage

| Threat ID | Disposition | How addressed |
|-----------|-------------|---------------|
| T-10-07 | mitigated | `EnterpriseSection` mount gated; subtree DCE'd under lockdown |
| T-10-08 | mitigated | per-provider `ApiKeyInput` blocks behind literal-false branches |
| T-10-14 | mitigated | both `OpenAICompatiblePanel` consumers gated → file DCEs |
| T-10-15 | mitigated | `modes` array literal-folds to `[openwhispr, local]` under lockdown |

## Notes

`build-config.generated.{ts,cjs}` are `.gitignored` (regenerated at build time),
so only the two component source files were committed for this plan's tasks. The
chat-agent, dictation-agent, dictation-cleanup, and note-formatting settings
screens are covered transitively — they all mount `InferenceConfigEditor`, so no
edits at those mount sites were needed.

## Self-Check: PASSED

- `src/components/settings/InferenceConfigEditor.tsx` — FOUND
- `src/components/ReasoningModelSelector.tsx` — FOUND
- `10-04-SUMMARY.md` — FOUND
- Commit `75b4e46b` (Task 1) — FOUND
- Commit `90162482` (Task 2) — FOUND
