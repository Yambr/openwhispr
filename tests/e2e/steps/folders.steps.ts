/**
 * Folders CJM step definitions — exercises the cloud-api passthrough
 * wire path (NOT raw HTTP). See sync-cjm.steps.ts for cloudCall + the
 * shared "test tenant is authenticated" step.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { cloudCall } from "./sync-cjm.steps";
import { world } from "./world";

const { When, Then } = createBdd();

type CloudFolder = { id: string; name?: string };
type ListResponse = { folders?: CloudFolder[] };
type BatchCreateResponse = {
  created?: Array<{ client_folder_id?: string; id?: string; name?: string }>;
};

When(
  "I cloud-create a folder with name {string}",
  async ({}, name: string) => {
    const envelope = await cloudCall<CloudFolder>(
      "POST",
      "/api/folders/create",
      { name },
    );
    if (envelope.success && envelope.data?.id) {
      world.createdFolderId = envelope.data.id;
    }
  },
);

When(
  "I cloud-batch-create folders with names {string}",
  async ({}, namesCsv: string) => {
    const names = namesCsv.split(",").map((s) => s.trim()).filter(Boolean);
    const items = names.map((n, i) => ({
      client_folder_id: `cf-${i}-${n}`,
      name: n,
    }));
    await cloudCall<BatchCreateResponse>("POST", "/api/folders/batch-create", {
      folders: items,
    });
  },
);

When("I cloud-list folders", async ({}) => {
  await cloudCall<ListResponse>("GET", "/api/folders/list");
});

When(
  "I cloud-update the created folder with name {string}",
  async ({}, name: string) => {
    await cloudCall<CloudFolder>("PATCH", "/api/folders/update", {
      id: world.createdFolderId,
      name,
    });
  },
);

When("I cloud-delete the created folder", async ({}) => {
  await cloudCall("DELETE", "/api/folders/delete", {
    id: world.createdFolderId,
  });
});

Then("the created folder has a non-empty id", async ({}) => {
  expect(world.createdFolderId).toBeTruthy();
  expect((world.createdFolderId ?? "").length).toBeGreaterThan(0);
});

Then(
  "the cloud folders list includes the created folder id",
  async ({}) => {
    const data = world.lastCloudEnvelope?.data as ListResponse | null;
    const ids = (data?.folders ?? []).map((f) => f.id);
    expect(ids).toContain(world.createdFolderId);
  },
);

Then(
  "the cloud folders list does not include the deleted folder id",
  async ({}) => {
    const data = world.lastCloudEnvelope?.data as ListResponse | null;
    const ids = (data?.folders ?? []).map((f) => f.id);
    expect(ids).not.toContain(world.createdFolderId);
  },
);

Then("the updated folder name equals {string}", async ({}, name: string) => {
  const data = world.lastCloudEnvelope?.data as CloudFolder | null;
  expect(data?.name).toBe(name);
});
