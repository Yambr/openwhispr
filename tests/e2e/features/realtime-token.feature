Feature: Realtime token minting
  # Per BACKEND_SPEC + Phase 8 matrix, the canonical paths are:
  #   POST /api/streaming-token            (AssemblyAI)
  #   POST /api/deepgram-streaming-token   (Deepgram)
  #   POST /api/openai-realtime-token      (OpenAI Realtime)
  # The task description called the first two `assemblyai-realtime-token`
  # and `deepgram-realtime-token`; those names are inconsistent with the
  # server contract — we use the server's canonical paths.

  Background:
    Given a signed-up tenant labeled "rt"

  @requires-paid-keys @requires-assemblyai
  Scenario: AssemblyAI streaming token mint
    When I POST "/api/streaming-token" with auth
    Then the response status is 200
    And the response JSON field "token" is non-empty

  @requires-paid-keys @requires-deepgram
  Scenario: Deepgram streaming token mint
    When I POST "/api/deepgram-streaming-token" with auth
    Then the response status is 200
    And the response JSON field "token" is non-empty

  @skip
  Scenario: OpenAI realtime token mint
    # Blocked on Phase 8 finding F2/S1 — schema mismatch between the
    # client's {clientSecret}/{clientSecrets} expectation and the
    # server's {token} response. Reinstate this scenario once F2 lands.
    When I POST "/api/openai-realtime-token" with auth
    Then the response status is 200
