/**
 * Test-tenant seed fixture.
 *
 * Signs up a deterministic-but-unique user against the running
 * openwhispr-server slim-core stack, stores the session bearer token in
 * process.env.OPENWHISPR_E2E_AUTH_TOKEN, and exposes a cleanup callback
 * that deletes the tenant on suite exit.
 *
 * Blocked on Phase 8 finding S5 (slim-core compose missing pgbouncer
 * overlay) until the server team fixes its DATABASE_URL or ships
 * compose/overlays/storage.yml. While S5 is live, signup returns HTTP 500
 * and this fixture surfaces a clear error so step defs can short-circuit
 * to the @blocked-s5 path.
 */

export type TestTenant = {
  email: string;
  password: string;
  name: string;
  token: string | null;
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

export type SignUpResult =
  | { ok: true; token: string; tenant: TestTenant }
  | { ok: false; status: number; body: string; tenant: TestTenant };

export async function signUp(tenant: TestTenant): Promise<SignUpResult> {
  const res = await fetch(`${BACKEND_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: tenant.email,
      password: tenant.password,
      name: tenant.name,
    }),
  });

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: await res.text(),
      tenant,
    };
  }

  // Better Auth returns the session token either in the JSON body or as
  // a set-cookie. Prefer the JSON shape; fall back to header parsing.
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const token =
    typeof json.token === "string"
      ? json.token
      : extractSessionCookie(res.headers.get("set-cookie"));

  if (!token) {
    return {
      ok: false,
      status: res.status,
      body: `signup OK but no session token in body or cookie: ${JSON.stringify(json)}`,
      tenant,
    };
  }

  tenant.token = token;
  return { ok: true, token, tenant };
}

export async function deleteAccount(tenant: TestTenant): Promise<boolean> {
  if (!tenant.token) return false;
  const res = await fetch(`${BACKEND_URL}/api/delete-account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tenant.token}` },
  });
  return res.ok;
}

function extractSessionCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  // Better Auth uses "better-auth.session_token=<jwt>; ...".
  const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Convenience: probe the server health BEFORE attempting signup so that
 * S5 (or any other infra outage) surfaces as a single clear error instead
 * of a cascade of step-def failures.
 */
export async function assertServerReachable(): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/livez`);
  if (!res.ok) {
    throw new Error(
      `Server at ${BACKEND_URL} not reachable: GET /livez returned ${res.status}. ` +
        `Bring it up with 'cd ../openwhispr-server && docker compose up -d'.`,
    );
  }
}
