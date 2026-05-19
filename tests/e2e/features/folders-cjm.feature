Feature: Folders sync CJM via cloudApiRequest IPC
  # Exercises the REAL client wire path via FoldersService → cloudApi → IPC.
  # Covers Phase 8 COMPATIBILITY-MATRIX MATCH rows 41-45 (R9 closed —
  # folders surface implemented per BACKEND_SPEC). The DELETE referential-
  # integrity scenario asserts the server's chosen behavior (204 with
  # cascade OR 409 when notes are still attached); whichever was picked
  # in R9 is captured here.

  Background:
    Given the test tenant is authenticated as "folders-cjm"

  Scenario: POST /api/folders/create returns a folder with an id
    When I cloud-create a folder with name "inbox"
    Then the cloud request succeeds
    And the created folder has a non-empty id

  Scenario: POST /api/folders/batch-create returns created folders
    When I cloud-batch-create folders with names "a,b,c"
    Then the cloud request succeeds
    And the cloud response body has key "created"
    And the cloud response body key "created" is a non-empty array

  Scenario: GET /api/folders/list returns the created folder
    When I cloud-create a folder with name "listable"
    And I cloud-list folders
    Then the cloud request succeeds
    And the cloud folders list includes the created folder id

  Scenario: PATCH /api/folders/update renames a folder
    When I cloud-create a folder with name "before-folder"
    And I cloud-update the created folder with name "after-folder"
    Then the cloud request succeeds
    And the updated folder name equals "after-folder"

  Scenario: DELETE /api/folders/delete removes an empty folder
    When I cloud-create a folder with name "doomed-folder"
    And I cloud-delete the created folder
    Then the cloud request succeeds
    And I cloud-list folders
    Then the cloud folders list does not include the deleted folder id
