// ============================================================================
// 🎯 ZONO AI Landing Experience™ — pure assembler (client-safe). 38.3.
// Turns a landing config + lean context into the premium landing view-model
// (hero, trust, content, showcase, faq, ask, sticky CTA) — rendered by ONE
// LandingPage component through the shared site-ui. Deterministic, evidence-only.
// ============================================================================
import type { LandingConfig, LandingCtx, LandingView, LandingCta, CtaKind } from "./types";
import { LANDING_VERSION } from "./types";

const wa = (n: string) => `https://wa.me/${n.replace(/[^0-9]/g, "")}`;

const CTA_LABEL: Record<CtaKind, string> = {
  whatsapp: "וואטסאפ", phone: "התקשרו", meeting: "קביעת פגישה", match: "התאמת נכס AI", valuation: "הערכת שווי", visit: "תיאום צפייה",
};

/** Resolve a CTA to a real href, or null if its channel is unavailable. */
function ctaFor(kind: CtaKind, ctx: LandingCtx): LandingCta | null {
  const label = CTA_LABEL[kind];
  switch (kind) {
    case "whatsapp": return ctx.contact.whatsapp ? { label, href: wa(ctx.contact.whatsapp), kind, variant: "primary" } : null;
    case "phone": return ctx.contact.phone ? { label, href: `tel:${ctx.contact.phone}`, kind, variant: "secondary" } : null;
    case "meeting": return ctx.contact.meeting ? { label, href: ctx.contact.meeting, kind, variant: "secondary" } : null;
    // AI-driven intents route to the on-page Ask ZONO (no fabricated form endpoint).
    case "match": return { label, href: "#ask", kind, variant: "secondary" };
    case "valuation": return { label, href: "#ask", kind, variant: "secondary" };
    case "visit": return ctx.contact.whatsapp ? { label, href: wa(ctx.contact.whatsapp), kind, variant: "secondary" } : { label, href: "#ask", kind, variant: "secondary" };
  }
}

export function buildLanding(config: LandingConfig, ctx: LandingCtx): LandingView {
  const notes: string[] = [];

  // CTAs — de-duplicate by channel, first becomes primary.
  const seen = new Set<string>();
  const ctas: LandingCta[] = [];
  for (const kind of config.ctaKinds) {
    const c = ctaFor(kind, ctx);
    if (!c) continue;
    if (seen.has(c.href)) continue;
    seen.add(c.href);
    ctas.push({ ...c, variant: ctas.length === 0 ? "primary" : "secondary" });
  }
  if (ctas.length === 0) { ctas.push({ label: "שאל את ZONO", href: "#ask", kind: "match", variant: "primary" }); notes.push("אין ערוצי יצירת קשר מוגדרים — נותב ל-Ask ZONO."); }

  return {
    version: LANDING_VERSION,
    type: config.key,
    label: config.label,
    hero: {
      eyebrow: config.eyebrow,
      headline: ctx.title,
      subtitle: ctx.subtitle,
      badges: ctx.badges,
      aiSummary: ctx.aiSummary,
      cover: ctx.cover,
      logo: ctx.logo,
      stats: ctx.stats,
      ctas,
    },
    trust: { stats: ctx.stats, badges: ctx.badges },
    content: { highlights: ctx.highlights },
    showcase: ctx.showcase.slice(0, 8),
    faq: ctx.faq.slice(0, 8),
    ask: config.ask,
    stickyCta: ctas[0] ?? null,
    sections: config.sections,
    notes,
  };
}
