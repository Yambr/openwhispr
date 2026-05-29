import { createAuthClient } from "better-auth/react";
import {
  OAUTH_GOOGLE_ENABLED,
  OAUTH_APPLE_ENABLED,
  OAUTH_MICROSOFT_ENABLED,
  OPENWHISPR_AUTH_URL,
  OPENWHISPR_BACKEND_URL,
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL,
  OPENWHISPR_OAUTH_RESET_PASSWORD_URL,
} from "../config/defaults";
import { useSettingsStore } from "../stores/settingsStore";
import { openExternalLink } from "../utils/externalLinks";

// Phase 1 HOST-03 (v1.8.0): re-apply Phase 03-02's defaults.ts wiring that
// was reverted by the Phase 6 upstream merge (commit 56f4efb8). AUTH_URL
// reads OPENWHISPR_AUTH_URL build-time SoT instead of the hardcoded literal.
export const AUTH_URL = OPENWHISPR_AUTH_URL;

// Phase 1 HOST-02 (v1.8.0): mutable Proxy preserves the `authClient` export
// symbol byte-identical to upstream while letting baseURL change at runtime
// from useSettingsStore.serverUrl. The inner createAuthClient is re-created
// when serverUrl changes; the Proxy delegates property access to whichever
// instance is current. Consumer call sites
// (authClient.signIn.email(...), authClient.useSession(), etc.) work
// unchanged. See .planning/phases/01-*/01-CONTEXT.md D-01.

type AuthClientInstance = ReturnType<typeof createAuthClient>;

let cachedInner: AuthClientInstance | null = null;
let cachedBaseURL: string | null = null;

function resolveBaseURL(): string {
  // Optional chaining — useSettingsStore is set up at app init; in unit
  // tests we mock the module so getState() is always available.
  const persisted = useSettingsStore.getState().serverUrl;
  return persisted || AUTH_URL;
}

function buildInner(): AuthClientInstance {
  const baseURL = resolveBaseURL();
  if (cachedInner !== null && cachedBaseURL === baseURL) return cachedInner;
  cachedInner = createAuthClient({
    baseURL,
    fetchOptions: {
      auth: {
        type: "Bearer",
        token: async () => (await window.electronAPI?.authGetToken?.()) ?? "",
      },
      headers: { "x-openwhispr-source": "desktop" },
      onSuccess: async (ctx: { response: Response }) => {
        const newToken = ctx.response.headers.get("set-auth-token");
        if (newToken) await window.electronAPI?.authSetToken?.(newToken);
      },
    },
  });
  cachedBaseURL = baseURL;
  return cachedInner;
}

// Subscribe once at module load: invalidate cache so next access rebuilds,
// and push the change to the main process so getApiUrl/getAuthUrl pick it up.
// Then force a full renderer reload — better-auth/react's useSession() hook
// and any consumer that captured a method reference (`const fn = authClient.x`)
// stay bound to the old inner instance. A reload remounts the entire React
// tree against the fresh URL, dropping all stale bindings. See v1.8.0
// REVIEW.md HIGH-02 (silently hitting old backend with valid token = data leak).
if (typeof useSettingsStore.subscribe === "function") {
  useSettingsStore.subscribe((state, prev) => {
    if (state.serverUrl !== prev.serverUrl) {
      cachedInner = null;
      cachedBaseURL = null;
      window.electronAPI?.notifyServerUrlChanged?.(state.serverUrl || null);
      // Skip reload in unit/test contexts (no real Location object) and during
      // initial hydration (prev.serverUrl === undefined means store just woke).
      const isTestEnv =
        typeof process !== "undefined" &&
        (process as { env?: Record<string, string> }).env?.NODE_ENV === "test";
      const isInitialHydration = prev.serverUrl === undefined;
      if (
        !isTestEnv &&
        !isInitialHydration &&
        typeof window !== "undefined" &&
        typeof window.location?.reload === "function"
      ) {
        // Defer slightly so the IPC notify completes and React can flush any
        // pending state writes before the reload tears everything down.
        setTimeout(() => window.location.reload(), 150);
      }
    }
  });
}

// HIGH-02 mitigation: walks down a property path (e.g. ["signIn", "email"])
// against the CURRENT inner on every access — so a captured ref like
// `const fn = authClient.signIn.email` re-resolves through the live inner
// after a URL swap instead of dispatching to the stale instance (which would
// leak the bearer token to the old backend host).
function makePathProxy(path: PropertyKey[]): unknown {
  return new Proxy(function () {} as unknown as object, {
    get(_t, prop) {
      // Skip internal symbols / Promise-like checks that React + vitest probe.
      if (prop === "then" || prop === Symbol.toPrimitive) return undefined;
      return makePathProxy([...path, prop]);
    },
    has(_t, prop) {
      const inner = buildInner();
      let cur: unknown = inner;
      for (const step of path) cur = (cur as Record<PropertyKey, unknown>)?.[step];
      return cur != null && Reflect.has(cur as object, prop);
    },
    apply(_t, _thisArg, args) {
      const currentInner = buildInner();
      let cur: unknown = currentInner;
      let parent: unknown = currentInner;
      for (const step of path) {
        parent = cur;
        cur = (cur as Record<PropertyKey, unknown>)?.[step];
      }
      if (typeof cur !== "function") {
        throw new TypeError(`authClient.${path.map(String).join(".")} is not a function`);
      }
      // CRITICAL: must use Reflect.apply, not `.apply()`. better-auth's internal
      // dynamic-path proxy intercepts `get(target, "apply")` and returns a NEW
      // path-proxy (treating "apply" as a URL segment), so `cur.apply(parent, args)`
      // ends up POSTing to `/sign-out/apply` instead of `/sign-out`. Reflect.apply
      // invokes the [[Call]] internal slot directly via the proxy's apply trap,
      // bypassing the get-trap entirely. See v1.7.10 → 1.7.11 signOut regression.
      return Reflect.apply(cur as (...a: unknown[]) => unknown, parent, args);
    },
  });
}

export const authClient = new Proxy({} as AuthClientInstance, {
  get(_target, prop, _receiver) {
    if (prop === "then" || prop === Symbol.toPrimitive) return undefined;
    // Trigger a build to refresh `cachedInner` if serverUrl has changed —
    // existing call sites (and tests) rely on first-access materialising
    // the inner instance. The path proxy below also calls buildInner on
    // every dispatch; this just ensures eager invalidation on touch.
    buildInner();
    return makePathProxy([prop]);
  },
  has(_target, prop) {
    return Reflect.has(buildInner() as object, prop);
  },
});

// Phase 1 HOST-02 test hook: exposes the resolved baseURL to e2e step
// definitions (tests/e2e/steps/host-runtime-override.steps.ts). Production
// renderer code MUST NOT consume this — use authClient methods directly.
if (typeof window !== "undefined") {
  (window as unknown as { authClientBaseUrlForTest?: () => string }).authClientBaseUrlForTest =
    () => {
      // Force the inner to build so cachedBaseURL is populated, then read it.
      buildInner();
      return cachedBaseURL ?? AUTH_URL;
    };
  (window as unknown as { __authClientForTest?: AuthClientInstance }).__authClientForTest =
    authClient;
  (
    window as unknown as { __zustand_setServerUrl?: (url: string | null) => void }
  ).__zustand_setServerUrl = (url) => {
    useSettingsStore.getState().setServerUrl?.(url);
  };
}

// Phase 06: widened to an open set so server-driven providers (GitHub, generic
// OIDC / Keycloak) can flow through signInWithSocial unchanged. Additive — the
// three legacy literals are preserved for upstream call-site/type parity.
export type SocialProvider = "google" | "microsoft" | "apple" | (string & {});

const LAST_SIGN_IN_STORAGE_KEY = "openwhispr:lastSignInTime";
const GRACE_PERIOD_MS = 60_000;
const GRACE_RETRY_COUNT = 6;
const INITIAL_GRACE_RETRY_DELAY_MS = 500;

let lastSignInTime: number | null = null;

function getLocalStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadLastSignInTimeFromStorage(): number | null {
  const storage = getLocalStorageSafe();
  if (!storage) return null;

  const raw = storage.getItem(LAST_SIGN_IN_STORAGE_KEY);
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    storage.removeItem(LAST_SIGN_IN_STORAGE_KEY);
    return null;
  }

  return parsed;
}

function persistLastSignInTime(value: number | null): void {
  const storage = getLocalStorageSafe();
  if (!storage) return;

  if (value === null) {
    storage.removeItem(LAST_SIGN_IN_STORAGE_KEY);
  } else {
    storage.setItem(LAST_SIGN_IN_STORAGE_KEY, String(value));
  }
}

function getLastSignInTime(): number | null {
  const stored = loadLastSignInTimeFromStorage();
  if (stored !== null) {
    lastSignInTime = stored;
  }
  return lastSignInTime;
}

function createAuthExpiredError(originalError: unknown): Error {
  const error = originalError instanceof Error ? originalError : new Error("Session expired");
  Object.assign(error, {
    code: "AUTH_EXPIRED",
    messageKey: "hooks.audioRecording.errorDescriptions.sessionExpired",
  });
  return error;
}

function clearLastSignInTime(): void {
  lastSignInTime = null;
  persistLastSignInTime(null);
}

function markSignedOutState(): void {
  const storage = getLocalStorageSafe();
  storage?.setItem("isSignedIn", "false");
  clearLastSignInTime();
}

export function updateLastSignInTime(): void {
  const now = Date.now();
  lastSignInTime = now;
  persistLastSignInTime(now);
}

export function isWithinGracePeriod(): boolean {
  const startedAt = getLastSignInTime();
  if (!startedAt) return false;

  const elapsed = Math.max(0, Date.now() - startedAt);
  return elapsed < GRACE_PERIOD_MS;
}

export async function deleteAccount(): Promise<{ error?: Error }> {
  if (!OPENWHISPR_BACKEND_URL) {
    return { error: new Error("API not configured") };
  }

  try {
    const res = await fetch(`${OPENWHISPR_BACKEND_URL}/api/auth/delete-account`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to delete account");
    }

    return {};
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Failed to delete account") };
  }
}

export async function signOut(): Promise<void> {
  try {
    await authClient.signOut();
    if (window.electronAPI?.authClearSession) {
      await window.electronAPI.authClearSession();
    }
    markSignedOutState();
  } catch {
    markSignedOutState();
  }
}

export async function withSessionRefresh<T>(operation: () => Promise<T>): Promise<T> {
  const startedInGracePeriod = isWithinGracePeriod();
  let graceRetriesUsed = 0;

  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      const isAuthExpired =
        error?.code === "AUTH_EXPIRED" ||
        error?.message?.toLowerCase().includes("session expired") ||
        error?.message?.toLowerCase().includes("auth expired");

      if (!isAuthExpired) {
        throw error;
      }

      if (startedInGracePeriod && graceRetriesUsed < GRACE_RETRY_COUNT) {
        const delayMs = INITIAL_GRACE_RETRY_DELAY_MS * Math.pow(2, graceRetriesUsed);
        graceRetriesUsed += 1;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw createAuthExpiredError(error);
    }
  }
}

// Phase 1 HOST-03: was hardcoded; now reads build-time SoT (re-applies ba1c1917).
const DESKTOP_OAUTH_CALLBACK_URL = OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL;

export async function signInWithSocial(provider: SocialProvider): Promise<{ error?: Error }> {
  // Phase 06 (D3): social sign-in is server-driven — the lockdown build no
  // longer strips it (the PLD-06 early-return here was fork drift, removed to
  // restore upstream parity). Visibility is decided by GET /api/auth/providers;
  // a provider only reaches this function if the server returned it. The
  // per-provider OAUTH_*_ENABLED guards below remain as harmless defense-in-depth
  // for the three legacy ids.
  // D-08 defensive guard: build flags short-circuit any disabled-provider invocation.
  // UI never reaches this branch because the corresponding button is absent (AuthenticationStep.tsx),
  // but stale localStorage / remote commands could still attempt the call.
  if (provider === "google" && !OAUTH_GOOGLE_ENABLED) {
    return { error: new Error("Provider not enabled in this build") };
  }
  if (provider === "apple" && !OAUTH_APPLE_ENABLED) {
    return { error: new Error("Provider not enabled in this build") };
  }
  if (provider === "microsoft" && !OAUTH_MICROSOFT_ENABLED) {
    return { error: new Error("Provider not enabled in this build") };
  }
  try {
    const isElectron = Boolean((window as any).electronAPI);

    if (isElectron) {
      // OAuth must be initiated from the user's browser, not the renderer:
      // the state cookie Better Auth sets has to land in the same cookie jar
      // that handles the /api/auth/callback/* round-trip. The shim endpoint
      // does the POST server-side and 302s with the cookies attached.
      const protocol = (await window.electronAPI?.getOAuthProtocol?.()) || "openwhispr";
      const url = new URL(`${AUTH_URL}/api/desktop-signin/${provider}`);
      url.searchParams.set("callbackURL", `${DESKTOP_OAUTH_CALLBACK_URL}?protocol=${protocol}`);
      openExternalLink(url.toString());
      return {};
    }

    const callbackURL = `${window.location.href.split("?")[0].split("#")[0]}?panel=true`;
    await authClient.signIn.social({ provider, callbackURL, newUserCallbackURL: callbackURL });
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Social sign-in failed") };
  }
}

export async function requestPasswordReset(email: string): Promise<{ error?: Error }> {
  try {
    await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: OPENWHISPR_OAUTH_RESET_PASSWORD_URL,
    });
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Failed to send reset email") };
  }
}
