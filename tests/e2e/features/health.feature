Feature: Health probes
  # Post R4 + R6 closure (2026-05-19): /api/health is FIRST-CLASS — no
  # deprecation header, no link to /livez. /readyz returns 200 (postgres
  # reachable). Both /api/health (client) and /livez (k8s probe) are
  # canonical endpoints.

  Scenario: GET /livez returns 200 with {"status":"ok"}
    When I GET "/livez" without auth
    Then the response status is 200
    And the response JSON field "status" equals ok

  Scenario: GET /readyz returns 200
    # Pre-R6 this 500'd because pgbouncer overlay was missing. R6 closed
    # 2026-05-19 — postgres is now reachable, all subsystems report ok.
    When I GET "/readyz" without auth
    Then the response status is 200

  Scenario: GET /api/health is first-class — no deprecation signals (R4)
    # Pre-R4 the server returned 200 plus a deprecation marker header + link to /livez.
    # R4 closed 2026-05-19 — server now treats /api/health as the canonical
    # client probe and removes the deprecation header entirely.
    When I GET "/api/health" without auth
    Then the response status is 200
    And the response header "deprecation" is absent
    And the response header "link" is absent
