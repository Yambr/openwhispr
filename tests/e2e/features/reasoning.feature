Feature: Cloud reasoning
  # Server contract: POST /api/reason with { messages|text } → { text|content, ... }.
  # Phase 8 matrix row 9: conditional on LiteLLM. The successful path
  # hits an upstream LLM, so it needs paid keys configured on the server.

  @blocked-s5 @requires-paid-keys
  Scenario: Reason with a user message returns a non-empty content
    Given a signed-up tenant labeled "reason"
    When I POST "/api/reason" with a simple "Hello" user message
    Then the response status is 200
    And the reason response has a non-empty content

  Scenario: Reason without auth returns 401
    When I POST "/api/reason" without auth
    Then the response status is 401
