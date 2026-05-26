# Plan 01-05: HOST-02 Proxy — authClient as Mutable Proxy + Zustand Subscription (Wave 4)

**Goal:** `src/lib/auth.ts` `authClient` export refactored from frozen module-singleton to JavaScript `Proxy()` that re-instantiates its inner `createAuthClient()` when persisted `serverUrl` changes. Renderer Zustand store gains a `serverUrl` field (default null). API surface byte-identical to upstream.

**Wave:** 4
**Requirements:** HOST-02
**Depends on:** 01-04 (IPC bridge available — proxy uses it to notify main of URL changes)
**Files modified:**
- `src/lib/auth.ts` — refactor `authClient` export to Proxy
- `src/stores/settingsStore.ts` — add `serverUrl: string | null` field + setter
- `src/hooks/useSettings.ts` — re-export the serverUrl getter/setter for consumers (Phase 4 will use)
- (potentially) `src/types/build-env.d.ts` — verify `VITE_AUTH_URL` is still declared

## Tasks

1. **Refactor `src/lib/auth.ts` `authClient` export** per CONTEXT D-01:

   - Keep imports at top unchanged.
   - Replace lines 11-30 (the `AUTH_URL` const and `createAuthClient({ ... })` block) with the Proxy pattern:

   ```ts
   import { useSettingsStore } from "../stores/settingsStore";

   export const AUTH_URL = import.meta.env.VITE_AUTH_URL || "https://auth.openwhispr.com";

   // CONTEXT D-01 + D-02: mutable proxy preserves the `authClient` symbol's
   // API surface byte-identical to upstream commit 56f4efb8 while allowing
   // runtime base URL change. The inner instance is re-created when
   // persisted serverUrl changes.

   let cachedInner: ReturnType<typeof createAuthClient> | null = null;
   let cachedUrl: string | null = null;

   const resolveBaseURL = (): string => {
     const persisted = useSettingsStore.getState().serverUrl;
     return persisted ?? AUTH_URL;
   };

   const buildInner = () => {
     const url = resolveBaseURL();
     if (cachedInner !== null && cachedUrl === url) return cachedInner;
     cachedInner = createAuthClient({
       baseURL: url,
       fetchOptions: {
         auth: {
           type: "Bearer",
           token: async () => (await window.electronAPI?.authGetToken?.()) ?? "",
         },
         headers: { "x-openwhispr-source": "desktop" },
         onSuccess: async (ctx: { response: Response }) => {
           // … preserve existing onSuccess body byte-identical to upstream …
         },
         // … preserve any other options the upstream block has …
       },
     });
     cachedUrl = url;
     return cachedInner;
   };

   // Subscribe to settings changes — invalidate cache so the next access rebuilds.
   useSettingsStore.subscribe((state, prev) => {
     if (state.serverUrl !== prev.serverUrl) {
       cachedInner = null;
       cachedUrl = null;
       // Notify main-process so getApiUrl/getAuthUrl also pick up the change
       window.electronAPI?.notifyServerUrlChanged?.(state.serverUrl);
     }
   });

   export const authClient = new Proxy({} as ReturnType<typeof createAuthClient>, {
     get(_target, prop, receiver) {
       const inner = buildInner();
       const value = Reflect.get(inner as object, prop, receiver);
       return typeof value === "function" ? value.bind(inner) : value;
     },
     has(_target, prop) {
       return Reflect.has(buildInner() as object, prop);
     },
   });
   ```

   - **Preserve every option** that the original `createAuthClient({ ... })` block passed. Copy the exact onSuccess body, headers map, fetchOptions, etc. The diff against upstream must show **only** the wrapping-with-Proxy structural change, not any internal option drift.

2. **Add `serverUrl` field to Zustand store** (`src/stores/settingsStore.ts`):
   - In the `SettingsState` interface (or wherever fields are typed): `serverUrl: string | null;`
   - In the `create<SettingsState>()(...)` initial state: `serverUrl: null,`
   - Add a setter: `setServerUrl: (url: string | null) => set({ serverUrl: url }),`
   - Add to the localStorage persistence block (if there's an explicit allowlist). If `useSettingsStore` uses a passthrough persistence pattern, `serverUrl` will be auto-persisted.

3. **Add convenience hook export** in `src/hooks/useSettings.ts` (or wherever consumers grab settings):
   - Expose `serverUrl` and `setServerUrl` in the `useSettings()` return object. Phase 4 onboarding UI will consume it.

4. **Smoke-test the proxy unit tests** authored in 01-01:
   ```bash
   npx vitest run test/helpers/authClientProxy.test.js
   ```
   Expected: 8/8 pass (RED → GREEN transition).

5. **Verify upstream parity:**
   ```bash
   git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export"
   ```
   Must be empty — every existing export (`authClient`, `AUTH_URL`, `signInWithSocial`, `signOut`, `deleteAccount`, `withSessionRefresh`, `isWithinGracePeriod`, `requestPasswordReset`, `resetPassword`, etc.) is still exported with identical type signature.

6. **TypeScript compile check:**
   ```bash
   cd src && npx tsc --noEmit
   ```
   Expected: exit 0.

## Acceptance

```bash
# Vitest unit tests from 01-01 GREEN:
npx vitest run test/helpers/authClientProxy.test.js; echo "EXIT=$?"   # expect 0 (8/8 pass)
# TypeScript clean:
cd src && npx tsc --noEmit; echo "EXIT=$?"                            # expect 0
# Upstream parity — no API surface drift:
git diff upstream/main -- src/lib/auth.ts | grep -E "^[-+]export" ; echo "EXIT=$?"   # expect empty
# Zustand store has serverUrl:
grep -n "serverUrl" src/stores/settingsStore.ts | wc -l               # expect >= 3 (interface, initial, setter)
# E2E test from 01-01 ready to run (still needs server up — that's Plan 01-07):
npm run test:e2e:list 2>&1 | grep "host-runtime-override"             # expect 3 scenarios
```

Commit message: `feat(01-05): HOST-02 — refactor authClient to mutable Proxy + Zustand serverUrl subscription`

## Notes

- The Proxy `get` trap binds methods to the inner instance to preserve `this` semantics for better-auth's internal state. `useSession()` (a React hook) is the one edge case — when the inner instance swaps, prior hook state is orphaned. Per CONTEXT D-01, Phase 4's onboarding flow handles this by triggering a renderer reload after URL change. Phase 1 does NOT need a reload because the e2e test directly observes the next outbound request, not session-state continuity.
- **Critical**: copy the full original `createAuthClient({ ... })` options block verbatim. Resist any "while I'm here" cleanup. Per `[upstream_parity]` and the project memory `[[upstream_parity]]`, the inner block must merge cleanly with future upstream `createAuthClient` option changes.
- Plan 01-07 will run live verification per `[live_verification_over_green_tests]` — green unit tests here are necessary but not sufficient.
