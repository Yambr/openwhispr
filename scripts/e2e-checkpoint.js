#!/usr/bin/env node
// v1.7.13 e2e checkpoint recorder.
//
// Runs `npm run test:e2e` and parses its JSON reporter output to record
// pass/fail counts in .planning/e2e-checkpoints/HEAD-<sha>.json. The
// pre-push git hook (scripts/git-hooks/pre-push) refuses to push unless a
// green checkpoint exists for the current HEAD.
//
// Usage:
//   node scripts/e2e-checkpoint.js              # full e2e
//   node scripts/e2e-checkpoint.js --tag=@v1.7.13  # filter by tag
//   node scripts/e2e-checkpoint.js --quick       # smoke (@v1.7.13 only)

"use strict";

const { spawnSync, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CHECKPOINTS_DIR = path.join(ROOT, ".planning/e2e-checkpoints");

function parseArgs(argv) {
  const opts = { tag: null, quick: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--quick") opts.quick = true;
    else if (arg.startsWith("--tag=")) opts.tag = arg.slice("--tag=".length);
  }
  if (opts.quick && !opts.tag) opts.tag = "@v1.7.13";
  return opts;
}

function headSha() {
  return execSync("git rev-parse --short=12 HEAD", { cwd: ROOT })
    .toString()
    .trim();
}

function runE2E(tag) {
  // bddgen + playwright in two steps so we can pass --grep.
  const bddgen = spawnSync(
    "npx",
    ["bddgen", "--config", "tests/e2e/playwright.config.ts"],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (bddgen.status !== 0) {
    console.error("bddgen failed; aborting checkpoint.");
    process.exit(2);
  }
  const args = [
    "playwright",
    "test",
    "--config",
    "tests/e2e/playwright.config.ts",
    "--reporter=list,json",
  ];
  if (tag) args.push("--grep", tag);
  const r = spawnSync("npx", args, {
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: "" },
  });
  return r.status;
}

function readReport() {
  // The file name is misleading — playwright's "json" reporter writes its
  // OWN structure to tests/e2e/reports/cucumber.json (the path was named
  // that for historical reasons). Shape:
  //   { suites: [ { suites: [ { specs: [ { tests: [ { results: [...] } ] } ] } ] } ] }
  // A spec is "passed" if every test result has status "passed".
  const report = path.join(ROOT, "tests/e2e/reports/cucumber.json");
  if (!fs.existsSync(report)) {
    return { passed: 0, failed: 0, found: false };
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(report, "utf8"));
  } catch {
    return { passed: 0, failed: 0, found: false };
  }
  let passed = 0;
  let failed = 0;
  // Recursively flatten suites → specs → tests → results.
  function visitSuite(suite) {
    for (const spec of suite.specs || []) {
      const results = (spec.tests || []).flatMap((t) => t.results || []);
      if (results.length === 0) continue;
      const allPassed = results.every((r) => r.status === "passed");
      const anyFailed = results.some(
        (r) => r.status === "failed" || r.status === "timedOut"
      );
      if (anyFailed) failed += 1;
      else if (allPassed) passed += 1;
    }
    for (const sub of suite.suites || []) visitSuite(sub);
  }
  for (const top of data.suites || []) visitSuite(top);
  return { passed, failed, found: true };
}

async function main() {
  const opts = parseArgs(process.argv);
  console.log(
    `[e2e-checkpoint] mode=${opts.quick ? "quick" : "full"}` +
      (opts.tag ? ` tag=${opts.tag}` : "")
  );
  const exit = runE2E(opts.tag);
  const sha = headSha();
  const { passed, failed, found } = readReport();
  if (!found) {
    console.error("[e2e-checkpoint] no cucumber.json report found — abort.");
    process.exit(2);
  }
  fs.mkdirSync(CHECKPOINTS_DIR, { recursive: true });
  const file = path.join(CHECKPOINTS_DIR, `HEAD-${sha}.json`);
  const record = {
    sha,
    recordedAt: new Date().toISOString(),
    tag: opts.tag || null,
    mode: opts.quick ? "quick" : "full",
    passed,
    failed,
    runExitCode: exit,
  };
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  console.log(
    `[e2e-checkpoint] wrote ${path.relative(ROOT, file)} — ` +
      `passed=${passed}, failed=${failed}, exit=${exit}`
  );
  if (failed > 0 || exit !== 0) {
    console.error("[e2e-checkpoint] CHECKPOINT NOT GREEN — push will be blocked.");
    process.exit(1);
  }
}

main();
