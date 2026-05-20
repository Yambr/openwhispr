Feature: Cloud transcription
  # Server contract: POST /api/transcribe (multipart). Conditional on
  # LiteLLM wiring on the server. The successful path requires real
  # upstream STT API keys, hence @requires-paid-keys.

  @requires-paid-keys
  Scenario: Multipart upload with a real WAV returns transcribed text
    Given a signed-up tenant labeled "transcribe"
    When I POST a multipart "/api/transcribe" with the hello-world WAV
    Then the response status is 200
    And the response JSON field "text" is non-empty

  Scenario: Empty file returns 400
    # R16 closed (server commits f512dea5 + d416f231): a zero-byte file
    # part is rejected with 400 before any upstream call.
    Given a signed-up tenant labeled "transcribe"
    When I POST a multipart "/api/transcribe" with an empty file
    Then the response status is 400

  Scenario: Missing auth returns 401
    When I POST a multipart "/api/transcribe" with an empty file and no auth
    Then the response status is 401
