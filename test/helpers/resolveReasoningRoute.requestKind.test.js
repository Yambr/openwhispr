// Uses globals enabled in vitest.config.ts (test, expect, describe available without import).
//
// explicit-requestKind-contract: proves the requestKind discriminator is threaded
// through audioManager.js. POST /api/reason now reads body.requestKind as the PRIMARY
// server router (replacing the fragile systemPrompt-presence heuristic). This test
// guards the two direct cleanup call-sites and the agent-route config block.
//
// PATH CHOICE: C — smoke-grep (consistent with the sibling
//   audioManager.shouldUseStreaming.test.js). resolveReasoningRoute is NOT exported,
//   and audioManager.js uses ES-module `import` syntax + renderer-only globals
//   (localStorage, getSettings, build-time STREAMING_ENABLED). Unit-importing it is
//   the same ~50-80 lines of plumbing the sibling test already rejected. Source-text
//   assertions are the established in-repo pattern for this file.

const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../src/helpers/audioManager.js"),
  "utf8"
);

describe("audioManager — explicit-requestKind-contract threading", () => {
  test("agent-route config block sets requestKind: \"agent\"", () => {
    // Slice the kind:"agent" route object from `kind: "agent",` to the next `};`.
    const start = SOURCE.indexOf('kind: "agent",');
    expect(start).toBeGreaterThan(-1);
    const agentBlock = SOURCE.slice(start, SOURCE.indexOf("};", start));
    expect(agentBlock).toMatch(/requestKind: "agent"/);
  });

  test("exactly two cloud cleanup call-sites set requestKind: \"cleanup\"", () => {
    const cleanupHits = (SOURCE.match(/requestKind: "cleanup"/g) || []).length;
    expect(cleanupHits).toBe(2);
  });

  test("back-compat: no requestKind literal other than cleanup/agent appears in this file", () => {
    // Negative guard — summary/title are set in TS call-sites, never here.
    expect(SOURCE).not.toMatch(/requestKind: "summary"/);
    expect(SOURCE).not.toMatch(/requestKind: "title"/);
  });
});
