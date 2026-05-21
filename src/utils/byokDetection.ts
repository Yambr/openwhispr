import { useSettingsStore } from "../stores/settingsStore";
import { PROVIDER_LOCKDOWN_ENABLED } from "../config/defaults";

export const hasStoredByokKey = () => {
  // Phase 10 PLD-05: under provider lockdown the corporate build carries no
  // BYOK key-storage path — the IPC channels and key-input UI are DCE'd.
  // This literal-const-foldable early return lets Rolldown drop the
  // settings-store key reads below from the corporate bundle.
  if (PROVIDER_LOCKDOWN_ENABLED) return false;
  const s = useSettingsStore.getState();
  return !!(s.openaiApiKey || s.groqApiKey || s.mistralApiKey || s.customTranscriptionApiKey);
};
