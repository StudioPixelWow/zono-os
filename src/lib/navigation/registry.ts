/**
 * Navigation Registry — the single source of truth for every ZONO module/page:
 * route, icon, category, minimum role, sidebar + search visibility. Powers the
 * Module Directory (/search/modules) and the global command palette. Pure data,
 * client-safe (no server imports).
 */
export interface ModuleEntry {
  id: string;
  label: string;
  route: string;
  icon: string;
  category: string;
  roleMin: "viewer" | "agent" | "manager" | "owner";
  sidebar: boolean;
  searchable: boolean;
  description?: string;
}

export const MODULE_CATEGORIES = ["ראשי", "מכירות", "מודיעין", "שוק ועסקאות", "צמיחה", "ניהול"] as const;

export const MODULES: ModuleEntry[] = [
  // ── ראשי ──
  { id: "home", label: "בית", route: "/", icon: "Home", category: "ראשי", roleMin: "viewer", sidebar: true, searchable: true, description: "דשבורד ראשי" },
  { id: "command", label: "מרכז פיקוד", route: "/command", icon: "Flame", category: "ראשי", roleMin: "agent", sidebar: true, searchable: true, description: "מרכז ההחלטות הניהולי" },

  // ── מכירות ──
  { id: "properties", label: "נכסים", route: "/properties", icon: "Building", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "buyers", label: "קונים", route: "/buyers", icon: "Users", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "sellers", label: "מוכרים", route: "/sellers", icon: "Handshake", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "matches", label: "התאמות", route: "/matches", icon: "Sparkles", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "valuation", label: "הערכת שווי", route: "/valuation", icon: "Calculator", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true, description: "מנוע תמחור נכסים — ZONO Price Intelligence" },
  { id: "deals", label: "עסקאות", route: "/deals", icon: "Handshake", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true },

  // ── מודיעין ──
  { id: "forecast", label: "תחזית", route: "/forecast", icon: "TrendingUp", category: "מודיעין", roleMin: "agent", sidebar: true, searchable: true },
  { id: "revenue", label: "הכנסות", route: "/revenue", icon: "BarChart3", category: "מודיעין", roleMin: "manager", sidebar: true, searchable: true },
  { id: "routing", label: "ניתוב לידים", route: "/routing", icon: "Route", category: "מודיעין", roleMin: "manager", sidebar: true, searchable: true },
  { id: "team", label: "מודיעין צוות", route: "/team", icon: "UserCheck", category: "מודיעין", roleMin: "manager", sidebar: true, searchable: true },
  { id: "graph", label: "קשרים עסקיים", route: "/graph", icon: "Sparkles", category: "מודיעין", roleMin: "agent", sidebar: true, searchable: true },
  { id: "acquisition", label: "גיוס מלאי", route: "/acquisition", icon: "Building2", category: "מודיעין", roleMin: "agent", sidebar: true, searchable: true },
  { id: "demand", label: "ביקוש קונים", route: "/demand", icon: "Flame", category: "מודיעין", roleMin: "agent", sidebar: true, searchable: true, description: "מודיעין ביקוש — מה חסר במלאי והזדמנויות גיוס" },

  // ── שוק ועסקאות ──
  { id: "market", label: "מודיעין שוק", route: "/market", icon: "Map", category: "שוק ועסקאות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "transactions", label: "עסקאות שוק", route: "/transactions", icon: "Building2", category: "שוק ועסקאות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "transactions-streets", label: "רחובות", route: "/transactions/streets", icon: "Route", category: "שוק ועסקאות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "transactions-radar", label: "רדאר הזדמנויות", route: "/transactions/radar", icon: "Flame", category: "שוק ועסקאות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "transactions-coverage", label: "כיסוי דאטה", route: "/transactions/coverage", icon: "MapPin", category: "שוק ועסקאות", roleMin: "agent", sidebar: false, searchable: true },
  { id: "competitors", label: "מתחרים", route: "/competitors", icon: "Shield", category: "שוק ועסקאות", roleMin: "manager", sidebar: true, searchable: true },
  { id: "broker-intelligence", label: "מודיעין מתווכים", route: "/broker-intelligence", icon: "Users", category: "שוק ועסקאות", roleMin: "manager", sidebar: false, searchable: true },

  // ── צמיחה ──
  { id: "marketing", label: "שיווק", route: "/marketing", icon: "Megaphone", category: "צמיחה", roleMin: "agent", sidebar: true, searchable: true },
  { id: "distribution", label: "הפצה", route: "/distribution", icon: "Send", category: "צמיחה", roleMin: "agent", sidebar: true, searchable: true },
  { id: "distribution-daily", label: "הפצה יומית", route: "/distribution/daily", icon: "Send", category: "צמיחה", roleMin: "agent", sidebar: false, searchable: true },
  { id: "distribution-groups", label: "קבוצות פייסבוק", route: "/distribution/groups", icon: "Users", category: "צמיחה", roleMin: "agent", sidebar: true, searchable: true, description: "מנוע הפצה לקבוצות — רישום, ביצועים וייחוס לידים" },
  { id: "social-leads", label: "לידים מרשתות", route: "/social-leads", icon: "MessageCircle", category: "צמיחה", roleMin: "agent", sidebar: true, searchable: true },

  // ── ניהול ──
  { id: "operating-areas", label: "אזורי פעילות", route: "/settings/operating-areas", icon: "MapPin", category: "ניהול", roleMin: "agent", sidebar: true, searchable: true, description: "ניהול ערי ושכונות הפעילות" },
  { id: "system-health", label: "מנועי חישוב", route: "/admin/system-health", icon: "Settings", category: "ניהול", roleMin: "manager", sidebar: true, searchable: true, description: "מרכז חישוב — סטטוס ורענון מנועים" },
  { id: "data-quality", label: "איכות דאטה", route: "/admin/data-quality", icon: "Shield", category: "ניהול", roleMin: "manager", sidebar: true, searchable: true, description: "זיהוי דאטה שבורה" },
  { id: "modules", label: "מדריך מודולים", route: "/search/modules", icon: "Search", category: "ניהול", roleMin: "viewer", sidebar: false, searchable: true, description: "כל המודולים במערכת" },
];

const RANK: Record<ModuleEntry["roleMin"], number> = { viewer: 20, agent: 40, manager: 60, owner: 100 };

/** Modules a given role rank may access. */
export function modulesForRole(rank: number): ModuleEntry[] {
  return MODULES.filter((m) => rank >= RANK[m.roleMin]);
}

/** Searchable modules matching a free-text query (label/description/route). */
export function searchModules(query: string, rank = 100): ModuleEntry[] {
  const q = query.trim().toLowerCase();
  return modulesForRole(rank).filter((m) => m.searchable && (!q
    || m.label.toLowerCase().includes(q)
    || (m.description ?? "").toLowerCase().includes(q)
    || m.route.toLowerCase().includes(q)
    || m.id.includes(q)));
}
