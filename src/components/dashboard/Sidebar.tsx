"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";
import { useCurrentUser } from "./DashboardDataProvider";
import { ZonoCommandButton } from "@/components/navigation/zono-command-center";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

/** Routes wired so far. Items without a route stay visual-only for now. */
const HREFS: Record<string, string> = {
  home: "/", "ai-office": "/ai-office", command: "/command", map: "/market",
  properties: "/properties", buyers: "/buyers", sellers: "/sellers", matches: "/matches",
  deals: "/deals", transactions: "/transactions", forecast: "/forecast", revenue: "/revenue",
  acquisition: "/acquisition", competitors: "/competitors", marketing: "/marketing",
  distribution: "/distribution", communities: "/communities", whatsapp: "/whatsapp",
  communication: "/communication", journeys: "/journeys", "creative-studio": "/creative-studio",
  "social-leads": "/social-leads", routing: "/routing", team: "/team", graph: "/graph",
  recommendations: "/recommendations", territories: "/territories", portals: "/portals",
  documents: "/documents", financing: "/financing", reputation: "/reputation", automation: "/automation",
  "office-website": "/office-website", "agent-website": "/agent-website",
  "operating-areas": "/settings/operating-areas", notifications: "/notifications",
  "system-health": "/admin/system-health", "data-quality": "/admin/data-quality",
  permissions: "/admin/permissions", configuration: "/admin/configuration",
  "mock-registry": "/admin/mock-registry", "audit-log": "/admin/audit-log",
  "product-qa": "/admin/product-qa", agents: "/admin/agents", settings: "/settings",
  "creative-dna": "/creative-dna", "legal-templates": "/legal-templates",
  "distribution-connections": "/settings/distribution-connections",
};

interface NavLink { id: string; label: string; icon: string }
interface NavGroup { key: string; label: string; icon: string; managerOnly?: boolean; items: NavLink[] }

/** Logical navigation architecture — 7 collapsible categories. */
const NAV_GROUPS: NavGroup[] = [
  { key: "main", label: "ראשי", icon: "Home", items: [
    { id: "home", label: "דף הבית", icon: "Home" },
    { id: "ai-office", label: "מוח המשרד", icon: "Sparkles" },
    { id: "command", label: "מרכז פיקוד", icon: "Flame" },
    { id: "notifications", label: "התראות", icon: "Bell" },
  ]},
  { key: "crm", label: "CRM", icon: "Users", items: [
    { id: "properties", label: "נכסים", icon: "Building2" },
    { id: "buyers", label: "קונים", icon: "Users" },
    { id: "sellers", label: "מוכרים", icon: "UserCheck" },
    { id: "deals", label: "עסקאות", icon: "Handshake" },
    { id: "communication", label: "תקשורת", icon: "MessageCircle" },
    { id: "journeys", label: "מסעות", icon: "Route" },
  ]},
  { key: "intel", label: "מודיעין", icon: "BarChart3", items: [
    { id: "recommendations", label: "המלצות", icon: "Sparkles" },
    { id: "matches", label: "התאמות", icon: "Sparkles" },
    { id: "forecast", label: "תחזית", icon: "TrendingUp" },
    { id: "revenue", label: "הכנסות", icon: "BarChart3" },
    { id: "territories", label: "טריטוריות", icon: "Map" },
    { id: "transactions", label: "שוק ועסקאות", icon: "Landmark" },
    { id: "competitors", label: "מתחרים", icon: "BarChart3" },
    { id: "acquisition", label: "גיוס נכסים", icon: "Building" },
    { id: "graph", label: "קשרים עסקיים", icon: "Sparkles" },
    { id: "map", label: "מפה חכמה", icon: "Map" },
  ]},
  { key: "marketing", label: "שיווק", icon: "Megaphone", items: [
    { id: "marketing", label: "מודיעין שיווק", icon: "Megaphone" },
    { id: "creative-studio", label: "ZONO קריאייטיב", icon: "Presentation" },
    { id: "creative-dna", label: "Creative DNA", icon: "Fingerprint" },
    { id: "communities", label: "קהילות", icon: "Users" },
    { id: "distribution", label: "הפצה יומית", icon: "Send" },
    { id: "distribution-connections", label: "חיבורי הפצה", icon: "Send" },
    { id: "social-leads", label: "לידים חברתיים", icon: "MessageCircle" },
    { id: "whatsapp", label: "WhatsApp", icon: "MessageCircle" },
  ]},
  { key: "digital", label: "לקוחות ודיגיטל", icon: "Globe", items: [
    { id: "portals", label: "פורטלים", icon: "Send" },
    { id: "office-website", label: "אתר משרד", icon: "Building2" },
    { id: "agent-website", label: "אתר סוכן", icon: "UserCheck" },
    { id: "documents", label: "מסמכים", icon: "FileText" },
    { id: "legal-templates", label: "מסמכים משפטיים", icon: "FileCheck2" },
    { id: "financing", label: "משכנתא", icon: "Calculator" },
  ]},
  { key: "office", label: "ניהול משרד", icon: "Briefcase", managerOnly: true, items: [
    { id: "agents", label: "ניהול סוכנים", icon: "UserPlus" },
    { id: "team", label: "צוות וסוכנים", icon: "UserCheck" },
    { id: "routing", label: "ניתוב לידים", icon: "Route" },
    { id: "reputation", label: "מוניטין", icon: "Handshake" },
    { id: "automation", label: "אוטומציות", icon: "Route" },
  ]},
  { key: "system", label: "מערכת", icon: "Settings", managerOnly: true, items: [
    { id: "settings", label: "הגדרות", icon: "Settings" },
    { id: "operating-areas", label: "אזורי פעילות", icon: "MapPin" },
    { id: "system-health", label: "בריאות מערכת", icon: "Settings" },
    { id: "data-quality", label: "איכות דאטה", icon: "Shield" },
    { id: "product-qa", label: "דוח QA", icon: "ListChecks" },
    { id: "permissions", label: "הרשאות", icon: "Lock" },
    { id: "configuration", label: "תצורה", icon: "Settings" },
  ]},
];

const MANAGER_ROLES = new Set(["owner", "manager", "branch_manager", "admin"]);

/**
 * Slim white RTL sidebar — now organized into 7 collapsible categories with
 * role-based visibility (management/system groups are manager-only). Active
 * item gets the purple treatment, derived from the current path.
 */
export function Sidebar() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const isManager = !user?.roleKey || MANAGER_ROLES.has(user.roleKey);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isActive = (href: string | undefined) =>
    !href ? false : href === "/" ? pathname === "/" : pathname.startsWith(href);

  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const groups = NAV_GROUPS.filter((g) => !g.managerOnly || isManager);

  return (
    <aside className="bg-card/80 border-line sticky top-0 hidden h-screen w-[92px] shrink-0 flex-col items-center border-s py-6 backdrop-blur-xl lg:flex">
      <Link href="/" aria-label="ZONO" className="mb-3 grid h-11 w-11 place-items-center rounded-2xl">
        <ZonoLogo width={44} height={44} className="!h-11 !w-11 object-contain" />
      </Link>

      {/* ZONO Command — full-screen navigation operating system (⌘K) */}
      <ZonoCommandButton />
      <span className="text-muted mb-3 text-[8px] font-extrabold tracking-wide">COMMAND</span>

      <nav className="flex min-h-0 flex-1 flex-col items-stretch gap-1 overflow-y-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((g) => {
          const open = !collapsed[g.key];
          const hasActiveChild = g.items.some((it) => isActive(HREFS[it.id]));
          return (
            <div key={g.key} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className={cn(
                  "flex items-center justify-between gap-1 rounded-lg px-2 py-1 transition",
                  hasActiveChild ? "text-brand-strong" : "text-muted hover:text-ink",
                )}
                title={g.label}
              >
                <span className="text-[9px] font-extrabold tracking-wide">{g.label}</span>
                <Icon name={open ? "ChevronUp" : "ChevronDown"} size={11} />
              </button>
              {open && (
                <div className="flex flex-col items-center gap-1 pb-1">
                  {g.items.map((item) => {
                    const href = HREFS[item.id];
                    const active = isActive(href);
                    const className = cn(
                      "group relative flex w-[68px] flex-col items-center gap-1 rounded-2xl px-2 py-2 transition-all",
                      active ? "zono-active-nav" : "text-muted hover:bg-surface hover:text-ink",
                    );
                    const inner = (
                      <>
                        {active && <span className="zono-gradient absolute -end-[8px] top-1/2 h-6 w-1 -translate-y-1/2 rounded-full" />}
                        <span className={cn("grid h-8 w-8 place-items-center rounded-xl transition-all", active && "zono-active-nav-icon")}>
                          <Icon name={item.icon} size={18} strokeWidth={active ? 2.1 : 1.75} />
                        </span>
                        <span className="text-center text-[10px] font-semibold leading-tight">{item.label}</span>
                      </>
                    );
                    return href ? (
                      <Link key={item.id} href={href} title={item.label} className={className}>{inner}</Link>
                    ) : (
                      <button key={item.id} type="button" title={item.label} className={className}>{inner}</button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
