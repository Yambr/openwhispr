import { restoreDefault } from "./build-lockdown-renderer";

/**
 * Restore the default (no-env, corporate-minimal) build-config + renderer so
 * the working tree is left as the test found it. The generated files are
 * gitignored, so we regenerate with an empty env rather than git-checkout.
 */
export default function globalTeardown(): void {
  console.log("[lockdown-ui] globalTeardown: restoring default renderer build…");
  try {
    restoreDefault();
    console.log("[lockdown-ui] globalTeardown: default build restored.");
  } catch (err) {
    console.error(
      "[lockdown-ui] globalTeardown: FAILED to restore default build. " +
        "Run `node scripts/generate-build-config.js && npm run build:renderer` manually.",
      err,
    );
  }
}
