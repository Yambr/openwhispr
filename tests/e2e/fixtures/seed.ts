/**
 * Test-tenant seed fixture.
 *
 * Seeds a deterministic-but-unique pre-verified user against the running
 * openwhispr-server slim-core stack via the test-only seed endpoint:
 *
 *   POST /api/_test/seed-tenant
 *
 * Server-side gates (per Phase 8 SERVER-REQUIREMENTS R1, closed 2026-05-19):
 *
 *   - NODE_ENV !== "production"
 *   - OPENWHISPR_TEST_ROUTES === "true"    ← exact env-var name on the server
 *
 * If either gate is missing, the server returns 404 and this fixture
 * surfaces a clear actionable error. R1 closure means no email-verify
 * round trip, no cookie parsing, no Mailpit HTML scrape, no fallback
 * chain — the response always includes a Better-Auth-compatible bearer.
 *
 * Test-tenant pruning is the server team's concern; we no longer call
 * /api/auth/delete-account on cleanup.
 *
 * NOTE on uniqueness: as of R14's closure (server commits c96ed3e9 +
 * d391961e) the seed endpoint IS idempotent on email — a duplicate POST
 * returns 200 for the existing user. `makeTenant()` still yields a
 * globally unique email per call (RUN_ID + a process-local monotonic
 * counter) so scenarios sharing a `label` get distinct, independent
 * tenants rather than silently aliasing the same user.
 */

export type TestTenant = {
  email: string;
  password: string;
  name: string;
  token: string | null;
};

export type SeededUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
};

export const BACKEND_URL =
  process.env.OPENWHISPR_E2E_BACKEND_URL ?? "http://localhost:4000";

export const RUN_ID =
  process.env.OPENWHISPR_E2E_RUN_ID ?? `${Date.now()}-${process.pid}`;

/**
 * Process-local monotonic counter. Guarantees that every makeTenant()
 * call produces a distinct email even when callers reuse the `label`
 * argument within a single worker process. Without this the server
 * 500s on the duplicate-email POST (SERVER requirement R14).
 */
let TENANT_SEQ = 0;

export function makeTenant(label = "default"): TestTenant {
  const seq = ++TENANT_SEQ;
  const uniq = `${RUN_ID}-${seq}`;
  return {
    email: `e2e+${label}-${uniq}@test.local`,
    password: `Pw-${uniq}-${label}-test!`,
    name: `e2e ${label} ${uniq}`,
    token: null,
  };
}

export type SeedResult =
  | { ok: true; token: string; user: SeededUser; tenant: TestTenant }
  | { ok: false; status: number; body: string; tenant: TestTenant };

/**
 * POST /api/_test/seed-tenant — returns a pre-verified user + bearer.
 *
 * The endpoint is double-gated server-side (NODE_ENV !== "production"
 * AND OPENWHISPR_TEST_ROUTES === "true"); when either gate is off, the
 * server returns 404 and we surface a clear error.
 */
export async function seedTenant(tenant: TestTenant): Promise<SeedResult> {
  const res = await fetch(`${BACKEND_URL}/api/_test/seed-tenant`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: tenant.email,
      password: tenant.password,
      name: tenant.name,
      verified: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) {
      return {
        ok: false,
        status: res.status,
        body:
          "POST /api/_test/seed-tenant returned 404. The server is not " +
          "running with OPENWHISPR_TEST_ROUTES=true (or NODE_ENV is " +
          "production). Bring it up with " +
          "`cd ../openwhispr-server && OPENWHISPR_TEST_ROUTES=true docker compose up -d`.",
        tenant,
      };
    }
    return { ok: false, status: res.status, body, tenant };
  }

  const json = (await res.json().catch(() => null)) as
    | { token?: unknown; user?: unknown }
    | null;

  if (
    !json ||
    typeof json.token !== "string" ||
    !json.token ||
    !json.user ||
    typeof json.user !== "object"
  ) {
    return {
      ok: false,
      status: res.status,
      body: `seed-tenant OK but response shape unexpected: ${JSON.stringify(json)}`,
      tenant,
    };
  }

  const user = json.user as Record<string, unknown>;
  const seeded: SeededUser = {
    id: String(user.id ?? ""),
    email: String(user.email ?? tenant.email),
    emailVerified: user.emailVerified === true,
    createdAt: String(user.createdAt ?? ""),
  };

  tenant.token = json.token;
  return { ok: true, token: json.token, user: seeded, tenant };
}

export type SignInResult =
  | { ok: true; cookie: string; token: string | null }
  | { ok: false; status: number; body: string };

/**
 * POST /api/auth/sign-in/email — completes a real Better Auth credential
 * sign-in for an already-seeded tenant and returns the session cookie.
 *
 * Why this exists: the seed-tenant bearer (R1/R13) is honored by the
 * custom Bearer middleware (/api/usage, /api/notes/*, /api/v1/keys/*) but
 * NOT by the Better-Auth-mounted routes (/api/auth/verification-status,
 * /api/auth/delete-account) — those are cookie-only by design (server
 * R15 closure note). To drive those routes the harness must hold a
 * genuine session cookie, which means a real sign-in. This is the
 * documented client credential path, not a workaround: the production
 * Electron client signs in and carries the same session cookie.
 *
 * Requires SERVER-REQUIREMENTS R18 (server commits 22d29d7c + cd4c4f9e):
 * sign-in/email accepts a missing/null Origin under OPENWHISPR_TEST_ROUTES.
 */
export async function signIn(tenant: TestTenant): Promise<SignInResult> {
  const res = await fetch(`${BACKEND_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: tenant.email, password: tenant.password }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, body };
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) {
    return {
      ok: false,
      status: res.status,
      body: `sign-in/email OK but no Set-Cookie header: ${(
        await res.text().catch(() => "")
      ).slice(0, 200)}`,
    };
  }

  const json = (await res.json().catch(() => null)) as
    | { token?: unknown }
    | null;
  const token = typeof json?.token === "string" ? json.token : null;
  return { ok: true, cookie, token };
}

/**
 * Convenience: probe the server health BEFORE attempting seed so that
 * an unreachable server surfaces as a single clear error instead of a
 * cascade of step-def failures. Uses /livez (no auth, no DB).
 */
export async function assertServerReachable(): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/livez`);
  if (!res.ok) {
    throw new Error(
      `Server at ${BACKEND_URL} not reachable: GET /livez returned ${res.status}. ` +
        `Bring it up with 'cd ../openwhispr-server && OPENWHISPR_TEST_ROUTES=true docker compose up -d'.`,
    );
  }
}
