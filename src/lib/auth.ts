import { createAuthClient } from "better-auth/react";
import {
  OAUTH_GOOGLE_ENABLED,
  OAUTH_APPLE_ENABLED,
  OAUTH_MICROSOFT_ENABLED,
  PROVIDER_LOCKDOWN_ENABLED,
  OPENWHISPR_AUTH_URL,
  OPENWHISPR_BACKEND_URL,
  OPENWHISPR_OAUTH_DESKTOP_CALLBACK_URL,
  OPENWHISPR_OAUTH_RESET_PASSWORD_URL,
} from "../config/defaults";
import { openExternalLink } from "../utils/externalLinks";

// Phase 1 HOST-03 (v1.8.0): re-apply Phase 03-02's defaults.ts wiring that
// was reverted by the Phase 6 upstream merge (commit 56f4efb8). AUTH_URL
// reads OPENWHISPR_AUTH_URL build-time SoT instead of the hardcoded literal.
export const AUTH_URL = OPENWHISPR_AUTH_URL;
export const authClient = createAuthClient({
  baseURL: AUTH_URL,
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

export type SocialProvider = "google" | "microsoft" | "apple";

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
  // Phase 10 PLD-06: corporate-minimal lockdown removes every OAuth surface.
  // This `if (PROVIDER_LOCKDOWN_ENABLED)` against the build-time literal lets
  // Rolldown const-fold the whole social-sign-in body away — including the
  // `/api/desktop-signin/` deep-link URL — so no OAuth literal survives in the
  // lockdown bundle (verified by scripts/verify-provider-lockdown.js).
  if (PROVIDER_LOCKDOWN_ENABLED) {
    return { error: new Error("Provider not enabled in this build") };
  }
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
