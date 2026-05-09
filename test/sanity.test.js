// Phase 07 PLAN-01: smoke test proving the vitest harness actually runs.
// If this fails, the test infrastructure is broken — no other test in
// Phase 07 can be trusted.
// Uses globals enabled in vitest.config.ts (test, expect available without import).

test("vitest harness is wired (1+1=2)", () => {
  expect(1 + 1).toBe(2);
});
