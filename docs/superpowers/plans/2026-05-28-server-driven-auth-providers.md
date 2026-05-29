# Server-Driven Auth Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the client's social sign-in buttons render dynamically from a server pre-auth endpoint (`GET /api/auth/providers`) instead of three build-time-hardcoded providers, so any server-enabled provider (Google, Microsoft, Apple, Keycloak, generic OIDC) appears as its own button with no client rebuild.

**Architecture:** All new logic lives in two fork-only modules — a pure data layer (`src/lib/serverProviders.ts`: fetch + validate + a pure `resolveProviderView` helper for icon/label decisions) and a presentation component (`src/components/ServerProviderButtons.tsx`: maps the validated list to buttons). Upstream files get the smallest possible hooks: one type-token widening in `auth.ts`, and one button-region swap in `AuthenticationStep.tsx`. Lockdown is decoupled from social in the build-config generator (fork-only). The existing `/api/desktop-signin/<id>` deep-link and bearer/token-store handshake are unchanged.

**Tech Stack:** TypeScript, React, react-i18next, Vitest (node env — no jsdom in this repo), zod-free hand-validation (repo has no zod dep; validate by hand to avoid a new core dep per Project Constraints), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-05-28-server-driven-auth-providers-design.md`
**Server dependency:** **ALREADY SATISFIED** — `GET /api/auth/providers` is in prod (verified 2026-05-28 against `/Users/nick/openwhispr-server`, see SERVER-REQUIREMENTS.md). No server change needed. The client adapts to the **real** server contract:

```jsonc
// GET /api/auth/providers  (pre-auth, auth:false, ETag, Cache-Control max-age=60)
{
  "providers": [
    { "id": "google", "name": "Google", "enabled": true },
    { "id": "github", "name": "GitHub", "enabled": true },
    { "id": "oidc",   "name": "OIDC",   "enabled": true }   // generic OIDC incl. Keycloak/Okta
  ],
  "emailVerification": { "required": true, "configured": true }  // client ignores this key
}
```

- Real per-provider keys are **`{id, name, enabled}`** (NOT `{id,label,iconHint}` — the original design assumption was wrong; corrected here).
- `id` ∈ `"google" | "github" | "oidc"`. Generic OIDC (Keycloak/Okta/any) = the single `oidc` button.
- Label = server `name`. **iconHint is derived CLIENT-SIDE from `id`** (server sends none).
- Client filters `enabled !== true` and ignores the extra `emailVerification` top-level key.
- Tasks 1–6 do NOT require the live server (fetch is mocked, with **real-shape** fixtures). Task 9 (e2e) stubs the real shape; Task 10 verifies live.

**Testing reality (read before starting):** This repo's vitest runs in `environment: "node"` with include globs `*.test.{js,ts,mjs,cjs}` — **`.tsx` is not included and there is no jsdom**. There are zero React component render tests. Therefore: all branching logic (validation, dedup, filtering, icon/label resolution) is extracted into **pure functions in `serverProviders.ts`** and unit-tested in node. `ServerProviderButtons.tsx` stays a thin, logic-free `.map()` over already-resolved view-models, so it needs no render test. Do NOT add jsdom or a `.tsx` test glob — that's infra drift outside this plan's scope.

---

## File Structure

| File | Responsibility | Status |
|------|----------------|--------|
| `src/lib/serverProviders.ts` | **NEW fork-only.** Types (`ServerProvider`, `ServerProviderView`, `ProvidersState`). Pure `parseProvidersResponse(json)` → validated `ServerProvider[]` (consumes real `{id,name,enabled}` shape, derives `iconHint` from `id`). Pure `resolveProviderView(p)` → `{id,iconHint,displayLabel}`. `fetchServerProviders(baseUrl, fetchImpl)` → `Promise<ServerProvider[]>`. React hook `useServerProviders()`. | Create |
| `src/lib/serverProviders.test.ts` | **NEW.** Unit tests for the pure functions + `fetchServerProviders` with a mocked fetch. | Create |
| `src/components/ServerProviderButtons.tsx` | **NEW fork-only.** Thin component: takes `providers: ServerProviderView[]`, `onSelect`, `loadingId`, `disabled`; renders one `<Button>` each with the resolved icon + label. No fetch, no validation. | Create |
| `src/components/auth/providerIcons.tsx` | **NEW fork-only.** The three brand icons (Google/Microsoft/Apple) moved out of `AuthenticationStep.tsx` + a `GenericProviderIcon` (lucide `KeyRound`). One `iconFor(hint)` lookup. | Create |
| `src/lib/auth.ts` | **UPSTREAM.** ONE edit: widen `SocialProvider` union with `\| (string & {})` (line ~168). | Modify |
| `src/components/AuthenticationStep.tsx` | **UPSTREAM.** Remove the 3 inline icon defs (lines 35–74) — move to `providerIcons.tsx`. Replace the 3 `<Button>` blocks (lines ~491–564) with `<ServerProviderButtons …/>` + `useServerProviders()`. Drop the `OAUTH_*_ENABLED` import (no longer gates social). | Modify |
| `scripts/generate-build-config.js` | **FORK-ONLY.** Remove the lockdown→OAUTH cascade for social (lines 207–210) so lockdown no longer strips social; leave BYOK/enterprise/streaming cascade intact. | Modify |
| `scripts/verify-provider-lockdown.js` | **FORK-ONLY.** Rewrite the social assertion to the new invariant (D3): social MAY be present in any build; lockdown still strips BYOK/enterprise/billing/referrals. | Modify |
| `src/locales/*/translation.json` (×10) | Add `auth.social.continueWith` = "Continue with {{provider}}" in all 10 locales. | Modify |
| `docs/CONFIG_INVENTORY.md`, project constraints note | Document the lockdown↔social decoupling (D3). | Modify |

---

## Task 1: i18n key `auth.social.continueWith` in all 10 locales

**Files:**
- Modify: `src/locales/{en,es,fr,de,pt,it,ja,ru,zh-CN,zh-TW}/translation.json`

- [ ] **Step 1: Add the key to `en` first**

In `src/locales/en/translation.json`, inside the existing `"auth": { "social": { … } }` object (currently has `completeInBrowser`, `continueWithApple`, `continueWithGoogle`, `continueWithMicrosoft`, `protocolUnavailable`), add:

```json
"continueWith": "Continue with {{provider}}"
```

- [ ] **Step 2: Add the translated key to the other 9 locales**

Add `"continueWith"` inside each `auth.social` block:

- `es`: `"Continuar con {{provider}}"`
- `fr`: `"Continuer avec {{provider}}"`
- `de`: `"Weiter mit {{provider}}"`
- `pt`: `"Continuar com {{provider}}"`
- `it`: `"Continua con {{provider}}"`
- `ja`: `"{{provider}}で続行"`
- `ru`: `"Продолжить с {{provider}}"`
- `zh-CN`: `"使用 {{provider}} 继续"`
- `zh-TW`: `"使用 {{provider}} 繼續"`

- [ ] **Step 3: Verify all 10 files parse and contain the key**

Run:
```bash
for l in en es fr de pt it ja ru zh-CN zh-TW; do node -e "const d=require('./src/locales/$l/translation.json'); if(!d.auth.social.continueWith) throw new Error('missing in $l'); console.log('$l ok')"; done
```
Expected: 10 lines `<locale> ok`, no error.

- [ ] **Step 4: Commit**

```bash
git add src/locales/*/translation.json
git commit -m "i18n(phase-06): add auth.social.continueWith for dynamic providers"
```

---

## Task 2: Data layer — types + pure `parseProvidersResponse`

**Files:**
- Create: `src/lib/serverProviders.ts`
- Test: `src/lib/serverProviders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/serverProviders.test.ts`. Fixtures use the **real** server shape `{id,name,enabled}`:

```ts
import { describe, it, expect } from "vitest";
import { parseProvidersResponse } from "./serverProviders";

describe("parseProvidersResponse", () => {
  it("accepts the real server body (google/github/oidc + extra emailVerification key)", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "google", name: "Google", enabled: true },
        { id: "github", name: "GitHub", enabled: true },
        { id: "oidc", name: "Company SSO", enabled: true },
      ],
      emailVerification: { required: true, configured: true }, // ignored extra key
    });
    expect(out.map((p) => p.id)).toEqual(["google", "github", "oidc"]);
    expect(out.map((p) => p.name)).toEqual(["Google", "GitHub", "Company SSO"]);
  });

  it("derives iconHint from id (google/github known, oidc->generic)", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "google", name: "Google", enabled: true },
        { id: "github", name: "GitHub", enabled: true },
        { id: "oidc", name: "SSO", enabled: true },
      ],
    });
    expect(out.map((p) => p.iconHint)).toEqual(["google", "github", "generic"]);
  });

  it("returns [] for a non-object / missing providers", () => {
    expect(parseProvidersResponse(null)).toEqual([]);
    expect(parseProvidersResponse({})).toEqual([]);
    expect(parseProvidersResponse({ providers: "nope" })).toEqual([]);
  });

  it("filters out entries that are not enabled:true", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "google", name: "Google", enabled: true },
        { id: "github", name: "GitHub", enabled: false },
        { id: "oidc", name: "SSO" }, // missing enabled
      ],
    });
    expect(out.map((p) => p.id)).toEqual(["google"]);
  });

  it("drops entries with an invalid id but keeps the rest", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "Google!", name: "x", enabled: true },     // bad: uppercase + punctuation
        { id: "ok-provider", name: "OK", enabled: true },
        { id: "", name: "empty", enabled: true },         // bad: empty
      ],
    });
    expect(out.map((p) => p.id)).toEqual(["ok-provider"]);
  });

  it("dedupes by id, first wins", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "google", name: "First", enabled: true },
        { id: "google", name: "Second", enabled: true },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("First");
  });

  it("requires a non-empty string name, drops entries without one", () => {
    const out = parseProvidersResponse({
      providers: [
        { id: "a", name: "", enabled: true },
        { id: "b", enabled: true },
        { id: "c", name: "Good", enabled: true },
      ],
    });
    expect(out.map((p) => p.id)).toEqual(["c"]);
  });

  it("truncates names longer than 40 chars", () => {
    const long = "x".repeat(60);
    const out = parseProvidersResponse({ providers: [{ id: "a", name: long, enabled: true }] });
    expect(out[0].name).toHaveLength(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/serverProviders.test.ts`
Expected: FAIL — `Failed to resolve import "./serverProviders"` / `parseProvidersResponse is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/serverProviders.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/serverProviders.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/serverProviders.ts src/lib/serverProviders.test.ts
git commit -m "feat(phase-06): server provider response parser (pure, validated)"
```

---

## Task 3: Data layer — `resolveProviderView` (icon/label decision, pure)

**Files:**
- Modify: `src/lib/serverProviders.ts`
- Test: `src/lib/serverProviders.test.ts`

- [ ] **Step 1: Write the failing test (append to the test file)**

```ts
import { resolveProviderView } from "./serverProviders";

describe("resolveProviderView", () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    key === "auth.social.continueWith" ? `Continue with ${opts?.provider}` : key;

  it("known brand google -> brand i18n label + google icon hint", () => {
    const v = resolveProviderView({ id: "google", name: "Google", iconHint: "google" }, t);
    expect(v.iconHint).toBe("google");
    expect(v.displayLabel).toBe("auth.social.continueWithGoogle");
  });

  it("github -> continueWith template with server name (no upstream brand key)", () => {
    const v = resolveProviderView({ id: "github", name: "GitHub", iconHint: "github" }, t);
    expect(v.iconHint).toBe("github");
    expect(v.displayLabel).toBe("Continue with GitHub");
  });

  it("oidc/generic -> continueWith template with the server name", () => {
    const v = resolveProviderView(
      { id: "oidc", name: "Company SSO", iconHint: "generic" },
      t
    );
    expect(v.iconHint).toBe("generic");
    expect(v.displayLabel).toBe("Continue with Company SSO");
  });

  it("carries id through unchanged for the click handler", () => {
    expect(
      resolveProviderView({ id: "oidc", name: "X", iconHint: "generic" }, t).id
    ).toBe("oidc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/serverProviders.test.ts`
Expected: FAIL — `resolveProviderView is not a function`.

- [ ] **Step 3: Add the implementation to `serverProviders.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/serverProviders.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/serverProviders.ts src/lib/serverProviders.test.ts
git commit -m "feat(phase-06): resolveProviderView icon/label resolver"
```

---

## Task 4: Data layer — `fetchServerProviders` (mocked fetch)

**Files:**
- Modify: `src/lib/serverProviders.ts`
- Test: `src/lib/serverProviders.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { fetchServerProviders } from "./serverProviders";

describe("fetchServerProviders", () => {
  it("returns parsed providers on 200 (real shape)", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          providers: [{ id: "google", name: "Google", enabled: true }],
          emailVerification: { required: true, configured: true },
        }),
      }) as unknown as Response;
    const out = await fetchServerProviders("https://srv.example", fetchImpl);
    expect(out.map((p) => p.id)).toEqual(["google"]);
  });

  it("returns [] when baseUrl is empty (no fetch performed)", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return {} as Response;
    };
    const out = await fetchServerProviders("", fetchImpl);
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns [] on non-2xx", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response;
    expect(await fetchServerProviders("https://srv.example", fetchImpl)).toEqual([]);
  });

  it("returns [] on network throw", async () => {
    const fetchImpl = async () => {
      throw new Error("network down");
    };
    expect(await fetchServerProviders("https://srv.example", fetchImpl)).toEqual([]);
  });

  it("returns [] when body fails validation", async () => {
    const fetchImpl = async () =>
      ({ ok: true, status: 200, json: async () => ({ garbage: true }) }) as Response;
    expect(await fetchServerProviders("https://srv.example", fetchImpl)).toEqual([]);
  });

  it("strips a trailing slash on baseUrl", async () => {
    let calledUrl = "";
    const fetchImpl = async (url: string) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => ({ providers: [] }) } as Response;
    };
    await fetchServerProviders("https://srv.example/", fetchImpl);
    expect(calledUrl).toBe("https://srv.example/api/auth/providers");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/serverProviders.test.ts`
Expected: FAIL — `fetchServerProviders is not a function`.

- [ ] **Step 3: Add the implementation to `serverProviders.ts`**

```ts
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch the server's enabled providers. Pre-auth (no token), mirroring
 * POST /api/check-user. Any failure -> [] (degrade to password-only).
 * fetchImpl is injectable for tests; defaults to global fetch.
 */
export async function fetchServerProviders(
  baseUrl: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init)
): Promise<ServerProvider[]> {
  if (!baseUrl) return [];
  const url = `${baseUrl.replace(/\/$/, "")}/api/auth/providers`;
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const body = await res.json();
    return parseProvidersResponse(body);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/serverProviders.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/serverProviders.ts src/lib/serverProviders.test.ts
git commit -m "feat(phase-06): fetchServerProviders pre-auth, fail-soft to []"
```

---

## Task 5: React hook `useServerProviders` + provider icons component

**Files:**
- Modify: `src/lib/serverProviders.ts` (add the hook)
- Create: `src/components/auth/providerIcons.tsx`

> The hook calls `fetchServerProviders` once on mount using `OPENWHISPR_BACKEND_URL` (the same value AuthenticationStep already imports). No render test (node env / no jsdom) — the hook is a thin wrapper over the already-tested `fetchServerProviders`. Keep it minimal so it needs no test.

- [ ] **Step 1: Add the hook to `serverProviders.ts`**

```ts
import { useEffect, useState } from "react";
import { OPENWHISPR_BACKEND_URL } from "../config/defaults";

export type ProvidersStatus = "loading" | "ready" | "error";

export interface ProvidersState {
  status: ProvidersStatus;
  providers: ServerProvider[];
}

/**
 * Fetches the server provider list once on mount. Source of truth is
 * OPENWHISPR_BACKEND_URL. On any failure -> status "error" + empty list,
 * which the UI renders as password-only. No stale cache (design D2).
 * The renderer reloads on serverUrl change (auth.ts HOST-02), so a fresh
 * mount re-runs this — no extra subscription needed.
 */
export function useServerProviders(): ProvidersState {
  const [state, setState] = useState<ProvidersState>({ status: "loading", providers: [] });
  useEffect(() => {
    let alive = true;
    if (!OPENWHISPR_BACKEND_URL) {
      setState({ status: "ready", providers: [] });
      return;
    }
    fetchServerProviders(OPENWHISPR_BACKEND_URL)
      .then((providers) => {
        if (alive) setState({ status: "ready", providers });
      })
      .catch(() => {
        if (alive) setState({ status: "error", providers: [] });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
```

> Note: `fetchServerProviders` already swallows errors to `[]`, so the `.catch` is defensive only — status will normally be `"ready"` with an empty list on failure, which renders identically (no buttons). This is intentional per D2.

- [ ] **Step 2: Create `src/components/auth/providerIcons.tsx`**

Move the three inline icons out of `AuthenticationStep.tsx` (verbatim copy of the SVGs at `AuthenticationStep.tsx:35-74`) and add a generic icon. This file is fork-only and keeps the upstream component lean.

```tsx
// Phase 06 (fork-only) — provider icons extracted from AuthenticationStep so
// the upstream component shrinks to a single <ServerProviderButtons/> hook.
// The three brand SVGs are copied verbatim from upstream AuthenticationStep
// (lines 35-74 at extraction time) for pixel parity. GenericProviderIcon is
// the fallback for any server-driven provider (Keycloak/Okta/OIDC).
import { KeyRound } from "lucide-react";
import type { ProviderIconHint } from "../../lib/serverProviders";

export const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

export const MicrosoftIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022" />
    <path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00" />
    <path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF" />
    <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900" />
  </svg>
);

export const AppleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

// GitHub mark — the real server emits an id:"github" provider, which upstream
// AuthenticationStep never had. Single-path monochrome, fill=currentColor.
export const GitHubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1C5.92 1 1 5.92 1 12c0 4.86 3.15 8.98 7.52 10.44.55.1.75-.24.75-.53 0-.26-.01-.96-.01-1.88-3.06.66-3.71-1.48-3.71-1.48-.5-1.27-1.22-1.61-1.22-1.61-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.69-1.48-2.44-.28-5.01-1.22-5.01-5.43 0-1.2.43-2.18 1.13-2.95-.11-.28-.49-1.4.11-2.91 0 0 .92-.3 3.02 1.13a10.5 10.5 0 0 1 5.5 0c2.1-1.43 3.02-1.13 3.02-1.13.6 1.51.22 2.63.11 2.91.7.77 1.13 1.75 1.13 2.95 0 4.22-2.58 5.15-5.03 5.42.39.34.74 1.01.74 2.04 0 1.47-.01 2.66-.01 3.02 0 .29.2.64.76.53A11.01 11.01 0 0 0 23 12c0-6.08-4.92-11-11-11z" />
  </svg>
);

export const GenericProviderIcon = ({ className }: { className?: string }) => (
  <KeyRound className={className} />
);

export function iconFor(hint: ProviderIconHint): React.FC<{ className?: string }> {
  switch (hint) {
    case "google": return GoogleIcon;
    case "github": return GitHubIcon;
    case "microsoft": return MicrosoftIcon;
    case "apple": return AppleIcon;
    default: return GenericProviderIcon;
  }
}
```

- [ ] **Step 3: Type-check passes**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "serverProviders|providerIcons" || echo "no type errors in new files"`
Expected: `no type errors in new files`.

- [ ] **Step 4: Re-run the data-layer tests (hook addition must not break them)**

Run: `npx vitest run src/lib/serverProviders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/serverProviders.ts src/components/auth/providerIcons.tsx
git commit -m "feat(phase-06): useServerProviders hook + extracted provider icons"
```

---

## Task 6: `ServerProviderButtons` component (thin, logic-free)

**Files:**
- Create: `src/components/ServerProviderButtons.tsx`

> No render test (node env / no jsdom). All decision logic was tested in Tasks 2–3. This component is a logic-free map. Visual correctness is covered by the e2e in Task 9 + manual verification.

- [ ] **Step 1: Create the component**

```tsx
// Phase 06 (fork-only) — renders one sign-in button per server-enabled
// provider. Pure presentation: it receives already-resolved view-models and
// an onSelect(id) callback (wired to upstream signInWithSocial via
// AuthenticationStep.handleSocialSignIn). No fetch, no validation, no branching
// beyond icon lookup. See serverProviders.ts for the data layer.
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { iconFor } from "./auth/providerIcons";
import {
  useServerProviders,
  resolveProviderView,
  type ServerProvider,
} from "../lib/serverProviders";

interface ServerProviderButtonsProps {
  onSelect: (id: string) => void;
  loadingId: string | null;
  disabled: boolean;
  /** Hidden when the OAuth protocol isn't registered (upstream behavior). */
  protocolUnavailableTitle?: string;
  /** Test seam: inject a provider list instead of fetching. */
  providersOverride?: ServerProvider[];
}

export function ServerProviderButtons({
  onSelect,
  loadingId,
  disabled,
  protocolUnavailableTitle,
  providersOverride,
}: ServerProviderButtonsProps) {
  const { t } = useTranslation();
  const fetched = useServerProviders();
  const providers = providersOverride ?? fetched.providers;

  if (providers.length === 0) return null;

  return (
    <>
      {providers.map((p) => {
        const view = resolveProviderView(p, t);
        const Icon = iconFor(view.iconHint);
        const isLoading = loadingId === view.id;
        return (
          <Button
            key={view.id}
            type="button"
            variant="social"
            onClick={() => onSelect(view.id)}
            disabled={disabled || loadingId !== null}
            title={protocolUnavailableTitle}
            className="w-full h-9"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  {t("auth.social.completeInBrowser")}
                </span>
              </>
            ) : (
              <>
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{view.displayLabel}</span>
              </>
            )}
          </Button>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ServerProviderButtons" || echo "no type errors"`
Expected: `no type errors`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ServerProviderButtons.tsx
git commit -m "feat(phase-06): ServerProviderButtons presentation component"
```

---

## Task 7: Upstream hooks — widen `SocialProvider`, swap button region

**Files:**
- Modify: `src/lib/auth.ts` (1 line, ~168)
- Modify: `src/components/AuthenticationStep.tsx` (imports, icon removal, button region)

> These are the ONLY upstream-file edits. Keep them surgical.

- [ ] **Step 1: Widen the `SocialProvider` union in `auth.ts`**

Change line ~168 from:
```ts
export type SocialProvider = "google" | "microsoft" | "apple";
```
to:
```ts
// Phase 06: widened to an open set so server-driven providers (Keycloak,
// generic OIDC) can flow through signInWithSocial unchanged. Additive — the
// three legacy literals are preserved for upstream call-site/type parity.
export type SocialProvider = "google" | "microsoft" | "apple" | (string & {});
```

- [ ] **Step 2: In `AuthenticationStep.tsx`, remove the three inline icon defs**

Delete lines 35–74 (the `GoogleIcon`, `MicrosoftIcon`, `AppleIcon` consts) — they now live in `providerIcons.tsx`.

- [ ] **Step 3: Update the imports in `AuthenticationStep.tsx`**

Remove the OAuth-enabled import block (lines 12–17 currently import `OAUTH_GOOGLE_ENABLED`, `OAUTH_APPLE_ENABLED`, `OAUTH_MICROSOFT_ENABLED`, `ALLOW_CUSTOM_HOST_ENABLED`). Keep `ALLOW_CUSTOM_HOST_ENABLED` (still used for the server-URL field). Replace with:

```ts
import { ALLOW_CUSTOM_HOST_ENABLED } from "../config/defaults";
import { ServerProviderButtons } from "./ServerProviderButtons";
```

(Leave the existing `import { OPENWHISPR_BACKEND_URL } from "../config/defaults";` line as-is.)

- [ ] **Step 4: Replace the three `<Button>` provider blocks with the component**

Delete the three blocks (the `{OAUTH_APPLE_ENABLED && isMacOS && (…)}`, `{OAUTH_GOOGLE_ENABLED && (…)}`, `{OAUTH_MICROSOFT_ENABLED && (…)}` JSX regions, originally ~lines 491–564) and replace with a single mount:

```tsx
<ServerProviderButtons
  onSelect={handleSocialSignIn}
  loadingId={isSocialLoading}
  disabled={isCheckingEmail}
  protocolUnavailableTitle={
    !oauthProtocolRegistered ? t("auth.social.protocolUnavailable") : undefined
  }
/>
```

> `handleSocialSignIn` already takes `SocialProvider`; with the Step-1 widening it accepts any string id. `isSocialLoading` is typed `SocialProvider | null` — compatible with `loadingId: string | null`.

- [ ] **Step 5: Build the renderer to confirm it compiles and the icons resolve**

Run: `npx vite build 2>&1 | tail -5`
Expected: build succeeds (no unresolved imports, no missing `GoogleIcon`).

- [ ] **Step 6: Confirm no dangling references to the removed icons/flags**

Run:
```bash
grep -n "OAUTH_GOOGLE_ENABLED\|OAUTH_APPLE_ENABLED\|OAUTH_MICROSOFT_ENABLED" src/components/AuthenticationStep.tsx || echo "clean — no OAUTH_*_ENABLED left in AuthenticationStep"
grep -n "const GoogleIcon\|const MicrosoftIcon\|const AppleIcon" src/components/AuthenticationStep.tsx || echo "clean — icons removed"
```
Expected: both `clean` lines.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/components/AuthenticationStep.tsx
git commit -m "feat(phase-06): wire AuthenticationStep to server-driven providers

Widen SocialProvider to an open set (1-token additive). Replace the three
build-time-gated provider buttons + inline icons with <ServerProviderButtons/>.
Upstream footprint kept minimal per upstream_parity."
```

---

## Task 8: Decouple lockdown from social in build-config + rewrite verifier

**Files:**
- Modify: `scripts/generate-build-config.js` (lines ~207–210)
- Modify: `scripts/verify-provider-lockdown.js`
- Modify: `docs/CONFIG_INVENTORY.md` (+ project-constraints note)

- [ ] **Step 1: Remove the lockdown→OAUTH social cascade**

In `scripts/generate-build-config.js`, inside the `if (resolved.PROVIDER_LOCKDOWN_ENABLED === true) {` block (~line 207), delete the three social lines:
```js
    resolved.OAUTH_GOOGLE_ENABLED = false;
    resolved.OAUTH_APPLE_ENABLED = false;
    resolved.OAUTH_MICROSOFT_ENABLED = false;
```
Keep `resolved.STREAMING_ENABLED = true;` and everything else in the block. Add a comment:
```js
    // Phase 06 (D3): lockdown no longer strips social sign-in. Social
    // visibility is server-driven (GET /api/auth/providers); the client
    // renders exactly what the server enables, in lockdown builds too.
    // BYOK / enterprise / billing / referrals stripping below is unchanged.
```

> The `OAUTH_*_ENABLED` flags still exist and still default true; they no longer gate the social UI (AuthenticationStep no longer imports them after Task 7). They remain only as inputs to `emitPreloadGcal` (Google **Calendar** integration, a separate feature). Do not remove the flags themselves — that's a wider change out of scope.

- [ ] **Step 2: Run the build-config generator and confirm a lockdown build still sets the other cascades**

Run:
```bash
OPENWHISPR_PROVIDER_LOCKDOWN=true node scripts/generate-build-config.js
grep -n "PROVIDER_LOCKDOWN_ENABLED\|STREAMING_ENABLED\|OAUTH_GOOGLE_ENABLED" src/config/build-config.generated.ts
```
Expected: `PROVIDER_LOCKDOWN_ENABLED = true`, `STREAMING_ENABLED = true`, and `OAUTH_GOOGLE_ENABLED = true` (no longer forced false). Then regenerate clean defaults: `node scripts/generate-build-config.js`.

- [ ] **Step 3: Rewrite the social assertion in `verify-provider-lockdown.js`**

Read the script first (`Read scripts/verify-provider-lockdown.js`). Find the assertion that greps the lockdown bundle for absence of `/api/desktop-signin/` or provider literals and **remove/invert** it. Replace with an assertion that the lockdown bundle still strips BYOK/enterprise/billing/referrals literals (whatever the script already checks for those — keep those). Add a header comment:
```js
// Phase 06 (D3): social sign-in is NO LONGER stripped under lockdown — its
// visibility is server-driven at runtime. This verifier therefore no longer
// asserts absence of /api/desktop-signin/ or provider literals. It continues
// to assert lockdown strips BYOK / enterprise / billing / referrals.
```

- [ ] **Step 4: Run the verifier against a lockdown build**

Run:
```bash
OPENWHISPR_PROVIDER_LOCKDOWN=true node scripts/generate-build-config.js && npx vite build >/dev/null 2>&1 && node scripts/verify-provider-lockdown.js; echo "exit=$?"
```
Expected: `exit=0` (BYOK/enterprise/billing/referrals still stripped; social no longer asserted). Then restore defaults: `node scripts/generate-build-config.js`.

- [ ] **Step 5: Document the decision**

In `docs/CONFIG_INVENTORY.md`, add a short note under the OAuth section: lockdown is decoupled from social as of phase 06; social visibility is server-driven via `GET /api/auth/providers`. Cross-reference the spec. Also add one line to `CLAUDE.md`'s Project Constraints area noting the corporate-minimal audit no longer covers social literals (the design doc §2 D3 is the authority).

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-build-config.js scripts/verify-provider-lockdown.js docs/CONFIG_INVENTORY.md CLAUDE.md
git commit -m "build(phase-06): decouple PROVIDER_LOCKDOWN from social (D3)

Lockdown no longer strips social sign-in; visibility is server-driven.
Rewrite verify-provider-lockdown.js to the new invariant. Document the
trade-off (corporate-minimal audit no longer covers social literals)."
```

---

## Task 9: e2e — stubbed provider endpoint drives the buttons

**Files:**
- Create/Modify: e2e step under `tests/e2e/` (follow the existing playwright-bdd pattern used for onboarding; inspect `tests/e2e/steps/host-runtime-override.steps.ts` for the established style first).

> Requires the server-side endpoint OR a stubbed response. Per no-mocks rule for *real* integration, the preferred path is to point the e2e at a real openwhispr-server once R-PROV-01 lands. Until then, stub the `GET /api/auth/providers` response at the network layer in the e2e (test-harness stub of an external endpoint is allowed — it is not a client-code mock and not a fake auth response; it exercises the real client fetch+render path against a controlled wire payload).

- [ ] **Step 1: Read the existing e2e step style**

Run: `Read tests/e2e/steps/host-runtime-override.steps.ts` (and the feature file that drives it) to match fixtures, the playwright-bdd `Given/When/Then` idiom, and how the packed app is launched.

- [ ] **Step 2: Add a feature scenario**

In the appropriate `.feature` file, add:
```gherkin
Scenario: Server-enabled providers render as buttons
  # Stub returns the REAL shape: {providers:[{id,name,enabled}], emailVerification:{...}}
  Given the server returns providers "google:Google,oidc:Company SSO"
  When I open the sign-in screen
  Then I see a "Continue with Google" button
  And I see a "Continue with Company SSO" button
  And clicking "Continue with Company SSO" opens "/api/desktop-signin/oidc"

Scenario: No providers means password-only
  Given the server returns no providers
  When I open the sign-in screen
  Then I see no social sign-in buttons
  And the email field is usable
```

- [ ] **Step 3: Implement the steps**

Stub the `GET /api/auth/providers` route at the network layer (playwright `page.route` or the harness's existing request-interception seam) to return the contracted body. Assert button presence by the localized text and assert the external-link IPC (`openExternalLink`) is invoked with the `keycloak` desktop-signin URL (intercept `getOAuthProtocol`/`openExternalLink` as the existing OAuth e2e does, or assert via the CDP hook used in prior phases).

- [ ] **Step 4: Run the e2e**

Run: `npm run test:e2e -- --grep "Server-enabled providers|password-only"` (adjust to the repo's actual e2e script — check `package.json`).
Expected: both scenarios PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test(phase-06): e2e for server-driven provider rendering + password-only fallback"
```

---

## Task 10: Live verification against prod (per live_verification_over_green_tests)

> Green tests are necessary but NOT sufficient (the discipline that caught R19–R23). Drive the real packed app once the server endpoint is live.

- [ ] **Step 1: Confirm the server endpoint is live**

Confirm `GET https://openwhispr.yambr.com/api/auth/providers` (or the staging host) returns the real body `{providers:[{id,name,enabled}], emailVerification:{...}}` with the configured ids (`google`/`github`/`oidc` as applicable). `curl -s <host>/api/auth/providers | jq` and assert the shape. If the operator has the OIDC triplet set, confirm the `oidc` entry is present (that's the Keycloak/SSO button).

- [ ] **Step 2: Pack and launch with CDP**

Build a packed app (`npm run pack`) pointed at the server, launch with `--remote-debugging-port=9223` (per `cdp_renderer_debug`).

- [ ] **Step 3: Drive the sign-in screen via CDP**

Reuse the CDP harness pattern (`scripts/cdp-*.mjs`). Assert: the rendered social buttons exactly match the server's `providers` list; each button's label matches the resolved view; clicking the Keycloak button opens the browser at `/api/desktop-signin/keycloak`. Write a `scripts/cdp-server-providers-verify.mjs` for repeatability.

- [ ] **Step 4: Verify the negative path live**

Point at a server returning `{"providers":[]}` (or temporarily disable providers) → confirm the client shows password-only, sign-in still works.

- [ ] **Step 5: Record the result**

Write a one-paragraph live-verification note into `.planning/phases/06-server-driven-auth-providers/VERIFICATION.md` with the prod version, commit sha, and observed button set. Update the memory file if a new non-obvious fact emerged.

---

## Self-Review (completed by author)

**1. Spec coverage:**
- §3.1 boundaries → Tasks 2–6 (two fork-only modules + icons). ✓
- §3.2 data flow / states → Task 4 (fetch states) + Task 5 (hook) + Task 6 (render). ✓
- §3.3 server contract → filed SERVER-REQUIREMENTS.md; consumed in Tasks 2/4/9. ✓
- §3.4 type strategy → Task 7 Step 1. ✓
- §3.5 lockdown guard / build-config route → Task 8 (build-config decouple, the preferred zero-auth.ts-edit route). ✓
- §4 error handling → Task 4 tests (all failure modes → []) + Task 5 hook. ✓
- §5 i18n → Task 1. ✓
- §6 server reqs → filed. ✓
- §7 testing → Tasks 2–4 unit, Task 9 e2e, Task 10 live, Task 8 verifier rewrite. ✓
- §8 out-of-scope honored (no cache, no remote icons, no client OIDC config). ✓

**2. Placeholder scan:** No TBD/TODO. Task 9 references the existing e2e style by file (`host-runtime-override.steps.ts`) and instructs reading it first rather than inventing fixtures — acceptable because the e2e harness idiom must match what's already there; the scenarios + assertions are concrete.

**3. Type consistency:** `ServerProvider {id,name,iconHint}` (matches real server `{id,name,enabled}` — `enabled` consumed-and-dropped by the parser, `iconHint` derived from `id`), `ServerProviderView {id,iconHint,displayLabel}`, `ProviderIconHint = google|github|apple|microsoft|generic`, `ProvidersState {status,providers}`, `fetchServerProviders(baseUrl,fetchImpl)`, `resolveProviderView(p,t)` (reads `p.name`), `useServerProviders()`, `iconFor(hint)` (handles all 5 hints incl. github), `ServerProviderButtons` props `{onSelect,loadingId,disabled,protocolUnavailableTitle,providersOverride}` — names consistent across Tasks 2–7. `handleSocialSignIn(provider: SocialProvider)` accepts `string` after the Task-7 widening, so `onSelect: (id: string)=>void` is compatible. ✓

**4. Server-contract alignment (post-verification):** parser fixtures, fetch fixtures, e2e stub, and the curl in Task 10 all use the **real** `{id,name,enabled}` + `emailVerification` shape with ids `google|github|oidc`. ✓
