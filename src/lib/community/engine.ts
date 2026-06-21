// ============================================================================
// ZONO — Community Discovery & Execution OS · Pure engine (client-safe)
// ----------------------------------------------------------------------------
// Deterministic helpers for the execution layer: comment/Messenger intent
// detection, community classification + score labels, content-variation angles,
// and community value scoring. No I/O, no scraping, no LLM. Compliance-safe.
// ============================================================================

// ── comment / messenger intent detection ──────────────────────────────────────
export type Intent = "unknown" | "question" | "price_request" | "viewing_request" | "buyer_intent" | "seller_intent" | "referral_intent" | "spam";

export function detectIntent(text: string): { intent: Intent; score: number } {
  const s = (text || "").toLowerCase();
  if (!s.trim()) return { intent: "unknown", score: 0 };
  if (/(הלוואה|בורסה|קריפטו|הימור|spam|http:\/\/|רווח מובטח)/.test(s)) return { intent: "spam", score: 90 };
  if (/(מחיר|כמה עולה|מה המחיר|עלות|how much|price)/.test(s)) return { intent: "price_request", score: 80 };
  if (/(לתאם|סיור|ביקור|לראות|צפייה|viewing|tour|מתי אפשר לבוא)/.test(s)) return { intent: "viewing_request", score: 85 };
  if (/(מחפש לקנות|רוצה לקנות|מעוניין בדירה|מחפש דירה|looking to buy|interested)/.test(s)) return { intent: "buyer_intent", score: 78 };
  if (/(רוצה למכור|מעוניין למכור|יש לי דירה למכירה|to sell|מוכר)/.test(s)) return { intent: "seller_intent", score: 80 };
  if (/(מכיר מישהו|אני ממליץ|חבר שלי מחפש|referral|הפניה)/.test(s)) return { intent: "referral_intent", score: 70 };
  if (/[?？]|איך|מה|האם|where|what|how/.test(s)) return { intent: "question", score: 55 };
  return { intent: "unknown", score: 20 };
}

export const INTENT_LABELS: Record<string, string> = {
  unknown: "לא ידוע", question: "שאלה", price_request: "בקשת מחיר", viewing_request: "בקשת צפייה",
  buyer_intent: "כוונת קנייה", seller_intent: "כוונת מכירה", referral_intent: "הפניה", spam: "ספאם",
};
export const INTENT_TONE: Record<string, string> = {
  viewing_request: "bg-success-soft text-success", buyer_intent: "bg-success-soft text-success",
  seller_intent: "bg-brand-soft text-brand-strong", price_request: "bg-warning-soft text-warning",
  referral_intent: "bg-brand-soft text-brand-strong", question: "bg-surface text-ink", spam: "bg-danger-soft text-danger", unknown: "bg-surface text-muted",
};
export const isHotIntent = (i: string) => ["viewing_request", "buyer_intent", "seller_intent", "price_request"].includes(i);

// ── community classification (deterministic keyword) ──────────────────────────
export type CommunityCategory =
  | "real_estate" | "local_city" | "neighborhood" | "investors" | "families" | "luxury" | "commercial"
  | "developers" | "contractors" | "community" | "lifestyle" | "local_news" | "unknown";

export function classifyCommunity(name: string): CommunityCategory {
  const s = (name || "").toLowerCase();
  if (/(נדל|דירות|נכסים|real estate|להשכרה|למכירה)/.test(s)) return "real_estate";
  if (/(משקיע|השקעה|investor|תשואה)/.test(s)) return "investors";
  if (/(יוקרה|פנטהאוז|luxury|וילה)/.test(s)) return "luxury";
  if (/(מסחרי|משרדים|commercial|חנויות)/.test(s)) return "commercial";
  if (/(יזם|פרויקט|developer|התחדשות)/.test(s)) return "developers";
  if (/(קבלן|שיפוץ|contractor)/.test(s)) return "contractors";
  if (/(משפחות|הורים|families|גן ילדים|בית ספר)/.test(s)) return "families";
  if (/(שכונת|שכונה|neighborhood)/.test(s)) return "neighborhood";
  if (/(תושבי|העיר|local|city)/.test(s)) return "local_city";
  if (/(חדשות|news|מקומון)/.test(s)) return "local_news";
  if (/(קהילה|community)/.test(s)) return "community";
  if (/(לייף|סטייל|lifestyle|המלצות)/.test(s)) return "lifestyle";
  return "unknown";
}
export const CATEGORY_LABELS: Record<string, string> = {
  real_estate: "נדל\"ן", local_city: "עירוני", neighborhood: "שכונתי", investors: "משקיעים", families: "משפחות",
  luxury: "יוקרה", commercial: "מסחרי", developers: "יזמים", contractors: "קבלנים", community: "קהילה",
  lifestyle: "לייפסטייל", local_news: "חדשות מקומיות", unknown: "לא מסווג",
};

// ── community value scoring (additive to existing distribution scores) ────────
export interface CommunityScoreInput { members: number; leads: number; buyerLeads: number; sellerLeads: number; deals: number; revenue: number; posts: number }
export function communityValueScore(i: CommunityScoreInput): number {
  const conv = i.posts > 0 ? Math.min(1, i.leads / Math.max(1, i.posts)) : 0;
  const revScore = Math.min(1, i.revenue / 100_000);
  const dealScore = Math.min(1, i.deals / 3);
  const leadScore = Math.min(1, i.leads / 10);
  const reach = Math.min(1, i.members / 5000);
  return Math.round((conv * 0.2 + revScore * 0.3 + dealScore * 0.25 + leadScore * 0.15 + reach * 0.1) * 100);
}

// ── content-variation angles (15) ──────────────────────────────────────────────
export const CONTENT_ANGLES: { key: string; label: string; hint: string }[] = [
  { key: "lifestyle", label: "סגנון חיים", hint: "הדגש את חוויית המגורים והסביבה" },
  { key: "family", label: "משפחות", hint: "קרבה לבתי ספר, גנים ופארקים" },
  { key: "investment", label: "השקעה", hint: "תשואה, פוטנציאל השבחה ונתוני שוק" },
  { key: "luxury", label: "יוקרה", hint: "גימור, נוף ומפרט יוקרתי" },
  { key: "urgency", label: "דחיפות", hint: "הזדמנות מוגבלת בזמן" },
  { key: "project", label: "פרויקט", hint: "יתרונות הפרויקט והקבלן" },
  { key: "seller_acquisition", label: "גיוס מוכרים", hint: "קריאה למוכרים פוטנציאליים בשכונה" },
  { key: "neighborhood", label: "מיקוד שכונה", hint: "ייחודיות השכונה ועסקאות אחרונות" },
  { key: "community", label: "מיקוד קהילה", hint: "התאמה לערכי הקהילה" },
  { key: "school", label: "מיקוד חינוך", hint: "אזורי רישום ובתי ספר מובילים" },
  { key: "young_families", label: "זוגות צעירים", hint: "דירה ראשונה ומימון נגיש" },
  { key: "investors", label: "משקיעים", hint: "מספרים, תשואה והשוואת שוק" },
  { key: "first_home", label: "דירה ראשונה", hint: "הדרכה, מימון וצעדים פשוטים" },
  { key: "downsizers", label: "מקטינים דיור", hint: "נוחות, תחזוקה נמוכה ומיקום" },
  { key: "commercial", label: "מסחרי", hint: "פוטנציאל עסקי ותנועה" },
];
export const angleLabel = (k: string) => CONTENT_ANGLES.find((a) => a.key === k)?.label ?? k;

// ── best posting times (deterministic heuristic) ──────────────────────────────
export const TOP_POSTING_TIMES = ["08:30", "12:30", "17:00", "20:30"];
export function topAngleForCategory(cat: string): string {
  const map: Record<string, string> = {
    investors: "investment", luxury: "luxury", families: "family", developers: "project",
    neighborhood: "neighborhood", local_city: "lifestyle", commercial: "commercial", real_estate: "urgency",
  };
  return map[cat] ?? "lifestyle";
}
