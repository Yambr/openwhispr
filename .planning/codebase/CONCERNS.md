# Codebase Concerns

**Analysis Date:** 2026-05-07

## Tech Debt

**Legacy Environment Variable Fallbacks:**
- Issue: Three deprecated fallback keys remain for backward compatibility (CUSTOM_REASONING_API_KEY, AGENT_KEY, REASONING_PROVIDER, LOCAL_REASONING_MODEL)
- Files: `src/helpers/environment.js:323-324`, `src/helpers/environment.js:421-422`, `src/helpers/ipcHandlers.js:2745-2757`
- Impact: Code carries "drop after 2 releases" TODOs since v1.7.0 (two releases have passed). Fallbacks consume CPU during preference save and complicate env var logic
- Fix approach: Remove all four fallback keys (CUSTOM_REASONING_API_KEY, REASONING_PROVIDER, LOCAL_REASONING_MODEL, AGENT_KEY) in next major version (1.8.0). Run one-time migration in init() if `process.env.REASONING_PROVIDER` exists

**Whisper.cpp Fork Behind Upstream:**
- Issue: OpenWhispr maintains a fork at v0.0.6 based on upstream v1.8.3; upstream is now at v1.8.4+ (299+ commits ahead)
- Files: `scripts/download-whisper-cpp.js:14`, fork at `github.com/OpenWhispr/whisper.cpp`
- Impact: Security fixes, bug patches, and performance improvements in upstream are not available. Streaming transcription enhancements in newer upstream could reduce latency
- Fix approach: Evaluate upstream changes monthly. For critical security fixes: cherry-pick to fork. For minor releases: full merge quarterly with regression testing on all platforms. Establish upstream-tracking schedule

**Monolithic IPC Handlers File:**
- Issue: `src/helpers/ipcHandlers.js` is 7,877 lines with mixed concerns (settings, transcription, sync, database, vector ops, sidecar management)
- Files: `src/helpers/ipcHandlers.js`
- Impact: Code navigation and debugging is slow. Changes to one concern risk breaking others. Testing requires full app startup (no unit tests)
- Fix approach: Extract into 6-8 focused modules: `ipcSettings.js`, `ipcTranscription.js`, `ipcDatabase.js`, `ipcSync.js`, `ipcVectorOps.js`, `ipcSidecars.js`. Register handlers from each module in a registry pattern

**Large Components Without Separation:**
- Issue: Multiple React components exceed 1000 lines (SettingsPage 3633 lines, PersonalNotesView 1284, UploadAudioView 1251, ControlPanel 898, MeetingTranscriptChat 884)
- Files: `src/components/SettingsPage.tsx`, `src/components/notes/PersonalNotesView.tsx`, `src/components/notes/UploadAudioView.tsx`, `src/components/ControlPanel.tsx`, `src/components/notes/MeetingTranscriptChat.tsx`
- Impact: Components are hard to test. State management is scattered. Refactoring risks regressions. Performance hard to optimize
- Fix approach: Break each into 3-5 smaller components per feature area. Extract hooks for shared state. Use `React.memo` for expensive renders

**Complex Audio Pipeline State:**
- Issue: `AudioManager` (2800 lines) and `useAudioRecording` hook manage overlapping concerns: recording state, device selection, transcription config, streaming, cleanup
- Files: `src/helpers/audioManager.js`, `src/hooks/useAudioRecording.js`
- Impact: Recording-to-transcription flow is fragile. Edge cases (device switch mid-record, network loss during streaming) are hard to test. Streaming cleanup is incomplete
- Fix approach: Decompose into: RecordingService (MediaRecorder only), TranscriptionService (batch flow), StreamingService (streaming flow), AudioPipelineOrchestrator (state machine)

## Known Bugs

**Meeting Detection — Process Cache TTL vs Polling Interval Mismatch:**
- Symptoms: On Windows/Linux, process list is cached for 5s but audio activity detector polls every 30s. A meeting app that starts between polls is missed until next interval
- Files: `src/helpers/processListCache.js`, `src/helpers/audioActivityDetector.js`, `src/helpers/meetingDetectionEngine.js`
- Trigger: Start Zoom at second 26 of a 30s poll window; detection fires only when next iteration runs at second 60
- Workaround: Manually start recording or wait 30s
- Fix approach: When audio activity is detected, immediately re-fetch process list (don't wait for poll cycle). Cache TTL should be <= polling interval

**Qdrant Health Check Doesn't Trigger Restart:**
- Symptoms: Health check reports `ready = false` but process remains running and unresponsive. App falls back to FTS5 keyword search
- Files: `src/helpers/qdrantManager.js:186-195`, vector search fallback logic
- Trigger: Qdrant OOM or hang; health check at line 191 sets `ready = false` but doesn't stop/restart the process
- Workaround: Restart app to respawn Qdrant
- Fix approach: If health check fails 3 times consecutively, call `stop()` then `start()`. Add exponential backoff to health checks during recovery

**ONNX Worker Respawn Storm with Memory Pressure:**
- Symptoms: CHANGELOG v1.7.0 mentions "long meetings no longer crash the app from memory allocation failure" but speaker embedding on 3+ attendee meetings still OOMs
- Files: `src/helpers/onnxWorkerClient.js:160`, respawn logic capped at 5 attempts
- Trigger: Record meeting with 5+ distinct speakers; diarization model allocates speaker embeddings for each
- Workaround: Disable diarization or restart app; manually label speakers instead
- Fix approach: Implement memory budgeting in ONNX worker. Pre-allocate embeddings buffer before inference. Add watermark-based GC between speakers. Measure peak usage per speaker count in tests

**Audio Device Switch During Recording Lost Audio:**
- Symptoms: Switching input device mid-recording silently drops new audio (old device stops producing, new device never opens)
- Files: `src/helpers/audioManager.js`, `MediaRecorder` binding
- Trigger: User switches from built-in mic to USB headset while recording
- Workaround: Stop recording, switch device, start again
- Fix approach: Listen to `mediadevices.ondevicechange`. If source changes and we're recording: pause MediaRecorder, rebind to new device, resume

## Security Considerations

**Linux Keyring Fallback to Plaintext:**
- Risk: On Linux systems without a keyring daemon (headless servers, minimal installs), all 14 secrets (API keys, enterprise creds) are stored in plaintext `.env` under `userData/`
- Files: `src/helpers/secretCrypto.js:55`, `src/helpers/environment.js:94-98`, `SECURITY.md:47-49`
- Current mitigation: Electron `safeStorage.isEncryptionAvailable()` returns false; secrets are never encrypted. File permissions are 0o600 (user-read-write only)
- Recommendations:
  1. Document plaintext risk prominently in Linux install guide (currently only in SECURITY.md)
  2. Warn users at first app launch if running headless: "API keys are stored unencrypted. For production, install a keyring daemon: `apt install gnome-keyring dbus`"
  3. Add opt-in env var `OPENWHISPR_REQUIRE_ENCRYPTION=1` that blocks startup if encryption unavailable (for enterprise deployments)

**IPC Surface Vulnerability — Unvalidated Mutation Paths:**
- Risk: CLI bridge at `src/helpers/cliBridge.js` accepts note/folder mutations without rate limiting or audit logging. A compromised bearer token (leaked in debug logs, git history) allows unlimited modifications
- Files: `src/helpers/cliBridge.js:315-349`, note create/update/delete routes with no rate limit or auth context audit
- Current mitigation: 127.0.0.1-only binding and bearer token in 0o600 file (but token is readable by same user)
- Recommendations:
  1. Add per-minute rate limits: max 100 mutations/min to prevent bulk delete attacks
  2. Log all mutations with timestamp, caller context, and diff: `[2026-05-07T10:23:45Z] PATCH /v1/notes/123: title "Old" → "New"`
  3. Add opt-in MFA via TOTP: `OPENWHISPR_CLI_TOTP_SECRET` env var, token required in auth header
  4. Rotate bearer token daily (store rotation time in bridge file, reject tokens older than 24h)

**Secrets in Debug Logs (Regression Risk):**
- Risk: Debug logger (`src/helpers/debugLogger.js`) is configured to dump all IPC payloads. Deeply nested API keys in settings mutations could be logged
- Files: `src/helpers/debugLogger.js`, any `debugLogger.debug("event", { data })` in ipcHandlers
- Current mitigation: Secrets are stored separately in `secure-keys/` directory, not in settings state. However, `process.env.OPENAI_API_KEY` is in memory
- Recommendations:
  1. Audit all `debugLogger` calls in `ipcHandlers.js` and sanitize payloads: strip `apiKey`, `accessKey`, `secretKey`, `token` fields before logging
  2. Add a `sanitizer` function: `debugLogger.debug("msg", sanitizeSecrets(payload))`
  3. Document: "Debug logs may be enabled by CLI flags; never share logs if they contain API keys"

**Loopback CLI Bridge Token Storage Permissions:**
- Risk: Bearer token written to `~/.openwhispr/cli-bridge.json` with 0o600 permissions. On shared systems, user A can steal user B's bridge token if they gain root access (e.g., via sudo)
- Files: `src/helpers/cliBridge.js:146-162`
- Current mitigation: File is `0o600` (owner-read-write only) and re-chmod'd to enforce
- Recommendations:
  1. Store token in OS keychain instead of file (like other API keys do). Requires keyring on all platforms
  2. Or: add UID/GID check at bridge startup to ensure only the owner can connect
  3. Add option to use Unix socket instead of TCP (blocks network access entirely)

**Dependency Supply Chain — Prebuilt Binaries from GitHub Releases:**
- Risk: All native binaries (whisper.cpp, sherpa-onnx, qdrant, llama.cpp) are downloaded from GitHub releases without integrity verification (no SHA256 checksums)
- Files: `scripts/download-whisper-cpp.js`, `scripts/download-sherpa-onnx.js`, `scripts/download-qdrant.js`, `scripts/download-llama-server.js`
- Current mitigation: HTTPS only; GitHub release assets are signed by repo maintainer
- Recommendations:
  1. Add checksum validation: Store expected SHA256 in a `checksums.json` file committed to repo. Verify after download: `sha256sum -c checksums.json`
  2. Add binary signature verification where available (Qdrant, llama.cpp publish release signatures)
  3. Document supply-chain risk in README: "Binaries from GitHub releases are trusted via HTTPS and repo maintainer GPG signatures"

## Performance Bottlenecks

**Audio Blob Size Limit for IPC (10MB de facto):**
- Problem: MediaRecorder → Blob → ArrayBuffer → IPC has implicit 10MB+ transfer limit due to Node.js buffer handling. Long recordings (30+ min at 48kHz stereo) may exceed this and crash IPC
- Files: `src/helpers/audioManager.js`, `useAudioRecording.js` (no explicit size check before IPC)
- Cause: MediaRecorder collects chunks in memory; for high-quality audio (192kHz), 30min = ~27GB conceptually, but in practice the app limits to ~10min via hotkey timeout
- Improvement path:
  1. Add explicit size check before IPC: `if (blob.size > 50_000_000) { throw new Error("Recording too large") }`
  2. Implement chunked upload: send 5MB chunks to main, write incrementally to temp file
  3. Switch to file-based streaming (Web Audio → WAV file directly) to avoid memory buildup

**Streaming Transcription — No Backpressure Handling:**
- Problem: OpenAI Realtime, AssemblyAI, and Deepgram streams send partial results continuously. If the app is under load or the UI thread is busy, partial results queue up in memory
- Files: `src/helpers/deepgramStreaming.js`, streaming event listeners without backpressure
- Cause: No mechanism to signal "slow down" to the streaming provider. Buffers grow unbounded
- Improvement path:
  1. Implement a bounded queue (max 50 pending results) in each streaming provider
  2. If queue fills, emit a "slow" event and pause reading from the stream
  3. Resume when the queue drains below 25 items

**Meeting Diarization — Full Recompute on Every Note Update:**
- Problem: When a user edits the "label speakers" toggle or "others in call" stepper mid-meeting, the entire speaker embedding computation reruns (expensive for 5+ speakers)
- Files: `src/helpers/ipcHandlers.js`, diarization update logic
- Cause: Settings changes trigger a full re-diarize instead of caching speaker embeddings
- Improvement path:
  1. Store speaker embedding cache keyed by (`audioFile`, `speakerCount`)
  2. On toggle change, apply new labels to cached embeddings without recomputing
  3. Implement incremental diarization: only recompute for changed speakers

**Vector Index Upsert During Peak Recording:**
- Problem: Every note update during recording triggers an async Qdrant vector upsert. With frequent auto-save (every 2-3s), upserts queue up and CPU maxes out
- Files: `src/helpers/ipcHandlers.js:2823`, `_asyncVectorUpsert()` called on every note save
- Cause: No coalescing of upserts; no batching
- Improvement path:
  1. Implement an upsert queue with 500ms debounce per note ID
  2. Batch 20+ upserts into a single Qdrant `/upsert` call
  3. Monitor Qdrant health; skip upserts if health check is failing

**Clipboard Paste Latency on Linux (Multiple Tools Fallback):**
- Problem: On Linux Wayland, clipboard paste tries 4+ tools in order (wl-copy, xdotool, ydotool) if the first isn't installed. Each failed attempt adds 500ms+ of timeout
- Files: `src/helpers/clipboard.js:1500-1600` (fallback chain)
- Cause: No early detection of available tools; each fallback incurs a process spawn timeout
- Improvement path:
  1. At startup, detect available paste tools and cache the working one: `cachedPasteTool`
  2. Skip unavailable tools on subsequent calls
  3. Reduce timeout per tool from 500ms to 100ms (most tools respond instantly)

## Fragile Areas

**Native Binary Path Resolution — Hard-Coded Platforms:**
- Files: `src/helpers/whisperServer.js`, `src/helpers/parakeetWsServer.js`, `src/helpers/qdrantManager.js`, `src/utils/serverUtils.js`
- Why fragile: Each helper manually constructs binary names like `whisper-server-darwin-arm64` or `qdrant-linux-x64.exe`. Adding ARM64 support on Linux requires changes in 5+ files. No central registry
- Safe modification: Create `src/utils/binaryRegistry.ts` exporting a manifest of all binaries keyed by (platform, arch, name). Each helper reads from the registry rather than constructing names
- Test coverage: Unit tests for `binaryRegistry.get("whisper-server", "linux", "arm64")` on all 6 (OS, arch) pairs

**Sidecar Lifecycle Management — Distributed Registration:**
- Files: `main.js` (initialization), `ipcHandlers.js` (shutdown during preference save), `sidecarRegistry.js` (cleanup), `sidecarReaper.js` (cleanup on startup)
- Why fragile: Three separate stop functions (llamaServer.stop(), whisperServer.stop(), qdrantManager.stop()) are called from different places. Missing one stop point leaves a zombie process. The new `sidecarRegistry` pattern (CHANGELOG v1.7.0) is not yet fully adopted
- Safe modification: Require all sidecars to register via `sidecarRegistry.register(name, stopFn)` in main.js. Single `sidecarRegistry.stopAll()` on quit and startup cleanup
- Test coverage: Mock all stop functions. Verify `stopAll()` calls each exactly once with timeout

**ONNX Worker Spawn — No Process Group Cleanup on Windows:**
- Files: `src/helpers/onnxWorkerClient.js:50-70` (spawn call), line 95 uses `detached: process.platform !== "win32"` (correct) but no cleanup of child's child processes on Windows
- Why fragile: If the ONNX worker crashes and creates sub-processes, those aren't killed on Windows. App cleanup is incomplete
- Safe modification: On Windows, use `taskkill /PID <pid> /T /F` in the stop function (kill process tree). On Unix, rely on process group termination via `process.kill(-pid)`
- Test coverage: Simulate worker crash; verify all children are reaped

**Streaming Provider State Machine — Incomplete Transitions:**
- Files: `src/helpers/deepgramStreaming.js`, `src/helpers/assemblyAiStreaming.js`, streaming provider implementations
- Why fragile: Each provider maintains state (connected, streaming, stopped). Edge case: network drops mid-stream and reconnect fails. App is left in "streaming" state but provider is dead
- Safe modification: Implement explicit state machine in each provider with valid transitions only. Example:
  ```
  IDLE -> CONNECTING -> CONNECTED -> STREAMING -> (PAUSED | ERROR) -> IDLE
  Only stop/start/send allowed in specific states
  Invalid transitions log a warning and are ignored
  ```
- Test coverage: Enumerate all 20+ state transitions; mock network failures and verify recovery path

**Platform-Specific Clipboard Helpers — Dependency on External Binaries:**
- Files: `src/helpers/clipboard.js`, detection of xdotool, wtype, ydotool, nircmd
- Why fragile: On Linux Wayland, clipboard depends on runtime availability of `wl-copy`, `xdotool`, or `wtype`. If none are installed, paste silently falls back to manual copy with no error. User doesn't realize paste failed
- Safe modification: On init, detect available tools and store in settings (`availableClipboardTools`). In UI, show a warning badge if no tools are available. Disable auto-paste and suggest installation
- Test coverage: Simulate missing tools. Verify UI warning appears. Test fallback behavior

## Scaling Limits

**Qdrant Vector DB — No Partition or Sharding:**
- Current capacity: ~100k notes with embeddings before performance degrades (Qdrant default heap is 200MB for in-memory index)
- Limit: Beyond 500k notes, search latency exceeds 1s per query (Qdrant's indexing becomes O(n))
- Scaling path:
  1. For users with 200k+ notes: Add disk-based storage option (HNSW on-disk) in Qdrant config
  2. For 1M+ notes: Partition notes by year/month, spawn separate Qdrant instance per partition, search all in parallel
  3. Implement "archive" feature: old notes (>1 year) move to read-only partition, skip from main search

**Meeting Diarization — Speaker Count Limit:**
- Current capacity: ~20 speakers per meeting reliably (speaker embedding model has ~100MB working set)
- Limit: Beyond 20 speakers, OOM risk increases exponentially (ONNX worker RAM = #speakers × embedding_model_size)
- Scaling path:
  1. Implement streaming diarization: process speakers in batches of 5
  2. Cache speaker embeddings from past meetings (reuse "Alex's voice" across meetings)
  3. For 50+ speaker events: fallback to transcription-only (no speaker labels) or suggest multiple recordings

**Audio Processing — Concurrent Streams:**
- Current capacity: 1 active recording + 3 concurrent streaming transcription providers. Beyond that, CPU/network saturates
- Limit: Recording + Deepgram + AssemblyAI + OpenAI Realtime simultaneously = 4 WebSocket/gRPC streams + audio capture thread
- Scaling path:
  1. Implement stream multiplexing: one WebSocket per provider, demultiplex results locally
  2. Add QoS settings: user can choose to drop lower-priority providers if network is congested
  3. Server-side streaming federation: server picks best provider based on load

**Local LLM (llama-server) — Batch Size:**
- Current capacity: Single request at a time (batch size = 1). With Vulkan on RTX 4080, can handle ~400 tokens/sec
- Limit: Multiple concurrent requests (agent + cleanup + formatting) compete for GPU; response time gets worse linearly
- Scaling path:
  1. Implement request queueing in llama-server wrapper (currently just blocks)
  2. Batch multiple inference requests (e.g., cleanup + formatting together) if they use the same model
  3. Use dynamic batch sizing: increase batch size as concurrency grows (up to max VRAM)

## Dependencies at Risk

**better-sqlite3 ^12.8.0 (Floating Version):**
- Risk: Major version bumps may change binary format, C API, or behavior. Recent 12.x releases have had performance regressions in transaction handling
- Files: `package.json:142`, all database code in `src/helpers/database.js`
- Impact: New install on different machine may get v13+ with incompatible .db format
- Migration plan: Pin to `12.8.0` (exact). Test v13 on feature branch once available. Update docs with migration steps if format changes

**onnxruntime-node ^1.21.0 (Floating Version):**
- Risk: ONNX Runtime 1.21.0 had critical memory leak in GC on speaker embeddings. Version 1.22.0 fixes it but introduces different tensor buffer allocation
- Files: `package.json:154`, `src/helpers/onnxWorkerClient.js`, speaker embedding model
- Impact: Memory usage on long meetings unpredictable; OOM crashes possible
- Migration plan: Pin to `1.21.1` (first patch release after leak fix announced). Add memory-usage telemetry to detect regressions. Plan upgrade to 1.23+ after 2-3 weeks of stability data

**@napi-rs/keyring ^1.3.0 (Floating Version):**
- Risk: Keyring bindings are platform-specific C code. Version 1.4.0+ drops macOS 10.14 support; users on older OS can't install
- Files: `package.json:122`, `src/helpers/secretCrypto.js:18`
- Impact: Encryption unavailable on older macOS; secrets fall back to plaintext
- Migration plan: Document macOS 10.15+ requirement before upgrading. Send warning to users on <10.15 at startup

**Electron ^41.2.0 (Floating Version):**
- Risk: Electron's safeStorage API changed in v40; plaintext fallback behavior differs. Some edge cases in session token handling
- Files: `package.json:100`, `src/helpers/secretCrypto.js:55`, environment.js
- Impact: Behavior change when Electron updates could expose secrets if not encrypted
- Migration plan: Pin major version `41.x` until `42.0` is released. Test `42.0` beta thoroughly before upgrade. Add CI check for safeStorage availability

## Missing Critical Features

**No Offline Queue for Transcriptions:**
- Problem: User records audio → whispers offline. Before result is persisted, network drops and they close the app. Audio is lost, transcription is lost
- Blocks: Reliable capture on unreliable networks, airplane mode workflows
- Workaround: Always use cloud transcription (not offline Whisper)
- Fix approach: When transcription completes but upload fails, write result to local cache file. On next launch, retry upload. Add a "pending uploads" queue in the note UI

**No Built-In Meeting Recording Consent UI:**
- Problem: In many jurisdictions, recording a meeting without participant consent is illegal. App has no one-click "notify participants we're recording" feature
- Blocks: Enterprise/legal use; international deployment compliance
- Workaround: Users must manually notify via chat before recording
- Fix approach: Add a "meeting recording consent" notification that integrates with Zoom/Teams UI. Send via their APIs when recording starts. Or: add a one-click "broadcast recording notification" that opens a pre-filled email

**No Audio Export with Transcription Sync:**
- Problem: Transcriptions export as TXT/SRT/JSON, but without audio they're not reproducible. User can't share a "transcript + audio" bundle for editing
- Blocks: Collaboration workflows; GDPR data export compliance (should include original audio)
- Workaround: Manual copy of audio file + transcript file
- Fix approach: Add "export as bundle" option that zips audio + transcript + metadata. CLI `openwhispr export <note_id> --format bundle` outputs a `.owbin` (OpenWhispr Bundle)

## Test Coverage Gaps

**Audio Pipeline Integration:**
- What's not tested: The full flow from MediaRecorder → IPC → whisper-server → result → database. Only 3 unit test files exist (CHANGELOG v1.7.0 adds more, but gaps remain)
- Files: `test/helpers/` has only `meetingEchoLeakDetector.test.js`, `localSpeechGate.test.js`, `transcriptText.test.js`. No tests for audioManager, clipboardManager, recordingFlow
- Risk: Regressions in audio recording go undetected until user reports. Streaming provider failures cascade
- Priority: HIGH — Audio is core functionality. Add tests for:
  1. Recording flow: start → chunks collected → stop → blob created → IPC call → temp file written
  2. Device switch mid-recording: verify audio from new device is captured (currently buggy)
  3. Streaming error recovery: network drops, provider reconnects, partial results don't get orphaned
  4. Platform-specific clipboard paste: mock xdotool, wtype, wl-copy; verify fallback chain works

**IPC Handler Validation:**
- What's not tested: Input validation on all 100+ IPC endpoints. No fuzzing of malformed payloads. No rate-limit enforcement tests
- Files: `src/helpers/ipcHandlers.js` (7877 lines, zero test files)
- Risk: Crafted IPC calls could crash the app or corrupt data. Mutations are unbounded (no rate limits)
- Priority: HIGH — Add tests for:
  1. Invalid note ID (negative, non-integer, string): should return 400
  2. 1000+ mutations in 1 second: should queue/throttle, not crash
  3. Oversized note content (50MB): should reject with size error
  4. Concurrent mutations to same note: verify ACID guarantees (transactions work correctly)

**Settings Store Selectors:**
- What's not tested: Complex selector functions like `selectResolvedLLMConfig`, `selectResolvedMeetingTranscription`. Fallback chains are not exercised
- Files: `src/stores/settingsStore.ts` (1720 lines, no tests for selectors)
- Risk: A settings change breaks a selector and users get silently wrong config (e.g., wrong AI model defaults)
- Priority: MEDIUM — Add tests for:
  1. Each selector with all combinations of config state (cloud, local, self-hosted)
  2. Fallback chains: if cleanup model is empty, check dictation agent setting
  3. Provider/model validation: invalid model name should not crash selector

**CLI Bridge Authentication:**
- What's not tested: Bearer token rotation, rate limiting, loopback-only enforcement, mutation logging
- Files: `src/helpers/cliBridge.js` (406 lines, zero tests)
- Risk: CLI bridge could be exploited if auth is weak or token isn't rotated
- Priority: HIGH — Add tests for:
  1. Bearer token required: missing or invalid token should return 401
  2. Non-loopback IP (e.g., 192.168.x.x) should return 403
  3. Rate limit: 101 mutations in 1 minute should reject the 101st
  4. Token rotation: after 24h, old token should be rejected

---

*Concerns audit: 2026-05-07*
