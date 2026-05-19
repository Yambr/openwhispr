---
phase: quick-260509-x1a
plan: v2-versioning
type: execute
wave: 1
depends_on: []
files_modified:
  - electron-builder.json
  - src/updater.js
  - .github/workflows/release.yml
  - CLAUDE.md
autonomous: false
requirements:
  - YAMBR-VERSIONING — adopt `<upstream>-yambr.<N>` prerelease scheme + custom `yambr` update channel
  - YAMBR-FEED-FIX — point updater feed at Yambr/openwhispr (not upstream)
  - YAMBR-CLEANUP — delete broken v1.7.2.1 and v1.7.2.2 releases + tags
  - YAMBR-VALIDATE — cut v1.7.2-yambr.1 and verify end-to-end install does not crash

must_haves:
  truths:
    - "Built app reports app version `1.7.2-yambr.1` (semver-valid, no ERR_UPDATER_INVALID_VERSION on launch)"
    - "Auto-updater fetches `yambr-arm64-mac.yml` / `yambr-x64-mac.yml` / `yambr.yml` (Win/Linux) from Yambr/openwhispr — never `latest*.yml` and never upstream OpenWhispr/openwhispr"
    - "GitHub release v1.7.2-yambr.1 contains arch-specific `yambr-*-mac.yml` files alongside the dmg/zip/exe/AppImage assets"
    - "Broken v1.7.2.1 and v1.7.2.2 GitHub releases and git tags are gone (local + remote)"
    - "CLAUDE.md `Versioning Rules (Yambr Fork)` section describes the new `-yambr.N` prerelease scheme; old 4-segment guidance is removed"
  artifacts:
    - path: "electron-builder.json"
      provides: "generateUpdatesFilesForAllChannels=true so prerelease channel YAMLs are emitted"
      contains: "generateUpdatesFilesForAllChannels"
    - path: "src/updater.js"
      provides: "Feed pointing at Yambr/openwhispr; channel=yambr (or yambr-arm64/yambr-x64 on macOS); Rosetta detection preserved"
      contains: "owner: \"Yambr\""
    - path: ".github/workflows/release.yml"
      provides: "Renames latest-mac.yml → yambr-{arch}-mac.yml; artifact globs match yambr-*.yml; gh release create marks prerelease"
      contains: "yambr-${{ matrix.arch }}-mac.yml"
    - path: "CLAUDE.md"
      provides: "New Yambr versioning rules section"
      contains: "yambr.N"
  key_links:
    - from: "src/updater.js setFeedURL"
      to: "Yambr/openwhispr GitHub Releases"
      via: "github provider owner field"
      pattern: "owner:\\s*\"Yambr\""
    - from: "electron-builder generateUpdatesFilesForAllChannels"
      to: "yambr-mac.yml emission"
      via: "prerelease tag in injected version triggers per-channel YAML"
      pattern: "generateUpdatesFilesForAllChannels"
    - from: "release.yml mac job"
      to: "yambr-{arch}-mac.yml in release artifacts"
      via: "cp dist/yambr-mac.yml dist/yambr-{arch}-mac.yml"
      pattern: "yambr-mac\\.yml"
---

<objective>
Switch the Yambr fork from the broken 4-segment versioning (`v1.7.2.1`) — which crashes electron-updater with `ERR_UPDATER_INVALID_VERSION` — to a strict-semver `<upstream>-yambr.<N>` prerelease scheme on its own custom update channel `yambr`. Fix the updater feed URL pointing at upstream OpenWhispr/openwhispr instead of the fork. Clean up the two broken releases. Cut `v1.7.2-yambr.1` to validate end-to-end.

Purpose: Yambr users currently can't install or update because the 4-segment version isn't valid semver. The v1.7.2.1 and v1.7.2.2 releases that the prior signing-fix plan produced are unusable. This plan replaces the versioning scheme with the one researched in 260509-x1a-RESEARCH-versioning.md (HIGH-confidence recommendation), wires the auto-updater to the correct feed and channel, and verifies a real release artifact installs and launches.

Output: Working Yambr release `v1.7.2-yambr.1` with arch-specific update YAMLs on the `yambr` channel; feed pointed at Yambr/openwhispr; CLAUDE.md rules rewritten; broken predecessor releases deleted.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260509-x1a-restore-release-yml-with-macos-signing-n/260509-x1a-RESEARCH-versioning.md
@.planning/quick/260509-x1a-restore-release-yml-with-macos-signing-n/260509-x1a-SUMMARY.md
@CLAUDE.md
@src/updater.js
@electron-builder.json
@.github/workflows/release.yml

<interfaces>
<!-- Key invariants the executor must preserve -->

Current updater.js channel logic (PRESERVE the Rosetta-detection structure, only change strings):
```js
// macOS: arch-aware channel — both arches publish to same release
// Detect Rosetta via sysctl.proc_translated; remap x64→arm64 if translated
// Only the channel-string PREFIX changes from "latest-" to "yambr-"
// Non-mac platforms get plain "yambr" channel.
```

Current release.yml mac step (line 425):
```yaml
- name: Rename arch-specific update metadata
  run: cp dist/latest-mac.yml "dist/latest-${{ matrix.arch }}-mac.yml"
```
With the new channel, electron-builder emits `dist/yambr-mac.yml` (NOT `latest-mac.yml`) when the injected version is `1.7.2-yambr.1`. With `generateUpdatesFilesForAllChannels: true` it ALSO still emits `latest-mac.yml`, but the runtime no longer reads it. Update the cp source AND the destination accordingly.

Current artifact globs (lines 134, 267, 432, 464, 471):
```yaml
dist/latest-linux.yml
dist/latest.yml
dist/latest-${{ matrix.arch }}-mac.yml
find ... -name "latest-*.yml" ...
```
These must be widened to also match `yambr*.yml` so the release-creation step uploads the prerelease-channel YAMLs.

Tag-to-version derivation (lines 41–48 / 156–164 / 290–297) ALREADY uses `${GITHUB_REF_NAME#v}` which correctly produces `1.7.2-yambr.1` from tag `v1.7.2-yambr.1`. No change needed there — verify only.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix updater feed (owner) and switch channel from `latest-*` to `yambr*`</name>
  <files>src/updater.js</files>
  <action>
In `setupAutoUpdater()` of `src/updater.js`:

1. Change the `setFeedURL` call: `owner: "OpenWhispr"` → `owner: "Yambr"`. Keep `repo: "openwhispr"`, `provider: "github"`, `private: false` unchanged. This points fork builds at the fork's release feed instead of upstream.

2. In the macOS arch-channel block (currently `autoUpdater.channel = nativeArch === "arm64" ? "latest-arm64" : "latest-x64";`), change the channel string PREFIX from `latest-` to `yambr-`. Result: `autoUpdater.channel = nativeArch === "arm64" ? "yambr-arm64" : "yambr-x64";`. PRESERVE the Rosetta detection (`sysctl.proc_translated` → remap x64 to arm64) verbatim — only the channel-string literal changes.

3. For non-darwin platforms: add `else { autoUpdater.channel = "yambr"; }` so Win/Linux read `yambr.yml` rather than the default `latest.yml`. Place this as an `else` to the existing `if (process.platform === "darwin")` block.

4. Update the comment block above the channel logic to mention the new `yambr-*` channel naming and the rationale (custom Yambr channel; upstream users on `latest` never see fork builds and vice versa).

Do NOT change `autoDownload`, `autoInstallOnAppQuit`, event handler wiring, or anything else in this file. `allowPrerelease` is auto-true when the running app version contains a prerelease component (`1.7.2-yambr.1` qualifies) per electron-updater source — no explicit set needed.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('src/updater.js','utf8');if(!/owner:\s*\"Yambr\"/.test(s))throw new Error('owner not Yambr');if(/owner:\s*\"OpenWhispr\"/.test(s))throw new Error('OpenWhispr owner still present');if(!/yambr-arm64/.test(s)||!/yambr-x64/.test(s))throw new Error('mac channels not yambr-*');if(!/channel\s*=\s*\"yambr\"/.test(s))throw new Error('non-mac yambr channel missing');if(!/sysctl\.proc_translated/.test(s))throw new Error('Rosetta detection lost');console.log('updater.js OK');"</automated>
  </verify>
  <done>
- `src/updater.js` `setFeedURL` uses `owner: "Yambr"`.
- macOS branch sets channel to `yambr-arm64` or `yambr-x64` (with Rosetta remap intact).
- Non-darwin branch sets `autoUpdater.channel = "yambr"`.
- No other behavioral changes.
- Verify command exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add `generateUpdatesFilesForAllChannels` to electron-builder.json</name>
  <files>electron-builder.json</files>
  <action>
Add a single top-level field to `electron-builder.json`:

```json
"generateUpdatesFilesForAllChannels": true,
```

Place it as a peer of `appId` / `productName` / `mac` (top-level, NOT nested under `mac` or `publish`). Insert near the top, e.g. directly after `"appId": "com.yambr.openwhispr",`.

Do not modify `publish` (already `owner: "Yambr"`, `releaseType: "draft"`), `mac.target`, `mac.identity`, `mac.notarize`, or any other field. The signing/notarization wiring fixed in commit 95856a33 must be preserved exactly.

This flag tells electron-builder to emit per-channel YAML files (e.g. `yambr-mac.yml`, `yambr-arm64-mac.yml`, `yambr.yml`) when the injected `extraMetadata.version` contains a prerelease tag — required for the runtime channel logic added in Task 1 to find anything to download.
  </action>
  <verify>
    <automated>node -e "const c=require('./electron-builder.json');if(c.generateUpdatesFilesForAllChannels!==true)throw new Error('flag missing or not true');if(c.publish.owner!=='Yambr')throw new Error('publish owner regressed');if(c.mac.notarize!==true)throw new Error('mac.notarize regressed');if(c.mac.identity!=='Nikolai Iambroskin (54Q38243Z3)')throw new Error('mac.identity regressed');console.log('electron-builder.json OK');"</automated>
  </verify>
  <done>
- `generateUpdatesFilesForAllChannels: true` present at top level.
- All previously-existing fields intact (notarize, identity, publish, target arrays, asarUnpack, extraResources, etc.).
- Verify command exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update release.yml — rename mac yml to `yambr-{arch}-mac.yml`, widen artifact globs, mark prerelease</name>
  <files>.github/workflows/release.yml</files>
  <action>
Three coordinated edits in `.github/workflows/release.yml`:

1. **Mac yml rename step** (currently around line 424–425). Change:
```yaml
- name: Rename arch-specific update metadata
  run: cp dist/latest-mac.yml "dist/latest-${{ matrix.arch }}-mac.yml"
```
to:
```yaml
- name: Rename arch-specific update metadata
  # With generateUpdatesFilesForAllChannels=true and a prerelease version like
  # 1.7.2-yambr.1, electron-builder emits dist/yambr-mac.yml. Both arches publish
  # to the same release, so we rename per-arch to prevent the latest-arm64/x64-mac.yml
  # race documented in src/updater.js.
  run: cp dist/yambr-mac.yml "dist/yambr-${{ matrix.arch }}-mac.yml"
```

2. **Mac artifact upload path** (around line 432). Change `dist/latest-${{ matrix.arch }}-mac.yml` → `dist/yambr-${{ matrix.arch }}-mac.yml`.

3. **Widen all `latest*.yml` globs to also match `yambr*.yml`.** Specifically:
   - Linux upload (around line 136): change `dist/latest-linux.yml` → keep that line AND add a new line `dist/yambr-linux.yml` immediately below it (both files are emitted; uploading both is harmless and lets us verify which channel populates).
   - Windows upload (around line 267): keep `dist/latest.yml` AND add `dist/yambr.yml` below it.
   - The publish-release step (around lines 464 and 471): change BOTH `find ... -name "latest-*.yml" ...` invocations to `find ... \( -name "latest-*.yml" -o -name "yambr*.yml" \) ...`. Preserve all other `-name` predicates (`*.dmg`, `*.exe`, `*.AppImage`, `*.deb`, `*.tar.gz`, `*.zip`, `*.blockmap`) verbatim.

4. **Mark Yambr releases as prerelease in GitHub UI**. In the `gh release create` step (around line 495), add the `--prerelease` flag conditionally on the tag containing `-yambr`. Concretely insert before the `gh release create` invocation:
```bash
PRERELEASE_FLAG=""
if [[ "${TAG_NAME}" == *-yambr* ]]; then
  PRERELEASE_FLAG="--prerelease"
fi
```
and change the invocation to:
```bash
gh release create "${TAG_NAME}" "${FILES[@]}" \
  --title "${TAG_NAME}" \
  --notes-file release-notes.md \
  --verify-tag \
  ${PRERELEASE_FLAG}
```
This is required by the GitHub provider in electron-updater per the research doc (releases with prerelease semver in their tag SHOULD be marked prerelease so the GitHub provider's lookup respects them).

Do NOT touch: the `Resolve Yambr version from git tag` steps (the `${GITHUB_REF_NAME#v}` shell expansion already produces `1.7.2-yambr.1` correctly from `v1.7.2-yambr.1`), the signing setup (Setup macOS Code Signing block, `Verify packaged macOS native binaries`, certificate cleanup), or the `verify-gates` job. Do NOT remove the `latest-*.yml` references — both old and new YAMLs are emitted; uploading both is the safe migration path.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const y=fs.readFileSync('.github/workflows/release.yml','utf8');const need=['dist/yambr-mac.yml','dist/yambr-${{ matrix.arch }}-mac.yml','yambr*.yml','-yambr*','--prerelease'];for(const n of need){if(!y.includes(n))throw new Error('missing: '+n);}if(!/cp dist\/yambr-mac\.yml/.test(y))throw new Error('mac rename step not updated');if(/cp dist\/latest-mac\.yml/.test(y))throw new Error('old latest-mac.yml cp still present');console.log('release.yml OK');"</automated>
  </verify>
  <done>
- Mac rename step copies from `dist/yambr-mac.yml` to `dist/yambr-{arch}-mac.yml`.
- Mac artifact upload includes `dist/yambr-{arch}-mac.yml`.
- Linux/Windows artifact uploads include both `latest*.yml` and `yambr*.yml`.
- `find` globs in publish-release step match both `latest-*.yml` and `yambr*.yml`.
- `gh release create` adds `--prerelease` when tag contains `-yambr`.
- `verify-gates`, signing setup, and notarize wiring untouched.
- Verify command exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 4: Rewrite CLAUDE.md `Versioning Rules (Yambr Fork)` section</name>
  <files>CLAUDE.md</files>
  <action>
Replace the entire `## Versioning Rules (Yambr Fork) — CRITICAL` section in `CLAUDE.md` (currently lines 9–31) with the new rules. New content:

```markdown
## Versioning Rules (Yambr Fork) — CRITICAL

**DO NOT bump `package.json` `version` field.** It tracks the upstream OpenWhispr baseline (currently `1.7.2`) and stays in sync with what we last merged from `OpenWhispr/openwhispr`. We never edit it by hand.

**Yambr release tags use a strict-semver prerelease scheme:** `v<UPSTREAM>-yambr.<N>` where `<UPSTREAM>` is the exact upstream version we last merged (3-segment, e.g. `1.7.2`) and `<N>` is a monotonic integer that resets to `1` whenever `<UPSTREAM>` changes.

- ✅ `v1.7.2-yambr.1` — first Yambr release on top of upstream v1.7.2
- ✅ `v1.7.2-yambr.2` — second Yambr release (more fork-only changes), still upstream v1.7.2
- ✅ `v1.7.3-yambr.1` — first Yambr release after upstream bumps to 1.7.3 (resets `<N>`)
- ❌ `v1.7.2.1` (4-segment) — NOT valid semver, crashes electron-updater on launch with `ERR_UPDATER_INVALID_VERSION`. Do not use.
- ❌ Editing `package.json` `version` to `1.7.3` while upstream is `1.7.2` — breaks `npm ci` (collides with same-version dependencies, e.g. `resedit@1.7.2`)

**Tagging procedure:**

```bash
# After merging fork-only work to main:
git tag -a v1.7.2-yambr.N -m "v1.7.2-yambr.N — <one-line summary>"
git push --tags
```

CI (`release.yml`, tag glob `v*`) reads the tag, strips the leading `v`, and injects the full prerelease string `1.7.2-yambr.N` via `--config.extraMetadata.version`. The 3-segment `package.json` value is NOT modified — it still records which upstream version we merged.

**Update channel:** Yambr builds run on the custom `yambr` update channel (macOS arch-aware: `yambr-arm64` / `yambr-x64`). They read `yambr.yml` / `yambr-mac.yml` / `yambr-{arch}-mac.yml`, never `latest*.yml`. This is wired in `src/updater.js` and `electron-builder.json` (`generateUpdatesFilesForAllChannels: true`). Consequences:

- Yambr users only auto-update to other Yambr builds — they never auto-update to a vanilla upstream `latest` release. **This is intentional.**
- When upstream releases a stable build the fork should adopt, merge upstream into the fork and cut a new `v<NEW-UPSTREAM>-yambr.1` — fork users will receive it through the `yambr` channel.

**When to bump `package.json`:** ONLY when we merge an upstream tag that bumps it (e.g., upstream releases `1.7.3`, our merge PR brings the new `package.json` value automatically — never edit it by hand).
```

Do NOT touch any other section of `CLAUDE.md`. Only the `Versioning Rules` block changes.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const c=fs.readFileSync('CLAUDE.md','utf8');if(!/v1\.7\.2-yambr\.1/.test(c))throw new Error('new scheme example missing');if(!/generateUpdatesFilesForAllChannels/.test(c))throw new Error('channel config not mentioned');if(/append a \*\*4th version segment\*\*/.test(c))throw new Error('old 4-segment guidance still present');if(!/ERR_UPDATER_INVALID_VERSION/.test(c))throw new Error('failure rationale missing');console.log('CLAUDE.md OK');"</automated>
  </verify>
  <done>
- `Versioning Rules (Yambr Fork) — CRITICAL` section rewritten end-to-end with `-yambr.N` scheme, channel mention, and `ERR_UPDATER_INVALID_VERSION` rationale.
- Old "4th version segment" guidance fully removed.
- Rest of CLAUDE.md unchanged.
- Verify command exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 5: Delete broken v1.7.2.1 and v1.7.2.2 GitHub releases + tags</name>
  <files>(no source files — git + gh operations)</files>
  <action>
Sequential cleanup commands (run as a single bash block, allow individual deletes to fail if already gone):

```bash
# Delete GitHub releases (does not delete tags by default)
gh release delete v1.7.2.1 --yes --repo Yambr/openwhispr || true
gh release delete v1.7.2.2 --yes --repo Yambr/openwhispr || true

# Delete remote tags
git push origin :refs/tags/v1.7.2.1 || true
git push origin :refs/tags/v1.7.2.2 || true

# Delete local tags
git tag -d v1.7.2.1 || true
git tag -d v1.7.2.2 || true

# Verify nothing left
gh release list --repo Yambr/openwhispr --limit 20 | grep -E 'v1\.7\.2\.[12]' && { echo "Broken release still present"; exit 1; } || echo "Releases gone"
git ls-remote --tags origin | grep -E 'v1\.7\.2\.[12]$' && { echo "Broken remote tag still present"; exit 1; } || echo "Remote tags gone"
git tag -l | grep -E 'v1\.7\.2\.[12]$' && { echo "Broken local tag still present"; exit 1; } || echo "Local tags gone"
```

These broken releases reference 4-segment versions that crash the app on startup; they must be removed before users discover them. The corresponding workflow runs in GitHub Actions can stay (history is fine to keep).

If `gh` is not authenticated or the user's token lacks delete-release permission, this task pauses with the exact `gh auth status` / scope-update command needed (do not silently skip — the cleanup is required by must-have truth #4).
  </action>
  <verify>
    <automated>bash -c "gh release list --repo Yambr/openwhispr --limit 20 | grep -E 'v1\\.7\\.2\\.[12]' && exit 1; git ls-remote --tags origin 2>/dev/null | grep -E 'v1\\.7\\.2\\.[12]$' && exit 1; git tag -l | grep -E 'v1\\.7\\.2\\.[12]$' && exit 1; echo OK"</automated>
  </verify>
  <done>
- `gh release list --repo Yambr/openwhispr` shows neither v1.7.2.1 nor v1.7.2.2.
- `git ls-remote --tags origin` shows neither v1.7.2.1 nor v1.7.2.2.
- `git tag -l` shows neither v1.7.2.1 nor v1.7.2.2 locally.
- Verify command exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 6: Cut v1.7.2-yambr.1, push, monitor CI</name>
  <files>(no source files — git tag + push)</files>
  <action>
After Tasks 1–5 are committed and on `main`:

```bash
# Confirm clean working tree
git status --porcelain | grep -q . && { echo "Working tree dirty — commit Tasks 1–4 first"; exit 1; }

# Confirm we're on main and pushed
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$CURRENT_BRANCH" == "main" ]] || { echo "Not on main (on $CURRENT_BRANCH)"; exit 1; }
git fetch origin main
LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main)
[[ "$LOCAL" == "$REMOTE" ]] || { echo "main not pushed to origin"; exit 1; }

# Tag and push
git tag -a v1.7.2-yambr.1 -m "v1.7.2-yambr.1 — switch to <upstream>-yambr.<N> prerelease scheme; fix updater feed; custom yambr channel"
git push origin v1.7.2-yambr.1

# Watch CI
gh run watch --exit-status $(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

Do NOT mark `package.json` `version` as anything other than `1.7.2` — the version is injected via `--config.extraMetadata.version` from the tag.

If CI fails, do NOT auto-retry or push fixup tags. Report the failure stage (verify-gates / build-linux / build-windows / build-macos-arm64 / build-macos-x64 / publish-release) so the user can decide whether to roll forward or roll back. The diagnostic command is `gh run view <id> --log-failed`.
  </action>
  <verify>
    <automated>bash -c "gh release view v1.7.2-yambr.1 --repo Yambr/openwhispr --json tagName,isPrerelease,assets --jq '.tagName + \" prerelease=\" + (.isPrerelease|tostring) + \" assets=\" + ([.assets[].name] | join(\",\"))' | tee /dev/stderr | grep -q 'yambr-arm64-mac.yml' && grep -q 'yambr-x64-mac.yml' <(gh release view v1.7.2-yambr.1 --repo Yambr/openwhispr --json assets --jq '[.assets[].name] | join(\"\\n\")') && grep -q 'yambr.yml' <(gh release view v1.7.2-yambr.1 --repo Yambr/openwhispr --json assets --jq '[.assets[].name] | join(\"\\n\")')"</automated>
  </verify>
  <done>
- Tag `v1.7.2-yambr.1` exists locally and on origin.
- All 4 CI builds (linux, windows, macos-arm64, macos-x64) green.
- `publish-release` job created the GitHub Release.
- Release contains: dmg + zip (both arches), exe, AppImage, deb, rpm, tar.gz, AND `yambr-arm64-mac.yml` + `yambr-x64-mac.yml` + `yambr.yml` + `yambr-linux.yml`.
- Release is marked prerelease in GitHub UI.
- Verify command exits 0.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 7: Manual install validation — arm64 dmg launches without crash</name>
  <what-built>v1.7.2-yambr.1 release with new versioning scheme, updated feed URL, custom `yambr` channel, and arch-specific update YAMLs. The previous v1.7.2.1 and v1.7.2.2 builds crashed at launch with ERR_UPDATER_INVALID_VERSION.</what-built>
  <how-to-verify>
1. Download the arm64 dmg from https://github.com/Yambr/openwhispr/releases/tag/v1.7.2-yambr.1 (asset name will end in `-arm64.dmg`).
2. Open the dmg. Drag OpenWhispr.app to Applications. Eject.
3. **First-run signing check (macOS):** Open Applications/OpenWhispr.app. Confirm:
   - No "App is damaged and can't be opened" error.
   - No "App can't be opened because Apple cannot check it for malicious software" error.
   - App launches to the dictation overlay (or onboarding if first run on this machine).
4. **Updater sanity:** In the Control Panel (right-click tray → Settings, or Cmd+, equivalent), open the section that shows the app version. Confirm it reads exactly `1.7.2-yambr.1` (NOT `1.7.2`).
5. **Feed-URL check:** Open Console.app, filter for `OpenWhispr`. With the app running, trigger a manual update check (Settings → Check for Updates, if available; otherwise just wait for the 3s startup auto-check). Confirm the log lines reference `https://github.com/Yambr/openwhispr/releases/...` (NOT `OpenWhispr/openwhispr`) and the YAML being fetched is `yambr-arm64-mac.yml` (NOT `latest-arm64-mac.yml` and NOT `latest-mac.yml`).
6. **No-crash confirmation:** Use the app for ~30 seconds (record a short dictation if convenient). Confirm no `ERR_UPDATER_INVALID_VERSION` or related crash dialog appears.

If x64/Rosetta hardware is available, repeat steps 1–6 with the x64 dmg and confirm the channel logged is `yambr-x64` (or `yambr-arm64` if running under Rosetta on Apple Silicon — the sysctl detection should remap).

If Windows/Linux hardware is available: install the exe / AppImage / deb, confirm version `1.7.2-yambr.1` in About, confirm the updater log fetches `yambr.yml` from Yambr/openwhispr.
  </how-to-verify>
  <resume-signal>Type `approved` if all checks pass on at least the macOS arm64 build. If anything fails (crash, wrong version string, wrong feed URL, wrong channel), describe the exact failure mode and which step (1–6) it occurred at.</resume-signal>
</task>

</tasks>

<verification>
End-to-end:
- `node -e "const c=require('./electron-builder.json');console.log(c.generateUpdatesFilesForAllChannels)"` → `true`
- `grep -c 'owner: "Yambr"' src/updater.js` → `1` (and `grep 'owner: "OpenWhispr"' src/updater.js` → empty)
- `grep -c 'yambr-arm64\|yambr-x64\|"yambr"' src/updater.js` → `≥ 3`
- `gh release view v1.7.2-yambr.1 --repo Yambr/openwhispr --json assets --jq '[.assets[].name]'` → contains `yambr-arm64-mac.yml`, `yambr-x64-mac.yml`, `yambr.yml`
- `gh release list --repo Yambr/openwhispr | grep -E 'v1\.7\.2\.[12]'` → empty
- Manual install of the arm64 dmg launches without `ERR_UPDATER_INVALID_VERSION` (Task 7).
</verification>

<success_criteria>
- All 6 automated tasks pass their `<automated>` verify commands.
- Task 7 human-verify returns `approved` for at least the macOS arm64 build.
- The GitHub release page for v1.7.2-yambr.1 lists all expected platform assets AND the per-channel YAML files.
- No regression to the signing/notarization fixed in commit 95856a33 (verified by Task 7 step 3 — no Gatekeeper warning).
- Broken predecessor releases (v1.7.2.1, v1.7.2.2) and their tags are gone from local + origin + GitHub Releases.
</success_criteria>

<output>
After completion, append a section to `260509-x1a-SUMMARY.md` documenting:
- Final tag scheme adopted (`v<UPSTREAM>-yambr.<N>`)
- Channel name (`yambr`, with `yambr-arm64` / `yambr-x64` on macOS)
- Files changed (electron-builder.json, src/updater.js, .github/workflows/release.yml, CLAUDE.md)
- Releases deleted (v1.7.2.1, v1.7.2.2)
- New baseline release (v1.7.2-yambr.1) with link
- Validation outcome from Task 7
</output>
