---
phase: 04-oauth-gating-build-docs-and-parity-gate
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - docs/BUILD_CONFIG.md
  - docs/SELF_HOSTING.md
  - main.js
  - package.json
  - scripts/generate-build-config.js
  - scripts/verify-oauth-gating.js
  - src/components/AuthenticationStep.tsx
  - src/config/defaults.ts
  - src/helpers/ipcHandlers.js
  - src/lib/auth.ts
  - src/vite.config.mjs
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

The Phase 4 OAuth gating implementation correctly plumbs three boolean flags
(`OPENWHISPR_OAUTH_GOOGLE/APPLE/MICROSOFT`) through the build-config generator into
both the renderer (via `defaults.ts` re-exports) and the main process (via the
generated `.cjs` module). Renderer gating in `AuthenticationStep.tsx` and the
defensive guard in `lib/auth.ts:signInWithSocial()` are correct and idempotent.
Main-process gating around `GoogleCalendarManager` construction and the `gcal-*`
IPC family is safe — `MeetingDetectionEngine` already uses optional chaining on
its `googleCalendarManager` reference, and `ipcHandlers.js` uses `?.` everywhere
it touches the manager. The default build path (no env vars) is unchanged.

Three real issues were found:

1. **Settings-panel Google Calendar UI is not gated** — Phase 4 only gated the
   onboarding `AuthenticationStep` and the `gcal-*` IPC handlers, but
   `IntegrationsView.tsx` still unconditionally renders the "Connect Google
   Calendar" card. With `OPENWHISPR_OAUTH_GOOGLE=false`, clicking *Connect*
   invokes `gcalStartOAuth` whose IPC handler is unregistered, surfacing a raw
   "No handler registered" error to the user.
2. **`defaults.ts:pickBool` is dead/misleading code** — the `import.meta.env`
   computed-property lookup is never populated by Vite's `define` substitution
   (which only replaces *static* `import.meta.env.X` references), so the
   first branch is always `undefined`. Gating works only via the fallback
   to `Generated.OAUTH_GOOGLE_ENABLED`. The associated `define`-injection of
   `VITE_OPENWHISPR_OAUTH_*_ENABLED` in `vite.config.mjs` is therefore also
   functionally inert. Behavior is correct today but the indirection is fragile
   and contradicts the in-file comment claiming DCE-friendliness.
3. **`MeetingDetectionEngine` is constructed with a possibly-null
   `googleCalendarManager`** — the engine handles null safely via `?.`, but
   `windowManager.googleCalendarManager` is also passed downstream and other
   call sites assume non-null implicitly. The current code paths happen to be
   safe, but this is an implicit-contract footgun for future changes.

Plus four documentation / minor-quality info items.

## Warnings

### WR-01: IntegrationsView Google Calendar card is not gated by `OAUTH_GOOGLE_ENABLED`

**File:** `src/components/IntegrationsView.tsx:38-200` (and Phase 4 surface
generally — the file itself was not edited but the phase missed gating it)
**Issue:** When built with `OPENWHISPR_OAUTH_GOOGLE=false`, the
`gcal-start-oauth` / `gcal-disconnect` / `gcal-get-connection-status` IPC
handlers are NOT registered (`src/helpers/ipcHandlers.js:7007`), but the
Settings → Integrations panel still renders the Google Calendar connect/manage
card and wires its button to `window.electronAPI?.gcalStartOAuth?.()`
(`IntegrationsView.tsx:54`). Clicking *Connect* will reject with
`Error: No handler registered for 'gcal-start-oauth'` from Electron's IPC
dispatcher, surfacing a confusing, untranslated error to the end user.

This contradicts the Phase 4 docs in `docs/BUILD_CONFIG.md:54` which describe
gating as "physically removes a provider from the produced binary" and the
`docs/SELF_HOSTING.md:381-389` smoke checklist's claim that disabled providers
have no UI surface.

**Fix:** Gate the Calendar section in `IntegrationsView.tsx`:
```tsx
import { OAUTH_GOOGLE_ENABLED } from "../config/defaults";
// …
{OAUTH_GOOGLE_ENABLED && (
  <SettingsPanel> {/* existing Google Calendar card JSX */} </SettingsPanel>
)}
```
Also extend `verify-oauth-gating.js` to grep for `gcalStartOAuth` /
`googleCalendarIcon` / `integrations.googleCalendar.title` (keeping the i18n-key
caveat in mind) so this regression is caught mechanically next time.

### WR-02: `pickBool` and `define`-injected booleans in vite.config are functionally inert

**File:** `src/config/defaults.ts:29-32, 78-89`; `src/vite.config.mjs:55-58, 80-85`
**Issue:** `pickBool` reads `(env as any)?.[viteName]` from `import.meta.env`.
Vite's `define` option performs *text substitution* for static expressions of
the form `import.meta.env.X` — it does NOT populate the runtime
`import.meta.env` object with those keys. The only way `import.meta.env[X]`
returns a value at runtime is if Vite auto-loaded it from a `VITE_X` shell env
var. The current pipeline sets only the un-prefixed `OPENWHISPR_OAUTH_*` vars,
so the computed-property lookup always returns `undefined`, and `pickBool`
always returns `generatedValue`. The `define` block for the three
`VITE_OPENWHISPR_OAUTH_*_ENABLED` keys (`vite.config.mjs:56-58`) is therefore
dead in practice. Gating works exclusively via `Generated.OAUTH_*_ENABLED`,
which IS a literal const and IS DCE-friendly.

This is not a correctness bug today — the verify-oauth-gating script empirically
confirms gating still works — but the indirection is misleading. The in-file
comment at `defaults.ts:26-32` claims "DCE-friendly" via the Vite literal, when
in fact DCE relies entirely on the imported generated const.

**Fix:** Either (a) drop the `pickBool` indirection and re-export
`Generated.OAUTH_*_ENABLED` directly (matches the pattern already used for
`OPENWHISPR_OAUTH_GOOGLE_AUTH_URL`, etc., on lines 48-52, 57, 62), or (b) make
the lookup static so `define` substitution actually fires:
```ts
// Option a (recommended — minimal code, real DCE):
export const OAUTH_GOOGLE_ENABLED = Generated.OAUTH_GOOGLE_ENABLED;
export const OAUTH_APPLE_ENABLED = Generated.OAUTH_APPLE_ENABLED;
export const OAUTH_MICROSOFT_ENABLED = Generated.OAUTH_MICROSOFT_ENABLED;
```
Option (a) also lets the corresponding `VITE_OPENWHISPR_OAUTH_*_ENABLED`
entries in `vite.config.mjs:56-58` and the `define` block be removed, since
they are unreferenced after the change.

### WR-03: `MeetingDetectionEngine` receives null `googleCalendarManager` — implicit contract

**File:** `main.js:358-367` and `src/helpers/ipcHandlers.js:297, 7110-7120`
**Issue:** When `OAUTH_GOOGLE_ENABLED` is false, `googleCalendarManager` is
left `null` (`main.js:358-360`) and then passed into both
`new MeetingDetectionEngine(googleCalendarManager, …)` (`main.js:361-367`) and
`new IPCHandlers({ googleCalendarManager, … })` (`main.js:393`). The
`MeetingDetectionEngine` correctly uses `this.googleCalendarManager?.…`
(`meetingDetectionEngine.js:70, 354`) and most `gcal-*` handlers are now gated
behind `if (BuildConfig.OAUTH_GOOGLE_ENABLED)`. However:

- The constructor signature does not encode that `googleCalendarManager` is
  optional — a future contributor adding a new call site is likely to drop
  the `?.` and crash in the disabled-build configuration.
- `windowManager.googleCalendarManager` is implicitly null too if any code
  later reads it via `windowManager`.

**Fix:** Either type the parameter explicitly as nullable (TypeScript) or add
a defensive comment + assertion at the engine boundary:
```js
// Phase 4: googleCalendarManager may be null when OAUTH_GOOGLE_ENABLED=false.
// All call sites in this class MUST use optional chaining.
this.googleCalendarManager = googleCalendarManager || null;
```
Consider adding a unit/integration check that builds with
`OPENWHISPR_OAUTH_GOOGLE=false` and exercises meeting-detection startup, to
catch any future direct-deref regression.

## Info

### IN-01: Doc claim "17 endpoint variables" is off-by-one

**File:** `docs/BUILD_CONFIG.md:87`
**Issue:** The "Worked Examples → Default build (parity)" paragraph says
"All 17 endpoint variables resolve to their documented defaults". The
generator (`scripts/generate-build-config.js:18-35`) defines 16 string keys in
`DEFAULTS`, plus the protocol scheme is documented in the OAuth-Endpoints
table. Even counting the protocol scheme as endpoint #16, "17" appears to
double-count. The same paragraph then talks about three OAuth provider flags,
which are *not* endpoint variables.
**Fix:** Either say "16 endpoint variables and 3 OAuth-provider flags" or
recount and match the generator's `console.log` ("16 string keys + 4
booleans"). Same paragraph, one line.

### IN-02: Generator log "16 string keys + 4 booleans" is technically accurate but slightly misleading

**File:** `scripts/generate-build-config.js:145`
**Issue:** The log claims "4 booleans" but `BOOL_DEFAULTS` only contains 3
keys (Google/Apple/Microsoft). The fourth boolean is the
`OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` sentinel emitted on line 79-82,
which is conceptually a different category from the user-facing OAuth gating
flags. Easy to miss in a quick code-read.
**Fix:** Clarify the log:
```js
console.log("[build-config] wrote ... (16 string keys + 3 OAuth gating flags + 1 sentinel)");
```

### IN-03: `signInWithSocial` defensive-guard error message is not localized

**File:** `src/lib/auth.ts:182-190`
**Issue:** The new D-08 defensive guard rejects with
`new Error("Provider not enabled in this build")`. This is a hardcoded English
string and is not wrapped in `t(...)`. Per the project i18n rules in
`CLAUDE.md` ("Every new UI string must have a translation key"), user-facing
error strings should use the i18n system. The error is unlikely to be reached
in normal use (the UI button is gone too) but if it does fire — e.g., from
stale localStorage triggering a legacy code path — a non-English locale user
will see English. Note: the matching error path in
`AuthenticationStep.tsx:135-139` already uses
`t("auth.errors.failedProviderSignIn", …)`.
**Fix:** Add an i18n key (e.g., `auth.errors.providerDisabledInBuild`) and
either return a pre-localized string from the renderer or have the caller
translate based on a stable error code:
```ts
return { error: Object.assign(new Error("Provider not enabled in this build"),
  { code: "PROVIDER_DISABLED_IN_BUILD" }) };
```
Then `AuthenticationStep` can map `code === "PROVIDER_DISABLED_IN_BUILD"` to
the translated string.

### IN-04: Stale comment reference "Plan 6 verify-defaults-parity" in defaults.ts

**File:** `src/config/defaults.ts:7-8`
**Issue:** Comment reads "see Plan 6 verify-defaults-parity grep gate". Phase 4
adds a *separate* gate (`scripts/verify-oauth-gating.js`) that this comment
does not mention. Future readers seeing the comment may not realize there is
now a second mechanical gate covering this file.
**Fix:** Add cross-reference:
```ts
// see scripts/verify-defaults-parity.js (Phase 3 grep gate) +
// scripts/verify-oauth-gating.js (Phase 4 bundle-grep gate).
```

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
