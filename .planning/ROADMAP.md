# Roadmap: Yambr OpenWhispr Fork

## Milestones

- ✅ **v1.7.2 — Documentation + Build-time Configurability + Corporate-Minimal Default** — Phases 1–10 (shipped 2026-05-26, tag `v1.7.9`)
- 🚧 **v1.8.0 — Custom Server URL Onboarding** — planned

## Phases

<details>
<summary>✅ v1.7.2 (Phases 1–10) — SHIPPED 2026-05-26</summary>

- [x] Phase 1: Wire Contract Documentation (3/3 plans)
- [x] Phase 2: Architecture Doc + Hardcode Inventory (3/3 plans)
- [x] Phase 3: Build-time Env Refactor (6/6 plans)
- [x] Phase 4: OAuth Gating, Build Docs, and Parity Gate (5/5 plans) — CFG-03 partial (see audit)
- [x] Phase 04.1: Tree-shaking fix + BILLING/REFERRALS/STREAMING flags (6/6 plans) — INSERTED
- [x] Phase 5: Route Realtime ASR/Diarization through Corporate Backend (4/4 plans)
- [x] Phase 6: Merge upstream OpenWhispr v1.7.2 (recurring maintenance, mode=discuss-skipped)
- [x] Phase 7: Unit + Integration Tests for Phase 04/04.1/05 work (6/6 plans)
- [x] Phase 8: Client↔Server Compatibility Audit (1/1 plan)
- [x] Phase 9: Client E2E Tests (Playwright + Cucumber) (1/1 plan, 44/44 scenarios)
- [x] Phase 10: Corporate-Minimal Provider Lockdown (6/6 plans)

Archived: `.planning/milestones/v1.7.2-ROADMAP.md` · `.planning/milestones/v1.7.2-REQUIREMENTS.md` · `.planning/milestones/v1.7.2-MILESTONE-AUDIT.md` · phase dirs in `.planning/milestones/v1.7.2-phases/`

</details>

### 🚧 v1.8.0 — Custom Server URL Onboarding (Planned)

Goal: enable corporate self-hosters and third-party deployments to point an installed binary at their own backend via a runtime "Server URL" field on the onboarding screen, without rebuilding from source.

Phases — to be defined by `/gsd-new-milestone v1.8.0 --reset-phase-numbers`. Per integration-check INT-01/INT-02, Phase 1 MUST be backend-URL consolidation + dynamic Better Auth refactor BEFORE any UI work.

## Progress

| Phase | Milestone | Plans Complete | Status   | Completed  |
|-------|-----------|----------------|----------|------------|
| 1     | v1.7.2    | 3/3            | Complete | 2026-04-30 |
| 2     | v1.7.2    | 3/3            | Complete | 2026-05-08 |
| 3     | v1.7.2    | 6/6            | Complete | 2026-05-08 |
| 4     | v1.7.2    | 5/5            | Complete | 2026-05-08 |
| 04.1  | v1.7.2    | 6/6            | Complete | 2026-05-09 |
| 5     | v1.7.2    | 4/4            | Complete | 2026-05-09 |
| 6     | v1.7.2    | n/a (recurring)| Complete | 2026-05-22 |
| 7     | v1.7.2    | 6/6            | Complete | 2026-05-15 |
| 8     | v1.7.2    | 1/1            | Complete | 2026-05-18 |
| 9     | v1.7.2    | 1/1            | Complete | 2026-05-20 |
| 10    | v1.7.2    | 6/6            | Complete | 2026-05-21 |
