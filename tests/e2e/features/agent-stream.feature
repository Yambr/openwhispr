Feature: Agent streaming
  # POST /api/agent/stream returns application/x-ndjson; the final chunk
  # carries finishReason: "stop". POST /api/agent/web-search returns
  # { results: [...] } per BACKEND_SPEC; the task brief calls the array
  # `sources` — we accept either field name.

  Background:
    Given a signed-up tenant labeled "agent"

  @requires-paid-keys
  Scenario: Agent stream emits NDJSON with a finish chunk
    When I POST "/api/agent/stream" with a simple user message
    Then the response status is 200
    And the stream contained at least one text-delta chunk
    And the stream terminal chunk has finishReason "stop"

  @requires-paid-keys
  Scenario: Agent web-search returns a results array
    When I POST "/api/agent/web-search" with query "openwhispr"
    Then the response status is 200
    And the response carries a results array
