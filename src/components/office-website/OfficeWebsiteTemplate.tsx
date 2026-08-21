// ============================================================================
// ZONO Office Website 2.2 — the ONE canonical office template (server component).
// STRUCTURE = ZONO · IDENTITY = office brand · PEOPLE = office agents ·
// CONTENT = live office data. Premium local-brokerage brand: an editorial hero,
// TWO distinct journeys (seller → canonical valuation, buyer → inventory/contact),
// a brand-color seller conversion moment, varied composition (not card-grid
// rhythm), and real agent↔property↔area attribution. All data is real; every
// section renders, falls back, or hides — never fabricates. Brand color appears
// in exactly two major moments (hero accent + seller section); the rest is calm.
// ============================================================================
import Link from "next/link";
import type { OfficeSitePayload, OfficeTeamMember, OfficeProperty, OfficeArea } from "@/lib/office-website/site-data";
import { AgentHeader, type HeaderNavItem } from "@/components/agent-website/AgentHeader";
import { PropertySearch } from "@/components/agent-website/PropertySearch";
import { ExpertiseMap } from "@/components/agent-website/ExpertiseMap";
import { MobileStickyCta } from "@/components/agent-website/MobileStickyCta";
import { SectionShell, TextLink, money } from "@/components/agent-website/ui";
import { OfficePropertyCard, TeamCard, OfficeTestimonialCard, AreaAgentAvatars } from "./ui";
import { PublicIcon } from "@/components/public-site/PublicIcon";
import { SiteLeadForm } from "@/app/site/[slug]/SiteLeadForm";

// The brokerage operating model — a real SEQUENCE the office runs (not one agent).
const PROCESS: { title: string; text: string }[] = [
  { title: "היכרות", text: "פגישה ושיחה על הצרכים, המטרות ולוח הזמנים שלכם." },
  { title: "הערכת הנכס", text: "ניתוח מקומי של שווי הנכס והמלצת אסטרטגיית שיווק." },
  { title: "שיווק ואיתור", text: "חשיפה מקצועית מול הקהל הרלוונטי — ומאגר קונים של המשרד." },
  { title: "משא ומתן", text: "ליווי צמוד במו״מ להשגת התנאים הטובים ביותר עבורכם." },
  { title: "סגירה", text: "ליווי משפטי ומנהלי עד למסירת המפתח." },
];

// Anchor targets — seller and buyer are DISTINCT journeys (never the same CTA dest).
const SELLER_ANCHOR = "#seller-valuation";
const BUYER_ANCHOR = "#properties";

export function OfficeWebsiteTemplate({ data }: { data: OfficeSitePayload }) {
  const { office, brand, slug } = data;
  const S = data.sections; const on = (k: string) => S[k] !== false;
  const propertiesHref = `/site/${slug}/properties`;
  const primaryArea = data.areas[0]?.name ?? null;
  const types = Array.from(new Set([...data.featured, ...data.recommended].map((p) => p.type))).filter(Boolean);
  const areaNames = data.areas.map((a) => a.name);
  const agentCount = data.team.length;

  const nav: HeaderNavItem[] = [
    { href: "#top", label: "ראשי" },
    { href: "#properties", label: "נכסים" },
    ...(data.team.length ? [{ href: "#team", label: "הצוות" }] : []),
    { href: "#areas", label: "אזורים" },
    { href: "#about", label: "אודות" },
    { href: "#contact", label: "צור קשר" },
  ];

  return (
    <div id="top" dir="rtl" style={{ ...(brand.tokens as Record<string, string>) }} className="min-h-screen bg-[var(--brand-background)] text-[var(--brand-text)] antialiased">
      <AgentHeader brandName={office.name} logo={brand.logo} nav={nav} whatsapp={office.whatsapp} tel={office.tel} phoneLabel={office.phone} cta={{ href: SELLER_ANCHOR, label: "בדיקת שווי" }} />

      {/* A · OFFICE HERO — editorial, brand accent, seller-primary */}
      {on("hero") && <Hero data={data} />}

      {/* B · PROPERTY SEARCH (buyer entry) */}
      <div className="relative z-10"><PropertySearch slug={slug} areas={areaNames} types={types} basePath="/site" /></div>

      {/* C · TRUST STRIP — horizontal proof band */}
      {data.proofPoints.length >= 2 && <TrustStrip data={data} />}

      {/* D · TEAM — the people are a core product (editorial grid) */}
      {on("agents") && agentCount === 1 && <FeaturedAgent member={data.team[0]} />}
      {on("agents") && agentCount > 1 && (
        <SectionShell id="team" eyebrow="הצוות" title="הצוות שמכיר את האזור" subtitle="סוכנים מקומיים · התמחות אמיתית · משרד אחד שעובד בשבילכם" tone="surface" action={agentCount > 8 ? <TextLink href={`/site/${slug}/agents`}>לכל הצוות ←</TextLink> : undefined}>
          <div className={agentCount <= 3
            ? "flex flex-wrap justify-center gap-6 [&>*]:w-full [&>*]:max-w-[280px] sm:[&>*]:w-[280px]"
            : "grid grid-cols-2 gap-5 lg:grid-cols-4 lg:gap-6"}>{data.team.slice(0, 8).map((m) => <TeamCard key={m.id} member={m} />)}</div>
        </SectionShell>
      )}

      {/* E · FEATURED INVENTORY (curated, agent-attributed) */}
      {on("featured_properties") && (
        data.featured.length > 0 ? (
          <SectionShell id="properties" eyebrow="נכסי המשרד" title="נכסים נבחרים" subtitle="מבחר מתוך האינוונטר של המשרד — לכל נכס סוכן אחראי" action={<TextLink href={propertiesHref}>כל נכסי המשרד ←</TextLink>}>
            {data.featured.length === 1
              ? <FeaturedProperty property={data.featured[0]} />
              : (
                // Editorial break-the-grid: one large hero listing + a supporting grid.
                <div className="flex flex-col gap-6">
                  <FeaturedProperty property={data.featured[0]} />
                  {data.featured.length > 1 && (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">{data.featured.slice(1, 7).map((p) => <OfficePropertyCard key={p.id} property={p} />)}</div>
                  )}
                </div>
              )}
          </SectionShell>
        ) : data.recommended.length === 0 ? <BuyerCta data={data} /> : null
      )}

      {/* F · SELLER VALUATION — the brand-color conversion moment (canonical valuation flow) */}
      <SellerValuationSection data={data} />

      {/* G · AREAS OF EXPERTISE (bento) + MAP (editorial split) */}
      {on("market_expertise") && data.areas.length > 0 && <AreasExpertise data={data} propertiesHref={propertiesHref} />}
      {on("market_expertise") && data.mapPoints.length > 0 && (
        <ExpertiseMap sectionId="areas-map" points={data.mapPoints} areas={data.areas.map((a) => ({ name: a.name, deals: null, inventory: a.properties }))} primaryArea={primaryArea} propertiesHref={propertiesHref} />
      )}

      {/* H · RECENT SUCCESS — horizontal proof band (public-safe) */}
      {data.recentSold.length > 0 && <RecentSold items={data.recentSold} />}

      {/* I · HOW THE OFFICE WORKS — process timeline */}
      {on("why_us") && <ProcessTimeline />}

      {/* J · ABOUT — editorial office story + manager + stats */}
      {(office.description || data.manager) && <About data={data} />}

      {/* K · TESTIMONIALS (only when real, agent-linked) */}
      {on("testimonials") && data.testimonials.length > 0 && (
        <SectionShell id="testimonials" eyebrow="המלצות" title="הלקוחות שלנו מספרים" tone="surface">
          {/* One hero review + compact supporting proof (not a flat 3-up grid). */}
          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
            <OfficeTestimonialCard t={data.testimonials[0]} featured />
            {data.testimonials.length > 1 && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">{data.testimonials.slice(1, 3).map((t, i) => <OfficeTestimonialCard key={i} t={t} />)}</div>
            )}
          </div>
        </SectionShell>
      )}

      {/* L · MORE PROPERTIES */}
      {data.recommended.length > 0 && (
        <SectionShell title="עוד נכסים מהמשרד" action={<TextLink href={propertiesHref}>כל הנכסים ←</TextLink>}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{data.recommended.map((p) => <OfficePropertyCard key={p.id} property={p} />)}</div>
        </SectionShell>
      )}

      {/* M · BUYER — distinct journey (inventory + requirements) */}
      <BuyerContactSection data={data} propertiesHref={propertiesHref} />

      {/* N · FOOTER */}
      <Footer data={data} nav={nav} />
      <MobileStickyCta whatsapp={office.whatsapp} tel={office.tel} />
    </div>
  );
}

// ── A · HERO — editorial, asymmetric, brand accent; seller primary / buyer secondary ─
function Hero({ data }: { data: OfficeSitePayload }) {
  const { office, brand } = data;
  const title = office.tagline || `${office.name} — הבית שלכם להחלטה נכונה`;
  const hasCover = !!office.cover;
  const areaLine = data.areas.slice(0, 3).map((a) => a.name).join(" · ");
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        {/* Office brand color is the BASE; a cover photo sits over it faintly. */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, var(--brand-hero) 0%, var(--brand-hero-2) 100%)" }} />
        {hasCover && <img src={office.cover!} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-[0.18]" />}
        <div className="absolute inset-0 bg-gradient-to-bl from-black/25 via-transparent to-black/55" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/45 to-transparent" />
        <div aria-hidden className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(52% 55% at 14% 6%, #fff, transparent 60%)" }} />
      </div>

      <div className="mx-auto grid w-full max-w-7xl items-end gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1.3fr_0.7fr] lg:py-28">
        {/* Right (RTL start) — identity + headline, left-anchored (asymmetric) */}
        <div className="flex flex-col items-start gap-5 text-right">
          {brand.logo
            ? <img src={brand.logo} alt={office.name} className="h-16 w-auto max-w-[220px] rounded-2xl bg-white/95 p-3 object-contain shadow-2xl ring-1 ring-white/40 sm:h-20" />
            : <div className="text-2xl font-black text-white/95">{office.name}</div>}
          {areaLine && <div className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.14em] text-[color:var(--brand-primary)]"><PublicIcon name="map" size={16} />{areaLine}</div>}
          <h1 className="max-w-2xl text-4xl font-black leading-[1.04] text-white drop-shadow-sm sm:text-6xl lg:text-[68px]">{title}</h1>
          <p className="max-w-xl text-[17px] leading-relaxed text-white/85 sm:text-[19px]">
            {office.description || "צוות המשרד שלנו מלווה מוכרים, קונים ומשקיעים באזור — עם היכרות מקומית, שיווק מתקדם וליווי אישי לאורך כל הדרך."}
          </p>
          {/* Primary = buyer/search, secondary = seller/valuation — DISTINCT destinations */}
          <div className="mt-2 flex flex-wrap gap-3">
            <a href={BUYER_ANCHOR} className="rounded-xl bg-[var(--brand-primary)] px-8 py-4 text-[15px] font-black text-[color:var(--brand-on-primary)] shadow-2xl transition hover:-translate-y-0.5">חיפוש נכסים</a>
            <a href={SELLER_ANCHOR} className="rounded-xl border border-white/45 bg-white/10 px-8 py-4 text-[15px] font-bold text-white backdrop-blur-md transition hover:bg-white/20">כמה הנכס שלי שווה?</a>
          </div>
        </div>

        {/* Left (RTL end) — open proof (big numbers, minimal chrome) */}
        {data.proofPoints.length > 0 && (
          <div className="flex flex-wrap gap-x-8 gap-y-5 lg:flex-col lg:gap-6 lg:border-s lg:border-white/25 lg:ps-7">
            {data.proofPoints.slice(0, 4).map((pp) => (
              <div key={pp.label}>
                <div className="text-3xl font-black leading-none text-[color:var(--brand-primary)] drop-shadow sm:text-[40px]">{pp.value}</div>
                <div className="mt-1.5 text-[13px] font-semibold text-white/80">{pp.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── C · TRUST STRIP — compact, premium, data-backed ───────────────────────────
function TrustStrip({ data }: { data: OfficeSitePayload }) {
  return (
    <div className="border-y border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-px overflow-hidden sm:flex sm:justify-around">
        {data.proofPoints.slice(0, 5).map((pp) => (
          <div key={pp.label} className="flex flex-col items-center gap-0.5 px-4 py-6 text-center">
            <span className="text-2xl font-black text-[color:var(--brand-link)] sm:text-3xl">{pp.value}</span>
            <span className="text-[12.5px] font-semibold text-[var(--brand-muted)]">{pp.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── F · SELLER VALUATION — full-width brand-color conversion moment ────────────
function SellerValuationSection({ data }: { data: OfficeSitePayload }) {
  const { slug, office } = data;
  const area = data.areas[0]?.name;
  return (
    <section id="seller-valuation" className="relative isolate scroll-mt-20 overflow-hidden bg-[var(--brand-primary)] text-[var(--brand-on-primary)]">
      <div aria-hidden className="absolute inset-0 opacity-[0.10]" style={{ backgroundImage: "radial-gradient(55% 60% at 88% 8%, #fff, transparent 60%)" }} />
      <div aria-hidden className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(135deg, transparent 40%, #fff 40%, #fff 41%, transparent 41%)", backgroundSize: "26px 26px" }} />
      <div className="relative mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:items-center lg:py-24">
        <div>
          <div className="text-[13px] font-black uppercase tracking-[0.14em] opacity-80">בעלי נכס</div>
          <h2 className="mt-2 text-3xl font-black leading-[1.08] sm:text-4xl lg:text-5xl">כמה הנכס שלכם שווה היום?</h2>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed opacity-90">קבלו הערכת שווי ראשונית לנכס באזור שלכם וליווי מקומי של צוות שמכיר את {area ? `שוק ${area}` : "השוק"} — ללא התחייבות.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {office.whatsapp && <a href={office.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand-background)] px-6 py-3 text-[14px] font-black text-[color:var(--brand-primary)] shadow-lg transition hover:-translate-y-0.5">דברו עם המשרד</a>}
            {office.tel && <a href={office.tel} className="rounded-xl border border-white/45 px-6 py-3 text-[14px] font-bold transition hover:bg-white/10">התקשרו {office.phone}</a>}
          </div>
        </div>
        <div className="rounded-[26px] bg-[var(--brand-background)] p-6 text-[var(--brand-text)] shadow-2xl sm:p-8">
          <div className="mb-3 flex items-center gap-2 text-[16px] font-black"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand-soft)] text-[color:var(--brand-primary)]"><PublicIcon name="home" size={16} /></span>הערכת שווי לנכס</div>
          <SiteLeadForm slug={slug} variant="valuation" cta="בדיקת שווי הנכס" />
        </div>
      </div>
    </section>
  );
}

// ── G · AREAS OF EXPERTISE — bento (first area = feature), real attribution ────
function AreasExpertise({ data, propertiesHref }: { data: OfficeSitePayload; propertiesHref: string }) {
  const areas = data.areas.slice(0, 5);
  return (
    <SectionShell id="areas" eyebrow="פריסה מקומית" title="איפה אנחנו חזקים" subtitle="האזורים שבהם המשרד פעיל — והסוכנים שמכירים אותם" tone="soft">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a: OfficeArea, i) => {
          const feature = i === 0;
          return (
            <Link key={a.name} href={`${propertiesHref}?area=${encodeURIComponent(a.name)}`}
              className={`group relative flex flex-col justify-between gap-3 overflow-hidden rounded-3xl border border-[var(--brand-border)] p-6 transition hover:-translate-y-0.5 hover:border-[color:var(--brand-primary)] hover:shadow-[0_18px_44px_-24px_rgba(15,23,42,0.32)] ${feature ? "bg-[var(--brand-soft)] sm:col-span-2 lg:row-span-2 lg:p-8" : "bg-[var(--brand-background)]"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className={`font-black text-[var(--brand-text)] ${feature ? "text-2xl lg:text-3xl" : "text-[18px]"}`}>{a.name}</span>
                <span className="rounded-full bg-[var(--brand-background)] px-2.5 py-0.5 text-[12px] font-black text-[color:var(--brand-primary)] ring-1 ring-[var(--brand-border)]">{a.properties} נכסים</span>
              </div>
              <div className="flex flex-col gap-2">
                {a.agentRefs.length > 0
                  ? <AreaAgentAvatars agents={a.agentRefs} />
                  : a.agentNames.length > 0 && <span className="text-[13px] text-[var(--brand-muted)]">{a.agentNames.join(" · ")}</span>}
                <span className="text-[13px] font-bold text-[color:var(--brand-link)] opacity-0 transition group-hover:opacity-100">לצפייה בנכסים באזור ←</span>
              </div>
            </Link>
          );
        })}
      </div>
    </SectionShell>
  );
}

// ── H · RECENT SUCCESS — horizontal proof band (no price, no parties) ──────────
function RecentSold({ items }: { items: OfficeProperty[] }) {
  return (
    <SectionShell eyebrow="הצלחות אחרונות" title="נמכר ואוכלס דרכנו" subtitle="עסקאות שנסגרו לאחרונה על ידי צוות המשרד" tone="surface">
      <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((p) => {
          const loc = [p.neighborhood, p.city].filter(Boolean).join(", ");
          return (
            <div key={p.id} className="w-[240px] shrink-0 snap-start overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] sm:w-[260px]">
              <div className="relative aspect-[4/3] overflow-hidden bg-[var(--brand-surface)]">
                {p.image
                  ? <img src={p.image} alt={p.title} loading="lazy" decoding="async" className="h-full w-full object-cover grayscale-[.12]" />
                  : <div className="grid h-full w-full place-items-center text-[var(--brand-muted)]"><PublicIcon name="home" size={30} /></div>}
                <span className="absolute end-2 top-2 rounded-md bg-[color:var(--brand-primary)] px-2 py-0.5 text-[10.5px] font-black text-[var(--brand-on-primary)]">{p.tag}</span>
              </div>
              <div className="flex flex-col gap-0.5 p-3.5">
                <span className="line-clamp-1 text-[14px] font-black text-[var(--brand-text)]">{p.title}</span>
                {loc && <span className="line-clamp-1 text-[12px] text-[var(--brand-muted)]">{loc}</span>}
                {p.agent && <span className="mt-0.5 text-[12px] font-semibold text-[color:var(--brand-link)]">{p.agent.name}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

// ── I · PROCESS — a connected timeline (not four generic cards) ────────────────
function ProcessTimeline() {
  return (
    <SectionShell eyebrow="איך המשרד עובד" title="הדרך שלנו מהפגישה ועד המפתח" subtitle="תהליך מסודר של משרד — לא מתווך אחד." tone="soft">
      <ol className="relative grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
        {/* connecting line on desktop */}
        <span aria-hidden className="absolute inset-x-0 top-5 hidden h-px bg-[var(--brand-border)] lg:block" />
        {PROCESS.map((s, i) => (
          <li key={s.title} className="relative flex flex-col gap-2">
            <div className="flex items-center gap-3 lg:flex-col lg:items-start">
              <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--brand-primary)] text-[14px] font-black text-[var(--brand-on-primary)] ring-4 ring-[var(--brand-soft)]">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="text-[16px] font-black text-[var(--brand-text)]">{s.title}</h3>
            </div>
            <p className="text-[13.5px] leading-relaxed text-[var(--brand-muted)] lg:pe-2">{s.text}</p>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}

// ── M · BUYER — distinct journey: inventory + requirements (calm, not brand) ───
function BuyerContactSection({ data, propertiesHref }: { data: OfficeSitePayload; propertiesHref: string }) {
  const { slug, office } = data;
  const area = data.areas[0]?.name;
  return (
    <SectionShell id="contact" eyebrow="מחפשים נכס" title="לא מצאתם את הנכס שחיפשתם?" subtitle={`ספרו לנו מה אתם מחפשים${area ? ` ב${area}` : ""} — ונעדכן אתכם ברגע שתתאים הזדמנות מהאינוונטר של המשרד.`} tone="surface">
      <div id="buyer" className="grid scroll-mt-20 gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="rounded-[24px] border border-[var(--brand-border)] bg-[var(--brand-background)] p-6 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.28)] sm:p-8">
          <SiteLeadForm slug={slug} variant="contact" cta="ספרו לנו מה אתם מחפשים" />
        </div>
        <div className="flex flex-col gap-3">
          <Link href={propertiesHref} className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-5 py-4 text-[14px] font-black text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)]">
            עיינו בכל נכסי המשרד<span className="text-[color:var(--brand-link)]">←</span>
          </Link>
          {office.whatsapp && <a href={office.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-[var(--brand-primary)] px-5 py-4 text-center text-[14px] font-bold text-[var(--brand-on-primary)] transition hover:bg-[color:var(--brand-primary-hover)]">WhatsApp למשרד</a>}
          {office.tel && <a href={office.tel} className="rounded-2xl border border-[var(--brand-border)] px-5 py-4 text-center text-[14px] font-bold text-[var(--brand-text)]">התקשרו {office.phone}</a>}
        </div>
      </div>
    </SectionShell>
  );
}

// ── Single agent → featured expert (never a lonely card) ──────────────────────
function FeaturedAgent({ member }: { member: OfficeTeamMember }) {
  return (
    <SectionShell id="team" eyebrow="הצוות שלנו" title="המומחה שמלווה אתכם" tone="surface">
      <div className="grid items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[28px] bg-[var(--brand-soft)] shadow-[0_30px_70px_-30px_rgba(15,23,42,0.55)] ring-1 ring-[var(--brand-border)]">
          {member.photo
            ? <img src={member.photo} alt={member.name} loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
            : <div className="grid h-full w-full place-items-center text-7xl font-black text-[color:var(--brand-primary)]">{member.name.slice(0, 1)}</div>}
        </div>
        <div>
          <h3 className="text-3xl font-black leading-tight text-[var(--brand-text)] sm:text-4xl lg:text-5xl">{member.name}</h3>
          {member.title && <p className="mt-2 text-[17px] font-bold text-[color:var(--brand-link)]">{member.title}</p>}
          <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-[var(--brand-muted)]">ליווי אישי לאורך כל הדרך — מהשיחה הראשונה ועד החתימה.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {member.href && <Link href={member.href} className="rounded-xl bg-[var(--brand-primary)] px-7 py-3.5 text-[15px] font-black text-[var(--brand-on-primary)] shadow-lg transition hover:-translate-y-0.5">לפרופיל הסוכן ←</Link>}
            {member.whatsapp && <a href={member.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-7 py-3.5 text-[15px] font-bold text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)]">שלחו WhatsApp</a>}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

// ── No inventory yet → a buyer marketing state ────────────────────────────────
function BuyerCta({ data }: { data: OfficeSitePayload }) {
  const area = data.areas[0]?.name;
  return (
    <SectionShell id="properties" eyebrow="נכסים" title={area ? `מחפשים נכס ב${area}?` : "מחפשים את הנכס הבא שלכם?"} subtitle="ספרו לנו מה אתם מחפשים ונעדכן אתכם ברגע שתופיע הזדמנות מתאימה.">
      <div className="mx-auto max-w-xl rounded-[24px] border border-[var(--brand-border)] bg-[var(--brand-background)] p-6 shadow-[0_18px_44px_-26px_rgba(15,23,42,0.3)] sm:p-8">
        <SiteLeadForm slug={data.slug} variant="contact" cta="ספרו לנו מה אתם מחפשים" />
      </div>
    </SectionShell>
  );
}

// ── A single property → one cinematic featured listing ────────────────────────
function FeaturedProperty({ property }: { property: OfficeProperty }) {
  const loc = [property.neighborhood, property.city].filter(Boolean).join(", ");
  const price = property.listingKind === "rent"
    ? (money(property.monthlyRent) ? `${money(property.monthlyRent)} / חודש` : null)
    : money(property.price);
  const meta = [
    property.rooms != null ? `${property.rooms} חד׳` : null,
    property.sizeSqm != null ? `${property.sizeSqm} מ״ר` : null,
    property.floor != null ? `קומה ${property.floor}` : null,
  ].filter(Boolean);
  return (
    <div className="grid items-stretch gap-6 overflow-hidden rounded-[28px] border border-[var(--brand-border)] bg-[var(--brand-background)] shadow-[0_24px_60px_-34px_rgba(15,23,42,0.45)] lg:grid-cols-[1.4fr_1fr]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--brand-surface)] lg:aspect-auto">
        {property.tag && <span className="absolute end-4 top-4 z-10 rounded-lg bg-[var(--brand-primary)] px-3 py-1 text-[12px] font-bold text-[var(--brand-on-primary)] shadow">{property.tag}</span>}
        {property.image
          ? <img src={property.image} alt={property.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <div className="grid h-full w-full place-items-center text-[var(--brand-muted)]"><PublicIcon name="home" size={60} /></div>}
      </div>
      <div className="flex flex-col justify-center gap-3 p-7 sm:p-9">
        <h3 className="text-2xl font-black leading-tight text-[var(--brand-text)] sm:text-3xl">{property.title}</h3>
        {loc && <p className="text-[15px] text-[var(--brand-muted)]">{loc}</p>}
        {price && <p className="text-3xl font-black text-[color:var(--brand-link)]">{price}</p>}
        {meta.length > 0 && <p className="text-[15px] font-semibold text-[var(--brand-text)]">{meta.join(" · ")}</p>}
        {property.agent && <p className="text-[13px] font-semibold text-[var(--brand-muted)]">סוכן מטפל: {property.agent.name}</p>}
        <div className="mt-3"><Link href={property.href} className="inline-flex rounded-xl bg-[var(--brand-primary)] px-7 py-3.5 text-[15px] font-black text-[var(--brand-on-primary)] shadow-lg transition hover:-translate-y-0.5">לפרטי הנכס ←</Link></div>
      </div>
    </div>
  );
}

// ── J · ABOUT — editorial office story + manager + real stats ─────────────────
function About({ data }: { data: OfficeSitePayload }) {
  const { office } = data;
  const stats = data.stats.slice(0, 3);
  return (
    <SectionShell id="about" tone="surface">
      <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="mb-2 text-[13px] font-black uppercase tracking-[0.14em] text-[color:var(--brand-link)]">מי אנחנו</div>
          <h2 className="text-3xl font-black leading-tight text-[var(--brand-text)] sm:text-4xl">{office.name}</h2>
          {office.description
            ? <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-[var(--brand-muted)]">{office.description}</p>
            : <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-[var(--brand-muted)]">משרד תיווך מקומי{data.areas.length ? ` הפעיל ב${data.areas.slice(0, 3).map((a) => a.name).join(", ")}` : ""} — צוות סוכנים עם התמחויות שונות, מאגר נכסים וקונים, ושיווק מקצועי מקצה לקצה.</p>}
          {stats.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-x-10 gap-y-4">
              {stats.map((st) => (
                <div key={st.label}>
                  <div className="text-3xl font-black text-[color:var(--brand-link)]">{st.value}</div>
                  <div className="text-[12.5px] font-semibold text-[var(--brand-muted)]">{st.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {data.manager && (
          <div className="flex items-center gap-4 rounded-3xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-6">
            {data.manager.photo
              ? <img src={data.manager.photo} alt={data.manager.name} loading="lazy" decoding="async" className="h-20 w-20 flex-none rounded-2xl object-cover object-top" />
              : <span className="grid h-20 w-20 flex-none place-items-center rounded-2xl bg-[var(--brand-soft)] text-3xl font-black text-[color:var(--brand-primary)]">{data.manager.name.slice(0, 1)}</span>}
            <div className="min-w-0">
              <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--brand-muted)]">מנהל/ת המשרד</div>
              <div className="text-[18px] font-black text-[var(--brand-text)]">{data.manager.name}</div>
              {data.manager.href && <Link href={data.manager.href} className="mt-1 inline-block text-[12.5px] font-bold text-[color:var(--brand-link)]">לפרופיל ←</Link>}
            </div>
          </div>
        )}
      </div>
    </SectionShell>
  );
}

function Footer({ data, nav }: { data: OfficeSitePayload; nav: HeaderNavItem[] }) {
  const { office, brand } = data;
  const socials = Object.entries(office.social).filter(([, v]) => typeof v === "string" && v);
  return (
    <footer className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-4">
        <div>
          {brand.logo ? <img src={brand.logo} alt={office.name} className="mb-3 h-10 w-auto max-w-[160px] object-contain" /> : <div className="mb-3 text-[16px] font-black text-[var(--brand-text)]">{office.name}</div>}
          {office.description && <p className="line-clamp-3 text-[13px] leading-relaxed text-[var(--brand-muted)]">{office.description}</p>}
          {socials.length > 0 && <div className="mt-4 flex gap-2">{socials.map(([k, v]) => <a key={k} href={v as string} target="_blank" rel="noopener noreferrer" aria-label={k} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--brand-border)] text-[var(--brand-muted)] transition hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-link)]">{k.slice(0, 1).toUpperCase()}</a>)}</div>}
        </div>
        <FooterCol title="ניווט מהיר">{nav.map((n) => <a key={n.href} href={n.href} className="block text-[14px] text-[var(--brand-muted)] transition hover:text-[color:var(--brand-link)]">{n.label}</a>)}</FooterCol>
        {data.areas.length > 0 && <FooterCol title="אזורי פעילות">{data.areas.slice(0, 6).map((a) => <span key={a.name} className="block text-[14px] text-[var(--brand-muted)]">{a.name}</span>)}</FooterCol>}
        <FooterCol title="צור קשר">
          {office.phone && <a href={office.tel ?? undefined} className="block text-[14px] text-[var(--brand-muted)] hover:text-[color:var(--brand-link)]">{office.phone}</a>}
          {office.email && <a href={`mailto:${office.email}`} className="block text-[14px] text-[var(--brand-muted)] hover:text-[color:var(--brand-link)]">{office.email}</a>}
          {office.address && <span className="block text-[14px] text-[var(--brand-muted)]">{office.address}</span>}
        </FooterCol>
      </div>
      <div className="border-t border-[var(--brand-border)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-5 py-5 text-[12px] text-[var(--brand-muted)] sm:flex-row sm:px-8">
          <span>© {office.name} — כל הזכויות שמורות</span>
          <div className="flex items-center gap-4"><span className="opacity-70">פרטיות · נגישות · תקנון</span><Link href="/" className="font-semibold opacity-70 transition hover:opacity-100">מופעל על ידי ZONO</Link></div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-3 text-[14px] font-black text-[var(--brand-text)]">{title}</h4><div className="space-y-2">{children}</div></div>;
}
