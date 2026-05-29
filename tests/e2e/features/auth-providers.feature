Feature: Server-driven auth providers
  # Phase 06: the client renders social sign-in buttons dynamically from
  # GET /api/auth/providers (server is the source of truth). This verifies
  # the real endpoint's wire contract that the client's serverProviders.ts
  # parser consumes: { providers: [{ id, name, enabled }], emailVerification }.
  # Pre-auth (auth:false) — no token required, like /api/check-user.

  Scenario: GET /api/auth/providers is public and returns the providers contract
    When I GET "/api/auth/providers"
    Then the response status is 200
    And the response JSON has an array field "providers"
    And every provider entry has string "id", string "name", and boolean "enabled"

  Scenario: provider ids are within the known canonical set
    When I GET "/api/auth/providers"
    Then the response status is 200
    And every provider "id" is one of "google,github,oidc"
