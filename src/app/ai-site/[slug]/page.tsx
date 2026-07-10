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
          brandName={branding.officeName}
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

        {/* Featured properties — a large spotlight + a curated grid (no dense grid) */}
        <SiteSection id="featured" eyebrow="המלאי שלנו" title="נכסים מובילים" subtitle="נבחרת הנכסים המובילים — מתעדכנת אוטומטית"
          action={<Link href={`/ai-site/${slug}/office`} className="text-brand text-[12px] font-black">כל הנכסים ←</Link>}>
          {home.featured.length > 0 ? (
            <div className="flex flex-col gap-4">
              <SpotlightCard slug={slug} p={home.featured[0]} />
              {home.featured.length > 1 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {home.featured.slice(1, 7).map((p) => <PropertyCard key={p.id} slug={slug} id={p.id} title={p.title} price={p.price} image={p.image} badge={p.badge} />)}
                </div>
              )}
            </div>
          ) : <SiteEmptyState icon="🏠" title="אין כרגע נכסים להצגה" hint="המלאי מתעדכן אוטומטית — פנו אלינו ונשמח לעזור." />}
        </SiteSection>

        {/* Market intelligence — real, public-safe summary only (no fake charts) */}
        <SiteSection id="market" eyebrow="אינטליגנציית שוק" title="המצב בשטח" subtitle="קריאת שוק מבוססת נתונים אמיתיים — מתעדכנת אוטומטית">
          <section className="relative overflow-hidden rounded-[24px] border border-[#243056] bg-[linear-gradient(120deg,#0b1220,#141b33_55%,#0b1220)] p-6 text-white shadow-[var(--shadow-lift)] sm:p-8">
            <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.4),transparent_70%)] blur-2xl" />
            <p className="relative max-w-3xl text-[15px] leading-relaxed text-white/90 sm:text-lg">{home.marketSummary}</p>
          </section>
        </SiteSection>

        {/* Areas of expertise — premium visual cards → neighborhood guides */}
        {areas.length > 0 && (
          <SiteSection id="areas" eyebrow="מומחיות מקומית" title="אזורי הפעילות" subtitle="היכרות עמוקה עם השווקים שבהם אנחנו פועלים">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {areas.map((a) => <AreaCard key={a.name} name={a.name} href={a.href} />)}
            </div>
          </SiteSection>
        )}

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

// ── Local luxury pieces (office home only; real data, hide-when-empty) ────────
const fmtIls = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);
const O_GRADIENT = "var(--site-gradient, linear-gradient(135deg,#7c3aed,#a78bfa))";
const O_ACCENT = "var(--site-accent, #7c3aed)";

/** A large cinematic spotlight for the single most-featured property. */
function SpotlightCard({ slug, p }: { slug: string; p: { id: string; title: string; price: number | null; image: string | null; badge: string | null } }) {
  return (
    <Link href={`/ai-site/${slug}/property/${p.id}`} className="group relative block overflow-hidden rounded-[26px] shadow-[var(--shadow-lift)]">
      <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
        {p.image
          /* eslint-disable-next-line @next/next/no-img-element -- external CDN listing photo */
          ? <img src={p.image} alt={p.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
          : <div className="absolute inset-0" style={{ background: O_GRADIENT }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        {p.badge && <span className="absolute end-4 top-4 rounded-full bg-white/92 px-3 py-1 text-[11px] font-black shadow-sm" style={{ color: O_ACCENT }}>{p.badge}</span>}
        <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
          <p className="text-[12px] font-bold text-white/70">נכס נבחר</p>
          <h3 className="mt-0.5 max-w-2xl text-xl font-black leading-tight drop-shadow-sm sm:text-3xl">{p.title}</h3>
          {fmtIls(p.price) && <div className="mt-2 inline-flex items-baseline rounded-2xl bg-white/95 px-4 py-1.5 shadow-lg"><span className="text-xl font-black sm:text-2xl" style={{ color: O_ACCENT }}>{fmtIls(p.price)}</span></div>}
        </div>
      </div>
    </Link>
  );
}

/** An elegant area card linking to the neighborhood guide (no fabricated counts). */
function AreaCard({ name, href }: { name: string; href: string }) {
  return (
    <Link href={href} className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-3xl border border-white/50 p-4 text-white shadow-[var(--shadow-card)] transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]" style={{ background: O_GRADIENT }}>
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
      <div className="relative">
        <p className="text-[11px] font-bold text-white/75">מדריך אזור</p>
        <p className="text-lg font-black leading-tight">{name}</p>
      </div>
    </Link>
  );
}
