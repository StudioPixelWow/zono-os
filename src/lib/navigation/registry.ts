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
  roleMin: "viewer" | "agent" | "manager" | "admin" | "owner";
  sidebar: boolean;
  searchable: boolean;
  description?: string;
}

export const MODULE_CATEGORIES = ["ראשי", "מכירות", "מודיעין", "שוק ועסקאות", "צמיחה", "ניהול"] as const;

export const MODULES: ModuleEntry[] = [
  // ── ראשי ──
  { id: "home", label: "בית", route: "/", icon: "Home", category: "ראשי", roleMin: "viewer", sidebar: true, searchable: true, description: "דשבורד ראשי" },
  { id: "command", label: "מרכז פיקוד", route: "/command", icon: "Flame", category: "ראשי", roleMin: "agent", sidebar: true, searchable: true, description: "מרכז ההחלטות הניהולי" },
  { id: "property-radar-live", label: "רדאר נכסים — חי", route: "/property-radar", icon: "Activity", category: "ראשי", roleMin: "agent", sidebar: true, searchable: true, description: "מרכז פיקוד שוק בזמן אמת — נכסים חדשים, ירידות מחיר, עסקאות חמות, התאמות קונים" },

  // ── מכירות ──
  { id: "properties", label: "נכסים", route: "/properties", icon: "Building", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "buyers", label: "קונים", route: "/buyers", icon: "Users", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "sellers", label: "מוכרים", route: "/sellers", icon: "Handshake", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true },
  { id: "exclusive-opportunities", label: "הזדמנויות בלעדיות", route: "/exclusive-opportunities", icon: "Handshake", category: "מכירות", roleMin: "agent", sidebar: true, searchable: true, description: "Seller Intelligence™ — מי הכי קרוב לחתום בלעדיות ואת מי לפנות קודם" },
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
  { id: "competitor-intelligence", label: "מודיעין מתחרים", route: "/competitor-intelligence", icon: "Activity", category: "שוק ועסקאות", roleMin: "agent", sidebar: true, searchable: true, description: "Competitor Intelligence™ — פעילות מתחרים, ירידות מחיר, אזורים מתחממים ונתח שוק מוערך מנתוני מודעות ציבוריים" },
  { id: "competition-radar", label: "רדאר מתחרים", route: "/competition-radar", icon: "Radar", category: "שוק ועסקאות", roleMin: "manager", sidebar: true, searchable: true, description: "רדאר מתחרים™ — מודיעין תחרותי על משרדי תיווך: ציוני איום, שליטה אזורית, אותות שוק, ניתוח SWOT והמלצות פעולה" },
  { id: "broker-intelligence", label: "מודיעין מתווכים", route: "/broker-intelligence", icon: "Users", category: "שוק ועסקאות", roleMin: "manager", sidebar: false, searchable: true },
  { id: "brokerage-data", label: "דאטה משרדי תיווך", route: "/brokerage-data", icon: "Building2", category: "שוק ועסקאות", roleMin: "manager", sidebar: true, searchable: true, description: "דאטה משרדי תיווך™ — שכבת ליבה לאומית של משרדי תיווך וסוכנים, זיהוי זהויות (Broker Identity Resolution) של מודעות חיצוניות, קישורים, קונפליקטים ורענון נתונים" },
  { id: "ai-resolution-center", label: "מרכז אימות AI", route: "/ai-resolution-center", icon: "Sparkles", category: "שוק ועסקאות", roleMin: "manager", sidebar: true, searchable: true, description: "מרכז אימות AI™ — סקירה אנושית של זיהויי משרדים: אישור, דחייה, מיזוג, פיצול ועריכה. כל החלטה משפרת את מנוע המודיעין" },

  // ── צמיחה ──
  { id: "marketing", label: "שיווק", route: "/marketing", icon: "Megaphone", category: "צמיחה", roleMin: "agent", sidebar: true, searchable: true },
  { id: "distribution", label: "הפצה", route: "/distribution", icon: "Send", category: "צמיחה", roleMin: "agent", sidebar: true, searchable: true },
  { id: "distribution-daily", label: "הפצה יומית", route: "/distribution/daily", icon: "Send", category: "צמיחה", roleMin: "agent", sidebar: false, searchable: true },
  { id: "distribution-groups", label: "קבוצות פייסבוק", route: "/distribution/groups", icon: "Users", category: "צמיחה", roleMin: "agent", sidebar: true, searchable: true, description: "מנוע הפצה לקבוצות — רישום, ביצועים וייחוס לידים" },
  { id: "social-leads", label: "לידים מרשתות", route: "/social-leads", icon: "MessageCircle", category: "צמיחה", roleMin: "agent", sidebar: true, searchable: true },

  // ── ניהול ──
  { id: "executive-intelligence", label: "מודיעין מנהלים", route: "/executive-intelligence", icon: "BarChart3", category: "ניהול", roleMin: "manager", sidebar: true, searchable: true, description: "Executive Business Intelligence™ — המוח העסקי: הכנסה צפויה, פייפליין, תחזיות, ROI, בריאות משרד, סיכונים ודוחות" },
  { id: "office-intelligence", label: "מודיעין משרד", route: "/office-intelligence", icon: "Building2", category: "ניהול", roleMin: "manager", sidebar: true, searchable: true, description: "Office Intelligence™ — מערכת ההפעלה הניהולית: KPIs, ביצועי סוכנים, לוח מובילים, סיכונים, צפי ויעדים" },
  { id: "operating-areas", label: "אזורי פעילות", route: "/settings/operating-areas", icon: "MapPin", category: "ניהול", roleMin: "agent", sidebar: true, searchable: true, description: "ניהול ערי ושכונות הפעילות" },
  { id: "journey-automation", label: "אוטומציית מסעות", route: "/journey-automation", icon: "Sparkles", category: "ניהול", roleMin: "manager", sidebar: true, searchable: true, description: "Journey Automation OS™ — תזמור כל המנועים: טריגרים, תנאים, השהיות, SLA, סימולציה וביקורת" },
  { id: "journey-builder", label: "בונה מסעות", route: "/journey-builder", icon: "Sparkles", category: "ניהול", roleMin: "manager", sidebar: false, searchable: true, description: "בונה מסעות ויזואלי (Drag & Drop)" },
  { id: "system-health", label: "מנועי חישוב", route: "/admin/system-health", icon: "Settings", category: "ניהול", roleMin: "manager", sidebar: true, searchable: true, description: "מרכז חישוב — סטטוס ורענון מנועים" },
  { id: "data-quality", label: "איכות דאטה", route: "/admin/data-quality", icon: "Shield", category: "ניהול", roleMin: "manager", sidebar: true, searchable: true, description: "זיהוי דאטה שבורה" },
  { id: "platform-health", label: "מרכז בריאות מערכת", route: "/system-health", icon: "Activity", category: "ניהול", roleMin: "admin", sidebar: true, searchable: true, description: "Enterprise Reliability Platform™ — סטטוס כל רכיבי התשתית (DB, Realtime, Cron, ספקים, תורים, AI, מנועים, אחסון), התראות תפעוליות וזמני תגובה" },
  { id: "platform-admin", label: "ניהול פלטפורמה", route: "/platform-admin", icon: "Settings", category: "ניהול", roleMin: "admin", sidebar: true, searchable: true, description: "כלי תשתית למנהלי מערכת — דגלי תכונה (Feature Flags), השקה הדרגתית ויומן ביקורת מרכזי" },
  { id: "launch-readiness", label: "מוכנות להשקה", route: "/launch-readiness", icon: "Activity", category: "ניהול", roleMin: "admin", sidebar: true, searchable: true, description: "Commercial Launch Platform™ — ציון מוכנות לפרודקשן (תשתית/אבטחה/ביצועים/ניטור/אמינות) ואימות פריסה" },
  { id: "diagnostics", label: "דיאגנוסטיקה", route: "/admin/diagnostics", icon: "Activity", category: "ניהול", roleMin: "admin", sidebar: true, searchable: true, description: "בדיקת תקינות מערכת — סביבה, DB, ספקים, מפות, AI, תורים, אחסון, הרשאות, RLS" },
  { id: "getting-started", label: "תחילת עבודה", route: "/getting-started", icon: "Sparkles", category: "ראשי", roleMin: "agent", sidebar: false, searchable: true, description: "צ׳קליסט הקמה — 8 שלבים מהקמת המשרד ועד הדשבורד הראשון" },
  { id: "help", label: "מרכז עזרה", route: "/help", icon: "HelpCircle", category: "ראשי", roleMin: "viewer", sidebar: false, searchable: true, description: "מאגר ידע, שאלות נפוצות והכוונה" },
  { id: "plan", label: "חבילה ורישוי", route: "/settings/plan", icon: "Tag", category: "ניהול", roleMin: "manager", sidebar: false, searchable: true, description: "חבילות (Starter/Professional/Office/Enterprise), הרשאות פיצ׳רים ומגבלות שימוש" },
  { id: "support-tools", label: "כלי תמיכה", route: "/admin/support", icon: "ShieldCheck", category: "ניהול", roleMin: "admin", sidebar: true, searchable: true, description: "ניתוח שימוש, משוב נכנס וגישת תמיכה (קריאה בלבד) עם יומן ביקורת" },
  { id: "zi-knowledge", label: "מאגר הידע של ZI", route: "/admin/zi-knowledge", icon: "Sparkles", category: "ניהול", roleMin: "admin", sidebar: false, searchable: true, description: "ZI Expert™ Knowledge — מאמרי מוצר, חיפוש, משוב ושאלות ללא מענה; סנכרון המאגר המובנה" },
  { id: "release-notes", label: "מה חדש", route: "/release-notes", icon: "ScrollText", category: "ראשי", roleMin: "viewer", sidebar: false, searchable: true, description: "Release Notes — מה התחדש בכל גרסה" },
  { id: "modules", label: "מדריך מודולים", route: "/search/modules", icon: "Search", category: "ניהול", roleMin: "viewer", sidebar: false, searchable: true, description: "כל המודולים במערכת" },
];

const RANK: Record<ModuleEntry["roleMin"], number> = { viewer: 20, agent: 40, manager: 60, admin: 80, owner: 100 };

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
