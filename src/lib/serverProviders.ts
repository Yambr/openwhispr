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

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
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
    if (typeof e.name !== "string" || e.name.trim().length === 0) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, name: e.name.slice(0, MAX_NAME), iconHint: iconHintForId(e.id) });
  }
  return out;
}
