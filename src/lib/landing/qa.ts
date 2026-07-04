// ============================================================================
// ✅ ZONO AI Landing Experience™ — pure self-tests (offline). 38.3.
// Validates the type catalog, the assembler (hero/CTAs/showcase/faq/ask), and
// the recommendations. No I/O.
// ============================================================================
import { buildLanding } from "./assemble";
import { LANDING_TYPES, getLandingConfig, isLandingType, ALL_LANDING_TYPES } from "./catalog";
import { buildLandingRecommendations } from "./recommend";
import type { LandingCtx } from "./types";

export interface LDCheck { name: string; pass: boolean; detail: string }
export interface LDSelfCheck { ok: boolean; total: number; passed: number; checks: LDCheck[] }

function ctx(o: Partial<LandingCtx> = {}): LandingCtx {
  return {
    slug: "office-x", base: "ai-site", officeName: "נדל\"ן זונו", logo: null, cover: null,
    title: "דירת 4 חדרים מדהימה בלב הכרמל", subtitle: "נכס נדיר עם נוף פתוח, קרוב לכל מה שצריך, מוכן להיכנס.",
    aiSummary: "נכס מבוקש עם ביקוש גבוה ומחיר תחרותי לאזור.", badges: [{ label: "ביקוש גבוה", tone: "success" }],
    stats: [{ label: "חדרים", value: "4" }, { label: "מ״ר", value: "110" }], highlights: ["נוף פתוח", "קרוב לפארק", "חניה כפולה"],
    showcase: [{ id: "p1", title: "דירה דומה", price: 2000000, image: null, badge: null }],
    contact: { phone: "03-1234567", whatsapp: "972500000000", email: "a@b.co", meeting: "https://cal.com/x" },
    entityHref: "/ai-site/office-x/property/p1", faq: [{ q: "מה המחיר?", a: "פנו אלינו" }], seoReady: true, ...o,
  };
}

export function runSelfCheck(): LDSelfCheck {
  const checks: LDCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  add("catalog has 15 types", ALL_LANDING_TYPES.length === 15);
  add("isLandingType guard", isLandingType("luxury") && !isLandingType("nope"));
  add("families mapped", getLandingConfig("property")!.family === "property" && getLandingConfig("neighborhood")!.family === "area" && getLandingConfig("valuation")!.family === "office");
  add("every type has ask + ctas + sections", ALL_LANDING_TYPES.every((t) => LANDING_TYPES[t].ask.length >= 3 && LANDING_TYPES[t].ctaKinds.length >= 1 && LANDING_TYPES[t].sections.length >= 3));

  const v = buildLanding(getLandingConfig("property")!, ctx());
  add("hero built from ctx + config eyebrow", v.hero.headline.includes("כרמל") && v.hero.eyebrow === "נכס למכירה");
  add("ctas: whatsapp primary, deduped", v.hero.ctas[0].kind === "whatsapp" && v.hero.ctas[0].variant === "primary");
  add("sticky cta = primary", v.stickyCta?.href === v.hero.ctas[0].href);
  add("showcase capped + faq + ask from config", v.showcase.length === 1 && v.faq.length === 1 && v.ask.length === 4);
  add("trust carries stats + badges", v.trust.stats.length === 2 && v.trust.badges.length === 1);

  // No contact channels → CTA falls back to Ask.
  const noContact = buildLanding(getLandingConfig("property")!, ctx({ contact: { phone: null, whatsapp: null, email: null, meeting: null } }));
  add("no channels → all CTAs route to Ask", noContact.hero.ctas.every((c) => c.href === "#ask"));

  // Recommendations.
  const recNo = buildLandingRecommendations(noContact);
  add("rec: missing_cta when no real channel", recNo.some((r) => r.kind === "missing_cta"));
  const recThin = buildLandingRecommendations(buildLanding(getLandingConfig("property")!, ctx({ stats: [], highlights: [], aiSummary: null, subtitle: "קצר", faq: [] })));
  add("rec: missing_stats + weak_seo + low_content", recThin.some((r) => r.kind === "missing_stats") && recThin.some((r) => r.kind === "weak_seo") && recThin.some((r) => r.kind === "low_content"));
  add("rec: sorted high first", recThin.length > 0 && recThin[0].impact === "high");
  const recConv = buildLandingRecommendations(v, { visitors: 200, leads: 0, conversionRate: 0 });
  add("rec: poor_conversion from analytics", recConv.some((r) => r.kind === "poor_conversion"));

  // Recruitment landing has no showcase section.
  add("seller_recruitment omits showcase", !getLandingConfig("seller_recruitment")!.sections.includes("showcase"));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
