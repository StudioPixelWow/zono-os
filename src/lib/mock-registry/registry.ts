/**
 * Mock / Placeholder Registry — a transparent, curated list of every place the
 * platform uses mock / stub / placeholder / "coming soon" / external-dependency
 * / honest-manual logic, so production never silently relies on mock data.
 * Client-safe (pure data). Maintained MANUALLY in sync with the codebase audit —
 * this is the single source of truth for "what is not yet fully live".
 */
export type MockCategory =
  | "Mock" // dev-only fake data, gated out of production
  | "Stub" // placeholder implementation awaiting a real provider
  | "Coming Soon" // schema/UI exists, feature not wired yet
  | "External Dependency" // real, but blocked on an external API/key
  | "Honest Manual Flow"; // intentionally manual — labelled as such in the UI

export type MockStatus =
  | "production-safe" // cannot leak into prod / honestly labelled
  | "needs-provider" // waiting on an external connection
  | "schema-only"; // tables exist, no active product use

export interface MockEntry {
  id: string;
  area: string;
  route: string; // user-facing route this affects (or "—" for infra)
  where: string; // code location
  category: MockCategory;
  why: string;
  status: MockStatus;
  productionSafe: boolean;
  safeNote: string;
  replacement: string; // how/when it becomes fully real
  targetPhase: string; // tracking label for the fix
}

export const MOCK_REGISTRY: MockEntry[] = [
  {
    id: "txn-dev-mock",
    area: "עסקאות — נתוני הדגמה",
    route: "/transactions",
    where: "src/lib/transactions/service.ts (devMockRaws)",
    category: "Mock",
    why: "מאפשר פיתוח כשאין APIFY_TOKEN",
    status: "production-safe",
    productionSafe: true,
    safeNote: "מגודר ב-NODE_ENV !== production; לעולם לא מגיע לפרודקשן",
    replacement: "הגדר APIFY_TOKEN בפרודקשן",
    targetPhase: "תשתית קיימת",
  },
  {
    id: "openai-copy",
    area: "AI לקופי שיווקי + גילוי שכונות",
    route: "/properties · /transactions",
    where: "src/lib/properties/ai.ts · src/lib/transactions/geo.ts",
    category: "External Dependency",
    why: "שיפור אופציונלי מעל לוגיקה דטרמיניסטית",
    status: "production-safe",
    productionSafe: true,
    safeNote: "מגודר ב-OPENAI_API_KEY עם חלופה דטרמיניסטית; אין כשל אם חסר",
    replacement: "ללא — תלוי מדיניות AI",
    targetPhase: "תשתית קיימת",
  },
  {
    id: "future-social-tables",
    area: "טבלאות קהילה/סושיאל עתידיות",
    route: "/communities",
    where: "social_accounts, social_connection_vault, community_lead/deal_attribution, community_metrics, community_rankings, community_network_profiles, distribution_queue, community_discovery_*, broker_discovery_runs",
    category: "Coming Soon",
    why: "תשתית מוכנה לפיצ׳רים עתידיים (~12 טבלאות)",
    status: "schema-only",
    productionSafe: true,
    safeNote: "סכמה בלבד, ללא UI פעיל — לא נצרכות בפרודקשן",
    replacement: "מימוש לוגיקה אמיתית או תיוג ברור 'בקרוב'",
    targetPhase: "עתידי",
  },
  {
    id: "broker-adapters",
    area: "גילוי/העשרת מתווכים",
    route: "/broker-intelligence",
    where: "src/lib/broker/discovery.ts · enrichment.ts · logo.ts",
    category: "Stub",
    why: "מתאמים/stubs ללא ספק חיצוני פעיל",
    status: "needs-provider",
    productionSafe: true,
    safeNote: "דטרמיניסטי, מבוסס-ראיות; אינו ממציא מתווכים",
    replacement: "חיבור ספק העשרה חיצוני",
    targetPhase: "עתידי",
  },
  {
    id: "nav-mock",
    area: "נתוני ניווט (סקלטון ישן)",
    route: "—",
    where: "src/data/mock.ts",
    category: "Mock",
    why: "פריטי ניווט וסקלטון ישנים בלבד",
    status: "production-safe",
    productionSafe: true,
    safeNote: "אינו נתוני עסק — רק תצורת תפריט; הניווט החי מגיע מ-navigation/registry",
    replacement: "הסרה הדרגתית לטובת navigation/registry",
    targetPhase: "ניקוי",
  },
  // ── Dashboard / Command Center (de-mocked in PHASE 1) ──
  {
    id: "home-dashboard-legacy",
    area: "דשבורד בית — סקשנים ישנים (dead code)",
    route: "/",
    where: "src/components/dashboard/sections/* (legacy)",
    category: "Mock",
    why: "רכיבי דשבורד ישנים עם נתוני הדגמה — הוחלפו ב-components/dashboard-home/*",
    status: "production-safe",
    productionSafe: true,
    safeNote: "הבית החי (route /) משתמש ב-dashboard-home עם דאטה אמיתית; הסקשנים הישנים אינם מחווטים לדף הבית",
    replacement: "הסרת הרכיבים הישנים מהקוד",
    targetPhase: "PHASE 1 (טופל) · ניקוי קוד מת",
  },
  {
    id: "command-center-stats",
    area: "⌘K מרכז פקודה — סטטיסטיקות",
    route: "כל הדפים (⌘K)",
    where: "src/components/navigation/zono-command-center.tsx",
    category: "Honest Manual Flow",
    why: "מערכי stats/AI-insights שהיו hardcoded רוקנו",
    status: "production-safe",
    productionSafe: true,
    safeNote: "מערכי הנתונים רוקנו ל-[] ורצועת ה-AI הוסרה — אין יותר מספרים מומצאים",
    replacement: "חיבור ל-stats אמיתיים אם יידרש בעתיד",
    targetPhase: "PHASE 1 (טופל)",
  },
  // ── Canonical deals / revenue (PHASE 2) ──
  {
    id: "revenue-realized",
    area: "הכנסות בפועל",
    route: "/revenue",
    where: "src/lib/revenue/service.ts · deals/service.ts (syncCanonicalDealOnClose)",
    category: "Honest Manual Flow",
    why: "הכנסות בפועל נכתבות רק בסגירת עסקה אמיתית; KPI מוסתר עד שיש עסקאות סגורות",
    status: "production-safe",
    productionSafe: true,
    safeNote: "אין הכנסות מזויפות — הסכומים נכתבים רק מקלט סוכן אמיתי; אחרת מוצג ״—״",
    replacement: "ככל שייסגרו עסקאות, ה-KPI מתמלא אוטומטית",
    targetPhase: "PHASE 2 (טופל)",
  },
  // ── Journeys (PHASE 3) ──
  {
    id: "journeys-autocreate",
    area: "מסעות לקוח",
    route: "/journeys",
    where: "src/lib/journey-intelligence/service.ts (ensureJourney) + create flows",
    category: "Honest Manual Flow",
    why: "מסעות נוצרים אוטומטית מיצירת קונה/מוכר/ליד אמיתיים בלבד",
    status: "production-safe",
    productionSafe: true,
    safeNote: "אין seed/דמו — כל מסע נשען על שורת ישות אמיתית; empty-state כשאין",
    replacement: "ללא — מתמלא מהפעילות האמיתית",
    targetPhase: "PHASE 3 (טופל)",
  },
  // ── Distribution analytics (PHASE 6) ──
  {
    id: "distribution-meta-analytics",
    area: "הפצה — חשיפות/קליקים/CTR",
    route: "/distribution",
    where: "src/app/(app)/distribution/_center/OverviewSection.tsx · lib/distribution/repository.ts (centerStats)",
    category: "External Dependency",
    why: "מדדי ביצוע חיים דורשים חיבור Meta API רשמי שאינו פעיל",
    status: "needs-provider",
    productionSafe: true,
    safeNote: "מגודר מאחורי סטטוס חיבור Meta — מוצג ״ממתין ל-Meta״ במקום 0 מטעה",
    replacement: "חיבור Meta Marketing/Graph API",
    targetPhase: "PHASE 6 (טופל) · ממתין ל-Meta",
  },
  {
    id: "facebook-whatsapp-manual",
    area: "פרסום פייסבוק / וואטסאפ",
    route: "/distribution · /whatsapp",
    where: "src/lib/distribution/providers/* · whatsapp service",
    category: "Honest Manual Flow",
    why: "אין חיבור Meta/WhatsApp API פעיל — הפרסום והשליחה ידניים",
    status: "needs-provider",
    productionSafe: true,
    safeNote: "מסומן בבירור כ'ידני' (מסייע פרסום); לעולם לא מציג 'פורסם/מחובר' שקרי",
    replacement: "חיבור Meta + WhatsApp Business API",
    targetPhase: "ממתין ל-Meta",
  },
  // ── Legal e-signature ──
  {
    id: "legal-esign",
    area: "חתימה דיגיטלית למסמכים",
    route: "/legal-templates · /documents",
    where: "src/lib/legal/* · documents signature flow",
    category: "Coming Soon",
    why: "אין ספק חתימה אלקטרונית אמיתי מחובר",
    status: "needs-provider",
    productionSafe: true,
    safeNote: "חתימה מסומנת ידנית בלבד; המסמך ננעל לאחר חתימה. אין התחזות לספק e-sign",
    replacement: "חיבור ספק חתימה (DocuSign/דומה)",
    targetPhase: "עתידי",
  },
  // ── Creative final image ──
  {
    id: "creative-final-image",
    area: "תמונת קריאייטיב סופית",
    route: "/creative-studio · /creative",
    where: "src/lib/creative-studio/* (final_image_url)",
    category: "External Dependency",
    why: "יצירת תמונה סופית תלויה בספק יצירת תמונות (Nano Banana/OpenAI)",
    status: "needs-provider",
    productionSafe: true,
    safeNote: "ללא מפתח ספק — הפלט הוא Prompt מוכן + render object, לא תמונה מזויפת",
    replacement: "מפתח ספק יצירת תמונות פעיל",
    targetPhase: "External Dependency",
  },
];

export const MOCK_SUMMARY = {
  total: MOCK_REGISTRY.length,
  byCategory: MOCK_REGISTRY.reduce<Record<string, number>>((acc, m) => {
    acc[m.category] = (acc[m.category] ?? 0) + 1;
    return acc;
  }, {}),
  productionSafe: MOCK_REGISTRY.filter((m) => m.productionSafe).length,
};
