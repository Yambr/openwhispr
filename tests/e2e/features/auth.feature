Feature: Authentication
  # Post R1/R13 + R6 closure:
  #   - Tenants are seeded via POST /api/_test/seed-tenant (pre-verified).
  #   - DB-backed routes under custom Bearer middleware return 2xx
  #     (postgres reachable, R6).
  # Two scenarios are @blocked-r15: /api/auth/verification-status and
  # /api/auth/delete-account 401 for EVERY valid auth form (re-opens R5).
  # See .planning/phases/08-client-server-audit/SERVER-REQUIREMENTS.md R15.

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

  @blocked-r18
  Scenario: Sign-in with verified user returns a session bearer
    # BLOCKED by SERVER-REQUIREMENTS R18: Better Auth rejects
    # /api/auth/sign-in/email with 403 MISSING_OR_NULL_ORIGIN whenever
    # the request carries Origin: null — which Node's undici fetch
    # always sends from a non-browser caller. The harness is forbidden
    # from spoofing an Origin header (CONTEXT rule 3). The server must
    # accept a null Origin on sign-in under OPENWHISPR_TEST_ROUTES, the
    # same bypass already used for /api/_test/seed-tenant. Un-tag when
    # R18 lands.
    Given a signed-up tenant labeled "signin"
    When I POST "/api/auth/sign-in/email" with that tenant credentials
    Then the response status is 200
    And the response carries a session bearer token

  Scenario: Sign-out invalidates the session
    Given a signed-up tenant labeled "signout"
    When I POST "/api/auth/sign-out" as that tenant
    Then the response status is 200

  @blocked-r15
  Scenario: Delete account returns 200
    # BLOCKED by SERVER-REQUIREMENTS R15: /api/auth/delete-account
    # returns 401 for every valid auth form — seed-tenant bearer, a
    # genuine set-auth-token bearer, AND a genuine fresh Better Auth
    # session cookie. Server-side broken auth wiring on Better-Auth-
    # mounted routes. Un-tag when R15 lands.
    Given a signed-up tenant labeled "delete"
    When I DELETE "/api/auth/delete-account" as that tenant
    Then the response status is 200

  @blocked-r15
  Scenario: Verification status accepts ?email= query param (R5)
    # BLOCKED by SERVER-REQUIREMENTS R15 (re-opens R5): the shipped
    # endpoint requires ?email= (400 without it — the inverse of R5)
    # AND returns 401 for every valid auth form, including a genuine
    # fresh Better Auth session cookie. Un-tag when R15 lands.
    Given a signed-up tenant labeled "vstatus"
    When I GET "/api/auth/verification-status" with that tenant email param and bearer
    Then the response status is 200
