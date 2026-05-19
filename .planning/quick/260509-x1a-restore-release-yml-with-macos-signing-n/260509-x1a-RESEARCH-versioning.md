# Yambr Fork Versioning — Research

**Researched:** 2026-05-10
**Domain:** electron-updater + semver fork versioning
**Confidence:** HIGH (semver spec, electron-updater source, channel docs all primary sources)

## TL;DR

**Use a custom channel scheme: bump the patch into a reserved offset and tag a prerelease identifier.** Concretely: `1.7.2` upstream → Yambr ships as `1.7.2-yambr.1`, `1.7.2-yambr.2`, … When upstream bumps to `1.7.3`, Yambr ships `1.7.3-yambr.1`. Set `autoUpdater.channel = "yambr"` and enable `generateUpdatesFilesForAllChannels: true` so electron-builder produces `yambr.yml` / `yambr-mac.yml` / `latest-yambr.yml` separate from upstream's `latest.yml`. Git-tag as `v1.7.2-yambr.1` (matches the app version exactly — electron-updater requires this). This is **strict semver** (so the `ERR_UPDATER_INVALID_VERSION` crash goes away), it puts Yambr on its **own update lane** (so upstream users on `latest` channel are never offered a Yambr build and vice versa), and tags are unambiguous (3-segment + `-yambr.N` can never collide with any upstream 3-segment tag). The single trade-off worth knowing: per semver §11, `1.7.2-yambr.1` is *less than* `1.7.2`, so if you ever want a Yambr user to receive the *upstream* `1.7.2` stable, that user is stuck — but since the explicit goal is to keep fork users **only on fork builds**, that's the desired behavior.

## Problem recap

- Fork = Yambr/openwhispr; upstream = OpenWhispr/openwhispr.
- 3-segment upstream tags (`v1.7.2`, `v1.7.3`).
- Tried 4-segment `v1.7.2.2` → electron-updater rejects: `ERR_UPDATER_INVALID_VERSION` because `parseVersion()` (semver) refuses non-spec input. Confirmed in `AppUpdater.ts` constructor: `if (currentVersion == null) { throw newError("App version is not a valid semver version", "ERR_UPDATER_INVALID_VERSION") }` ([source](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/AppUpdater.ts)).
- Need: distinguishable from upstream, valid semver, supports auto-update fork→fork, absorbs upstream bumps, no tag collision with `git fetch upstream`.
- Side issue: `src/updater.js` currently has `setFeedURL({ owner: "OpenWhispr", repo: "openwhispr" })` — pointing at upstream. Even with a perfect version scheme, fork builds will never see fork releases until this is changed.

## Findings — fork versioning patterns in the wild

| Project | Scheme | Example | Notes |
|---|---|---|---|
| **VSCodium** (VS Code fork) | `MAJOR.MINOR.YYDDD` — appends a **build-date numeric** as a 3rd-segment override | `1.108.10359`, `1.116.02821` | Stays 3-segment semver. Tracks upstream `MAJOR.MINOR`, replaces upstream's `PATCH` with a Codium-only date-build counter. Upstream patch numbers are absorbed implicitly (each Codium build picks up whatever upstream patch was current). ([releases](https://github.com/VSCodium/vscodium/releases)) |
| **Cursor** (VS Code fork) | Independent semver, totally decoupled | `2.6.x` while VS Code is `1.108.x` | Bumped to a fresh major to escape any collision. Tracks upstream version separately in metadata, not in the user-facing version. ([wiki](https://en.wikipedia.org/wiki/Cursor_(code_editor))) |
| **Brave** (Chromium fork) | Own semver, completely independent | `1.x.y` while Chromium is `120.x.y` | Pinned to its own MAJOR=1 from launch; Chromium version surfaced only in metadata. Most aggressive form of "decouple from upstream". ([brave.com/latest](https://brave.com/latest/)) |
| **Standard semver prerelease (typical fork practice)** | `<upstream>-<vendor>.<n>` | `1.7.2-yambr.1` | Used widely in the npm/Electron ecosystem — `1.0.0-beta.1`, `1.0.0-rc.1` are the canonical forms. Strict semver, plays nicely with electron-updater channels. |

**Take-away from real-world patterns:** the two viable models are (a) **decouple major** (Brave/Cursor — fine if you want a totally separate identity), or (b) **track upstream + prerelease tag** (the standard semver prerelease idiom). For a small fork that explicitly wants to communicate "this is built on top of upstream X.Y.Z" the prerelease form is more honest.

VSCodium's "stuff a date counter into the patch slot" trick is clever but only works because VS Code's patch number is mostly cosmetic; OpenWhispr's `PATCH` carries actual semantic meaning, so overwriting it would lose information.

## Findings — semver prerelease / build-metadata behavior

Per [semver.org](https://semver.org/) §9–§11:

- **§9 Pre-release** (`-yambr.1`): valid identifier, lowercase alphanumeric + dot + numeric.
- **§10 Build metadata** (`+yambr.1`): **MUST be ignored when determining version precedence.** ⇒ `1.7.2+yambr.1` and `1.7.2+yambr.99` and `1.7.2` are *all equal* to electron-updater's comparator. **Useless for an update channel.**
- **§11 Precedence**: `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-beta < 1.0.0-rc.1 < 1.0.0`. Crucially: **a prerelease version is always less than its associated normal version.** So `1.7.2-yambr.5 < 1.7.2`.

Implications for the candidates the user listed:

| Candidate | Strict semver? | Auto-update fork→fork? | Avoids collision with upstream? | Verdict |
|---|---|---|---|---|
| `1.7.2.1` (4-segment) | **No** | n/a — startup crashes | Yes | ❌ Already proven broken (`ERR_UPDATER_INVALID_VERSION`) |
| `1.7.2-yambr.1` (prerelease, same base) | Yes | Yes (`yambr.1 < yambr.2`) | Yes (no upstream tag will ever look like this) | ✅ Recommended |
| `1.7.3-yambr.1` (prerelease, +1 patch) | Yes | Yes | **Tag-collision risk**: when upstream releases real `v1.7.3`, your tag `v1.7.3-yambr.1` already exists in repo. `git fetch upstream` won't conflict (different tag names) but app-version comparison is now confusing — fork users on `1.7.3-yambr.1` will *not* auto-update to upstream `1.7.3` (prerelease < normal) but will to `1.7.3-yambr.2`, which is fine but the optics are messy. | ⚠️ Works, but pre-bumping patch ahead of upstream is a footgun |
| `1.7.2+yambr.1` (build metadata) | Yes | **No** — comparator ignores `+` | Yes | ❌ Build metadata is ordering-invisible; updater will think every Yambr build is the same version |
| `100.7.2` (high major like Chromium) | Yes | Yes | Yes | ⚠️ Works but throws away the "we're built on upstream X.Y.Z" signal — Brave-style decoupling is overkill for a thin fork |
| `1.1007.2` (minor offset) | Yes | Yes | Yes | ⚠️ Works but obscure; nobody reading `1.1007.2` knows it means "upstream 1.7 + fork 1000" |

## Findings — electron-updater behavior

### Version validation
electron-updater calls `parseVersion(currentVersionString)` in the `AppUpdater` constructor. If it returns null, it throws `ERR_UPDATER_INVALID_VERSION`. `parseVersion` uses the [`semver`](https://www.npmjs.com/package/semver) package, which strictly enforces the spec. **4-segment versions are rejected, prerelease versions are accepted.** ([source](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/AppUpdater.ts))

### `allowPrerelease`
Default behavior (from electron-updater source): `allowPrerelease` defaults to `true` **iff** the app's own current version contains prerelease components, otherwise `false`. So a Yambr build running `1.7.2-yambr.3` automatically has `allowPrerelease = true` — no code change needed. ([Snyk advisor](https://snyk.io/advisor/npm-package/electron-updater/functions/electron-updater.autoUpdater.allowPrerelease))

### Channels
Per the [Release Using Channels tutorial](https://www.electron.build/tutorials/release-using-channels.html):

> "The prerelease tag in semantic versioning automatically determines the channel. […] When `generateUpdatesFilesForAllChannels` is enabled, the builder reads these tags and distributes to the appropriate channel."

> Hierarchical inclusion:
> - `latest` channel → only stable
> - `beta` channel → beta + latest
> - `alpha` channel → alpha + beta + latest

Critically, **the channel name is taken from the prerelease identifier itself** — so `1.7.2-yambr.1` produces a `yambr` channel. With `generateUpdatesFilesForAllChannels: true` this materializes as `yambr.yml` (Win/Linux) and `yambr-mac.yml` (macOS). The runtime selects which YAML to fetch based on `autoUpdater.channel`.

The hierarchical inclusion rule (alpha sees beta sees latest) is **only documented for the three built-in names**. For a custom channel name like `yambr`, behavior is more isolated: a user on `channel = "yambr"` reads `yambr.yml` and only sees Yambr releases. Upstream users on the default `latest` channel never see Yambr. **This is exactly the desired isolation.** ([Issue #1182](https://github.com/electron-userland/electron-builder/issues/1182), [Issue #4988](https://github.com/electron-userland/electron-builder/issues/4988))

### `latest.yml` per channel
electron-builder writes `latest.yml` for stable releases and `<prerelease-tag>.yml` for prerelease channels (e.g. `beta.yml`, `yambr.yml`). On macOS the per-arch variants are `latest-mac.yml`, `yambr-mac.yml`, `latest-arm64-mac.yml`, `yambr-arm64-mac.yml`. ([Auto Update docs](https://www.electron.build/auto-update.html))

### Tag/version coupling
Per [Issue #2329](https://github.com/electron-userland/electron-builder/issues/2329) and [Issue #6076](https://github.com/electron-userland/electron-builder/issues/6076): electron-updater fetches `latest*.yml` from the GitHub Releases tag, then uses the **version field inside the YAML** (which equals `package.json` version, or the `extraMetadata.version` override) to construct download URLs. The git tag and the app version **must match**, including the `v` prefix convention. So:

- App version: `1.7.2-yambr.1`
- Git tag: `v1.7.2-yambr.1` ✅
- Asset URL inside `yambr.yml`: derived from `1.7.2-yambr.1`

Decoupling tag from version (e.g. tag = `yambr/1.7.2-r2`, version = `1.7.3-yambr.2`) **breaks** updater download-URL construction. Don't do it.

### `--config.extraMetadata.version`
Confirmed valid (the existing CI flow uses it). It overrides the version baked into the produced bundle without touching `package.json`. The CI workflow can derive the version from the git tag (strip `v` prefix) and pass `--config.extraMetadata.version=1.7.2-yambr.1`. This is the right pattern.

## Recommendation

**Adopt the `<upstream>-yambr.<N>` prerelease scheme with a custom `yambr` update channel.**

### Concrete rules

1. **Tag format:** `v{UPSTREAM}-yambr.{N}` where `{UPSTREAM}` is the exact upstream version we last merged (3-segment) and `{N}` is a monotonically increasing integer that resets to `1` whenever `{UPSTREAM}` changes.
   - First Yambr release on top of upstream `1.7.2`: `v1.7.2-yambr.1`
   - Second: `v1.7.2-yambr.2`
   - After merging upstream `1.7.3`: `v1.7.3-yambr.1`

2. **package.json:** stays at the upstream baseline (no `-yambr` suffix). The CI workflow injects the full version via `--config.extraMetadata.version=$(echo "$GITHUB_REF_NAME" | sed 's/^v//')`. The 3-segment `package.json` value continues to track which upstream version we merged — exactly the rationale already in CLAUDE.md for not bumping `package.json`. The 4-segment scheme was the wrong implementation of a correct policy.

3. **electron-builder config:** add `"generateUpdatesFilesForAllChannels": true` so `yambr.yml` / `yambr-mac.yml` are emitted alongside (or instead of) `latest*.yml`.

4. **Runtime:** in `src/updater.js`, set `autoUpdater.channel = "yambr"` before `checkForUpdates`. (`allowPrerelease` will be auto-true because the app version contains a prerelease component.)

5. **Feed URL:** change `setFeedURL` from `{ owner: "OpenWhispr", repo: "openwhispr" }` to `{ owner: "Yambr", repo: "openwhispr" }` (or whatever the actual fork org is). See side-issue below.

### Why this satisfies every constraint

| Constraint | Satisfied by |
|---|---|
| Strict semver (no `ERR_UPDATER_INVALID_VERSION`) | `1.7.2-yambr.1` is canonical semver §9 |
| Auto-update fork→fork works | `1.7.2-yambr.1 < 1.7.2-yambr.2` per semver §11 (numeric identifier compare) |
| Auto-update absorbs upstream bumps | Move from `1.7.2-yambr.5` → `1.7.3-yambr.1`: `1.7.3-yambr.1 > 1.7.2-yambr.5` because `1.7.3` > `1.7.2` at the normal-version level (§11 step 1: compare major/minor/patch first) |
| No collision with `git fetch upstream` | Upstream tags are 3-segment (`v1.7.2`); fork tags always carry `-yambr.N`; no overlap possible |
| Tags human-readable | "v1.7.2-yambr.3" reads as "third Yambr release on upstream 1.7.2" — same legibility as the broken 4-segment scheme |
| Fork users get only fork updates | Custom channel `yambr` reads `yambr.yml`, never `latest.yml` |
| Upstream users not affected by fork releases | Upstream releases publish `latest.yml`; fork publishes `yambr.yml` — separate files in separate repos |

### Trade-offs to know

1. **A Yambr user can never auto-update to a stable upstream release.** If upstream ships `1.7.3` and Yambr hasn't yet rebuilt, fork users stay on `1.7.2-yambr.5`. This is a *feature* given the project goal ("fork users see only fork builds") but worth stating explicitly.

2. **Channel name is sticky.** Once a user is on `channel = "yambr"`, switching them to upstream's `latest` requires a manual reinstall of an upstream binary. Acceptable for this project.

3. **macOS arch-specific YAMLs**: with the `yambr` channel you'll need `yambr-mac.yml`, `yambr-arm64-mac.yml`, etc., produced by electron-builder. Confirm `mac.publish` config + `generateUpdatesFilesForAllChannels: true` produces all four (latest + prerelease × x64 + arm64). If electron-builder only emits the `latest-*` variants, set `releaseType` or use the GitHub provider's prerelease flag explicitly. ([Issue #8429](https://github.com/electron-userland/electron-builder/issues/8429))

4. **Releases on GitHub must be marked "prerelease".** The GitHub provider in electron-updater respects the prerelease flag on the release. With `allowPrerelease: true` and the right channel, this works; without it, the GitHub provider's "latest" lookup may skip your release. The CI workflow's `gh release create` should pass `--prerelease`.

5. **`{N}` numbering with double-digit Yambr counts.** Note that `yambr.10` *is* greater than `yambr.9` because §11 compares numeric identifiers as integers, not as strings. (Common semver pitfall: only matters when prerelease identifiers are alphabetic; `yambr.<int>` is fine.)

### Migration steps (research-only, not a plan)

The user asked for research, not a plan, but for completeness the change is mechanically: (a) update CLAUDE.md "Versioning Rules" section to describe the `-yambr.N` scheme, (b) add `generateUpdatesFilesForAllChannels: true` to `electron-builder.json`, (c) set `autoUpdater.channel = "yambr"` in `src/updater.js`, (d) fix `setFeedURL` owner/repo, (e) update CI tag-parsing to strip the `v` prefix and pass the full prerelease string to `--config.extraMetadata.version`, (f) ensure `gh release create --prerelease` is set.

## Side-issue: feed URL pointing at upstream

`src/updater.js` currently calls `setFeedURL({ provider: "github", owner: "OpenWhispr", repo: "openwhispr" })`. This means **even with a perfect versioning scheme, currently-installed Yambr builds will check OpenWhispr/openwhispr for updates and either**:

- See an upstream `latest.yml` (channel = `yambr` doesn't match → no update found, silent), or
- If channel logic falls back to `latest`, see an upstream stable build with version `1.7.2` and compare it against the fork's `1.7.2-yambr.3`. Per semver, `1.7.2 > 1.7.2-yambr.3`, so updater would offer to "update" the fork user to upstream stable — losing all fork features.

This must be fixed in the same release that introduces the new versioning scheme, otherwise the new scheme accomplishes nothing. The fix is one line: change `owner: "OpenWhispr"` → `owner: "Yambr"` (or whatever the fork org is). Per [electron-builder docs](https://www.electron.build/auto-update.html), if `app-update.yml` is generated by electron-builder during packaging (driven by `publish` config in `electron-builder.json`), the cleaner fix is to set the `publish` block correctly and remove the manual `setFeedURL` call entirely.

## Sources

### Primary (HIGH confidence)
- [Semantic Versioning 2.0.0 spec](https://semver.org/) — §9 prerelease, §10 build metadata, §11 precedence
- [electron-builder Auto Update docs](https://www.electron.build/auto-update.html) — latest.yml generation, GitHub provider behavior
- [electron-builder Release Using Channels tutorial](https://www.electron.build/tutorials/release-using-channels.html) — channel-from-prerelease detection, hierarchy, `generateUpdatesFilesForAllChannels`
- [`AppUpdater.ts` source](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/AppUpdater.ts) — `parseVersion` validation throwing `ERR_UPDATER_INVALID_VERSION`, `allowPrerelease` auto-detection from prerelease components

### Secondary (MEDIUM confidence)
- [VSCodium releases](https://github.com/VSCodium/vscodium/releases) — `1.108.10359`-style date-counter scheme
- [Brave release schedule wiki](https://github.com/brave/brave-browser/wiki/Brave-Release-Schedule) — independent `1.x.y` decoupled from Chromium
- [Cursor — Wikipedia](https://en.wikipedia.org/wiki/Cursor_(code_editor)) — fully decoupled major
- [electron-builder Issue #1182](https://github.com/electron-userland/electron-builder/issues/1182) — channel implementation discussion
- [electron-builder Issue #4988](https://github.com/electron-userland/electron-builder/issues/4988) — `allowPrerelease`/channels clarification
- [electron-builder Issue #2329](https://github.com/electron-userland/electron-builder/issues/2329), [#6076](https://github.com/electron-userland/electron-builder/issues/6076) — tag/version coupling for download URLs
- [electron-builder Issue #8429](https://github.com/electron-userland/electron-builder/issues/8429) — alpha/beta YAML emission edge cases
