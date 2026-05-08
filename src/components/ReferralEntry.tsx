import React from "react";
import ReferralModal from "./ReferralModal";

// Phase 04.1 PLAN-04 (CFG-09 REFERRALS_ENABLED): the import to ReferralModal
// lives in this dedicated sub-component file so that, when the parent gates
// the mount with `{REFERRALS_ENABLED && <ReferralEntry ... />}` and Rolldown
// propagates the literal `false` across the named-re-export boundary, the
// import edge to this file is pruned (and with it the static import to
// ReferralModal — which carries the referral IPC literals
// `getReferralStats` / `sendReferralInvite` / `getReferralInvites`). Mirrors
// the canonical PLAN-02 pattern (GoogleCalendarSection) for sub-component-
// split tree-shaking. We deliberately do NOT use React.lazy() here because
// Vite/Rolldown emits a standalone chunk for every dynamic import expression
// it parses regardless of whether the containing module is reachable — only
// a static import gets cleanly tree-shaken when the consumer is dead.

export interface ReferralEntryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReferralEntry({ open, onOpenChange }: ReferralEntryProps) {
  if (!open) return null;
  return <ReferralModal open={open} onOpenChange={onOpenChange} />;
}
