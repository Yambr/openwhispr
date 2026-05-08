# Application Architecture

This document describes the internal architecture of OpenWhispr for external implementers and OSS contributors who need to understand the system without reading every line of source code. Each topic follows the same pattern: a block diagram, 1–2 paragraphs of explanation, and a list of key source files with `file:line` citations. For the wire-level contract between the desktop client and the OpenWhispr cloud backend, see `docs/BACKEND_SPEC.md`. For the OAuth provider catalog, see `docs/OAUTH_SPEC.md`. For third-party deployment instructions, see `docs/SELF_HOSTING.md`.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Process Model](#process-model)
3. [IPC Surface](#ipc-surface)
4. [Secret Storage](#secret-storage)
5. [Model Registry](#model-registry)
6. [Transcription Pipeline](#transcription-pipeline)
7. [Embeddings Pipeline](#embeddings-pipeline)
8. [Sidecar Binaries](#sidecar-binaries)
9. [Further Reading](#further-reading)

---

## Tech Stack

OpenWhispr is built on a pinned set of core technologies. These are not aspirational — they are exact versions locked in `package.json` and `.nvmrc`:

| Layer | Technology | Version |
|-------|------------|---------|
| Desktop runtime | Electron | 41.2.0 |
| UI framework | React | 19.1.0 |
| Build tool | Vite | 8.0.7 |
| Language | TypeScript | 6.0.2 |
| Node.js | (pinned in `.nvmrc`) | 24 |
| Local database | better-sqlite3 | 12.8.0 |
| State management | Zustand | 5.0.11 |
| Rich text editing | Tiptap | 3.22.3 |
| Auth system | better-auth | 1.6.9 |
| ONNX inference | onnxruntime-node | 1.21.0 |
| Vector database client | @qdrant/js-client-rest | 1.12.0 |
| AI SDK (multi-provider) | ai (Vercel AI SDK) | 6.0.116 |

Node.js version 24 is strictly required. Running `npm install` with a different major version produces an incompatible lockfile that breaks CI (`npm ci`). Use `nvm exec 24 npm install` if your local version differs.

---

## Process Model

OpenWhispr runs as four distinct OS processes at runtime:

```
+---------------------------+        +-----------------------------+
|      Main Process         |        |     ONNX Utility Worker     |
|  main.js                  |<======>|  src/workers/onnxWorker.js  |
|  - Electron app lifecycle |  msg   |  - text embeddings          |
|  - IPC handler registry   | channel|  - speaker embeddings       |
|  - SQLite DB access       |        |  - fbank processing         |
|  - sidecar spawning       |        |  (lazy-spawned, isolated)   |
|  - hotkey registration    |        +-----------------------------+
|  - file I/O               |
+----------+----------------+
           |  contextBridge
           |  (Electron IPC)
+----------v----------------+
|      Preload Script       |
|  preload.js               |
|  contextBridge.           |
|  exposeInMainWorld(       |
|    "electronAPI", {...})  |
+----------+----------------+
           |  window.electronAPI
+----------v----------------+
|   Renderer Process(es)    |
|  src/main.jsx             |
|  src/AppRouter.jsx        |
|  React 19 + Zustand       |
|  URL-based window routing |
+---------------------------+
```

**Main process** (`main.js:1`) is the Electron lifecycle owner. It registers all IPC handlers via `src/helpers/ipcHandlers.js:1`, owns the SQLite database (`src/helpers/database.js:1`), spawns sidecar binaries (whisper-server, qdrant, etc.), registers global hotkeys, and performs all file I/O. It cannot be accessed directly by the renderer — communication flows exclusively through the preload bridge.

**Renderer process** runs the React application. There may be up to three renderer windows open simultaneously, each loading the same HTML entry point (`main.html`) but distinguished by URL query parameters: `?panel=true` loads `ControlPanel` (full settings), `?agent=true` loads `AgentOverlay` (AI chat), and the default loads `App.jsx` (dictation overlay). Context isolation is enabled — the renderer has no direct access to Node.js APIs. Entry point: `src/main.jsx:1`, router: `src/AppRouter.jsx:1`.

**Preload script** (`preload.js:1`) is the only bridge. It calls `contextBridge.exposeInMainWorld("electronAPI", {...})` at `preload.js:25`, wrapping every `ipcRenderer.invoke` and `ipcRenderer.on` call behind a named method. The renderer accesses IPC exclusively through `window.electronAPI`. This is the authoritative surface — nothing else is exposed.

**ONNX utility worker** (`src/workers/onnxWorker.js:1`) runs as a separate OS process spawned lazily by `src/helpers/onnxWorkerClient.js:1` on first use. It hosts all `onnxruntime-node` inference: text embeddings (all-MiniLM-L6-v2), speaker embeddings, and mel filterbank computation. Isolating ORT in a worker means native crashes (e.g., `bad_alloc` from large models) do not kill the main process. The client (`src/helpers/onnxWorkerClient.js:7`) implements respawn backoff: `[1000, 2000, 4000, 8000, 16000, 30000]` ms with a maximum of 5 attempts. The worker is stopped in `will-quit` via `sidecarRegistry.shutdownAll()`.

Key files:
- `main.js:1` — Electron main process entry, sidecar spawn, hotkey registration
- `preload.js:1` — `contextBridge` bridge; authoritative IPC method list
- `src/main.jsx:1` — React bootstrap (I18nextProvider, SettingsProvider, ToastProvider)
- `src/AppRouter.jsx:1` — URL-query-param window routing
- `src/workers/onnxWorker.js:1` — ONNX Runtime session setup, inference
- `src/helpers/onnxWorkerClient.js:1` — lazy spawn, respawn backoff, request queue

---

## IPC Surface

The IPC surface is large (~150+ channels). Rather than an exhaustive table that drifts on every PR, this section groups channels by domain prefix with a contract summary per category. **For the authoritative full list of channels, see `preload.js`.** All channels use kebab-case domain-prefixed naming as defined in `src/helpers/ipcHandlers.js:1` (convention: `CLAUDE.md §IPC Patterns`).

### `db-*` — Database operations

Write and read all persistent data: transcriptions, notes, folders, actions, agent conversations, and sync metadata.

| Example channel | Args | Return |
|-----------------|------|--------|
| `db-save-transcription` | `(text: string, rawText: string, options: object)` | `{ id: number }` |
| `db-get-notes` | `(noteType: string, limit: number, folderId: number)` | `Note[]` |
| `db-create-folder` | `(name: string)` | `{ id: number }` |
| `db-semantic-search-notes` | `(query: string, limit: number)` | `SearchResult[]` |

Semantic search (`db-semantic-search-notes`) runs parallel FTS5 + Qdrant vector queries then merges with Reciprocal Rank Fusion (`src/helpers/ipcHandlers.js:936`). FTS5 keyword search is the fallback if Qdrant is unavailable.

### `transcribe-*` — Transcription pipeline

Submit audio for processing by the active transcription engine.

| Example channel | Args | Return |
|-----------------|------|--------|
| `transcribe-audio-file` | `(filePath: string, options: object)` | `{ text: string }` |
| `transcribe-audio-file-cloud` | `(filePath: string)` | `{ text: string }` |
| `transcribe-audio-file-byok` | `(options: object)` | `{ text: string }` |

### `get-*-key` / `save-*-key` — Secret storage

Read and write user-provided API keys. Each key has its own named channel pair. Keys are encrypted at rest (see [Secret Storage](#secret-storage)).

| Example channel | Args | Return |
|-----------------|------|--------|
| `get-openai-key` | — | `string` |
| `save-openai-key` | `(key: string)` | `void` |
| `get-anthropic-key` | — | `string` |
| `save-anthropic-key` | `(key: string)` | `void` |
| `get-bedrock-access-key-id` | — | `string` |

Full list of get/save pairs mirrors the 14 `SECRET_KEYS` listed in `src/helpers/environment.js:9`. Channel names are in `preload.js:185-400` (approximately).

### `window-*` — Window control

Manage Electron `BrowserWindow` state from the renderer.

| Example channel | Args | Return |
|-----------------|------|--------|
| `window-minimize` | — | `void` |
| `window-maximize` | — | `void` |
| `window-close` | — | `void` |
| `window-is-maximized` | — | `boolean` |

### `hotkey-*` / `update-hotkey` — Hotkey management

Register, update, and inspect global hotkeys. Platform-specific paths exist for GNOME Wayland and Hyprland.

| Example channel | Args | Return |
|-----------------|------|--------|
| `update-hotkey` | `(hotkey: string)` | `void` |
| `get-hotkey-mode-info` | — | `{ isUsingGnome, isUsingHyprland, isUsingNativeShortcut }` |
| `register-cancel-hotkey` | `(key: string)` | `void` |

Push events: `hotkey-fallback-used` and `hotkey-registration-failed` are pushed from the main process via `ipcRenderer.on` listeners registered in `preload.js:618-624`.

### `meeting-*` — Meeting detection

Control meeting detection preferences and respond to meeting notifications.

| Example channel | Args | Return |
|-----------------|------|--------|
| `meeting-detection-get-preferences` | — | `MeetingPreferences` |
| `meeting-detection-set-preferences` | `(prefs: object)` | `void` |
| `meeting-notification-respond` | `(detectionId: string, action: string)` | `void` |

### `cloud-*` — Cloud reasoning passthrough

Anthropic API calls are proxied through the main process to avoid CORS restrictions in the renderer. OpenAI and Gemini calls go directly from the renderer process.

| Example channel | Args | Return |
|-----------------|------|--------|
| `cloud-reason` | `(text: string, opts: object)` | `{ result: string }` |

Streaming agent responses use `cloud-agent-stream-start` (send, not invoke) with separate `cloud-agent-stream-chunk` / `cloud-agent-stream-end` push events. See `preload.js:720-732` for the full streaming IPC contract.

### `gcal-*` — Google Calendar

OAuth flow, calendar selection, and event sync.

| Example channel | Args | Return |
|-----------------|------|--------|
| `gcal-start-oauth` | — | `void` |
| `gcal-get-connection-status` | — | `{ connected: boolean }` |
| `gcal-get-upcoming-events` | `(windowMinutes: number)` | `CalendarEvent[]` |

### Other notable channels

- `paste-text` — cross-platform clipboard paste via `src/helpers/clipboard.js:1`
- `hide-window` / `show-dictation-panel` — overlay window visibility
- `select-audio-file` / `get-file-size` — file dialog and metadata
- `acquire-recording-lock` / `release-recording-lock` — prevents overlapping recording pipelines
- `agent-web-search` — web search tool for the AI agent
- `get-update-notification-data` / `update-notification-respond` — auto-update flow

---

## Secret Storage

All user-provided API keys and enterprise credentials are treated as runtime secrets. They are never embedded in the binary and never stored in plaintext on disk (except on Linux without a system keyring — see below).

### The 14 SECRET_KEYS

Defined in `src/helpers/environment.js:9`:

```
OPENAI_API_KEY             — OpenAI BYOK
ANTHROPIC_API_KEY          — Anthropic BYOK
GEMINI_API_KEY             — Google Gemini BYOK
GROQ_API_KEY               — Groq BYOK
MISTRAL_API_KEY            — Mistral BYOK
ASSEMBLYAI_API_KEY         — AssemblyAI BYOK transcription
DEEPGRAM_API_KEY           — Deepgram BYOK transcription
CUSTOM_TRANSCRIPTION_API_KEY — Custom OpenAI-compatible transcription endpoint
CUSTOM_CLEANUP_API_KEY     — Custom cleanup LLM endpoint
BEDROCK_ACCESS_KEY_ID      — AWS Bedrock enterprise
BEDROCK_SECRET_ACCESS_KEY  — AWS Bedrock enterprise
BEDROCK_SESSION_TOKEN      — AWS Bedrock enterprise (optional STS)
AZURE_OPENAI_API_KEY       — Azure OpenAI enterprise
VERTEX_API_KEY             — Google Vertex AI enterprise
```

Note: `CLAUDE.md` describes this as 12 keys, but the current source at `src/helpers/environment.js:9-24` defines 14 entries.

### Encryption mechanism

Each key is stored as an individual encrypted file at `userData/secure-keys/{KEY_NAME}.enc`. The file contains an AES-256-GCM encrypted blob. The master key used for encryption is stored in the OS keychain via `@napi-rs/keyring` (service: `"OpenWhispr"`, account: `"secrets-master-key"`) — see `src/helpers/secretCrypto.js:5-10`.

OS keychain backing by platform:
- **macOS**: Keychain (via `@napi-rs/keyring` → libsecret / Security.framework)
- **Windows**: DPAPI (via `@napi-rs/keyring` → Windows Credential Manager)
- **Linux**: libsecret (via `@napi-rs/keyring`) when a keyring daemon (GNOME Keyring, KWallet) is available

**Linux plaintext fallback**: On Linux without a running keyring daemon, `@napi-rs/keyring` fails to load or store the master key. In this case `src/helpers/secretCrypto.js` logs a warning and the encrypted files are effectively unreadable across sessions. Electron's `safeStorage` is used as a secondary check (`src/helpers/secretCrypto.js:2`). This is a known limitation on headless or minimal Linux setups.

### Startup loading

At app launch, `EnvironmentManager.init()` calls `_loadAllSecrets()` (`src/helpers/environment.js:127`), which iterates `SECRET_KEYS` and decrypts each file into `process.env[KEY_NAME]`. The renderer never reads `process.env` directly — it requests keys via IPC (`get-{key-name}`) and writes via debounced IPC (`save-{key-name}`). See `preload.js:185-400` for the per-key channel pairs.

### Build-time env vars are NEVER for secret material

As stated in the project's core constraint (see `docs/SELF_HOSTING.md` §Constraints): build-time environment variables (`OPENWHISPR_*`, `VITE_*`) are for *defaults and endpoints only*. User-provided API keys and credentials remain runtime-only, encrypted at rest via `safeStorage`. Phase 3 introduces build-time configuration for URLs and OAuth client IDs — none of those variables will ever carry secret key material.

---

## Model Registry

All AI model definitions are centralized in a single JSON file that serves as the single source of truth for both the UI and runtime routing.

```
src/models/modelRegistryData.json
        |
        +---> src/models/ModelRegistry.ts          (TypeScript wrapper + helpers)
        |
        +---> src/config/aiProvidersConfig.ts       (derives AI_MODES)
        |
        +---> src/utils/languages.ts                (derives REASONING_PROVIDERS)
```

`src/models/modelRegistryData.json:1` contains top-level keys: `parakeetModels`, `diarizationModels`, `whisperModels`, and cloud provider model lists. For local GGUF models (llama.cpp), each entry includes `hfRepo` (HuggingFace repository) and `promptTemplate` (chat format: ChatML / Llama / Mistral). Download URLs are constructed as `{baseUrl}/{hfRepo}/resolve/main/{fileName}`.

`src/models/ModelRegistry.ts:1` provides TypeScript helper methods for filtering models by provider, capability, and platform. Registry validation in this file checks that provider/model pairs exist before routing inference requests.

### Inference providers

Eight inference providers implement the `InferenceProvider` interface from `src/services/ai/inferenceProviders/types.ts:1`. They are registered in `src/services/ai/inferenceProviders/index.ts:11`:

| Provider key | Backend |
|---|---|
| `openai` | OpenAI Responses API |
| `anthropic` | Anthropic Messages API (via IPC bridge) |
| `gemini` | Google Gemini API (direct from renderer) |
| `groq` | Groq inference platform |
| `local` | llama.cpp local server |
| `enterprise` | AWS Bedrock / Azure OpenAI / GCP Vertex (shared adapter) |
| `openwhispr` | OpenWhispr cloud reasoning pass-through |
| `lan` | LAN-hosted OpenAI-compatible server |

### Inference scopes

Four named scopes map to independent LLM configuration in `src/config/inferenceScopes.ts:19`:

| Scope | Purpose |
|---|---|
| `dictationCleanup` | Post-transcription text cleanup and formatting |
| `dictationAgent` | Agent-addressed commands ("Hey [AgentName], ...") |
| `noteFormatting` | Note structure and Markdown formatting |
| `chatIntelligence` | AI chat panel responses |

Each scope has its own `provider`, `model`, `mode`, and optional `cloudBaseUrl` keys in the Zustand settings store. `selectResolvedLLMConfig(state, scope)` in `src/stores/settingsStore.ts` resolves the active config for a scope with fallback chains (e.g., `noteFormatting` falls back to `dictationCleanup`).

---

## Transcription Pipeline

OpenWhispr supports three transcription engines selectable per-session: local whisper.cpp, NVIDIA Parakeet (via sherpa-onnx), and cloud OpenAI Whisper API.

```
[Microphone]
     |
     v MediaRecorder API (renderer)
[Audio Blob]
     |
     v ArrayBuffer via IPC ("transcribe-audio" or recorded blob sent over IPC)
[Main Process]
     |
     v Write to temp file (FFmpeg conversion if needed)
[Temp audio file]
     |
     +--[LOCAL_TRANSCRIPTION_PROVIDER=whisper]--> whisper-server HTTP API
     |                                             src/helpers/whisperServer.js
     |
     +--[LOCAL_TRANSCRIPTION_PROVIDER=nvidia]---> sherpa-onnx WebSocket API
     |                                             src/helpers/parakeetServer.js
     |
     +--[cloud / BYOK / custom endpoint]---------> OpenAI Whisper-compatible API
                                                    src/helpers/audioManager.js
     |
     v Transcription result text
[IPC back to renderer]
     |
     v Optional: ReasoningService (cleanup / agent processing)
[Final text to clipboard]
     |
     v Temp file deleted
```

**whisper.cpp path**: `src/helpers/whisperServer.js:1` sends audio to a locally-running `whisper-server` HTTP server (sidecar — see [Sidecar Binaries](#sidecar-binaries)). The server binary is located at `resources/bin/whisper-server-{platform}-{arch}`. GGML model files are stored in `~/.cache/openwhispr/whisper-models/`. The custom dictionary is passed as the `prompt` parameter in the multipart form request (`src/helpers/whisperServer.js:499-506`), which biases the Whisper decoder toward user-specified vocabulary.

**Parakeet path**: `src/helpers/parakeetServer.js:1` wraps the sherpa-onnx CLI binary (`resources/bin/sherpa-onnx-{platform}-{arch}`). Parakeet models are stored in `~/.cache/openwhispr/parakeet-models/`. `src/helpers/parakeet.js:1` manages model lifecycle and server pre-warming on startup when `LOCAL_TRANSCRIPTION_PROVIDER=nvidia`. Two models are available (see `src/models/modelRegistryData.json:3`):
- `parakeet-tdt-0.6b-v3` — multilingual, ~680 MB
- `parakeet-unified-en-0.6b` — English-only, ~631 MB, 5.91% avg WER

**Cloud path**: Audio is sent directly from the renderer to the configured OpenAI-compatible Whisper endpoint. BYOK uses `src/helpers/audioManager.js:441` to select the active engine. Provider preference (`LOCAL_TRANSCRIPTION_PROVIDER`, `PARAKEET_MODEL`) is persisted to `.env` via `saveAllKeysToEnvFile()`.

**Audio pipeline**: MediaRecorder produces Blob chunks → converted to ArrayBuffer → sent over IPC (10 MB limit) → written to temp file by main process → processed → temp file deleted after result is returned. FFmpeg (bundled via `ffmpeg-static`, unpacked from ASAR) handles audio format normalization.

Key files:
- `src/helpers/audioManager.js:1` — main recording orchestrator (2800 lines); engine selection, custom dictionary
- `src/helpers/whisperServer.js:1` — whisper-server HTTP client, custom dictionary prompt injection
- `src/helpers/parakeet.js:1` — Parakeet model management, server pre-warm
- `src/helpers/parakeetServer.js:1` — sherpa-onnx CLI wrapper
- `src/helpers/whisper.js:1` — whisper.cpp binary detection and model download

---

## Embeddings Pipeline

Local semantic search gives the AI agent the ability to find notes by meaning, not just keywords. It runs entirely offline using a Qdrant vector database sidecar and the all-MiniLM-L6-v2 embedding model.

```
[Note create / update / delete]
        |
        v SQLite write (synchronous)
[transcriptions.db / notes table]
        |
        v _asyncVectorUpsert() / _asyncVectorDelete() (background, non-blocking)
        |
        v Embed text via ONNX worker (384-dim float vector)
[src/helpers/localEmbeddings.js:1]   <-- calls onnxWorkerClient
        |
        v Upsert / delete vector in Qdrant collection "notes"
[src/helpers/vectorIndex.js:1]       <-- QdrantClient on port 6333-6350
        |
[Qdrant sidecar process]             <-- src/helpers/qdrantManager.js:1
```

**Agent search flow**:

```
[Agent tool: search_notes]
        |
        v IPC: db-semantic-search-notes  (src/helpers/ipcHandlers.js:921)
        |
        +--[Qdrant available]--> FTS5 keyword search + Qdrant vector search (parallel)
        |                        Filter Qdrant results: cosine score >= 0.3
        |                        Reciprocal Rank Fusion, K=60  (ipcHandlers.js:936)
        |                        Return merged ranked results
        |
        +--[Qdrant unavailable]-> FTS5 keyword search only (fallback)
```

**Fallback chain** in `src/services/tools/searchNotesTool.ts:37`:
1. Cloud notes search (if user is signed in to OpenWhispr cloud)
2. Local semantic search via `db-semantic-search-notes` IPC
3. FTS5 keyword search (always available, never fails)

**Components**:
- `src/helpers/localEmbeddings.js:1` — loads all-MiniLM-L6-v2 ONNX model via `onnxWorkerClient`; `embedText(text)` returns a `Float32Array` of 384 dimensions
- `src/helpers/qdrantManager.js:1` — spawns the Qdrant binary, polls for readiness on port 6333–6350 (`qdrantManager.js:6-7`), runs health checks every 5s
- `src/helpers/vectorIndex.js:1` — `upsertNote(id, text)`, `deleteNote(id)`, `searchNotes(query, limit)`, `ensureCollection()` using `@qdrant/js-client-rest`

**Storage locations**:
- Qdrant data: `~/.cache/openwhispr/qdrant-data/` (`src/helpers/qdrantManager.js:21`)
- Embedding model: `~/.cache/openwhispr/embedding-models/all-MiniLM-L6-v2/model.onnx` (`src/helpers/localEmbeddings.js:7`)

**Startup**: Qdrant binary starts automatically on app launch. The embedding model downloads automatically on first use (~22 MB from HuggingFace). Manual download: `npm run download:qdrant` and `npm run download:embedding-model`.

---

## Sidecar Binaries

OpenWhispr spawns several external native processes ("sidecars") to offload transcription, vector search, and platform-specific input handling. All sidecars share a unified lifecycle pattern.

### Unified lifecycle pattern

```
[Spawn sidecar]
    |
    v sidecarPidFile.write(name, child.pid)   -- src/helpers/sidecarPidFile.js:15
    |
    v process runs...
    |
    v sidecarPidFile.clear(name)              -- on 'close' event  (sidecarPidFile.js:25)
    |
[App quit: will-quit event]
    |
    v sidecarRegistry.shutdownAll()           -- src/helpers/sidecarRegistry.js:11
       calls each registered stop() function
       (8s deadline for graceful shutdown)
```

Each sidecar is registered at startup:
```javascript
sidecarRegistry.register(name, () => manager.stop());   // src/helpers/sidecarRegistry.js:7
```

On the next app launch, `reapStaleSidecars()` (`src/helpers/sidecarReaper.js:42`) reads all `.pid` files from `userData/sidecar-pids/`, checks if the process is still alive with the expected binary name in its command, and sends `SIGTERM` if so. The `EXPECTED_BINARY_FRAGMENTS` map at `src/helpers/sidecarReaper.js:5` defines the name-to-fragment mapping.

Spawning convention: `detached: process.platform !== "win32"` gives Unix sidecars their own process group so `SIGTERM` propagates to child processes.

### Sidecar inventory

#### whisper-server

| Field | Value |
|-------|-------|
| Binary | `resources/bin/whisper-server-{platform}-{arch}` |
| Downloader | `scripts/download-whisper-cpp.js` |
| Start trigger | App launch (lazy: first transcription request) |
| Reaper fragment | `"whisper-server"` (`sidecarReaper.js:8`) |
| Manager | `src/helpers/whisperServer.js:1` |

Local Whisper model files (GGML format) live in `~/.cache/openwhispr/whisper-models/`. Models: tiny (75 MB) through large (3 GB) and turbo (1.6 GB).

#### llama-server

| Field | Value |
|-------|-------|
| Binary | `resources/bin/llama-server-{platform}-{arch}` |
| Downloader | `scripts/download-llama-server.js` |
| Start trigger | User selects "Local LLM" in settings; first inference request |
| Reaper fragment | `"llama-server"` (`sidecarReaper.js:9`) |
| Manager | `src/helpers/modelManagerBridge.js:1` |

Serves GGUF models via an OpenAI-compatible HTTP API at a local port. Supports GPU acceleration (CUDA, Vulkan, Metal) when `LLAMA_GPU_BACKEND` is set.

#### sherpa-onnx (Parakeet)

| Field | Value |
|-------|-------|
| Binary | `resources/bin/sherpa-onnx-{platform}-{arch}` |
| Downloader | `scripts/download-sherpa-onnx.js` |
| Start trigger | `LOCAL_TRANSCRIPTION_PROVIDER=nvidia` on startup (pre-warm) |
| Reaper fragment | `"sherpa-onnx-ws"` (`sidecarReaper.js:6`) |
| Manager | `src/helpers/parakeetServer.js:1` |

Runs a WebSocket inference server for NVIDIA Parakeet models. INT8-quantized ONNX models stored in `~/.cache/openwhispr/parakeet-models/`.

#### qdrant

| Field | Value |
|-------|-------|
| Binary | `resources/bin/qdrant-{platform}-{arch}` |
| Downloader | `scripts/download-qdrant.js` |
| Start trigger | App launch (always-on) |
| Reaper fragment | `"qdrant"` (`sidecarReaper.js:10`) |
| Manager | `src/helpers/qdrantManager.js:1` |
| Port range | 6333–6350 (first available) |

Vector database for local semantic search. Data persisted to `~/.cache/openwhispr/qdrant-data/`. If unavailable, the embeddings pipeline gracefully degrades to FTS5 keyword search.

#### diarization (sherpa-onnx-diarize)

| Field | Value |
|-------|-------|
| Binary | `resources/bin/sherpa-onnx-diarize-{platform}-{arch}` |
| Reaper fragment | `"sherpa-onnx-diarize"` (`sidecarReaper.js:11`) |
| Purpose | Speaker diarization for meeting transcription (Pyannote + CAM++ models) |

#### ONNX utility worker

| Field | Value |
|-------|-------|
| Script | `src/workers/onnxWorker.js` (not in `resources/bin/`) |
| Spawner | `src/helpers/onnxWorkerClient.js:1` via Electron `utilityProcess` |
| Start trigger | Lazy on first embedding or diarization request |
| Reaper | Stopped via `sidecarRegistry` in `will-quit` |

This is not a binary sidecar — it is a Node.js utility process. Crashes are isolated; the client respawns with backoff (see [Process Model](#process-model)).

#### Platform-specific listeners

| Binary | Platform | Purpose | Source / Downloader |
|--------|----------|---------|-------------------|
| `windows-key-listener.exe` | Windows | Low-level keyboard hook (Push-to-Talk) | `scripts/download-windows-key-listener.js` |
| `windows-mic-listener.exe` | Windows | WASAPI mic session monitor (meeting detection) | `scripts/download-windows-mic-listener.js` |
| `macos-mic-listener` | macOS | CoreAudio property listener (meeting detection) | Compiled from `resources/macos-mic-listener.swift` via `scripts/build-macos-mic-listener.js` |
| `macos-globe-listener` | macOS | Globe/Fn key detection for hotkey | Compiled from `resources/globe-listener.swift` via `scripts/build-globe-listener.js` |
| `linux-fast-paste` | Linux | XTest-based clipboard paste | Compiled from C source during build |

All listeners are managed through their respective helper modules (`src/helpers/windowsKeyManager.js`, `src/helpers/audioActivityDetector.js`, etc.) and registered with `sidecarRegistry` for clean shutdown.

Key lifecycle files:
- `src/helpers/sidecarReaper.js:1` — stale pid reaping on startup; `EXPECTED_BINARY_FRAGMENTS` at `:5`
- `src/helpers/sidecarRegistry.js:1` — registration and coordinated shutdown
- `src/helpers/sidecarPidFile.js:1` — per-sidecar PID file write/clear/readAll in `userData/sidecar-pids/`

---

## Further Reading

| Document | Contents |
|----------|----------|
| `docs/BACKEND_SPEC.md` | Wire-level contract: 19 endpoint cards with method, URL, auth, request/response shapes, and error deviations. The source of truth for implementing a compatible backend. |
| `docs/OAUTH_SPEC.md` | OAuth provider catalog: Google Calendar OAuth flow (Authorization/Token/Refresh/Revoke/Scopes/Redirect/ClientID/Storage/IPC/SourceFiles) and the OpenWhispr cloud sign-in shim. |
| `docs/SELF_HOSTING.md` | Third-party deployment walkthrough: must-implement endpoints, environment variable reference, build and sign instructions. |
| `docs/CONFIG_INVENTORY.md` | Every hardcoded backend URL, OAuth client ID, enterprise endpoint, and default model registry override in the source tree — each with `file:line`, current value, proposed `OPENWHISPR_*` env-var name, and category. The input for Phase 3's build-time configurability refactor. |
