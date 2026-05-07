# Coding Conventions

**Analysis Date:** 2026-05-07

## Naming Patterns

**Files:**
- React components: PascalCase with `.tsx` extension (e.g., `ErrorBoundary.tsx`, `ControlPanel.tsx`)
- Helper modules: camelCase with `.js` or `.ts` extension (e.g., `hotkeyManager.js`, `database.js`)
- Services: PascalCase with `.ts` extension (e.g., `ReasoningService.ts`, `NotesService.ts`)
- Stores: camelCase with `.ts` extension ending in "Store" (e.g., `settingsStore.ts`, `actionStore.ts`)
- Hooks: camelCase with `.ts` or `.js` extension starting with "use" (e.g., `useSettings.ts`, `useAudioRecording.js`)
- Test files: match source filename with `.test.*` suffix (e.g., `transcriptText.test.js`)

**Functions:**
- Exported functions: camelCase (e.g., `initializeActions()`, `transcriptsOverlap()`, `normalizeUiLanguage()`)
- Event handlers: camelCase starting with "handle" or action verb (e.g., `handleReload()`, `ensureIpcListeners()`)
- Zustand action functions: simple camelCase verbs (e.g., `addActionToStore()`, `updateActionInStore()`)
- Private/internal functions: camelCase with leading underscore when needed (e.g., `_asyncVectorUpsert()`)

**Variables:**
- Constants: UPPER_SNAKE_CASE (e.g., `HOTKEY_REGISTRATION_DELAY_MS`, `DEFAULT_HOTKEY`, `GNOME_NATIVE_SLOTS`)
- Module state (top-level): camelCase prefixed with "has" or condition (e.g., `hasBoundIpcListeners`)
- Class properties: camelCase (e.g., `this.slots`, `this.db`, `this.currentHotkey`)
- React hook state: camelCase from destructure (e.g., `const { actions } = useActionStore()`)

**Types/Interfaces:**
- Exported interfaces: PascalCase with suffix or complete naming (e.g., `ErrorBoundaryProps`, `TranscriptionSettings`, `NoteInput`, `SearchResult`)
- Type aliases: PascalCase (e.g., `LocalTranscriptionProvider`, `InferenceMode`, `TranscriptionStatus`)
- Union types: PascalCase joined by pipe (e.g., `"personal" | "meeting" | "upload"`)

## Code Style

**Formatting:**
- Formatter: Prettier v3.8.3
- Key settings: `printWidth: 100`, `tabWidth: 2`, `semi: true`, `singleQuote: false`, `trailingComma: "es5"`, `arrowParens: "always"`
- End-of-line: LF
- Bracket spacing: enabled

**Linting:**
- ESLint v10.2.1 with typescript-eslint
- Separate configs for root (CommonJS, main process) and `/src` (ES modules, React + TypeScript)
- Root config: `eslint.config.js` (CJS, Node globals)
- Renderer config: `src/eslint.config.js` (ES modules, React-specific rules)

**Key Lint Rules:**
- `no-unused-vars`: Warn with patterns `^_`, `^event`, `^err`, `^error` ignored (root) or `^[A-Z_]` (src)
- `react-hooks/rules-of-hooks`: Error
- `react-hooks/exhaustive-deps`: Warn
- `no-console`: Off (enabled for debugging in Electron)
- `no-empty`: Error except empty catch blocks
- `react-refresh/only-export-components`: Warn for non-component exports

**TypeScript:**
- Target: ES2022
- Module: ESNext
- JSX: react-jsx
- `strict: false` (lenient for gradual migration)
- `skipLibCheck: true`, `isolatedModules: true`, `forceConsistentCasingInFileNames: true`
- Path alias: `@/*` → current directory (used minimally)

## Import Organization

**Order (observed pattern):**
1. Node.js built-ins (`const { app } = require("electron")`)
2. npm dependencies (`const Database = require("better-sqlite3")`)
3. Relative helpers (`const debugLogger = require("./debugLogger")`)
4. Relative services/utils (`import { cloudGet } from "./cloudApi.js"`)
5. Type imports (when TS) (`import type { LocalTranscriptionProvider } from "../types/electron"`)

**No barrel files convention** — most imports are direct from individual files. Stores and services avoid re-exporting.

**React imports:**
- React hooks from "react" imported explicitly when needed
- i18next hooked via `useTranslation()` from "react-i18next"
- Window API accessed via `window.electronAPI` (preload bridge)

## Error Handling

**Patterns:**
- Try/catch blocks wrap async operations, IPC calls, and file I/O
- Errors logged via `debugLogger.log()` or `logger.logReasoning()`
- Graceful fallbacks: if native binary missing → fallback to polling, if API fails → retry or skip
- Column-add errors in database migrations: wrapped with "duplicate column" check (example: `database.js` lines 34–38)
- IPC error propagation: errors from main process handlers thrown to renderer via Promise rejection

**Example patterns:**
```javascript
try {
  this.db.exec("ALTER TABLE transcriptions ADD COLUMN raw_text TEXT");
} catch (err) {
  if (!err.message.includes("duplicate column")) throw err;
}
```

```typescript
try {
  const keyGetters = {
    openai: () => window.electronAPI.getOpenAIKey(),
    // ...
  };
  apiKey = (await keyGetters[provider]()) ?? undefined;
  if (apiKey) {
    this.apiKeyCache.set(provider, apiKey);
  }
} catch (error) {
  logger.logReasoning(`${provider.toUpperCase()}_KEY_FETCH_ERROR`, {
    provider,
    error: (error as Error).message,
  });
}
```

## Logging

**Framework:** Custom `debugLogger` module (main process) and `logger` utility (renderer, TypeScript)

**Main Process (`src/helpers/debugLogger.js`):**
- `debugLogger.log()` for general logging
- Conditional on `OPENWHISPR_LOG_LEVEL=debug` or `--log-level=debug`
- Logs written to app-specific directory on disk

**Renderer (`src/utils/logger.ts`):**
- `logger.logReasoning(stage, details)` for AI reasoning pipeline
- Format: structured events with key-value pairs (not just strings)
- Example: `logger.logReasoning("CUSTOM_KEY_RETRIEVAL", { provider, hasKey, keyLength })`

**When to log:**
- IPC handler entry/exit
- Error conditions with context
- Audio pipeline state changes (recording start/stop, processing)
- External API calls (provider routing, key retrieval)
- Fallback activation (e.g., "Qdrant unavailable, using FTS5 fallback")

## Comments

**When to comment:**
- Non-obvious algorithm logic (e.g., speech gate thresholds, echo detection)
- Complex regexes (e.g., `RIGHT_SIDE_MODIFIER_PATTERN`)
- Platform-specific workarounds ("macOS: CoreAudio listeners for event-driven detection")
- Important constants with justification ("HOTKEY_REGISTRATION_DELAY_MS = 1000 to ensure localStorage access")

**JSDoc/TSDoc:** Not enforced; used selectively for exported functions and public APIs:
- Service methods with complex return types
- Hook contracts (what props/state they manage)
- Type definitions with non-obvious fields

**Example (rare):**
```typescript
/**
 * Normalize UI language string to a supported language.
 * Falls back to 'en' if not recognized.
 */
export function normalizeUiLanguage(language: string | null | undefined): UiLanguage
```

## Function Design

**Size:** 20–100 lines is typical; keep functions focused on one task.

**Parameters:**
- Single objects for >2 params: `function process(config: { model, provider, timeout })`
- IPC handlers accept `(event, ...args)` from Electron's `ipcMain.handle()`
- Async: use `async/await`, not `.then()` chains

**Return values:**
- Promise<T> for async operations
- Type unions for conditional returns (e.g., `{ suppress: boolean; reason: string }` from `shouldSuppressMicSegment()`)
- Throw errors instead of returning error objects (except IPC, where errors automatically propagate)

**Example (from `ReasoningService.ts`):**
```typescript
private async getApiKey(
  provider: "openai" | "anthropic" | "gemini" | "groq" | "custom"
): Promise<string> {
  // Single responsibility: fetch or return cached key
  let apiKey = this.apiKeyCache.get(provider);
  if (!apiKey) {
    // ... fetch logic
  }
  if (!apiKey) {
    throw new Error(`${provider} API key not configured`);
  }
  return apiKey;
}
```

## Module Design

**Exports:**
- Class: export via `module.exports = ClassName` (CommonJS) or `export class ClassName` (ES modules)
- Functions: named exports (e.g., `export async function create(note)`)
- Singletons: exported as default (e.g., `export default hotkeyManager`)

**Barrel files:** Not used. Imports are always direct from source files.

**Class structure:**
- Constructor initializes state
- Public methods for API surface
- Private methods (prefixed `_` or `#` comment) for internal logic
- Zustand stores: export hooks, keep state mutation internal via store actions

**Example (Store pattern from `actionStore.ts`):**
```typescript
const useActionStore = create<ActionState>()(() => ({
  actions: [],
}));

export async function initializeActions(): Promise<ActionItem[]> {
  // Public async function
}

function addActionToStore(action: ActionItem): void {
  // Private helper
  useActionStore.setState({ actions: [...] });
}

export function useActions(): ActionItem[] {
  // Public hook
  return useActionStore((state) => state.actions);
}
```

## Internationalization (i18n) — MANDATORY

**Framework:** react-i18next v17 + i18next v26

**Setup:**
- Initialization in `src/i18n.ts`
- Translation files: `src/locales/{lang}/translation.json`
- Supported languages: en, es, fr, de, pt, it, ru, ja, zh-CN, zh-TW (10 total)

**How to use:**

In React components:
```typescript
import { useTranslation } from "react-i18next";

export default function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t("notes.list.title")}</h1>;
}
```

With interpolation:
```typescript
const { t } = useTranslation();
t("notes.upload.using", { model: "Whisper" })
// Key in JSON: "notes.upload.using": "Using {{ model }} for transcription"
```

In main process (`src/helpers/i18nMain.js`):
```javascript
const { i18nMain } = require("./i18nMain");
const message = i18nMain.t("hotkey.errors.alreadyRegistered", { hotkey });
```

**Rules (MANDATORY):**
1. Every new UI string must have a translation key in ALL 10 language files
2. Use `useTranslation()` hook in components and services
3. Keep `{{variable}}` interpolation syntax for dynamic values (Handlebars style)
4. Do NOT translate: brand names (OpenWhispr, Pro), technical terms (Markdown, Signal ID), format names (MP3, WAV), AI system prompts
5. Group keys by feature area: `notes.editor.*`, `referral.toasts.*`, `hotkey.errors.*`
6. Nested keys max 3 levels deep: `section.subsection.key`

**Checking i18n coverage:**
```bash
npm run i18n:check
```

## IPC Patterns

**Main process handlers** (`src/helpers/ipcHandlers.js`):
- Registered via `ipcMain.handle(channel, handler)`
- Channel naming: kebab-case (e.g., `db-save-transcription`, `get-openai-key`)
- Handler signature: `async (event, ...args) => result`
- Error handling: throw errors, Electron automatically converts to Promise rejection in renderer

**Renderer calls:**
- Via `window.electronAPI.methodName()` (preload bridge in `preload.js`)
- Returns Promise (all IPC is async)
- Error handling: `.catch()` or `try/await`

**Pattern example:**
```javascript
// Main process (ipcHandlers.js)
ipcMain.handle("db-save-transcription", async (event, text, rawText, options) => {
  return databaseManager.saveTranscription(text, rawText, options);
});

// Renderer (component or service)
const result = await window.electronAPI.dbSaveTranscription(text, rawText, options);
```

**Preload bridge** (`preload.js`):
- Defines all exposed IPC methods in `window.electronAPI` object
- Context isolation enabled (secure)
- Validates arguments when needed

## State Management

**Zustand stores** (in `src/stores/`):
- `create<StateInterface>()(initializer)` factory pattern
- Immutable updates via `setState({ ... })`
- Hooks extracted as separate functions (e.g., `export function useActions()`)
- Initialization: async functions called on app startup (e.g., `initializeActions()`)

**Settings store** (`src/stores/settingsStore.ts`):
- Persisted to localStorage and `.env` file
- Large interface combining multiple setting categories (Transcription, Cleanup, Hotkey, etc.)
- Selector function: `selectResolvedLLMConfig(state, scope)` for multi-scope inference setup

**React context:** Rarely used; prefer Zustand for app-wide state.

---

*Conventions analysis: 2026-05-07*
