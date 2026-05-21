import { buildLockdown } from "./build-lockdown-renderer";

/**
 * Rebuild the renderer with OPENWHISPR_PROVIDER_LOCKDOWN=true before any
 * spec runs. Slow (one vite build) but mandatory: the lockdown DCE only
 * lands in src/dist if the bundle was built with the flag set.
 */
export default function globalSetup(): void {
  console.log("[lockdown-ui] globalSetup: building PROVIDER_LOCKDOWN renderer…");
  buildLockdown();
  console.log("[lockdown-ui] globalSetup: lockdown renderer ready.");
}
