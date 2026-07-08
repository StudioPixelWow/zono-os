// ============================================================================
// 🎯 ZONO AI Landing Experience™ — LandingPage renderer (server-safe). 38.4.
// ONE component renders EVERY landing type through the shared site-ui
// (SiteNav / SiteHero / SiteSection / SiteFooter / SiteLeadCta) + existing
// PropertyCard / Glass / AskWidget — no bespoke styling, no new renderer.
// Conversion-first: a cinematic campaign hero with ONE primary CTA above the
// fold, then a premium SiteLeadCta capture moment, campaign context, showcase,
// and Ask ZONO. Trust / FAQ render ONLY when real evidence exists; thin
// campaigns fall back to premium empty states — never fabricated proof.
// ============================================================================
import type { CSSProperties } from "react";
import { themeVars } from "@/lib/brokerage-site";
import type { SiteBranding } from "@/lib/brokerage-site/types";
import { JsonLd, Glass, PropertyCard } from "@/components/brokerage-site/ui";
import AskWidget from "@/components/brokerage-site/AskWidget";
import { SiteNav, SiteHero, SiteSection, SiteFooter, StatBand, SiteEmptyState, SiteLeadCta, type HeroCta } from "@/components/site-ui";
import { buildSiteNav, type SiteBrandingLite } from "@/lib/site-ui/nav";
import type { LandingView, LandingBadge, LandingType } from "@/lib/landing/types";

const toneCls: Record<LandingBadge["tone"], string> = {
  brand: "bg-brand-soft text-brand", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", neutral: "bg-surface text-muted",
};

function Badges({ badges }: { badges: LandingBadge[] }) {
  if (!badges.length) return null;
  return <div className="flex flex-wrap gap-2">{badges.map((b, i) => <span key={i} className={`rounded-full px-3 py-1 text-[11px] font-black ${toneCls[b.tone]}`}>{b.label}</span>)}</div>;
}

/** Campaign-aware lead-capture copy — one clear conversion message per intent.
 *  Evidence-neutral (no fabricated claims); just frames the ask for this type. */
function leadCopy(type: LandingType): { headline: string; subtitle: string } {
  switch (type) {
    case "seller_recruitment":
      return { headline: "שוקלים למכור? נתחיל מהערכת שווי מדויקת", subtitle: "כתבו לנו על הנכס (כתובת, חדרים, קומה) ונחזור אליכם עם טווח מחיר ריאלי — ללא התחייבות." };
    case "valuation":
      return { headline: "רוצים לדעת כמה שווה הנכס שלכם?", subtitle: "כתבו לנו כמה פרטים על הנכס ונחזור אליכם עם הערכת שווי מבוססת נתוני שוק." };
    case "buyer_recruitment":
      return { headline: "ספרו לנו מה אתם מחפשים — ונמצא לכם התאמה", subtitle: "אזור, תקציב ומספר חדרים בכמה מילים, ונחזור אליכם עם נכסים שמתאימים בדיוק לכם." };
    case "investment":
      return { headline: "מחפשים הזדמנות השקעה? נבנה לכם תיק מתאים", subtitle: "ספרו לנו על התקציב ויעדי התשואה ונחזור אליכם עם הזדמנויות רלוונטיות באזור." };
    case "neighborhood": case "area": case "market_report":
      return { headline: "רוצים להכיר את האזור לעומק?", subtitle: "כתבו לנו מה חשוב לכם באזור ונחזור אליכם עם נתונים, מחירים ונכסים מתאימים." };
    case "open_house": case "new_listing": case "price_reduction": case "property": case "luxury": case "project":
      return { headline: "מעוניינים בנכס? קבעו צפייה עוד היום", subtitle: "השאירו הודעה קצרה ונחזור אליכם לתיאום צפייה ולכל שאלה על הנכס." };
    default:
      return { headline: "רוצים שנחזור אליכם?", subtitle: "כתבו לנו בכמה מילים מה חשוב לכם ונחזור אליכם באופן אישי." };
  }
}

export function LandingPage({ view, branding, slug, jsonLd }: { view: LandingView; branding: SiteBranding; slug: string; jsonLd: Record<string, unknown>[] }) {
  const navBranding: SiteBrandingLite = { officeName: branding.officeName, logo: branding.logo, phone: branding.phone, whatsapp: branding.whatsapp, email: branding.email, address: branding.address };
  const nav = buildSiteNav(slug, navBranding, "ai-site");

  // ONE strong CTA above the fold — the campaign's primary intent only. Extra
  // channels are folded into the lead-capture card and Ask ZONO below, so the
  // hero stays a single, unambiguous conversion path (not five weak CTAs).
  const primaryCta = view.hero.ctas[0];
  const heroCtas: HeroCta[] = primaryCta ? [{ label: primaryCta.label, href: primaryCta.href, variant: "primary" }] : [];
  const trustBadgeLabels = view.hero.badges.filter((b) => b.tone === "brand" || b.tone === "success").map((b) => b.label);
  const rest = view.sections.filter((s) => s !== "hero");
  const hasContact = !!(branding.whatsapp || branding.phone);
  const lead = leadCopy(view.type);

  return (
    <div style={themeVars(branding) as CSSProperties} className="pb-24">
      <JsonLd data={jsonLd} />
      <SiteNav nav={nav} />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <SiteHero
          logo={view.hero.logo}
          cover={view.hero.cover}
          eyebrow={view.hero.eyebrow}
          headline={view.hero.headline}
          subtitle={view.hero.subtitle}
          trustBadges={trustBadgeLabels}
          ctas={heroCtas}
          stats={view.hero.stats}
        />

        {/* Primary conversion moment — a premium, prefilled lead capture. When no
            contact channel exists we route the visitor to Ask ZONO instead of a
            dead form. */}
        {hasContact ? (
          <SiteSection className="pt-2">
            <SiteLeadCta name={branding.officeName} whatsapp={branding.whatsapp} phone={branding.phone}
              headline={lead.headline} subtitle={lead.subtitle} />
          </SiteSection>
        ) : (
          <SiteSection eyebrow="נשמח לעזור" title="דברו איתנו" className="pt-2">
            <SiteEmptyState icon="💬" title="שאלה על הקמפיין? ZONO כאן בשבילכם"
              hint="שאלו כל דבר על הנכס, האזור או ההזדמנות — ותקבלו תשובה מיידית למטה."
              action={<a href="#ask" className="btn-zono-primary zono-focus-ring rounded-xl px-5 py-2.5 text-[14px] font-black text-white">שאל את ZONO ←</a>} />
          </SiteSection>
        )}

        {rest.map((section) => {
          if (section === "trust") {
            if (!view.hero.aiSummary && view.trust.stats.length === 0 && view.trust.badges.length === 0) return null;
            return (
              <SiteSection key="trust" eyebrow="למה זה משתלם" title="הנתונים מדברים">
                {view.trust.stats.length > 0 && <StatBand stats={view.trust.stats} />}
                {(view.hero.aiSummary || view.trust.badges.length > 0) && (
                  <Glass className="mt-4 p-5 sm:p-6">
                    <Badges badges={view.trust.badges} />
                    {view.hero.aiSummary && <p className="text-ink mt-2 text-[14px] leading-relaxed">{view.hero.aiSummary}</p>}
                  </Glass>
                )}
              </SiteSection>
            );
          }
          if (section === "content") {
            if (view.content.highlights.length === 0) return null;
            return (
              <SiteSection key="content" eyebrow="מה מייחד" title="נקודות מפתח">
                <div className="grid gap-3 sm:grid-cols-2">
                  {view.content.highlights.map((h, i) => (
                    <Glass key={i} className="flex items-start gap-3 p-4 sm:p-5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-black text-white shadow-[var(--shadow-soft)]" style={{ background: "var(--site-gradient)" }}>✓</span>
                      <p className="text-ink pt-0.5 text-[14px] font-semibold leading-relaxed">{h}</p>
                    </Glass>
                  ))}
                </div>
              </SiteSection>
            );
          }
          if (section === "showcase") {
            return (
              <SiteSection key="showcase" eyebrow="נכסים" title="נכסים שעשויים לעניין אתכם" subtitle="מבחר נכסים רלוונטיים — מתעדכן אוטומטית">
                {view.showcase.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {view.showcase.map((p) => <PropertyCard key={p.id} slug={slug} id={p.id} title={p.title} price={p.price} image={p.image} badge={p.badge} />)}
                  </div>
                ) : (
                  <SiteEmptyState icon="🏠" title="נכסים נוספים בדרך"
                    hint="המלאי מתעדכן אוטומטית. השאירו פרטים ונעדכן אתכם ברגע שיהיה נכס מתאים." />
                )}
              </SiteSection>
            );
          }
          if (section === "faq") {
            if (view.faq.length === 0) return null;
            return (
              <SiteSection key="faq" eyebrow="שאלות" title="שאלות נפוצות">
                <div className="space-y-2">{view.faq.map((f, i) => <Glass key={i} className="p-4 sm:p-5"><div className="text-ink text-[14px] font-black">{f.q}</div><p className="text-muted mt-1 text-[13px] leading-relaxed">{f.a}</p></Glass>)}</div>
              </SiteSection>
            );
          }
          if (section === "ask") {
            return (
              <SiteSection key="ask" id="ask" eyebrow="בינה מלאכותית" title="שאל את ZONO" subtitle="תשובות מיידיות על הנכס, האזור וההזדמנות">
                <AskWidget slug={slug} office={branding.officeName} suggestions={view.ask} />
              </SiteSection>
            );
          }
          return null;
        })}
      </main>

      <SiteFooter nav={nav} areas={[]} />

      {/* Persistent single-CTA conversion bar — mirrors the hero's one primary
          action so the campaign's next step is always one tap away (mobile). */}
      {view.stickyCta && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-6xl px-4 pb-3">
          <a href={view.stickyCta.href} className="btn-zono-primary zono-focus-ring block rounded-2xl px-5 py-3.5 text-center text-[15px] font-black text-white shadow-[var(--shadow-lift)]">{view.stickyCta.label}</a>
        </div>
      )}
    </div>
  );
}
