---
quick_id: 260522-qab
slug: lockdown-cloud-sync-gate
date: 2026-05-22
status: complete
commit: 37b09d2b
---

# Summary: Fix corporate-lockdown cloud-sync gate

## What was wrong

Under `PROVIDER_LOCKDOWN_ENABLED` the `cloudBackupEnabled` default
(`true`) was seeded only into the in-memory settings store via the
`readBoolean` fallback — never written to `localStorage`.
`SyncService.canSync()` (upstream code) reads
`localStorage.getItem("cloudBackupEnabled")` raw, saw `null`, and
disabled all cloud sync. Result: the web dashboard stayed empty —
nothing the desktop produced synced.

## Fix

`src/stores/settingsStore.ts` — added `seedLockdownCloudBackupDefault()`,
a module-scope init side-effect in the same style as the existing
`migrate*()` functions. Under lockdown, when `cloudBackupEnabled` is
absent from `localStorage`, it writes `"true"`. Key-absent guard only —
an explicit user toggle (persisted by `createBooleanSetter`) always
wins. `SyncService.ts` untouched (upstream). The `:699` `readBoolean`
line untouched.

Commit `37b09d2b`. Typecheck clean. No settingsStore tests exist.

## Verified live

Driven through the real lockdown Electron client:
`localStorage.getItem("cloudBackupEnabled") === "true"`, the
`cloudBackupEnabled` gate of `canSync()` now passes.

## Scope note

`canSync()` has a second failing gate, `isSubscribed`, which is a
server-side defect — filed as R34 in
`.planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md`
(`/api/usage` omits `isSubscribed`). Full cloud sync needs BOTH this
client fix AND R34 server-side.
