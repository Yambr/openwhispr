/**
 * Transcriptions CJM step definitions — exercises the cloud-api
 * passthrough wire path. NOTE: these are RECORD CRUD endpoints
 * (/api/transcriptions/*), NOT audio inference (/api/transcribe).
 * See sync-cjm.steps.ts for cloudCall + the shared auth step.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { cloudCall } from "./sync-cjm.steps";
import { world } from "./world";

const { When, Then } = createBdd();

type CloudTranscription = { id: string; text?: string };
type ListResponse = { transcriptions?: CloudTranscription[] };
type BatchCreateResponse = {
  created?: Array<{ id?: string; client_transcription_id?: string }>;
};
type BatchDeleteResponse = { deleted?: string[] };

When(
  "I cloud-create a transcription with text {string}",
  async ({}, text: string) => {
    const envelope = await cloudCall<CloudTranscription>(
      "POST",
      "/api/transcriptions/create",
      { text, source: "e2e-test" },
    );
    if (envelope.success && envelope.data?.id) {
      world.createdTranscriptionId = envelope.data.id;
    }
  },
);

When(
  "I cloud-batch-create transcriptions with texts {string}",
  async ({}, textsCsv: string) => {
    const texts = textsCsv.split(",").map((s) => s.trim()).filter(Boolean);
    const items = texts.map((t, i) => ({
      client_transcription_id: `ct-${i}-${t}`,
      text: t,
      source: "e2e-test",
    }));
    await cloudCall<BatchCreateResponse>(
      "POST",
      "/api/transcriptions/batch-create",
      { transcriptions: items },
    );
  },
);

When("I cloud-list transcriptions", async ({}) => {
  await cloudCall<ListResponse>("GET", "/api/transcriptions/list");
});

When(
  "I cloud-batch-delete transcriptions including the created id",
  async ({}) => {
    await cloudCall<BatchDeleteResponse>(
      "POST",
      "/api/transcriptions/batch-delete",
      { ids: [world.createdTranscriptionId] },
    );
  },
);

When("I cloud-delete the created transcription", async ({}) => {
  await cloudCall("DELETE", "/api/transcriptions/delete", {
    id: world.createdTranscriptionId,
  });
});

Then("the created transcription has a non-empty id", async ({}) => {
  expect(world.createdTranscriptionId).toBeTruthy();
});

Then(
  "the cloud transcriptions list includes the created transcription id",
  async ({}) => {
    const data = world.lastCloudEnvelope?.data as ListResponse | null;
    const ids = (data?.transcriptions ?? []).map((t) => t.id);
    expect(ids).toContain(world.createdTranscriptionId);
  },
);

Then(
  "the cloud transcriptions list does not include the deleted transcription id",
  async ({}) => {
    const data = world.lastCloudEnvelope?.data as ListResponse | null;
    const ids = (data?.transcriptions ?? []).map((t) => t.id);
    expect(ids).not.toContain(world.createdTranscriptionId);
  },
);
