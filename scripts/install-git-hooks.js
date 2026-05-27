#!/usr/bin/env node
// v1.7.13 — install the e2e pre-push guard into .git/hooks/.
//
// Idempotent: if a custom pre-push already exists and isn't ours, this
// script refuses to clobber it and prints how to chain them. Otherwise
// it copies scripts/git-hooks/pre-push → .git/hooks/pre-push and chmods.
//
// Run automatically by `postinstall:hooks` and on demand via
// `npm run git:install-hooks`.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "scripts/git-hooks/pre-push");
const HOOKS_DIR = path.join(ROOT, ".git/hooks");
const DST = path.join(HOOKS_DIR, "pre-push");
// Marker the script embeds so we can detect our own installation.
const MARKER = "v1.7.13 pre-push guard";

if (!fs.existsSync(HOOKS_DIR)) {
  // Not inside a git checkout (e.g., npm-published consumer). Silent skip.
  process.exit(0);
}

const incoming = fs.readFileSync(SRC, "utf8");

if (fs.existsSync(DST)) {
  const existing = fs.readFileSync(DST, "utf8");
  if (existing === incoming) {
    console.log("[install-git-hooks] pre-push already up-to-date.");
    process.exit(0);
  }
  if (!existing.includes(MARKER)) {
    console.error(
      "[install-git-hooks] .git/hooks/pre-push exists and is NOT the project " +
        "guard. Refusing to overwrite. Inspect it and chain manually, or delete " +
        "it and re-run `npm run git:install-hooks`."
    );
    process.exit(1);
  }
  // Our marker present but content drifted — refresh.
}

fs.writeFileSync(DST, incoming, { mode: 0o755 });
console.log(`[install-git-hooks] installed ${path.relative(ROOT, DST)}`);
