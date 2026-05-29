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

// Phase 10 PLD-02: lockdown implies all three OAuth provider flags off.

function withEnvMap(map, fn) {
  const keys = Object.keys(map);
  const saved = keys.map((k) => ({
    k,
    had: Object.prototype.hasOwnProperty.call(process.env, k),
    prev: process.env[k],
  }));
  for (const k of keys) {
    if (map[k] === undefined) delete process.env[k];
    else process.env[k] = map[k];
  }
  try {
    fn();
  } finally {
    for (const { k, had, prev } of saved) {
      if (had) process.env[k] = prev;
      else delete process.env[k];
    }
  }
}

// Phase 06 (D3): lockdown NO LONGER forces the OAUTH_*_ENABLED social flags off.
// Social sign-in visibility is server-driven at runtime (GET /api/auth/providers);
// the client renders exactly what the server enables, in lockdown builds too. The
// OAUTH_*_ENABLED flags therefore stay at their BOOL_DEFAULTS value (true) under
// lockdown — they gate only the per-provider social-button defense-in-depth guard
// in src/lib/auth.ts, not the Google Calendar IPC surface (that is GCAL_ENABLED,
// HIGH-01 fix).

test("PROVIDER_LOCKDOWN=true leaves the three OAUTH_* social flags ON (server-driven, D3)", () => {
  withEnvMap({ OPENWHISPR_PROVIDER_LOCKDOWN: "true" }, () => {
    const resolved = buildResolved();
    assert.strictEqual(resolved.OAUTH_GOOGLE_ENABLED, true);
    assert.strictEqual(resolved.OAUTH_APPLE_ENABLED, true);
    assert.strictEqual(resolved.OAUTH_MICROSOFT_ENABLED, true);
  });
});

test("PROVIDER_LOCKDOWN does not override an explicit OPENWHISPR_OAUTH_GOOGLE=true (social stays on)", () => {
  withEnvMap(
    {
      OPENWHISPR_PROVIDER_LOCKDOWN: "true",
      OPENWHISPR_OAUTH_GOOGLE: "true",
      OPENWHISPR_OAUTH_APPLE: "true",
      OPENWHISPR_OAUTH_MICROSOFT: "true",
    },
    () => {
      const resolved = buildResolved();
      assert.strictEqual(resolved.OAUTH_GOOGLE_ENABLED, true);
      assert.strictEqual(resolved.OAUTH_APPLE_ENABLED, true);
      assert.strictEqual(resolved.OAUTH_MICROSOFT_ENABLED, true);
    }
  );
});

test("lockdown unset -> OAUTH_* flags keep their BOOL_DEFAULTS value true", () => {
  withEnvMap(
    {
      OPENWHISPR_PROVIDER_LOCKDOWN: undefined,
      OPENWHISPR_OAUTH_GOOGLE: undefined,
      OPENWHISPR_OAUTH_APPLE: undefined,
      OPENWHISPR_OAUTH_MICROSOFT: undefined,
    },
    () => {
      const resolved = buildResolved();
      assert.strictEqual(resolved.OAUTH_GOOGLE_ENABLED, true);
      assert.strictEqual(resolved.OAUTH_APPLE_ENABLED, true);
      assert.strictEqual(resolved.OAUTH_MICROSOFT_ENABLED, true);
    }
  );
});

// HIGH-01 regression fix: GCAL_ENABLED is a dedicated flag for the Google
// Calendar IPC surface (emitPreloadGcal), decoupled from OAUTH_GOOGLE_ENABLED
// (which now means only "social Google sign-in button defense-in-depth").
// Env var: OPENWHISPR_GCAL. Default true (upstream parity). Lockdown strips it.

test("BOOL_KEYS includes GCAL_ENABLED", () => {
  assert.ok(
    BOOL_KEYS.includes("GCAL_ENABLED"),
    "BOOL_KEYS should contain GCAL_ENABLED"
  );
});

test("unset env -> GCAL_ENABLED is true (upstream parity default)", () => {
  withEnvMap({ OPENWHISPR_GCAL: undefined, OPENWHISPR_PROVIDER_LOCKDOWN: undefined }, () => {
    assert.strictEqual(buildResolved().GCAL_ENABLED, true);
  });
});

test("OPENWHISPR_GCAL=false -> GCAL_ENABLED is false", () => {
  withEnvMap({ OPENWHISPR_GCAL: "false", OPENWHISPR_PROVIDER_LOCKDOWN: undefined }, () => {
    assert.strictEqual(buildResolved().GCAL_ENABLED, false);
  });
});

test("OPENWHISPR_GCAL=1 -> GCAL_ENABLED is true (any non-false value enables)", () => {
  withEnvMap({ OPENWHISPR_GCAL: "1", OPENWHISPR_PROVIDER_LOCKDOWN: undefined }, () => {
    assert.strictEqual(buildResolved().GCAL_ENABLED, true);
  });
});

test("PROVIDER_LOCKDOWN=true forces GCAL_ENABLED off (HIGH-01: lockdown strips gcal IPC)", () => {
  withEnvMap({ OPENWHISPR_PROVIDER_LOCKDOWN: "true" }, () => {
    assert.strictEqual(buildResolved().GCAL_ENABLED, false);
  });
});

test("PROVIDER_LOCKDOWN=true overrides an explicit OPENWHISPR_GCAL=true (lockdown wins)", () => {
  withEnvMap(
    { OPENWHISPR_PROVIDER_LOCKDOWN: "true", OPENWHISPR_GCAL: "true" },
    () => {
      assert.strictEqual(buildResolved().GCAL_ENABLED, false);
    }
  );
});

test("GCAL_ENABLED is independent of OAUTH_GOOGLE_ENABLED under lockdown (decoupled)", () => {
  withEnvMap({ OPENWHISPR_PROVIDER_LOCKDOWN: "true" }, () => {
    const resolved = buildResolved();
    // social Google stays on (server-driven), gcal is stripped — proves decoupling
    assert.strictEqual(resolved.OAUTH_GOOGLE_ENABLED, true);
    assert.strictEqual(resolved.GCAL_ENABLED, false);
  });
});

test("PROVIDER_LOCKDOWN=true with backend URL -> STREAMING_ENABLED is true", () => {
  withEnvMap(
    {
      OPENWHISPR_PROVIDER_LOCKDOWN: "true",
      OPENWHISPR_BACKEND_URL: "http://localhost:4000",
    },
    () => {
      assert.strictEqual(buildResolved().STREAMING_ENABLED, true);
    }
  );
});

test("PROVIDER_LOCKDOWN=true overrides explicit OPENWHISPR_STREAMING=false (lockdown wins)", () => {
  withEnvMap(
    {
      OPENWHISPR_PROVIDER_LOCKDOWN: "true",
      OPENWHISPR_BACKEND_URL: "http://localhost:4000",
      OPENWHISPR_STREAMING: "false",
    },
    () => {
      assert.strictEqual(buildResolved().STREAMING_ENABLED, true);
    }
  );
});
