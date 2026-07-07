"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

// Real bottom-nav destinations (existing routes). "עוד" opens the ⌘K command
// palette so every other surface stays one tap away — no dead buttons.
const ITEMS: { id: string; label: string; icon: string; href: string }[] = [
  { id: "home", label: "בית", icon: "Home", href: "/" },
  { id: "today", label: "היום", icon: "Sun", href: "/today" },
  { id: "properties", label: "נכסים", icon: "Building", href: "/properties" },
  { id: "whatsapp", label: "וואטסאפ", icon: "MessageCircle", href: "/whatsapp" },
];

const openSearch = () => { try { window.dispatchEvent(new CustomEvent("zono:open-search")); } catch { /* ignore */ } };

/** Bottom navigation shown on mobile in place of the sidebar. */
export function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const cls = (active: boolean) =>
    cn("flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors", active ? "text-brand" : "text-muted");

  return (
    <nav dir="rtl" className="bg-card/90 border-line fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link key={item.id} href={item.href} prefetch={false} className={cls(active)}>
            <Icon name={item.icon} size={22} strokeWidth={active ? 2.2 : 1.75} />
            <span className="text-[10px] font-semibold">{item.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={openSearch} className={cls(false)} aria-label="חיפוש ותפריט">
        <Icon name="Menu" size={22} strokeWidth={1.75} />
        <span className="text-[10px] font-semibold">עוד</span>
      </button>
    </nav>
  );
}
