// ============================================================================
// 🌐 AI Brokerage Website — AI content composition (pure). 32.1. Part: AI CONTENT.
// Composes evidence-only public copy from FACTS supplied by the engines. Never
// invents numbers or claims — every block carries its evidence.
// ============================================================================
import type { AiContentBlock, SiteInput, PropertyAI } from "./types";

const fmtPrice = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);

export function marketUpdateBlock(input: SiteInput): AiContentBlock {
  const facts = input.marketSummaryFacts.slice(0, 4);
  const body = facts.length
    ? `סקירת שוק מבוססת-נתונים של ${input.branding.officeName}: ${facts.join(" · ")}.`
    : `${input.branding.officeName} מרכז את הנתונים העדכניים מהאזורים בהם המשרד פעיל.`;
  return { kind: "market_update", title: "עדכון שוק", body, evidence: facts.length ? facts : ["מבוסס על מלאי המשרד"], cta: { label: "כל הנכסים", href: "properties" } };
}

export function neighborhoodSpotlightBlock(area: string | null, inventory: number, avgPrice: number | null): AiContentBlock {
  const p = fmtPrice(avgPrice);
  const body = area
    ? `${area}: ${inventory} נכסים פעילים${p ? ` · מחיר ממוצע ${p}` : ""}. אזור פעיל במיוחד במלאי המשרד.`
    : "המשרד מכסה מספר אזורים מובילים עם מלאי פעיל.";
  return { kind: "neighborhood_spotlight", title: area ? `זרקור: ${area}` : "אזורים מובילים", body, evidence: [`${inventory} נכסים`, ...(p ? [`ממוצע ${p}`] : [])], cta: area ? { label: `נכסים ב${area}`, href: `neighborhood/${encodeURIComponent(area)}` } : null };
}

export function buyingTipBlock(): AiContentBlock {
  return { kind: "buying_tip", title: "טיפ לקונים", body: "לפני ביקור, הגדירו תקציב, אזורים מועדפים ומספר חדרים — כך תקבלו התאמות מדויקות יותר. אפשר לשאול את Ask ZONO לקבלת המלצות מיידיות ממלאי המשרד.", evidence: ["הנחיה כללית — לא הבטחת תשואה"], cta: { label: "שאל את ZONO", href: "ask" } };
}
export function sellingTipBlock(): AiContentBlock {
  return { kind: "selling_tip", title: "טיפ למוכרים", body: "תמחור נכון מול השוק הוא המנוף המשמעותי ביותר לזמן מכירה קצר. המשרד משתמש בנתוני שוק והערכות שווי כדי למקם את המחיר נכון מההתחלה.", evidence: ["הנחיה כללית — מבוסס נתוני שוק"], cta: { label: "צור קשר", href: "contact" } };
}
export function investmentInsightBlock(area: string | null, growthScore: number | null): AiContentBlock {
  const body = growthScore != null ? `${area ?? "האזור"} מציג ציון צמיחה ${growthScore}/100 לפי נתוני המשרד — נקודת פתיחה טובה לבחינת השקעה.` : "בחינת השקעה מתחילה בהצלבת נתוני מלאי, ביקוש ומחירים — שאלו את Ask ZONO.";
  return { kind: "investment_insight", title: "זווית השקעה", body, evidence: growthScore != null ? [`ציון צמיחה ${growthScore}`] : ["מבוסס נתוני מלאי"], cta: { label: "שאל את ZONO", href: "ask" } };
}

export function faqBlocks(officeName: string): AiContentBlock[] {
  return [
    { kind: "faq", title: `איך יוצרים קשר עם ${officeName}?`, body: "דרך טופס יצירת הקשר, וואטסאפ, טלפון או מייל בעמוד הקשר. אפשר גם לשאול ישירות את Ask ZONO.", evidence: ["פרטי המשרד"], cta: { label: "צור קשר", href: "contact" } },
    { kind: "faq", title: "האם הנכסים מעודכנים?", body: "כן — האתר מוזן ישירות ממלאי ה-CRM החי של המשרד, ומתעדכן אוטומטית.", evidence: ["מלאי חי"], cta: null },
    { kind: "faq", title: "אפשר לקבל המלצות מותאמות?", body: "בהחלט. Ask ZONO ממליץ על נכסים ואזורים לפי מה שחשוב לכם — ללא התחייבות.", evidence: ["Ask ZONO"], cta: { label: "שאל את ZONO", href: "ask" } },
  ];
}

export function featuredPropertyBlock(p: PropertyAI): AiContentBlock {
  const price = fmtPrice(p.price);
  const badge = p.badges.demand === "high" ? "ביקוש גבוה" : p.badges.trust === "verified" ? "מאומת" : null;
  return { kind: "featured_property", title: `נכס מוביל: ${p.title}`, body: `${p.title}${p.neighborhood ? `, ${p.neighborhood}` : ""}${price ? ` · ${price}` : ""}${badge ? ` · ${badge}` : ""}.`, evidence: p.highlights.slice(0, 3), cta: { label: "לנכס", href: `property/${p.id}` } };
}
