Feature: Realtime token minting
  # Per BACKEND_SPEC + Phase 8 matrix, the canonical paths are:
  #   POST /api/streaming-token            (AssemblyAI)
  #   POST /api/deepgram-streaming-token   (Deepgram)
  #   POST /api/openai-realtime-token      (OpenAI Realtime)
  #
  # Post R3 closure (2026-05-19): /api/openai-realtime-token now accepts
  # {model, language, streams} and returns {clientSecret} (single) or
  # {clientSecrets:[...]} (multi). The pre-R3 {token} shape is gone.

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

  @requires-paid-keys
  Scenario: OpenAI realtime token mint (single stream) — R3 closure
    When I POST "/api/openai-realtime-token" with auth and body model "gpt-4o-realtime-preview-2024-12-17" language "en" streams 1
    Then the response status is 200
    And the response JSON field "clientSecret" is non-empty

  @requires-paid-keys
  Scenario: OpenAI realtime token mint (two streams) — R3 closure
    When I POST "/api/openai-realtime-token" with auth and body model "gpt-4o-realtime-preview-2024-12-17" language "en" streams 2
    Then the response status is 200
    And the response carries clientSecrets array of length 2
