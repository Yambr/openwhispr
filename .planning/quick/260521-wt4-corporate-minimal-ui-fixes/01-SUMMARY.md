---
phase: quick-260521-wt4
plan: 01
subsystem: renderer / build-time feature gating
tags: [corporate-minimal, billing-gate, provider-lockdown, dce]
requires: [BILLING_ENABLED, PROVIDER_LOCKDOWN_ENABLED]
provides:
  - "Corporate build with zero Pro/upgrade/limit UI surface"
  - "Lockdown-aware first-run setting defaults"
affects: [src/hooks/useUsage.ts, src/components/ControlPanelSidebar.tsx, src/components/ControlPanel.tsx, src/stores/settingsStore.ts]
key-files:
  created: []
  modified:
    - src/hooks/useUsage.ts
    - src/components/ControlPanelSidebar.tsx
    - src/components/ControlPanel.tsx
    - src/stores/settingsStore.ts
decisions:
  - "Reused BILLING_ENABLED (Pro IS billing) — no new flag, per plan interface"
  - "UpgradePrompt.tsx + IntegrationsView.tsx needed no internal edits — gating at call sites is sufficient and DCE-friendly"
  - "migrateProviderSettings/migrateAgentMode left intact — they migrate stored legacy data, not first-run defaults"
metrics:
  duration: ~15m
  completed: 2026-05-21
  tasks: 3
  files: 4
---

# Phase quick-260521-wt4 Plan 01: Corporate-Minimal UI Fixes Summary

Build-time-gated all Pro/upgrade/limit surfaces behind `BILLING_ENABLED` and made
two first-run setting defaults lockdown-aware via `PROVIDER_LOCKDOWN_ENABLED`, so
the corporate-minimal build shows no plan gating, unlocks MCP/CLI integrations,
defaults cloud backup on, and never defaults the dictation agent to a cut mode.
Default build (both flags off) stays upstream-parity.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Neutralize usage limits under BILLING_ENABLED=false | 8f9f63f3 | src/hooks/useUsage.ts |
| 2 | Gate sidebar banners + UpgradePrompt + integration locks | 5d59e421 | src/components/ControlPanelSidebar.tsx, src/components/ControlPanel.tsx |
| 3 | Lockdown-aware setting defaults (cloudBackup + inference modes) | 76bdb747 | src/stores/settingsStore.ts |

## What Changed

**FIX1 — billing surface gating:**
- `useUsage.ts`: `isOverLimit`/`isApproachingLimit` now prefixed with
  `BILLING_ENABLED &&` — const-fold to `false` in the corporate build; Rolldown
  DCEs the limit arithmetic.
- `ControlPanelSidebar.tsx`: `showLimitBanner`/`showUpgradeBanner` prefixed with
  `BILLING_ENABLED &&` — banner JSX (166-218) becomes unreferenced and DCEs.
- `ControlPanel.tsx`: `setShowUpgradePrompt(true)` guarded by `BILLING_ENABLED`;
  `<UpgradePrompt/>` render wrapped in `{BILLING_ENABLED && (...)}` so the
  component DCEs; `IntegrationsView isPaid` resolves to `true` when
  `BILLING_ENABLED` is false, unlocking MCP/CLI cards.

**FIX2 — `cloudBackupEnabled`:** first-run default changed from `false` to
`PROVIDER_LOCKDOWN_ENABLED` (true under corporate lockdown). A stored value still
wins (`readBoolean` only uses the fallback when the key is absent).

**FIX3 — `dictationAgentMode`:** IIFE final fallback changed from
`"providers"` to `PROVIDER_LOCKDOWN_ENABLED ? "openwhispr" : "providers"`.
The `providers` mode is cut from the corporate build by `InferenceConfigEditor`,
so the corporate default must be `openwhispr`. `readString` default arg kept `""`
so the validation branch still runs.

## Verified, No Change Needed

- `UpgradePrompt.tsx`: fully dead under the `ControlPanel` render gate. Its only
  other reference — a comment + IPC emit in `useAudioRecording.js` — feeds the
  `onLimitReached` handler, whose display path is already `BILLING_ENABLED`-gated.
- `IntegrationsView.tsx`: `isPaid` flows unchanged to `McpIntegrationCard` /
  `CliIntegrationCard`; arriving `true` under lockdown unlocks them. `onUpgrade`
  still passed (harmless when unused).
- Inference-mode initializers already defaulting to `openwhispr` (no change):
  `transcriptionMode` (740/742), `cleanupMode` (750/759),
  `meetingTranscriptionMode` (764/766), `noteFormattingMode` (786/795),
  `chatAgentMode` (843/853), `cloudTranscriptionMode` (644), `cleanupCloudMode`
  (645).
- `migrateProviderSettings` / `migrateAgentMode`: left intact — they migrate
  existing stored legacy BYOK data (stored-value handling), not first-run
  defaults; touching them would corrupt migration of real user data.

## Deviations from Plan

### Verification command correction
The plan specified `npx tsc --noEmit -p .`, but the repo has no root
`tsconfig.json` — the TS project lives at `src/tsconfig.json` and the canonical
script is `npm run typecheck` (`cd src && tsc --noEmit`). Verification was run
with `npm run typecheck`. No code impact.

### Build verification skipped (out-of-scope blocker)
The plan's optional step `OPENWHISPR_PROVIDER_LOCKDOWN=true npm run build:renderer`
was not run because the working tree contains concurrent, out-of-scope
uncommitted changes to `SettingsPage.tsx` / `MeetingSettings.tsx` that currently
fail type-check (see Deferred Issues). Running the renderer build would compile
those broken files and also mutate the shared `build-config.generated.*` files.
The four plan files all type-check clean on their own.

## Deferred Issues

Concurrent uncommitted changes (NOT part of this plan) in
`src/components/SettingsPage.tsx`, `src/components/settings/MeetingSettings.tsx`,
and `scripts/verify-provider-lockdown.js` introduce 6 `TS2322` errors — spreads
of the form `...(PROVIDER_LOCKDOWN_ENABLED ? [] : [{ id: "providers" }])` widen
`id` from a literal to `string`, breaking `InferenceModeOption[]`. Confirmed
pre-existing/external via `git stash` → `npm run typecheck` reports 0 errors at
HEAD `5d59e421`. These files were left untouched and uncommitted. Details and
suggested fix (`as const` on each `id`) in `deferred-items.md`.

## Self-Check: PASSED

- All 4 modified files exist and were committed.
- Commits verified present: 8f9f63f3, 5d59e421, 76bdb747.
- `npm run typecheck`: zero errors in any of the 4 plan files (all 6 remaining
  errors confined to out-of-scope external files).
