// Phase 04.1 CFG-07: Google Calendar UI + IPC call sites are isolated into a
// dedicated module so Rolldown DCE can fully eliminate this file's contents
// (including the `gcalStartOAuth`, `gcalDisconnect`, `onGcalConnectionChanged`
// string literals) from the renderer bundle when OAUTH_GOOGLE_ENABLED is the
// literal `false`.
//
// Mounted by IntegrationsView as
// `{OAUTH_GOOGLE_ENABLED && <GoogleCalendarSection ... />}`. When the gate
// is the literal `false`, Rolldown drops the JSX subtree, sees no remaining
// references to the imported `GoogleCalendarSection` symbol, and prunes the
// import edge — leaving this entire file out of the IntegrationsView chunk.

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Mail, Plus, Unlink } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { SettingsPanel, SettingsPanelRow } from "./ui/SettingsSection";
import { ConfirmDialog } from "./ui/dialog";
import { useSettingsStore } from "../stores/settingsStore";
import googleCalendarIcon from "../assets/icons/google-calendar.svg";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2 pl-1">
      {children}
    </div>
  );
}

interface GoogleCalendarSectionProps {
  needsSystemAudioGrant: boolean;
  requestSystemAudioAccess: () => Promise<boolean>;
  onShowPermissionDialog: () => void;
}

export default function GoogleCalendarSection({
  needsSystemAudioGrant,
  requestSystemAudioAccess,
  onShowPermissionDialog,
}: GoogleCalendarSectionProps) {
  const { t } = useTranslation();
  const { gcalAccounts, setGcalAccounts } = useSettingsStore();
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingEmail, setDisconnectingEmail] = useState<string | null>(null);
  const [confirmDisconnectEmail, setConfirmDisconnectEmail] = useState<string | null>(null);
  const hasAccounts = gcalAccounts.length > 0;

  const startOAuth = useCallback(async () => {
    setIsConnecting(true);
    try {
      const result = await window.electronAPI?.gcalStartOAuth?.();
      if (result?.success && result.email) {
        const current = useSettingsStore.getState().gcalAccounts;
        setGcalAccounts([
          ...current.filter((a) => a.email !== result.email),
          { email: result.email },
        ]);
      }
    } catch (err) {
      // CR-02: surface OAuth failures instead of silently swallowing them.
      // The IPC handler can throw if the OAuth flow is cancelled, the
      // renderer-side window closes, or the network call fails.
      console.error("[GoogleCalendarSection] OAuth failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [setGcalAccounts]);

  const handleConnect = useCallback(async () => {
    if (needsSystemAudioGrant) {
      const granted = await requestSystemAudioAccess();
      if (!granted) {
        onShowPermissionDialog();
        return;
      }
    }
    await startOAuth();
  }, [needsSystemAudioGrant, requestSystemAudioAccess, onShowPermissionDialog, startOAuth]);

  const handleDisconnect = useCallback(
    async (email: string) => {
      setDisconnectingEmail(email);
      try {
        // CR-03: gate UI removal on a non-failure response. If the IPC handler
        // resolves with `{ success: false }` (soft failure), keep the account
        // in the UI so it doesn't visually disappear while still connected
        // server-side. The `onGcalConnectionChanged` listener will resync if
        // the server later removes it.
        const result = await window.electronAPI?.gcalDisconnect?.(email);
        if (result?.success !== false) {
          const current = useSettingsStore.getState().gcalAccounts;
          setGcalAccounts(current.filter((a) => a.email !== email));
        }
      } catch (err) {
        // CR-02 mirror: surface disconnect failures instead of swallowing.
        console.error("[GoogleCalendarSection] Disconnect failed:", err);
      } finally {
        setDisconnectingEmail(null);
      }
    },
    [setGcalAccounts]
  );

  useEffect(() => {
    const unsub = window.electronAPI?.onGcalConnectionChanged?.(
      (data: {
        accounts?: Array<{ email: string }>;
        connected?: boolean;
        email?: string | null;
      }) => {
        if (data.accounts) {
          setGcalAccounts(data.accounts);
        } else if (data.connected && data.email) {
          const current = useSettingsStore.getState().gcalAccounts;
          setGcalAccounts([
            ...current.filter((a) => a.email !== data.email),
            { email: data.email },
          ]);
        }
      }
    );
    return () => unsub?.();
  }, [setGcalAccounts]);

  return (
    <div>
      <SectionLabel>{t("integrations.sections.calendar")}</SectionLabel>
      <SettingsPanel>
        <SettingsPanelRow>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white dark:bg-surface-raised shadow-[0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-none dark:border dark:border-white/5 flex items-center justify-center shrink-0">
              <img src={googleCalendarIcon} alt="" className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-foreground">
                  {t("integrations.googleCalendar.title")}
                </p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                  {t("integrations.googleCalendar.optional")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
                {t("integrations.googleCalendar.description")}
              </p>
            </div>
            {!hasAccounts && (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={isConnecting}
                className="shrink-0"
              >
                {isConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t("integrations.googleCalendar.connect")
                )}
              </Button>
            )}
            {hasAccounts && (
              <Badge variant="success" className="shrink-0">
                {t("integrations.googleCalendar.connected")}
              </Badge>
            )}
          </div>
        </SettingsPanelRow>

        {hasAccounts &&
          gcalAccounts.map((account) => (
            <SettingsPanelRow key={account.email}>
              <div className="group flex items-center gap-3 pl-12">
                <Mail className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {account.email}
                </span>
                <button
                  onClick={() => setConfirmDisconnectEmail(account.email)}
                  disabled={disconnectingEmail === account.email}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50"
                  aria-label={t("integrations.googleCalendar.disconnect")}
                >
                  {disconnectingEmail === account.email ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unlink className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </SettingsPanelRow>
          ))}

        {hasAccounts && (
          <SettingsPanelRow>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex items-center gap-2 pl-12 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {t("integrations.googleCalendar.addAnother")}
            </button>
          </SettingsPanelRow>
        )}
      </SettingsPanel>

      <ConfirmDialog
        open={!!confirmDisconnectEmail}
        onOpenChange={(open) => {
          if (!open) setConfirmDisconnectEmail(null);
        }}
        title={t("integrations.googleCalendar.disconnectConfirm", {
          email: confirmDisconnectEmail,
        })}
        description={t("integrations.googleCalendar.disconnectDescription")}
        confirmText={t("integrations.googleCalendar.disconnect")}
        variant="destructive"
        onConfirm={() => {
          if (confirmDisconnectEmail) handleDisconnect(confirmDisconnectEmail);
        }}
      />
    </div>
  );
}
