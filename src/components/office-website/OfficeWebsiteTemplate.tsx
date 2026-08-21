// ============================================================================
// ZONO Office Website — the ONE canonical office template (server component).
// STRUCTURE = ZONO · IDENTITY = office brand · PEOPLE = office agents ·
// CONTENT = live office data. The site is built around the OFFICE as the product:
// a team of agents, local expertise, shared inventory, and BOTH seller + buyer
// journeys. Reuses the agent-site engine (brand tokens, map, search, header/
// footer) + office relationships (team, property→agent, area→agents). All data
// is real; every section renders, falls back, or hides — never fabricates.
// ============================================================================
import Link from "next/link";
import type { OfficeSitePayload, OfficeTeamMember, OfficeProperty, OfficeArea } from "@/lib/office-website/site-data";
import { AgentHeader, type HeaderNavItem } from "@/components/agent-website/AgentHeader";
import { PropertySearch } from "@/components/agent-website/PropertySearch";
import { ExpertiseMap } from "@/components/agent-website/ExpertiseMap";
import { MobileStickyCta } from "@/components/agent-website/MobileStickyCta";
import { SectionShell, TextLink, money } from "@/components/agent-website/ui";
import { OfficePropertyCard, TeamCard, OfficeTestimonialCard } from "./ui";
import { PublicIcon, type PublicIconName } from "@/components/public-site/PublicIcon";
import { SiteLeadForm } from "@/app/site/[slug]/SiteLeadForm";

// The brokerage operating model — a real SEQUENCE (office, not one agent).
const PROCESS: { icon: PublicIconName; title: string; text: string }[] = [
  { icon: "users", title: "צוות של מומחים", text: "לא מתווך אחד — צוות סוכנים, כל אחד עם התמחות ואזור." },
  { icon: "home", title: "מאגר נכסים", text: "אינוונטר משותף של נכסים למכירה ולהשכרה באזור." },
  { icon: "megaphone", title: "שיווק ממוקד", text: "חשיפה מקצועית של הנכס מול הקהל הרלוונטי." },
  { icon: "scale", title: "ליווי עד העסקה", text: "משא ומתן וליווי אישי מהפגישה הראשונה ועד המפתח." },
];

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
    { href: "#areas", label: "אזורי פעילות" },
    { href: "#about", label: "אודות" },
    { href: "#contact", label: "צור קשר" },
  ];

  return (
    <div id="top" dir="rtl" style={{ ...(brand.tokens as Record<string, string>) }} className="min-h-screen bg-[var(--brand-background)] text-[var(--brand-text)] antialiased">
      <AgentHeader brandName={office.name} logo={brand.logo} nav={nav} whatsapp={office.whatsapp} tel={office.tel} phoneLabel={office.phone} />

      {/* A · OFFICE HERO */}
      {on("hero") && <Hero data={data} />}

      {/* B · PROPERTY SEARCH */}
      <div className="relative z-10"><PropertySearch slug={slug} areas={areaNames} types={types} basePath="/site" /></div>

      {/* C · TRUST STRIP (data-backed office proof) */}
      {data.proofPoints.length >= 2 && <TrustStrip data={data} />}

      {/* D · TEAM — the people are a core product */}
      {on("agents") && agentCount === 1 && <FeaturedAgent member={data.team[0]} />}
      {on("agents") && agentCount > 1 && (
        <SectionShell id="team" eyebrow="הצוות" title="הצוות שמכיר את האזור" subtitle="סוכנים מקומיים · התמחות אמיתית · משרד אחד שעובד בשבילכם" tone="surface" action={agentCount > 8 ? <TextLink href={`/site/${slug}/agents`}>לכל הצוות ←</TextLink> : undefined}>
          <div className={agentCount <= 3
            ? "flex flex-wrap justify-center gap-5 [&>*]:w-full [&>*]:max-w-[260px] sm:[&>*]:w-[260px]"
            : "grid grid-cols-2 gap-5 lg:grid-cols-4"}>{data.team.slice(0, 8).map((m) => <TeamCard key={m.id} member={m} />)}</div>
        </SectionShell>
      )}

      {/* E · FEATURED INVENTORY (curated, agent-attributed) */}
      {on("featured_properties") && (
        data.featured.length > 0 ? (
          <SectionShell id="properties" eyebrow="נכסי המשרד" title="נכסים נבחרים" subtitle="מבחר מתוך האינוונטר של המשרד — לכל נכס סוכן אחראי" action={<TextLink href={propertiesHref}>כל נכסי המשרד ←</TextLink>}>
            {data.featured.length === 1
              ? <FeaturedProperty property={data.featured[0]} />
              : <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.featured.slice(0, 6).map((p) => <OfficePropertyCard key={p.id} property={p} />)}</div>}
          </SectionShell>
        ) : data.recommended.length === 0 ? <BuyerCta data={data} /> : null
      )}

      {/* F · AREAS OF EXPERTISE (areas + the agents strong there) */}
      {on("market_expertise") && data.areas.length > 0 && <AreasExpertise data={data} propertiesHref={propertiesHref} />}
      {on("market_expertise") && data.mapPoints.length > 0 && (
        <ExpertiseMap points={data.mapPoints} areas={data.areas.map((a) => ({ name: a.name, deals: null, inventory: a.properties }))} primaryArea={primaryArea} propertiesHref={propertiesHref} />
      )}

      {/* G · RECENT SUCCESS (public-safe closed inventory) */}
      {data.recentSold.length > 0 && <RecentSold items={data.recentSold} />}

      {/* H · HOW THE OFFICE WORKS + ABOUT (office story + manager) */}
      {on("why_us") && <HowItWorks />}
      {(office.description || data.manager) && <About data={data} />}

      {/* I · TESTIMONIALS (only when real, agent-linked) */}
      {on("testimonials") && data.testimonials.length > 0 && (
        <SectionShell id="testimonials" eyebrow="המלצות" title="הלקוחות שלנו מספרים" tone="surface">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.testimonials.slice(0, 6).map((t, i) => <OfficeTestimonialCard key={i} t={t} />)}</div>
        </SectionShell>
      )}

      {/* J · MORE PROPERTIES */}
      {data.recommended.length > 0 && (
        <SectionShell title="עוד נכסים מהמשרד" action={<TextLink href={propertiesHref}>כל הנכסים ←</TextLink>}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{data.recommended.map((p) => <OfficePropertyCard key={p.id} property={p} />)}</div>
        </SectionShell>
      )}

      {/* K · SELLER + BUYER CONVERSION */}
      <ConversionPanel data={data} />

      {/* L · FOOTER */}
      <Footer data={data} nav={nav} />
      <MobileStickyCta whatsapp={office.whatsapp} tel={office.tel} />
    </div>
  );
}

// ── A · HERO — office, people, location; seller + buyer journeys ──────────────
function Hero({ data }: { data: OfficeSitePayload }) {
  const { office, brand } = data;
  const title = office.tagline || `${office.name} — הבית שלכם להחלטה נכונה`;
  const hasCover = !!office.cover;
  const areaLine = data.areas.slice(0, 3).map((a) => a.name).join(" · ");
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        {hasCover ? (
          <>
            <img src={office.cover!} alt={office.name} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-black/65" />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--brand-hero) 0%, var(--brand-hero-2) 100%)" }} />
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/45" />
            <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full opacity-30 blur-3xl" style={{ background: "var(--brand-primary)" }} />
          </>
        )}
        <div className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: "radial-gradient(58% 58% at 80% 6%, #fff, transparent 60%)" }} />
      </div>

      <div className="mx-auto flex min-h-[74vh] w-full max-w-4xl flex-col items-center justify-center gap-5 px-5 py-20 text-center sm:px-8">
        {brand.logo
          ? <img src={brand.logo} alt={office.name} className="mb-1 h-20 w-auto max-w-[260px] self-center rounded-3xl bg-white/95 p-3.5 object-contain shadow-2xl ring-1 ring-white/40 sm:h-24" />
          : <div className="text-2xl font-black text-white/95">{office.name}</div>}
        {areaLine && <div className="flex items-center justify-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[color:var(--brand-primary)]"><PublicIcon name="map" size={16} />{areaLine}</div>}
        <h1 className="mx-auto max-w-3xl text-4xl font-black leading-[1.05] text-white drop-shadow-sm sm:text-6xl lg:text-7xl">{title}</h1>
        <p className="mx-auto max-w-xl text-[17px] leading-relaxed text-white/85 sm:text-[19px]">
          {office.description || "צוות המשרד שלנו מלווה מוכרים, קונים ומשקיעים באזור — עם היכרות מקומית, שיווק מתקדם וליווי אישי לאורך כל הדרך."}
        </p>

        {data.proofPoints.length > 0 && (
          <div className="mt-1 flex flex-wrap justify-center gap-2.5">
            {data.proofPoints.slice(0, 4).map((pp) => (
              <div key={pp.label} className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-md">
                <span className="text-xl font-black text-[color:var(--brand-primary)] drop-shadow sm:text-2xl">{pp.value}</span>
                <span className="mr-1.5 text-[12.5px] font-semibold text-white/80">{pp.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Two user journeys — seller primary, buyer secondary */}
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <a href="#seller" className="rounded-xl bg-[var(--brand-primary)] px-8 py-4 text-[15px] font-black text-[color:var(--brand-on-primary)] shadow-2xl transition hover:-translate-y-0.5">אני רוצה למכור נכס</a>
          <a href="#properties" className="rounded-xl border border-white/40 bg-white/10 px-8 py-4 text-[15px] font-bold text-white backdrop-blur-md transition hover:bg-white/20">אני מחפש נכס</a>
        </div>
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

// ── F · AREAS OF EXPERTISE — area + the agents strong there ────────────────────
function AreasExpertise({ data, propertiesHref }: { data: OfficeSitePayload; propertiesHref: string }) {
  return (
    <SectionShell id="areas" eyebrow="פריסה מקומית" title="איפה אנחנו חזקים" subtitle="האזורים שבהם המשרד פעיל — והסוכנים שמכירים אותם" tone="soft">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {data.areas.slice(0, 6).map((a: OfficeArea) => (
          <Link key={a.name} href={`${propertiesHref}?area=${encodeURIComponent(a.name)}`} className="group flex flex-col gap-1.5 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-5 transition hover:-translate-y-0.5 hover:border-[color:var(--brand-primary)] hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.3)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[16px] font-black text-[var(--brand-text)]">{a.name}</span>
              <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[12px] font-black text-[color:var(--brand-primary)]">{a.properties} נכסים</span>
            </div>
            {a.agentNames.length > 0 && <span className="text-[13px] text-[var(--brand-muted)]">{a.agentNames.join(" · ")}</span>}
            <span className="mt-1 text-[13px] font-bold text-[color:var(--brand-link)] opacity-0 transition group-hover:opacity-100">לצפייה באזור ←</span>
          </Link>
        ))}
      </div>
    </SectionShell>
  );
}

// ── G · RECENT SUCCESS — public-safe (no price, no parties) ────────────────────
function RecentSold({ items }: { items: OfficeProperty[] }) {
  return (
    <SectionShell eyebrow="הצלחות אחרונות" title="נמכר ואוכלס דרכנו" subtitle="עסקאות שנסגרו לאחרונה על ידי צוות המשרד" tone="surface">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => {
          const loc = [p.neighborhood, p.city].filter(Boolean).join(", ");
          return (
            <div key={p.id} className="flex items-stretch gap-3 overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)]">
              <div className="relative aspect-square w-28 flex-none overflow-hidden bg-[var(--brand-surface)]">
                {p.image
                  ? <img src={p.image} alt={p.title} loading="lazy" decoding="async" className="h-full w-full object-cover grayscale-[.15]" />
                  : <div className="grid h-full w-full place-items-center text-[var(--brand-muted)]"><PublicIcon name="home" size={30} /></div>}
                <span className="absolute end-1.5 top-1.5 rounded-md bg-[color:var(--brand-primary)] px-1.5 py-0.5 text-[10px] font-black text-[var(--brand-on-primary)]">{p.tag}</span>
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-1 py-3 pe-3">
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

// ── H · HOW THE OFFICE WORKS — a real sequence, not four generic cards ─────────
function HowItWorks() {
  return (
    <SectionShell eyebrow="איך המשרד עובד" title="משרד תיווך — לא מתווך אחד" subtitle="הכוח של צוות: מאגר נכסים, מאגר קונים, שיווק מקצועי וליווי עד הסגירה." tone="soft">
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROCESS.map((s, i) => (
          <li key={s.title} className="relative flex flex-col gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand-primary)] ring-1 ring-[var(--brand-border)]"><PublicIcon name={s.icon} size="feature" /></span>
              <span className="text-[13px] font-black tabular-nums text-[var(--brand-muted)]">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <div>
              <h3 className="text-[16px] font-black text-[var(--brand-text)]">{s.title}</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--brand-muted)]">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}

// ── K · SELLER (primary) + BUYER (secondary) conversion ───────────────────────
function ConversionPanel({ data }: { data: OfficeSitePayload }) {
  const { slug, office } = data;
  const area = data.areas[0]?.name;
  return (
    <section id="contact" className="bg-[var(--brand-primary)] text-[var(--brand-on-primary)]">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-20">
        {/* Seller — the office's primary acquisition journey */}
        <div id="seller" className="scroll-mt-24 rounded-3xl bg-[var(--brand-background)] p-6 text-[var(--brand-text)] shadow-2xl sm:p-8">
          <div className="mb-1 text-[13px] font-black text-[color:var(--brand-link)]">בעלי נכס</div>
          <h2 className="text-2xl font-black leading-tight sm:text-3xl">רוצים לדעת כמה הנכס שלכם שווה?</h2>
          <p className="mt-2 text-[15px] text-[var(--brand-muted)]">{area ? `הצוות המקומי שלנו מכיר את שוק ${area} ` : "הצוות המקומי שלנו מכיר את השוק "}ויחזור אליכם עם הערכה והמלצת שיווק.</p>
          <div className="mt-5"><SiteLeadForm slug={slug} variant="valuation" cta="קבלת הערכת נכס" /></div>
        </div>
        {/* Buyer — parallel, secondary */}
        <div id="buyer" className="scroll-mt-24 flex flex-col justify-center gap-4">
          <div>
            <div className="mb-1 text-[13px] font-black opacity-80">מחפשים נכס</div>
            <h2 className="text-2xl font-black leading-tight sm:text-3xl">לא מצאתם את הנכס שחיפשתם?</h2>
            <p className="mt-2 text-[15px] opacity-90">ספרו לנו מה אתם מחפשים — נעדכן אתכם ברגע שתופיע התאמה מהאינוונטר של המשרד.</p>
          </div>
          <div className="rounded-3xl bg-white/10 p-6 backdrop-blur-sm">
            <SiteLeadForm slug={slug} variant="contact" cta="ספרו לנו מה אתם מחפשים" />
          </div>
          <div className="flex flex-wrap gap-3">
            {office.whatsapp && <a href={office.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand-background)] px-5 py-3 text-[14px] font-bold text-[color:var(--brand-primary)]">WhatsApp למשרד</a>}
            {office.tel && <a href={office.tel} className="rounded-xl border border-white/40 px-5 py-3 text-[14px] font-bold">התקשרו {office.phone}</a>}
          </div>
        </div>
      </div>
    </section>
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

// ── H · ABOUT — office story + manager (not the brand) ────────────────────────
function About({ data }: { data: OfficeSitePayload }) {
  const { office } = data;
  return (
    <SectionShell id="about" tone="surface">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="mb-1 text-[13px] font-bold text-[color:var(--brand-link)]">מי אנחנו</div>
          <h2 className="text-2xl font-black text-[var(--brand-text)] sm:text-3xl">{office.name}</h2>
          {office.description
            ? <p className="mt-4 text-[16px] leading-relaxed text-[var(--brand-muted)]">{office.description}</p>
            : <p className="mt-4 text-[16px] leading-relaxed text-[var(--brand-muted)]">משרד תיווך מקומי{data.areas.length ? ` הפעיל ב${data.areas.slice(0, 3).map((a) => a.name).join(", ")}` : ""} — צוות סוכנים עם התמחויות שונות, מאגר נכסים וקונים, ושיווק מקצועי מקצה לקצה.</p>}
        </div>
        {data.manager && (
          <div className="flex items-center gap-4 rounded-3xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-5">
            {data.manager.photo
              ? <img src={data.manager.photo} alt={data.manager.name} loading="lazy" decoding="async" className="h-16 w-16 flex-none rounded-full object-cover" />
              : <span className="grid h-16 w-16 flex-none place-items-center rounded-full bg-[var(--brand-soft)] text-2xl font-black text-[color:var(--brand-primary)]">{data.manager.name.slice(0, 1)}</span>}
            <div className="min-w-0">
              <div className="text-[16px] font-black text-[var(--brand-text)]">{data.manager.name}</div>
              <div className="text-[13px] font-semibold text-[color:var(--brand-link)]">מנהל/ת המשרד</div>
              {data.manager.href && <Link href={data.manager.href} className="mt-1 inline-block text-[12px] font-bold text-[color:var(--brand-link)]">לפרופיל ←</Link>}
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
