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

  @blocked-r16
  Scenario: Empty file returns 400
    # BLOCKED by SERVER-REQUIREMENTS R16 (second facet): an empty-file
    # upload returns 502 {"error":"Upstream blocked by SSRF policy"}
    # instead of 400. The server forwards the zero-byte file to the STT
    # upstream (no empty-file input validation) and its own SSRF
    # allowlist then blocks the internal upstream host. Un-tag when R16
    # lands.
    Given a signed-up tenant labeled "transcribe"
    When I POST a multipart "/api/transcribe" with an empty file
    Then the response status is 400

  Scenario: Missing auth returns 401
    When I POST a multipart "/api/transcribe" with an empty file and no auth
    Then the response status is 401
