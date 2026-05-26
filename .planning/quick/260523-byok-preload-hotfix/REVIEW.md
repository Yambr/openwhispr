---
phase: 260523-byok-preload-hotfix
reviewed: 2026-05-23T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - electron-builder.json
  - package.json
  - package-lock.json
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# v1.7.8 Hotfix Review — BYOK preload whitelist

**Diff:** `36ad6c4d..ea306a51` (1 commit)
**Verdict:** SHIP. Fix is complete, minimal, and correct.

## Scrutiny Checklist

### 1. Generator output coverage — COMPLETE
`scripts/generate-build-config.js` emits 7 files (`outPath` definitions L653-659):

| Output | Whitelist coverage |
|---|---|
| `src/config/build-config.generated.ts` | `src/config/**/*` |
| `src/config/build-config.generated.cjs` | `src/config/**/*` |
| `preload-gcal.generated.cjs` | explicit (L17) |
| `preload-billing.generated.cjs` | explicit (L18) |
| `preload-referrals.generated.cjs` | explicit (L19) |
| `preload-streaming.generated.cjs` | explicit (L20) |
| `preload-byok.generated.cjs` | explicit (L21) — **fix** |

All 7 reach `app.asar`. No further gaps.

### 2. JSON well-formed — OK
`python3 -m json.tool` clean; 69 entries in `files` array; new line placed in the preload-* sibling group preserving logical order.

### 3. Repo-root `require()` from preload/main — OK
- `preload.js`: requires exactly the 5 generated CJS preloads at repo root — all whitelisted.
- `main.js`: only requires from `./src/helpers/**`, `./src/updater`, `./src/config/build-config.generated.cjs` — all covered by `src/helpers/**/*` / `src/updater.js` / `src/config/**/*`.

### 4. preload.js require chain — OK
No external root-level requires beyond electron + the 5 generated CJS files. No transient repo-root deps inside the generated CJS bodies (they are pure factory functions over `ipcRenderer`).

### 5. Version bump 1.7.7 → 1.7.8 — OK
Plain semver, single patch bump, no prerelease suffix. Tag-ready. `package.json` (1.7.8) > `upstream/main` (1.7.2) — fork-divergence rule (≥1 patch ahead) satisfied. `package-lock.json` mirrors.

## Findings

### IN-01: No regression guard for future generator-output drift
**File:** `scripts/generate-build-config.js` / `electron-builder.json`
**Issue:** This bug class (generator emits a new repo-root file, electron-builder whitelist never updated) recurred for 7 releases (v1.7.0–v1.7.7) undetected because there is no startup or build-time assertion that every `outPath` produced by the generator is present in the packaged asar. The fix closes the BYOK instance but not the pattern.
**Fix (optional, not blocking):** Either (a) collapse all `preload-*.generated.cjs` under a wildcard `preload-*.generated.cjs` whitelist line so any future emitter is automatically included, or (b) add a CI check that diffs `outPath` names against the `files` array. Option (a) is one line and immediate.

---

_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
