"use client";

import { useEffect, useState, type CSSProperties } from "react";
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
  // Phase 26.7.1 — clear access to the three workspaces + intelligence surfaces:
  "my-properties": "/my-properties", "office-inventory": "/office-inventory",
  "market-dashboard": "/market-intelligence/dashboard", "broker-dashboard": "/broker-intelligence/dashboard",
  "office-dashboard": "/office-intelligence/dashboard", "intelligence-explorer": "/intelligence-explorer",
  "live-market-map": "/market-intelligence/map", "action-center": "/action-center",
  "mission-control": "/mission-control",
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

/**
 * V1 navigation tiers (Phase 12 freeze). Routes/features are NOT removed — only
 * navigation visibility changes:
 *   - "v1"       → shown in Standard mode (the brokerage core, learnable in a day)
 *   - "advanced" → shown only in Advanced mode (power/intelligence surfaces)
 *   - "hidden"   → not shown in the sidebar at all (still reachable by direct URL)
 */
type NavTier = "v1" | "advanced" | "hidden";
interface NavLink { id: string; label: string; icon: string; tier: NavTier }
interface NavGroup { key: string; label: string; icon: string; managerOnly?: boolean; items: NavLink[] }

/** Logical navigation architecture — 7 collapsible categories, tiered for V1. */
const NAV_GROUPS: NavGroup[] = [
  { key: "main", label: "ראשי", icon: "Home", items: [
    { id: "home", label: "דף הבית", icon: "Home", tier: "v1" },
    { id: "action-center", label: "מרכז הפעולות", icon: "Flame", tier: "v1" },
    { id: "mission-control", label: "בקרת AI", icon: "Sparkles", tier: "v1" },
    { id: "notifications", label: "התראות", icon: "Bell", tier: "v1" },
    { id: "ai-office", label: "מוח המשרד", icon: "Sparkles", tier: "advanced" },
    { id: "command", label: "מרכז פיקוד", icon: "Flame", tier: "advanced" },
  ]},
  { key: "crm", label: "CRM", icon: "Users", items: [
    { id: "my-properties", label: "הנכסים שלי", icon: "Building", tier: "v1" },
    { id: "office-inventory", label: "מלאי המשרד", icon: "Building2", tier: "v1" },
    { id: "buyers", label: "קונים", icon: "Users", tier: "v1" },
    { id: "sellers", label: "מוכרים", icon: "UserCheck", tier: "v1" },
    { id: "deals", label: "עסקאות", icon: "Handshake", tier: "v1" },
    { id: "communication", label: "תקשורת", icon: "MessageCircle", tier: "advanced" },
    { id: "journeys", label: "מסעות", icon: "Route", tier: "advanced" },
  ]},
  { key: "intel", label: "מודיעין", icon: "BarChart3", items: [
    { id: "market-dashboard", label: "מודיעין שוק", icon: "Map", tier: "v1" },
    { id: "intelligence-explorer", label: "חיפוש מודיעין", icon: "Search", tier: "v1" },
    { id: "live-market-map", label: "מפת שוק חיה", icon: "MapPin", tier: "v1" },
    { id: "broker-dashboard", label: "מודיעין סוכנים", icon: "Users", tier: "v1" },
    { id: "office-dashboard", label: "מודיעין משרדים", icon: "Building2", tier: "v1" },
    { id: "recommendations", label: "המלצות", icon: "Sparkles", tier: "v1" },
    { id: "matches", label: "התאמות", icon: "Sparkles", tier: "v1" },
    { id: "forecast", label: "תחזית", icon: "TrendingUp", tier: "advanced" },
    { id: "revenue", label: "הכנסות", icon: "BarChart3", tier: "advanced" },
    { id: "territories", label: "טריטוריות", icon: "Map", tier: "advanced" },
    { id: "transactions", label: "שוק ועסקאות", icon: "Landmark", tier: "advanced" },
    { id: "competitors", label: "מתחרים", icon: "BarChart3", tier: "advanced" },
    { id: "acquisition", label: "גיוס נכסים", icon: "Building", tier: "advanced" },
    { id: "graph", label: "קשרים עסקיים", icon: "Sparkles", tier: "hidden" },
  ]},
  { key: "marketing", label: "שיווק", icon: "Megaphone", items: [
    { id: "creative-studio", label: "ZONO קריאייטיב", icon: "Presentation", tier: "v1" },
    { id: "marketing", label: "מודיעין שיווק", icon: "Megaphone", tier: "v1" },
    { id: "creative-dna", label: "Creative DNA", icon: "Fingerprint", tier: "advanced" },
    { id: "distribution", label: "הפצה יומית", icon: "Send", tier: "advanced" },
    { id: "distribution-connections", label: "חיבורי הפצה", icon: "Send", tier: "advanced" },
    { id: "social-leads", label: "לידים חברתיים", icon: "MessageCircle", tier: "advanced" },
    { id: "communities", label: "קהילות", icon: "Users", tier: "hidden" },
    { id: "whatsapp", label: "WhatsApp", icon: "MessageCircle", tier: "hidden" },
  ]},
  { key: "digital", label: "לקוחות ודיגיטל", icon: "Globe", items: [
    { id: "documents", label: "מסמכים", icon: "FileText", tier: "v1" },
    { id: "portals", label: "פורטלים", icon: "Send", tier: "advanced" },
    { id: "office-website", label: "אתר משרד", icon: "Building2", tier: "advanced" },
    { id: "agent-website", label: "אתר סוכן", icon: "UserCheck", tier: "advanced" },
    { id: "legal-templates", label: "מסמכים משפטיים", icon: "FileCheck2", tier: "advanced" },
    { id: "financing", label: "משכנתא", icon: "Calculator", tier: "advanced" },
  ]},
  { key: "office", label: "ניהול משרד", icon: "Briefcase", managerOnly: true, items: [
    { id: "team", label: "צוות וסוכנים", icon: "UserCheck", tier: "v1" },
    { id: "agents", label: "ניהול סוכנים", icon: "UserPlus", tier: "advanced" },
    { id: "routing", label: "ניתוב לידים", icon: "Route", tier: "advanced" },
    { id: "reputation", label: "מוניטין", icon: "Handshake", tier: "advanced" },
    { id: "automation", label: "אוטומציות", icon: "Route", tier: "advanced" },
  ]},
  { key: "system", label: "מערכת", icon: "Settings", managerOnly: true, items: [
    { id: "settings", label: "הגדרות", icon: "Settings", tier: "v1" },
    { id: "operating-areas", label: "אזורי פעילות", icon: "MapPin", tier: "advanced" },
    { id: "system-health", label: "בריאות מערכת", icon: "Settings", tier: "hidden" },
    { id: "data-quality", label: "איכות דאטה", icon: "Shield", tier: "hidden" },
    { id: "product-qa", label: "דוח QA", icon: "ListChecks", tier: "hidden" },
    { id: "permissions", label: "הרשאות", icon: "Lock", tier: "hidden" },
    { id: "configuration", label: "תצורה", icon: "Settings", tier: "hidden" },
  ]},
];

/** Standard-mode flat order — the 12 V1 surfaces a brokerage learns in one day. */
const V1_FLAT_ORDER = [
  "home", "action-center",
  "my-properties", "office-inventory", "buyers", "sellers", "deals", "matches",
  "market-dashboard", "intelligence-explorer", "live-market-map", "broker-dashboard", "office-dashboard",
  "creative-studio", "marketing", "recommendations", "team", "documents", "settings",
];

const MANAGER_ROLES = new Set(["owner", "manager", "branch_manager", "admin"]);
const NAV_MODE_KEY = "zono-nav-mode";
type NavMode = "standard" | "advanced";

/** Flat lookup of every nav item by id (for Standard-mode flat rendering). */
const ITEM_BY_ID = new Map(NAV_GROUPS.flatMap((g) => g.items.map((it) => [it.id, it] as const)));

/**
 * Slim white RTL sidebar with a V1 navigation experience (Phase 12).
 *
 * Standard mode (default): a flat, ~12-item list of the brokerage core — no
 * category headers, learnable in a day. Advanced mode (opt-in toggle): the full
 * grouped, role-aware navigation minus "hidden" items. No routes/features are
 * removed; "hidden" items remain reachable by direct URL. Mode persists in
 * localStorage.
 */
export function Sidebar() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const isManager = !user?.roleKey || MANAGER_ROLES.has(user.roleKey);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<NavMode>("standard");

  // Restore the saved mode after mount (deferred so the first paint matches SSR
  // = "standard", avoiding a hydration mismatch and cascading-render warnings).
  useEffect(() => {
    queueMicrotask(() => {
      const saved = window.localStorage.getItem(NAV_MODE_KEY);
      if (saved === "advanced" || saved === "standard") setMode(saved);
    });
  }, []);

  const setModePersisted = (m: NavMode) => {
    setMode(m);
    try { window.localStorage.setItem(NAV_MODE_KEY, m); } catch { /* storage unavailable */ }
  };

  const isActive = (href: string | undefined) =>
    !href ? false : href === "/" ? pathname === "/" : pathname.startsWith(href);

  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const renderItem = (item: NavLink) => {
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
  };

  // Standard mode: flat V1 list (managers see all V1 items; agents see non-manager-only ones).
  const v1ManagerOnlyGroups = new Set(NAV_GROUPS.filter((g) => g.managerOnly).map((g) => g.key));
  const idIsManagerOnly = (id: string) =>
    NAV_GROUPS.some((g) => g.managerOnly && g.items.some((it) => it.id === id));
  void v1ManagerOnlyGroups;
  const standardItems = V1_FLAT_ORDER
    .map((id) => ITEM_BY_ID.get(id))
    .filter((it): it is NavLink => !!it && it.tier === "v1" && (isManager || !idIsManagerOnly(it.id)));

  // Advanced mode: grouped, role-aware, hidden items removed, empty groups dropped.
  const advancedGroups = NAV_GROUPS
    .filter((g) => !g.managerOnly || isManager)
    .map((g) => ({ ...g, items: g.items.filter((it) => it.tier !== "hidden") }))
    .filter((g) => g.items.length > 0);

  return (
    // --chatbot-safe-space: reserved bottom area so the floating chatbot + any
    // bottom-floating buttons never cover the nav. The nav scrolls internally and
    // the last item / mode toggle always stop above the chatbot. RTL-safe; the
    // sidebar itself never makes the page scroll (it stays h-screen).
    <aside
      style={{ "--chatbot-safe-space": "140px" } as CSSProperties}
      className="bg-card/80 border-line sticky top-0 hidden h-screen w-[92px] shrink-0 flex-col items-center border-s pt-6 pb-[var(--chatbot-safe-space)] backdrop-blur-xl lg:flex"
    >
      <Link href="/" aria-label="ZONO" className="mb-3 grid h-11 w-11 place-items-center rounded-2xl">
        <ZonoLogo width={44} height={44} className="!h-11 !w-11 object-contain" />
      </Link>

      {/* ZONO Command — full-screen navigation operating system (⌘K) */}
      <ZonoCommandButton />
      <span className="text-muted mb-3 text-[8px] font-extrabold tracking-wide">COMMAND</span>

      <nav className="flex min-h-0 flex-1 flex-col items-stretch gap-1 overflow-y-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {mode === "standard" ? (
          <div className="flex flex-col items-center gap-1">
            {standardItems.map(renderItem)}
          </div>
        ) : (
          advancedGroups.map((g) => {
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
                {open && <div className="flex flex-col items-center gap-1 pb-1">{g.items.map(renderItem)}</div>}
              </div>
            );
          })
        )}
      </nav>

      {/* Standard ↔ Advanced mode toggle */}
      <button
        type="button"
        onClick={() => setModePersisted(mode === "standard" ? "advanced" : "standard")}
        title={mode === "standard" ? "מצב מתקדם — כל המודולים" : "מצב סטנדרטי — ליבת המערכת"}
        className="text-muted hover:text-ink mt-3 flex w-[68px] flex-col items-center gap-1 rounded-2xl px-2 py-2 transition-all hover:bg-surface"
      >
        <span className="grid h-8 w-8 place-items-center rounded-xl">
          <Icon name={mode === "standard" ? "Sparkles" : "Home"} size={18} strokeWidth={1.75} />
        </span>
        <span className="text-center text-[10px] font-semibold leading-tight">
          {mode === "standard" ? "מתקדם" : "סטנדרטי"}
        </span>
      </button>
    </aside>
  );
}
