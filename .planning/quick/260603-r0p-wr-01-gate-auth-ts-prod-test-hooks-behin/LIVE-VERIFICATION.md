# WR-01 — LIVE verification (production-mode dist, CDP)

Per `live_verification_over_green_tests`: green unit tests do NOT prove the
gate strips the hooks from a real production bundle. Drove the real packed-mode
renderer end-to-end.

## Method

1. Built the renderer in PRODUCTION mode: `env -u NODE_ENV npm run build:renderer`
   (NODE_ENV unset = exactly how a real release `vite build` runs). Single
   `src/dist/` bundle used for BOTH probes below.
2. Launched the real Electron app twice against the SAME dist, attached CDP to
   the control-panel renderer (`file://…/src/dist/index.html?panel=true`), and
   read `window.electronAPI.isE2E` + `typeof` of the three hooks.

## Results — same dist, two runtime envs

| signal | Prod launch (NODE_ENV unset) | E2E launch (NODE_ENV=test) |
|---|---|---|
| `electronAPI.isE2E` | `false` | `true` |
| `typeof window.__zustand_setServerUrl` | **`undefined`** ✅ | `function` ✅ |
| `typeof window.__authClientForTest` | **`undefined`** ✅ | `object` ✅ |
| `typeof window.authClientBaseUrlForTest` | **`undefined`** ✅ | `function` ✅ |

## Conclusion

- **Production-absence PROVEN:** in a real prod launch the three test hooks —
  including the `__zustand_setServerUrl` SSRF-bypass on the #8 auth host — are
  `undefined`. WR-01 closed.
- **E2E-intact PROVEN:** the SAME dist, launched with `NODE_ENV=test`, exposes
  all three hooks, so `tests/e2e/steps/host-runtime-override.steps.ts` +
  `onboarding-serverurl-email.steps.ts` work unchanged.
- This confirms the runtime-preload-bridge gate was the CORRECT mechanism. An
  `import.meta.env.DEV` guard would have DCE-stripped the hooks from BOTH
  bundles (e2e dist == prod dist at build time), breaking the @host suite. The
  gate keys off the runtime `NODE_ENV=test` the e2e fixture sets, so one bundle
  serves both.

Probe script was one-shot (`scripts/cdp-wr01-verify.mjs`), removed after use.
Both Electron instances killed; no stray debug processes.
