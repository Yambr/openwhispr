Feature: Notes sync CJM via cloudApiRequest IPC
  # Exercises the REAL client wire path:
  #   NotesService.ts → cloudApi.ts → window.electronAPI.cloudApiRequest
  #     → ipcMain "cloud-api-request" → HTTPS to /api/notes/*
  #
  # Covers Phase 8 COMPATIBILITY-MATRIX MATCH rows (Notes surface, 7 endpoints,
  # closed under server requirement R8 — snake_case batch-create mapping).
  #
  # NOTE: The cloud-api-request IPC handler collapses HTTP status into
  # {success, data}. Step defs assert on `success: true` + `data` shape,
  # not literal HTTP status codes.

  Background:
    Given the test tenant is authenticated as "notes-cjm"

  Scenario: POST /api/notes/create returns a note with an id
    When I cloud-create a note with title "first" and content "hello world"
    Then the cloud request succeeds
    And the created note has a non-empty id

  Scenario: POST /api/notes/batch-create preserves client_note_id mapping (R8)
    When I cloud-batch-create notes with client_note_ids "c-1,c-2"
    Then the cloud request succeeds
    And the cloud response body has key "created"
    And the cloud response body key "created" is a non-empty array
    And the batch-create response maps client_note_id to id for "c-1,c-2"

  Scenario: GET /api/notes/list returns the created note
    When I cloud-create a note with title "listable" and content "body"
    And I cloud-list notes
    Then the cloud request succeeds
    And the cloud notes list includes the created note id

  Scenario: PATCH /api/notes/update renames a note
    When I cloud-create a note with title "before" and content "x"
    And I cloud-update the created note with title "after"
    Then the cloud request succeeds
    And the updated note title equals "after"

  Scenario: POST /api/notes/search returns matching notes
    When I cloud-create a note with title "find-me-please" and content "needle"
    And I cloud-search notes with query "find-me-please"
    Then the cloud request succeeds
    And the cloud notes list includes the created note id

  Scenario: DELETE /api/notes/delete removes the note
    When I cloud-create a note with title "doomed" and content "x"
    And I cloud-delete the created note
    Then the cloud request succeeds
    And I cloud-list notes
    Then the cloud notes list does not include the deleted note id

  Scenario: DELETE /api/notes/delete-all clears the tenant's notes
    When I cloud-create a note with title "ephemeral-1" and content "x"
    And I cloud-create a note with title "ephemeral-2" and content "x"
    And I cloud-delete-all notes
    Then the cloud request succeeds
    And the cloud response body has key "deleted"
    And I cloud-list notes
    Then the cloud notes list is empty
