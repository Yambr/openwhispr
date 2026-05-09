<p align="center">
  <img src="src/assets/logo.svg" alt="Yambr OpenWhispr" width="120" />
</p>

<h1 align="center">Yambr OpenWhispr</h1>

<p align="center">
  <a href="https://github.com/Yambr/openwhispr/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Yambr/openwhispr?style=flat" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat" alt="Platform" />
  <img src="https://img.shields.io/badge/build-corporate--minimal-2056DF?style=flat" alt="Corporate-minimal default build" />
  <a href="https://github.com/Yambr/openwhispr/actions/workflows/verify-gating.yml"><img src="https://github.com/Yambr/openwhispr/actions/workflows/verify-gating.yml/badge.svg" alt="Verify gating" /></a>
</p>

<p align="center">
  A <strong>self-hostable corporate fork</strong> of <a href="https://github.com/OpenWhispr/openwhispr">OpenWhispr</a> — privacy-first voice-to-text dictation for your own backend, your own OAuth, and nothing you didn't ask for.
</p>

<p align="center">
  <a href="#whats-different">What's different</a> &middot;
  <a href="#download--demo">Download / Demo</a> &middot;
  <a href="#build-your-own">Build your own</a> &middot;
  <a href="#need-it-built-for-you">Need it built for you?</a>
</p>

---

## What is this?

This is a **fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr)** — the privacy-first dictation desktop app — re-shaped for **corporate self-hosting**. Same core (whisper.cpp / Parakeet / local LLM / cross-platform Electron), but trimmed down to what enterprises actually deploy: dictation, transcription, AI reasoning against **your** backend.

The default build ships **only** what a corporate deployment needs. Consumer features that exist in upstream OpenWhispr (Stripe billing UI, referral program, third-party real-time streaming via AssemblyAI/Deepgram) are **physically removed from the bundle** at build time. Not hidden, not feature-flagged at runtime — actually gone, verifiable by `grep` on the shipped artifact.

> **Demo build available at our domain** — production builds run against `auth.yambr.com` / `api.yambr.com` (Yambr corporate backend). To deploy your own, see [Build your own](#build-your-own) below.

## What's different from upstream OpenWhispr?

| Aspect | Upstream OpenWhispr | This fork (default build) |
|---|---|---|
| **Backend** | Hardcoded to `openwhispr.com` cloud | Build-time configurable (`OPENWHISPR_BACKEND_URL`) |
| **OAuth providers** | Hardcoded list | Per-provider build-time gating (`OPENWHISPR_OAUTH_GOOGLE/APPLE/MICROSOFT`) |
| **Stripe billing UI** | Always present | **Removed** by default (`OPENWHISPR_BILLING=true` to enable) |
| **Referral program UI** | Always present | **Removed** by default (`OPENWHISPR_REFERRALS=true` to enable) |
| **Realtime ASR streaming (Phase 05)** | Direct WebSocket to AssemblyAI / Deepgram / `wss://api.openai.com/v1/realtime` (~141 KB of vendor SDK shipped) | AssemblyAI / Deepgram code physically removed from bundle; `OPENWHISPR_STREAMING` defaults to **`true`** and routes realtime ASR through the corporate backend at `wss://${backend-host}/v1/realtime` (Speaches+LiteLLM, OpenAI-Realtime-compatible). Override via `OPENWHISPR_REALTIME_WSS_URL` or disable with `OPENWHISPR_STREAMING=false`. B1 auto-disable forces it off when no backend URL is configured. |
| **Bundle ID** | `com.openwhispr.app` | `com.yambr.openwhispr` |
| **Code signing** | OpenWhispr Developer ID | Yambr Developer ID |
| **Auto-update feed** | OpenWhispr GitHub releases | Yambr GitHub releases |
| **Audit posture** | Consumer SaaS | Corporate-minimal — disabled features verifiably absent from bundle |

What's **kept identical**:

- Core dictation (whisper.cpp, Parakeet, OpenAI Whisper API)
- Multi-provider AI reasoning (OpenAI, Anthropic, Gemini, Groq, local llama.cpp, Azure/Vertex/Bedrock)
- Local semantic search (Qdrant + MiniLM)
- Meeting detection + speaker diarization
- Global hotkeys, push-to-talk, all platform integrations
- Notes editor, agent chat, custom dictionary
- All 9 UI languages

## Download / Demo

Production builds (signed with Yambr Developer ID, talking to `auth.yambr.com` / `api.yambr.com`):

| Platform | Download |
|---|---|
| macOS (Apple Silicon) | [`.dmg`](https://github.com/Yambr/openwhispr/releases/latest) |
| macOS (Intel) | [`.dmg`](https://github.com/Yambr/openwhispr/releases/latest) |
| Windows | [`.exe`](https://github.com/Yambr/openwhispr/releases/latest) |
| Linux | [`.AppImage`](https://github.com/Yambr/openwhispr/releases/latest) / [`.deb`](https://github.com/Yambr/openwhispr/releases/latest) |

You can use the demo build to evaluate the app, but **for production self-hosting you should build your own** so the binary points at your backend, signs with your certificate, and updates from your release feed.

## Build your own

Self-hosting is the whole point of this fork. The 1-2-3:

### 1. Fork the repo and set your backend URLs

Three build-time environment variables tell the binary where your servers live:

```bash
OPENWHISPR_BACKEND_URL=https://api.your-domain.com   # API base URL
VITE_OPENWHISPR_AUTH_URL=https://auth.your-domain.com # better-auth backend
VITE_OPENWHISPR_MCP_URL=https://mcp.your-domain.com/mcp # optional MCP endpoint
```

Set the env vars in your CI (GitHub Actions secrets / vars work fine — see `.github/workflows/corporate-build.yml` as a template) or pass them inline:

```bash
OPENWHISPR_BACKEND_URL=https://api.your-domain.com npm run build:mac
```

The full env-var reference is in [`docs/BUILD_CONFIG.md`](docs/BUILD_CONFIG.md).

Your backend needs to implement the wire contract documented in [`docs/BACKEND_SPEC.md`](docs/BACKEND_SPEC.md) and [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md). Minimum surface for a corporate deployment is small — `/api/transcribe`, `/api/reason`, `/api/health`, plus auth.

**Realtime ASR (Phase 05, 2026-05-09):** live dictation now defaults to `wss://${backend-host}/v1/realtime` (OpenAI Realtime API protocol, served by Speaches + LiteLLM `mode: realtime` in the reference Yambr backend). The realtime URL derives automatically from `OPENWHISPR_BACKEND_URL`; override via `OPENWHISPR_REALTIME_WSS_URL` if your relay is on a separate WSS-only ingress. If your backend hasn't deployed the realtime relay yet, set `OPENWHISPR_STREAMING=false` at build time — file-mode transcription continues to work. See [`docs/BACKEND_SPEC.md` § Realtime WebSocket Contract](docs/BACKEND_SPEC.md#realtime-websocket-contract) for the wire detail.

### 2. Set your Apple / Microsoft / Google OAuth client IDs

OAuth client IDs are build-time too. See [`docs/OAUTH_SPEC.md`](docs/OAUTH_SPEC.md) for the full list of env vars per provider. If you don't need a provider at all, disable it instead of providing credentials:

```bash
OPENWHISPR_OAUTH_GOOGLE=false
OPENWHISPR_OAUTH_APPLE=false
OPENWHISPR_OAUTH_MICROSOFT=false
```

Disabled providers are physically tree-shaken from both the renderer and preload bundles — verify with `npm run verify:oauth-gating`.

### 3. Set your Apple Developer ID (and Windows / Linux signing if needed)

For macOS builds you need:

- **Apple Developer ID Application certificate** in your local Keychain or as `CSC_LINK` + `CSC_KEY_PASSWORD` env vars
- **Apple ID + app-specific password + Team ID** for notarization (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`)

For Windows: `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` (.pfx file).

For Linux: no signing required.

Update `electron-builder.json` `appId` field if you want a different bundle ID than `com.yambr.openwhispr`.

That's it. Run `npm run build:mac` (or `:win` / `:linux`) and you get a signed, notarized binary that talks to your backend, shows only the OAuth providers you configured, and ships none of the upstream consumer features.

### Optional: opt back into upstream features

If you actually want Stripe billing / referrals / AssemblyAI streaming in your build (e.g., you're running a paid SaaS on top of this fork), enable them explicitly:

```bash
OPENWHISPR_BILLING=true \
OPENWHISPR_REFERRALS=true \
OPENWHISPR_STREAMING=true \
npm run build:mac
```

Each flag tree-shakes its own UI + IPC + preload methods independently. Mix and match — there's no "all-or-nothing" coupling.

### Verification

After building, the load-bearing security gates check that disabled features are actually absent from the bundle:

```bash
npm run verify:oauth-gating       # 4 OAuth scenarios, 63 grep targets
npm run verify:feature-gating     # 4 feature scenarios, 112 grep targets
npm run verify:pack-regen         # CFG-08 regression guard
```

These run on every PR via `.github/workflows/verify-gating.yml`. If any disabled feature leaks into the bundle, CI fails.

## Need it built for you?

If you want a corporate build delivered to you — your domain, your OAuth, your signing certificates, your auto-update feed — without forking and CI-wrangling, write me on Telegram: **[@yambrcom](https://t.me/yambrcom)**.

Typical deliverable: signed `.dmg` / `.exe` / `.AppImage` for your bundle ID, plus a private repo with your build config so you can rebuild yourself anytime.

## Quick start (local development)

```bash
git clone https://github.com/Yambr/openwhispr.git
cd openwhispr
npm install
npm run dev
```

Requires Node.js 24 (see `.nvmrc`). The dev build ignores feature flags and ships everything — use `npm run pack` to test the production build with your env vars.

## Documentation

- **[`docs/BUILD_CONFIG.md`](docs/BUILD_CONFIG.md)** — every build-time env var, defaults, examples, tree-shake mechanism
- **[`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md)** — corporate deployment walkthrough
- **[`docs/BACKEND_SPEC.md`](docs/BACKEND_SPEC.md)** — wire contract every endpoint your backend must implement
- **[`docs/OAUTH_SPEC.md`](docs/OAUTH_SPEC.md)** — OAuth provider reference (Google, Apple, Microsoft, sign-in)
- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — process model, IPC surface, secrets, sidecar binaries
- **[`CLAUDE.md`](CLAUDE.md)** — technical reference for AI assistants working on the codebase

Upstream OpenWhispr docs (also useful since the core is identical): [docs.openwhispr.com](https://docs.openwhispr.com).

## Tech stack

React 19 · TypeScript · Tailwind CSS v4 · Electron 41 · better-sqlite3 · whisper.cpp · NVIDIA Parakeet (sherpa-onnx) · Qdrant · ONNX Runtime · Vite · shadcn/ui

## Contributing

For changes to **gating mechanism, build flags, verify-* scripts** — open a PR and the gating CI gates will tell you if something regressed. Read [`docs/BUILD_CONFIG.md`'s "Tree-shake mechanism" section](docs/BUILD_CONFIG.md) before adding a new flag — there are non-obvious Vite/Rolldown rules you must follow.

For **upstream-mergeable improvements** (whisper.cpp updates, new AI providers, UI fixes) — please contribute to [upstream OpenWhispr](https://github.com/OpenWhispr/openwhispr) first. We'll pull them in.

## License

[MIT](LICENSE) — free for personal and commercial use, including running your own corporate deployment.

## Acknowledgments

This fork stands on the shoulders of [OpenWhispr](https://github.com/OpenWhispr/openwhispr) and inherits all its acknowledgments:

- **[OpenWhispr](https://github.com/OpenWhispr/openwhispr)** — the upstream project this fork is built on
- **[OpenAI Whisper](https://github.com/openai/whisper)** + **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** — speech recognition
- **[NVIDIA Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)** + **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** — fast multilingual ASR
- **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — local LLM inference
- **[Electron](https://www.electronjs.org/)** + **[React](https://react.dev/)** + **[shadcn/ui](https://ui.shadcn.com/)** — desktop UI stack

Need a build? **[@yambrcom](https://t.me/yambrcom)** on Telegram.
