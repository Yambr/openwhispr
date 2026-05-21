# Deferred / Out-of-Scope Items — quick-260521-wt4-01

## Pre-existing uncommitted type errors (NOT introduced by this plan)

During execution, the working tree contained concurrent uncommitted changes in
files NOT part of this plan's `files_modified`:

- `src/components/SettingsPage.tsx`
- `src/components/settings/MeetingSettings.tsx`
- `scripts/verify-provider-lockdown.js`

These changes introduce `PROVIDER_LOCKDOWN_ENABLED`-gated spreads of the form
`...(PROVIDER_LOCKDOWN_ENABLED ? [] : [{ id: "providers", ... }])` into
`InferenceModeOption[]` arrays. The spread widens the literal `id` to `string`,
producing `error TS2322: Type 'string' is not assignable to type 'InferenceMode'`
at:

- `MeetingSettings.tsx(76,5)`, `(87,7)`, `(92,5)`
- `SettingsPage.tsx(251,5)`, `(262,7)`, `(267,5)`

**Verification:** `git stash` of all working changes → `npm run typecheck`
reports **0 errors** at HEAD `5d59e421`. The errors originate entirely from the
concurrent (non-plan) changes.

**Fix (out of scope):** add `as const` to each spread object's `id`, or type the
spread array as `InferenceModeOption[]`, so the literal is preserved.

This plan committed only its own files (`useUsage.ts`, `ControlPanelSidebar.tsx`,
`ControlPanel.tsx`, `settingsStore.ts`), all of which type-check clean. The
external files were left untouched and uncommitted.
