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
import { SiteNav, SiteHero, SiteSection, SiteFooter, SiteEmptyState, SiteLeadCta, OfficeBrandMark, type HeroCta } from "@/components/site-ui";
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
            <div className="flex flex-col gap-4">
              <AgentSpotlight slug={slug} p={home.featured[0]} />
              {home.featured.length > 1 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {home.featured.slice(1, 7).map((p) => <PropertyCard key={p.id} slug={slug} id={p.id} title={p.title} price={p.price} image={p.image} badge={p.badge} base="ai-agent" />)}
                </div>
              )}
            </div>
          ) : <SiteEmptyState icon="🏠" title="אין כרגע נכסים להצגה" hint="המלאי מתעדכן אוטומטית — חזרו בקרוב או פנו אליי ישירות." />}
        </SiteSection>

        {/* Premium conversion — smart matching → WhatsApp (real, no fake form) */}
        {(branding.whatsapp || branding.phone) && (
          <div className="pt-2 sm:pt-4">
            <SiteLeadCta name={branding.brokerName} whatsapp={branding.whatsapp} phone={branding.phone}
              headline={`ספר/י לי מה את/ה מחפש/ת — ${branding.brokerName} ימצא לך התאמה`} />
          </div>
        )}

        {/* About me + office affiliation (office logo adds trust, not dominates) */}
        <SiteSection id="about" eyebrow="קצת עליי" title="הסיפור שלי">
          <Glass className="p-5 sm:p-6">
            <p className="text-ink text-[14px] leading-relaxed sm:text-[15px]">{home.intro}</p>
            <div className="border-line mt-4 flex items-center gap-3 border-t pt-4">
              <span className="text-muted text-[12px] font-bold">בשיתוף</span>
              <OfficeBrandMark name={branding.officeName} logo={branding.logo} variant="lockup" surface="light" size="sm" />
            </div>
          </Glass>
        </SiteSection>

        {/* Areas of expertise — premium visual cards → area guides */}
        {areas.length > 0 && (
          <SiteSection id="areas" eyebrow="מומחיות מקומית" title="האזורים שלי" subtitle="היכרות מעמיקה עם השווקים שאני מלווה">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {areas.map((a) => <AgentAreaCard key={a.name} name={a.name} href={a.href} />)}
            </div>
          </SiteSection>
        )}

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

// ── Local luxury pieces (agent home only; real data, hide-when-empty) ─────────
const fmtIls = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);
const A_GRADIENT = "var(--site-gradient, linear-gradient(135deg,#7c3aed,#a78bfa))";
const A_ACCENT = "var(--site-accent, #7c3aed)";

function AgentSpotlight({ slug, p }: { slug: string; p: { id: string; title: string; price: number | null; image: string | null; badge: string | null } }) {
  return (
    <Link href={`/ai-agent/${slug}/property/${p.id}`} className="group relative block overflow-hidden rounded-[26px] shadow-[var(--shadow-lift)]">
      <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
        {p.image
          /* eslint-disable-next-line @next/next/no-img-element -- external CDN listing photo */
          ? <img src={p.image} alt={p.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
          : <div className="absolute inset-0" style={{ background: A_GRADIENT }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        {p.badge && <span className="absolute end-4 top-4 rounded-full bg-white/92 px-3 py-1 text-[11px] font-black shadow-sm" style={{ color: A_ACCENT }}>{p.badge}</span>}
        <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
          <p className="text-[12px] font-bold text-white/70">נכס נבחר</p>
          <h3 className="mt-0.5 max-w-2xl text-xl font-black leading-tight drop-shadow-sm sm:text-3xl">{p.title}</h3>
          {fmtIls(p.price) && <div className="mt-2 inline-flex items-baseline rounded-2xl bg-white/95 px-4 py-1.5 shadow-lg"><span className="text-xl font-black sm:text-2xl" style={{ color: A_ACCENT }}>{fmtIls(p.price)}</span></div>}
        </div>
      </div>
    </Link>
  );
}

function AgentAreaCard({ name, href }: { name: string; href: string }) {
  return (
    <Link href={href} className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-3xl border border-white/50 p-4 text-white shadow-[var(--shadow-card)] transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]" style={{ background: A_GRADIENT }}>
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
      <div className="relative">
        <p className="text-[11px] font-bold text-white/75">מדריך אזור</p>
        <p className="text-lg font-black leading-tight">{name}</p>
      </div>
    </Link>
  );
}
