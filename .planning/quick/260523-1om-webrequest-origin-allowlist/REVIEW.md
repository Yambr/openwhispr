---
review: webrequest-origin-allowlist (v1.7.6)
reviewed: 2026-05-22T22:38:00Z
diff_range: 09cb1746..6029061c
depth: deep
files_reviewed: 8
files_reviewed_list:
  - main.js
  - scripts/generate-build-config.js
  - src/config/defaults.ts
  - src/vite.config.mjs
  - src/types/build-env.d.ts
  - .github/workflows/release.yml
  - tests/ui/corporate-lockdown.spec.ts
  - package.json
findings:
  critical: 0
  high: 1
  medium: 1
  low: 2
  nit: 1
  total: 5
status: issues_found
---

# Code Review: webRequest Origin-Rewrite Allowlist (v1.7.6)

**Reviewed:** 2026-05-22T22:38:00Z
**Depth:** deep (cross-file: generator → generated config → main.js + defaults.ts → CI env)
**Verdict:** **Roll the v1.7.6 tag before publish.** One HIGH finding means the release does not actually fix the reported defect for the auth host — the corporate build still ships an allowlist that omits its real Better Auth origin.

---

## Summary

The diff is well-structured and the *backend* half of the fix is correct: `OPENWHISPR_BACKEND_URL` is wired into 6 CI env blocks, `deriveOriginPattern()` is sound for that input, and the generator derivation gating mirrors the existing WSS pattern faithfully. `main.js` upstream-parity holds — the `onBeforeSendHeaders` *callback body* is byte-identical to `upstream/main`; only the `urls` array source changed, exactly as constrained.

**But the auth half of the fix is dead code in the actual release path.** `deriveOriginPattern` for the auth pattern keys off `resolved.OPENWHISPR_AUTH_URL`, and `release.yml` never sets `OPENWHISPR_AUTH_URL` — it only sets `VITE_AUTH_URL`. `resolveValue()` does **not** fall back from `OPENWHISPR_AUTH_URL` to `VITE_AUTH_URL`. So in every CI build the auth pattern stays pinned to the parity default `https://auth.openwhispr.com/*`. A corporate build whose Better Auth lives on `auth.yambr.com` (or wherever `VITE_AUTH_URL` points) gets its `Origin: null` rewrite skipped for auth requests → `MISSING_OR_NULL_ORIGIN` → the exact bug this release claims to fix, still live for the auth host.

---

## HIGH

### HIGH-01 — Auth-pattern derivation never fires in the release build; corporate auth host still uncovered

**Files:** `.github/workflows/release.yml` (6 env blocks: lines ~113-114, 126-127, 250-251, 263-264, 404-405, 418-419), `scripts/generate-build-config.js:228-233`, `scripts/generate-build-config.js:106-114` (`resolveValue`)

**What's wrong:**
`buildResolved()` derives `OPENWHISPR_AUTH_URL_PATTERN` from `resolved.OPENWHISPR_AUTH_URL`:

```js
if (
  !Object.prototype.hasOwnProperty.call(process.env, "OPENWHISPR_AUTH_URL_PATTERN") &&
  resolved.OPENWHISPR_AUTH_URL
) {
  const p = deriveOriginPattern(resolved.OPENWHISPR_AUTH_URL);
  if (p) resolved.OPENWHISPR_AUTH_URL_PATTERN = p;
}
```

`resolved.OPENWHISPR_AUTH_URL` comes from `resolveValue("OPENWHISPR_AUTH_URL")`, which reads **only** `process.env.OPENWHISPR_AUTH_URL` and otherwise returns the DEFAULT `https://auth.openwhispr.com`. It has no `VITE_AUTH_URL` fallback.

`release.yml` sets `VITE_AUTH_URL: ${{ vars.VITE_AUTH_URL }}` in all 6 blocks but **never sets `OPENWHISPR_AUTH_URL`**. (Contrast: the diff correctly adds `OPENWHISPR_BACKEND_URL` to the same 6 blocks — the backend variable name *is* what the generator reads.)

Net effect in every CI release build:
- `resolved.OPENWHISPR_AUTH_URL` = `https://auth.openwhispr.com` (default — `OPENWHISPR_AUTH_URL` unset)
- derivation produces `https://auth.openwhispr.com/*` — identical to the parity default
- `OPENWHISPR_AUTH_URL_PATTERN` ships as `https://auth.openwhispr.com/*`

**Why it matters:**
The renderer's real auth traffic (`${AUTH_URL}/api/desktop-signin/{provider}`, `${AUTH_URL}/api/auth/get-session` — see `docs/OAUTH_SPEC.md` §Authorization endpoint, `main.js:481-514`) goes to whatever `VITE_AUTH_URL` resolves to at runtime. For a corporate build that is not `auth.openwhispr.com`. The `webRequest.onBeforeSendHeaders` filter therefore does **not** match those requests, `Origin: null` is never rewritten, and Better Auth's `trustedOrigins` check rejects with `MISSING_OR_NULL_ORIGIN` — the precise failure the release ticket describes. The fix lands only for the API host, not the auth host.

This is HIGH not CRITICAL because: (a) it is a build-time misconfiguration, not a code-execution vuln; (b) it may be partially masked if the corporate deployment colocates auth under the backend host (then the backend pattern coincidentally covers it) — but that is not guaranteed and the OAuth spec treats `auth.*` as a distinct host. If the corporate auth host is distinct, sign-in is broken on first launch.

**Suggested fix (choose one):**
1. **Preferred — fix the generator** so `OPENWHISPR_AUTH_URL` resolution mirrors how `OPENWHISPR_BACKEND_URL` already accepts the `VITE_*` alias elsewhere. Either add `OPENWHISPR_AUTH_URL: ${{ vars.VITE_AUTH_URL }}` to all 6 release.yml blocks (cheapest, matches the `OPENWHISPR_BACKEND_URL` line the diff already added), **or** make `resolveValue` for `OPENWHISPR_AUTH_URL` fall back to `process.env.VITE_AUTH_URL` (consistent with `vite.config.mjs:43-44` which already does `env.OPENWHISPR_AUTH_URL || env.VITE_AUTH_URL`).
2. After the fix, verify the generated `build-config.generated.cjs` actually contains `OPENWHISPR_AUTH_URL_PATTERN: "https://<corp-auth-host>/*"` in a real CI run before publishing.

**Verification note:** This is exactly the "live verification over green tests" trap — the unit-level `deriveOriginPattern` is correct in isolation; the defect is only visible by tracing the CI env wiring end-to-end.

---

## MEDIUM

### MED-01 — Empty `OPENWHISPR_BACKEND_URL_PATTERN`/`AUTH_URL_PATTERN` override silently falls back to parity default, not to "no entry"

**File:** `scripts/generate-build-config.js:221-233`

**What's wrong:**
The reviewer prompt asks: "What if someone sets `OPENWHISPR_BACKEND_URL_PATTERN=""` explicitly?" Trace it:
- `hasOwnProperty(process.env, "OPENWHISPR_BACKEND_URL_PATTERN")` → `true` → derivation block is **skipped** (correct: explicit override wins).
- But `resolveValue("OPENWHISPR_BACKEND_URL_PATTERN")` returns `process.env[key]` = `""`.

So `resolved.OPENWHISPR_BACKEND_URL_PATTERN = ""`. That `""` is then `JSON.stringify`'d into the generated config, and `main.js`'s `.filter(Boolean)` drops it. **This is actually the correct/safe outcome** — an explicit empty override means "don't add a backend pattern," and the filter handles it. So functionally fine.

The MEDIUM is a *consistency / least-surprise* gap: the WSS guard at line 209-214 treats explicit `""` as "I want derivation" (`!resolved.X && resolved.BACKEND_URL` → derive). The pattern guard treats explicit `""` as "I want literally nothing." Two adjacent derivation blocks, two opposite interpretations of explicit-empty, and only the WSS one is documented (its comment explicitly calls out the `""` case). A maintainer setting `OPENWHISPR_BACKEND_URL_PATTERN=""` expecting derivation (by analogy with WSS) gets an empty pattern instead.

**Why it matters:** No runtime break, but it is a latent foot-gun in security-adjacent config. If a future maintainer "clears" the pattern var intending to re-derive, they instead silently disable the backend Origin rewrite.

**Suggested fix:** Add one comment line to the pattern derivation block stating that — unlike the WSS guard — explicit empty `""` here means "emit no pattern" and is intentionally honored as such. No code change needed; just kill the inconsistency-by-silence.

---

## LOW

### LOW-01 — `deriveOriginPattern` preserves userinfo in `u.host`? No — but worth an explicit guard/comment

**File:** `scripts/generate-build-config.js:163-171`

**What's wrong:** Edge-case audit requested. `new URL("https://user:pass@x.com/api").host` → `"x.com"` (userinfo is in `u.username`/`u.password`, **not** `u.host`), and `.host` includes a non-default port, drops path/query/fragment. So `deriveOriginPattern` is correct for userinfo, ports, paths, trailing slashes, and IDN (`new URL` punycode-encodes the host, which is what Electron's URL-pattern matcher expects anyway). Empty string → early `return ""`. Non-http scheme → `return ""`. **The function is correct.**

The only soft spot: a URL like `https://x.com:443/` yields `https://x.com/*` (port 443 normalized away by `URL`), and `http://x.com:80` → `http://x.com/*` — fine, those are origin-equivalent. But `https://x.com:8443` → `https://x.com:8443/*`. Electron's `URLPattern`-style filter does match host:port, so this is correct. No bug.

**Why it matters:** Nothing breaks. Flagging only because the function is a security boundary and the path-drop widening question deserves an explicit answer in-code.

**Answer to the prompt's "does dropping the path widen the match":** No. The old literal was already `https://api.openwhispr.com/*` (no path, `/*` wildcard). `deriveOriginPattern` reproduces exactly that shape. Dropping the path is correct *and* parity-preserving — the Origin rewrite is an origin-level decision, path is irrelevant. Not over-broad.

**Suggested fix:** Optional — none required. The existing comment ("Path/query/fragment are intentionally dropped: the filter matches by origin, not path") already documents intent adequately.

### LOW-02 — Both patterns empty → filter array is `["http://localhost:3000/*","http://127.0.0.1:3000/*"]`, never truly empty

**File:** `main.js:756-765`

**What's wrong:** Prompt asks if an empty-ish `urls` array breaks `onBeforeSendHeaders`. It cannot become empty: the two `localhost` literals are unconditional and not subject to `.filter(Boolean)` removal. Worst case the array has 2 entries. Even a genuinely empty `urls: []` would not throw — Electron treats it as "match nothing" (the handler simply never fires). The `[...new Set(...)]` dedup over string patterns is sound: identical pattern strings (e.g. a corporate build where auth and backend resolve to the same host) collapse to one entry, which is correct and harmless. **No bug.**

**Why it matters:** Defensive confirmation only. The construction is robust.

**Suggested fix:** None.

---

## NIT

### NIT-01 — `corporate-lockdown.spec.ts` `beforeAll` localStorage bypass: sound, but the 4s post-reload sleep is a smell

**File:** `tests/ui/corporate-lockdown.spec.ts:117-159`

**Assessment of the test fix (per prompt):**
- **Race between reload and the localStorage write?** No. `main.evaluate(() => localStorage.setItem(...))` resolves only after the synchronous `setItem` calls complete in-page; `await main.reload()` starts strictly after. localStorage in a `file://` renderer is origin-scoped and persists to userData, so the reloaded document observes the keys. Sequence is correct.
- **Weakens the lockdown leak assertions?** No. The `beforeAll` writes only onboarding/auth-bypass keys (`onboardingCompleted`, `skipAuth`, `authenticationSkipped`) — none of which are provider/lockdown signals. Every `assertNoLeaks` call downstream is untouched. The added post-bypass `Settings` visibility check is a precondition gate, not a product assertion. Good.
- **Notes-onboarding test still consistent?** Yes. The `Notes onboarding` test (line 210+) does `removeItem("notesOnboardingComplete")` + `removeItem("uploadSetupComplete")` then `reload()`. It removes *different* keys than `beforeAll` set; `onboardingCompleted`/`skipAuth` survive the reload (still in userData), so the Control Panel chrome remains rendered and the Notes nav item stays reachable. Consistent.

**The nit:** The fix is fundamentally correct but leans on two `waitForTimeout(4000)` fixed sleeps (existing one + a new one after `reload()`). Fixed sleeps are flaky-by-construction — on a slow CI runner 4s may not be enough; on a fast one it wastes 8s. The new precondition check (`settingsVisible` + throw) is the *right* mechanism — it should be a `waitFor`/polling loop, and the `waitForTimeout` after `reload()` should be replaced by `main.locator('text="Settings"').first().waitFor({ timeout })`. Not release-blocking (test-only, and the explicit throw already converts silent flake into a loud failure).

**Suggested fix:** Replace the post-`reload()` `waitForTimeout(4000)` + manual `isVisible` check with `await main.getByText("Settings").first().waitFor({ state: "visible", timeout: 15000 })` wrapped to rethrow with the body-dump diagnostic. Out of scope for v1.7.6 hotfix; file as test-debt.

---

## Cleared areas (explicitly reviewed, no findings)

- **`main.js` upstream parity** — the `onBeforeSendHeaders` *callback body* (`details.requestHeaders["Origin"] = new URL(details.url).origin` + `try/catch` + `callback`) is **byte-identical** to `git show upstream/main:main.js`. Only the `urls` value, a preceding `const originRewriteUrls`, and a comment block are new — exactly the permitted delta. PASS.
- **`deriveOriginPattern` correctness** — handles userinfo, ports, paths, trailing slash, IDN/punycode, empty, non-http(s) correctly. Rigor is on par with sibling `deriveRealtimeWssUrl` (arguably simpler/safer since it drops path entirely). PASS.
- **Backend-pattern derivation gating** — `hasOwnProperty(process.env, KEY)` check correctly implements "explicit override wins"; matches WSS-guard intent. For the *backend* var the CI wiring is correct (`OPENWHISPR_BACKEND_URL` is set). PASS.
- **`release.yml` structure** — all 6 env blocks (3 platforms × Generate-config + Build steps) consistently get both `OPENWHISPR_PROVIDER_LOCKDOWN` and `OPENWHISPR_BACKEND_URL`. No block missed, no YAML indentation error, Generate and Build steps agree. PASS — except the *absent* `OPENWHISPR_AUTH_URL`, which is HIGH-01.
- **`defaults.ts` / `vite.config.mjs` / `build-env.d.ts`** — new `OPENWHISPR_AUTH_URL_PATTERN` export wired through `pick()`/Vite define/type entry consistently with the existing `BACKEND_URL_PATTERN`. Generator's `KEYS`-driven `emitTs`/`emitCjs` loops automatically emit the new key (it's in `DEFAULTS`). PASS.
- **`package.json` / `package-lock.json`** — 1.7.5 → 1.7.6 bump only. PASS.

---

_Reviewed: 2026-05-22T22:38:00Z_
_Reviewer: Claude (gsd-code-reviewer), deep depth_
