import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { BACKEND_URL, authHeaders, world } from "./world";

const { When, Then } = createBdd();

async function captureResponse(res: Response): Promise<void> {
  world.lastResponse = res;
  world.lastBodyText = await res.text().catch(() => "");
  try {
    world.lastBody = world.lastBodyText ? JSON.parse(world.lastBodyText) : null;
  } catch {
    world.lastBody = null;
  }
}

function jsonHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    ...authHeaders(world.tenant?.token ?? null),
  };
}

When(
  "I create a note with title {string} and content {string}",
  async ({}, title: string, content: string) => {
    const res = await fetch(`${BACKEND_URL}/api/notes/create`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ title, content }),
    });
    await captureResponse(res);
    const body = world.lastBody as Record<string, unknown> | null;
    const id =
      (body && typeof body.id === "string" && body.id) ||
      (body && typeof (body as { note?: { id?: string } }).note?.id === "string"
        ? (body as { note: { id: string } }).note.id
        : null);
    if (id) world.createdNoteId = id;
  },
);

When("I list notes", async ({}) => {
  const res = await fetch(`${BACKEND_URL}/api/notes/list`, {
    method: "GET",
    headers: jsonHeaders(),
  });
  await captureResponse(res);
});

When(
  "I update the created note with title {string}",
  async ({}, title: string) => {
    const res = await fetch(`${BACKEND_URL}/api/notes/update`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ id: world.createdNoteId, title }),
    });
    await captureResponse(res);
  },
);

When("I delete the created note", async ({}) => {
  const res = await fetch(`${BACKEND_URL}/api/notes/delete`, {
    method: "DELETE",
    headers: jsonHeaders(),
    body: JSON.stringify({ id: world.createdNoteId }),
  });
  await captureResponse(res);
});

Then("the response carries a note id", async ({}) => {
  expect(world.createdNoteId).toBeTruthy();
});

Then("the notes list includes the created note id", async ({}) => {
  const body = world.lastBody as
    | { notes?: Array<{ id?: string }> }
    | Array<{ id?: string }>
    | null;
  const list = Array.isArray(body) ? body : body?.notes ?? [];
  const ids = list.map((n) => n.id);
  expect(ids).toContain(world.createdNoteId);
});

Then("the notes list does not include the deleted note id", async ({}) => {
  const body = world.lastBody as
    | { notes?: Array<{ id?: string }> }
    | Array<{ id?: string }>
    | null;
  const list = Array.isArray(body) ? body : body?.notes ?? [];
  const ids = list.map((n) => n.id);
  expect(ids).not.toContain(world.createdNoteId);
});
