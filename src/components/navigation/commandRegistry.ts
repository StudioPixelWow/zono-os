// ============================================================================
// ZONO — Command Registry (single source of truth for the Global Command Center).
// Powers: search, quick actions, favorites, system map. No duplicate nav arrays
// elsewhere. Items reference real routes; routes that don't exist yet are marked
// `disabled` (shown as "בקרוב") or `beta`. Icon values are Icon-registry keys.
// ============================================================================

export type CommandType = "page" | "action" | "entity" | "ai";

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  href?: string;
  action?: string;           // window-event name for non-navigation commands
  icon: string;              // Icon registry key
  category: string;          // Hebrew group label (for search grouping)
  group?: string;            // system-map group key
  keywords?: string[];
  type: CommandType;
  favorite?: boolean;
  beta?: boolean;
  disabled?: boolean;        // route not built yet → "בקרוב"
}

export interface SystemGroup { key: string; title: string; icon: string; items: CommandItem[] }

// ── Quick actions (create-first) ─────────────────────────────────────────────
export const QUICK_ACTIONS: CommandItem[] = [
  { id: "qa-property", label: "נכס חדש", href: "/properties/new", icon: "Building", category: "פעולות", type: "action", keywords: ["נכס", "property", "add"] },
  { id: "qa-buyer", label: "קונה חדש", href: "/buyers/new", icon: "UserPlus", category: "פעולות", type: "action", keywords: ["קונה", "buyer", "lead"] },
  { id: "qa-seller", label: "מוכר חדש", href: "/sellers/new", icon: "Handshake", category: "פעולות", type: "action", keywords: ["מוכר", "seller"] },
  { id: "qa-lead", label: "ליד חדש", icon: "MessageCircle", category: "פעולות", type: "action", disabled: true, keywords: ["ליד", "lead"] },
  { id: "qa-deal", label: "עסקה חדשה", icon: "Briefcase", category: "פעולות", type: "action", disabled: true, keywords: ["עסקה", "deal"] },
  { id: "qa-meeting", label: "פגישה חדשה", icon: "Calendar", category: "פעולות", type: "action", disabled: true, keywords: ["פגישה", "meeting"] },
  { id: "qa-task", label: "משימה חדשה", icon: "ListChecks", category: "פעולות", type: "action", disabled: true, keywords: ["משימה", "task"] },
  { id: "qa-valuation", label: "הערכת שווי", href: "/valuation/new", icon: "Calculator", category: "פעולות", type: "action", keywords: ["שווי", "valuation", "הערכה"] },
  { id: "qa-campaign", label: "קמפיין חדש", href: "/creative/new", icon: "Megaphone", category: "פעולות", type: "action", keywords: ["קמפיין", "campaign", "פרסום"] },
  { id: "qa-import", label: "ייבוא נתונים", href: "/property-radar", icon: "Download", category: "פעולות", type: "action", keywords: ["ייבוא", "import", "סנכרון", "yad2", "madlan"] },
];

// ── System map (workflow-based, not database-based) ──────────────────────────
export const SYSTEM_MAP: SystemGroup[] = [
  {
    key: "home", title: "בית ושליטה", icon: "Home", items: [
      { id: "home", label: "דף הבית", description: "מרכז העבודה היומי", href: "/", icon: "Home", category: "עמודים", group: "home", type: "page" },
      { id: "command", label: "AI Command Center", description: "מרכז ההחלטות הניהולי", href: "/command", icon: "Flame", category: "עמודים", group: "home", type: "page", keywords: ["פיקוד", "decision"] },
      { id: "today", label: "מוקד היום", description: "Daily OS — מה דורש טיפול עכשיו", href: "/today", icon: "Target", category: "עמודים", group: "home", type: "page", keywords: ["daily os", "היום"] },
      { id: "my", label: "שולחן העבודה שלי", description: "Broker Workspace", href: "/my", icon: "Users", category: "עמודים", group: "home", type: "page", keywords: ["workspace", "broker"] },
      { id: "executive", label: "מוח ניהולי", description: "Executive Intelligence OS", href: "/executive", icon: "Sparkles", category: "עמודים", group: "home", type: "page", keywords: ["executive", "ceo", "ציון ארגון"] },
      { id: "notifications", label: "התראות", href: "/notifications", icon: "Bell", category: "עמודים", group: "home", type: "page" },
      { id: "calendar", label: "יומן", description: "Calendar OS — סדר יום, מסלול, פגישות", href: "/calendar", icon: "Calendar", category: "עמודים", group: "home", type: "page", keywords: ["calendar", "לוח שנה"] },
    ],
  },
  {
    key: "crm", title: "CRM ואנשים", icon: "Users", items: [
      { id: "buyers", label: "קונים", description: "ניהול קונים והתאמות", href: "/buyers", icon: "Users", category: "לקוחות", group: "crm", type: "page", keywords: ["לקוחות", "buyer"] },
      { id: "sellers", label: "מוכרים", href: "/sellers", icon: "Handshake", category: "לקוחות", group: "crm", type: "page", keywords: ["seller"] },
      { id: "leads", label: "לידים", href: "/social-leads", icon: "MessageCircle", category: "לקוחות", group: "crm", type: "page", keywords: ["lead", "פניות"] },
      { id: "contacts", label: "אנשי קשר", icon: "UserCheck", category: "לקוחות", group: "crm", type: "page", disabled: true },
      { id: "journeys", label: "מסעות לקוח", href: "/journeys", icon: "Route", category: "לקוחות", group: "crm", type: "page", keywords: ["journey"] },
    ],
  },
  {
    key: "properties", title: "נכסים ושוק", icon: "Building", items: [
      { id: "properties", label: "נכסים", href: "/properties", icon: "Building", category: "נכסים", group: "properties", type: "page", keywords: ["מלאי", "property"] },
      { id: "property-new", label: "נכס חדש", href: "/properties/new", icon: "FilePlus2", category: "נכסים", group: "properties", type: "page" },
      { id: "valuation", label: "הערכת שווי", href: "/valuation", icon: "Calculator", category: "נכסים", group: "properties", type: "page" },
      { id: "matches", label: "התאמות קונים", href: "/matches", icon: "Target", category: "נכסים", group: "properties", type: "page", keywords: ["matching"] },
      { id: "heatmap", label: "מפת חום", description: "מפת הנכסים החיה", href: "/", icon: "Map", category: "נכסים", group: "properties", type: "page", keywords: ["heatmap", "מפה"] },
      { id: "market", label: "Market Intelligence", href: "/market", icon: "BarChart3", category: "נכסים", group: "properties", type: "page", keywords: ["מודיעין שוק"] },
      { id: "transactions", label: "עסקאות שוק", href: "/transactions", icon: "Banknote", category: "נכסים", group: "properties", type: "page" },
      { id: "areas", label: "שכונות ואזורים", href: "/settings/operating-areas", icon: "MapPin", category: "נכסים", group: "properties", type: "page", keywords: ["אזור התמחות"] },
      { id: "radar", label: "ייבוא נכסים", description: "רדאר נכסים חי", href: "/property-radar", icon: "Download", category: "נכסים", group: "properties", type: "page", keywords: ["yad2", "madlan", "סנכרון"] },
    ],
  },
  {
    key: "deals", title: "עסקאות וניהול", icon: "Briefcase", items: [
      { id: "deals", label: "עסקאות", href: "/deals", icon: "Briefcase", category: "עסקאות", group: "deals", type: "page" },
      { id: "pipeline", label: "Pipeline", href: "/forecast", icon: "TrendingUp", category: "עסקאות", group: "deals", type: "page", keywords: ["פייפליין", "תחזית"] },
      { id: "tasks", label: "משימות", icon: "ListChecks", category: "עסקאות", group: "deals", type: "page", disabled: true },
      { id: "meetings", label: "פגישות", icon: "Calendar", category: "עסקאות", group: "deals", type: "page", disabled: true },
      { id: "activity", label: "פעילות", href: "/communication", icon: "Activity", category: "עסקאות", group: "deals", type: "page" },
      { id: "documents", label: "מסמכים", href: "/documents", icon: "FileText", category: "עסקאות", group: "deals", type: "page" },
      { id: "signatures", label: "חתימות", href: "/documents", icon: "FileCheck2", category: "עסקאות", group: "deals", type: "page", keywords: ["signature"] },
    ],
  },
  {
    key: "marketing", title: "שיווק והפצה", icon: "Megaphone", items: [
      { id: "whatsapp", label: "WhatsApp", href: "/whatsapp", icon: "MessageCircle", category: "עמודים", group: "marketing", type: "page" },
      { id: "fb-groups", label: "Facebook Groups", href: "/distribution/groups", icon: "Users", category: "עמודים", group: "marketing", type: "page", keywords: ["קבוצות"] },
      { id: "campaigns", label: "קמפיינים", href: "/marketing", icon: "Megaphone", category: "עמודים", group: "marketing", type: "page" },
      { id: "office-site", label: "דפי נחיתה", href: "/office-website", icon: "Globe", category: "עמודים", group: "marketing", type: "page", keywords: ["landing"] },
      { id: "agent-site", label: "אתרי נכס", href: "/agent-website", icon: "Globe", category: "עמודים", group: "marketing", type: "page" },
      { id: "templates", label: "תבניות הודעה", icon: "FileText", category: "עמודים", group: "marketing", type: "page", disabled: true },
      { id: "distribution", label: "הפצה אוטומטית", href: "/distribution", icon: "Send", category: "עמודים", group: "marketing", type: "page" },
    ],
  },
  {
    key: "ai", title: "AI ואוטומציות", icon: "Sparkles", items: [
      { id: "ai-insights", label: "AI Insights", href: "/ai-office", icon: "Sparkles", category: "AI", group: "ai", type: "ai" },
      { id: "opportunity-radar", label: "Opportunity Radar", href: "/command", icon: "Activity", category: "AI", group: "ai", type: "ai", keywords: ["הזדמנויות"] },
      { id: "recommendations", label: "Recommendations", href: "/recommendations", icon: "Sparkles", category: "AI", group: "ai", type: "ai", keywords: ["המלצות"] },
      { id: "agents", label: "Agents", icon: "Users", category: "AI", group: "ai", type: "ai", beta: true },
      { id: "automations", label: "Automations", href: "/automation", icon: "Layers", category: "AI", group: "ai", type: "ai", keywords: ["אוטומציה"] },
      { id: "smart-matching", label: "Smart Matching", href: "/matches", icon: "Target", category: "AI", group: "ai", type: "ai" },
      { id: "predictions", label: "Market Predictions", href: "/forecast", icon: "TrendingUp", category: "AI", group: "ai", type: "ai", keywords: ["תחזיות"] },
    ],
  },
  {
    key: "analytics", title: "אנליטיקה ודוחות", icon: "BarChart3", items: [
      { id: "reports", label: "דוחות", href: "/executive-intelligence", icon: "ScrollText", category: "עמודים", group: "analytics", type: "page" },
      { id: "performance", label: "ביצועים", href: "/office-intelligence", icon: "BarChart3", category: "עמודים", group: "analytics", type: "page" },
      { id: "goals", label: "יעדים", href: "/office-intelligence", icon: "Target", category: "עמודים", group: "analytics", type: "page" },
      { id: "conversions", label: "המרות", href: "/executive-intelligence", icon: "Percent", category: "עמודים", group: "analytics", type: "page" },
      { id: "revenue", label: "הכנסות", href: "/revenue", icon: "Wallet", category: "עמודים", group: "analytics", type: "page" },
      { id: "team", label: "פעילות צוות", href: "/team", icon: "Users", category: "עמודים", group: "analytics", type: "page" },
    ],
  },
  {
    key: "system", title: "מערכת והגדרות", icon: "Settings", items: [
      { id: "settings", label: "הגדרות", href: "/settings", icon: "Settings", category: "עמודים", group: "system", type: "page" },
      { id: "permissions", label: "משתמשים והרשאות", href: "/admin/permissions", icon: "ShieldCheck", category: "עמודים", group: "system", type: "page" },
      { id: "integrations", label: "אינטגרציות", href: "/settings/distribution-connections", icon: "Layers", category: "עמודים", group: "system", type: "page" },
      { id: "import-export", label: "ייבוא/ייצוא", href: "/admin/configuration", icon: "Download", category: "עמודים", group: "system", type: "page" },
      { id: "billing", label: "Billing", href: "/settings/plan", icon: "Tag", category: "עמודים", group: "system", type: "page", keywords: ["חבילה", "חיוב"] },
      { id: "security", label: "אבטחה", href: "/system-health", icon: "Lock", category: "עמודים", group: "system", type: "page" },
    ],
  },
];

// ── Default favorites (until per-user persistence exists) ─────────────────────
export const DEFAULT_FAVORITE_IDS = ["properties", "matches", "valuation", "heatmap", "market", "command", "deals", "whatsapp"];

// ── AI suggestions (deterministic placeholders; never fake numbers) ───────────
export interface AiSuggestion { id: string; title: string; detail: string; href: string; cta: string; priority: "high" | "medium" | "info"; icon: string }
export const AI_SUGGESTIONS: AiSuggestion[] = [
  { id: "match-new", title: "יש קונים שעשויים להתאים לנכס חדש", detail: "בדיקת התאמות מתבצעת מול מאגר הקונים הפעיל שלך.", href: "/matches", cta: "פתיחת התאמות", priority: "high", icon: "Target" },
  { id: "unanswered-leads", title: "לידים שלא קיבלו מענה", detail: "סקירת פניות פתוחות שממתינות לטיפול.", href: "/social-leads", cta: "מעבר ללידים", priority: "high", icon: "MessageCircle" },
  { id: "publish-week", title: "נכסים שכדאי לפרסם השבוע", detail: "המלצות פרסום מבוססות מלאי ושוק.", href: "/marketing", cta: "מרכז שיווק", priority: "medium", icon: "Megaphone" },
  { id: "area-opps", title: "הזדמנויות חדשות באזור ההתמחות שלך", detail: "רדאר נכסים סורק את האזורים הפעילים שלך.", href: "/property-radar", cta: "פתיחת הרדאר", priority: "medium", icon: "Activity" },
];

// ── Flatten + search ─────────────────────────────────────────────────────────
export const ALL_COMMANDS: CommandItem[] = [...QUICK_ACTIONS, ...SYSTEM_MAP.flatMap((g) => g.items)];

const norm = (s: string) => s.toLowerCase().trim();

/** Client-side fuzzy-ish filter over the registry by label/keywords/category. */
export function searchCommands(query: string, limit = 24): CommandItem[] {
  const q = norm(query);
  if (!q) return [];
  const scored = ALL_COMMANDS
    .map((c) => {
      const hay = `${c.label} ${c.description ?? ""} ${c.category} ${(c.keywords ?? []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return null;
      // Rank: label prefix > label includes > keyword/other.
      const label = c.label.toLowerCase();
      const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2;
      return { c, score };
    })
    .filter((x): x is { c: CommandItem; score: number } => x !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
  // De-dupe by id (quick actions + pages can overlap).
  const seen = new Set<string>();
  return scored.map((s) => s.c).filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

export function commandById(id: string): CommandItem | undefined {
  return ALL_COMMANDS.find((c) => c.id === id);
}
export function favoriteItems(ids: string[]): CommandItem[] {
  return ids.map(commandById).filter((c): c is CommandItem => !!c);
}
