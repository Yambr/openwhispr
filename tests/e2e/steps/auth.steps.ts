import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import {
  BACKEND_URL,
  makeTenant,
  seedTenant,
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
