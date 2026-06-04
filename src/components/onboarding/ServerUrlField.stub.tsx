// Build-flag stub (quick-260604-eij WR-01) — used when ALLOW_CUSTOM_HOST is
// false at build time (the corporate-minimal / upstream-parity default).
//
// vite.config.mjs aliases ./onboarding/ServerUrlField to this file so the real
// field — its HTTPS-only + private-range/IMDS SSRF screening, its reachability
// probe, and the bundle-grepped literals the field id/testid and i18n keys
// carry — is fully dropped from the renderer bundle. This is the same
// stub-alias DCE mechanism BILLING/STREAMING use; a bare `&&` JSX gate alone is
// insufficient because the field has two static consumers (onboarding
// AuthenticationStep + always-loaded SettingsPage/SettingsModal chunk), so the
// module edge would otherwise be retained. See
// scripts/verify-allow-custom-host.js scenario 2 (expects the field ABSENT).
//
// IMPORTANT: this file MUST NOT contain the grepped literals verbatim (the
// data-testid string or the `onboarding.serverUrl.*` i18n keys) — the
// bundle-grep gate would hit the stub's own source otherwise.

import React from "react";

export interface ServerUrlFieldProps {
  onValidated?: (url: string) => void;
  onInvalidated?: () => void;
  disabled?: boolean;
}

// Renders nothing. In a default build the custom-host feature is off, so the
// onboarding/Settings mounts that reference this component never produce UI.
export function ServerUrlField(_props: ServerUrlFieldProps): React.ReactElement | null {
  return null;
}
