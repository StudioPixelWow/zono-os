/**
 * Mock / Placeholder Registry — a transparent, curated list of every place the
 * platform uses mock/fallback/placeholder/future logic, so production never
 * silently relies on mock data. Client-safe (pure data). Kept in sync manually
 * with the codebase audit.
 */
export interface MockEntry {
  id: string;
  area: string;
  where: string;
  why: string;
  productionSafe: boolean;
  safeNote: string;
  replacement: string;
}

export const MOCK_REGISTRY: MockEntry[] = [
  {
    id: "txn-dev-mock",
    area: "עסקאות — נתוני הדגמה",
    where: "src/lib/transactions/service.ts (devMockRaws)",
    why: "מאפשר פיתוח כשאין APIFY_TOKEN",
    productionSafe: true,
    safeNote: "מגודר ב-NODE_ENV !== production; לעולם לא מגיע לפרודקשן",
    replacement: "הגדר APIFY_TOKEN בפרודקשן",
  },
  {
    id: "openai-copy",
    area: "AI לקופי שיווקי + גילוי שכונות",
    where: "src/lib/properties/ai.ts · src/lib/transactions/geo.ts",
    why: "שיפור אופציונלי מעל לוגיקה דטרמיניסטית",
    productionSafe: true,
    safeNote: "מגודר ב-OPENAI_API_KEY עם חלופה דטרמיניסטית; אין כשל אם חסר",
    replacement: "ללא — תלוי מדיניות AI",
  },
  {
    id: "future-social-tables",
    area: "טבלאות קהילה/סושיאל עתידיות",
    where: "social_accounts, social_connection_vault, community_lead/deal_attribution, community_metrics, community_rankings, community_network_profiles, distribution_queue, community_discovery_*, broker_discovery_runs",
    why: "תשתית מוכנה לפיצ׳רים עתידיים (~12 טבלאות)",
    productionSafe: true,
    safeNote: "סכמה בלבד, ללא UI פעיל — לא נצרכות בפרודקשן",
    replacement: "מימוש לוגיקה אמיתית או תיוג ברור 'בקרוב'",
  },
  {
    id: "broker-adapters",
    area: "גילוי/העשרת מתווכים",
    where: "src/lib/broker/discovery.ts · enrichment.ts · logo.ts",
    why: "מתאמים/stubs ללא ספק חיצוני פעיל",
    productionSafe: true,
    safeNote: "דטרמיניסטי, מבוסס-ראיות; אינו ממציא מתווכים",
    replacement: "חיבור ספק העשרה חיצוני",
  },
  {
    id: "nav-mock",
    area: "נתוני ניווט",
    where: "src/data/mock.ts",
    why: "פריטי ניווט וסקלטון בלבד",
    productionSafe: true,
    safeNote: "אינו נתוני עסק — רק תצורת תפריט",
    replacement: "ללא — מומר בהדרגה לרישום הניווט (navigation/registry)",
  },
];
