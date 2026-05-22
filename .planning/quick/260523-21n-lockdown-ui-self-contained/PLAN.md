---
quick_id: 260523-21n
slug: lockdown-ui-self-contained
date: 2026-05-23
status: complete
---

# Quick Task: make corporate-lockdown.spec self-contained

## Problem

`npm run test:lockdown-ui` — 4/6 fail "could not open Settings/
Speech-to-Text/Notes/Integrations". Live probe of the `panel=true`
window shows the app stuck on "Welcome to OpenWhispr" (onboarding).
`src/AppRouter.jsx` gates the Control Panel on `localStorage`
(`onboardingCompleted`, `skipAuth`/`authenticationSkipped`). A clean
Electron userData → onboarding screen → nav items absent.

Reproduced identically on `82774205` (before any recent work) →
pre-existing test fragility, not a regression.

## Fix (test-only)

`tests/ui/corporate-lockdown.spec.ts` `beforeAll`: after resolving the
panel window, write `onboardingCompleted/skipAuth/authenticationSkipped`
to its `localStorage`, `reload()`, wait, assert the Control Panel
rendered. No client code, no mocks, no weakened leak assertions.

## Verification

`npm run test:lockdown-ui` → 6/6 green.
