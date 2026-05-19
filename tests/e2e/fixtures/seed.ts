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
 * Test-tenant pruning is the server team's concern (the endpoint is
 * idempotent on email); we no longer call /api/auth/delete-account on
 * cleanup.
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

export function makeTenant(label = "default"): TestTenant {
  return {
    email: `e2e+${label}-${RUN_ID}@test.local`,
    password: `Pw-${RUN_ID}-${label}-test!`,
    name: `e2e ${label} ${RUN_ID}`,
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
