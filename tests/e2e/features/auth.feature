Feature: Authentication
  # All scenarios depend on Better Auth + DB. Blocked by Phase 8 finding S5
  # (slim-core compose missing pgbouncer overlay → all DB-backed routes 500).

  Scenario: Sign-up new user returns 200 with session token
    Given a fresh test tenant labeled "signup"
    When the tenant signs up
    Then the sign-up succeeds with a non-empty bearer token

  Scenario: check-user with new email returns exists:false
    Given a fresh test tenant labeled "check-new"
    When I POST "/api/check-user" with that tenant email
    Then the response status is 200
    And the response JSON field "exists" equals false

  Scenario: check-user with existing email returns exists:true
    Given a signed-up tenant labeled "check-existing"
    When I POST "/api/check-user" with that tenant email
    Then the response status is 200
    And the response JSON field "exists" equals true

  Scenario: Sign-in with verified user reaches the main app
    Given a signed-up tenant labeled "signin"
    When I POST "/api/auth/sign-in/email" with that tenant credentials
    Then the response status is 200
    And the response carries a session bearer token

  Scenario: Sign-out invalidates the session
    Given a signed-up tenant labeled "signout"
    When I POST "/api/auth/sign-out" as that tenant
    Then the response status is 200

  Scenario: Delete account returns 200
    Given a signed-up tenant labeled "delete"
    When I DELETE "/api/auth/delete-account" as that tenant
    Then the response status is 200
