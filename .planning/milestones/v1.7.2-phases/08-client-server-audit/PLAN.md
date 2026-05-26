# Phase 8 — Client↔Server Compatibility Audit

**Goal:** Produce an authoritative file:line-anchored mapping of every HTTP call the OpenWhispr client makes against every route exposed by `openwhispr-server/apps/api`. Output: compatibility matrix, client-fix list, server-gap list.

**Scope:** Read-only against `openwhispr-server` (sibling repo). Writes only to `openwhispr/.planning/phases/08-client-server-audit/`.

**Requirements:** QA-01, QA-02, QA-03.

---

## Tasks

### 8-01 — Inventory client HTTP calls

Enumerate every outbound HTTP call from `openwhispr/src` and `openwhispr/main.js` / `openwhispr/preload.js`.

Search patterns (run from `openwhispr/`):
- `grep -rn "fetch(" src/ main.js preload.js`
- `grep -rn "axios" src/ main.js preload.js`
- `grep -rn -E "(BACKEND_URL|backendUrl|OPENWHISPR_BACKEND)" src/ main.js`
- `grep -rn -E "/(api|v1)/" src/ main.js`
- `grep -rn "openwhispr.com" src/ main.js`
- Cross-reference with `docs/BACKEND_SPEC.md` (oracle — already enumerates 19 endpoints).

**Artifact:** `CLIENT-CALLS.md` — table with columns:
| # | File:Line | Method | URL Pattern | Auth | Request Shape | Expected Response | Caller (function) |

Group by feature: auth / notes / transcription / reasoning / oauth / billing / health / updater / misc.

**Commit:** `chore(planning/08): inventory client HTTP calls`.

### 8-02 — Inventory server routes

Enumerate every route registered in `openwhispr-server/apps/api`.

Search patterns (run from `/Users/nick/openwhispr-server/`):
- `grep -rn -E "(app|fastify|router)\.(get|post|put|delete|patch)\(" apps/api/src`
- `grep -rn -E "route\(" apps/api/src`
- `grep -rn "@openwhispr/wire-schemas" apps/api/src` — cross-ref to schema definitions
- Read `packages/wire-schemas/` and `packages/contract-tests/` for canonical contract shape

**Artifact:** `SERVER-ROUTES.md` — table with columns:
| # | File:Line | Method | URL | Auth Middleware | Request Schema (wire-schemas ref) | Response Schema | Notes |

Group by feature in same order as 8-01.

**Commit:** `chore(planning/08): inventory server routes`.

### 8-03 — Build compatibility matrix

Join CLIENT-CALLS.md and SERVER-ROUTES.md row-by-row. For every client call, find matching server route (by URL + method). Verdict per row:

- `MATCH` — URL, method, request shape, response shape, auth all align
- `MISMATCH(<detail>)` — found server route but something differs (e.g., field rename, status code, auth header format)
- `MISSING(server)` — client calls an endpoint not implemented in `apps/api`
- `MISSING(client)` — server exposes a documented endpoint that the client never calls (low priority — informational only)

**Artifact:** `COMPATIBILITY-MATRIX.md` — single table:
| # | Feature | Client (file:line) | Server (file:line) | Method | URL | Verdict | Detail |

Plus summary header: total endpoints / MATCH count / MISMATCH count / MISSING(server) count.

**Commit:** `docs(planning/08): client↔server compatibility matrix`.

### 8-04 — Split into FIXES-CLIENT and SERVER-GAPS

From COMPATIBILITY-MATRIX.md:

- **`FIXES-CLIENT.md`**: every `MISMATCH(...)` row where the cheapest fix is on the client side, plus every `MISSING(server)` that has an obvious client workaround. Each entry: client file:line, current call, required change, severity (BLOCKER/HIGH/MEDIUM/LOW).
- **`SERVER-GAPS.md`**: every `MISSING(server)` row + every `MISMATCH(...)` where the server is wrong vs `docs/BACKEND_SPEC.md`. Written as a requirements-style hand-off the server team can ingest. Each entry: endpoint contract from BACKEND_SPEC.md, what's missing/wrong on server, suggested route signature.

**Commit:** `docs(planning/08): split FIXES-CLIENT and SERVER-GAPS`.

### 8-05 — Verification

Sanity-check the artifacts:

- Every client call enumerated in CLIENT-CALLS.md appears in at least one row of COMPATIBILITY-MATRIX.md
- Every server route in SERVER-ROUTES.md either appears in the matrix or is justified as "not called by client" in SERVER-ROUTES.md notes
- Every BACKEND_SPEC.md endpoint appears in the matrix (or is flagged as a documentation drift)

Write `VERIFICATION.md` with the three checks PASS/FAIL.

**Commit:** `docs(planning/08): verification report`.

---

## Out of Scope

- Fixing any client bug discovered (deferred to Phase 9 or a follow-up)
- Editing `openwhispr-server` (read-only — server gaps land in SERVER-GAPS.md as hand-off, not as PRs to that repo)
- OAuth secret material, billing webhook signatures (cryptographic details out of scope — only contract shape matters here)
- Performance/SLO analysis (Phase 8 of server already covers SLOs)

## Tooling Notes

- The client BACKEND_SPEC.md (already complete from Phase 1) is the oracle for what the contract *should* be. Server is being measured against it, not the other way around.
- The server has its own `packages/contract-tests/` — useful as cross-reference but client-side BACKEND_SPEC.md remains the v1 source of truth from the client's perspective.
- All artifacts live in `.planning/phases/08-client-server-audit/` — do not write into `docs/` (audit is internal/intermediate).
