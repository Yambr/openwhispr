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
