---
phase: 02-architecture-doc-hardcode-inventory
verified: 2026-05-08T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "WR-01 (Blocker): ARCHITECTURE.md:237 incorrect 'unreadable across sessions' claim — replaced with accurate keyring → safeStorage → plaintext fallback chain citing secretCrypto.js:39-46 and :49-56"
    - "WR-02 (Warning): ARCHITECTURE.md macOS keychain bullet — libsecret removed, Security.framework only"
    - "WR-03 (Warning): ARCHITECTURE.md model registry top-level keys — all 8 keys now enumerated (parakeetModels, diarizationModels, whisperModels, transcriptionProviders, cloudProviders, enterpriseProviders, localProviders, openwhisprCloudModels)"
  gaps_remaining: []
  regressions: []
---

# Phase 2: Architecture Doc + Hardcode Inventory — Verification Report (Re-verification)

**Phase Goal:** The application's internal process model and IPC surface are documented, and every hardcoded value targeted for replacement is catalogued with its proposed env-var name.
**Verified:** 2026-05-08
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 02-03)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | External implementer can read `docs/ARCHITECTURE.md` standalone and understand process model, IPC surface, secrets, model registry, transcription, embeddings, and sidecars | VERIFIED | 531-line doc with all 9 H2 sections; all 4 process types documented; 8 IPC channel categories; sidecar inventory present; Phase 1 cross-links present |
| 2 | Every claim about a subsystem is paired with a `file:line` citation enabling git grep drift detection | VERIFIED | All 3 prior factual-accuracy gaps closed: (a) Linux fallback paragraph now correctly cites secretCrypto.js:39-46 and :49-56, matching `_initKeychain()` returning false → `_ensureInit()` falling back to safeStorage mode; (b) macOS bullet correctly cites Security.framework only; (c) model registry section enumerates all 8 actual top-level keys verified by `jq 'keys' src/models/modelRegistryData.json` |
| 3 | IPC surface is summarized by domain category with preload.js cited as authoritative full list | VERIFIED | 8 domain-prefix categories with example channels; preload.js cited as authoritative full list |
| 4 | Every hardcoded backend URL, OAuth client ID, enterprise endpoint, default model registry override, and LiteLLM-shaped URL appears as a row in `docs/CONFIG_INVENTORY.md` with file:line, current value, proposed env-var, category, and notes | VERIFIED | 23 rows across 5 categories; 18 unique OPENWHISPR_* env-var names; cross-links to BACKEND_SPEC.md and OAUTH_SPEC.md present |
| 5 | A developer can execute the Phase 3 refactor using only this inventory — no re-auditing of the source tree required | VERIFIED | All 23 file:line citations verified accurate by spot-check; consolidation opportunities documented in notes column |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docs/ARCHITECTURE.md` | Architecture reference (process model, IPC, secrets, model registry, transcription, embeddings, sidecars); min 300 lines | VERIFIED | 531 lines; all required H2 sections present; all 3 prior factual-accuracy gaps closed |
| `docs/CONFIG_INVENTORY.md` | 5-column hardcode inventory; min 50 lines; contains "file:line" | VERIFIED | 55 lines; 23 inventory rows; all 5 categories; cross-links present (unchanged from prior verification) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `docs/ARCHITECTURE.md` (Linux fallback paragraph) | `src/helpers/secretCrypto.js:39-46`, `:49-56` | Citation describing `_initKeychain()` → `_ensureInit()` → safeStorage fallback | VERIFIED | Source file confirmed: line 38-46 is the `catch` returning false, lines 49-56 are `_ensureInit()` setting mode to "safeStorage" or "unavailable" |
| `docs/ARCHITECTURE.md` (model registry section) | `src/models/modelRegistryData.json` | Enumeration of 8 top-level keys | VERIFIED | `jq 'keys'` returns exactly these 8 keys: cloudProviders, diarizationModels, enterpriseProviders, localProviders, openwhisprCloudModels, parakeetModels, transcriptionProviders, whisperModels — all present in doc |
| `docs/ARCHITECTURE.md` | `preload.js` | IPC surface section citation | VERIFIED | Unchanged from prior verification |
| `docs/ARCHITECTURE.md` | `src/helpers/environment.js` | Secret storage section SECRET_KEYS citation | VERIFIED | Unchanged |
| `docs/ARCHITECTURE.md` | `docs/BACKEND_SPEC.md` | Cross-reference for wire-level details | VERIFIED | Unchanged |
| `docs/CONFIG_INVENTORY.md` | `docs/BACKEND_SPEC.md`, `docs/OAUTH_SPEC.md`, `src/config/constants.ts` | Notes column anchor links / source citations | VERIFIED | Unchanged from prior verification |

### Data-Flow Trace (Level 4)

Not applicable — documentation-only phase.

### Behavioral Spot-Checks

Step 7b: SKIPPED — documentation-only phase.

### Re-verification Grep Proof

```
# WR-01 (Blocker resolved)
$ grep -F "effectively unreadable across sessions" docs/ARCHITECTURE.md | wc -l
0                                                                                  # PASS
$ grep -F "secretCrypto.js:49-56" docs/ARCHITECTURE.md
[match]                                                                            # PASS
$ grep -F "degrades to plaintext" docs/ARCHITECTURE.md
[match]                                                                            # PASS

# WR-02 (Warning resolved)
$ grep -E "^\- \*\*macOS\*\*.*libsecret" docs/ARCHITECTURE.md | wc -l
0                                                                                  # PASS
$ grep -E "^\- \*\*macOS\*\*" docs/ARCHITECTURE.md
- **macOS**: Keychain (via `@napi-rs/keyring` → Security.framework)               # PASS
$ grep -E "^\- \*\*Linux\*\*.*libsecret" docs/ARCHITECTURE.md
- **Linux**: libsecret (via `@napi-rs/keyring`) when a keyring daemon …           # PASS

# WR-03 (Warning resolved) — all 8 keys present in doc
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
```

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DOC-04 | 02-01-PLAN.md, 02-03-PLAN.md (gap-closure) | `docs/ARCHITECTURE.md` covers process model, IPC surface, secret storage, model registry, transcription pipeline, embeddings pipeline, sidecar binaries | SATISFIED | All 7 topics covered with accurate file:line citations; the 3 factual-accuracy issues from prior verification are resolved (verified against secretCrypto.js source and `jq 'keys' modelRegistryData.json`) |
| CFG-01 | 02-02-PLAN.md | `docs/CONFIG_INVENTORY.md` lists every hardcoded backend URL, OAuth client ID, enterprise endpoint, default model registry override, LiteLLM-shaped URL with file path, line, current value, proposed env-var name | SATISFIED | 23 rows with verified file:line citations; all 5 category buckets addressed; no placeholder env-var names |

No orphaned requirements. REQUIREMENTS.md assigns DOC-04 and CFG-01 exclusively to Phase 2; both fully covered.

---

### Anti-Patterns Found

None blocking. All 3 prior anti-patterns (WR-01 blocker, WR-02/WR-03 warnings) are resolved per grep proof above. ARCHITECTURE.md line count remains 531 (no structural changes; only the 3 targeted paragraphs were edited).

---

### Human Verification Required

None. Both deliverables are static documentation files. All verification was performed programmatically.

---

## Gaps Summary

No gaps. Plan 02-03 successfully closed all 3 factual-accuracy gaps from the prior verification:

1. **WR-01 (Blocker → CLOSED)**: ARCHITECTURE.md Linux fallback paragraph now accurately describes the `_initKeychain()` failure → `_ensureInit()` → safeStorage degradation → plaintext-on-headless-Linux chain, with citations matching `secretCrypto.js:39-46` and `:49-56` exactly.

2. **WR-02 (Warning → CLOSED)**: macOS keychain bullet now correctly identifies `Security.framework` only as the backing store; `libsecret` correctly remains attributed to Linux.

3. **WR-03 (Warning → CLOSED)**: Model registry section now enumerates all 8 top-level keys verified against `jq 'keys' src/models/modelRegistryData.json`. Cross-references with CONFIG_INVENTORY rows that cite `transcriptionProviders[*]` are now consistent.

Phase 2 goal is achieved: a third-party implementer can use `docs/ARCHITECTURE.md` to understand the system architecture and `docs/CONFIG_INVENTORY.md` to drive the Phase 3 build-time configurability refactor without re-auditing the source tree.

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier)_
