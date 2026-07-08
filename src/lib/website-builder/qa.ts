// ============================================================================
// ✅ ZONO Website Builder OS™ — pure self-tests (offline). 38.0.
// Validates section ordering, template apply, recommendations (evidence-only),
// SEO analysis, health, and the composed view. No I/O.
// ============================================================================
import { assembleBuilderView, moveSection } from "./assemble";
import { applyTemplate, getTemplate, TEMPLATES, SECTION_CATALOG } from "./catalog";
import { buildRecommendations, analyzeSeo, buildHealth } from "./recommend";
import type { BuilderInput, SiteConfigLean, WebsiteAnalyticsLean } from "./types";

export interface WBCheck { name: string; pass: boolean; detail: string }
export interface WBSelfCheck { ok: boolean; total: number; passed: number; checks: WBCheck[] }

const analytics: WebsiteAnalyticsLean = { visitors: 100, leads: 0, propertyViews: 30, conversionRate: 0, whatsappClicks: 5, calls: 2 };
function cfg(o: Partial<SiteConfigLean> = {}): SiteConfigLean {
  return {
    target: "agent", slug: "agent-123", status: "draft",
    title: "יוסי כהן", headline: "יועץ נדל\"ן בכיר בחיפה והסביבה", description: "מלווה קונים ומוכרים בעסקאות נדל\"ן באזור חיפה עם ניסיון רב.",
    imageUrl: null, sections: { hero: true, featured_properties: true, about: true, contact: true, faq: false, cta: false, footer: true }, order: [],
    featuredCount: 4, viewCount: 120,
    theme: null, phone: "0500000000", whatsapp: "972500000000", email: "yossi@zono.co.il", updatedAt: null, ...o,
  };
}

export function runSelfCheck(): WBSelfCheck {
  const checks: WBCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const input: BuilderInput = { config: cfg(), analytics, notes: [] };
  const v = assembleBuilderView(input);

  add("sections built from config", v.sections.length === Object.keys(input.config.sections).length);
  add("sections carry enabled + order", v.sections.every((s, i) => s.order === i) && v.sections.find((s) => s.key === "faq")!.enabled === false);
  add("templates exposed", v.templates.length === TEMPLATES.length && v.templates.some((t) => t.key === "luxury"));

  add("rec: missing CTA (high)", v.recommendations.some((r) => r.kind === "missing_cta" && r.impact === "high"));
  add("rec: missing FAQ", v.recommendations.some((r) => r.kind === "missing_faq"));
  add("rec: sorted high first", v.recommendations[0].impact === "high");
  add("rec: poor conversion (100 visitors 0 leads)", v.recommendations.some((r) => r.kind === "poor_conversion"));

  const seoBad = analyzeSeo(cfg({ headline: "קצר", description: "", slug: null }));
  add("seo: detects weak title/description/slug", !seoBad.ready && seoBad.issues.length === 3);
  add("rec: weak_seo when seo bad", buildRecommendations(cfg({ headline: null, description: null, slug: null }), analytics).some((r) => r.kind === "weak_seo"));

  const goodRecs = buildRecommendations(cfg({ sections: { hero: true, featured_properties: true, about: true, contact: true, faq: true, cta: true, footer: true }, headline: "יועץ נדל\"ן מקצועי ומנוסה בחיפה", description: "ליווי מלא לקונים ומוכרים לאורך כל הדרך עם ניסיון רב שנים באזור." }), { ...analytics, leads: 8, conversionRate: 8 });
  const health = buildHealth(cfg({ sections: { hero: true, featured_properties: true, about: true, contact: true, faq: true, cta: true, footer: true } }), goodRecs);
  add("health: strong site scores higher", health.score >= 60 && health.seoReady === true);

  const t = getTemplate("luxury")!;
  const applied = applyTemplate(t);
  add("template apply: order + enabled map", applied.order.length === t.sections.length && applied.enabled["hero"] === true);

  const moved = moveSection(["a", "b", "c"], "c", "up");
  add("moveSection up", moved.join(",") === "a,c,b");
  add("moveSection noop at edge", moveSection(["a", "b"], "a", "up").join(",") === "a,b");

  add("catalog has all Part-1 sections", ["hero", "featured_properties", "projects", "neighborhoods", "area_insights", "statistics", "about", "team", "testimonials", "faq", "cta", "contact", "ask_ai", "footer"].every((k) => SECTION_CATALOG.some((s) => s.key === k)));

  add("draft note added", v.notes.some((n) => n.includes("טיוטה")));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
