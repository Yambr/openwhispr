---
quick_id: 260522-wt5
type: quick
title: "Provider-lockdown leaks — Notes cloud model list, MCP card, MCP URL, verify gate"
files_modified:
  - src/components/ReasoningModelSelector.tsx
  - src/components/McpIntegrationCard.tsx
  - src/components/IntegrationsView.tsx
  - scripts/verify-provider-lockdown.js
autonomous: true
---

<objective>
PROVIDER_LOCKDOWN leaks confirmed by LIVE Playwright verification of the
corporate-minimal Electron build (PROVIDER_LOCKDOWN_ENABLED=true) — drove the
real app, not assumptions. All fixes are build-time gating only; the default
build (OPENWHISPR_PROVIDER_LOCKDOWN unset) stays upstream-parity.

Purpose: corporate-minimal build must expose ONLY "OpenWhispr Cloud" + "Local"
surfaces — no upstream provider tabs, no BYOK API-key inputs, no raw cloud
model names (GPT-5.5 etc.), no MCP-to-public-openwhispr.com.

Output: gated cloud model list in ReasoningModelSelector, gated McpIntegrationCard,
MCP URL sourced from the existing build-time var, extended verify-provider-lockdown.js
bundle-grep (now asserting raw GPT model names absent), documented findings.
</objective>

<context>
@.planning/quick/260522-wt5-lockdown-leaks-notes-mcp/PLAN.md

LIVE-VERIFIED FACTS (drove the real Electron app under PROVIDER_LOCKDOWN_ENABLED=true):

  - Settings → Language Models, Speech-to-Text: CLEAN. Only "OpenWhispr Cloud" +
    "Local". NO fix needed.
  - Notes onboarding → "Configure an AI model" expanded: provider tabs
    (OpenAI/Anthropic/Gemini/Groq/Custom) and the "Paste your API key" input ARE
    correctly hidden by ReasoningModelSelector's internal `!PROVIDER_LOCKDOWN_ENABLED`
    gates. NO fix needed for those.
  - **REAL LEAK (new)**: in Notes onboarding under Cloud mode, the model card list
    shows raw OpenAI model names — "GPT-5.5 / GPT-5.2 / GPT-5 Mini / GPT-5 Nano /
    GPT-4.1 / GPT-4.1 Mini / GPT-4.1 Nano". The corporate build must NOT expose GPT
    model names — Cloud mode routes to our server, which picks the model internally.
  - Integrations → MCP card: leaks "https://mcp.openwhispr.com/mcp" + API-key
    instructions. Ungated.
  - Integrations → API keys section: correctly gated, not visible. NO fix.

ROOT CAUSE of the model-list leak (verified by reading source):
  - NotesOnboarding.tsx:163 mounts `<ReasoningModelSelector/>` with NO `mode` prop,
    so `effectiveMode` defaults to "cloud" (ReasoningModelSelector.tsx:324).
  - Under "cloud" mode, ReasoningModelSelector renders the cloud model card list at
    lines 634-643 — `<ModelCardList models={selectedCloudModels} .../>`. This block
    is the ONLY part of the cloud branch with NO `!PROVIDER_LOCKDOWN_ENABLED` gate.
    The provider tabs (line 516), custom panel (526), and per-provider API-key
    inputs (538-632) ARE all gated; the model list is not.
  - `selectedCloudModels` (lines 367-384) defaults to `openaiModelOptions` because
    `selectedCloudProvider` initializes to "openai" (line 325). The data is
    `REASONING_PROVIDERS.openai.models`, sourced from
    src/models/modelRegistryData.json `cloudProviders[0]` (id="openai", models:
    gpt-5.5, gpt-5.2, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano).

WHY SETTINGS IS CLEAN (the correct reference — verified in InferenceConfigEditor.tsx):
  - Settings never renders ReasoningModelSelector for the Cloud path under lockdown.
    `InferenceConfigEditor.tsx:172-174` gates `config.mode === "providers" &&
    renderModelSelector("cloud")` behind `!PROVIDER_LOCKDOWN_ENABLED`. Under
    lockdown, `providers` mode is DCE'd entirely (modes array line 102-106 omits
    `providersEntry`); the only cloud surface is the `openwhispr` mode, which
    renders NO model selector — just the InferenceModeSelector card "OpenWhispr
    Cloud — No setup needed." The cloud model picker is simply absent.
  - Therefore the correct corporate behavior for Cloud reasoning = NO model
    sub-list at all. Cloud is one path; the server chooses the model. This is
    Option B from the brief, and it's exactly what Settings already does.

TranscriptionModelPicker — VERIFIED ALREADY CORRECT (no leak, no fix):
  - Cloud STT model list lives at TranscriptionModelPicker.tsx:927-935
    (`<ModelCardList models={cloudModelOptions} .../>`), also ungated.
  - BUT under lockdown `cloudProviders` is sliced to `base.slice(0, 1)` (line 318),
    so only the first transcription provider survives, and `cloudModelOptions`
    (lines 659-670) is built from `currentCloudProvider.models` for that single
    our-server provider — not raw OpenAI/groq/mistral Whisper model names. The
    live Settings → Speech-to-Text check confirmed this surface is CLEAN. The STT
    cloud provider's model entries are the our-server routed options, intended.
    No code change for TranscriptionModelPicker.
  - NOTE for Task 4 verify: the STT first-provider's model `id`/`name` values must
    NOT themselves be raw vendor names (e.g. "whisper-large-v3"). Confirm against
    modelRegistryData transcriptionProviders[0] during the verify run; if the
    first STT provider exposes raw whisper model ids, that is a SEPARATE finding to
    file in SERVER-REQUIREMENTS / a follow-up — do NOT expand scope here, document it.

Confirmed facts for the MCP tasks (unchanged from prior plan revision):
  - generate-build-config.js:23 defines OPENWHISPR_MCP_URL default
    "https://mcp.openwhispr.com/mcp".
  - src/vite.config.mjs:47 wires VITE_OPENWHISPR_MCP_URL.
  - src/config/defaults.ts:39 exports OPENWHISPR_MCP_URL.
  - McpIntegrationCard.tsx:13 hardcodes the literal, shadowing the build-time var.
  - IntegrationsView.tsx:106-109 mounts McpIntegrationCard with NO lockdown gate.
  - IntegrationsView.tsx:67 uses the literal `{!PROVIDER_LOCKDOWN_ENABLED && (...)}`
    DCE pattern for the ApiKeysSection panel — the precedent to mirror.
  - PROVIDER_LOCKDOWN_ENABLED already imported in IntegrationsView.tsx:20.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Gate the cloud reasoning model list under lockdown (fixes the GPT-name leak)</name>
  <files>src/components/ReasoningModelSelector.tsx</files>
  <action>
    Gate the cloud model card list block at lines 634-643 — the
    `<div className="pt-3 space-y-2">` wrapping the `{t("reasoning.selectModel")}`
    heading and `<ModelCardList models={selectedCloudModels} .../>` — behind the
    literal Rolldown-DCE gate `{!PROVIDER_LOCKDOWN_ENABLED && (...)}`.

    DECISION — Option B (hide the cloud model list entirely under lockdown).
    Rationale: this mirrors the canonical Settings behavior. InferenceConfigEditor
    (the Settings reference) renders NO model selector for the Cloud/openwhispr
    path under lockdown — Cloud is one path, the server picks the model, there is
    nothing to choose. Option A (a synthetic single "OpenWhispr Cloud" entry) was
    rejected: it would diverge from Settings, require a new i18n string and a
    synthetic model id, and still imply a user-facing model choice that does not
    exist. Hiding the list is the cleaner, lower-delta fix and is consistent with
    the existing PROVIDER_LOCKDOWN pattern in this same file.

    Under lockdown the `effectiveMode === "cloud"` branch then renders: the MODE
    tabs (Cloud/Local — kept, line 492-507), and an empty cloud panel body. That
    matches the brief's intent (Cloud = OpenWhispr Cloud, no model sub-list).
    PROVIDER_LOCKDOWN_ENABLED is already imported (line 25) — no new import.

    Replace the existing Phase-10 comment block at lines 511-515 so it also notes
    that the cloud MODEL card list is DCE-eliminated under lockdown (currently the
    comment says "the model card list still renders" — that line is now wrong and
    must be corrected to state the list is gated out, Cloud routes to our server
    which selects the model).

    `selectedCloudModels`, `openaiModelOptions`, and the `ModelCardList` import
    become unreferenced under lockdown only inside the gated subtree — that is the
    intended DCE; do NOT delete the imports or the useMemo hooks (they are still
    used in the default build). Do not change any other behavior. No new i18n
    strings — `reasoning.selectModel` stays defined, just unreferenced under
    lockdown (translation JSON bundled wholesale).
  </action>
  <verify>
    <automated>grep -B2 'selectedCloudModels' src/components/ReasoningModelSelector.tsx | grep -q 'PROVIDER_LOCKDOWN_ENABLED' && npm run typecheck</automated>
  </verify>
  <done>The cloud model-list block (heading + ModelCardList) in ReasoningModelSelector.tsx is wrapped in `{!PROVIDER_LOCKDOWN_ENABLED && (...)}`; the lines 511-515 comment is corrected to say the model list is DCE'd under lockdown; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 2: Source MCP URL from the build-time var (fixes the hardcoded-URL shadow)</name>
  <files>src/components/McpIntegrationCard.tsx</files>
  <action>
    Replace the hardcoded literal at line 13
    `const MCP_URL = "https://mcp.openwhispr.com/mcp";` with an import of the
    existing build-time var. Add `OPENWHISPR_MCP_URL` to the component's imports
    from `../config/defaults` and set `const MCP_URL = OPENWHISPR_MCP_URL;` (keep
    the local `MCP_URL` name so the two usages at lines 28 and 66 are untouched).
    Leave MCP_DOCS_URL as-is — not in scope. Do not change any other behavior.
    This fix is correct independent of Task 3's gating: the default build must
    honor the configured OPENWHISPR_MCP_URL.
  </action>
  <verify>
    <automated>grep -q 'OPENWHISPR_MCP_URL' src/components/McpIntegrationCard.tsx && ! grep -q '"https://mcp.openwhispr.com/mcp"' src/components/McpIntegrationCard.tsx && echo OK</automated>
  </verify>
  <done>McpIntegrationCard.tsx imports OPENWHISPR_MCP_URL from config/defaults; no hardcoded mcp.openwhispr.com literal remains in the file.</done>
</task>

<task type="auto">
  <name>Task 3: Gate the MCP integration card behind lockdown</name>
  <files>src/components/IntegrationsView.tsx</files>
  <action>
    Wrap the MCP section block at IntegrationsView.tsx:106-109 (the
    `<div><SectionLabel>{t("integrations.sections.mcp")}</SectionLabel>
    <McpIntegrationCard .../></div>`) in the literal Rolldown-DCE gate
    `{!PROVIDER_LOCKDOWN_ENABLED && (...)}`, exactly mirroring the ApiKeysSection
    panel pattern already used at lines 67-104 in the same file.
    PROVIDER_LOCKDOWN_ENABLED is already imported at line 20 — no new import.
    Add a short comment above the gate matching the style of the lines 63-66
    comment, noting that MCP integration points at the public mcp.openwhispr.com
    surface — an upstream surface cut from the corporate build — and the
    `!PROVIDER_LOCKDOWN_ENABLED` literal lets Rolldown DCE the McpIntegrationCard
    import out of the corporate bundle.

    DECISION: cut the whole card under lockdown. Owner intent from the live
    session: corporate build = strictly our server, no upstream surfaces;
    MCP-to-public-openwhispr.com is an upstream surface. ALTERNATIVE NOT TAKEN:
    keeping the card but repointing MCP_URL at the corporate server — rejected
    because the corporate server exposes no MCP endpoint and the card's copy/docs
    flow assumes the public product. If a corporate MCP endpoint ships later,
    revisit by un-gating and relying on OPENWHISPR_MCP_URL (already done in Task 2).

    No i18n changes — no new strings (existing `integrations.sections.mcp` key
    stays, just unreferenced under lockdown; translation JSON bundled wholesale).
  </action>
  <verify>
    <automated>grep -A2 'integrations.sections.mcp' src/components/IntegrationsView.tsx | grep -q 'PROVIDER_LOCKDOWN_ENABLED' && npm run typecheck</automated>
  </verify>
  <done>The MCP SectionLabel + McpIntegrationCard mount is wrapped in `{!PROVIDER_LOCKDOWN_ENABLED && (...)}`; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 4: Extend verify-provider-lockdown.js — SURFACE group + raw cloud model names</name>
  <files>scripts/verify-provider-lockdown.js</files>
  <action>
    Add a new target group catching the leak classes this round exposed: the
    unreviewed renderer surfaces (MCP) AND the raw cloud model names that now DCE
    out once Task 1 gates the model list. Define a new const after
    TRANSCRIPTION_TARGETS:

      const SURFACE_TARGETS = [
        "mcp.openwhispr.com",   // McpIntegrationCard URL — absent when card DCE'd
        "GPT-5.5",              // raw cloud model label — absent when the
        "GPT-5.2",              // ReasoningModelSelector cloud model list is
        "GPT-5 Mini",           // DCE'd under lockdown (Task 1)
        "GPT-4.1",
      ];

    Notes on target selection (the grep is a FIXED-STRING dist/ bundle grep; only
    literals that actually DCE out are valid absence signals — VERIFY each during
    the Task 5 run):
      - Raw GPT model names: after Task 1, under lockdown the cloud model-list
        subtree (ModelCardList + selectedCloudModels) is DCE'd. The model LABELS
        ("GPT-5.5" etc.) come from modelRegistryData.json `cloudProviders[0].models`.
        CAVEAT: modelRegistryData.json is imported wholesale by ModelRegistry.ts;
        if the JSON is bundled as a whole module the GPT label strings may survive
        regardless of the flag — same wholesale-import problem as translation JSON.
        Run the script once. If "GPT-5.5" is still present under lockdown because
        modelRegistryData survives as a bundled module, these are NOT valid absence
        signals — in that case DROP the GPT-* entries from SURFACE_TARGETS and
        instead target a code-path literal unique to the gated cloud model-list
        JSX subtree. If no such literal exists, document in Findings that the
        bundle-grep cannot assert GPT-name absence (data-module survives) and that
        the leak is closed at the RENDER layer (Task 1) verified live, not via grep.
      - "mcp.openwhispr.com": same caveat — OPENWHISPR_MCP_URL's value is also
        emitted into the generated-config module. If it survives under lockdown
        with no consumer, drop it and target the McpIntegrationCard docs-path
        literal `integrations/mcp` (component-local, DCEs with the card) instead.
      - Do NOT add i18n translation keys (`integrations.sections.mcp`,
        `reasoning.selectModel`, `apiKeysSection.*`) — translation JSON is bundled
        wholesale and survives regardless of the flag.

    Register the group in the GROUPS object:
      const GROUPS = { OAUTH, ALT_CLOUD, BYOK, ENTERPRISE, TRANSCRIPTION, SURFACE };
    SURFACE is then automatically included in ALL_GROUPS, so both scenarios
    (default expectPresent / lockdown expectAbsent) exercise it with no further
    change to SCENARIOS.

    Update the header doc comment (the "Five target groups" list) to "Six target
    groups" and add a one-line SURFACE_TARGETS description.
  </action>
  <verify>
    <automated>node -c scripts/verify-provider-lockdown.js && grep -q 'SURFACE' scripts/verify-provider-lockdown.js && echo OK</automated>
  </verify>
  <done>verify-provider-lockdown.js has a SURFACE target group (MCP URL + raw GPT model names) registered in GROUPS; header comment updated; file parses. Final validity of each literal is settled by the Task 5 run.</done>
</task>

<task type="auto">
  <name>Task 5: Full verification + document findings</name>
  <files>.planning/quick/260522-wt5-lockdown-leaks-notes-mcp/PLAN.md</files>
  <action>
    Run the full verification sequence:
      1. Regenerate corporate build-config:
         `OPENWHISPR_PROVIDER_LOCKDOWN=true node scripts/generate-build-config.js`
      2. `npm run typecheck`
      3. `npm run verify:provider-lockdown`
    The verify script builds both scenarios and restores the default build at the end.

    If `verify:provider-lockdown` fails on the new SURFACE group because a target
    literal survives in a wholesale-bundled data/config module under lockdown,
    apply the Task 4 CAVEAT fallbacks (swap GPT-* for a component-local code-path
    literal, swap "mcp.openwhispr.com" for the `integrations/mcp` docs path) and
    re-run. If no valid code-path literal exists, drop the target and document the
    grep limitation in Findings — the leak is closed at the render layer (Tasks
    1+3) and that was verified LIVE; the grep is a regression tripwire, not the
    sole proof.

    Then restore the build-config to its default-build state so the committed
    generated files are not left in lockdown:
      `node scripts/generate-build-config.js`  (no env — resets to false)
    and confirm `git diff --stat` shows no unintended change to
    src/config/build-config.generated.{ts,cjs}.

    Append a `## Findings` section to this PLAN.md documenting:
      - The GPT-name leak: root cause (ungated cloud model list in
        ReasoningModelSelector, mounted mode-less by NotesOnboarding so it
        defaults to "cloud"), the fix (Task 1, Option B — gate the list, mirror
        Settings), and confirmation that Settings was already correct.
      - TranscriptionModelPicker: no fix needed, cloudProviders.slice(0,1) +
        per-provider models already restrict the STT cloud list; record the
        first-STT-provider model-id check outcome from the verify run.
      - MCP card + URL: Tasks 2+3.
      - The SURFACE verify group: which literals proved valid absence signals and
        which (if any) were dropped due to wholesale bundling.
  </action>
  <verify>
    <automated>OPENWHISPR_PROVIDER_LOCKDOWN=true node scripts/generate-build-config.js && npm run typecheck && npm run verify:provider-lockdown</automated>
  </verify>
  <done>typecheck passes; verify:provider-lockdown reports 0 violations across both scenarios including the new SURFACE group (or documented grep-limitation fallback applied); build-config restored to default state; Findings section appended.</done>
</task>

</tasks>

<verification>
- `OPENWHISPR_PROVIDER_LOCKDOWN=true node scripts/generate-build-config.js` then
  `npm run verify:provider-lockdown` → 0 violations, both scenarios.
- `npm run typecheck` → clean.
- Default build (no env): Notes onboarding cloud mode shows the full GPT model
  list; McpIntegrationCard renders with OPENWHISPR_MCP_URL value; upstream parity.
- Corporate build: Notes onboarding cloud mode shows NO model list (Cloud = our
  server picks); no provider tabs; no API-key UI; no MCP card.
- Atomic commits: one per task (Task 1 = model-list leak, Task 2 = MCP URL,
  Task 3 = MCP card gate, Task 4 = verify gate, Task 5 = findings doc).
</verification>

<success_criteria>
- Model-list leak: ReasoningModelSelector cloud model card list gated behind
  `!PROVIDER_LOCKDOWN_ENABLED`, DCE'd in the corporate bundle — no raw GPT names.
- MCP card gated behind `!PROVIDER_LOCKDOWN_ENABLED`, DCE'd in corporate bundle.
- MCP URL sourced from OPENWHISPR_MCP_URL build-time var; no hardcoded literal.
- Verify gate: new SURFACE target group catches the unreviewed-surface and
  raw-model-name leak classes (subject to bundle-grep validity per Task 5).
- Default build unchanged (upstream parity); corporate build exposes only
  Cloud + Local with no model sub-lists.
- No new i18n strings; 9 locales untouched.
</success_criteria>

<output>
Append a `## Findings` section to this PLAN.md (Task 5). Add a row to STATE.md
"Quick Tasks Completed" table: quick_id 260522-wt5, title, date, atomic commits.
</output>

## Findings

Verification run (2026-05-22): `npm run typecheck` clean;
`npm run verify:provider-lockdown` → **OK — 2 scenarios, 44 greps, 0 violations**.
Build-config restored to default state afterward (`PROVIDER_LOCKDOWN_ENABLED =
false`, `git diff --stat` on `build-config.generated.{ts,cjs}` empty).

### The GPT-name leak (closed — Task 1)

Root cause confirmed exactly as the context block described: the cloud model
card list in `ReasoningModelSelector.tsx` (`<ModelCardList models={selectedCloudModels}/>`)
was the only part of the `effectiveMode === "cloud"` branch with no
`!PROVIDER_LOCKDOWN_ENABLED` gate. `NotesOnboarding.tsx` mounts the selector
mode-less, so `effectiveMode` defaults to `"cloud"` and the list rendered the
raw OpenAI labels (GPT-5.5 / GPT-5.2 / GPT-5 Mini / … / GPT-4.1 Nano).

Fix (Option B): the model-list block is now wrapped in
`{!PROVIDER_LOCKDOWN_ENABLED && (...)}`, mirroring the canonical Settings
behavior — `InferenceConfigEditor.tsx` renders no model selector for the Cloud
path under lockdown. Under lockdown the corporate Cloud branch renders the
Cloud/Local mode tabs and nothing else; the server picks the model. Settings
(Language Models, Speech-to-Text) was already correct and needed no change.

### TranscriptionModelPicker (no code change — but a separate follow-up filed)

No fix needed for the picker: under lockdown `cloudProviders` is sliced to
`base.slice(0, 1)`, so only the first transcription provider survives and the
Cloud STT model list is built from that single provider's `models`.

**Separate finding (NOT fixed here, out of scope per plan):** the first
transcription provider in `modelRegistryData.json` is `id: "openai"` and its
`models` expose raw vendor ids/names — `gpt-4o-mini-transcribe` ("GPT-4o Mini
Transcribe"), `gpt-4o-transcribe` ("GPT-4o Transcribe"), `whisper-1`
("Whisper"). So under lockdown the corporate Speech-to-Text Cloud surface still
shows raw OpenAI transcription model names. The live Settings check in the
context block reported this surface "CLEAN" — that observation should be
re-checked, or the registry's first transcription provider should be made an
our-server-routed entry. Recommend filing in `SERVER-REQUIREMENTS.md` /
a follow-up quick task; scope was not expanded here.

### MCP card + URL (closed — Tasks 2, 3)

- Task 2: `McpIntegrationCard.tsx` now imports `OPENWHISPR_MCP_URL` from
  `config/defaults`; the hardcoded `mcp.openwhispr.com/mcp` literal that
  shadowed the build-time var is gone. Correct for the default build too.
- Task 3: the MCP `SectionLabel` + `McpIntegrationCard` mount in
  `IntegrationsView.tsx` is gated behind `!PROVIDER_LOCKDOWN_ENABLED`,
  mirroring the `ApiKeysSection` pattern. The card and its imports DCE out of
  the corporate bundle.

### The SURFACE verify group — bundle-grep validity

The new SURFACE group ended with **one** valid target after the Task 5 run:

- **KEPT** `docs.openwhispr.com/integrations/mcp` — `McpIntegrationCard`'s
  `MCP_DOCS_URL`, a component-local literal that DCEs with the card. Confirmed
  absent under lockdown, present in the default build.
- **DROPPED** `mcp.openwhispr.com` — `OPENWHISPR_MCP_URL`'s value is emitted
  into the generated `runtime-env.json` / build-config module, bundled
  wholesale; it survives under lockdown regardless of the gate. Not a valid
  absence signal. (Same wholesale-bundling problem as i18n translation JSON.)
- **DROPPED** raw GPT model names (`GPT-5.5` etc.) — they originate in
  `modelRegistryData.json`, imported wholesale by `ModelRegistry.ts`; the
  labels survive as a bundled data module regardless of the flag. The only
  model-list code-path literal is the i18n key `reasoning.selectModel`, also
  wholesale-bundled — no valid grep target exists. The model-list leak is
  closed at the **render layer** (Task 1 gate), verified live; the bundle-grep
  is a regression tripwire for the MCP surface, not proof of GPT-name absence.
