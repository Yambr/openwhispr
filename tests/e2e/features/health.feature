Feature: Health probes
  # Not blocked by S5 — probes do not touch the database.

  Scenario: GET /livez returns 200 with {"status":"ok"}
    When I GET "/livez" without auth
    Then the response status is 200
    And the response JSON field "status" equals ok

  Scenario: GET /readyz returns 200
    # Empirically blocked by S5: /readyz fans out to postgres via pgbouncer
    # and surfaces the same getaddrinfo ENOTFOUND failure as the auth flow.
    # Expected to flip to 200 once the server team ships the pgbouncer
    # overlay (or repoints DATABASE_URL at postgres directly for slim-core).
    When I GET "/readyz" without auth
    Then the response status is 200

  Scenario: GET /api/health is deprecated but still returns 200
    # Phase 8 finding F1: client should migrate from /api/health to /livez.
    # Server signals this with a Deprecation header + a Link header
    # pointing at the successor version.
    When I GET "/api/health" without auth
    Then the response status is 200
    And the response header "deprecation" equals "true"
    And the response header "link" contains "</livez>; rel=\"successor-version\""
