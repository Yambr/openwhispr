// Phase 04.1 PLAN-03 (CFG-09 BILLING_ENABLED): Stripe-touching IPC bridge.
//
// This file is the SOLE renderer-side carrier of the literal symbols
// `cloudCheckout`, `cloudBillingPortal`, `cloudSwitchPlan`, `cloudPreviewSwitch`.
// All consumers must reach this hook only via a `{BILLING_ENABLED && <Sub />}`
// JSX gate so Rolldown can drop the entire transitive subgraph under DCE when
// the build flag is false. See scripts/verify-feature-gating.js for the
// bundle-grep gate that enforces this.
//
// `useUsage` (../hooks/useUsage.ts) does NOT import this file — keeping the
// always-imported usage hook free of Stripe literals is the load-bearing
// invariant for tree-shaking.
import { useState, useCallback, useRef } from "react";

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

export function useBillingActions(opts?: {
  onAfterSwitch?: () => Promise<void> | void;
  onCheckoutPending?: () => void;
}): BillingActions {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const checkoutInFlightRef = useRef(false);

  const openCheckout = useCallback(
    async (
      params?: { plan?: "monthly" | "annual"; tier?: "pro" | "business" }
    ): Promise<{ success: boolean; error?: string }> => {
      if (checkoutInFlightRef.current)
        return { success: false, error: "Checkout already in progress" };
      if (!window.electronAPI?.cloudCheckout || !window.electronAPI?.openExternal) {
        return { success: false, error: "App not ready" };
      }
      checkoutInFlightRef.current = true;
      setCheckoutLoading(true);
      try {
        const result = await window.electronAPI.cloudCheckout(params);
        if (result.success && result.url) {
          opts?.onCheckoutPending?.();
          await window.electronAPI.openExternal(result.url);
          return { success: true };
        }
        return { success: false, error: result.error || "Failed to start checkout" };
      } finally {
        checkoutInFlightRef.current = false;
        setCheckoutLoading(false);
      }
    },
    [opts]
  );

  const openBillingPortal = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (checkoutInFlightRef.current) return { success: false, error: "Already loading" };
    if (!window.electronAPI?.cloudBillingPortal || !window.electronAPI?.openExternal) {
      return { success: false, error: "App not ready" };
    }
    checkoutInFlightRef.current = true;
    setCheckoutLoading(true);
    try {
      const result = await window.electronAPI.cloudBillingPortal();
      if (result.success && result.url) {
        opts?.onCheckoutPending?.();
        await window.electronAPI.openExternal(result.url);
        return { success: true };
      }
      return { success: false, error: result.error || "Failed to open billing portal" };
    } finally {
      checkoutInFlightRef.current = false;
      setCheckoutLoading(false);
    }
  }, [opts]);

  const switchPlan = useCallback(
    async (params: {
      plan: "monthly" | "annual";
      tier: "pro" | "business";
    }): Promise<{ success: boolean; alreadyOnPlan?: boolean; error?: string }> => {
      if (checkoutInFlightRef.current) return { success: false, error: "Already loading" };
      if (!window.electronAPI?.cloudSwitchPlan) {
        return { success: false, error: "App not ready" };
      }
      checkoutInFlightRef.current = true;
      setCheckoutLoading(true);
      try {
        const result = await window.electronAPI.cloudSwitchPlan(params);
        if (result.success) {
          await opts?.onAfterSwitch?.();
        }
        return result;
      } finally {
        checkoutInFlightRef.current = false;
        setCheckoutLoading(false);
      }
    },
    [opts]
  );

  const previewSwitchPlan = useCallback(
    async (params: { plan: "monthly" | "annual"; tier: "pro" | "business" }) => {
      if (!window.electronAPI?.cloudPreviewSwitch) {
        return { success: false as const, error: "App not ready" };
      }
      return window.electronAPI.cloudPreviewSwitch(params);
    },
    []
  );

  return {
    checkoutLoading,
    openCheckout,
    openBillingPortal,
    switchPlan,
    previewSwitchPlan,
  };
}
