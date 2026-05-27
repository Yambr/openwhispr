// Phase 4 UI-01..04 (v1.8.0) — Server URL field on the onboarding screen.
//
// Gated at build time by ALLOW_CUSTOM_HOST_ENABLED (Phase 3 BG-01).
// Default Yambr build hides this entirely via Rolldown DCE — the consumer
// (AuthenticationStep.tsx) wraps the mount in `{ALLOW_CUSTOM_HOST_ENABLED && <ServerUrlField .../>}`
// so the literal is folded out when the flag is false.
//
// Behavior per docs/adr/ADR-001 mitigations M1-M4:
//   M1 — explicit user entry only (no placeholder hint suggesting yambr.com)
//   M2 — HTTPS-only enforcement (URL.protocol === "https:")
//   M3 — reachability probe before persist (GET /api/auth/get-session expects 401)
//   M4 — no data carry-over (host change forces re-auth — handled at the
//        useSettingsStore.setServerUrl call site; setting the URL invalidates
//        cached authClient inner instance per Phase 1 HOST-02)
//
// i18n keys (UI-04, must exist in all 10 locales):
//   onboarding.serverUrl.label
//   onboarding.serverUrl.helper
//   onboarding.serverUrl.errorEmpty
//   onboarding.serverUrl.errorScheme
//   onboarding.serverUrl.errorInvalid
//   onboarding.serverUrl.errorUnreachable
//   onboarding.serverUrl.checking
//   onboarding.serverUrl.success

import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "../ui/input";
import { useSettingsStore } from "../../stores/settingsStore";

const PROBE_TIMEOUT_MS = 8000;

type ValidationState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "valid"; url: string }
  | { kind: "invalid"; message: string };

export interface ServerUrlFieldProps {
  /** Called when the field validates successfully. The parent can enable Continue. */
  onValidated?: (url: string) => void;
  /** Called when the field becomes invalid or is cleared. */
  onInvalidated?: () => void;
  /** Disable input (e.g., during sign-in submission). */
  disabled?: boolean;
}

/**
 * Reachability probe: GET <url>/api/auth/get-session and treat ANY HTTP
 * response (1xx–5xx) as "host alive". A response — regardless of auth
 * status — proves DNS+TCP+TLS+server are working. Per-server auth-status
 * semantics (401 vs 200 vs 403 vs custom error envelope) are server-specific
 * and the actual sign-in flow surfaces real auth failures with proper UX.
 * Only network/parse failures count as unreachable.
 *
 * Pre-v1.7.10 review (WARN-01) — previously this only accepted 401,
 * rejecting self-hosters whose Better Auth fork returns 200 with empty
 * session body.
 */
async function probe(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const probeUrl = url.replace(/\/$/, "") + "/api/auth/get-session";
    const res = await fetch(probeUrl, {
      method: "GET",
      signal,
      // Important: do NOT send credentials — we're just testing reachability,
      // not authenticating. Any cookies would leak the build-time-default host's
      // session to a potentially-untrusted runtime URL.
      credentials: "omit",
    });
    return res.status >= 100 && res.status < 600;
  } catch {
    return false;
  }
}

/**
 * Pre-v1.7.10 review (WARN-02): block SSRF surface for HTTPS URLs against
 * RFC 1918 / link-local / loopback IP literals. The onboarding probe fires
 * a real HTTP request against a user-typed URL; without this guard an
 * onboarding deep-link could enumerate internal services or hit cloud
 * metadata endpoints (e.g. AWS IMDS at 169.254.169.254). Local dev is
 * already covered separately by the explicit "http://localhost" path.
 */
function isPrivateOrLoopback(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  // IPv4-mapped IPv6
  if (h.startsWith("::ffff:")) return true;
  // IPv6 link-local
  if (h.startsWith("fe80:")) return true;
  // IPv6 unique-local
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;
  // IPv4 loopback
  if (/^127\./.test(h)) return true;
  // RFC 1918
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  // Link-local
  if (/^169\.254\./.test(h)) return true;
  return false;
}

export function ServerUrlField({
  onValidated,
  onInvalidated,
  disabled,
}: ServerUrlFieldProps): React.ReactElement {
  const { t } = useTranslation();
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const currentServerUrl = useSettingsStore((s) => s.serverUrl);
  const [value, setValue] = useState(currentServerUrl ?? "");
  const [state, setState] = useState<ValidationState>(
    currentServerUrl ? { kind: "valid", url: currentServerUrl } : { kind: "idle" }
  );
  const abortRef = React.useRef<AbortController | null>(null);

  const validate = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();

      if (!trimmed) {
        setState({ kind: "invalid", message: t("onboarding.serverUrl.errorEmpty") });
        onInvalidated?.();
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        setState({ kind: "invalid", message: t("onboarding.serverUrl.errorInvalid") });
        onInvalidated?.();
        return;
      }

      // M2 — HTTPS-only enforcement (allow http only against localhost for dev/test).
      const isLocalhost =
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname.endsWith(".localhost");
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
        setState({ kind: "invalid", message: t("onboarding.serverUrl.errorScheme") });
        onInvalidated?.();
        return;
      }

      // WARN-02: SSRF guard — refuse HTTPS to RFC1918/link-local/loopback IP
      // literals (admin UIs, IMDS, internal hosts). The local-dev http://
      // path remains valid because the scheme-gate above only lets http
      // through when isLocalhost === true, which is the legitimate dev case.
      if (parsed.protocol === "https:" && isPrivateOrLoopback(parsed.hostname)) {
        setState({ kind: "invalid", message: t("onboarding.serverUrl.errorScheme") });
        onInvalidated?.();
        return;
      }

      // M3 — reachability probe.
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const timeout = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);

      setState({ kind: "checking" });
      try {
        const reachable = await probe(parsed.origin, ac.signal);
        clearTimeout(timeout);
        if (!reachable) {
          setState({ kind: "invalid", message: t("onboarding.serverUrl.errorUnreachable") });
          onInvalidated?.();
          return;
        }
        const normalized = parsed.origin;
        setState({ kind: "valid", url: normalized });
        onValidated?.(normalized);
      } catch {
        clearTimeout(timeout);
        setState({ kind: "invalid", message: t("onboarding.serverUrl.errorUnreachable") });
        onInvalidated?.();
      }
    },
    [onValidated, onInvalidated, t]
  );

  const handleBlur = useCallback(() => {
    if (value.trim()) void validate(value);
  }, [value, validate]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
      // Reset to idle while typing; re-validate on blur.
      if (state.kind === "valid" || state.kind === "invalid") {
        setState({ kind: "idle" });
        onInvalidated?.();
      }
    },
    [state.kind, onInvalidated]
  );

  // Persist the URL into the settings store when validation succeeds.
  // The Phase 1 HOST-02 proxy + IPC bridge propagate the change.
  // INFO-04: depend on the actual URL string, not the state object, to avoid
  // re-firing on idle/checking transitions that don't change the URL.
  const validUrl = state.kind === "valid" ? state.url : null;
  React.useEffect(() => {
    if (validUrl) setServerUrl(validUrl);
  }, [validUrl, setServerUrl]);

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor="server-url-field">
        {t("onboarding.serverUrl.label")}
      </label>
      <Input
        id="server-url-field"
        type="url"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        // M1 — no placeholder hint suggesting a default host.
        placeholder=""
        className="h-9 text-sm"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled || state.kind === "checking"}
        required
        data-testid="server-url-field"
      />
      <div className="min-h-[1.25rem] text-xs flex items-center gap-1">
        {state.kind === "checking" && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">{t("onboarding.serverUrl.checking")}</span>
          </>
        )}
        {state.kind === "valid" && (
          <>
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span className="text-muted-foreground">{t("onboarding.serverUrl.success")}</span>
          </>
        )}
        {state.kind === "invalid" && (
          <>
            <AlertCircle className="w-3 h-3 text-destructive" />
            <span className="text-destructive">{state.message}</span>
          </>
        )}
        {state.kind === "idle" && (
          <span className="text-muted-foreground/70">{t("onboarding.serverUrl.helper")}</span>
        )}
      </div>
    </div>
  );
}
