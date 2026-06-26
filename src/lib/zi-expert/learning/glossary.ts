// ZI Learning — built-in product glossary (Phase 25, PURE). Hebrew definitions.
import type { GlossaryTerm } from "./types";

export const GLOSSARY: GlossaryTerm[] = [
  { term: "Opportunity Score", slug: "opportunity-score", definition: "ציון 0–100 שמודד עד כמה נכס/מודעה הם הזדמנות אמיתית, לפי מחיר מול שוק, איכות נתונים, פוטנציאל בלעדיות ועוד.", whereUsed: "רדאר נכסים, רכישות, מוקד החלטות", related: ["hot-deal", "exclusive-probability"] },
  { term: "Exclusive Probability", slug: "exclusive-probability", definition: "ההסתברות שתצליח להחתים נכס פרטי לבלעדיות, מבוססת על סיגנלים מהמוכר, הנכס והשוק.", whereUsed: "הזדמנויות בלעדיות, רדאר נכסים", related: ["opportunity-score"] },
  { term: "Market Cache", slug: "market-cache", definition: "תמונת מצב שמורה של נתוני השוק לאזור, שמתעדכנת בסנכרון. „טרי” = עדכני, „מיושן” = דורש סנכרון.", whereUsed: "מפת חום, שומה, מודיעין שוק", related: ["snapshot", "provider"] },
  { term: "Buyer Match", slug: "buyer-match", definition: "התאמה מחושבת בין קונה לנכס לפי תקציב, אזור, חדרים, סוג ועוד — עם ציון התאמה והסבר.", whereUsed: "התאמות, קונים, נכסים", related: ["opportunity-score"] },
  { term: "Hot Deal", slug: "hot-deal", definition: "נכס/מודעה עם Opportunity Score גבוה במיוחד — שווה פעולה מהירה.", whereUsed: "רדאר נכסים, דשבורד", related: ["opportunity-score"] },
  { term: "Journey", slug: "journey", definition: "מסע הלקוח/הנכס — רצף שלבים אוטומטי (טריגרים, פעולות, השהיות) שמלווה עסקה מקצה לקצה.", whereUsed: "מסעות, Journey Builder", related: ["queue"] },
  { term: "Provider", slug: "provider", definition: "מקור נתונים חיצוני (Yad2, Madlan, GovMap) שממנו ZONO מושכת מודעות/עסקאות בסנכרון.", whereUsed: "מודעות חיצוניות, הגדרות", related: ["market-cache", "snapshot"] },
  { term: "Snapshot", slug: "snapshot", definition: "צילום נתונים בנקודת זמן (שוק/משרד/מודיעין) שעליו מחושבים מגמות והשוואות.", whereUsed: "מודיעין שוק, מודיעין משרד", related: ["market-cache"] },
  { term: "Feature Flag", slug: "feature-flag", definition: "מתג שמפעיל/מכבה יכולת בפלטפורמה לכל ארגון — בלי לפרוס קוד חדש.", whereUsed: "ניהול פלטפורמה", related: ["health-check"] },
  { term: "Queue", slug: "queue", definition: "תור עבודות ברקע (סנכרון, מסעות, חישובים). „תקוע” = יש עבודה שלא הושלמה.", whereUsed: "בריאות מערכת, מסעות", related: ["circuit-breaker", "journey"] },
  { term: "Circuit Breaker", slug: "circuit-breaker", definition: "מנגנון הגנה שעוצר זמנית קריאות לספק שנכשל שוב ושוב, כדי לא להעמיס — ומתאושש לבד.", whereUsed: "בריאות מערכת, ספקים", related: ["queue", "provider"] },
  { term: "Health Check", slug: "health-check", definition: "בדיקת תקינות של מנוע/מערכת: מתי רץ לאחרונה, האם הצליח, וכמה טרי המידע.", whereUsed: "בריאות מערכת", related: ["feature-flag", "queue"] },
];

const NORM = (s: string) => s.toLowerCase().normalize("NFKC");

/** Search the glossary by term/definition. Pure, deterministic. */
export function searchGlossary(query: string, limit = 8): GlossaryTerm[] {
  const q = NORM(query.trim());
  if (!q) return [];
  return GLOSSARY
    .map((t) => {
      const hay = NORM(`${t.term} ${t.slug} ${t.definition} ${t.whereUsed}`);
      let score = 0;
      if (NORM(t.term) === q) score += 100;
      if (hay.includes(q)) score += 40;
      for (const w of q.split(/\s+/)) if (w && hay.includes(w)) score += 8;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}

export const glossaryBySlug = (slug: string): GlossaryTerm | null => GLOSSARY.find((t) => t.slug === slug) ?? null;
