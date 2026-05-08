---
phase: 02-architecture-doc-hardcode-inventory
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - docs/ARCHITECTURE.md
  - docs/CONFIG_INVENTORY.md
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Both `docs/ARCHITECTURE.md` (531 lines) and `docs/CONFIG_INVENTORY.md` (55 lines) satisfy the structural requirements of their respective plans (02-01-PLAN.md and 02-02-PLAN.md). All eight DOC-04 H2 sections are present in ARCHITECTURE.md, file:line citations are abundant (well over the ≥10/≥20 thresholds), Phase 1 cross-links resolve to real files, and all five required CONFIG_INVENTORY columns are populated for every row.

The findings below are factual accuracy issues. None are blocking — most are small drift between prose claims and source — but several should be fixed before publication because the doc explicitly markets itself as a drift-detectable, citation-backed reference for external implementers (D-04). Two claims about secret storage on Linux and one about the model registry top-level keys would mislead a third party reading the doc standalone.

## Warnings

### WR-01: Misleading Linux-keyring-fallback claim contradicts source

**File:** `docs/ARCHITECTURE.md:237`
**Issue:** The doc states "On Linux without a running keyring daemon, `@napi-rs/keyring` fails to load or store the master key. In this case `src/helpers/secretCrypto.js` logs a warning and the encrypted files are effectively unreadable across sessions." This is incorrect. `src/helpers/secretCrypto.js:49-56` shows `_ensureInit()` falls back from `keychain` mode to `safeStorage` mode when keyring fails. On Linux without a keyring, Electron's `safeStorage` itself falls back to a plaintext-equivalent encoding — so files remain readable across sessions, they're just not strongly encrypted. The "unreadable across sessions" claim contradicts the project-level note in CLAUDE.md ("Linux without a keyring falls back to plaintext"). This is the security-relevant scenario most likely to be cited by a self-hoster auditing the codebase.
**Fix:** Replace with: "On Linux without a running keyring daemon, `@napi-rs/keyring` fails and `_ensureInit()` falls back to Electron's `safeStorage` (`src/helpers/secretCrypto.js:55`). On Linux without a keyring, `safeStorage` itself degrades to plaintext storage — secrets remain readable across sessions but are not strongly encrypted at rest. This is a known limitation on headless or minimal Linux setups."

### WR-02: macOS keychain backend description includes Linux-only library

**File:** `docs/ARCHITECTURE.md:233`
**Issue:** "**macOS**: Keychain (via `@napi-rs/keyring` → libsecret / Security.framework)". `libsecret` is the Linux backend; on macOS `@napi-rs/keyring` uses Security.framework / Keychain Services only. Listing libsecret here will confuse readers and undermines the doc's authority on the secret-storage trust boundary.
**Fix:** Replace line 233 with: "**macOS**: Keychain (via `@napi-rs/keyring` → Security.framework Keychain Services)".

### WR-03: Model registry top-level keys list is incomplete and partially wrong

**File:** `docs/ARCHITECTURE.md:263`
**Issue:** The doc claims `src/models/modelRegistryData.json` "contains top-level keys: `parakeetModels`, `diarizationModels`, `whisperModels`, and cloud provider model lists." Actual top-level keys (verified via `grep -n` on the JSON file) are: `parakeetModels` (line 2), `diarizationModels` (line 52), `whisperModels` (line 72), `transcriptionProviders` (line 135), `cloudProviders` (line 196), `localProviders` (line 448). The phrase "cloud provider model lists" obscures the fact that `transcriptionProviders` and `localProviders` are sibling top-level arrays, not nested under cloud providers. CONFIG_INVENTORY.md cites three rows pointing into `transcriptionProviders[*]` (lines 139, 166, 185) — readers cross-referencing the two docs will be confused.
**Fix:** Update to: "contains top-level keys: `parakeetModels`, `diarizationModels`, `whisperModels`, `transcriptionProviders`, `cloudProviders`, and `localProviders`. Cloud provider models live under `cloudProviders`; OpenAI-compatible transcription provider base URLs live under `transcriptionProviders[*].baseUrl` (referenced by `docs/CONFIG_INVENTORY.md`)."

### WR-04: searchNotesTool.ts citation path is wrong

**File:** `docs/ARCHITECTURE.md:386`
**Issue:** The doc cites "`src/services/tools/searchNotesTool.ts:37`" — the path is correct. However, the project-level CLAUDE.md and earlier paragraphs in the codebase context refer to this as living under `src/services/ai/tools/`. There is only one canonical location: `src/services/tools/searchNotesTool.ts` (verified with `find`). This is an inconsistency, not a doc bug — but the doc's earlier reference at line 144 of the *plan* says `src/services/ai/tools/searchNotesTool.ts`. The doc itself uses the correct path; flagging here for completeness because a reviewer cross-referencing the plan to the doc would notice the divergence and may try to "fix" the doc back to the wrong path.
**Fix:** No doc change needed — the doc is correct. Consider noting in the summary or a follow-up that the path in the plan was incorrect, so reviewers don't regress it.

## Info

### IN-01: Approximate line range citation could be tightened

**File:** `docs/ARCHITECTURE.md:135`
**Issue:** "Channel names are in `preload.js:185-400` (approximately)." The "(approximately)" hedge weakens the citation. Either nail the range with `git grep` or replace with a non-numeric phrase like "in the `electronAPI` object exposed at `preload.js:25`".
**Fix:** Either drop "(approximately)" after verifying the actual range, or replace with: "Channel names are defined in the `electronAPI` object exposed via `contextBridge.exposeInMainWorld` at `preload.js:25`."

### IN-02: Claim of ~150+ IPC channels is unsourced

**File:** `docs/ARCHITECTURE.md:98`
**Issue:** "The IPC surface is large (~150+ channels)." No source for the count. If a reader runs `grep -c "ipcMain.handle\|ipcMain.on" src/helpers/ipcHandlers.js` and gets a different number, the doc's authority on the IPC surface is undermined.
**Fix:** Either drop the number ("The IPC surface is large — many dozens of channels.") or add a verifiable count with a grep recipe in a comment.

### IN-03: 14-vs-12 SECRET_KEYS callout is good but could be sharper

**File:** `docs/ARCHITECTURE.md:226`
**Issue:** The callout "`CLAUDE.md` describes this as 12 keys, but the current source at `src/helpers/environment.js:9-24` defines 14 entries" is accurate and useful for drift detection (verified: source has exactly 14 entries at lines 10-23). Consider also flagging that PROJECT.md / CLAUDE.md should be updated as a follow-up, so the inconsistency doesn't recur.
**Fix:** Append: "(Follow-up: update `CLAUDE.md` §Settings Storage to say 14 keys.)" — or open a separate doc-drift ticket.

### IN-04: ONNX worker characterized as "OS process" is technically imprecise

**File:** `docs/ARCHITECTURE.md:46, 84`
**Issue:** The diagram and prose describe the ONNX worker as a separate "OS process". Per `src/helpers/onnxWorkerClient.js:2,57` it is an Electron `utilityProcess.fork()` — which IS a separate OS process, but the implementation detail (Electron utility process, not raw `child_process.fork`) is relevant for a reader auditing crash isolation behavior. The Sidecars section at line 499 correctly says "via Electron `utilityProcess`" but the Process Model section omits this.
**Fix:** Add to line 84: "...spawned lazily by `src/helpers/onnxWorkerClient.js:1` (via Electron `utilityProcess.fork`, see `onnxWorkerClient.js:57`) on first use."

### IN-05: CONFIG_INVENTORY summary count is correct but enterprise row is empty by design

**File:** `docs/CONFIG_INVENTORY.md:17, 43`
**Issue:** The Summary table at line 17 lists `enterprise: 0`, and the inventory at line 43 has a sentinel "_No entries_" row. This is correct per the verification note (line 22), but the sentinel row uses em-dashes in `proposed env-var` and `category` columns while having `enterprise` as the actual category — a downstream consumer parsing the table mechanically (per the doc's stated purpose: "a developer working only from this file should be able to locate every hardcode") may stumble on the row that has category `enterprise` but no `file:line`. Consider either dropping the row entirely (the explanatory note at line 22 already covers it) or making it clearly machine-skippable (e.g., `file:line` = `N/A`, `category` = `enterprise (none)`).
**Fix:** Either remove the "_No entries_" row from the table and rely on the explanatory paragraph at line 22, or change line 43 to: `| _N/A — see note above_ | — | — | enterprise (none) | ... |`.

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
