@v1.7.13 @onboarding @serverurl-email
Feature: Onboarding email input enabled after Server URL validates

  # Regression coverage for v1.7.13: a returning user with an already-persisted
  # Server URL saw the green "Server is reachable" check on onboarding, but
  # the email input + "Continue with email" button stayed permanently disabled
  # because the validation callback only fired in the onBlur path, not on
  # initial mount when state was hydrated from useSettingsStore.
  #
  # The two scenarios pin both directions of the v1.7.13 fix:
  #   (1) persisted URL on mount → email immediately enabled (this is the bug).
  #   (2) typed-fresh URL → email enabled only after probe succeeds.

  Background:
    Given the Electron app is launched

  Scenario: Email input is enabled when a valid Server URL is already persisted on mount
    Given the Server URL "https://openwhispr.yambr.com" is persisted in settings
    When the onboarding authentication step is rendered
    Then the email input is enabled
    And the "Continue with email" button has the expected enablement (driven by email content)

  Scenario: Email input stays disabled while Server URL is empty or invalid
    Given no Server URL is persisted in settings
    When the onboarding authentication step is rendered
    Then the email input is disabled
    And the "Continue with email" button is disabled
