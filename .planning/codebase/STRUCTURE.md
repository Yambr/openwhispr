# Codebase Structure

**Analysis Date:** 2026-05-07

## Directory Layout

```
openwhispr/
├── main.js                    # Electron main process (1497 lines)
├── preload.js                 # Context-isolated IPC bridge (879 lines)
├── package.json               # Dependencies, build scripts
├── vite.config.js             # Vite build config
├── electron-builder.json      # Electron packager config
├── tsconfig.json              # TypeScript config
├── eslint.config.js           # ESLint rules
├── .prettierrc                 # Prettier formatter config
├── .nvmrc                      # Node.js version pinning (24.x)
│
├── src/
│   ├── main.jsx               # React app entry point
│   ├── App.jsx                # Dictation overlay UI (498 lines)
│   ├── AppRouter.jsx          # URL-based routing (195 lines)
│   ├── index.css              # Global Tailwind CSS
│   ├── i18n.ts                # i18next configuration
│   ├── vite-env.d.ts          # Vite type definitions
│   │
│   ├── components/            # React components (122 files)
│   │   ├── AgentOverlay.tsx         # AI chat panel
│   │   ├── App.jsx                  # (deprecated, see App.jsx)
│   │   ├── ControlPanel.tsx         # Main settings/history window
│   │   ├── ControlPanelSidebar.tsx  # Sidebar navigation
│   │   ├── OnboardingFlow.tsx       # 8-step first-time setup
│   │   ├── SettingsPage.tsx         # Settings UI
│   │   ├── HistoryView.tsx          # Transcription history
│   │   ├── NotesView/               # Notes components (list, editor, search)
│   │   ├── WhisperModelPicker.tsx   # Model download UI
│   │   ├── LocalModelPicker.tsx     # Local LLM picker
│   │   ├── LocalWhisperPicker.tsx   # Local Whisper picker
│   │   ├── ChatPanel.tsx            # Chat interface
│   │   ├── DictionaryView.tsx       # Custom dictionary UI
│   │   ├── IntegrationsView.tsx     # Cloud integrations
│   │   ├── MeetingNotificationOverlay.tsx  # Meeting detection toast
│   │   ├── UpdateNotificationOverlay.tsx   # App update notification
│   │   ├── TranscriptionPreviewOverlay.tsx # Raw audio preview
│   │   ├── WindowControls.tsx       # Min/max/close buttons
│   │   ├── ErrorBoundary.tsx        # Error fallback UI
│   │   ├── agent/                   # Agent components (command search, overlay)
│   │   ├── chat/                    # Chat UI (conversation, message list)
│   │   ├── notes/                   # Notes UI (list, editor, folder tree)
│   │   ├── settings/                # Settings sections (api keys, transcription, reasoning)
│   │   ├── ui/                      # shadcn/ui primitives (button, card, dialog, etc.)
│   │   ├── lib/                     # Component utilities (colors, tailwind helpers)
│   │   └── referral-cards/          # Onboarding referral components
│   │
│   ├── hooks/                 # React hooks (24 files)
│   │   ├── useSettings.ts           # Settings context + hook
│   │   ├── useAudioRecording.js     # Recording state + MediaRecorder
│   │   ├── useHotkey.js             # Hotkey state + event handling
│   │   ├── useClipboard.ts          # Clipboard operations
│   │   ├── useHotkeyRegistration.ts # Hotkey registration IPC
│   │   ├── useAuth.ts               # Authentication state
│   │   ├── useDialogs.ts            # Electron dialog integration
│   │   ├── useLocalStorage.ts       # Type-safe localStorage wrapper
│   │   ├── usePermissions.ts        # OS permission checks
│   │   ├── useLocalModels.ts        # Local LLM state
│   │   ├── useModelDownload.ts      # Model download progress
│   │   ├── useFolderManagement.ts   # Notes folder CRUD
│   │   └── useTheme.ts              # Dark/light mode toggle
│   │
│   ├── services/              # Business logic
│   │   ├── ReasoningService.ts      # AI processing (cleanup, agent, formatting)
│   │   ├── BaseReasoningService.ts  # Abstract base with common methods
│   │   ├── NotesService.ts          # Notes CRUD (database wrapper)
│   │   ├── TranscriptionsService.ts # Transcription history (database wrapper)
│   │   ├── SyncService.ts           # Cloud sync orchestration
│   │   ├── ConversationsService.ts  # Chat history
│   │   ├── ApiKeysService.ts        # Secure key management
│   │   ├── FoldersService.ts        # Notes folder management
│   │   ├── ai/                      # AI provider implementations
│   │   │   ├── providers.ts         # Provider registration
│   │   │   ├── openaiBase.ts        # OpenAI API wrapper
│   │   │   ├── inferenceProviders/  # Provider-specific logic
│   │   │   │   ├── index.ts              # Registry of 8 providers
│   │   │   │   ├── anthropic.ts          # Anthropic API
│   │   │   │   ├── openai.ts             # OpenAI API (Responses + Chat Completions)
│   │   │   │   ├── gemini.ts             # Google Gemini API
│   │   │   │   ├── groq.ts               # Groq API
│   │   │   │   ├── local.ts              # Local llama.cpp integration
│   │   │   │   ├── lan.ts                # LAN server (OpenAI-compatible)
│   │   │   │   ├── enterprise.ts         # Enterprise cloud provider
│   │   │   │   └── openwhispr.ts         # OpenWhispr cloud API
│   │   │   └── thinkingSuppression.ts    # Extended thinking handling
│   │   ├── tools/                   # Agent tools (note search, actions)
│   │   │   ├── index.ts             # Tool registry
│   │   │   ├── searchNotesTool.ts   # Semantic + FTS5 search
│   │   │   ├── createNoteTool.ts    # Note creation
│   │   │   ├── actionExecutor.ts    # Action command execution
│   │   │   └── ...
│   │   ├── cloudApi.ts              # Cloud API integration
│   │   ├── localReasoningBridge.js  # Bridge to local LLM server
│   │   └── ai-agent/                # (Optional) Agentic features
│   │
│   ├── stores/                # Zustand stores (7 files)
│   │   ├── settingsStore.ts         # All user preferences (Zustand + localStorage)
│   │   ├── transcriptionStore.ts    # Current recording session
│   │   ├── noteStore.ts             # Notes state + search results
│   │   ├── chatStore.ts             # Chat messages + conversation
│   │   ├── actionStore.ts           # Custom actions
│   │   ├── meetingRecordingStore.ts # Meeting recording state
│   │   └── streamingProvidersStore.ts # Active streaming provider
│   │
│   ├── helpers/               # Main process (Node.js) helpers (76 files)
│   │   ├── ipcHandlers.js           # All ipcMain handlers registered here
│   │   ├── database.js              # SQLite wrapper (better-sqlite3)
│   │   ├── audioManager.js          # Audio recording + transcription orchestration
│   │   ├── audioStorage.js          # Audio file persistence
│   │   ├── audioActivityDetector.js # Microphone activity detection (event-driven)
│   │   ├── audioTapManager.js       # macOS Audio Tap for system audio
│   │   ├── clipboard.js             # Cross-platform clipboard paste
│   │   ├── dragManager.js           # Window drag implementation
│   │   ├── hotkey*.js               # Hotkey registration (multiple files)
│   │   ├── hotkeyManager.js         # Main hotkey coordinator
│   │   ├── gnomeShortcut.js         # GNOME Wayland D-Bus shortcuts
│   │   ├── hyprlandShortcut.js      # Hyprland Wayland keybinding
│   │   ├── windowsKeyManager.js     # Windows Push-to-Talk native listener
│   │   ├── window*.js               # Window management (create, show, hide)
│   │   ├── windowConfig.js          # Window configuration (dimensions, always-on-top)
│   │   ├── windowManager.js         # Window factory
│   │   ├── whisper.js               # Local whisper.cpp integration
│   │   ├── parakeet.js              # NVIDIA Parakeet model management
│   │   ├── parakeetServer.js        # sherpa-onnx CLI wrapper
│   │   ├── qdrantManager.js         # Qdrant vector DB sidecar lifecycle
│   │   ├── localEmbeddings.js       # ONNX text embedding (all-MiniLM-L6-v2)
│   │   ├── vectorIndex.js           # Qdrant collection CRUD
│   │   ├── meetingDetectionEngine.js # Meeting detection orchestration
│   │   ├── meetingProcessDetector.js # Meeting app detection
│   │   ├── googleCalendarManager.js # Google Calendar API sync
│   │   ├── environment.js           # .env loading + API key persistence
│   │   ├── debugLogger.js           # Structured logging with file output
│   │   ├── tray.js                  # System tray menu
│   │   ├── menuManager.js           # Application menu
│   │   ├── devServerManager.js      # Vite dev server integration
│   │   ├── onnxWorkerClient.js      # Lazy spawn + message passing to ONNX worker
│   │   ├── ModelManager.ts          # Local model download orchestration
│   │   ├── cliBridge.js             # CLI loopback server (8200-8219)
│   │   ├── postMigrationDetector.js # Legacy bundle migration detection
│   │   ├── tokenStore.js            # Secure token storage
│   │   ├── sidecarReaper.js         # Graceful sidecar process shutdown
│   │   ├── diarization.js           # Speaker diarization
│   │   ├── liveSpeakerIdentifier.js # Real-time speaker ID
│   │   └── ...
│   │
│   ├── utils/                 # Shared utilities
│   │   ├── logger.ts                # Frontend logging
│   │   ├── retry.ts                 # Exponential backoff retry
│   │   ├── langua*.ts               # Language utilities
│   │   ├── hotkeys.ts               # Hotkey formatting/parsing
│   │   ├── permissions.ts           # Permission checking
│   │   ├── audioDeviceUtils.ts      # Audio device enumeration
│   │   ├── recordingErrors.ts       # Error classification
│   │   ├── networkErrors.ts         # Network error handling
│   │   ├── agentName.ts             # Agent naming detection
│   │   ├── byokDetection.ts         # Bring-Your-Own-Key detection
│   │   ├── audioUtils.ts            # Audio format conversion (16k, PCM, WAV)
│   │   └── ...
│   │
│   ├── workers/               # Isolated worker processes
│   │   └── onnxWorker.js           # ONNX Runtime worker (text embedding, speaker embedding, fbank)
│   │
│   ├── models/                # Model registry
│   │   ├── modelRegistryData.json  # Centralized model definitions (YAML-like)
│   │   └── ModelRegistry.ts        # TypeScript wrapper + helpers
│   │
│   ├── config/                # Application configuration
│   │   ├── constants.ts            # API endpoints, token limits
│   │   ├── inferenceScopes.ts      # Per-scope LLM config (dictation, cleanup, formatting, chat)
│   │   ├── agentDetection.ts       # Agent name parsing
│   │   ├── prompts.ts              # System prompt registry
│   │   ├── prompts/                # Prompt templates by scope
│   │   └── languageRegistry.json   # 58 supported languages
│   │
│   ├── types/                 # TypeScript type definitions
│   │   ├── electron.ts             # TranscriptionItem, NoteItem, FolderItem, ActionItem, GpuInfo
│   │   └── calendar.ts             # GoogleCalendarAccount
│   │
│   ├── locales/               # i18n translations (10 languages)
│   │   ├── en/translation.json
│   │   ├── es/translation.json
│   │   ├── fr/translation.json
│   │   ├── de/translation.json
│   │   ├── pt/translation.json
│   │   ├── it/translation.json
│   │   ├── ru/translation.json
│   │   ├── ja/translation.json
│   │   ├── zh-CN/translation.json
│   │   └── zh-TW/translation.json
│   │
│   ├── assets/                # Static assets
│   │   ├── icons/            # App icon SVGs + providers/
│   │   ├── fonts/            # Custom fonts
│   │   └── openwhispr.icon/  # App icon sources
│   │
│   └── lib/                   # Shared libraries
│       ├── auth.ts           # OAuth + session refresh
│       └── (other utilities)
│
├── scripts/                   # Build and setup scripts
│   ├── download-whisper-cpp.js        # Whisper binary download
│   ├── download-llama-server.js       # Local LLM server
│   ├── download-qdrant.js             # Qdrant vector DB
│   ├── download-minilm.js             # Embedding model (all-MiniLM-L6-v2)
│   ├── download-sherpa-onnx.js        # Parakeet runtime
│   ├── build-globe-listener.js        # macOS Globe key detection (Swift)
│   ├── build-macos-mic-listener.js    # macOS microphone detection (Swift)
│   ├── build-windows-key-listener.js  # Windows Push-to-Talk (C)
│   ├── build-windows-mic-listener.js  # Windows microphone detection (C)
│   ├── build-macos-fast-paste.js      # macOS fast paste (Swift)
│   ├── build-windows-fast-paste.js    # Windows fast paste (C)
│   ├── build-linux-fast-paste.js      # Linux fast paste (C)
│   ├── run-electron.js                # Dev server launcher
│   ├── lib/download-utils.js          # Shared download utilities
│   └── (other build utilities)
│
├── resources/                 # Bundled native binaries
│   ├── bin/                   # Compiled binaries directory
│   │   ├── whisper-cpp-{platform}-{arch}
│   │   ├── qdrant-{platform}-{arch}
│   │   ├── sherpa-onnx-{platform}-{arch}
│   │   ├── macos-mic-listener       (macOS only)
│   │   ├── windows-key-listener.exe (Windows only)
│   │   ├── windows-mic-listener.exe (Windows only)
│   │   ├── linux-fast-paste         (Linux only)
│   │   └── (other platform-specific binaries)
│   └── (other resources)
│
├── native/                    # Native source code
│   ├── windows-key-listener.c       # Low-level keyboard hook
│   ├── windows-mic-listener.c       # WASAPI mic session monitor
│   ├── macos-mic-listener.swift     # CoreAudio property listener
│   └── (other native sources)
│
├── .github/workflows/         # CI/CD
│   ├── build-windows-key-listener.yml
│   ├── build-windows-mic-listener.yml
│   ├── tests.yml
│   └── (other workflows)
│
├── agent-skills/              # Custom AI agent skills (optional)
│   └── (skill definitions)
│
├── docs/                      # Documentation
│   └── (markdown guides)
│
├── .planning/codebase/        # AI assistant reference docs
│   ├── ARCHITECTURE.md        # This file: architectural layers and data flow
│   ├── STRUCTURE.md           # Directory layout and file purposes
│   ├── CONVENTIONS.md         # (future) Code style and patterns
│   └── (other docs)
│
└── dist/                      # Build output (generated)
    ├── main.js                # Vite-bundled main.js
    ├── renderer/              # Vite-bundled React app
    └── (ASAR archive for packaging)
```

## Directory Purposes

**src/components/**:
- Purpose: All React UI components (pages, modals, widgets, primitives)
- Contains: Functional components with hooks, event handlers, JSX/TSX
- Key files: `ControlPanel.tsx` (settings), `App.jsx` (dictation overlay), `SettingsPage.tsx` (preferences)

**src/hooks/**:
- Purpose: React hooks for state, side effects, and IPC
- Contains: useSettings, useAudioRecording, useHotkey, useAuth, useClipboard, etc.
- Pattern: Custom hooks that encapsulate component logic (return state + handlers)

**src/services/**:
- Purpose: Business logic services (AI, notes, sync, API integration)
- Contains: ReasoningService (AI), NotesService (database), SyncService (cloud), provider implementations
- Pattern: Singletons or static methods that handle complex operations

**src/stores/**:
- Purpose: Zustand state stores for global application state
- Contains: settingsStore, transcriptionStore, noteStore, chatStore, etc.
- Pattern: Create hook + persistence logic (localStorage for non-secret settings)

**src/helpers/**:
- Purpose: Main process (Node.js) utilities and managers
- Contains: ipcHandlers, database, audioManager, window management, binary spawning
- Pattern: Managers (classes with lifecycle) + utility functions
- Key: All code here runs in Node.js with full file system access

**src/utils/**:
- Purpose: Shared utilities for both main and renderer processes
- Contains: Logging, retry logic, language support, error classification, audio utilities
- Pattern: Pure functions and constants

**src/workers/**:
- Purpose: Child process code (ONNX worker for inference)
- Contains: onnxWorker.js (text embedding, speaker embedding, fbank processing)
- Pattern: Spawned as Node.js subprocess, communicates via parent message port

**src/models/**:
- Purpose: Model registry and metadata
- Contains: modelRegistryData.json (centralized model definitions), ModelRegistry.ts (TypeScript wrapper)
- Pattern: Single source of truth for all AI models (cloud + local)

**src/config/**:
- Purpose: Configuration constants and system prompts
- Contains: API endpoints, inference scopes, agent name patterns, system prompts
- Pattern: Exported constants, no state mutation

**src/types/**:
- Purpose: TypeScript type definitions shared across application
- Contains: TranscriptionItem, NoteItem, FolderItem, electron API types
- Pattern: Interface/type definitions only

**src/locales/**:
- Purpose: i18n translation strings
- Contains: JSON files for 10 languages with key-value pairs
- Pattern: Hierarchical keys (e.g., notes.list.title, settings.transcription.model)

**src/assets/**:
- Purpose: Static assets (icons, fonts, images)
- Contains: App icon sources, provider logos, custom fonts
- Pattern: Icon files referenced in JSX imports

**src/lib/**:
- Purpose: Reusable libraries (auth, utilities)
- Contains: OAuth flow, session refresh, color utilities
- Pattern: Exported functions and classes

**scripts/**:
- Purpose: Build and development utilities
- Contains: Binary downloaders, native code builders, dev server launcher
- Pattern: Node.js scripts executed via npm scripts

**resources/bin/**:
- Purpose: Bundled native binaries (whisper-cpp, qdrant, sherpa-onnx, etc.)
- Contains: Platform-specific compiled executables
- Pattern: Downloaded during `npm run prebuild*` or `npm run predev`

**native/**:
- Purpose: Native source code (C, Swift) for compilation
- Contains: windows-key-listener.c (low-level keyboard hook), macos-mic-listener.swift (CoreAudio)
- Pattern: Compiled during development or CI, output goes to resources/bin/

## Key File Locations

**Entry Points:**
- `main.js`: Electron main process entry point
- `src/main.jsx`: React app root
- `preload.js`: IPC bridge to renderer

**Configuration:**
- `electron-builder.json`: Electron packager and signing config
- `vite.config.js`: React build tool configuration
- `tsconfig.json`: TypeScript compiler options
- `package.json`: Dependencies, npm scripts

**Core Logic:**
- `src/helpers/audioManager.js`: Audio recording + transcription orchestration (2100+ lines)
- `src/services/ReasoningService.ts`: AI processing for cleanup/agent/formatting
- `src/helpers/ipcHandlers.js`: All IPC handler registration
- `src/hooks/useSettings.ts`: Settings context + localStorage persistence

**Testing:**
- No test framework configured (testing patterns TODO)
- Test files would follow `*.test.ts` or `*.spec.ts` naming

## Naming Conventions

**Files:**
- Components: PascalCase (App.jsx, ControlPanel.tsx, SettingsPage.tsx)
- Hooks: camelCase with "use" prefix (useSettings.ts, useAudioRecording.js)
- Utilities: camelCase (logger.ts, retry.ts, audioUtils.ts)
- Stores: camelCase with "Store" suffix (settingsStore.ts, noteStore.ts)
- Services: PascalCase (ReasoningService.ts, NotesService.ts)
- Managers: camelCase with descriptive name (audioManager.js, windowManager.js, qdrantManager.js)

**Directories:**
- Components: lowercase plural (components/, hooks/, services/, utils/, stores/)
- Features: lowercase (notes/, chat/, agent/, settings/, referral-cards/)
- Config: lowercase (config/, models/, locales/)
- Build output: lowercase (resources/, scripts/, dist/)

**Variables/Functions:**
- camelCase for functions and variables: `startRecording()`, `audioChunks`, `isRecording`
- UPPER_SNAKE_CASE for constants: `AUDIO_MIME_TYPES`, `MAX_TOOL_STEPS`, `REASONING_CACHE_TTL`
- PascalCase for classes: `DatabaseManager`, `AudioManager`, `ReasoningService`

## Where to Add New Code

**New Feature (e.g., New Transcription Provider)**:
- Provider implementation: `src/services/ai/inferenceProviders/{provider}.ts`
- Register in: `src/services/ai/inferenceProviders/index.ts` (PROVIDER_REGISTRY)
- UI settings: Add fields to `src/components/settings/TranscriptionSettings.tsx`
- Settings store: Add fields to `src/stores/settingsStore.ts`
- Hooks: Create `src/hooks/use{Provider}.ts` if needed
- IPC handler: Add to `src/helpers/ipcHandlers.js` if main process work required

**New Component**:
- Location: `src/components/{feature}/{ComponentName}.tsx`
- Use existing shadcn/ui components from `src/components/ui/`
- Hook usage: Import from `src/hooks/`
- Store usage: Import from `src/stores/`
- Strings: Add i18n keys to all `src/locales/*/translation.json`

**New IPC Handler**:
- Handler function: Add to `src/helpers/ipcHandlers.js` (ipcMain.handle/on/send)
- Preload exposure: Add to `preload.js` contextBridge.exposeInMainWorld
- Renderer invocation: Call `window.electronAPI.{methodName}()` in React components

**New Database Table/Schema**:
- Schema definition: Add migration in `src/helpers/database.js` (ALTER TABLE or CREATE TABLE)
- Service methods: Add CRUD methods to `src/services/{Entity}Service.ts`
- IPC handlers: Add handlers in `src/helpers/ipcHandlers.js`
- Types: Define interface in `src/types/electron.ts`

**New Utility Function**:
- Shared logic: `src/utils/{featureName}.ts`
- Main process only: `src/helpers/{featureName}.js`
- React hooks: `src/hooks/use{FeatureName}.ts`

**New Build Script**:
- Location: `scripts/{purpose}.js`
- Pattern: Use `downloadUtils.js` helpers for HTTP downloads + extraction
- Register: Add to `package.json` npm scripts (prebuild, predev, etc.)

## Special Directories

**dist/**:
- Purpose: Vite build output (compiled main.js and renderer bundle)
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)
- Used by: `electron-builder` for packaging

**resources/bin/**:
- Purpose: Platform-specific native binaries bundled with app
- Generated: Yes (by download scripts during prebuild/predev)
- Committed: No (in .gitignore, re-downloaded on build)
- Unpacked: Yes (`files` in electron-builder.json specifies ASAR unpacking for FFmpeg + binaries)

**userData/**:
- Purpose: Runtime data directory (database, cache, logs, secure keys)
- Location: Platform-specific (~/Library/Application Support/OpenWhispr on macOS, %APPDATA% on Windows)
- Committed: No (user data, not source)
- Contents: transcriptions.db, .env (non-secret vars), secure-keys/, qdrant-data/, embedding-models/, logs/

**~/.cache/openwhispr/**:
- Purpose: Cached files (whisper models, embedding models, qdrant data)
- Generated: Yes (on first use)
- Committed: No
- Cleanup: User manual deletion of specific directories

---

*Structure analysis: 2026-05-07*
