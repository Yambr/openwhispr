# Architecture

**Analysis Date:** 2026-05-07

## Pattern Overview

**Overall:** Multi-layer desktop application with process isolation

**Key Characteristics:**
- Electron main/renderer/preload separation with context isolation
- Separate ONNX utility worker process for inference (text embeddings, speaker embeddings, fbank processing)
- Dual-window UI architecture (overlay dictation panel + full control panel)
- Message-based IPC bridge between processes
- React 19 with Zustand stores for state management
- TypeScript for type safety across application boundary

## Layers

**Main Process (Node.js)**:
- Purpose: Electron lifecycle, native OS integration, IPC handlers, database, file I/O, hotkey registration
- Location: `main.js` (1497 lines)
- Contains: Window management, audio device enumeration, clipboard integration, native binary spawning (whisper, parakeet, qdrant)
- Depends on: Electron, better-sqlite3, child_process, native OS APIs
- Used by: Renderer process (via IPC), ONNX worker (via parent-child process message passing)

**Preload Bridge (Node.js + Secure Context Bridge)**:
- Purpose: Expose safe IPC methods to renderer with context isolation enforced
- Location: `preload.js` (879 lines)
- Contains: `contextBridge.exposeInMainWorld("electronAPI", {...})` wrapper around ipcRenderer invokes/on/send
- Depends on: Electron contextBridge, ipcRenderer
- Used by: Renderer process (via window.electronAPI)

**Renderer Process (React + Browser APIs)**:
- Purpose: UI rendering, user interaction, audio recording via MediaRecorder API
- Location: `src/main.jsx`, `src/App.jsx`, `src/AppRouter.jsx`
- Contains: React components, hooks, stores, services, UI logic
- Depends on: React 19, react-i18next, Zustand, Vite dev server
- Used by: Main process (sends IPC), ONNX worker (receives inference results)

**ONNX Utility Worker Process (Node.js + onnxruntime-node)**:
- Purpose: Isolated inference for text embeddings (all-MiniLM-L6-v2), speaker embeddings (3D-Speaker-mini), fbank processing
- Location: `src/workers/onnxWorker.js`
- Spawning: `src/helpers/onnxWorkerClient.js` → lazy spawn on first use (warmup)
- Lifecycle: Spawned with `detached: process.platform !== "win32"` (own process group on Unix), killed on app quit via `sidecarReaper.js`
- Contains: ONNX Runtime session setup, mel filterbank computation, text tokenization, model inference
- Depends on: onnxruntime-node (native binding), child_process parent message passing
- Used by: Main process (via message port for text embedding requests)

## Data Flow

**Audio Recording → Transcription → Processing → Storage**:

1. User presses hotkey → `useHotkey` hook in `App.jsx` fires
2. `useAudioRecording` hook (calls `AudioManager`) → MediaRecorder starts capturing audio chunks
3. User releases hotkey → AudioManager stops recording, creates Blob from chunks
4. Blob → ArrayBuffer → sent via IPC `transcribe-audio` to main process
5. Main process writes to temporary WAV file
6. Main process invokes transcription provider:
   - Local whisper.cpp: spawned binary, file input
   - Cloud OpenAI: fetch request with file multipart
   - Parakeet/sherpa-onnx: spawned binary server
   - Streaming (DeepGram/AssemblyAI): WebSocket connection in main process
7. Transcription result → sent back via IPC to renderer
8. Renderer passes raw text to reasoning service (cleanup or agent)
9. Reasoning result → clipboard paste via `audioManager.copyToClipboard()` (invokes `paste-text` IPC)
10. Transcription saved to SQLite via `saveTranscription` IPC

**Settings/State Management**:

1. UI changes setting in SettingsPage component
2. `useSettings` hook updates Zustand `settingsStore`
3. `settingsStore` reads/writes localStorage (+ IPC for secret keys)
4. ReasoningService reads from `settingsStore` at invocation time
5. Secret keys (API_KEY, ANTHROPIC_API_KEY, etc.) stored via IPC `save-openai-key`, `get-anthropic-key`, etc. → encrypted in `userData/secure-keys/`
6. Non-secret env vars (`LOCAL_TRANSCRIPTION_PROVIDER`, `PARAKEET_MODEL`) persisted to `.env` via `saveAllKeysToEnvFile()`

**Notes/Semantic Search**:

1. User creates note → `saveNote` IPC → main process writes to SQLite + background vector upsert to Qdrant via `vectorIndex.js`
2. User searches → `semanticSearchNotes` IPC → main process calls Qdrant REST API + FTS5 keyword search in parallel
3. Qdrant sidecar spawned on app startup (port 6333-6350), embedding model auto-downloaded on first run
4. Search results merged via Reciprocal Rank Fusion, FTS5 fallback if Qdrant unavailable

## Key Abstractions

**AudioManager (`src/helpers/audioManager.js`)**:
- Purpose: Unified audio recording + processing orchestration
- Abstracts: MediaRecorder API, transcription APIs (local/cloud/streaming), reasoning service, clipboard paste
- Pattern: Single instance per renderer process, methods for startRecording/stopRecording/transcribeAudio
- State: isRecording, isProcessing, isStreaming (booleans), transcript/partialTranscript (strings)

**Zustand Stores (`src/stores/*Store.ts`)**:
- Purpose: Centralized application state with localStorage persistence
- Key stores:
  - `settingsStore`: All user preferences (transcription, reasoning, hotkeys, API keys, theme)
  - `transcriptionStore`: Recording session state
  - `noteStore`: Notes CRUD and search results
  - `chatStore`: AI chat conversation history
  - `streamingProvidersStore`: Active streaming provider state (DeepGram, AssemblyAI, OpenAI Realtime)

**ReasoningService (`src/services/ReasoningService.ts`)**:
- Purpose: AI processing for cleanup, formatting, and agent-addressed commands
- Pattern: Singleton service with static methods for streamText, calculateMaxTokens, getSystemPrompt
- Supports: 8 inference providers (OpenAI, Anthropic, Gemini, Groq, local LLM via llama.cpp, enterprise, LAN, OpenWhispr cloud)
- Integrates: Tool system for note search, action execution, diarization

**IPC Handler Registry (`src/helpers/ipcHandlers.js`)**:
- Purpose: Centralized registration of all ipcMain.handle/on/send listeners
- Pattern: Main process registers handlers at startup, renderer invokes via window.electronAPI methods
- Key handlers: db-*, transcribe-audio, save-transcription, cloud-reason, paste-text, hotkey-*, window-*

**Window Manager (`src/helpers/windowManager.js`)**:
- Purpose: Create and manage Electron BrowserWindow instances
- Pattern: createDictationWindow, createControlPanelWindow, createAgentPanelWindow
- Features: Always-on-top overlay, preload script injection, URL-based routing (window.location.pathname)

## Entry Points

**Electron Main Process**:
- Location: `/Users/ngyambroskin/Documents/openwhispr/main.js`
- Triggers: `npm start` or `npm run dev` (spawned by Vite via `run-electron.js`)
- Responsibilities: Initialize app, register hotkeys, create windows, set up IPC handlers, spawn sidecars (whisper, qdrant)

**React Renderer Entry**:
- Location: `src/main.jsx` (renders to `root` DOM element)
- Imports: `src/App.jsx`, `src/AppRouter.jsx`, global CSS
- Responsibilities: Bootstrap React, context providers (I18nextProvider, SettingsProvider, ToastProvider)

**URL-Based Routing**:
- `main.html?panel=true` or `main.html?panel=true` → ControlPanel + OnboardingFlow (full settings)
- `main.html?agent=true` → AgentOverlay (AI chat window)
- `main.html` (default) → App.jsx (dictation overlay)
- Meeting/update/transcription preview: query params determine which overlay to show

## Error Handling

**Strategy:** Try → fallback → error toast + logging

**Patterns**:
- Transcription: local whisper → fallback to cloud OpenAI if local disabled
- Clipboard: native XTest (Linux) → xdotool (X11) → wtype (Wayland) → PowerShell (Windows) → manual copy fallback
- Hotkey registration: Windows native key listener → Electron globalShortcut → GNOME shortcuts (Wayland) → Hyprland shortcuts → UI message
- Meeting detection: Event-driven (macOS subscriptions, Windows WASAPI, Linux pactl) → polling fallback
- Vector search: Qdrant semantic → FTS5 keyword fallback
- Reasoning: Cloud model → local LLM → skip if unavailable

**Key Files**:
- `src/helpers/recordingErrors.ts` — Error classification by provider/status
- `src/utils/retry.ts` — Retry strategy with exponential backoff
- `src/helpers/networkErrors.ts` — Network error classification and handling
- Error boundaries: `src/components/ErrorBoundary.tsx`

## Cross-Cutting Concerns

**Logging:** 
- Frontend: `src/utils/logger.ts` (logs to console + optionally localStorage)
- Backend: `src/helpers/debugLogger.js` (writes to app data directory + console)
- Streaming: Stage-based logging (AUDIO_RECORD, TRANSCRIPTION_RECEIVED, REASONING_STARTED, etc.)
- Enable with `--log-level=debug` or `OPENWHISPR_LOG_LEVEL=debug`

**Validation:**
- Settings: Type-safe via TypeScript interfaces (`TranscriptionSettings`, `CleanupSettings`, etc. in `src/hooks/useSettings.ts`)
- IPC arguments: Validated in main.js before processing (file paths, API keys, database IDs)
- Models: Registry validation in `src/models/ModelRegistry.ts` (checks provider/model pairs exist)

**Authentication:**
- OAuth flow: Custom protocol handler (openwhispr://) → sign-in window → token stored in secure keychain
- API keys: 12 secret keys encrypted at rest via `safeStorage` (OS keychain on macOS/Windows, libsecret on Linux, plaintext fallback)
- Session refresh: `src/lib/auth.ts` — withSessionRefresh() wrapper for API calls with token refresh

**Internationalization:**
- Framework: react-i18next v15, i18next v25
- Strings: `src/locales/{lang}/translation.json` for 10 languages
- Usage: `const { t } = useTranslation()` hook in components
- Key groups: notes.*, chat.*, settings.*, hotkeys.*, errors.*

**Performance**:
- Code splitting: React.lazy() for ControlPanel, OnboardingFlow, AgentOverlay
- Memoization: useMemo/useCallback in hooks to prevent re-renders
- IPC batching: Multiple setting updates debounced before IPC
- Process pooling: ONNX worker spawned once, reused for all embedding requests
- Audio chunking: Cloud uploads split into 4MB chunks for large files

**Security**:
- Context isolation: Renderer cannot access Node.js APIs directly
- Preload: Limited surface area (database methods, window control, audio, clipboard)
- File paths: Sanitized before passing to fs.* operations
- API keys: Never logged, encrypted at rest, only loaded into process.env at startup
- CORS: No remote code execution, all API requests go through main process or Vite dev proxy
