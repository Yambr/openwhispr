# External Integrations

**Analysis Date:** 2026-05-07

## APIs & External Services

### Cloud AI Providers

**OpenAI:**
- **Chat API:** `https://api.openai.com/v1/responses` (Responses API for GPT-5 series)
- **Fallback:** `https://api.openai.com/v1/chat/completions` (Chat Completions for older models)
- **Models:** GPT-5.5, GPT-5.2, GPT-5 Mini, GPT-5 Nano, GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano
- **Transcription:** Whisper-1, GPT-4o Transcribe, GPT-4o Mini Transcribe
- **Auth:** API key via `OPENAI_API_KEY` env var
- **Client:** @ai-sdk/openai 3.0.41, Vercel AI SDK
- **Implementation:** `src/services/ai/inferenceProviders/openai.ts`, `src/services/ai/openaiBase.ts`
- **Custom Endpoints:** Supports OpenAI-compatible endpoints (llama.cpp, LiteLLM) via `cleanupRemoteUrl` setting
- **Endpoint Detection:** Auto-probes `/v1/models` to detect llama.cpp vs OpenAI API endpoint type

**Anthropic:**
- **API:** `https://api.anthropic.com/v1/messages`
- **Version:** 2023-06-01
- **Models:** Claude Opus 4.7, Claude Opus 4.6, Claude Sonnet 4.6, Claude Sonnet 4.5, Claude Haiku 4.5, Claude Opus 4.5
- **Auth:** API key via `ANTHROPIC_API_KEY` env var
- **Client:** @ai-sdk/anthropic 3.0.58
- **Implementation:** `src/services/ai/inferenceProviders/anthropic.ts`
- **Route:** Through IPC handler (`ipcHandlers.js`) to avoid renderer CORS issues

**Google Gemini:**
- **API:** `https://generativelanguage.googleapis.com/v1beta`
- **Models:** Gemini 3.1 Pro, Gemini 3 Flash, Gemini 2.5 Flash Lite
- **Auth:** API key via `GEMINI_API_KEY` env var
- **Client:** @ai-sdk/google 3.0.43
- **Implementation:** `src/services/ai/inferenceProviders/gemini.ts`

**Groq:**
- **API Base:** `https://api.groq.com/openai/v1`
- **Models:** Qwen3 32B, GPT-OSS 120B, GPT-OSS 20B, LLaMA 3.3 70B, LLaMA 3.1 8B, Llama 4 Scout, Compound, Compound Mini, Kimi K2
- **Transcription:** Whisper Large v3, Whisper Large v3 Turbo
- **Auth:** API key via `GROQ_API_KEY` env var
- **Client:** @ai-sdk/groq 3.0.29
- **Implementation:** `src/services/ai/inferenceProviders/groq.ts`

**Mistral AI:**
- **Transcription API:** `https://api.mistral.ai/v1/audio/transcriptions`
- **Model:** Voxtral Mini
- **Auth:** API key via `MISTRAL_API_KEY` env var
- **IPC Handler:** `ipcHandlers.js` (multipart form-data POST)

### Enterprise Cloud Providers

**AWS Bedrock:**
- **Models:** Claude Haiku 4.5, Claude Sonnet 4.6, Claude Opus 4.7, Amazon Nova Lite
- **Auth:** 
  - Via AWS profile: `BEDROCK_PROFILE` env var + credential chain
  - Via explicit credentials: `BEDROCK_ACCESS_KEY_ID` + `BEDROCK_SECRET_ACCESS_KEY` + optional `BEDROCK_SESSION_TOKEN`
  - Region: `BEDROCK_REGION` env var (default: us-west-2)
- **Client:** @ai-sdk/amazon-bedrock 4.0.93, @aws-sdk/credential-providers 3.1029.0
- **Implementation:** `src/services/ai/inferenceProviders/enterprise.ts`

**Azure OpenAI:**
- **Auth:**
  - Endpoint: `AZURE_OPENAI_ENDPOINT` env var
  - API Key: `AZURE_OPENAI_API_KEY` env var
  - Deployment: `AZURE_OPENAI_DEPLOYMENT` env var
  - API Version: `AZURE_OPENAI_API_VERSION` env var
- **Client:** @ai-sdk/azure 3.0.53
- **Implementation:** `src/services/ai/inferenceProviders/enterprise.ts`

**GCP Vertex AI:**
- **Models:** Gemini 2.5 Flash, Gemini 2.5 Pro
- **Auth:**
  - Project ID: `VERTEX_PROJECT` env var
  - Location: `VERTEX_LOCATION` env var
  - Service Account Key: `VERTEX_API_KEY` env var
- **Client:** @ai-sdk/google-vertex 4.0.108
- **Implementation:** `src/services/ai/inferenceProviders/enterprise.ts`

### Real-time Transcription (Streaming) APIs

**OpenAI Realtime API:**
- **Endpoint:** WebSocket connection to OpenAI Realtime API
- **Auth:** `OPENAI_API_KEY`
- **Implementation:** `src/helpers/openaiRealtimeStreaming.js`
- **Usage:** `ipcHandlers.js` registers `start-realtime-transcription` channel

**AssemblyAI Realtime API:**
- **Auth:** `ASSEMBLYAI_API_KEY` env var
- **Implementation:** `src/helpers/assemblyAiStreaming.js`
- **Endpoint:** WebSocket connection
- **Usage:** Live transcription with speaker detection

**Deepgram Realtime API:**
- **Auth:** `DEEPGRAM_API_KEY` env var
- **Implementation:** `src/helpers/deepgramStreaming.js`
- **Endpoint:** WebSocket connection
- **Usage:** Live transcription option

## Data Storage

### Databases

**SQLite (Local):**
- **Client:** better-sqlite3 12.8.0
- **Location:** `~/.openwhispr/database.db` (or channel-specific path for dev/staging)
- **ORM:** Kysely 0.28.14 for type-safe queries
- **Schema:** Transcriptions, notes, folders, conversations, tokens, Google Calendar accounts
- **Implementation:** `src/helpers/database.js` (main process)

**Qdrant Vector DB (Local Semantic Search):**
- **Client:** @qdrant/js-client-rest 1.12.0
- **Binary:** `resources/bin/qdrant-{platform}-{arch}` (spawned as child process)
- **Port:** 6333–6350 (auto-assigned, single-process host)
- **Location:** `~/.cache/openwhispr/qdrant-data/`
- **Embedding Model:** all-MiniLM-L6-v2 (384-dim vectors via ONNX)
- **Collection:** `notes` collection with cosine distance metric
- **Usage:** AI agent semantic search for notes (FTS5 + Qdrant hybrid search)
- **Manager:** `src/helpers/qdrantManager.js`, `src/helpers/vectorIndex.js`, `src/helpers/localEmbeddings.js`
- **Download:** Auto-downloaded via `npm run download:qdrant` and `npm run download:embedding-model`

### File Storage

**Local Filesystem Only:**
- Transcription history: SQLite database in user data directory
- Notes: SQLite database
- Audio recordings: Encrypted storage in `~/.openwhispr/audio/` or platform-specific cache
- Whisper.cpp models: `~/.cache/openwhispr/whisper-models/`
- Parakeet models: `~/.cache/openwhispr/parakeet-models/`
- Llama.cpp models: `~/.cache/openwhispr/llama-models/`
- Embedding model: `~/.cache/openwhispr/embedding-models/all-MiniLM-L6-v2/`
- Diarization models: `~/.cache/openwhispr/diarization-models/`

### Caching

**In-Memory Caches:**
- API key cache (1 hour TTL): `src/services/ReasoningService.ts`
- Model availability check cache (30s TTL)
- Process list cache (5s TTL, shared via `src/helpers/processListCache.js`)

## Authentication & Identity

### OpenWhispr Cloud Auth

**OAuth2 Flow:**
- **Endpoint:** `VITE_OPENWHISPR_API_URL` env var (production cloud backend)
- **Protocol:** `openwhispr://` URL scheme (configurable by channel: openwhispr-dev, openwhispr-staging)
- **Flow:** Desktop → Default browser → Cloud auth → Redirect back to app via protocol handler
- **Token Storage:** `src/helpers/tokenStore.js` (localStorage + Electron secure storage)
- **IPC Handler:** `auth-request` channel in `ipcHandlers.js`

### Google Calendar OAuth

**OAuth2 (Google):**
- **Scopes:** calendar.readonly (read calendar events)
- **Flow:** Webview-based OAuth redirect
- **Token Storage:** SQLite `google_tokens` table via `googleCalendarManager.js`
- **Implementation:** `src/helpers/googleCalendarManager.js`, `src/helpers/googleCalendarOAuth.js`
- **Endpoints:**
  - Auth: `https://accounts.google.com/o/oauth2/auth`
  - Token: `https://oauth2.googleapis.com/token`
  - Revoke: `https://oauth2.googleapis.com/revoke`

## External Services & APIs

### Google Calendar API

**Endpoint:** `https://www.googleapis.com/calendar/v3`

**Operations:**
- List calendars: GET `/calendars`
- List events: GET `/calendars/{calendarId}/events`
- Real-time sync: Push notifications with `pageToken` cursor

**Features:**
- Meeting detection: Check for active calendar events during recording
- Event context: Display meeting name in notifications
- Sync resilience: Exponential backoff on failures (2min → 4min → 8min → cap 30min)
- Socket timeout: 10s per request

**Manager:** `src/helpers/googleCalendarManager.js` (syncs every 2 minutes)

## Monitoring & Observability

**Error Tracking:** None detected (custom error handling via logger)

**Logging:**
- Debug logger: `src/helpers/debugLogger.js`
- File output: Platform-specific app data directory
- Console output in development
- Reasoning-specific logging: `src/utils/logger.ts`

**Performance:**
- Meeting detection: Event-driven (zero CPU via OS APIs) with polling fallback
- Audio activity detection: Event-driven via native binaries or pactl
- Calendar sync: 2-minute interval with exponential backoff

## CI/CD & Deployment

**Hosting:**
- GitHub releases for binary distribution (whisper.cpp, llama.cpp, sherpa-onnx, Qdrant, etc.)
- HuggingFace for model downloads (Whisper GGML, local LLMs, embeddings)

**Update System:**
- electron-updater 6.6.2
- Provider: GitHub releases
- Release type: Draft (configurable in `electron-builder.json`)

**Code Signing:**
- **macOS:** Apple Developer account (notarization via @electron/notarize)
- **Windows:** Azure Code Signing (via electron-builder config)

**Auto-launch/Updates:** electron-updater checks GitHub releases

## Environment Configuration

### Required Environment Variables (12 Secret Keys)

**API Keys (7):**
- `OPENAI_API_KEY` - OpenAI
- `ANTHROPIC_API_KEY` - Anthropic Claude
- `GEMINI_API_KEY` - Google Gemini
- `GROQ_API_KEY` - Groq
- `MISTRAL_API_KEY` - Mistral AI
- `ASSEMBLYAI_API_KEY` - AssemblyAI transcription
- `DEEPGRAM_API_KEY` - Deepgram transcription

**Enterprise Cloud Creds (5):**
- `BEDROCK_ACCESS_KEY_ID`, `BEDROCK_SECRET_ACCESS_KEY`, `BEDROCK_SESSION_TOKEN` (AWS)
- `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` (Azure)
- `VERTEX_API_KEY`, `VERTEX_PROJECT`, `VERTEX_LOCATION` (GCP)

**Storage:** 
- Secret keys encrypted at rest via Electron `safeStorage` (OS keychain: Keychain/DPAPI/libsecret)
- Stored as per-key `.enc` files in `userData/secure-keys/`
- Loaded into `process.env` on app startup by `EnvironmentManager.init()`
- Linux without a keyring: falls back to plaintext in `.env` (Electron default behavior)

### Non-Secret Environment Variables

**Persisted to `.env` in userData:**
- `LOCAL_TRANSCRIPTION_PROVIDER` - "whisper", "nvidia", "openai"
- `PARAKEET_MODEL` - Selected Parakeet model
- `LOCAL_WHISPER_MODEL` - Selected Whisper model
- `CLEANUP_PROVIDER` - AI provider for text processing
- `LOCAL_CLEANUP_MODEL` - Local model for cleanup
- `LLAMA_GPU_BACKEND` - CUDA or VULKAN
- `LLAMA_VULKAN_ENABLED` - Boolean
- `UI_LANGUAGE` - Language code
- `DICTATION_KEY`, `CHAT_AGENT_KEY`, `MEETING_KEY` - Hotkey strings
- `ACTIVATION_MODE` - Tap vs push-to-talk

**Build-Time Vite Variables:**
- `VITE_OPENWHISPR_API_URL` - Cloud API endpoint
- `VITE_AUTH_URL` - OAuth redirect handler

## Webhooks & Callbacks

**Incoming:** None detected

**Outgoing:**
- Google Calendar API polling (not webhooks, periodic sync)
- GitHub releases check for app updates

## Security Considerations

**API Keys:**
- Encrypted at rest via Electron `safeStorage`
- Loaded into `process.env` on startup (in-memory)
- Cached temporarily in `ReasoningService` for performance (1-hour TTL)

**Context Isolation:**
- Electron context isolation enabled
- IPC surface carefully controlled via `preload.js`
- No remote code execution via `eval()` or `Function()`

**Network:**
- HTTPS enforced for all external APIs
- TLS extended with OS certificate store (Keychain/DPAPI/libsecret)
- Socket timeouts: 10s for Google Calendar, 30s for LLM inference

**Data Privacy:**
- Local-first architecture: transcription history and notes stored locally
- Semantic search via Qdrant runs offline (no data sent to cloud)
- Optional cloud sync for notes via `VITE_OPENWHISPR_API_URL`
- No analytics or telemetry detected

## Download & Version Management

**Script-Based Binary Downloads:**

All external binaries auto-download during build via npm scripts:

**Transcription Models:**
- `npm run download:whisper-cpp` - whisper.cpp server (OpenWhispr/whisper.cpp)
- `npm run download:sherpa-onnx` - Parakeet ASR (k2-fsa/sherpa-onnx)

**LLM:**
- `npm run download:llama-server` - Llama.cpp server (ggerganov/llama.cpp)

**Vector DB:**
- `npm run download:qdrant` - Qdrant binary (qdrant/qdrant)
- `npm run download:embedding-model` - all-MiniLM-L6-v2 ONNX model + tokenizer

**Diarization:**
- `npm run download:diarization-models` - Pyannote segmentation + speaker embedding

**Platform-Specific Tools:**
- `npm run download:nircmd` - Windows clipboard helper
- `npm run download:windows-key-listener` - Windows hotkey binary
- `npm run download:windows-mic-listener` - Windows mic detection binary
- `npm run download:windows-fast-paste` - Windows paste helper
- `npm run download:meeting-aec-helper` - Acoustic echo cancellation helper

**Utilities:**
- `scripts/lib/download-utils.js` - Shared download, extraction, and validation logic
- Environment variable override support: `WHISPER_CPP_VERSION`, `QDRANT_VERSION`, etc.
- GitHub token support via `GITHUB_TOKEN` for higher rate limits

## Model Hosting & Auto-Download

**HuggingFace:**
- Whisper models: `ggerganov/whisper.cpp`
- Local LLMs: `bartowski/Qwen_Qwen3.5-9B-GGUF`, etc.
- Embedding model: `sentence-transformers/all-MiniLM-L6-v2`

**GitHub Releases:**
- whisper.cpp: `OpenWhispr/whisper.cpp`
- Llama.cpp: `ggerganov/llama.cpp`
- Sherpa-onnx: `k2-fsa/sherpa-onnx`
- Qdrant: `qdrant/qdrant`

**Auto-Download on First Use:**
- Embedding model downloaded on app launch if missing
- Models downloaded when user selects them in Settings

---

*Integration audit: 2026-05-07*
