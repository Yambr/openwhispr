# Phase 2: Architecture Doc + Hardcode Inventory - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 02-architecture-doc-hardcode-inventory
**Areas discussed:** Arch doc strategy, Inventory scope, Env-var naming, Inventory format, Arch doc depth, IPC surface, LiteLLM scope, Audience

---

## Arch doc strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh self-contained doc (Recommended) | Write `docs/ARCHITECTURE.md` from scratch as a single canonical reference; cite codebase maps and CLAUDE.md as inputs but don't depend on them. Same approach as Phase 1's BACKEND_SPEC. | ✓ |
| Thin pointer doc | docs/ARCHITECTURE.md is short and links out to .planning/codebase/ARCHITECTURE.md and CLAUDE.md. Less duplication but third parties have to hop and .planning/ is internal. | |
| Restructured copy of codebase/ARCHITECTURE.md | Copy + reorganize the existing internal doc, adapt voice for external readers. Faster but parallel docs drift. | |

**User's choice:** Fresh self-contained doc

---

## Inventory scope

| Option | Description | Selected |
|--------|-------------|----------|
| Backend/OAuth/enterprise URLs + OAuth client IDs only (Recommended — REQ CFG-01 minimum) | Strict CFG-01: backend URL, OAuth client ID, enterprise endpoint, default model registry override, LiteLLM-shaped URL. | ✓ |
| Above + every URL anywhere in source | Inventory ALL URLs (HuggingFace, GitHub release, sherpa-onnx download). Adds noise. | |
| Above + sidecar download URLs + binary names | Include items a self-hoster might want to mirror. Useful for air-gapped but not required by v1. | |

**User's choice:** Backend/OAuth/enterprise URLs + OAuth client IDs only (CFG-01 minimum)

---

## Env-var naming

| Option | Description | Selected |
|--------|-------------|----------|
| OPENWHISPR_* prefix, kebab-cased meaning (Recommended) | `OPENWHISPR_BACKEND_URL`, `OPENWHISPR_OAUTH_GOOGLE_CLIENT_ID`, etc. Already used by REQ CFG-04 / CFG-03. | ✓ |
| VITE_OPENWHISPR_* for renderer, OPENWHISPR_* for main | Mirror current split. Doubles var count and Phase 3 has to map between forms. | |
| Group prefix (BACKEND_*, OAUTH_*, ENTERPRISE_*) | Shorter but loses namespace anchor; collisions with other apps in env. | |

**User's choice:** OPENWHISPR_* prefix, kebab-cased meaning

---

## Inventory format

| Option | Description | Selected |
|--------|-------------|----------|
| file:line \| current value \| proposed env-var \| category \| notes (Recommended) | 5-column table, one row per hardcode. Mirrors Phase 1's structured-table style. Single table is grep-friendly. | ✓ |
| Per-category sections with sub-tables | Separate ## Backend URLs / ## OAuth Client IDs / etc. More readable but harder to grep when refactoring. | |
| Per-file sections | Group entries by source file. Useful for surgical refactor but obscures cross-file patterns. | |

**User's choice:** Single 5-column table

---

## Arch doc depth

| Option | Description | Selected |
|--------|-------------|----------|
| Diagram + 1–2 paragraphs + key files (Recommended) | Per topic: ASCII/Mermaid block diagram, 1–2 paragraphs, bullet list of key files with file:line citations. Implementation-detail-light. | ✓ |
| Deep dive with code excerpts | Quote actual code blocks. Heavy duplication of source; doc rots fast. | |
| Prose narrative, no diagrams | Pure prose, no ASCII art. Faster but harder to scan. | |

**User's choice:** Diagram + 1–2 paragraphs + key files

---

## IPC surface

| Option | Description | Selected |
|--------|-------------|----------|
| Categorized summary + cite preload.js as source of truth (Recommended) | Group ~150+ channels by domain (db-*, transcribe-*, get-*-key, window-*, etc.), give contract pattern per category, point readers to preload.js. | ✓ |
| Full enumerated table of all channels | One row per channel: name / direction / args / return / file:line. Authoritative but rots quickly. | |
| Only channels relevant to backend swap | Restrict to auth bridge, secret storage, cloud-API passthrough. Concise but loses 'whole architecture' framing DOC-04 calls for. | |

**User's choice:** Categorized summary + cite preload.js as source of truth

---

## LiteLLM scope

| Option | Description | Selected |
|--------|-------------|----------|
| Inventory only — don't reshape behavior (Recommended) | List every place a LiteLLM-shaped URL is used; each gets a proposed env-var. v1 doesn't change behavior; Phase 3 swaps defaults; v2 LiteLLM proxy work is downstream. | ✓ |
| Inventory + flag entries that v2 LiteLLM proxy will replace | Same + annotate v2-relevance. Adds forward-looking context but risks over-specifying v2 inside v1 docs. | |

**User's choice:** Inventory only — don't reshape behavior

---

## Audience

| Option | Description | Selected |
|--------|-------------|----------|
| Same as Phase 1 — external implementer (Recommended) | Audience matches Phase 1 D-13: external 3rd party / OSS contributor. Tone: explanatory, complete, no insider jargon. Internal v2 team can read the same doc. | ✓ |
| Internal-team voice | Assume reader has cloned the repo and is doing maintenance work. Tighter prose. Less useful for external self-hosting audience. | |

**User's choice:** Same as Phase 1 — external implementer

---

## Claude's Discretion

The user accepted Claude's discretion on:

- ARCHITECTURE.md table-of-contents ordering (process model first vs. data flow first vs. by-subsystem)
- ASCII vs Mermaid diagram format (consistency within the doc matters; either acceptable)
- Heading hierarchy depth (h2 vs h3 splits per topic)
- Whether to merge "transcription pipeline" + "embeddings pipeline" or keep separate per REQ DOC-04
- Inventory row ordering (by file path / by category / alphabetical) — pick one and apply consistently
- Whether to add a top-of-doc summary table in CONFIG_INVENTORY

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section:

- Mirroring sidecar binary download URLs (sherpa-onnx, qdrant, llama-server) for air-gapped deployments — not required by REQ CFG-01.
- Annotating CONFIG_INVENTORY rows with v2 LiteLLM relevance — over-specification per D-10.
- Full per-channel IPC contract table — categorized summary chosen instead.
- Architectural ADR series — `docs/ARCHITECTURE.md` is descriptive, not decision-driven.
- Diagram tooling beyond ASCII / Mermaid — D-03 allows either; custom pipeline deferred.
