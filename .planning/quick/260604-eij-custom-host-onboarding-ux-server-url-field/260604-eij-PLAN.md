---
phase: quick-260604-eij
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
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
autonomous: true
requirements: [UI-01, UI-02, UI-03, UI-04]
must_haves:
  truths:
    - "On the onboarding welcome view, when ALLOW_CUSTOM_HOST_ENABLED is true, the Server URL field renders even if the default server returns localLogin:false and zero providers (authView is sso-only or no-methods)"
    - "After a user validates a custom Server URL in onboarding, the providers fetch re-runs against the new host so that host's localLogin/providers drive authView"
    - "The email/password form stays gated by authView === local-and-sso for the RESOLVED host (fix #9 not weakened); only the Server URL field is hoisted out"
    - "The email Input and Continue button stay disabled until serverUrlValidated is true when ALLOW_CUSTOM_HOST_ENABLED"
    - "A Server URL section appears in Settings (gated by ALLOW_CUSTOM_HOST_ENABLED) that lets the user change the host post-onboarding and applies via the existing auth.ts reload path"
    - "All new UI strings exist in all 10 locales"
  artifacts:
    - path: "src/components/AuthenticationStep.tsx"
      provides: "ServerUrlField hoisted above ServerProviderButtons, independent of authView"
      contains: "ServerUrlField"
    - path: "src/lib/serverProviders.ts"
      provides: "Pure node-testable predicate shouldShowServerUrlField (independent of authView)"
      contains: "shouldShowServerUrlField"
    - path: "src/lib/serverProviders.test.ts"
      provides: "Regression: field-visibility predicate independent of sso-only/no-methods authView"
      contains: "shouldShowServerUrlField"
    - path: "src/components/SettingsPage.tsx"
      provides: "Server URL settings section using the shared ServerUrlField"
      contains: "ServerUrlField"
  key_links:
    - from: "src/components/AuthenticationStep.tsx"
      to: "src/lib/serverProviders.ts"
      via: "shouldShowServerUrlField + selectAuthView called separately"
      pattern: "shouldShowServerUrlField"
    - from: "src/components/SettingsPage.tsx"
      to: "src/stores/settingsStore.ts"
      via: "ServerUrlField -> setServerUrl -> auth.ts subscribe reload"
      pattern: "ServerUrlField"
---

<objective>
Fix two bugs in the v1.8.0 runtime-host (custom-host) feature, both hit live by the owner.

BUG 1 (HIGH) — onboarding chicken-and-egg: the Server URL field is gated behind the
DEFAULT server's `authView === "local-and-sso"` answer, so when yambr.com returns
localLogin:false / zero providers, the field that lets a self-hoster point at their own
server never renders. Hoist the field out of that conditional.

BUG 2 (MED) — no post-onboarding host change: `setServerUrl` exists but no Settings UI is
wired to it. Add a Server URL section to Settings using the same ServerUrlField.

Purpose: complete the existing fork-only ALLOW_CUSTOM_HOST feature so self-hosters can both
enter their host during onboarding and change it later.
Output: hoisted onboarding field + re-fetch confirmation, a pure regression predicate + test,
a Settings Server URL section, and i18n keys in all 10 locales.

Ship target: v1.7.19 (plain next patch — do NOT touch package.json version; release step tags).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

# Already-read findings (do NOT re-read these; the facts below are load-bearing):

UPSTREAM-PARITY CLEARANCE (verified via git show upstream/main):
- ServerUrlField, authView, serverUrlValidated, selectAuthView, ALLOW_CUSTOM_HOST,
  "local-and-sso" do NOT exist in upstream/main. Every line touched in
  AuthenticationStep.tsx is Yambr-fork drift (commits 260603-qhw #9 + v1.8.0 Phase 4).
  serverProviders.ts and ServerUrlField.tsx are fork-only files. Editing all of these is IN BOUNDS.
- Do NOT edit any line that turns out upstream-verbatim. If you encounter one, STOP and flag.

INT-01 RESOLVED BY EXISTING ARCHITECTURE (src/lib/auth.ts lines 68-92):
- auth.ts already subscribes to useSettingsStore: on serverUrl change it invalidates the
  cached inner authClient (cachedInner = null), notifies main (notifyServerUrlChanged), and
  triggers window.location.reload() after a 150ms defer (skipped in test env / initial hydration).
- So a Settings host change DOES propagate via a full renderer reload. The Settings UI must
  surface an HONEST "the app will reload to apply" notice (matching real behavior), NOT a fake
  "restart manually" or silent success. Do NOT fabricate a no-op success state.

BUG 1 RE-FETCH ALREADY WIRED (src/lib/serverProviders.ts lines 233-256):
- useServerProviders() subscribes to serverUrl: baseUrl = serverUrl || OPENWHISPR_BACKEND_URL,
  useEffect deps [baseUrl]. So when ServerUrlField persists a new serverUrl, the providers fetch
  ALREADY re-runs against the new host and drives authView. NO change to the hook is required.
  Task 1 only verifies this is intact; the field hoist is the actual fix.

TEST HARNESS IS NODE-ONLY (vitest.config.ts: environment "node", no jsdom / no testing-library):
- serverProviders.test.ts mocks the store module and tests PURE functions only.
- A React render-based regression is IMPOSSIBLE here. The BUG 1 regression MUST be a pure
  predicate test (see Task 2), not a component render.

GATING SEMANTICS (src/lib/serverProviders.ts):
- selectAuthView({localLoginEnabled, providerCount}) -> "local-and-sso" | "sso-only" | "no-methods".
  Email form is gated by authView === "local-and-sso". This gating MUST stay for the resolved host.
- The race-guard useEffect (AuthenticationStep.tsx ~97-101) clears authMode when localLoginEnabled
  flips false. Must NOT break.

SETTINGS PATTERNS (src/components/SettingsPage.tsx):
- "general" case (~line 2311) is the host section. Pattern per block: <div> wrapping
  <SectionHeader title=.. description=..> + <SettingsPanel><SettingsPanelRow><SettingsRow ...>.
- ALLOW_CUSTOM_HOST_ENABLED import: add to the existing "@/config/defaults" import (line 39
  already imports PROVIDER_LOCKDOWN_ENABLED from there).
- ServerUrlField import path from SettingsPage: "./onboarding/ServerUrlField".

ServerUrlField props: onValidated(url), onInvalidated(), disabled. It writes serverUrl to the
store itself (via setServerUrl in its effect), so Settings only needs to render it + show the
reload notice; no separate save wiring required for persistence.

i18n existing keys: onboarding.serverUrl.{label,helper,errorEmpty,errorScheme,errorInvalid,
errorUnreachable,checking,success} already in all locales (en at line 227). New Settings keys go
under settingsPage.general.serverUrl.* (or settings.serverUrl.* — match neighbors).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Hoist ServerUrlField out of the authView gate in onboarding</name>
  <files>src/components/AuthenticationStep.tsx</files>
  <action>
Fix BUG 1 (UI-01/UI-02). In the "Main welcome view" return (currently ~line 454), move the
ServerUrlField OUT of the `authView === "local-and-sso"` conditional and OUT of the email
`<form>`. Render it directly in the welcome view, positioned ABOVE ServerProviderButtons (right
under the welcome header `</div>` at ~line 468, before the `<ServerProviderButtons .../>`), wrapped
only in `{ALLOW_CUSTOM_HOST_ENABLED && (...)}`. Keep its existing props exactly: onValidated sets
serverUrlValidated true, onInvalidated sets it false, disabled={isSocialLoading !== null || isCheckingEmail}.

Remove the now-duplicate ServerUrlField mount that lives inside the `authView === "local-and-sso"`
form block (~lines 503-509). Do NOT touch anything else inside that block: the email Input and the
Continue Button keep their existing disabled logic
`(ALLOW_CUSTOM_HOST_ENABLED && !serverUrlValidated)` UNCHANGED — fix #9's gating of the email form by
authView === "local-and-sso" stays intact for the resolved host.

Do NOT modify the race-guard useEffect (~97-101) that clears authMode when localLoginEnabled flips
false. Do NOT modify useServerProviders — the re-fetch on serverUrl change is already wired there
(deps [baseUrl], baseUrl = serverUrl || OPENWHISPR_BACKEND_URL). After hoisting, when the user
validates a new host, ServerUrlField persists it, useServerProviders re-fetches against the new
host, and selectAuthView re-derives from the NEW host's localLogin/providers — confirm this chain by
reading, not by adding code.

Use shouldShowServerUrlField (added in Task 2) as the wrap condition instead of a bare
ALLOW_CUSTOM_HOST_ENABLED literal, so the same predicate is the one unit-tested:
`{shouldShowServerUrlField(ALLOW_CUSTOM_HOST_ENABLED) && (<ServerUrlField ... />)}`. Import it from
"../lib/serverProviders". (Order Task 2 first if you prefer; either order compiles.)
  </action>
  <verify>
    <automated>cd /Users/nick/openwhispr && npx tsc --noEmit 2>&1 | grep -i AuthenticationStep || echo "no tsc errors in AuthenticationStep"</automated>
    Manual structural check: grep shows exactly ONE ServerUrlField mount in AuthenticationStep.tsx,
    and it is NOT inside the `authView === "local-and-sso"` block:
    `grep -n "ServerUrlField\|authView === \"local-and-sso\"" src/components/AuthenticationStep.tsx`
  </verify>
  <done>ServerUrlField renders in the welcome view independent of authView, gated only by
  shouldShowServerUrlField(ALLOW_CUSTOM_HOST_ENABLED); the duplicate mount inside the local-and-sso
  form is gone; email Input/Button serverUrlValidated gating and the race-guard useEffect are
  unchanged; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add pure shouldShowServerUrlField predicate + node regression test (BUG 1)</name>
  <files>src/lib/serverProviders.ts, src/lib/serverProviders.test.ts</files>
  <behavior>
    - shouldShowServerUrlField(true) === true regardless of any authView value (the field's
      visibility takes NO authView argument — proving independence by construction).
    - shouldShowServerUrlField(false) === false (DCE-gated build hides it).
    - Regression assertion: for every AuthView selectAuthView can produce — "local-and-sso",
      "sso-only" (localLoginEnabled:false, providerCount>0), "no-methods" (localLoginEnabled:false,
      providerCount:0) — shouldShowServerUrlField(true) is STILL true. This codifies BUG 1: the
      field is not gated by the default host's localLogin answer.
  </behavior>
  <action>
Export a pure total function in serverProviders.ts (near selectAuthView):
`export function shouldShowServerUrlField(allowCustomHost: boolean): boolean { return allowCustomHost; }`
with a doc comment explaining that visibility is INTENTIONALLY independent of authView — it takes no
authView argument so the type system itself prevents re-coupling it to the default host's gate
(BUG 1 regression contract). This is the predicate AuthenticationStep wraps the mount in.

Add tests to serverProviders.test.ts matching the existing harness style (vi.mock the store +
defaults, describe/it/expect). Add a `describe("shouldShowServerUrlField (BUG 1 regression)")` block
that: (1) asserts true/false passthrough; (2) loops over the three selectAuthView outputs computed
from representative inputs and asserts shouldShowServerUrlField(true) === true for each — i.e. the
field stays visible even when selectAuthView returns "sso-only" or "no-methods". Do NOT attempt a
React render (harness is node-only, no jsdom).
  </action>
  <verify>
    <automated>cd /Users/nick/openwhispr && npx vitest run src/lib/serverProviders.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>shouldShowServerUrlField exported and consumed by AuthenticationStep; new regression
  describe block passes; whole serverProviders.test.ts suite green.</done>
</task>

<task type="auto">
  <name>Task 3: Add Server URL Settings section + i18n in all 10 locales (BUG 2)</name>
  <files>src/components/SettingsPage.tsx, src/locales/en/translation.json, src/locales/es/translation.json, src/locales/fr/translation.json, src/locales/de/translation.json, src/locales/pt/translation.json, src/locales/it/translation.json, src/locales/ru/translation.json, src/locales/zh-CN/translation.json, src/locales/zh-TW/translation.json, src/locales/ja/translation.json</files>
  <action>
Fix BUG 2 (UI-03/UI-04). In SettingsPage.tsx, add ALLOW_CUSTOM_HOST_ENABLED to the existing
`import { BILLING_ENABLED, PROVIDER_LOCKDOWN_ENABLED } from "@/config/defaults";` (line 39) and import
ServerUrlField from "./onboarding/ServerUrlField".

In the "general" case (~line 2311), add a new section block (matching the Appearance/Sound Effects
pattern: a `<div>` with `<SectionHeader title description>` then `<SettingsPanel><SettingsPanelRow>`
containing the field). Gate the whole block with `{ALLOW_CUSTOM_HOST_ENABLED && (...)}` so the
default build folds it out via Rolldown DCE (per the rolldown_tree_shake rules — gate the JSX with a
bare `&&` on the build-time literal, do not branch through a helper that defeats DCE).

Inside the panel render `<ServerUrlField />` with no onValidated/onInvalidated needed for persistence
(the component writes serverUrl to the store itself). Below it, render a persistent informational
notice (e.g. a muted-text line) explaining that changing the server URL will reload the app to apply
the new host — this matches the REAL behavior in auth.ts (useSettingsStore.subscribe -> 150ms
window.location.reload). Do NOT add a fake "Save" success toast or claim it applied without reload.
Use t() for the notice. No restart-by-hand language; the reload is automatic.

i18n: add a new key group (e.g. settingsPage.general.serverUrl with keys: title, description,
reloadNotice — and any helper/label you reference) to ALL 10 locale files: en, es, fr, de, pt, it,
ru, zh-CN, zh-TW, ja. Provide real translations per language (not English placeholders) for the
human-readable strings; keep brand/technical terms (OpenWhispr, URL, https) untranslated per i18n
rules. Reuse the existing onboarding.serverUrl.* keys for the field's own label/helper/errors — do
NOT duplicate those; only add the new Settings-section wrapper strings. Keep JSON valid (no trailing
commas, correct nesting matching each file's structure).
  </action>
  <verify>
    <automated>cd /Users/nick/openwhispr && for L in en es fr de pt it ru zh-CN zh-TW ja; do node -e "JSON.parse(require('fs').readFileSync('src/locales/$L/translation.json','utf8'))" && echo "$L valid JSON" || echo "$L INVALID"; done</automated>
    <automated>cd /Users/nick/openwhispr && KEY="serverUrl"; for L in en es fr de pt it ru zh-CN zh-TW ja; do node -e "const j=require('./src/locales/$L/translation.json'); const g=j.settingsPage&&j.settingsPage.general&&j.settingsPage.general.serverUrl; process.exit(g&&g.title&&g.reloadNotice?0:1)" && echo "$L has settings serverUrl keys" || echo "$L MISSING settings serverUrl keys"; done</automated>
  </verify>
  <done>Server URL section renders in Settings > General when ALLOW_CUSTOM_HOST_ENABLED, uses the
  shared ServerUrlField, shows an honest auto-reload notice; new settings i18n keys present and valid
  in all 10 locales; default build still DCE-folds the section.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user-typed Server URL → fetch/probe/authClient | untrusted host string crosses into network requests |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-eij-01 | I (Info disclosure / SSRF) | ServerUrlField probe + authClient host | accept | Existing M2/WARN-02 guards in ServerUrlField (HTTPS-only + RFC1918/loopback/link-local screening) are unchanged by this plan; no new entry point bypasses them — the Settings section reuses the SAME ServerUrlField component. |
| T-eij-02 | T (Tampering / stale-host token leak) | authClient after host change | mitigate | auth.ts subscribe invalidates cachedInner and forces window.location.reload on serverUrl change (HIGH-02 mitigation, pre-existing). Settings UI surfaces the reload honestly; no silent no-op that would leave a stale authClient bound to the old host with a valid token. |
| T-eij-03 | E (Elevation via build gate bypass) | ALLOW_CUSTOM_HOST_ENABLED DCE | accept | Both new mount points use a bare `&&` on the build-time literal so the default (corporate-minimal/upstream-parity) build folds the field + section out entirely; no runtime path enables them. |
</threat_model>

<verification>
- tsc --noEmit clean for touched files.
- `npx vitest run src/lib/serverProviders.test.ts` green, including the new BUG 1 regression block.
- `npm test` (full vitest run) green — no regressions.
- All 10 locale JSON files parse and contain the new settings serverUrl keys.
- Manual grep: exactly one ServerUrlField mount in AuthenticationStep.tsx, not inside the
  local-and-sso block.
</verification>

<success_criteria>
- BUG 1: onboarding welcome view shows the Server URL field whenever ALLOW_CUSTOM_HOST_ENABLED,
  independent of the default host's authView (sso-only / no-methods). Validating a host re-runs the
  providers fetch against it (already-wired hook confirmed). Email form gating by authView and the
  serverUrlValidated input/button gating are unchanged.
- BUG 2: Settings > General shows a Server URL section (gated by ALLOW_CUSTOM_HOST_ENABLED) using the
  shared ServerUrlField with an honest auto-reload notice.
- INT-01 handled by the existing auth.ts reload path; no faked success.
- i18n in all 10 locales; no hardcoded UI strings.
- `npm test` and `npx tsc --noEmit` both pass.
</success_criteria>

<output>
After completion, create
`.planning/quick/260604-eij-custom-host-onboarding-ux-server-url-field/260604-eij-SUMMARY.md`.
</output>
