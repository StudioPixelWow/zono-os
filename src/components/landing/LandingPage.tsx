// ============================================================================
// 🎯 ZONO AI Landing Experience™ — LandingPage renderer (server-safe). 38.3.
// ONE component renders EVERY landing type, entirely through the shared site-ui
// (SiteNav / SiteHero / SiteSection / SiteFooter) + existing PropertyCard / Glass
// / AskWidget. Same premium visual language as the office & agent sites — no
// bespoke styling, no new renderer. Sticky + floating CTA for conversion.
// ============================================================================
import type { CSSProperties } from "react";
import { themeVars } from "@/lib/brokerage-site";
import type { SiteBranding } from "@/lib/brokerage-site/types";
import { JsonLd, Glass, PropertyCard } from "@/components/brokerage-site/ui";
import AskWidget from "@/components/brokerage-site/AskWidget";
import { SiteNav, SiteHero, SiteSection, SiteFooter, StatBand, type HeroCta } from "@/components/site-ui";
import { buildSiteNav, type SiteBrandingLite } from "@/lib/site-ui/nav";
import type { LandingView, LandingBadge } from "@/lib/landing/types";

const toneCls: Record<LandingBadge["tone"], string> = {
  brand: "bg-brand-soft text-brand", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", neutral: "bg-surface text-muted",
};

function Badges({ badges }: { badges: LandingBadge[] }) {
  if (!badges.length) return null;
  return <div className="flex flex-wrap gap-2">{badges.map((b, i) => <span key={i} className={`rounded-full px-3 py-1 text-[11px] font-black ${toneCls[b.tone]}`}>{b.label}</span>)}</div>;
}

export function LandingPage({ view, branding, slug, jsonLd }: { view: LandingView; branding: SiteBranding; slug: string; jsonLd: Record<string, unknown>[] }) {
  const navBranding: SiteBrandingLite = { officeName: branding.officeName, logo: branding.logo, phone: branding.phone, whatsapp: branding.whatsapp, email: branding.email, address: branding.address };
  const nav = buildSiteNav(slug, navBranding, "ai-site");
  const heroCtas: HeroCta[] = view.hero.ctas.map((c) => ({ label: c.label, href: c.href, variant: c.variant }));
  const trustBadgeLabels = view.hero.badges.filter((b) => b.tone === "brand" || b.tone === "success").map((b) => b.label);
  const rest = view.sections.filter((s) => s !== "hero");

  return (
    <div style={themeVars(branding) as CSSProperties} className="pb-20">
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

        {rest.map((section) => {
          if (section === "trust") {
            if (!view.hero.aiSummary && view.trust.stats.length === 0 && view.trust.badges.length === 0) return null;
            return (
              <SiteSection key="trust" eyebrow="למה זה משתלם" title="הנתונים מדברים">
                {view.trust.stats.length > 0 && <StatBand stats={view.trust.stats} />}
                {(view.hero.aiSummary || view.trust.badges.length > 0) && (
                  <Glass className="mt-4 p-5">
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
                    <Glass key={i} className="flex items-start gap-3 p-4"><span className="text-brand text-lg">✓</span><p className="text-ink text-[14px] font-semibold">{h}</p></Glass>
                  ))}
                </div>
              </SiteSection>
            );
          }
          if (section === "showcase") {
            if (view.showcase.length === 0) return null;
            return (
              <SiteSection key="showcase" eyebrow="נכסים" title="גם אלה עשויים לעניין">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {view.showcase.map((p) => <PropertyCard key={p.id} slug={slug} id={p.id} title={p.title} price={p.price} image={p.image} badge={p.badge} />)}
                </div>
              </SiteSection>
            );
          }
          if (section === "faq") {
            if (view.faq.length === 0) return null;
            return (
              <SiteSection key="faq" eyebrow="שאלות" title="שאלות נפוצות">
                <div className="space-y-2">{view.faq.map((f, i) => <Glass key={i} className="p-4"><div className="text-ink text-[14px] font-black">{f.q}</div><p className="text-muted mt-1 text-[13px]">{f.a}</p></Glass>)}</div>
              </SiteSection>
            );
          }
          if (section === "ask") {
            return (
              <SiteSection key="ask" id="ask" eyebrow="בינה מלאכותית" title="שאל את ZONO">
                <AskWidget slug={slug} office={branding.officeName} suggestions={view.ask} />
              </SiteSection>
            );
          }
          return null;
        })}
      </main>

      <SiteFooter nav={nav} areas={[]} />

      {/* Sticky conversion CTA (Part 7) */}
      {view.stickyCta && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-6xl px-4 pb-3">
          <a href={view.stickyCta.href} className="btn-zono-primary zono-focus-ring block rounded-2xl px-5 py-3.5 text-center text-[15px] font-black text-white shadow-[var(--shadow-lift)]">{view.stickyCta.label}</a>
        </div>
      )}
    </div>
  );
}
