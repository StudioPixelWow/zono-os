// ============================================================================
// 💳 ZONO OS 2.0 — STAGE 6 · Batch 6.4 · COMMERCIAL & ONBOARDING OS — types.
//
// The self-service commercial funnel: register → pay (Grow) → VERIFIED payment
// → provision → first login. This file is the canonical model. It reuses the
// existing plan/entitlement framework (@/lib/launch) for tiers/limits and the
// existing org/user provisioning primitives — it never duplicates them.
// ============================================================================
import type { PlanTier } from "@/lib/launch/types";

export type { PlanTier };

// ── Subscription lifecycle (Part 4) ─────────────────────────────────────────
export type SubscriptionStatus =
  | "trial" | "pending_payment" | "active" | "suspended" | "cancelled" | "expired" | "grace_period";

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "trial", "pending_payment", "active", "suspended", "cancelled", "expired", "grace_period",
];

export interface Subscription {
  orgId: string;
  planTier: PlanTier;
  status: SubscriptionStatus;
  periodStart: string | null;
  periodEnd: string | null;
  trialEndsAt: string | null;
  graceUntil: string | null;
  growSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
}

// ── Payment lifecycle (Part 2) ──────────────────────────────────────────────
export type PaymentStatus = "pending" | "processing" | "paid" | "failed" | "cancelled" | "expired";

export const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "processing", "paid", "failed", "cancelled", "expired"];

export interface Payment {
  id: string;
  draftId: string | null;
  orgId: string | null;
  provider: string;                 // "grow"
  providerTxnId: string | null;
  planTier: PlanTier;
  amountIls: number;
  currency: string;
  status: PaymentStatus;
  /** TRUE only after server-side signature verification inside the webhook. The
   *  activation gate reads THIS — never a browser redirect. */
  verified: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

// ── License model (Part 5) — a projection over the existing org_plans record ─
export interface License {
  planTier: PlanTier;
  maxUsers: number;                 // -1 = unlimited
  enabledModules: string[];         // entitlement keys
  aiCredits: number;                // -1 = unlimited (monthly AI calls)
  storageMb: number;                // -1 = unlimited
  /** Present so future billing (Grow subscription id) can attach without a new model. */
  billingRef: string | null;
}

// ── Registration draft (Parts 1 + drafts) ───────────────────────────────────
export type DraftStatus = "draft" | "submitted" | "paid" | "expired" | "abandoned";

/** Everything the wizard collects — EXCEPT the password, which is never stored
 *  here (it goes straight to the Supabase auth identity). */
export interface RegistrationData {
  // Step 2 — Company
  officeName?: string;
  companyName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  // Step 3 — Owner (password excluded)
  ownerFullName?: string;
  ownerEmail?: string;
  ownerMobile?: string;
  // Step 4 — Office setup
  agentCount?: number;
  workingAreas?: string[];
  brokerageType?: string;
  preferences?: Record<string, unknown>;
  // Step 5 — Plan
  planTier?: PlanTier;
  // Step 6 — Integrations (shown, never required)
  integrations?: { google?: boolean; facebook?: boolean; whatsapp?: boolean; email?: boolean };
}

export interface RegistrationDraft {
  id: string;
  token: string;
  email: string | null;
  authUserId: string | null;
  orgId: string | null;
  status: DraftStatus;
  currentStep: number;
  planTier: PlanTier | null;
  data: RegistrationData;
  expiresAt: string;
}

/** The six wizard steps (Part 1). */
export const WIZARD_STEPS = [
  { key: "welcome", label: "ברוכים הבאים" },
  { key: "company", label: "פרטי החברה" },
  { key: "owner", label: "פרטי הבעלים" },
  { key: "office", label: "הגדרת המשרד" },
  { key: "plan", label: "בחירת תוכנית" },
  { key: "integrations", label: "אינטגרציות מומלצות" },
] as const;
export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

// ── First-login checklist (Part 3) ──────────────────────────────────────────
export type ChecklistStepKey =
  | "upload_logo" | "invite_agents" | "connect_google" | "connect_whatsapp"
  | "connect_facebook" | "choose_areas" | "first_buyer" | "first_property";

export interface ChecklistStep {
  key: ChecklistStepKey;
  label: string;
  href: string;
  done: boolean;
}
export interface OnboardingChecklist {
  steps: ChecklistStep[];
  completed: number;
  total: number;
  /** Progress percentage 0..100 and the completion score (same basis). */
  percentage: number;
}
