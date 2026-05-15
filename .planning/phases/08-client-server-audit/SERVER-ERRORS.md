# Server Errors Log

Build/runtime failures observed against `openwhispr-server` while doing
client-side Phase 8/9 work. **Read-only against the server repo** — fixes
land on the user's side, not mine. This file is the hand-off feed.

Format: most recent first. Each entry: date, command, root cause, fix
suggestion (server-side), client-side workaround if any.

---

## 2026-05-15 — `docker compose build` fails on api + worker

**Command:** `cd /Users/nick/openwhispr-server && docker compose build --pull`

**Error:**
```
ERR_PNPM_WORKSPACE_PKG_NOT_FOUND
In apps/api: "@openwhispr/byok-guard@workspace:*" is in the dependencies
but no package named "@openwhispr/byok-guard" is present in the workspace
```

**Root cause:** `apps/api/package.json` and `apps/worker/package.json`
both list `@openwhispr/byok-guard` as a workspace dep, and
`packages/byok-guard/` exists on disk, but their Dockerfiles don't COPY
the byok-guard manifest or source into the builder/prod-deps stages.

**Fix on server side (3 Dockerfiles, 5 lines total):**

`apps/api/Dockerfile`, builder stage — add after the email COPY at line 55:
```dockerfile
COPY packages/byok-guard/package.json packages/byok-guard/
```
…and after the email source COPY at line 69:
```dockerfile
COPY packages/byok-guard packages/byok-guard
```
`apps/api/Dockerfile`, prod-deps stage — add after the email manifest at line 98:
```dockerfile
COPY packages/byok-guard/package.json packages/byok-guard/
```

`apps/worker/Dockerfile`, builder stage — add after the email COPY at line 33:
```dockerfile
COPY packages/byok-guard/package.json packages/byok-guard/
```
…and after the email source COPY at line 40:
```dockerfile
COPY packages/byok-guard packages/byok-guard
```
`apps/worker/Dockerfile`, prod-deps stage — add after the email manifest at line 53:
```dockerfile
COPY packages/byok-guard/package.json packages/byok-guard/
```

**Client-side workaround:** none. Currently-running images keep working
(they were built before byok-guard was added to the workspace) but a
fresh `docker compose build` will fail until the Dockerfiles are
patched.

**Status:** blocker for any fresh rebuild. Tracked also as S6 in
`SERVER-GAPS.md`.

---

## 2026-05-15 — Slim-core `docker compose up` exposes pgbouncer ENOTFOUND on every DB call

**Command:** plain `docker compose up -d` (no overlays).

**Error:** (from `docker compose logs api`)
```
better-auth/dist/api/routes/sign-up.mjs:164
  errno: -3008, code: 'ENOTFOUND', syscall: 'getaddrinfo', hostname: 'pgbouncer'
```

Hits every DB-backed route: `/api/auth/sign-up/email`, `/api/check-user`,
`/api/usage`, `/readyz`, etc. All return 500 (or 503 for readyz).

**Root cause:** `DATABASE_URL` for both api and worker is
`postgres://...@pgbouncer:5432/openwhispr`, but slim-core base compose
(Phase 14 / SLIM-01) explicitly moved pgbouncer out of base into an
overlay. The overlay file `compose/overlays/storage.yml` referenced in
the top-of-file SLIM-CORE comment doesn't exist yet in the server repo.

**Fix on server side, pick one:**
- (a) Ship `compose/overlays/storage.yml` per the SLIM-CORE comment, and
  document `docker compose -f docker-compose.yml -f compose/overlays/storage.yml up`
  as the standard dev/test command; OR
- (b) Repoint `DATABASE_URL` in slim-core base directly at `postgres:5432`
  (pgbouncer is a prod-time pool manager, not a dev/test requirement).

**Client-side workaround:** none. Suite tags 21 of 29 Phase 9 e2e
scenarios `@blocked-s5` so they auto-skip until this lands. The
remaining 4 unblocked scenarios (livez, /api/health, two no-auth 401
checks) pass without DB access.

**Status:** blocker for Phase 9 runtime coverage. Tracked also as S5 in
`SERVER-GAPS.md`.
