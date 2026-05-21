/**
 * Shared helpers: (re)generate the build-config + renderer bundle for a given
 * env, and restore the default build.
 *
 * Provider-lockdown is enforced by build-time dead-code elimination: the
 * renderer bundle in `src/dist/` only reflects PROVIDER_LOCKDOWN if it was
 * built with OPENWHISPR_PROVIDER_LOCKDOWN=true. A stale bundle would silently
 * test the wrong config — that exact staleness produced false-clean results
 * before this test existed. So globalSetup ALWAYS rebuilds.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const LOCKDOWN_ENV: Record<string, string> = {
  OPENWHISPR_PROVIDER_LOCKDOWN: "true",
  OPENWHISPR_BACKEND_URL: "http://localhost:4000",
  OPENWHISPR_AUTH_URL: "http://localhost:4000",
};

function run(cmd: string, args: string[], extraEnv: Record<string, string>) {
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
}

/** Regenerate build-config.generated.{ts,cjs} for the given env. */
export function generateBuildConfig(extraEnv: Record<string, string>): void {
  run("node", ["scripts/generate-build-config.js"], extraEnv);
}

/** Build the renderer bundle into src/dist for the given env. */
export function buildRenderer(extraEnv: Record<string, string>): void {
  // `npm run build:renderer` -> `cd src && vite build`
  run("npm", ["run", "build:renderer"], extraEnv);
}

/** Produce a PROVIDER_LOCKDOWN renderer build + matching build-config. */
export function buildLockdown(): void {
  generateBuildConfig(LOCKDOWN_ENV);
  buildRenderer(LOCKDOWN_ENV);
}

/**
 * Restore the DEFAULT (corporate-minimal, no-env) build. Generated files are
 * gitignored so `git checkout` can't restore them — regenerate + rebuild with
 * an empty env instead.
 */
export function restoreDefault(): void {
  generateBuildConfig({});
  buildRenderer({});
}

export { LOCKDOWN_ENV };
