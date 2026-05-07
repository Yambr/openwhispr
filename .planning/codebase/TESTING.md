# Testing Patterns

**Analysis Date:** 2026-05-07

## Test Framework

**Runner:**
- Node.js built-in `node:test` module (no external test framework)
- Version: Node 24 (pinned in `.nvmrc`)

**Assertion Library:**
- Node.js built-in `node:assert/strict` module

**Run Commands:**
```bash
node --test test/**/*.test.js        # Run all tests
node --test test/helpers/*.test.js   # Run specific test suite
```

No npm test script defined yet. Tests are manually invoked via Node.

## Test File Organization

**Location:**
- Co-located in separate `test/` directory (not alongside source)
- Mirrors helper module structure: `test/helpers/*.test.js`

**Naming:**
- Pattern: `{moduleName}.test.js`
- Examples: `transcriptText.test.js`, `localSpeechGate.test.js`, `meetingEchoLeakDetector.test.js`

**Structure:**
```
test/
├── helpers/
│   ├── meetingEchoLeakDetector.test.js
│   ├── localSpeechGate.test.js
│   └── transcriptText.test.js
```

## Test Structure

**Suite organization** (from actual test files):
```javascript
const test = require("node:test");
const assert = require("node:assert/strict");

// Import code under test
const { transcriptsOverlap, transcriptsLooselyOverlap } = require("../../src/helpers/transcriptText");

// Individual test
test("descriptive test name", () => {
  // Arrange: set up test data
  const input1 = "a distribution mechanism?";
  const input2 = "mechanism as a future";
  
  // Act & Assert: execute and verify
  assert.equal(
    transcriptsOverlap(input1, input2),
    true
  );
});

// Multiple assertions in one test
test("test name", () => {
  assert.equal(result1, expected1);
  assert.equal(result2, expected2);
});
```

**Async test pattern** (from `localSpeechGate.test.js`):
```javascript
test("async behavior", async () => {
  // Can use await
  const { createLocalSpeechGateState, recordLocalSpeechWindow } = 
    await import("../../src/helpers/localSpeechGate.js");
  
  const state = createLocalSpeechGateState();
  recordLocalSpeechWindow(state, 0.0012, 0.01);
  
  assert.deepEqual(getLocalSpeechGateDecision(state), {
    skip: true,
    reason: "silence",
    peakRms: 0.0016,
    // ...
  });
});
```

**Assertion patterns:**
- `assert.equal(actual, expected)` — value equality
- `assert.deepEqual(actual, expected)` — deep object/array equality
- `assert.throws(fn, error)` — exception testing (not in current tests)
- `assert.true(condition)` / `assert.false(condition)` — boolean checks

## What's Currently Tested

**Test coverage** (3 test files, ~90 assertions total):

**1. `transcriptText.test.js`** (22 lines, 2 tests)
- Function: `transcriptsOverlap()` — detects near-duplicate meeting transcripts
- Function: `transcriptsLooselyOverlap()` — catches chunk-boundary paraphrases
- Tests: Positive cases (long overlapping text), negative cases (short generic fragments)

**2. `localSpeechGate.test.js`** (64 lines, 3 tests)
- Function: `createLocalSpeechGateState()` — initializes audio analysis state
- Function: `recordLocalSpeechWindow()` — records RMS/amplitude for a window
- Function: `getLocalSpeechGateDecision()` — decides if audio is speech or silence/noise
- Tests:
  - Near-silence detection (all windows below thresholds)
  - Isolated noise bursts (energy above silence but no sustained speech)
  - Sustained speech-like energy (passes gate)

**3. `meetingEchoLeakDetector.test.js`** (74 lines, 1 test)
- Class: `MeetingEchoLeakDetector` — detects meeting audio bleeding into mic
- Method: `shouldSuppressMicSegment()` — decides if mic segment is echo/bleed
- Test: Verifies that bleed evidence is retained even when share stays below threshold

## Mocking

**Current approach:** No mocking framework used (Jest, Vitest, sinon not in devDependencies).

**Pattern:** Direct imports, pure functions.
- Tests import actual functions: `const { transcriptsOverlap } = require("../../src/helpers/transcriptText")`
- Functions tested are pure (no external deps, no I/O)

**What to mock (if framework added later):**
- File system calls (`fs` module)
- Database operations (better-sqlite3)
- Electron IPC (`ipcMain.handle`, `ipcRenderer.invoke`)
- External API calls (when testing services)
- Timers (if testing debouncing/throttling)

**What NOT to mock:**
- Helper utility functions (test in isolation)
- Algorithm logic (speech gate, echo detection, overlap detection)
- Type/interface definitions

## Fixtures and Factories

**Test data patterns** (from test files):

**Direct literals in tests:**
```javascript
test("transcriptsOverlap matches near-duplicate meeting transcripts", () => {
  assert.equal(
    transcriptsOverlap(
      "a distribution mechanism? Is it a future product? Is it one of N ways people are",
      "mechanism as a future product? Is it one of the ways we are going to interact wi"
    ),
    true
  );
});
```

**State builders:**
```javascript
test("...", () => {
  const detector = new MeetingEchoLeakDetector();
  const nowMs = 10_000;
  
  detector.systemHistory = [
    {
      timestampMs: nowMs - 250,
      durationMs: 120,
      rms: 0.02,
      samples: new Float32Array(2400),
    },
  ];
  
  detector.micHistory = [
    { timestampMs: ..., correlation: 0.77, ... },
    // ...
  ];
  
  const result = detector.shouldSuppressMicSegment(nowMs - 500, nowMs);
  assert.equal(result.suppress, false);
});
```

**No factory functions defined yet.** If more tests are added:
- Create `test/fixtures/` directory
- Export builder functions: `createMicHistoryEntry()`, `createStateForSilence()`, etc.

## Coverage

**Requirements:** None enforced (no coverage tool configured).

**Current gaps:**
- No tests for React components (ErrorBoundary, ControlPanel, etc.)
- No tests for IPC handlers (ipcHandlers.js)
- No tests for database operations (database.js migrations, queries)
- No tests for services (ReasoningService, NotesService, etc.)
- No tests for stores (Zustand stores)
- No tests for hooks (useSettings, useAudioRecording, etc.)

**Added dependencies needed for full coverage:**
- Jest or Vitest (test runner with coverage)
- Testing Library (React component testing)
- Mock adapters (node:fetch mocks, Electron IPC mocks)

## Test Types

**Unit Tests:**
- Scope: Pure functions in helpers (no I/O, no side effects)
- Approach: Direct function calls with test data
- Examples: `transcriptsOverlap()`, `getLocalSpeechGateDecision()`

**Integration Tests:**
- Not currently implemented
- Would test: Database migrations + queries, IPC round-trips, Store state updates
- Approach: Would require test database, mock Electron context

**E2E Tests:**
- Not used in this project
- Electron + CI would require: headless Electron runner or playwright

## Common Patterns

**Async testing:**
```javascript
test("async import and computation", async () => {
  const { createState, recordWindow } = 
    await import("../../src/helpers/localSpeechGate.js");
  
  const state = createState();
  // ... test
});
```

**Object deep equality:**
```javascript
assert.deepEqual(getLocalSpeechGateDecision(state), {
  skip: true,
  reason: "silence",
  peakRms: 0.0016,
  windowCount: 3,
  speechWindowCount: 0,
});
```

**Boolean checks:**
```javascript
assert.equal(result.suppress, false);
assert.equal(result.hasBleedEvidence, true);
assert.equal(result.likelyRenderBleed, false);
```

**Multiple assertions per test:**
```javascript
test("rejects isolated noise bursts", async () => {
  // ... setup
  const decision = getLocalSpeechGateDecision(state);
  
  assert.equal(decision.skip, true);
  assert.equal(decision.reason, "insufficient_speech");
  assert.equal(decision.peakRms, 0.0028);
  assert.equal(decision.peakAmplitude, 0.018);
});
```

## CI/CD Testing

**GitHub Actions workflows** (in `.github/workflows/`):

**Release workflow** (`release.yml`):
- Runs on: every tag push (`v*.*.*`) or manual trigger
- Platforms: Linux, Windows, macOS (x64 and arm64)
- Steps:
  1. Checkout code
  2. Setup Node.js 24, npm cache
  3. Install dependencies (`npm ci`)
  4. Download platform-specific binaries (whisper.cpp, llama-server, etc.)
  5. Build application (`npm run build:linux/build:win/build:mac`)

**Quality checks** (not yet CI'd):
```bash
npm run format:check    # ESLint + Prettier validation
npm run typecheck       # TypeScript type checking (src/)
npm run quality-check   # Runs both above
npm run i18n:check      # i18n key coverage validation
```

**No test CI step yet** — the 3 existing test files are not run in CI.

## Future Testing Strategy

**Recommended setup for expanded testing:**

1. **Add test script to package.json:**
   ```json
   {
     "scripts": {
       "test": "node --test test/**/*.test.js",
       "test:watch": "node --test --watch test/**/*.test.js",
       "test:coverage": "c8 node --test test/**/*.test.js"
     }
   }
   ```

2. **Add to devDependencies:**
   - `c8` for coverage reporting
   - `@testing-library/react` + `@testing-library/jest-dom` for component testing
   - `jest-mock-electron` or similar for Electron IPC mocking

3. **Create test doubles:**
   - `test/fixtures/` — reusable test data builders
   - `test/mocks/` — Electron, IPC, database mocks
   - `test/setup.js` — global test configuration

4. **Organize by layer:**
   - `test/helpers/*.test.js` — utility functions (DONE: 3 tests)
   - `test/services/*.test.js` — business logic (IPC, API calls)
   - `test/components/*.test.tsx` — React components
   - `test/stores/*.test.ts` — Zustand stores

---

*Testing analysis: 2026-05-07*
