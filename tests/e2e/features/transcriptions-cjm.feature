Feature: Transcriptions sync CJM via cloudApiRequest IPC
  # Exercises the REAL client wire path via TranscriptionsService → cloudApi → IPC.
  # Covers Phase 8 COMPATIBILITY-MATRIX MATCH rows 52-56 (R11 closed —
  # transcription RECORD CRUD, DISTINCT from /api/transcribe audio inference).
  # These scenarios operate on the persistence layer only.

  Background:
    Given the test tenant is authenticated as "trans-cjm"

  Scenario: POST /api/transcriptions/create stores a transcription record
    When I cloud-create a transcription with text "hello world"
    Then the cloud request succeeds
    And the created transcription has a non-empty id

  Scenario: POST /api/transcriptions/batch-create stores multiple records
    When I cloud-batch-create transcriptions with texts "alpha,beta,gamma"
    Then the cloud request succeeds
    And the cloud response body has key "created"
    And the cloud response body key "created" is a non-empty array

  Scenario: GET /api/transcriptions/list returns the created record
    When I cloud-create a transcription with text "listable transcription"
    And I cloud-list transcriptions
    Then the cloud request succeeds
    And the cloud transcriptions list includes the created transcription id

  Scenario: POST /api/transcriptions/batch-delete removes records by ids
    When I cloud-create a transcription with text "doomed-1"
    And I cloud-batch-delete transcriptions including the created id
    Then the cloud request succeeds
    And the cloud response body has key "deleted"

  Scenario: DELETE /api/transcriptions/delete removes a single record
    When I cloud-create a transcription with text "doomed-single"
    And I cloud-delete the created transcription
    Then the cloud request succeeds
    And I cloud-list transcriptions
    Then the cloud transcriptions list does not include the deleted transcription id
