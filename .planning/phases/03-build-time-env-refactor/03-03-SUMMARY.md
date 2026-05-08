---
phase: 03-build-time-env-refactor
plan: 3
subsystem: electron-builder-config
tags: [build-time-env, electron-builder, protocol-scheme, refactor]
requires:
  - "03-01 build-config.generated.cjs (Wave 1) — emits OPENWHISPR_OAUTH_PROTOCOL_SCHEME + OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN"
  - "03-02 main.js require pattern (Wave 2)"
provides:
  - "electron-builder.config.js (CommonJS) supersedes electron-builder.json"
  - "main.js getOAuthProtocol() reads OVERRIDDEN boolean to decide env-vs-channel precedence"
affects:
  - electron-builder.config.js (created)
  - electron-builder.json (deleted)
  - main.js
tech-stack:
  added: []
  patterns:
    - "electron-builder JS config auto-discovered (no --config flag needed)"
    - "Boolean-flag-based override detection (no string-compare-to-default)"
key-files:
  created:
    - electron-builder.config.js
  modified:
    - main.js
  deleted:
    - electron-builder.json
decisions:
  - "Used JS module instead of scripted JSON generation per plan D-04 (electron-builder natively supports .js configs)"
  - "Override detection consumes OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN boolean instead of comparing string to default — eliminates false-negative when explicit env-set value matches default"
  - "Dropped legacy process.env.VITE_OPENWHISPR_PROTOCOL / process.env.OPENWHISPR_PROTOCOL runtime fallbacks — single build-time path now"
metrics:
  duration: ~6min
  tasks: 3
  files: 3
  completed: 2026-05-08
---

# Phase 3 Plan 3: Electron-Builder Config Summary

Wave 3 — converted `electron-builder.json` to `electron-builder.config.js` (CommonJS module) so the protocol scheme literal becomes build-time configurable via `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME`. Updated `main.js` `getOAuthProtocol()` to consume the `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` boolean from `build-config.generated.cjs`, replacing the legacy runtime env-var fallback chain.

## What Was Built

### Task 1 — JS module supersedes JSON (commit `1a11be1`)

`electron-builder.config.js` is a CommonJS module that:

1. Reads `process.env.OPENWHISPR_OAUTH_PROTOCOL_SCHEME` at the top of the file with a `"openwhispr"` fallback.
2. Substitutes that value into the `protocols.schemes` array — the only structural change vs the prior JSON.
3. Mirrors every other field byte-for-byte from `electron-builder.json` (appId, files, asarUnpack, mac/win/linux/flatpak/deb/rpm/nsis/dmg/publish blocks).

`electron-builder.json` was deleted via `git rm`. `package.json` was unchanged because no script previously passed `--config electron-builder.json` — electron-builder auto-discovers `electron-builder.config.js` by convention.

### Task 2 — main.js boolean-flag override (commit `5d4d4f3`)

Extended the existing destructure from `build-config.generated.cjs` to include both `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` and `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN`. Rewrote `getOAuthProtocol()`:

```js
function getOAuthProtocol() {
  if (OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN) {
    return OPENWHISPR_OAUTH_PROTOCOL_SCHEME;
  }
  return (
    DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL[APP_CHANNEL] || DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL.production
  );
}
```

Removed the prior runtime fallback chain (`process.env.VITE_OPENWHISPR_PROTOCOL || process.env.OPENWHISPR_PROTOCOL`). Added a comment above `DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL` documenting that the env override beats the channel map when the boolean flag is true. Channel-name string literals (`openwhispr`, `openwhispr-staging`, `openwhispr-dev`) retained inside the map because they are channel labels, not the configurable scheme.

### Task 3 — Human-verify checkpoint (auto-approved)

Auto-mode active (`workflow.auto_advance=true`); the human-verify checkpoint was auto-approved per the GSD checkpoint protocol. The packaging-level Info.plist verification (three-build matrix from the plan) is deferred to Plan 6 (verify-parity-and-smoke), which already owns end-to-end packaged-binary parity checks.

## Verification Performed

```text
$ node --check electron-builder.config.js
OK

$ node -e "const c=require('./electron-builder.config.js'); console.log(c.appId, c.protocols.schemes)"
com.yambr.openwhispr [ 'openwhispr' ]

$ OPENWHISPR_OAUTH_PROTOCOL_SCHEME=testscheme \
    node -e "const c=require('./electron-builder.config.js'); \
             if(!JSON.stringify(c).includes('testscheme')) process.exit(1)"
testscheme override OK

$ test ! -f electron-builder.json && echo "JSON deleted: OK"
JSON deleted: OK

$ node --check main.js
OK

$ grep -cE 'process\.env\.(VITE_)?OPENWHISPR_PROTOCOL' main.js
0

$ grep -c 'OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN' main.js
3   # destructure + comment + if-guard

$ grep -c 'Channel-specific defaults' main.js
1

$ grep -cE 'OPENWHISPR_OAUTH_PROTOCOL_SCHEME\s*!==\s*"openwhispr"' main.js
0   # no string-compare regression
```

All five `must_haves.truths` from the plan frontmatter are observable.

## Deviations from Plan

None — plan executed exactly as written. The human-verify checkpoint was auto-approved per the active auto-advance workflow setting (this is the GSD protocol for auto-mode, not a deviation).

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `electron-builder.config.js` (JS) over `electron-builder.config.cjs` | electron-builder discovers `.js` and `.cjs` equally; project root has no `"type": "module"` in package.json so a bare `.js` resolves as CommonJS without ambiguity. |
| Boolean flag for override detection | Per Plan 1 decision and Plan 3 Blocker 3 — `hasOwnProperty`-based detection in the generator eliminates the false-negative when `OPENWHISPR_OAUTH_PROTOCOL_SCHEME=openwhispr` is set explicitly. |
| Drop legacy runtime fallback chain | Build-time generator now emits the single source of truth — keeping a runtime fallback would create a second escape hatch and contradict the v1 build-time-only contract. |
| Defer Info.plist three-build verification to Plan 6 | Plan 6 (verify-parity-and-smoke) already owns end-to-end packaged-binary parity. Repeating the three-build matrix here would duplicate work. |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `1a11be1` | Convert electron-builder.json to electron-builder.config.js |
| 2 | `5d4d4f3` | main.js getOAuthProtocol uses OVERRIDDEN boolean |
| 3 | (auto-approved checkpoint, no commit) | Three-build verification deferred to Plan 6 |

## Foundation Ready For

- **Wave 4 (Plan 5)** model registry / inference URL refactor — same require pattern from `build-config.generated.cjs`.
- **Wave 5 (Plan 6)** parity grep gate can assert: zero `process.env.OPENWHISPR_*` reads outside `scripts/generate-build-config.js`, `electron-builder.config.js`, and `src/vite.config.mjs`. The grep gate also owns the three-build packaged-binary verification matrix.

## Self-Check: PASSED

- `electron-builder.config.js` — FOUND (commit `1a11be1`)
- `electron-builder.json` — DELETED (commit `1a11be1`)
- `main.js` modified — FOUND (commit `5d4d4f3`)
- `node --check electron-builder.config.js` — exit 0 ✓
- `node --check main.js` — exit 0 ✓
- env override mechanically verified (`testscheme` appears in stringified config when env set) ✓
- `process.env.(VITE_)?OPENWHISPR_PROTOCOL` count in main.js — `0` ✓
- `OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` references in main.js — `3` (destructure + comment + guard) ✓
- string-compare-to-default regression check — `0` matches ✓
- Commit `1a11be1` — FOUND
- Commit `5d4d4f3` — FOUND
