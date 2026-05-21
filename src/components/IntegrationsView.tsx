import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, Info } from "lucide-react";
import { Button } from "./ui/button";
import { SettingsPanel, SettingsPanelRow } from "./ui/SettingsSection";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useSettingsStore } from "../stores/settingsStore";
import { useSystemAudioPermission } from "../hooks/useSystemAudioPermission";
import { canManageSystemAudioInApp } from "../utils/systemAudioAccess";
import ApiKeysSection from "./ApiKeysSection";
import CliIntegrationCard from "./CliIntegrationCard";
import McpIntegrationCard from "./McpIntegrationCard";
import { OAUTH_GOOGLE_ENABLED, PROVIDER_LOCKDOWN_ENABLED } from "../config/defaults";
import GoogleCalendarSection from "./GoogleCalendarSection";

const API_DOCS_URL = "https://docs.openwhispr.com/api/overview";

interface IntegrationsViewProps {
  isPaid: boolean;
  onUpgrade: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 pl-1">
      {children}
    </div>
  );
}

export default function IntegrationsView({ isPaid, onUpgrade }: IntegrationsViewProps) {
  const { t } = useTranslation();
  const { gcalAccounts } = useSettingsStore();
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [apiKeysDialogOpen, setApiKeysDialogOpen] = useState(false);
  const systemAudio = useSystemAudioPermission();
  const { request: requestSystemAudioAccess } = systemAudio;
  const hasAccounts = gcalAccounts.length > 0;
  const needsSystemAudioGrant = !systemAudio.granted && canManageSystemAudioInApp(systemAudio);

  return (
    <div className="max-w-lg mx-auto w-full px-6 py-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("integrations.title")}</h2>
        <p className="text-xs text-muted-foreground/70 mt-0.5">{t("integrations.description")}</p>
      </div>

      {OAUTH_GOOGLE_ENABLED && (
        <GoogleCalendarSection
          needsSystemAudioGrant={needsSystemAudioGrant}
          requestSystemAudioAccess={requestSystemAudioAccess}
          onShowPermissionDialog={() => setShowPermissionDialog(true)}
        />
      )}

      {/* Phase 10 PLD-05: the v1/keys programmatic API-key management
          (ApiKeysSection / ApiKeysService) is removed under PROVIDER_LOCKDOWN.
          The `!PROVIDER_LOCKDOWN_ENABLED` literal lets Rolldown DCE the whole
          subtree — including the ApiKeysSection import — in the corporate build. */}
      {!PROVIDER_LOCKDOWN_ENABLED && (
        <div>
          <SectionLabel>{t("integrations.sections.api")}</SectionLabel>
          <SettingsPanel>
            <SettingsPanelRow>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/5 dark:bg-primary/10 flex items-center justify-center shrink-0">
                  <Code2 className="h-4 w-4 text-primary/80" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {t("integrations.api.title")}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
                    {isPaid
                      ? t("integrations.api.description")
                      : t("integrations.api.proRequired")}
                  </p>
                </div>
                {isPaid ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setApiKeysDialogOpen(true)}
                    className="shrink-0"
                  >
                    {t("integrations.api.manage")}
                  </Button>
                ) : (
                  <Button size="sm" onClick={onUpgrade} className="shrink-0">
                    {t("integrations.api.viewPlans")}
                  </Button>
                )}
              </div>
            </SettingsPanelRow>
          </SettingsPanel>
        </div>
      )}

      <div>
        <SectionLabel>{t("integrations.sections.mcp")}</SectionLabel>
        <McpIntegrationCard isPaid={isPaid} onUpgrade={onUpgrade} />
      </div>

      <div>
        <SectionLabel>{t("integrations.sections.cli")}</SectionLabel>
        <CliIntegrationCard isPaid={isPaid} onUpgrade={onUpgrade} />
      </div>

      {!hasAccounts && (
        <div className="rounded-lg border border-border/40 dark:border-border-subtle/40 bg-muted/20 dark:bg-surface-2/30 p-4 flex items-start gap-3">
          <Info size={15} className="text-primary/60 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground/80">
              {t("integrations.notABot.title")}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-0.5 leading-relaxed">
              {t("integrations.notABot.description")}
            </p>
          </div>
        </div>
      )}

      {!PROVIDER_LOCKDOWN_ENABLED && (
        <Dialog open={apiKeysDialogOpen} onOpenChange={setApiKeysDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("integrations.api.dialogTitle")}</DialogTitle>
              <DialogDescription asChild>
                <span className="text-xs text-muted-foreground/80 leading-relaxed">
                  {t("apiKeysSection.description")}
                  <span className="mx-1.5 text-muted-foreground/30">·</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-primary/80 hover:text-primary transition-colors"
                    onClick={() => window.electronAPI?.openExternal?.(API_DOCS_URL)}
                  >
                    {t("apiKeysSection.docsLink")}
                  </button>
                </span>
              </DialogDescription>
            </DialogHeader>
            <ApiKeysSection />
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={showPermissionDialog}
        onOpenChange={setShowPermissionDialog}
        title={t("integrations.googleCalendar.systemAudioRequired")}
        description={t("integrations.googleCalendar.systemAudioDescription")}
        confirmText={
          systemAudio.mode === "native"
            ? t("integrations.googleCalendar.openSettings")
            : t("onboarding.permissions.grantAccess")
        }
        onConfirm={systemAudio.mode === "native" ? systemAudio.openSettings : systemAudio.request}
      />
    </div>
  );
}
