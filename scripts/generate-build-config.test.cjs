// Unit tests for scripts/generate-build-config.js — Phase 10 PLD-01.
//
// Asserts resolveBool semantics for the OPENWHISPR_PROVIDER_LOCKDOWN env var:
//   - unset                              -> PROVIDER_LOCKDOWN_ENABLED === false (parity default)
//   - OPENWHISPR_PROVIDER_LOCKDOWN=true   -> true
//   - OPENWHISPR_PROVIDER_LOCKDOWN=false  -> false
//   - OPENWHISPR_PROVIDER_LOCKDOWN=1      -> true (any non-"false" value enables)
//   - BOOL_KEYS contains PROVIDER_LOCKDOWN_ENABLED
//
// Self-contained: uses only Node built-ins (node:test, node:assert). The env
// var is mutated per-test and restored afterward so test order is irrelevant.

"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { buildResolved, BOOL_KEYS } = require("./generate-build-config.js");

const ENV_KEY = "OPENWHISPR_PROVIDER_LOCKDOWN";

function withEnv(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, ENV_KEY);
  const prev = process.env[ENV_KEY];
  if (value === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = value;
  }
  try {
    fn();
  } finally {
    if (had) {
      process.env[ENV_KEY] = prev;
    } else {
      delete process.env[ENV_KEY];
    }
  }
}

test("unset env -> PROVIDER_LOCKDOWN_ENABLED is false (upstream parity default)", () => {
  withEnv(undefined, () => {
    assert.strictEqual(buildResolved().PROVIDER_LOCKDOWN_ENABLED, false);
  });
});

test("OPENWHISPR_PROVIDER_LOCKDOWN=true -> PROVIDER_LOCKDOWN_ENABLED is true", () => {
  withEnv("true", () => {
    assert.strictEqual(buildResolved().PROVIDER_LOCKDOWN_ENABLED, true);
  });
});

test("OPENWHISPR_PROVIDER_LOCKDOWN=false -> PROVIDER_LOCKDOWN_ENABLED is false", () => {
  withEnv("false", () => {
    assert.strictEqual(buildResolved().PROVIDER_LOCKDOWN_ENABLED, false);
  });
});

test("OPENWHISPR_PROVIDER_LOCKDOWN=1 -> PROVIDER_LOCKDOWN_ENABLED is true (any non-false value enables)", () => {
  withEnv("1", () => {
    assert.strictEqual(buildResolved().PROVIDER_LOCKDOWN_ENABLED, true);
  });
});

test("BOOL_KEYS includes PROVIDER_LOCKDOWN_ENABLED", () => {
  assert.ok(
    BOOL_KEYS.includes("PROVIDER_LOCKDOWN_ENABLED"),
    "BOOL_KEYS should contain PROVIDER_LOCKDOWN_ENABLED"
  );
});
