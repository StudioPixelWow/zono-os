// ============================================================================
// ZONO — Platform Admin navigation model (PURE, client-safe). P5.1.
// The single source of truth for the control-plane nav tree + the capability
// each destination requires. Client nav gates items by capability for UX, but
// this is NEVER the security boundary — every /platform route re-checks its
// capability server-side (see each page's authorizePlatform() call).
// ============================================================================
import type { PlatformCapability } from "@/lib/platform-admin/capabilities";

export interface PlatformNavLeaf {
  label: string;
  href: string;
  icon: string;
  cap: PlatformCapability;
  /** true = a real, implemented screen; false/undefined = "בקרוב" placeholder. */
  ready?: boolean;
}
export interface PlatformNavGroup {
  label: string;
  icon: string;
  children: PlatformNavLeaf[];
}
export type PlatformNavItem = PlatformNavLeaf | PlatformNavGroup;

export function isNavGroup(item: PlatformNavItem): item is PlatformNavGroup {
  return (item as PlatformNavGroup).children !== undefined;
}

export const PLATFORM_NAV: PlatformNavItem[] = [
  { label: "סקירה", href: "/platform", icon: "LayoutGrid", cap: "platform.customers.read", ready: true },
  {
    label: "לקוחות", icon: "Building2", children: [
      { label: "ארגונים", href: "/platform/customers", icon: "Building2", cap: "platform.customers.read", ready: true },
      { label: "משתמשים", href: "/platform/users", icon: "Users", cap: "platform.users.read" },
    ],
  },
  {
    label: "הכנסות", icon: "Banknote", children: [
      { label: "סקירת הכנסות", href: "/platform/revenue", icon: "Banknote", cap: "platform.billing.read", ready: true },
      { label: "מנויים", href: "/platform/revenue/subscriptions", icon: "BadgeCheck", cap: "platform.billing.read", ready: true },
      { label: "תשלומים", href: "/platform/revenue/payments", icon: "Wallet", cap: "platform.billing.read", ready: true },
      { label: "תוכניות", href: "/platform/revenue/plans", icon: "Tag", cap: "platform.billing.read", ready: true },
    ],
  },
  {
    label: "מוצר", icon: "Layers", children: [
      { label: "גישת יכולות", href: "/platform/product/feature-access", icon: "ShieldCheck", cap: "platform.flags.read" },
      { label: "דגלי יכולות", href: "/platform/product/feature-flags", icon: "Flag", cap: "platform.flags.read" },
      { label: "שימוש", href: "/platform/product/usage", icon: "Activity", cap: "platform.usage.read" },
      { label: "עלויות AI", href: "/platform/product/ai-costs", icon: "Sparkles", cap: "platform.ai.read" },
    ],
  },
  {
    label: "תפעול", icon: "Route", children: [
      { label: "סקירת תפעול", href: "/platform/operations", icon: "Activity", cap: "platform.ops.read", ready: true },
      { label: "אינטגרציות", href: "/platform/operations/integrations", icon: "Globe", cap: "platform.integrations.read", ready: true },
      { label: "עבודות ותורים", href: "/platform/operations/jobs", icon: "ListChecks", cap: "platform.ops.read", ready: true },
      { label: "בריאות מערכת", href: "/platform/operations/system-health", icon: "Activity", cap: "platform.ops.read", ready: true },
    ],
  },
  { label: "תמיכה", href: "/platform/support", icon: "Handshake", cap: "platform.support.read", ready: true },
  {
    label: "אבטחה", icon: "Shield", children: [
      { label: "יומן ביקורת", href: "/platform/security/audit-log", icon: "ScrollText", cap: "platform.audit.read", ready: true },
      { label: "היסטוריית מצב תמיכה", href: "/platform/security/impersonation", icon: "ShieldCheck", cap: "platform.support.read", ready: true },
      { label: "מנהלי פלטפורמה", href: "/platform/security/admin-users", icon: "Fingerprint", cap: "platform.admins.read" },
      { label: "הפעלות", href: "/platform/security/sessions", icon: "Lock", cap: "platform.audit.read" },
    ],
  },
  { label: "הגדרות", href: "/platform/settings", icon: "Settings", cap: "platform.customers.read" },
];

/** Flattened leaf list (for the command palette + route/cap coverage checks). */
export const PLATFORM_NAV_LEAVES: PlatformNavLeaf[] = PLATFORM_NAV.flatMap((item) =>
  isNavGroup(item) ? item.children : [item],
);

/** Human labels for platform roles (header + admin surfaces). */
export const PLATFORM_ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  operations: "Operations",
  support: "Support",
  billing_admin: "Billing Admin",
  developer: "Developer",
};
