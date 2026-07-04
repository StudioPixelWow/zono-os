// ============================================================================
// 🎯 ZONO AI Landing Experience™ — recommendations (pure). 38.3.
// Landing-specific conversion recommendations (Part 13): missing CTA / weak
// trust / weak SEO / missing FAQ / low content / poor conversion / missing
// statistics — with WHY + evidence. Evidence-only; grounded in the landing view.
// ============================================================================
import type { LandingView, LandingRecommendation, Impact } from "./types";

export interface LandingAnalyticsLean { visitors: number; leads: number; conversionRate: number }

export function buildLandingRecommendations(view: LandingView, analytics?: LandingAnalyticsLean): LandingRecommendation[] {
  const recs: LandingRecommendation[] = [];
  const rank = { high: 3, medium: 2, low: 1 } as const;

  const realCtas = view.hero.ctas.filter((c) => c.href !== "#ask");
  if (realCtas.length === 0) recs.push({ kind: "missing_cta", title: "אין קריאה לפעולה ישירה", why: "אין ערוץ יצירת קשר ישיר (וואטסאפ/טלפון/פגישה) — הגולש חייב לפעול דרך הצ'אט בלבד.", evidence: ["כל ה-CTA מנותבים ל-Ask"], impact: "high" });

  if (view.trust.stats.length === 0) recs.push({ kind: "missing_stats", title: "אין סטטיסטיקות", why: "מספרים אמיתיים מחזקים אמון ומעלים המרה — אין נתונים בהירו.", evidence: ["0 סטטיסטיקות"], impact: "high" });
  else if (view.trust.stats.length < 2 && view.trust.badges.length === 0) recs.push({ kind: "weak_trust", title: "בלוק אמון חלש", why: "מעט מדי סימני אמון (סטטיסטיקות/תגיות) — כדאי להוסיף ראיות.", evidence: [`${view.trust.stats.length} סטטיסטיקות · ${view.trust.badges.length} תגיות`], impact: "medium" });

  if (!view.hero.headline || view.hero.headline.trim().length < 8 || !view.hero.subtitle || view.hero.subtitle.trim().length < 20)
    recs.push({ kind: "weak_seo", title: "כותרות חלשות ל-SEO", why: "כותרת/תת-כותרת קצרות מדי — פוגע ב-SEO ובבהירות ההצעה.", evidence: [`כותרת ${view.hero.headline.length} תווים`], impact: "high" });

  if (view.faq.length === 0 && view.sections.includes("faq")) recs.push({ kind: "missing_faq", title: "חסרות שאלות נפוצות", why: "FAQ מסיר חסמים ומשפר SEO — אין שאלות בדף.", evidence: ["0 שאלות"], impact: "medium" });

  const contentLen = view.content.highlights.join(" ").length + (view.hero.aiSummary?.length ?? 0);
  if (contentLen < 80) recs.push({ kind: "low_content", title: "תוכן דל", why: "מעט טקסט משכנע — כדאי להוסיף יתרונות/סיכום AI.", evidence: [`${contentLen} תווים בתוכן`], impact: "medium" });

  if (analytics && analytics.visitors >= 50 && analytics.conversionRate < 1)
    recs.push({ kind: "poor_conversion", title: "המרה נמוכה", why: `${analytics.visitors} מבקרים אך ${analytics.conversionRate}% המרה — כדאי לחזק CTA/אמון.`, evidence: [`מבקרים ${analytics.visitors}`, `לידים ${analytics.leads}`], impact: "high" });

  return recs.sort((a, b) => rank[b.impact as Impact] - rank[a.impact as Impact]);
}
