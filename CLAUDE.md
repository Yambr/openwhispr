# OpenWhispr Technical Reference for AI Assistants

This document provides comprehensive technical details about the OpenWhispr project architecture for AI assistants working on the codebase.

## Project Overview

OpenWhispr is an Electron-based desktop dictation application that uses whisper.cpp for speech-to-text transcription. It supports both local (privacy-focused) and cloud (OpenAI API) processing modes.

## Versioning Rules (Yambr Fork)

We follow upstream OpenWhispr's plain semver scheme: 3-segment patch bumps (`v1.7.3`, `v1.7.4`, ...). No prerelease suffixes, no custom update channels — just standard semver releases on the default `latest` channel.

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

## Architecture Overview

### Core Technologies
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite
- **Desktop Framework**: Electron 41 with context isolation
- **Database**: better-sqlite3 for local transcription history
- **UI Components**: shadcn/ui with Radix primitives
- **Speech Processing**: whisper.cpp + NVIDIA Parakeet (via sherpa-onnx) + OpenAI API
- **Audio Processing**: FFmpeg (bundled via ffmpeg-static)
- **Node.js**: 24 (pinned in `.nvmrc` — CI uses Node 24, do NOT regenerate `package-lock.json` with a different major version)

### Key Architectural Decisions

1. **Dual Window Architecture**:
   - Main Window: Minimal overlay for dictation (draggable, always on top)
   - Control Panel: Full settings interface (normal window)
   - Both use same React codebase with URL-based routing

2. **Process Separation**:
   - Main Process: Electron main, IPC handlers, database operations
   - Renderer Process: React app with context isolation
   - Preload Script: Secure bridge between processes
   - ONNX Utility Process: hosts all `onnxruntime-node` inference (text embeddings, speaker embeddings, fbank). Lazy-spawned on first use via `src/helpers/onnxWorkerClient.js` → `src/workers/onnxWorker.js`. Native crashes (e.g., ORT `bad_alloc`) confine to the worker; main process rejects in-flight requests and respawns with backoff. Stopped in `will-quit`.

3. **Audio Pipeline**:
   - MediaRecorder API → Blob → ArrayBuffer → IPC → File → whisper.cpp
   - Automatic cleanup of temporary files after processing

## File Structure and Responsibilities

### Main Process Files

- **main.js**: Application entry point, initializes all managers
- **preload.js**: Exposes safe IPC methods to renderer via window.api

### Native Resources (resources/)

- **windows-key-listener.c**: C source for Windows low-level keyboard hook (Push-to-Talk)
- **windows-mic-listener.c**: C source for WASAPI mic session monitor (event-driven mic detection)
- **macos-mic-listener.swift**: Swift source for CoreAudio mic property listener (event-driven mic detection)
- **globe-listener.swift**: Swift source for macOS Globe/Fn key detection
- **bin/**: Directory for compiled native binaries (whisper-cpp, nircmd, key/mic listeners)

### Helper Modules (src/helpers/)

- **audioManager.js**: Handles audio device management
- **clipboard.js**: Cross-platform clipboard operations
  - macOS: AppleScript-based paste with accessibility permission check
  - Windows: PowerShell SendKeys with nircmd.exe fallback
  - Linux: Native XTest binary + compositor-aware fallbacks (xdotool, wtype, ydotool)
- **database.js**: SQLite operations for transcription history
- **debugLogger.js**: Debug logging system with file output
- **devServerManager.js**: Vite dev server integration
- **dragManager.js**: Window dragging functionality
- **environment.js**: Environment variable and OpenAI API management
- **hotkeyManager.js**: Global hotkey registration and management
  - Handles platform-specific defaults (GLOBE on macOS, backtick on Windows/Linux)
  - Auto-fallback to F8/F9 if default hotkey is unavailable
  - Notifies renderer via IPC when hotkey registration fails
  - Integrates with GnomeShortcutManager for GNOME Wayland support
  - Integrates with HyprlandShortcutManager for Hyprland Wayland support
- **gnomeShortcut.js**: GNOME Wayland global shortcut integration
  - Uses D-Bus service to receive hotkey toggle commands
  - Registers shortcuts via gsettings (visible in GNOME Settings → Keyboard → Shortcuts)
  - Converts Electron hotkey format to GNOME keysym format
  - Only active on Linux + Wayland + GNOME desktop
- **hyprlandShortcut.js**: Hyprland Wayland global shortcut integration
  - Uses D-Bus service to receive hotkey toggle commands (same `com.openwhispr.App` service)
  - Registers shortcuts via `hyprctl keyword bind` (runtime keybinding)
  - Converts Electron hotkey format to Hyprland bind format (`MODS, key`)
  - Only active on Linux + Wayland + Hyprland (detected via `HYPRLAND_INSTANCE_SIGNATURE`)
- **ipcHandlers.js**: Centralized IPC handler registration
- **windowsKeyManager.js**: Windows Push-to-Talk support with native key listener
  - Spawns native `windows-key-listener.exe` binary for low-level keyboard hooks
  - Supports compound hotkeys (e.g., `Ctrl+Shift+F11`, `CommandOrControl+Space`)
  - Emits `key-down` and `key-up` events for push-to-talk functionality
  - Graceful fallback if binary unavailable
- **meetingDetectionEngine.js**: Orchestrates meeting detection from all sources
  - Gates notifications during recording (tap-to-talk and push-to-talk)
  - Post-recording cooldown (2.5s) before showing queued notifications
  - Priority-based coalescing (process > audio) — one notification, not three
- **meetingProcessDetector.js**: Detects running meeting apps
  - macOS: Event-driven via `systemPreferences.subscribeWorkspaceNotification` (zero CPU)
  - Windows/Linux: Shared `processListCache` polling (30s interval)
- **audioActivityDetector.js**: Detects microphone usage for unscheduled meetings
  - macOS: Event-driven via `macos-mic-listener` binary (CoreAudio property listeners)
  - Windows: Event-driven via `windows-mic-listener.exe` (WASAPI sessions, self-PID exclusion)
  - Linux: Event-driven via `pactl subscribe` (PulseAudio source-output events)
  - All platforms: Graceful fallback to polling if native approach fails
- **processListCache.js**: Shared singleton process list cache (5s TTL, `ps-list` npm)
- **googleCalendarManager.js**: Google Calendar sync with exponential backoff
  - 10s socket timeout on API requests
  - Backoff: 2min → 4min → 8min → cap 30min on consecutive failures
  - Reset to normal interval on success
- **menuManager.js**: Application menu management
- **tray.js**: System tray icon and menu
- **whisper.js**: Local whisper.cpp integration and model management
- **parakeet.js**: NVIDIA Parakeet model management via sherpa-onnx
- **parakeetServer.js**: sherpa-onnx CLI wrapper for transcription
- **qdrantManager.js**: Qdrant vector DB sidecar process lifecycle (spawn, health check, shutdown)
- **localEmbeddings.js**: Local text embedding via ONNX Runtime + all-MiniLM-L6-v2 (384-dim vectors)
- **vectorIndex.js**: Qdrant collection management — upsert, delete, search, batch reindex
- **windowConfig.js**: Centralized window configuration
- **windowManager.js**: Window creation and lifecycle management
- **cliBridge.js**: Loopback HTTP server on ports 8200–8219, bearer-token auth (token at `~/.openwhispr/cli-bridge.json`), 127.0.0.1-only. Used by the unified CLI to talk to a running desktop app.
- **postMigrationDetector.js**: Detects users returning from the pre-Gizmo bundle ID via a `.bundle-migrated` sentinel in userData; consumed by `ipcHandlers.js` to drive the `PostMigrationOnboarding` modal

### React Components (src/components/)

- **App.jsx**: Main dictation interface with recording states
- **ControlPanel.tsx**: Settings, history, model management UI
- **OnboardingFlow.tsx**: 8-step first-time setup wizard
- **PostMigrationOnboarding.tsx**: One-time modal for users returning from the pre-Gizmo bundle ID; reuses `PermissionsSection` to walk through re-granting Microphone, Accessibility, and System Audio. Triggered by `postMigrationDetector.js` (see Helper Modules)
- **SettingsPage.tsx**: Comprehensive settings interface
- **WhisperModelPicker.tsx**: Model selection and download UI
- **ui/**: Reusable UI components (buttons, cards, inputs, etc.)

### React Hooks (src/hooks/)

- **useAudioRecording.js**: MediaRecorder API wrapper with error handling
- **useClipboard.ts**: Clipboard operations hook
- **useDialogs.ts**: Electron dialog integration
- **useHotkey.js**: Hotkey state management
- **useLocalStorage.ts**: Type-safe localStorage wrapper
- **usePermissions.ts**: System permission checks and settings access
  - `openMicPrivacySettings()`: Opens OS microphone privacy settings
  - `openSoundInputSettings()`: Opens OS sound input device settings
  - `openAccessibilitySettings()`: Opens OS accessibility settings (macOS only)
- **useSettings.ts**: Application settings management
- **useWhisper.ts**: Whisper binary availability check

### Services

- **ReasoningService.ts**: AI processing for agent-addressed commands
  - Detects when user addresses their named agent and removes the agent name from final output
  - Provider implementations live in a registry at `src/services/ai/inferenceProviders/index.ts` covering 8 providers (`anthropic`, `enterprise`, `gemini`, `groq`, `lan`, `local`, `openai`, `openwhispr`), each implementing the `InferenceProvider` interface from `types.ts`
  - Per-scope LLM config: 4 scopes (`dictationCleanup`, `dictationAgent`, `noteFormatting`, `chatIntelligence`) defined in `src/config/inferenceScopes.ts`
  - `selectResolvedLLMConfig(state, scope)` in `settingsStore.ts` resolves provider/model per scope with fallback chains

### whisper.cpp Integration

- **whisper.js**: Native binary wrapper for local transcription
  - Bundled binaries in `resources/bin/whisper-cpp-{platform}-{arch}`
  - Falls back to system installation (`brew install whisper-cpp`)
  - GGML model downloads from HuggingFace
  - Models stored in `~/.cache/openwhispr/whisper-models/`

### NVIDIA Parakeet Integration (via sherpa-onnx)

- **parakeet.js**: Model management for NVIDIA Parakeet ASR models
  - Uses sherpa-onnx runtime for cross-platform ONNX inference
  - Bundled binaries in `resources/bin/sherpa-onnx-{platform}-{arch}`
  - INT8 quantized models for efficient CPU inference
  - Models stored in `~/.cache/openwhispr/parakeet-models/`
  - Server pre-warming on startup when `LOCAL_TRANSCRIPTION_PROVIDER=nvidia` is set
  - Provider preference persisted to `.env` via `saveAllKeysToEnvFile()` on server start/stop

- **Available Models**:
  - `parakeet-tdt-0.6b-v3`: Multilingual (25 languages), ~680MB
  - `parakeet-unified-en-0.6b`: English-only, ~631MB, state-of-the-art EN accuracy (5.91% avg WER on Open ASR Leaderboard)

- **Download URLs**: Models from sherpa-onnx ASR models release on GitHub

### Local Semantic Search (Qdrant + MiniLM)

Always-on offline semantic search that finds notes by meaning, not just keywords. Used by the AI agent's `search_notes` tool. Qdrant starts automatically on app launch; embedding model auto-downloads on first run if missing.

**Architecture**:
- **Qdrant sidecar**: Rust binary spawned as child process (`qdrantManager.js`), port 6333–6350
- **Embedding model**: `all-MiniLM-L6-v2` via ONNX Runtime (`localEmbeddings.js`), 384-dim vectors
- **Vector index**: Qdrant collection management (`vectorIndex.js`), cosine distance
- **Hybrid search**: FTS5 + Qdrant in parallel → Reciprocal Rank Fusion (K=60) with 0.3 cosine score threshold

**Pipeline**:
1. App launches → Qdrant binary starts → collection created. Embedding model auto-downloads if missing (~22MB)
2. Note create/update/delete → SQLite write → background vector upsert/delete via `_asyncVectorUpsert()`/`_asyncVectorDelete()`
3. Agent searches → `db-semantic-search-notes` IPC → parallel FTS5 + vector search → RRF merge → ranked results

**Search fallback chain** (in `searchNotesTool.ts`): cloud search → local semantic → FTS5 keyword

**Storage**:
- Qdrant data: `~/.cache/openwhispr/qdrant-data/`
- Qdrant binary: `resources/bin/qdrant-{platform}-{arch}` (bundled — downloaded during `prebuild` / `predev`)
- Embedding model: `~/.cache/openwhispr/embedding-models/all-MiniLM-L6-v2/` (auto-downloaded on first launch)

**Dependencies**: `@qdrant/js-client-rest`, `onnxruntime-node`

**Dev setup**: The Qdrant binary downloads automatically via `predev`/`prestart`. The embedding model auto-downloads on first app launch. To manually download: `npm run download:qdrant` and `npm run download:embedding-model`.

### Build Scripts (scripts/)

- **download-whisper-cpp.js**: Downloads whisper.cpp binaries from GitHub releases
- **download-llama-server.js**: Downloads llama.cpp server for local LLM inference
- **download-nircmd.js**: Downloads nircmd.exe for Windows clipboard operations
- **download-windows-key-listener.js**: Downloads prebuilt Windows key listener binary
- **download-windows-mic-listener.js**: Downloads prebuilt Windows mic listener binary
- **download-sherpa-onnx.js**: Downloads sherpa-onnx binaries for Parakeet support
- **download-qdrant.js**: Downloads Qdrant vector DB binary for local semantic search
- **download-minilm.js**: Downloads all-MiniLM-L6-v2 ONNX model + tokenizer for local embeddings
- **build-globe-listener.js**: Compiles macOS Globe key listener from Swift source
- **build-macos-mic-listener.js**: Compiles macOS mic listener from Swift source
- **build-windows-key-listener.js**: Compiles Windows key listener (for local development)
- **run-electron.js**: Development script to launch Electron with proper environment
- **lib/download-utils.js**: Shared utilities for downloading and extracting files
  - `fetchLatestRelease(repo, options)`: Fetches latest release from GitHub API
  - `downloadFile(url, dest)`: Downloads file with progress and retry logic
  - `extractZip(zipPath, destDir)`: Cross-platform zip extraction
  - `parseArgs()`: Parses CLI arguments for platform/arch targeting
  - Supports `GITHUB_TOKEN` for authenticated requests (higher rate limits)

## Key Implementation Details

### 1. FFmpeg Integration

FFmpeg is bundled with the app and doesn't require system installation:
```javascript
// FFmpeg is unpacked from ASAR to app.asar.unpacked/node_modules/ffmpeg-static/
```

### 2. Audio Recording Flow

1. User presses hotkey → MediaRecorder starts
2. Audio chunks collected in array
3. User presses hotkey again → Recording stops
4. Blob created from chunks → Converted to ArrayBuffer
5. Sent via IPC
6. Main process writes to temporary file
7. whisper.cpp processes file → Result sent back
8. Temporary file deleted

### 3. Local Whisper Models (GGML format)

Models stored in `~/.cache/openwhispr/whisper-models/`:
- tiny: ~75MB (fastest, lowest quality)
- base: ~142MB (recommended balance)
- small: ~466MB (better quality)
- medium: ~1.5GB (high quality)
- large: ~3GB (best quality)
- turbo: ~1.6GB (fast with good quality)

### 4. Database Schema

```sql
CREATE TABLE transcriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  original_text TEXT NOT NULL,
  processed_text TEXT,
  is_processed BOOLEAN DEFAULT 0,
  processing_method TEXT DEFAULT 'none',
  agent_name TEXT,
  error TEXT
);
```

### 5. Settings Storage

Settings stored in localStorage with these keys:
- `whisperModel`: Selected Whisper model
- `useLocalWhisper`: Boolean for local vs cloud
- `language`: Selected language code
- `agentName`: User's custom agent name
- `reasoningModel`: Selected AI model for processing
- `reasoningProvider`: AI provider (openai/anthropic/gemini/local)
- `hotkey`: Custom hotkey configuration
- `hasCompletedOnboarding`: Onboarding completion flag
- `customDictionary`: JSON array of words/phrases for improved transcription accuracy

Secret env vars (12 total: 7 BYOK API keys + 5 enterprise cloud creds — see `SECRET_KEYS` in `environment.js`) are encrypted at rest via Electron `safeStorage` and stored as per-key files under `userData/secure-keys/`. They are loaded into `process.env` at startup by `EnvironmentManager.init()`. Renderer reads them via IPC (`get-*-key`) and writes via debounced IPC (`save-*-key`). On Linux without a keyring, secrets fall back to plaintext.

Non-secret env vars persisted to `.env` (via `saveAllKeysToEnvFile()`):
- `LOCAL_TRANSCRIPTION_PROVIDER`: Transcription engine (`nvidia` for Parakeet)
- `PARAKEET_MODEL`: Selected Parakeet model name (e.g., `parakeet-tdt-0.6b-v3`)

### 6. Language Support

58 languages supported (see src/utils/languages.ts):
- Each language has a two-letter code and label
- "auto" for automatic detection
- Passed to whisper.cpp via -l parameter

### 7. Agent Naming System

- User names their agent during onboarding (step 6/8)
- Name stored in localStorage and database
- ReasoningService detects "Hey [AgentName]" patterns
- AI processes command and removes agent reference from output
- Supports multiple AI providers (all models defined in `src/models/modelRegistryData.json`):
  - **OpenAI** (Responses API):
    - GPT-5.5 (`gpt-5.5`) - Latest flagship frontier model, 1M context
    - GPT-5.2 (`gpt-5.2`) - Strong reasoning model
    - GPT-5 Mini (`gpt-5-mini`) - Fast and cost-efficient
    - GPT-5 Nano (`gpt-5-nano`) - Ultra-fast, low latency
    - GPT-4.1 Series (`gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`) - Strong baseline with 1M context
  - **Anthropic** (Via IPC bridge to avoid CORS):
    - Claude Opus 4.7 (`claude-opus-4-7`) - Most capable Claude model, 1M context
    - Claude Sonnet 4.6 (`claude-sonnet-4-6`) - Balanced performance
    - Claude Haiku 4.5 (`claude-haiku-4-5`) - Fast with near-frontier intelligence
    - Claude Opus 4.6 (`claude-opus-4-6`) - Previous Opus generation, 1M context
    - Claude Sonnet 4.5 (`claude-sonnet-4-5`) - Previous Sonnet generation
    - Claude Opus 4.5 (`claude-opus-4-5`) - Earlier Opus model
  - **Google Gemini** (Direct API integration):
    - Gemini 3.1 Pro (`gemini-3.1-pro-preview`) - Most capable Gemini model
    - Gemini 3 Flash (`gemini-3-flash-preview`) - Ultra-fast, high-capability next-gen model
    - Gemini 2.5 Flash Lite (`gemini-2.5-flash-lite`) - Lowest latency and cost
  - **Local**: GGUF models via llama.cpp (Qwen, Llama, Mistral, GPT-OSS)

### 8. Model Registry Architecture

All AI model definitions are centralized in `src/models/modelRegistryData.json` as the single source of truth:
```json
{
  "cloudProviders": [...],   // OpenAI, Anthropic, Gemini API models
  "localProviders": [...]    // GGUF models with download URLs
}
```

**Key files:**
- `src/models/modelRegistryData.json` - Single source of truth for all models
- `src/models/ModelRegistry.ts` - TypeScript wrapper with helper methods
- `src/config/aiProvidersConfig.ts` - Derives AI_MODES from registry
- `src/utils/languages.ts` - Derives REASONING_PROVIDERS from registry
- `src/helpers/modelManagerBridge.js` - Handles local model downloads

**Local model features:**
- Each model has `hfRepo` for direct HuggingFace download URLs
- `promptTemplate` defines the chat format (ChatML, Llama, Mistral)
- Download URLs constructed as: `{baseUrl}/{hfRepo}/resolve/main/{fileName}`

### 9. API Integrations and Updates

**OpenAI Responses API (September 2025)**:
- Migrated from Chat Completions to new Responses API
- Endpoint: `https://api.openai.com/v1/responses`
- Simplified request format with `input` array instead of `messages`
- New response format with `output` array containing typed items
- Automatic handling of GPT-5 and o-series model requirements
- No temperature parameter for newer models (GPT-5, o-series)

**Anthropic Integration**:
- Routes through IPC handler to avoid CORS issues in renderer process
- Uses main process for API calls with proper error handling
- Model IDs use alias format (e.g., `claude-sonnet-4-6` not date-suffixed versions)

**Gemini Integration**:
- Direct API calls from renderer process
- Increased token limits for Gemini 3.1 Pro (2000 minimum)
- Proper handling of thinking process in responses
- Error handling for MAX_TOKENS finish reason

**API Key Persistence**:
- All API keys now properly persist to `.env` file
- Keys stored in environment variables and reloaded on app start
- Centralized `saveAllKeysToEnvFile()` method ensures consistency

### 10. System Settings Integration

The app can open OS-level settings for microphone permissions, sound input selection, and accessibility:

**IPC Handlers** (in `ipcHandlers.js`):
- `open-microphone-settings`: Opens microphone privacy settings
- `open-sound-input-settings`: Opens sound/audio input device settings
- `open-accessibility-settings`: Opens accessibility privacy settings (macOS only)

**Platform-specific URLs**:
| Platform | Microphone Privacy | Sound Input | Accessibility |
|----------|-------------------|-------------|---------------|
| macOS | `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone` | `x-apple.systempreferences:com.apple.preference.sound?input` | `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility` |
| Windows | `ms-settings:privacy-microphone` | `ms-settings:sound` | N/A |
| Linux | Manual (no URL scheme) | Manual (e.g., pavucontrol) | N/A |

**UI Component** (`MicPermissionWarning.tsx`):
- Shows platform-appropriate buttons and messages
- Linux only shows "Open Sound Settings" (no separate privacy settings)
- macOS/Windows show both sound and privacy buttons

### 11. Debug Mode

Enable with `--log-level=debug` or `OPENWHISPR_LOG_LEVEL=debug` (can be set in `.env`):
- Logs saved to platform-specific app data directory
- Comprehensive logging of audio pipeline
- FFmpeg path resolution details
- Audio level analysis
- Complete reasoning pipeline debugging with stage-by-stage logging

### 12. Windows Push-to-Talk

Native Windows support for true push-to-talk functionality using low-level keyboard hooks:

**Architecture**:
- `resources/windows-key-listener.c`: Native C program using Windows `SetWindowsHookEx` for keyboard hooks
- `src/helpers/windowsKeyManager.js`: Node.js wrapper that spawns and manages the native binary
- Binary outputs `KEY_DOWN` and `KEY_UP` to stdout when target key is pressed/released

**Compound Hotkey Support**:
- Parses hotkey strings like `CommandOrControl+Shift+F11`
- Maps modifiers: `CommandOrControl`/`Ctrl` → VK_CONTROL, `Alt`/`Option` → VK_MENU, `Shift` → VK_SHIFT
- Verifies all required modifiers are held before emitting key events

**Binary Distribution**:
- Prebuilt binary downloaded from GitHub releases (`windows-key-listener-v*` tags)
- Download script: `scripts/download-windows-key-listener.js`
- CI workflow: `.github/workflows/build-windows-key-listener.yml`
- Fallback to tap mode if binary unavailable

**IPC Events**:
- `windows-key-listener:key-down`: Fired when hotkey pressed (start recording)
- `windows-key-listener:key-up`: Fired when hotkey released (stop recording)

### 13. Custom Dictionary

Improve transcription accuracy for specific words, names, or technical terms:

**How it works**:
- User adds words/phrases through Settings → Custom Dictionary
- Words stored as JSON array in localStorage (`customDictionary` key)
- On transcription, words are joined and passed as `prompt` parameter to Whisper
- Works with both local whisper.cpp and cloud OpenAI Whisper API

**Implementation**:
- `src/hooks/useSettings.ts`: Manages `customDictionary` state
- `src/components/SettingsPage.tsx`: UI for adding/removing dictionary words
- `src/helpers/audioManager.js`: Reads dictionary and adds to transcription options
- `src/helpers/whisperServer.js`: Includes dictionary as `prompt` in API request

**Whisper Prompt Parameter**:
- Whisper uses the prompt as context/hints for transcription
- Words in the prompt are more likely to be recognized correctly
- Useful for: uncommon names, technical jargon, brand names, domain-specific terms

### 14. GNOME Wayland Global Hotkeys

On GNOME Wayland, Electron's `globalShortcut` API doesn't work due to Wayland's security model. OpenWhispr uses native GNOME shortcuts:

**Architecture**:
1. `main.js` enables `GlobalShortcutsPortal` feature flag for Wayland
2. `hotkeyManager.js` detects GNOME + Wayland and initializes `GnomeShortcutManager`
3. `gnomeShortcut.js` creates D-Bus service at `com.openwhispr.App`
4. Shortcuts registered via `gsettings` as custom GNOME keybindings
5. GNOME triggers `dbus-send` command which calls the D-Bus `Toggle()` method

**Key Constants**:
- D-Bus service: `com.openwhispr.App`
- D-Bus path: `/com/openwhispr/App`
- gsettings path: `/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/openwhispr/`

**IPC Integration**:
- `get-hotkey-mode-info`: Returns `{ isUsingGnome, isUsingHyprland, isUsingNativeShortcut }` to renderer
- UI hides activation mode selector when `isUsingNativeShortcut` is true
- Forces tap-to-talk mode (push-to-talk not supported)

**Hotkey Format Conversion**:
- Electron format: `Alt+R`, `CommandOrControl+Shift+Space`
- GNOME format: `<Alt>r`, `<Control><Shift>space`
- Backtick (`) → `grave` in GNOME keysym format

### 15. Hyprland Wayland Global Hotkeys

On Hyprland (wlroots Wayland compositor), Electron's `globalShortcut` API and the `GlobalShortcutsPortal` feature don't work reliably. OpenWhispr uses native Hyprland keybindings:

**Architecture**:
1. `main.js` enables `GlobalShortcutsPortal` feature flag for Wayland (fallback)
2. `hotkeyManager.js` detects Hyprland + Wayland and initializes `HyprlandShortcutManager`
3. `hyprlandShortcut.js` creates D-Bus service at `com.openwhispr.App` (same as GNOME)
4. Shortcuts registered via `hyprctl keyword bind` (runtime keybinding)
5. Hyprland triggers `dbus-send` command which calls the D-Bus `Toggle()` method

**Detection**:
- Primary: `HYPRLAND_INSTANCE_SIGNATURE` environment variable (set by Hyprland)
- Fallback: `XDG_CURRENT_DESKTOP` contains "hyprland"

**Hotkey Format Conversion**:
- Electron format: `Alt+R`, `CommandOrControl+Shift+Space`
- Hyprland format: `ALT, R`, `CTRL SHIFT, space`
- Modifier-only combos (e.g., `Control+Super`) → `CTRL, Super_L`

**Bind/Unbind Commands**:
- Register: `hyprctl keyword bind "ALT, R, exec, dbus-send --session ..."`
- Unregister: `hyprctl keyword unbind "ALT, R"`
- Bindings are ephemeral (don't survive Hyprland restart) but re-registered on app startup

**Limitations**:
- Push-to-talk not supported (Hyprland `bind` fires a single exec, not key-down/key-up)
- Requires `hyprctl` on PATH (ships with Hyprland)

### 16. Meeting Detection (Event-Driven)

Detects meetings via three independent sources, orchestrated by `MeetingDetectionEngine`:

**Architecture**:
- `MeetingDetectionEngine` listens to events from `MeetingProcessDetector` and `AudioActivityDetector`
- `GoogleCalendarManager` provides calendar context (imminent events, active meetings)
- All three sources feed into a unified notification pipeline

**Process Detection** (known meeting apps — Zoom, Teams, Webex, FaceTime):
- macOS: `systemPreferences.subscribeWorkspaceNotification` — zero CPU, instant detection
- Windows/Linux: `processListCache` shared polling (30s interval, `ps-list` npm)

**Microphone Detection** (unscheduled/browser meetings like Google Meet):
- macOS: `macos-mic-listener` binary — CoreAudio `kAudioDevicePropertyDeviceIsRunningSomewhere` property listeners with hot-plug support
- Windows: `windows-mic-listener.exe` — WASAPI `IAudioSessionManager2` session monitoring, `--exclude-pid` for self-mic exclusion
- Linux: `pactl subscribe` — PulseAudio source-output events
- All platforms: Graceful fallback to polling if native binary/command unavailable

**UX Rules**:
- During recording (tap-to-talk or push-to-talk): ALL notifications suppressed
- After recording: 2.5s cooldown before showing queued notifications
- Multiple signals coalesced: process > audio priority, one notification shown
- Calendar-aware: if imminent calendar event exists, notification shows event name
- Active calendar meeting recording: all detections suppressed

**Binary Distribution**:
- macOS: Compiled from Swift source via `scripts/build-macos-mic-listener.js` during `compile:native`
- Windows: Prebuilt binary downloaded via `scripts/download-windows-mic-listener.js` during `prebuild:win`
- CI workflow: `.github/workflows/build-windows-mic-listener.yml` auto-builds on push to main

**Calendar Sync Resilience**:
- 10s socket timeout on all Google Calendar API requests
- Exponential backoff on consecutive failures: 2min → 4min → 8min → cap 30min
- Reset to normal 2min interval on any successful sync

## Development Guidelines

### Internationalization (i18n) — REQUIRED

All user-facing strings **must** use the i18n system. Never hardcode UI text in components.

**Setup**: react-i18next (v15) with i18next (v25). Translation files in `src/locales/{lang}/translation.json`.

**Supported languages**: en, es, fr, de, pt, it, ru, zh-CN, zh-TW

**How to use**:
```tsx
import { useTranslation } from "react-i18next";

const { t } = useTranslation();
// Simple: t("notes.list.title")
// With interpolation: t("notes.upload.using", { model: "Whisper" })
```

**Rules**:
1. Every new UI string must have a translation key in `en/translation.json` and all other language files
2. Use `useTranslation()` hook in components and hooks
3. Keep `{{variable}}` interpolation syntax for dynamic values
4. Do NOT translate: brand names (OpenWhispr, Pro), technical terms (Markdown, Signal ID), format names (MP3, WAV), AI system prompts
5. Group keys by feature area (e.g., `notes.editor.*`, `referral.toasts.*`)

### Adding New Features

1. **New IPC Channel**: Add to both ipcHandlers.js and preload.js
2. **New Setting**: Update useSettings.ts and SettingsPage.tsx
3. **New UI Component**: Follow shadcn/ui patterns in src/components/ui
4. **New Manager**: Create in src/helpers/, initialize in main.js
5. **New UI Strings**: Add translation keys to all 10 language files (see i18n section above)
6. **New Sidecar Binary**: Add download script in `scripts/`, add to `prebuild*` scripts in package.json, add manager in `src/helpers/`, initialize in `main.js`. Spawn the child with `detached: process.platform !== "win32"` so it has its own process group on Unix. Right after spawn call `sidecarPidFile.write(name, child.pid)` and on `close` call `sidecarPidFile.clear(name)`. Add the binary fragment to `EXPECTED_BINARY_FRAGMENTS` in `sidecarReaper.js`. Register a stop function via `sidecarRegistry.register(name, () => manager.stop())` in `registerSidecars()` — that single registration replaces the old `will-quit` line.

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
- [ ] Verify activation mode selector is hidden on GNOME Wayland and Hyprland Wayland
- [ ] Verify meeting detection works with event-driven mode (check debug logs for "event-driven")
- [ ] Test meeting notification suppression during recording
- [ ] Test post-recording cooldown (notifications shouldn't flash immediately)
- [ ] Create a note about "quarterly revenue projections", search via agent for "financial forecast" — should match semantically
- [ ] Verify Qdrant starts on app launch (check debug logs for "qdrant started successfully")
- [ ] Kill Qdrant process manually — verify FTS5 keyword search still works as fallback

### Common Issues and Solutions

1. **No Audio Detected**:
   - Check FFmpeg path resolution
   - Verify microphone permissions
   - Check audio levels in debug logs

2. **Transcription Fails**:
   - Ensure whisper.cpp binary is available
   - Check model is downloaded
   - Check temporary file creation
   - Verify FFmpeg is executable

3. **Clipboard Not Working**:
   - macOS: Check accessibility permissions (required for AppleScript paste)
   - Linux: Native `linux-fast-paste` binary (XTest) is tried first, works for X11 and XWayland apps
     - X11: xdotool fallback if native binary unavailable
     - GNOME/KDE Wayland: xdotool (XWayland apps) → ydotool (requires ydotoold daemon)
     - wlroots Wayland (Sway, Hyprland): wtype → xdotool → ydotool
   - Windows: PowerShell SendKeys (built-in) or nircmd.exe (bundled)

4. **Build Issues**:
   - Use `npm run pack` for unsigned builds (CSC_IDENTITY_AUTO_DISCOVERY=false)
   - Signing requires Apple Developer account
   - ASAR unpacking needed for FFmpeg
   - Run `npm run download:whisper-cpp` before packaging (current platform)
   - Use `npm run download:whisper-cpp:all` for multi-platform packaging
   - afterSign.js automatically skips signing when CSC_IDENTITY_AUTO_DISCOVERY=false
   - **Lockfile**: Always use Node 24 when running `npm install` (matches CI). If your local Node version differs, use `nvm exec 24 npm install`. Running `npm install` with a different major version will produce an incompatible `package-lock.json` that breaks `npm ci` in CI.

5. **Windows Push-to-Talk Binary**:
   - Prebuilt binary downloaded automatically on Windows during build
   - If download fails, push-to-talk falls back to tap mode
   - To compile locally: install Visual Studio Build Tools or MinGW-w64
   - CI workflow (`.github/workflows/build-windows-key-listener.yml`) auto-builds on push to main

6. **Meeting Detection Not Working**:
   - Check debug logs for "event-driven" vs "polling" mode
   - macOS: Verify `macos-mic-listener` binary exists in `resources/bin/` (compiled during `npm run compile:native`)
   - Windows: Verify `windows-mic-listener.exe` exists in `resources/bin/` (downloaded during `prebuild:win`)
   - Linux: Verify `pactl` is installed (`pulseaudio-utils` or `pipewire-pulse` package)
   - If event-driven binary is missing, detection falls back to polling automatically

7. **Local Semantic Search Not Working**:
   - Qdrant binary should be in `resources/bin/qdrant-{platform}-{arch}` (auto-downloaded during `predev`/`prebuild`)
   - Embedding model should be in `~/.cache/openwhispr/embedding-models/all-MiniLM-L6-v2/model.onnx` (auto-downloaded on first app launch)
   - Run `npm run download:qdrant` and `npm run download:embedding-model` manually if missing
   - Check debug logs for "qdrant" entries (port, health check, errors)
   - If Qdrant fails to start, search still works via FTS5 keyword fallback
   - Semantic search is only available through the AI agent's `search_notes` tool, not the manual search UI

### Platform-Specific Notes

**macOS**:
- Requires accessibility permissions for clipboard (auto-paste)
- Requires microphone permission (prompted by system)
- Uses AppleScript for reliable pasting
- Notarization needed for distribution
- Shows in dock with indicator dot when running (LSUIElement: false)
- whisper.cpp bundled for both arm64 and x64
- System settings accessible via `x-apple.systempreferences:` URL scheme

**Windows**:
- No special accessibility permissions needed
- Microphone privacy settings at `ms-settings:privacy-microphone`
- Sound settings at `ms-settings:sound`
- NSIS installer for distribution
- whisper.cpp bundled for x64
- **Push-to-Talk**: Native key listener binary (`windows-key-listener.exe`) enables true push-to-talk
  - Uses Windows Low-Level Keyboard Hook (`WH_KEYBOARD_LL`)
  - Supports compound hotkeys (e.g., `Ctrl+Shift+F11`)
  - Prebuilt binary auto-downloaded from GitHub releases
  - Falls back to tap mode if unavailable

**Linux**:
- Multiple package manager support
- Standard XDG directories
- AppImage for distribution
- whisper.cpp bundled for x64
- No standardized URL scheme for system settings (user must open manually)
- Privacy settings button hidden in UI (not applicable on Linux)
- Recommend `pavucontrol` for audio device management
- **Clipboard paste tools** (at least one required for auto-paste):
  - **X11**: `xdotool` (recommended)
  - **Wayland** (non-GNOME): `wtype` (requires virtual keyboard protocol) or `xdotool` (works via XWayland, recommended for Electron apps)
  - **GNOME Wayland**: `xdotool` for XWayland apps only (native Wayland apps require manual paste)
  - Terminal detection: Auto-detects terminal emulators and uses Ctrl+Shift+V
  - Fallback: Text copied to clipboard with manual paste instructions
- **GNOME Wayland global hotkeys**:
  - Uses native GNOME shortcuts via D-Bus and gsettings (no special permissions needed)
  - Hotkeys visible in GNOME Settings → Keyboard → Shortcuts → Custom
  - Default hotkey: `Alt+R` (backtick not supported)
  - Push-to-talk unavailable (GNOME shortcuts only fire single toggle event)
  - Falls back to X11/globalShortcut if GNOME integration fails
  - `dbus-next` npm package used for D-Bus communication

## Code Style and Conventions

- Use TypeScript for new React components
- Follow existing patterns in helpers/
- Descriptive error messages for users
- Comprehensive debug logging
- Clean up resources (files, listeners)
- Handle edge cases gracefully

## Performance Considerations

- Whisper model size vs speed tradeoff
- Audio blob size limits for IPC (10MB)
- Temporary file cleanup
- Memory usage with large models
- Process timeout protection (5 minutes)
- Meeting detection uses event-driven OS APIs (near-zero CPU) with polling fallback
- Process list cache shared between detectors to avoid duplicate `tasklist`/`pgrep` calls
- Google Calendar sync uses exponential backoff to avoid hammering API on network failures

## Security Considerations

- API keys and enterprise cloud creds (12 secrets total) encrypted at rest via Electron `safeStorage` → OS keychain (Keychain / DPAPI / libsecret), stored as per-key files in `userData/secure-keys/`. Linux without a keyring falls back to plaintext (Electron default). Closed in #629.
- Context isolation enabled
- No remote code execution
- Sanitized file paths
- Limited IPC surface area

## Future Enhancements to Consider

- Streaming transcription support
- Custom wake word detection
- ~~Multi-language UI~~ (implemented — 9 languages via react-i18next)
- Cloud model selection
- Batch transcription
- Export formats beyond clipboard

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Yambr OpenWhispr Fork**

A self-hostable fork of OpenWhispr (Electron-based dictation desktop app) that allows organizations to point the build at their own backend, model providers, and identity provider — configured at build time via environment variables. The first milestone reverse-engineers the existing OpenWhispr cloud backend, documents the wire-level contract directly in the repository so third parties can implement compatible servers, and replaces hardcoded URLs / OAuth client configs / provider lists with build-time configurable variables.

**Core Value:** **A maintainer can run `npm run build` with a set of env vars and get a fully-working OpenWhispr binary that talks to their own backend and shows only the OAuth providers they want — without touching source code.** Default build (no env vars) must continue to behave identically to the upstream Yambr fork.

### Constraints

- **Tech stack**: Existing — must not introduce new core deps without strong reason. Node 24 / Electron 41 / Vite are pinned.
- **Behavior**: Default build (no env) MUST be identical to current upstream Yambr binary — no behavioral drift for existing users.
- **Build-time only**: All v1 configurability happens at build time, NOT runtime. Reduces attack surface and keeps the binary auditable.
- **Documentation lives in repo**: Backend / OAuth / build-config docs must be in `docs/` (committed), not just `.planning/` — third parties need them.
- **Signing**: Existing Developer ID signing flow (`afterSign.js`, electron-builder) must continue working with env-driven config.
- **Secrets**: API keys remain user-provided at runtime via Electron `safeStorage` — build-time vars are for *defaults and endpoints*, never for secret material.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 6.0.2 - React components, services, configuration, type definitions
- JavaScript (Node.js) - Electron main process, build scripts, helpers
- Swift - macOS-specific utilities (Globe key listener, mic listener, audio tap)
- C - Windows low-level keyboard hook (Push-to-Talk)
- JSON - Configuration, model registry data
- CSS/SCSS - Styling via Tailwind CSS v4
- Markdown - Documentation, translations via react-i18next
## Runtime
- Node.js 24 (pinned in `.nvmrc` — CI uses Node 24, do NOT regenerate `package-lock.json` with different major version)
- Electron 41.2.0 - Desktop framework with context isolation enabled
- npm (lockfile: `package-lock.json` present)
## Frameworks
- React 19.1.0 - UI framework for both dictation overlay and settings panel
- Electron 41.2.0 - Desktop application framework
- Vite 8.0.7 - Build tool and dev server (TypeScript + JSX support via `@vitejs/plugin-react`)
- TailwindCSS 4.1.10 - Utility-first CSS framework
- shadcn/ui 0.9.5 - Component library built on Radix UI primitives
- Radix UI - Unstyled accessible primitives (`react-dialog`, `react-dropdown-menu`, `react-select`, `react-tabs`, `react-accordion`, `react-label`, `react-popover`, `react-progress`, `react-slot`)
- Tiptap 3.22.3 - Rich text editor for note editing (`@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-task-list`, `@tiptap/extension-placeholder`)
- Lucide React 1.7.0 - Icon library (React components)
- React Markdown 10.1.0 - Markdown rendering
- ai 6.0.116 - Vercel AI SDK for streamText, tool calls, and multi-provider LLM abstraction
- @ai-sdk/openai 3.0.41 - OpenAI integration (Responses API, Chat Completions)
- @ai-sdk/anthropic 3.0.58 - Anthropic Claude models
- @ai-sdk/google 3.0.43 - Google Gemini API
- @ai-sdk/groq 3.0.29 - Groq inference platform
- @ai-sdk/amazon-bedrock 4.0.93 - AWS Bedrock models
- @ai-sdk/azure 3.0.53 - Azure OpenAI
- @ai-sdk/google-vertex 4.0.108 - GCP Vertex AI
- i18next 26.0.4 - i18n core
- react-i18next 17.0.2 - React integration
- Translation files: `src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json` (9 languages)
- Zustand 5.0.11 - Lightweight state management (`src/stores/settingsStore.ts`)
- better-auth 1.6.9 - Authentication system
- better-sqlite3 12.8.0 - SQLite wrapper for transcription history and notes (unpacked via ASAR)
- Kysely 0.28.14 - Type-safe SQL query builder
- Qdrant JS Client 1.12.0 - Vector database client for semantic search (`@qdrant/js-client-rest`)
- onnxruntime-node 1.21.0 - ONNX Runtime for local embeddings (unpacked via ASAR)
- ffmpeg-static 5.2.0 - FFmpeg binaries (unpacked via ASAR for audio processing)
- onnxruntime-node 1.21.0 - For embeddings and speech models (ONNX Runtime)
- Zod 4.3.6 - Schema validation and TypeScript type inference
- flatted 3.4.2 - Serialize/deserialize circular structures
- class-variance-authority 0.7.1 - Component variant management
- clsx 2.1.1 - Conditional CSS class utilities
- tailwind-merge 3.3.1 - Intelligent Tailwind class merging
- ps-list 9.0.0 - Get running processes (for meeting detection)
- @tanstack/react-virtual 3.13.2 - Virtualization for large note lists
- ws 8.19.0 - WebSocket client
- tar 7.4.3 - TAR archive extraction
- unzipper 0.12.3 - ZIP archive extraction
- unbzip2-stream 1.4.3 - BZIP2 decompression
- electron-updater 6.6.2 - Electron app auto-update framework
- @napi-rs/keyring 1.3.0 - OS keychain access for secure credential storage (unpacked via ASAR)
- dbus-next 0.10.2 - D-Bus communication (GNOME Wayland shortcuts)
- @electron/notarize 3.0.1 - macOS notarization
- @aws-sdk/credential-providers 3.1029.0 - AWS credential handling for Bedrock
## Configuration
- `src/vite.config.mjs` - Vite build configuration with React plugin, Tailwind CSS v4 plugin, path aliases
- `src/tsconfig.json` - TypeScript configuration (ES2022, DOM, strict: false, path alias `@/*`)
- `electron-builder.json` - App packaging configuration with platform-specific targets
- `.nvmrc` - Node.js version pinning (24)
- `.env` (root) - Development environment variables
- `userData/.env` (runtime) - User-configured API keys and settings (loaded first via EnvironmentManager)
- Environment variables passed to Vite via `loadEnv()` in vite.config.mjs
- Secret keys encrypted at rest via Electron `safeStorage` → OS keychain (Keychain/DPAPI/libsecret), stored as per-key `.enc` files in `userData/secure-keys/`
- `.prettierrc` - Prettier configuration (100 char print width, 2-space tabs, trailing commas, LF line endings)
- ESLint (npm eslint 10.2.1) with TypeScript support and React Hooks rules
## Platform Requirements
- Node.js >= 24 (pinned in `.nvmrc`)
- npm (lockfile: package-lock.json)
- TypeScript 6.0.2 (dev dependency)
- Electron 41.2.0 (dev dependency)
- Native build tools (for better-sqlite3, onnxruntime-node, @napi-rs/keyring compilation)
- macOS 10.13+ (Intel x64 or Apple Silicon arm64)
- Windows 7+ (x64)
- Linux (x64, glibc 2.29+)
- 2GB+ RAM for whisper.cpp models, 4GB+ for larger models
- Audio input device (microphone)
- `whisper-server-{platform}-{arch}` - Whisper.cpp HTTP server (GitHub: OpenWhispr/whisper.cpp)
- `llama-server-{platform}-{arch}` - Llama.cpp HTTP server (GitHub: ggerganov/llama.cpp)
- `sherpa-onnx-{platform}-{arch}` - NVIDIA Parakeet ASR (GitHub: k2-fsa/sherpa-onnx)
- `qdrant-{platform}-{arch}` - Vector database (GitHub: qdrant/qdrant)
- `macos-globe-listener`, `macos-mic-listener`, `macos-fast-paste`, etc. (compiled from Swift source)
- `windows-key-listener.exe`, `windows-mic-listener.exe` (GitHub releases)
- `linux-fast-paste`, `linux-key-listener`, etc. (compiled from C source)
- `all-MiniLM-L6-v2/` - ONNX embedding model (384-dim, auto-downloaded on first launch)
- `diarization-models/` - Pyannote speaker segmentation and CAM++ speaker embedding
- Vite 8.0.7 + @vitejs/plugin-react 6.0.1
- ESLint 10.2.1 with TypeScript support
- Prettier 3.8.3
- Electron Builder 26.4.0
- @electron/notarize 3.0.1 (macOS signing/notarization)
## Key Dependencies Summary
| Package | Version | Purpose |
|---------|---------|---------|
| react | 19.1.0 | UI framework |
| electron | 41.2.0 | Desktop app framework |
| vite | 8.0.7 | Build tool |
| ai | 6.0.116 | Vercel AI SDK (multi-provider LLM) |
| better-sqlite3 | 12.8.0 | Local transcription history DB |
| onnxruntime-node | 1.21.0 | Local embeddings via ONNX |
| @qdrant/js-client-rest | 1.12.0 | Vector search client |
| ffmpeg-static | 5.2.0 | Audio processing |
| tailwindcss | 4.1.10 | CSS framework |
| zustand | 5.0.11 | State management |
| i18next | 26.0.4 | Internationalization core |
| @radix-ui/* | various | Accessible component primitives |
| @tiptap/* | 3.22.3 | Rich text editing |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- React components: PascalCase with `.tsx` extension (e.g., `ErrorBoundary.tsx`, `ControlPanel.tsx`)
- Helper modules: camelCase with `.js` or `.ts` extension (e.g., `hotkeyManager.js`, `database.js`)
- Services: PascalCase with `.ts` extension (e.g., `ReasoningService.ts`, `NotesService.ts`)
- Stores: camelCase with `.ts` extension ending in "Store" (e.g., `settingsStore.ts`, `actionStore.ts`)
- Hooks: camelCase with `.ts` or `.js` extension starting with "use" (e.g., `useSettings.ts`, `useAudioRecording.js`)
- Test files: match source filename with `.test.*` suffix (e.g., `transcriptText.test.js`)
- Exported functions: camelCase (e.g., `initializeActions()`, `transcriptsOverlap()`, `normalizeUiLanguage()`)
- Event handlers: camelCase starting with "handle" or action verb (e.g., `handleReload()`, `ensureIpcListeners()`)
- Zustand action functions: simple camelCase verbs (e.g., `addActionToStore()`, `updateActionInStore()`)
- Private/internal functions: camelCase with leading underscore when needed (e.g., `_asyncVectorUpsert()`)
- Constants: UPPER_SNAKE_CASE (e.g., `HOTKEY_REGISTRATION_DELAY_MS`, `DEFAULT_HOTKEY`, `GNOME_NATIVE_SLOTS`)
- Module state (top-level): camelCase prefixed with "has" or condition (e.g., `hasBoundIpcListeners`)
- Class properties: camelCase (e.g., `this.slots`, `this.db`, `this.currentHotkey`)
- React hook state: camelCase from destructure (e.g., `const { actions } = useActionStore()`)
- Exported interfaces: PascalCase with suffix or complete naming (e.g., `ErrorBoundaryProps`, `TranscriptionSettings`, `NoteInput`, `SearchResult`)
- Type aliases: PascalCase (e.g., `LocalTranscriptionProvider`, `InferenceMode`, `TranscriptionStatus`)
- Union types: PascalCase joined by pipe (e.g., `"personal" | "meeting" | "upload"`)
## Code Style
- Formatter: Prettier v3.8.3
- Key settings: `printWidth: 100`, `tabWidth: 2`, `semi: true`, `singleQuote: false`, `trailingComma: "es5"`, `arrowParens: "always"`
- End-of-line: LF
- Bracket spacing: enabled
- ESLint v10.2.1 with typescript-eslint
- Separate configs for root (CommonJS, main process) and `/src` (ES modules, React + TypeScript)
- Root config: `eslint.config.js` (CJS, Node globals)
- Renderer config: `src/eslint.config.js` (ES modules, React-specific rules)
- `no-unused-vars`: Warn with patterns `^_`, `^event`, `^err`, `^error` ignored (root) or `^[A-Z_]` (src)
- `react-hooks/rules-of-hooks`: Error
- `react-hooks/exhaustive-deps`: Warn
- `no-console`: Off (enabled for debugging in Electron)
- `no-empty`: Error except empty catch blocks
- `react-refresh/only-export-components`: Warn for non-component exports
- Target: ES2022
- Module: ESNext
- JSX: react-jsx
- `strict: false` (lenient for gradual migration)
- `skipLibCheck: true`, `isolatedModules: true`, `forceConsistentCasingInFileNames: true`
- Path alias: `@/*` → current directory (used minimally)
## Import Organization
- React hooks from "react" imported explicitly when needed
- i18next hooked via `useTranslation()` from "react-i18next"
- Window API accessed via `window.electronAPI` (preload bridge)
## Error Handling
- Try/catch blocks wrap async operations, IPC calls, and file I/O
- Errors logged via `debugLogger.log()` or `logger.logReasoning()`
- Graceful fallbacks: if native binary missing → fallback to polling, if API fails → retry or skip
- Column-add errors in database migrations: wrapped with "duplicate column" check (example: `database.js` lines 34–38)
- IPC error propagation: errors from main process handlers thrown to renderer via Promise rejection
## Logging
- `debugLogger.log()` for general logging
- Conditional on `OPENWHISPR_LOG_LEVEL=debug` or `--log-level=debug`
- Logs written to app-specific directory on disk
- `logger.logReasoning(stage, details)` for AI reasoning pipeline
- Format: structured events with key-value pairs (not just strings)
- Example: `logger.logReasoning("CUSTOM_KEY_RETRIEVAL", { provider, hasKey, keyLength })`
- IPC handler entry/exit
- Error conditions with context
- Audio pipeline state changes (recording start/stop, processing)
- External API calls (provider routing, key retrieval)
- Fallback activation (e.g., "Qdrant unavailable, using FTS5 fallback")
## Comments
- Non-obvious algorithm logic (e.g., speech gate thresholds, echo detection)
- Complex regexes (e.g., `RIGHT_SIDE_MODIFIER_PATTERN`)
- Platform-specific workarounds ("macOS: CoreAudio listeners for event-driven detection")
- Important constants with justification ("HOTKEY_REGISTRATION_DELAY_MS = 1000 to ensure localStorage access")
- Service methods with complex return types
- Hook contracts (what props/state they manage)
- Type definitions with non-obvious fields
## Function Design
- Single objects for >2 params: `function process(config: { model, provider, timeout })`
- IPC handlers accept `(event, ...args)` from Electron's `ipcMain.handle()`
- Async: use `async/await`, not `.then()` chains
- Promise<T> for async operations
- Type unions for conditional returns (e.g., `{ suppress: boolean; reason: string }` from `shouldSuppressMicSegment()`)
- Throw errors instead of returning error objects (except IPC, where errors automatically propagate)
## Module Design
- Class: export via `module.exports = ClassName` (CommonJS) or `export class ClassName` (ES modules)
- Functions: named exports (e.g., `export async function create(note)`)
- Singletons: exported as default (e.g., `export default hotkeyManager`)
- Constructor initializes state
- Public methods for API surface
- Private methods (prefixed `_` or `#` comment) for internal logic
- Zustand stores: export hooks, keep state mutation internal via store actions
## Internationalization (i18n) — MANDATORY
- Initialization in `src/i18n.ts`
- Translation files: `src/locales/{lang}/translation.json`
- Supported languages: en, es, fr, de, pt, it, ru, ja, zh-CN, zh-TW (10 total)
## IPC Patterns
- Registered via `ipcMain.handle(channel, handler)`
- Channel naming: kebab-case (e.g., `db-save-transcription`, `get-openai-key`)
- Handler signature: `async (event, ...args) => result`
- Error handling: throw errors, Electron automatically converts to Promise rejection in renderer
- Via `window.electronAPI.methodName()` (preload bridge in `preload.js`)
- Returns Promise (all IPC is async)
- Error handling: `.catch()` or `try/await`
- Defines all exposed IPC methods in `window.electronAPI` object
- Context isolation enabled (secure)
- Validates arguments when needed
## State Management
- `create<StateInterface>()(initializer)` factory pattern
- Immutable updates via `setState({ ... })`
- Hooks extracted as separate functions (e.g., `export function useActions()`)
- Initialization: async functions called on app startup (e.g., `initializeActions()`)
- Persisted to localStorage and `.env` file
- Large interface combining multiple setting categories (Transcription, Cleanup, Hotkey, etc.)
- Selector function: `selectResolvedLLMConfig(state, scope)` for multi-scope inference setup
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Electron main/renderer/preload separation with context isolation
- Separate ONNX utility worker process for inference (text embeddings, speaker embeddings, fbank processing)
- Dual-window UI architecture (overlay dictation panel + full control panel)
- Message-based IPC bridge between processes
- React 19 with Zustand stores for state management
- TypeScript for type safety across application boundary
## Layers
- Purpose: Electron lifecycle, native OS integration, IPC handlers, database, file I/O, hotkey registration
- Location: `main.js` (1497 lines)
- Contains: Window management, audio device enumeration, clipboard integration, native binary spawning (whisper, parakeet, qdrant)
- Depends on: Electron, better-sqlite3, child_process, native OS APIs
- Used by: Renderer process (via IPC), ONNX worker (via parent-child process message passing)
- Purpose: Expose safe IPC methods to renderer with context isolation enforced
- Location: `preload.js` (879 lines)
- Contains: `contextBridge.exposeInMainWorld("electronAPI", {...})` wrapper around ipcRenderer invokes/on/send
- Depends on: Electron contextBridge, ipcRenderer
- Used by: Renderer process (via window.electronAPI)
- Purpose: UI rendering, user interaction, audio recording via MediaRecorder API
- Location: `src/main.jsx`, `src/App.jsx`, `src/AppRouter.jsx`
- Contains: React components, hooks, stores, services, UI logic
- Depends on: React 19, react-i18next, Zustand, Vite dev server
- Used by: Main process (sends IPC), ONNX worker (receives inference results)
- Purpose: Isolated inference for text embeddings (all-MiniLM-L6-v2), speaker embeddings (3D-Speaker-mini), fbank processing
- Location: `src/workers/onnxWorker.js`
- Spawning: `src/helpers/onnxWorkerClient.js` → lazy spawn on first use (warmup)
- Lifecycle: Spawned with `detached: process.platform !== "win32"` (own process group on Unix), killed on app quit via `sidecarReaper.js`
- Contains: ONNX Runtime session setup, mel filterbank computation, text tokenization, model inference
- Depends on: onnxruntime-node (native binding), child_process parent message passing
- Used by: Main process (via message port for text embedding requests)
## Data Flow
## Key Abstractions
- Purpose: Unified audio recording + processing orchestration
- Abstracts: MediaRecorder API, transcription APIs (local/cloud/streaming), reasoning service, clipboard paste
- Pattern: Single instance per renderer process, methods for startRecording/stopRecording/transcribeAudio
- State: isRecording, isProcessing, isStreaming (booleans), transcript/partialTranscript (strings)
- Purpose: Centralized application state with localStorage persistence
- Key stores:
- Purpose: AI processing for cleanup, formatting, and agent-addressed commands
- Pattern: Singleton service with static methods for streamText, calculateMaxTokens, getSystemPrompt
- Supports: 8 inference providers (OpenAI, Anthropic, Gemini, Groq, local LLM via llama.cpp, enterprise, LAN, OpenWhispr cloud)
- Integrates: Tool system for note search, action execution, diarization
- Purpose: Centralized registration of all ipcMain.handle/on/send listeners
- Pattern: Main process registers handlers at startup, renderer invokes via window.electronAPI methods
- Key handlers: db-*, transcribe-audio, save-transcription, cloud-reason, paste-text, hotkey-*, window-*
- Purpose: Create and manage Electron BrowserWindow instances
- Pattern: createDictationWindow, createControlPanelWindow, createAgentPanelWindow
- Features: Always-on-top overlay, preload script injection, URL-based routing (window.location.pathname)
## Entry Points
- Location: `/Users/ngyambroskin/Documents/openwhispr/main.js`
- Triggers: `npm start` or `npm run dev` (spawned by Vite via `run-electron.js`)
- Responsibilities: Initialize app, register hotkeys, create windows, set up IPC handlers, spawn sidecars (whisper, qdrant)
- Location: `src/main.jsx` (renders to `root` DOM element)
- Imports: `src/App.jsx`, `src/AppRouter.jsx`, global CSS
- Responsibilities: Bootstrap React, context providers (I18nextProvider, SettingsProvider, ToastProvider)
- `main.html?panel=true` or `main.html?panel=true` → ControlPanel + OnboardingFlow (full settings)
- `main.html?agent=true` → AgentOverlay (AI chat window)
- `main.html` (default) → App.jsx (dictation overlay)
- Meeting/update/transcription preview: query params determine which overlay to show
## Error Handling
- Transcription: local whisper → fallback to cloud OpenAI if local disabled
- Clipboard: native XTest (Linux) → xdotool (X11) → wtype (Wayland) → PowerShell (Windows) → manual copy fallback
- Hotkey registration: Windows native key listener → Electron globalShortcut → GNOME shortcuts (Wayland) → Hyprland shortcuts → UI message
- Meeting detection: Event-driven (macOS subscriptions, Windows WASAPI, Linux pactl) → polling fallback
- Vector search: Qdrant semantic → FTS5 keyword fallback
- Reasoning: Cloud model → local LLM → skip if unavailable
- `src/helpers/recordingErrors.ts` — Error classification by provider/status
- `src/utils/retry.ts` — Retry strategy with exponential backoff
- `src/helpers/networkErrors.ts` — Network error classification and handling
- Error boundaries: `src/components/ErrorBoundary.tsx`
## Cross-Cutting Concerns
- Frontend: `src/utils/logger.ts` (logs to console + optionally localStorage)
- Backend: `src/helpers/debugLogger.js` (writes to app data directory + console)
- Streaming: Stage-based logging (AUDIO_RECORD, TRANSCRIPTION_RECEIVED, REASONING_STARTED, etc.)
- Enable with `--log-level=debug` or `OPENWHISPR_LOG_LEVEL=debug`
- Settings: Type-safe via TypeScript interfaces (`TranscriptionSettings`, `CleanupSettings`, etc. in `src/hooks/useSettings.ts`)
- IPC arguments: Validated in main.js before processing (file paths, API keys, database IDs)
- Models: Registry validation in `src/models/ModelRegistry.ts` (checks provider/model pairs exist)
- OAuth flow: Custom protocol handler (openwhispr://) → sign-in window → token stored in secure keychain
- API keys: 12 secret keys encrypted at rest via `safeStorage` (OS keychain on macOS/Windows, libsecret on Linux, plaintext fallback)
- Session refresh: `src/lib/auth.ts` — withSessionRefresh() wrapper for API calls with token refresh
- Framework: react-i18next v15, i18next v25
- Strings: `src/locales/{lang}/translation.json` for 10 languages
- Usage: `const { t } = useTranslation()` hook in components
- Key groups: notes.*, chat.*, settings.*, hotkeys.*, errors.*
- Code splitting: React.lazy() for ControlPanel, OnboardingFlow, AgentOverlay
- Memoization: useMemo/useCallback in hooks to prevent re-renders
- IPC batching: Multiple setting updates debounced before IPC
- Process pooling: ONNX worker spawned once, reused for all embedding requests
- Audio chunking: Cloud uploads split into 4MB chunks for large files
- Context isolation: Renderer cannot access Node.js APIs directly
- Preload: Limited surface area (database methods, window control, audio, clipboard)
- File paths: Sanitized before passing to fs.* operations
- API keys: Never logged, encrypted at rest, only loaded into process.env at startup
- CORS: No remote code execution, all API requests go through main process or Vite dev proxy
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
