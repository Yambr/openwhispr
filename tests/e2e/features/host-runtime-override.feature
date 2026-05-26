@phase1 @host-runtime-override
Feature: Backend URL runtime override (Phase 1 HOST-02)

  Background:
    Given the Electron app is launched

  Scenario: Default — authClient targets build-time AUTH_URL
    Given no Server URL is persisted in settings
    When I read authClient base URL via renderer evaluate
    Then it equals the build-time AUTH_URL default

  Scenario: Runtime override — authClient swaps to persisted host
    When the renderer persists serverUrl to a local mock backend
    And I trigger authClient signIn email via renderer
    Then the next outbound auth request hits the local mock backend
    And no outbound auth request hits the build-time AUTH_URL default

  Scenario: Clear override — authClient reverts to default
    Given the persisted Server URL has been set then cleared
    When I read authClient base URL via renderer evaluate
    Then it equals the build-time AUTH_URL default
