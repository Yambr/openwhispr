---
phase: 02-architecture-doc-hardcode-inventory
plan: 03
subsystem: documentation
tags: [docs, architecture, gap-closure, verification]
requires: [02-VERIFICATION.md]
provides: [docs/ARCHITECTURE.md]
affects: [docs/ARCHITECTURE.md]
key-files:
  modified:
    - docs/ARCHITECTURE.md
decisions:
  - "Resolved WR-01 by accurately describing keyring → safeStorage → unavailable fallback chain instead of incorrect 'unreadable' claim"
  - "Resolved WR-02 by removing Linux-only libsecret reference from macOS keychain bullet"
  - "Resolved WR-03 by enumerating all 8 top-level keys in modelRegistryData.json (was 3 + vague phrase)"
metrics:
  tasks: 3
  files_modified: 1
  commits: 3
  completed: 2026-05-08
---

# Phase 02 Plan 03: ARCHITECTURE.md Gap Closure Summary

Three surgical text edits to `docs/ARCHITECTURE.md` resolving WR-01 (blocker) and WR-02/WR-03 (warnings) reported by `02-VERIFICATION.md`. All factual claims now match cited source files.

## Tasks Executed

### Task 1 — WR-01 (Blocker): Linux keyring fallback accuracy

**Before** (line 237):
> **Linux plaintext fallback**: On Linux without a running keyring daemon, `@napi-rs/keyring` fails to load or store the master key. In this case `src/helpers/secretCrypto.js` logs a warning and the encrypted files are effectively unreadable across sessions. Electron's `safeStorage` is used as a secondary check (`src/helpers/secretCrypto.js:2`). This is a known limitation on headless or minimal Linux setups.

**After**:
> **Linux plaintext fallback**: On Linux without a running keyring daemon, `@napi-rs/keyring` fails to acquire the master key and `_initKeychain()` returns `false` (`src/helpers/secretCrypto.js:39-46`). `_ensureInit()` then falls back to Electron's `safeStorage` mode (`src/helpers/secretCrypto.js:49-56`). On Linux without any keyring backend, `safeStorage` itself degrades to plaintext storage — encrypted files remain readable across sessions but the secrets are no longer strongly encrypted at rest. Only when neither `@napi-rs/keyring` nor `safeStorage.isEncryptionAvailable()` succeeds does the mode become `"unavailable"` and writes throw. This is a known limitation on headless or minimal Linux setups; CLAUDE.md flags it explicitly under "Security Considerations".

**Commit:** `431be07`

### Task 2 — WR-02 (Warning): macOS keychain backing accuracy

**Before** (line 233):
> - **macOS**: Keychain (via `@napi-rs/keyring` → libsecret / Security.framework)

**After**:
> - **macOS**: Keychain (via `@napi-rs/keyring` → Security.framework)

Linux bullet (line 235) untouched — `libsecret` correctly retained there.

**Commit:** `1356d07`

### Task 3 — WR-03 (Warning): Model registry top-level keys enumeration

**Before** (line 263):
> `src/models/modelRegistryData.json:1` contains top-level keys: `parakeetModels`, `diarizationModels`, `whisperModels`, and cloud provider model lists. …

**After**:
> `src/models/modelRegistryData.json:1` contains 8 top-level keys: `parakeetModels`, `diarizationModels`, `whisperModels`, `transcriptionProviders`, `cloudProviders`, `enterpriseProviders`, `localProviders`, and `openwhisprCloudModels`. CONFIG_INVENTORY.md rows that cite `transcriptionProviders[*]` reference this same registry. …

All 8 keys verified against `jq 'keys' src/models/modelRegistryData.json`.

**Commit:** `8b8ff27`

## Verification (grep proof)

```
# WR-01
$ grep -F "effectively unreadable across sessions" docs/ARCHITECTURE.md | wc -l
0                                                                                  # PASS
$ grep -F "secretCrypto.js:49-56" docs/ARCHITECTURE.md
[match found]                                                                      # PASS
$ grep -F "degrades to plaintext" docs/ARCHITECTURE.md
[match found]                                                                      # PASS

# WR-02
$ grep -E "^\- \*\*macOS\*\*.*libsecret" docs/ARCHITECTURE.md | wc -l
0                                                                                  # PASS
$ grep -F "Security.framework" docs/ARCHITECTURE.md
- **macOS**: Keychain (via `@napi-rs/keyring` → Security.framework)               # PASS
$ grep -E "^\- \*\*Linux\*\*.*libsecret" docs/ARCHITECTURE.md
- **Linux**: libsecret (via `@napi-rs/keyring`) when …                             # PASS

# WR-03 — all 8 keys present
OK: parakeetModels
OK: diarizationModels
OK: whisperModels
OK: transcriptionProviders
OK: cloudProviders
OK: enterpriseProviders
OK: localProviders
OK: openwhisprCloudModels                                                          # PASS
$ grep -F "and cloud provider model lists" docs/ARCHITECTURE.md | wc -l
0                                                                                  # PASS

# Doc length sanity
$ wc -l docs/ARCHITECTURE.md
531                                                                                # within expected ~530-540 range
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File modified: `docs/ARCHITECTURE.md` ✓
- Commits exist: `431be07`, `1356d07`, `8b8ff27` ✓
- All grep verifications pass ✓
- No structural changes to ARCHITECTURE.md (line count 531, within bounds) ✓
