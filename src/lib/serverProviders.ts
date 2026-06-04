import { useEffect, useState } from "react";
import { OPENWHISPR_BACKEND_URL } from "../config/defaults";
import { useSettingsStore } from "../stores/settingsStore";

// Phase 06 — Server-driven auth providers (fork-only).
// Single source of truth for which social sign-in buttons the client shows
// is the server's GET /api/auth/providers endpoint (already in prod; pre-auth,
// auth:false). Real wire shape per oidc-providers.ts:27-30 is
// { providers: [{ id, name, enabled }], emailVerification: {...} }, id ∈
// "google"|"github"|"oidc". This module owns the fetch + hand-validation (no
// zod dep per Project Constraints) and a pure view-resolver. iconHint is
// derived CLIENT-SIDE from id — the server sends no icon hint. The upstream
// signInWithSocial / desktop-signin deep-link is reused unchanged.
// See docs/superpowers/specs/2026-05-28-server-driven-auth-providers-design.md

export type ProviderIconHint = "google" | "github" | "apple" | "microsoft" | "generic";

export interface ServerProvider {
  id: string;
  name: string;            // server's display name (operator-configurable)
  iconHint: ProviderIconHint; // derived client-side from id
}

// Canonical provider-id format. Shared with auth.ts's signInWithSocial as a
// defense-in-depth guard so a stale-localStorage / remote-command provider id
// can never flow into the /api/desktop-signin/<id> URL path unvalidated.
export const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MAX_NAME = 40;

// Client-side icon mapping by canonical provider id. Anything not listed
// (notably "oidc" / Keycloak / Okta) → generic. The server never dictates
// icons (icon assets are a pure client concern; a remote-icon path would be
// an SSRF surface).
const ICON_BY_ID: Record<string, ProviderIconHint> = {
  google: "google",
  github: "github",
  apple: "apple",
  microsoft: "microsoft",
};

function iconHintForId(id: string): ProviderIconHint {
  return ICON_BY_ID[id] ?? "generic";
}

/**
 * Pure total function. Never throws. Returns whether local (email/password)
 * login is enabled based on the server response body.
 *
 * Absent or non-false => enabled; only explicit enabled===false disables;
 * fetch failure degrades to enabled so a flaky server can't lock users out.
 *
 * Rule: return false IFF json is an object AND json.localLogin is an object
 * AND json.localLogin.enabled === false (strict). Everything else -> true.
 * Back-compat: old servers (<=1.1.0) omit localLogin entirely => true.
 */
export function parseLocalLoginEnabled(json: unknown): boolean {
  if (typeof json !== "object" || json === null) return true;
  const raw = (json as { localLogin?: unknown }).localLogin;
  if (typeof raw !== "object" || raw === null) return true;
  return (raw as { enabled?: unknown }).enabled !== false;
}

/**
 * Pure validator. Never throws. Returns a clean, deduped ServerProvider[].
 * Consumes the real server shape { providers:[{id,name,enabled}], ... };
 * extra top-level keys (emailVerification) are ignored. Invalid or
 * not-enabled entries are dropped individually; a structurally invalid body
 * yields []. A [] result means "password-only server".
 */
export function parseProvidersResponse(json: unknown): ServerProvider[] {
  if (typeof json !== "object" || json === null) return [];
  const raw = (json as { providers?: unknown }).providers;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: ServerProvider[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { id?: unknown; name?: unknown; enabled?: unknown };
    if (e.enabled !== true) continue;
    if (typeof e.id !== "string" || !ID_RE.test(e.id)) continue;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (name.length === 0) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, name: name.slice(0, MAX_NAME), iconHint: iconHintForId(e.id) });
  }
  return out;
}

export interface ServerProviderView {
  id: string;
  iconHint: ProviderIconHint;
  /** Already-localized button label. */
  displayLabel: string;
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

// Upstream brand i18n keys, kept for exact visual parity on ids that match.
// The real server currently emits google|github|oidc — only `google` matches
// an upstream brand key, so github/oidc fall through to the generic
// "Continue with {name}" template using the server-supplied name (brand /
// operator names are not translated, per i18n rules). microsoft/apple keys
// remain mapped in case the server adds those ids later.
const BRAND_LABEL_KEY: Record<string, string> = {
  google: "auth.social.continueWithGoogle",
  microsoft: "auth.social.continueWithMicrosoft",
  apple: "auth.social.continueWithApple",
};

export function resolveProviderView(p: ServerProvider, t: TFunc): ServerProviderView {
  const brandKey = BRAND_LABEL_KEY[p.id];
  const displayLabel = brandKey
    ? t(brandKey)
    : t("auth.social.continueWith", { provider: p.name });
  return { id: p.id, iconHint: p.iconHint, displayLabel };
}

/**
 * Node-testable gate decision for AuthenticationStep — keeps the JSX thin and
 * the policy unit-covered (vitest harness is node-only, no jsdom).
 *
 * When localLoginEnabled is true we ALWAYS allow local — provider count is
 * irrelevant; SSO buttons render-null themselves when empty (existing behavior).
 */
export type AuthView = "local-and-sso" | "sso-only" | "no-methods";

export function selectAuthView(args: {
  localLoginEnabled: boolean;
  providerCount: number;
}): AuthView {
  if (args.localLoginEnabled) return "local-and-sso";
  return args.providerCount > 0 ? "sso-only" : "no-methods";
}

/**
 * Whether the onboarding/Settings Server URL field should be rendered.
 *
 * BUG 1 regression contract (quick-260604-eij): visibility is INTENTIONALLY
 * independent of `authView`. The Server URL field is what lets a self-hoster
 * point the client at their OWN server — so it must NOT be gated behind the
 * DEFAULT server's `authView` answer (e.g. yambr.com returning
 * localLogin:false / zero providers => "sso-only" or "no-methods"). If it
 * were, a self-hoster could never reach their own host.
 *
 * This function takes NO `authView` argument by design: the type signature
 * itself prevents anyone re-coupling field visibility to the default host's
 * gate in the future. The only input is the build-time `ALLOW_CUSTOM_HOST`
 * literal, which the default (corporate-minimal / upstream-parity) build
 * folds out via Rolldown DCE.
 *
 * NOTE (WR-01): this predicate is the UNIT-TESTED CONTRACT, not the render
 * gate. The JSX in AuthenticationStep / SettingsPage uses a BARE
 * `ALLOW_CUSTOM_HOST_ENABLED && (...)` literal, and vite.config.mjs
 * stub-aliases ServerUrlField to a null component in the default build, so the
 * field is absent from the corporate-minimal bundle (verify-allow-custom-host.js
 * scenario 2). Calling this predicate from JSX would only add an indirection
 * with no DCE benefit — the stub-alias is what drops the module. Keep it as the
 * test contract only; do NOT wire it into render.
 */
export function shouldShowServerUrlField(allowCustomHost: boolean): boolean {
  return allowCustomHost;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetchProvidersResult {
  providers: ServerProvider[];
  localLoginEnabled: boolean;
}

// Lockout-safe failure result: absent or unreachable server must never lock
// users out of the password form. Degrading to localLoginEnabled:true means
// a temporarily-unreachable server keeps the email/password UI visible.
const FETCH_FAILURE_RESULT: FetchProvidersResult = { providers: [], localLoginEnabled: true };

/**
 * Fetch the server's enabled providers and localLogin gate. Pre-auth (no
 * token), mirroring POST /api/check-user. Any failure ->
 * { providers: [], localLoginEnabled: true } (lockout-safe degrade).
 * fetchImpl is injectable for tests; defaults to global fetch.
 */
export async function fetchServerProviders(
  baseUrl: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init)
): Promise<FetchProvidersResult> {
  if (!baseUrl) return FETCH_FAILURE_RESULT;
  const url = `${baseUrl.replace(/\/$/, "")}/api/auth/providers`;
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return FETCH_FAILURE_RESULT;
    const body = await res.json();
    return {
      providers: parseProvidersResponse(body),
      localLoginEnabled: parseLocalLoginEnabled(body),
    };
  } catch {
    return FETCH_FAILURE_RESULT;
  }
}

// `fetchServerProviders` swallows every failure (network throw, non-2xx, parse
// error) and resolves to { providers: [], localLoginEnabled: true } — degrade-
// to-password-only is the only failure mode, and it is indistinguishable from
// "server has no providers". There is therefore no honest "error" state to
// surface: the fetch never rejects, so an "error" member would only ever be a
// dead, unreachable branch. Keep the union to the two states that actually occur.
export type ProvidersStatus = "loading" | "ready";

export interface ProvidersState {
  status: ProvidersStatus;
  providers: ServerProvider[];
  /** Whether the server allows local (email/password) login. Defaults to true
   *  while loading and on any fetch failure — lockout-safe: a flaky server must
   *  not brick a user out of the password form (Finding #9, 260603-qhw). */
  localLoginEnabled: boolean;
}

/**
 * Resolve the base URL the providers fetch should target. Precedence mirrors
 * auth.ts's resolveBaseURL (serverUrl override → build-time default), but the
 * BUILD-TIME fallback differs by design: providers come from the API host
 * (OPENWHISPR_BACKEND_URL — the /api/auth/providers route lives there), whereas
 * auth.ts's desktop-signin deep-link falls back to the AUTH host
 * (OPENWHISPR_AUTH_URL). In a split-host deployment these are intentionally
 * different hosts (BACKEND_SPEC.md: desktop-signin is served by the auth host,
 * not the backend) — do NOT "unify" them. They converge to the SAME value only
 * in custom-host mode, where serverUrl overrides both. In an ALLOW_CUSTOM_HOST
 * build the real backend is the user-typed custom host persisted in
 * useSettingsStore.serverUrl; only when that's unset/empty do we fall back to
 * the build-time default (OPENWHISPR_BACKEND_URL, which may itself be "").
 *
 * Pure + synchronous so it's unit-testable in node env by mocking the store
 * module (same pattern auth.ts's resolveBaseURL relies on: getState() is always
 * available because the store module is mocked in tests). The trailing-slash
 * strip is intentionally NOT done here — fetchServerProviders owns URL assembly
 * and strips the slash, so both layers agree.
 */
export function resolveProvidersBaseUrl(): string {
  const persisted = useSettingsStore.getState().serverUrl;
  return persisted || OPENWHISPR_BACKEND_URL;
}

/**
 * Fetches the server provider list on mount and whenever the active backend
 * changes. Source of truth is the RESOLVED base URL — the user's custom
 * serverUrl when set (self-hosting / ALLOW_CUSTOM_HOST), else the build-time
 * OPENWHISPR_BACKEND_URL. fetchServerProviders never rejects (it degrades any
 * failure to []), so the terminal state is always "ready" + whatever list the
 * server yielded ([] renders as password-only). No stale cache (design D2).
 *
 * The hook subscribes to the settings store's serverUrl slice so a custom-host
 * change re-runs the fetch against the new backend (HOST-02). Relying on the
 * renderer reload alone would be fragile; subscribing is the robust fix — a
 * self-hoster who points the binary at their own server (e.g. a Keycloak
 * `oidc` provider) sees their buttons without a manual reload.
 */
export function useServerProviders(): ProvidersState {
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  const baseUrl = serverUrl || OPENWHISPR_BACKEND_URL;
  const [state, setState] = useState<ProvidersState>({
    status: "loading",
    providers: [],
    localLoginEnabled: true,
  });
  useEffect(() => {
    let alive = true;
    if (!baseUrl) {
      setState({ status: "ready", providers: [], localLoginEnabled: true });
      return;
    }
    setState({ status: "loading", providers: [], localLoginEnabled: true });
    fetchServerProviders(baseUrl).then((result) => {
      if (alive) setState({ status: "ready", ...result });
    });
    return () => {
      alive = false;
    };
  }, [baseUrl]);
  return state;
}
