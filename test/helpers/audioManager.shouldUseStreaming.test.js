// Uses globals enabled in vitest.config.ts (test, expect, describe available without import).
//
// PATH CHOICE: C — smoke-grep
// Rationale: audioManager.js is ~2200 lines, uses ES-module `import` syntax,
//   and shouldUseStreaming() depends on a renderer-only `localStorage` global,
//   a `getSettings()` import that pulls in the entire settings store, the
//   `REALTIME_MODELS` set, the build-time `STREAMING_ENABLED` constant from
//   ../config/defaults, plus instance state (this.context, this.sttConfig).
//   Both Path A (extract pure helper) and Path B (mock-heavy unit test) cost
//   ~50-80 lines of plumbing for low marginal coverage on top of the existing
//   `verify:feature-gating` script which already exercises the gate
//   end-to-end against a real production bundle.
// Effort: 2 smoke tests, ~40 lines.
// Risk if downgraded to C: LOW. The gate's runtime behavior is covered by
//   `npm run verify:feature-gating` (asserts the streaming entry-points are
//   absent from a `OPENWHISPR_STREAMING=false` build). These smoke-grep tests
//   provide defense-in-depth: catch accidental removal of the explicit
//   `if (!STREAMING_ENABLED) return false;` first-line guard during refactors,
//   even before a build is produced.
// What this test does NOT cover (deferred):
//   - The downstream branches (useLocalWhisper, batch mode, REALTIME_MODELS,
//     openwhispr signed-in, notes streaming preference). Those remain
//     exercised only via integration paths.
//   - Path A (pure-function extraction) is filed as a future enhancement —
//     when audioManager.js gets a broader refactor, lift shouldUseStreaming()
//     into src/helpers/shouldUseStreaming.js and add 4+ branch tests.

const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../src/helpers/audioManager.js"),
  "utf8"
);

describe("audioManager.shouldUseStreaming — STREAMING_ENABLED gate (Phase 04.1 WR-01)", () => {
  test("function contains the STREAMING_ENABLED early-return guard as the first statement", () => {
    // Match: shouldUseStreaming(...) { ... } — capture body up to the closing brace at 2-space indent.
    const funcMatch = SOURCE.match(
      /shouldUseStreaming\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/
    );
    expect(funcMatch).not.toBeNull();

    const body = funcMatch[1];
    // Strip leading whitespace and any leading // or /* */ comments.
    let stripped = body;
    while (true) {
      const next = stripped.replace(/^\s+/, "");
      if (next.startsWith("//")) {
        stripped = next.replace(/^\/\/[^\n]*\n/, "");
        continue;
      }
      if (next.startsWith("/*")) {
        stripped = next.replace(/^\/\*[\s\S]*?\*\//, "");
        continue;
      }
      stripped = next;
      break;
    }

    // The very first executable statement must be the gate.
    expect(stripped).toMatch(
      /^if\s*\(\s*!STREAMING_ENABLED\s*\)\s*return\s+false\s*;/
    );
  });

  test("STREAMING_ENABLED is imported from config/defaults at the top of the file", () => {
    expect(SOURCE).toMatch(
      /import\s*\{[^}]*\bSTREAMING_ENABLED\b[^}]*\}\s*from\s*["']\.\.\/config\/defaults["']/
    );
  });
});
