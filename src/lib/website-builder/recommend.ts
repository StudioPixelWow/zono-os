// ============================================================================
// 🌐 ZONO Website Builder OS™ — recommendations + health (pure). 38.0.
// Analyzes the site config + analytics and derives website recommendations
// (missing sections / weak SEO / missing CTA / missing FAQ / low content / poor
// conversion) with WHY + evidence, plus a health score. Evidence-only — every
// finding is grounded in a real signal. No fabrication.
// ============================================================================
import type { SiteConfigLean, WebsiteAnalyticsLean, WebsiteRecommendation, WebsiteHealth, WeakSeo } from "./types";
import { ESSENTIAL_KEYS, getSectionDef } from "./catalog";

const enabledKeys = (c: SiteConfigLean) => Object.entries(c.sections).filter(([, v]) => v).map(([k]) => k);

export function analyzeSeo(c: SiteConfigLean): { ready: boolean; issues: WeakSeo[] } {
  const issues: WeakSeo[] = [];
  const title = c.headline ?? c.title;
  if (!title || title.trim().length < 10) issues.push({ field: "title", issue: "כותרת חסרה או קצרה מדי (מומלץ 10+ תווים)" });
  if (!c.description || c.description.trim().length < 40) issues.push({ field: "description", issue: "תיאור חסר או קצר (מומלץ 40+ תווים ל-SEO)" });
  if (!c.slug) issues.push({ field: "slug", issue: "אין כתובת (slug) — הדף לא ניתן לפרסום/אינדוקס" });
  return { ready: issues.length === 0, issues };
}

export function buildRecommendations(c: SiteConfigLean, a: WebsiteAnalyticsLean): WebsiteRecommendation[] {
  const recs: WebsiteRecommendation[] = [];
  const on = new Set(enabledKeys(c));

  // Missing essential sections.
  const missing = ESSENTIAL_KEYS.filter((k) => !on.has(k));
  for (const k of missing) {
    const def = getSectionDef(k);
    if (!def) continue;
    if (k === "cta") { recs.push({ kind: "missing_cta", title: "חסרה קריאה לפעולה", why: "אין סקשן CTA — גולשים אין להם דרך ברורה להשאיר פרטים.", evidence: ["סקשן cta כבוי"], impact: "high", cta: { action: "enable_section", sectionKey: "cta" } }); continue; }
    if (k === "faq") { recs.push({ kind: "missing_faq", title: "חסרות שאלות נפוצות", why: "FAQ משפר SEO ומענה לגולשים — הסקשן כבוי.", evidence: ["סקשן faq כבוי"], impact: "medium", cta: { action: "enable_section", sectionKey: "faq" } }); continue; }
    recs.push({ kind: "missing_section", title: `חסר סקשן: ${def.label}`, why: `${def.description} — סקשן חיוני שאינו מוצג.`, evidence: [`סקשן ${k} כבוי`], impact: def.key === "hero" || def.key === "contact" ? "high" : "medium", cta: { action: "enable_section", sectionKey: k } });
  }

  // Missing hero image — the cinematic cover is the single biggest first impression.
  if (!c.imageUrl) recs.push({ kind: "missing_image", title: "חסרה תמונת נושא (Hero)", why: "אין תמונת רקע/לוגו — ה-Hero נראה ריק והרושם הראשוני נפגע.", evidence: ["לא הוגדרה תמונת נושא"], impact: "high", cta: { action: "edit_branding", sectionKey: "hero" } });

  // Missing contact channels — no WhatsApp/phone means the lead CTA can't convert.
  if (!c.whatsapp && !c.phone) recs.push({ kind: "missing_contact", title: "אין ערוץ יצירת קשר", why: "לא הוגדרו וואטסאפ/טלפון — לגולש אין דרך ליצור קשר וה-CTA לא ממיר.", evidence: ["אין וואטסאפ", "אין טלפון"], impact: "high", cta: { action: "edit_contact", sectionKey: "contact" } });

  // Missing featured properties — an empty listings grid looks unfinished.
  if (c.featuredCount === 0 && on.has("featured_properties")) recs.push({ kind: "missing_featured", title: "לא נבחרו נכסים מובילים", why: "סקשן הנכסים המובילים פעיל אך ריק — כדאי לבחור נכסים איכותיים להצגה.", evidence: ["0 נכסים מובלטים"], impact: "medium", cta: { action: "edit_featured", sectionKey: "featured_properties" } });

  // Weak SEO.
  const seo = analyzeSeo(c);
  if (!seo.ready) recs.push({ kind: "weak_seo", title: "SEO חלש", why: "פרטי SEO חסרים — פוגע בדירוג ובחשיפה בגוגל.", evidence: seo.issues.map((i) => i.issue), impact: "high", cta: { action: "edit_seo", sectionKey: null } });

  // Low content (thin headline/description).
  const contentLen = (c.headline?.length ?? 0) + (c.description?.length ?? 0) + (c.title?.length ?? 0);
  if (contentLen < 60) recs.push({ kind: "low_content", title: "תוכן דל", why: "מעט טקסט באתר — פוגע ב-SEO ובאמון הגולש.", evidence: [`סה״כ ${contentLen} תווים בכותרות`], impact: "medium", cta: { action: "generate_content", sectionKey: null } });

  // Poor conversion.
  if (a.visitors >= 50 && a.conversionRate < 1) recs.push({ kind: "poor_conversion", title: "המרה נמוכה", why: `${a.visitors} מבקרים אך שיעור המרה ${a.conversionRate}% — כדאי לחזק CTA/טפסים.`, evidence: [`מבקרים: ${a.visitors}`, `לידים: ${a.leads}`, `המרה: ${a.conversionRate}%`], impact: "high", cta: { action: "enable_section", sectionKey: on.has("cta") ? null : "cta" } });

  const rank = { high: 3, medium: 2, low: 1 } as const;
  return recs.sort((x, y) => rank[y.impact] - rank[x.impact]);
}

export function buildHealth(c: SiteConfigLean, recs: WebsiteRecommendation[]): WebsiteHealth {
  const enabled = enabledKeys(c).length;
  const seo = analyzeSeo(c);
  let score = 50 + Math.min(30, enabled * 3);
  if (seo.ready) score += 15; else score -= seo.issues.length * 5;
  score -= recs.filter((r) => r.impact === "high").length * 8;
  score -= recs.filter((r) => r.impact === "medium").length * 3;
  score = Math.min(100, Math.max(0, Math.round(score)));
  const band: WebsiteHealth["band"] = score >= 70 ? "strong" : score >= 45 ? "fair" : "weak";
  return { score, band, seoReady: seo.ready, sectionsEnabled: enabled, issues: recs.length };
}
