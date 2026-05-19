/**
 * Notes CJM step definitions — exercises the cloud-api passthrough wire
 * path (NOT raw HTTP). See sync-cjm.steps.ts for the cloudCall helper
 * and the shared `the test tenant is authenticated as` step.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { cloudCall } from "./sync-cjm.steps";
import { world } from "./world";

const { When, Then } = createBdd();

type CloudNote = {
  id: string;
  title?: string;
  content?: string;
};
type ListResponse = { notes?: CloudNote[] };
type BatchCreateResponse = {
  created?: Array<{ client_note_id?: string; id?: string }>;
};

When(
  "I cloud-create a note with title {string} and content {string}",
  async ({}, title: string, content: string) => {
    const envelope = await cloudCall<CloudNote>("POST", "/api/notes/create", {
      title,
      content,
    });
    if (envelope.success && envelope.data?.id) {
      world.createdNoteId = envelope.data.id;
    }
  },
);

When(
  "I cloud-batch-create notes with client_note_ids {string}",
  async ({}, idsCsv: string) => {
    const ids = idsCsv.split(",").map((s) => s.trim()).filter(Boolean);
    const items = ids.map((cid, i) => ({
      client_note_id: cid,
      title: `batch-${cid}`,
      content: `batch body ${i}`,
    }));
    const envelope = await cloudCall<BatchCreateResponse>(
      "POST",
      "/api/notes/batch-create",
      { notes: items },
    );
    if (envelope.success && envelope.data?.created) {
      world.batchCreatedIds = envelope.data.created
        .map((c) => c.id)
        .filter((id): id is string => typeof id === "string");
    }
  },
);

When("I cloud-list notes", async ({}) => {
  await cloudCall<ListResponse>("GET", "/api/notes/list");
});

When(
  "I cloud-update the created note with title {string}",
  async ({}, title: string) => {
    await cloudCall<CloudNote>("PATCH", "/api/notes/update", {
      id: world.createdNoteId,
      title,
    });
  },
);

When(
  "I cloud-search notes with query {string}",
  async ({}, query: string) => {
    await cloudCall<ListResponse>("POST", "/api/notes/search", { query });
  },
);

When("I cloud-delete the created note", async ({}) => {
  await cloudCall("DELETE", "/api/notes/delete", { id: world.createdNoteId });
});

When("I cloud-delete-all notes", async ({}) => {
  await cloudCall<{ deleted: number }>("DELETE", "/api/notes/delete-all");
});

Then("the created note has a non-empty id", async ({}) => {
  expect(world.createdNoteId).toBeTruthy();
  expect((world.createdNoteId ?? "").length).toBeGreaterThan(0);
});

Then(
  "the batch-create response maps client_note_id to id for {string}",
  async ({}, idsCsv: string) => {
    const ids = idsCsv.split(",").map((s) => s.trim()).filter(Boolean);
    const data = world.lastCloudEnvelope?.data as BatchCreateResponse | null;
    const created = data?.created ?? [];
    for (const cid of ids) {
      const row = created.find((r) => r.client_note_id === cid);
      expect(row, `missing client_note_id=${cid}`).toBeTruthy();
      expect(typeof row!.id === "string" && row!.id.length > 0).toBe(true);
    }
  },
);

Then("the cloud notes list includes the created note id", async ({}) => {
  const data = world.lastCloudEnvelope?.data as ListResponse | null;
  const ids = (data?.notes ?? []).map((n) => n.id);
  expect(ids).toContain(world.createdNoteId);
});

Then("the cloud notes list does not include the deleted note id", async ({}) => {
  const data = world.lastCloudEnvelope?.data as ListResponse | null;
  const ids = (data?.notes ?? []).map((n) => n.id);
  expect(ids).not.toContain(world.createdNoteId);
});

Then("the cloud notes list is empty", async ({}) => {
  const data = world.lastCloudEnvelope?.data as ListResponse | null;
  expect(data?.notes ?? []).toHaveLength(0);
});

Then("the updated note title equals {string}", async ({}, title: string) => {
  const data = world.lastCloudEnvelope?.data as CloudNote | null;
  expect(data?.title).toBe(title);
});
