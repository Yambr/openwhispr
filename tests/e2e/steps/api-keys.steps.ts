/**
 * API keys CJM step definitions — exercises the cloud-api passthrough
 * wire path. Per R12 closure (2026-05-19), the /api/v1/keys/* endpoints
 * return the v1 envelope:
 *
 *   { success: boolean, data?: T, error?: string, code?: string }
 *
 * The cloud-api-request IPC handler returns its own outer envelope of
 * the same shape (success → 2xx, data → JSON body). So the renderer
 * sees: envelope.success && envelope.data.success && envelope.data.data
 * (the server's V1 wrapper around the actual payload). We assert both
 * layers.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { cloudCall } from "./sync-cjm.steps";
import { world } from "./world";

const { When, Then } = createBdd();

type V1<T> = { success: boolean; data?: T; error?: string; code?: string };
type ApiKey = { id: string; name: string; key_prefix: string };
type CreateResponse = ApiKey & { key: string };
type ListResponse = { keys: ApiKey[] };

// Module-level scratch for api-keys feature (kept narrow on purpose).
const apiKeysState: {
  createdId: string | null;
  createdPlaintext: string | null;
} = { createdId: null, createdPlaintext: null };

When(
  "I cloud-create an API key with name {string} and scopes {string}",
  async ({}, name: string, scopesCsv: string) => {
    const scopes = scopesCsv.split(",").map((s) => s.trim()).filter(Boolean);
    const envelope = await cloudCall<V1<CreateResponse>>(
      "POST",
      "/api/v1/keys/create",
      { name, scopes },
    );
    if (envelope.success && envelope.data?.data?.id) {
      apiKeysState.createdId = envelope.data.data.id;
      apiKeysState.createdPlaintext = envelope.data.data.key ?? null;
    }
  },
);

When("I cloud-list API keys", async ({}) => {
  await cloudCall<V1<ListResponse>>("GET", "/api/v1/keys/list");
});

When("I cloud-revoke the created API key", async ({}) => {
  if (!apiKeysState.createdId) {
    throw new Error("No created API key id captured — preceding create step failed?");
  }
  await cloudCall<V1<{ revoked: true }>>(
    "POST",
    `/api/v1/keys/${apiKeysState.createdId}/revoke`,
  );
});

Then(
  "the v1/keys response contains success true and data",
  async ({}) => {
    const data = world.lastCloudEnvelope?.data as V1<unknown> | null;
    expect(data, "no inner v1 envelope").toBeTruthy();
    expect(data!.success).toBe(true);
    expect(data!.data, "v1.data missing").toBeTruthy();
  },
);

Then("the created API key plaintext is non-empty", async ({}) => {
  expect(apiKeysState.createdPlaintext).toBeTruthy();
  expect((apiKeysState.createdPlaintext ?? "").length).toBeGreaterThan(0);
});

Then("the v1/keys list includes the created key id", async ({}) => {
  const data = world.lastCloudEnvelope?.data as V1<ListResponse> | null;
  const ids = (data?.data?.keys ?? []).map((k) => k.id);
  expect(ids).toContain(apiKeysState.createdId);
});

Then("the v1/keys list does not include the revoked key id", async ({}) => {
  const data = world.lastCloudEnvelope?.data as V1<ListResponse> | null;
  const ids = (data?.data?.keys ?? []).map((k) => k.id);
  expect(ids).not.toContain(apiKeysState.createdId);
});
