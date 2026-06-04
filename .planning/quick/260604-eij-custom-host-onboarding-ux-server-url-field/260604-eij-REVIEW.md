---
phase: 260604-eij-custom-host-onboarding-ux-server-url-field
reviewed: 2026-06-04T00:00:00Z
depth: quick
files_reviewed: 14
files_reviewed_list:
  - src/components/AuthenticationStep.tsx
  - src/lib/serverProviders.ts
  - src/lib/serverProviders.test.ts
  - src/components/SettingsPage.tsx
  - src/locales/en/translation.json
  - src/locales/es/translation.json
  - src/locales/fr/translation.json
  - src/locales/de/translation.json
  - src/locales/pt/translation.json
  - src/locales/it/translation.json
  - src/locales/ru/translation.json
  - src/locales/zh-CN/translation.json
  - src/locales/zh-TW/translation.json
  - src/locales/ja/translation.json
findings:
  blocker: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 260604-eij: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** quick (+ targeted cross-file trace for the 7 focus items)
**Files Reviewed:** 14
**Status:** issues_found

## Summary

This is a focused UX change: the Server URL field was hoisted out of the
`authView === "local-and-sso"` block so a self-hoster can reach their own host
even when the default host answers `sso-only`/`no-methods`; a duplicate mount of
the same field was added to Settings > General; a new pure predicate
`shouldShowServerUrlField(allowCustomHost)` was introduced; and 10 locales got
three new keys.

I traced all 7 focus items. The security/SSRF posture (item 1), fix #9 gating
(item 2), the race-guard effect (item 3), the INT-01 reload-notice honesty
(item 5), and i18n completeness (item 6) are all **correct and verified**. The
one substantive concern is the DCE mechanism on the onboarding mount (item 4):
the onboarding gate uses a **function-call indirection** `shouldShowServerUrlField(ALLOW_CUSTOM_HOST_ENABLED) &&`
instead of the bare-literal `ALLOW_CUSTOM_HOST_ENABLED &&` pattern that the
codebase's own DCE convention (and the Settings block in this same diff)
mandates. This is a real tree-shaking risk for the corporate-minimal build, not
a benign style nit — see WR-01. The existing CI gate `verify-allow-custom-host.js`
should catch it if it regresses, but the code as written contradicts the
documented DCE rule and relies on the minifier inlining an exported, test-imported
function, which is not guaranteed.

No blockers: nothing causes incorrect runtime behavior or a security regression
in either build. WR-01 is a build-hygiene / attack-surface risk gated by an
existing CI check; WR-02 is a real but low-severity double-fetch.

### Focus-item verdicts

1. **SSRF posture — UNCHANGED / SAFE.** Hoisting the field out of the form does
   not weaken SSRF. All validation (HTTPS-only `parsed.protocol`, RFC1918/
   link-local/loopback `isPrivateOrLoopback`, reachability `probe` with
   `credentials:"omit"`) still lives entirely inside `ServerUrlField.tsx` and
   runs on blur regardless of mount location. The email `Input` and Continue
   `Button` remain gated by `(ALLOW_CUSTOM_HOST_ENABLED && !serverUrlValidated)`
   at `AuthenticationStep.tsx:530-534` and `:539-544`. Nothing downstream trusts
   an unvalidated `serverUrl`: the store is only written from the `valid` branch
   (`ServerUrlField.tsx:219-226`, `validUrl` is non-null only for `kind:"valid"`).
2. **Fix #9 (local-login gating) — INTACT.** The email/password form is still
   wrapped in `{authView === "local-and-sso" && (...)}` at `AuthenticationStep.tsx:506`.
   Only the URL field moved out. `selectAuthView` is unchanged and still drives
   the form. v1.7.17 server-driven gating is not weakened.
3. **Race-guard — INTACT.** The `useEffect` at `AuthenticationStep.tsx:101-105`
   that clears `authMode` to `null` when `localLoginEnabled` flips false is
   present and unmodified.
4. **DCE — RISK (see WR-01).** The onboarding mount's function-call indirection
   is not the bare-literal form the convention requires.
5. **INT-01 reload notice — HONEST.** Confirmed against `auth.ts:68-91`: the
   store subscriber clears the cached auth client and, on a real (non-test,
   non-initial-hydration) `serverUrl` change, calls
   `setTimeout(() => window.location.reload(), 150)` at `auth.ts:88`. The notice
   ("Changing the server URL will reload the app to apply the new host") matches
   real behavior.
6. **i18n — COMPLETE.** All 10 locales (en, es, fr, de, pt, it, ru, zh-CN,
   zh-TW, ja) carry real, non-placeholder translations for
   `settingsPage.general.serverUrl.{title,description,reloadNotice}`. Verified by
   parsing each JSON file. The pre-existing `onboarding.serverUrl.*` keys the
   field itself consumes are also present.
7. **Double-mount/stale-state — minor (see WR-02).**

## Warnings

### WR-01: Onboarding mount uses function-call indirection instead of bare-literal DCE gate

**File:** `src/components/AuthenticationStep.tsx:482`
**Issue:** The onboarding field is gated by
`{shouldShowServerUrlField(ALLOW_CUSTOM_HOST_ENABLED) && (<ServerUrlField .../>)}`.
The project's documented DCE convention (`src/config/defaults.ts:124-131`,
MEMORY `rolldown_tree_shake.md`) requires the **bare** build-time literal so
Rolldown constant-folds `false && X` and tree-shakes the dependent import. A
function call `shouldShowServerUrlField(false)` is not a folded constant — to
eliminate the branch, the minifier must inline an **exported** function that is
also imported by `serverProviders.test.ts` (a live binding). Inlining of such a
function is not guaranteed across Rolldown versions/config. The Settings block
added in this very same diff uses the correct bare form
(`SettingsPage.tsx:3196 — {ALLOW_CUSTOM_HOST_ENABLED && (...)}`), so the diff is
internally inconsistent.

If the call is *not* folded, `ServerUrlField` stays referenced from the
onboarding module, keeping its SSRF-probe code and the `onboarding.serverUrl.label`
i18n key + `server-url-field` testid literal in the corporate-minimal bundle —
exactly what scenario (2) of `scripts/verify-allow-custom-host.js:45` asserts
must be ABSENT. So this is a real corporate-minimal-build attack-surface leak
risk, not benign. The mitigating factor (why this is WARNING, not BLOCKER): the
CI gate `verify-allow-custom-host.js` will fail the build if it regresses, and
the redundant Settings mount also pulls the module in, so a manual reviewer
might not catch it but CI will.

**Fix:** Drop the passthrough at the call site and use the bare literal,
matching the Settings block and the documented convention:
```tsx
{ALLOW_CUSTOM_HOST_ENABLED && (
  <ServerUrlField
    onValidated={() => setServerUrlValidated(true)}
    onInvalidated={() => setServerUrlValidated(false)}
    disabled={isSocialLoading !== null || isCheckingEmail}
  />
)}
```
The `shouldShowServerUrlField` predicate's stated intent — "the type signature
prevents re-coupling visibility to `authView`" — is preserved by keeping the
function as the unit-tested contract (BUG 1 regression test still passes) while
NOT routing the actual JSX gate through it. If the team wants the function to
remain the gate, run `verify-allow-custom-host.js` (scenario "explicit off") and
confirm the two literals are ABSENT before shipping; do not assume folding.

### WR-02: Two independent fetches of the same provider/session data per host change

**File:** `src/components/AuthenticationStep.tsx:47` + `src/lib/serverProviders.ts:261-274`
**Issue:** Validating a host in `ServerUrlField` fires a reachability `probe`
(GET `/api/auth/get-session`) and, on success, writes `serverUrl` to the store.
That write does two things in parallel: (a) `useServerProviders` re-runs its
effect on the `baseUrl` change and fetches `/api/auth/providers`; (b) the
`auth.ts` subscriber schedules `window.location.reload()` after 150ms. So the
providers fetch kicked off by the store write is racing a full renderer reload
that will immediately re-mount and re-fetch. The first fetch's result is almost
always discarded (component unmounts; `alive` guard at `serverProviders.ts:262,269`
correctly prevents a setState-after-unmount warning, so this is not a crash).
Net effect: one wasted `/api/auth/providers` request per onboarding host
validation. Harmless functionally, but it is a duplicate-fetch artifact of
having the subscriber reload while the hook also reacts to the same slice.
**Fix:** Optional. If the 150ms reload is the canonical "apply new host"
mechanism, the `useServerProviders` subscription to `serverUrl` is redundant for
the onboarding path (the reload re-derives everything). Consider documenting
that the reload is authoritative and the hook re-fetch is a best-effort
pre-reload paint, or gate the hook's re-fetch to skip when a reload is pending.
No code change required for correctness.

## Info

### IN-01: Settings mount of ServerUrlField has no `onValidated` wiring — relies entirely on the in-component store write

**File:** `src/components/SettingsPage.tsx:3204` (`<ServerUrlField />` with no props)
**Issue:** In Settings the field is mounted bare. That is correct — there's no
email/Continue button to gate, and the field writes `serverUrl` to the store
itself on a valid result (`ServerUrlField.tsx:221`), which triggers the reload.
Flagging only so a future reader doesn't "fix" the missing `onValidated` prop
and accidentally couple it to something. No action needed.

### IN-02: `shouldShowServerUrlField` is an identity function on its boolean argument

**File:** `src/lib/serverProviders.ts:153-155`
**Issue:** `shouldShowServerUrlField(allowCustomHost)` returns `allowCustomHost`
unchanged — it is `identity`. The documented rationale (no `authView` argument
so visibility can't be re-coupled) is a legitimate type-signature guard, and the
regression test pins it. The cost is the DCE indirection in WR-01. If WR-01 is
resolved by inlining the bare literal at the call site, the function can stay as
a pure documented contract used by the test only. No correctness issue.

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
