---
quick_id: 260522-qab
slug: lockdown-cloud-sync-gate
date: 2026-05-22
status: planned
---

# Quick Task: Fix corporate-lockdown cloud-sync gate (cloudBackupEnabled not in localStorage)

## Problem

Under `PROVIDER_LOCKDOWN_ENABLED` the corporate build sets
`cloudBackupEnabled` default to `true` via the `readBoolean`
fallback (`src/stores/settingsStore.ts:699`). But `readBoolean`'s
fallback only seeds the **in-memory** store value — it never writes
`localStorage`.

`SyncService.canSync()` (`src/services/SyncService.ts:21-26`, upstream
OpenWhispr code) reads `localStorage.getItem("cloudBackupEnabled")`
**raw**. With no key present it sees `null !== "true"` → `canSync()`
returns `false` → `debouncedPush()` / `syncAll()` silently return →
**no cloud sync ever runs**, the web dashboard stays empty.

Live diagnostic confirmed: `GATES: {cloudBackupEnabled: null}`,
`canSync(): false`.

`SyncService` is upstream code — must NOT be changed. The fix belongs
in our own lockdown init code: persist the lockdown default into
`localStorage` so the raw read in `canSync()` sees it.

(The other failing gate, `isSubscribed`, is a separate **server**
issue — R34 in SERVER-REQUIREMENTS.md — and is out of scope here.)

## Approach

`settingsStore.ts` already has an established init-side-effect pattern:
`migrateMeetingFollowFlags()` / `migratePreferredLanguage()` /
`migrateProviderSettings()` / `migrateAgentMode()` — each a module-scope
function called immediately on module load, guarded by `isBrowser`.

Add one such function in the same place and style:

```ts
// Corporate build (PROVIDER_LOCKDOWN_ENABLED): SyncService.canSync()
// (upstream code) reads localStorage.cloudBackupEnabled raw. The
// lockdown default only seeds the in-memory store, so seed localStorage
// too — but only when the key is absent, so a user's explicit toggle
// (which createBooleanSetter persists) always wins.
function seedLockdownCloudBackupDefault() {
  if (!isBrowser) return;
  if (!PROVIDER_LOCKDOWN_ENABLED) return;
  if (localStorage.getItem("cloudBackupEnabled") === null) {
    localStorage.setItem("cloudBackupEnabled", "true");
  }
}
seedLockdownCloudBackupDefault();
```

Place it next to the other migration functions/calls (after
`migrateAgentMode()`), so it runs before any `SyncService` use.

## Tasks

1. Add `seedLockdownCloudBackupDefault()` to `src/stores/settingsStore.ts`
   alongside the existing migration functions, and invoke it at module
   scope. Key-absent guard only — never overwrite an existing value.

## Out of scope

- `SyncService.ts` — upstream, untouched.
- `isSubscribed` gate — server-side, R34.
- The `cloudBackupEnabled: readBoolean(...)` line at :699 — stays;
  it correctly seeds the in-memory store. The new function only
  additionally mirrors it into localStorage.

## Verification

- Build the lockdown bundle, launch the client signed-in, read
  `localStorage.getItem("cloudBackupEnabled")` → `"true"`.
- `canSync()` no longer fails on the `cloudBackupEnabled` gate (it may
  still fail on `isSubscribed` until R34 lands server-side — expected).
- Non-lockdown build: `localStorage.cloudBackupEnabled` stays absent
  (function early-returns), upstream default `false` preserved.
