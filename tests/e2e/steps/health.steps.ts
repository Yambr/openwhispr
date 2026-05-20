import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { world } from "./world";

const { Then } = createBdd();

// GET steps live in usage.steps.ts ("I GET {string} without auth").

Then(
  "the response header {string} equals {string}",
  async ({}, name: string, value: string) => {
    const got = world.lastResponse?.headers.get(name) ?? "";
    expect(got).toBe(value);
  },
);

Then(
  "the response header {string} contains {string}",
  async ({}, name: string, fragment: string) => {
    const got = world.lastResponse?.headers.get(name) ?? "";
    expect(got).toContain(fragment);
  },
);

Then(
  "the readyz postgres subsystem reports ok",
  async ({}) => {
    // /readyz is a Kubernetes-style readiness probe: it returns 503 if
    // ANY subsystem is degraded, 200 only when all are healthy. R6
    // closure is specifically about POSTGRES reachability, so we assert
    // the postgres subsystem ok flag directly rather than the overall
    // 200 — that decouples this check from operator-dependent upstreams
    // (LiteLLM keys / outbound allowlist) which legitimately degrade the
    // aggregate probe. See SERVER-REQUIREMENTS R16 for the LiteLLM SSRF
    // self-block that keeps the aggregate at 503.
    const body = world.lastBody as
      | { postgres?: { ok?: boolean } }
      | null;
    expect(body, "readyz returned no JSON body").toBeTruthy();
    expect(
      body?.postgres?.ok,
      `readyz postgres subsystem not ok: ${JSON.stringify(body)}`,
    ).toBe(true);
  },
);

Then(
  "the response status is 200 or 503",
  async ({}) => {
    const status = world.lastResponse?.status;
    expect([200, 503]).toContain(status);
  },
);

Then(
  "the response header {string} is absent",
  async ({}, name: string) => {
    // Per R4 closure: /api/health no longer carries deprecation / link
    // headers. Assert the header is missing entirely (null), not merely
    // empty — a fetch header API returns null when the header is unset.
    const got = world.lastResponse?.headers.get(name);
    expect(got, `expected header '${name}' to be absent, got '${got}'`).toBeNull();
  },
);
