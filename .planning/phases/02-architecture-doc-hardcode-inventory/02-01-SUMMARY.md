---
phase: 02-architecture-doc-hardcode-inventory
plan: "01"
subsystem: docs
tags: [architecture, documentation, ipc, sidecar, secrets, model-registry]
dependency_graph:
  requires: []
  provides: [docs/ARCHITECTURE.md]
  affects: [docs/SELF_HOSTING.md]
tech_stack:
  added: []
  patterns:
    - "file:line citation discipline (D-04)"
    - "ASCII block diagrams for all process flow visualizations"
    - "domain-prefix IPC categorization (db-*, transcribe-*, get-*-key, etc.)"
key_files:
  created:
    - docs/ARCHITECTURE.md
  modified: []
decisions:
  - "Documented 14 SECRET_KEYS (source has 14, CLAUDE.md describes 12 — noted discrepancy in doc)"
  - "Used ASCII block diagrams throughout for consistency (D-03 Claude's Discretion)"
  - "IPC surface organized as categorized summaries with domain-prefix sections, not exhaustive 200-row table"
  - "ONNX utility worker documented as a process model peer, not a sidecar (spawned via utilityProcess, not resources/bin/)"
metrics:
  duration: "18min"
  completed: "2026-05-08"
  tasks_completed: 1
  files_created: 1
---

# Phase 2 Plan 1: Architecture Documentation Summary

**One-liner:** Self-contained `docs/ARCHITECTURE.md` covering process model, IPC surface, secret storage, model registry, transcription pipeline, embeddings pipeline, and sidecar binaries — 531 lines, 49 unique file citations, 62 line-number anchors.

## What Was Built

`docs/ARCHITECTURE.md` is a fresh, self-contained architecture reference for external implementers and OSS contributors. It follows the Phase 1 documentation style (audience: third-party, tone: explanatory, no insider jargon) and cross-links to all three Phase 1 docs.

### Sections written

1. **Tech Stack** — version table for all pinned core technologies; sourced from `package.json` and `.nvmrc`
2. **Process Model** — ASCII diagram of 4 processes (main, renderer, preload, ONNX worker) with IPC arrows; explains context isolation, URL-based window routing, and ONNX worker respawn backoff
3. **IPC Surface** — 8 domain-prefix categories (`db-*`, `transcribe-*`, `get-*-key`/`save-*-key`, `window-*`, `hotkey-*`, `meeting-*`, `cloud-*`, plus notable others); each with contract pattern, example channel, and args/return shape; `preload.js` cited as authoritative full list
4. **Secret Storage** — all 14 `SECRET_KEYS` listed by name; per-key `.enc` file convention; OS keychain story (Keychain/DPAPI/libsecret); Linux plaintext fallback explicitly documented; build-time env vars are never for secrets (constraint quoted)
5. **Model Registry** — `modelRegistryData.json` single source of truth; `ModelRegistry.ts` wrapper; 8 inference providers; 4 inference scopes; fallback chain via `selectResolvedLLMConfig`
6. **Transcription Pipeline** — ASCII flow diagram from MediaRecorder to clipboard; 3 engine paths (whisper.cpp, Parakeet/sherpa-onnx, cloud); custom dictionary as Whisper `prompt`; provider preference in `.env`
7. **Embeddings Pipeline** — note create/update flow to Qdrant; agent search flow with parallel FTS5+vector merge (RRF K=60, cosine ≥ 0.3); 3-tier fallback chain (cloud → local semantic → FTS5)
8. **Sidecar Binaries** — unified lifecycle pattern described once (sidecarRegistry + sidecarPidFile + sidecarReaper); inventory table for all 9 sidecar types (whisper-server, llama-server, sherpa-onnx, qdrant, diarization, ONNX worker, windows-key-listener, windows-mic-listener, macos-mic-listener)
9. **Further Reading** — cross-links to BACKEND_SPEC.md, OAUTH_SPEC.md, SELF_HOSTING.md, CONFIG_INVENTORY.md

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| File exists, ≥ 300 lines | 531 lines — PASS |
| All 8 H2 sections present | PASS |
| Process model mentions all 4 process types | PASS (24 references) |
| IPC section cites preload.js + ≥ 5 category prefixes | 8 categories — PASS |
| Secret storage: SECRET_KEYS, safeStorage, userData/secure-keys, Keychain, DPAPI, libsecret, build-time never for secrets | All present — PASS |
| Sidecar section: whisper-server, sherpa-onnx, qdrant, ONNX worker, platform listener | All present — PASS |
| Sidecar section references sidecarReaper.js, sidecarRegistry.js, sidecarPidFile.js | All present — PASS |
| ≥ 20 unique file-path citations | 49 — PASS |
| ≥ 10 line-number citations | 62 — PASS |
| Cross-links to BACKEND_SPEC.md, OAUTH_SPEC.md, SELF_HOSTING.md | All present — PASS |
| Further Reading section present | PASS |
| No mermaid fences | PASS (ASCII-only diagrams) |

## Deviations from Plan

### Auto-noted Discrepancy (Not a fix — factual documentation)

**SECRET_KEYS count**: `CLAUDE.md` and plan task description both reference "12 SECRET_KEYS". The current source `src/helpers/environment.js:9-24` defines 14 entries. The architecture doc notes this discrepancy inline and cites the authoritative source. No code was changed.

## Threat Flags

None. This is documentation-only. No new network endpoints, auth paths, file access patterns, or schema changes were introduced.

## Self-Check: PASSED

- `docs/ARCHITECTURE.md` exists: FOUND
- Commit `c8355e7` exists: FOUND
- All 8 required H2 sections present: VERIFIED
- 49 unique file-path citations: VERIFIED
- 62 line-number citations: VERIFIED
