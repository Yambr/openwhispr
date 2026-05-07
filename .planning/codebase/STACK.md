# Technology Stack

**Analysis Date:** 2026-05-07

## Languages

**Primary:**
- TypeScript 6.0.2 - React components, services, configuration, type definitions
- JavaScript (Node.js) - Electron main process, build scripts, helpers
- Swift - macOS-specific utilities (Globe key listener, mic listener, audio tap)
- C - Windows low-level keyboard hook (Push-to-Talk)

**Secondary:**
- JSON - Configuration, model registry data
- CSS/SCSS - Styling via Tailwind CSS v4
- Markdown - Documentation, translations via react-i18next

## Runtime

**Environment:**
- Node.js 24 (pinned in `.nvmrc` — CI uses Node 24, do NOT regenerate `package-lock.json` with different major version)
- Electron 41.2.0 - Desktop framework with context isolation enabled

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- React 19.1.0 - UI framework for both dictation overlay and settings panel
- Electron 41.2.0 - Desktop application framework
- Vite 8.0.7 - Build tool and dev server (TypeScript + JSX support via `@vitejs/plugin-react`)
- TailwindCSS 4.1.10 - Utility-first CSS framework
- shadcn/ui 0.9.5 - Component library built on Radix UI primitives

**UI Components & Interaction:**
- Radix UI - Unstyled accessible primitives (`react-dialog`, `react-dropdown-menu`, `react-select`, `react-tabs`, `react-accordion`, `react-label`, `react-popover`, `react-progress`, `react-slot`)
- Tiptap 3.22.3 - Rich text editor for note editing (`@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-task-list`, `@tiptap/extension-placeholder`)
- Lucide React 1.7.0 - Icon library (React components)
- React Markdown 10.1.0 - Markdown rendering

**AI & LLM Integration:**
- ai 6.0.116 - Vercel AI SDK for streamText, tool calls, and multi-provider LLM abstraction
- @ai-sdk/openai 3.0.41 - OpenAI integration (Responses API, Chat Completions)
- @ai-sdk/anthropic 3.0.58 - Anthropic Claude models
- @ai-sdk/google 3.0.43 - Google Gemini API
- @ai-sdk/groq 3.0.29 - Groq inference platform
- @ai-sdk/amazon-bedrock 4.0.93 - AWS Bedrock models
- @ai-sdk/azure 3.0.53 - Azure OpenAI
- @ai-sdk/google-vertex 4.0.108 - GCP Vertex AI

**Internationalization:**
- i18next 26.0.4 - i18n core
- react-i18next 17.0.2 - React integration
- Translation files: `src/locales/{en,es,fr,de,pt,it,ru,zh-CN,zh-TW}/translation.json` (9 languages)

**State Management:**
- Zustand 5.0.11 - Lightweight state management (`src/stores/settingsStore.ts`)
- better-auth 1.6.9 - Authentication system

**Database & Data:**
- better-sqlite3 12.8.0 - SQLite wrapper for transcription history and notes (unpacked via ASAR)
- Kysely 0.28.14 - Type-safe SQL query builder
- Qdrant JS Client 1.12.0 - Vector database client for semantic search (`@qdrant/js-client-rest`)
- onnxruntime-node 1.21.0 - ONNX Runtime for local embeddings (unpacked via ASAR)

**Audio & Speech Processing:**
- ffmpeg-static 5.2.0 - FFmpeg binaries (unpacked via ASAR for audio processing)
- onnxruntime-node 1.21.0 - For embeddings and speech models (ONNX Runtime)

**Utilities & Data Processing:**
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

**Platform-Specific:**
- electron-updater 6.6.2 - Electron app auto-update framework
- @napi-rs/keyring 1.3.0 - OS keychain access for secure credential storage (unpacked via ASAR)
- dbus-next 0.10.2 - D-Bus communication (GNOME Wayland shortcuts)
- @electron/notarize 3.0.1 - macOS notarization

**AWS Services:**
- @aws-sdk/credential-providers 3.1029.0 - AWS credential handling for Bedrock

## Configuration

**Build Configuration:**
- `src/vite.config.mjs` - Vite build configuration with React plugin, Tailwind CSS v4 plugin, path aliases
- `src/tsconfig.json` - TypeScript configuration (ES2022, DOM, strict: false, path alias `@/*`)
- `electron-builder.json` - App packaging configuration with platform-specific targets
  - macOS: DMG + ZIP (arm64/x64, signed and notarized via Azure Code Signing)
  - Windows: NSIS installer + Portable (x64, Azure Code Signing)
  - Linux: AppImage, deb, rpm, tar.gz (x64)
  - Flatpak support with org.freedesktop.Platform runtime 24.08
  - ASAR unpacking: FFmpeg, better-sqlite3, onnxruntime-node, @napi-rs/keyring
  - Extra resources: native binaries in `resources/bin/` (whisper-cpp, llama.cpp, sherpa-onnx, Qdrant, etc.)

**Environment Configuration:**
- `.nvmrc` - Node.js version pinning (24)
- `.env` (root) - Development environment variables
- `userData/.env` (runtime) - User-configured API keys and settings (loaded first via EnvironmentManager)
- Environment variables passed to Vite via `loadEnv()` in vite.config.mjs
- Secret keys encrypted at rest via Electron `safeStorage` → OS keychain (Keychain/DPAPI/libsecret), stored as per-key `.enc` files in `userData/secure-keys/`

**Code Style:**
- `.prettierrc` - Prettier configuration (100 char print width, 2-space tabs, trailing commas, LF line endings)
- ESLint (npm eslint 10.2.1) with TypeScript support and React Hooks rules

## Platform Requirements

**Development:**
- Node.js >= 24 (pinned in `.nvmrc`)
- npm (lockfile: package-lock.json)
- TypeScript 6.0.2 (dev dependency)
- Electron 41.2.0 (dev dependency)
- Native build tools (for better-sqlite3, onnxruntime-node, @napi-rs/keyring compilation)

**Production:**
- macOS 10.13+ (Intel x64 or Apple Silicon arm64)
- Windows 7+ (x64)
- Linux (x64, glibc 2.29+)
- 2GB+ RAM for whisper.cpp models, 4GB+ for larger models
- Audio input device (microphone)

**Native Binaries (bundled, auto-downloaded during build):**
- `whisper-server-{platform}-{arch}` - Whisper.cpp HTTP server (GitHub: OpenWhispr/whisper.cpp)
- `llama-server-{platform}-{arch}` - Llama.cpp HTTP server (GitHub: ggerganov/llama.cpp)
- `sherpa-onnx-{platform}-{arch}` - NVIDIA Parakeet ASR (GitHub: k2-fsa/sherpa-onnx)
- `qdrant-{platform}-{arch}` - Vector database (GitHub: qdrant/qdrant)
- `macos-globe-listener`, `macos-mic-listener`, `macos-fast-paste`, etc. (compiled from Swift source)
- `windows-key-listener.exe`, `windows-mic-listener.exe` (GitHub releases)
- `linux-fast-paste`, `linux-key-listener`, etc. (compiled from C source)
- `all-MiniLM-L6-v2/` - ONNX embedding model (384-dim, auto-downloaded on first launch)
- `diarization-models/` - Pyannote speaker segmentation and CAM++ speaker embedding

**Build Tools (dev):**
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

---

*Stack analysis: 2026-05-07*
