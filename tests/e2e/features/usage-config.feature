Feature: Usage and configuration endpoints

  Background:
    Given a signed-up tenant labeled "usage"

  Scenario: GET /api/usage with auth returns 200 and a quota shape
    When I GET "/api/usage" with auth
    Then the response status is 200
    And the usage response carries at least one of "wordsUsed,wordsRemaining,plan"

  Scenario: GET /api/usage without auth returns 401
    When I GET "/api/usage" without auth
    Then the response status is 401

  Scenario: POST /api/streaming-usage with auth returns 200
    # /api/streaming-usage is POST-only (a GET returns 404) and requires
    # the full usage-report body documented in BACKEND_SPEC § POST
    # /api/streaming-usage. An earlier draft of this scenario invented a
    # bodyless GET; corrected to the real contract.
    When I POST "/api/streaming-usage" with auth and a streaming-usage report body
    Then the response status is 200

  Scenario: GET /api/stt-config returns 200 and a provider list
    # availableProviders MAY be empty — it reflects which STT provider
    # keys the operator configured server-side. The contract guarantees
    # a well-formed array, not a populated one.
    When I GET "/api/stt-config" with auth
    Then the response status is 200
    And the response carries a providers array

  Scenario: GET /api/note-recording-config returns 200
    When I GET "/api/note-recording-config" with auth
    Then the response status is 200
