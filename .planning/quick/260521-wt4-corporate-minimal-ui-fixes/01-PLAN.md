---
phase: quick-260521-wt4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/hooks/useUsage.ts
  - src/components/ControlPanelSidebar.tsx
  - src/components/ControlPanel.tsx
  - src/components/UpgradePrompt.tsx
  - src/components/IntegrationsView.tsx
  - src/stores/settingsStore.ts
autonomous: true
requirements: [WT4-FIX1, WT4-FIX2, WT4-FIX3]
must_haves:
  truths:
    - "Corporate build (PROVIDER_LOCKDOWN_ENABLED=true / BILLING_ENABLED=false) shows no upgrade banner, no limit banner, no UpgradePrompt"
    - "Corporate build shows MCP/CLI integrations unlocked (no 'Pro required' lock)"
    - "Corporate build first-run defaults cloudBackupEnabled to true"
    - "Corporate build defaults all inference-mode settings to 'openwhispr', never 'providers'"
    - "Default build (both flags off) is byte-for-byte upstream-parity"
  artifacts:
    - path: "src/hooks/useUsage.ts"
      provides: "isOverLimit/isApproachingLimit const-folded false under BILLING_ENABLED=false"
    - path: "src/components/ControlPanelSidebar.tsx"
      provides: "banner blocks gated behind BILLING_ENABLED"
    - path: "src/stores/settingsStore.ts"
      provides: "lockdown-aware defaults for cloudBackupEnabled + inference modes"
  key_links:
    - from: "ControlPanelSidebar.tsx"
      to: "BILLING_ENABLED"
      via: "build-time literal gate on banner JSX"
      pattern: "BILLING_ENABLED"
---

<objective>
Eliminate Pro/upgrade/limit surfaces from the corporate-minimal build and fix
two first-run setting defaults that break under PROVIDER_LOCKDOWN.

Purpose: Corporate build = all features ON, no plan gating. Live testing found
upgrade banners, "Pro required" locks, backup defaulting off, and the dictation
agent defaulting to a mode (`providers`) that is physically cut from the build.

Output: Build-time-gated billing surfaces + lockdown-aware setting defaults.
Default build (flags off) stays upstream-parity.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md

<interfaces>
From src/config/defaults.ts — both are direct named re-exports of build-time
boolean literals (Rolldown DCE-traceable; the `Generated.*` alias form is
forbidden):
```typescript
export { BILLING_ENABLED } from "./build-config.generated";
export { PROVIDER_LOCKDOWN_ENABLED } from "./build-config.generated";
```
- `BILLING_ENABLED` — false in corporate build. Pro IS billing; reuse this flag,
  do NOT introduce a new flag.
- `PROVIDER_LOCKDOWN_ENABLED` — true in corporate build.

useUsage.ts:184-185 current logic (verified):
```
const isOverLimit = !isSubscribed && limit > 0 && wordsUsed >= limit;
const isApproachingLimit = !isSubscribed && limit > 0 && wordsUsed >= limit * 0.8 && !isOverLimit;
```

ControlPanelSidebar.tsx:73-79 — `showLimitBanner` / `showUpgradeBanner` derive
from `isProUser` / `isOverLimit` props; banner JSX at lines 166-218. No
BILLING_ENABLED gate currently.

ControlPanel.tsx — `UpgradePrompt` rendered ~line 635 behind `showUpgradePrompt`
state set ~line 224; `IntegrationsView isPaid={!!(usage?.isSubscribed || usage?.isTrial)}`
~line 896. `isPaid` flows IntegrationsView -> McpIntegrationCard / CliIntegrationCard
where `!isPaid` renders the "Pro required" lock.

settingsStore.ts (verified line numbers):
- 696: `cloudBackupEnabled: readBoolean("cloudBackupEnabled", false)`
- 859-870: `dictationAgentMode` IIFE — `readString("dictationAgentMode", "")`,
  fallback `return "providers" as InferenceMode`
- 643: `cloudTranscriptionMode: readString("cloudTranscriptionMode", "openwhispr")` — already openwhispr
- 644: `cleanupCloudMode: readString("cleanupCloudMode", "openwhispr")` — already openwhispr
- 842-854: `chatAgentMode` IIFE — already fallback `"openwhispr"`, default arg `"openwhispr"`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Neutralize usage limits under BILLING_ENABLED=false</name>
  <files>src/hooks/useUsage.ts</files>
  <action>
  In useUsage.ts import `BILLING_ENABLED` from `@/config/defaults` (match the
  existing import style/alias used elsewhere in the file or hooks dir; use a
  relative path `../config/defaults` if `@/` is not configured for hooks).
  Change lines 184-185 so that when `BILLING_ENABLED` is false, both
  `isOverLimit` and `isApproachingLimit` const-fold to `false`. Write it as a
  build-time literal short-circuit so Rolldown DCEs the limit arithmetic in the
  corporate build, e.g. gate the existing expression behind
  `BILLING_ENABLED && (...)`. Do not add a runtime flag or new state.
  When BILLING_ENABLED is true the behavior must be identical to today.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p . 2>&1 | grep -i useUsage || echo "no useUsage type errors"</automated>
  </verify>
  <done>Under BILLING_ENABLED=false, useUsage() returns isOverLimit=false and isApproachingLimit=false regardless of wordsUsed/limit. Flag-on behavior unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Gate sidebar banners + UpgradePrompt + integration locks behind BILLING_ENABLED</name>
  <files>src/components/ControlPanelSidebar.tsx, src/components/ControlPanel.tsx, src/components/UpgradePrompt.tsx, src/components/IntegrationsView.tsx</files>
  <action>
  ControlPanelSidebar.tsx: import `BILLING_ENABLED` from `@/config/defaults`.
  Fold it into both derived booleans so they become `false` under
  BILLING_ENABLED=false — prepend `BILLING_ENABLED &&` to both `showLimitBanner`
  (line 73) and `showUpgradeBanner` (line 74-79). This leaves the banner JSX
  blocks (166-186, 188-218) unreferenced under lockdown so Rolldown DCEs them,
  including the `logoIcon` use if no longer referenced. Do not delete the JSX.

  ControlPanel.tsx: ensure `UpgradePrompt` cannot mount under BILLING_ENABLED=false.
  Gate the `setShowUpgradePrompt(true)` call site (~line 224) and the
  `<UpgradePrompt .../>` render (~line 635) behind `BILLING_ENABLED`. Prefer
  gating the render with `{BILLING_ENABLED && <UpgradePrompt ... />}` so the
  component DCEs; also guard the setter so no dead state flips.
  Set `IntegrationsView isPaid` (~line 896) to `BILLING_ENABLED ? !!(usage?.isSubscribed || usage?.isTrial) : true` so corporate build treats every
  integration as unlocked.

  UpgradePrompt.tsx: confirm it has no other mount sites (grep already shows
  only ControlPanel + useAudioRecording.js). If useAudioRecording.js triggers an
  upgrade flow, gate that trigger behind `BILLING_ENABLED` too. If UpgradePrompt
  itself is fully dead under the ControlPanel gate, no internal change is needed —
  document that in the commit message.

  IntegrationsView.tsx: `isPaid` now arrives `true` under lockdown, so
  McpIntegrationCard / CliIntegrationCard render unlocked automatically — no
  change needed inside the card files. Verify the `onUpgrade` prop is still
  passed (harmless when unused). Do not hardcode any strings; all copy already
  has i18n keys.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p . 2>&1 | grep -iE "ControlPanel|UpgradePrompt|IntegrationsView" || echo "no type errors"</automated>
  </verify>
  <done>Corporate build renders no limit banner, no upgrade banner, never mounts UpgradePrompt, and shows MCP/CLI cards unlocked. Default build behavior unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: Lockdown-aware setting defaults (cloudBackup + inference modes)</name>
  <files>src/stores/settingsStore.ts</files>
  <action>
  Import `PROVIDER_LOCKDOWN_ENABLED` from `../config/defaults` (confirm path;
  defaults.ts is renderer-only and settingsStore is renderer — safe).

  FIX 2 — line 696: change to
  `cloudBackupEnabled: readBoolean("cloudBackupEnabled", PROVIDER_LOCKDOWN_ENABLED)`
  so the first-run default is `true` under lockdown, `false` otherwise. A stored
  value still wins (readBoolean only uses the fallback when key absent).

  FIX 3 — line 859-870 `dictationAgentMode` IIFE: change the default arg of
  `readString("dictationAgentMode", "")` to keep `""` (so the validation branch
  still runs) and change the final fallback `return "providers" as InferenceMode`
  to `return (PROVIDER_LOCKDOWN_ENABLED ? "openwhispr" : "providers") as InferenceMode`.
  Under lockdown the `providers` mode is cut by InferenceConfigEditor, so the
  default must be `openwhispr`.

  Audit the other inference-mode defaults for the same "default = providers but
  mode cut under lockdown" bug. Inspect every `InferenceMode`-typed field
  initializer in this file (transcriptionMode line 157, newReasoningMode 171,
  agentInferenceMode 211-228 in migrateAgentMode, cleanupMode, meetingTranscriptionMode,
  noteFormattingMode, chatAgentMode). For EACH one whose default/fallback can
  resolve to `providers`, `self-hosted`, or `enterprise`, apply the same
  `PROVIDER_LOCKDOWN_ENABLED ? "openwhispr" : <original>` treatment. Fields that
  already default to `openwhispr` (cloudTranscriptionMode 643, cleanupCloudMode
  644, chatAgentMode 843-854) need no change — note them as verified in the
  commit message. Do NOT change stored-value handling, only the fallback/default
  args. Keep the validation IIFE shape intact.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p . 2>&1 | grep -i settingsStore || echo "no settingsStore type errors"</automated>
  </verify>
  <done>Under PROVIDER_LOCKDOWN_ENABLED: cloudBackupEnabled first-run default is true; no InferenceMode field can default/fallback to a lockdown-cut mode (providers/self-hosted/enterprise) — all such cases default to openwhispr. Default build unchanged.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p .` passes.
- Regenerate corporate build-config: `OPENWHISPR_PROVIDER_LOCKDOWN=true node scripts/generate-build-config.js` then `OPENWHISPR_PROVIDER_LOCKDOWN=true npm run build:renderer` succeeds.
- Manual: launch corporate build — sidebar shows no banners, integrations unlocked, backup toggle on by default, dictation agent mode resolves to OpenWhispr Cloud.
- Restore default build-config (`node scripts/generate-build-config.js`) before finishing.
</verification>

<success_criteria>
- Corporate build: zero Pro/upgrade/limit UI; backup on; inference modes default openwhispr.
- Default build: upstream-parity preserved.
- Three atomic commits, one per task. No hardcoded strings.
</success_criteria>

<output>
After completion, append a row per fix to STATE.md "Quick Tasks Completed" table.
</output>
