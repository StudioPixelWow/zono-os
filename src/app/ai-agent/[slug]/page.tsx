// ============================================================================
// 👤 ZONO — AI Agent Website — BROKER HOME. 32.2 → UPGRADED 38.2 (Design System).
// Same evidence-only data (getAgentHomeAi) + existing PropertyCard/Glass/AskWidget,
// recomposed with the shared premium ZONO site design system (SiteNav / SiteHero
// with portrait / SiteSection / StatBand / SiteFooter). Personal, trust-first,
// conversion-focused. Consistency with the office site. No new data, no schema.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentHomeAi, seoForAgentHome } from "@/lib/agent-site";
import { themeVars } from "@/lib/brokerage-site";
import { JsonLd, Glass, PropertyCard } from "@/components/brokerage-site/ui";
import AskWidget from "@/components/brokerage-site/AskWidget";
import { SiteNav, SiteHero, SiteSection, SiteFooter, SiteEmptyState, type HeroCta } from "@/components/site-ui";
import { buildSiteNav, type SiteBrandingLite } from "@/lib/site-ui/nav";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getAgentHomeAi(slug);
  if (r === "disabled" || r === null) return { title: "אתר לא זמין" };
  const seo = seoForAgentHome(r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

const wa = (n: string) => `https://wa.me/${n.replace(/[^0-9]/g, "")}`;

export default async function AgentHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getAgentHomeAi(slug);
  if (r === "disabled") return <div className="text-muted p-16 text-center">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, home } = r;
  const seo = seoForAgentHome(branding, "", slug);

  // Nav brand = the AGENT (photo + name); footer address line = the office.
  const navBranding: SiteBrandingLite = { officeName: branding.brokerName, logo: branding.photo, phone: branding.phone, whatsapp: branding.whatsapp, email: branding.email, address: branding.officeName };
  const nav = buildSiteNav(slug, navBranding, "ai-agent");
  const areas = home.topAreas.map((a) => ({ name: a, href: `/ai-agent/${slug}/area/${encodeURIComponent(a)}` }));

  const ctas: HeroCta[] = [
    branding.whatsapp ? { label: "וואטסאפ", href: wa(branding.whatsapp), variant: "primary" } : { label: "הנכסים שלי", href: `/ai-agent/${slug}/properties`, variant: "primary" },
    { label: "אודות", href: `/ai-agent/${slug}/about`, variant: "secondary" },
    branding.calendarLink ? { label: "קביעת פגישה", href: branding.calendarLink, variant: "secondary" } : { label: "שאל אותי", href: "#ask", variant: "secondary" },
  ];

  return (
    <div style={themeVars(branding) as CSSProperties}>
      <JsonLd data={seo.jsonLd} />
      <SiteNav nav={nav} />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <SiteHero
          logo={null}
          cover={branding.cover}
          portrait={branding.photo}
          eyebrow={`${home.hero.office}${home.hero.specialty ? ` · ${home.hero.specialty}` : ""}`}
          headline={home.hero.name}
          subtitle={`${home.hero.title ? `${home.hero.title} · ` : ""}${home.hero.tagline}`}
          chips={home.hero.focus}
          ctas={ctas}
          stats={home.stats}
        />

        {/* Featured listings */}
        <SiteSection id="featured" eyebrow="בייצוגי" title="נכסים מובילים" subtitle="נכסים נבחרים שאני מלווה — מתעדכן אוטומטית"
          action={<Link href={`/ai-agent/${slug}/properties`} className="text-brand text-[12px] font-black">כל הנכסים ←</Link>}>
          {home.featured.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {home.featured.map((p) => <PropertyCard key={p.id} slug={slug} id={p.id} title={p.title} price={p.price} image={p.image} badge={p.badge} base="ai-agent" />)}
            </div>
          ) : <SiteEmptyState icon="🏠" title="אין כרגע נכסים להצגה" hint="המלאי מתעדכן אוטומטית." />}
        </SiteSection>

        {/* About me + areas */}
        <SiteSection id="areas" eyebrow="קצת עליי" title="הסיפור והאזורים שלי">
          <Glass className="p-5">
            <p className="text-ink text-[14px] leading-relaxed">{home.intro}</p>
            {areas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {areas.map((a) => <Link key={a.name} href={a.href} className="bg-card border-line text-ink hover:border-brand zono-focus-ring rounded-full border px-3 py-1.5 text-[12px] font-bold transition">{a.name}</Link>)}
              </div>
            )}
          </Glass>
        </SiteSection>

        {/* AI insights — evidence-only */}
        {home.insights.length > 0 && (
          <SiteSection eyebrow="תובנות ZONO" title="מומחיות מבוססת נתונים" subtitle="הכל מבוסס ראיות — לא סיסמאות">
            <div className="grid gap-4 sm:grid-cols-2">
              {home.insights.map((b, i) => (
                <Glass key={i} className="p-5">
                  <h3 className="text-ink text-[16px] font-black">{b.title}</h3>
                  <p className="text-muted mt-1.5 text-[13px] leading-relaxed">{b.body}</p>
                  {b.evidence.length > 0 && <p className="text-muted mt-2 text-[11px]">מבוסס על: {b.evidence.join(" · ")}</p>}
                </Glass>
              ))}
            </div>
          </SiteSection>
        )}

        {/* Personal AI assistant */}
        <SiteSection id="ask" eyebrow="עוזר אישי" title={`שאל את ${branding.brokerName}`} subtitle="תשובות מיידיות על הנכסים, האזורים והתהליך">
          <AskWidget slug={slug} office={branding.brokerName} apiBase="agent-site" title={`שאל את ${branding.brokerName}`} suggestions={["אילו נכסים יש לך?", `ספר לי על ${home.topAreas[0] ?? "האזור"}`, "המלצות לקנייה?", "מה כדאי לדעת לפני מכירה?"]} />
        </SiteSection>
      </main>

      <SiteFooter nav={nav} areas={areas} />
    </div>
  );
}
