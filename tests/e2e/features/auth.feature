Feature: Authentication
  # Post R1 + R5 + R6 closure (2026-05-19):
  #   - Tenants are seeded via POST /api/_test/seed-tenant (pre-verified).
  #   - /api/auth/verification-status accepts ?email= query param (R5).
  #   - All DB-backed routes return 2xx; pgbouncer/postgres reachable (R6).

  Scenario: Seeded tenant carries a non-empty bearer token (R1)
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

  Scenario: Sign-in with verified user returns a session bearer
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

  Scenario: Verification status accepts ?email= query param (R5)
    # Pre-R5 the server warned or errored on ?email=. R5 closure: server
    # tolerates the param, continues deriving identity from session/Bearer.
    Given a signed-up tenant labeled "vstatus"
    When I GET "/api/auth/verification-status" with that tenant email param and bearer
    Then the response status is 200
