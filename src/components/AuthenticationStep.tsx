import React, { useCallback, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import {
  authClient,
  AUTH_URL,
  signInWithSocial,
  updateLastSignInTime,
  type SocialProvider,
} from "../lib/auth";
import { OPENWHISPR_BACKEND_URL } from "../config/defaults";
import { ALLOW_CUSTOM_HOST_ENABLED } from "../config/defaults";
import { ServerProviderButtons } from "./ServerProviderButtons";
import { useServerProviders, selectAuthView } from "../lib/serverProviders";
import { ServerUrlField } from "./onboarding/ServerUrlField";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AlertCircle, ArrowRight, Check, Loader2, ChevronLeft } from "lucide-react";
import logoIcon from "../assets/icon.png";
import logger from "../utils/logger";
import ForgotPasswordView from "./ForgotPasswordView";

interface AuthenticationStepProps {
  onContinueWithoutAccount: () => void;
  onAuthComplete: () => void;
  onNeedsVerification: (email: string) => void;
}

type AuthMode = "sign-in" | "sign-up" | null;

export default function AuthenticationStep({
  onContinueWithoutAccount,
  onAuthComplete,
  onNeedsVerification,
}: AuthenticationStepProps) {
  const { t } = useTranslation();
  const { isSignedIn, isLoaded, user } = useAuth();
  // Finding #9 (260603-qhw): server-driven local-login gating. When the server
  // reports localLogin.enabled===false it 403/400-rejects the email/password
  // routes, so hide that UI entirely and render SSO only. Default is true while
  // loading and on any fetch failure — lockout-safe (a flaky server must never
  // brick the password form).
  const serverProviders = useServerProviders();
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [oauthProtocolRegistered, setOauthProtocolRegistered] = useState(true);
  // Phase 4 UI-01..04 (v1.8.0): when ALLOW_CUSTOM_HOST_ENABLED, the user must
  // type and validate a Server URL before the form can proceed.
  const [serverUrlValidated, setServerUrlValidated] = useState(false);

  const needsVerificationRef = useRef(false);

  useEffect(() => {
    window.electronAPI
      ?.getOAuthProtocolRegistered?.()
      .then(setOauthProtocolRegistered)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || needsVerificationRef.current || !user?.id || !user?.email)
      return;
    onAuthComplete();
  }, [isLoaded, isSignedIn, user, onAuthComplete]);

  useEffect(() => {
    if (isSocialLoading === null) return;

    let timeout: ReturnType<typeof setTimeout>;

    const handleFocus = () => {
      timeout = setTimeout(() => {
        setIsSocialLoading(null);
      }, 1000);
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      clearTimeout(timeout);
    };
  }, [isSocialLoading]);

  // Finding #9 (260603-qhw) race guard: localLoginEnabled defaults to true while
  // the providers fetch is in flight, so a user can enter their email and open
  // the password form before the server's localLogin:false resolves. When the
  // gate lands disabled, retract any open local-login form so the UI can't offer
  // a path the server will 403. (The server rejects it regardless — this is a
  // UX/correctness backstop, not a security boundary.)
  useEffect(() => {
    if (serverProviders.localLoginEnabled === false && authMode !== null) {
      setAuthMode(null);
    }
  }, [serverProviders.localLoginEnabled, authMode]);

  const handleSocialSignIn = useCallback(
    async (provider: SocialProvider) => {
      setIsSocialLoading(provider);
      setError(null);

      const result = await signInWithSocial(provider);

      if (result.error) {
        setError(
          result.error.message ||
            t("auth.errors.failedProviderSignIn", {
              provider: provider.charAt(0).toUpperCase() + provider.slice(1),
            })
        );
        setIsSocialLoading(null);
      }
    },
    [t]
  );

  const handleEmailContinue = useCallback(async () => {
    if (!email.trim() || !authClient) return;

    const localPart = email.trim().split("@")[0];
    if (localPart?.includes("+")) {
      setError(t("auth.errors.plusAliasUnsupported"));
      return;
    }

    setIsCheckingEmail(true);
    setError(null);

    try {
      if (!OPENWHISPR_BACKEND_URL) {
        setAuthMode("sign-up");
        return;
      }

      const response = await fetch(`${OPENWHISPR_BACKEND_URL}/api/check-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) {
        throw new Error(t("auth.errors.failedUserCheck"));
      }

      const data = await response.json().catch(() => ({}));
      setAuthMode(data.exists ? "sign-in" : "sign-up");
    } catch (err) {
      logger.error("Error checking user existence", err, "auth");
      setAuthMode("sign-up");
    } finally {
      setIsCheckingEmail(false);
    }
  }, [email, t]);

  const errorMessageIncludes = (message: string | undefined, keywords: string[]): boolean => {
    if (!message) return false;
    const lowerMessage = message.toLowerCase();
    return keywords.some((keyword) => lowerMessage.includes(keyword));
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!authClient) {
        setError(t("auth.errors.authNotConfigured"));
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        if (authMode === "sign-up") {
          // Set before signup — SDK may trigger isSignedIn before returning
          needsVerificationRef.current = true;

          const result = await authClient.signUp.email({
            email: email.trim(),
            password,
            name: fullName.trim() || email.trim().split("@")[0],
          });

          if (result.error) {
            needsVerificationRef.current = false;
            if (
              errorMessageIncludes(result.error.message, ["already exists", "already registered"])
            ) {
              setAuthMode("sign-in");
              setError(t("auth.errors.accountExistsSignIn"));
              setPassword("");
            } else {
              setError(result.error.message || t("auth.errors.createAccountFailed"));
            }
          } else {
            updateLastSignInTime();
            onNeedsVerification(email.trim());
          }
        } else {
          const result = await authClient.signIn.email({
            email: email.trim(),
            password,
          });

          if (result.error) {
            if (errorMessageIncludes(result.error.message, ["not found", "no user"])) {
              setAuthMode("sign-up");
              setError(t("auth.errors.accountNotFoundCreate"));
              setPassword("");
            } else {
              setError(result.error.message || t("auth.errors.invalidCredentials"));
            }
          } else {
            updateLastSignInTime();
            onAuthComplete();
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : t("auth.errors.generic");
        setError(errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    },
    [authMode, email, fullName, password, onAuthComplete, onNeedsVerification, t]
  );

  const handleBack = useCallback(() => {
    setAuthMode(null);
    setPassword("");
    setFullName("");
    setError(null);
  }, []);

  const handleForgotPassword = useCallback(() => {
    setForgotPasswordOpen(true);
    setError(null);
  }, []);

  const handleBackFromForgotPassword = useCallback(() => {
    setForgotPasswordOpen(false);
    setError(null);
  }, []);

  const toggleAuthMode = useCallback(() => {
    setAuthMode((mode) => (mode === "sign-in" ? "sign-up" : "sign-in"));
    setError(null);
    setPassword("");
    setFullName("");
  }, []);

  // Auth not configured state
  if (!AUTH_URL || !authClient) {
    return (
      <div className="space-y-3">
        <div className="text-center mb-4">
          <img
            src={logoIcon}
            alt="OpenWhispr"
            className="w-12 h-12 mx-auto mb-2.5 rounded-lg shadow-sm"
          />
          <p className="text-lg font-semibold text-foreground tracking-tight leading-tight">
            {t("auth.welcomeTitle")}
          </p>
          <p className="text-muted-foreground text-sm mt-1 leading-tight">
            {t("auth.welcomeSubtitle")}
          </p>
        </div>

        <div className="bg-warning/5 p-2.5 rounded border border-warning/20">
          <p className="text-xs text-warning text-center leading-snug">
            {t("auth.cloudNotConfigured")}
          </p>
        </div>

        <Button onClick={onContinueWithoutAccount} className="w-full h-9">
          <span className="text-sm font-medium">{t("auth.getStarted")}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  // Already signed in state
  if (isLoaded && isSignedIn) {
    return (
      <div className="space-y-3">
        <div className="text-center mb-4">
          <img
            src={logoIcon}
            alt="OpenWhispr"
            className="w-12 h-12 mx-auto mb-2.5 rounded-lg shadow-sm"
          />
          <div className="w-5 h-5 mx-auto bg-success/10 rounded-full flex items-center justify-center mb-2">
            <Check className="w-3 h-3 text-success" />
          </div>
          <p className="text-lg font-semibold text-foreground tracking-tight leading-tight">
            {user?.name
              ? t("auth.signedIn.welcomeBackName", { name: user.name })
              : t("auth.signedIn.welcomeBack")}
          </p>
          <p className="text-muted-foreground text-sm mt-1 leading-tight">
            {t("auth.signedIn.ready")}
          </p>
        </div>
        <Button onClick={onAuthComplete} className="w-full h-9">
          <span className="text-sm font-medium">{t("auth.common.continue")}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  if (forgotPasswordOpen) {
    return <ForgotPasswordView email={email} onBack={handleBackFromForgotPassword} />;
  }

  // Password form (after email is entered)
  if (authMode !== null) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleBack}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
        >
          <ChevronLeft className="w-3 h-3" />
          {t("auth.common.back")}
        </button>

        <div className="text-center mb-4">
          <p className="text-sm text-muted-foreground/70 mb-2 leading-tight">{email}</p>
          <p className="text-lg font-semibold text-foreground tracking-tight leading-tight">
            {authMode === "sign-in"
              ? t("auth.passwordForm.welcomeBack")
              : t("auth.passwordForm.createAccount")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          {authMode === "sign-up" && (
            <Input
              type="text"
              placeholder={t("auth.passwordForm.fullNamePlaceholder")}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-9 text-xs"
              disabled={isSubmitting}
              autoFocus
            />
          )}
          <Input
            type="password"
            placeholder={
              authMode === "sign-up"
                ? t("auth.passwordForm.createPasswordPlaceholder")
                : t("auth.passwordForm.enterPasswordPlaceholder")
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 text-xs"
            required
            minLength={authMode === "sign-up" ? 8 : undefined}
            disabled={isSubmitting}
            autoFocus={authMode === "sign-in"}
          />

          {authMode === "sign-up" && (
            <p className="text-xs text-muted-foreground/70 leading-tight">
              {t("auth.passwordForm.passwordMinLength")}
            </p>
          )}

          {authMode === "sign-in" && (
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-xs text-primary hover:text-primary/80 transition-colors text-left"
              disabled={isSubmitting}
            >
              {t("auth.passwordForm.forgotPassword")}
            </button>
          )}

          {error && (
            <div className="px-2.5 py-1.5 rounded bg-destructive/5 border border-destructive/20 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
              <p className="text-xs text-destructive leading-snug">{error}</p>
            </div>
          )}

          <Button type="submit" disabled={isSubmitting || !password} className="w-full h-9">
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-sm font-medium">
                  {authMode === "sign-in"
                    ? t("auth.passwordForm.signingIn")
                    : t("auth.passwordForm.creatingAccount")}
                </span>
              </>
            ) : (
              <span className="text-sm font-medium">
                {authMode === "sign-in"
                  ? t("auth.passwordForm.signIn")
                  : t("auth.passwordForm.createAccountButton")}
              </span>
            )}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={toggleAuthMode}
            className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
            disabled={isSubmitting}
          >
            {authMode === "sign-in" ? (
              <>
                {t("auth.passwordForm.newHere")}{" "}
                <span className="font-medium text-primary">
                  {t("auth.passwordForm.createAccountLink")}
                </span>
              </>
            ) : (
              <>
                {t("auth.passwordForm.haveAccount")}{" "}
                <span className="font-medium text-primary">
                  {t("auth.passwordForm.signInLink")}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Main welcome view
  // Derive once: loading defaults localLoginEnabled to true, so the form shows
  // immediately in the common case — no flash-then-hide on the happy path.
  const authView = selectAuthView({
    localLoginEnabled: serverProviders.localLoginEnabled,
    providerCount: serverProviders.providers.length,
  });

  return (
    <div className="space-y-3">
      <div className="text-center mb-4">
        <img
          src={logoIcon}
          alt="OpenWhispr"
          className="w-12 h-12 mx-auto mb-2.5 rounded-lg shadow-sm"
        />
        <p className="text-lg font-semibold text-foreground tracking-tight leading-tight">
          {t("auth.welcomeTitle")}
        </p>
        <p className="text-muted-foreground text-sm mt-1 leading-tight">
          {t("auth.welcomeSubtitle")}
        </p>
      </div>

      <ServerProviderButtons
        providersOverride={serverProviders.providers}
        onSelect={handleSocialSignIn}
        loadingId={isSocialLoading}
        disabled={isCheckingEmail || !oauthProtocolRegistered}
        protocolUnavailableTitle={
          !oauthProtocolRegistered ? t("auth.social.protocolUnavailable") : undefined
        }
      />

      {!oauthProtocolRegistered && (
        <p className="text-xs text-muted-foreground/80 leading-tight text-center">
          {t("auth.social.protocolUnavailable")}
        </p>
      )}

      {authView === "local-and-sso" && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-xs font-medium text-muted-foreground/40 uppercase tracking-widest px-1">
              {t("auth.common.or")}
            </span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEmailContinue();
            }}
            className="space-y-2"
          >
            {ALLOW_CUSTOM_HOST_ENABLED && (
              <ServerUrlField
                onValidated={() => setServerUrlValidated(true)}
                onInvalidated={() => setServerUrlValidated(false)}
                disabled={isSocialLoading !== null || isCheckingEmail}
              />
            )}
            <Input
              type="email"
              placeholder={t("auth.emailStep.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 text-sm"
              required
              disabled={
                isSocialLoading !== null ||
                isCheckingEmail ||
                (ALLOW_CUSTOM_HOST_ENABLED && !serverUrlValidated)
              }
            />
            <Button
              type="submit"
              variant="outline"
              disabled={
                !email.trim() ||
                isSocialLoading !== null ||
                isCheckingEmail ||
                (ALLOW_CUSTOM_HOST_ENABLED && !serverUrlValidated)
              }
              className="w-full h-9"
            >
              {isCheckingEmail ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <span className="text-sm font-medium">{t("auth.emailStep.continueWithEmail")}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </form>

          {error && (
            <div className="px-3 py-2 rounded-md bg-destructive/5 border border-destructive/20 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <div className="pt-1">
            <button
              type="button"
              onClick={onContinueWithoutAccount}
              className="w-full text-center text-xs text-muted-foreground/85 hover:text-foreground transition-colors py-1.5 rounded hover:bg-muted/30"
              disabled={isSocialLoading !== null || isCheckingEmail}
            >
              {t("auth.emailStep.continueWithoutAccount")}
            </button>
          </div>

          <p className="text-xs text-muted-foreground/80 leading-tight text-center">
            {t("auth.legal.prefix")}{" "}
            <a
              href="https://openwhispr.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link underline decoration-link/30 hover:decoration-link/60 transition-colors"
            >
              {t("auth.legal.terms")}
            </a>{" "}
            {t("auth.legal.and")}{" "}
            <a
              href="https://openwhispr.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link underline decoration-link/30 hover:decoration-link/60 transition-colors"
            >
              {t("auth.legal.privacy")}
            </a>
            {t("auth.legal.suffix")}
          </p>
        </>
      )}

      {authView === "no-methods" && (
        <p className="text-xs text-muted-foreground text-center">
          {t("auth.noSignInMethods")}
        </p>
      )}
    </div>
  );
}
