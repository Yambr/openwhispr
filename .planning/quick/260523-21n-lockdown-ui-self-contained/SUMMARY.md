---
quick_id: 260523-21n
slug: lockdown-ui-self-contained
date: 2026-05-23
status: complete
commit: (see git log — test(lockdown-ui))
---

# Summary: corporate-lockdown.spec is now self-contained

## What was wrong

`npm run test:lockdown-ui` failed 4/6: the navigation tests
(Settings / Speech-to-Text / Notes onboarding / Integrations) all hit
"could not open <X>". A live probe of the `panel=true` window showed
`body.innerText` = "Welcome to OpenWhispr … Continue with email /
Continue without account" — the app was stuck on the onboarding screen,
where those nav items do not exist.

`src/AppRouter.jsx` gates the Control Panel on `localStorage`: it shows
the onboarding flow unless `onboardingCompleted === "true"`, and a
re-auth screen when onboarding is done but the user is signed-out and
auth was not skipped (`skipAuth` / `authenticationSkipped`). A clean
Electron userData lands on Welcome.

**Not a regression.** Ran the spec on commit `82774205` (before any
recent work) — identical 4 failures. The spec previously passed only
because a stale logged-in session happened to persist in Electron
userData. Real test fragility: the spec was not self-contained.

## Fix

`tests/ui/corporate-lockdown.spec.ts` `beforeAll` — after it resolves
the `panel=true` window into `main` and waits for load:
- `main.evaluate()` writes `onboardingCompleted="true"`,
  `skipAuth="true"`, `authenticationSkipped="true"` into the panel
  window's `localStorage`.
- `main.reload()` so `AppRouter` re-evaluates with the keys present
  (set-then-reload — `addInitScript` is too late once the window is
  open; `file://` localStorage persists to userData).
- Asserts the Control Panel chrome (`Settings` nav) is visible, failing
  loud with the rendered body text if onboarding was not bypassed.

No client source touched. No mocks. No leak assertions weakened — every
`assertNoLeaks` / provider-noun check in the tests is unchanged; the fix
only navigates the harness past onboarding to the screens under test.

## Verification

`npm run test:lockdown-ui` → **6/6 passed** (54s, includes the lockdown
renderer rebuild in globalSetup).

## Out of scope

Re-tagging / releasing — separate manual step.
