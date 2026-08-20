// ============================================================================
// ZONO navigation — the SINGLE source of truth for the app's launcher groups.
// Consumed by BOTH the desktop Sidebar and the mobile drawer, so there is never
// a second hardcoded menu. Presentation/data only; every href is an existing route.
// ============================================================================
export type Accent = "purple" | "blue" | "green" | "amber" | "slate";
export interface NavItem { label: string; href: string; icon: string }
export interface NavGroup { key: string; title: string; desc: string; icon: string; accent: Accent; items: NavItem[] }

/** Subtle per-group accents — icon tile + active states. */
export const ACCENTS: Record<Accent, { iconBg: string; ring: string; activeItem: string }> = {
  purple: { iconBg: "bg-brand-soft text-brand-strong", ring: "border-brand-light", activeItem: "bg-brand-soft text-brand-strong" },
  blue:   { iconBg: "bg-sky-50 text-sky-600",          ring: "border-sky-200",     activeItem: "bg-sky-50 text-sky-700" },
  green:  { iconBg: "bg-emerald-50 text-emerald-600",  ring: "border-emerald-200", activeItem: "bg-emerald-50 text-emerald-700" },
  amber:  { iconBg: "bg-amber-50 text-amber-600",      ring: "border-amber-200",   activeItem: "bg-amber-50 text-amber-700" },
  slate:  { iconBg: "bg-slate-100 text-slate-600",     ring: "border-slate-300",   activeItem: "bg-slate-100 text-slate-700" },
};

export const NAV_GROUPS: NavGroup[] = [
  { key: "command", title: "היום שלי ומרכז הבקרה", desc: "מה לעשות עכשיו • מה קורה בעסק", icon: "Sun", accent: "purple", items: [
    { label: "היום שלי", href: "/", icon: "Sun" },
    { label: "מרכז הבקרה", href: "/control-center", icon: "LayoutGrid" },
    { label: "היום · מרכז יומי", href: "/today", icon: "CalendarClock" },
    { label: "מוח הברוקר", href: "/brain", icon: "Sparkles" },
    { label: "מרכז בקרה", href: "/mission-control", icon: "Target" },
    { label: "מרכז הפעולות", href: "/action-center", icon: "Flame" },
  ]},
  { key: "office", title: "המשרד שלי", desc: "אנשים • נכסים • הצעות • עסקאות", icon: "Building2", accent: "blue", items: [
    { label: "אנשים", href: "/people", icon: "Users" },
    { label: "נכסים", href: "/properties", icon: "Building" },
    { label: "קונים", href: "/buyers", icon: "Users" },
    { label: "מוכרים", href: "/sellers", icon: "UserCheck" },
    { label: "לידים", href: "/leads", icon: "UserPlus" },
    { label: "הצעות", href: "/offers", icon: "Send" },
    { label: "עסקאות", href: "/deals", icon: "Handshake" },
    { label: "עמלות וגבייה", href: "/commissions", icon: "TrendingDown" },
    { label: "מסמכים", href: "/documents", icon: "FileText" },
    { label: "הערות", href: "/notes", icon: "FilePlus2" },
    { label: "צפיות", href: "/viewings", icon: "Calendar" },
    { label: "פגישות", href: "/calendar", icon: "Calendar" },
  ]},
  { key: "marketing", title: "תקשורת ושיווק", desc: "WhatsApp • Facebook • קמפיינים", icon: "Megaphone", accent: "green", items: [
    { label: "WhatsApp", href: "/whatsapp", icon: "MessageCircle" },
    { label: "פרסומים להיום", href: "/distribution/daily", icon: "Sun" },
    { label: "קמפיינים", href: "/distribution/campaign-wizard", icon: "Target" },
    { label: "קבוצות פייסבוק", href: "/distribution/groups", icon: "Users" },
    { label: "Facebook", href: "/facebook", icon: "Send" },
    { label: "מרכז שיווק", href: "/marketing", icon: "BarChart3" },
    { label: "סטודיו יצירה", href: "/creative-studio", icon: "Presentation" },
    { label: "בקרת פרסום (מתקדם)", href: "/publishing-control", icon: "Shield" },
    { label: "מודיעין קבוצות", href: "/distribution/groups/intelligence", icon: "BarChart3" },
  ]},
  { key: "intelligence", title: "מודיעין עסקי", desc: "מנהלים • מתווכים • טריטוריה", icon: "BarChart3", accent: "amber", items: [
    { label: "מרכז מנהלים", href: "/executive", icon: "BarChart3" },
    { label: "מודיעין מתווכים", href: "/broker-intelligence", icon: "Users" },
    { label: "מודיעין משרדים", href: "/brokerage-data/offices", icon: "Building2" },
    { label: "מודיעין שוק", href: "/market-intelligence/listings", icon: "Globe" },
    { label: "ניהול טריטוריה", href: "/territory", icon: "Map" },
    { label: "תחזיות", href: "/predictions", icon: "TrendingUp" },
    { label: "גרף ידע", href: "/graph", icon: "Layers" },
    { label: "מודיעין זירה", href: "/marketplace", icon: "Globe" },
    { label: "מפת חום שוק", href: "/market-intelligence/map", icon: "MapPin" },
  ]},
  { key: "sites", title: "אתרים ופורטלים", desc: "אתרי משרד/סוכן • דפי נחיתה • פורטלים", icon: "Globe", accent: "blue", items: [
    { label: "אתר משרד", href: "/office-website", icon: "Building2" },
    { label: "אתר סוכן", href: "/agent-website", icon: "UserCheck" },
    { label: "אתרי נכסים", href: "/property-sites", icon: "Home" },
    { label: "אתרים ודפי נחיתה", href: "/website", icon: "LayoutGrid" },
    { label: "פורטלים (קונה/מוכר)", href: "/portals", icon: "Users" },
  ]},
  { key: "ops", title: "אוטומציה ותפעול", desc: "אוטומציה • תהליכים • עוזר קולי", icon: "Route", accent: "green", items: [
    { label: "מרכז אוטומציה", href: "/automation", icon: "Route" },
    { label: "תהליכי עבודה", href: "/workflow-builder", icon: "ListChecks" },
    { label: "מסעות לקוח", href: "/journeys", icon: "Activity" },
    { label: "עוזר קולי", href: "/voice", icon: "Mic" },
    { label: "למידה עצמית", href: "/learning", icon: "Sparkles" },
  ]},
  { key: "system", title: "ניהול מערכת", desc: "האזור האישי • צוות • חיבורים • הגדרות", icon: "Settings", accent: "slate", items: [
    { label: "האזור האישי", href: "/my-profile", icon: "UserCircle" },
    { label: "צוות וסוכנים", href: "/team", icon: "UserCheck" },
    { label: "חיבורים", href: "/settings/distribution-connections", icon: "Send" },
    { label: "מסמכים", href: "/documents", icon: "FileText" },
    { label: "דאטה משרדי תיווך", href: "/brokerage-data", icon: "Database" },
    { label: "הגדרות", href: "/settings", icon: "Settings" },
  ]},
];
