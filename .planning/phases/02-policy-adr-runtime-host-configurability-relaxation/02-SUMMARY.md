---
phase: 02
phase_name: policy-adr-runtime-host-configurability-relaxation
completed: 2026-05-27
status: passed
requirements-completed: []
plans: 1 (docs-only, no SPEC/CONTEXT/PLAN ceremony)
mode: docs-policy
---

# Phase 2 — Policy ADR — Runtime Host Configurability Relaxation — Summary

## One-liner

Formalized the conscious relaxation of "Build-time only configurability" rule for backend-host selection only — published as `docs/adr/ADR-001-runtime-host-configurability.md` with explicit threat model and 7 enumerated mitigations M1–M7; PROJECT.md Constraints + Key Decisions reference the ADR.

## Delivered

- `docs/adr/ADR-001-runtime-host-configurability.md` — full ADR text with status, context, decision, threat model, mitigations M1-M7, "what's NOT relaxed", consequences, implementation phase mapping.
- `.planning/PROJECT.md`:
  - Constraints section: build-time rule amended with link to ADR-001 and explicit reference to mitigations M1–M6
  - Key Decisions table: Pivot 2026-05-26 row gains link to ADR-001

## Acceptance

All 4 ROADMAP success criteria met:
- PROJECT.md Constraints explicitly names backend host as the ONE relaxed axis ✓
- Key Decisions has 2026-05-XX entry with phishing threat model ✓
- Mitigations enumerated (M1-M7 in ADR; M1-M6 in PROJECT.md ref) ✓
- ADR committed atomically before Phase 3 begins ✓ (commit a8e85851)

## Decisions / Lessons

1. **ADR in `docs/adr/`, not `.planning/`.** ADRs are public documentation third parties may need to read — same logic as `docs/BACKEND_SPEC.md`. Established `docs/adr/` directory for future ADRs.
2. **Mitigation M7 (audit trail) deferred to v1.9.0 backlog.** Logging host changes at debug level is good hygiene but not required for v1.8.0 acceptance.
3. **Skipped formal SPEC/CONTEXT/PLAN ceremony.** Phase 2 = policy work, no acceptance requirements; one docs commit + this SUMMARY are sufficient.

## Next

Phase 3 — Build-time gate `OPENWHISPR_ALLOW_CUSTOM_HOST` (BG-01, BG-02).
