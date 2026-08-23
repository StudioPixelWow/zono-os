// ============================================================================
// ZONO Agent Website — the ONE canonical template (server component).
// ----------------------------------------------------------------------------
// STRUCTURE = ZONO (fixed grid/hierarchy). IDENTITY = brand tokens + data.
// Every section renders / falls back / hides based on real data (spec §18).
// Consumes the sanitised AgentSitePayload only (no private CRM data).
// ============================================================================
import Link from "next/link";
import type { AgentSitePayload, SiteProperty } from "@/lib/agent-website/site-data";
import { AgentHeader, type HeaderNavItem } from "./AgentHeader";
import { ExpertiseMap } from "./ExpertiseMap";
import { Testimonials } from "./Testimonials";
import { MobileStickyCta } from "./MobileStickyCta";
import { AgentPropertyCard, SectionShell, TextLink, StatStrip, ProofPoints, money } from "./ui";
import { AgentLeadForm } from "@/app/agent/[slug]/AgentLeadForm";
import { PublicIcon, type PublicIconName } from "@/components/public-site/PublicIcon";

// Homepage inventory is BOUNDED (a curated shortlist, never the whole feed) — the
// full inventory lives on /agent/[slug]/properties. Personal-brand editorial, not
// a search tool: the site sells the agent, the properties prove it.
const HOME_FEATURED_MAX = 8;

const ADVANTAGES: { icon: PublicIconName; title: string; text: string }[] = [
  { icon: "map", title: "היכרות עמוקה עם האזור", text: "ידע מקומי מדויק שמביא לעסקה הנכונה — לא רק מחירים, אלא הבנה של הרחוב, הבניין והשכונה." },
  { icon: "megaphone", title: "שיווק מתקדם", text: "כל נכס מקבל קמפיין חשיפה ממוקד מול הקהל הנכון, לא סתם עוד מודעה." },
  { icon: "handshake", title: "ליווי אישי לאורך כל הדרך", text: "זמינות אמיתית ויחס אישי מהשיחה הראשונה ועד מסירת המפתח." },
  { icon: "scale", title: "משא ומתן שממקסם עבורכם", text: "מיצוי מלא של תנאי העסקה — כל שקל וכל סעיף עובדים לטובתכם." },
];

export function AgentWebsiteTemplate({ data }: { data: AgentSitePayload }) {
  const { agent, brand, slug } = data;
  const S = data.sections;
  const on = (k: string) => S[k] !== false;
  const propertiesHref = `/agent/${slug}/properties`;
  const primaryArea = agent.areas[0] ?? null;

  const nav: HeaderNavItem[] = [
    { href: "#top", label: "דף הבית" },
    { href: "#properties", label: "נכסים" },
    { href: "#areas", label: "אזורי התמחות" },
    { href: "#seller", label: "הערכת שווי" },
    { href: "#about", label: "אודות" },
    ...(data.testimonials.length ? [{ href: "#testimonials", label: "לקוחות ממליצים" }] : []),
    { href: "#contact", label: "צור קשר" },
  ];

  return (
    <div id="top" dir="rtl" style={{ ...(brand.tokens as Record<string, string>) }} className="min-h-screen bg-[var(--brand-background)] text-[var(--brand-text)] antialiased">
      <AgentHeader brandName={agent.officeName || agent.name} logo={brand.logo} nav={nav} whatsapp={agent.whatsapp} tel={agent.tel} phoneLabel={agent.phone} />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      {on("hero") && <Hero data={data} />}

      {/* ── PROPERTIES I MARKET — a BOUNDED curated shortlist (≤8), never the
             whole feed. One cinematic hero + a grid; a single listing keeps the
             cinematic treatment; no inventory → a buyer marketing state. The full
             inventory lives on /agent/[slug]/properties (§H). ────────────────── */}
      {on("featured_properties") && (
        data.allProperties.length > 1 ? (
          <FeaturedProperties properties={data.allProperties} total={data.allProperties.length} propertiesHref={propertiesHref} />
        ) : data.allProperties.length === 1 ? (
          <SectionShell id="properties" eyebrow="נכסים נבחרים" title="נכס שאני משווק" action={<TextLink href={propertiesHref}>כל הנכסים שלי ←</TextLink>}>
            <FeaturedProperty property={data.allProperties[0]} />
          </SectionShell>
        ) : data.recommended.length === 0 ? (
          <BuyerCta data={data} />
        ) : null
      )}

      {/* ── EXPERTISE MAP + AREA EXPERTISE ───────────────────────────────── */}
      {on("market_expertise") && (data.mapPoints.length > 0 || data.areas.length > 0) && (
        <ExpertiseMap points={data.mapPoints} areas={data.areas} primaryArea={primaryArea} propertiesHref={propertiesHref} />
      )}

      {/* ── SELLER VALUATION MOMENT — the personal seller-lead engine (§ seller).
             Uses the real valuation lead flow; shows by default (opt-out only). ── */}
      {on("seller_valuation") && <SellerValuation data={data} />}

      {/* ── WHY WORK WITH ME — editorial, personal (not a 4-card grid) ─────── */}
      {on("why_me") && <WhyMe data={data} />}

      {/* ── ABOUT ────────────────────────────────────────────────────────── */}
      {on("about") !== false && (agent.bio || agent.specialties.length > 0) && <About data={data} />}

      {/* ── TRUST NUMBERS (only real) — StatStrip composes 1/2/3/4 responsively. */}
      {data.stats.length >= 1 && (
        <SectionShell tone="surface">
          <StatStrip stats={data.stats} />
        </SectionShell>
      )}

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      {on("testimonials") && data.testimonials.length > 0 && (
        <SectionShell id="testimonials" title="לקוחות מספרים" tone="surface">
          <Testimonials items={data.testimonials} />
        </SectionShell>
      )}

      {/* Property discovery is intentionally consolidated into the single bounded
         "נכסים שאני משווק" shortlist above + "כל הנכסים שלי →" (the full inventory
         page) — no second sprawling grid on the personal homepage. */}

      {/* ── CONTACT CTA — personal final invitation ───────────────────────── */}
      {on("contact") && <ContactCta data={data} />}

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <Footer data={data} nav={nav} />

      <MobileStickyCta whatsapp={agent.whatsapp} tel={agent.tel} />
    </div>
  );
}

// ── No inventory yet → a buyer marketing state (never a dead empty section) ────
function BuyerCta({ data }: { data: AgentSitePayload }) {
  const area = data.agent.areas[0];
  return (
    <SectionShell id="properties" title={area ? `מחפשים נכס ב${area}?` : "מחפשים את הבית הבא שלכם?"}>
      <p className="mx-auto -mt-4 mb-8 max-w-2xl text-center text-[16px] leading-relaxed text-[var(--brand-muted)]">הנכסים שאני משווק מתעדכנים כאן באופן שוטף. ספרו לי מה אתם מחפשים ואעדכן אתכם ברגע שתופיע הזדמנות שמתאימה בדיוק לכם.</p>
      <div className="mx-auto max-w-xl rounded-[24px] border border-[var(--brand-border)] bg-[var(--brand-background)] p-6 shadow-[0_18px_44px_-26px_rgba(15,23,42,0.3)] sm:p-8">
        <AgentLeadForm slug={data.slug} variant="buyer_request" cta="ספרו לי מה אתם מחפשים" accent={data.brand.primary} />
      </div>
    </SectionShell>
  );
}

// ── BOUNDED featured shortlist — one cinematic hero + a small grid (≤8 total),
//    then a single strong path to the full inventory. Never the whole feed. ──────
function FeaturedProperties({ properties, total, propertiesHref }: { properties: SiteProperty[]; total: number; propertiesHref: string }) {
  const hero = properties[0];
  const rest = properties.slice(1, HOME_FEATURED_MAX); // hero + up to 7 = ≤8 shown
  const shown = 1 + rest.length;
  const moreLabel = total > shown ? `כל הנכסים שלי (${total}) ←` : "כל הנכסים שלי ←";
  return (
    <SectionShell
      id="properties"
      eyebrow="התיק שלי"
      title="נכסים שאני משווק"
      subtitle="מבחר מהנכסים שאני מלווה כרגע. לתיק המלא — המשיכו לכל הנכסים שלי."
      action={<TextLink href={propertiesHref}>{moreLabel}</TextLink>}
    >
      <div className="grid gap-5">
        <FeaturedProperty property={hero} />
        {rest.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => <AgentPropertyCard key={p.id} property={p} />)}
          </div>
        )}
      </div>
      <div className="mt-10 flex justify-center">
        <Link href={propertiesHref} className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-7 py-3.5 text-[15px] font-black text-[var(--brand-text)] shadow-sm transition hover:-translate-y-0.5 hover:border-[color:var(--brand-primary)]">
          {moreLabel}
        </Link>
      </div>
    </SectionShell>
  );
}

// ── A single property → one cinematic featured listing ────────────────────────
function FeaturedProperty({ property }: { property: SiteProperty }) {
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
    <div className="grid items-stretch gap-6 overflow-hidden rounded-[32px] border border-[var(--brand-border)] bg-[var(--brand-background)] shadow-[0_28px_70px_-34px_rgba(15,23,42,0.48)] lg:grid-cols-[1.55fr_1fr]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--brand-surface)] lg:aspect-auto lg:min-h-[440px]">
        {property.tag && <span className="absolute end-4 top-4 z-10 rounded-lg bg-[var(--brand-primary)] px-3.5 py-1.5 text-[13px] font-bold text-[var(--brand-on-primary)] shadow">{property.tag}</span>}
        {property.image
          ? <img src={property.image} alt={property.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <div className="grid h-full w-full place-items-center text-[var(--brand-muted)]"><PublicIcon name="home" size={72} /></div>}
      </div>
      <div className="flex flex-col justify-center gap-3.5 p-8 sm:p-10">
        <h3 className="text-[26px] font-black leading-tight text-[var(--brand-text)] sm:text-[34px]">{property.title}</h3>
        {loc && <p className="text-[16px] text-[var(--brand-muted)]">{loc}</p>}
        {price && <p className="text-[34px] font-black leading-none text-[color:var(--brand-link)] sm:text-[40px]">{price}</p>}
        {meta.length > 0 && <p className="text-[16px] font-semibold text-[var(--brand-text)]">{meta.join(" · ")}</p>}
        <div className="mt-3"><Link href={property.href} className="inline-flex rounded-xl bg-[var(--brand-primary)] px-8 py-4 text-[16px] font-black text-[var(--brand-on-primary)] shadow-lg transition hover:-translate-y-0.5">לפרטי הנכס ←</Link></div>
      </div>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ data }: { data: AgentSitePayload }) {
  const { agent, brand } = data;
  const hasPhoto = !!brand.profileImage;
  const title = agent.valueProp || agent.headline || "הבית הבא שלכם מתחיל כאן";

  return (
    <section className="relative overflow-hidden bg-[var(--brand-soft)] text-[var(--brand-text)]">
      {/* Layered architectural background — brand-driven depth, not a generic gradient blob */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--brand-soft)] via-[var(--brand-background)] to-[var(--brand-background)]" />
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(var(--brand-border) 1px, transparent 1px), linear-gradient(90deg, var(--brand-border) 1px, transparent 1px)", backgroundSize: "58px 58px", WebkitMaskImage: "radial-gradient(120% 85% at 82% 0%, #000 28%, transparent 74%)", maskImage: "radial-gradient(120% 85% at 82% 0%, #000 28%, transparent 74%)" }} />
        <div className="absolute -top-32 start-[-8rem] h-[36rem] w-[36rem] rounded-full bg-[var(--brand-primary)] opacity-10 blur-3xl" />
        <svg aria-hidden viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.4" className="absolute -bottom-2 end-2 h-64 w-64 text-[color:var(--brand-primary)] opacity-15"><path d="M6 194h64v-64M6 194V78M70 130h64V66M134 130V6h60" strokeLinecap="round" /></svg>
      </div>

      <div className={`relative mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pb-16 pt-14 sm:px-8 lg:pb-24 lg:pt-20 ${hasPhoto ? "lg:grid-cols-[1.1fr_0.9fr]" : ""}`}>
        <div className={hasPhoto ? "" : "mx-auto max-w-3xl text-center"}>
          <div className={`inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-background)] px-4 py-2 text-[14px] font-black text-[color:var(--brand-link)] ${hasPhoto ? "" : "mx-auto"}`}>
            <PublicIcon name="pin" size={18} /> {agent.name}{agent.title ? ` · ${agent.title}` : ""}
          </div>
          <h1 className="mt-5 text-[46px] font-black leading-[1.02] tracking-tight text-[var(--brand-text)] sm:text-[68px]">{title}</h1>
          {(agent.bio || agent.title) && <p className={`mt-5 text-[18px] leading-relaxed text-[var(--brand-muted)] ${hasPhoto ? "max-w-lg" : "mx-auto max-w-xl"}`}>{agent.bio || agent.title}</p>}

          {data.proofPoints.length > 0 && <div className={`mt-7 ${hasPhoto ? "" : "flex justify-center"}`}><ProofPoints points={data.proofPoints} /></div>}

          {/* Personal CTA matrix — primary is a direct, human "talk to me" (WhatsApp
             when available, else the contact form); secondary sends buyers to the
             inventory. Both brand-token driven. */}
          <div className={`mt-9 flex flex-wrap gap-3 ${hasPhoto ? "" : "justify-center"}`}>
            {agent.whatsapp
              ? <a href={agent.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 rounded-xl bg-[var(--brand-primary)] px-8 py-4 text-[16px] font-black text-[var(--brand-on-primary)] shadow-xl transition hover:-translate-y-0.5"><PublicIcon name="whatsapp" size={20} /> דברו איתי</a>
              : <a href="#contact" className="inline-flex items-center gap-2.5 rounded-xl bg-[var(--brand-primary)] px-8 py-4 text-[16px] font-black text-[var(--brand-on-primary)] shadow-xl transition hover:-translate-y-0.5">דברו איתי <PublicIcon name="arrow" size={20} /></a>}
            <a href="#properties" className="inline-flex items-center gap-2.5 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-background)] px-8 py-4 text-[16px] font-black text-[var(--brand-text)] transition hover:border-[color:var(--brand-primary)]"><PublicIcon name="home" size={20} /> נכסים שאני משווק</a>
          </div>
        </div>

        {hasPhoto && (
          <div className="relative">
            <div className="absolute -inset-3 -z-0 rounded-[34px] bg-[var(--brand-primary)] opacity-10 blur-2xl" />
            <div className="relative mx-auto aspect-[4/5] w-full max-w-lg overflow-hidden rounded-[32px] bg-[var(--brand-soft)] shadow-[0_50px_100px_-44px_rgba(15,23,42,0.6)] ring-1 ring-[var(--brand-border)]">
              <img src={brand.profileImage as string} alt={agent.name} className="h-full w-full object-cover object-top" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
            <OfficeCard data={data} />
          </div>
        )}
      </div>
    </section>
  );
}

function OfficeCard({ data }: { data: AgentSitePayload }) {
  const { agent, brand } = data;
  return (
    <div className="mx-auto mt-4 w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-5 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.4)] lg:absolute lg:-bottom-7 lg:start-[-1.5rem] lg:mt-0 lg:max-w-[16rem]">
      <div className="flex items-center gap-3">
        {brand.logo ? <img src={brand.logo} alt={agent.officeName ?? ""} className="h-10 w-auto max-w-[130px] object-contain" /> : <div className="text-[16px] font-black text-[var(--brand-text)]">{agent.officeName ?? agent.name}</div>}
      </div>
      <div className="mt-3 space-y-2 text-[14px] text-[var(--brand-muted)]">
        {agent.officeAddress && <div className="flex items-center gap-2"><PublicIcon name="pin" size={16} className="shrink-0" /> {agent.officeAddress}</div>}
        {agent.phone && <a href={agent.tel ?? undefined} className="flex items-center gap-2 hover:text-[color:var(--brand-link)]"><PublicIcon name="phone" size={16} className="shrink-0" /> {agent.phone}</a>}
      </div>
    </div>
  );
}

// ── Seller valuation moment — the personal seller-lead engine (real flow) ──────
function SellerValuation({ data }: { data: AgentSitePayload }) {
  const { agent, brand, slug } = data;
  const area = agent.areas[0];
  const points = [
    { icon: "chart" as PublicIconName, title: "הערכה מבוססת שוק", text: "מבוססת על עסקאות אמת באזור — לא ניחוש." },
    { icon: "shield" as PublicIconName, title: "ללא התחייבות", text: "בדיקה חינמית ודיסקרטית, אתם מחליטים מה הלאה." },
    { icon: "handshake" as PublicIconName, title: "ליווי אישי", text: `${agent.firstName} חוזר/ת אליכם אישית עם התמונה המלאה.` },
  ];
  return (
    <section id="seller" className="bg-[var(--brand-soft)]">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div>
          <div className="mb-1 text-[13px] font-bold text-[color:var(--brand-link)]">חושבים למכור?</div>
          <h2 className="text-3xl font-black leading-tight text-[var(--brand-text)] sm:text-4xl">{area ? `כמה הנכס שלכם ב${area} שווה היום?` : "כמה הנכס שלכם שווה היום?"}</h2>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-[var(--brand-muted)]">מחיר נכון הוא ההבדל בין נכס שנמכר מהר ובתנאים טובים לבין נכס שתקוע. קבלו הערכת שווי מקצועית ומדויקת, ללא התחייבות.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {points.map((p) => (
              <div key={p.title} className="flex flex-col gap-2">
                <span className="text-[color:var(--brand-primary)]"><PublicIcon name={p.icon} size={28} /></span>
                <span className="text-[16px] font-black text-[var(--brand-text)]">{p.title}</span>
                <span className="text-[14px] leading-relaxed text-[var(--brand-muted)]">{p.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[28px] border border-[var(--brand-border)] bg-[var(--brand-background)] p-7 shadow-[0_30px_70px_-30px_rgba(15,23,42,0.42)] ring-1 ring-[var(--brand-border)] sm:p-9">
          <h3 className="mb-1.5 text-[22px] font-black text-[var(--brand-text)]">קבלו הערכת שווי לנכס</h3>
          <p className="mb-5 text-[15px] text-[var(--brand-muted)]">השאירו פרטים ואחזור אליכם עם הערכה מסודרת.</p>
          <AgentLeadForm slug={slug} variant="valuation" cta="בדיקת שווי הנכס" accent={brand.primary} />
        </div>
      </div>
    </section>
  );
}

// ── Why work with me — editorial, personal (numbered rows, not a card grid) ────
function WhyMe({ data }: { data: AgentSitePayload }) {
  const { agent } = data;
  return (
    <SectionShell tone="soft" eyebrow="הגישה שלי" title={`למה לעבוד עם ${agent.firstName}?`} subtitle="לא רק לסגור עסקה — ללוות אתכם נכון לאורך כל הדרך, בגישה אישית שמרגישים בכל שלב.">
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        {ADVANTAGES.map((a, i) => (
          <div key={a.title} className="flex gap-5 border-t border-[var(--brand-border)] pt-7">
            <div className="text-3xl font-black leading-none text-[color:var(--brand-primary)] opacity-40">{String(i + 1).padStart(2, "0")}</div>
            <div>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand-primary)]"><PublicIcon name={a.icon} size={26} /></span>
                <h3 className="text-[19px] font-black text-[var(--brand-text)]">{a.title}</h3>
              </div>
              <p className="mt-3 text-[16px] leading-relaxed text-[var(--brand-muted)]">{a.text}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ── About ────────────────────────────────────────────────────────────────────
function About({ data }: { data: AgentSitePayload }) {
  const { agent, brand } = data;
  return (
    <SectionShell id="about">
      <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        {brand.profileImage
          ? <div className="mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[32px] bg-[var(--brand-soft)] shadow-[0_40px_90px_-46px_rgba(15,23,42,0.5)] ring-1 ring-[var(--brand-border)]"><img src={brand.profileImage} alt={agent.name} className="h-full w-full object-cover object-top" /></div>
          : <div className="grid aspect-[4/5] w-full max-w-md place-items-center rounded-[32px] bg-[var(--brand-soft)] text-7xl font-black text-[color:var(--brand-primary)]">{agent.firstName.slice(0, 1)}</div>}
        <div>
          <div className="mb-2 text-[14px] font-bold text-[color:var(--brand-link)]">קצת עליי</div>
          <h2 className="text-[30px] font-black leading-tight text-[var(--brand-text)] sm:text-[42px]">נדל״ן הוא קודם כל אנשים</h2>
          {agent.bio
            ? <p className="mt-5 text-[17px] leading-relaxed text-[var(--brand-muted)]">{agent.bio}</p>
            : <p className="mt-5 text-[17px] leading-relaxed text-[var(--brand-muted)]">{agent.name}{agent.title ? ` · ${agent.title}` : ""}{agent.areas.length ? ` · מתמחה ב${agent.areas.slice(0, 3).join(", ")}` : ""}.</p>}
          {agent.specialties.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {agent.specialties.map((s) => <span key={s} className="rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-[13px] font-semibold text-[color:var(--brand-primary)]">{s}</span>)}
            </div>
          )}
          {agent.languages.length > 0 && <p className="mt-4 text-[13px] font-semibold text-[var(--brand-muted)]">שפות: {agent.languages.join(" · ")}</p>}
        </div>
      </div>
    </SectionShell>
  );
}

// ── Contact CTA ──────────────────────────────────────────────────────────────
function ContactCta({ data }: { data: AgentSitePayload }) {
  const { agent, brand, slug } = data;
  const area = agent.areas[0];
  return (
    <section id="contact" className="bg-[var(--brand-primary)] text-[var(--brand-on-primary)]">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-20">
        <div>
          <h2 className="text-3xl font-black leading-tight sm:text-4xl">{area ? `מחפשים נכס ב${area}?` : "מחפשים את הבית הבא שלכם?"}</h2>
          <p className="mt-3 text-[17px] opacity-90">אני {agent.firstName}, ואשמח ללוות אתכם — בין אם אתם קונים, מוכרים או רק מתלבטים. השאירו פרטים ואחזור אליכם באופן אישי.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {agent.whatsapp && <a href={agent.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand-background)] px-7 py-4 text-[16px] font-bold text-[color:var(--brand-primary)]">שלחו הודעת WhatsApp</a>}
            {agent.tel && <a href={agent.tel} className="rounded-xl border border-white/40 px-7 py-4 text-[16px] font-bold">התקשרו {agent.phone}</a>}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--brand-background)] p-7 text-[var(--brand-text)] sm:p-8">
          <h3 className="mb-4 text-[19px] font-black">השאירו פרטים</h3>
          <AgentLeadForm slug={slug} variant="contact" cta="שליחת פנייה" accent={brand.primary} />
        </div>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────
function Footer({ data, nav }: { data: AgentSitePayload; nav: HeaderNavItem[] }) {
  const { agent, brand } = data;
  const socials = Object.entries(agent.social).filter(([, v]) => v);
  return (
    <footer className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-4">
        <div>
          {brand.logo ? <img src={brand.logo} alt={agent.officeName ?? ""} className="mb-3 h-9 w-auto max-w-[140px] object-contain" /> : <div className="mb-3 text-[16px] font-black text-[var(--brand-text)]">{agent.officeName ?? agent.name}</div>}
          <p className="text-[13px] leading-relaxed text-[var(--brand-muted)]">{agent.name}{agent.title ? ` · ${agent.title}` : ""}</p>
          {socials.length > 0 && (
            <div className="mt-4 flex gap-2">
              {socials.map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener noreferrer" aria-label={k} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--brand-border)] text-[var(--brand-muted)] transition hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-link)]">{k.slice(0, 1).toUpperCase()}</a>)}
            </div>
          )}
        </div>
        <FooterCol title="ניווט מהיר">{nav.map((n) => <a key={n.href} href={n.href} className="block text-[14px] text-[var(--brand-muted)] transition hover:text-[color:var(--brand-link)]">{n.label}</a>)}</FooterCol>
        {agent.areas.length > 0 && <FooterCol title="אזורי התמחות">{agent.areas.slice(0, 6).map((a) => <span key={a} className="block text-[14px] text-[var(--brand-muted)]">{a}</span>)}</FooterCol>}
        <FooterCol title="צור קשר">
          {agent.phone && <a href={agent.tel ?? undefined} className="block text-[14px] text-[var(--brand-muted)] hover:text-[color:var(--brand-link)]">{agent.phone}</a>}
          {agent.email && <a href={`mailto:${agent.email}`} className="block text-[14px] text-[var(--brand-muted)] hover:text-[color:var(--brand-link)]">{agent.email}</a>}
          {agent.officeAddress && <span className="block text-[14px] text-[var(--brand-muted)]">{agent.officeAddress}</span>}
        </FooterCol>
      </div>
      <div className="border-t border-[var(--brand-border)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-5 py-5 text-[12px] text-[var(--brand-muted)] sm:flex-row sm:px-8">
          <span>© {agent.officeName ?? agent.name} — כל הזכויות שמורות</span>
          <div className="flex items-center gap-4">
            <span className="opacity-70">פרטיות · נגישות · תקנון</span>
            <Link href="/" className="font-semibold opacity-70 transition hover:opacity-100">מופעל על ידי ZONO</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-3 text-[14px] font-black text-[var(--brand-text)]">{title}</h4><div className="space-y-2">{children}</div></div>;
}

// (icons now come from the shared PublicIcon primitive)
