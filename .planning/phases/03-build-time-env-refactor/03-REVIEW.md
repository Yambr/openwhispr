---
phase: 03-build-time-env-refactor
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - .gitignore
  - docs/SELF_HOSTING.md
  - electron-builder.config.js
  - main.js
  - package.json
  - scripts/generate-build-config.js
  - scripts/verify-defaults-parity.js
  - src/components/McpIntegrationCard.tsx
  - src/components/OpenAICompatiblePanel.tsx
  - src/config/constants.ts
  - src/config/defaults.ts
  - src/helpers/googleCalendarManager.js
  - src/helpers/googleCalendarOAuth.js
  - src/helpers/ipcHandlers.js
  - src/lib/auth.ts
  - src/models/ModelRegistry.ts
  - src/models/modelRegistryData.json
  - src/types/build-env.d.ts
  - src/vite.config.mjs
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 3 introduces a clean two-tier build-time config system: a generator
(`scripts/generate-build-config.js`) emits frozen `.ts` and `.cjs` modules
that the renderer (via `src/config/defaults.ts`) and main process consume
respectively, and a parity verifier (`scripts/verify-defaults-parity.js`)
gates against literal-leak regressions. The architecture is sound, the
generator is correct, the parity gate has thoughtful positive controls
(self-check on `openwhispr` literal in the generator), and `.gitignore`
correctly excludes the generated files.

The main concerns are around **build-time-override consistency across
processes** for the OAuth protocol scheme. `googleCalendarOAuth.js` keeps
its own hardcoded `PROTOCOL_BY_CHANNEL` table that does NOT honor
`OPENWHISPR_OAUTH_PROTOCOL_SCHEME` overrides — meaning a self-hosted
build with a custom protocol scheme will register the custom scheme with
the OS but the Google Calendar OAuth redirect chain will hand off to the
*default* channel scheme, breaking calendar connect on customised builds.

Several smaller issues stem from divergent fallback semantics between
the renderer's `pick()` / `pickAllowEmpty()` helpers and the main-process
generator (hasOwnProperty), and between Vite's `||` chains and the
generator's hasOwnProperty resolution. None are fatal for the default
build (which is byte-identical) but they create pitfalls for maintainers
who set env vars to empty strings or who rely on the renderer to
re-honour an explicit `""` override.

## Critical Issues

### CR-01: Google Calendar OAuth ignores OPENWHISPR_OAUTH_PROTOCOL_SCHEME override

**File:** `src/helpers/googleCalendarOAuth.js:18-44`
**Issue:** `PROTOCOL_BY_CHANNEL` and `_getProtocol()` derive the redirect
scheme exclusively from `process.env.OPENWHISPR_CHANNEL`, completely
bypassing the build-time `OPENWHISPR_OAUTH_PROTOCOL_SCHEME` override that
`main.js:getOAuthProtocol()` honours via the
`OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN` boolean.

Concrete failure: a self-hoster builds with
`OPENWHISPR_OAUTH_PROTOCOL_SCHEME=examplecorp`. `main.js` registers the
custom protocol via `app.setAsDefaultProtocolClient("examplecorp")` and
listens for `examplecorp://` deep links. But when the user clicks
"Connect Google Calendar", `_buildCallbackRedirect()` builds
`https://openwhispr.com/auth/desktop-callback?protocol=openwhispr&...`
(production fallback). The desktop callback page then 302s to
`openwhispr://` — which the OS dispatches to a *different* app (or
nothing). Calendar OAuth silently fails on every customised build.

This is precisely the regression the parity gate is designed to prevent
for `main.js`, but `googleCalendarOAuth.js` was missed because the
duplicated `PROTOCOL_BY_CHANNEL` table contains the literal
`"openwhispr"` only inside an object expression — Gate 1b's anchored
grep on `electron-builder.config.js` does not cover this file.

**Fix:** Route the protocol scheme through the same source as `main.js`
— either by exposing `OAUTH_PROTOCOL` via a small shared helper, or by
reading the build-config-generated module:

```js
// src/helpers/googleCalendarOAuth.js
const {
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL,
  OPENWHISPR_OAUTH_GOOGLE_AUTH_URL,
  OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL,
  OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL,
  OPENWHISPR_OAUTH_PROTOCOL_SCHEME,
  OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN,
} = require("../config/build-config.generated.cjs");

const PROTOCOL_BY_CHANNEL = {
  development: "openwhispr-dev",
  staging: "openwhispr-staging",
  production: "openwhispr",
};

  _getProtocol() {
    if (OPENWHISPR_OAUTH_PROTOCOL_SCHEME_OVERRIDDEN) {
      return OPENWHISPR_OAUTH_PROTOCOL_SCHEME;
    }
    const channel = process.env.OPENWHISPR_CHANNEL || "production";
    return PROTOCOL_BY_CHANNEL[channel] || PROTOCOL_BY_CHANNEL.production;
  }
```

Also extend Gate 1b in `verify-defaults-parity.js` to scan all main-process
`.js` files for hardcoded protocol scheme tables, not just `main.js`.

## Warnings

### WR-01: defaults.ts `pickAllowEmpty` for MISTRAL_BASE_URL is unreachable from Vite

**File:** `src/config/defaults.ts:63-66`, `src/vite.config.mjs:53-54`
**Issue:** `pickAllowEmpty("VITE_OPENWHISPR_MISTRAL_BASE_URL", ...)` is
designed to honour an explicit empty string (per the comment "when
intentionally cleared"), but the Vite `define` block writes the value as
`env.OPENWHISPR_MISTRAL_BASE_URL || "https://api.mistral.ai/v1"`. The
`||` short-circuits on empty string and writes the default literal, so
`import.meta.env.VITE_OPENWHISPR_MISTRAL_BASE_URL` can never actually be
`""` — the `pickAllowEmpty` semantics are dead code for this key.
The same applies to BACKEND_URL's `??` chain in vite.config.mjs: Vite's
`loadEnv()` returns `""` for unset keys (not `undefined`), so `??` does
not chain through to the next fallback. BACKEND_URL happens to default
to `""` anyway, so behaviour is correct by coincidence.

**Fix:** Use a small helper that distinguishes "key present in env" from
"key has truthy value", matching the generator's `hasOwnProperty`
semantic:

```js
const pickFromEnv = (key, fallback) =>
  Object.prototype.hasOwnProperty.call(env, key) && env[key] !== ""
    ? env[key]
    : fallback;

// Or, for keys where empty IS a valid override:
const pickFromEnvAllowEmpty = (key, fallback) =>
  Object.prototype.hasOwnProperty.call(env, key) ? env[key] : fallback;
```

Then apply `pickFromEnvAllowEmpty` to `OPENWHISPR_BACKEND_URL` and
`OPENWHISPR_MISTRAL_BASE_URL` and document which keys belong to which
class in CONFIG_INVENTORY.

### WR-02: Renderer fallback in lib/auth.ts leaks "openwhispr" literal

**File:** `src/lib/auth.ts:187`
**Issue:** `signInWithSocial()` does
`(await window.electronAPI?.getOAuthProtocol?.()) || "openwhispr"`. The
literal `"openwhispr"` fallback defeats the build-time override: if the
IPC call fails for any reason on a customised build (e.g. preload
script regression, race during early startup), the renderer will send
`?protocol=openwhispr` and the OAuth round-trip will redirect to
`openwhispr://` — which is not registered on a custom-protocol build.

This literal is currently NOT caught by the parity gate because Gate 1b
only scans `electron-builder.config.js` and `main.js` for bare
`"openwhispr"` literals.

**Fix:** Use the build-config-derived constant as the fallback:

```ts
import { OPENWHISPR_OAUTH_PROTOCOL_SCHEME } from "../config/defaults";
// ...
const protocol =
  (await window.electronAPI?.getOAuthProtocol?.()) || OPENWHISPR_OAUTH_PROTOCOL_SCHEME;
```

Also extend Gate 1b's bare-`openwhispr`-literal scan to cover all
files under `src/` (with the existing CFBundleIconName / repo:
exemptions retained).

### WR-03: ipcHandlers.js builds Mistral URL eagerly at module load

**File:** `src/helpers/ipcHandlers.js:69`
**Issue:** `const MISTRAL_TRANSCRIPTION_URL =
${OPENWHISPR_MISTRAL_BASE_URL}/audio/transcriptions` is computed at
module load. If a maintainer ships a build with
`OPENWHISPR_MISTRAL_BASE_URL=""` (e.g. to disable Mistral), this becomes
`"/audio/transcriptions"` — a relative URL that will silently send the
audio upload to whatever host the renderer happens to be loaded from
(`file://`, `localhost:5183`, etc.). Either an early validation or a
guard at the call site should reject empty base URLs.

**Fix:** Guard at the call site or validate at module load:

```js
const MISTRAL_TRANSCRIPTION_URL = OPENWHISPR_MISTRAL_BASE_URL
  ? `${OPENWHISPR_MISTRAL_BASE_URL}/audio/transcriptions`
  : null;
// At call site: if (!MISTRAL_TRANSCRIPTION_URL) throw new Error("Mistral disabled in this build");
```

### WR-04: vite.config.mjs `define` block uses `||` for keys with valid empty default

**File:** `src/vite.config.mjs:34-55`
**Issue:** All keys except `VITE_OPENWHISPR_BACKEND_URL` use `||` for
fallback selection. The generator's docstring explicitly notes that
empty string is a valid intended default for BACKEND_URL and asks
consumers to use `hasOwnProperty` semantics. The Vite block partially
honours this (BACKEND_URL uses `??`) but is silently inconsistent for
MISTRAL_BASE_URL and any future key where empty might mean "disabled."

**Fix:** Adopt one helper (see WR-01) for all `define` entries to make
the override semantic uniform with the generator. This also documents
which keys treat empty as "set" vs "unset."

### WR-05: writeBundle plugin emits runtime-env.json missing protocol scheme

**File:** `src/vite.config.mjs:62-73`
**Issue:** The `write-runtime-env` plugin writes `runtime-env.json`
containing `buildTimeDefaults` plus two legacy keys, but does NOT
include `VITE_OPENWHISPR_OAUTH_PROTOCOL_SCHEME` or any
`OPENWHISPR_OAUTH_PROTOCOL_SCHEME` value. Per `docs/SELF_HOSTING.md`, the
runtime-env.json mechanism is supposed to allow runtime overrides; the
omission means the protocol scheme is not adjustable post-build for the
renderer — which is fine for v1's "build-time only" constraint, but
the file's contents should match the keys that defaults.ts can actually
consume (currently it omits `VITE_OPENWHISPR_GROQ_BASE_URL` /
`VITE_OPENWHISPR_GEMINI_BASE_URL` / `VITE_OPENWHISPR_MISTRAL_BASE_URL`
keys' descriptions in the comment headers — actually they ARE included
via `...buildTimeDefaults`, so this is fine in code; only protocol scheme
is missing).

Either add the protocol scheme key (if runtime override is ever wanted)
or document explicitly in `docs/SELF_HOSTING.md` that protocol scheme is
build-time-only and cannot be hot-swapped via runtime-env.json.

**Fix:** Document in vite.config.mjs and SELF_HOSTING.md:

```js
// runtime-env.json intentionally OMITS OPENWHISPR_OAUTH_PROTOCOL_SCHEME:
// the protocol must be registered with the OS at install time, so a
// runtime-env.json swap could not change the registered handler.
```

## Info

### IN-01: defaults.ts re-exports unused constants

**File:** `src/config/defaults.ts:40-49`
**Issue:** `OPENWHISPR_OAUTH_GOOGLE_AUTH_URL`,
`OPENWHISPR_OAUTH_GOOGLE_TOKEN_URL`,
`OPENWHISPR_OAUTH_GOOGLE_REVOKE_URL`,
`OPENWHISPR_OAUTH_GOOGLE_CALENDAR_API_URL`,
`OPENWHISPR_ANTHROPIC_URL` are exported from defaults.ts but only
consumed by main-process code (which uses build-config.generated.cjs
directly). These exports add zero renderer surface area and dilute the
signal of "what's actually configurable from the renderer's point of
view."

**Fix:** Drop them from defaults.ts (renderer-only) and document in the
file header that defaults.ts mirrors only the subset of build-config
keys that the renderer actually consumes. Alternatively keep them with
a comment "// re-exported for completeness; current renderer code paths
do not consume these."

### IN-02: build-env.d.ts missing protocol scheme key

**File:** `src/types/build-env.d.ts:9-26`
**Issue:** The interface includes 11 of the 16 build-time keys but
omits `VITE_OPENWHISPR_OAUTH_PROTOCOL_SCHEME` and the four Google OAuth
URLs. The omission is consistent with current usage (those keys are
not piped through Vite define), but for documentation parity with the
generator the .d.ts could either include all 16 keys with comments
indicating "main-process-only" or document the subset choice
explicitly in the file header.

**Fix:** Add a header comment stating "this interface declares only the
subset of build-time keys exposed via Vite `define` to the renderer;
five additional keys (Google OAuth + Anthropic + protocol scheme) live
in build-config.generated.cjs and are consumed only from main."

### IN-03: vite.config.mjs has subtle `??` vs `||` mismatch

**File:** `src/vite.config.mjs:35`
**Issue:** Only `VITE_OPENWHISPR_BACKEND_URL` uses `??`; the rest use
`||`. The intent is unclear from the code alone (no comment), and as
noted in WR-01/WR-04 this is unreachable in practice because Vite's
`loadEnv` returns `""` for unset keys. Add a comment explaining the
choice or unify on one operator.

**Fix:** Add a one-line comment near the BACKEND_URL line clarifying
why `??` is used here:

```js
// `??` (not `||`) so that an explicit empty-string OPENWHISPR_BACKEND_URL
// in .env disables cloud calls — Vite's loadEnv returns "" for unset
// keys, but distinguishing "absent" from "explicit empty" requires the
// upstream caller to know whether the key was set; here we simply chain
// through legacy VITE_OPENWHISPR_API_URL.
```

### IN-04: Generator emits frozen module but does not validate URL shape

**File:** `scripts/generate-build-config.js:39-47`
**Issue:** `resolveValue` reads `process.env[key]` and writes it
verbatim. There is no validation that the result is a well-formed URL,
that it uses HTTPS (a stated SELF_HOSTING.md requirement), or that
non-empty values include a scheme. A typo like
`OPENWHISPR_AUTH_URL=auth.example.com` (missing scheme) would silently
ship a broken binary.

**Fix:** Add a minimal validator that warns (or errors) at generation
time:

```js
function validateUrl(key, value) {
  if (value === "") return;
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol)) {
      throw new Error(`unsupported protocol ${u.protocol}`);
    }
  } catch (err) {
    console.error(`[build-config] invalid URL for ${key}: ${value} (${err.message})`);
    process.exit(1);
  }
}
// Apply to every key whose default starts with http(s)://
```

Skip protocol scheme (`OPENWHISPR_OAUTH_PROTOCOL_SCHEME`) and
`OPENWHISPR_BACKEND_URL_PATTERN` (which uses `*` wildcard syntax and is
not a strict URL).

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
