import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import {
  BACKEND_URL,
  makeTenant,
  seedTenant,
  signIn,
  type TestTenant,
} from "../fixtures/seed";
import { authHeaders, world } from "./world";

const { Given, When, Then } = createBdd();

async function captureResponse(res: Response): Promise<void> {
  world.lastResponse = res;
  world.lastBodyText = await res.text().catch(() => "");
  try {
    world.lastBody = world.lastBodyText ? JSON.parse(world.lastBodyText) : null;
  } catch {
    world.lastBody = null;
  }
}

Given("a fresh test tenant labeled {string}", async ({}, label: string) => {
  world.tenant = makeTenant(label);
});

Given("a signed-up tenant labeled {string}", async ({}, label: string) => {
  const tenant: TestTenant = makeTenant(label);
  const result = await seedTenant(tenant);
  if (!result.ok) {
    throw new Error(
      `seed-tenant failed (status ${result.status}): ${result.body.slice(0, 240)}`,
    );
  }
  world.tenant = result.tenant;
});

Given(
  "a signed-in tenant labeled {string}",
  async ({}, label: string) => {
    // Seed a pre-verified tenant, then complete a real Better Auth
    // sign-in/email to obtain a genuine session cookie. The cookie-only
    // /api/auth/* routes (verification-status, delete-account) do not
    // accept the seed-tenant bearer — this is the documented client
    // credential path (server R15 closure note).
    const tenant: TestTenant = makeTenant(label);
    const seeded = await seedTenant(tenant);
    if (!seeded.ok) {
      throw new Error(
        `seed-tenant failed (status ${seeded.status}): ${seeded.body.slice(0, 240)}`,
      );
    }
    world.tenant = seeded.tenant;
    const session = await signIn(seeded.tenant);
    if (!session.ok) {
      throw new Error(
        `sign-in/email failed (status ${session.status}): ${session.body.slice(0, 240)}`,
      );
    }
    world.sessionCookie = session.cookie;
  },
);

When("the tenant signs up", async ({}) => {
  expect(world.tenant).not.toBeNull();
  const result = await seedTenant(world.tenant!);
  if (!result.ok) {
    throw new Error(
      `seed-tenant failed (status ${result.status}): ${result.body.slice(0, 240)}`,
    );
  }
  world.tenant = result.tenant;
});

Then(
  "the sign-up succeeds with a non-empty bearer token",
  async ({}) => {
    expect(world.tenant?.token).toBeTruthy();
    expect((world.tenant?.token ?? "").length).toBeGreaterThan(0);
  },
);

When(
  "I POST {string} with that tenant email",
  async ({}, path: string) => {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: world.tenant!.email }),
    });
    await captureResponse(res);
  },
);

When(
  "I POST {string} with that tenant credentials",
  async ({}, path: string) => {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: world.tenant!.email,
        password: world.tenant!.password,
      }),
    });
    await captureResponse(res);
  },
);

When(
  "I POST {string} as that tenant",
  async ({}, path: string) => {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(world.tenant?.token ?? null),
      },
      body: "{}",
    });
    await captureResponse(res);
  },
);

When(
  "I DELETE {string} as that tenant",
  async ({}, path: string) => {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "DELETE",
      headers: { ...authHeaders(world.tenant?.token ?? null) },
    });
    await captureResponse(res);
  },
);

When(
  "I DELETE {string} with the session cookie",
  async ({}, path: string) => {
    // The Better-Auth-mounted /api/auth/delete-account route is
    // cookie-only — it does not accept the seed-tenant bearer (server
    // R15 closure note). Drive it with the genuine session cookie.
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "DELETE",
      headers: { cookie: world.sessionCookie ?? "" },
    });
    await captureResponse(res);
  },
);

When(
  "I GET {string} with that tenant email param and the session cookie",
  async ({}, path: string) => {
    // Per R5/R15 closure: ?email= is OPTIONAL on
    // /api/auth/verification-status (200 with or without it); identity
    // is session-derived. The route is cookie-only — drive it with the
    // genuine session cookie, send ?email= to assert tolerance.
    const url = new URL(`${BACKEND_URL}${path}`);
    url.searchParams.set("email", world.tenant!.email);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { cookie: world.sessionCookie ?? "" },
    });
    await captureResponse(res);
  },
);

Then("the response status is {int}", async ({}, status: number) => {
  expect(world.lastResponse?.status).toBe(status);
});

Then(
  "the response JSON field {string} equals {word}",
  async ({}, field: string, raw: string) => {
    const body = world.lastBody as Record<string, unknown> | null;
    expect(body).toBeTruthy();
    const expected =
      raw === "true" ? true : raw === "false" ? false : raw === "null" ? null : raw;
    expect(body![field]).toEqual(expected);
  },
);

Then("the response carries a session bearer token", async ({}) => {
  const body = world.lastBody as Record<string, unknown> | null;
  const cookieHeader = world.lastResponse?.headers.get("set-cookie") ?? "";
  const tokenInBody = typeof body?.token === "string" && body!.token;
  const tokenInCookie = /better-auth\.session_token=/.test(cookieHeader);
  expect(Boolean(tokenInBody) || tokenInCookie).toBeTruthy();
});
