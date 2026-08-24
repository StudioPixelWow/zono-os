"use client";
// ============================================================================
// ZONO — Home quick-actions row (shared). Six large, semantic command tiles that
// jump to the real create/act surfaces (no dead buttons — every href is a live
// route). Extracted from HomeControlCenter so the My-Day home and the Control
// Center render the SAME row. Light card variant, RTL, ZONO design system.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { IconSurface, type Accent } from "@/components/ui/action-surfaces";

const QUICK_ACTIONS: { label: string; icon: string; href: string; accent: Accent; hint: string }[] = [
  { label: "ליד חדש", icon: "UserPlus", href: "/leads", accent: "info", hint: "פנייה נכנסת" },
  { label: "הוסף נכס", icon: "Building2", href: "/properties/new", accent: "brand", hint: "למלאי" },
  { label: "צור התאמה", icon: "GitCompareArrows", href: "/matches", accent: "brand", hint: "קונה↔נכס" },
  { label: "קבע סיור", icon: "CalendarClock", href: "/viewings", accent: "info", hint: "פגישה/סיור" },
  { label: "שלח הודעה", icon: "MessageCircle", href: "/whatsapp", accent: "success", hint: "וואטסאפ" },
  { label: "משימה חדשה", icon: "ListChecks", href: "/action-center", accent: "neutral", hint: "למעקב" },
];

export function HomeQuickActions({ columns = 2 }: { columns?: 2 | 3 | 6 } = {}) {
  const grid = columns === 6
    ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
    : columns === 3
      ? "grid-cols-1 sm:grid-cols-3"
      : "grid-cols-1 sm:grid-cols-2";
  return (
    <div className="bg-card border-line flex h-full flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]" dir="rtl">
      <h2 className="text-ink text-base font-black">פעולות מהירות</h2>
      <div className={`grid flex-1 gap-2.5 ${grid}`}>
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="group border-line bg-card hover:border-transparent flex items-center gap-3 rounded-2xl border p-3.5 text-right shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand,#6d28d9)]/40"
          >
            <IconSurface name={a.icon} tier="l" accent={a.accent} variant="soft" className="transition-transform group-hover:scale-[1.06]" />
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[15px] font-black">{a.label}</span>
              <span className="text-muted block truncate text-[11px]">{a.hint}</span>
            </span>
            <Icon name="ChevronLeft" size={18} strokeWidth={2.2} className="text-muted transition-transform group-hover:-translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
