"use client";
// Customer 360 tab navigation (P5.2). Tabs are hidden when the operator lacks
// the section capability (UX only — every tab page re-guards server-side). The
// tab-model capability MUST match each page's authorizePlatform() guard.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";

export interface C360Tab { key: string; label: string; sub: string; cap: string; icon: string }

export const CUSTOMER360_TABS: C360Tab[] = [
  { key: "overview", label: "סקירה", sub: "", cap: "platform.customers.read", icon: "LayoutGrid" },
  { key: "users", label: "משתמשים", sub: "/users", cap: "platform.users.read", icon: "Users" },
  { key: "usage", label: "שימוש", sub: "/usage", cap: "platform.usage.read", icon: "Activity" },
  { key: "distribution", label: "שיווק והפצה", sub: "/distribution", cap: "platform.usage.read", icon: "Megaphone" },
  { key: "integrations", label: "אינטגרציות", sub: "/integrations", cap: "platform.integrations.read", icon: "Globe" },
  { key: "activity", label: "פעילות", sub: "/activity", cap: "platform.audit.read", icon: "ScrollText" },
  { key: "access", label: "גישה", sub: "/access", cap: "platform.customers.read", icon: "ShieldCheck" },
  { key: "operations", label: "תפעול", sub: "/operations", cap: "platform.ops.read", icon: "Route" },
  { key: "billing", label: "חיוב", sub: "/billing", cap: "platform.billing.read", icon: "Banknote" },
  { key: "support", label: "תמיכה", sub: "/support", cap: "platform.support.read", icon: "Handshake" },
];

export function Customer360Tabs({ orgId, caps }: { orgId: string; caps: string[] }) {
  const pathname = usePathname();
  const base = `/platform/customers/${orgId}`;
  return (
    <div className="border-line -mx-1 mb-5 flex gap-1 overflow-x-auto border-b pb-px no-scrollbar">
      {CUSTOMER360_TABS.filter((t) => caps.includes(t.cap)).map((t) => {
        const href = base + t.sub;
        const active = t.sub === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-[13px] font-bold transition-colors",
              active ? "border-brand text-brand-strong" : "text-muted hover:text-ink border-transparent",
            )}
          >
            <Icon name={t.icon} size={15} />{t.label}
          </Link>
        );
      })}
    </div>
  );
}
