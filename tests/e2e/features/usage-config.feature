Feature: Usage and configuration endpoints

  Background:
    Given a signed-up tenant labeled "usage"

  @blocked-s5
  Scenario: GET /api/usage with auth returns 200 and a quota shape
    When I GET "/api/usage" with auth
    Then the response status is 200
    And the usage response carries at least one of "wordsUsed,wordsRemaining,plan"

  @blocked-s5
  Scenario: GET /api/usage without auth returns 401
    When I GET "/api/usage" without auth
    Then the response status is 401

  @blocked-s5
  Scenario: GET /api/streaming-usage with auth returns 200
    # BACKEND_SPEC documents POST /api/streaming-usage; Phase 8 matrix row 16
    # treats it as the streaming-usage report endpoint. The task brief asks
    # for GET /api/streaming-usage — we honor the brief and treat any 2xx
    # as success since the server can route it as a method-agnostic shim.
    When I GET "/api/streaming-usage" with auth
    Then the response status is 200

  @blocked-s5
  Scenario: GET /api/stt-config returns 200 and a non-empty provider list
    When I GET "/api/stt-config" with auth
    Then the response status is 200
    And the response carries a non-empty providers array

  @blocked-s5
  Scenario: GET /api/note-recording-config returns 200
    When I GET "/api/note-recording-config" with auth
    Then the response status is 200
