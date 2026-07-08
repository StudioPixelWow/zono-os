// ============================================================================
// 🌐 ZONO — AI Brokerage Website — HOME. 32.1 → UPGRADED 38.1 (Design System).
// Same evidence-only data (getHomeAi) + existing PropertyCard/Glass/AskWidget,
// recomposed with the shared premium ZONO site design system (SiteNav / SiteHero
// / SiteSection / StatBand / SiteFooter). Consistency over features. No new data.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHomeAi, seoForHome, themeVars } from "@/lib/brokerage-site";
import { JsonLd, Glass, PropertyCard } from "@/components/brokerage-site/ui";
import AskWidget from "@/components/brokerage-site/AskWidget";
import { SiteNav, SiteHero, SiteSection, SiteFooter, SiteEmptyState, SiteLeadCta } from "@/components/site-ui";
import { buildSiteNav } from "@/lib/site-ui/nav";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getHomeAi(slug);
  if (r === "disabled" || r === null) return { title: "אתר לא זמין" };
  const seo = seoForHome(r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function AiSiteHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getHomeAi(slug);
  if (r === "disabled") return <div className="text-muted p-16 text-center">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, home } = r;
  const seo = seoForHome(branding, "", slug);
  const nav = buildSiteNav(slug, branding, "ai-site");
  const areas = home.featuredAreas.map((a) => ({ name: a, href: `/ai-site/${slug}/neighborhood/${encodeURIComponent(a)}` }));

  return (
    <div style={themeVars(branding) as CSSProperties}>
      <JsonLd data={seo.jsonLd} />
      <SiteNav nav={nav} />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <SiteHero
          logo={branding.logo}
          cover={branding.cover}
          headline={home.hero.headline}
          subtitle={home.hero.subtitle}
          ctas={[{ label: "כל הנכסים", href: `/ai-site/${slug}/office`, variant: "primary" }, { label: "הצוות שלנו", href: `/ai-site/${slug}/office`, variant: "secondary" }, { label: "שאל את ZONO", href: "#ask", variant: "secondary" }]}
          stats={home.stats}
        />

        {/* Prominent smart matching / lead — the office's front-door conversion */}
        {(branding.whatsapp || branding.phone) && (
          <div className="pt-2 sm:pt-4">
            <SiteLeadCta name={branding.officeName} whatsapp={branding.whatsapp} phone={branding.phone}
              headline="ספרו לנו מה אתם מחפשים — נמצא לכם את הנכס"
              subtitle="כתבו בכמה מילים מה חשוב לכם (אזור, תקציב, חדרים) והצוות שלנו יחזור אליכם עם התאמות." />
          </div>
        )}

        {/* Featured properties */}
        <SiteSection id="featured" eyebrow="המלאי שלנו" title="נכסים מובילים" subtitle="נבחרת הנכסים המובילים — מתעדכנת אוטומטית"
          action={<Link href={`/ai-site/${slug}/office`} className="text-brand text-[12px] font-black">כל הנכסים ←</Link>}>
          {home.featured.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {home.featured.map((p) => <PropertyCard key={p.id} slug={slug} id={p.id} title={p.title} price={p.price} image={p.image} badge={p.badge} />)}
            </div>
          ) : <SiteEmptyState icon="🏠" title="אין כרגע נכסים להצגה" hint="המלאי מתעדכן אוטומטית — פנו אלינו ונשמח לעזור." />}
        </SiteSection>

        {/* Area expertise */}
        <SiteSection id="areas" eyebrow="מומחיות מקומית" title="אזורי הפעילות" subtitle="היכרות עמוקה עם השווקים שבהם אנחנו פועלים">
          <Glass className="p-5">
            <p className="text-ink text-[14px] leading-relaxed">{home.marketSummary}</p>
            {areas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {areas.map((a) => <Link key={a.name} href={a.href} className="bg-card border-line text-ink hover:border-brand zono-focus-ring rounded-full border px-3 py-1.5 text-[12px] font-bold transition">{a.name}</Link>)}
              </div>
            )}
          </Glass>
        </SiteSection>

        {/* Insights — evidence-only capabilities */}
        {home.insights.length > 0 && (
          <SiteSection eyebrow="תובנות ZONO" title="למה לבחור בנו" subtitle="יכולות אמיתיות — לא סיסמאות שיווקיות">
            <div className="grid gap-4 sm:grid-cols-2">
              {home.insights.map((b, i) => (
                <Glass key={i} className="p-5">
                  <h3 className="text-ink text-[16px] font-black">{b.title}</h3>
                  <p className="text-muted mt-1.5 text-[13px] leading-relaxed">{b.body}</p>
                  {b.cta && <Link href={`/ai-site/${slug}/${b.cta.href}`} className="text-brand mt-3 inline-block text-[12px] font-black">{b.cta.label} ←</Link>}
                </Glass>
              ))}
            </div>
          </SiteSection>
        )}

        {/* Ask ZONO */}
        <SiteSection id="ask" eyebrow="בינה מלאכותית" title="שאל את ZONO" subtitle="קבל תשובות מיידיות על המלאי, המחירים והאזורים">
          <AskWidget slug={slug} office={branding.officeName} suggestions={["אילו דירות 4 חדרים יש?", "מה המחירים בלב העיר?", "יש נכסי יוקרה?", "המלצות להשקעה?"]} />
        </SiteSection>
      </main>

      <SiteFooter nav={nav} areas={areas} />
    </div>
  );
}
