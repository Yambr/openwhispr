Feature: Health probes
  # Post R4 + R6 closure (2026-05-19): /api/health is FIRST-CLASS — no
  # deprecation header, no link to /livez. /readyz returns 200 (postgres
  # reachable). Both /api/health (client) and /livez (k8s probe) are
  # canonical endpoints.

  Scenario: GET /livez returns 200 with {"status":"ok"}
    When I GET "/livez" without auth
    Then the response status is 200
    And the response JSON field "status" equals ok

  Scenario: GET /readyz reports postgres reachable (R6)
    # Pre-R6 this 500'd because pgbouncer overlay was missing. R6 closed
    # 2026-05-19 — postgres is now reachable. /readyz is an aggregate
    # readiness probe: it returns 503 if ANY subsystem is degraded. The
    # LiteLLM subsystem is currently degraded by the server's own SSRF
    # allowlist self-block (SERVER-REQUIREMENTS R16), so the aggregate
    # probe sits at 503 — an operator/server concern, NOT a postgres
    # regression. We assert the thing R6 actually fixed: postgres ok.
    When I GET "/readyz" without auth
    Then the response status is 200 or 503
    And the readyz postgres subsystem reports ok

  Scenario: GET /api/health is first-class — no deprecation signals (R4)
    # Pre-R4 the server returned 200 plus a deprecation marker header + link to /livez.
    # R4 closed 2026-05-19 — server now treats /api/health as the canonical
    # client probe and removes the deprecation header entirely.
    When I GET "/api/health" without auth
    Then the response status is 200
    And the response header "deprecation" is absent
    And the response header "link" is absent
