Feature: Authentication
  # Post R1-R18 closure (server Phase 59, verified live 2026-05-20):
  #   - Tenants are seeded via POST /api/_test/seed-tenant (pre-verified).
  #   - DB-backed routes under custom Bearer middleware return 2xx
  #     (postgres reachable, R6).
  #   - sign-in/email accepts a null Origin under OPENWHISPR_TEST_ROUTES
  #     (R18) — drivable from Node's undici fetch.
  #   - The cookie-only /api/auth/* routes (verification-status,
  #     delete-account) are driven with a genuine session cookie from a
  #     real sign-in, NOT the seed-tenant bearer (R15 closure note).
  #     ?email= is optional on verification-status (R5/R15).

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
    # R18 closed (server commits 22d29d7c + cd4c4f9e): sign-in/email
    # accepts a null Origin under OPENWHISPR_TEST_ROUTES — drivable from
    # Node's undici fetch without an Origin spoof.
    Given a signed-up tenant labeled "signin"
    When I POST "/api/auth/sign-in/email" with that tenant credentials
    Then the response status is 200
    And the response carries a session bearer token

  Scenario: Sign-out invalidates the session
    Given a signed-up tenant labeled "signout"
    When I POST "/api/auth/sign-out" as that tenant
    Then the response status is 200

  Scenario: Delete account returns 200
    # R15 closed (server commit 85a67858): /api/auth/delete-account is
    # cookie-only — driven here with a genuine session cookie from a
    # real sign-in.
    Given a signed-in tenant labeled "delete"
    When I DELETE "/api/auth/delete-account" with the session cookie
    Then the response status is 200

  Scenario: Verification status accepts ?email= query param (R5)
    # R5/R15 closed (server commit 85a67858): ?email= is OPTIONAL on
    # /api/auth/verification-status; the route is cookie-only and
    # identity is session-derived.
    Given a signed-in tenant labeled "vstatus"
    When I GET "/api/auth/verification-status" with that tenant email param and the session cookie
    Then the response status is 200
