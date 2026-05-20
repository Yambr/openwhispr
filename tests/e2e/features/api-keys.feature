@server-contract-only
Feature: API keys via cloudApiRequest IPC — v1 envelope (R12)
  # Disposition: server-contract-only via the cloud-api passthrough wire
  # path. The renderer DOES surface a UI for API keys (ApiKeysSection.tsx),
  # but the corporate-minimal default build hides it behind a feature gate
  # and the UI flow adds significant scenario fragility (clipboard / modal
  # interaction) without exercising any wire path that cloudCall doesn't.
  #
  # We assert the R12 v1 envelope shape directly:
  #   V1Response<T> = { success: boolean, data?: T, error?: string, code?: string }
  # The cloud-api-request IPC handler returns its own envelope of the same
  # shape (coincidentally — see ipcHandlers.js:6034); the .data shape of the
  # successful response then carries the server's V1 wrapper.
  #
  # Endpoints (Phase 8 MATCH rows 57-59):
  #   GET    /api/v1/keys/list
  #   POST   /api/v1/keys/create
  #   POST   /api/v1/keys/{id}/revoke

  Background:
    Given the test tenant is authenticated as "v1-keys"

  Scenario: POST /api/v1/keys/create returns plaintext key with V1 envelope (success:true)
    When I cloud-create an API key with name "e2e-key-1" and scopes "read"
    Then the cloud request succeeds
    And the v1 keys response contains success true and data
    And the created API key plaintext is non-empty

  Scenario: GET /api/v1/keys/list returns V1 envelope wrapping keys array
    When I cloud-create an API key with name "e2e-key-2" and scopes "read"
    And I cloud-list API keys
    Then the cloud request succeeds
    And the v1 keys response contains success true and data
    And the v1 keys list includes the created key id

  Scenario: POST /api/v1/keys/{id}/revoke marks the key revoked
    # /api/v1/keys/list returns revoked keys too, each with a
    # `revoked_at` timestamp — the key stays visible for audit, it does
    # not vanish. Revocation is asserted via the revoked_at marker.
    When I cloud-create an API key with name "e2e-key-3" and scopes "read"
    And I cloud-revoke the created API key
    Then the cloud request succeeds
    And I cloud-list API keys
    Then the revoked key is marked revoked in the v1 keys list
