// W-01 follow-up: gcal-axis (GCAL_ENABLED) vs social-Google-sign-in axis
// (OAUTH_GOOGLE_ENABLED) decoupling under provider lockdown.
//
// WHY THIS TEST EXISTS (the gap it closes):
//   scripts/verify-provider-lockdown.js greps the GENERATED preload + the
//   Rolldown-built RENDERER bundle (src/dist/). That bundle-grep CAN catch
//   the renderer leak (IntegrationsView's GoogleCalendarSection + its gcal-*
//   IPC literals) and the preload leak (preload-gcal.generated.cjs). It
//   CANNOT catch the MAIN-side regression: main.js and src/helpers/ipcHandlers.js
//   are NOT bundled — Electron runs them directly from source. So a main-side
//   `if (BuildConfig.OAUTH_GOOGLE_ENABLED)` gate (the pre-W-01 bug) that still
//   instantiates GoogleCalendarManager and registers the gcal-* IPC handlers
//   under lockdown is INVISIBLE to a bundle grep.
//
//   The main-process gates read `BuildConfig.GCAL_ENABLED`, where BuildConfig
//   is the frozen object emitted by buildResolved() into
//   src/config/build-config.generated.cjs. So the correct main-side assertion
//   is: under a lockdown-resolved BuildConfig, the gcal gate value
//   (GCAL_ENABLED) MUST be false, AND it must be decoupled from
//   OAUTH_GOOGLE_ENABLED (which stays true — social sign-in is server-driven,
//   D3). This test exercises buildResolved() directly, the exact resolution
//   the main process consumes.
//
//   NON-VACUOUS: this test fails if (a) lockdown stops forcing GCAL_ENABLED
//   off, or (b) someone re-couples gcal to OAUTH_GOOGLE_ENABLED (which lockdown
//   leaves true) — the precise W-01 regression class.
//
// vitest globals are enabled in vitest.config.ts.

const { buildResolved } = require("../../scripts/generate-build-config");

const ENV_KEYS = ["OPENWHISPR_PROVIDER_LOCKDOWN", "OPENWHISPR_GCAL", "OPENWHISPR_OAUTH_GOOGLE"];

function withEnv(overrides, fn) {
  const prev = {};
  for (const k of ENV_KEYS) {
    prev[k] = Object.prototype.hasOwnProperty.call(process.env, k)
      ? process.env[k]
      : undefined;
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(overrides)) {
    process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

describe("gcal-axis lockdown decoupling (W-01: main-side gate)", () => {
  test("default build: GCAL_ENABLED true (manager instantiated, gcal IPC registered)", () => {
    withEnv({}, () => {
      const r = buildResolved();
      expect(r.GCAL_ENABLED).toBe(true);
      expect(r.OAUTH_GOOGLE_ENABLED).toBe(true);
    });
  });

  test("lockdown: GCAL_ENABLED forced false — main must NOT instantiate manager / register gcal handlers", () => {
    withEnv({ OPENWHISPR_PROVIDER_LOCKDOWN: "true" }, () => {
      const r = buildResolved();
      // The exact value read by main.js:366 and ipcHandlers.js gates.
      expect(r.GCAL_ENABLED).toBe(false);
    });
  });

  test("lockdown decouples gcal from social: OAUTH_GOOGLE_ENABLED stays true while GCAL_ENABLED is false", () => {
    withEnv({ OPENWHISPR_PROVIDER_LOCKDOWN: "true" }, () => {
      const r = buildResolved();
      // Social-Google sign-in is server-driven (D3) — its defense-in-depth flag
      // is NOT touched by lockdown. gcal is a separate axis that lockdown strips.
      expect(r.OAUTH_GOOGLE_ENABLED).toBe(true);
      expect(r.GCAL_ENABLED).toBe(false);
      expect(r.GCAL_ENABLED).not.toBe(r.OAUTH_GOOGLE_ENABLED);
    });
  });

  test("lockdown wins over an explicit OPENWHISPR_GCAL=true (corporate posture is stronger)", () => {
    withEnv({ OPENWHISPR_PROVIDER_LOCKDOWN: "true", OPENWHISPR_GCAL: "true" }, () => {
      const r = buildResolved();
      expect(r.GCAL_ENABLED).toBe(false);
    });
  });

  test("non-lockdown: OPENWHISPR_GCAL=false disables gcal independently of social-Google", () => {
    withEnv({ OPENWHISPR_GCAL: "false" }, () => {
      const r = buildResolved();
      expect(r.GCAL_ENABLED).toBe(false);
      // social-Google sign-in stays enabled — proves the two axes are independent.
      expect(r.OAUTH_GOOGLE_ENABLED).toBe(true);
    });
  });
});
