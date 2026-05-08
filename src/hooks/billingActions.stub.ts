// Phase 04.1 PLAN-03 (CFG-09 BILLING_ENABLED): no-op stub for the Stripe-touching
// IPC bridge. Vite's resolve.alias swaps imports of `./billingActions` to this
// file when the build flag is false (default), keeping the literal symbols
// `cloudCheckout`, `cloudBillingPortal`, `cloudSwitchPlan`, `cloudPreviewSwitch`
// out of the renderer bundle. See src/vite.config.mjs for the alias and
// scripts/verify-feature-gating.js for the bundle-grep gate.
//
// Comments in this file MUST NOT contain those literal method names verbatim
// — the bundle-grep would otherwise hit the comment text. (The
// "openCheckout" / "openBillingPortal" names above are method names, not the
// gated `cloud*` IPC literals, so they're fine.)

interface BillingActions {
  checkoutLoading: boolean;
  openCheckout: (opts?: {
    plan?: "monthly" | "annual";
    tier?: "pro" | "business";
  }) => Promise<{ success: boolean; error?: string }>;
  openBillingPortal: () => Promise<{ success: boolean; error?: string }>;
  switchPlan: (opts: {
    plan: "monthly" | "annual";
    tier: "pro" | "business";
  }) => Promise<{ success: boolean; alreadyOnPlan?: boolean; error?: string }>;
  previewSwitchPlan: (opts: { plan: "monthly" | "annual"; tier: "pro" | "business" }) => Promise<{
    success: boolean;
    immediateAmount?: number;
    currency?: string;
    currentPriceAmount?: number;
    currentInterval?: string;
    newPriceAmount?: number;
    newInterval?: string;
    nextBillingDate?: string;
    alreadyOnPlan?: boolean;
    error?: string;
  }>;
}

const DISABLED_ERROR = "Billing is disabled in this build";

export function useBillingActions(_opts?: {
  onAfterSwitch?: () => Promise<void> | void;
  onCheckoutPending?: () => void;
}): BillingActions {
  return {
    checkoutLoading: false,
    openCheckout: async () => ({ success: false, error: DISABLED_ERROR }),
    openBillingPortal: async () => ({ success: false, error: DISABLED_ERROR }),
    switchPlan: async () => ({ success: false, error: DISABLED_ERROR }),
    previewSwitchPlan: async () => ({ success: false, error: DISABLED_ERROR }),
  };
}
