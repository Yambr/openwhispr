# OpenWhispr Technical Reference

OpenWhispr is an Electron desktop dictation app (whisper.cpp + NVIDIA Parakeet + OpenAI), forked as **Yambr OpenWhispr** — a self-hostable variant configurable at build time via env vars (backend URL, OAuth providers, model defaults). Default build (no env) behaves identically to upstream Yambr.

For all architectural, IPC, sidecar, secret-storage, model-registry, transcription/embeddings pipeline, and platform-specific details, see the **Documentation Map** at the bottom of this file. Do not duplicate those details here.

---

## Versioning Rules (Yambr Fork)

We follow upstream OpenWhispr's plain semver scheme: 3-segment patch bumps (`v1.7.3`, `v1.7.4`, ...). No prerelease suffixes, no custom update channels — standard semver releases on the default `latest` channel.

**Our `package.json` version diverges from upstream by at least one patch.** When upstream is on `1.7.2`, we sit on `1.7.3+`. This avoids `npm ci` collisions with same-version dependencies (e.g. `resedit@1.7.2`).

When upstream merges a new patch (e.g. `1.7.3`), bump to the next available (`1.7.4` or higher). Resolve `package.json` conflict in favour of our higher version.

**Tagging procedure:**

```bash
# After merging fork-only work to main and bumping package.json:
git tag -a v1.7.3 -m "v1.7.3 — <one-line summary>"
git push --tags
```

CI (`release.yml`, tag glob `v*`) reads the tag, strips the leading `v`, and injects the version via `--config.extraMetadata.version`. Make sure `package.json` `version` matches the tag before tagging — they must agree.

**Update channel:** default `latest`. Yambr users auto-update from `Yambr/openwhispr` GitHub releases via `latest.yml` / `latest-mac.yml` / `latest-linux.yml`. The fork's `setFeedURL` points at `Yambr/openwhispr` (not upstream), so fork users only see fork releases.

**Why not a custom channel?** Earlier we tried `v<UPSTREAM>-yambr.N` prereleases on a custom `yambr` channel, but `electron-updater`'s `GitHubProvider.getLatestVersion()` requires `currentChannel` to match the prerelease id — which conflicts with multi-arch per-arch channel names. Result: `ERR_UPDATER_NO_PUBLISHED_VERSIONS` on every startup. Plain semver on `latest` sidesteps the whole problem.

---

## Project Constraints

- **Tech stack pinned**: Node 24 / Electron 41 / Vite. Do not introduce new core deps without strong reason. Do not regenerate `package-lock.json` with a different Node major version.
- **Default build = upstream parity**: No behavioral drift for existing Yambr users when env vars are unset.
- **Build-time only configurability**: All v1 configurability happens at build time, NOT runtime. Reduces attack surface, keeps the binary auditable.
- **Documentation lives in `docs/`** (committed), not `.planning/` — third parties need it.
- **Signing**: Existing Developer ID signing flow (`afterSign.js`, electron-builder) must continue working with env-driven config.
- **Secrets**: API keys remain user-provided at runtime via Electron `safeStorage`. Build-time vars are for *defaults and endpoints*, never for secret material.

---

## Rules for AI Assistants

### Workflow: GSD Required

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

- `/gsd-quick` — small fixes, doc updates, ad-hoc tasks
- `/gsd-debug` — investigation and bug fixing
- `/gsd-execute-phase` — planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

### Working Rules (from user's global CLAUDE.md)

- **Не упрощать задачи** — решай полностью, не создавай моки/заглушки
- **Не создавать отдельные проекты** — работай в существующей структуре
- **Не использовать моки** — интегрируйся с реальными сервисами
- **Docker-compose** — если есть, новые сервисы добавляй туда
- При проблемах — спроси как решить или предложи варианты, не упрощай

### Internationalization — MANDATORY

All user-facing strings must use react-i18next. Never hardcode UI text.

- Translation files: `src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json` (9 languages)
- Usage: `const { t } = useTranslation();` then `t("notes.list.title")` or `t("notes.upload.using", { model: "Whisper" })`
- Every new string needs a key in **all** language files
- Do NOT translate: brand names (OpenWhispr, Pro), technical terms (Markdown, Signal ID), format names (MP3, WAV), AI system prompts
- Group keys by feature area (e.g., `notes.editor.*`, `referral.toasts.*`)

### Adding New Features

1. **New IPC channel**: add to both `src/helpers/ipcHandlers.js` and `preload.js`
2. **New setting**: update `src/hooks/useSettings.ts` + `src/components/SettingsPage.tsx`
3. **New UI component**: follow shadcn/ui patterns in `src/components/ui/`
4. **New manager**: create in `src/helpers/`, initialize in `main.js`
5. **New UI strings**: add translation keys to all 9 language files
6. **New sidecar binary**: see `docs/ARCHITECTURE.md` § Sidecar Binaries (unified lifecycle pattern via `sidecarRegistry` + `sidecarPidFile` + `EXPECTED_BINARY_FRAGMENTS`)

### Testing Checklist

- [ ] Test both local and cloud processing modes
- [ ] Verify hotkey works globally
- [ ] Check clipboard pasting on all platforms
- [ ] Test with different audio input devices
- [ ] Verify whisper.cpp binary detection
- [ ] Test all Whisper models
- [ ] Check agent naming functionality
- [ ] Test custom dictionary with uncommon words
- [ ] Verify Windows Push-to-Talk with compound hotkeys
- [ ] Test GNOME Wayland hotkeys (if on GNOME + Wayland)
- [ ] Test Hyprland Wayland hotkeys (if on Hyprland + Wayland)
- [ ] Verify activation mode selector is hidden on GNOME/Hyprland Wayland
- [ ] Verify meeting detection event-driven mode (debug logs show "event-driven")
- [ ] Test meeting notification suppression during recording
- [ ] Test post-recording cooldown (notifications shouldn't flash immediately)
- [ ] Semantic search: create a note about "quarterly revenue projections", search via agent for "financial forecast" — should match
- [ ] Verify Qdrant starts on app launch (debug logs: "qdrant started successfully")
- [ ] Kill Qdrant process manually — verify FTS5 keyword search still works as fallback

### Debug Mode

Enable with `--log-level=debug` or `OPENWHISPR_LOG_LEVEL=debug` (set in `.env`). Logs are written to the platform-specific app data directory and cover audio pipeline, FFmpeg path resolution, the full reasoning pipeline (stage-by-stage), and sidecar lifecycle.

---

## Common Issues

1. **No audio detected** — check FFmpeg path resolution, microphone permission, audio levels in debug logs
2. **Transcription fails** — ensure whisper.cpp binary present, model downloaded, temp file creation works, FFmpeg executable
3. **Clipboard not working** — macOS: accessibility permission required for AppleScript paste. Linux: at least one of `xdotool`/`wtype`/`ydotool` needed (or bundled `linux-fast-paste`). Windows: PowerShell SendKeys or bundled `nircmd.exe`. See `docs/ARCHITECTURE.md` for full fallback chain.
4. **Build issues** — use `npm run pack` for unsigned builds (`CSC_IDENTITY_AUTO_DISCOVERY=false`). Run `npm run download:whisper-cpp` before packaging. Always use Node 24 (`nvm exec 24 npm install`) — mismatched major versions break `npm ci` in CI.
5. **Windows Push-to-Talk binary** — prebuilt binary auto-downloaded; if download fails, falls back to tap mode
6. **Meeting detection** — if event-driven binary missing, falls back to polling automatically. Check debug logs for "event-driven" vs "polling".
7. **Local semantic search** — Qdrant binary in `resources/bin/qdrant-{platform}-{arch}` (auto via `predev`/`prebuild`); embedding model in `~/.cache/openwhispr/embedding-models/all-MiniLM-L6-v2/` (auto on first launch). If Qdrant fails, FTS5 keyword search still works. Semantic search is only exposed through the AI agent's `search_notes` tool, not manual search UI.

---

## Documentation Map

Authoritative references — start here for any descriptive question. Do not re-document in `CLAUDE.md`.

- **`docs/ARCHITECTURE.md`** — tech stack, process model, full IPC surface, secret storage (14 keys, safeStorage), model registry, transcription pipeline, embeddings pipeline, sidecar binaries (whisper-server / llama-server / sherpa-onnx / qdrant / diarization / ONNX worker / platform listeners), Wayland hotkeys (GNOME + Hyprland), meeting detection UX rules
- **`docs/BACKEND_SPEC.md`** — wire-level cloud backend contract: 19 endpoints with method, URL, auth, request/response shapes, error deviations
- **`docs/OAUTH_SPEC.md`** — OAuth provider catalog: Google Calendar flow, OpenWhispr cloud sign-in shim
- **`docs/BUILD_CONFIG.md`** — build-time env vars: backend URL, OAuth provider gating, model defaults, feature flags
- **`docs/CONFIG_INVENTORY.md`** — every hardcoded backend URL, OAuth client ID, enterprise endpoint, model registry override (with `file:line`, current value, proposed `OPENWHISPR_*` env var)
- **`docs/SELF_HOSTING.md`** — third-party deployment walkthrough: must-implement endpoints, env var reference, build + sign instructions
- **`docs/network-allowlist.md`** — firewall configuration, reachability testing

---

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` — do not edit manually.
